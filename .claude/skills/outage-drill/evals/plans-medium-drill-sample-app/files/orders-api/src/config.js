const seconds = (name, fallback) => Number(process.env[name] ?? fallback) * 1000;

module.exports = {
  port: Number(process.env.PORT ?? 8080),
  paymentsUrl: process.env.PAYMENTS_URL ?? "http://payments:8080",
  paymentsTimeoutMs: seconds("PAYMENTS_TIMEOUT_SECONDS", 2),
  paymentsRetries: Number(process.env.PAYMENTS_RETRIES ?? 1),
  orderCacheTtlMs: seconds("ORDER_CACHE_TTL_SECONDS", 60),
  orderCacheMaxEntries: Number(process.env.ORDER_CACHE_MAX_ENTRIES ?? 5000),
  maxConcurrentCharges: Number(process.env.MAX_CONCURRENT_CHARGES ?? 20),
};
