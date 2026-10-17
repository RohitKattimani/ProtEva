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
    completed_with_warnings = "completed_with_warnings"
    failed = "failed"
    cancelled = "cancelled"


class ReportingStatus(str, Enum):
    not_requested = "not_requested"
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


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
    enable_experimental_proxy_selection: bool = Field(default=False, alias="enableExperimentalProxySelection")
    acknowledge_experimental_proxy: bool = Field(default=False, alias="acknowledgeExperimentalProxy")


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
    error: Optional[dict[str, Any]] = None
    reporting_status: ReportingStatus = Field(default=ReportingStatus.not_requested, alias="reportingStatus")
    reporting_error: Optional[dict[str, Any]] = Field(default=None, alias="reportingError")


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
    generation: int = 0
    parent_id: Optional[str] = Field(default=None, alias="parentId")
    mutations: list[str] = Field(default_factory=list)
    target_mean_nll: Optional[float] = Field(default=None, alias="targetMeanNll")
    off_target_mean_nll: Optional[float] = Field(default=None, alias="offTargetMeanNll")
    target_preference: Optional[float] = Field(default=None, alias="targetPreference")
    seed_metrics: list[dict[str, Any]] = Field(default_factory=list, alias="seedMetrics")
    audit: Optional[dict[str, Any]] = None


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


class ProcurementProductType(str, Enum):
    catalog_protein = "catalog_protein"
    custom_protein = "custom_protein"
    synthetic_peptide = "synthetic_peptide"
    gene_synthesis = "gene_synthesis"
    best_available = "best_available"


class ProcurementSpecification(Schema):
    product_type: ProcurementProductType = Field(alias="productType")
    quantity: Optional[str] = None
    purity: Optional[str] = None
    expression_system: Optional[str] = Field(default=None, alias="expressionSystem")
    construct: Optional[str] = None
    tag: Optional[str] = None
    modification: Optional[str] = None
    formulation: Optional[str] = None
    destination_region: Optional[str] = Field(default=None, alias="destinationRegion")
    budget_limit: Optional[str] = Field(default=None, alias="budgetLimit")
    delivery_timeframe: Optional[str] = Field(default=None, alias="deliveryTimeframe")
    consent_to_share_sequence: bool = Field(default=False, alias="consentToShareSequence")


class ProcurementRequestCreate(Schema):
    experiment_id: str = Field(alias="experimentId")
    candidate_id: str = Field(alias="candidateId")
    specification: ProcurementSpecification


class ProcurementMatchType(str, Enum):
    exact_sequence = "exact_sequence"
    exact_catalog_identity = "exact_catalog_identity"
    similar_homolog = "similar_homolog"
    custom_service = "custom_service"
    no_verified_match = "no_verified_match"


class SupplierOption(Schema):
    supplier: str
    product_name: str = Field(alias="productName")
    sku: Optional[str] = None
    category: str
    official_url: Optional[str] = Field(default=None, alias="officialUrl")
    specifications: dict[str, Any] = Field(default_factory=dict)
    availability: Optional[str] = None
    quantity_options: Optional[list[str]] = Field(default=None, alias="quantityOptions")
    price: Optional[float] = None
    currency: Optional[str] = None
    quote_valid_until: Optional[str] = Field(default=None, alias="quoteValidUntil")
    estimated_delivery: Optional[str] = Field(default=None, alias="estimatedDelivery")
    required_account: Optional[str] = Field(default=None, alias="requiredAccount")
    match_type: ProcurementMatchType = Field(alias="matchType")
    sequence_identity: Optional[float] = Field(default=None, alias="sequenceIdentity")
    coverage: Optional[float] = None
    match_evidence: list[str] = Field(default_factory=list, alias="matchEvidence")
    data_source: str = Field(alias="dataSource")
    retrieved_at: datetime = Field(alias="retrievedAt")
    simulated: bool = False


class ProcurementRequest(Schema):
    id: str
    experiment_id: str = Field(alias="experimentId")
    candidate_id: str = Field(alias="candidateId")
    sequence_sha256: str = Field(alias="sequenceSha256")
    specification: ProcurementSpecification
    status: str = "created"
    options: list[SupplierOption] = Field(default_factory=list)
    selected_option_id: Optional[str] = Field(default=None, alias="selectedOptionId")
    cart_payload: Optional[dict[str, Any]] = Field(default=None, alias="cartPayload")
    approval_hash: Optional[str] = Field(default=None, alias="approvalHash")
    provider_response: Optional[dict[str, Any]] = Field(default=None, alias="providerResponse")
    error: Optional[dict[str, Any]] = None
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
