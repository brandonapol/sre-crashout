import { serve, route, json, Request } from "../../../../src/runtime/http";
import { call } from "../../../../src/runtime/client";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { uuid } from "../../../../src/runtime/random";

const log = logger("checkout");

const config = {
  catalogUrl: env.string("CATALOG_URL", "http://catalog:8080"),
  inventoryUrl: env.string("INVENTORY_URL", "http://inventory:8080"),
  catalogTimeoutMs: env.duration("CATALOG_TIMEOUT", "1s"),
  inventoryTimeoutMs: env.duration("INVENTORY_TIMEOUT", "2s"),
  inventoryAttempts: env.number("INVENTORY_ATTEMPTS", 3),
  softReservations: env.flag("SOFT_RESERVATIONS", true),
  inventoryToken: env.string("INVENTORY_API_TOKEN"),
};

type Line = { sku: string; quantity: number };
type Product = { sku: string; priceMinor: number; currency: string };

const isOrder = (body: unknown): body is { customerId: string; lines: Line[] } => {
  const b = body as { customerId?: unknown; lines?: unknown } | undefined;
  return typeof b?.customerId === "string" && Array.isArray(b.lines) && b.lines.length > 0;
};

const price = async (lines: Line[]) => {
  const results = await Promise.all(
    lines.map((l) => call<Product>(`${config.catalogUrl}/v1/products/${encodeURIComponent(l.sku)}`, { timeoutMs: config.catalogTimeoutMs, attempts: 2 })),
  );
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) return { ok: false as const, error: failed.error, status: failed.status };
  const totalMinor = results.reduce((sum, r, i) => sum + (r.ok ? r.body.priceMinor * (lines[i]?.quantity ?? 0) : 0), 0);
  return { ok: true as const, totalMinor };
};

const reserve = (orderId: string, lines: Line[]) =>
  call<{ reservationId: string }>(`${config.inventoryUrl}/v1/reservations`, {
    method: "POST",
    body: { orderId, lines },
    headers: { authorization: `Bearer ${config.inventoryToken}` },
    timeoutMs: config.inventoryTimeoutMs,
    attempts: config.inventoryAttempts,
  });

const placeOrder = async (req: Request) => {
  if (!isOrder(req.body)) return json(422, { error: "invalid_order" });
  const orderId = `ord_${uuid()}`;
  const priced = await price(req.body.lines);
  if (!priced.ok) {
    log.error("pricing failed", { order_id: orderId, error: priced.error });
    return json(502, { error: "pricing_unavailable" });
  }
  const reservation = await reserve(orderId, req.body.lines);
  if (reservation.ok) {
    return json(201, { orderId, totalMinor: priced.totalMinor, currency: "USD", reservationId: reservation.body.reservationId, fulfillment: "reserved" });
  }
  if (reservation.status === 409) return json(409, { error: "insufficient_stock" });
  if (reservation.status !== undefined && reservation.status < 500) {
    log.error("reservation failed", { order_id: orderId, status: reservation.status, error: reservation.error });
    return json(502, { error: "reservation_failed" });
  }
  if (!config.softReservations) {
    log.error("reservation failed", { order_id: orderId, error: reservation.error, attempts: reservation.attempts });
    return json(503, { error: "inventory_unavailable" });
  }
  log.info("reservation deferred to fulfilment reconciliation", { order_id: orderId, error: reservation.error, attempts: reservation.attempts });
  return json(201, { orderId, totalMinor: priced.totalMinor, currency: "USD", reservationId: null, fulfillment: "pending-stock-check" });
};

serve({ routes: [route("POST", "/v1/orders", placeOrder)] });
