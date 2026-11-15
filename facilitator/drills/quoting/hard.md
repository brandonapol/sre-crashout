# Quoting, hard: the retry storm

**Tier:** hard. A cascading failure whose trigger looks harmless and whose loudest symptom (an ERROR on every
request) is a red herring. The team has to see amplification across three hops, and a units mistake that
looks correct to anyone who doesn't know the code's convention.

## Deploy announcement

> quoting 2.9.0: winter promotions banner (MKT-88), November tax table, price cache TTL aligned with the
> CDN's max-age of 300 (WEB-2231).

## The page

> **[P1] quoting: quote page availability below 50%.** The quote page is mostly failing. The featured page
> is starting to fail too. Started within the last few minutes.

## What's broken

Release 2.9.0 changed `PRICE_CACHE_TTL` from `5m` to `300`. The author meant 300 seconds, to match the CDN's
`max-age=300` (WEB-2231). Durations in this codebase treat a bare number as **milliseconds** (it's in the
README's configuration section), so prices are now cached for 0.3 seconds. Nearly every price lookup
becomes a cache miss and goes to the rate engine, whose pool has four connections.

That alone is a degradation, not an outage. Tested without retries, it gives about 5–15% quote errors. The
outage comes from the retries:

- `quotes` gives each price lookup 300ms and makes up to three attempts with no backoff. A quote has 2–6 lines, all
  priced in parallel.
- `web` gives each quote 2s and makes up to two attempts.
- `pricing` never learns that the caller gave up, so abandoned lookups still hold rate engine connections and
  queue slots.

One user request can turn into up to 6 × 3 × 2 = 36 price lookups. The rate engine queue fills and starts
answering 503, which triggers more retries. `web` pods hit `MAX_IN_FLIGHT` and shed everything, including the
featured page, which never touches pricing.

## Causal chain

```text
2.9.0: PRICE_CACHE_TTL "300" = 300ms, not 300s
  -> cache hit ratio ~0 -> every lookup hits a 4-connection rate engine
  -> lookups queue past the 300ms timeout
  -> quotes retries x3, web retries x2, abandoned work keeps running
  -> rate engine queue full -> 503s -> more retries
  -> web hits MAX_IN_FLIGHT -> sheds every route, featured page included
```

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| span metrics | `pricing` request rate jumps far above what `browser-sim` sends: the amplification is visible as a rate ratio between hops |
| `pricing.cache.lookups{result}` | hit ratio collapses from ~100% to ~0 right at the deploy |
| `pricing.rate_engine.waiting` | the queue climbs to its 2000 limit |
| traces of a failed quote | fan-out of price lookups, many repeated three times, each ending at 300ms |
| `pricing` logs | `rate engine connection pool exhausted` |
| `quotes` logs | `quote failed: could not price all lines` |
| `web` | 503 `server_busy` on both routes |
| `web` logs | **red herring**: an ERROR on every request since 2.9.0, `promo banner enabled but PROMO_SERVICE_URL is not configured`. Loud, and harmless |
| `helm -n quoting history quoting` | 2.9.0 right before it started |

## Hint ladder

1. "Compare the request rate at each hop with what users send. Where does it multiply?"
2. "Why is `pricing` doing so much more work than before the release?"
3. "Look at the cache metrics around the deploy, then at how `PRICE_CACHE_TTL` is written."
4. "Read the configuration section of the README: how is a bare number interpreted?"

## Mitigation and fix

- **Mitigate fastest**: roll back to 2.8.3. Or set `PRICE_CACHE_TTL: 5m`. Or cut `PRICING_ATTEMPTS` to 1 to
  stop the amplification, and watch it recover to a degraded but working state.
- **Watch for**: restarting `pricing` while the TTL is still `300` doesn't help. The new pod loads its
  snapshot, every entry expires within 300ms, and the storm resumes within a minute or two. That's a good
  moment to ask what a restart can and can't fix. Once the TTL is fixed, a fresh pod starts warm and recovers
  at once; an old pod has to drain its queue first.
- **Real fixes (discussion)**: retry budgets or backoff with jitter, deadline propagation so `pricing` drops
  work nobody is waiting for, a bounded queue sized to the timeout, rejecting unitless durations at startup,
  and a cache hit-ratio alert.

## Discussion questions

- Without retries, this was a 10% problem. With them it was a 100% problem. Where in your systems do retries
  stack across layers?
- Why did the featured page fail when it doesn't use pricing? Is shedding the right behaviour?
- How should configuration handle units? (Typed durations, required suffixes, validation at startup.)
- The red herring was an ERROR log on every request. How much does noise like that cost during an incident?

## Run it

```sh
make drill/incident P=quoting TIER=hard
make drill/verify P=quoting EXPECT=hard     # after 1-2 minutes
make drill/reset P=quoting
make drill/verify P=quoting EXPECT=healthy
```
