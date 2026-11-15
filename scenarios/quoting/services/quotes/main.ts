import { serve, route, json, Request } from "../../../../src/runtime/http";
import { call } from "../../../../src/runtime/client";
import { env } from "../../../../src/runtime/config";
import { logger } from "../../../../src/runtime/log";
import { uuid } from "../../../../src/runtime/random";

const log = logger("quotes");

const config = {
  pricingUrl: env.string("PRICING_URL", "http://pricing:8080"),
  pricingTimeoutMs: env.duration("PRICING_TIMEOUT", "300ms"),
  pricingAttempts: env.number("PRICING_ATTEMPTS", 3),
  taxTableVersion: env.string("TAX_TABLE_VERSION", "2026-10"),
};

type Line = { sku: string; quantity: number };
type Price = { sku: string; netMinor: number; currency: string };

const taxRates: Record<string, number> = { us: 0.0725, eu: 0.21, uk: 0.2, ca: 0.13 };

const isQuote = (body: unknown): body is { region: string; lines: Line[] } => {
  const b = body as { region?: unknown; lines?: unknown } | undefined;
  return typeof b?.region === "string" && Array.isArray(b.lines) && b.lines.length > 0;
};

const priceLine = (region: string) => (line: Line) =>
  call<Price>(`${config.pricingUrl}/v1/prices/${encodeURIComponent(line.sku)}?region=${region}`, {
    timeoutMs: config.pricingTimeoutMs,
    attempts: config.pricingAttempts,
  });

const createQuote = async (req: Request) => {
  if (!isQuote(req.body)) return json(422, { error: "invalid_quote_request" });
  const { region, lines } = req.body;
  const priced = await Promise.all(lines.map(priceLine(region)));
  const failures = priced.filter((p) => !p.ok);
  if (failures.length > 0) {
    const first = failures[0];
    log.error("quote failed: could not price all lines", {
      region,
      lines: lines.length,
      failed: failures.length,
      error: first && !first.ok ? first.error : undefined,
    });
    return json(502, { error: "pricing_failed" });
  }
  const subtotal = priced.reduce((sum, p, i) => sum + (p.ok ? p.body.netMinor * (lines[i]?.quantity ?? 0) : 0), 0);
  const tax = Math.round(subtotal * (taxRates[region] ?? 0));
  return json(201, { quoteId: `q_${uuid()}`, region, subtotalMinor: subtotal, taxMinor: tax, totalMinor: subtotal + tax, taxTable: config.taxTableVersion });
};

serve({ routes: [route("POST", "/v1/quotes", createQuote)] });
