import { randomUUID } from "node:crypto";

export const uuid = () => randomUUID();

export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

export const between = (min: number, max: number) => min + Math.random() * (max - min);

export const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));

export const chance = (p: number) => Math.random() < p;

export const logNormal = (medianMs: number, sigma: number) => {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return medianMs * Math.exp(sigma * z);
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
