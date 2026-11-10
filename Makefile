# ArgoPlane - ArgoCD Extension Suite
# Run `make help` to see available targets.

# --- Configuration ---
CLUSTER_NAME    ?= argoplane-dev
# Opt-in second cluster; only created by the spoke/dev-infra-multicluster targets.
SPOKE_CLUSTER_NAME ?= argoplane-dev-spoke
ARGOCD_VERSION  ?= v3.5.2
# 93.x ships prometheus-operator v0.95.1, which has no arm64 image.
KUBE_PROMETHEUS_STACK_VERSION ?= 92.22.0
ARGOCD_NS       := argocd
KIND_CONFIG     := hack/kind-config.yaml
EXTENSIONS      := metrics networking logs vulnerabilities events
UI_ONLY_EXTENSIONS := argoplane
ALL_UI_EXTENSIONS  := $(EXTENSIONS) $(UI_ONLY_EXTENSIONS)

# --- Cluster lifecycle ---

.PHONY: cluster
cluster: ## Create kind cluster (idempotent)
	@if kind get clusters 2>/dev/null | grep -q '^$(CLUSTER_NAME)$$'; then \
		echo "==> Cluster '$(CLUSTER_NAME)' already exists"; \
	else \
		echo "==> Creating cluster '$(CLUSTER_NAME)'"; \
		kind create cluster --name $(CLUSTER_NAME) --config $(KIND_CONFIG); \
	fi
	@kubectl config use-context kind-$(CLUSTER_NAME)

.PHONY: cluster-delete
cluster-delete: ## Delete kind cluster (idempotent)
	@if kind get clusters 2>/dev/null | grep -q '^$(CLUSTER_NAME)$$'; then \
		echo "==> Deleting cluster '$(CLUSTER_NAME)'"; \
		kind delete cluster --name $(CLUSTER_NAME); \
	else \
		echo "==> Cluster '$(CLUSTER_NAME)' does not exist"; \
	fi

.PHONY: spoke
spoke: ## Add an opt-in spoke cluster to an existing hub (multi-cluster dev)
	@CLUSTER_NAME=$(CLUSTER_NAME) SPOKE_CLUSTER_NAME=$(SPOKE_CLUSTER_NAME) \
		ARGOCD_NS=$(ARGOCD_NS) bash hack/setup-spoke.sh

.PHONY: spoke-delete
spoke-delete: ## Delete the spoke cluster, leaving the hub alone (idempotent)
	@if kind get clusters 2>/dev/null | grep -q '^$(SPOKE_CLUSTER_NAME)$$'; then \
		echo "==> Deleting spoke cluster '$(SPOKE_CLUSTER_NAME)'"; \
		kind delete cluster --name $(SPOKE_CLUSTER_NAME); \
	else \
		echo "==> Spoke cluster '$(SPOKE_CLUSTER_NAME)' does not exist"; \
	fi
	@echo "==> Removing the spoke's registration from the hub"
	-@kubectl --context kind-$(CLUSTER_NAME) -n $(ARGOCD_NS) delete application argoplane-demo-spoke --ignore-not-found --interactive=false 2>/dev/null || true
	-@kubectl --context kind-$(CLUSTER_NAME) -n $(ARGOCD_NS) delete secret $(SPOKE_CLUSTER_NAME) --ignore-not-found --interactive=false 2>/dev/null || true
	@echo "==> Returning the backend to single-cluster, and revoking the Secret grant"
	-@kubectl --context kind-$(CLUSTER_NAME) -n $(ARGOCD_NS) set env deploy/argoplane-vulnerabilities-backend MULTI_CLUSTER- 2>/dev/null || true
	-@kubectl --context kind-$(CLUSTER_NAME) -n $(ARGOCD_NS) delete role,rolebinding argoplane-vulnerabilities-clusters --ignore-not-found --interactive=false 2>/dev/null || true

# --- CNI (Cilium) ---

.PHONY: cilium
cilium: cluster ## Install Cilium CNI (idempotent)
	@CLUSTER_NAME=$(CLUSTER_NAME) bash hack/install-cilium.sh

