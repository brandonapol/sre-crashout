# ledger

Ledger moves money between accounts for partner platforms. Partners call the API to create transfers; every
transfer is double-entry, screened, converted when the settlement currency differs, and returned as a receipt.

## Services

| Service       | What it does                                                                 | Calls      |
| ------------- | ---------------------------------------------------------------------------- | ---------- |
| `ledger-api`  | `POST /v1/transfers`, `GET /v1/accounts/:id/balance`                         | `fx-rates` |
| `fx-rates`    | `GET /v1/rates/:from/:to` from a rates feed it refreshes in the background   | (the feed) |
| `partner-sim` | synthetic partner traffic; its spans are what partners experience            | `ledger-api` |

```text
partner-sim ──► ledger-api ──► fx-rates
```

### Transfers are idempotent

Partners must send an `Idempotency-Key` header. If a partner retries a transfer with a key `ledger-api` has
already seen, it gets the original receipt back (with `idempotent-replayed: true`) instead of moving the money
twice. Keys are remembered for `IDEMPOTENCY_TTL`.

## Configuration

Every setting is an environment variable, set per release in `deploy/releases/<version>.yaml`.

| Variable                     | Service     | Meaning                                                    |
| ---------------------------- | ----------- | ---------------------------------------------------------- |
| `FX_RATES_URL`               | ledger-api  | where `fx-rates` is                                        |
| `FX_TIMEOUT`                 | ledger-api  | per-attempt timeout for a rate lookup (two attempts)       |
| `IDEMPOTENCY_TTL`            | ledger-api  | how long an idempotency key and its receipt are kept       |
| `IDEMPOTENCY_SWEEP_INTERVAL` | ledger-api  | how often expired keys are removed                         |
| `SCREENING_RULESET_SIZE`     | ledger-api  | how many screening rules run on each transfer              |
| `FEED_REFRESH_INTERVAL`      | fx-rates    | how often the rates feed is polled                         |
| `FEED_TIMEOUT`               | fx-rates    | how long a feed poll may take before last-known rates are kept |
| `TRAFFIC_RATE`               | partner-sim | requests per second                                         |

Durations are written `500ms`, `30s`, `5m`, `24h`; a bare number is milliseconds.

## Telemetry

Every service sends traces, logs and metrics over OTLP to the cluster's collector, tagged with
`service.namespace=ledger`, `service.version` and the pod name. Node.js runtime metrics (heap, event loop
delay, GC) come from each process; CPU, memory and restarts come from Kubernetes.

## Deploying

The chart is `deploy/chart`, and `deploy/releases/<version>.yaml` holds the values of the release in
production. Every release is a Helm revision in the `ledger` namespace:

```sh
helm -n ledger history ledger
helm -n ledger get values ledger
```

## Runbooks

[`runbooks/`](runbooks/README.md) for this product's alerts, and the platform's in [`/runbooks`](../../runbooks/README.md).

See [CHANGELOG.md](CHANGELOG.md) for what each release changed.
