import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  Microscope,
  Package,
  Radar,
  ScrollText,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import { Pill } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AGENT_LABEL, actorLabel, formatTime } from "@/lib/protein/format";
import { AGENTS } from "@/lib/protein/mock-data";
import { cn } from "@/lib/utils";
import type { Agent, AgentEvent, AgentEventKind, AgentId } from "@/lib/protein/types";

const AGENT_ICON: Record<AgentId, typeof Bot> = {
  "landscape-interpreter": Radar,
  "search-strategist": GitBranch,
  "evolution-coordinator": Bot,
  "ensemble-analysis-worker": Microscope,
  "scientific-auditor": ClipboardCheck,
  "report-agent": ScrollText,
  "procurement-agent": Package,
};

/** Build a truthful roster from the agents that actually appear in recorded events. */
function agentsFromEvents(events: AgentEvent[]): Agent[] {
  const order: AgentId[] = [];
  const byId = new Map<AgentId, AgentEvent[]>();
  for (const event of events) {
    for (const actor of [event.from, event.to]) {
      if (actor === "system" || actor === "user") continue;
      const id = actor as AgentId;
      if (!byId.has(id)) {
        byId.set(id, []);
        order.push(id);
      }
      byId.get(id)!.push(event);
    }
  }
  return order.map((id) => {
    const related = byId.get(id)!;
    const last = related[related.length - 1]!;
    const template = AGENTS.find((agent) => agent.id === id);
    const status: Agent["status"] =
      last.kind === "validation_warning"
        ? "blocked"
        : last.kind === "tool_call" || last.kind === "delegation"
          ? "working"
          : "done";
    return {
      id,
      name: template?.name ?? AGENT_LABEL[id],
      role: template?.role ?? "Recorded participant",
      description: template?.description ?? "Participant recorded in this live run's event log.",
      tools: template?.tools ?? [],
      status,
      currentTask: last.summary,
      lastActivity: `${formatTime(last.timestamp)} · ${related.length} recorded event${related.length === 1 ? "" : "s"}`,
    };
  });
}

const STATUS_TONE: Record<Agent["status"], string> = {
  idle: "border-border bg-muted text-muted-foreground",
  working: "border-accent/40 bg-accent/10 text-accent",
  waiting: "border-warning/40 bg-warning/10 text-warning",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  done: "border-success/40 bg-success/10 text-success",
};

const KIND_META: Record<AgentEventKind, { label: string; icon: typeof Bot; tone: string }> = {
  delegation: { label: "Delegation", icon: ArrowRight, tone: "text-primary" },
  tool_call: { label: "Tool call", icon: Wrench, tone: "text-accent" },
  result: { label: "Result", icon: CheckCircle2, tone: "text-success" },
  validation_warning: { label: "Validation warning", icon: TriangleAlert, tone: "text-warning" },
  decision: { label: "Decision", icon: GitBranch, tone: "text-primary" },
  message: { label: "Message", icon: ScrollText, tone: "text-muted-foreground" },
};

export function AgentGrid({
  events,
  onSelect,
  executionMode = "demo",
}: {
  events: AgentEvent[];
  onSelect: (agent: Agent) => void;
  executionMode?: "demo" | "live";
}) {
  const agents = executionMode === "live" ? agentsFromEvents(events) : AGENTS;

  if (executionMode === "live" && agents.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No agent activity has been recorded for this live run yet. Only agents that actually
        produced events are shown here.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => {
        const Icon = AGENT_ICON[agent.id];
        const count = events.filter((e) => e.from === agent.id || e.to === agent.id).length;
        return (
          <Card
            key={agent.id}
            className="agent-instrument cursor-pointer border-border bg-card transition-colors hover:border-primary/50"
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(agent);
              }
            }}
            onClick={() => onSelect(agent)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-md border border-border bg-surface text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{agent.name}</p>
                    <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    STATUS_TONE[agent.status],
                  )}
                >
                  {agent.status}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{agent.description}</p>
              <div className="mt-3 border-l border-accent/40 pl-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Current task
                </p>
                <p className="mt-0.5 text-xs">{agent.currentTask}</p>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate">{agent.lastActivity}</span>
                <Pill>{count} events</Pill>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function AgentTimeline({ events }: { events: AgentEvent[] }) {
  const [filter, setFilter] = useState<AgentEventKind | "all">("all");
  const filtered = filter === "all" ? events : events.filter((e) => e.kind === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(["all", ...Object.keys(KIND_META)] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={filter === kind ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setFilter(kind as AgentEventKind | "all")}
          >
            {kind === "all" ? "All" : KIND_META[kind as AgentEventKind].label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No recorded events of this type yet.
        </p>
      ) : (
        <ol className="agent-console relative border-l border-accent/30 pl-5">
          {filtered.map((event) => {
            const meta = KIND_META[event.kind];
            const Icon = meta.icon;
            return (
              <li key={event.id} className="relative">
                <span className="absolute -left-[26px] top-1.5 grid size-4 place-items-center rounded-full border border-border bg-background">
                  <Icon className={cn("size-2.5", meta.tone)} />
                </span>
                <div className="console-event border-b border-border px-2 py-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">{formatTime(event.timestamp)}</span>
                    <span>{actorLabel(event.from)}</span>
                    <ArrowRight className="size-3" />
                    <span>{actorLabel(event.to)}</span>
                    <Pill tone={event.kind === "validation_warning" ? "warning" : "muted"}>
                      {meta.label}
                    </Pill>
                  </div>
                  <p className="mt-1 text-sm">{event.summary}</p>
                  {event.detail && (
                    <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
                  )}
                  {event.payload && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(event.payload).map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground max-w-full break-all"
                        >
                          {key}={typeof value === "object" ? JSON.stringify(value) : String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function AgentInspector({
  agent,
  events,
  onOpenChange,
}: {
  agent: Agent | null;
  events: AgentEvent[];
  onOpenChange: (open: boolean) => void;
}) {
  if (!agent) return null;
  const related = events.filter((e) => e.from === agent.id || e.to === agent.id);

  return (
    <Sheet open={Boolean(agent)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{agent.name}</SheetTitle>
          <SheetDescription>{agent.description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">
          <div>
            <p className="text-sm font-medium">Available tools</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agent.tools.map((tool) => (
                <Pill key={tool} tone="accent">
                  <Wrench className="size-3" /> {tool}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Current task</p>
            <p className="mt-1 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
              {agent.currentTask}
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Task history, messages and recorded results</p>
            {related.length ? (
              <AgentTimeline events={related} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No recorded interactions for this agent in the selected run.
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            ProtEva shows recorded decisions and tool evidence only. Hidden model reasoning is never
            displayed.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
