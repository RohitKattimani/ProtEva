from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Iterable, Mapping, Optional, Protocol, Sequence

from .models import Candidate


@dataclass(frozen=True)
class FitnessRecord:
    """An external evaluator's scalar result for a proposed candidate.

    The evaluator is responsible for the scientific definition, provenance,
    artifacts, and uncertainty. A missing score remains unevaluated.
    """

    candidate_id: str
    score: Optional[float]
    evaluator_name: str


class CandidateEvaluator(Protocol):
    """Future boundary for BioEmu artifacts plus deterministic metrics."""

    def evaluate(self, candidates: Sequence[Candidate]) -> Sequence[FitnessRecord]:
        """Return one record per attempted candidate; never fabricate a score."""


def valid_score_index(
    candidates: Iterable[Candidate], records: Iterable[FitnessRecord]
) -> Mapping[str, float]:
    candidate_ids = {candidate.id for candidate in candidates}
    indexed: dict[str, float] = {}
    for record in records:
        if record.candidate_id not in candidate_ids:
            raise ValueError(f"fitness record references unknown candidate {record.candidate_id}")
        if record.candidate_id in indexed:
            raise ValueError(f"duplicate fitness record for {record.candidate_id}")
        if record.score is None:
            continue
        if not isinstance(record.score, (int, float)) or not isfinite(record.score):
            continue
        indexed[record.candidate_id] = float(record.score)
    return indexed
