// Deterministic illustrative data for ProtEva demo mode.
// Nothing here is a real measurement: no BioEmu sampling or Gemma call produced it.
import type {
  Agent,
  AgentEvent,
  Artifact,
  Candidate,
  Experiment,
  GenerationStat,
  SearchConfig,
  TargetLandscape,
} from "./types";

export const AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY";

export const EXAMPLE_SEQUENCE =
  "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWSTPSELGHAGLNGDILVWNPVLEDAFELSSMGIRVDADTLKHQLALTGDEDRLELEWHQALLRGEMPQTIGGGIGQSRLTMLLLQLPHIGQVQAGVWPAAVRESVPSLL";

export function seededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export const DEFAULT_CONFIG: SearchConfig = {
  populationSize: 24,
  generations: 12,
  maxSubstitutions: 4,
  screeningSamples: 64,
  finalistSamples: 256,
  mutationStrategy: "balanced",
  diversityPreference: 55,
  randomSeed: 42,
};

export const DEFAULT_TARGET: TargetLandscape = {
  objectiveText:
    "Increase the population of the open-pocket conformation while preserving the catalytic triad geometry.",
  targetStateDescription: "Open substrate pocket, lid helix displaced > 6 Å from closed reference.",
  undesiredStateDescription: "Fully collapsed pocket (closed reference state).",
  structuralMetric: "rmsd",
  thresholdAngstrom: 6,
  residueRegion: "180-215",
  preservationConstraints: "Do not mutate catalytic residues S195, H57, D102.",
};

export function buildGenerationStats(seed: number, generations: number): GenerationStat[] {
  const rand = seededRandom(seed);
  const stats: GenerationStat[] = [];
  let best = 0.32;
  let avg = 0.18;
  let diversity = 0.82;
  for (let g = 1; g <= generations; g += 1) {
    best = Math.min(0.94, best + rand() * 0.07);
    avg = Math.min(best - 0.03, avg + rand() * 0.06);
    diversity = Math.max(0.18, diversity - rand() * 0.06);
    stats.push({
      generation: g,
      bestScore: Number(best.toFixed(3)),
      averageScore: Number(avg.toFixed(3)),
      diversity: Number(diversity.toFixed(3)),
    });
  }
  return stats;
}

function mutateSequence(sequence: string, seed: number, count: number) {
  const rand = seededRandom(seed);
  const chars = sequence.split("");
  const mutations: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const pos = Math.floor(rand() * chars.length);
    const from = chars[pos];
    const to = AMINO_ACIDS[Math.floor(rand() * AMINO_ACIDS.length)];
    if (!from || !to || from === to) continue;
    chars[pos] = to;
    mutations.push(`${from}${pos + 1}${to}`);
  }
  return { sequence: chars.join(""), mutations };
}

export function buildCandidates(
  experimentId: string,
  sequence: string,
  seed: number,
  generations: number,
  populationSize: number,
): Candidate[] {
  const rand = seededRandom(seed + 7);
  const candidates: Candidate[] = [];
  const perGeneration = Math.max(4, Math.round(populationSize / 3));

  for (let g = 1; g <= generations; g += 1) {
    for (let i = 0; i < perGeneration; i += 1) {
      const index = candidates.length + 1;
      const id = `${experimentId}-C${String(index).padStart(3, "0")}`;
      const parentPool = candidates.filter((c) => c.generation === g - 1);
      const parent = parentPool.length
        ? parentPool[Math.floor(rand() * parentPool.length)]
        : null;
      const base = parent ? parent.sequence : sequence;
      const mutationCount = 1 + Math.floor(rand() * 3);
      const { sequence: mutated, mutations } = mutateSequence(base, seed + index * 13, mutationCount);
      const evaluated = rand() > 0.12;
      const score = evaluated ? Number((0.2 + rand() * 0.75).toFixed(3)) : null;
      const occupancy = evaluated ? Number((0.15 + rand() * 0.7).toFixed(3)) : 0;
      const uncertainty = Number((0.02 + rand() * 0.09).toFixed(3));
      const flagged = evaluated && uncertainty > 0.08;
      candidates.push({
        id,
        experimentId,
        parentId: parent ? parent.id : null,
        generation: g,
        mutations: [...(parent?.mutations ?? []), ...mutations].slice(-6),
        sequence: mutated,
        objectiveScore: score,
        evaluationStatus: evaluated ? "evaluated" : rand() > 0.5 ? "screening" : "pending",
        auditStatus: flagged ? "flagged" : evaluated ? "confirmed" : "unreviewed",
        diversityScore: Number((0.2 + rand() * 0.7).toFixed(3)),
        metrics: evaluated
          ? {
              targetOccupancy: occupancy,
              offTargetOccupancy: Number(Math.max(0, 0.9 - occupancy - rand() * 0.2).toFixed(3)),
              rmsdAngstrom: Number((2 + rand() * 8).toFixed(2)),
              radiusOfGyration: Number((17 + rand() * 4).toFixed(2)),
              sampleCount: rand() > 0.6 ? 256 : 64,
              uncertainty,
            }
          : null,
        warnings: flagged
          ? ["Occupancy uncertainty exceeds 0.08 — demo sampling budget is low for this candidate."]
          : [],
      });
    }
  }
  return candidates;
}

