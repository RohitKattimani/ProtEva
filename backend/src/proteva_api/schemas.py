from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    """Demo-mode search configuration (simulated sampling budget semantics)."""

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


class LiveSearchConfig(Schema):
    """Validated live-execution configuration.

    The live workflow scores candidates with batched ProteinMPNN runs, so the
    obsolete BioEmu-style conformational sample counts are intentionally not
    part of this schema: sending them is rejected instead of being clamped.
    """

    population_size: int = Field(alias="populationSize", ge=2, le=8)
    generations: int = Field(ge=1, le=2)
    max_substitutions: int = Field(alias="maxSubstitutions", ge=0)
    screening_seed: int = Field(default=17, alias="screeningSeed")
    finalist_rescore_seeds: list[int] = Field(default_factory=lambda: [23, 41], alias="finalistRescoreSeeds")
    max_finalists: int = Field(default=3, alias="maxFinalists", ge=1)
    candidate_evaluation_budget: int = Field(default=8, alias="candidateEvaluationBudget", ge=1, le=64)
    mutation_strategy: str = Field(alias="mutationStrategy")
    diversity_preference: int = Field(alias="diversityPreference", ge=0, le=100)
    random_seed: int = Field(alias="randomSeed")
    protected_positions: Optional[list[int]] = Field(default=None, alias="protectedPositions")
    enable_experimental_proxy_selection: bool = Field(default=False, alias="enableExperimentalProxySelection")
    acknowledge_experimental_proxy: bool = Field(default=False, alias="acknowledgeExperimentalProxy")

    @model_validator(mode="after")
    def _bounded_budgets(self) -> "LiveSearchConfig":
        if self.candidate_evaluation_budget < self.population_size:
            raise ValueError("candidateEvaluationBudget must be at least populationSize for a live run")
        if self.max_finalists > self.candidate_evaluation_budget:
            raise ValueError("maxFinalists cannot exceed candidateEvaluationBudget")
        if not self.finalist_rescore_seeds:
            raise ValueError("finalistRescoreSeeds must contain at least one seed")
        if self.screening_seed in set(self.finalist_rescore_seeds):
            raise ValueError("finalistRescoreSeeds must not repeat the screening seed")
        return self


class EffectiveSearchConfig(Schema):
    """Exactly what the execution engine ran, derived from persisted records."""

    population_size: int = Field(alias="populationSize")
    generations: int
    max_substitutions: int = Field(alias="maxSubstitutions")
    screening_seed: Optional[int] = Field(default=None, alias="screeningSeed")
    screening_seeds: list[int] = Field(default_factory=list, alias="screeningSeeds")
    finalist_rescore_seeds: list[int] = Field(default_factory=list, alias="finalistRescoreSeeds")
    max_finalists: int = Field(alias="maxFinalists")
    candidates_evaluated: int = Field(alias="candidatesEvaluated")
    candidate_evaluation_budget: int = Field(alias="candidateEvaluationBudget")
    mutation_strategy: str = Field(alias="mutationStrategy")
    random_seed: int = Field(alias="randomSeed")
    protected_positions: list[int] = Field(default_factory=list, alias="protectedPositions")
    protected_positions_source: Optional[str] = Field(default=None, alias="protectedPositionsSource")
    protected_constraint_enforced: bool = Field(default=False, alias="protectedConstraintEnforced")
    protected_constraint_violations: list[str] = Field(default_factory=list, alias="protectedConstraintViolations")
    requested_metric: str = Field(alias="requestedMetric")
    supported_metric: str = Field(alias="supportedMetric")
    metric_supported: bool = Field(alias="metricSupported")
    requested_population_size: int = Field(alias="requestedPopulationSize")
    requested_generations: int = Field(alias="requestedGenerations")
    source: str = Field(alias="source")


class ExperimentCreate(Schema):
    input: SequenceInput
    target: TargetLandscape
    config: Union[LiveSearchConfig, SearchConfig]
    execution_mode: ExecutionMode = Field(default=ExecutionMode.demo, alias="executionMode")

    @model_validator(mode="after")
    def _match_config_to_mode(self) -> "ExperimentCreate":
        if self.execution_mode is ExecutionMode.live and not isinstance(self.config, LiveSearchConfig):
            raise ValueError(
                "live experiments require the live configuration schema: populationSize 2-8, "
                "generations 1-2, screeningSeed/finalistRescoreSeeds/maxFinalists instead of "
                "screeningSamples/finalistSamples"
            )
        if self.execution_mode is ExecutionMode.demo and isinstance(self.config, LiveSearchConfig):
            raise ValueError("demo experiments require the demo configuration schema with screeningSamples/finalistSamples")
        return self


class Experiment(Schema):
    id: str
    name: str
    execution_mode: ExecutionMode = Field(alias="executionMode")
    status: ExperimentStatus
    created_at: datetime = Field(alias="createdAt")
    input: SequenceInput
    target: TargetLandscape
    config: Union[LiveSearchConfig, SearchConfig]
    effective_config: Optional[EffectiveSearchConfig] = Field(default=None, alias="effectiveConfig")
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
