# What changed?

Every product is a Helm release in its own namespace, named after the product.

## Deploys

```sh
helm -n <product> history <product>                       # every revision, when, and its release number
helm -n <product> get values <product> --revision <n>      # the values of revision n
diff <(helm -n <product> get values <product> --revision <n-1> -o yaml) \
     <(helm -n <product> get values <product> --revision <n> -o yaml)
helm -n <product> get manifest <product> --revision <n>    # everything that revision applied
```

A values diff only shows what the release said. It doesn't tell you which objects actually changed or
restarted. For that:

```sh
kubectl -n <product> rollout history deploy/<name>
kubectl -n <product> get rs -o wide                         # which ReplicaSets exist, their ages and images
kubectl -n <product> get pods -o wide                       # ages: who restarted, who is new
```

## Configuration that isn't in a Deployment

Secrets, ConfigMaps and NetworkPolicies change without a pod template changing, so a rollout history won't
show them:

```sh
kubectl -n <product> get secret,configmap,networkpolicy
kubectl -n <product> get events --sort-by=.lastTimestamp
```

## Things that don't show up here

Traffic patterns, other teams' services, the cluster itself (nodes, CNI, DNS) and the telemetry pipeline. If
nothing in the namespace changed, widen the search.
