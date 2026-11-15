import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { metrics, trace } from "@opentelemetry/api";
import { logger } from "./log";

export type Request = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  headers: IncomingMessage["headers"];
  body: unknown;
};

export type Response = { status: number; body?: unknown; headers?: Record<string, string> };

export type Handler = (req: Request) => Promise<Response> | Response;

export type Route = { method: string; pattern: string; handler: Handler };

type Compiled = Route & { regex: RegExp; keys: string[] };

export const route = (method: string, pattern: string, handler: Handler): Route => ({ method, pattern, handler });

export const json = (status: number, body?: unknown, headers?: Record<string, string>): Response => ({ status, body, headers });

const compile = (r: Route): Compiled => {
  const keys: string[] = [];
  const source = r.pattern.replace(/:(\w+)/g, (_, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { ...r, regex: new RegExp(`^${source}$`), keys };
};

const readBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("error", reject);
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(undefined);
      }
    });
  });

const send = (res: ServerResponse, out: Response, draining = false) => {
  const payload = out.body === undefined ? "" : JSON.stringify(out.body);
  res.writeHead(out.status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    ...(draining ? { connection: "close" } : {}),
    ...out.headers,
  });
  res.end(payload);
};

export type ServerOptions = {
  port?: number;
  routes: Route[];
  maxInFlight?: number;
};

export const serve = ({ port = Number(process.env.PORT ?? 8080), routes, maxInFlight = Infinity }: ServerOptions) => {
  const log = logger("http");
  const compiled = routes.map(compile);
  const state = { inFlight: 0, draining: false };
  const shed = metrics.getMeter("http").createCounter("http.server.requests_shed", { description: "Requests answered 503 because the in-flight limit was reached" });

  const dispatch = async (req: IncomingMessage): Promise<Response> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/healthz") return json(200, { status: "ok" });
    const method = req.method ?? "GET";
    const match = compiled
      .map((r) => ({ r, m: r.method === method ? r.regex.exec(url.pathname) : null }))
      .find((x) => x.m !== null);
    if (!match || !match.m) return json(404, { error: "not_found" });
    const span = trace.getActiveSpan();
    span?.updateName(`${method} ${match.r.pattern}`);
    span?.setAttribute("http.route", match.r.pattern);
    const params = Object.fromEntries(match.r.keys.map((k, i) => [k, decodeURIComponent(match.m?.[i + 1] ?? "")]));
    const body = await readBody(req);
    return match.r.handler({ method, path: url.pathname, params, query: url.searchParams, headers: req.headers, body });
  };

  const server = createServer((req, res) => {
    if (state.inFlight >= maxInFlight && req.url !== "/healthz") {
      shed.add(1);
      send(res, json(503, { error: "server_busy" }, { "retry-after": "1" }));
      return;
    }
    state.inFlight += 1;
    res.on("close", () => {
      state.inFlight -= 1;
    });
    dispatch(req)
      .then((out) => send(res, out, state.draining))
      .catch((err: unknown) => {
        log.error("unhandled error", { error: err instanceof Error ? err.message : String(err), path: req.url });
        if (!res.headersSent) send(res, json(500, { error: "internal" }));
      });
  });

  server.keepAliveTimeout = 65_000;
  server.maxRequestsPerSocket = Number(process.env.HTTP_MAX_REQUESTS_PER_SOCKET ?? 100);
  server.listen(port, () => log.info("listening", { port }));
  process.once("SIGTERM", () => {
    state.draining = true;
    server.closeIdleConnections();
    log.info("draining connections before shutdown");
  });
  return { inFlight: () => state.inFlight };
};
