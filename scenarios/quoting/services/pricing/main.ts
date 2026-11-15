import { metrics } from "@opentelemetry/api";
import { serve, route, json } from "../../../../src/runtime/http";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { createPool, isPoolExhausted } from "../../../../src/runtime/pool";
import { createCache } from "./cache";
import { computePrice, priceOf, Price } from "./rate-engine";
import { regions, skus } from "../catalog";

const log = logger("pricing");
const meter = metrics.getMeter("pricing");

const config = {
  cacheTtlMs: env.duration("PRICE_CACHE_TTL", "5m"),
  enginePoolSize: env.number("RATE_ENGINE_POOL_SIZE", 4),
  engineQueueLimit: env.number("RATE_ENGINE_QUEUE_LIMIT", 2000),
  engineMedianMs: env.duration("RATE_ENGINE_MEDIAN_LATENCY", "45ms"),
  snapshotSize: env.number("PRICE_SNAPSHOT_SKUS", 600),
};

const cache = createCache<Price>(config.cacheTtlMs);
const engine = createPool(config.enginePoolSize, config.engineQueueLimit);

const lookups = meter.createCounter("pricing.cache.lookups", { description: "Price cache lookups by result" });
meter
  .createObservableGauge("pricing.rate_engine.connections", { description: "Rate engine connections in use" })
  .addCallback((r) => r.observe(engine.stats().active));
meter
  .createObservableGauge("pricing.rate_engine.waiting", { description: "Requests waiting for a rate engine connection" })
  .addCallback((r) => r.observe(engine.stats().queued));

const state = { lastSaturationLog: 0 };

skus(config.snapshotSize).forEach((sku) => regions.forEach((region) => cache.set(`${region}:${sku}`, priceOf(sku, region))));
log.info("price cache warmed from snapshot", { entries: cache.size() });

const warnSaturated = () => {
  if (Date.now() - state.lastSaturationLog < 5000) return;
  state.lastSaturationLog = Date.now();
  log.warn("rate engine connection pool exhausted", { ...engine.stats() });
};

serve({
  routes: [
    route("GET", "/v1/prices/:sku", async (req) => {
      const sku = req.params.sku ?? "";
      const region = req.query.get("region") ?? "us";
      const key = `${region}:${sku}`;
      const cached = cache.get(key);
      if (cached) {
        lookups.add(1, { result: "hit" });
        return json(200, cached);
      }
      lookups.add(1, { result: "miss" });
      try {
        const price = await engine.run(() => computePrice(sku, region, config.engineMedianMs));
        cache.set(key, price);
        return json(200, price);
      } catch (err) {
        if (isPoolExhausted(err)) {
          warnSaturated();
          return json(503, { error: "rate_engine_busy" });
        }
        throw err;
      }
    }),
  ],
});
