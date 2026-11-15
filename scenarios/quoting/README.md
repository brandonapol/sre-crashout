# quoting

Quoting turns a cart into a price: list prices, regional adjustments, volume tiers and tax. It backs the
quote page and the featured bundles page of the web storefront.

## Services

| Service       | What it does                                                         | Calls     |
| ------------- | -------------------------------------------------------------------- | --------- |
| `web`         | `GET /featured`, `GET /quote?cart=&region=`                          | `quotes`  |
| `quotes`      | `POST /v1/quotes`: prices every line, then adds tax                  | `pricing` |
| `pricing`     | `GET /v1/prices/:sku?region=`, from its cache or the rate engine     | (rate engine) |
| `browser-sim` | synthetic visitors on the featured and quote pages                   | `web`     |

```text
browser-sim ──► web ──► quotes ──► pricing ──► rate engine
```

### Pricing

Prices change rarely, so `pricing` keeps each `(region, sku)` price in memory for `PRICE_CACHE_TTL`, give or
take: each entry lives between half and all of it, so entries don't all expire together. On startup it loads
a snapshot of the whole catalogue (`PRICE_SNAPSHOT_SKUS` products in every region), so a new pod starts warm. A
cache miss goes to the rate engine, which has a fixed connection pool (`RATE_ENGINE_POOL_SIZE`); requests wait for a
connection, up to `RATE_ENGINE_QUEUE_LIMIT` waiting, and beyond that get a 503. `pricing` reports
`pricing.cache.lookups` (by `result`), `pricing.rate_engine.connections` and `pricing.rate_engine.waiting`.

### Resilience

Each hop retries: `quotes` retries a price lookup that fails or times out, and `web` retries a quote. `web`
sheds load: past `MAX_IN_FLIGHT` concurrent requests it answers 503 immediately rather than queueing.

## Configuration

| Variable                  | Service     | Meaning                                         |
| ------------------------- | ----------- | ----------------------------------------------- |
| `QUOTES_TIMEOUT`          | web         | per-attempt timeout for a quote                 |
| `QUOTES_ATTEMPTS`         | web         | attempts per quote                              |
| `MAX_IN_FLIGHT`           | web         | concurrent requests per pod before shedding     |
| `PROMO_BANNER`            | web         | show the promotions banner                      |
| `PROMO_SERVICE_URL`       | web         | where the banner comes from                     |
| `PROMO_TIMEOUT`           | web         | how long to wait for a banner before skipping it |
| `PRICING_TIMEOUT`         | quotes      | per-attempt timeout for a price                 |
| `PRICING_ATTEMPTS`        | quotes      | attempts per price                              |
| `TAX_TABLE_VERSION`       | quotes      | which tax table is in force                     |
| `PRICE_CACHE_TTL`         | pricing     | how long a price is cached (at most)            |
| `PRICE_SNAPSHOT_SKUS`     | pricing     | catalogue size loaded into the cache at startup |
| `RATE_ENGINE_POOL_SIZE`   | pricing     | rate engine connections                         |
| `RATE_ENGINE_QUEUE_LIMIT` | pricing     | requests allowed to wait for a connection       |
| `TRAFFIC_RATE`            | browser-sim | requests per second                              |

Durations are written `500ms`, `30s`, `5m`, `24h`; a bare number is milliseconds.

## Telemetry

Every service sends traces, logs and metrics over OTLP to the cluster's collector, tagged with
`service.namespace=quoting`, `service.version` and the pod name.

## Deploying

The chart is `deploy/chart`, and `deploy/releases/<version>.yaml` holds the values of the release in
production. Every release is a Helm revision in the `quoting` namespace:

```sh
helm -n quoting history quoting
helm -n quoting get values quoting
```

## Runbooks

[`runbooks/`](runbooks/README.md) for this product's alerts, and the platform's in [`/runbooks`](../../runbooks/README.md).

See [CHANGELOG.md](CHANGELOG.md) for what each release changed.
