# Quoting, medium: the new dependency

**Tier:** medium. Users get errors on both pages, but every downstream service is healthy and nothing logs an
error. The failing requests are answered instantly without calling anything, which points the team away from
the cause. They have to connect a latency change in the requests that succeed with the errors on the ones
that don't.

## Deploy announcement

> quoting 2.8.6: the promotions banner is back, now from the new promo service (MKT-88).

## The page

> **[P2] QuotePageErrors.** Quote page and featured page both returning 503 for a fifth to a third of requests.
> Started in the last half hour.

## What's broken

Release 2.8.6 turned on `web`'s promo banner and pointed it at a new `promo` service. `web` fetches the banner
synchronously on every page, and `promo` takes about 600ms to personalise one. Every page now takes about
600ms instead of about 10ms.

`web` sheds load: past `MAX_IN_FLIGHT` (8) concurrent requests per pod it answers `503 server_busy`
immediately. A pod holds as many requests as its arrival rate times how long each takes. At ~12 requests a
second per pod, 10ms per request meant about 0.1 in flight; 600ms means 7 or so on average, and the random
peaks go over 8. The shed requests fail in microseconds, without a single child span.

`promo` is healthy and doing what it was designed to do. `quotes` and `pricing` are healthy. Nothing logs an
error.

## Causal chain

```text
2.8.6: web calls the new promo service on every page (~600ms)
  -> each web request holds an in-flight slot ~60x longer
  -> in-flight per pod regularly exceeds MAX_IN_FLIGHT (8)
  -> web sheds: 503 server_busy on both pages, with no downstream call
```

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| browser-sim spans | both pages failing with 503; p50 latency of the successes jumped from ~10ms to ~600ms |
| failed traces | a single `web` server span, 503, a few microseconds, no children |
| successful traces | a `web` span with a ~600ms child: `GET /v1/banner` to `promo` |
| `http.server.requests_shed` | counting up on both `web` pods since the deploy |
| `web` logs | nothing new: shedding isn't logged |
| `promo`, `quotes`, `pricing` | healthy, no errors |
| `kubectl -n quoting get deploy` | a new `promo` Deployment |
| values diff | 2.8.6: `PROMO_BANNER: true`, `PROMO_SERVICE_URL`, and the `promo` service |
| runbook | [web shedding load](../../../scenarios/quoting/runbooks/web-shedding.md) explains the mechanism, once they find shedding |

**Red herring:** the failing requests have no children, which points away from dependencies. Teams who did the
hard quoting drill first may also remember that the promo banner was harmless there.

## Hint ladder

1. "The failures are fast and call nothing. What answers a request without doing any work?"
2. "What changed about the requests that do succeed?"
3. "How many requests is each web pod holding at once, and how many is it allowed?"

## Mitigation and fix

- **Mitigate**: turn the banner off (`PROMO_BANNER: false`), roll back, or scale `web` (more pods, more slots).
- **Fix (discussion)**: fetch the banner with a tight timeout (or asynchronously, or cache it); a new
  dependency in the request path needs a latency budget; the shed limit should be sized from latency, not
  set as a constant.

## Discussion questions

- Little's law: in-flight = rate × latency. Where else does a latency change turn into a capacity problem?
- Should a shed request be logged? Counted? Alerted on?
- How would a canary have shown this before all traffic got it?

## Run it

```sh
make drill/incident P=quoting TIER=medium
make drill/verify P=quoting EXPECT=medium      # within 2 minutes
make drill/reset P=quoting
```
