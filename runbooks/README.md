# Runbooks

Platform runbooks: how we run things, whatever the service. Each product also keeps its own runbooks next to
its code, in `scenarios/<product>/runbooks/`, for the alerts it owns.

A runbook is a starting point, not a script. It was written after a past incident and covers what we knew
then. If what you see doesn't match it, trust what you see, and fix the runbook afterwards.

| Runbook | Use it when |
| ------- | ----------- |
| [First five minutes](first-five-minutes.md) | you've just been paged, whatever for |
| [What changed?](what-changed.md) | you need to know what was deployed or reconfigured, and when |
| [Pods restarting](pods-restarting.md) | `CrashLoopBackOff`, `OOMKilled`, restarts climbing, liveness failures |
| [Pods pending](pods-pending.md) | a rollout won't finish, or pods sit in `Pending` |
| [Elevated error rate](error-rate.md) | a service or a user journey is failing more than usual |
| [Elevated latency](latency.md) | requests are slower than usual, with or without errors |
| [Rolling back and other levers](mitigation.md) | you know enough to stop the bleeding |
| [Finding things in tinyo11y](tinyo11y.md) | you need a trace, a log line, a metric or a Kubernetes event |

## Severity

| Sev | Meaning | Expectation |
| --- | ------- | ----------- |
| P1 | a user journey is down or mostly failing | all hands, status updates every 15 minutes |
| P2 | a journey is degraded for many users, or failing for some | on-call plus one, updates every 30 minutes |
| P3 | no user impact yet, but there will be if nobody acts | on-call, during working hours if it can wait |

Severity is about impact, not cause. Re-grade as you learn more, and say so in the channel.
