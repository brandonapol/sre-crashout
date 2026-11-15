import { serve, route, json } from "../../../../src/runtime/http";
import { call } from "../../../../src/runtime/client";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { range, intBetween, logNormal, sleep } from "../../../../src/runtime/random";

const log = logger("web");

const config = {
  quotesUrl: env.string("QUOTES_URL", "http://quotes:8080"),
  quotesTimeoutMs: env.duration("QUOTES_TIMEOUT", "1500ms"),
  quotesAttempts: env.number("QUOTES_ATTEMPTS", 2),
  maxInFlight: env.number("MAX_IN_FLIGHT", 64),
  promoBanner: env.flag("PROMO_BANNER", false),
  promoServiceUrl: env.string("PROMO_SERVICE_URL", ""),
  promoTimeoutMs: env.duration("PROMO_TIMEOUT", "1s"),
};

const featured = range(12).map((i) => ({ sku: `Q-${String(2000 + i * 17)}`, title: `Featured bundle ${i + 1}` }));

const banner = async () => {
  if (!config.promoBanner) return undefined;
  if (!config.promoServiceUrl) {
    log.error("promo banner enabled but PROMO_SERVICE_URL is not configured; rendering without banner");
    return undefined;
  }
  const res = await call<{ text: string }>(`${config.promoServiceUrl}/v1/banner`, { timeoutMs: config.promoTimeoutMs });
  return res.ok ? res.body : undefined;
};

const parseCart = (raw: string | null) =>
  (raw ?? "")
    .split(",")
    .filter(Boolean)
    .map((entry) => {
      const [sku, qty] = entry.split(":");
      return { sku: sku ?? "", quantity: Number(qty ?? 1) || 1 };
    });

serve({
  maxInFlight: config.maxInFlight,
  routes: [
    route("GET", "/featured", async () => {
      await sleep(logNormal(6, 0.4));
      return json(200, { banner: await banner(), items: featured });
    }),
    route("GET", "/quote", async (req) => {
      const lines = parseCart(req.query.get("cart"));
      if (lines.length === 0) return json(400, { error: "empty_cart" });
      const region = req.query.get("region") ?? "us";
      const res = await call<{ totalMinor: number }>(`${config.quotesUrl}/v1/quotes`, {
        method: "POST",
        body: { region, lines },
        timeoutMs: config.quotesTimeoutMs,
        attempts: config.quotesAttempts,
      });
      if (!res.ok) {
        log.warn("quote request failed", { region, lines: lines.length, status: res.status, error: res.error, attempts: res.attempts });
        return json(502, { error: "quote_unavailable" });
      }
      return json(200, { banner: await banner(), quote: res.body, itemCount: lines.length, cartToken: intBetween(1e8, 9e8) });
    }),
  ],
});