export const AGENTS: Agent[] = [
  {
    id: "landscape-interpreter",
    name: "Landscape Interpreter",
    role: "Objective understanding",
    description:
      "Converts the natural-language objective into a structured, checkable target-state definition.",
    tools: ["parse_objective", "resolve_residue_region", "check_constraint_conflicts"],
    status: "done",
    currentTask: "Objective parsed into structured target definition",
    lastActivity: "Confirmed metric RMSD with 6 Å threshold over residues 180-215",
  },
  {
    id: "search-strategist",
    name: "Search Strategist",
    role: "Search planning",
    description: "Proposes a bounded genetic-algorithm plan within the declared compute budget.",
    tools: ["propose_search_plan", "estimate_budget", "validate_bounds"],
    status: "done",
    currentTask: "Bounded plan accepted: 12 generations × 24 individuals",
    lastActivity: "Capped substitutions at 4 to keep variants near the parent sequence",
  },
  {
    id: "evolution-coordinator",
    name: "Evolution Coordinator",
    role: "Task delegation",
    description: "Runs the generation loop and delegates candidate evaluations to workers.",
    tools: ["run_generation", "delegate_evaluation", "request_additional_sampling"],
    status: "working",
    currentTask: "Delegating generation 9 finalist evaluations",
    lastActivity: "Requested 256-sample re-evaluation for 3 flagged finalists",
  },
  {
    id: "ensemble-analysis-worker",
    name: "Ensemble Analysis Worker",
    role: "Structural analysis",
    description:
      "Runs deterministic structural analysis over sampled ensembles. Does not infer values.",
    tools: ["sample_ensemble", "compute_rmsd", "compute_occupancy", "compute_radius_of_gyration"],
    status: "working",
    currentTask: "Computing occupancy for 8 candidates",
    lastActivity: "Returned illustrative metric table for generation 8",
  },
  {
    id: "scientific-auditor",
    name: "Scientific Auditor",
    role: "Result auditing",
    description: "Checks rankings against sample counts, uncertainty, and declared constraints.",
    tools: ["check_uncertainty", "verify_constraints", "flag_ranking"],
    status: "waiting",
    currentTask: "Awaiting re-sampled finalist metrics",
    lastActivity: "Flagged 3 rankings as statistically indistinguishable",
  },
  {
    id: "report-agent",
    name: "Report Agent",
    role: "Evidence reporting",
    description: "Assembles the evidence summary separating inputs, measurements and limitations.",
    tools: ["collect_artifacts", "compose_report", "export_bundle"],
    status: "idle",
    currentTask: "Report draft pending audit sign-off",
    lastActivity: "Prepared artifact index for export",
  },
];

export function buildAgentEvents(experimentId: string, seed: number): AgentEvent[] {
  const start = Date.UTC(2026, 9, 16, 6, 0, 0);
  const script: Array<Omit<AgentEvent, "id" | "experimentId" | "timestamp">> = [
    {
      from: "landscape-interpreter",
      to: "system",
      kind: "tool_call",
      summary: "parse_objective(objective_text)",
      detail: "Structured the objective into target state, metric, threshold and residue region.",
      payload: { metric: "rmsd", threshold_angstrom: 6, region: "180-215" },
    },
    {
      from: "landscape-interpreter",
      to: "search-strategist",
      kind: "result",
      summary: "Objective validated — target definition is checkable",
      detail: "No conflicts between preservation constraints and the mutable region.",
    },
    {
      from: "search-strategist",
      to: "evolution-coordinator",
      kind: "delegation",
      summary: "Bounded search plan delegated",
      payload: { generations: 12, population: 24, max_substitutions: 4 },
    },
    {
      from: "evolution-coordinator",
      to: "ensemble-analysis-worker",
      kind: "delegation",
      summary: "Evaluate generation 8 population (24 candidates)",
      payload: { screening_samples: 64 },
    },
    {
      from: "ensemble-analysis-worker",
      to: "evolution-coordinator",
      kind: "result",
      summary: "Illustrative structural metrics returned for 24 candidates",
      detail:
        "Demonstration values only — no BioEmu sampling was executed for this run.",
      payload: { best_target_occupancy: 0.71, mean_uncertainty: 0.06 },
    },
    {
      from: "scientific-auditor",
      to: "evolution-coordinator",
      kind: "validation_warning",
      summary: "3 finalist rankings are statistically indistinguishable",
      detail: "Occupancy differences fall inside the reported uncertainty at 64 samples.",
    },
    {
      from: "evolution-coordinator",
      to: "ensemble-analysis-worker",
      kind: "decision",
      summary: "Requested additional finalist sampling (256 samples)",
      payload: { candidates: 3, finalist_samples: 256 },
    },
    {
      from: "ensemble-analysis-worker",
      to: "scientific-auditor",
      kind: "result",
      summary: "Re-sampled finalist metrics delivered",
      payload: { sample_count: 256, mean_uncertainty: 0.03 },
    },
    {
      from: "scientific-auditor",
      to: "report-agent",
      kind: "decision",
      summary: "Ranking confirmed for 2 of 3 finalists",
      detail: "One candidate remains flagged pending a larger sample budget.",
    },
    {
      from: "report-agent",
      to: "user",
      kind: "message",
      summary: "Evidence summary prepared with limitations section",
      detail:
        "Report separates user inputs, recorded settings, demonstration values and limitations.",
    },
  ];

  const rand = seededRandom(seed + 3);
  return script.map((event, index) => ({
    ...event,
    id: `${experimentId}-E${String(index + 1).padStart(3, "0")}`,
    experimentId,
    timestamp: new Date(start + index * (90_000 + Math.floor(rand() * 60_000))).toISOString(),
  }));
}

