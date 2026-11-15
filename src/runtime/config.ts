const units: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export const parseDuration = (raw: string): number => {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/.exec(raw);
  if (!match) throw new Error(`invalid duration: ${JSON.stringify(raw)}`);
  return Number(match[1]) * (units[match[2] ?? "ms"] ?? 1);
};

const read = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`missing required environment variable ${name}`);
  return value;
};

export const env = {
  string: (name: string, fallback?: string) => read(name, fallback),
  number: (name: string, fallback?: number) => {
    const value = Number(read(name, fallback === undefined ? undefined : String(fallback)));
    if (Number.isNaN(value)) throw new Error(`${name} is not a number`);
    return value;
  },
  duration: (name: string, fallback?: string) => parseDuration(read(name, fallback)),
  flag: (name: string, fallback = false) => ["1", "true", "yes", "on", "enabled"].includes(read(name, String(fallback)).toLowerCase()),
};
