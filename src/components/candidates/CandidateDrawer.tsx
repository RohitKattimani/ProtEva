import { Copy, Download, FlaskConical, Info, Package, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Pill } from "@/components/app/StatusBadge";
import { ReferenceViewer } from "@/components/molecules/ReferenceViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/protein/api";
import { candidateLabel, downloadTextFile, toFasta } from "@/lib/protein/format";
import type {
  Candidate,
  ProcurementPackage,
  ProcurementProductType,
  ProcurementRequest,
  ProcurementSpecification,
  SupplierOption,
} from "@/lib/protein/types";

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
  const [procurementOpen, setProcurementOpen] = useState(false);
  const [productType, setProductType] = useState<ProcurementProductType>("best_available");
  const [quantity, setQuantity] = useState("1 mg");
  const [purity, setPurity] = useState("");
  const [expressionSystem, setExpressionSystem] = useState("");
  const [destinationRegion, setDestinationRegion] = useState("");
  const [consent, setConsent] = useState(false);
  const [procurementRequest, setProcurementRequest] = useState<ProcurementRequest | null>(null);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<SupplierOption | null>(null);
  const [packageData, setPackageData] = useState<ProcurementPackage | null>(null);
  const [busy, setBusy] = useState(false);

  if (!candidate) return null;
  const metrics = candidate.metrics;
  const isLiveMeasurement = candidate.targetMeanNll != null || candidate.offTargetMeanNll != null;

  return (
    <Sheet open={Boolean(candidate)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-mono">{candidateLabel(candidate)}</SheetTitle>
          <SheetDescription>
            Generation {candidate.generation} · parent{" "}
            <span className="font-mono">{candidate.parentId ?? "wild-type"}</span> ·{" "}
            {isLiveMeasurement ? "recorded ProteinMPNN measurement" : "illustrative demo candidate"}
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
                  toFasta(
                    `${candidate.id} ${isLiveMeasurement ? "COMPUTATIONAL" : "DEMO_SIMULATED"} ${candidate.mutations.join(",")}`,
                    candidate.sequence,
                  ),
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
            <p className="mb-2 text-sm font-medium">Reference structure</p>
            <div className="structure-unavailable mb-2 grid place-items-center border border-dashed border-border bg-surface p-4 text-center">
              <div className="px-2">
                <FlaskConical className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  No predicted structure exists for this candidate. ProtEva never renders an
                  invented protein model as a real candidate structure — a candidate model appears
                  here only once genuine sampling artifacts are produced.
                </p>
              </div>
            </div>
            <ReferenceViewer />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              {isLiveMeasurement
                ? "ProteinMPNN compatibility measurements"
                : "Metrics (demonstration values)"}
            </p>
            {isLiveMeasurement ? (
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Target mean NLL"
                  value={candidate.targetMeanNll?.toFixed(4) ?? "—"}
                  hint="Lower is better under the same model configuration."
                />
                <Metric
                  label="Off-target mean NLL"
                  value={candidate.offTargetMeanNll?.toFixed(4) ?? "—"}
                  hint="Lower is better under the same model configuration."
                />
                <Metric
                  label="Target preference"
                  value={candidate.targetPreference?.toFixed(4) ?? "—"}
                  hint="off-target mean NLL − target mean NLL; higher favors target compatibility."
                />
                <Metric
                  label="Seed measurements"
                  value={String(candidate.seedMetrics?.length ?? 0)}
                  hint="Fixed-seed robustness audit records."
                />
              </div>
            ) : metrics ? (
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Target occupancy"
                  value={metrics.targetOccupancy.toFixed(3)}
                  hint={`± ${metrics.uncertainty.toFixed(3)}`}
                />
                <Metric
                  label="Off-target occupancy"
                  value={metrics.offTargetOccupancy.toFixed(3)}
                />
                <Metric label="RMSD" value={`${metrics.rmsdAngstrom.toFixed(2)} Å`} />
                <Metric
                  label="Radius of gyration"
                  value={`${metrics.radiusOfGyration.toFixed(2)} Å`}
                />
                <Metric
                  label="Samples"
                  value={String(metrics.sampleCount)}
                  hint="Simulated budget"
                />
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

          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Design-to-procurement</p>
              <Button size="sm" variant="outline" onClick={() => setProcurementOpen((v) => !v)}>
                <ShoppingCart className="size-4" /> {procurementOpen ? "Hide" : "Find supplier"}
              </Button>
            </div>
            {procurementOpen && (
              <div className="space-y-3 rounded-md border border-border bg-surface p-3">
                <p className="text-xs text-muted-foreground">
                  Candidate {candidate.id} from experiment {candidate.experimentId}. Computational
                  candidates are not experimentally validated.
                </p>
                <div className="grid gap-2">
                  <Label className="text-xs">Product or service</Label>
                  <Select
                    value={productType}
                    onValueChange={(v) => setProductType(v as ProcurementProductType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="catalog_protein">
                        Existing catalog protein reagent
                      </SelectItem>
                      <SelectItem value="custom_protein">
                        Custom expressed and purified protein
                      </SelectItem>
                      <SelectItem value="synthetic_peptide">Synthetic peptide</SelectItem>
                      <SelectItem value="gene_synthesis">Gene or DNA synthesis service</SelectItem>
                      <SelectItem value="best_available">Find the best available option</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Quantity</Label>
                    <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Purity / characterization</Label>
                    <Input value={purity} onChange={(e) => setPurity(e.target.value)} />
                  </div>
                </div>
                {(productType === "custom_protein" || productType === "best_available") && (
                  <div>
                    <Label className="text-xs">Expression system</Label>
                    <Input
                      value={expressionSystem}
                      onChange={(e) => setExpressionSystem(e.target.value)}
                      placeholder="E. coli, HEK293, ..."
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Destination region</Label>
                  <Input
                    value={destinationRegion}
                    onChange={(e) => setDestinationRegion(e.target.value)}
                    placeholder="US, EU, ..."
                  />
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const spec: ProcurementSpecification = {
                        productType,
                        quantity,
                        consentToShareSequence: consent,
                        ...(purity ? { purity } : {}),
                        ...(expressionSystem ? { expressionSystem } : {}),
                        ...(destinationRegion ? { destinationRegion } : {}),
                      };
                      const created = await api.createProcurementRequest?.({
                        experimentId: candidate.experimentId,
                        candidateId: candidate.id,
                        specification: spec,
                      });
                      if (!created) throw new Error("Procurement API unavailable");
                      setProcurementRequest(created);
                      const searched = await api.searchProcurement?.(
                        candidate.experimentId,
                        created.id,
                      );
                      if (!searched) throw new Error("Supplier search did not return a result");
                      setProcurementRequest(searched.request);
                      setSearchResult(searched);
                      toast.success("Supplier search completed");
                    } catch (err) {
                      toast.error("Procurement search failed", {
                        description: (err as Error).message,
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Searching..." : "Search suppliers"}
                </Button>

                {searchResult && (
                  <div className="space-y-2">
                    <div className="rounded border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
                      Request {procurementRequest?.id} · candidate {candidate.id} · sequence SHA-256{" "}
                      {procurementRequest?.sequenceSha256.slice(0, 16)}…
                    </div>
                    <p className="text-xs font-medium">Verified supplier results</p>
                    {(procurementRequest?.options ?? []).map((option: SupplierOption) => (
                      <div
                        key={option.sku ?? `${option.supplier}-${option.productName}`}
                        className="rounded border border-border p-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {option.supplier} — {option.productName}
                          </span>
                          <Pill
                            tone={
                              option.matchType === "exact_sequence"
                                ? "success"
                                : option.matchType === "similar_homolog"
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {option.matchType}
                          </Pill>
                        </div>
                        <p className="text-muted-foreground">
                          {option.category} · {option.availability ?? "availability unknown"} ·{" "}
                          {option.price != null
                            ? `${option.price} ${option.currency}`
                            : "quote required"}
                        </p>
                        <p className="text-muted-foreground">
                          Source: {option.dataSource} · retrieved{" "}
                          {new Date(option.retrievedAt).toLocaleString()}
                        </p>
                        {option.matchEvidence.map((evidence) => (
                          <p key={evidence} className="text-muted-foreground">
                            {evidence}
                          </p>
                        ))}
                        {option.officialUrl && (
                          <a
                            className="text-primary underline"
                            href={option.officialUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Official link
                          </a>
                        )}
                        {option.simulated && (
                          <p className="text-warning">
                            Simulated demo result — not a live supplier product.
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => setSelectedOption(option)}
                        >
                          Select
                        </Button>
                      </div>
                    ))}
                    {!procurementRequest?.options.length && (
                      <p className="rounded border border-warning/30 bg-warning/5 p-2 text-xs text-muted-foreground">
                        No verified supplier result was returned for this unique request. No
                        configured supplier catalog can claim a match; use an official supplier
                        route to request a custom quote.
                      </p>
                    )}
                    {searchResult.externalRoutes?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium">External supplier routes</p>
                        {searchResult.externalRoutes.map((route: any, index: number) => (
                          <a
                            key={index}
                            className="block text-xs text-primary underline"
                            href={route.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {route.supplier}: {route.note}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedOption && procurementRequest && (
                  <div className="space-y-2 rounded border border-border p-2">
                    <p className="text-xs font-medium">Review before action</p>
                    <p className="text-xs text-muted-foreground">
                      Supplier: {selectedOption.supplier}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Product: {selectedOption.productName} ({selectedOption.sku ?? "no SKU"})
                    </p>
                    <p className="text-xs text-muted-foreground">Quantity: {quantity}</p>
                    <p className="text-xs text-muted-foreground">
                      Price:{" "}
                      {selectedOption.price != null
                        ? `${selectedOption.price} ${selectedOption.currency}`
                        : "quote required"}
                    </p>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      I consent to sending the candidate sequence and associated information to this
                      supplier.
                    </label>
                    <Button
                      size="sm"
                      disabled={!consent || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const optionId = selectedOption.sku || selectedOption.productName;
                          const prepared = await api.prepareProcurementCart?.(
                            candidate.experimentId,
                            procurementRequest.id,
                            optionId,
                          );
                          if (!prepared?.approvalHash) throw new Error("Preparation failed");
                          setProcurementRequest(prepared);
                          const approved = await api.approveProcurementCart?.(
                            candidate.experimentId,
                            procurementRequest.id,
                            prepared.approvalHash,
                            true,
                          );
                          setProcurementRequest(approved ?? prepared);
                          toast.success("Procurement request prepared and submitted for review");
                        } catch (err) {
                          toast.error("Approval failed", { description: (err as Error).message });
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Prepare and approve
                    </Button>
                    {procurementRequest?.providerResponse && (
                      <pre className="max-h-32 overflow-auto rounded bg-background p-2 text-[10px]">
                        {JSON.stringify(procurementRequest.providerResponse, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {procurementRequest && (
                  <div className="space-y-2 rounded border border-border p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">Procurement package</p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const prepared = await api.prepareProcurementPackage?.(
                              candidate.experimentId,
                              procurementRequest.id,
                            );
                            if (!prepared) throw new Error("Package endpoint unavailable");
                            setPackageData(prepared);
                            toast.success("Procurement package prepared");
                          } catch (err) {
                            toast.error("Could not prepare the package", {
                              description: (err as Error).message,
                            });
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Package className="size-4" /> Prepare package
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Generates a FASTA record, the sequence SHA-256, the mutation list and a
                      quote-request document for a manual supplier quotation. It never invents
                      supplier products, prices, purity or availability.
                    </p>
                    {packageData && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          {packageData.supplierStatus}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {packageData.files.map((file) => (
                            <Button
                              key={file.name}
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                downloadTextFile(file.name, file.content, file.mediaType)
                              }
                            >
                              <Download className="size-3.5" /> {file.name}
                            </Button>
                          ))}
                        </div>
                        <ul className="space-y-1">
                          {packageData.caveats.map((caveat) => (
                            <li key={caveat} className="text-[11px] text-muted-foreground">
                              - {caveat}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Artifacts</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li className="font-mono">{candidate.id}.fasta — available</li>
              <li className="font-mono">
                {candidate.id}_metrics.csv —{" "}
                {isLiveMeasurement ? "recorded ProteinMPNN measurements" : "demonstration values"}
              </li>
              <li className="font-mono">
                {candidate.id}_structure.pdb — requires a genuine sampling artifact
              </li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
