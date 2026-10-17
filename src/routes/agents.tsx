import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/app/AppShell";
import { AgentGrid, AgentInspector, AgentTimeline } from "@/components/agents/AgentViews";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExperimentEvents, useExperiments } from "@/lib/protein/hooks";
import type { Agent } from "@/lib/protein/types";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Agent activity · ProtEva" },
      {
        name: "description",
        content:
          "Six coordinated agents interpret the objective, plan the search, evaluate ensembles and audit results.",
      },
      { property: "og:title", content: "Agent activity · ProtEva" },
      { property: "og:description", content: "Coordinated multi-agent workflow with recorded tool evidence." },
    ],
  }),
  component: AgentActivity,
});

function AgentActivity() {
  const { data: experiments = [] } = useExperiments();
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const activeId = experimentId ?? experiments[0]?.id ?? "";
  const { data: events = [] } = useExperimentEvents(activeId);
  const [selected, setSelected] = useState<Agent | null>(null);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agent activity"
        description="Autonomous multi-agent collaboration. ProtEva records delegations, tool calls and decisions; it never presents model reasoning or invented measurements."
        actions={
          <Select value={activeId} onValueChange={setExperimentId}>
            <SelectTrigger className="h-9 w-64 bg-surface">
              <SelectValue placeholder="Experiment" />
            </SelectTrigger>
            <SelectContent>
              {experiments.map((experiment) => (
                <SelectItem key={experiment.id} value={experiment.id}>
                  {experiment.id} · {experiment.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <AgentGrid events={events} onSelect={setSelected} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Communication timeline</CardTitle>
          <CardDescription>
            Filter by event type to follow delegation, evidence and audit decisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length ? (
            <AgentTimeline events={events} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No recorded agent events for this run yet.
            </p>
          )}
        </CardContent>
      </Card>

      <AgentInspector
        agent={selected}
        events={events}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
