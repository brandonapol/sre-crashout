# sre-crashout

Miniature products that break in realistic ways, for practising on-call as a team. Each product is a small
system of TypeScript services with its own README, changelog, runbooks, Helm chart and release history, so
the people debugging it meet it the way they'd meet an unfamiliar service on a real page: from its telemetry,
its cluster and its repository, not from a description of the fault.

Everything runs on Kubernetes and reports to [tinyo11y](https://github.com/benhastings/clickhouse-observability-stack)
over OTLP: traces, logs and metrics from every service, plus the pods' CPU, memory, restarts and events from
tinyo11y's own Kubernetes receivers.

## Products

| Product                                        | What it is                                       |
| ---------------------------------------------- | ------------------------------------------------ |
| [`ledger`](scenarios/ledger/README.md)         | a payments ledger partners send transfers to     |
| [`storefront`](scenarios/storefront/README.md) | a shop backend: catalogue, checkout, inventory   |
| [`quoting`](scenarios/quoting/README.md)       | cart pricing behind a web storefront             |

Each product's repository state is its healthy release. Platform runbooks are in [`runbooks/`](runbooks/README.md),
and each product's own in `scenarios/<product>/runbooks/`. If you're a participant, stop reading here.

Facilitators: [`facilitator/`](facilitator/README.md) has the drills, four tiers per product (basic, easy,
medium, hard), the session format, and an answer key per drill.

## Requirements

- A Kubernetes cluster running tinyo11y: kind, k3s, k3d or any other. On a laptop, `make dev/up` in the
  tinyo11y repository gives you kind with the whole stack.
- `kubectl`, `helm` 3, `jq`, GNU make; Node.js 22 and Docker to build the image yourself.
- For `storefront`'s hard drill, a CNI that enforces NetworkPolicy. k3s does out of the box
  (`make drill/preflight P=storefront TIER=hard` checks).

## Running a drill

```sh
make setup image kind/load              # or k3s/load, k3d/load; or skip and use a published image: TAG=<tag>
make drill/start P=ledger               # healthy baseline; give it 15 minutes
make drill/verify P=ledger EXPECT=healthy
make drill/incident P=ledger TIER=easy  # then page the team
make drill/verify P=ledger EXPECT=easy  # the symptom is live
make drill/status P=ledger              # pods and the last minute of synthetic traffic
make drill/reset P=ledger               # back to the baseline
make drill/stop P=ledger                # remove it
```

`make help` lists every target. `IMAGE`, `TAG`, `KIND_CLUSTER`, `K3D_CLUSTER`, `OTLP_ENDPOINT` and
`DRILLS_DIR` override the defaults.

## Clusters

| Cluster | Image | Notes |
| ------- | ----- | ----- |
| kind | `make image kind/load` | kind's kindnet enforces NetworkPolicy on hosts with nftables queue support; the storefront preflight tells you |
| k3s | `make image k3s/load` (imports with `sudo k3s ctr`) | enforces NetworkPolicy by default |
| k3d | `make image k3d/load` | as k3s |
| anything else | push the image somewhere the cluster can pull, `IMAGE=... TAG=...` | |

**Istio** is optional. With sidecar injection on, everything works as it is: the drill tooling reads stats
with `kubectl exec` rather than through the API server, and the preflight pod opts out of injection. Envoy's
default retries add a little amplification to the drills that involve failing calls. Under ambient mode,
inbound traffic reaches pods through ztunnel, so `storefront`'s NetworkPolicy may not be what enforces the
hard drill; the preflight says whether it does.

**Without Helm**, `make drill/render P=<product>` (or with `TIER=<tier>`) writes the plain manifests to `dist/`,
for `kubectl apply`, a kustomize base, or an Argo CD Application. Helm is still how the drills expect to be
investigated (`helm history`), so render only if your team really deploys that way.

## Drills from your own services

The [`outage-drill`](.claude/skills/outage-drill/SKILL.md) skill does what this repository does, for any
application: an agent deploys your service into a disposable dev namespace next to tinyo11y, adds synthetic
users (`src/traffic/generic.ts`), injects a believable fault at a chosen tier by changing its config,
manifests or code, verifies the incident shows up reliably, and writes the answer key. In Claude Code, open
this repository and ask for a drill for your service, or copy `.claude/skills/outage-drill/` into
`~/.claude/skills/` to use it from anywhere.

## Layout

```text
src/runtime/                 the shared service runtime: telemetry, HTTP, client, logging, synthetic traffic
scenarios/<product>/         one product: README, CHANGELOG, runbooks/, services/, deploy/chart, deploy/releases
runbooks/                    the platform runbooks every product shares
charts/workload/             the library chart every product's objects render through
scripts/drill.bash           start, incident, verify, preflight, status and render
facilitator/                 the answer keys: drills/<product>/<tier>.yaml and .md
```

All services build into one image. A Deployment picks its service by the script it runs.

## Development

```sh
make setup/hooks    # once: the commit-msg hook that rejects AI attribution
make check          # typecheck, shellcheck, and render every product at every release and drill
```

Commits and pull requests are authored by people. The commit-msg hook and CI's `attribution` job
(`make check/attribution PR=<number>`) fail on a Claude `Co-authored-by` trailer, an `anthropic.com` author or
committer, a "Generated with Claude Code" footer, or a `claude.ai/code` session link.

A new drill is a release file in `facilitator/drills/<product>/<tier>.yaml` (the baseline plus the change), a
case for it in `scripts/drill.bash verify`, and a guide next to it. Run it on a cluster with `verify` before
using it with a team: a drill that doesn't reliably show its symptom wastes a session.
