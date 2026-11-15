export type CallOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs: number;
  attempts?: number;
  retryOn?: (status: number) => boolean;
};

export type CallResult<T> =
  | { ok: true; status: number; body: T; attempts: number }
  | { ok: false; status?: number; error: string; attempts: number };

const once = async <T>(url: string, opts: CallOptions): Promise<CallResult<T>> => {
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { "content-type": "application/json", ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    const text = await res.text();
    const isJson = (res.headers.get("content-type") ?? "").includes("json");
    const body = (text && isJson ? JSON.parse(text) : text || undefined) as T;
    return res.ok
      ? { ok: true, status: res.status, body, attempts: 1 }
      : { ok: false, status: res.status, error: `http ${res.status}`, attempts: 1 };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : undefined;
    const detail = cause ? `${message}: ${(cause as Error & { code?: string }).code ?? cause.message}` : message;
    return { ok: false, error: name === "TimeoutError" ? `timeout after ${opts.timeoutMs}ms` : detail, attempts: 1 };
  }
};

const retryable = (opts: CallOptions) => (result: CallResult<unknown>) =>
  !result.ok && (result.status === undefined || (opts.retryOn ?? ((s) => s >= 500))(result.status));

export const call = async <T>(url: string, opts: CallOptions): Promise<CallResult<T>> => {
  const max = Math.max(1, opts.attempts ?? 1);
  const shouldRetry = retryable(opts);
  const attempt = async (n: number): Promise<CallResult<T>> => {
    const result = await once<T>(url, opts);
    return n < max && shouldRetry(result) ? attempt(n + 1) : { ...result, attempts: n };
  };
  return attempt(1);
};
