// API abstraction. MockApiClient powers demo mode; HttpApiClient targets a future
// FastAPI backend via VITE_API_BASE_URL. Failed real requests are never replaced
// with mock data — they surface as errors.
import {
  buildAgentEvents,
  buildArtifacts,
  buildCandidates,
  buildGenerationStats,
  buildSeedExperiments,
} from "./mock-data";
import type {
  AgentEvent,
  AgentId,
  Artifact,
  Candidate,
  CandidateQuery,
  Experiment,
  ExperimentSearchConfig,
  ExperimentStatus,
  ProcurementPackage,
  ProcurementRequest,
  ProcurementSpecification,
  ProtEvaApi,
  ReferenceCatalog,
  SequenceInput,
  TargetLandscape,
} from "./types";
import { isLiveSearchConfig } from "./format";

const DEMO_SEQUENCE_STAGES: ExperimentStatus[] = [
  "queued",
  "validating",
  "sampling",
  "evaluating",
  "auditing",
  "completed",
];

/** Backend role names map to the agent identities the UI renders. */
const ROLE_TO_AGENT: Record<string, AgentId> = {
  "Landscape Interpreter": "landscape-interpreter",
  "Search Strategist": "search-strategist",
  "Evolution Coordinator": "evolution-coordinator",
  "Ensemble Analysis Worker": "ensemble-analysis-worker",
  "Scientific Auditor": "scientific-auditor",
  "Report Agent": "report-agent",
  "Procurement Agent": "procurement-agent",
};

