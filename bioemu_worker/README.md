# BioEmu feasibility worker

This worker is intentionally isolated from `backend/`. It invokes Microsoft BioEmu's upstream `bioemu.sample` module and writes a per-job manifest from the files that upstream actually produced. It does not calculate fitness, call the ProtEva API, or communicate with the genetic algorithm.

## Build on a Linux GPU host

Run from the repository root on a Linux host with Docker, NVIDIA Container Toolkit, a CUDA-12-compatible driver, outbound network access for first-use downloads, and enough free disk for model/cache assets:

```bash
docker build -f bioemu_worker/Dockerfile -t proteva-bioemu-worker:1.4.1 .
mkdir -p bioemu_worker/artifacts bioemu_worker/cache
docker run --rm --gpus all \
  -v "$PWD/bioemu_worker/artifacts:/artifacts" \
  -v "$PWD/bioemu_worker/cache:/cache" \
  proteva-bioemu-worker:1.4.1 \
  --sequence GYDPETGTWG --num-samples 10 --model-name bioemu-v1.1 --timeout-seconds 7200
```

The worker creates one unique `job-<UTC timestamp>-<UUID>` directory. Never reuse a job directory as BioEmu treats an existing output directory as resumable sampling state.

After a genuine successful run, inspect that job's `manifest.json`, `stdout.log`, `stderr.log`, and artifact records. The worker discovers `.xtc` and `.pdb` files after sampling, computes SHA-256 checksums for every output file, and uses `mdtraj` to count retained trajectory frames. It never assumes output filenames in advance. BioEmu may retain fewer than the requested samples because upstream filters samples with clashes or discontinuities by default.

## Requirements pinned here

`requirements.txt` pins `bioemu[cuda]==1.4.1`, the current Microsoft-published Linux wheel at the time of this spike. Its CUDA extra specifies CUDA 12 JAX components. The container uses Python 3.11 and CUDA 12.8 runtime. Model checkpoints are selected with `--model-name`; the default is upstream's paper checkpoint, `bioemu-v1.1`. BioEmu downloads checkpoints from Hugging Face and bundled ColabFold/AlphaFold2 resources fetch AlphaFold2 weights into the cache on first use.

The Docker image uses the NVIDIA runtime only at `docker run --gpus all`; no GPU dependency has been added to `backend/pyproject.toml` or the frontend.
