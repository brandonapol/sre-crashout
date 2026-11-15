const createCache = ({ ttlMs, maxEntries }) => {
  const entries = new Map();
  const evict = () => {
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  };
  return {
    get: (key) => {
      const hit = entries.get(key);
      if (!hit || hit.expiresAt < Date.now()) return undefined;
      return hit.value;
    },
    set: (key, value) => {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      evict();
    },
  };
};

module.exports = { createCache };
