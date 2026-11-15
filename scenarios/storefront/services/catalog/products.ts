import { range } from "../../../../src/runtime/random";

const adjectives = ["Everyday", "Trail", "Studio", "Coastal", "Heritage", "Summit", "Urban", "Field"];
const nouns = ["Backpack", "Jacket", "Mug", "Lamp", "Notebook", "Bottle", "Beanie", "Tote", "Kettle", "Scarf"];

export type Product = { sku: string; name: string; priceMinor: number; currency: string; category: string };

export const products: Product[] = range(240).map((i) => ({
  sku: `SKU-${String(10000 + i)}`,
  name: `${adjectives[i % adjectives.length]} ${nouns[i % nouns.length]}`,
  priceMinor: 900 + ((i * 731) % 18000),
  currency: "USD",
  category: ["outdoor", "home", "apparel", "office"][i % 4] ?? "home",
}));

export const bySku = new Map(products.map((p) => [p.sku, p]));
