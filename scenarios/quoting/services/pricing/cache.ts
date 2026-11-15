export const createCache = <T>(ttlMs: number) => {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  const lifetime = () => ttlMs * (0.5 + Math.random() * 0.5);
  return {
    get: (key: string): T | undefined => {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt > Date.now()) return entry.value;
      entries.delete(key);
      return undefined;
    },
    set: (key: string, value: T) => {
      entries.set(key, { value, expiresAt: Date.now() + lifetime() });
    },
    size: () => entries.size,
  };
};
