import { serve, route, json, Request } from "../../../../src/runtime/http";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { logNormal, sleep, uuid, range } from "../../../../src/runtime/random";

const log = logger("inventory");

const apiToken = env.string("INVENTORY_API_TOKEN");

const authorized = (req: Request) => req.headers.authorization === `Bearer ${apiToken}`;

const stock = new Map<string, number>(range(240).map((i) => [`SKU-${String(10000 + i)}`, 5000]));

type Line = { sku: string; quantity: number };

const isLines = (body: unknown): body is { orderId: string; lines: Line[] } => {
  const b = body as { orderId?: unknown; lines?: unknown } | undefined;
  return typeof b?.orderId === "string" && Array.isArray(b.lines) && b.lines.every((l: Line) => typeof l?.sku === "string" && typeof l?.quantity === "number");
};

const restock = () => stock.forEach((qty, sku) => stock.set(sku, Math.max(qty, 5000)));
setInterval(restock, 60_000).unref();

serve({
  routes: [
    route("POST", "/v1/reservations", async (req) => {
      if (!authorized(req)) {
        log.warn("reservation rejected: invalid credentials", { client: String(req.headers["user-agent"] ?? "unknown") });
        return json(401, { error: "unauthorized" });
      }
      if (!isLines(req.body)) return json(422, { error: "invalid_reservation" });
      await sleep(logNormal(18, 0.5));
      const short = req.body.lines.filter((l) => (stock.get(l.sku) ?? 0) < l.quantity);
      if (short.length > 0) {
        log.info("reservation rejected: insufficient stock", { order_id: req.body.orderId, skus: short.map((l) => l.sku).join(",") });
        return json(409, { error: "insufficient_stock", skus: short.map((l) => l.sku) });
      }
      req.body.lines.forEach((l) => stock.set(l.sku, (stock.get(l.sku) ?? 0) - l.quantity));
      return json(201, { reservationId: `rsv_${uuid()}`, orderId: req.body.orderId, expiresInSeconds: 900 });
    }),
    route("GET", "/v1/stock/:sku", async (req) => {
      await sleep(logNormal(3, 0.3));
      const qty = stock.get(req.params.sku ?? "");
      return qty === undefined ? json(404, { error: "unknown_sku" }) : json(200, { sku: req.params.sku, available: qty });
    }),
  ],
});
