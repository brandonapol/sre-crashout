import { logNormal, sleep } from "../../../../src/runtime/random";

export type Price = { sku: string; region: string; listMinor: number; netMinor: number; currency: string; rules: string[] };

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const priceOf = (sku: string, region: string): Price => {
  const base = 500 + (hash(sku) % 40000);
  const discount = hash(`${sku}:${region}`) % 15;
  return {
    sku,
    region,
    listMinor: base,
    netMinor: Math.round(base * (1 - discount / 100)),
    currency: region === "eu" ? "EUR" : "USD",
    rules: discount > 0 ? [`volume-tier-${discount % 3}`, "regional-adjustment"] : ["list"],
  };
};

export const computePrice = async (sku: string, region: string, medianMs: number): Promise<Price> => {
  await sleep(logNormal(medianMs, 0.7));
  return priceOf(sku, region);
};
