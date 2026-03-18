#!/usr/bin/env bash
# Validates that all extensions are registered in every required location.
# Run: bash hack/check-extension-consistency.sh
# Exit code 0 = consistent, 1 = mismatch found.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0

# Source of truth: directories under extensions/ that have a backend/Dockerfile
EXTENSIONS=()
for dir in extensions/*/backend/Dockerfile; do
  ext=$(echo "$dir" | cut -d'/' -f2)
  EXTENSIONS+=("$ext")
done

if [ ${#EXTENSIONS[@]} -eq 0 ]; then
  echo -e "${RED}ERROR: No extensions found under extensions/*/backend/Dockerfile${NC}"
  exit 1
fi

echo "Extensions found: ${EXTENSIONS[*]}"
echo ""

check() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  local ext="$4"

  if ! grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${RED}MISSING${NC}: $ext not found in $file ($label)"
    ERRORS=$((ERRORS + 1))
  fi
}

for ext in "${EXTENSIONS[@]}"; do
  echo "Checking $ext..."

  # Makefile EXTENSIONS list
  check "Makefile EXTENSIONS" "Makefile" "$ext" "$ext"

  # CI workflow matrix
  check "CI workflow matrix" ".github/workflows/ci.yml" "$ext" "$ext"

  # Release workflow matrix
  check "Release workflow matrix" ".github/workflows/release.yml" "$ext" "$ext"

  # Dependabot gomod
  check "Dependabot gomod" ".github/dependabot.yml" "/extensions/$ext/backend" "$ext"

  # Dependabot npm
  check "Dependabot npm" ".github/dependabot.yml" "/extensions/$ext/ui" "$ext"

  # Dependabot docker
  check "Dependabot docker" ".github/dependabot.yml" "/extensions/$ext/backend" "$ext"

  # UI extensions Dockerfile
  check "UI Dockerfile COPY" "deploy/docker/Dockerfile.ui-extensions" "extension-$ext.js" "$ext"

  # Helm values.yaml
  check "Helm values" "deploy/helm/argoplane/values.yaml" "argoplane-$ext-backend" "$ext"

  # Proxy extensions config
  check "Proxy config" "deploy/argocd/proxy-extensions.json" "extension.config.$ext" "$ext"

  # Deploy manifests
  check "Deploy manifest" "deploy/extensions/$ext/deployment.yaml" "argoplane-$ext-backend" "$ext"

  # RBAC in setup-argocd.sh
  check "ArgoCD RBAC" "hack/setup-argocd.sh" "$ext" "$ext"

  echo ""
done

# Check UI-only extensions (no backend, just a UI bundle)
UI_ONLY_EXTENSIONS=()
for dir in extensions/*/ui/package.json; do
  ext=$(echo "$dir" | cut -d'/' -f2)
  # Skip extensions that have a backend (already checked above)
  if [ ! -f "extensions/$ext/backend/Dockerfile" ]; then
    UI_ONLY_EXTENSIONS+=("$ext")
  fi
done

if [ ${#UI_ONLY_EXTENSIONS[@]} -gt 0 ]; then
  echo "UI-only extensions found: ${UI_ONLY_EXTENSIONS[*]}"
  echo ""
  for ext in "${UI_ONLY_EXTENSIONS[@]}"; do
    echo "Checking $ext (UI-only)..."
    check "UI Dockerfile COPY" "deploy/docker/Dockerfile.ui-extensions" "extension-$ext.js" "$ext"
    check "Dependabot npm" ".github/dependabot.yml" "/extensions/$ext/ui" "$ext"
    echo ""
  done
fi

# Check services with Dockerfiles
echo "Checking services..."
for dockerfile in services/*/Dockerfile; do
  svc=$(echo "$dockerfile" | cut -d'/' -f2)
  check "Dependabot docker (service)" ".github/dependabot.yml" "/services/$svc" "$svc"
  check "Dependabot npm (service)" ".github/dependabot.yml" "/services/$svc" "$svc"
  echo ""
done

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}Found $ERRORS consistency issues.${NC}"
  echo ""
  echo "When adding a new extension, update all of these:"
  echo "  1. Makefile (EXTENSIONS list)"
  echo "  2. .github/workflows/ci.yml (matrix.extension)"
  echo "  3. .github/workflows/release.yml (matrix.extension)"
  echo "  4. .github/dependabot.yml (gomod, npm, docker entries)"
  echo "  5. deploy/docker/Dockerfile.ui-extensions (COPY line)"
  echo "  6. deploy/helm/argoplane/values.yaml (extension config)"
  echo "  7. deploy/argocd/proxy-extensions.json (proxy routing)"
  echo "  8. deploy/extensions/<name>/deployment.yaml (K8s manifests)"
  echo "  9. hack/setup-argocd.sh (RBAC)"
  exit 1
else
  echo -e "${GREEN}All extensions are consistently registered.${NC}"
fi
