import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowRight, Boxes, FlaskConical, Play, ShieldAlert } from "lucide-react";

import { MolecularCanvas } from "@/components/app/MolecularCanvas";
import { PageHeader } from "@/components/app/AppShell";
import { DiversityChart, ObjectiveChart } from "@/components/app/Charts";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actorLabel, experimentProgressLabel, formatTime } from "@/lib/protein/format";
import { useExperimentEvents, useExperiments } from "@/lib/protein/hooks";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Workbench overview · ProtEva" },
      {
        name: "description",
        content:
          "Monitor protein conformational search runs, evolutionary progress and agent activity in the ProtEva workspace.",
      },
      { property: "og:title", content: "Workbench overview · ProtEva" },
      {
        property: "og:description",
        content: "Monitor conformational search runs, evolution progress and agent activity.",
      },
    ],
  }),
  component: Overview,
});

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Boxes;
  tone: "primary" | "accent" | "warning" | "success";
}) {
  const toneMap = {
    primary: "text-primary",
    accent: "text-accent",
    warning: "text-warning",
    success: "text-success",
  } as const;
  return (
    <div className="scientific-summary">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <Icon className={`size-4 ${toneMap[tone]}`} />
        </div>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function Overview() {
  const navigate = useNavigate();
  const { data: experiments, isLoading, isError, error } = useExperiments();
  const featured = experiments?.find((e) => e.generationStats.length > 0);
  const { data: events } = useExperimentEvents(featured?.id ?? "");

  if (isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base">Could not load experiments</CardTitle>
          <CardDescription>{(error as Error).message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const active = experiments?.filter(
    (e) => !["completed", "failed", "cancelled"].includes(e.status),
  ).length;
  const candidates = experiments?.reduce((sum, e) => sum + e.candidateCount, 0);
  const review = experiments?.reduce((sum, e) => sum + e.requiresReview, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research workbench"
        description="AI-assisted conformational search and in-silico directed evolution. Every figure below is illustrative demonstration data."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/experiments/$experimentId" params={{ experimentId: "EXP-1042" }}>
                <Play className="size-4" /> Explore demo run
              </Link>
            </Button>
            <Button onClick={() => navigate({ to: "/experiments/new" })}>
              <FlaskConical className="size-4" /> New experiment
            </Button>
          </>
        }
      />

      <div className="research-focus">
        <div>
          <p className="eyebrow">CURRENT EXPLORATION / CONTINUE</p>
          <h2>{featured?.name ?? "Conformational search"}</h2>
          <p>{featured?.target.objectiveText ?? "Define a landscape to begin exploring."}</p>
          <Button asChild variant="outline">
            <Link
              to="/experiments/$experimentId"
              params={{ experimentId: featured?.id ?? "EXP-1042" }}
            >
              Continue exploration <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <MolecularCanvas compact />
      </div>
      <div className="summary-strip grid sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : (
              [
                {
                  label: "Total experiments",
                  value: experiments?.length ?? 0,
                  hint: "Across the demo workspace",
                  icon: FlaskConical,
                  tone: "primary" as const,
                },
                {
                  label: "Active runs",
                  value: active ?? 0,
                  hint: "Simulated pipeline stages in progress",
                  icon: Activity,
                  tone: "accent" as const,
                },
                {
                  label: "Candidates evaluated",
                  value: candidates ?? 0,
                  hint: "Illustrative evaluations, not measurements",
                  icon: Boxes,
                  tone: "success" as const,
                },
                {
                  label: "Requiring review",
                  value: review ?? 0,
                  hint: "Flagged by the Scientific Auditor",
                  icon: ShieldAlert,
                  tone: "warning" as const,
                },
              ] as const
            ).map((card) => <SummaryCard key={card.label} {...card} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolutionary search progress</CardTitle>
            <CardDescription>
              Best and average objective score by generation — {featured?.id ?? "demo"}{" "}
              (illustrative)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {featured ? (
              <ObjectiveChart data={featured.generationStats} />
            ) : (
              <Skeleton className="h-56" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Population diversity</CardTitle>
            <CardDescription>Mean pairwise sequence divergence (illustrative)</CardDescription>
          </CardHeader>
          <CardContent>
            {featured ? (
              <DiversityChart data={featured.generationStats} />
            ) : (
              <Skeleton className="h-44" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent experiments</CardTitle>
          <CardDescription>Demonstration records held in the browser session</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Experiment</TableHead>
                  <TableHead>Protein</TableHead>
                  <TableHead className="hidden lg:table-cell">Objective</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gen.</TableHead>
                  <TableHead className="text-right">Candidates</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-10" />
                    </TableCell>
                  </TableRow>
                )}
                {experiments?.map((experiment) => (
                  <TableRow key={experiment.id}>
                    <TableCell>
                      <Link
                        to="/experiments/$experimentId"
                        params={{ experimentId: experiment.id }}
                        className="font-medium hover:text-primary"
                      >
                        {experiment.name}
                      </Link>
                      <p className="font-mono text-[11px] text-muted-foreground">{experiment.id}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {experiment.sequence.length} aa
                    </TableCell>
                    <TableCell className="hidden max-w-sm truncate text-xs text-muted-foreground lg:table-cell">
                      {experiment.target.objectiveText}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={experiment.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {experimentProgressLabel(experiment)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {experiment.candidateCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          to="/experiments/$experimentId"
                          params={{ experimentId: experiment.id }}
                          aria-label={`Open ${experiment.name}`}
                        >
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent agent activity</CardTitle>
          <CardDescription>Recorded messages and tool calls, not model reasoning</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(events ?? [])
            .slice(-5)
            .reverse()
            .map((event) => (
              <div key={event.id} className="flex gap-3 border-l border-border pl-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{formatTime(event.timestamp)}</span> ·{" "}
                    {actorLabel(event.from)} → {actorLabel(event.to)}
                  </p>
                  <p className="truncate text-sm">{event.summary}</p>
                </div>
              </div>
            ))}
          {!events?.length && (
            <p className="text-sm text-muted-foreground">No recorded agent events yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
