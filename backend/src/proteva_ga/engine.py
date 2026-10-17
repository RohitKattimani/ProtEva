from __future__ import annotations

import random
from typing import Iterable, Sequence, Tuple

from .evaluator import FitnessRecord, valid_score_index
from .models import Candidate, EvolutionResult, GAConfig
from .sequence import (
    STANDARD_AMINO_ACID_CODES,
    STANDARD_AMINO_ACIDS,
    hamming_distance,
    mutations_from_seed,
    validate_sequence,
)


class EvolutionError(RuntimeError):
    """Raised when valid, distinct proposals cannot be produced."""


class GeneticAlgorithm:
    """A seeded sequence proposal engine with evaluator-driven selection.

    It contains no structural scoring code. Callers supply ``FitnessRecord``
    values after an independent evaluator has processed candidate artifacts.
    """

    def __init__(self, seed_sequence: str, config: GAConfig):
        self.seed_sequence = validate_sequence(seed_sequence)
        if config.max_substitutions > len(self.seed_sequence):
            raise ValueError("max_substitutions cannot exceed seed sequence length")
        if config.min_sequence_distance > len(self.seed_sequence):
            raise ValueError("min_sequence_distance cannot exceed seed sequence length")
        self.config = config
        self._rng = random.Random(config.random_seed)
        self._seen_sequences = {self.seed_sequence}
        self._population: Tuple[Candidate, ...] = ()
        if any(position > len(self.seed_sequence) for position in config.protected_positions):
            raise ValueError("protected_positions cannot exceed the seed sequence length")
        if len(config.protected_positions) >= len(self.seed_sequence):
            raise ValueError("protected_positions would leave no mutable residue")
        self._protected = frozenset(config.protected_positions)

    @property
    def population(self) -> Tuple[Candidate, ...]:
        return self._population

    def initialize(self) -> EvolutionResult:
        if self._population:
            return EvolutionResult(generation=0, candidates=self._population)
        seed = Candidate(
            id="cand-g000-0000",
            sequence=self.seed_sequence,
            generation=0,
            parent_id=None,
            mutations=(),
        )
        proposals = [seed]
        proposals.extend(
            self._propose_candidates(
                generation=0,
                parents=(seed,),
                count=self.config.population_size - 1,
                existing=proposals,
            )
        )
        self._population = tuple(proposals)
        return EvolutionResult(generation=0, candidates=self._population)

    def advance(self, records: Iterable[FitnessRecord]) -> EvolutionResult:
        if not self._population:
            raise EvolutionError("initialize must be called before advance")
        generation = self._population[0].generation + 1
        if generation >= self.config.generations:
            raise EvolutionError("configured generation limit has been reached")
        scores = valid_score_index(self._population, records)
        if not scores:
            raise EvolutionError("selection requires at least one finite externally supplied score")
        parents = tuple(
            sorted(
                (candidate for candidate in self._population if candidate.id in scores),
                key=lambda candidate: (-scores[candidate.id], candidate.id),
            )[: self.config.elite_count]
        )
        proposals = self._propose_candidates(
            generation=generation,
            parents=parents,
            count=self.config.population_size,
            existing=(),
        )
        self._population = tuple(proposals)
        return EvolutionResult(generation=generation, candidates=self._population)

    def _propose_candidates(
        self,
        generation: int,
        parents: Sequence[Candidate],
        count: int,
        existing: Sequence[Candidate],
    ) -> list[Candidate]:
        proposals: list[Candidate] = []
        attempts = 0
        max_attempts = max(200, count * len(self.seed_sequence) * len(STANDARD_AMINO_ACIDS) * 2)
        while len(proposals) < count and attempts < max_attempts:
            attempts += 1
            parent = self._rng.choice(parents)
            sequence = self._single_substitution(parent.sequence)
            mutations = mutations_from_seed(self.seed_sequence, sequence)
            if len(mutations) > self.config.max_substitutions:
                continue
            if any(mutation.position in self._protected for mutation in mutations):
                continue
            if sequence in self._seen_sequences:
                continue
            if not self._is_diverse(sequence, (*existing, *proposals)):
                continue
            candidate = Candidate(
                id=f"cand-g{generation:03d}-{len(existing) + len(proposals):04d}",
                sequence=sequence,
                generation=generation,
                parent_id=parent.id,
                mutations=mutations,
            )
            self._seen_sequences.add(sequence)
            proposals.append(candidate)
        if len(proposals) != count:
            raise EvolutionError(
                "unable to generate the requested distinct population under the mutation and diversity constraints"
            )
        return proposals

    def _single_substitution(self, sequence: str) -> str:
        mutable = [index for index in range(len(sequence)) if index + 1 not in self._protected]
        if not mutable:
            raise EvolutionError("no mutable positions remain after applying the protected-motif constraint")
        index = self._rng.choice(mutable)
        alternatives = tuple(residue for residue in STANDARD_AMINO_ACID_CODES if residue != sequence[index])
        residue = self._rng.choice(alternatives)
        return f"{sequence[:index]}{residue}{sequence[index + 1:]}"

    def _is_diverse(self, sequence: str, population: Sequence[Candidate]) -> bool:
        return all(
            hamming_distance(sequence, candidate.sequence) >= self.config.min_sequence_distance
            # The unchanged seed is a reference parent, not a competing proposal.
            for candidate in population
            if candidate.sequence != self.seed_sequence
        )
