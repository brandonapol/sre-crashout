# Rate engine saturated

`pricing` answers from its cache when it can and asks the rate engine otherwise, through a pool of
`RATE_ENGINE_POOL_SIZE` connections per pod. When all are busy, requests wait; past `RATE_ENGINE_QUEUE_LIMIT`
waiting, `pricing` answers `503 rate_engine_busy` and logs `rate engine connection pool exhausted`.

Metrics: `pricing.rate_engine.connections` (in use), `pricing.rate_engine.waiting` (queued) and
`pricing.cache.lookups` by `result` (`hit`/`miss`).

Seen before:

- **Traffic spike** (PRICE-INC-007): more quotes, more lookups. Check `browser-sim`'s rate.
- **Cold cache** after a restart without the snapshot: misses until the cache fills. It recovers by itself in
  a minute or two.

Scaling `pricing` adds pools, and so rate engine capacity. Each pod has its own cache.

Callers retry: `quotes` retries each price lookup and `web` retries each quote, so a slow `pricing` gets more
requests, not fewer.
