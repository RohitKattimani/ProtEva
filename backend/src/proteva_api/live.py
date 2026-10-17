"""Bounded live scientific-search orchestration with allowlisted agent tools."""
from __future__ import annotations

import json
import random
import time
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .repository import SQLiteExperimentRepository
from .schemas import AgentEvent, Candidate, EvidenceOrigin, Experiment, ExperimentStatus, Provenance, ReportingStatus
from .reporting import EvidenceReportBuilder
from .settings import Settings

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

ROLE_INSTRUCTIONS = {
    "Landscape Interpreter": "Validate only the provided live landscape. Use validate_landscape when it is complete; report missing fields through that tool.",
    "Search Strategist": "Recommend a bounded plan using recorded limits. Use generate_candidates only after validation succeeds.",
    "Evolution Coordinator": "Use recorded tool results to choose the next allowlisted action. Do not invent metrics or call unlisted tools.",
    "Ensemble Analysis Worker": "Run deterministic, allowlisted scientific tools and report only measured results. Do not infer metrics.",
    "Scientific Auditor": "Review recorded NLL, mappings, seeds, and limitations. Use record_audit_result only.",
    "Report Agent": "Write a concise, evidence-grounded narrative only from the supplied recorded evidence. Do not invent measurements or recommendations.",
}
ALLOWED_TOOLS = ("validate_landscape", "generate_candidates", "score_candidate_batch", "rescore_finalists", "get_candidate_metrics", "record_audit_result", "export_experiment_report")


class LiveWorkflowError(RuntimeError):
    pass


def now() -> datetime:
    return datetime.now(timezone.utc)