export function buildArtifacts(experimentId: string): Artifact[] {
  const now = new Date(Date.UTC(2026, 9, 16, 6, 30)).toISOString();
  return [
    { kind: "input_fasta", name: "input_sequence.fasta", sizeLabel: "1.2 KB", downloadable: true },
    {
      kind: "reference_pdb",
      name: "reference_structure.pdb",
      sizeLabel: "—",
      downloadable: false,
      note: "No reference structure uploaded in this demo run.",
    },
    { kind: "candidate_fasta", name: "candidates.fasta", sizeLabel: "48 KB", downloadable: true },
    {
      kind: "sampled_structures",
      name: "ensembles/",
      sizeLabel: "—",
      downloadable: false,
      note: "Structural ensembles require the BioEmu worker, which is not connected.",
    },
    { kind: "metric_table", name: "metrics.csv", sizeLabel: "12 KB", downloadable: true },
    { kind: "config", name: "experiment_config.json", sizeLabel: "2 KB", downloadable: true },
    { kind: "event_log", name: "agent_events.json", sizeLabel: "9 KB", downloadable: true },
    { kind: "report", name: "report.md", sizeLabel: "6 KB", downloadable: true },
  ].map((a, i) => ({
    id: `${experimentId}-A${i + 1}`,
    experimentId,
    createdAt: now,
    ...a,
  })) as Artifact[];
}

export function buildSeedExperiments(): Experiment[] {
  const presets: Array<{
    id: string;
    name: string;
    status: Experiment["status"];
    generation: number;
    createdAt: string;
    seed: number;
  }> = [
    {
      id: "EXP-1042",
      name: "Protease lid-opening sweep",
      status: "completed",
      generation: 12,
      createdAt: "2026-10-12T09:14:00.000Z",
      seed: 42,
    },
    {
      id: "EXP-1043",
      name: "Kinase DFG-out stabilisation",
      status: "evaluating",
      generation: 7,
      createdAt: "2026-10-14T11:02:00.000Z",
      seed: 77,
    },
    {
      id: "EXP-1044",
      name: "Transporter occluded-state bias",
      status: "auditing",
      generation: 9,
      createdAt: "2026-10-15T15:40:00.000Z",
      seed: 91,
    },
    {
      id: "EXP-1045",
      name: "Nanobody loop flexibility probe",
      status: "failed",
      generation: 3,
      createdAt: "2026-10-15T20:12:00.000Z",
      seed: 13,
    },
  ];

  return presets.map((preset) => {
    const config = { ...DEFAULT_CONFIG, randomSeed: preset.seed };
    const stats = buildGenerationStats(preset.seed, preset.generation);
    const candidates = buildCandidates(
      preset.id,
      EXAMPLE_SEQUENCE,
      preset.seed,
      preset.generation,
      config.populationSize,
    );
    return {
      id: preset.id,
      name: preset.name,
      status: preset.status,
      createdAt: preset.createdAt,
      sequence: EXAMPLE_SEQUENCE,
      input: {
        experimentName: preset.name,
        sequence: EXAMPLE_SEQUENCE,
      },
      target: DEFAULT_TARGET,
      config,
      currentGeneration: preset.generation,
      candidateCount: candidates.length,
      requiresReview: candidates.filter((c) => c.auditStatus === "flagged").length,
      generationStats: stats,
      warnings:
        preset.status === "failed"
          ? ["Demo run stopped: simulated sampling worker became unreachable at generation 3."]
          : ["Rankings within 0.05 objective score are not separable at the demo sample budget."],
      simulated: true as const,
      executionMode: "demo" as const,
    };
  });
}
