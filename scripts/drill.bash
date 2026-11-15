#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
products=(ledger storefront quoting)
tiers=(basic easy medium hard)

image="${IMAGE:-ghcr.io/brandonapol/sre-crashout}"
tag="${TAG:-dev}"
otlp="${OTLP_ENDPOINT:-http://otel-collector.observability.svc.cluster.local:4317}"
drills="${DRILLS_DIR:-$root/facilitator/drills}"

die() {
  echo "error: $*" >&2
  exit 1
}

product_dir() {
  local p="$1"
  [[ " ${products[*]} " == *" $p "* ]] || die "unknown product '$p' (one of: ${products[*]})"
  echo "$root/scenarios/$p"
}

check_tier() {
  [[ " ${tiers[*]} " == *" $1 "* ]] || die "unknown tier '$1' (one of: ${tiers[*]})"
}

baseline_values() {
  local files
  files=("$(product_dir "$1")"/deploy/releases/*.yaml)
  [[ ${#files[@]} -eq 1 ]] || die "expected one baseline release for $1"
  echo "${files[0]}"
}

incident_values() {
  local p="$1" tier="$2" file
  product_dir "$p" >/dev/null
  check_tier "$tier"
  file="$drills/$p/$tier.yaml"
  [[ -f "$file" ]] || die "no $tier drill for $p at $file (set DRILLS_DIR if the answer keys live elsewhere)"
  echo "$file"
}

release_of() {
  sed -n 's/^release: *//p' "$1" | head -n1
}

traffic_service() {
  case "$1" in
    ledger) echo partner-sim ;;
    storefront) echo shopper-sim ;;
    quoting) echo browser-sim ;;
  esac
}

helm_args() {
  local p="$1" values="$2"
  echo "$p" "$(product_dir "$p")/deploy/chart" \
    --namespace "$p" \
    --values "$values" \
    --set-string "global.image.repository=$image" \
    --set-string "global.image.tag=$tag" \
    --set-string "global.otlpEndpoint=$otlp"
}

deploy() {
  local p="$1" values="$2" wait="$3" release args
  release="$(release_of "$values")"
  helm dependency build "$(product_dir "$p")/deploy/chart" >/dev/null
  read -r -a args <<<"$(helm_args "$p" "$values")"
  if [[ "$wait" == wait ]]; then
    helm upgrade --install "${args[@]}" --create-namespace --description "release $release" --wait --timeout 5m >/dev/null
  else
    helm upgrade --install "${args[@]}" --create-namespace --description "release $release" >/dev/null
  fi
  echo "$p $release deployed"
}

render() {
  local p="$1" values="$2" out args
  out="$root/dist/$p-$(release_of "$values").yaml"
  mkdir -p "$root/dist"
  helm dependency build "$(product_dir "$p")/deploy/chart" >/dev/null
  read -r -a args <<<"$(helm_args "$p" "$values")"
  helm template "${args[@]}" >"$out"
  echo "$out"
}

stats() {
  local p="$1" sim
  sim="$(traffic_service "$p")"
  kubectl -n "$p" exec "deploy/$sim" -c "$sim" -- env NODE_OPTIONS= node -e \
    'fetch("http://127.0.0.1:8080/stats").then((r) => r.text()).then((t) => console.log(t))'
}

status() {
  local p="$1"
  kubectl -n "$p" get pods -o wide
  echo
  stats "$p" | jq .
}

pods_json() {
  kubectl -n "$1" get pods -l app.kubernetes.io/name="$2" -o json
}

count_last_terminated() {
  pods_json "$1" "$2" | jq --arg reason "$3" '[.items[].status.containerStatuses[]? | select(.lastState.terminated.reason == $reason)] | length'
}

restarts_total() {
  pods_json "$1" "$2" | jq '[.items[].status.containerStatuses[]?.restartCount] | add // 0'
}

pending_pods() {
  pods_json "$1" "$2" | jq '[.items[] | select(.status.phase == "Pending")] | length'
}

check() {
  local description="$1" expression="$2" value="$3"
  if jq -e "$expression" <<<"$value" >/dev/null; then
    echo "  pass  $description"
  else
    echo "  FAIL  $description (got: $(jq -c . <<<"$value"))"
    return 1
  fi
}

