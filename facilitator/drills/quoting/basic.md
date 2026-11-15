# Quoting, basic: the wrong port

**Tier:** basic. A full outage of one page, an error message that says exactly what's wrong, and a runbook
written for this case.

## Deploy announcement

> quoting 2.8.4: web points at the quotes service directly (QUOTE-301).

## The page

> **[P1] QuotePageErrors.** The quote page is failing for every request. The featured page is fine.

## What's broken

Release 2.8.4 changed `web`'s `QUOTES_URL` to `http://quotes:8081`. The `quotes` Service listens on 8080, so
every call is refused (`ECONNREFUSED`) and `web` returns `502 quote_unavailable`.

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| browser-sim spans | `quote page` 100% errors, `featured page` fine |
| `web` logs | `quote request failed` with `error: fetch failed: ECONNREFUSED` |
| `quotes` spans | request rate drops to zero |
| values diff | 2.8.4: `QUOTES_URL` |
| runbook | [Quote page errors](../../../scenarios/quoting/runbooks/quote-page-errors.md), "web can't reach quotes" |

## Hint ladder

1. "Which page fails and which doesn't? What does one call that the other doesn't?"
2. "What does web say when a quote fails?"
3. "Is there a runbook for this alert?"

## Mitigation and fix

Roll back, or set `QUOTES_URL` back to `http://quotes:8080`.

## Discussion questions

- What did `ECONNREFUSED` tell you that a timeout wouldn't have?
- Why didn't the readiness probe catch it? (It checks the pod, not its dependencies. Should it?)

## Run it

```sh
make drill/incident P=quoting TIER=basic
make drill/verify P=quoting EXPECT=basic      # within a minute
make drill/reset P=quoting
```
