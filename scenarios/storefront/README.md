# storefront

The shop's backend: browse the catalogue, place orders. Orders hold stock in inventory while they are
fulfilled.

## Services

| Service       | What it does                                                         | Calls                  |
| ------------- | -------------------------------------------------------------------- | ---------------------- |
| `catalog`     | `GET /v1/products`, `GET /v1/products/:sku`                          |                        |
| `checkout`    | `POST /v1/orders`: prices the lines, reserves stock, creates the order | `catalog`, `inventory` |
| `inventory`   | `POST /v1/reservations`, `GET /v1/stock/:sku`                        |                        |
| `shopper-sim` | synthetic shoppers browsing and checking out                         | `catalog`, `checkout`  |

```text
shopper-sim ──► catalog
     └────────► checkout ──► catalog
                    └──────► inventory
```

### Reservations

`checkout` reserves stock before it confirms an order. With `SOFT_RESERVATIONS` on, an order whose
reservation can't be made is still accepted with `fulfillment: pending-stock-check`, and fulfilment
reconciles stock later, so a slow inventory never loses a sale.

### Rollouts

New `checkout` versions go out as a canary: a `checkout-canary` Deployment behind the same `checkout`
Service, taking a share of traffic in proportion to its replicas, before it replaces the stable Deployment.

### Network and credentials

`inventory` only accepts traffic from backend services: see `deploy/chart/templates/networkpolicy.yaml`.
Reservations are authenticated with a shared token, `INVENTORY_API_TOKEN`, which both `checkout` and
`inventory` read from the `inventory-api` Secret. The token is rotated every quarter (SEC-140).

## Configuration

| Variable             | Service     | Meaning                                                  |
| -------------------- | ----------- | -------------------------------------------------------- |
| `PAGE_SIZE`          | catalog     | products per page                                        |
| `RECOMMENDATIONS`    | catalog     | add recommended SKUs to product pages                    |
| `CATALOG_TIMEOUT`    | checkout    | per-attempt timeout for a price lookup (two attempts)    |
| `INVENTORY_TIMEOUT`  | checkout    | per-attempt timeout for a reservation                    |
| `INVENTORY_ATTEMPTS` | checkout    | attempts per reservation                                 |
| `SOFT_RESERVATIONS`  | checkout    | accept orders whose reservation failed                   |
| `TRAFFIC_RATE`       | shopper-sim | requests per second                                       |

Durations are written `500ms`, `30s`, `5m`, `24h`; a bare number is milliseconds.

## Telemetry

Every service sends traces, logs and metrics over OTLP to the cluster's collector, tagged with
`service.namespace=storefront`, `service.version` and the pod name.

## Deploying

The chart is `deploy/chart`, and `deploy/releases/<version>.yaml` holds the values of the release in
production. Every release is a Helm revision in the `storefront` namespace:

```sh
helm -n storefront history storefront
helm -n storefront get values storefront
```

## Runbooks

[`runbooks/`](runbooks/README.md) for this product's alerts, and the platform's in [`/runbooks`](../../runbooks/README.md).

See [CHANGELOG.md](CHANGELOG.md) for what each release changed.
