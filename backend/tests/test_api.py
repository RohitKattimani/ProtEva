import pytest
from fastapi import HTTPException
from starlette.requests import Request

from proteva_api import main
from proteva_api.live import GemmaFunctionClient
from proteva_api.settings import Settings
from proteva_api.repository import SQLiteExperimentRepository
from proteva_api.schemas import ExperimentCreate, ExperimentStatus

PAYLOAD = {
    "input": {"experimentName": "Draft", "sequence": "MKTAYIAK"},
    "target": {
        "objectiveText": "Explore",
        "targetStateDescription": "Open",
        "structuralMetric": "rmsd",
        "thresholdAngstrom": 6,
        "residueRegion": "1-4",
        "preservationConstraints": "None specified",
    },
    "config": {
        "populationSize": 2,
        "generations": 1,
        "maxSubstitutions": 1,
        "screeningSamples": 1,
        "finalistSamples": 1,
        "mutationStrategy": "balanced",
        "diversityPreference": 50,
        "randomSeed": 7,
    },
    "executionMode": "demo",
}


LIVE_CONFIG = {
    "populationSize": 2,
    "generations": 1,
    "maxSubstitutions": 1,
    "screeningSeed": 17,
    "finalistRescoreSeeds": [23, 41],
    "maxFinalists": 1,
    "candidateEvaluationBudget": 2,
    "mutationStrategy": "balanced",
    "diversityPreference": 50,
    "randomSeed": 7,
    "acknowledgeExperimentalProxy": True,
}


@pytest.fixture
def repository(tmp_path, monkeypatch):
    instance = SQLiteExperimentRepository(str(tmp_path / "test.sqlite3"))
    monkeypatch.setattr(main, "repository", instance)
    monkeypatch.setattr(main.workflow, "repository", instance)
    monkeypatch.setattr(
        main.workflow,
        "model_client",
        GemmaFunctionClient(Settings(database_path=str(tmp_path / "test.sqlite3"), google_api_key=None)),
    )
    return instance


def test_health_and_readiness(repository):
    assert main.health() == {"status": "ok"}
    assert main.ready() == {"status": "ready", "persistence": "available"}


def test_demo_request_persists_as_draft_without_results(repository):
    experiment = main.create_experiment(ExperimentCreate.model_validate(PAYLOAD))
    assert experiment.status == "draft"
    assert experiment.execution_mode == "demo"
    assert experiment.current_generation is None
    assert experiment.generation_stats is None
    assert repository.get(experiment.id) == experiment
    assert main.list_experiments() == [experiment]
    assert main.get_experiment(experiment.id) == experiment
    assert main.get_candidates(experiment.id) == []
    assert main.get_artifacts(experiment.id) == []
    with pytest.raises(HTTPException) as candidate_error:
        main.get_candidate(experiment.id, "missing")
    assert candidate_error.value.status_code == 404


def test_live_request_is_recorded_then_fails_without_server_credentials(repository, monkeypatch):
    live_request = ExperimentCreate.model_validate({**PAYLOAD, "executionMode": "live", "config": LIVE_CONFIG})
    class Synchronous:
        def __init__(self, workflow, experiment_id): workflow.run(experiment_id)
    monkeypatch.setattr(main, "start_workflow", lambda workflow, experiment_id: Synchronous(workflow, experiment_id))
    experiment = main.create_experiment(live_request)
    stored = repository.get(experiment.id)
    assert stored is not None
    assert stored.status is ExperimentStatus.failed
    assert "PROTEVA_GOOGLE_API_KEY" in stored.error["message"]
    assert main.get_events(experiment.id)[-1].kind == "error"


def test_unknown_experiment_raises_not_found(repository):
    with pytest.raises(HTTPException) as error:
        main.get_experiment("missing")
    assert error.value.status_code == 404


def test_cancel_and_export_demo_experiment(repository):
    experiment = main.create_experiment(ExperimentCreate.model_validate(PAYLOAD))
    cancelled = main.cancel_experiment(experiment.id)
    assert cancelled.status is ExperimentStatus.cancelled
    bundle = main.export_experiment(experiment.id)
    assert bundle["experiment"].status is ExperimentStatus.cancelled
    assert bundle["events"][-1].kind == "decision"


def test_cancelled_workflow_does_not_restart(repository):
    experiment = main.create_experiment(ExperimentCreate.model_validate(PAYLOAD))
    main.cancel_experiment(experiment.id)
    main.workflow.run(experiment.id)
    assert repository.get(experiment.id).status is ExperimentStatus.cancelled


def test_reporting_history_is_loopback_only(repository):
    experiment = main.create_experiment(ExperimentCreate.model_validate(PAYLOAD))
    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b"", "server": ("localhost", 80), "client": ("127.0.0.1", 1234), "scheme": "http", "http_version": "1.1"}
    assert main.report_attempts(experiment.id, Request(scope)) == []
    scope["client"] = ("203.0.113.10", 1234)
    with pytest.raises(HTTPException) as error:
        main.report_attempts(experiment.id, Request(scope))
    assert error.value.status_code == 403


def test_completed_with_warnings_cannot_be_cancelled(repository):
    experiment = main.create_experiment(ExperimentCreate.model_validate(PAYLOAD))
    experiment.status = ExperimentStatus.completed_with_warnings
    repository.replace(experiment)
    with pytest.raises(HTTPException) as error:
        main.cancel_experiment(experiment.id)
    assert error.value.status_code == 409


def test_global_candidate_listing_spans_experiments(repository):
    from proteva_api.schemas import Candidate

    experiments = [main.create_experiment(ExperimentCreate.model_validate(PAYLOAD)) for _ in range(2)]
    repository.add_candidates(
        [
            Candidate(
                id=f"cand-g000-{index:04d}",
                experimentId=experiment.id,
                sequence="AC",
                generation=0,
                mutations=[],
            )
            for index, experiment in enumerate(experiments)
        ]
    )
    listed = main.list_candidates()
    assert {candidate.experiment_id for candidate in listed} == {
        experiment.id for experiment in experiments
    }
    assert len(listed) == 2
    first_experiment = next(
        candidate for candidate in listed if candidate.experiment_id == experiments[0].id
    )
    assert main.get_candidates(experiments[0].id) == [first_experiment]
