type Entry = { value: string; storedAt: number };

export const createIdempotencyStore = (ttlMs: number) => {
  const entries = new Map<string, Entry>();

  const expired = (entry: Entry, now: number) => now - entry.storedAt > ttlMs;

  return {
    get: (key: string) => {
      const entry = entries.get(key);
      return entry && !expired(entry, Date.now()) ? entry.value : undefined;
    },
    put: (key: string, value: string) => {
      entries.set(key, { value, storedAt: Date.now() });
    },
    sweep: () => {
      const now = Date.now();
      const stale = [...entries].filter(([, entry]) => expired(entry, now)).map(([key]) => key);
      stale.forEach((key) => entries.delete(key));
      return { removed: stale.length, retained: entries.size };
    },
  };
};
