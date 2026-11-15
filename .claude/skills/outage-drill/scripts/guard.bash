#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Safety checks before an outage drill touches a cluster.

  guard.bash context            print the current context and refuse ones that look like production
  guard.bash namespace <ns>     create <ns> labelled as a drill namespace, or refuse an unlabelled one
  guard.bash netpol <ns>        check whether the cluster enforces NetworkPolicy (creates and removes a probe)

DRILL_ALLOW_CONTEXT=<name> accepts a context whose name matches the production patterns, after a human
has confirmed it is not production.
USAGE
}


label="sre-crashout.io/drill=true"

die() {
  echo "guard: $*" >&2
  exit 1
}

context() {
  local ctx server
  ctx="$(kubectl config current-context 2>/dev/null)" || die "no current kube context"
  server="$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')"
  echo "context: $ctx"
  echo "server:  $server"
  if [[ "${DRILL_ALLOW_CONTEXT:-}" != "$ctx" ]] && grep -qiE 'prod|prd|live|production' <<<"$ctx $server"; then
    die "this context looks like production. Confirm with a human, then set DRILL_ALLOW_CONTEXT=$ctx"
  fi
  kubectl version -o json >/dev/null 2>&1 || die "the API server doesn't answer"
  echo "ok: not obviously production; still confirm it's a dev cluster before injecting"
}

namespace() {
  local ns="$1"
  if kubectl get namespace "$ns" >/dev/null 2>&1; then
    [[ "$(kubectl get namespace "$ns" -o jsonpath='{.metadata.labels.sre-crashout\.io/drill}')" == true ]] ||
      die "namespace $ns exists and isn't a drill namespace; pick another name"
    echo "ok: $ns is a drill namespace"
  else
    kubectl create namespace "$ns" >/dev/null
    kubectl label namespace "$ns" "$label" >/dev/null
    echo "ok: created drill namespace $ns"
  fi
}

probe_ns=""

cleanup_netpol() {
  [[ -n "$probe_ns" ]] && kubectl -n "$probe_ns" delete pod/netpol-target networkpolicy/netpol-deny --ignore-not-found >/dev/null 2>&1
  return 0
}

reach() {
  kubectl -n "$probe_ns" run "netpol-probe-$RANDOM" --rm -i --quiet --restart=Never --image=busybox:1.36 \
    --annotations=sidecar.istio.io/inject=false -- sh -c "nc -z -w 3 $1 8080 && echo open || echo closed" 2>/dev/null | tail -n1
}

netpol() {
  local target_ip before after
  probe_ns="$1"
  namespace "$probe_ns" >/dev/null
  trap cleanup_netpol EXIT
  kubectl -n "$probe_ns" run netpol-target --image=busybox:1.36 --labels=app=netpol-target \
    --annotations=sidecar.istio.io/inject=false --command -- httpd -f -p 8080 >/dev/null
  kubectl -n "$probe_ns" wait --for=condition=Ready pod/netpol-target --timeout=120s >/dev/null
  target_ip="$(kubectl -n "$probe_ns" get pod netpol-target -o jsonpath='{.status.podIP}')"
  before="$(reach "$target_ip")"
  [[ "$before" == open ]] || die "inconclusive: the target isn't reachable even without a policy ($before)"
  kubectl -n "$probe_ns" apply -f - >/dev/null <<YAML
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: netpol-deny
spec:
  podSelector:
    matchLabels:
      app: netpol-target
  policyTypes: [Ingress]
YAML
  sleep 5
  after="$(reach "$target_ip")"
  case "$after" in
    closed) echo "ok: NetworkPolicy is enforced (reachable before a deny-all policy, unreachable after)" ;;
    open) die "NetworkPolicy is NOT enforced in this cluster; avoid faults that rely on it" ;;
    *) die "inconclusive: $after" ;;
  esac
}

case "${1:-}" in
  context) context ;;
  namespace) namespace "${2:?namespace required}" ;;
  netpol) netpol "${2:?namespace required}" ;;
  *) usage; exit 1 ;;
esac
