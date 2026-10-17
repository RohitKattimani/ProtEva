from __future__ import annotations

import random
from typing import Tuple

from .engine import EvolutionError
from .models import Candidate, GAConfig
from .sequence import (
    STANDARD_AMINO_ACID_CODES,
    STANDARD_AMINO_ACIDS,
    hamming_distance,
    mutations_from_seed,
    validate_sequence,
)


class RandomSearchBaseline:
    """Random sequence proposals for future equal-budget comparisons.

    This class deliberately does not score candidates or claim improvement.
    """

    def __init__(self, seed_sequence: str, config: GAConfig):
        self.seed_sequence = validate_sequence(seed_sequence)
        self.config = config
        self._rng = random.Random(config.random_seed)

    def propose(self, budget: int) -> Tuple[Candidate, ...]:
        if budget < 1:
            raise ValueError("budget must be at least 1")
        if self.config.max_substitutions > len(self.seed_sequence):
            raise ValueError("max_substitutions cannot exceed seed sequence length")
        proposals: list[Candidate] = []
        attempts = 0
        max_attempts = max(200, budget * len(self.seed_sequence) * len(STANDARD_AMINO_ACIDS) * 2)
        while len(proposals) < budget and attempts < max_attempts:
            attempts += 1
            mutation_count = self._rng.randint(1, self.config.max_substitutions)
            positions = self._rng.sample(range(len(self.seed_sequence)), mutation_count)
            characters = list(self.seed_sequence)
            for position in positions:
                characters[position] = self._rng.choice(
                    tuple(
                        residue
                        for residue in STANDARD_AMINO_ACID_CODES
                        if residue != self.seed_sequence[position]
                    )
                )
            sequence = "".join(characters)
            if any(candidate.sequence == sequence for candidate in proposals):
                continue
            if any(
                hamming_distance(sequence, candidate.sequence) < self.config.min_sequence_distance
                for candidate in proposals
            ):
                continue
            proposals.append(
                Candidate(
                    id=f"random-{len(proposals):04d}",
                    sequence=sequence,
                    generation=0,
                    parent_id=None,
                    mutations=mutations_from_seed(self.seed_sequence, sequence),
                )
            )
        if len(proposals) != budget:
            raise EvolutionError(
                "unable to generate the requested baseline proposals under the configured constraints"
            )
        return tuple(proposals)
