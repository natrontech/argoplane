#!/usr/bin/env bash
# Shared helpers for ArgoPlane dev scripts.
# Source this file at the top of hack/*.sh scripts:
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

set -euo pipefail

# --- Logging ---

log() { echo "==> $*"; }
warn() { echo "==> WARNING: $*" >&2; }
die() { echo "==> ERROR: $*" >&2; exit 1; }

# --- Kubernetes helpers ---

# wait_for_rollout NAMESPACE DEPLOYMENT [TIMEOUT_SECONDS]
# Blocks until a Deployment rollout completes.
wait_for_rollout() {
    local ns="$1" deploy="$2" timeout="${3:-180}"
    log "Waiting for deployment/$deploy rollout in $ns..."
    kubectl -n "$ns" rollout status deployment "$deploy" --timeout="${timeout}s"
}

# wait_for_pod NAMESPACE LABEL_SELECTOR [TIMEOUT_SECONDS]
# Waits for a Running+Ready pod matching the selector, then prints its name.
# Handles the rollout restart race condition: uses kubectl wait for readiness
# then selects a Running pod (avoids Completed/Terminating pods).
wait_for_pod() {
    local ns="$1" selector="$2" timeout="${3:-120}"
    log "Waiting for pod ($selector) in $ns to be Ready..."

    # Wait for at least one pod to be Ready
    if ! kubectl -n "$ns" wait pod -l "$selector" \
        --for=condition=Ready --timeout="${timeout}s" 2>/dev/null; then
        die "Timed out waiting for pod ($selector) in $ns"
    fi

    # Select a Running pod (avoids Completed/Terminating pods from previous rollout)
    local pod
    pod=$(kubectl -n "$ns" get pods -l "$selector" \
        --field-selector=status.phase=Running \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$pod" ]; then
        die "No Running pod found for ($selector) in $ns"
    fi

    echo "$pod"
}

# --- Path helpers ---

# repo_root returns the absolute path to the repository root.
repo_root() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd)"
    cd "$script_dir/.." && pwd
}
