# Fault catalog

Faults that make good drills, by where the change lives. Each one says what to change, the story that makes the
change believable, what the team will see, which tiers it suits, and what tends to go wrong when you build it.
Adapt them to the app: the best fault uses something the app really has (its own config keys, its own
dependencies, its own retry logic).

The worked examples are in sre-crashout's `facilitator/drills/`; the entry says which.

## Contents

- [Configuration values](#configuration-values)
- [Kubernetes spec](#kubernetes-spec)
- [Rollouts, labels and policy](#rollouts-labels-and-policy)
- [Secrets and credentials](#secrets-and-credentials)
- [Code](#code)
- [Combining faults for hard drills](#combining-faults-for-hard-drills)

## Configuration values

**Invalid value that fails startup validation.** A duration without a unit, a misspelled enum, a URL without a
scheme. New pods crash on start and the rollout stalls, while old pods keep serving.
*Story:* "config readability cleanup". *Tiers:* basic. *Example:* ledger basic.
*Watch for:* only works if the app validates config at startup; if it doesn't, the bad value surfaces later
and differently. The error goes to stderr before telemetry starts, so `kubectl logs --previous` is the only
place it shows: say so in the guide.

**Wrong dependency address.** A hostname typo (DNS `ENOTFOUND`), a wrong port (`ECONNREFUSED`), an extra path
segment (404 from the dependency).
*Story:* "service URLs follow the naming convention", "move to the v2 API". *Tiers:* basic (port, with a
runbook), easy (hostname, path). *Examples:* quoting basic, ledger easy, quoting easy.
*Watch for:* partial impact makes it more interesting: pick a dependency only some requests use.

**Unit mistake that's valid.** A number that parses but means something else: a TTL of `300` read as
milliseconds, a timeout of `30` meaning 30ms, a size in bytes instead of KiB.
*Story:* "aligned with the CDN max-age of 300". *Tiers:* medium, hard. *Example:* quoting hard.
*Watch for:* the effect must be big enough to show and deterministic (see calibration: stochastic collapse).

**Feature flag that adds work to the hot path.** A new synchronous call, a bigger payload, more rules evaluated
per request.
*Story:* a product feature with a ticket. *Tiers:* medium, hard. *Example:* quoting medium (promo banner).
*Watch for:* the work must be measurable; if the app has a concurrency limit or a pool, that's where it bites.

**Retention or cache size raised.** Something kept in memory for longer, or more of it.
*Story:* "keep idempotency keys for 24h to match partner retries". *Tiers:* medium. *Example:* ledger medium.
*Watch for:* the leak rate must fit the session: compute it (rate × size per item) and test the time to OOM.

**Timeout or retry change.** A caller's timeout made shorter than the callee's normal latency, or retries
raised.
*Tiers:* easy (timeout too short), medium/hard (retries amplifying a slow dependency).

## Kubernetes spec

**Resource request with a unit mistake.** `cpu: 400` meaning 400m, `memory: 64G` meaning 64M. Pods stay
Pending; the rollout stalls, old pods serve.
*Tiers:* basic. *Example:* storefront basic.
*Watch for:* make the number impossible on any node, so the drill is the same on every cluster.

**Memory limit below what the app needs.** OOMKilled on start or under load.
*Tiers:* basic (on start), medium (only under load, looks like a leak but plateaus).
*Watch for:* runtimes with their own heap limit (JVM, Node's `--max-old-space-size`) may throw an
out-of-memory error themselves instead of being OOMKilled. Decide which you want.

**CPU limit too small for the work.** CFS throttling: tail latency first, then a backlog, then probe failures
and restarts.
*Story:* FinOps right-sizing from past usage, plus a change that adds CPU work. *Tiers:* hard.
*Example:* ledger hard.
*Watch for:* how fast it collapses depends on the host. Size it so demand is clearly above the limit (1.3× or
more) so it always fires, and describe the progression rather than exact numbers.

**Broken probe.** Liveness pointed at a path the app doesn't serve, a port that's wrong, a timeout too short
for a slow endpoint.
*Story:* "health checks follow the platform convention". *Tiers:* easy. *Example:* storefront easy.
*Watch for:* readiness and liveness doing different things is the interesting part: a pod that's Ready and
then killed.

**Readiness that lies.** Readiness passes while the app can't serve (it doesn't check a dependency it needs, or
the app warms a cache after reporting ready).
*Tiers:* medium. Often needs a small code change.

**Scheduling constraints.** A nodeSelector, affinity or toleration that no node satisfies; a PVC that can't
bind; a topology spread that can't be met.
*Tiers:* basic, easy.

## Rollouts, labels and policy

**Canary or new Deployment that doesn't get the same treatment.** A second Deployment behind the same Service
that misses a label, an annotation, a Secret or a NetworkPolicy allowance the stable one has.
*Tiers:* hard. *Example:* storefront hard (NetworkPolicy drops the canary's traffic).
*Watch for:* keep-alive connections pin clients to old pods, so a new pod may get no traffic until
connections recycle (calibration). NetworkPolicy faults need a CNI that enforces them: run
`scripts/guard.bash netpol <ns>` first.

**Service selector that matches too little or too much.** A label rename that empties a Service's endpoints,
or a new workload whose labels make the Service send it traffic it can't handle.
*Tiers:* easy (empty endpoints), hard (extra endpoints that misbehave).

**Rollout strategy.** `Recreate` instead of `RollingUpdate`, `maxUnavailable` too high, a PodDisruptionBudget
that blocks a drain.
*Tiers:* easy, medium. Best combined with a deploy during the session.

## Secrets and credentials

**Rotation that reaches one side only.** A shared Secret changes; the consumer that reads it as an environment
variable at startup keeps the old value until restarted, the other side rolls (it has a checksum annotation).
*Story:* quarterly rotation. *Tiers:* medium. *Example:* storefront medium.
*Watch for:* use obviously fake values (`drill-only-token-...`). Never real credentials, even in dev.

**Expired or wrong credential to a dependency.** Auth errors from a database or API stub.
*Tiers:* easy.

## Code

Change code only when the lesson is about code, and make the change look like ordinary work: a feature, a
refactor, a performance tweak. Build the image from the drill branch and load it into the cluster; don't push
the branch.

**Unbounded growth.** A map used as a cache without eviction, a list of listeners never removed, a buffer that
only grows. *Tiers:* medium.

**Missing timeout or cancellation.** A new outbound call without a timeout, so a slow dependency holds
requests forever; or work that continues after the caller gave up. *Tiers:* medium, hard.

**Retries without backoff or budget.** A retry loop added to "improve reliability". *Tiers:* hard, with a slow
dependency to amplify.

**Synchronous call in the hot path.** Blocking I/O, a sync file read, a CPU-heavy step per request.
*Tiers:* medium.

**Error handling that hides failures.** A fallback that returns success when a dependency fails (a "soft"
path), so errors turn into silent latency or wrong data. *Tiers:* hard. *Example:* storefront's soft
reservations.

**Connection pool too small or leaked.** A pool size config, or a code path that doesn't release a
connection on error. *Tiers:* medium, hard.

## Combining faults for hard drills

Hard drills usually need two of these:

- a change that adds load or latency **and** a limit that the change pushes past (CPU limit + more work; pool
  size + slower calls; concurrency limit + new dependency)
- a trigger **and** an amplifier (a cache miss storm + retries; a slow dependency + no timeout)
- a cause in one object **and** a symptom in another (a label change + a NetworkPolicy; a Secret + a stale env
  var)

Plus red herrings: visible, plausible, harmless changes in the same release, such as a noisy new warning log, a
version bump of an unrelated service, or a feature flag.