# --- ArgoCD ---

.PHONY: argocd
argocd: cilium ## Install ArgoCD (idempotent)
	@echo "==> Installing ArgoCD $(ARGOCD_VERSION)"
	@kubectl create namespace $(ARGOCD_NS) --dry-run=client -o yaml | kubectl apply -f -
	@kubectl apply -n $(ARGOCD_NS) --server-side --force-conflicts \
		-f https://raw.githubusercontent.com/argoproj/argo-cd/$(ARGOCD_VERSION)/manifests/install.yaml
	@echo "==> Waiting for ArgoCD to be ready..."
	@kubectl -n $(ARGOCD_NS) rollout status deployment argocd-server --timeout=180s
	@kubectl -n $(ARGOCD_NS) rollout status deployment argocd-repo-server --timeout=120s
	@kubectl -n $(ARGOCD_NS) rollout status deployment argocd-redis --timeout=120s

.PHONY: setup-argocd
setup-argocd: ## Configure ArgoCD + deploy extensions + UI bundles (all-in-one)
	@bash hack/setup-argocd.sh

.PHONY: argocd-password
argocd-password: ## Print ArgoCD admin password
	@kubectl -n $(ARGOCD_NS) get secret argocd-initial-admin-secret \
		-o jsonpath="{.data.password}" | base64 -d && echo

.PHONY: argocd-portforward
argocd-portforward: ## Port-forward ArgoCD UI to localhost:8080
	@echo "==> ArgoCD UI at http://localhost:8080"
	@kubectl port-forward svc/argocd-server -n $(ARGOCD_NS) 8080:80

# --- Operators ---

.PHONY: prometheus
prometheus: cluster ## Install kube-prometheus-stack (idempotent)
	@echo "==> Installing Prometheus stack"
	@helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
	@helm repo update prometheus-community
	@helm upgrade --install kube-prometheus prometheus-community/kube-prometheus-stack \
		--version $(KUBE_PROMETHEUS_STACK_VERSION) \
		--namespace monitoring --create-namespace \
		--set grafana.enabled=false \
		--set alertmanager.enabled=false \
		--set prometheus.prometheusSpec.retention=2h \
		--set prometheus.prometheusSpec.resources.requests.memory=256Mi \
		--wait --timeout 180s

.PHONY: loki
loki: cluster ## Install Loki + Alloy for log aggregation (idempotent)
	@bash hack/install-loki.sh

.PHONY: trivy
trivy: cluster ## Install Trivy Operator (idempotent)
	@bash hack/install-trivy.sh

.PHONY: crossplane
crossplane: cluster ## Install Crossplane (idempotent)
	@echo "==> Installing Crossplane"
	@helm repo add crossplane-stable https://charts.crossplane.io/stable 2>/dev/null || true
	@helm repo update crossplane-stable
	@helm upgrade --install crossplane crossplane-stable/crossplane \
		--namespace crossplane-system --create-namespace \
		--wait --timeout 120s

.PHONY: external-secrets
external-secrets: cluster ## Install External Secrets Operator (idempotent)
	@echo "==> Installing External Secrets Operator"
	@helm repo add external-secrets https://charts.external-secrets.io 2>/dev/null || true
	@helm repo update external-secrets
	@helm upgrade --install external-secrets external-secrets/external-secrets \
		--namespace external-secrets --create-namespace \
		--set installCRDs=true \
		--wait --timeout 120s

# --- Dev environment ---

.PHONY: dev-infra
dev-infra: argocd prometheus loki trivy setup-argocd ## Full local dev stack (kind + ArgoCD + operators)
	@echo ""
	@echo "==> Dev infrastructure ready!"
	@echo "    Run 'make argocd-portforward' to access the UI"
	@echo "    Run 'make argocd-password' to get the admin password"

