---
name: outage-drill
description: Turn an existing application repository into a realistic on-call training incident. Deploys the app into a disposable dev namespace next to tinyo11y (OpenTelemetry into ClickHouse and Grafana), adds synthetic users, then injects a believable fault at a chosen difficulty (basic, easy, medium, hard) by changing the app's config, Kubernetes manifests or code, verifies the incident reliably shows up, and writes the facilitator's answer key. Use this whenever someone wants a practice outage, game day, Wheel of Misfortune, chaos-style training exercise, an incident to debug for onboarding, or to "break our service on purpose so the team can practise", even if they don't say "drill" — and whenever they want to run the sre-crashout approach against their own repo rather than its bundled products.
---

# Outage drill

You are building a training incident out of someone's real application. The team that debugs it should feel
like they've been paged for a service they don't know well: they have its repository, its telemetry and the
cluster, and nothing tells them what's wrong. You are the person who quietly broke it, and you write the
answer key.

The sre-crashout repository this skill lives in already did this for three made-up products. Its
`facilitator/` folder is the worked example of what you produce, and `scripts/drill.bash` is the worked
example of how drills are run and verified. Read one guide from `facilitator/drills/` before you start, so you
know what "done" looks like.

## What you hand back

1. **A healthy baseline** of the app running in a dev namespace, reporting to tinyo11y, with synthetic users.
2. **An incident change**: the exact diff (values, manifests or code) that causes the incident, applied as a
   believable "release", plus how to apply and revert it.
3. **Evidence it works**: at least two cycles of baseline → incident → reset, with the numbers from each.
4. **An answer key** (facilitator guide) from [references/guide-template.md](references/guide-template.md),
   kept where participants won't see it.
5. **A short report** to the user: what you built, how to run it, what you verified, and what you couldn't.

## Ground rules

These exist because you are deliberately breaking something in a shared environment. Each one protects
someone.

- **Dev clusters only.** Before touching anything, run `scripts/guard.bash context` and read the context and
  server it prints. If it looks like production, or you're unsure, stop and ask. Breaking a real system
  isn't a drill.
- **One namespace you own.** Create a fresh namespace for the drill (`<app>-drill` unless told otherwise) with
  `scripts/guard.bash namespace <ns>`. It refuses a namespace that exists without the drill label, so you
  never break someone else's environment. Everything you create goes in it, except tinyo11y if it isn't
  already there.
- **Never change the target repository's real history.** Work on a local branch (`drill/<short-id>`) or in a
  values overlay outside the repo. Don't push it, don't open pull requests, don't merge. If a code change needs
  an image, build and load it locally or push it to a registry tag the user approves.
- **Keep the answer out of sight.** Write the answer key outside the target repository (in the sre-crashout
  `facilitator/drills/<app>/` folder, or a path the user names). Never describe the fault in a code comment,
  commit message, variable name, log line or Kubernetes object name. The change should look like an ordinary
  change someone made for a plausible reason.
