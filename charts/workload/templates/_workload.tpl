{{- define "workload.app" -}}
{{- .svc.app | default .name -}}
{{- end }}

{{- define "workload.selector" -}}
app.kubernetes.io/name: {{ include "workload.app" . }}
app.kubernetes.io/instance: {{ .name }}
{{- end }}

{{- define "workload.labels" -}}
{{ include "workload.selector" . }}
app.kubernetes.io/part-of: {{ .root.Values.product }}
app.kubernetes.io/version: {{ .svc.version | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- end }}

{{- define "workload.resources" -}}
{{- $defaults := dict "requests" (dict "cpu" "25m" "memory" "64Mi") "limits" (dict "memory" "128Mi") -}}
{{- toYaml (mergeOverwrite $defaults (.svc.resources | default dict)) -}}
{{- end }}

{{- define "workload.env" -}}
{{- $g := .root.Values.global -}}
{{- $app := include "workload.app" . -}}
- name: K8S_POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: K8S_POD_UID
  valueFrom:
    fieldRef:
      fieldPath: metadata.uid
- name: K8S_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
- name: OTEL_SERVICE_NAME
  value: {{ $app }}
- name: OTEL_RESOURCE_ATTRIBUTES
  value: service.namespace={{ .root.Values.product }},service.version={{ .svc.version }},deployment.environment.name={{ $g.environment }},k8s.namespace.name=$(K8S_NAMESPACE),k8s.pod.name=$(K8S_POD_NAME),k8s.pod.uid=$(K8S_POD_UID),k8s.deployment.name={{ .name }}
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: {{ $g.otlpEndpoint | quote }}
- name: OTEL_EXPORTER_OTLP_PROTOCOL
  value: grpc
- name: OTEL_TRACES_EXPORTER
  value: otlp
- name: OTEL_LOGS_EXPORTER
  value: otlp
{{- range $key := keys (.svc.env | default dict) | sortAlpha }}
- name: {{ $key }}
  value: {{ index $.svc.env $key | toString | quote }}
{{- end }}
{{- range $key := keys (.svc.secretEnv | default dict) | sortAlpha }}
{{- $ref := index $.svc.secretEnv $key }}
- name: {{ $key }}
  valueFrom:
    secretKeyRef:
      name: {{ $ref.secret }}
      key: {{ $ref.key }}
{{- end }}
{{- end }}

{{- define "workload.checksums" -}}
{{- range $name := .svc.restartOnSecretChange | default list }}
checksum/secret-{{ $name }}: {{ index ($.root.Values.secrets | default dict) $name | toJson | sha256sum }}
{{- end }}
{{- end }}

{{- define "workload.deployment" -}}
{{- $g := .root.Values.global -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .name }}
  labels:
    {{- include "workload.labels" . | nindent 4 }}
spec:
  replicas: {{ hasKey .svc "replicas" | ternary .svc.replicas 1 }}
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      {{- include "workload.selector" . | nindent 6 }}
  template:
    metadata:
      {{- with include "workload.checksums" . }}
      annotations:
        {{- . | nindent 8 }}
      {{- end }}
      labels:
        {{- include "workload.labels" . | nindent 8 }}
        {{- with .svc.podLabels }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
    spec:
      terminationGracePeriodSeconds: 20
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: {{ include "workload.app" . }}
          image: "{{ $g.image.repository }}:{{ $g.image.tag }}"
          imagePullPolicy: {{ $g.image.pullPolicy }}
          args:
            - {{ .svc.main | quote }}
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          env:
            {{- include "workload.env" . | nindent 12 }}
          readinessProbe:
            httpGet:
              path: {{ dig "readiness" "path" "/healthz" (.svc.probes | default dict) }}
              port: http
            periodSeconds: 5
            failureThreshold: 2
          livenessProbe:
            httpGet:
              path: {{ dig "liveness" "path" "/healthz" (.svc.probes | default dict) }}
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
          resources:
            {{- include "workload.resources" . | nindent 12 }}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
{{- end }}

{{- define "workload.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ .name }}
  labels:
    {{- include "workload.labels" . | nindent 4 }}
spec:
  selector:
    app.kubernetes.io/name: {{ .name }}
  ports:
    - name: http
      port: 8080
      targetPort: http
      protocol: TCP
{{- end }}

{{- define "workload.secrets" -}}
{{- range $name := keys (.Values.secrets | default dict) | sortAlpha }}
---
apiVersion: v1
kind: Secret
metadata:
  name: {{ $name }}
  labels:
    app.kubernetes.io/part-of: {{ $.Values.product }}
    app.kubernetes.io/managed-by: {{ $.Release.Service }}
type: Opaque
stringData:
  {{- toYaml (index $.Values.secrets $name) | nindent 2 }}
{{- end }}
{{- end }}

{{- define "workload.all" -}}
{{ include "workload.secrets" . }}
{{- range $name := keys .Values.services | sortAlpha }}
{{- $ctx := dict "root" $ "name" $name "svc" (index $.Values.services $name) }}
---
{{ include "workload.deployment" $ctx }}
{{- if and (not $ctx.svc.app) (ne $ctx.svc.service false) }}
---
{{ include "workload.service" $ctx }}
{{- end }}
{{- end }}
{{- end }}
