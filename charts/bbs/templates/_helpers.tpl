{{- define "bbs.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "bbs.fullname" -}}
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

{{- define "bbs.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{ include "bbs.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "bbs.selectorLabels" -}}
app.kubernetes.io/name: {{ include "bbs.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "bbs.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "bbs.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/* BBS_SALT を持つ Secret */}}
{{- define "bbs.saltSecretName" -}}
{{- default (include "bbs.fullname" .) .Values.bbs.existingSecret }}
{{- end }}

{{/* S3 の認証情報を持つ Secret（認証情報を使わない場合は空） */}}
{{- define "bbs.litestreamSecretName" -}}
{{- with .Values.litestream.s3 }}
{{- if .existingSecret }}
{{- .existingSecret }}
{{- else if .accessKeyId }}
{{- include "bbs.fullname" $ }}
{{- end }}
{{- end }}
{{- end }}

{{/* チャートが Secret を作るか */}}
{{- define "bbs.createSecret" -}}
{{- if or (not .Values.bbs.existingSecret) (and .Values.litestream.enabled .Values.litestream.s3.accessKeyId (not .Values.litestream.s3.existingSecret)) }}true{{ end }}
{{- end }}

{{/* Litestream の restore と replicate で共通の設定 */}}
{{- define "bbs.litestreamContainer" -}}
image: "{{ .Values.litestream.image.repository }}:{{ .Values.litestream.image.tag }}"
imagePullPolicy: {{ .Values.litestream.image.pullPolicy }}
securityContext:
  {{- toYaml .Values.securityContext | nindent 2 }}
{{- with include "bbs.litestreamSecretName" . }}
env:
  - name: LITESTREAM_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: {{ . }}
        key: LITESTREAM_ACCESS_KEY_ID
  - name: LITESTREAM_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: {{ . }}
        key: LITESTREAM_SECRET_ACCESS_KEY
{{- end }}
volumeMounts:
  - name: data
    mountPath: /data
  - name: litestream
    mountPath: /etc/litestream.yml
    subPath: litestream.yml
{{- end }}
