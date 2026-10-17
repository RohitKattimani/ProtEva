from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import json

import pytest

from proteva_api.live import ALLOWED_TOOLS, GemmaFunctionClient, LiveWorkflow, LiveWorkflowError
from proteva_api.repository import SQLiteExperimentRepository
from proteva_api.schemas import Candidate, ExecutionMode, Experiment, ExperimentStatus, ReportingStatus, SearchConfig, SequenceInput, TargetLandscape
from proteva_api.settings import Settings


def experiment():
    return Experiment(id="exp_live", name="Live", executionMode=ExecutionMode.live, status=ExperimentStatus.queued, createdAt=datetime.now(timezone.utc), input=SequenceInput(experimentName="Live", sequence="AC"), target=TargetLandscape(objectiveText="x", targetStateDescription="x", structuralMetric="rmsd", residueRegion="1-2", preservationConstraints="x"), config=SearchConfig(populationSize=2, generations=1, maxSubstitutions=1, screeningSamples=1, finalistSamples=1, mutationStrategy="x", diversityPreference=1, randomSeed=1, enableExperimentalProxySelection=True, acknowledgeExperimentalProxy=True))


def test_missing_credential_is_explicit_and_persisted(tmp_path):
    repo=SQLiteExperimentRepository(str(tmp_path / "db.sqlite3")); item=experiment(); repo.add(item)
    workflow=LiveWorkflow(repo, Settings(database_path=str(tmp_path / "db.sqlite3"), google_api_key=None))
    workflow.run(item.id)
    stored=repo.get(item.id)
    assert stored.status is ExperimentStatus.failed
    assert "GOOGLE_API_KEY" in stored.error["message"]
    assert repo.events(item.id)[0].kind == "agent_task"


def test_allowlist_has_no_dynamic_execution_surface():
    assert set(ALLOWED_TOOLS) == {"validate_landscape", "generate_candidates", "score_candidate_batch", "rescore_finalists", "get_candidate_metrics", "record_audit_result", "export_experiment_report"}
    with pytest.raises(LiveWorkflowError):
        GemmaFunctionClient(Settings(google_api_key=None)).request_tool("Landscape Interpreter", {}, "validate_landscape")


def test_structured_agent_delegation_is_persisted(tmp_path):
    class MockGemma:
        def request_tool(self, role, state, expected_tool, max_attempts=1): return {"name": "validate_landscape", "args": {}}
    repo=SQLiteExperimentRepository(str(tmp_path / "db.sqlite3")); item=experiment(); repo.add(item)
    workflow=LiveWorkflow(repo, Settings(database_path=str(tmp_path / "db.sqlite3"), google_api_key="test"), MockGemma())
    workflow.invoke_role(item, "Landscape Interpreter", {"sequence_length": 2}, "validate_landscape")
    events=repo.events(item.id)
    assert [event.kind for event in events] == ["agent_task", "tool_request"]
    assert events[-1].payload["tool"] == "validate_landscape"


def test_unexpected_model_tool_is_rejected(tmp_path):
    class MockGemma:
        def request_tool(self, role, state, expected_tool, max_attempts=1): return {"name": "unrestricted_shell", "args": {}}
    repo=SQLiteExperimentRepository(str(tmp_path / "db.sqlite3")); item=experiment(); repo.add(item)
    workflow=LiveWorkflow(repo, Settings(database_path=str(tmp_path / "db.sqlite3"), google_api_key="test"), MockGemma())
    with pytest.raises(LiveWorkflowError, match="unauthorized tool"):
        workflow.invoke_role(item, "Landscape Interpreter", {}, "validate_landscape")


