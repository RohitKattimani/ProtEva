"""Deterministic sequence proposal primitives for ProtEva.

This package does not predict or evaluate protein structure. It produces
sequence candidates and accepts external evaluation records for selection.
"""

from .baseline import RandomSearchBaseline
from .engine import GeneticAlgorithm
from .evaluator import CandidateEvaluator, FitnessRecord
from .models import Candidate, EvolutionResult, GAConfig, Mutation
from .sequence import STANDARD_AMINO_ACIDS, SequenceValidationError, validate_sequence

__all__ = [
    "Candidate",
    "CandidateEvaluator",
    "EvolutionResult",
    "FitnessRecord",
    "GAConfig",
    "GeneticAlgorithm",
    "Mutation",
    "RandomSearchBaseline",
    "STANDARD_AMINO_ACIDS",
    "SequenceValidationError",
    "validate_sequence",
]
