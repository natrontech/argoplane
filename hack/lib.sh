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
# Uses polling instead of `kubectl wait` to avoid matching stale pods during
# rollout restarts. Only returns the newest pod by creation timestamp.
wait_for_pod() {
    local ns="$1" selector="$2" timeout="${3:-120}"
    local deadline=$((SECONDS + timeout))

    # All status output goes to stderr so stdout only contains the pod name.
    echo "==> Waiting for pod ($selector) in $ns to be Ready..." >&2

    while [ $SECONDS -lt $deadline ]; do
        # Get the newest Running pod sorted by creation timestamp (newest last).
        local pod
        pod=$(kubectl -n "$ns" get pods -l "$selector" \
            --field-selector=status.phase=Running \
            --sort-by=.metadata.creationTimestamp \
            -o jsonpath='{.items[-1:].metadata.name}' 2>/dev/null) || true

        if [ -n "$pod" ]; then
            # Check if this specific pod is Ready (all containers running).
            local ready
            ready=$(kubectl -n "$ns" get pod "$pod" \
                -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null) || true
            if [ "$ready" = "True" ]; then
                echo "==> Pod $pod is Ready" >&2
                echo "$pod"
                return 0
            fi
        fi

        echo "==> Still waiting..." >&2
        sleep 3
    done

    die "Timed out waiting for pod ($selector) in $ns"
}

# --- Path helpers ---

# repo_root returns the absolute path to the repository root.
repo_root() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd)"
    cd "$script_dir/.." && pwd
}
