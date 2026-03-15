# ArgoPlane - ArgoCD Extension Suite
# Run `make help` to see available targets.

# --- Configuration ---
CLUSTER_NAME    ?= argoplane-dev
ARGOCD_VERSION  ?= v3.3.3
ARGOCD_NS       := argocd
KIND_CONFIG     := hack/kind-config.yaml
EXTENSIONS      := metrics backups networking

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

.PHONY: argocd-configure
argocd-configure: ## Configure ArgoCD for local dev (insecure, extensions enabled)
	@bash hack/configure-argocd.sh

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
	@helm repo update
	@helm upgrade --install kube-prometheus prometheus-community/kube-prometheus-stack \
		--namespace monitoring --create-namespace \
		--set grafana.enabled=false \
		--set alertmanager.enabled=false \
		--set prometheus.prometheusSpec.retention=2h \
		--set prometheus.prometheusSpec.resources.requests.memory=256Mi \
		--wait --timeout 180s

.PHONY: velero
velero: cluster ## Install Velero with MinIO (idempotent)
	@bash hack/install-velero.sh

.PHONY: crossplane
crossplane: cluster ## Install Crossplane (idempotent)
	@echo "==> Installing Crossplane"
	@helm repo add crossplane-stable https://charts.crossplane.io/stable 2>/dev/null || true
	@helm repo update
	@helm upgrade --install crossplane crossplane-stable/crossplane \
		--namespace crossplane-system --create-namespace \
		--wait --timeout 120s

.PHONY: external-secrets
external-secrets: cluster ## Install External Secrets Operator (idempotent)
	@echo "==> Installing External Secrets Operator"
	@helm repo add external-secrets https://charts.external-secrets.io 2>/dev/null || true
	@helm repo update
	@helm upgrade --install external-secrets external-secrets/external-secrets \
		--namespace external-secrets --create-namespace \
		--set installCRDs=true \
		--wait --timeout 120s

# --- Dev environment ---

.PHONY: dev-infra
dev-infra: argocd argocd-configure prometheus velero ## Full local dev stack (kind + ArgoCD + operators)
	@echo ""
	@echo "==> Dev infrastructure ready!"
	@echo "    Run 'make argocd-portforward' to access the UI"
	@echo "    Run 'make argocd-password' to get the admin password"

# --- Extensions ---

.PHONY: build-extensions
build-extensions: ## Build all UI extension bundles
	@for ext in $(EXTENSIONS); do \
		echo "==> Building $$ext extension UI"; \
		(cd extensions/$$ext/ui && npm install && npm run build); \
	done

.PHONY: build-backends
build-backends: ## Build all backend Docker images
	@for ext in $(EXTENSIONS); do \
		echo "==> Building $$ext backend"; \
		docker build -t argoplane-$$ext-backend:dev extensions/$$ext/backend/; \
	done

.PHONY: load-extensions
load-extensions: build-backends ## Load extension images into kind cluster
	@for ext in $(EXTENSIONS); do \
		echo "==> Loading $$ext backend into kind"; \
		kind load docker-image argoplane-$$ext-backend:dev --name $(CLUSTER_NAME); \
	done

.PHONY: deploy-extensions
deploy-extensions: ## Deploy extension backends and proxy config to cluster
	@echo "==> Deploying extension backends"
	@for ext in $(EXTENSIONS); do \
		echo "==> Deploying $$ext backend"; \
		kubectl apply -f deploy/extensions/$$ext/deployment.yaml; \
	done
	@echo "==> Configuring ArgoCD proxy extensions"
	@kubectl -n $(ARGOCD_NS) patch cm argocd-cm --type merge --patch-file deploy/argocd/proxy-extensions.json
	@echo "==> Restarting argocd-server to pick up proxy config"
	@kubectl -n $(ARGOCD_NS) rollout restart deployment argocd-server
	@kubectl -n $(ARGOCD_NS) rollout status deployment argocd-server --timeout=120s

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
	-@kubectl delete applications -n $(ARGOCD_NS) -l app.kubernetes.io/part-of=argoplane-test 2>/dev/null || true
	-@kubectl delete ns argoplane-test --wait=false 2>/dev/null || true

.PHONY: clean-all
clean-all: cluster-delete ## Destroy everything

# --- Help ---

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
