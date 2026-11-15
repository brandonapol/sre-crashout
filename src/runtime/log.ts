import { logs, SeverityNumber, trace } from "@opentelemetry/api";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | undefined>;

const severities: Record<Level, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

const order: Level[] = ["debug", "info", "warn", "error"];

const threshold = order.indexOf((process.env.LOG_LEVEL ?? "info") as Level);

const defined = (fields: Fields) =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean>;

const emit = (scope: string) => (level: Level) => (message: string, fields: Fields = {}) => {
  if (order.indexOf(level) < threshold) return;
  const attributes = defined(fields);
  const span = trace.getActiveSpan()?.spanContext();
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      logger: scope,
      msg: message,
      ...attributes,
      ...(span ? { trace_id: span.traceId, span_id: span.spanId } : {}),
    }) + "\n",
  );
  logs.getLogger(scope).emit({
    severityNumber: severities[level],
    severityText: level.toUpperCase(),
    body: message,
    attributes,
  });
};

export const logger = (scope: string) => {
  const at = emit(scope);
  return { debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
};

export type Logger = ReturnType<typeof logger>;
