# tinyo11y and telemetry

## Is tinyo11y running?

```sh
kubectl get svc -A | grep otel-collector        # usually observability/otel-collector, ports 4317 and 4318
kubectl get pods -n observability
```

If it is, note the collector's address: the OTLP endpoint is
`http://otel-collector.<namespace>.svc.cluster.local:4317` (gRPC) or `:4318` (HTTP).

If it isn't, install it from its repository
([benhastings/clickhouse-observability-stack](https://github.com/benhastings/clickhouse-observability-stack))
by following its README rather than improvising:

- a laptop or a throwaway kind cluster: `make dev/up` (no Argo CD) or `make cluster/up` (Argo CD)
- a shared dev cluster where you can only use one namespace: its `restricted` profile, which needs nothing
  cluster-scoped
- any other cluster: `make helm/install ENV=<env>` or `make cluster/bootstrap ENV=<env>`

Installing tinyo11y is a bigger change than the drill itself; ask before installing it into a cluster other
people use.

## Getting the app's telemetry in

The drill needs, at minimum, traces from the services involved. Logs and metrics make it better. In order of
preference:

1. **The app already uses OpenTelemetry.** Set `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`,
   `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` (at least `service.namespace=<drill namespace>`,
   `service.version=<release>`, `k8s.pod.name` from the downward API) in the overlay.
2. **Zero-code instrumentation for its language**, added in the overlay, not in the repository:
   - Node.js: install `@opentelemetry/auto-instrumentations-node` in the image and set
     `NODE_OPTIONS=--require @opentelemetry/auto-instrumentations-node/register`
   - Java: mount the OpenTelemetry Java agent and set `JAVA_TOOL_OPTIONS=-javaagent:/otel/opentelemetry-javaagent.jar`
   - Python: `opentelemetry-distro` and `opentelemetry-exporter-otlp` in the image, and start the app under
     `opentelemetry-instrument`
   - .NET: the OpenTelemetry .NET automatic instrumentation
   - Go: there's no runtime agent; add the SDK in code (on the drill branch), or rely on the options below
   - If the OpenTelemetry Operator is installed, an `Instrumentation` resource and a pod annotation do the
     above for you.
3. **Nothing in the app.** Still workable for many faults: tinyo11y's collector reads every pod's CPU, memory,
   restarts and Kubernetes events, and the synthetic users (`drill-users`) send their own traces. Pick a fault
   whose evidence lives there (restarts, Pending, OOMKilled, probe failures, latency seen by users), and say in
   the guide that service-level traces aren't available.

Check it worked before going further: open Grafana's Traces Drilldown, filter on `service.namespace`, and
find a trace that goes from `drill-users` into the app. If the trace stops at `drill-users`, context isn't
being propagated (the app needs to read the `traceparent` header), and the team will have to correlate by
time instead. Note that in the guide.

## Where things show up

tinyo11y's own README and the sre-crashout `runbooks/tinyo11y.md` describe the dashboards and queries. The
ones a guide usually points at:

- **Span metrics (RED)** dashboard: rate, errors and latency per service, a service graph, and per pod CPU,
  memory, restarts and termination reasons, with Kubernetes events as annotations
- **Traces, Logs and Metrics Drilldown**, filtered on `service.namespace`
- Kubernetes events as logs: `{service_name="kubernetes-events"} | k8s_object_name=~"<pod prefix>.*"`