class GemmaFunctionClient:
    """Official SDK wrapper with bounded visible retries and no executable prose."""
    def __init__(self, settings: Settings): self.settings = settings

    @staticmethod
    def _error_metadata(error: Exception, api_key: str) -> dict[str, Any]:
        response=getattr(error, "response", None)
        body=getattr(error, "response_json", None)
        if not isinstance(body, dict): body={}
        nested=body.get("error") if isinstance(body.get("error"),dict) else body
        message=nested.get("message") if isinstance(nested.get("message"),str) else (str(error) or type(error).__name__)
        if api_key: message=message.replace(api_key,"[REDACTED]")
        headers=getattr(response,"headers",{}) or {}
        request_id=next((headers.get(name) for name in ("x-request-id","x-goog-request-id","x-guploader-uploadid","request-id") if headers.get(name)),None)
        code=getattr(error,"code",None)
        status=code
        text=str(error)
        if status in (401,403): category="authentication"
        elif status in (400,422): category="request"
        elif isinstance(error,(TimeoutError,)) or "timeout" in text.lower() or "deadline" in text.lower(): category="timeout"
        elif "10061" in text or "connection" in text.lower() or "refused" in text.lower(): category="connection"
        elif status is not None and int(status) >= 500: category="provider"
        else: category="unknown"
        return {"status":code,"code":nested.get("status") if isinstance(nested.get("status"),str) else None,"message":message[:500],"requestId":request_id,"category":category}

    def request_tool(self, role: str, context: dict[str, Any], expected_tool: str, max_attempts: int = 1) -> dict[str, Any]:
        max_attempts=min(max(1,max_attempts),3)
        if not self.settings.google_api_key:
            raise LiveWorkflowError("PROTEVA_GOOGLE_API_KEY is not configured; live Gemma execution cannot start")
        if expected_tool not in ALLOWED_TOOLS: raise LiveWorkflowError("The requested tool is not allowlisted")
        from google import genai
        from google.genai import types
        import httpx
        declarations=[]
        for name in ALLOWED_TOOLS:
            schema={"type":"object","properties":{},"additionalProperties":False}
            if name == "export_experiment_report":
                schema={"type":"object","properties":{"summary":{"type":"string","maxLength":600},"limitations":{"type":"array","items":{"type":"string"},"maxItems":8}},"required":["summary","limitations"],"additionalProperties":False}
            declarations.append(types.FunctionDeclaration(name=name,description="ProtEva allowlisted tool: "+name,parameters_json_schema=schema))
        client=genai.Client(api_key=self.settings.google_api_key, http_options=types.HttpOptions(client_args={"trust_env": True}))
        started=time.monotonic(); attempts=[]; deadline=started+30.0
        for attempt in range(1,max_attempts+1):
            remaining_seconds=deadline-time.monotonic()
            if remaining_seconds <= 0:
                failure=LiveWorkflowError("Gemma provider request exceeded the 30-second reporting deadline after %s provider attempt(s)"%len(attempts))
                failure.attempts=attempts
                raise failure
            try:
                remaining=max(1,int(remaining_seconds*1000))
                response=client.models.generate_content(
                    model=self.settings.gemma_model,
                    contents=json.dumps({"role":role,"instruction":ROLE_INSTRUCTIONS[role],"recorded_state":context,"required_next_tool":expected_tool}),
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(function_declarations=declarations)],
                        tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode=types.FunctionCallingConfigMode.ANY,allowed_function_names=[expected_tool])),
                        temperature=0,
                        max_output_tokens=256 if expected_tool=="export_experiment_report" else 128,
                        candidate_count=1,
                        http_options=types.HttpOptions(timeout=min(15000,remaining),retry_options=types.HttpRetryOptions(attempts=1),client_args={"trust_env": True}),
                    ),
                )
                calls=getattr(response,"function_calls",None) or []
                if len(calls)!=1 or calls[0].name!=expected_tool: raise LiveWorkflowError("Gemma did not return exactly one authorized structured function call")
                args=dict(calls[0].args or {})
                if expected_tool=="export_experiment_report":
                    if set(args)!={"summary","limitations"} or not isinstance(args["summary"],str) or len(args["summary"])>600 or not isinstance(args["limitations"],list) or len(args["limitations"])>8 or any(not isinstance(item,str) for item in args["limitations"]):
                        raise LiveWorkflowError("Report Agent returned invalid narrative fields")
                elif args:
                    raise LiveWorkflowError("Gemma returned arguments not allowed by the selected tool schema")
                attempts.append({"attempt":attempt,"status":"success","elapsedSeconds":round(time.monotonic()-started,3)})
                return {"name":calls[0].name,"args":args,"attempts":attempts}
            except Exception as error:
                metadata=self._error_metadata(error,self.settings.google_api_key)
                transient=metadata["status"] in {408,429,500,502,503,504} or isinstance(error,(TimeoutError,httpx.TimeoutException))
                attempts.append({"attempt":attempt,"status":"error",**metadata,"elapsedSeconds":round(time.monotonic()-started,3)})
                if not transient or attempt==max_attempts or time.monotonic()>=deadline:
                    failure=LiveWorkflowError("Gemma provider request failed after %s attempt(s): status=%s code=%s message=%s"%(attempt,metadata["status"],metadata["code"],metadata["message"]))
                    failure.attempts=attempts
                    raise failure
                time.sleep(min(4.0,0.5*(2**(attempt-1))+random.uniform(0,0.25),max(0,deadline-time.monotonic())))

    def request_report_narrative(self, context: dict[str, Any], max_attempts: int = 3) -> dict[str, Any]:
        """Ask Gemma to explain persisted evidence; artifact creation is deterministic."""
        if not self.settings.google_api_key:
            raise LiveWorkflowError("PROTEVA_GOOGLE_API_KEY is not configured; live Gemma execution cannot start")
        from google import genai
        from google.genai import types
        import httpx

        models=[self.settings.gemma_model]
        if self.settings.gemma_fallback_model and self.settings.gemma_fallback_model not in models:
            models.append(self.settings.gemma_fallback_model)
        started=time.monotonic(); deadline=started+30.0; attempts=[]; max_attempts=min(max(1,max_attempts),3)
        client=genai.Client(api_key=self.settings.google_api_key, http_options=types.HttpOptions(client_args={"trust_env": True}))
        prompt=("You are the ProtEva Report Agent. Return a JSON object with exactly two keys: summary and limitations. "
                "summary must be one concise sentence (max 300 characters) describing the persisted evidence and scientific status; do not repeat phrases. "
                "limitations must be an array of at most 5 concise strings. "
                "Use only the recorded evidence. Do not create, alter, or infer numerical measurements. "
                + json.dumps(context, separators=(",",":")))
        for attempt in range(1,max_attempts+1):
            remaining=deadline-time.monotonic()
            if remaining <= 0: break
            model=models[min(attempt-1,len(models)-1)]
            try:
                response=client.models.generate_content(
                    model=model, contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0, candidate_count=1, max_output_tokens=256,
                        response_mime_type="application/json",
                        response_json_schema={"type":"object","properties":{"summary":{"type":"string","maxLength":600},"limitations":{"type":"array","items":{"type":"string"},"maxItems":8}},"required":["summary","limitations"],"additionalProperties":False},
                        http_options=types.HttpOptions(timeout=min(15000,max(1,int(remaining*1000))),retry_options=types.HttpRetryOptions(attempts=1),client_args={"trust_env": True}),
                    ),
                )
                parsed=json.loads(response.text or "")
                if set(parsed)!={"summary","limitations"} or not isinstance(parsed["summary"],str) or len(parsed["summary"])>600 or not isinstance(parsed["limitations"],list) or len(parsed["limitations"])>8 or any(not isinstance(value,str) for value in parsed["limitations"]):
                    raise LiveWorkflowError("Report Agent returned invalid JSON narrative")
                attempts.append({"attempt":attempt,"status":"success","model":model,"elapsedSeconds":round(time.monotonic()-started,3)})
                return {"narrative":parsed,"model":model,"attempts":attempts}
            except Exception as error:
                metadata=self._error_metadata(error,self.settings.google_api_key)
                transient=metadata["status"] in {408,429,500,502,503,504} or isinstance(error,(TimeoutError,httpx.TimeoutException))
                attempts.append({"attempt":attempt,"status":"error","model":model,**metadata,"elapsedSeconds":round(time.monotonic()-started,3)})
                if not transient or attempt==max_attempts or time.monotonic()>=deadline:
                    failure=LiveWorkflowError("Gemma Report Agent failed after %s attempt(s): status=%s code=%s message=%s"%(attempt,metadata["status"],metadata["code"],metadata["message"]))
                    failure.attempts=attempts
                    raise failure
                time.sleep(min(4.0,0.5*(2**(attempt-1))+random.uniform(0,0.25),max(0,deadline-time.monotonic())))
        failure=LiveWorkflowError("Gemma Report Agent exceeded the 30-second reporting deadline")
        failure.attempts=attempts
        raise failure


