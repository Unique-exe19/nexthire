# NextHire — reproduction & evaluation shortcuts (Redrob Hackathon).
# Usage:  make reproduce CANDIDATES=./candidates.jsonl OUT=./submission.csv
#         make evaluate   make precompute   make docker-build   make docker-run
#
# The ranking step is CPU-only and network-free (spec §3). `reproduce` is the
# single command Stage-3 will run.

PY        ?= python
CANDIDATES ?= ./dataset/India_runs_data_and_ai_challenge/candidates.json
OUT        ?= ./submission.csv

.PHONY: help install reproduce precompute evaluate validate docker-build docker-run clean

help:
	@echo "make install      - install core ranking deps (numpy, scikit-learn)"
	@echo "make reproduce    - produce the submission CSV (the Stage-3 command)"
	@echo "make precompute   - optional: build index cache outside the timed run"
	@echo "make evaluate     - offline NDCG/MAP/P@10 + honeypot rate (proxy)"
	@echo "make validate     - format-check the submission CSV"
	@echo "make docker-build / docker-run - containerised reproduction"

install:
	$(PY) -m pip install -r ranker/requirements.txt

# The single command for Stage-3 code reproduction (spec §10.3).
reproduce:
	NEXTHIRE_USE_REDIS=0 NEXTHIRE_ALLOW_GPU=0 \
	$(PY) ranker/ranker.py --input $(CANDIDATES) --output $(OUT)

# Optional, untimed: move corpus parsing + index build out of the ranking step.
precompute:
	$(PY) ranker/precompute.py --input $(CANDIDATES)

evaluate:
	$(PY) ranker/evaluate.py --input $(CANDIDATES) --submission $(OUT)

validate:
	cd ranker && $(PY) validate.py

docker-build:
	docker build -t nexthire-ranker .

# Mounts the current directory at /data; expects candidates.jsonl there.
docker-run:
	docker run --rm -v "$$PWD:/data" nexthire-ranker \
		--input /data/$(notdir $(CANDIDATES)) --output /data/$(notdir $(OUT))

clean:
	rm -f ./submission.csv ./submission_debug.json ./eval_report.json
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
