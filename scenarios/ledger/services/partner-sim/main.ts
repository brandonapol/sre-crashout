import { runTraffic, Outcome } from "../../../../src/runtime/traffic";
import { call } from "../../../../src/runtime/client";
import { env } from "../../../../src/runtime/config";
import { uuid, pick, intBetween, chance } from "../../../../src/runtime/random";

const ledger = env.string("LEDGER_URL", "http://ledger-api:8080");
const timeoutMs = env.duration("CLIENT_TIMEOUT", "5s");
const partners = ["acme-payroll", "northwind-remit", "globex-marketplace", "initech-ap", "umbrella-treasury"];
const currencies = ["USD", "EUR", "GBP", "CAD"];
const account = () => `acct_${String(intBetween(0, 499)).padStart(4, "0")}`;

const pending: Array<{ key: string; body: unknown }> = [];

const outcome = (res: { ok: boolean; status?: number; error?: string }): Outcome => ({ ok: res.ok, status: res.status, error: res.ok ? undefined : res.error });

const send = async (key: string, body: unknown) => {
  const res = await call(`${ledger}/v1/transfers`, { method: "POST", body, headers: { "idempotency-key": key }, timeoutMs });
  if (!res.ok && (res.status === undefined || res.status >= 500) && pending.length < 500) pending.push({ key, body });
  return outcome(res);
};

const newTransfer = () => {
  const currency = pick(currencies);
  return send(uuid(), {
    from: account(),
    to: account(),
    amountMinor: intBetween(500, 2_500_000),
    currency,
    settlementCurrency: chance(0.3) ? pick(currencies) : currency,
    reference: `INV-${intBetween(100000, 999999)}`,
    partner: pick(partners),
  });
};

const retryTransfer = () => {
  const retry = pending.shift();
  return retry ? send(retry.key, retry.body) : newTransfer();
};

runTraffic([
  { name: "partner transfer", weight: 85, run: newTransfer },
  { name: "partner transfer retry", weight: 5, run: retryTransfer },
  { name: "balance check", weight: 10, run: async () => outcome(await call(`${ledger}/v1/accounts/${account()}/balance`, { timeoutMs })) },
]);
