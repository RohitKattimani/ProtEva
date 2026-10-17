import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpDown, FlaskConical, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/app/AppShell";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/protein/format";
import { useExperiments } from "@/lib/protein/hooks";

export const Route = createFileRoute("/experiments/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Experiments · ProtEva" },
      {
        name: "description",
        content: "Browse every protein conformational search run in the ProtEva demo workspace.",
      },
      { property: "og:title", content: "Experiments · ProtEva" },
      { property: "og:description", content: "Browse protein conformational search runs." },
    ],
  }),
  component: Experiments,
});

function Experiments() {
  const { data, isLoading } = useExperiments();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sortDesc, setSortDesc] = useState(true);

  const rows = useMemo(() => {
    let list = data ?? [];
    if (query) {
      const needle = query.toLowerCase();
      list = list.filter(
        (e) => e.name.toLowerCase().includes(needle) || e.id.toLowerCase().includes(needle),
      );
    }
    if (status !== "all") list = list.filter((e) => e.status === status);
    return [...list].sort((a, b) =>
      sortDesc
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }, [data, query, status, sortDesc]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Experiments"
        description="All demonstration runs in this session. No real sampling jobs are dispatched."
        actions={
          <Button asChild>
            <Link to="/experiments/new">
              <FlaskConical className="size-4" /> New experiment
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or ID"
            className="h-9 w-64 bg-surface pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-44 bg-surface">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {["all", "queued", "validating", "sampling", "evaluating", "auditing", "completed", "failed", "cancelled"].map(
              (value) => (
                <SelectItem key={value} value={value} className="capitalize">
                  {value}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setSortDesc((v) => !v)}>
          <ArrowUpDown className="size-4" /> {sortDesc ? "Newest first" : "Oldest first"}
        </Button>
      </div>

      <Card>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">No experiments match these filters.</p>
              <Button variant="outline" className="mt-3" asChild>
                <Link to="/experiments/new">Create one</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Experiment</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Generation</TableHead>
                    <TableHead className="text-right">Candidates</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((experiment) => (
                    <TableRow key={experiment.id}>
                      <TableCell>
                        <Link
                          to="/experiments/$experimentId"
                          params={{ experimentId: experiment.id }}
                          className="font-medium hover:text-primary"
                        >
                          {experiment.name}
                        </Link>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {experiment.id} · {experiment.sequence.length} aa
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(experiment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={experiment.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {experiment.currentGeneration}/{experiment.config.generations}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {experiment.candidateCount}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-warning">
                        {experiment.requiresReview}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
