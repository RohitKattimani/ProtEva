"""Deterministic evidence reports built only from persisted experiment records."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .repository import SQLiteExperimentRepository


class EvidenceReportBuilder:
    def __init__(self, repository: SQLiteExperimentRepository, artifact_root: Path, structure_root: Path):
        self.repository = repository
        self.artifact_root = artifact_root
        self.structure_root = structure_root

    def build(self, experiment_id: str, attempt_id: str) -> tuple[dict[str, Any], Path, str]:
        experiment = self.repository.get(experiment_id)
        if experiment is None:
            raise ValueError("Experiment not found")
        candidates = self.repository.candidates(experiment_id)
        artifacts = self.repository.artifacts(experiment_id)
        events = self.repository.events(experiment_id)
        audits = [candidate.audit for candidate in candidates if candidate.audit is not None]
        if not candidates or not audits:
            raise ValueError("Persisted candidate measurements and audit records are required before reporting")
        references=[]; reference_warnings=[]
        expected={"4AKE.pdb":"ff798ee8791878eb58bac1c6bed32042f51b455512ac93b50bda8fa0ff0e7f78","1AKE.pdb":"651e952f55f1317f50f4e82b7f0e99053397032cd8da5b2896f79d0af9f619a9"}
        for filename,expected_sha in expected.items():
            path=self.structure_root/filename
            if path.is_file():
                digest=hashlib.sha256(path.read_bytes()).hexdigest()
                references.append({"identifier":filename[:4],"chain":"A","sourceUrl":"https://files.rcsb.org/download/"+filename,"sha256":digest,"expectedSha256":expected_sha,"checksumValid":digest==expected_sha})
                if digest!=expected_sha: reference_warnings.append(filename+" checksum does not match the reviewed benchmark manifest")
            else:
                references.append({"identifier":filename[:4],"chain":"A","sourceUrl":"https://files.rcsb.org/download/"+filename,"sha256":None,"expectedSha256":expected_sha,"checksumValid":False})
                reference_warnings.append(filename+" is missing from prepared reference storage")
        record = {
            "reportType": "deterministic_evidence",
            "experiment": experiment.model_dump(mode="json", by_alias=True),
            "metric": {
                "name": "target_preference",
                "formula": "off_target_mean_nll - target_mean_nll",
                "higherIsBetter": True,
                "componentMetrics": {
                    "targetMeanNll": "mean_negative_log_likelihood on the target backbone; lower is better",
                    "offTargetMeanNll": "mean_negative_log_likelihood on the off-target backbone; lower is better",
                },
                "meaning": "ProteinMPNN model-based backbone-compatibility proxy",
                "limitations": [
                    "Does not establish conformational occupancy, free energy, stability, affinity, biological function, or biological fitness.",
                    "Missing values remain null; no substitute score is calculated.",
                ],
            },
            "candidates": [candidate.model_dump(mode="json", by_alias=True) for candidate in candidates],
            "inputProvenance": {"sequenceLength":len(experiment.input.sequence),"sequenceSha256":hashlib.sha256(experiment.input.sequence.encode("ascii")).hexdigest()},
            "references": references,
            "artifacts": artifacts,
            "workflowEvents": [self._event_evidence(event) for event in events],
            "auditWarnings": audits,
            "validationWarnings": reference_warnings,
        }
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        path = self.artifact_root / f"{experiment_id}-{attempt_id}-evidence.json"
        path.write_text(json.dumps(record, indent=2, sort_keys=True), encoding="utf-8")
        return record, path, hashlib.sha256(path.read_bytes()).hexdigest()

    @staticmethod
    def _event_evidence(event: Any) -> dict[str, Any]:
        payload = event.payload or {}
        allowed_payload = ("role", "tool", "providerAttempts", "seed", "count", "status", "metric", "candidate_ids", "attemptId", "sha256")
        return {
            "id": event.id,
            "timestamp": event.timestamp.isoformat(),
            "kind": event.kind,
            "summary": event.summary,
            "payload": {key: payload[key] for key in allowed_payload if key in payload},
            "modelName": event.provenance.model_name if event.provenance else None,
        }

    @staticmethod
    def narrative_context(record: dict[str, Any]) -> dict[str, Any]:
        candidates = []
        for item in record["candidates"]:
            candidates.append({
                "id": item["id"], "mutations": item["mutations"],
                "targetMeanNll": item.get("targetMeanNll"),
                "offTargetMeanNll": item.get("offTargetMeanNll"),
                "targetPreference": item.get("targetPreference"),
                "seedMetrics": item.get("seedMetrics", []),
                "audit": item.get("audit"),
            })
        return {"metric": record["metric"], "candidates": candidates, "auditWarnings": record["auditWarnings"]}
