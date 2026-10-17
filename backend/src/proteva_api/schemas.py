from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ExecutionMode(str, Enum):
    demo = "demo"
    live = "live"


class EvidenceOrigin(str, Enum):
    demo_simulated = "demo_simulated"
    computational = "computational"
    experimental = "experimental"
    human_review = "human_review"


class ExperimentStatus(str, Enum):
    draft = "draft"
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Provenance(Schema):
    origin: EvidenceOrigin
    producer: str
    producer_version: Optional[str] = Field(default=None, alias="producerVersion")
    model_name: Optional[str] = Field(default=None, alias="modelName")
    model_version: Optional[str] = Field(default=None, alias="modelVersion")
    configuration_hash: Optional[str] = Field(default=None, alias="configurationHash")
    source_artifact_ids: list[str] = Field(default_factory=list, alias="sourceArtifactIds")
    generated_at: datetime = Field(alias="generatedAt")


class SequenceInput(Schema):
    experiment_name: str = Field(alias="experimentName", min_length=1)
    sequence: str = Field(min_length=1)
    reference_pdb_name: Optional[str] = Field(default=None, alias="referencePdbName")


class TargetLandscape(Schema):
    objective_text: str = Field(alias="objectiveText")
    target_state_description: str = Field(alias="targetStateDescription")
    undesired_state_description: Optional[str] = Field(default=None, alias="undesiredStateDescription")
    structural_metric: str = Field(alias="structuralMetric")
    threshold_angstrom: Optional[float] = Field(default=None, alias="thresholdAngstrom")
    residue_region: str = Field(alias="residueRegion")
    preservation_constraints: str = Field(alias="preservationConstraints")


class SearchConfig(Schema):
    population_size: int = Field(alias="populationSize", gt=0)
    generations: int = Field(gt=0)
    max_substitutions: int = Field(alias="maxSubstitutions", ge=0)
    screening_samples: int = Field(alias="screeningSamples", gt=0)
    finalist_samples: int = Field(alias="finalistSamples", gt=0)
    mutation_strategy: str = Field(alias="mutationStrategy")
    diversity_preference: int = Field(alias="diversityPreference", ge=0, le=100)
    random_seed: int = Field(alias="randomSeed")


class ExperimentCreate(Schema):
    input: SequenceInput
    target: TargetLandscape
    config: SearchConfig
    execution_mode: ExecutionMode = Field(default=ExecutionMode.demo, alias="executionMode")


class Experiment(Schema):
    id: str
    name: str
    execution_mode: ExecutionMode = Field(alias="executionMode")
    status: ExperimentStatus
    created_at: datetime = Field(alias="createdAt")
    input: SequenceInput
    target: TargetLandscape
    config: SearchConfig
    current_generation: Optional[int] = Field(default=None, alias="currentGeneration")
    candidate_count: Optional[int] = Field(default=None, alias="candidateCount")
    requires_review: Optional[int] = Field(default=None, alias="requiresReview")
    generation_stats: Optional[list[dict[str, Any]]] = Field(default=None, alias="generationStats")
    warnings: list[str] = Field(default_factory=list)
    provenance: Optional[Provenance] = None


class CandidateMetrics(Schema):
    target_occupancy: Optional[float] = Field(default=None, alias="targetOccupancy")
    off_target_occupancy: Optional[float] = Field(default=None, alias="offTargetOccupancy")
    rmsd_angstrom: Optional[float] = Field(default=None, alias="rmsdAngstrom")
    radius_of_gyration: Optional[float] = Field(default=None, alias="radiusOfGyration")
    sample_count: Optional[int] = Field(default=None, alias="sampleCount")
    uncertainty: Optional[float] = None


class Candidate(Schema):
    id: str
    experiment_id: str = Field(alias="experimentId")
    sequence: str
    objective_score: Optional[float] = Field(default=None, alias="objectiveScore")
    metrics: Optional[CandidateMetrics] = None
    provenance: Optional[Provenance] = None


class AgentEvent(Schema):
    id: str
    experiment_id: str = Field(alias="experimentId")
    timestamp: datetime
    kind: str
    summary: str
    payload: Optional[dict[str, Any]] = None
    provenance: Optional[Provenance] = None


class ApiError(Schema):
    code: str
    message: str
