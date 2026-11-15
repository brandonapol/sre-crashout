# Storefront, easy: the health check that kills

**Tier:** easy. Loud, with the cause in Kubernetes events, but the obvious move (look at the app) leads
nowhere: the app is fine, and the platform keeps killing it.

## Deploy announcement

> storefront 5.1.6: catalog health checks follow the platform convention (PLAT-88).

## The page

> **[P2] CatalogRestarting.** `catalog` pods restarting repeatedly. Shoppers report intermittent errors
> browsing.

## What's broken

Release 5.1.6 moved `catalog`'s liveness probe to `/health`. The app only serves `/healthz`, so the probe gets
404s. After three failures (about 40 seconds) the kubelet kills the container, which restarts and gets killed
again. The readiness probe still uses `/healthz`, so each pod looks ready and takes traffic right up until
it's killed. Both pods cycle, with growing CrashLoopBackOff delays, so browsing fails in bursts, and checkouts
fail when pricing lookups hit a dying `catalog`.

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| Kubernetes events | `Liveness probe failed: HTTP probe failed with statuscode: 404`, then `Killing` |
| `describe pod catalog-...` | the liveness probe's path is `/health`; restarts climbing; `Last State` reason `Error` or `Completed` |
| `catalog` logs | nothing wrong: it starts, serves, and is killed |
| shopper-sim spans | `browse category` and `view product` errors in bursts, a percent or two at first and more as the backoff grows; some `checkout` errors (`pricing failed`) |
| values diff | 5.1.6: `catalog.probes.liveness.path: /health` |

## Hint ladder

1. "Is catalog crashing, or being killed? Who would kill it?"
2. "What do the Kubernetes events say just before each restart?"
3. "Ask catalog the same question the kubelet asks it."

## Mitigation and fix

- Roll back, or set the liveness path back to `/healthz`.
- Discussion: the app could serve both paths during a migration; or the convention change could land in the
  app first and the probe second.

## Discussion questions

- Why did readiness keep passing while liveness failed?
- A liveness probe that's wrong is worse than none. When is a liveness probe worth having at all?
- Why did the gaps between failures get longer over time? (CrashLoopBackOff's backoff.)

## Run it

```sh
make drill/incident P=storefront TIER=easy
make drill/verify P=storefront EXPECT=easy      # within 2 minutes
make drill/reset P=storefront
```
