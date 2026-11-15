import { startNodeSdk } from "@opentelemetry/sdk-node";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";

const ignoredPaths = new Set(["/healthz", "/stats"]);

const sdk = startNodeSdk({
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 10000),
    }),
  ],
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (req) => ignoredPaths.has((req.url ?? "").split("?")[0] ?? ""),
    }),
    new UndiciInstrumentation(),
    new RuntimeNodeInstrumentation({ monitoringPrecision: 5000 }),
  ],
});

const drainMs = Number(process.env.SHUTDOWN_DRAIN_MS ?? 5000);

const shutdown = () => {
  setTimeout(() => {
    sdk.shutdown().finally(() => process.exit(0));
  }, drainMs);
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
