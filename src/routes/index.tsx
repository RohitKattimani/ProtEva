import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/app/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "ProtEva — Agentic protein evolution research" },
    { name: "description", content: "Explore protein structural landscapes with ProtEva: an agentic research workbench for conformational search and in-silico directed evolution. Demonstration results are simulated." },
    { property: "og:title", content: "ProtEva — Evolve proteins toward the structures you seek" },
    { property: "og:description", content: "A scientific workbench for agentic protein research, evolutionary search, and transparent evidence. Explore the simulated platform." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LandingPage,
});