.PHONY: dev-infra-multicluster
# Same steps as dev-infra, but reload-extensions in place of setup-argocd: the spoke
# setup waits for the vulnerabilities backend to roll out, so its image has to be
# built and loaded first, and make runs setup-argocd only once per invocation.
dev-infra-multicluster: argocd prometheus loki trivy reload-extensions spoke ## Full local dev stack plus an opt-in spoke cluster
	@echo ""
	@echo "==> Multi-cluster dev infrastructure ready!"
	@echo "    Hub:   kind-$(CLUSTER_NAME)"
	@echo "    Spoke: kind-$(SPOKE_CLUSTER_NAME)"

# --- Extensions ---

.PHONY: build-extensions
build-extensions: ## Build all UI extension bundles
	@echo "==> Installing shared dependencies"
	@cd extensions/shared && npm ci
	@for ext in $(ALL_UI_EXTENSIONS); do \
		echo "==> Building $$ext extension UI"; \
		(cd extensions/$$ext/ui && npm install && npm run build); \
	done

.PHONY: build-backends
build-backends: ## Build all backend Docker images
	@for ext in $(EXTENSIONS); do \
		echo "==> Building $$ext backend"; \
		docker build -t argoplane-$$ext-backend:dev extensions/$$ext/backend/; \
	done

.PHONY: build-ui-extensions-image
build-ui-extensions-image: build-extensions ## Build the UI extensions init container image
	@echo "==> Building UI extensions init container image"
	docker build -t argoplane-ui-extensions:dev -f deploy/docker/Dockerfile.ui-extensions .

.PHONY: load-extensions
load-extensions: build-backends ## Load extension images into kind cluster
	@for ext in $(EXTENSIONS); do \
		echo "==> Loading $$ext backend into kind"; \
		kind load docker-image argoplane-$$ext-backend:dev --name $(CLUSTER_NAME); \
	done
	@echo "==> Loading UI extensions init container image into kind"
	@kind load docker-image argoplane-ui-extensions:dev --name $(CLUSTER_NAME) 2>/dev/null || true

.PHONY: reload-extensions
reload-extensions: build-extensions build-backends load-extensions setup-argocd ## Rebuild + redeploy all extensions

# --- Example app ---

.PHONY: deploy-example
deploy-example: ## Deploy demo app for visual testing of all extensions
	@bash hack/deploy-example.sh

.PHONY: clean-example
clean-example: ## Remove demo app and namespace
	-@kubectl delete application -n $(ARGOCD_NS) argoplane-demo --interactive=false 2>/dev/null || true
	-@kubectl delete ns argoplane-demo --wait=false --interactive=false 2>/dev/null || true
	-@kubectl delete ns other-team --wait=false --interactive=false 2>/dev/null || true
	-@kubectl delete ciliumclusterwidenetworkpolicy platform-allow-dns platform-allow-health-probes --interactive=false 2>/dev/null || true

# --- Testing ---

.PHONY: test-integration
test-integration: ## Run integration tests against kind cluster
	@echo "==> Running integration tests"
	@cd tests && go test -v -count=1 -timeout 5m ./...

.PHONY: test-integration-short
test-integration-short: ## Run quick integration tests
	@echo "==> Running short integration tests"
	@cd tests && go test -v -short -count=1 -timeout 2m ./...

# --- Cleanup ---

.PHONY: clean
clean: ## Remove test resources, keep cluster
	@echo "==> Cleaning test resources"
	-@kubectl delete applications -n $(ARGOCD_NS) -l app.kubernetes.io/part-of=argoplane-test --interactive=false 2>/dev/null || true
	-@kubectl delete ns argoplane-test --wait=false --interactive=false 2>/dev/null || true

.PHONY: clean-all
clean-all: spoke-delete cluster-delete ## Destroy everything, including the spoke if one exists

# --- Documentation ---

.PHONY: docs-site
docs-site: ## Build the documentation site
	@echo "==> Building docs site"
	@cd services/docs && npm install && npm run build

.PHONY: docs-site-dev
docs-site-dev: ## Run docs site in dev mode
	@echo "==> Starting docs dev server"
	@cd services/docs && npm install && npm run dev

# --- Help ---

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
