import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Download,
  FileJson,
  FileText,
  GitBranch,
  Square,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/AppShell";
import { DiversityChart, ObjectiveChart } from "@/components/app/Charts";
import { Pill, StatusBadge } from "@/components/app/StatusBadge";
import { AgentGrid, AgentInspector, AgentTimeline } from "@/components/agents/AgentViews";
import { CandidateDrawer } from "@/components/candidates/CandidateDrawer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/protein/api";
import { STATUS_PIPELINE, downloadTextFile, formatDate, toFasta } from "@/lib/protein/format";
import {
  useArtifacts,
  useCandidates,
  useExperiment,
  useExperimentEvents,
} from "@/lib/protein/hooks";
import type { Agent, Candidate } from "@/lib/protein/types";

export const Route = createFileRoute("/experiments/$experimentId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Experiment workspace · ProtEva" },
      {
        name: "description",
        content:
          "Follow a simulated conformational search run: agent trace, evolution, candidates, landscape and artifacts.",
      },
      { property: "og:title", content: "Experiment workspace · ProtEva" },
      {
        property: "og:description",
        content: "Agent trace, evolutionary generations, candidates and exportable reports.",
      },
    ],
  }),
  component: ExperimentWorkspace,
});

function ExperimentWorkspace() {
  const { experimentId } = Route.useParams();
  const { data: experiment, isLoading, isError, error } = useExperiment(experimentId);
  const { data: events = [] } = useExperimentEvents(experimentId);
  const { data: candidates = [] } = useCandidates({ experimentId });
  const { data: artifacts = [] } = useArtifacts(experimentId);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  if (isLoading) return <Skeleton className="h-96" />;
  if (isError || !experiment) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base">Experiment unavailable</CardTitle>
          <CardDescription>{(error as Error)?.message ?? "Not found."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const scored = candidates.filter((c) => c.objectiveScore != null);
  const best = [...scored].sort((a, b) => (b.objectiveScore ?? 0) - (a.objectiveScore ?? 0))[0];
  const progress = Math.round(
    (experiment.currentGeneration / Math.max(1, experiment.config.generations)) * 100,
  );
  const stageIndex = STATUS_PIPELINE.indexOf(experiment.status);
  const running = !["completed", "failed", "cancelled"].includes(experiment.status);

  async function exportReport(format: "markdown" | "json") {
    try {
      const content = await api.exportExperiment(experimentId, format);
      downloadTextFile(
        `${experimentId}-report.${format === "json" ? "json" : "md"}`,
        content,
        format === "json" ? "application/json" : "text/markdown",
      );
      toast.success("Report exported");
    } catch (err) {
      toast.error("Export failed", { description: (err as Error).message });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={experiment.name}
        description={`${experiment.id} · created ${formatDate(experiment.createdAt)} · simulated run, no sampling job dispatched`}
        actions={
          <>
            {running && (
              <Button
                variant="outline"
                onClick={async () => {
                  await api.cancelExperiment(experimentId);
                  toast.info("Demo run cancelled");
                }}
              >
                <Square className="size-4" /> Cancel run
              </Button>
            )}
            <Button variant="outline" onClick={() => exportReport("markdown")}>
              <FileText className="size-4" /> Export Markdown
            </Button>
            <Button onClick={() => exportReport("json")}>
              <FileJson className="size-4" /> Export JSON
            </Button>
          </>
        }
      />

      <section className="experiment-objective"><p className="eyebrow">RESEARCH OBJECTIVE</p><h2>{experiment.target.objectiveText}</h2><div className="flex flex-wrap gap-3"><span className="font-mono text-xs text-muted-foreground">{experiment.sequence.length} RESIDUES</span><span className="font-mono text-xs text-muted-foreground">{experiment.config.populationSize} CANDIDATES / GENERATION</span><span className="font-mono text-xs text-accent">SIMULATED SEARCH</span></div></section>
      <div className="run-progress">
        <div className="flex flex-wrap items-center gap-4 py-4">
          <StatusBadge status={experiment.status} />
          <div className="min-w-56 flex-1">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>
                Generation {experiment.currentGeneration} / {experiment.config.generations}
              </span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_PIPELINE.map((stage, index) => (
              <Pill
                key={stage}
                tone={
                  experiment.status === "failed" || experiment.status === "cancelled"
                    ? "muted"
                    : index <= stageIndex
                      ? "accent"
                      : "muted"
                }
              >
                {stage}
              </Pill>
            ))}
            {(experiment.status === "failed" || experiment.status === "cancelled") && (
              <Pill tone={experiment.status === "failed" ? "danger" : "muted"}>
                {experiment.status}
              </Pill>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          {["overview", "agent-trace", "evolution", "candidates", "landscape", "artifacts"].map(
            (tab) => (
              <TabsTrigger key={tab} value={tab} className="capitalize">
                {tab.replace("-", " ")}
              </TabsTrigger>
            ),
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Objective score by generation</CardTitle>
                <CardDescription>Illustrative demonstration values</CardDescription>
              </CardHeader>
              <CardContent>
                {experiment.generationStats.length ? (
                  <ObjectiveChart data={experiment.generationStats} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No generations completed yet.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Population diversity</CardTitle>
                <CardDescription>Mean pairwise divergence (illustrative)</CardDescription>
              </CardHeader>
              <CardContent>
                {experiment.generationStats.length ? (
                  <DiversityChart data={experiment.generationStats} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">Pending.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Best candidate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {best ? (
                  <>
                    <p className="font-mono">{best.id}</p>
                    <p className="text-muted-foreground">
                      Score {best.objectiveScore?.toFixed(3)} · generation {best.generation}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {best.mutations.map((m) => (
                        <Pill key={m} tone="primary">
                          {m}
                        </Pill>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setSelectedCandidate(best)}>
                      Inspect candidate
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground">No scored candidates yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Search settings</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 font-mono text-[11px] text-muted-foreground">
                <span>population = {experiment.config.populationSize}</span>
                <span>generations = {experiment.config.generations}</span>
                <span>max_substitutions = {experiment.config.maxSubstitutions}</span>
                <span>screening_samples = {experiment.config.screeningSamples}</span>
                <span>finalist_samples = {experiment.config.finalistSamples}</span>
                <span>strategy = {experiment.config.mutationStrategy}</span>
                <span>seed = {experiment.config.randomSeed}</span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Validation warnings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {experiment.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-muted-foreground"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    {warning}
                  </p>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent agent events</CardTitle>
            </CardHeader>
            <CardContent>
              <AgentTimeline events={events.slice(-5)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent-trace" className="space-y-4 pt-4">
          <AgentGrid events={events} onSelect={setSelectedAgent} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Communication timeline</CardTitle>
              <CardDescription>
                Recorded delegations, tool calls, results and decisions — no hidden model reasoning
              </CardDescription>
            </CardHeader>
            <CardContent>
              {events.length ? (
                <AgentTimeline events={events} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Agents have not reported yet for this run.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evolution" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Best vs average score</CardTitle>
              </CardHeader>
              <CardContent>
                <ObjectiveChart data={experiment.generationStats} height={200} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sequence diversity</CardTitle>
              </CardHeader>
              <CardContent>
                <DiversityChart data={experiment.generationStats} height={200} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Population grid</CardTitle>
              <CardDescription>
                Each tile is a candidate; colour intensity follows the illustrative objective score
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[...new Set(candidates.map((c) => c.generation))].map((generation) => (
                <div key={generation}>
                  <p className="mb-2 text-xs text-muted-foreground">Generation {generation}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {candidates
                      .filter((c) => c.generation === generation)
                      .map((candidate) => (
                        <button
                          key={candidate.id}
                          onClick={() => setSelectedCandidate(candidate)}
                          title={`${candidate.id} · score ${candidate.objectiveScore ?? "n/a"}`}
                          className="size-8 rounded border border-border transition-transform hover:scale-110"
                          style={{
                            backgroundColor: `color-mix(in oklab, var(--color-primary) ${Math.round((candidate.objectiveScore ?? 0) * 100)}%, var(--color-surface))`,
                          }}
                        >
                          <span className="sr-only">{candidate.id}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="size-4" /> Parent → child lineage
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 space-y-1 overflow-y-auto font-mono text-[11px]">
              {candidates.slice(0, 60).map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedCandidate(candidate)}
                  className="block w-full truncate rounded px-2 py-1 text-left hover:bg-surface"
                  style={{ paddingLeft: `${candidate.generation * 10}px` }}
                >
                  <span className="text-muted-foreground">
                    {candidate.parentId ?? "wild-type"} →{" "}
                  </span>
                  <span className="text-primary">{candidate.id}</span>{" "}
                  <span className="text-muted-foreground">
                    [{candidate.mutations.slice(-2).join(", ") || "—"}]
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="candidates" className="pt-4">
          <Card>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Gen.</TableHead>
                      <TableHead>Mutations</TableHead>
                      <TableHead className="hidden md:table-cell">Sequence</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Evaluation</TableHead>
                      <TableHead>Audit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => (
                      <TableRow
                        key={candidate.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedCandidate(candidate)}
                      >
                        <TableCell className="font-mono text-xs">{candidate.id}</TableCell>
                        <TableCell className="font-mono">{candidate.generation}</TableCell>
                        <TableCell className="font-mono text-xs text-primary">
                          {candidate.mutations.slice(-3).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="hidden max-w-48 truncate font-mono text-[11px] text-muted-foreground md:table-cell">
                          {candidate.sequence.slice(0, 28)}…
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {candidate.objectiveScore?.toFixed(3) ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs capitalize">
                          {candidate.evaluationStatus}
                        </TableCell>
                        <TableCell>
                          <Pill
                            tone={
                              candidate.auditStatus === "flagged"
                                ? "warning"
                                : candidate.auditStatus === "confirmed"
                                  ? "success"
                                  : "muted"
                            }
                          >
                            {candidate.auditStatus}
                          </Pill>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="landscape" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Target vs undesired state</CardTitle>
              <CardDescription>
                Occupancy = fraction of sampled conformations matching the state definition
                (illustrative)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Target state
                </p>
                <p className="mt-1 text-sm">{experiment.target.targetStateDescription}</p>
                <p className="mt-3 font-mono text-3xl tabular-nums text-accent">
                  {best?.metrics ? best.metrics.targetOccupancy.toFixed(2) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  ± {best?.metrics?.uncertainty.toFixed(3) ?? "—"} over{" "}
                  {best?.metrics?.sampleCount ?? 0} samples
                </p>
              </div>
              <div className="rounded-md border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Undesired state
                </p>
                <p className="mt-1 text-sm">
                  {experiment.target.undesiredStateDescription ?? "Not declared"}
                </p>
                <p className="mt-3 font-mono text-3xl tabular-nums text-muted-foreground">
                  {best?.metrics ? best.metrics.offTargetOccupancy.toFixed(2) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">Off-target occupancy</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Structural metric distribution</CardTitle>
              <CardDescription>
                RMSD values across evaluated candidates — demonstration data only
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-end gap-1">
                {Array.from({ length: 20 }).map((_, bin) => {
                  const low = bin * 0.5;
                  const count = scored.filter(
                    (c) =>
                      (c.metrics?.rmsdAngstrom ?? -1) >= low &&
                      (c.metrics?.rmsdAngstrom ?? -1) < low + 0.5,
                  ).length;
                  const height = Math.min(100, count * 12);
                  return (
                    <div key={bin} className="flex-1" title={`${low}–${low + 0.5} Å: ${count}`}>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-primary/30 to-accent"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                X axis: RMSD bins 0–10 Å. Y axis: candidate count. Higher RMSD to the closed
                reference indicates more open conformations.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="artifacts" className="pt-4">
          <Card>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artifact</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artifacts.map((artifact) => (
                    <TableRow key={artifact.id}>
                      <TableCell className="font-mono text-xs">
                        {artifact.name}
                        {artifact.note && (
                          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
                            {artifact.note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">
                        {artifact.kind.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{artifact.sizeLabel}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!artifact.downloadable}
                          onClick={async () => {
                            if (artifact.kind === "report") return exportReport("markdown");
                            if (artifact.kind === "config") {
                              downloadTextFile(
                                "experiment_config.json",
                                JSON.stringify(
                                  { input: experiment.input, target: experiment.target, config: experiment.config },
                                  null,
                                  2,
                                ),
                                "application/json",
                              );
                              return;
                            }
                            if (artifact.kind === "event_log") {
                              downloadTextFile(
                                "agent_events.json",
                                JSON.stringify(events, null, 2),
                                "application/json",
                              );
                              return;
                            }
                            if (artifact.kind === "metric_table") {
                              const header =
                                "candidate_id,generation,mutations,objective_score,target_occupancy,rmsd_angstrom,samples,uncertainty\n";
                              const body = candidates
                                .map((c) =>
                                  [
                                    c.id,
                                    c.generation,
                                    `"${c.mutations.join(" ")}"`,
                                    c.objectiveScore ?? "",
                                    c.metrics?.targetOccupancy ?? "",
                                    c.metrics?.rmsdAngstrom ?? "",
                                    c.metrics?.sampleCount ?? "",
                                    c.metrics?.uncertainty ?? "",
                                  ].join(","),
                                )
                                .join("\n");
                              downloadTextFile("metrics.csv", header + body, "text/csv");
                              return;
                            }
                            if (artifact.kind === "input_fasta") {
                              downloadTextFile(
                                "input_sequence.fasta",
                                toFasta(`${experiment.id} input DEMO_SIMULATED`, experiment.sequence),
                              );
                              return;
                            }
                            if (artifact.kind === "candidate_fasta") {
                              downloadTextFile(
                                "candidates.fasta",
                                candidates
                                  .map((c) =>
                                    toFasta(`${c.id} gen${c.generation} ${c.mutations.join(",")}`, c.sequence),
                                  )
                                  .join(""),
                              );
                            }
                          }}
                        >
                          <Download className="size-3.5" />
                          {artifact.downloadable ? "Download" : "Unavailable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CandidateDrawer
        candidate={selectedCandidate}
        onOpenChange={(open) => !open && setSelectedCandidate(null)}
      />
      <AgentInspector
        agent={selectedAgent}
        events={events}
        onOpenChange={(open) => !open && setSelectedAgent(null)}
      />
    </div>
  );
}
