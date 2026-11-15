# Checkout errors

An order goes through `checkout`, which prices each line from `catalog` and reserves stock in `inventory`
before it confirms. What `checkout` returns tells you which step failed:

| Response | Step | Next |
| -------- | ---- | ---- |
| `502 pricing_unavailable` | a `catalog` lookup failed | `catalog`'s health, restarts and logs |
| `502 reservation_failed` | `inventory` answered with a 4xx | `inventory`'s logs say why it refused |
| `503 inventory_unavailable` | `inventory` failed or timed out and soft reservations are off | `inventory`'s health |
| `201` with `fulfillment: pending-stock-check` | `inventory` failed or timed out, soft reservations are on | not an error to the user, but a cost: fulfilment has to reconcile each one |
| `409 insufficient_stock` | real stock-out | not an incident |

```text
{service_name="checkout"} | detected_level=~"warn|error"
{service_name="inventory"} | detected_level=~"warn|error"
```

`inventory` authenticates reservations with a shared token from the `inventory-api` Secret, and only accepts
traffic from backend pods (see the chart's NetworkPolicy).

If only some checkouts fail or are slow, compare pods: `service.version` and `k8s.pod.name` on the spans tell
you which `checkout` handled each request, and a canary runs alongside the stable Deployment during
rollouts.
