import { serve, route, json, Request } from "../../../../src/runtime/http";
import { call } from "../../../../src/runtime/client";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { uuid, range, pick } from "../../../../src/runtime/random";
import { createIdempotencyStore } from "./idempotency";
import { buildReceipt, Transfer } from "./receipt";

const log = logger("ledger-api");

const config = {
  fxRatesUrl: env.string("FX_RATES_URL", "http://fx-rates:8080"),
  fxTimeoutMs: env.duration("FX_TIMEOUT", "800ms"),
  idempotencyTtlMs: env.duration("IDEMPOTENCY_TTL", "2m"),
  sweepEveryMs: env.duration("IDEMPOTENCY_SWEEP_INTERVAL", "30s"),
  screeningRules: env.number("SCREENING_RULESET_SIZE", 24),
};

const store = createIdempotencyStore(config.idempotencyTtlMs);

const balances = new Map<string, number>(range(500).map((i) => [`acct_${String(i).padStart(4, "0")}`, 1_000_000]));

const currencies = ["USD", "EUR", "GBP", "CAD", "JPY", "AUD"] as const;

const isTransfer = (body: unknown): body is Transfer => {
  const b = body as Partial<Transfer> | undefined;
  return (
    typeof b?.from === "string" &&
    typeof b?.to === "string" &&
    typeof b?.amountMinor === "number" &&
    b.amountMinor > 0 &&
    typeof b?.currency === "string" &&
    currencies.includes(b.currency as (typeof currencies)[number])
  );
};

const fxRate = async (from: string, to: string) => {
  if (from === to) return { ok: true as const, rate: { rate: 1, source: "identity" } };
  const res = await call<{ rate: number; source: string }>(`${config.fxRatesUrl}/v1/rates/${from}/${to}`, {
    timeoutMs: config.fxTimeoutMs,
    attempts: 2,
  });
  return res.ok ? { ok: true as const, rate: res.body } : { ok: false as const, error: res.error };
};

const createTransfer = async (req: Request) => {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8) return json(400, { error: "idempotency_key_required" });

  const previous = store.get(key);
  if (previous) {
    log.info("idempotent replay", { idempotency_key: key });
    return { status: 200, body: JSON.parse(previous), headers: { "idempotent-replayed": "true" } };
  }

  if (!isTransfer(req.body)) return json(422, { error: "invalid_transfer" });
  const transfer = req.body;
  if (!balances.has(transfer.from) || !balances.has(transfer.to)) return json(404, { error: "unknown_account" });

  const settlementCurrency = transfer.settlementCurrency ?? transfer.currency;
  const fx = await fxRate(transfer.currency, settlementCurrency);
  if (!fx.ok) {
    log.error("fx lookup failed", { from: transfer.currency, to: settlementCurrency, error: fx.error });
    return json(502, { error: "fx_unavailable" });
  }
  const receipt = buildReceipt({ id: `tr_${uuid()}`, transfer, fx: fx.rate, screeningRules: config.screeningRules });

  balances.set(transfer.from, (balances.get(transfer.from) ?? 0) - transfer.amountMinor);
  balances.set(transfer.to, (balances.get(transfer.to) ?? 0) + Math.round(transfer.amountMinor * fx.rate.rate));

  store.put(key, JSON.stringify(receipt));
  return json(201, receipt);
};

const getBalance = (req: Request) => {
  const id = req.params.id ?? "";
  const balance = balances.get(id);
  return balance === undefined ? json(404, { error: "unknown_account" }) : json(200, { account: id, balanceMinor: balance, currency: pick(currencies) });
};

setInterval(() => {
  const { removed, retained } = store.sweep();
  log.info("idempotency sweep", { removed, retained });
}, config.sweepEveryMs).unref();

serve({
  routes: [
    route("POST", "/v1/transfers", createTransfer),
    route("GET", "/v1/accounts/:id/balance", getBalance),
  ],
});
