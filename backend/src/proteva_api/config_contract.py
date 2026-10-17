"""Derive the effective live configuration and display warnings from records.

Nothing here mutates persisted experiment records.  Everything is computed
from the stored experiment, its candidates and the prepared reference
annotations, so historical runs keep their original requested configuration
while the UI can still show exactly what the execution engine did.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .annotations import (
    P_LOOP_SOURCE,
    authoritative_protected_positions,
    load_reference,
)
from .schemas import (
    Candidate,
    EffectiveSearchConfig,
    Experiment,
    ExecutionMode,
    LiveSearchConfig,
    SearchConfig,
)

SUPPORTED_METRIC = "target_preference"
SUPPORTED_METRIC_LABEL = "ProteinMPNN target preference (backbone-compatibility proxy)"
KNOWN_UNSUPPORTED_METRICS = {
    "rmsd": "RMSD to a reference conformation",
    "radius_of_gyration": "Radius of gyration",
    "pocket_volume": "Pocket volume",
    "helix_content": "Helix content",
    "contact_distance": "Contact distance",
}


def is_live(experiment: Experiment) -> bool:
    return experiment.execution_mode is ExecutionMode.live


def protected_violations(candidates: list[Candidate], positions: tuple[int, ...]) -> list[str]:
    protected = set(positions)
    violations: list[str] = []
    for candidate in candidates:
        for notation in candidate.mutations:
            digits = "".join(character for character in notation if character.isdigit())
            if digits and int(digits) in protected:
                violations.append(f"{candidate.id} ({notation})")
    return violations


def _declared_population(config: SearchConfig | LiveSearchConfig) -> int:
    if isinstance(config, LiveSearchConfig):
        return config.population_size
    return min(config.population_size, 8)


def _declared_generations(config: SearchConfig | LiveSearchConfig) -> int:
    if isinstance(config, LiveSearchConfig):
        return config.generations
    return min(config.generations, 2)


def _seed_metrics(candidates: list[Candidate]) -> list[int]:
    seeds: set[int] = set()
    for candidate in candidates:
        for metric in candidate.seed_metrics:
            value = metric.get("seed")
            if isinstance(value, int):
                seeds.add(value)
    return sorted(seeds)


def derive_effective_config(experiment: Experiment, candidates: list[Candidate]) -> EffectiveSearchConfig:
    config = experiment.config
    live_config = config if isinstance(config, LiveSearchConfig) else None
    evaluated = [candidate for candidate in candidates if candidate.target_preference is not None]
    observed_generations = max((candidate.generation for candidate in candidates), default=-1) + 1

    all_seeds = _seed_metrics(candidates)
    screening_seed: Optional[int] = live_config.screening_seed if live_config else None
    if screening_seed is None and all_seeds:
        screening_seed = all_seeds[0]
    finalist_seeds = [seed for seed in all_seeds if seed != screening_seed]
    if live_config is not None:
        finalist_seeds = list(live_config.finalist_rescore_seeds)
    finalisted = [candidate for candidate in candidates if len(candidate.seed_metrics) > 1]

    enforced = bool(live_config is not None and live_config.protected_positions)
    positions = (
        tuple(live_config.protected_positions)
        if enforced and live_config is not None and live_config.protected_positions
        else authoritative_protected_positions()
    )
    violations = protected_violations(candidates, positions)

    requested_metric = experiment.target.structural_metric
    metric_supported = requested_metric in {SUPPORTED_METRIC}

    return EffectiveSearchConfig(
        populationSize=len(candidates) if candidates else _declared_population(config),
        generations=observed_generations if candidates else _declared_generations(config),
        maxSubstitutions=config.max_substitutions,
        screeningSeed=screening_seed,
        screeningSeeds=[screening_seed] if screening_seed is not None else [],
        finalistRescoreSeeds=sorted(finalist_seeds),
        maxFinalists=len(finalisted) if finalisted else (live_config.max_finalists if live_config else 0),
        candidatesEvaluated=len(evaluated),
        candidateEvaluationBudget=(
            live_config.candidate_evaluation_budget
            if live_config
            else (len(evaluated) or min(max(config.population_size, 1), 8))
        ),
        mutationStrategy=config.mutation_strategy,
        randomSeed=config.random_seed,
        protectedPositions=list(positions),
        protectedPositionsSource=P_LOOP_SOURCE,
        protectedConstraintEnforced=enforced,
        protectedConstraintViolations=violations,
        requestedMetric=requested_metric,
        supportedMetric=SUPPORTED_METRIC,
        metricSupported=metric_supported,
        requestedPopulationSize=config.population_size,
        requestedGenerations=config.generations,
        source="declared_live_config" if isinstance(config, LiveSearchConfig) else "derived_from_persisted_records",
    )


def derive_generation_stats(candidates: list[Candidate]) -> list[dict]:
    """Real best/average target-preference and diversity per persisted generation."""
    grouped: dict[int, list[Candidate]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate.generation, []).append(candidate)
    stats: list[dict] = []
    for generation, items in sorted(grouped.items()):
        values = [candidate.target_preference for candidate in items if candidate.target_preference is not None]
        if not values:
            continue
        sequences = [candidate.sequence for candidate in items]
        diversity = _mean_pairwise_diversity(sequences)
        stats.append(
            {
                "generation": generation,
                "bestScore": max(values),
                "averageScore": sum(values) / len(values),
                "diversity": diversity,
            }
        )
    return stats


def _mean_pairwise_diversity(sequences: list[str]) -> float:
    if len(sequences) < 2:
        return 0.0
    length = max(len(sequence) for sequence in sequences)
    if length == 0:
        return 0.0
    total = 0
    pairs = 0
    for index, first in enumerate(sequences):
        for second in sequences[index + 1:]:
            total += sum(a != b for a, b in zip(first, second))
            pairs += 1
    return round((total / pairs) / length, 6) if pairs else 0.0


def derive_warnings(experiment: Experiment, candidates: list[Candidate]) -> list[str]:
    warnings = list(experiment.warnings)
    if not is_live(experiment):
        return warnings
    effective = derive_effective_config(experiment, candidates)
    if not effective.metric_supported and not any(
        "is not computed by the live evaluator" in warning for warning in experiment.warnings
    ):
        label = KNOWN_UNSUPPORTED_METRICS.get(experiment.target.structural_metric, experiment.target.structural_metric)
        warnings.append(
            f"Requested structural metric '{label}' is not computed by the live evaluator. "
            "Reported results are ProteinMPNN backbone-compatibility target preference only."
        )
    if experiment.target.residue_region and experiment.target.residue_region.strip():
        warnings.append(
            f"Recorded residue region '{experiment.target.residue_region}' is validated against the "
            "prepared reference numbering but is not applied as a scoring constraint: live candidates "
            "are scored over the whole prepared chain."
        )
    if not effective.protected_constraint_enforced:
        if effective.protected_constraint_violations:
            warnings.append(
                "Protected-motif constraint was not enforced by this run's configuration; "
                "persisted candidates altering annotated P-loop positions: "
                + ", ".join(effective.protected_constraint_violations)
            )
        else:
            warnings.append(
                "This run's configuration did not record an enforced protected-motif constraint; "
                "no mutation of the annotated P-loop was observed in the persisted candidates."
            )
    return warnings


def apply_derived_view(experiment: Experiment, candidates: list[Candidate], prepared_dir: Path) -> Experiment:
    """Attach derived, non-persisted display data to an experiment response."""
    if not is_live(experiment):
        return experiment
    experiment.effective_config = derive_effective_config(experiment, candidates)
    experiment.warnings = derive_warnings(experiment, candidates)
    stats = derive_generation_stats(candidates)
    if stats:
        experiment.generation_stats = stats
        experiment.current_generation = max(stat["generation"] for stat in stats) + 1
    elif not candidates:
        experiment.generation_stats = []
    return experiment


def validate_live_reference(experiment: Experiment, prepared_dir: Path) -> dict:
    """Validate the prepared reference annotations for a live experiment."""
    annotation = load_reference(prepared_dir, "4AKE")
    from .annotations import (
        cross_check_preservation_constraints,
        verify_reference_numbering,
        verify_residue_region,
    )

    verify_reference_numbering(annotation, experiment.input.sequence)
    cross_check_preservation_constraints(experiment.target.preservation_constraints, annotation)
    verify_residue_region(experiment.target.residue_region, annotation)
    return {"pdbId": "4AKE", "chain": annotation.chain, "residueCount": annotation.residue_count, "sha256": annotation.sha256}
