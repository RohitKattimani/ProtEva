import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Rocket, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, isDemoMode } from "@/lib/protein/api";
import {
  AMINO_ACIDS,
  DEFAULT_CONFIG,
  DEFAULT_TARGET,
  EXAMPLE_SEQUENCE,
} from "@/lib/protein/mock-data";
import type {
  ExperimentSearchConfig,
  LiveSearchConfig,
  MutationStrategy,
  ProtectedMotif,
  SearchConfig,
  SequenceInput,
  TargetLandscape,
} from "@/lib/protein/types";
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

/** Live-execution defaults: no BioEmu-style sample counts, seed-based ProteinMPNN scoring. */
const DEFAULT_LIVE_CONFIG: LiveSearchConfig = {
  populationSize: 8,
  generations: 1,
  maxSubstitutions: 4,
  screeningSeed: 17,
  finalistRescoreSeeds: [23, 41],
  maxFinalists: 3,
  candidateEvaluationBudget: 8,
  mutationStrategy: "balanced",
  diversityPreference: 40,
  randomSeed: 17,
  enableExperimentalProxySelection: true,
  acknowledgeExperimentalProxy: false,
};

const MUTATION_STRATEGIES: Array<{ value: MutationStrategy; label: string }> = [
  { value: "conservative", label: "Conservative substitutions" },
  { value: "balanced", label: "Balanced" },
  { value: "exploratory", label: "Exploratory" },
];

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
  const [executionMode, setExecutionMode] = useState<"demo" | "live">(isDemoMode ? "demo" : "live");

  const [input, setInput] = useState<SequenceInput>({ experimentName: "", sequence: "" });
  const [target, setTarget] = useState<TargetLandscape>({
    ...DEFAULT_TARGET,
    objectiveText: "",
    targetStateDescription: "",
  });
  const [demoConfig, setDemoConfig] = useState<SearchConfig>(DEFAULT_CONFIG);
  const [liveConfig, setLiveConfig] = useState<LiveSearchConfig>(DEFAULT_LIVE_CONFIG);
  const [protectedMotif, setProtectedMotif] = useState<ProtectedMotif | null>(null);
  const [protectedMotifError, setProtectedMotifError] = useState<string | null>(null);
  const [referenceResidueCount, setReferenceResidueCount] = useState<number | null>(null);

  const isLive = executionMode === "live";
  const config: ExperimentSearchConfig = isLive ? liveConfig : demoConfig;

  useEffect(() => {
    if (!isLive || !api.getReferences) return;
    let cancelled = false;
    api
      .getReferences()
      .then((catalog) => {
        if (cancelled) return;
        setProtectedMotif(catalog.protectedMotif);
        const target = catalog.references.find(
          (reference) => reference.pdbId === "4AKE" && reference.available,
        );
        setReferenceResidueCount(target?.residueCount ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProtectedMotifError(error instanceof Error ? error.message : "unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  const invalidChars = useMemo(() => {
    const cleaned = input.sequence.replace(/\s/g, "").toUpperCase();
    return [...new Set(cleaned.split("").filter((c) => !AMINO_ACIDS.includes(c)))];
  }, [input.sequence]);

  const sequenceLength = input.sequence.replace(/\s/g, "").length;

  const liveErrors = [
    liveConfig.populationSize < 2 || liveConfig.populationSize > 8
      ? "Live population size must be between 2 and 8."
      : "",
    liveConfig.generations < 1 || liveConfig.generations > 2
      ? "Live generations must be 1 or 2."
      : "",
    liveConfig.candidateEvaluationBudget < liveConfig.populationSize
      ? "Candidate evaluation budget must be at least the population size."
      : "",
    liveConfig.maxFinalists < 1 ? "Max finalists must be at least 1." : "",
    liveConfig.finalistRescoreSeeds.length < 1
      ? "At least one finalist rescore seed is required."
      : "",
    step === 3 && !liveConfig.acknowledgeExperimentalProxy
      ? "Acknowledge the experimental-proxy limitation before launching a live run."
      : "",
  ].filter(Boolean);

  const liveMetricWarning =
    (target.structuralMetric as string) !== "target_preference"
      ? `The live evaluator does not compute "${target.structuralMetric}". It records the ProteinMPNN target preference instead, and this run will report the requested metric as uncomputed.`
      : "";

  const liveRegionError = (() => {
    if (!isLive) return "";
    const value = target.residueRegion?.trim() ?? "";
    if (!value) return "";
    const match = /^(\d{1,4})(?:\s*-\s*(\d{1,4}))?$/.exec(value);
    if (!match) {
      return `Residue region "${value}" is not a validated range; use a start-end pair such as 118-160.`;
    }
    const end = Number(match[2] ?? match[1]);
    if (referenceResidueCount != null && end > referenceResidueCount) {
      return `Residue region "${value}" is outside the prepared 4AKE chain A numbering (1-${referenceResidueCount}).`;
    }
    return "";
  })();

  const stepWarnings: string[][] = [
    [
      !input.experimentName ? "Experiment name is required." : "",
      sequenceLength < 20 ? "Sequence should be at least 20 residues for a meaningful search." : "",
      invalidChars.length ? `Unsupported characters in sequence: ${invalidChars.join(", ")}` : "",
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
      isLive ? liveRegionError : "",
      isLive ? liveMetricWarning : "",
    ].filter(Boolean),
    isLive
      ? [
          ...liveErrors,
          protectedMotifError
            ? `Protected motif could not be read from the backend: ${protectedMotifError}`
            : "",
        ].filter(Boolean)
      : [
          demoConfig.populationSize * demoConfig.generations > 600
            ? "Large search space: compute estimates become unreliable."
            : "",
          demoConfig.finalistSamples < demoConfig.screeningSamples
            ? "Finalist sampling budget is lower than screening — rankings will stay uncertain."
            : "",
        ].filter(Boolean),
    [],
  ];

  const blocking =
    step === 0
      ? !input.experimentName || sequenceLength < 20 || invalidChars.length > 0
      : step === 1
        ? !target.objectiveText || !target.targetStateDescription || Boolean(liveRegionError)
        : step === 2 && isLive
          ? liveErrors.length > 0
          : false;

  const demoComputeEstimate = Math.round(
    (demoConfig.populationSize * demoConfig.generations * demoConfig.screeningSamples) / 600,
  );
  const liveScoringPasses =
    liveConfig.populationSize * liveConfig.generations +
    liveConfig.maxFinalists * Math.max(1, liveConfig.finalistRescoreSeeds.length);

  async function launch() {
    if (isLive && !liveConfig.acknowledgeExperimentalProxy) {
      toast.error("Acknowledge the experimental-proxy limitation before launching a live run.");
      return;
    }
    if (isLive && liveErrors.length > 0) {
      toast.error("Fix the live configuration before launching", { description: liveErrors[0] });
      return;
    }
    setLaunching(true);
    try {
      const experiment = await api.createExperiment({
        input: { ...input, sequence: input.sequence.replace(/\s/g, "").toUpperCase() },
        target,
        config,
        executionMode,
      });
      toast.success(`${isLive ? "Live" : "Demo"} run ${experiment.id} queued`, {
        description: isLive
          ? "The backend records real status and errors; the interface shows only measured values."
          : "Simulated pipeline — no sampling job was dispatched.",
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
        description="Define the protein, the desired conformational landscape and the search budget. This form validates inputs locally; the backend re-validates every field and rejects unsupported combinations instead of clamping them."
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
              <span className="font-mono">
                {index < step ? <Check className="size-3" /> : index + 1}
              </span>
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
                isLive
                  ? "Bound the live genetic algorithm and the fixed-seed ProteinMPNN scoring plan."
                  : "Bound the genetic algorithm and the simulated sampling budget.",
                "Confirm inputs before starting the run.",
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => pdbRef.current?.click()}
                  >
                    <Upload className="size-3.5" /> Upload PDB
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {input.referencePdbName ?? "No file selected"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isLive
                    ? "Live runs score against the prepared 4AKE/1AKE chain-A references on the backend; an uploaded PDB is recorded but is not used as a scoring reference."
                    : "Illustrative only in demo mode."}
                </p>
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
                      setTarget({
                        ...target,
                        structuralMetric: value as TargetLandscape["structuralMetric"],
                      })
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
                    placeholder="118-160"
                    className="bg-surface font-mono"
                  />
                  {isLive && (
                    <p className="text-[11px] text-muted-foreground">
                      Validated against the prepared 4AKE chain A numbering
                      {referenceResidueCount != null ? ` (1-${referenceResidueCount})` : ""}. It is
                      recorded but not applied as a scoring constraint.
                    </p>
                  )}
                </div>
              </div>
              {isLive && (target.structuralMetric as string) !== "target_preference" && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-warning">Requested metric will not be computed</p>
                  <p className="mt-1">
                    The live evaluator measures ProteinMPNN target preference (backbone
                    compatibility), not {target.structuralMetric.replace(/_/g, " ")}. This run will
                    record the requested metric as uncomputed rather than fabricate values.
                  </p>
                </div>
              )}
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
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Execution mode
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={executionMode === "demo" ? "default" : "outline"}
                    onClick={() => setExecutionMode("demo")}
                  >
                    Demo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={executionMode === "live" ? "default" : "outline"}
                    disabled={isDemoMode}
                    onClick={() => setExecutionMode("live")}
                  >
                    Live
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {isDemoMode
                    ? "Set VITE_API_BASE_URL to enable the local live backend."
                    : isLive
                      ? "Live runs use the prepared 4AKE/1AKE chain-A benchmark. 1AKE is AP5A-bound; target preference is an experimental ProteinMPNN proxy."
                      : "Demo results are simulated — no sampling job or agent call is dispatched."}
                </p>
              </div>
              {isLive ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="live-population">
                        Population size
                        <Hint text="Live runs support 2 to 8 candidates per generation. Values outside this range are rejected, never clamped." />
                      </Label>
                      <Input
                        id="live-population"
                        type="number"
                        min={2}
                        max={8}
                        value={liveConfig.populationSize}
                        onChange={(e) =>
                          setLiveConfig({ ...liveConfig, populationSize: Number(e.target.value) })
                        }
                        className="bg-surface font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="live-generations">
                        Generations
                        <Hint text="Live runs support 1 or 2 generations." />
                      </Label>
                      <Input
                        id="live-generations"
                        type="number"
                        min={1}
                        max={2}
                        value={liveConfig.generations}
                        onChange={(e) =>
                          setLiveConfig({ ...liveConfig, generations: Number(e.target.value) })
                        }
                        className="bg-surface font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="live-substitutions">
                        Max substitutions
                        <Hint text="Upper bound on mutations vs the parent sequence." />
                      </Label>
                      <Input
                        id="live-substitutions"
                        type="number"
                        min={0}
                        value={liveConfig.maxSubstitutions}
                        onChange={(e) =>
                          setLiveConfig({ ...liveConfig, maxSubstitutions: Number(e.target.value) })
                        }
                        className="bg-surface font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="live-budget">
                        Candidate evaluation budget
                        <Hint text="Maximum number of ProteinMPNN scoring passes the run may spend." />
                      </Label>
                      <Input
                        id="live-budget"
                        type="number"
                        min={1}
                        value={liveConfig.candidateEvaluationBudget}
                        onChange={(e) =>
                          setLiveConfig({
                            ...liveConfig,
                            candidateEvaluationBudget: Number(e.target.value),
                          })
                        }
                        className="bg-surface font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="live-max-finalists">
                        Max finalists
                        <Hint text="Shortlisted candidates re-scored under every finalist seed." />
                      </Label>
                      <Input
                        id="live-max-finalists"
                        type="number"
                        min={1}
                        value={liveConfig.maxFinalists}
                        onChange={(e) =>
                          setLiveConfig({ ...liveConfig, maxFinalists: Number(e.target.value) })
                        }
                        className="bg-surface font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="live-screening-seed">
                        Screening seed
                        <Hint text="Fixed seed for the ProteinMPNN screen pass; results are reproducible." />
                      </Label>
                      <Input
                        id="live-screening-seed"
                        type="number"
                        value={liveConfig.screeningSeed}
                        onChange={(e) =>
                          setLiveConfig({ ...liveConfig, screeningSeed: Number(e.target.value) })
                        }
                        className="bg-surface font-mono"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="live-finalist-seeds">
                        Finalist rescore seeds
                        <Hint text="Comma-separated fixed seeds used to audit finalist robustness." />
                      </Label>
                      <Input
                        id="live-finalist-seeds"
                        value={liveConfig.finalistRescoreSeeds.join(", ")}
                        onChange={(e) =>
                          setLiveConfig({
                            ...liveConfig,
                            finalistRescoreSeeds: e.target.value
                              .split(",")
                              .map((token) => Number(token.trim()))
                              .filter((value) => Number.isFinite(value)),
                          })
                        }
                        className="bg-surface font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mutation strategy</Label>
                      <Select
                        value={liveConfig.mutationStrategy}
                        onValueChange={(value) =>
                          setLiveConfig({
                            ...liveConfig,
                            mutationStrategy: value as MutationStrategy,
                          })
                        }
                      >
                        <SelectTrigger className="bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MUTATION_STRATEGIES.map((strategy) => (
                            <SelectItem key={strategy.value} value={strategy.value}>
                              {strategy.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Diversity preference — {liveConfig.diversityPreference}%</Label>
                    <Slider
                      value={[liveConfig.diversityPreference]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([value]) =>
                        setLiveConfig({ ...liveConfig, diversityPreference: value ?? 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher values keep the population spread out; lower values exploit the current
                      best lineage.
                    </p>
                  </div>

                  <div className="rounded-md border border-border bg-surface p-3 text-xs">
                    <p className="font-medium">Protected P-loop motif</p>
                    {protectedMotif ? (
                      <>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {protectedMotif.name} · residues {protectedMotif.positions[0]}–
                          {protectedMotif.positions[protectedMotif.positions.length - 1]} ·{" "}
                          {protectedMotif.residues}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {protectedMotif.source}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {protectedMotifError
                          ? `Unavailable: ${protectedMotifError}`
                          : "Reading authoritative motif from the prepared 4AKE chain A…"}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      The backend enforces these positions from authoritative annotations; the
                      interface cannot weaken this constraint.
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
                      <Label htmlFor="live-random-seed">Random seed</Label>
                      <Input
                        id="live-random-seed"
                        type="number"
                        value={liveConfig.randomSeed}
                        onChange={(e) =>
                          setLiveConfig({ ...liveConfig, randomSeed: Number(e.target.value) })
                        }
                        className="w-40 bg-surface font-mono"
                      />
                    </div>
                  )}

                  <div className="rounded-md border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Live scoring plan</p>
                    <p className="mt-1">
                      ≈ {liveScoringPasses} ProteinMPNN scoring passes within a budget of{" "}
                      {liveConfig.candidateEvaluationBudget}. These are local model evaluations, not
                      BioEmu conformational samples.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(
                      [
                        [
                          "populationSize",
                          "Population size",
                          "Individuals evaluated per generation.",
                        ],
                        ["generations", "Generations", "Number of evolutionary rounds."],
                        [
                          "maxSubstitutions",
                          "Max substitutions",
                          "Upper bound on mutations vs the parent sequence.",
                        ],
                        [
                          "screeningSamples",
                          "Screening samples",
                          "Conformations sampled per screened candidate.",
                        ],
                        [
                          "finalistSamples",
                          "Finalist samples",
                          "Larger budget for shortlisted candidates.",
                        ],
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
                          value={demoConfig[key]}
                          onChange={(e) =>
                            setDemoConfig({ ...demoConfig, [key]: Number(e.target.value) })
                          }
                          className="bg-surface font-mono"
                        />
                      </div>
                    ))}
                    <div className="space-y-2">
                      <Label>Mutation strategy</Label>
                      <Select
                        value={demoConfig.mutationStrategy}
                        onValueChange={(value) =>
                          setDemoConfig({
                            ...demoConfig,
                            mutationStrategy: value as SearchConfig["mutationStrategy"],
                          })
                        }
                      >
                        <SelectTrigger className="bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MUTATION_STRATEGIES.map((strategy) => (
                            <SelectItem key={strategy.value} value={strategy.value}>
                              {strategy.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Diversity preference — {demoConfig.diversityPreference}%</Label>
                    <Slider
                      value={[demoConfig.diversityPreference]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([value]) =>
                        setDemoConfig({ ...demoConfig, diversityPreference: value ?? 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher values keep the population spread out; lower values exploit the current
                      best lineage.
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
                        value={demoConfig.randomSeed}
                        onChange={(e) =>
                          setDemoConfig({ ...demoConfig, randomSeed: Number(e.target.value) })
                        }
                        className="w-40 bg-surface font-mono"
                      />
                    </div>
                  )}

                  <div className="rounded-md border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Provisional compute estimate</p>
                    <p className="mt-1">
                      ≈ {demoComputeEstimate} GPU-minutes on the future sampling worker. This figure
                      is a rough placeholder and must not be used for capacity planning.
                    </p>
                  </div>
                </>
              )}
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
                    {isLive
                      ? `${target.structuralMetric} (not computed in live mode) · residues ${target.residueRegion || "unspecified"} (recorded, not applied)`
                      : `${target.structuralMetric} ≥ ${target.thresholdAngstrom} Å · residues ${target.residueRegion || "unspecified"}`}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Preserve: {target.preservationConstraints || "none declared"}
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Execution mode
                </p>
                <p className="mt-1 text-sm font-medium">
                  {isLive ? "Live computational run" : "Simulated demo run"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isDemoMode
                    ? "Set VITE_API_BASE_URL to enable the local live backend."
                    : isLive
                      ? "Live runs use the prepared 4AKE/1AKE chain-A benchmark. 1AKE is AP5A-bound; target preference is an experimental ProteinMPNN proxy."
                      : "Demo results are simulated."}
                </p>
              </div>
              {isLive && (
                <label className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={liveConfig.acknowledgeExperimentalProxy}
                    onChange={(event) =>
                      setLiveConfig({
                        ...liveConfig,
                        acknowledgeExperimentalProxy: event.target.checked,
                        enableExperimentalProxySelection: event.target.checked,
                      })
                    }
                  />
                  I acknowledge that target preference is an unvalidated model-based
                  backbone-compatibility proxy, not biological fitness, stability, affinity, or
                  conformational occupancy.
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
                  {isLive ? (
                    <>
                      <span>screening_seed = {liveConfig.screeningSeed}</span>
                      <span>finalist_seeds = [{liveConfig.finalistRescoreSeeds.join(", ")}]</span>
                      <span>max_finalists = {liveConfig.maxFinalists}</span>
                      <span>evaluation_budget = {liveConfig.candidateEvaluationBudget}</span>
                    </>
                  ) : (
                    <>
                      <span>screening_samples = {demoConfig.screeningSamples}</span>
                      <span>finalist_samples = {demoConfig.finalistSamples}</span>
                    </>
                  )}
                  <span>strategy = {config.mutationStrategy}</span>
                  <span>diversity = {config.diversityPreference}%</span>
                  <span>seed = {config.randomSeed}</span>
                </div>
              </div>
              <Separator />
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-warning">Scientific limitations</p>
                <p className="mt-1">
                  {executionMode === "live"
                    ? "ProteinMPNN scores are computational compatibility proxies. They do not establish biological function, stability, affinity, free energy or conformational occupancy."
                    : "This run is simulated: no BioEmu sampling and no Gemma agent execution take place, and all resulting metrics are illustrative."}
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
          <Button
            onClick={launch}
            disabled={launching || (isLive && !liveConfig.acknowledgeExperimentalProxy)}
          >
            <Rocket className="size-4" />{" "}
            {launching ? "Starting…" : isLive ? "Start live run" : "Start demo run"}
          </Button>
        )}
      </div>
    </div>
  );
}
