import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  Dna,
  GitBranch,
  Layers,
  Menu,
  Microscope,
  ScrollText,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProteinMark } from "./ProteinMark";
import { MolecularCanvas } from "./MolecularCanvas";
import { ObjectiveChart } from "./Charts";
import { isDemoMode } from "@/lib/protein/api";
import { useExperimentEvents, useExperiments } from "@/lib/protein/hooks";
import { actorLabel } from "@/lib/protein/format";

const steps = [
  {
    title: "Define a target landscape.",
    detail:
      "Describe the conformations you want to favor, the states you want to avoid, and the constraints that matter.",
    tag: "INPUT / SEQUENCE + OBJECTIVE",
    icon: Dna,
  },
  {
    title: "Orchestrate specialized AI agents.",
    detail:
      "A proposed team of interpreters, strategists, coordinators and auditors translates a research objective into a traceable search.",
    tag: "GEMMA 4 AGENTS",
    icon: Bot,
  },
  {
    title: "Evolve candidate sequences.",
    detail:
      "Explore substitutions across successive generations, preserving lineage and explicit mutation constraints.",
    tag: "SEARCH / GENETIC ALGORITHM",
    icon: GitBranch,
  },
  {
    title: "Sample conformations using BioEmu.",
    detail:
      "The planned BioEmu worker would generate conformational ensembles. Sampling is not connected in this demonstration.",
    tag: "CONFORMATIONAL SAMPLING",
    icon: Microscope,
  },
  {
    title: "Evaluate and audit candidates.",
    detail:
      "Compare candidates with explicit uncertainty, distinguish interpretations from evidence, and export reproducible experiment records.",
    tag: "OUTPUT / RANKINGS + AUDIT TRAIL",
    icon: ScrollText,
  },
];

