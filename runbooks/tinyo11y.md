# Finding things in tinyo11y

Every service sends traces, logs and metrics over OTLP to the cluster's collector, and tinyo11y stores them in
ClickHouse. Grafana reads them through Cerberus with PromQL, LogQL and TraceQL. Resource attributes on
everything: `service.name`, `service.namespace` (the product), `service.version`, `k8s.pod.name`,
`k8s.deployment.name`.

Where to start:

- **Dashboards → Cerberus → Span metrics (RED)**: request rate, errors and latency per service, a service
  graph, error logs, and at the bottom **Resources**: each pod's CPU against requests, memory against
  requests and limits, restarts and the last termination reason. Kubernetes events (probe failures, OOM
  kills, scheduling) are annotations on every chart.
- **Dashboards → Cerberus → Kubernetes**: nodes, pods, restarts, readiness.
- **Drilldown → Traces / Logs / Metrics**: explore without writing queries. Filter on `service.namespace` to
  stay inside one product.
- **Explore**: write queries directly.

Useful starting queries in Explore:

```text
TraceQL   { resource.service.namespace = "ledger" && status = error }
TraceQL   { resource.service.name = "checkout" && duration > 2s }
LogQL     {service_name="inventory"} |= "rejected"
LogQL     {service_name="pricing"} | detected_level=~"warn|error"
LogQL     {service_name="kubernetes-events"} | k8s_object_name=~"ledger-api.*"
```

Kubernetes events are stored as logs too, under the service name `kubernetes-events`, with the object's
namespace and name as attributes (`k8s_object_namespace`, `k8s_object_name`).

The synthetic traffic services (`partner-sim`, `shopper-sim`, `browser-sim`) are your users. Their spans and
errors are the user experience. Measure impact there.
