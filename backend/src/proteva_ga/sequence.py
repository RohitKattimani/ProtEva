from __future__ import annotations

from typing import Tuple

from .models import Mutation

STANDARD_AMINO_ACIDS = frozenset("ACDEFGHIKLMNPQRSTVWY")
STANDARD_AMINO_ACID_CODES = "ACDEFGHIKLMNPQRSTVWY"


class SequenceValidationError(ValueError):
    """Raised when a sequence contains no usable standard amino-acid sequence."""


def validate_sequence(sequence: str) -> str:
    if not isinstance(sequence, str):
        raise SequenceValidationError("sequence must be a string")
    normalized = sequence.strip().upper()
    if not normalized:
        raise SequenceValidationError("sequence must not be empty")
    invalid = sorted(set(normalized) - STANDARD_AMINO_ACIDS)
    if invalid:
        raise SequenceValidationError(
            f"sequence contains unsupported residues: {', '.join(invalid)}"
        )
    return normalized


def mutations_from_seed(seed_sequence: str, sequence: str) -> Tuple[Mutation, ...]:
    if len(seed_sequence) != len(sequence):
        raise ValueError("sequences must have equal length")
    return tuple(
        Mutation(position=index, from_residue=seed, to_residue=observed)
        for index, (seed, observed) in enumerate(zip(seed_sequence, sequence), start=1)
        if seed != observed
    )


def hamming_distance(first: str, second: str) -> int:
    if len(first) != len(second):
        raise ValueError("sequences must have equal length")
    return sum(left != right for left, right in zip(first, second))
