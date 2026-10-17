from math import nan

import pytest

from proteva_ga import (
    FitnessRecord,
    GAConfig,
    GeneticAlgorithm,
    RandomSearchBaseline,
    SequenceValidationError,
    validate_sequence,
)
from proteva_ga.engine import EvolutionError
from proteva_ga.sequence import STANDARD_AMINO_ACIDS, hamming_distance

SEED = "ACDEFGHI"


def config(**overrides):
    values = {
        "population_size": 5,
        "generations": 3,
        "max_substitutions": 2,
        "random_seed": 17,
        "elite_count": 1,
        "min_sequence_distance": 1,
    }
    values.update(overrides)
    return GAConfig(**values)


def test_sequence_validation_accepts_standard_residues_and_rejects_invalid_input():
    assert validate_sequence(" acdefghiklmnpqrstvwy ") == "ACDEFGHIKLMNPQRSTVWY"
    with pytest.raises(SequenceValidationError, match="unsupported residues"):
        validate_sequence("ACDX")
    with pytest.raises(SequenceValidationError, match="must not be empty"):
        validate_sequence(" ")


def test_initial_population_has_single_substitutions_and_no_duplicates():
    result = GeneticAlgorithm(SEED, config()).initialize()

    assert len(result.candidates) == 5
    assert len({candidate.sequence for candidate in result.candidates}) == 5
    assert result.candidates[0].sequence == SEED
    assert result.candidates[0].mutations == ()
    for candidate in result.candidates[1:]:
        assert candidate.parent_id == "cand-g000-0000"
        assert len(candidate.mutations) == 1
        assert hamming_distance(SEED, candidate.sequence) == 1
        assert set(candidate.sequence).issubset(STANDARD_AMINO_ACIDS)


def test_seeded_initialization_is_reproducible():
    first = GeneticAlgorithm(SEED, config(random_seed=99)).initialize()
    second = GeneticAlgorithm(SEED, config(random_seed=99)).initialize()
    different = GeneticAlgorithm(SEED, config(random_seed=100)).initialize()

    assert first == second
    assert first != different


def test_advance_uses_external_scores_for_parent_selection_and_tracks_lineage():
    engine = GeneticAlgorithm(SEED, config(elite_count=1))
    initial = engine.initialize()
    selected_parent = initial.candidates[2]
    records = [
        FitnessRecord(
            candidate_id=candidate.id,
            score=10.0 if candidate.id == selected_parent.id else 0.0,
            evaluator_name="test-only",
        )
        for candidate in initial.candidates
    ]

    next_generation = engine.advance(records)

    assert next_generation.generation == 1
    assert len(next_generation.candidates) == 5
    assert {candidate.parent_id for candidate in next_generation.candidates} == {selected_parent.id}
    assert all(candidate.id.startswith("cand-g001-") for candidate in next_generation.candidates)
    assert all(len(candidate.mutations) <= 2 for candidate in next_generation.candidates)
    assert all(
        hamming_distance(SEED, candidate.sequence) == len(candidate.mutations)
        for candidate in next_generation.candidates
    )


def test_mutation_limit_is_measured_against_original_seed_not_parent():
    engine = GeneticAlgorithm(SEED, config(max_substitutions=1, elite_count=1))
    initial = engine.initialize()
    mutated_parent = initial.candidates[1]
    records = [
        FitnessRecord(
            candidate_id=candidate.id,
            score=1.0 if candidate.id == mutated_parent.id else 0.0,
            evaluator_name="test-only",
        )
        for candidate in initial.candidates
    ]

    next_generation = engine.advance(records)

    assert {candidate.parent_id for candidate in next_generation.candidates} == {mutated_parent.id}
    assert all(hamming_distance(SEED, candidate.sequence) <= 1 for candidate in next_generation.candidates)
    assert all(len(candidate.mutations) <= 1 for candidate in next_generation.candidates)


def test_diversity_distance_is_preserved_between_generated_variants():
    result = GeneticAlgorithm(SEED, config(min_sequence_distance=2)).initialize()
    variants = result.candidates[1:]

    assert all(
        hamming_distance(left.sequence, right.sequence) >= 2
        for index, left in enumerate(variants)
        for right in variants[index + 1 :]
    )


def test_missing_or_invalid_scores_are_not_promoted_to_fitness():
    engine = GeneticAlgorithm(SEED, config())
    initial = engine.initialize()
    accepted = initial.candidates[0]
    records = [
        FitnessRecord(candidate_id=accepted.id, score=0.5, evaluator_name="test-only"),
        FitnessRecord(candidate_id=initial.candidates[1].id, score=None, evaluator_name="test-only"),
        FitnessRecord(candidate_id=initial.candidates[2].id, score=nan, evaluator_name="test-only"),
    ]

    next_generation = engine.advance(records)
    assert {candidate.parent_id for candidate in next_generation.candidates} == {accepted.id}


def test_selection_rejects_unknown_or_duplicate_score_records():
    engine = GeneticAlgorithm(SEED, config())
    initial = engine.initialize()
    with pytest.raises(ValueError, match="unknown candidate"):
        engine.advance([FitnessRecord("missing", 1.0, "test-only")])
    with pytest.raises(ValueError, match="duplicate fitness record"):
        engine.advance(
            [
                FitnessRecord(initial.candidates[0].id, 1.0, "test-only"),
                FitnessRecord(initial.candidates[0].id, 2.0, "test-only"),
            ]
        )
    with pytest.raises(EvolutionError, match="requires at least one finite"):
        engine.advance([FitnessRecord(initial.candidates[0].id, None, "test-only")])


def test_random_baseline_uses_an_explicit_budget_without_scores():
    proposals = RandomSearchBaseline(SEED, config()).propose(budget=4)

    assert len(proposals) == 4
    assert len({candidate.sequence for candidate in proposals}) == 4
    assert all(candidate.parent_id is None for candidate in proposals)
    assert all(1 <= len(candidate.mutations) <= 2 for candidate in proposals)


def test_impossible_duplicate_constraints_fail_without_reusing_sequences():
    engine = GeneticAlgorithm("A", config(population_size=21, max_substitutions=1))
    with pytest.raises(EvolutionError, match="unable to generate"):
        engine.initialize()