def test_sdk_transient_500_retries_once_then_accepts_structured_report_call(monkeypatch):
    import google.genai
    calls=[]
    class ProviderError(Exception):
        code=500
        response_json={"error":{"status":"INTERNAL","message":"Temporary provider failure"}}
        response=SimpleNamespace(headers={"x-request-id":"req-safe-123"})
    class Models:
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            if len(calls)==1: raise ProviderError("Temporary provider failure")
            return SimpleNamespace(function_calls=[SimpleNamespace(name="export_experiment_report",args={"summary":"Evidence summary","limitations":["Proxy only"]})])
    class FakeClient:
        def __init__(self, **kwargs): self.models=Models()
    monkeypatch.setattr(google.genai,"Client",FakeClient)
    monkeypatch.setattr("proteva_api.live.time.sleep",lambda delay:None)
    result=GemmaFunctionClient(Settings(google_api_key="test-key")).request_tool("Report Agent",{"candidates":[]},"export_experiment_report",max_attempts=3)
    assert result["args"]["summary"]=="Evidence summary"
    assert [item["attempt"] for item in result["attempts"]]==[1,2]
    assert result["attempts"][0]["requestId"]=="req-safe-123"
    assert all(item["config"].http_options.retry_options.attempts==1 for item in calls)
    assert calls[-1]["config"].tool_config.function_calling_config.allowed_function_names==["export_experiment_report"]
    assert calls[-1]["config"].max_output_tokens==256


def test_sdk_does_not_retry_authorization_failure(monkeypatch):
    import google.genai
    class ProviderError(Exception):
        code=403
        response_json={"error":{"status":"PERMISSION_DENIED","message":"Denied"}}
        response=None
    class Models:
        def __init__(self): self.calls=0
        def generate_content(self, **kwargs): self.calls+=1; raise ProviderError("Denied")
    models=Models()
    class FakeClient:
        def __init__(self, **kwargs): self.models=models
    monkeypatch.setattr(google.genai,"Client",FakeClient)
    with pytest.raises(LiveWorkflowError,match="status=403") as captured:
        GemmaFunctionClient(Settings(google_api_key="test-key")).request_tool("Report Agent",{},"export_experiment_report",max_attempts=3)
    assert models.calls==1
    assert len(captured.value.attempts)==1


def test_report_agent_uses_compact_json_not_a_tool_call(monkeypatch):
    import google.genai
    calls=[]
    class Models:
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(text='{"summary":"Recorded scores only.","limitations":["Proxy only."]}')
    class FakeClient:
        def __init__(self, **kwargs): self.models=Models()
    monkeypatch.setattr(google.genai,"Client",FakeClient)
    result=GemmaFunctionClient(Settings(google_api_key="test-key")).request_report_narrative({"candidates":[]})
    assert result["narrative"]["summary"]=="Recorded scores only."
    assert calls[0]["config"].response_mime_type=="application/json"
    assert calls[0]["config"].tools is None


def test_evidence_builder_preserves_nulls_and_reference_provenance(tmp_path):
    from proteva_api.reporting import EvidenceReportBuilder
    repo=SQLiteExperimentRepository(str(tmp_path/"report.sqlite3")); item=experiment(); item.status=ExperimentStatus.completed_with_warnings; repo.add(item)
    candidate=Candidate(id="cand",experimentId=item.id,sequence="AC",targetMeanNll=None,offTargetMeanNll=None,targetPreference=None,audit={"warning":"missing measurement"})
    repo.add_candidates([candidate]); repo.add_event(__import__("proteva_api.schemas",fromlist=["AgentEvent"]).AgentEvent(id="audit",experimentId=item.id,timestamp=datetime.now(timezone.utc),kind="audit",summary="warning"))
    builder=EvidenceReportBuilder(repo,tmp_path/"artifacts",tmp_path/"structures")
    record,path,checksum=builder.build(item.id,"attempt")
    assert record["candidates"][0]["targetPreference"] is None
    assert record["candidates"][0]["targetMeanNll"] is None
    assert len(checksum)==64 and path.is_file()
    assert record["metric"]["formula"]=="off_target_mean_nll - target_mean_nll"
    assert record["metric"]["componentMetrics"]["targetMeanNll"].startswith("mean_negative_log_likelihood")
    assert record["workflowEvents"][-1]["kind"]=="audit"


def _seed_reportable_experiment(repo, item):
    from proteva_api.schemas import AgentEvent
    item.status=ExperimentStatus.failed; repo.add(item)
    record=Candidate(id="candidate-0",experimentId=item.id,sequence="AC",targetMeanNll=1.2,offTargetMeanNll=1.1,targetPreference=-0.1,seedMetrics=[{"seed":17,"value":-0.1,"coverage":2}],audit={"status":"reviewed","warning":"proxy"})
    repo.add_candidates([record])
    repo.add_event(AgentEvent(id="audit-event",experimentId=item.id,timestamp=datetime.now(timezone.utc),kind="audit",summary="reviewed"))
    return record


