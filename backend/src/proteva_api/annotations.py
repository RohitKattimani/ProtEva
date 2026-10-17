"""Authoritative annotations for the prepared 4AKE/1AKE reference structures.

Live execution must never trust residue numbering invented by a language
model.  Every value produced here is read from the prepared chain-A PDB files
that the ProteinMPNN runner already scores against, and is validated against
the experiment input sequence before a live run may start.

Any mismatch between the input sequence and the prepared reference numbering
raises :class:`ReferenceAnnotationError` and blocks live execution.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

THREE_TO_ONE = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    "MSE": "M",
}

REFERENCE_IDS = ("4AKE", "1AKE")

REFERENCE_METADATA = {
    "4AKE": {
        "chain": "A",
        "role": "target",
        "label": "4AKE chain A — selected reference target",
        "stateDescription": "Open apo conformation of E. coli adenylate kinase (inter-domain LID and NMPbind open)",
        "sourceUrl": "https://files.rcsb.org/download/4AKE.pdb",
        "reviewedSha256": "ff798ee8791878eb58bac1c6bed32042f51b455512ac93b50bda8fa0ff0e7f78",
    },
    "1AKE": {
        "chain": "A",
        "role": "off_target",
        "label": "1AKE chain A — AP5A-bound reference",
        "stateDescription": "AP5A inhibitor-bound closed conformation of E. coli adenylate kinase",
        "sourceUrl": "https://files.rcsb.org/download/1AKE.pdb",
        "reviewedSha256": "651e952f55f1317f50f4e82b7f0e99053397032cd8da5b2896f79d0af9f619a9",
    },
}

# Walker A (P-loop) residues of E. coli adenylate kinase, numbered from the
# prepared chain-A reference (resSeq 1..214, contiguous, identical to the
# benchmark input sequence).  Residue names are asserted against the PDB file
# at load time, so a numbering or sequence drift blocks live execution.
ADENYLATE_KINASE_P_LOOP = (
    (7, "G"), (8, "A"), (9, "P"), (10, "G"), (11, "A"),
    (12, "G"), (13, "K"), (14, "G"), (15, "T"),
)

P_LOOP_SOURCE = (
    "Prepared 4AKE chain-A reference: contiguous resSeq 1-214, Walker A motif "
    "G7-A8-P9-G10-A11-G12-K13-G14-T15 read from the coordinate file and verified "
    "against the benchmark input sequence."
)

_PRESERVED_TOKEN = re.compile(r"([ACDEFGHIKLMNPQRSTVWY])(\d{1,4})")
_RESIDUE_REGION = re.compile(r"(\d{1,4})(?:\s*-\s*(\d{1,4}))?")


class ReferenceAnnotationError(RuntimeError):
    """Raised when prepared reference annotations cannot be trusted."""


@dataclass(frozen=True)
class ReferenceAnnotation:
    pdb_id: str
    chain: str
    path: Path
    residues: tuple[tuple[int, str, str], ...]  # (resSeq, insertionCode, oneLetter)
    sequence: str
    sha256: str

    @property
    def residue_count(self) -> int:
        return len(self.residues)

    @property
    def numbering_contiguous_from_one(self) -> bool:
        numbers = [resseq for resseq, _, _ in self.residues]
        return numbers == list(range(1, len(numbers) + 1))


def reference_file(prepared_dir: Path, pdb_id: str) -> Path:
    if pdb_id not in REFERENCE_IDS:
        raise ReferenceAnnotationError("Unknown reference structure " + str(pdb_id))
    return Path(prepared_dir) / (pdb_id + "_live_chainA.pdb")


def read_pdb_chain(path: Path, chain: str = "A") -> tuple[tuple[int, str, str], ...]:
    if not Path(path).is_file():
        raise ReferenceAnnotationError("Prepared reference coordinates are missing: " + str(path))
    residues: list[tuple[int, str, str]] = []
    seen: set[tuple[int, str]] = set()
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.startswith("ATOM"):
                continue
            if line[21] != chain:
                continue
            resname = line[17:20].strip()
            if resname not in THREE_TO_ONE:
                continue
            resseq = int(line[22:26])
            icode = line[26].strip()
            key = (resseq, icode)
            if key in seen:
                continue
            seen.add(key)
            residues.append((resseq, icode, THREE_TO_ONE[resname]))
    if not residues:
        raise ReferenceAnnotationError("No chain " + chain + " residues found in " + path.name)
    return tuple(residues)


def load_reference(prepared_dir: Path, pdb_id: str) -> ReferenceAnnotation:
    path = reference_file(prepared_dir, pdb_id)
    residues = read_pdb_chain(path, REFERENCE_METADATA[pdb_id]["chain"])
    sequence = "".join(aa for _, _, aa in residues)
    return ReferenceAnnotation(
        pdb_id=pdb_id,
        chain=REFERENCE_METADATA[pdb_id]["chain"],
        path=path,
        residues=residues,
        sequence=sequence,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
    )


def verify_reference_numbering(annotation: ReferenceAnnotation, input_sequence: str) -> None:
    """Block live execution when sequence and structure numbering disagree."""
    if not annotation.numbering_contiguous_from_one:
        raise ReferenceAnnotationError(
            f"{annotation.pdb_id} chain {annotation.chain} is not numbered contiguously from 1; "
            "sequence-to-structure mapping cannot be established without an authoritative index"
        )
    if input_sequence != annotation.sequence:
        differences = [
            index + 1
            for index, (expected, observed) in enumerate(zip(annotation.sequence, input_sequence))
            if expected != observed
        ]
        if len(input_sequence) != len(annotation.sequence):
            detail = f"length {len(input_sequence)} vs {len(annotation.sequence)}"
        else:
            detail = "positions " + ", ".join(str(item) for item in differences[:8])
        raise ReferenceAnnotationError(
            f"Input sequence does not match the prepared {annotation.pdb_id} chain "
            f"{annotation.chain} reference ({detail}); live execution is blocked"
        )


def authoritative_protected_positions() -> tuple[int, ...]:
    return tuple(position for position, _ in ADENYLATE_KINASE_P_LOOP)


def protected_motif_descriptor() -> dict[str, object]:
    return {
        "name": "Adenylate-kinase Walker A P-loop",
        "positions": list(authoritative_protected_positions()),
        "residues": "".join(residue for _, residue in ADENYLATE_KINASE_P_LOOP),
        "source": P_LOOP_SOURCE,
    }


def resolve_protected_positions(annotation: ReferenceAnnotation, positions: list[int] | None) -> dict[str, object]:
    """Validate protected positions against the prepared reference coordinates."""
    expected = dict(ADENYLATE_KINASE_P_LOOP)
    if not annotation.numbering_contiguous_from_one:
        raise ReferenceAnnotationError(
            f"{annotation.pdb_id} numbering is not contiguous from 1; protected positions cannot be validated"
        )
    if len(annotation.sequence) < max(expected):
        raise ReferenceAnnotationError(f"{annotation.pdb_id} chain {annotation.chain} is shorter than the annotated motif")
    for position, residue in expected.items():
        if annotation.sequence[position - 1] != residue:
            raise ReferenceAnnotationError(
                f"Annotated P-loop residue {residue}{position} is "
                f"{annotation.sequence[position - 1]} in the prepared {annotation.pdb_id} reference; "
                "protected-motif mapping is rejected"
            )
    requested = list(authoritative_protected_positions()) if not positions else sorted(set(int(item) for item in positions))
    for position in requested:
        if position < 1 or position > len(annotation.sequence):
            raise ReferenceAnnotationError(f"Protected position {position} is outside the reference sequence")
    if requested != list(authoritative_protected_positions()):
        raise ReferenceAnnotationError(
            "Requested protected positions "
            + ",".join(str(item) for item in requested)
            + " do not match the authoritative prepared-reference P-loop "
            + ",".join(str(item) for item in authoritative_protected_positions())
        )
    return {
        "positions": requested,
        "residues": {str(position): annotation.sequence[position - 1] for position in requested},
        "source": P_LOOP_SOURCE,
    }


def parse_residue_region(text: str | None) -> tuple[int, int] | None:
    """Parse a residue region such as ``118-160`` or ``42``.

    Live execution rejects any region that is not a plain, unambiguous range so
    that a language model cannot smuggle an unvalidated numbering scheme into a
    run.
    """
    if text is None or not text.strip():
        return None
    match = _RESIDUE_REGION.fullmatch(text.strip())
    if match is None:
        raise ReferenceAnnotationError(
            f"Residue region '{text}' is not a validated range; expected a start-end pair such as '118-160'"
        )
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else start
    if end < start:
        raise ReferenceAnnotationError(f"Residue region '{text}' ends before it starts")
    return start, end


def verify_residue_region(text: str | None, annotation: ReferenceAnnotation) -> tuple[int, int] | None:
    """Reject a residue region that cannot be mapped onto authoritative numbering."""
    region = parse_residue_region(text)
    if region is None:
        return None
    start, end = region
    if not annotation.numbering_contiguous_from_one:
        raise ReferenceAnnotationError(
            f"{annotation.pdb_id} numbering is not contiguous from 1; residue region cannot be validated"
        )
    if start < 1 or end > len(annotation.sequence):
        raise ReferenceAnnotationError(
            f"Residue region '{text}' is outside the prepared {annotation.pdb_id} chain "
            f"{annotation.chain} numbering (1-{len(annotation.sequence)}); live execution is blocked"
        )
    return region


def parse_preserved_residues(text: str | None) -> dict[int, str]:
    """Read ``X123`` tokens from a free-text preservation constraint."""
    if not text:
        return {}
    found: dict[int, str] = {}
    for match in _PRESERVED_TOKEN.finditer(text):
        residue, position = match.group(1), int(match.group(2))
        found.setdefault(position, residue)
    return found


def cross_check_preservation_constraints(text: str | None, annotation: ReferenceAnnotation) -> None:
    """Reject preservation text that contradicts the prepared reference."""
    declared = parse_preserved_residues(text)
    if not declared:
        return
    if not annotation.numbering_contiguous_from_one:
        raise ReferenceAnnotationError(
            f"{annotation.pdb_id} numbering is not contiguous from 1; preservation constraints cannot be validated"
        )
    for position, residue in sorted(declared.items()):
        if position > len(annotation.sequence):
            raise ReferenceAnnotationError(
                f"Preservation constraint references residue {residue}{position}, outside the "
                f"prepared {annotation.pdb_id} chain {annotation.chain} numbering (1-{len(annotation.sequence)})"
            )
        observed = annotation.sequence[position - 1]
        if observed != residue:
            raise ReferenceAnnotationError(
                f"Preservation constraint names {residue}{position} but the prepared reference "
                f"has {observed}{position}; residue numbering does not match the structure"
            )