- **No real harm, even in dev.** Don't disable security controls, run privileged containers, put real
  credentials in values, send traffic outside the cluster, or exhaust shared resources (node disk, the
  cluster's CPU). A fault should hurt your namespace's app, not the cluster.
- **Everything reversible.** Before you inject, write down the reset (a revision to roll back to, a values
  file, a branch to drop). Test the reset as part of verification.

## Workflow

### 1. Gather inputs

Ask for anything you can't find out yourself:

- the repository path, and which services in it the drill should involve
- the tier: basic, easy, medium or hard (see the table below); default to easy for a first drill
- the kube context and namespace to use, and whether tinyo11y is already installed (and where)
- who will debug it, so you know where the answer key must not live
- how long a session is (the symptom should show within the first few minutes of it)

### 2. Map the system

Read the repository before you plan anything. You need to understand it at least as well as the people who
will debug it, or you can't predict what your fault will do. Write a short system map for yourself:

- how it's deployed: Helm chart, kustomize, plain manifests, or nothing yet (then write a minimal chart)
- each service: language, ports, health endpoints, probes, resources, replicas, rollout strategy
- what each service calls (other services, databases, queues, external APIs) and with what timeouts and
  retries
- its configuration surface: environment variables, ConfigMaps, Secrets, flags, and how values are parsed
  (units, defaults, validation)
- what telemetry it already emits, and in which language, so you know how to wire it up
- what external dependencies it needs to run at all (databases, brokers). Run those in the namespace too, as
  small in-cluster instances, or stub them. Never point a drill at a shared or real database.

### 3. Stand up the platform and the baseline

Follow [references/telemetry.md](references/telemetry.md) to make sure tinyo11y is running and to get the
app's traces, logs and metrics into it. Then:

1. Deploy the app, healthy, into the drill namespace with its own deployment method and a values or kustomize
   overlay for anything drill-specific (image tags, the OTLP endpoint, smaller sizes).
2. Add synthetic users with `scripts/traffic.bash apply <ns> <journeys.json>`. It runs the sre-crashout image
   (`ghcr.io/brandonapol/sre-crashout`, tag `main` by default). If the cluster can't pull it, build it from the
   sre-crashout repository (`make image`, then `make kind/load`, `k3s/load` or `k3d/load`) and pass `TAG=dev`. Describe the real user journeys
   in the JSON (see the script's header): browse, buy, search, whatever this app does, weighted like real
   traffic. The simulator's spans are what users experience; the incident is defined by them.
3. Let it run for at least 10 minutes, then record the baseline with `scripts/traffic.bash stats <ns>`: error
   ratio, p50 and p99 per journey. Check that the app's own telemetry shows up in tinyo11y. If the baseline
   isn't clean (errors above 1%, unstable latency), fix that first. A noisy baseline makes every drill
   ambiguous.

### 4. Design the fault

Pick a fault from [references/fault-catalog.md](references/fault-catalog.md) that fits the tier and this
app, or invent one in the same spirit. A good drill fault:

- **has a story**: a change someone would plausibly make for a good reason (a ticket, a cost saving, a
  cleanup, a security rotation). Write the deploy announcement first; if you can't write a believable one,
  pick another fault.
- **has one root cause** (hard drills may have two changes that are each harmless alone)
- **shows up for users**, or at least in something that pages (restarts, a stuck rollout)
- **is observable** with what the team will have: tinyo11y, kubectl, the repository
- **matches the tier** in how far the symptom is from the cause and how much the runbooks help
- **is deterministic**: it shows every time, within a known number of minutes

Prefer faults that live in config or manifests over code changes: they're easier to apply, revert and keep
hidden in plain sight. Use a code change when the lesson is about code (an unbounded cache, a missing timeout,
a retry loop) and the change can look like a normal feature or refactor.

| Tier | Symptom | Cause | Runbooks | Noise |
| ---- | ------- | ----- | -------- | ----- |
| **basic** | loud and immediate, may not affect users yet | one change; the error message names it | write one that covers it exactly | none |
| **easy** | loud, user-facing | one change, one or two hops from the alert | symptom-based triage only | at most one red herring |
| **medium** | indirect, delayed, or the obvious explanation is wrong | one change that looks correct | context, not answers | one red herring |
| **hard** | quiet, or compounding across services | far from the symptom, or two reasonable changes together | context, plus some advice that doesn't apply | several red herrings |

Red herrings are other changes in the same release that are visible and harmless (a noisy new warning, a
version bump of an unrelated service, a feature flag). Make them as plausible as the real change.

### 5. Inject, verify, calibrate

Apply the change as a release: a new Helm revision with a version bump, a kustomize overlay applied with
`kubectl apply -k`, or an image built from the drill branch. Then measure:

1. Watch `scripts/traffic.bash stats <ns>` and the relevant Kubernetes state until the symptom shows. Note how
   long it took.
2. Write down a verify condition as numbers (for example "checkout error ratio over 50%, browse under 1%", or
   "a pod in Pending") and check it holds.
3. Reset, wait for the baseline to come back, and check it's clean again.
4. Repeat. Two consecutive successful cycles is the minimum. A drill that only fires sometimes wastes a
   session.

Most first attempts need calibration. [references/calibration.md](references/calibration.md) lists the ways
drills fail to fire or fire too hard, from this repository's experience: connection pinning, cold starts,
stochastic collapse, overload that runs away, probes compounding the fault, CNIs that ignore NetworkPolicy,
noise from rollouts. Read it before your first injection, not after your third failure.

### 6. Write the answer key and the runbooks

Use [references/guide-template.md](references/guide-template.md). Include the numbers you measured, not the
ones you predicted. Then make the runbooks match the tier:

- **basic**: add a runbook to the app's repository (on the drill branch, or alongside the answer key for the
  facilitator to hand out) that covers this failure exactly, the way a team would after a past incident.
- **easy**: a symptom-based triage runbook (high error rate, pods restarting) is enough. Reuse sre-crashout's
  `runbooks/` if the app has none.
- **medium and hard**: don't add anything that points at the cause. If the app already has runbooks, leave
  them; if one would give the answer away, tell the facilitator to withhold it.

### 7. Hand off

Reset to the baseline unless the user wants the incident left running. Then report back:

- the namespace, how to trigger the incident and how to reset it (exact commands)
- where the answer key is
- what you verified, with the numbers from each cycle, and what you couldn't verify (and why)
- anything the facilitator must do before the session (a preflight, a warm-up period, a cluster requirement)

Don't describe a drill as working unless you saw it work. "Verified on kind, twice" and "not verified: this
cluster's CNI doesn't enforce NetworkPolicy" are both useful; "should work" isn't.