def test_report_only_recovery_uses_persisted_evidence_and_is_idempotent(tmp_path, monkeypatch):
    repo=SQLiteExperimentRepository(str(tmp_path/"recover.sqlite3")); item=experiment(); _seed_reportable_experiment(repo,item)
    class ReportGemma:
        def request_report_narrative(self, state, max_attempts=1):
            return {"narrative":{"summary":"Measured evidence summarized.","limitations":["Proxy only"]},"model":"test-model","attempts":[{"attempt":1,"status":"success"}]}
    workflow=LiveWorkflow(repo,Settings(database_path=str(tmp_path/"recover.sqlite3"),google_api_key="test",proteinmpnn_artifacts=str(tmp_path/"artifacts"),prepared_structures=str(tmp_path/"structures")),ReportGemma())
    monkeypatch.setattr(workflow,"_generate_candidates",lambda *_: (_ for _ in ()).throw(AssertionError("GA reran")))
    monkeypatch.setattr(workflow,"_score",lambda *_: (_ for _ in ()).throw(AssertionError("ProteinMPNN reran")))
    workflow.recover_report(item.id)
    stored=repo.get(item.id)
    assert stored.status is ExperimentStatus.completed and stored.reporting_status is ReportingStatus.completed
    assert len(repo.candidates(item.id))==1
    assert len([x for x in repo.artifacts(item.id) if x["kind"]=="evidence_report"])==1
    assert len([x for x in repo.artifacts(item.id) if x["kind"]=="ai_narrative"])==1
    assert repo.reporting_attempts(item.id)[-1]["status"]=="completed"


def test_report_retry_preserves_evidence_when_narrative_fails(tmp_path):
    repo=SQLiteExperimentRepository(str(tmp_path/"failed-report.sqlite3")); item=experiment(); _seed_reportable_experiment(repo,item)
    class BrokenGemma:
        def request_report_narrative(self, state, max_attempts=1):
            error=LiveWorkflowError("provider status=500")
            error.attempts=[{"attempt":1,"status":"error","status":500,"message":"Internal error"}]
            raise error
    workflow=LiveWorkflow(repo,Settings(database_path=str(tmp_path/"failed-report.sqlite3"),google_api_key="test",proteinmpnn_artifacts=str(tmp_path/"artifacts"),prepared_structures=str(tmp_path/"structures")),BrokenGemma())
    workflow.recover_report(item.id)
    workflow.recover_report(item.id)
    stored=repo.get(item.id)
    assert stored.status is ExperimentStatus.completed_with_warnings
    assert stored.reporting_status is ReportingStatus.failed
    assert stored.reporting_error["code"]=="REPORTING_UNAVAILABLE"
    assert len([x for x in repo.artifacts(item.id) if x["kind"]=="evidence_report"])==1
    assert any(event.kind=="report_error" for event in repo.events(item.id))
    assert len([event for event in repo.events(item.id) if event.kind=="report_evidence"])==1
    evidence_event=next(event for event in repo.events(item.id) if event.kind=="report_evidence")
    assert evidence_event.provenance.model_name is None
    attempts=repo.reporting_attempts(item.id)
    assert len(attempts)==2 and all(item["status"]=="failed" for item in attempts)
    assert all(item["providerAttempts"][0]["status"]==500 for item in attempts)


def test_concurrent_report_recovery_is_rejected_without_duplicate_work(tmp_path):
    repo=SQLiteExperimentRepository(str(tmp_path/"active.sqlite3")); item=experiment(); _seed_reportable_experiment(repo,item)
    assert repo.begin_reporting_attempt(item.id,"active",{"id":"active"})
    workflow=LiveWorkflow(repo,Settings(database_path=str(tmp_path/"active.sqlite3"),google_api_key="test",proteinmpnn_artifacts=str(tmp_path/"artifacts"),prepared_structures=str(tmp_path/"structures")))
    with pytest.raises(LiveWorkflowError,match="already running"):
        workflow.recover_report(item.id)
    assert len(repo.candidates(item.id))==1


