{{/*
Expand the name of the chart.
*/}}
{{- define "argoplane.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "argoplane.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart label values.
*/}}
{{- define "argoplane.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "argoplane.labels" -}}
helm.sh/chart: {{ include "argoplane.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: argoplane
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- with .Values.global.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Extension-specific labels. Call with a dict containing "name", "root" (top-level context).
*/}}
{{- define "argoplane.extensionLabels" -}}
{{ include "argoplane.labels" .root }}
app.kubernetes.io/name: {{ printf "argoplane-%s-backend" .name }}
app.kubernetes.io/component: {{ .name }}
{{- end }}

{{/*
Extension selector labels for Deployment/Service matching.
*/}}
{{- define "argoplane.extensionSelectorLabels" -}}
app.kubernetes.io/name: {{ printf "argoplane-%s-backend" .name }}
app.kubernetes.io/part-of: argoplane
{{- end }}

{{/*
Resolve image tag: use extension-level tag, fall back to Chart.AppVersion.
*/}}
{{- define "argoplane.imageTag" -}}
{{- .tag | default $.appVersion }}
{{- end }}

{{/*
ArgoCD namespace.
*/}}
{{- define "argoplane.argocdNamespace" -}}
{{- .Values.argocd.namespace | default "argocd" }}
{{- end }}

{{/*
Image pull secrets.
*/}}
{{- define "argoplane.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}
