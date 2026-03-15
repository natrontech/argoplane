---
name: deploy-extension
description: Build and deploy an extension to the local kind cluster. Use when the user wants to test an extension end-to-end in ArgoCD.
user-invocable: true
argument-hint: "[extension-name]"
allowed-tools: Bash(make *), Bash(docker *), Bash(kind *), Bash(kubectl *), Bash(npm *)
---

# Deploy Extension to Local Cluster

Build and deploy the **$ARGUMENTS** extension to the local kind cluster.

## Steps

1. Build the UI extension bundle:
   ```bash
   cd extensions/$ARGUMENTS/ui && npm ci && npm run build
   ```

2. Build the backend Docker image:
   ```bash
   docker build -t argoplane-$ARGUMENTS-backend:dev extensions/$ARGUMENTS/backend/
   ```

3. Load the image into kind:
   ```bash
   kind load docker-image argoplane-$ARGUMENTS-backend:dev --name argoplane-dev
   ```

4. Deploy the backend service:
   ```bash
   kubectl apply -f deploy/extensions/$ARGUMENTS/deployment.yaml
   ```

5. Configure the ArgoCD proxy extension (patch, not apply, to preserve argocd-cm):
   ```bash
   kubectl -n argocd patch cm argocd-cm --type merge --patch-file deploy/argocd/proxy-extensions.json
   ```

6. Mount the UI extension into argocd-server (if not already done):
   - The UI bundle needs to be available at `/tmp/extensions/` inside the argocd-server pod
   - For local dev, create a ConfigMap from the built JS and mount it

7. Restart argocd-server to pick up the new extension:
   ```bash
   kubectl -n argocd rollout restart deployment argocd-server
   kubectl -n argocd rollout status deployment argocd-server --timeout=120s
   ```

8. Verify the backend is running:
   ```bash
   kubectl -n argocd get pods -l app.kubernetes.io/name=argoplane-$ARGUMENTS-backend
   ```

## Verification

- Open ArgoCD UI (http://localhost:8080)
- Navigate to an application
- Check for the new extension tab or status panel item
