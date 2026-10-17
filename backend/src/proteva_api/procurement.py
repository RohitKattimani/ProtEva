"""Provider-neutral procurement workflow for ProtEva candidates."""
from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .repository import SQLiteExperimentRepository
from .schemas import (
    AgentEvent,
    ProcurementMatchType,
    ProcurementProductType,
    ProcurementRequest,
    ProcurementSpecification,
    SupplierOption,
)
from .settings import Settings

ROOT = Path(__file__).resolve().parents[3]


def now() -> datetime:
    return datetime.now(timezone.utc)


def sequence_identity(query: str, candidate: str) -> tuple[float, float]:
    query = (query or "").upper().replace(" ", "")
    candidate = (candidate or "").upper().replace(" ", "")
    if not query or not candidate:
        return 0.0, 0.0
    if len(query) == len(candidate):
        identity = sum(a == b for a, b in zip(query, candidate)) / len(query)
    else:
        identity = 0.0
    coverage = min(len(query), len(candidate)) / max(len(query), len(candidate))
    return round(identity, 6), round(coverage, 6)


class SupplierAdapter:
    name = "base"
    capabilities: dict[str, bool] = {}

    def configured(self) -> bool:
        return False

    def search_catalog(self, sequence: str, specification: ProcurementSpecification) -> list[SupplierOption]:
        return []

    def prepare_cart(self, option: SupplierOption, specification: ProcurementSpecification, sequence: str) -> dict[str, Any]:
        raise NotImplementedError

    def add_to_cart(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class DemoSupplierAdapter(SupplierAdapter):
    name = "demo-supplier"
    capabilities = {
        "catalog_search": True,
        "exact_sequence_match": True,
        "quote_request": True,
        "cart_api": False,
    }

    def configured(self) -> bool:
        return True

    def search_catalog(self, sequence: str, specification: ProcurementSpecification) -> list[SupplierOption]:
        retrieved = now()
        identity, coverage = sequence_identity(sequence, sequence)
        sequence_tag = hashlib.sha256(sequence.encode("ascii")).hexdigest()[:12].upper()
        options = [
            SupplierOption(
                supplier="Demo Supplier A",
                product_name=f"Custom protein quote · sequence {sequence_tag}",
                sku=f"DEMO-CUSTOM-{sequence_tag}",
                category="custom_protein",
                official_url="https://example.com/demo-supplier-a",
                specifications={"purity": ">=95%", "expression_system": "E. coli", "quantity": "1 mg"},
                availability="In stock (simulated)",
                quantity_options=["1 mg", "5 mg", "10 mg"],
                price=249.0,
                currency="USD",
                estimated_delivery="2-3 weeks (simulated)",
                required_account="None (simulated)",
                match_type=ProcurementMatchType.custom_service,
                sequence_identity=identity,
                coverage=coverage,
                match_evidence=[f"Prototype quote for the exact candidate sequence SHA-256 prefix {sequence_tag}."],
                data_source="demo_simulated",
                retrieved_at=retrieved,
                simulated=True,
            ),
            SupplierOption(
                supplier="Demo Supplier B",
                product_name=f"Catalog-homolog inquiry · sequence {sequence_tag}",
                sku=f"DEMO-HOMOLOG-{sequence_tag}",
                category="catalog_protein",
                official_url="https://example.com/demo-supplier-b",
                specifications={"purity": ">=90%", "quantity": "100 ug"},
                availability="Limited (simulated)",
                quantity_options=["100 ug", "1 mg"],
                price=129.0,
                currency="USD",
                estimated_delivery="1 week (simulated)",
                required_account="Free account (simulated)",
                match_type=ProcurementMatchType.similar_homolog,
                sequence_identity=0.42,
                coverage=0.95,
                match_evidence=[f"Prototype homolog inquiry for candidate sequence SHA-256 prefix {sequence_tag}; not an exact sequence match."],
                data_source="demo_simulated",
                retrieved_at=retrieved,
                simulated=True,
            ),
        ]
        return options

    def prepare_cart(self, option, specification, sequence):
        return {
            "supplier": option.supplier,
            "product_name": option.product_name,
            "sku": option.sku,
            "sequence": sequence,
            "specification": specification.model_dump(by_alias=True),
            "quantity": specification.quantity or "1 mg",
            "price": option.price,
            "currency": option.currency,
            "action": "external_quote" if option.price is None else "prepare_cart",
        }

    def add_to_cart(self, payload):
        raise RuntimeError("Demo adapter does not support live cart mutation")


class TwistSupplierAdapter(SupplierAdapter):
    name = "twist"
    capabilities = {
        "catalog_search": False,
        "exact_sequence_match": False,
        "quote_request": False,
        "cart_api": False,
    }

    def __init__(self, settings: Settings):
        self.settings = settings

    def configured(self) -> bool:
        return bool(getattr(self.settings, "twist_api_token", None))

    def search_catalog(self, sequence, specification):
        if not self.configured():
            return []
        # Real Twist integration requires an approved account, IP whitelist, and OAuth/token.
        # The documented endpoints are not called here because no verified credential is configured.
        return []

    def prepare_cart(self, option, specification, sequence):
        return {"supplier": option.supplier, "action": "external_quote"}

    def add_to_cart(self, payload):
        raise RuntimeError("Twist cart API is not configured or verified")


class ProcurementWorkflow:
    def __init__(self, repository: SQLiteExperimentRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

    def _adapters(self, demo: bool) -> list[SupplierAdapter]:
        if demo:
            return [DemoSupplierAdapter()]
        adapters: list[SupplierAdapter] = []
        twist = TwistSupplierAdapter(self.settings)
        if twist.configured():
            adapters.append(twist)
        return adapters

    def external_routes(self) -> list[dict[str, str]]:
        return [
            {
                "supplier": "Twist Bioscience",
                "url": "https://www.twistbioscience.com/products/gene-synthesis",
                "note": "Gene synthesis (custom DNA sequences)",
            },
            {
                "supplier": "IDT",
                "url": "https://www.idtdna.com/pages/products/genes-and-gene-fragments/custom-gene-synthesis",
                "note": "Custom gene synthesis",
            },
            {
                "supplier": "GenScript",
                "url": "https://www.genscript.com/gene-synthesis.html",
                "note": "Gene synthesis",
            },
            {
                "supplier": "Integrated DNA Technologies (IDT)",
                "url": "https://www.idtdna.com/pages/products/custom-dna-rna/dna-oligos",
                "note": "Oligonucleotides",
            },
        ]

    def create_request(self, experiment_id: str, candidate_id: str, specification: ProcurementSpecification) -> ProcurementRequest:
        experiment = self.repository.get(experiment_id)
        if experiment is None:
            raise ValueError("Experiment not found")
        candidate = self.repository.candidate(experiment_id, candidate_id)
        if candidate is None:
            raise ValueError("Candidate not found")
        sequence = candidate.sequence
        digest = hashlib.sha256(sequence.encode("ascii")).hexdigest()
        request = ProcurementRequest(
            id="proc_" + hashlib.sha256((experiment_id + candidate_id + str(time.time())).encode()).hexdigest()[:24],
            experiment_id=experiment_id,
            candidate_id=candidate_id,
            sequence_sha256=digest,
            specification=specification,
            status="created",
            created_at=now(),
            updated_at=now(),
        )
        self.repository.add_procurement_request(request)
        return request

    def search(self, request_id: str) -> dict[str, Any]:
        request = self.repository.get_procurement_request(request_id)
        if request is None:
            raise ValueError("Procurement request not found")
        experiment = self.repository.get(request.experiment_id)
        candidate = self.repository.candidate(request.experiment_id, request.candidate_id)
        if experiment is None or candidate is None:
            raise ValueError("Source experiment or candidate is unavailable")
        demo = experiment.execution_mode.value == "demo"
        adapters = self._adapters(demo)
        options: list[SupplierOption] = []
        adapter_statuses = []
        for adapter in adapters:
            try:
                found = adapter.search_catalog(candidate.sequence, request.specification)
                options.extend(found)
                adapter_statuses.append({"adapter": adapter.name, "configured": adapter.configured(), "resultCount": len(found), "error": None})
            except Exception as error:
                adapter_statuses.append({"adapter": adapter.name, "configured": adapter.configured(), "resultCount": 0, "error": str(error)})
        # Compatibility assessment for options carrying a sequence.
        for option in options:
            if option.specifications.get("sequence"):
                identity, coverage = sequence_identity(candidate.sequence, str(option.specifications["sequence"]))
                option.sequence_identity = identity
                option.coverage = coverage
        request.options = options
        request.status = "searched"
        request.updated_at = now()
        self.repository.replace_procurement_request(request)
        return {
            "request": request,
            "adapterStatuses": adapter_statuses,
            "externalRoutes": self.external_routes() if not demo else [],
            "demo": demo,
        }

    def prepare_cart(self, request_id: str, option_id: str) -> ProcurementRequest:
        request = self.repository.get_procurement_request(request_id)
        if request is None:
            raise ValueError("Procurement request not found")
        if not request.options:
            raise ValueError("No supplier options have been retrieved")
        option = next((item for item in request.options if item.sku == option_id or item.product_name == option_id), None)
        # Allow selection by index-like id fallback.
        if option is None and option_id.isdigit():
            idx = int(option_id)
            if 0 <= idx < len(request.options):
                option = request.options[idx]
        if option is None:
            raise ValueError("Selected supplier option was not found")
        experiment = self.repository.get(request.experiment_id)
        candidate = self.repository.candidate(request.experiment_id, request.candidate_id)
        adapter = DemoSupplierAdapter() if (experiment and experiment.execution_mode.value == "demo") else None
        if adapter is None:
            # Use a generic payload when no live adapter is configured.
            payload = {
                "supplier": option.supplier,
                "product_name": option.product_name,
                "sku": option.sku,
                "sequence_sha256": request.sequence_sha256,
                "specification": request.specification.model_dump(by_alias=True),
                "quantity": request.specification.quantity,
                "price": option.price,
                "currency": option.currency,
                "action": "external_quote",
            }
        else:
            payload = adapter.prepare_cart(option, request.specification, candidate.sequence if candidate else "")
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        approval_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        request.selected_option_id = option.sku or option.product_name
        request.cart_payload = payload
        request.approval_hash = approval_hash
        request.status = "prepared"
        request.updated_at = now()
        self.repository.replace_procurement_request(request)
        return request

    def prepare_package(self, request_id: str) -> dict[str, Any]:
        """Build a truthful, self-contained procurement handoff package.

        The package contains a FASTA record, the exact sequence checksum, the
        mutation list against the benchmark seed and a quote-request document.
        It never fabricates supplier products, prices or availability: when no
        supplier catalog adapter is configured the document states plainly that
        no live catalog search was performed.
        """
        request = self.repository.get_procurement_request(request_id)
        if request is None:
            raise ValueError("Procurement request not found")
        experiment = self.repository.get(request.experiment_id)
        candidate = self.repository.candidate(request.experiment_id, request.candidate_id)
        if experiment is None or candidate is None:
            raise ValueError("Source experiment or candidate is unavailable")

        sequence = candidate.sequence
        digest = hashlib.sha256(sequence.encode("ascii")).hexdigest()
        if digest != request.sequence_sha256:
            raise ValueError("Persisted sequence checksum does not match the candidate record")

        seed = experiment.input.sequence
        mutations = self._mutation_list(seed, sequence)

        demo = experiment.execution_mode.value == "demo"
        adapters = self._adapters(demo)
        live_adapters = [adapter for adapter in adapters if adapter.name != "demo-supplier"]
        supplier_configured = bool(live_adapters) and all(adapter.configured() for adapter in live_adapters)
        if demo:
            supplier_status = "Demo mode: supplier results are simulated and no live catalog was contacted."
        elif supplier_configured:
            supplier_status = "A configured supplier adapter is present; confirm its results before ordering."
        else:
            supplier_status = (
                "No live supplier catalog search was performed: no supplier API credential is configured. "
                "This is a manual quotation request you send through an official supplier route."
            )

        evidence = self._evidence_reference(request.experiment_id)

        caveats = [
            "The candidate sequence is a computational ProteinMPNN proposal; it has not been experimentally expressed, purified or validated.",
            "Target preference is a ProteinMPNN backbone-compatibility proxy (off-target mean NLL minus target mean NLL), not a measured binding, activity or stability value.",
            "The off-target reference 1AKE is an AP5A inhibitor-bound structure, so the proxy does not represent an apo conformational equilibrium.",
            "No supplier product, price, purity or availability is asserted in this package.",
        ]
        if not demo:
            caveats.append("No live supplier catalog search was performed because no supplier API credential is configured.")
        if evidence is None:
            caveats.append("No deterministic evidence report has been generated for this experiment yet.")

        fasta = self._fasta_record(request.candidate_id, request.experiment_id, digest, sequence)
        document = self._quote_request_document(request, experiment, candidate, digest, mutations, supplier_status, evidence, caveats)

        self.repository.add_event(
            AgentEvent(
                id="evt_" + hashlib.sha256(("package" + request_id + digest).encode()).hexdigest()[:24],
                experiment_id=request.experiment_id,
                timestamp=now(),
                kind="decision",
                summary="procurement handoff package prepared for candidate " + request.candidate_id,
                payload={
                    "candidateId": request.candidate_id,
                    "sequenceSha256": digest,
                    "files": [request.candidate_id + ".fasta", request.candidate_id + "-quote-request.md"],
                    "supplierCatalogConfigured": supplier_configured,
                },
            )
        )

        return {
            "requestId": request.id,
            "experimentId": request.experiment_id,
            "candidateId": request.candidate_id,
            "candidateLabel": request.candidate_id,
            "sequence": sequence,
            "sequenceSha256": digest,
            "sequenceLength": len(sequence),
            "mutations": mutations,
            "specification": request.specification.model_dump(by_alias=True),
            "supplierCatalogConfigured": supplier_configured,
            "supplierStatus": supplier_status,
            "evidence": evidence,
            "caveats": caveats,
            "generatedAt": now().isoformat(),
            "files": [
                {"name": request.candidate_id + ".fasta", "mediaType": "text/plain", "content": fasta},
                {
                    "name": request.candidate_id + "-quote-request.md",
                    "mediaType": "text/markdown",
                    "content": document,
                },
            ],
        }

    @staticmethod
    def _mutation_list(seed: str, sequence: str) -> list[str]:
        if not seed or len(seed) != len(sequence):
            return []
        return [f"{seed[index]}{index + 1}{sequence[index]}" for index in range(len(seed)) if seed[index] != sequence[index]]

    def _evidence_reference(self, experiment_id: str) -> Optional[dict[str, Any]]:
        for artifact in self.repository.artifacts(experiment_id):
            if artifact.get("kind") == "evidence_report":
                return {
                    "artifactId": artifact.get("id"),
                    "sha256": artifact.get("sha256"),
                    "path": artifact.get("path"),
                    "note": "Deterministic evidence report built only from persisted records.",
                }
        return None

    @staticmethod
    def _fasta_record(candidate_id: str, experiment_id: str, digest: str, sequence: str) -> str:
        header = f">ProtEva {candidate_id} | experiment {experiment_id} | sha256 {digest}"
        lines = [sequence[index:index + 60] for index in range(0, len(sequence), 60)] or [""]
        return header + "\n" + "\n".join(lines) + "\n"

    @staticmethod
    def _quote_request_document(request, experiment, candidate, digest, mutations, supplier_status, evidence, caveats) -> str:
        specification = request.specification
        metric_lines = []
        if candidate.target_mean_nll is not None:
            metric_lines.append(f"- Target (4AKE) mean NLL: {candidate.target_mean_nll:.4f}")
        if candidate.off_target_mean_nll is not None:
            metric_lines.append(f"- Off-target (1AKE) mean NLL: {candidate.off_target_mean_nll:.4f}")
        if candidate.target_preference is not None:
            metric_lines.append(f"- Target preference (off-target NLL - target NLL): {candidate.target_preference:+.4f}")
        if candidate.seed_metrics:
            seeds = ", ".join(str(metric.get("seed")) for metric in candidate.seed_metrics)
            metric_lines.append(f"- ProteinMPNN scoring seeds recorded: {seeds}")
        if not metric_lines:
            metric_lines.append("- No ProteinMPNN measurements are recorded for this candidate.")

        mutation_text = ", ".join(mutations) if mutations else "None (identical to the benchmark seed sequence)"

        document = [
            f"# Protein quotation request - candidate {request.candidate_id}",
            "",
            "Prepared by ProtEva for a manual supplier quotation. This document contains no supplier product,",
            "price, purity or availability claim.",
            "",
            "## Requested product",
            f"- Product type: {specification.product_type.value}",
            f"- Quantity: {specification.quantity or 'not specified'}",
            f"- Purity: {specification.purity or 'not specified'}",
            f"- Expression system: {specification.expression_system or 'not specified'}",
            f"- Construct: {specification.construct or 'not specified'}",
            f"- Tag: {specification.tag or 'not specified'}",
            f"- Modification: {specification.modification or 'not specified'}",
            f"- Formulation: {specification.formulation or 'not specified'}",
            f"- Destination region: {specification.destination_region or 'not specified'}",
            f"- Delivery timeframe: {specification.delivery_timeframe or 'not specified'}",
            f"- Budget limit: {specification.budget_limit or 'not specified'}",
            "",
            "## Sequence to synthesise",
            f"- Length: {len(candidate.sequence)} residues",
            f"- SHA-256: {digest}",
            f"- FASTA file: {request.candidate_id}.fasta",
            "",
            "```",
            candidate.sequence,
            "```",
            "",
            "## Mutations relative to the benchmark seed",
            f"- {mutation_text}",
            "",
            "## Recorded computational evidence",
            *metric_lines,
            f"- Experiment: {experiment.name} ({experiment.id})",
            f"- Execution mode: {experiment.execution_mode.value}",
            "",
            "## Supplier status",
            supplier_status,
            "",
        ]
        if evidence:
            document.extend([
                "## Evidence artifact",
                f"- Evidence report id: {evidence['artifactId']}",
                f"- SHA-256: {evidence['sha256']}",
                "",
            ])
        document.extend([
            "## Limitations",
            *[f"- {caveat}" for caveat in caveats],
            "",
        ])
        return "\n".join(document)

    def approve_and_add(self, request_id: str, approval_hash: str, consent: bool) -> ProcurementRequest:
        request = self.repository.get_procurement_request(request_id)
        if request is None:
            raise ValueError("Procurement request not found")
        if not consent:
            raise ValueError("Explicit consent to share the candidate sequence is required")
        if not request.cart_payload or not request.approval_hash:
            raise ValueError("No prepared cart payload is available")
        if approval_hash != request.approval_hash:
            raise ValueError("Approval does not match the prepared transaction")
        experiment = self.repository.get(request.experiment_id)
        demo = bool(experiment and experiment.execution_mode.value == "demo")
        # Idempotency: already completed.
        if request.status in {"cart_added", "external_checkout"} and request.provider_response:
            return request
        if demo:
            adapter = DemoSupplierAdapter()
            try:
                response = adapter.add_to_cart(request.cart_payload)
            except Exception as error:
                request.status = "failed"
                request.error = {"code": "CART_MUTATION_UNAVAILABLE", "message": str(error)}
                request.updated_at = now()
                self.repository.replace_procurement_request(request)
                return request
            request.provider_response = response
            request.status = "cart_added"
        else:
            # No verified live cart API is configured.
            request.provider_response = {
                "status": "external_checkout_required",
                "message": "No verified supplier cart API is configured. Use the official supplier ordering route.",
                "externalRoutes": self.external_routes(),
            }
            request.status = "external_checkout"
        request.updated_at = now()
        self.repository.replace_procurement_request(request)
        return request
