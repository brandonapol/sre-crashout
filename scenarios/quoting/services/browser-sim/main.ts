import { runTraffic, Outcome } from "../../../../src/runtime/traffic";
import { call } from "../../../../src/runtime/client";
import { env } from "../../../../src/runtime/config";
import { intBetween, pick, range } from "../../../../src/runtime/random";
import { skus } from "../catalog";

const web = env.string("WEB_URL", "http://web:8080");
const timeoutMs = env.duration("CLIENT_TIMEOUT", "10s");
const catalogSize = env.number("CATALOG_SIZE", 600);
const regions = ["us", "us", "us", "eu", "uk", "ca"];

const catalog = skus(catalogSize);
const sku = () => pick(catalog);
const cart = () => range(intBetween(2, 6)).map(() => `${sku()}:${intBetween(1, 4)}`).join(",");

const outcome = (res: { ok: boolean; status?: number; error?: string }): Outcome => ({ ok: res.ok, status: res.status, error: res.ok ? undefined : res.error });

runTraffic([
  { name: "featured page", weight: 40, run: async () => outcome(await call(`${web}/featured`, { timeoutMs })) },
  { name: "quote page", weight: 60, run: async () => outcome(await call(`${web}/quote?region=${pick(regions)}&cart=${cart()}`, { timeoutMs })) },
]);
