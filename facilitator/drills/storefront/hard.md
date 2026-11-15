# Storefront, hard: the quiet dependency

**Tier:** hard. A quiet failure: no user-facing errors, no restarts, nothing red on the dashboards. The cause is in a different object
(a NetworkPolicy nobody touched) from the change (a canary's labels), and the app hides the failure with a
fallback.

## Deploy announcement

None. The canary went out with a platform-team label migration, announced in a different channel a day ago:

> Platform: new workloads should use the standard labels (`app.kubernetes.io/component`, `app.kubernetes.io/team`). PLAT-77.

## The page

> **[P3] storefront: checkout latency SLO burning.** Checkout p95 is around 5 seconds. Error rate is normal
> and no alerts have fired for errors. Customers on social media say "the order button spins forever, then
> works".

## What's broken

Release 5.2.0 adds a `checkout-canary` Deployment (one replica beside the two stable ones, all behind the
`checkout` Service). Per PLAT-77, the canary uses the platform's new standard labels
(`app.kubernetes.io/component: backend`) and does not carry the old `tier: backend` label.

`inventory` has a NetworkPolicy, `inventory-ingress`, that only admits pods labelled `tier: backend`. Traffic
from the canary is **dropped, not rejected**: the TCP SYN never gets an answer, so every reservation attempt
waits out `INVENTORY_TIMEOUT` (2s). After three attempts, checkout falls back to a soft reservation and
returns `201` with `fulfillment: pending-stock-check`.

So about a third of checkouts take about 5–6 seconds and still succeed. No errors, no restarts, nothing red.

## Causal chain

```text
5.2.0: checkout-canary with new labels, without tier: backend
  -> inventory-ingress NetworkPolicy drops the canary's packets
  -> each reservation attempt hangs for 2s, three attempts
  -> soft-reservation fallback hides the failure: 201, no error
  -> 1/3 of checkouts take ~5-6s; error rate unchanged
```

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| span metrics for `checkout` | p95/p99 latency up; error ratio flat. Group by `service.version` or pod: only 5.2.0 / the canary is slow |
| traces of slow checkouts | three `POST` client spans to `inventory`, each ending at ~2000ms with a timeout error, and **no matching server span in `inventory`**. The request never arrived |
| `inventory` span metrics | request rate drops by about a third; its own latency is unchanged |
| `checkout` logs | `reservation deferred to fulfilment reconciliation` at info level, only from the canary pod |
| `kubectl -n storefront get netpol` and the pods' labels (`kubectl get pods --show-labels`) | the policy's `podSelector` and the canary's missing label |
| `catalog` logs | **red herring**: `recommendations model features stale` warnings since 5.2.0. Catalog latency is fine |
| business side (discussion) | orders with `pending-stock-check` are piling up, which fulfilment would see as oversells tomorrow |

## Hint ladder

1. "Is every checkout slow, or a fraction of them? What's different about that fraction?"
2. "Open one slow trace. Where does the time go, and what does the downstream service say about it?"
3. "The client saw a timeout, and the server saw nothing. What sits between them in Kubernetes?"
4. "Compare the canary pod's labels with what `inventory` lets in."

## Mitigation and fix

- **Mitigate**: scale `checkout-canary` to zero, or roll back to 5.1.4.
- **Fix**: give the canary `tier: backend`, or better, change the NetworkPolicy to select on a label that
  both the stable and canary pods carry, and land the label migration in the policy before the workloads.
- **Discussion**: the soft-reservation fallback turned a hard failure into a silent one. Was that the right
  call? What should it have emitted (a counter, a warning, an SLO on `pending-stock-check`)?

## Discussion questions

- Why did this produce timeouts instead of connection refused? (Drop vs. reject.) Which is easier to debug?
- What alert fires on "slow but successful"? Do you have latency SLOs, or only error SLOs?
- How would a canary analysis (comparing canary and stable on latency) have caught this in minutes?
- Label migrations: what else in the cluster selects on labels (Services, PDBs, NetworkPolicies, monitors)?

## Cluster requirement

The drill needs a CNI that enforces NetworkPolicy. On a cluster that ignores policies, the canary works
normally and nothing happens. Check before the session:

```sh
make drill/start P=storefront
make drill/preflight P=storefront TIER=hard
```

## Run it

```sh
make drill/incident P=storefront TIER=hard
make drill/verify P=storefront EXPECT=hard     # after 1-2 minutes
make drill/reset P=storefront
make drill/verify P=storefront EXPECT=healthy
```
