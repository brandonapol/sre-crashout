# ledger-api restarting

`ledger-api` runs two replicas behind the `ledger-api` Service. Losing one drops the transfers it had in
flight; partners retry them with the same idempotency key.

## Not starting at all (CrashLoopBackOff on new pods)

Seen after deploys (LEDGER-INC-031). `ledger-api` validates its configuration at startup and exits with code
1 if a value is missing or malformed. The last lines of the dead container's log name the variable:

```sh
kubectl -n ledger logs <pod> --previous | tail -n 20
#   Error: invalid duration: "..."
#   Error: missing required environment variable ...
```

Durations must be a number with a unit (`500ms`, `30s`, `5m`, `24h`); a bare number is milliseconds. Fix the
value in the release's values and redeploy, or roll back:

```sh
helm -n ledger history ledger
helm -n ledger rollback ledger <last good revision>
```

While the new pods crash, the old ReplicaSet keeps serving, so partners usually see nothing. Don't delete the
old pods to "help the rollout along".

## Restarting while running

Find out how the container ended ([Pods restarting](../../../runbooks/pods-restarting.md)):

- `OOMKilled`: `ledger-api` keeps recent state in memory, so its memory follows traffic. Compare memory with
  the partner request rate over the same hours before you change the limit.
- Killed after liveness failures: `ledger-api` stopped answering `/healthz` within the probe's timeout. Check
  whether it was stuck or only slow, and what it was doing just before.
