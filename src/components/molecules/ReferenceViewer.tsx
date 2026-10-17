import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GLViewer } from "3dmol";

import { Pill } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/protein/api";
import type { ReferenceStructure } from "@/lib/protein/types";

/**
 * Real reference coordinates, served by the backend from the prepared
 * ProteinMPNN structures. These are the experimental 4AKE (target) and 1AKE
 * (off-target) chains the live evaluator scores against — never a predicted
 * candidate structure, which does not exist until genuine sampling artifacts
 * are produced.
 */

type ThreeDmolModule = typeof import("3dmol");

/** Resolve a semantic design token to an rgb() string usable by WebGL. */
function cssColor(name: string, fallback: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved && resolved !== "rgba(0, 0, 0, 0)" ? resolved : fallback;
}

export function ReferenceViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<GLViewer | null>(null);
  const threeDmolRef = useRef<ThreeDmolModule | null>(null);

  const [catalog, setCatalog] = useState<ReferenceStructure[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("4AKE");
  const [coordinates, setCoordinates] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [surface, setSurface] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const loadReferences = useCallback(async () => {
    if (!api.getReferences) {
      setSupported(false);
      return;
    }
    try {
      const result = await api.getReferences();
      const available = result.references.filter((reference) => reference.available);
      setCatalog(available);
      if (available.length && !available.some((reference) => reference.pdbId === selectedId)) {
        setSelectedId(available[0]!.pdbId);
      }
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : "Reference catalog unavailable");
    }
  }, [selectedId]);

  useEffect(() => {
    void loadReferences();
    // Intentional: load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureViewer = useCallback(async () => {
    if (viewerRef.current || !containerRef.current) return viewerRef.current;
    const module = await import("3dmol");
    threeDmolRef.current = module;
    const viewer = module.createViewer(containerRef.current, { backgroundColor: "transparent" });
    viewerRef.current = viewer;
    return viewer;
  }, []);

  const selected = useMemo(
    () => catalog?.find((reference) => reference.pdbId === selectedId) ?? null,
    [catalog, selectedId],
  );

  const fetchCoordinates = useCallback(
    async (pdbId: string) => {
      if (coordinates[pdbId]) return coordinates[pdbId]!;
      if (!api.getReferenceCoordinates) throw new Error("Coordinate endpoint unavailable");
      const text = await api.getReferenceCoordinates(pdbId);
      setCoordinates((current) => ({ ...current, [pdbId]: text }));
      return text;
    },
    [coordinates],
  );

  const load = useCallback(
    async (withCompare: boolean, withSurface: boolean) => {
      if (!catalog?.length) return;
      setError(null);
      setLoadingId(selectedId);
      try {
        const viewer = await ensureViewer();
        if (!viewer) return;
        const module = threeDmolRef.current;
        const targetColor = cssColor("--color-accent", "#4fd1c5");
        const partnerColor = cssColor("--color-primary", "#9f8cff");
        const motifColor = cssColor("--color-warning", "#e0b64d");
        const surfaceColor = cssColor("--color-muted-foreground", "#8b8f9a");

        const primaryText = await fetchCoordinates(selectedId);
        viewer.clear();

        const main = viewer.addModel(primaryText, "pdb");
        main.setStyle({}, { cartoon: { color: targetColor, opacity: 0.95 } });
        // Protected P-loop motif (residues 7-15) highlighted as sticks.
        viewer.addStyle(
          { resi: [7, 8, 9, 10, 11, 12, 13, 14, 15] },
          { stick: { color: motifColor, radius: 0.18 }, cartoon: { color: motifColor } },
        );

        if (withCompare) {
          const partner = (catalog ?? []).find((reference) => reference.pdbId !== selectedId);
          if (partner) {
            const partnerText = await fetchCoordinates(partner.pdbId);
            const second = viewer.addModel(partnerText, "pdb");
            second.setStyle({}, { cartoon: { color: partnerColor, opacity: 0.45 } });
          }
        }

        if (withSurface) {
          viewer.addSurface(
            module?.SurfaceType.VDW ?? "VDW",
            { opacity: 0.5, color: surfaceColor },
            {},
          );
        }

        viewer.zoomTo();
        viewer.render();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to render reference coordinates");
      } finally {
        setLoadingId(null);
      }
    },
    [catalog, ensureViewer, fetchCoordinates, selectedId],
  );

  useEffect(() => {
    if (catalog?.length) {
      void load(compare, surface);
    }
    // Re-render when the selection, overlay or surface changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, compare, surface, catalog]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.spin(spinning);
  }, [spinning]);

  useEffect(
    () => () => {
      viewerRef.current?.clear();
      viewerRef.current = null;
    },
    [],
  );

  if (!supported) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reference structures</CardTitle>
          <CardDescription>4AKE (target) and 1AKE (off-target)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Real 3D reference coordinates are served by the ProtEva backend. Start the backend (or
            switch to live mode) to inspect the 4AKE and 1AKE chains the evaluator scores against.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Reference structures</CardTitle>
        <CardDescription>
          Experimental 4AKE (target) and 1AKE (off-target) chain A, served from the prepared
          ProteinMPNN structures. Not a predicted candidate structure.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {catalogError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {catalogError}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(catalog ?? []).map((reference) => (
            <Button
              key={reference.pdbId}
              size="sm"
              variant={reference.pdbId === selectedId ? "default" : "outline"}
              onClick={() => setSelectedId(reference.pdbId)}
            >
              {reference.pdbId} · {reference.role === "target" ? "target" : "off-target"}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            size="sm"
            variant={compare ? "default" : "outline"}
            onClick={() => setCompare((value) => !value)}
          >
            Compare overlay
          </Button>
          <Button
            size="sm"
            variant={surface ? "default" : "outline"}
            onClick={() => setSurface((value) => !value)}
          >
            Surface
          </Button>
          <Button
            size="sm"
            variant={spinning ? "default" : "outline"}
            onClick={() => setSpinning((value) => !value)}
          >
            <Sparkles className="size-3.5" /> Spin
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              viewerRef.current?.zoomTo();
              viewerRef.current?.render();
            }}
          >
            <RotateCcw className="size-3.5" /> Reset view
          </Button>
        </div>

        <div className="relative h-[360px] overflow-hidden rounded-md border border-border bg-surface">
          <div ref={containerRef} className="absolute inset-0" />
          {loadingId && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading {loadingId} coordinates…
            </div>
          )}
          {!catalog?.length && !catalogError && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading reference catalog…
            </div>
          )}
        </div>

        {selected && (
          <div className="grid gap-1 font-mono text-[11px] text-muted-foreground sm:grid-cols-2">
            <span>pdb = {selected.pdbId}</span>
            <span>chain = {selected.chain ?? "—"}</span>
            <span>residues = {selected.residueCount ?? "—"}</span>
            <span className="truncate">sha256 = {selected.sha256?.slice(0, 16) ?? "—"}…</span>
            <span className="sm:col-span-2">{selected.stateDescription}</span>
          </div>
        )}
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Pill tone="muted">reference coordinates</Pill>
          These coordinates describe the experimental reference; they are not a computational
          prediction of any ProtEva candidate.
        </p>
      </CardContent>
    </Card>
  );
}
