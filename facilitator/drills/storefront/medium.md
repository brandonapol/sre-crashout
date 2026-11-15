# Storefront, medium: the rotated secret

**Tier:** medium. The symptom and the error are clear, and the diff shows what changed, but the change looks
correct. The team has to work out why a correct change broke things: config that's read once, at startup.

## Deploy announcement

Post it about ten minutes before you page, among other noise if you can:

> storefront 5.1.7: quarterly rotation of the inventory API token (SEC-140). catalog: recommendations on
> product pages (REC-19).

## The page

> **[P1] CheckoutErrors.** Most checkouts failing with 502. Browsing is fine.

## What's broken

Release 5.1.7 rotated the token in the `inventory-api` Secret. Both `checkout` and `inventory` read it as an
environment variable, which is only read when a container starts. `inventory`'s Deployment carries a checksum
of the Secret (`restartOnSecretChange`), so it rolled and now expects the new token. `checkout`'s doesn't, so
its pods kept running with the old token. Every reservation gets `401`, and `checkout` returns
`502 reservation_failed`.

Nothing about the token is wrong. Restarting `checkout` fixes it.

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| shopper-sim spans | `checkout` failing almost 100%; browsing fine |
| `checkout` logs | `reservation failed` with `status: 401` |
| `inventory` logs | `reservation rejected: invalid credentials` |
| traces | `checkout` → `inventory` `POST /v1/reservations` → 401 |
| values diff | the Secret's token changed; `catalog` recommendations on |
| pod ages | `inventory` pods are minutes old, `checkout` pods are hours old |
| `kubectl get deploy -o yaml` | a `checksum/secret-inventory-api` annotation on inventory's pod template, none on checkout's |
| `catalog` logs | **red herring**: `recommendations model features stale` warnings since 5.1.7, harmless |

## Hint ladder

1. "Who is refusing whom, and on what grounds?"
2. "Both sides read the same Secret. Do they both have the same value right now?"
3. "When does a container read its environment variables?"

## Mitigation and fix

- Mitigate: `kubectl -n storefront rollout restart deploy/checkout`. Or roll back to 5.1.4, which rolls
  inventory back to the old token (it works, but undoes a security rotation).
- Fix: `restartOnSecretChange` for `checkout` too, or read the token from a mounted file and reload it, or
  accept both tokens during a rotation window.

## Discussion questions

- How should a credential rotation be rolled out between two services? (Accept old and new, then switch
  callers, then retire old.)
- Rollback "worked". Was it the right lever here?
- What would have shown this in staging?

## Run it

```sh
make drill/incident P=storefront TIER=medium
make drill/verify P=storefront EXPECT=medium      # within 2 minutes
make drill/reset P=storefront
```
