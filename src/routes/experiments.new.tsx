import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Rocket, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/AppShell";
import { Pill } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, isDemoMode } from "@/lib/protein/api";
import { AMINO_ACIDS, DEFAULT_CONFIG, DEFAULT_TARGET, EXAMPLE_SEQUENCE } from "@/lib/protein/mock-data";
import type { SearchConfig, SequenceInput, TargetLandscape } from "@/lib/protein/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/experiments/new")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "New experiment · ProtEva" },
      {
        name: "description",
        content:
          "Configure a protein sequence, target conformational landscape and genetic-algorithm search in four steps.",
      },
      { property: "og:title", content: "New experiment · ProtEva" },
      {
        property: "og:description",
        content: "Four-step wizard for sequence input, target landscape and search configuration.",
      },
    ],
  }),
  component: NewExperiment,
});

const STEPS = ["Protein input", "Target landscape", "Search configuration", "Review & launch"];

function Hint({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More information"
            className="ml-1 rounded-full border border-border px-1 text-[10px] text-muted-foreground"
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <p
          key={item}
          className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-muted-foreground"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {item}
        </p>
      ))}
    </div>
  );
}

function NewExperiment() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const pdbRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [executionMode, setExecutionMode] = useState<"demo" | "live">("demo");

  const [input, setInput] = useState<SequenceInput>({ experimentName: "", sequence: "" });
  const [target, setTarget] = useState<TargetLandscape>({
    ...DEFAULT_TARGET,
    objectiveText: "",
    targetStateDescription: "",
  });
  const [config, setConfig] = useState<SearchConfig>(DEFAULT_CONFIG);

  const invalidChars = useMemo(() => {
    const cleaned = input.sequence.replace(/\s/g, "").toUpperCase();
    return [...new Set(cleaned.split("").filter((c) => !AMINO_ACIDS.includes(c)))];
  }, [input.sequence]);

  const sequenceLength = input.sequence.replace(/\s/g, "").length;

  const stepWarnings: string[][] = [
    [
      !input.experimentName ? "Experiment name is required." : "",
      sequenceLength < 20 ? "Sequence should be at least 20 residues for a meaningful search." : "",
      invalidChars.length
        ? `Unsupported characters in sequence: ${invalidChars.join(", ")}`
        : "",
    ].filter(Boolean),
    [
      !target.objectiveText ? "Describe the objective in natural language." : "",
      !target.targetStateDescription ? "Define the target structure or geometric constraint." : "",
      !target.undesiredStateDescription
        ? "No undesired reference state given — off-target occupancy cannot be reported."
        : "",
      !target.preservationConstraints
        ? "No preservation constraints — functional residues may be mutated."
        : "",
    ].filter(Boolean),
    [
      config.populationSize * config.generations > 600
        ? "Large search space: compute estimates become unreliable."
        : "",
      config.finalistSamples < config.screeningSamples
        ? "Finalist sampling budget is lower than screening — rankings will stay uncertain."
        : "",
    ].filter(Boolean),
    [],
  ];

  const blocking =
    step === 0
      ? !input.experimentName || sequenceLength < 20 || invalidChars.length > 0
      : step === 1
        ? !target.objectiveText || !target.targetStateDescription
        : false;

  const computeEstimate = Math.round(
    (config.populationSize * config.generations * config.screeningSamples) / 600,
  );

  async function launch() {
    setLaunching(true);
    try {
      const experiment = await api.createExperiment({
        input: { ...input, sequence: input.sequence.replace(/\s/g, "").toUpperCase() },
        target,
        config,
        executionMode,
      });
      toast.success(`${executionMode === "live" ? "Live" : "Demo"} run ${experiment.id} queued`, {
        description: executionMode === "live" ? "The backend will record real status and errors." : "Simulated pipeline — no sampling job was dispatched.",
      });
      void navigate({
        to: "/experiments/$experimentId",
        params: { experimentId: experiment.id },
      });
    } catch (error) {
      toast.error("Could not create the experiment", {
        description: (error as Error).message,
      });
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="New experiment"
        description="Define the protein, the desired conformational landscape and the search budget. Validation here is frontend-only; scientific validation happens in the future backend."
      />

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors",
                index === step
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : index < step
                    ? "border-border bg-surface text-muted-foreground hover:text-foreground"
                    : "border-border bg-surface text-muted-foreground/60",
              )}
            >
              <span className="font-mono">{index < step ? <Check className="size-3" /> : index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{STEPS[step]}</CardTitle>
          <CardDescription>
            {
              [
                "Provide the parent amino-acid sequence to evolve.",
                "Describe the conformational state you want to enrich.",
                "Bound the genetic algorithm and the sampling budget.",
                "Confirm inputs before starting the simulated run.",
              ][step]
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Experiment name</Label>
                <Input
                  id="name"
                  value={input.experimentName}
                  onChange={(e) => setInput({ ...input, experimentName: e.target.value })}
                  placeholder="e.g. Protease lid-opening sweep"
                  className="bg-surface"
                />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="sequence">Amino-acid sequence</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="size-3.5" /> FASTA upload
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setInput({ ...input, sequence: EXAMPLE_SEQUENCE })}
                    >
                      Use example
                    </Button>
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".fasta,.fa,.txt"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    const sequence = text
                      .split("\n")
                      .filter((line) => !line.startsWith(">"))
                      .join("")
                      .replace(/\s/g, "")
                      .toUpperCase();
                    setInput((prev) => ({
                      ...prev,
                      sequence,
                      experimentName: prev.experimentName || file.name.replace(/\.[^.]+$/, ""),
                    }));
                    toast.success(`Loaded ${sequence.length} residues from ${file.name}`);
                  }}
                />
                <Textarea
                  id="sequence"
                  value={input.sequence}
                  onChange={(e) => setInput({ ...input, sequence: e.target.value.toUpperCase() })}
                  rows={8}
                  spellCheck={false}
                  placeholder="MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ…"
                  className="bg-surface font-mono text-xs leading-6"
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Pill tone={sequenceLength >= 20 ? "accent" : "muted"}>
                    {sequenceLength} residues
                  </Pill>
                  <Pill tone={invalidChars.length ? "danger" : "success"}>
                    {invalidChars.length ? "Invalid characters" : "Valid alphabet"}
                  </Pill>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reference PDB (optional)</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => pdbRef.current?.click()}>
                    <Upload className="size-3.5" /> Upload PDB
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {input.referencePdbName ?? "No file selected"}
                  </span>
                </div>
                <input
                  ref={pdbRef}
                  type="file"
                  accept=".pdb,.cif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setInput((prev) => ({ ...prev, referencePdbName: file.name }));
                  }}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="objective">Objective (natural language)</Label>
                <Textarea
                  id="objective"
                  rows={3}
                  value={target.objectiveText}
                  onChange={(e) => setTarget({ ...target, objectiveText: e.target.value })}
                  placeholder="Increase the population of the open-pocket conformation while preserving the catalytic triad."
                  className="bg-surface"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="target-state">Target structure / geometric constraint</Label>
                  <Textarea
                    id="target-state"
                    rows={3}
                    value={target.targetStateDescription}
                    onChange={(e) =>
                      setTarget({ ...target, targetStateDescription: e.target.value })
                    }
                    className="bg-surface"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="undesired">Undesired reference state (optional)</Label>
                  <Textarea
                    id="undesired"
                    rows={3}
                    value={target.undesiredStateDescription ?? ""}
                    onChange={(e) =>
                      setTarget({ ...target, undesiredStateDescription: e.target.value })
                    }
                    className="bg-surface"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>
                    Structural metric
                    <Hint text="Deterministic metric computed over sampled ensembles by scientific code, never by the language model." />
                  </Label>
                  <Select
                    value={target.structuralMetric}
                    onValueChange={(value) =>
                      setTarget({ ...target, structuralMetric: value as TargetLandscape["structuralMetric"] })
                    }
                  >
                    <SelectTrigger className="bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rmsd">RMSD to reference</SelectItem>
                      <SelectItem value="radius_of_gyration">Radius of gyration</SelectItem>
                      <SelectItem value="pocket_volume">Pocket volume</SelectItem>
                      <SelectItem value="helix_content">Helix content</SelectItem>
                      <SelectItem value="contact_distance">Contact distance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="threshold">Threshold (Å)</Label>
                  <Input
                    id="threshold"
                    type="number"
                    step="0.5"
                    value={target.thresholdAngstrom}
                    onChange={(e) =>
                      setTarget({ ...target, thresholdAngstrom: Number(e.target.value) })
                    }
                    className="bg-surface font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Residue region</Label>
                  <Input
                    id="region"
                    value={target.residueRegion}
                    onChange={(e) => setTarget({ ...target, residueRegion: e.target.value })}
                    placeholder="180-215"
                    className="bg-surface font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="preserve">Preservation constraints</Label>
                <Input
                  id="preserve"
                  value={target.preservationConstraints}
                  onChange={(e) =>
                    setTarget({ ...target, preservationConstraints: e.target.value })
                  }
                  placeholder="Do not mutate S195, H57, D102"
                  className="bg-surface"
                />
              </div>
              <div className="rounded-md border border-border bg-surface p-3 text-xs">
                <p className="mb-2 font-medium">Structured objective summary</p>
                <pre className="overflow-x-auto font-mono text-[11px] text-muted-foreground">
{JSON.stringify(
  {
    target_state: target.targetStateDescription || null,
    undesired_state: target.undesiredStateDescription || null,
    metric: target.structuralMetric,
    threshold_angstrom: target.thresholdAngstrom,
    region: target.residueRegion || null,
    preserve: target.preservationConstraints || null,
  },
  null,
  2,
)}
                </pre>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                {(
                  [
                    ["populationSize", "Population size", "Individuals evaluated per generation."],
                    ["generations", "Generations", "Number of evolutionary rounds."],
                    ["maxSubstitutions", "Max substitutions", "Upper bound on mutations vs the parent sequence."],
                    ["screeningSamples", "Screening samples", "Conformations sampled per screened candidate."],
                    ["finalistSamples", "Finalist samples", "Larger budget for shortlisted candidates."],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>
                      {label}
                      <Hint text={hint} />
                    </Label>
                    <Input
                      id={key}
                      type="number"
                      min={1}
                      value={config[key]}
                      onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })}
                      className="bg-surface font-mono"
                    />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label>Mutation strategy</Label>
                  <Select
                    value={config.mutationStrategy}
                    onValueChange={(value) =>
                      setConfig({ ...config, mutationStrategy: value as SearchConfig["mutationStrategy"] })
                    }
                  >
                    <SelectTrigger className="bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative substitutions</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="exploratory">Exploratory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Diversity preference — {config.diversityPreference}%</Label>
                <Slider
                  value={[config.diversityPreference]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([value]) => setConfig({ ...config, diversityPreference: value ?? 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Higher values keep the population spread out; lower values exploit the current best
                  lineage.
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide" : "Show"} advanced settings
              </Button>
              {showAdvanced && (
                <div className="space-y-2">
                  <Label htmlFor="seed">Random seed</Label>
                  <Input
                    id="seed"
                    type="number"
                    value={config.randomSeed}
                    onChange={(e) => setConfig({ ...config, randomSeed: Number(e.target.value) })}
                    className="w-40 bg-surface font-mono"
                  />
                </div>
              )}

              <div className="rounded-md border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Provisional compute estimate</p>
                <p className="mt-1">
                  ≈ {computeEstimate} GPU-minutes on the future sampling worker. This figure is a
                  rough placeholder and must not be used for capacity planning.
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-border bg-surface p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Sequence</p>
                  <p className="mt-1 font-medium">{input.experimentName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {sequenceLength} residues · {input.referencePdbName ?? "no reference PDB"}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                    {input.sequence.replace(/\s/g, "").slice(0, 120)}…
                  </p>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Target</p>
                  <p className="mt-1 text-xs">{target.objectiveText}</p>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {target.structuralMetric} ≥ {target.thresholdAngstrom} Å · residues{" "}
                    {target.residueRegion || "unspecified"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Preserve: {target.preservationConstraints || "none declared"}
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Execution mode</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant={executionMode === "demo" ? "default" : "outline"} onClick={() => setExecutionMode("demo")}>Demo</Button>
                  <Button type="button" size="sm" variant={executionMode === "live" ? "default" : "outline"} disabled={isDemoMode} onClick={() => setExecutionMode("live")}>Live</Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{isDemoMode ? "Set VITE_API_BASE_URL to enable the local live backend." : executionMode === "live" ? "Live runs use the prepared 4AKE/1AKE chain-A benchmark. 1AKE is AP5A-bound; target preference is an experimental ProteinMPNN proxy." : "Demo results are simulated."}</p>
              </div>
              {executionMode === "live" && (
                <label className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                  <input type="checkbox" checked={Boolean(config.acknowledgeExperimentalProxy)} onChange={(event) => setConfig({ ...config, acknowledgeExperimentalProxy: event.target.checked, enableExperimentalProxySelection: event.target.checked })} />
                  I acknowledge that target preference is an unvalidated model-based backbone-compatibility proxy, not biological fitness, stability, affinity, or conformational occupancy.
                </label>
              )}
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Search configuration
                </p>
                <div className="mt-2 grid gap-2 font-mono text-[11px] text-muted-foreground sm:grid-cols-3">
                  <span>population = {config.populationSize}</span>
                  <span>generations = {config.generations}</span>
                  <span>max_substitutions = {config.maxSubstitutions}</span>
                  <span>screening_samples = {config.screeningSamples}</span>
                  <span>finalist_samples = {config.finalistSamples}</span>
                  <span>strategy = {config.mutationStrategy}</span>
                  <span>diversity = {config.diversityPreference}%</span>
                  <span>seed = {config.randomSeed}</span>
                </div>
              </div>
              <Separator />
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-warning">Scientific limitations</p>
                <p className="mt-1">
                  {executionMode === "live" ? "ProteinMPNN scores are computational compatibility proxies. They do not establish biological function, stability, affinity, free energy or conformational occupancy." : "This run is simulated: no BioEmu sampling and no Gemma agent execution take place, and all resulting metrics are illustrative."}
                </p>
              </div>
            </div>
          )}

          <Warnings items={stepWarnings[step] ?? []} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft className="size-4" /> Back
        </Button>
        {step < 3 ? (
          <Button disabled={blocking} onClick={() => setStep((s) => Math.min(3, s + 1))}>
            Continue <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={launch} disabled={launching || (executionMode === "live" && !config.acknowledgeExperimentalProxy)}>
            <Rocket className="size-4" /> {launching ? "Starting…" : executionMode === "live" ? "Start live run" : "Start demo run"}
          </Button>
        )}
      </div>
    </div>
  );
}
