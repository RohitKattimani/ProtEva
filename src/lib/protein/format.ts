import type {
  AgentId,
  Experiment,
  ExperimentSearchConfig,
  ExperimentStatus,
  LiveSearchConfig,
} from "./types";

export const STATUS_LABEL: Record<ExperimentStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  running: "Running",
  validating: "Validating",
  sampling: "Screening",
  evaluating: "Evaluating",
  auditing: "Auditing",
  completed: "Completed",
  completed_with_warnings: "Completed with warnings",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** The demo state machine's stage sequence. Live runs report real events instead. */
export const STATUS_PIPELINE: ExperimentStatus[] = [
  "queued",
  "validating",
  "sampling",
  "evaluating",
  "auditing",
  "completed",
];

/** Live runs have three honest terminal-aware states: queued, running, terminal. */
export const LIVE_PIPELINE: ExperimentStatus[] = ["queued", "running", "completed"];

const TERMINAL_STATUSES: ExperimentStatus[] = [
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
];

export function isTerminalStatus(status: ExperimentStatus) {
  return TERMINAL_STATUSES.includes(status);
}

export function statusTone(status: ExperimentStatus) {
  if (status === "completed") return "text-success border-success/40 bg-success/10";
  if (status === "completed_with_warnings") return "text-warning border-warning/40 bg-warning/10";
  if (status === "failed") return "text-destructive border-destructive/40 bg-destructive/10";
  if (status === "cancelled" || status === "draft")
    return "text-muted-foreground border-border bg-muted";
  return "text-accent border-accent/40 bg-accent/10";
}

export const AGENT_LABEL: Record<AgentId, string> = {
  "landscape-interpreter": "Landscape Interpreter",
  "search-strategist": "Search Strategist",
  "evolution-coordinator": "Evolution Coordinator",
  "ensemble-analysis-worker": "Ensemble Analysis Worker",
  "scientific-auditor": "Scientific Auditor",
  "report-agent": "Report Agent",
  "procurement-agent": "Procurement Agent",
};

export function actorLabel(actor: AgentId | "system" | "user") {
  if (actor === "system") return "System";
  if (actor === "user") return "Researcher";
  return AGENT_LABEL[actor] ?? actor;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" });
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function toFasta(header: string, sequence: string) {
  const lines = sequence.match(/.{1,60}/g) ?? [];
  return `>${header}\n${lines.join("\n")}\n`;
}

export function isLiveSearchConfig(config: ExperimentSearchConfig): config is LiveSearchConfig {
  return !("screeningSamples" in config);
}

export function experimentProgressLabel(experiment: Experiment) {
  if (experiment.executionMode === "live") {
    const effective = experiment.effectiveConfig;
    if (experiment.status === "completed" || experiment.status === "completed_with_warnings") {
      const evaluated = effective?.candidatesEvaluated ?? experiment.candidateCount;
      return `Candidate screening complete · ${evaluated} evaluated`;
    }
    if (experiment.candidateCount > 0) {
      return `Candidate screening · ${experiment.candidateCount} recorded`;
    }
    if (experiment.status === "running") return "Resolving live execution configuration";
    if (experiment.status === "queued") return "Queued for the live Gemma coordinator";
    return STATUS_LABEL[experiment.status];
  }
  return `Generation ${experiment.currentGeneration} / ${experiment.config.generations}`;
}

export function candidateLabel(candidate: { id: string; generation: number; mutations: string[] }) {
  const match = /^cand-g(\d+)-(\d+)$/.exec(candidate.id);
  const ordinal = match ? Number(match[2]) + 1 : undefined;
  const mutation = candidate.mutations.length ? candidate.mutations.join(", ") : "seed sequence";
  return ordinal == null
    ? `${candidate.id} · ${mutation}`
    : `Candidate G${candidate.generation} #${ordinal} · ${mutation}`;
}
