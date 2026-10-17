import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/documentation")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Documentation · ProtEva" },
      {
        name: "description",
        content:
          "How the ProtEva pipeline divides work between agents, the genetic algorithm, structural sampling and deterministic evaluation.",
      },
      { property: "og:title", content: "Documentation · ProtEva" },
      { property: "og:description", content: "Pipeline, metrics and limitations of the ProtEva workspace." },
    ],
  }),
  component: Documentation,
});

const SECTIONS = [
  {
    title: "Pipeline responsibilities",
    body: [
      "The genetic algorithm proposes sequence variants under the declared substitution bounds.",
      "Microsoft BioEmu samples conformational ensembles for each proposed sequence.",
      "Deterministic scientific code computes structural metrics, target-state occupancy and uncertainty.",
      "Gemma agents coordinate the workflow: they interpret objectives, delegate tasks and audit evidence. They never produce scientific measurements.",
    ],
  },
  {
    title: "Metric definitions",
    body: [
      "Target occupancy — fraction of sampled conformations satisfying the target-state definition.",
      "Off-target occupancy — fraction matching the declared undesired reference state.",
      "RMSD — root-mean-square deviation of backbone atoms against the reference structure, in Ångström.",
      "Radius of gyration — compactness of the sampled conformation.",
      "Uncertainty — spread of the occupancy estimate at the given sample count. Rankings inside this interval are not separable.",
    ],
  },
  {
    title: "Demo mode",
    body: [
      "Without VITE_API_BASE_URL the workspace runs a MockApiClient that simulates the run state machine in the browser.",
      "All numbers shown in demo mode are illustrative placeholders, not measurements.",
      "Failed requests against a real backend are surfaced as errors and are never replaced by mock data.",
    ],
  },
  {
    title: "Intended production architecture",
    body: [
      "Vercel hosts the React frontend.",
      "A FastAPI service owns the experiment API, Gemma orchestration and the genetic algorithm.",
      "A remote Linux/GPU worker runs BioEmu structural sampling as asynchronous jobs.",
      "Persistent storage keeps experiment metadata, ensemble artifacts and reports.",
    ],
  },
  {
    title: "Scientific limitations",
    body: [
      "Computational conformational predictions do not establish biological function, stability or safety.",
      "Any candidate of interest requires wet-lab validation.",
      "No result in this interface may be cited as experimental evidence while demo mode is active.",
    ],
  },
];

function Documentation() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Documentation"
        description="What ProtEva computes, what it coordinates and what it cannot claim."
      />
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <CardDescription>Reference</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {section.body.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
