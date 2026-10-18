from __future__ import annotations

from datetime import datetime, timezone
import ipaddress
from uuid import uuid4

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from pathlib import Path

from .procurement import ProcurementWorkflow
from .repository import SQLiteExperimentRepository
from .schemas import ApiError, ExecutionMode, Experiment, ExperimentCreate, ExperimentStatus, ProcurementRequest, ProcurementRequestCreate, ProcurementSpecification
from .settings import get_settings
from .live import LiveWorkflow, start_workflow
from .annotations import REFERENCE_IDS, REFERENCE_METADATA, load_reference, protected_motif_descriptor, reference_file
from .config_contract import apply_derived_view

settings = get_settings()
repository = SQLiteExperimentRepository(settings.database_path)
workflow = LiveWorkflow(repository, settings)
procurement = ProcurementWorkflow(repository, settings)
app = FastAPI(title="ProtEva API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.configured_cors_origins(),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["content-type", "authorization"],
)
router = APIRouter(prefix="/api/v1")


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    code = "LIVE_EXECUTION_UNAVAILABLE" if exc.status_code == 501 else "HTTP_ERROR"
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": str(exc.detail)}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    messages = []
    for error in exc.errors()[:4]:
        location = ".".join(str(part) for part in error.get("loc", ()) if part != "body")
        message = error.get("msg", "invalid value")
        messages.append(f"{location}: {message}" if location else message)
    detail = "; ".join(messages) or "Request does not match the API schema."
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "REQUEST_VALIDATION_FAILED", "message": detail}},
    )


def _present(experiment: Experiment) -> Experiment:
    """Attach derived, non-persisted live display data to an experiment response."""
    if experiment.execution_mode is not ExecutionMode.live:
        return experiment
    return apply_derived_view(experiment, repository.candidates(experiment.id), Path(settings.prepared_structures))


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/ready")
def ready():
    # Verify the configured persistence adapter can be queried.
    repository.list()
    return {"status": "ready", "persistence": "available"}


@router.post("/experiments", response_model=Experiment, status_code=201)
def create_experiment(request: ExperimentCreate):
    now = datetime.now(timezone.utc)
    experiment = Experiment(
        id=f"exp_{uuid4().hex}",
        name=request.input.experiment_name,
        execution_mode=request.execution_mode,
        status=ExperimentStatus.queued if request.execution_mode is ExecutionMode.live else ExperimentStatus.draft,
        created_at=now,
        input=request.input,
        target=request.target,
        config=request.config,
    )
    repository.add(experiment)
    if request.execution_mode is ExecutionMode.live:
        start_workflow(workflow, experiment.id)
    return _present(experiment)


@router.get("/experiments", response_model=list[Experiment])
def list_experiments():
    return [_present(experiment) for experiment in repository.list()]


