# Ledger, hard: throttled

**Tier:** hard. Two changes in one release, each reasonable on its own. It starts as tail latency and becomes
an outage within minutes, with `ledger-api` restarting. The restarts are a symptom that points the wrong way:
`ledger-api` logs nothing wrong, its memory is flat, and its CPU looks only a little busier than usual unless
you compare it with the right line.

## Deploy announcement

None from the ledger team. The release went out with a FinOps change, announced the week before:

> FinOps: CPU limits are being applied to services that don't have one, at their observed p95 (FIN-77).
> ledger-api: 120m.

## The page

> **[P2] PartnerTransferLatency.** Partner transfer p99 above 5s. Partners report timeouts.

Ten minutes later, if they haven't mitigated:

> **[P1] PartnerTransferErrors.** Over half of partner requests failing. `ledger-api` restarting.

## What's broken

Release 3.8.0 did two things:

- Doubled the screening ruleset (`SCREENING_RULESET_SIZE` 24 → 48). Each rule costs CPU, so a transfer now
  needs about twice the CPU it did.
- Set a CPU limit of `120m` on `ledger-api`, sized from the p95 usage measured *before* the ruleset change.

Each pod now needs roughly 1.3–1.5× the CPU its limit allows. The kernel's CFS quota lets the container run
for 12ms in every 100ms period and then stops it until the next one. Requests queue in the event loop, and
because nothing cancels work a partner has given up on, the backlog only grows. Within a minute the p99 is at
the partners' 5s timeout; within two or three, most requests time out, balance checks included, and partners'
retries add load.

The liveness probe (`/healthz`, 1s timeout) waits in the same queue, so pods start failing it and the kubelet
restarts them. Each restart empties a pod's backlog, the other pod takes its traffic, and the cycle repeats.
Nothing in `ledger-api` logs an error: from inside the process, time just goes missing.

How fast it goes depends on the host. Expect the first liveness kills within one to three minutes.

## Causal chain

```text
3.8.0: screening ruleset 24 -> 48 (CPU per transfer ~2x)
     + CPU limit 120m sized from the old usage
  -> demand ~1.4x the limit -> CFS throttling in most periods
  -> work queues in the event loop, and abandoned requests still get processed
  -> p99 at the partners' 5s timeout, then most requests timing out, retries adding load
  -> /healthz waits in the same queue -> liveness failures -> restarts (which briefly help, then repeat)
```

## Where the evidence is

| Signal | What it shows |
| ------ | ------------- |
| partner-sim spans | first p99 at 5s with p50 normal, then errors on every journey, balance checks included (a hint that it isn't transfer logic) |
| `ledger-api` spans | server latency shows long gaps with no child spans: time spent waiting in the process |
| runtime metrics | `nodejs.eventloop.delay.*` far above baseline |
| pod CPU (Resources panel, Kubernetes dashboard) | flat at about 0.12 cores per pod, a little above the 100m request. Against the *request* it looks busy but fine; against the *limit* it's pinned |
| `kubectl -n ledger get deploy ledger-api -o yaml` | `limits.cpu: 120m`, new in this release |
| cgroup (`kubectl exec ... cat /sys/fs/cgroup/cpu.stat`, or `cpu/cpu.stat` on cgroup v1) | `nr_throttled` close to `nr_periods` |
| `ledger-api` restarts | `Liveness probe failed: ... context deadline exceeded` in events, then `Killing`; last state `Error` or `Completed`, never `OOMKilled` |
| `ledger-api` logs | nothing unusual, right up to each restart |
| memory | flat: this isn't the leak |
| values diff | 3.8.0: `SCREENING_RULESET_SIZE`, `resources.limits.cpu`, and fx-rates 1.13.0 with `FEED_TIMEOUT: 400ms` |
| `fx-rates` logs | **red herring**: `fx feed refresh failed; serving last known rates` warnings since 3.8.0. No user impact |
| fx-rates being in the release | **red herring**: it's the obvious suspect for slow transfers, but balance checks don't touch it and fail too |
| the restarts | **red herring**: they send people to the restart runbooks and to probe tuning. Raising the probe timeout stops the restarts and makes the outage worse, because the backlog never clears |

## Hint ladder

1. "Balance checks don't call any dependency, and they time out too. What do they share with transfers?"
2. "Where does the time go inside a slow `ledger-api` span?"
3. "How much CPU is `ledger-api` using, compared with what it's allowed to use?"
4. "Read the release's resource changes and its screening change together."

## Mitigation and fix

- **Fastest**: roll back, or raise the limit in place
  (`kubectl -n ledger set resources deploy/ledger-api --limits=cpu=500m`), then drop or raise it in the
  release values so the next deploy doesn't put it back.
- **Also works**: scale `ledger-api` to 4 replicas. Each pod then needs less than its limit. Worth asking why
  that works.
- **Not a fix**: reverting only the fx-rates change.
- **Discussion**: CPU limits on latency-sensitive services are contentious. Many teams set requests and no
  limits. Limits sized from past usage break when the work per request changes.

## Discussion questions

- Why did it start with the p99 and end with everything? What would have stopped the backlog growing?
- The restarts were the loudest signal. Were they the cause, a symptom, or a mitigation?
- Which dashboard line would have shown this in one glance? Does your dashboard draw it?
- Two reasonable changes, two teams. Whose incident is it, and how should they have been reviewed together?
- What did partner retries do to the load, and to the books?

## Run it

```sh
make drill/incident P=ledger TIER=hard
make drill/verify P=ledger EXPECT=hard      # within a minute or two
make drill/reset P=ledger
```