def test_evidence_failure_does_not_claim_a_report_is_available(tmp_path):
    repo=SQLiteExperimentRepository(str(tmp_path/"no-evidence.sqlite3")); item=experiment(); item.status=ExperimentStatus.completed; repo.add(item)
    workflow=LiveWorkflow(repo,Settings(database_path=str(tmp_path/"no-evidence.sqlite3"),google_api_key="test",proteinmpnn_artifacts=str(tmp_path/"artifacts"),prepared_structures=str(tmp_path/"structures")))
    workflow.recover_report(item.id)
    stored=repo.get(item.id)
    assert stored.status is ExperimentStatus.completed_with_warnings
    assert stored.reporting_status is ReportingStatus.failed
    assert stored.reporting_error["code"]=="EVIDENCE_REPORT_FAILED"
    assert not any(artifact["kind"]=="evidence_report" for artifact in repo.artifacts(item.id))
    assert next(event for event in repo.events(item.id) if event.kind=="report_error").summary=="Deterministic evidence report could not be created"


def test_exhausted_transient_retries_are_bounded_and_redact_key(monkeypatch):
    import google.genai
    class ProviderError(Exception):
        code=500
        response_json={"error":{"status":"INTERNAL","message":"Failure for APIKEY-SHOULD-REDACT"}}
        response=SimpleNamespace(headers={"x-goog-request-id":"req-500"})
    class Models:
        def __init__(self): self.calls=0
        def generate_content(self, **kwargs): self.calls+=1; raise ProviderError("Failure for APIKEY-SHOULD-REDACT")
    models=Models()
    class FakeClient:
        def __init__(self, **kwargs): self.models=models
    monkeypatch.setattr(google.genai,"Client",FakeClient)
    monkeypatch.setattr("proteva_api.live.time.sleep",lambda delay:None)
    client=GemmaFunctionClient(Settings(google_api_key="APIKEY-SHOULD-REDACT"))
    with pytest.raises(LiveWorkflowError,match="status=500") as captured:
        client.request_tool("Report Agent",{},"export_experiment_report",max_attempts=99)
    assert models.calls==3
    assert len(captured.value.attempts)==3
    assert all(item["requestId"]=="req-500" for item in captured.value.attempts)
    assert "APIKEY-SHOULD-REDACT" not in str(captured.value)


def test_invalid_request_is_not_retried(monkeypatch):
    import google.genai
    class ProviderError(Exception):
        code=400
        response_json={"error":{"status":"INVALID_ARGUMENT","message":"Invalid request schema"}}
        response=None
    class Models:
        calls=0
        def generate_content(self, **kwargs): self.calls+=1; raise ProviderError("Invalid request")
    models=Models()
    class FakeClient:
        def __init__(self, **kwargs): self.models=models
    monkeypatch.setattr(google.genai,"Client",FakeClient)
    with pytest.raises(LiveWorkflowError,match="status=400"):
        GemmaFunctionClient(Settings(google_api_key="test-key")).request_tool("Report Agent",{},"export_experiment_report",max_attempts=3)
    assert models.calls==1


def test_reporting_retry_stops_at_total_deadline(monkeypatch):
    import google.genai
    clock={"now":0.0}
    class ProviderError(Exception):
        code=500
        response_json={"error":{"status":"INTERNAL","message":"Temporary"}}
        response=None
    class Models:
        calls=0
        def generate_content(self, **kwargs): self.calls+=1; raise ProviderError("Temporary")
    models=Models()
    class FakeClient:
        def __init__(self, **kwargs): self.models=models
    monkeypatch.setattr(google.genai,"Client",FakeClient)
    monkeypatch.setattr("proteva_api.live.time.monotonic",lambda:clock["now"])
    monkeypatch.setattr("proteva_api.live.time.sleep",lambda delay:clock.update(now=31.0))
    with pytest.raises(LiveWorkflowError,match="30-second reporting deadline") as captured:
        GemmaFunctionClient(Settings(google_api_key="test-key")).request_tool("Report Agent",{},"export_experiment_report",max_attempts=3)
    assert models.calls==1
    assert len(captured.value.attempts)==1