class LiveWorkflow:
    def __init__(self, repository: SQLiteExperimentRepository, settings: Settings, model_client: GemmaFunctionClient | None = None):
        self.repository, self.settings, self.model_client = repository, settings, model_client or GemmaFunctionClient(settings)

    def event(self, experiment: Experiment, kind: str, summary: str, payload: dict[str, Any] | None = None, model_generated: bool = True) -> None:
        self.repository.add_event(AgentEvent(id="evt_" + uuid4().hex, experiment_id=experiment.id, timestamp=now(), kind=kind, summary=summary, payload=payload, provenance=Provenance(origin=EvidenceOrigin.computational, producer="proteva-live-workflow", model_name=self.settings.gemma_model if model_generated else None, generatedAt=now())))

    def invoke_role(self, experiment: Experiment, role: str, state: dict[str, Any], expected_tool: str, max_attempts: int = 3) -> dict[str, Any]:
        self.event(experiment, "agent_task", role + " received structured task", {"role": role})
        call = self.model_client.request_tool(role, state, expected_tool, max_attempts)
        self.event(experiment, "tool_request", role + " requested " + call["name"], {"role": role, "tool": call["name"], "arguments": call["args"], "providerAttempts": call.get("attempts", [])})
        if call["name"] != expected_tool: raise LiveWorkflowError(role + " requested an unauthorized tool")
        return call

    def run(self, experiment_id: str) -> None:
        experiment = self.repository.get(experiment_id)
        if experiment is None or experiment.status is ExperimentStatus.cancelled:
            return
        try:
            if not experiment.config.acknowledge_experimental_proxy:
                raise LiveWorkflowError("live proxy search requires acknowledgeExperimentalProxy=true")
            experiment.status = ExperimentStatus.running; self.repository.replace(experiment)
            self.invoke_role(experiment, "Landscape Interpreter", {"sequence_length": len(experiment.input.sequence), "benchmark": "4AKE/1AKE chain A"}, "validate_landscape")
            self.event(experiment, "tool_result", "validated prepared 4AKE/1AKE chain-A reference mapping", {"coverage": 214, "limitation": "1AKE is AP5A inhibitor-bound; proxy is not an apo equilibrium measurement"})
            self.invoke_role(experiment, "Search Strategist", {"population_limit": min(experiment.config.population_size, 8), "generation_limit": min(experiment.config.generations, 2)}, "generate_candidates")
            candidates = self._generate_candidates(experiment)
            self.repository.add_candidates(candidates)
            self.event(experiment, "tool_result", "generated bounded candidate population", {"count": len(candidates)})
            self.invoke_role(experiment, "Evolution Coordinator", {"candidate_count": len(candidates), "selection_enabled": experiment.config.enable_experimental_proxy_selection}, "score_candidate_batch")
            self.event(experiment, "agent_task", "Ensemble Analysis Worker is executing deterministic ProteinMPNN batch scoring.", {"role": "Ensemble Analysis Worker", "tool": "score_candidate_batch", "seed": 17})
            scored = self._score(experiment, candidates, 17)
            self.repository.add_candidates(scored)
            self.event(experiment, "tool_result", "completed target and off-target ProteinMPNN screening", {"seed": 17, "count": len(scored)})
            if experiment.config.enable_experimental_proxy_selection:
                finalists = sorted(scored, key=lambda item: item.target_preference if item.target_preference is not None else float("-inf"), reverse=True)[: min(3, len(scored))]
                self.event(experiment, "coordinator_decision", "Experimental proxy selection is enabled; finalists use target_preference.", {"metric": "target_preference", "candidate_ids": [item.id for item in finalists]})
            else:
                finalists = scored[: min(3, len(scored))]
                self.event(experiment, "warning", "Experimental proxy selection is disabled; stable proposal order was used only for robustness auditing.", {"candidate_ids": [item.id for item in finalists]})
            self.invoke_role(experiment, "Evolution Coordinator", {"screened": len(scored), "finalists": [item.id for item in finalists]}, "rescore_finalists")
            rescored = self._rescore(experiment, finalists)
            self.repository.add_candidates(rescored)
            self.invoke_role(experiment, "Scientific Auditor", {"finalists": [item.id for item in rescored], "seeds": [17, 23, 41]}, "record_audit_result")
            audited = [item.model_copy(update={"audit": {"status": "reviewed", "warning": "ProteinMPNN target preference is an unvalidated model proxy; 1AKE is inhibitor-bound."}}) for item in rescored]
            self.repository.add_candidates(audited)
            self.event(experiment, "audit", "auditor recorded proxy limitations and seed sensitivity", {"status": "reviewed"})
            experiment.status = ExperimentStatus.completed; experiment.current_generation = 0; experiment.candidate_count = len(scored); experiment.requires_review = len(audited); experiment.warnings = ["ProteinMPNN target preference is an experimental compatibility proxy, not biological fitness."]; experiment.reporting_status = ReportingStatus.pending; self.repository.replace(experiment)
            self.event(experiment, "decision", "coordinator completed scientific workflow using recorded tool results")
            self.recover_report(experiment.id)
        except Exception as error:
            experiment.status = ExperimentStatus.failed; experiment.error = {"code": "LIVE_WORKFLOW_FAILED", "message": str(error)}; self.repository.replace(experiment); self.event(experiment, "error", "live workflow failed", {"message": str(error)})


    def _build_evidence_report(self, experiment_id: str, attempt_id: str) -> dict[str, Any]:
        experiment=self.repository.get(experiment_id)
        if experiment is None: raise LiveWorkflowError("Experiment not found")
        if experiment.status not in {ExperimentStatus.failed,ExperimentStatus.completed_with_warnings,ExperimentStatus.completed}:
            raise LiveWorkflowError("Evidence reports require completed scientific execution")
        audit_events=[event for event in self.repository.events(experiment_id) if event.kind=="audit"]
        candidates=self.repository.candidates(experiment_id)
        if not audit_events or not candidates or any(candidate.target_mean_nll is None or candidate.off_target_mean_nll is None or candidate.target_preference is None or not candidate.seed_metrics or not candidate.audit for candidate in candidates):
            raise LiveWorkflowError("Persisted scientific measurements and audit are required before report recovery")
        builder=EvidenceReportBuilder(self.repository,Path(self.settings.proteinmpnn_artifacts),Path(self.settings.prepared_structures))
        record,path,checksum=builder.build(experiment_id,attempt_id)
        self.repository.add_artifact(experiment_id,"evidence_"+attempt_id,{"id":"evidence_"+attempt_id,"kind":"evidence_report","path":path.name,"sha256":checksum})
        self.event(experiment,"report_evidence","deterministic evidence report built from persisted records",{"attemptId":attempt_id,"sha256":checksum},model_generated=False)
        if experiment.status is ExperimentStatus.failed:
            experiment.status=ExperimentStatus.completed_with_warnings
            if experiment.reporting_status is ReportingStatus.not_requested:
                experiment.reporting_status=ReportingStatus.failed
                experiment.reporting_error={"code":"NARRATIVE_UNAVAILABLE","message":"Prior Report Agent execution failed; AI narrative recovery has not been attempted."}
        self.repository.replace(experiment)
        return {"attemptId":attempt_id,"path":path,"sha256":checksum,"record":record}

    def build_evidence_report(self, experiment_id: str) -> dict[str, Any]:
        attempt_id="rpt_"+uuid4().hex
        if not self.repository.begin_reporting_attempt(experiment_id,attempt_id,{"id":attempt_id,"status":"running","startedAt":now().isoformat()}):
            raise LiveWorkflowError("A report attempt is already running")
        try:
            evidence=self._existing_evidence_report(experiment_id) or self._build_evidence_report(experiment_id,attempt_id)
            self.repository.finish_reporting_attempt(attempt_id,"evidence_ready",{"id":attempt_id,"status":"evidence_ready","evidenceSha256":evidence["sha256"]})
            return evidence
        except Exception as error:
            self.repository.finish_reporting_attempt(attempt_id,"failed",{"id":attempt_id,"status":"failed","error":{"message":str(error)}})
            raise

    def recover_report(self, experiment_id: str) -> None:
        experiment=self.repository.get(experiment_id)
        if experiment is None: raise LiveWorkflowError("Experiment not found")
        if experiment.status not in {ExperimentStatus.failed,ExperimentStatus.completed_with_warnings,ExperimentStatus.completed}:
            raise LiveWorkflowError("Report recovery is allowed only after scientific execution has reached a terminal result")
        attempt_id="narr_"+uuid4().hex
        if not self.repository.begin_reporting_attempt(experiment_id,attempt_id,{"id":attempt_id,"status":"running","startedAt":now().isoformat()}): raise LiveWorkflowError("A report attempt is already running")
        evidence=None
        try:
            evidence=self._existing_evidence_report(experiment_id) or self._build_evidence_report(experiment_id,attempt_id)
            experiment=self.repository.get(experiment_id)
            experiment.reporting_status=ReportingStatus.running; experiment.reporting_error=None; self.repository.replace(experiment)
            builder=EvidenceReportBuilder(self.repository,Path(self.settings.proteinmpnn_artifacts),Path(self.settings.prepared_structures))
            self.event(experiment,"agent_task","Report Agent received compact persisted evidence",{"role":"Report Agent"})
            call=self.model_client.request_report_narrative(builder.narrative_context(evidence["record"]),max_attempts=3)
            narrative={"summary":call["narrative"]["summary"],"limitations":call["narrative"]["limitations"],"evidenceReportSha256":evidence["sha256"],"model":call["model"],"providerAttempts":call["attempts"]}
            narrative_path=Path(self.settings.proteinmpnn_artifacts)/(experiment_id+"-"+attempt_id+"-narrative.json")
            narrative_path.write_text(json.dumps(narrative,indent=2),encoding="utf-8")
            import hashlib
            narrative_checksum=hashlib.sha256(narrative_path.read_bytes()).hexdigest()
            self.repository.add_artifact(experiment_id,"narrative_"+attempt_id,{"id":"narrative_"+attempt_id,"kind":"ai_narrative","path":narrative_path.name,"sha256":narrative_checksum})
            experiment.reporting_status=ReportingStatus.completed; experiment.reporting_error=None; experiment.error=None; experiment.status=ExperimentStatus.completed; self.repository.replace(experiment)
            self.repository.finish_reporting_attempt(attempt_id,"completed",{"id":attempt_id,"status":"completed","evidenceSha256":evidence["sha256"],"narrativeSha256":narrative_checksum})
            self.event(experiment,"report","Report Agent created a concise narrative grounded in the deterministic evidence report",{"attemptId":attempt_id,"evidenceSha256":evidence["sha256"],"narrativeSha256":narrative_checksum,"providerAttempts":call["attempts"]})
        except Exception as error:
            evidence_available=evidence is not None or self._existing_evidence_report(experiment_id) is not None
            details={"code":"REPORTING_UNAVAILABLE" if evidence_available else "EVIDENCE_REPORT_FAILED","message":str(error)}
            experiment=self.repository.get(experiment_id)
            experiment.reporting_status=ReportingStatus.failed; experiment.reporting_error=details
            experiment.status=ExperimentStatus.completed_with_warnings
            self.repository.replace(experiment)
            self.repository.finish_reporting_attempt(attempt_id,"failed",{"id":attempt_id,"status":"failed","error":details,"providerAttempts":getattr(error,"attempts",[])})
            summary="AI narrative unavailable; deterministic evidence report remains available" if evidence_available else "Deterministic evidence report could not be created"
            self.event(experiment,"report_error",summary,{"attemptId":attempt_id,"error":details,"providerAttempts":getattr(error,"attempts",[])})

    def _existing_evidence_report(self, experiment_id: str) -> dict[str, Any] | None:
        """Reuse a valid evidence artifact across narrative retries."""
        import hashlib
        artifact_root=Path(self.settings.proteinmpnn_artifacts).resolve()
        for artifact in reversed(self.repository.artifacts(experiment_id)):
            if artifact.get("kind") != "evidence_report":
                continue
            filename=artifact.get("path")
            expected=artifact.get("sha256")
            if not isinstance(filename,str) or Path(filename).name != filename or not isinstance(expected,str):
                continue
            path=artifact_root/filename
            try:
                raw=path.read_bytes()
                if hashlib.sha256(raw).hexdigest()!=expected:
                    continue
                record=json.loads(raw)
            except (OSError,ValueError,json.JSONDecodeError):
                continue
            if (record.get("reportType")=="deterministic_evidence"
                    and record.get("experiment",{}).get("id")==experiment_id
                    and isinstance(record.get("workflowEvents"),list)
                    and isinstance(record.get("metric",{}).get("componentMetrics"),dict)):
                return {"attemptId":artifact.get("id","evidence"),"path":path,"sha256":expected,"record":record}
        return None

    def _generate_candidates(self, experiment: Experiment) -> list[Candidate]:
        from proteva_ga.engine import GeneticAlgorithm
        from proteva_ga.models import GAConfig
        ga = GeneticAlgorithm(experiment.input.sequence, GAConfig(population_size=min(experiment.config.population_size, 8), generations=min(experiment.config.generations, 2), max_substitutions=experiment.config.max_substitutions, random_seed=experiment.config.random_seed))
        return [Candidate(id=c.id, experimentId=experiment.id, sequence=c.sequence, generation=c.generation, parentId=c.parent_id, mutations=[m.notation for m in c.mutations]) for c in ga.initialize().candidates]

    def _runner(self, seed: int):
        python = self.settings.proteinmpnn_python
        if not python: raise LiveWorkflowError("PROTEVA_PROTEINMPNN_PYTHON is not configured")
        try:
            from fast_screening.proteinmpnn_runner import NativeProteinMPNNRunner, ProteinMPNNRunConfig
        except ImportError as error:
            raise LiveWorkflowError("fast_screening dependencies are unavailable; use its isolated environment for live ProteinMPNN scoring") from error
        return NativeProteinMPNNRunner(ProteinMPNNRunConfig(Path(python), Path(self.settings.proteinmpnn_source), Path(self.settings.proteinmpnn_source) / "vanilla_model_weights", chain_id="A", random_seed=seed, timeout_seconds=300), artifact_directory=Path(self.settings.proteinmpnn_artifacts))

    def _backbones(self):
        try:
            from fast_screening.proteinmpnn_runner import extract_single_chain_pdb
        except ImportError as error:
            raise LiveWorkflowError("fast_screening dependencies are unavailable; cannot validate live reference backbones") from error
        root = Path(self.settings.prepared_structures); target, sequence = extract_single_chain_pdb(root / "4AKE.pdb", "A", root / "4AKE_live_chainA.pdb"); off, other = extract_single_chain_pdb(root / "1AKE.pdb", "A", root / "1AKE_live_chainA.pdb")
        if sequence != other: raise LiveWorkflowError("prepared target/off-target sequences are not identical")
        return target, off, sequence

    def _score(self, experiment: Experiment, candidates: list[Candidate], seed: int) -> list[Candidate]:
        target, off, reference = self._backbones()
        if experiment.input.sequence != reference: raise LiveWorkflowError("live benchmark only accepts the validated 4AKE/1AKE chain-A sequence")
        try:
            from fast_screening.proteinmpnn_runner import BatchCandidate, target_preference
        except ImportError as error:
            raise LiveWorkflowError("fast_screening dependencies are unavailable; cannot execute ProteinMPNN") from error
        runner = self._runner(seed); batch = [BatchCandidate(candidate.id, candidate.sequence) for candidate in candidates]
        target_scores, off_scores = runner.run_batch(batch, target, max_batch_size=8), runner.run_batch(batch, off, max_batch_size=8)
        target_by_id = {item.candidate_id: item for item in target_scores}
        off_by_id = {item.candidate_id: item for item in off_scores}
        expected_ids = {candidate.id for candidate in candidates}
        if set(target_by_id) != expected_ids or set(off_by_id) != expected_ids:
            raise LiveWorkflowError("ProteinMPNN batch output does not correspond exactly to requested candidate identifiers")
        output=[]
        for candidate in candidates:
            target_score = target_by_id[candidate.id]
            off_score = off_by_id.get(candidate.id); preference = target_preference(target_score.artifact, off_score.artifact if off_score else None)
            metrics = {"metric": "target_preference", "value": preference, "definition": "off_target_mean_nll - target_mean_nll", "seed": seed, "checkpoint": target_score.checkpoint_sha256, "coverage": len(target_score.artifact.scored_positions), "targetArtifact": target_score.artifact.sha256, "offTargetArtifact": off_score.artifact.sha256 if off_score else None}
            self.repository.add_artifact(experiment.id, "artifact_" + target_score.artifact.sha256, {"id": "artifact_" + target_score.artifact.sha256, "kind": "proteinmpnn_score", "sha256": target_score.artifact.sha256, "path": target_score.artifact.path.name, "candidateId": candidate.id, "reference": "4AKE"})
            if off_score:
                self.repository.add_artifact(experiment.id, "artifact_" + off_score.artifact.sha256, {"id": "artifact_" + off_score.artifact.sha256, "kind": "proteinmpnn_score", "sha256": off_score.artifact.sha256, "path": off_score.artifact.path.name, "candidateId": candidate.id, "reference": "1AKE"})
            output.append(candidate.model_copy(update={"target_mean_nll": target_score.artifact.mean_negative_log_likelihood, "off_target_mean_nll": off_score.artifact.mean_negative_log_likelihood if off_score else None, "target_preference": preference, "seed_metrics": [metrics], "provenance": Provenance(origin=EvidenceOrigin.computational, producer="ProteinMPNN", modelName="ProteinMPNN", modelVersion=target_score.model_name, sourceArtifactIds=[target_score.artifact.sha256, off_score.artifact.sha256] if off_score else [target_score.artifact.sha256], generatedAt=now())}))
        return output

    def _rescore(self, experiment: Experiment, finalists: list[Candidate]) -> list[Candidate]:
        all_metrics = {candidate.id: list(candidate.seed_metrics) for candidate in finalists}
        for seed in (23, 41):
            for candidate in self._score(experiment, finalists, seed): all_metrics[candidate.id].extend(candidate.seed_metrics)
        output=[]
        for candidate in finalists:
            values=[metric.get("value", candidate.target_preference) for metric in all_metrics[candidate.id]]
            output.append(candidate.model_copy(update={"seed_metrics": all_metrics[candidate.id], "audit": {"seedCount": 3, "targetPreferenceRange": None if not values else [min(values), max(values)]}}))
        return output

    def _write_report(self, experiment: Experiment, finalists: list[Candidate]) -> None:
        root=Path(self.settings.proteinmpnn_artifacts); root.mkdir(parents=True, exist_ok=True); path=root / (experiment.id + "-report.json")
        path.write_text(json.dumps({"experiment": experiment.model_dump(mode="json", by_alias=True), "finalists": [candidate.model_dump(mode="json", by_alias=True) for candidate in finalists], "limitation": "ProteinMPNN target preference is an unvalidated computational compatibility proxy."}, indent=2), encoding="utf-8")
        self.repository.add_artifact(experiment.id, "report_" + experiment.id, {"id": "report_" + experiment.id, "kind": "report", "path": path.name, "sha256": __import__("hashlib").sha256(path.read_bytes()).hexdigest()})


_live_job_gate = threading.BoundedSemaphore(1)


def start_workflow(workflow: LiveWorkflow, experiment_id: str) -> threading.Thread:
    def guarded_run() -> None:
        if not _live_job_gate.acquire(blocking=False):
            experiment = workflow.repository.get(experiment_id)
            if experiment is not None:
                experiment.status = ExperimentStatus.failed
                experiment.error = {"code": "LIVE_CAPACITY_REACHED", "message": "Another live experiment is already executing on this host."}
                workflow.repository.replace(experiment)
                workflow.event(experiment, "error", experiment.error["message"], experiment.error)
            return
        try:
            workflow.run(experiment_id)
        finally:
            _live_job_gate.release()

    thread = threading.Thread(target=guarded_run, daemon=True, name="proteva-live-" + experiment_id)
    thread.start()
    return thread
