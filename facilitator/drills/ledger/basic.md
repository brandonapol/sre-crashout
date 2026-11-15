# Ledger, basic: the config typo

**Tier:** basic. One change, an error message that names it, and a runbook that covers it exactly. The point
is the process: acknowledging, posting updates, finding logs of a dead container, rolling back.

## Deploy announcement

Post in your deploys channel when you trigger it:

> ledger 3.6.3 going out: config readability cleanup (PLAT-95), log level made explicit.

## The page

> **[P3] KubePodCrashLooping: ledger/ledger-api.** A `ledger-api` pod has restarted 4 times in 5 minutes.

## What's broken

Release 3.6.3 changed `IDEMPOTENCY_SWEEP_INTERVAL` from `30s` to `30 sec`. `ledger-api` parses durations at
startup and rejects the unit, so the new pod exits immediately with
`Error: invalid duration: "30 sec"` and goes into `CrashLoopBackOff`. The rollout can't progress. The two old
pods keep serving, so partners see nothing.

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| `kubectl -n ledger get pods` | one new pod in `CrashLoopBackOff`, two old pods Running |
| `kubectl -n ledger logs <pod> --previous` | the stack trace ending in `invalid duration: "30 sec"` |
| `describe pod` | `Last State: Terminated, Reason: Error, Exit Code: 1` |
| `helm -n ledger history ledger` and a values diff | 3.6.3: `IDEMPOTENCY_SWEEP_INTERVAL` and `LOG_LEVEL` changed |
| partner-sim spans | no impact |
| runbook | [ledger-api restarting](../../../scenarios/ledger/runbooks/ledger-api-restarting.md), "Not starting at all" |

The crash happens before telemetry starts, so it's not in tinyo11y's logs. `kubectl logs --previous` is the
only place the error is. That's worth pointing out in the debrief.

## Hint ladder

1. "Is anyone affected yet? How do you know?"
2. "The container is gone. Where do a dead container's last words go?"
3. "Is there a runbook for this alert?"

## Mitigation and fix

- Roll back: `helm -n ledger rollback ledger <previous revision>`.
- Or fix the value (`30s`) and redeploy.
- Not a fix: deleting the crashing pod, or the old pods.

## Discussion questions

- Why were partners unaffected? What would have made this an outage? (A node drain, a `Recreate` strategy,
  `maxUnavailable` above zero, or scaling down the old ReplicaSet.)
- Should a crash loop on a new ReplicaSet page at all? Who should get it: the deployer or on-call?
- How could CI have caught it? (Validate config by starting the service in CI, or a schema for values.)

## Run it

```sh
make drill/incident P=ledger TIER=basic
make drill/verify P=ledger EXPECT=basic     # within a minute
make drill/reset P=ledger
```
