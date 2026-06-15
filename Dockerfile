# ─────────────────────────────────────────────────────────────────────────────
# NextHire ranking step — reproducible, CPU-only, network-free (Redrob spec §3).
# Builds a deterministic image that runs the ranker on a candidates file and
# writes the submission CSV. No GPU, no hosted APIs, no network at run time.
#
# Build:  docker build -t nexthire-ranker .
# Run:    docker run --rm -v "$PWD:/data" nexthire-ranker \
#             --input /data/candidates.jsonl --output /data/submission.csv
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

# No build toolchain needed: deps are numpy + scikit-learn (manylinux wheels).
WORKDIR /app

# Install only the core ranking dependencies (see ranker/requirements.txt).
COPY ranker/requirements.txt /app/ranker/requirements.txt
RUN pip install --no-cache-dir numpy>=1.24 scikit-learn>=1.3

# Copy the ranking source (web/, dataset/, docs are intentionally excluded).
COPY ranker/ /app/ranker/

# Belt-and-braces: guarantee the ranking step never reaches the network or a GPU,
# even if an optional dependency is present in some environment.
ENV NEXTHIRE_USE_REDIS=0 \
    NEXTHIRE_ALLOW_GPU=0 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8

# Default input/output can be overridden at `docker run` time.
ENTRYPOINT ["python", "ranker/ranker.py"]
CMD ["--input", "/data/candidates.jsonl", "--output", "/data/submission.csv"]
