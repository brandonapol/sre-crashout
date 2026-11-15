# Ledger, medium: the slow leak

**Tier:** medium. One root cause, a delayed and indirect symptom, a red herring, and a runbook that helps with
the *what* (OOMKilled) but not the *why*. The team has to connect memory growth to a config change made
minutes earlier.

## Deploy announcement

Post it about ten minutes before the first OOM kill:

> ledger 3.7.0: idempotency keys kept for 24h to match partner retry windows (PAY-1142). Expanded screening
> ruleset (COMP-208). fx-rates 1.13.0: feed polls fail fast after 400ms and keep last-known rates (FX-311).

## The page

> **[P3] ledger: `ledger-api` containers restarting.** Restart count is climbing on both pods. A partner
> reports occasional connection resets on transfers, "a few every several minutes". The error-rate SLO is
> fine.

## What's broken

Release 3.7.0 raised `IDEMPOTENCY_TTL` from `2m` to `24h` (PAY-1142, to match partner retry windows).
`ledger-api` keeps idempotency keys, each with its full receipt, in process memory, so it now keeps every
receipt for a day. 3.7.0 also raised `SCREENING_RULESET_SIZE` from 24 to 64 (COMP-208), which makes each
receipt more than twice as large (about 7 KB to about 17 KB), so it leaks faster.

At about 20 new transfers per second per pod, a pod grows by roughly 10–15 MiB a minute. The image sets
`--max-old-space-size=1024`, well above the 192Mi container limit, so V8 never feels pressure, never tries
harder to collect, and never throws a heap error. The kernel OOM-kills the container instead (exit 137,
`OOMKilled`). The pod restarts empty, and the cycle repeats every 5–10 minutes per pod.

Each kill drops the requests in flight on that pod, a handful at a time, so partners see occasional
connection resets while the error-rate SLO barely moves. That's why this kind of failure tends to get
ignored. Partners then retry with the same key, but every key the pod held died with it, so if the original
had already settled, the retry settles it again. That's a duplicate transfer nobody notices during the drill.
Save it for the debrief.

## Causal chain

```text
3.7.0: IDEMPOTENCY_TTL 2m -> 24h  (+ bigger receipts)
  -> idempotency map never shrinks
  -> container memory climbs linearly (sawtooth over restarts)
  -> kernel OOMKill at 192Mi (V8 heap limit is 1024Mi, so no JS heap error)
  -> restarts drop in-flight transfers -> a few partner resets per kill
```

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| Kubernetes events (tinyo11y Kubernetes dashboard / event logs) | `ledger-api` containers restarting; `kubectl describe pod` shows `Last State: Terminated, Reason: OOMKilled, Exit Code: 137` |
| `kubeletstats` container memory for `ledger-api` | a sawtooth: linear climb to ~192Mi, drop to ~50Mi, climb again |
| runtime metrics (`v8js.memory.heap.used`, `nodejs.eventloop.delay`) | heap climbs with it; GC pauses and event loop delay grow late in each cycle |
| `partner-sim` spans | a few errors (connection reset) that line up exactly with each restart |
| `ledger-api` logs | `idempotency sweep` every 30s: `removed=0` and `retained` climbing without limit (under 3.6.2, `retained` holds steady) |
| `fx-rates` logs | **red herring**: frequent `fx feed refresh failed; serving last known rates` since 3.7.0 (`FEED_TIMEOUT` 2s -> 400ms). No user impact: lookups still answer from last-known rates |
| `helm -n ledger history ledger` | 3.7.0 deployed shortly before the first restart |

## Hint ladder

1. "How often are the errors coming, and does anything else happen on that schedule?"
2. "What does Kubernetes say about why the container last exited?"
3. "Memory goes up and to the right. What did 3.7.0 change that would make the process keep more?"
4. "Read the `idempotency sweep` log lines next to the CHANGELOG entry for PAY-1142."

## Mitigation and fix

- **Mitigate**: roll back (`helm -n ledger rollback ledger` or `scripts/drill.bash deploy ledger 3.6.2`), or set
  `IDEMPOTENCY_TTL` back to `2m`.
- **Not a fix**: raising the memory limit. It only stretches the sawtooth. Push the group on this if they try it,
  and ask what limit would hold 24 hours of receipts (hundreds of GiB).
- **Real fix (discussion)**: idempotency records that must outlive a pod don't belong in process memory.
  Store them in a shared store with a TTL (Redis, the database), or store a hash and the receipt ID rather
  than the whole receipt.

## Discussion questions

- Why did the pod get OOMKilled instead of logging a JavaScript heap error? What does `--max-old-space-size`
  above the container limit do?
- How do you tell a leak apart from a limit that's simply too low? (Slope versus plateau.)
- The duplicate-transfer side effect: what would have caught it?
- PAY-1142 was a reasonable business ask. What review question would have caught the memory cost?
- The error-rate SLO stayed green. Should restarts page? What would have fired before a partner noticed?
  (Memory over 80% of limit, restarts > 0, an `OOMKilled` event.)

## Run it

```sh
make drill/incident P=ledger TIER=medium
make drill/verify P=ledger EXPECT=medium     # after 5-10 minutes
make drill/reset P=ledger
make drill/verify P=ledger EXPECT=healthy
```
