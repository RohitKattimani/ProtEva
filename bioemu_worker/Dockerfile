# Build from the repository root:
# docker build -f bioemu_worker/Dockerfile -t proteva-bioemu-worker:1.4.1 .
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    HOME=/cache \
    HF_HOME=/cache/huggingface

RUN apt-get update \
    && apt-get install --yes --no-install-recommends software-properties-common ca-certificates \
    && add-apt-repository --yes universe \
    && apt-get update \
    && apt-get install --yes --no-install-recommends python3.11 python3.11-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3.11 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip==25.2

COPY bioemu_worker/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY bioemu_worker/worker.py /app/worker.py
RUN useradd --create-home --uid 10001 worker \
    && mkdir --parents /artifacts /cache \
    && chown --recursive worker:worker /artifacts /cache

USER worker
WORKDIR /app
ENTRYPOINT ["python", "/app/worker.py"]