type Listener = () => void;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockApiClient implements ProtEvaApi {
  private experiments: Experiment[] = buildSeedExperiments();
  private candidates = new Map<string, Candidate[]>();
  private events = new Map<string, AgentEvent[]>();
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    for (const experiment of this.experiments) {
      this.candidates.set(
        experiment.id,
        buildCandidates(
          experiment.id,
          experiment.sequence,
          experiment.config.randomSeed,
          experiment.currentGeneration,
          experiment.config.populationSize,
        ),
      );
      this.events.set(experiment.id, buildAgentEvents(experiment.id, experiment.config.randomSeed));
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  async createExperiment(draft: {
    input: SequenceInput;
    target: TargetLandscape;
    config: ExperimentSearchConfig;
    executionMode?: "demo" | "live";
  }): Promise<Experiment> {
    await delay(220);
    const id = `EXP-${1046 + this.experiments.length - 4}`;
    const experiment: Experiment = {
      id,
      name: draft.input.experimentName || "Untitled experiment",
      status: "queued",
      createdAt: new Date().toISOString(),
      sequence: draft.input.sequence,
      input: draft.input,
      target: draft.target,
      config: draft.config,
      currentGeneration: 0,
      candidateCount: 0,
      requiresReview: 0,
      generationStats: [],
      warnings: ["Simulated run — no BioEmu sampling or Gemma execution takes place."],
      executionMode: "demo",
      simulated: true,
    };
    this.experiments = [experiment, ...this.experiments];
    this.candidates.set(id, []);
    this.events.set(id, []);
    this.emit();
    this.runDemoStateMachine(id);
    return experiment;
  }

  private runDemoStateMachine(id: string) {
    let stage = 0;
    const tick = () => {
      const experiment = this.experiments.find((e) => e.id === id);
      if (!experiment || experiment.status === "cancelled" || experiment.status === "failed")
        return;
      stage += 1;
      const status =
        DEMO_SEQUENCE_STAGES[Math.min(stage, DEMO_SEQUENCE_STAGES.length - 1)] ?? "completed";
      const generations =
        status === "completed"
          ? experiment.config.generations
          : Math.min(experiment.config.generations, stage * 3);

      const stats = buildGenerationStats(experiment.config.randomSeed, Math.max(1, generations));
      const candidates = buildCandidates(
        id,
        experiment.sequence,
        experiment.config.randomSeed,
        Math.max(1, generations),
        experiment.config.populationSize,
      );
      const allEvents = buildAgentEvents(id, experiment.config.randomSeed);
      this.candidates.set(id, candidates);
      this.events.set(
        id,
        allEvents.slice(0, Math.min(allEvents.length, stage * 2)).map((event) => ({
          ...event,
          timestamp: new Date().toISOString(),
        })),
      );
      this.experiments = this.experiments.map((e) =>
        e.id === id
          ? {
              ...e,
              status,
              currentGeneration: generations,
              candidateCount: candidates.length,
              requiresReview: candidates.filter((c) => c.auditStatus === "flagged").length,
              generationStats: stats,
            }
          : e,
      );
      this.emit();
      if (status !== "completed") {
        this.timers.set(id, setTimeout(tick, 2600));
      }
    };
    this.timers.set(id, setTimeout(tick, 1400));
  }

  async listExperiments(): Promise<Experiment[]> {
    await delay(120);
    return [...this.experiments];
  }

  async getExperiment(id: string): Promise<Experiment> {
    await delay(100);
    const experiment = this.experiments.find((e) => e.id === id);
    if (!experiment) throw new Error(`Experiment ${id} was not found.`);
    return experiment;
  }

  async getExperimentEvents(id: string): Promise<AgentEvent[]> {
    await delay(80);
    return this.events.get(id) ?? [];
  }

  async getCandidates(query: CandidateQuery = {}): Promise<Candidate[]> {
    await delay(100);
    let all: Candidate[] = query.experimentId
      ? (this.candidates.get(query.experimentId) ?? [])
      : [...this.candidates.values()].flat();

    if (query.generation != null) all = all.filter((c) => c.generation === query.generation);
    if (query.maxMutations != null)
      all = all.filter((c) => c.mutations.length <= query.maxMutations!);
    if (query.evaluationStatus)
      all = all.filter((c) => c.evaluationStatus === query.evaluationStatus);
    if (query.search) {
      const needle = query.search.toLowerCase();
      all = all.filter(
        (c) =>
          c.id.toLowerCase().includes(needle) ||
          c.mutations.join(",").toLowerCase().includes(needle),
      );
    }
    return all;
  }

  async getCandidate(id: string): Promise<Candidate> {
    await delay(60);
    const candidate = [...this.candidates.values()].flat().find((c) => c.id === id);
    if (!candidate) throw new Error(`Candidate ${id} was not found.`);
    return candidate;
  }

  async getArtifacts(experimentId: string): Promise<Artifact[]> {
    await delay(80);
    return buildArtifacts(experimentId);
  }

  async cancelExperiment(id: string): Promise<Experiment> {
    await delay(120);
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.experiments = this.experiments.map((e) =>
      e.id === id ? { ...e, status: "cancelled" as const } : e,
    );
    this.emit();
    return this.getExperiment(id);
  }

  async exportExperiment(id: string, format: "markdown" | "json"): Promise<string> {
    const experiment = await this.getExperiment(id);
    const candidates = await this.getCandidates({ experimentId: id });
    const events = await this.getExperimentEvents(id);
    const best = [...candidates]
      .filter((c) => c.objectiveScore != null)
      .sort((a, b) => (b.objectiveScore ?? 0) - (a.objectiveScore ?? 0))[0];

    if (format === "json") {
      return JSON.stringify(
        {
          disclaimer:
            "Simulated demonstration data. No BioEmu sampling, Gemma execution or scientific validation occurred.",
          userInputs: experiment.input,
          recordedSettings: { target: experiment.target, config: experiment.config },
          actualMeasurements: null,
          demonstrationValues: {
            generationStats: experiment.generationStats,
            bestCandidate: best ?? null,
            candidateCount: candidates.length,
          },
          agentInterpretations: events.map((e) => ({
            at: e.timestamp,
            from: e.from,
            to: e.to,
            kind: e.kind,
            summary: e.summary,
          })),
          limitations: [
            "Structural metrics are illustrative placeholders, not measurements.",
            "Computational predictions do not establish biological function.",
            "Rankings within the reported uncertainty are not separable.",
          ],
        },
        null,
        2,
      );
    }

    return [
      `# ProtEva report — ${experiment.name}`,
      "",
      "> **Prototype result.** No BioEmu sampling, Gemma execution or scientific validation occurred.",
      "",
      "## 1. User inputs",
      `- Experiment: ${experiment.name} (${experiment.id})`,
      `- Sequence length: ${experiment.sequence.length} residues`,
      `- Objective: ${experiment.target.objectiveText}`,
      `- Target state: ${experiment.target.targetStateDescription}`,
      "",
      "## 2. Recorded settings",
      `- Population ${experiment.config.populationSize}, generations ${experiment.config.generations}, max substitutions ${experiment.config.maxSubstitutions}`,
      isLiveSearchConfig(experiment.config)
        ? `- Screening seed ${experiment.config.screeningSeed}, finalist rescore seeds ${experiment.config.finalistRescoreSeeds.join(", ")}`
        : `- Screening samples ${experiment.config.screeningSamples}, finalist samples ${experiment.config.finalistSamples}`,
      `- Mutation strategy ${experiment.config.mutationStrategy}, seed ${experiment.config.randomSeed}`,
      "",
      "## 3. Actual measurements",
      "- None. The structural sampling worker is not connected.",
      "",
      "## 4. Demonstration-only values",
      `- Candidates generated: ${candidates.length}`,
      best
        ? `- Best illustrative candidate: ${best.id} (score ${best.objectiveScore}, mutations ${best.mutations.join(", ") || "none"})`
        : "- No scored candidates yet.",
      "",
      "## 5. Agent interpretations",
      ...events.map((e) => `- ${e.from} → ${e.to}: ${e.summary}`),
      "",
      "## 6. Scientific limitations",
      "- Computational predictions do not establish biological function.",
      "- Illustrative metrics must not be cited as experimental results.",
      "- Rankings inside the reported uncertainty are not separable.",
      "",
    ].join("\n");
  }
}

export class HttpApiClient implements ProtEvaApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw await ApiClientError.fromResponse(response, path);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiClientError({
        message: `Backend returned malformed JSON for ${path}`,
        path,
        status: response.status,
      });
    }
  }

  private experiment(raw: any): Experiment {
    return {
      ...raw,
      sequence: raw.input?.sequence ?? "",
      currentGeneration: raw.currentGeneration ?? 0,
      candidateCount: raw.candidateCount ?? 0,
      requiresReview: raw.requiresReview ?? 0,
      generationStats: raw.generationStats ?? [],
      warnings: raw.warnings ?? [],
      executionMode: raw.executionMode,
      simulated: raw.executionMode === "demo",
      effectiveConfig: raw.effectiveConfig ?? null,
    } as Experiment;
  }

  private candidate(raw: any): Candidate {
    const reviewed = raw.audit?.status === "reviewed";
    return {
      ...raw,
      parentId: raw.parentId ?? null,
      objectiveScore: raw.targetPreference ?? null,
      evaluationStatus: raw.targetPreference == null ? "pending" : "evaluated",
      auditStatus: reviewed ? "confirmed" : "unreviewed",
      // Live screening does not compute a diversity metric; null renders as "not recorded".
      diversityScore: null,
      metrics: null,
      warnings: raw.audit?.warning ? [String(raw.audit.warning)] : [],
    } as Candidate;
  }

  private event(raw: any): AgentEvent {
    return {
      ...raw,
      from: ROLE_TO_AGENT[raw.payload?.role as string] ?? "evolution-coordinator",
      to: "system",
      kind:
        raw.kind === "warning" || raw.kind === "error"
          ? "validation_warning"
          : raw.kind === "tool_request"
            ? "tool_call"
            : raw.kind === "decision" || raw.kind === "coordinator_decision"
              ? "decision"
              : raw.kind === "agent_task"
                ? "delegation"
                : "result",
      detail: raw.payload ? JSON.stringify(raw.payload) : undefined,
    } as AgentEvent;
  }

  async createExperiment(draft: {
    input: SequenceInput;
    target: TargetLandscape;
    config: ExperimentSearchConfig;
    executionMode?: "demo" | "live";
  }) {
    const raw = await this.request<unknown>("/experiments", {
      method: "POST",
      body: JSON.stringify({ ...draft, executionMode: draft.executionMode ?? "demo" }),
    });
    return this.experiment(raw);
  }
  async listExperiments() {
    return (await this.request<any[]>("/experiments")).map((item) => this.experiment(item));
  }
  async getExperiment(id: string) {
    return this.experiment(await this.request<any>(`/experiments/${encodeURIComponent(id)}`));
  }
  async getExperimentEvents(id: string) {
    return (await this.request<any[]>(`/experiments/${encodeURIComponent(id)}/events`)).map(
      (item) => this.event(item),
    );
  }
  async getCandidates(query: CandidateQuery = {}) {
    const path = query.experimentId
      ? `/experiments/${encodeURIComponent(query.experimentId)}/candidates`
      : "/candidates";
    const candidates = (await this.request<any[]>(path)).map((item) => this.candidate(item));
    return candidates.filter(
      (item) =>
        (query.generation == null || item.generation === query.generation) &&
        (query.maxMutations == null || item.mutations.length <= query.maxMutations) &&
        (!query.search ||
          item.id.includes(query.search) ||
          item.mutations.join(",").includes(query.search)),
    );
  }
  async getCandidate(id: string): Promise<Candidate> {
    throw new ApiClientError({
      message: "Live candidate detail requires its experiment context.",
      path: `/candidates/${encodeURIComponent(id)}`,
      status: 400,
    });
  }
  async getArtifacts(experimentId: string) {
    const raw = await this.request<any[]>(
      `/experiments/${encodeURIComponent(experimentId)}/artifacts`,
    );
    return raw.map(
      (item) =>
        ({
          id: item.id,
          experimentId,
          kind: item.kind ?? "report",
          name: item.path ?? item.id,
          sizeLabel: item.sha256 ? `SHA-256 ${String(item.sha256).slice(0, 12)}…` : "—",
          createdAt: "",
          downloadable: Boolean(item.path),
          note: item.sha256 ? `Checksum ${item.sha256}` : undefined,
        }) as Artifact,
    );
  }
  async cancelExperiment(id: string) {
    return this.experiment(
      await this.request<any>(`/experiments/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
      }),
    );
  }
  async exportExperiment(id: string, format: "markdown" | "json") {
    return JSON.stringify(
      await this.request(`/experiments/${encodeURIComponent(id)}/export`),
      null,
      2,
    );
  }
  async recoverReport(id: string) {
    return this.experiment(
      await this.request<any>(`/experiments/${encodeURIComponent(id)}/reports/recover`, {
        method: "POST",
      }),
    );
  }
  async resumeAfterScoring(id: string) {
    return this.experiment(
      await this.request<any>(`/experiments/${encodeURIComponent(id)}/resume-after-scoring`, {
        method: "POST",
      }),
    );
  }
  async createProcurementRequest(input: {
    experimentId: string;
    candidateId: string;
    specification: ProcurementSpecification;
  }) {
    const raw = await this.request<any>(
      `/experiments/${encodeURIComponent(input.experimentId)}/procurement/requests`,
      {
        method: "POST",
        body: JSON.stringify({
          experimentId: input.experimentId,
          candidateId: input.candidateId,
          specification: input.specification,
        }),
      },
    );
    return raw as ProcurementRequest;
  }
  async listProcurementRequests(experimentId: string) {
    return await this.request<any[]>(
      `/experiments/${encodeURIComponent(experimentId)}/procurement/requests`,
    );
  }
  async getProcurementRequest(experimentId: string, requestId: string) {
    return await this.request<any>(
      `/experiments/${encodeURIComponent(experimentId)}/procurement/requests/${encodeURIComponent(requestId)}`,
    );
  }
  async searchProcurement(experimentId: string, requestId: string) {
    return await this.request<any>(
      `/experiments/${encodeURIComponent(experimentId)}/procurement/requests/${encodeURIComponent(requestId)}/search`,
      { method: "POST" },
    );
  }
  async prepareProcurementCart(experimentId: string, requestId: string, optionId: string) {
    return await this.request<any>(
      `/experiments/${encodeURIComponent(experimentId)}/procurement/requests/${encodeURIComponent(requestId)}/prepare-cart`,
      { method: "POST", body: JSON.stringify({ optionId }) },
    );
  }
  async approveProcurementCart(
    experimentId: string,
    requestId: string,
    approvalHash: string,
    consent: boolean,
  ) {
    return await this.request<any>(
      `/experiments/${encodeURIComponent(experimentId)}/procurement/requests/${encodeURIComponent(requestId)}/approve`,
      { method: "POST", body: JSON.stringify({ approvalHash, consent }) },
    );
  }
  async downloadArtifact(experimentId: string, artifactId: string) {
    const path = `/experiments/${encodeURIComponent(experimentId)}/artifacts/${encodeURIComponent(artifactId)}/download`;
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw await ApiClientError.fromResponse(response, path);
    return response.blob();
  }
  async getReferences() {
    return (await this.request<ReferenceCatalog>("/references")) as ReferenceCatalog;
  }
  async getReferenceCoordinates(pdbId: string) {
    const path = `/references/${encodeURIComponent(pdbId)}/coordinates`;
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw await ApiClientError.fromResponse(response, path);
    return response.text();
  }
  async prepareProcurementPackage(experimentId: string, requestId: string) {
    return (await this.request<ProcurementPackage>(
      `/experiments/${encodeURIComponent(experimentId)}/procurement/requests/${encodeURIComponent(requestId)}/package`,
      { method: "POST" },
    )) as ProcurementPackage;
  }
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly path: string;

  constructor({
    message,
    path,
    status,
    code,
  }: {
    message: string;
    path: string;
    status: number;
    code?: string | undefined;
  }) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.path = path;
  }

  static async fromResponse(response: Response, path: string): Promise<ApiClientError> {
    let code: string | undefined;
    let message = `Backend request failed (${response.status}) for ${path}`;
    try {
      const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } };
      if (typeof body.error?.code === "string") code = body.error.code;
      if (typeof body.error?.message === "string") message = body.error.message;
    } catch {
      // Preserve status and endpoint details when an error response is not JSON.
    }
    return new ApiClientError({ message, path, status: response.status, code });
  }
}

export function normalizeApiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("VITE_API_BASE_URL must be a non-empty HTTP(S) URL.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("VITE_API_BASE_URL must be an absolute HTTP(S) URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("VITE_API_BASE_URL must use HTTP or HTTPS.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("VITE_API_BASE_URL must not include a query string or fragment.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function createApiClient(baseUrl: string | undefined): ProtEvaApi {
  return baseUrl?.trim() ? new HttpApiClient(baseUrl) : mockClient;
}

const baseUrl = import.meta.env["VITE_API_BASE_URL"] as string | undefined;

export const mockClient = new MockApiClient();
export const isDemoMode = !baseUrl?.trim();
export const api: ProtEvaApi = createApiClient(baseUrl);
