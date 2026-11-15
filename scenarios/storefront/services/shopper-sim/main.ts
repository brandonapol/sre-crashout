import { runTraffic, Outcome } from "../../../../src/runtime/traffic";
import { call } from "../../../../src/runtime/client";
import { env } from "../../../../src/runtime/config";
import { intBetween, range, uuid } from "../../../../src/runtime/random";

const catalog = env.string("CATALOG_URL", "http://catalog:8080");
const checkout = env.string("CHECKOUT_URL", "http://checkout:8080");
const timeoutMs = env.duration("CLIENT_TIMEOUT", "15s");
const sku = () => `SKU-${String(10000 + intBetween(0, 239))}`;

const outcome = (res: { ok: boolean; status?: number; error?: string }): Outcome => ({ ok: res.ok, status: res.status, error: res.ok ? undefined : res.error });

runTraffic([
  { name: "browse category", weight: 45, run: async () => outcome(await call(`${catalog}/v1/products?page=${intBetween(0, 9)}`, { timeoutMs })) },
  { name: "view product", weight: 35, run: async () => outcome(await call(`${catalog}/v1/products/${sku()}`, { timeoutMs })) },
  {
    name: "checkout",
    weight: 20,
    run: async () =>
      outcome(
        await call(`${checkout}/v1/orders`, {
          method: "POST",
          timeoutMs,
          body: { customerId: `cus_${uuid().slice(0, 8)}`, lines: range(intBetween(1, 3)).map(() => ({ sku: sku(), quantity: intBetween(1, 2) })) },
        }),
      ),
  },
]);
