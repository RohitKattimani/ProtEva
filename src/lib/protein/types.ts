// Typed domain models for ProtEva. All values flowing through the UI use these.

export type ExperimentStatus =
  | "queued"
  | "validating"
  | "sampling"
  | "evaluating"
  | "auditing"
  | "completed"
  | "failed"
  | "cancelled";

export type EvaluationStatus = "pending" | "screening" | "evaluated" | "rejected";
export type AuditStatus = "unreviewed" | "flagged" | "confirmed";

export interface SequenceInput {
  experimentName: string;
  sequence: string;
  referencePdbName?: string;
}

export interface TargetLandscape {
  objectiveText: string;
  targetStateDescription: string;
  undesiredStateDescription?: string;
  structuralMetric: "rmsd" | "radius_of_gyration" | "pocket_volume" | "helix_content" | "contact_distance";
  thresholdAngstrom: number;
  residueRegion: string;
  preservationConstraints: string;
}

export interface SearchConfig {
  populationSize: number;
  generations: number;
  maxSubstitutions: number;
  screeningSamples: number;
  finalistSamples: number;
  mutationStrategy: "conservative" | "balanced" | "exploratory";
  diversityPreference: number; // 0-100
  randomSeed: number;
}

export interface GenerationStat {
  generation: number;
  bestScore: number;
  averageScore: number;
  diversity: number;
}

export interface StructuralMetrics {
  targetOccupancy: number; // 0-1, illustrative
  offTargetOccupancy: number;
  rmsdAngstrom: number;
  radiusOfGyration: number;
  sampleCount: number;
  uncertainty: number; // +/- on occupancy
}

export interface Candidate {
  id: string;
  experimentId: string;
  parentId: string | null;
  generation: number;
  mutations: string[]; // e.g. ["A42V", "T88S"]
  sequence: string;
  objectiveScore: number | null;
  evaluationStatus: EvaluationStatus;
  auditStatus: AuditStatus;
  diversityScore: number;
  metrics: StructuralMetrics | null;
  warnings: string[];
}

export type AgentId =
  | "landscape-interpreter"
  | "search-strategist"
  | "evolution-coordinator"
  | "ensemble-analysis-worker"
  | "scientific-auditor"
  | "report-agent";

export type AgentStatus = "idle" | "working" | "waiting" | "blocked" | "done";

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  tools: string[];
  status: AgentStatus;
  currentTask: string;
  lastActivity: string;
}

export type AgentEventKind =
  | "delegation"
  | "tool_call"
  | "result"
  | "validation_warning"
  | "decision"
  | "message";

export interface AgentEvent {
  id: string;
  experimentId: string;
  timestamp: string;
  from: AgentId;
  to: AgentId | "system" | "user";
  kind: AgentEventKind;
  summary: string;
  detail?: string;
  payload?: Record<string, string | number>;
}

export interface Experiment {
  id: string;
  name: string;
  status: ExperimentStatus;
  createdAt: string;
  sequence: string;
  input: SequenceInput;
  target: TargetLandscape;
  config: SearchConfig;
  currentGeneration: number;
  candidateCount: number;
  requiresReview: number;
  generationStats: GenerationStat[];
  warnings: string[];
  simulated: true;
}

export type ArtifactKind =
  | "input_fasta"
  | "reference_pdb"
  | "candidate_fasta"
  | "sampled_structures"
  | "metric_table"
  | "config"
  | "event_log"
  | "report";

export interface Artifact {
  id: string;
  experimentId: string;
  kind: ArtifactKind;
  name: string;
  sizeLabel: string;
  createdAt: string;
  downloadable: boolean;
  note?: string;
}

export interface CandidateQuery {
  experimentId?: string;
  generation?: number;
  maxMutations?: number;
  evaluationStatus?: EvaluationStatus;
  search?: string;
}

export interface ProtEvaApi {
  createExperiment(draft: {
    input: SequenceInput;
    target: TargetLandscape;
    config: SearchConfig;
  }): Promise<Experiment>;
  listExperiments(): Promise<Experiment[]>;
  getExperiment(id: string): Promise<Experiment>;
  getExperimentEvents(id: string): Promise<AgentEvent[]>;
  getCandidates(query?: CandidateQuery): Promise<Candidate[]>;
  getCandidate(id: string): Promise<Candidate>;
  getArtifacts(experimentId: string): Promise<Artifact[]>;
  cancelExperiment(id: string): Promise<Experiment>;
  exportExperiment(id: string, format: "markdown" | "json"): Promise<string>;
}
