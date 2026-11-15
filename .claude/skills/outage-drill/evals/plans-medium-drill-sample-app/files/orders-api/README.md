# orders-api

Creates orders and charges them through the payments service. `POST /orders` charges and stores the order;
`GET /orders/:id` reads it back from the order cache.

Configuration is in `k8s/orders-api.yaml` (ConfigMap `orders-api`). Timeouts and TTLs are in seconds.

| Variable | Meaning |
| -------- | ------- |
| `PAYMENTS_URL` | where payments is |
| `PAYMENTS_TIMEOUT_SECONDS` | per-attempt timeout for a charge |
| `PAYMENTS_RETRIES` | extra attempts after a failed charge |
| `ORDER_CACHE_TTL_SECONDS` | how long an order can be read back |
| `ORDER_CACHE_MAX_ENTRIES` | the most orders kept |
| `MAX_CONCURRENT_CHARGES` | charges in flight per pod before new ones are refused |
