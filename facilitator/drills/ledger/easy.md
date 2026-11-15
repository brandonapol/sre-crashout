# Ledger, easy: the renamed dependency

**Tier:** easy. One change, a loud symptom, and logs that point at the cause, but no runbook for this exact
case. The team has to follow an error from the user to the line that explains it.

## Deploy announcement

> ledger 3.6.4 out: service URLs follow the platform naming convention (PLAT-91). fx-rates 1.12.1 (dependency bumps).

## The page

> **[P2] PartnerTransferErrors.** About 15% of partner transfers are failing with 5xx.

## What's broken

Release 3.6.4 changed `ledger-api`'s `FX_RATES_URL` from `http://fx-rates:8080` to `http://fx-rate:8080`.
There's no `fx-rate` Service, so every rate lookup fails DNS (`ENOTFOUND`) and `ledger-api` returns
`502 fx_unavailable`. Only transfers whose settlement currency differs from their currency need a rate,
which is roughly one in six. Same-currency transfers and balance checks work.

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| partner-sim spans | `partner transfer` failing about 15%, `partner transfer retry` much more (it replays failures); `balance check` fine |
| failing traces | `ledger-api` → a client span to `fx-rate` failing with no server span on the other side |
| `ledger-api` logs | `fx lookup failed` with `error: fetch failed: ENOTFOUND` and the currencies |
| `fx-rates` spans | its request rate drops to zero: nobody is calling it |
| values diff | 3.6.4 changed `FX_RATES_URL`, and bumped `fx-rates` to 1.12.1 |

**Red herring:** `fx-rates` was also redeployed (1.12.1), so it's tempting to blame it. It's healthy; it
just isn't receiving traffic.

## Hint ladder

1. "Which transfers fail and which don't? What do the failing ones have in common?"
2. "Follow a failing trace down. Where does it stop?"
3. "Read the error on that span, or in ledger-api's error logs, word for word."

## Mitigation and fix

- Roll back, or set `FX_RATES_URL` back to `http://fx-rates:8080`.
- Discussion: `kubectl -n ledger get svc` shows the real name in seconds. How could the deploy have checked
  that the dependencies it names exist?

## Discussion questions

- Why only some transfers? How did you work out which?
- The error said `ENOTFOUND`. What would `ECONNREFUSED` or a timeout have meant instead?
- Partners retry failed transfers. What does that do to the error rate, and to the books once it's fixed?

## Run it

```sh
make drill/incident P=ledger TIER=easy
make drill/verify P=ledger EXPECT=easy      # within a minute
make drill/reset P=ledger
```
