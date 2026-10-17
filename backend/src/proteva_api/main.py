from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .repository import SQLiteExperimentRepository
from .schemas import ApiError, ExecutionMode, Experiment, ExperimentCreate, ExperimentStatus
from .settings import get_settings

settings = get_settings()
repository = SQLiteExperimentRepository(settings.database_path)
app = FastAPI(title="ProtEva API", version="0.1.0")
router = APIRouter(prefix="/api/v1")


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    code = "LIVE_EXECUTION_UNAVAILABLE" if exc.status_code == 501 else "HTTP_ERROR"
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": str(exc.detail)}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "REQUEST_VALIDATION_FAILED", "message": "Request does not match the API schema."}},
    )


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
    if request.execution_mode is ExecutionMode.live:
        raise HTTPException(
            status_code=501,
            detail="Live execution is not available: no execution mechanism is configured. No experiment was created.",
        )
    now = datetime.now(timezone.utc)
    experiment = Experiment(
        id=f"exp_{uuid4().hex}",
        name=request.input.experiment_name,
        execution_mode=ExecutionMode.demo,
        status=ExperimentStatus.draft,
        created_at=now,
        input=request.input,
        target=request.target,
        config=request.config,
    )
    repository.add(experiment)
    return experiment


@router.get("/experiments", response_model=list[Experiment])
def list_experiments():
    return repository.list()


@router.get("/experiments/{experiment_id}", response_model=Experiment)
def get_experiment(experiment_id: str):
    experiment = repository.get(experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


app.include_router(router)
