# Rolling back and other levers

Mitigate first when a safe lever exists, and tell the channel what you're doing before you do it.

| Lever | Command | Use when | Watch out |
| ----- | ------- | -------- | --------- |
| Roll back the release | `helm -n <p> rollback <p> <revision>` | a deploy lines up with the start | it reverts everything in the release, Secrets included |
| Roll back one Deployment | `kubectl -n <p> rollout undo deploy/<name>` | one workload is bad and the rest is fine | Helm doesn't know; the next release reapplies the bad spec |
| Scale a canary away | `kubectl -n <p> scale deploy/<name>-canary --replicas=0` | the canary is the bad part | as above |
| Restart | `kubectl -n <p> rollout restart deploy/<name>` | processes hold stale state (config read at startup, a stuck pool) | it resets symptoms you may still need to look at, so capture first |
| Change one setting | `helm -n <p> upgrade <p> <chart> --reuse-values --set ...` | you know exactly which value is wrong | record it; the repository is now out of date |

After any lever: confirm the user-facing journey recovered (not just the service you touched), and write down
the time. That's the end of impact, for the postmortem.

A mitigation isn't a fix. Before closing, make sure someone owns the change that stops it happening again.
