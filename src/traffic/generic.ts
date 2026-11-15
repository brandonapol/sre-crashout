import { runTraffic, Journey, Outcome } from "../runtime/traffic";
import { call } from "../runtime/client";
import { env } from "../runtime/config";
import { uuid } from "../runtime/random";

type Spec = {
  name: string;
  url: string;
  method?: string;
  weight?: number;
  body?: unknown;
  headers?: Record<string, string>;
  expect?: number[];
};

const timeoutMs = env.duration("CLIENT_TIMEOUT", "10s");

const fill = (value: unknown): unknown =>
  typeof value === "string"
    ? value.replaceAll("{{uuid}}", uuid()).replaceAll("{{n}}", String(Math.floor(Math.random() * 1000)))
    : Array.isArray(value)
      ? value.map(fill)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]))
        : value;

const parse = (raw: string): Spec[] => {
  const specs = JSON.parse(raw) as Spec[];
  if (!Array.isArray(specs) || specs.length === 0) throw new Error("TRAFFIC_JOURNEYS must be a non-empty JSON array");
  specs.forEach((s) => {
    if (typeof s.name !== "string" || typeof s.url !== "string") throw new Error(`journey needs a name and a url: ${JSON.stringify(s)}`);
  });
  return specs;
};

const journey = (spec: Spec): Journey => ({
  name: spec.name,
  weight: spec.weight ?? 1,
  run: async (): Promise<Outcome> => {
    const res = await call(fill(spec.url) as string, {
      method: spec.method ?? "GET",
      body: spec.body === undefined ? undefined : fill(spec.body),
      headers: fill(spec.headers ?? {}) as Record<string, string>,
      timeoutMs,
      retryOn: () => false,
    });
    const status = res.status;
    const ok = spec.expect ? status !== undefined && spec.expect.includes(status) : res.ok;
    return { ok, status, error: ok ? undefined : res.ok ? `unexpected status ${status}` : res.error };
  },
});

runTraffic(parse(env.string("TRAFFIC_JOURNEYS")).map(journey));
