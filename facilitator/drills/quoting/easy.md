# Quoting, easy: the extra path segment

**Tier:** easy. A full outage of one page. The first service's logs only say "the next one failed", so the
team has to follow the request two hops down to where the 404 comes from.

## Deploy announcement

> quoting 2.8.5: quotes moves to the pricing v2 API (PRICE-88).

## The page

> **[P1] QuotePageErrors.** The quote page is failing for every request. The featured page is fine.

## What's broken

Release 2.8.5 changed `quotes`' `PRICING_URL` to `http://pricing:8080/v2`. `quotes` appends `/v1/prices/...`,
so it asks for `/v2/v1/prices/...`, which `pricing` doesn't have. Every lookup is a `404`, every quote fails,
and `web` returns `502 quote_unavailable`. There is no pricing v2 API.

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| `web` logs | `quote request failed` with `status: 502` from quotes (not a connection error this time) |
| `quotes` logs | `quote failed: could not price all lines` with `error: http 404` |
| traces | `quotes` → `pricing` client spans with 404; `pricing`'s server spans are named just `GET` (no route matched) |
| `pricing` | healthy, request rate normal, no errors in its logs |
| values diff | 2.8.5: `PRICING_URL` |

**Red herring, sort of:** the runbook's first section (connection refused) doesn't match. Its second section
does, but only as a pointer.

## Hint ladder

1. "web says quotes failed. What does quotes say?"
2. "pricing answered. What did it answer, and to what URL?"

## Mitigation and fix

Roll back, or set `PRICING_URL` back to `http://pricing:8080`.

## Discussion questions

- A 404 from a dependency is an error in the caller, not the callee. Which service's error rate should alert?
- How would a contract test or a startup check have caught this?

## Run it

```sh
make drill/incident P=quoting TIER=easy
make drill/verify P=quoting EXPECT=easy      # within a minute
make drill/reset P=quoting
```
