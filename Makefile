SHELL := bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help

IMAGE ?= ghcr.io/brandonapol/sre-crashout
TAG ?= dev
KIND_CLUSTER ?= clickhouse-obs
OTLP_ENDPOINT ?= http://otel-collector.observability.svc.cluster.local:4317
PRODUCTS := ledger storefront quoting
PR ?=
P ?=
TIER ?=
EXPECT ?=
K3D_CLUSTER ?= k3s-default

export IMAGE TAG OTLP_ENDPOINT

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z/_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-18s %s\n", $$1, $$2}'

.PHONY: setup
setup: setup/hooks ## Install Node dependencies and the git hooks
	npm ci

.PHONY: setup/hooks
setup/hooks: ## Install the commit-msg hook that rejects AI attribution
	git config core.hooksPath git/hooks

.PHONY: build
build: ## Compile the TypeScript services into dist/
	npm run build

.PHONY: check
check: ## Typecheck, shellcheck, and render every product at every release
	npm run typecheck
	shellcheck scripts/*.bash git/hooks/* .claude/skills/outage-drill/scripts/*.bash
	for p in $(PRODUCTS); do \
	  helm dependency build scenarios/$$p/deploy/chart >/dev/null; \
	  helm lint --strict scenarios/$$p/deploy/chart >/dev/null; \
	  for r in scenarios/$$p/deploy/releases/*.yaml; do \
	    helm template $$p scenarios/$$p/deploy/chart -n $$p -f $$r >/dev/null; \
	  done; \
	  for r in facilitator/drills/$$p/*.yaml; do \
	    [[ -e $$r ]] || continue; \
	    helm template $$p scenarios/$$p/deploy/chart -n $$p -f $$r >/dev/null; \
	  done; \
	done
	@echo ok

.PHONY: check/attribution
check/attribution: ## Fail on AI attribution in a pull request (PR=number) or in the commits since main
	if [[ -n "$(PR)" ]]; then scripts/check-attribution.bash pr $(PR); else scripts/check-attribution.bash range origin/main..HEAD; fi

.PHONY: image
image: ## Build the image every service runs from
	docker build -t $(IMAGE):$(TAG) .

.PHONY: kind/load
kind/load: ## Load the image into the kind cluster
	docker save $(IMAGE):$(TAG) | docker exec -i $(KIND_CLUSTER)-control-plane ctr -n k8s.io images import --all-platforms -

.PHONY: k3s/load
k3s/load: ## Load the image into k3s running on this machine (uses sudo)
	docker save $(IMAGE):$(TAG) | sudo k3s ctr images import -

.PHONY: k3d/load
k3d/load: ## Load the image into a k3d cluster
	k3d image import --cluster $(K3D_CLUSTER) $(IMAGE):$(TAG)

.PHONY: drill/start
drill/start: guard-P ## Deploy P's healthy baseline release
	scripts/drill.bash start $(P)

.PHONY: drill/preflight
drill/preflight: guard-P ## Check the cluster can run P's drill at TIER
	scripts/drill.bash preflight $(P) $(TIER)

.PHONY: drill/incident
drill/incident: guard-P ## Deploy P's incident release for TIER (basic, easy, medium, hard)
	scripts/drill.bash incident $(P) $(TIER)

.PHONY: drill/reset
drill/reset: guard-P ## Put P back on its baseline release
	scripts/drill.bash start $(P)

.PHONY: drill/stop
drill/stop: guard-P ## Uninstall P and delete its namespace
	scripts/drill.bash stop $(P)

.PHONY: drill/status
drill/status: guard-P ## Pods and the last minute of P's synthetic traffic
	scripts/drill.bash status $(P)

.PHONY: drill/verify
drill/verify: guard-P ## Check P shows EXPECT: healthy, or a tier's incident
	scripts/drill.bash verify $(P) $(EXPECT)

.PHONY: drill/render
drill/render: guard-P ## Write P's manifests (baseline, or TIER's incident) to dist/
	scripts/drill.bash render $(P) $(TIER)

.PHONY: guard-P
guard-P:
	@[[ " $(PRODUCTS) " == *" $(P) "* ]] || { echo "set P to one of: $(PRODUCTS)"; exit 1; }
