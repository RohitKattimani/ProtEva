import type { AgentId, ExperimentStatus } from "./types";

export const STATUS_LABEL: Record<ExperimentStatus, string> = {
  queued: "Queued",
  validating: "Validating",
  sampling: "Sampling",
  evaluating: "Evaluating",
  auditing: "Auditing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const STATUS_PIPELINE: ExperimentStatus[] = [
  "queued",
  "validating",
  "sampling",
  "evaluating",
  "auditing",
  "completed",
];

export function statusTone(status: ExperimentStatus) {
  if (status === "completed") return "text-success border-success/40 bg-success/10";
  if (status === "failed") return "text-destructive border-destructive/40 bg-destructive/10";
  if (status === "cancelled") return "text-muted-foreground border-border bg-muted";
  return "text-accent border-accent/40 bg-accent/10";
}

export const AGENT_LABEL: Record<AgentId, string> = {
  "landscape-interpreter": "Landscape Interpreter",
  "search-strategist": "Search Strategist",
  "evolution-coordinator": "Evolution Coordinator",
  "ensemble-analysis-worker": "Ensemble Analysis Worker",
  "scientific-auditor": "Scientific Auditor",
  "report-agent": "Report Agent",
};

export function actorLabel(actor: AgentId | "system" | "user") {
  if (actor === "system") return "System";
  if (actor === "user") return "Researcher";
  return AGENT_LABEL[actor];
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
