"""Run one isolated upstream BioEmu sampling job and record its real artifacts."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

CANONICAL_AMINO_ACIDS = frozenset("ACDEFGHIKLMNPQRSTVWY")
SMOKE_TEST_SEQUENCE = "GYDPETGTWG"
SMOKE_TEST_SAMPLES = 10
MAX_SAMPLE_COUNT = 1000
MODEL_NAMES = ("bioemu-v1.0", "bioemu-v1.1", "bioemu-v1.2")


class JobValidationError(ValueError):
    """Input cannot safely become an upstream BioEmu sampling command."""


def validate_sequence(sequence: str) -> str:
    normalized = sequence.strip().upper()
    if not normalized:
        raise JobValidationError("sequence must not be empty")
    invalid = sorted(set(normalized) - CANONICAL_AMINO_ACIDS)
    if invalid:
        raise JobValidationError(f"sequence has non-canonical residues: {', '.join(invalid)}")
    return normalized


def validate_sample_count(value: int) -> int:
    if not 1 <= value <= MAX_SAMPLE_COUNT:
        raise JobValidationError(f"num_samples must be between 1 and {MAX_SAMPLE_COUNT}")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as artifact:
        for block in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def directory_size(path: Path) -> Optional[int]:
    if not path.exists():
        return None
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def cache_state() -> dict[str, Any]:
    paths = {
        "colabfold": Path.home() / ".cache" / "colabfold",
        "huggingface": Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")),
    }
    return {
        name: {"exists": path.exists(), "bytes": directory_size(path), "path": str(path)}
        for name, path in paths.items()
    }


def command_output(command: Sequence[str]) -> Optional[str]:
    try:
        return subprocess.run(command, check=False, text=True, capture_output=True).stdout.strip() or None
    except OSError:
        return None


def runtime_diagnostics() -> dict[str, Any]:
    diagnostics: dict[str, Any] = {
        "operating_system": platform.platform(),
        "python_version": sys.version,
        "python_executable": sys.executable,
        "bioemu_version": None,
        "torch_version": None,
        "torch_cuda_version": None,
        "cuda_available": False,
        "gpu": [],
        "nvidia_smi": command_output(["nvidia-smi", "--query-gpu=name,memory.total,memory.free,driver_version", "--format=csv,noheader"]),
    }
    try:
        diagnostics["bioemu_version"] = importlib.metadata.version("bioemu")
    except importlib.metadata.PackageNotFoundError:
        pass
    try:
        import torch

        diagnostics["torch_version"] = torch.__version__
        diagnostics["torch_cuda_version"] = torch.version.cuda
        diagnostics["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            diagnostics["gpu"] = [
                {
                    "index": index,
                    "name": torch.cuda.get_device_name(index),
                    "total_memory_bytes": torch.cuda.get_device_properties(index).total_memory,
                    "allocated_memory_bytes": torch.cuda.memory_allocated(index),
                }
                for index in range(torch.cuda.device_count())
            ]
    except ImportError:
        diagnostics["torch_import_error"] = "torch is not installed"
    return diagnostics


def artifact_records(output_dir: Path) -> list[dict[str, Any]]:
    return [
        {
            "path": str(path.relative_to(output_dir)),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in sorted(output_dir.rglob("*"))
        if path.is_file() and path.name not in {"manifest.json", "stdout.log", "stderr.log"}
    ]


def retained_sample_count(output_dir: Path) -> tuple[Optional[int], Optional[str]]:
    """Inspect discovered structural files; do not assume an upstream filename."""
    xtc_files = sorted(output_dir.glob("*.xtc"))
    pdb_files = sorted(output_dir.glob("*.pdb"))
    if not xtc_files or not pdb_files:
        return None, "no .xtc/.pdb structural artifact pair was found"
    try:
        import mdtraj

        trajectory = mdtraj.load_xtc(str(xtc_files[0]), top=str(pdb_files[0]))
        return trajectory.n_frames, None
    except Exception as error:  # Artifact validation must retain the useful parser error.
        return None, f"could not read discovered structural artifacts: {error}"


def write_manifest(path: Path, body: dict[str, Any]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(body, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def run_job(args: argparse.Namespace) -> int:
    sequence = validate_sequence(args.sequence)
    requested_samples = validate_sample_count(args.num_samples)
    if platform.system() != "Linux":
        raise JobValidationError("BioEmu worker requires Linux; run the supplied Docker image on a Linux GPU host")
    output_root = Path(args.output_root).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    job_dir = output_root / f"job-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex}"
    job_dir.mkdir()
    manifest_path = job_dir / "manifest.json"
    started = time.monotonic()
    before_cache = cache_state()
    manifest: dict[str, Any] = {
        "status": "started",
        "job_id": job_dir.name,
        "requested": {
            "sequence": sequence,
            "num_samples": requested_samples,
            "model_name": args.model_name,
            "base_seed": args.base_seed,
        },
        "output_directory": str(job_dir),
        "runtime": runtime_diagnostics(),
        "cache_before": before_cache,
    }
    write_manifest(manifest_path, manifest)
    if not manifest["runtime"]["cuda_available"]:
        manifest.update(
            status="failed_preflight",
            error="CUDA was not available to PyTorch; no upstream sampling command was issued.",
            wall_clock_seconds=time.monotonic() - started,
            cache_after=cache_state(),
        )
        write_manifest(manifest_path, manifest)
        return 2

    command = [
        sys.executable,
        "-m",
        "bioemu.sample",
        "--sequence",
        sequence,
        "--num_samples",
        str(requested_samples),
        "--output_dir",
        str(job_dir),
        "--model_name",
        args.model_name,
    ]
    if args.base_seed is not None:
        command.extend(["--base_seed", str(args.base_seed)])
    manifest["command"] = command
    try:
        completed = subprocess.run(command, text=True, capture_output=True, timeout=args.timeout_seconds)
        (job_dir / "stdout.log").write_text(completed.stdout, encoding="utf-8")
        (job_dir / "stderr.log").write_text(completed.stderr, encoding="utf-8")
        manifest["exit_status"] = completed.returncode
        if completed.returncode != 0:
            manifest["status"] = "failed"
            manifest["error"] = "upstream BioEmu sampler returned a non-zero exit status"
        else:
            manifest["status"] = "completed"
    except subprocess.TimeoutExpired as error:
        (job_dir / "stdout.log").write_text(error.stdout or "", encoding="utf-8")
        (job_dir / "stderr.log").write_text(error.stderr or "", encoding="utf-8")
        manifest.update(status="timed_out", error=f"sampling exceeded {args.timeout_seconds} seconds", exit_status=None)
    except OSError as error:
        manifest.update(status="failed", error=f"could not start upstream BioEmu sampler: {error}", exit_status=None)

    retained, validation_error = retained_sample_count(job_dir)
    manifest.update(
        wall_clock_seconds=time.monotonic() - started,
        retained_samples=retained,
        artifacts=artifact_records(job_dir),
        artifact_validation={"valid": validation_error is None, "error": validation_error},
        cache_after=cache_state(),
    )
    if manifest["status"] == "completed" and validation_error is not None:
        manifest.update(status="failed_artifact_validation", error=validation_error)
    write_manifest(manifest_path, manifest)
    return 0 if manifest["status"] == "completed" else 1


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--sequence", required=True, help="Canonical one-letter amino-acid sequence")
    command.add_argument("--num-samples", type=int, required=True)
    command.add_argument("--output-root", default="/artifacts")
    command.add_argument("--model-name", choices=MODEL_NAMES, default="bioemu-v1.1")
    command.add_argument("--base-seed", type=int)
    command.add_argument("--timeout-seconds", type=int, default=7200)
    return command


def main() -> int:
    args = parser().parse_args()
    if args.timeout_seconds < 60:
        parser().error("--timeout-seconds must be at least 60")
    try:
        return run_job(args)
    except JobValidationError as error:
        print(f"input/preflight error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
