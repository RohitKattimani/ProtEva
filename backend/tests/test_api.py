import pytest
from fastapi import HTTPException

from proteva_api import main
from proteva_api.repository import SQLiteExperimentRepository
from proteva_api.schemas import ExperimentCreate

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


@pytest.fixture
def repository(tmp_path, monkeypatch):
    instance = SQLiteExperimentRepository(str(tmp_path / "test.sqlite3"))
    monkeypatch.setattr(main, "repository", instance)
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


def test_live_request_is_rejected_without_creating_record(repository):
    live_request = ExperimentCreate.model_validate({**PAYLOAD, "executionMode": "live"})
    with pytest.raises(HTTPException) as error:
        main.create_experiment(live_request)
    assert error.value.status_code == 501
    assert "no execution mechanism is configured" in error.value.detail
    assert repository.list() == []


def test_unknown_experiment_raises_not_found(repository):
    with pytest.raises(HTTPException) as error:
        main.get_experiment("missing")
    assert error.value.status_code == 404
