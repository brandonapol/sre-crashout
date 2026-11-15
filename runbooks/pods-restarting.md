# Pods restarting

Alerts: restart count increasing, `KubePodCrashLooping`, a container in `CrashLoopBackOff`.

## Find out why the last container exited

```sh
kubectl -n <ns> get pods
kubectl -n <ns> describe pod <pod>          # Last State: Terminated, Reason, Exit Code; Events at the bottom
kubectl -n <ns> logs <pod> --previous        # the logs of the container that died
```

| Last state | Usually means | Look at |
| ---------- | ------------- | ------- |
| `Error`, exit code 1 | the process exited by itself: a crash, often on startup | `logs --previous`: the last lines usually say why |
| `OOMKilled`, exit code 137 | the container exceeded its memory limit and the kernel killed it | memory over time: a steady climb (something grows) or an immediate spike (startup needs more) |
| `Completed`, exit code 0 | the process exited cleanly when it shouldn't have | logs, and what sends it a signal |
| killed after `Liveness probe failed` in Events | the kubelet killed a container it thought was stuck | whether the app is really stuck, or the probe is wrong (path, port, timeout) |

## If it's a new pod from a rollout

If only pods from the newest ReplicaSet are failing and the old ones are fine, the rollout is stuck. Users
usually aren't affected yet, because the old pods still serve. Check [What changed?](what-changed.md) and
consider [rolling back](mitigation.md) before the old pods are ever replaced.

## If it's OOMKilled

Raising the memory limit is a mitigation, not a diagnosis. Before you do it, decide whether memory plateaus
(the limit is too low) or keeps climbing (something leaks, and a higher limit only buys time). Note how long
it takes from start to kill.
