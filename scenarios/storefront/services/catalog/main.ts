import { serve, route, json } from "../../../../src/runtime/http";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { chance, logNormal, sleep, pick } from "../../../../src/runtime/random";
import { products, bySku } from "./products";

const log = logger("catalog");

const config = {
  pageSize: env.number("PAGE_SIZE", 24),
  recommendations: env.flag("RECOMMENDATIONS", false),
  recommendationsModel: env.string("RECOMMENDATIONS_MODEL", "co-view-2026-10"),
};

const recommend = (sku: string) => {
  if (!config.recommendations) return [];
  if (chance(0.4)) {
    log.warn("recommendations model features stale; falling back to category bestsellers", { sku, model: config.recommendationsModel });
  }
  return [pick(products).sku, pick(products).sku, pick(products).sku];
};

serve({
  routes: [
    route("GET", "/v1/products", async (req) => {
      await sleep(logNormal(8, 0.4));
      const page = Math.max(0, Number(req.query.get("page") ?? 0));
      const items = products.slice(page * config.pageSize, (page + 1) * config.pageSize);
      return json(200, { page, items });
    }),
    route("GET", "/v1/products/:sku", async (req) => {
      await sleep(logNormal(5, 0.4));
      const product = bySku.get(req.params.sku ?? "");
      return product ? json(200, { ...product, recommended: recommend(product.sku) }) : json(404, { error: "unknown_sku" });
    }),
  ],
});