export function LandingPage() {
  const [step, setStep] = useState(0);
  const [menu, setMenu] = useState(false);
  const { data: experiments } = useExperiments();
  const featured = experiments?.find((e) => e.generationStats.length > 0);
  const { data: events } = useExperimentEvents(featured?.id ?? "");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const currentStep = steps[step] ?? steps[0];
  if (!currentStep) return null;
  const nav = (
    <>
      <a href="#platform" onClick={() => setMenu(false)}>
        Platform
      </a>
      <a href="#workflow" onClick={() => setMenu(false)}>
        How It Works
      </a>
      <a href="#integrity" onClick={() => setMenu(false)}>
        Scientific Approach
      </a>
      <Link to="/documentation">Documentation</Link>
    </>
  );
  return (
    <div className="landing">
      <header className="public-nav">
        <Link to="/" className="wordmark">
          <ProteinMark />
          ProtEva
        </Link>
        <nav className="public-links">{nav}</nav>
        <Button asChild className="launch-button">
          <Link to="/overview">
            Launch ProtEva <ArrowUpRight className="size-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="public-menu"
          aria-label={menu ? "Close menu" : "Open menu"}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </Button>
        {menu && <nav className="mobile-public-links">{nav}</nav>}
      </header>
      <section className="landing-hero">
        <div className="hero-grid" aria-hidden="true" />
        <MolecularCanvas className="hero-molecule" />
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="signal-line" /> AGENTIC PROTEIN RESEARCH
          </p>
          <h1>
            Evolve proteins
            <br />
            toward the structures
            <br />
            <span>you seek.</span>
          </h1>
          <p className="hero-description">
            An agentic protein research platform combining generative conformational sampling,
            evolutionary search, and collaborative AI to explore protein structural landscapes.
          </p>
          <div className="hero-actions">
            <Button asChild size="lg">
              <Link to="/overview">
                Explore the Platform <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <a href="#workflow">
                See How It Works <ArrowDown className="size-4" />
              </a>
            </Button>
          </div>
          <p className="pipeline-note">
            Gemma 4 · BioEmu research pipeline <span>PLANNED INTEGRATIONS</span>
          </p>
        </div>
        <div className="hero-bottom">
          <span className="demo-label">PROTEIN DESIGN WORKBENCH</span>
          <span>SEQUENCE → LANDSCAPE → EVOLUTION</span>
          <a href="#platform" aria-label="Discover ProtEva">
            <ArrowDown className="size-4" />
          </a>
        </div>
      </section>
      <section id="platform" className="editorial-section light-section problem-section">
        <div className="section-number">01 / A DIFFERENT SEARCH SPACE</div>
        <div className="problem-layout reveal">
          <h2>
            Protein evolution
            <br />
            is a search problem.
          </h2>
          <div>
            <p className="editorial-lead">
              A sequence is a starting point.
              <br />A landscape is the destination.
            </p>
            <p>
              Candidates must be explored, their conformational ensembles evaluated, and each
              decision placed in context. ProtEva brings that search into one deliberate research
              environment.
            </p>
            <div className="landscape-diagram" aria-label="Conceptual energy landscape diagram">
              <svg viewBox="0 0 500 150" fill="none">
                <path
                  d="M0 30C50 30 40 130 90 125S145 40 175 60 210 140 255 115 275 20 320 35 370 145 410 130 450 65 500 65"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M0 145H500M90 10V145M255 10V145M410 10V145"
                  className="diagram-grid"
                  strokeWidth="1"
                  strokeDasharray="3 5"
                />
                <circle cx="410" cy="130" r="5" className="diagram-target" />
              </svg>
              <div>
                <span>SEQUENCE SPACE</span>
                <span>TARGET BASIN ↗</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="workflow" className="editorial-section workflow-section">
        <div className="section-number">02 / FROM INTENT TO EVIDENCE</div>
        <div className="section-heading reveal">
          <h2>
            A search with direction.
            <br />
            At every generation.
          </h2>
          <p>
            One connected workflow.
            <br />
            Every decision leaves a trace.
          </p>
        </div>
        <div className="workflow-tabs" role="tablist" aria-label="Research workflow">
          {steps.map((item, i) => (
            <Button
              key={item.title}
              variant="ghost"
              role="tab"
              aria-selected={step === i}
              aria-controls="workflow-panel"
              id={`workflow-tab-${i}`}
              onClick={() => setStep(i)}
              className={step === i ? "workflow-tab selected" : "workflow-tab"}
            >
              <span>0{i + 1}</span>
              {item.title}
              <ArrowRight className="size-4" />
            </Button>
          ))}
        </div>
        <div
          id="workflow-panel"
          role="tabpanel"
          aria-labelledby={`workflow-tab-${step}`}
          className="workflow-detail"
        >
          <div className="workflow-glyph">
            {(() => {
              const Icon = currentStep.icon ?? GitBranch;
              return <Icon className="size-5" strokeWidth={0.8} />;
            })()}
            <span>0{step + 1}</span>
          </div>
          <div key={step} className="workflow-detail-copy">
            <p className="eyebrow">{currentStep.tag}</p>
            <h3>{currentStep.title}</h3>
            <p>{currentStep.detail}</p>
            <Link to="/experiments/new">
              Start an experiment <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <span className="workflow-watermark">
            INTENT
            <br />
            BECOMES
            <br />
            EXPLORATION.
          </span>
        </div>
      </section>
      <section id="engine" className="editorial-section engine-section">
        <div className="section-number">03 / INSIDE THE RESEARCH ENGINE</div>
        <div className="section-heading reveal">
          <h2>
            Not a black box.
            <br />A scientific workbench.
          </h2>
          <Button asChild variant="outline">
            <Link
              to="/experiments/$experimentId"
              params={{ experimentId: featured?.id ?? experiments?.[0]?.id ?? "" }}
            >
              Enter the workspace <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="engine-preview reveal">
          <div className="preview-bar">
            <span className="wordmark">
              <ProteinMark className="size-5" />
              ProtEva <span className="preview-divider">/</span>{" "}
              <span className="preview-title">{featured?.name ?? "Conformational search"}</span>
            </span>
            <span className="demo-label">RESEARCH WORKSPACE</span>
          </div>
          <div className="preview-body">
            <div className="preview-structure">
              <p className="eyebrow">CONFORMATIONAL EXPLORATION</p>
              <MolecularCanvas compact />
              <Link
                to="/experiments/$experimentId"
                params={{ experimentId: featured?.id ?? experiments?.[0]?.id ?? "" }}
              >
                Inspect the landscape <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div className="preview-analysis">
              <div className="preview-chart">
                <p className="eyebrow">EVOLUTION OVERVIEW</p>
                {featured && <ObjectiveChart data={featured.generationStats} height={170} />}
              </div>
              <div className="preview-trace">
                <Link to="/agents" className="eyebrow">
                  AGENT COMMUNICATION <ArrowUpRight className="size-3" />
                </Link>
                {events?.slice(-3).map((event) => (
                  <div key={event.id}>
                    <span className="trace-node" />
                    <p>
                      {actorLabel(event.from)} <ArrowRight className="size-3" />{" "}
                      {actorLabel(event.to)}
                    </p>
                    <span>{event.summary}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="editorial-section light-section capabilities-section">
        <div className="section-number">04 / DESIGNED FOR SCIENTIFIC EXPLORATION</div>
        <div className="capabilities-layout reveal">
          <div>
            <h2>
              Complex science.
              <br />
              Clear instruments.
            </h2>
            <p className="capabilities-intro">
              From the first question to the final report, keep the research objective in focus.
            </p>
            <div className="sequence-art">
              <span>VARIANT / CONCEPTUAL</span>
              <p>
                MK<span>V</span>IL<span>A</span>GL<span>F</span>V<br />
                AT<span>G</span>QA<span>L</span>G<span>S</span>DK
              </p>
              <div>
                <GitBranch className="size-4" /> MUTATION → SELECTION → EVOLUTION
              </div>
            </div>
          </div>
          <div className="capability-list">
            {[
              [
                "01",
                "Natural-language landscapes",
                "Specify the target in your own words. Keep structural constraints explicit.",
              ],
              [
                "02",
                "A collaborative agent workflow",
                "Follow specialized roles, recorded delegations, and visible tool evidence.",
              ],
              [
                "03",
                "Evolution, with a lineage",
                "Explore genetic algorithm-driven mutations without losing their history.",
              ],
              [
                "04",
                "Ensembles, not a single snapshot",
                "A planned sampling pipeline for exploring conformational populations.",
              ],
              [
                "05",
                "Uncertainty in the foreground",
                "Consider distributions, audit flags, and uncertainty alongside candidate rankings.",
              ],
              [
                "06",
                "Reproducible experiment reports",
                "Export sequences, configurations, metrics, and recorded decisions.",
              ],
            ].map(([n, title, text]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <ArrowUpRight className="size-4" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="integrity" className="editorial-section integrity-section">
        <div className="section-number">05 / SCIENTIFIC INTEGRITY</div>
        <div className="integrity-layout reveal">
          <h2>
            Evidence is not
            <br />
            an interpretation.
          </h2>
          <div>
            <p className="editorial-lead">
              Different claims deserve
              <br />
              different kinds of evidence.
            </p>
            <p>
              Proposed sequences, model-generated samples, measured metrics, and agent
              interpretations are distinct. ProtEva is designed to keep their provenance visible—not
              to collapse them into a confident score.
            </p>
            <div className="evidence-line">
              {[
                "Proposed sequence",
                "Structural sample",
                "Measured metric",
                "Agent interpretation",
              ].map((label) => (
                <span key={label}>
                  <Check className="size-3" />
                  {label}
                </span>
              ))}
            </div>
            <p className="integrity-disclaimer">
              This is a demonstration workspace. All results are simulated. Gemma 4 and BioEmu
              integrations are planned, not connected; no biological validation is claimed.
            </p>
          </div>
        </div>
      </section>
      <section className="final-section">
        <ProteinMark />
        <p className="eyebrow">THE NEXT GENERATION STARTS WITH A QUESTION.</p>
        <h2>
          Give your next protein
          <br />
          search a direction.
        </h2>
        <Button asChild size="lg">
          <Link to="/overview">
            Open ProtEva <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </section>
      <footer className="public-footer">
        <Link to="/" className="wordmark">
          <ProteinMark className="size-6" />
          ProtEva
        </Link>
        <span>EXPLORATION, WITH EVIDENCE.</span>
        <div>
          <Link to="/documentation">Documentation</Link>
          <Link to="/overview">
            Application <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
