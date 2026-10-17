import { Copy, Download, FlaskConical, Info } from "lucide-react";
import { toast } from "sonner";

import { Pill } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { downloadTextFile, toFasta } from "@/lib/protein/format";
import type { Candidate } from "@/lib/protein/types";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SequenceView({ sequence, mutations }: { sequence: string; mutations: string[] }) {
  const mutatedPositions = new Set(
    mutations.map((m) => Number(m.slice(1, -1))).filter((n) => !Number.isNaN(n)),
  );
  const chunks = sequence.match(/.{1,10}/g) ?? [];
  let offset = 0;
  return (
    <div className="candidate-sequence max-h-64 overflow-y-auto border-y border-border bg-surface p-4 font-mono text-sm leading-8">
      {chunks.map((chunk, chunkIndex) => {
        const start = offset;
        offset += chunk.length;
        return (
          <span key={chunkIndex}>
            {chunk.split("").map((char, i) => {
              const position = start + i + 1;
              const mutated = mutatedPositions.has(position);
              return (
                <span
                  key={position}
                  title={`Residue ${position}`}
                  className={mutated ? "rounded bg-primary/25 text-primary" : undefined}
                >
                  {char}
                </span>
              );
            })}{" "}
          </span>
        );
      })}
    </div>
  );
}

export function CandidateDrawer({
  candidate,
  onOpenChange,
}: {
  candidate: Candidate | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!candidate) return null;
  const metrics = candidate.metrics;
  const isLiveMeasurement = candidate.targetMeanNll != null || candidate.offTargetMeanNll != null;

  return (
    <Sheet open={Boolean(candidate)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-mono">{candidate.id}</SheetTitle>
          <SheetDescription>
            Generation {candidate.generation} · parent{" "}
            <span className="font-mono">{candidate.parentId ?? "wild-type"}</span> · {isLiveMeasurement ? "recorded ProteinMPNN measurement" : "illustrative demo candidate"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <div className="flex flex-wrap gap-1.5">
            {candidate.mutations.length ? (
              candidate.mutations.map((m) => (
                <Pill key={m} tone="primary">
                  {m}
                </Pill>
              ))
            ) : (
              <Pill>No substitutions</Pill>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(candidate.sequence);
                toast.success("Sequence copied to clipboard");
              }}
            >
              <Copy className="size-4" /> Copy sequence
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                downloadTextFile(
                  `${candidate.id}.fasta`,
                  toFasta(`${candidate.id} ${isLiveMeasurement ? "COMPUTATIONAL" : "DEMO_SIMULATED"} ${candidate.mutations.join(",")}`, candidate.sequence),
                );
                toast.success("FASTA downloaded");
              }}
            >
              <Download className="size-4" /> Download FASTA
            </Button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Sequence (mutated residues highlighted)</p>
            <SequenceView sequence={candidate.sequence} mutations={candidate.mutations} />
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-sm font-medium">Structural visualisation</p>
            <div className="structure-unavailable grid h-64 place-items-center border border-dashed border-border bg-surface text-center">
              <div className="px-6">
                <FlaskConical className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No structure available</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A 3D model appears here once the BioEmu sampling worker is connected. ProtEva never
                  renders an invented structure as a real protein model.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{isLiveMeasurement ? "ProteinMPNN compatibility measurements" : "Metrics (demonstration values)"}</p>
            {isLiveMeasurement ? (
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Target mean NLL" value={candidate.targetMeanNll?.toFixed(4) ?? "—"} hint="Lower is better under the same model configuration." />
                <Metric label="Off-target mean NLL" value={candidate.offTargetMeanNll?.toFixed(4) ?? "—"} hint="Lower is better under the same model configuration." />
                <Metric label="Target preference" value={candidate.targetPreference?.toFixed(4) ?? "—"} hint="off-target mean NLL − target mean NLL; higher favors target compatibility." />
                <Metric label="Seed measurements" value={String(candidate.seedMetrics?.length ?? 0)} hint="Fixed-seed robustness audit records." />
              </div>
            ) : metrics ? (
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Target occupancy"
                  value={metrics.targetOccupancy.toFixed(3)}
                  hint={`± ${metrics.uncertainty.toFixed(3)}`}
                />
                <Metric label="Off-target occupancy" value={metrics.offTargetOccupancy.toFixed(3)} />
                <Metric label="RMSD" value={`${metrics.rmsdAngstrom.toFixed(2)} Å`} />
                <Metric label="Radius of gyration" value={`${metrics.radiusOfGyration.toFixed(2)} Å`} />
                <Metric label="Samples" value={String(metrics.sampleCount)} hint="Simulated budget" />
                <Metric
                  label="Objective score"
                  value={candidate.objectiveScore?.toFixed(3) ?? "—"}
                  hint={`Audit: ${candidate.auditStatus}`}
                />
              </div>
            ) : (
              <p className="rounded-md border border-border bg-surface p-3 text-sm text-muted-foreground">
                Not evaluated yet — this candidate is still {candidate.evaluationStatus}.
              </p>
            )}
          </div>

          {candidate.warnings.length > 0 && (
            <div className="space-y-2">
              {candidate.warnings.map((warning) => (
                <p
                  key={warning}
                  className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground"
                >
                  <Info className="mt-0.5 size-4 shrink-0 text-warning" /> {warning}
                </p>
              ))}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Artifacts</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li className="font-mono">{candidate.id}.fasta — available</li>
              <li className="font-mono">{candidate.id}_ensemble.xtc — requires sampling worker</li>
              <li className="font-mono">{candidate.id}_metrics.csv — demonstration values</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
