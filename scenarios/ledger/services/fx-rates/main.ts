import { serve, route, json } from "../../../../src/runtime/http";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { between, chance, logNormal, sleep } from "../../../../src/runtime/random";

const log = logger("fx-rates");

const config = {
  refreshEveryMs: env.duration("FEED_REFRESH_INTERVAL", "15s"),
  feedTimeoutMs: env.duration("FEED_TIMEOUT", "2s"),
  feedMedianMs: env.duration("FEED_MEDIAN_LATENCY", "250ms"),
};

const usdBase: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.37, JPY: 151.2, AUD: 1.52 };

const state = { rates: { ...usdBase }, fetchedAt: Date.now(), source: "feed" as "feed" | "last-known" };

const fetchFeed = async () => {
  const latency = logNormal(config.feedMedianMs, 0.9);
  await sleep(Math.min(latency, config.feedTimeoutMs));
  if (latency > config.feedTimeoutMs) throw new Error(`feed timed out after ${config.feedTimeoutMs}ms`);
  return Object.fromEntries(Object.entries(usdBase).map(([ccy, rate]) => [ccy, rate * between(0.998, 1.002)]));
};

const refresh = () =>
  fetchFeed()
    .then((rates) => {
      state.rates = rates;
      state.fetchedAt = Date.now();
      state.source = "feed";
    })
    .catch((err: unknown) => {
      state.source = "last-known";
      log.warn("fx feed refresh failed; serving last known rates", {
        error: err instanceof Error ? err.message : String(err),
        age_seconds: Math.round((Date.now() - state.fetchedAt) / 1000),
      });
    });

setInterval(refresh, config.refreshEveryMs).unref();

serve({
  routes: [
    route("GET", "/v1/rates/:from/:to", async (req) => {
      await sleep(logNormal(4, 0.5));
      const from = state.rates[req.params.from ?? ""];
      const to = state.rates[req.params.to ?? ""];
      if (from === undefined || to === undefined) return json(404, { error: "unknown_currency" });
      if (chance(0.0005)) return json(503, { error: "rate_unavailable" });
      return json(200, { rate: Number((to / from).toFixed(6)), source: state.source, asOf: new Date(state.fetchedAt).toISOString() });
    }),
  ],
});