@router.get("/experiments/{experiment_id}", response_model=Experiment)
def get_experiment(experiment_id: str):
    experiment = repository.get(experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return _present(experiment)


@router.get("/experiments/{experiment_id}/events", response_model=list)
def get_events(experiment_id: str):
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    return repository.events(experiment_id)


@router.get("/candidates", response_model=list)
def list_candidates():
    """List every persisted candidate across all experiments.

    The candidate library uses this for its "all experiments" scope; per-experiment
    views keep using the scoped route below. Only real persisted records are returned.
    """
    return repository.all_candidates()


@router.get("/experiments/{experiment_id}/candidates", response_model=list)
def get_candidates(experiment_id: str):
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    return repository.candidates(experiment_id)


@router.get("/experiments/{experiment_id}/candidates/{candidate_id}")
def get_candidate(experiment_id: str, candidate_id: str):
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    candidate = repository.candidate(experiment_id, candidate_id)
    if candidate is None: raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.get("/experiments/{experiment_id}/artifacts", response_model=list)
def get_artifacts(experiment_id: str):
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    return repository.artifacts(experiment_id)


@router.get("/experiments/{experiment_id}/artifacts/{artifact_id}/download")
def download_artifact(experiment_id: str, artifact_id: str):
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    artifact=next((item for item in repository.artifacts(experiment_id) if item.get("id")==artifact_id),None)
    if artifact is None: raise HTTPException(status_code=404, detail="Artifact not found")
    filename=artifact.get("path")
    if not isinstance(filename,str) or Path(filename).name != filename:
        raise HTTPException(status_code=404, detail="Artifact is not downloadable")
    path=Path(settings.proteinmpnn_artifacts)/filename
    if not path.is_file(): raise HTTPException(status_code=404, detail="Artifact file is unavailable")
    return FileResponse(path, filename=filename, media_type="application/json" if filename.endswith(".json") else "application/octet-stream")


@router.post("/experiments/{experiment_id}/cancel", response_model=Experiment)
def cancel_experiment(experiment_id: str):
    experiment = repository.get(experiment_id)
    if experiment is None: raise HTTPException(status_code=404, detail="Experiment not found")
    if experiment.status in {ExperimentStatus.completed, ExperimentStatus.completed_with_warnings, ExperimentStatus.failed, ExperimentStatus.cancelled}: raise HTTPException(status_code=409, detail="Experiment is terminal")
    experiment.status = ExperimentStatus.cancelled; repository.replace(experiment)
    workflow.event(experiment, "decision", "cancellation recorded; current subprocesses cannot be interrupted safely in this phase")
    return experiment


@router.post("/experiments/{experiment_id}/reports/evidence")
def build_evidence_report(experiment_id: str, request: Request):
    _require_local_reporting_access(request)
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    try:
        result=workflow.build_evidence_report(experiment_id)
        return {"attemptId":result["attemptId"],"sha256":result["sha256"],"report":result["record"]}
    except Exception as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


def _require_local_reporting_access(request: Request) -> None:
    if settings.env != "development":
        raise HTTPException(status_code=403, detail="Report recovery is available only in local development.")
    client_host=request.client.host if request.client else ""
    try:
        if not ipaddress.ip_address(client_host).is_loopback:
            raise HTTPException(status_code=403, detail="Report recovery is restricted to loopback clients.")
    except ValueError as error:
        raise HTTPException(status_code=403, detail="Report recovery is restricted to loopback clients.") from error


@router.post("/experiments/{experiment_id}/reports/recover", response_model=Experiment)
def recover_report(experiment_id: str, request: Request):
    _require_local_reporting_access(request)
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    try:
        workflow.recover_report(experiment_id)
    except Exception as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return _present(repository.get(experiment_id))


@router.post("/experiments/{experiment_id}/resume-after-scoring", response_model=Experiment)
def resume_after_scoring(experiment_id: str, request: Request):
    _require_local_reporting_access(request)
    if repository.get(experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    try:
        workflow.resume_after_scoring(experiment_id)
    except Exception as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return _present(repository.get(experiment_id))


@router.get("/experiments/{experiment_id}/report-attempts", response_model=list)
def report_attempts(experiment_id: str, request: Request):
    _require_local_reporting_access(request)
    if repository.get(experiment_id) is None: raise HTTPException(status_code=404, detail="Experiment not found")
    return repository.reporting_attempts(experiment_id)


@router.get("/experiments/{experiment_id}/export")
def export_experiment(experiment_id: str):
    experiment = repository.get(experiment_id)
    if experiment is None: raise HTTPException(status_code=404, detail="Experiment not found")
    return {"experiment": _present(experiment), "candidates": repository.candidates(experiment_id), "events": repository.events(experiment_id), "artifacts": repository.artifacts(experiment_id)}


@router.get("/references")
def list_references():
    """Prepared reference structures the live evaluator actually scores against."""
    references = []
    for pdb_id in REFERENCE_IDS:
        metadata = REFERENCE_METADATA[pdb_id]
        entry = {
            "pdbId": pdb_id,
            "label": metadata["label"],
            "role": metadata["role"],
            "stateDescription": metadata["stateDescription"],
            "sourceUrl": metadata["sourceUrl"],
        }
        try:
            annotation = load_reference(Path(settings.prepared_structures), pdb_id)
        except Exception as error:
            references.append({**entry, "available": False, "error": str(error), "chain": metadata["chain"]})
            continue
        references.append({
            **entry,
            "available": True,
            "chain": annotation.chain,
            "residueCount": annotation.residue_count,
            "sha256": annotation.sha256,
            "coordinatesUrl": f"/api/v1/references/{pdb_id}/coordinates",
        })
    return {"references": references, "protectedMotif": protected_motif_descriptor()}


@router.get("/references/{pdb_id}/coordinates")
def reference_coordinates(pdb_id: str):
    if pdb_id not in REFERENCE_IDS:
        raise HTTPException(status_code=404, detail="Unknown reference structure")
    path = reference_file(Path(settings.prepared_structures), pdb_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Prepared reference coordinates are unavailable")
    return FileResponse(path, filename=path.name, media_type="chemical/x-pdb")


@router.post("/experiments/{experiment_id}/procurement/requests", response_model=ProcurementRequest, status_code=201)
def create_procurement_request(experiment_id: str, request: ProcurementRequestCreate, http_request: Request):
    _require_local_reporting_access(http_request)
    if repository.get(experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if request.experiment_id != experiment_id:
        raise HTTPException(status_code=422, detail="Experiment id mismatch")
    experiment = repository.get(experiment_id)
    candidate = repository.candidate(experiment_id, request.candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    try:
        result = procurement.create_request(experiment_id, request.candidate_id, request.specification)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return result


@router.get("/experiments/{experiment_id}/procurement/requests", response_model=list[ProcurementRequest])
def list_procurement_requests(experiment_id: str, http_request: Request):
    _require_local_reporting_access(http_request)
    if repository.get(experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return procurement.repository.list_procurement_requests(experiment_id)


@router.get("/experiments/{experiment_id}/procurement/requests/{request_id}", response_model=ProcurementRequest)
def get_procurement_request(experiment_id: str, request_id: str, http_request: Request):
    _require_local_reporting_access(http_request)
    result = procurement.repository.get_procurement_request(request_id)
    if result is None or result.experiment_id != experiment_id:
        raise HTTPException(status_code=404, detail="Procurement request not found")
    return result


@router.post("/experiments/{experiment_id}/procurement/requests/{request_id}/search")
def search_procurement(request_id: str, experiment_id: str, http_request: Request):
    _require_local_reporting_access(http_request)
    try:
        result = procurement.search(request_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {
        "request": result["request"],
        "adapterStatuses": result["adapterStatuses"],
        "externalRoutes": result["externalRoutes"],
        "demo": result["demo"],
    }


@router.post("/experiments/{experiment_id}/procurement/requests/{request_id}/prepare-cart", response_model=ProcurementRequest)
def prepare_procurement_cart(experiment_id: str, request_id: str, payload: dict, http_request: Request):
    _require_local_reporting_access(http_request)
    option_id = payload.get("optionId") or payload.get("option_id")
    if not isinstance(option_id, str):
        raise HTTPException(status_code=422, detail="optionId is required")
    try:
        result = procurement.prepare_cart(request_id, option_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return result


@router.post("/experiments/{experiment_id}/procurement/requests/{request_id}/package")
def prepare_procurement_package(experiment_id: str, request_id: str, http_request: Request):
    _require_local_reporting_access(http_request)
    if repository.get(experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    existing = procurement.repository.get_procurement_request(request_id)
    if existing is None or existing.experiment_id != experiment_id:
        raise HTTPException(status_code=404, detail="Procurement request not found")
    try:
        return procurement.prepare_package(request_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/experiments/{experiment_id}/procurement/requests/{request_id}/approve", response_model=ProcurementRequest)
def approve_procurement_cart(experiment_id: str, request_id: str, payload: dict, http_request: Request):
    _require_local_reporting_access(http_request)
    approval_hash = payload.get("approvalHash") or payload.get("approval_hash")
    consent = bool(payload.get("consent", False))
    if not isinstance(approval_hash, str):
        raise HTTPException(status_code=422, detail="approvalHash is required")
    try:
        result = procurement.approve_and_add(request_id, approval_hash, consent)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return result


app.include_router(router)