verify() {
  local p="$1" expect="$2" s failed=0
  [[ "$expect" == healthy ]] || check_tier "$expect"
  s="$(stats "$p")"
  echo "$p, expecting ${expect}:"
  case "$p:$expect" in
    ledger:healthy)
      check "partner error ratio under 1%" '.overall.errorRatio < 0.01' "$s" || failed=1
      check "partner p99 under 500ms" '.overall.p99Ms < 500' "$s" || failed=1
      ;;
    ledger:basic)
      check "a ledger-api container exited with an error" '. > 0' "$(count_last_terminated ledger ledger-api Error)" || failed=1
      check "partners unaffected: error ratio under 1%" '.overall.errorRatio < 0.01' "$s" || failed=1
      ;;
    ledger:easy)
      check "partner error ratio over 10%" '.overall.errorRatio > 0.1' "$s" || failed=1
      ;;
    ledger:medium)
      check "a ledger-api container was OOMKilled" '. > 0' "$(count_last_terminated ledger ledger-api OOMKilled)" || failed=1
      ;;
    ledger:hard)
      check "partner p99 over 2s" '.overall.p99Ms > 2000' "$s" || failed=1
      check "no ledger-api container was OOMKilled" '. == 0' "$(count_last_terminated ledger ledger-api OOMKilled)" || failed=1
      ;;
    storefront:healthy)
      check "checkout p95 under 1s" '.journeys.checkout.p95Ms < 1000' "$s" || failed=1
      check "shopper error ratio under 1%" '.overall.errorRatio < 0.01' "$s" || failed=1
      ;;
    storefront:basic)
      check "a checkout pod is Pending" '. > 0' "$(pending_pods storefront checkout)" || failed=1
      check "shoppers unaffected: error ratio under 1%" '.overall.errorRatio < 0.01' "$s" || failed=1
      ;;
    storefront:easy)
      check "catalog has restarted" '. > 0' "$(restarts_total storefront catalog)" || failed=1
      ;;
    storefront:medium)
      check "checkout error ratio over 50%" '.journeys.checkout.errorRatio > 0.5' "$s" || failed=1
      check "browsing unaffected: error ratio under 1%" '.journeys["view product"].errorRatio < 0.01' "$s" || failed=1
      ;;
    storefront:hard)
      check "checkout p95 over 3s" '.journeys.checkout.p95Ms > 3000' "$s" || failed=1
      check "shopper error ratio still under 2%" '.overall.errorRatio < 0.02' "$s" || failed=1
      ;;
    quoting:healthy)
      check "quote page error ratio under 1%" '.journeys["quote page"].errorRatio < 0.01' "$s" || failed=1
      check "featured page error ratio under 1%" '.journeys["featured page"].errorRatio < 0.01' "$s" || failed=1
      ;;
    quoting:basic | quoting:easy)
      check "quote page error ratio over 90%" '.journeys["quote page"].errorRatio > 0.9' "$s" || failed=1
      check "featured page error ratio under 1%" '.journeys["featured page"].errorRatio < 0.01' "$s" || failed=1
      ;;
    quoting:medium)
      check "quote page error ratio over 10%" '.journeys["quote page"].errorRatio > 0.1' "$s" || failed=1
      check "featured page error ratio over 10%" '.journeys["featured page"].errorRatio > 0.1' "$s" || failed=1
      ;;
    quoting:hard)
      check "quote page error ratio over 50%" '.journeys["quote page"].errorRatio > 0.5' "$s" || failed=1
      check "featured page error ratio over 5%" '.journeys["featured page"].errorRatio > 0.05' "$s" || failed=1
      ;;
  esac
  return "$failed"
}

preflight() {
  local p="$1" tier="${2:-}" result
  case "$p:$tier" in
    storefront:hard | storefront:)
      echo "storefront: checking that this cluster's CNI enforces NetworkPolicy"
      kubectl -n storefront get networkpolicy inventory-ingress >/dev/null 2>&1 || die "run 'scripts/drill.bash start storefront' first"
      result="$(kubectl -n storefront run "netpol-preflight-$RANDOM" --rm -i --quiet --restart=Never \
        --image="$image:$tag" --image-pull-policy=IfNotPresent \
        --labels=app.kubernetes.io/name=netpol-preflight \
        --annotations=sidecar.istio.io/inject=false \
        --env=NODE_OPTIONS= --command -- node -e '
          fetch("http://inventory:8080/v1/stock/SKU-10000", { signal: AbortSignal.timeout(3000) })
            .then((r) => console.log("reached " + r.status))
            .catch((e) => console.log(e.name === "TimeoutError" ? "dropped" : "error " + (e.cause?.code ?? e.message)))' 2>/dev/null | tail -n1)"
      case "$result" in
        dropped) echo "  pass  traffic from a pod without tier=backend is dropped" ;;
        reached*) die "NetworkPolicy is not enforced here (a pod without tier=backend got a response from inventory: $result). k3s enforces it by default; on kind use the default kindnet on a host with nftables queue support, or Calico or Cilium. Under Istio ambient, inbound traffic arrives on the ztunnel port and the policy may not apply." ;;
        *) die "inconclusive: $result" ;;
      esac
      ;;
    *) echo "$p ${tier:-}: no preflight needed" ;;
  esac
}

usage() {
  cat <<USAGE
usage: scripts/drill.bash <command> <product> [arg]

  start <product>               deploy the product's healthy baseline and wait for it
  incident <product> <tier>     deploy the drill's incident release (tiers: ${tiers[*]})
  stop <product>                uninstall the product and delete its namespace
  status <product>              pods and the last minute of synthetic traffic
  verify <product> <expect>     expect is healthy or a tier: checks the drill is showing
  preflight <product> [tier]    check the cluster can run the drill (after start)
  render <product> [tier]       write plain manifests to dist/ for kubectl, kustomize or Argo CD

products: ${products[*]}
USAGE
}

cmd="${1:-}"
p="${2:-}"
[[ -n "$cmd" && -n "$p" ]] || {
  usage
  exit 1
}

case "$cmd" in
  start) deploy "$p" "$(baseline_values "$p")" wait ;;
  incident) deploy "$p" "$(incident_values "$p" "${3:?tier required: ${tiers[*]}}")" nowait ;;
  stop)
    helm uninstall "$p" --namespace "$p" --wait >/dev/null 2>&1 || true
    kubectl delete namespace "$p" --ignore-not-found --wait=true
    ;;
  status) status "$p" ;;
  verify) verify "$p" "${3:?expect required: healthy or a tier}" ;;
  preflight) preflight "$p" "${3:-}" ;;
  render)
    if [[ -n "${3:-}" ]]; then render "$p" "$(incident_values "$p" "$3")"; else render "$p" "$(baseline_values "$p")"; fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
