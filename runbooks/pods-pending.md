# Pods pending

Alerts: a rollout not progressing, a Deployment with fewer available replicas than desired, pods in `Pending`.

```sh
kubectl -n <ns> get pods --field-selector=status.phase=Pending
kubectl -n <ns> describe pod <pod>         # the Events at the bottom say why it can't be scheduled
kubectl -n <ns> rollout status deploy/<name>
```

| Event | Means | Usually |
| ----- | ----- | ------- |
| `FailedScheduling ... Insufficient cpu` / `memory` | no node has that much unrequested capacity | the pod's requests are larger than intended (check the units: `400` CPU is 400 cores, `400m` is 0.4 of a core), or the cluster is full |
| `FailedScheduling ... didn't match Pod's node affinity/selector` | the pod asks for nodes that don't exist | a nodeSelector, affinity or toleration in the new spec |
| `FailedScheduling ... persistentvolumeclaim ... not found / unbound` | storage isn't ready | the PVC or StorageClass |
| `ImagePullBackOff` / `ErrImagePull` (not Pending, but similar) | the image can't be pulled | the image tag, and registry credentials |

```sh
kubectl get nodes
kubectl describe node <node> | sed -n '/Allocated resources/,/Events/p'
```

During a rolling update the old pods keep serving until the new ones are Ready, so a stuck rollout is often
invisible to users. It's still urgent: the next node drain or scale-down can take the old pods away. Fix the
spec, or [roll back](mitigation.md).
