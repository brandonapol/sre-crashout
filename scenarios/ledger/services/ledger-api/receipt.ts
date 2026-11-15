import { range } from "../../../../src/runtime/random";

export type Transfer = {
  from: string;
  to: string;
  amountMinor: number;
  currency: string;
  settlementCurrency?: string;
  reference?: string;
  partner?: string;
};

type Fx = { rate: number; source: string };

const screeningCatalog = [
  "sanctions.ofac.sdn",
  "sanctions.eu.consolidated",
  "sanctions.uk.hmt",
  "sanctions.un.security-council",
  "pep.tier1",
  "pep.tier2",
  "adverse-media.financial-crime",
  "velocity.daily-count",
  "velocity.daily-amount",
  "velocity.counterparty-new",
  "structuring.threshold-proximity",
  "geo.high-risk-jurisdiction",
  "device.fingerprint-mismatch",
  "account.dormancy-reactivation",
  "account.age-under-30d",
  "mule.inbound-fan-in",
  "mule.outbound-fan-out",
  "limits.partner-tier",
  "limits.single-transfer",
  "limits.monthly-aggregate",
  "reference.free-text-keywords",
  "counterparty.blocklist",
  "counterparty.name-match",
  "currency.restricted-pair",
] as const;

const ruleCostMicros = 120;

const evaluateRule = (rule: string, subject: string) => {
  const start = process.cpuUsage();
  const state = { score: rule.length + subject.length, spent: 0 };
  while (state.spent < ruleCostMicros) {
    for (let i = 0; i < 500; i += 1) state.score = (state.score * 31 + i) % 1_000_003;
    const used = process.cpuUsage(start);
    state.spent = used.user + used.system;
  }
  return (state.score % 2000) / 10000;
};

export const buildReceipt = ({ id, transfer, fx, screeningRules }: { id: string; transfer: Transfer; fx: Fx; screeningRules: number }) => {
  const settledMinor = Math.round(transfer.amountMinor * fx.rate);
  const feeMinor = Math.max(25, Math.round(transfer.amountMinor * 0.0035));
  const now = new Date().toISOString();
  const screening = range(screeningRules).map((i) => {
    const rule = screeningCatalog[i % screeningCatalog.length] ?? "unknown";
    return {
      rule,
      version: `2026.${(i % 11) + 1}.${(i * 7) % 13}`,
      outcome: "pass",
      score: Number(evaluateRule(rule, `${transfer.from}:${transfer.to}:${transfer.amountMinor}`).toFixed(4)),
      evaluatedAt: now,
      evidence: `rule ${rule} evaluated against ${transfer.from} -> ${transfer.to} for ${transfer.amountMinor} ${transfer.currency}; no match above threshold`,
    };
  });
  return {
    id,
    status: "settled",
    createdAt: now,
    reference: transfer.reference ?? null,
    partner: transfer.partner ?? null,
    amount: { minor: transfer.amountMinor, currency: transfer.currency },
    settlement: { minor: settledMinor, currency: transfer.settlementCurrency ?? transfer.currency, fxRate: fx.rate, fxSource: fx.source },
    fees: [
      { kind: "network", minor: Math.round(feeMinor * 0.6), currency: transfer.currency },
      { kind: "fx-spread", minor: Math.round(feeMinor * 0.3), currency: transfer.currency },
      { kind: "platform", minor: feeMinor - Math.round(feeMinor * 0.6) - Math.round(feeMinor * 0.3), currency: transfer.currency },
    ],
    entries: [
      { account: transfer.from, direction: "debit", minor: transfer.amountMinor, currency: transfer.currency, memo: `transfer ${id} to ${transfer.to}` },
      { account: "suspense:fx", direction: "credit", minor: transfer.amountMinor, currency: transfer.currency, memo: `fx leg in ${id}` },
      { account: "suspense:fx", direction: "debit", minor: settledMinor, currency: transfer.settlementCurrency ?? transfer.currency, memo: `fx leg out ${id}` },
      { account: transfer.to, direction: "credit", minor: settledMinor, currency: transfer.settlementCurrency ?? transfer.currency, memo: `transfer ${id} from ${transfer.from}` },
      { account: "revenue:fees", direction: "credit", minor: feeMinor, currency: transfer.currency, memo: `fees on ${id}` },
      { account: transfer.from, direction: "debit", minor: feeMinor, currency: transfer.currency, memo: `fees on ${id}` },
    ],
    screening,
  };
};
