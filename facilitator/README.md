# Facilitator guide

Everything in this folder is the answer key: the incident releases and a guide per drill. Participants
should only see `scenarios/<product>/`, `runbooks/`, Grafana and the cluster. If your team can read this
repository, keep this folder in a private repository and point `DRILLS_DIR` at its `drills/` folder.

## Tiers

Every product has a drill at each of four tiers. The tiers differ in how far the symptom is from the cause,
how much the runbooks help, and how much noise there is.

| Tier | Symptom | Cause | Runbooks | Noise | What it trains |
| ---- | ------- | ----- | -------- | ----- | -------------- |
| **basic** | loud and immediate, often no user impact yet | one change; the error message names it | a runbook covers it exactly | none | the process: ack, comms, finding logs, rolling back |
| **easy** | loud, user-facing | one change; logs or events point at it, one or two hops from the alert | symptom-based triage only | at most one | following an error from the user to its cause |
| **medium** | indirect, delayed, or the obvious explanation is wrong | one change that looks correct | context, not answers | one red herring | correlating signals; asking why a correct change broke |
| **hard** | quiet, or compounding across services | far from the symptom, or two changes that are each reasonable | context, and some advice that doesn't apply | several red herrings | system dynamics: saturation, amplification, hidden fallbacks |

| Product | basic | easy | medium | hard |
| ------- | ----- | ---- | ------ | ---- |
| `ledger` | [config typo crash loop](drills/ledger/basic.md) | [renamed dependency](drills/ledger/easy.md) | [slow leak to OOMKill](drills/ledger/medium.md) | [throttled](drills/ledger/hard.md) |
| `storefront` | [missing CPU unit](drills/storefront/basic.md) | [health check that kills](drills/storefront/easy.md) | [rotated secret](drills/storefront/medium.md) | [quiet dependency](drills/storefront/hard.md) |
| `quoting` | [wrong port](drills/quoting/basic.md) | [extra path segment](drills/quoting/easy.md) | [new dependency, shed load](drills/quoting/medium.md) | [retry storm](drills/quoting/hard.md) |

A sensible progression is one tier per week, rotating products, so nobody meets the same product twice in a
row. Each drill's release starts from the same healthy baseline, so drills don't depend on each other.

## Format

Each drill is a Wheel of Misfortune session (Site Reliability Engineering, chapter 28) run on a live system
instead of on paper.

1. **Before the session**: `make drill/start P=<product>`, then let it run healthy for at least 15 minutes so
   every graph has a normal to compare against. `make drill/verify P=<product> EXPECT=healthy` confirms it.
2. **Announce**: each guide has a deploy announcement. Post it where your team sees deploys, at the time the
   guide says. At harder tiers it comes early, or somewhere easy to miss, as real ones do.
3. **Trigger**: `make drill/incident P=<product> TIER=<tier>`. `make drill/verify P=<product> EXPECT=<tier>`
   tells you the symptom is live. Some drills take minutes to show. Start the clock at the page, not the
   deploy.
4. **Page**: hand the on-call the page text from the guide. One person drives; others suggest, but only the
   driver touches the cluster. At medium and hard, rotate the driver every 15 minutes.
5. **Hints**: hold back. Give the next hint from the ladder only when the group has been stuck for about ten
   minutes. Note how many hints were needed.
6. **End**: when the user-facing symptom is gone and the group can explain the causal chain. A mitigation
   without an explanation is not an end.
7. **Debrief** (20 minutes): the guide's discussion questions, then a short blameless postmortem in your usual
   template. Ask which runbook helped, which misled, and what the group would add to it. Then add it: the
   runbooks should get better every week, like real ones.
8. **Reset**: `make drill/reset P=<product>` puts the baseline back; `make drill/stop P=<product>` removes it.

Score nothing. Note time to detect, to mitigate and to explain, and the hints used, and compare the same team
across weeks.

## Before the first session

- tinyo11y runs in the cluster and its collector is at `otel-collector.observability:4317` (override with
  `OTLP_ENDPOINT`).
- The image is pullable: the published `ghcr.io/brandonapol/sre-crashout` tag, or a local build loaded with
  `make image kind/load`, `make image k3s/load` or `make image k3d/load`.
- `storefront`'s hard drill needs a CNI that enforces NetworkPolicy. k3s does by default. Run
  `make drill/start P=storefront` and then `make drill/preflight P=storefront TIER=hard` once per cluster.
- Every guide's "Run it" section ends with the commands to verify and reset. `scripts/drill.bash verify` is
  what the guide's timings were measured with.
