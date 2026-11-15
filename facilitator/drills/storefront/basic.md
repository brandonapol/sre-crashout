# Storefront, basic: the missing unit

**Tier:** basic. A stuck rollout with an exact runbook and no user impact. The point is reading scheduler
events and knowing that a stuck rollout is urgent even when nothing is broken yet.

## Deploy announcement

> storefront 5.1.5: checkout gets more CPU ahead of the holiday peak (CHK-412).

## The page

> **[P3] StorefrontRolloutStuck.** Deployment `storefront/checkout` hasn't finished rolling out for 10 minutes.

## What's broken

Release 5.1.5 set `checkout`'s CPU request to `400` instead of `400m`: 400 cores. No node can fit it, so the
new pod stays `Pending` with `FailedScheduling ... Insufficient cpu`. The rollout keeps both old pods, so
shoppers are fine.

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| `kubectl -n storefront get pods` | one `checkout` pod `Pending`, two Running |
| `describe pod` Events | `FailedScheduling: 0/N nodes are available: N Insufficient cpu` |
| Kubernetes events in tinyo11y | the same `FailedScheduling`, repeating |
| values diff | 5.1.5: `checkout.resources.requests.cpu: "400"` |
| runbook | [Pods pending](../../../runbooks/pods-pending.md), which calls out exactly this unit mistake |

## Hint ladder

1. "Is anyone affected? What would make them affected?"
2. "Why isn't the pod running? Who decides where a pod runs?"
3. "Read the runbook for the alert."

## Mitigation and fix

- Roll back, or set the request to `400m` and redeploy.
- Not a fix: adding nodes.

## Discussion questions

- What would turn this into an outage? (A drain of a node holding an old pod; a PodDisruptionBudget would
  help or hurt how?)
- Where else do units bite? (`m` vs nothing for CPU, `Mi` vs `M` for memory, durations without units.)
- Should a values schema reject a CPU request over the node size?

## Run it

```sh
make drill/incident P=storefront TIER=basic
make drill/verify P=storefront EXPECT=basic     # within a minute
make drill/reset P=storefront
```
