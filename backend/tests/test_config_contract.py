"""Live configuration contract, reference annotation and procurement package tests."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from proteva_api import main
from proteva_api.annotations import (
    ReferenceAnnotationError,
    load_reference,
    parse_preserved_residues,
    parse_residue_region,
    protected_motif_descriptor,
    resolve_protected_positions,
    verify_reference_numbering,
    verify_residue_region,
)
from proteva_api.config_contract import derive_effective_config, derive_generation_stats, protected_violations
from proteva_api.repository import SQLiteExperimentRepository
from proteva_api.schemas import (
    Candidate,
    ExecutionMode,
    Experiment,
    ExperimentCreate,
    ExperimentStatus,
    LiveSearchConfig,
    SequenceInput,
    SearchConfig,
    TargetLandscape,
)

BENCHMARK_SEQUENCE = (
    "MRIILLGAPGAGKGTQAQFIMEKYGIPQISTGDMLRAAVKSGSELGKQAKDIMDAGKLVTDELVIALVKERIAQEDCRNGF"
    "LLDGFPRTIPQADAMKEAGINVDYVLEFDVPDELIVDRIVGRRVHAPSGRVYHVKFNPPKVEGKDDVTGEELTTRKDDQEET"
    "VRKRLVEYHQMTAPLIGYYSKEAEAGNTKYAKVDGTKPVAEVRADLEKILG"
)

DEMO_CONFIG = {
    "populationSize": 2,
    "generations": 1,
    "maxSubstitutions": 1,
    "screeningSamples": 1,
    "finalistSamples": 1,
    "mutationStrategy": "balanced",
    "diversityPreference": 50,
    "randomSeed": 7,
}

LIVE_CONFIG = {
    "populationSize": 8,
    "generations": 2,
    "maxSubstitutions": 4,
    "screeningSeed": 17,
    "finalistRescoreSeeds": [23, 41],
    "maxFinalists": 3,
    "candidateEvaluationBudget": 8,
    "mutationStrategy": "balanced",
    "diversityPreference": 50,
    "randomSeed": 42,
    "protectedPositions": list(range(7, 16)),
    "acknowledgeExperimentalProxy": True,
    "enableExperimentalProxySelection": True,
}


def _payload(config, mode, sequence="MKTAYIAK"):
    return {
        "input": {"experimentName": "T", "sequence": sequence},
        "target": {
            "objectiveText": "x",
            "targetStateDescription": "x",
            "structuralMetric": "rmsd",
            "thresholdAngstrom": 1.5,
            "residueRegion": "7-15",
            "preservationConstraints": "Do not mutate G7.",
        },
        "config": config,
        "executionMode": mode,
    }


def _prepared_dir() -> Path:
    return Path(main.settings.prepared_structures)


# --- live configuration validation -------------------------------------------------


def test_live_config_rejects_oversized_population_and_generations():
    with pytest.raises(Exception) as captured:
        ExperimentCreate.model_validate(_payload({**LIVE_CONFIG, "populationSize": 24, "generations": 12}, "live"))
    message = str(captured.value)
    assert "populationSize" in message or "populationsize" in message.lower() or "less than or equal to 8" in message


def test_live_config_rejects_obsolete_sample_counts():
    obsolete = {**LIVE_CONFIG, "screeningSamples": 64, "finalistSamples": 256}
    with pytest.raises(Exception):
        ExperimentCreate.model_validate(_payload(obsolete, "live"))


def test_live_config_rejects_demo_schema_for_live_mode():
    with pytest.raises(Exception):
        ExperimentCreate.model_validate(_payload(DEMO_CONFIG, "live"))


def test_demo_config_rejects_live_schema():
    with pytest.raises(Exception):
        ExperimentCreate.model_validate(_payload(LIVE_CONFIG, "demo"))


def test_valid_live_config_accepted():
    request = ExperimentCreate.model_validate(_payload(LIVE_CONFIG, "live"))
    assert isinstance(request.config, LiveSearchConfig)
    assert request.config.population_size == 8


def test_live_budget_must_cover_population():
    bad = {**LIVE_CONFIG, "candidateEvaluationBudget": 4}
    with pytest.raises(Exception):
        ExperimentCreate.model_validate(_payload(bad, "live"))


# --- reference annotations and protected motif ------------------------------------


def test_reference_annotation_reads_contiguous_numbering_and_motif():
    annotation = load_reference(_prepared_dir(), "4AKE")
    assert annotation.chain == "A"
    assert annotation.residue_count == 214
    assert annotation.numbering_contiguous_from_one
    verify_reference_numbering(annotation, annotation.sequence)
    descriptor = protected_motif_descriptor()
    assert descriptor["positions"] == list(range(7, 16))
    assert descriptor["residues"] == "GAPGAGKGT"
    resolved = resolve_protected_positions(annotation, None)
    assert resolved["positions"] == list(range(7, 16))


def test_sequence_and_structure_numbering_mismatch_blocks_live_execution():
    annotation = load_reference(_prepared_dir(), "4AKE")
    with pytest.raises(ReferenceAnnotationError):
        verify_reference_numbering(annotation, annotation.sequence[:200])
    with pytest.raises(ReferenceAnnotationError):
        verify_reference_numbering(annotation, "AC")


def test_protected_positions_must_match_authoritative_motif():
    annotation = load_reference(_prepared_dir(), "4AKE")
    with pytest.raises(ReferenceAnnotationError):
        resolve_protected_positions(annotation, [180, 181, 182])


def test_preservation_constraint_parser_reads_residue_tokens():
    parsed = parse_preserved_residues("Do not mutate catalytic P-loop residues G7, A8, P9, G10.")
    assert parsed[7] == "G" and parsed[8] == "A" and parsed[10] == "G"


def test_residue_region_is_validated_against_reference_numbering():
    annotation = load_reference(_prepared_dir(), "4AKE")
    assert parse_residue_region("118-160") == (118, 160)
    assert parse_residue_region("42") == (42, 42)
    assert parse_residue_region("  ") is None
    assert verify_residue_region("118-160", annotation) == (118, 160)
    with pytest.raises(ReferenceAnnotationError):
        verify_residue_region("180-215", annotation)
    with pytest.raises(ReferenceAnnotationError):
        verify_residue_region("closed pocket", annotation)
    with pytest.raises(ReferenceAnnotationError):
        verify_residue_region("160-118", annotation)


# --- effective configuration derivation -------------------------------------------


def _legacy_live_experiment() -> Experiment:
    return Experiment(
        id="exp_legacy",
        name="Legacy live",
        executionMode=ExecutionMode.live,
        status=ExperimentStatus.completed,
        createdAt=datetime.now(timezone.utc),
        input=SequenceInput(experimentName="Legacy", sequence=BENCHMARK_SEQUENCE),
        target=TargetLandscape(
            objectiveText="x",
            targetStateDescription="4AKE",
            structuralMetric="rmsd",
            residueRegion="118-160",
            preservationConstraints="x",
        ),
        config=SearchConfig(
            populationSize=24,
            generations=12,
            maxSubstitutions=4,
            screeningSamples=64,
            finalistSamples=256,
            mutationStrategy="balanced",
            diversityPreference=50,
            randomSeed=42,
        ),
    )


def _candidate(index: int, mutation: str, preference: float, seeds) -> Candidate:
    return Candidate(
        id=f"cand-g000-{index:04d}",
        experimentId="exp_legacy",
        sequence="AC",
        generation=0,
        mutations=[mutation],
        targetMeanNll=1.2,
        offTargetMeanNll=1.2 - preference,
        targetPreference=preference,
        seedMetrics=[{"seed": seed, "value": preference} for seed in seeds],
    )


def test_effective_config_is_derived_from_persisted_records():
    experiment = _legacy_live_experiment()
    candidates = [
        _candidate(1, "G7L", -0.05, [17, 23, 41]),
        _candidate(2, "A100E", -0.11, [17]),
        _candidate(3, "K120M", -0.09, [17, 23, 41]),
    ]
    effective = derive_effective_config(experiment, candidates)
    assert effective.source == "derived_from_persisted_records"
    assert effective.population_size == 3
    assert effective.generations == 1
    assert effective.screening_seed == 17
    assert effective.finalist_rescore_seeds == [23, 41]
    assert effective.max_finalists == 2
    assert effective.requested_population_size == 24
    assert effective.requested_generations == 12
    assert effective.metric_supported is False
    assert effective.protected_constraint_enforced is False
    assert effective.protected_constraint_violations == ["cand-g000-0001 (G7L)"]


def test_generation_stats_use_measured_preferences():
    experiment = _legacy_live_experiment()
    candidates = [
        _candidate(1, "G7L", -0.05, [17]),
        _candidate(2, "A100E", -0.15, [17]),
    ]
    stats = derive_generation_stats(candidates)
    assert len(stats) == 1
    assert stats[0]["generation"] == 0
    assert stats[0]["bestScore"] == pytest.approx(-0.05)
    assert stats[0]["averageScore"] == pytest.approx(-0.1)


def test_protected_violations_only_report_motif_positions():
    candidates = [_candidate(1, "G7L", -0.05, [17]), _candidate(2, "A100E", -0.05, [17])]
    assert protected_violations(candidates, (7, 8, 9, 10, 11, 12, 13, 14, 15)) == ["cand-g000-0001 (G7L)"]


# --- HTTP surface -----------------------------------------------------------------


@pytest.fixture
def repository(tmp_path, monkeypatch):
    instance = SQLiteExperimentRepository(str(tmp_path / "contract.sqlite3"))
    monkeypatch.setattr(main, "repository", instance)
    monkeypatch.setattr(main.workflow, "repository", instance)
    monkeypatch.setattr(main.procurement, "repository", instance)
    # Live experiments start a background workflow thread; the contract tests only
    # exercise validation and record derivation, so the launcher is neutralised.
    monkeypatch.setattr(main, "start_workflow", lambda *args, **kwargs: None)
    return instance


def test_references_endpoint_lists_prepared_structures(repository):
    payload = main.list_references()
    ids = {item["pdbId"] for item in payload["references"]}
    assert ids == {"4AKE", "1AKE"}
    target = next(item for item in payload["references"] if item["pdbId"] == "4AKE")
    assert target["available"] is True
    assert target["residueCount"] == 214
    assert target["coordinatesUrl"].endswith("/references/4AKE/coordinates")
    assert payload["protectedMotif"]["positions"] == list(range(7, 16))


def test_reference_coordinates_are_served_and_unknown_ids_rejected(repository):
    response = main.reference_coordinates("4AKE")
    assert Path(response.path).is_file()
    with pytest.raises(main.HTTPException) as error:
        main.reference_coordinates("9XYZ")
    assert error.value.status_code == 404


def test_procurement_package_contains_sequence_checksum_and_caveats(repository):
    experiment = main.create_experiment(
        ExperimentCreate.model_validate(_payload({**LIVE_CONFIG}, "live", sequence=BENCHMARK_SEQUENCE))
    )
    # Same length as the seed so the mutation list is meaningful: Met1 -> Ala1.
    candidate = Candidate(id="cand-1", experimentId=experiment.id, sequence="A" + BENCHMARK_SEQUENCE[1:], generation=0)
    repository.add_candidates([candidate])
    request = main.create_procurement_request(
        experiment.id,
        main.ProcurementRequestCreate(
            experimentId=experiment.id,
            candidateId="cand-1",
            specification=main.ProcurementSpecification(productType="custom_protein", quantity="1 mg"),
        ),
        _loopback_request(),
    )
    package = main.prepare_procurement_package(experiment.id, request.id, _loopback_request())
    assert package["supplierCatalogConfigured"] is False
    assert "No live supplier catalog search was performed" in package["supplierStatus"]
    assert len(package["sequenceSha256"]) == 64
    assert any(item["name"].endswith(".fasta") for item in package["files"])
    assert any(item["name"].endswith("quote-request.md") for item in package["files"])
    document = next(item["content"] for item in package["files"] if item["name"].endswith(".md"))
    assert "computational ProteinMPNN" in document
    assert package["mutations"] == ["M1A"]


def _loopback_request():
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [],
        "query_string": b"",
        "server": ("localhost", 80),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }
    return Request(scope)
