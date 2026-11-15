import { trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { serve, route, json } from "./http";
import { logger } from "./log";
import { env } from "./config";

export type Outcome = { ok: boolean; status?: number; error?: string };

export type Journey = { name: string; weight: number; run: () => Promise<Outcome> };

type Sample = { at: number; journey: string; ok: boolean; ms: number };

const percentile = (sorted: number[], p: number) =>
  sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0);

const summarize = (samples: Sample[]) => {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const errors = samples.filter((s) => !s.ok).length;
  return {
    requests: samples.length,
    errors,
    errorRatio: samples.length === 0 ? 0 : Number((errors / samples.length).toFixed(4)),
    p50Ms: Math.round(percentile(ms, 50)),
    p95Ms: Math.round(percentile(ms, 95)),
    p99Ms: Math.round(percentile(ms, 99)),
  };
};

const chooser = (journeys: Journey[]) => {
  const total = journeys.reduce((sum, j) => sum + j.weight, 0);
  return () => {
    const target = Math.random() * total;
    const found = journeys.reduce<{ acc: number; pick?: Journey }>(
      (state, j) => (state.pick ? state : state.acc + j.weight >= target ? { acc: state.acc, pick: j } : { acc: state.acc + j.weight }),
      { acc: 0 },
    );
    return found.pick ?? (journeys[journeys.length - 1] as Journey);
  };
};

export const runTraffic = (journeys: Journey[]) => {
  const log = logger("traffic");
  const rate = env.number("TRAFFIC_RATE", 10);
  const windowMs = env.duration("TRAFFIC_STATS_WINDOW", "60s");
  const tracer = trace.getTracer("traffic");
  const choose = chooser(journeys);
  const samples: Sample[] = [];

  const record = (sample: Sample) => {
    samples.push(sample);
    const cutoff = Date.now() - windowMs;
    while (samples.length > 0 && (samples[0]?.at ?? 0) < cutoff) samples.shift();
  };

  const fire = () => {
    const journey = choose();
    const started = performance.now();
    tracer.startActiveSpan(journey.name, { kind: SpanKind.INTERNAL }, (span) => {
      journey
        .run()
        .catch((err: unknown): Outcome => ({ ok: false, error: err instanceof Error ? err.message : String(err) }))
        .then((outcome) => {
          const ms = performance.now() - started;
          if (!outcome.ok) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: outcome.error ?? `http ${outcome.status}` });
            log.debug("journey failed", { journey: journey.name, status: outcome.status, error: outcome.error });
          }
          span.end();
          record({ at: Date.now(), journey: journey.name, ok: outcome.ok, ms });
        });
    });
  };

  const schedule = () => {
    const gap = -Math.log(1 - Math.random()) * (1000 / rate);
    setTimeout(() => {
      fire();
      schedule();
    }, gap);
  };

  serve({
    routes: [
      route("GET", "/stats", () => {
        const names = [...new Set(samples.map((s) => s.journey))].sort();
        return json(200, {
          windowSeconds: windowMs / 1000,
          overall: summarize(samples),
          journeys: Object.fromEntries(names.map((n) => [n, summarize(samples.filter((s) => s.journey === n))])),
        });
      }),
    ],
  });

  log.info("traffic started", { rate, journeys: journeys.map((j) => j.name).join(",") });
  setTimeout(schedule, env.duration("TRAFFIC_WARMUP", "10s"));
};
