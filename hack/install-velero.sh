#!/usr/bin/env bash
set -euo pipefail

VELERO_NS="velero"

log() { echo "==> $*"; }

# Create namespace
kubectl create namespace "${VELERO_NS}" --dry-run=client -o yaml | kubectl apply -f -

# Deploy MinIO as local S3-compatible storage for Velero
log "Installing MinIO for Velero backend"
kubectl -n "${VELERO_NS}" apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: minio
  namespace: velero
spec:
  replicas: 1
  selector:
    matchLabels:
      app: minio
  template:
    metadata:
      labels:
        app: minio
    spec:
      containers:
        - name: minio
          image: minio/minio:latest
          args: ["server", "/data", "--console-address", ":9001"]
          env:
            - name: MINIO_ROOT_USER
              value: "minio"
            - name: MINIO_ROOT_PASSWORD
              value: "minio123"
          ports:
            - containerPort: 9000
            - containerPort: 9001
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: minio
  namespace: velero
spec:
  ports:
    - port: 9000
      targetPort: 9000
      name: api
    - port: 9001
      targetPort: 9001
      name: console
  selector:
    app: minio
EOF

kubectl -n "${VELERO_NS}" rollout status deployment minio --timeout=120s

# Create the velero bucket (idempotent)
log "Creating Velero bucket in MinIO"
kubectl -n "${VELERO_NS}" run minio-setup --rm -i --restart=Never \
    --image=minio/mc:latest --command -- \
    sh -c "mc alias set local http://minio:9000 minio minio123 && mc mb --ignore-existing local/velero" \
    2>/dev/null || true

# Install Velero via Helm
log "Installing Velero"
helm repo add vmware-tanzu https://vmware-tanzu.github.io/helm-charts 2>/dev/null || true
helm repo update

# Create credentials secret
kubectl -n "${VELERO_NS}" apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: velero-credentials
  namespace: velero
type: Opaque
stringData:
  cloud: |
    [default]
    aws_access_key_id=minio
    aws_secret_access_key=minio123
EOF

helm upgrade --install velero vmware-tanzu/velero \
    --namespace "${VELERO_NS}" \
    --set configuration.backupStorageLocation[0].provider=aws \
    --set configuration.backupStorageLocation[0].bucket=velero \
    --set configuration.backupStorageLocation[0].config.region=minio \
    --set configuration.backupStorageLocation[0].config.s3ForcePathStyle=true \
    --set configuration.backupStorageLocation[0].config.s3Url=http://minio.velero.svc:9000 \
    --set snapshotsEnabled=false \
    --set deployNodeAgent=false \
    --set credentials.existingSecret=velero-credentials \
    --set kubectl.image.repository=bitnamilegacy/kubectl \
    --set kubectl.image.tag=1.33.4 \
    --set initContainers[0].name=velero-plugin-for-aws \
    --set initContainers[0].image=velero/velero-plugin-for-aws:v1.13.1 \
    --set initContainers[0].imagePullPolicy=IfNotPresent \
    --set initContainers[0].volumeMounts[0].mountPath=/target \
    --set initContainers[0].volumeMounts[0].name=plugins \
    --wait --timeout 180s

log "Velero installed with MinIO backend"
