#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Synthetic users for a drill: the sre-crashout image's generic traffic simulator, as a Deployment.

  traffic.bash apply <ns> <journeys.json> [rate]   create or update the simulator (rate: requests/s, default 10)
  traffic.bash stats <ns>                          the last minute: requests, error ratio, p50/p95/p99 per journey
  traffic.bash delete <ns>                         remove it

journeys.json is an array of journeys, picked at random by weight:
  [{"name": "view product", "url": "http://web:8080/products/{{n}}", "weight": 3},
   {"name": "checkout", "url": "http://web:8080/orders", "method": "POST",
    "body": {"id": "{{uuid}}"}, "headers": {"content-type": "application/json"}, "expect": [201]}]
{{uuid}} and {{n}} (0-999) are filled in per request. Without "expect", any 2xx is a success.
The simulator's spans go to tinyo11y as service "drill-users": that's what users experience.

IMAGE, TAG and OTLP_ENDPOINT override the defaults.
USAGE
}


image="${IMAGE:-ghcr.io/brandonapol/sre-crashout}:${TAG:-main}"
otlp="${OTLP_ENDPOINT:-http://otel-collector.observability.svc.cluster.local:4317}"

apply() {
  local ns="$1" journeys="$2" rate="${3:-10}"
  jq -e 'type == "array" and length > 0 and all(.name and .url)' "$journeys" >/dev/null ||
    { echo "traffic: $journeys must be a JSON array of journeys with name and url" >&2; exit 1; }
  kubectl -n "$ns" create configmap drill-users --from-file=journeys.json="$journeys" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  kubectl -n "$ns" apply -f - >/dev/null <<YAML
apiVersion: apps/v1
kind: Deployment
metadata:
  name: drill-users
  labels:
    app.kubernetes.io/name: drill-users
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: drill-users
  template:
    metadata:
      labels:
        app.kubernetes.io/name: drill-users
      annotations:
        checksum/journeys: "$(sha256sum "$journeys" | cut -c1-16)"
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: drill-users
          image: $image
          args: ["dist/src/traffic/generic.js"]
          env:
            - name: TRAFFIC_JOURNEYS
              valueFrom:
                configMapKeyRef:
                  name: drill-users
                  key: journeys.json
            - name: TRAFFIC_RATE
              value: "$rate"
            - name: OTEL_SERVICE_NAME
              value: drill-users
            - name: OTEL_RESOURCE_ATTRIBUTES
              value: service.namespace=$ns
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: $otlp
            - name: OTEL_EXPORTER_OTLP_PROTOCOL
              value: grpc
            - name: OTEL_TRACES_EXPORTER
              value: otlp
            - name: OTEL_LOGS_EXPORTER
              value: otlp
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
          resources:
            requests:
              cpu: 25m
              memory: 64Mi
            limits:
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
YAML
  kubectl -n "$ns" rollout status deploy/drill-users --timeout=120s
}

stats() {
  kubectl -n "$1" exec deploy/drill-users -- env NODE_OPTIONS= node -e \
    'fetch("http://127.0.0.1:8080/stats").then((r) => r.text()).then((t) => console.log(t))' | jq .
}

case "${1:-}" in
  apply) apply "${2:?namespace required}" "${3:?journeys.json required}" "${4:-10}" ;;
  stats) stats "${2:?namespace required}" ;;
  delete) kubectl -n "${2:?namespace required}" delete deploy/drill-users configmap/drill-users --ignore-not-found ;;
  *) usage; exit 1 ;;
esac
