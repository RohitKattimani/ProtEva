from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple


class ConfigurationError(ValueError):
    """Raised when a sequence-proposal configuration is infeasible or invalid."""


@dataclass(frozen=True)
class GAConfig:
    population_size: int
    generations: int
    max_substitutions: int
    random_seed: int
    elite_count: int = 2
    min_sequence_distance: int = 1
    # One-based positions that must never be mutated (validated against an
    # authoritative reference annotation before live execution starts).
    protected_positions: Tuple[int, ...] = ()

    def __post_init__(self) -> None:
        if self.population_size < 2:
            raise ConfigurationError("population_size must be at least 2")
        if self.generations < 1:
            raise ConfigurationError("generations must be at least 1")
        if self.max_substitutions < 1:
            raise ConfigurationError("max_substitutions must be at least 1")
        if not 1 <= self.elite_count <= self.population_size:
            raise ConfigurationError("elite_count must be between 1 and population_size")
        if self.min_sequence_distance < 0:
            raise ConfigurationError("min_sequence_distance cannot be negative")
        if len(set(self.protected_positions)) != len(self.protected_positions):
            raise ConfigurationError("protected_positions must be unique")
        if any(position < 1 for position in self.protected_positions):
            raise ConfigurationError("protected_positions are one-based and must be positive")


@dataclass(frozen=True)
class Mutation:
    """A current substitution, indexed from one to match protein notation."""

    position: int
    from_residue: str
    to_residue: str

    def __post_init__(self) -> None:
        if self.position < 1:
            raise ValueError("mutation positions are one-based and must be positive")
        if len(self.from_residue) != 1 or len(self.to_residue) != 1:
            raise ValueError("mutations require one-letter residues")
        if self.from_residue == self.to_residue:
            raise ValueError("mutations must change the residue")

    @property
    def notation(self) -> str:
        return f"{self.from_residue}{self.position}{self.to_residue}"


@dataclass(frozen=True)
class Candidate:
    """A proposal only; score is intentionally absent from this model."""

    id: str
    sequence: str
    generation: int
    parent_id: Optional[str]
    mutations: Tuple[Mutation, ...]


@dataclass(frozen=True)
class EvolutionResult:
    generation: int
    candidates: Tuple[Candidate, ...]
