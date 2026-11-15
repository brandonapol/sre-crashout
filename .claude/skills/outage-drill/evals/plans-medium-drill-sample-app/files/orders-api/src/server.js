const http = require("node:http");
const { randomUUID } = require("node:crypto");
const config = require("./config");
const { createCache } = require("./cache");
const { charge } = require("./payments");

const orders = createCache({ ttlMs: config.orderCacheTtlMs, maxEntries: config.orderCacheMaxEntries });

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (req.method === "POST" && url.pathname === "/orders") {
      const body = await readJson(req);
      const order = { id: randomUUID(), items: body.items ?? [], total: Number(body.total ?? 0), status: "pending" };
      try {
        const receipt = await charge(order);
        const paid = { ...order, status: "paid", receipt };
        orders.set(order.id, paid);
        return send(res, 201, paid);
      } catch (err) {
        console.error(JSON.stringify({ level: "error", msg: "charge failed", orderId: order.id, error: err.message }));
        return send(res, 502, { error: "payment_failed" });
      }
    }
    const match = /^\/orders\/([\w-]+)$/.exec(url.pathname);
    if (req.method === "GET" && match) {
      const order = orders.get(match[1]);
      return order ? send(res, 200, order) : send(res, 404, { error: "not_found" });
    }
    return send(res, 404, { error: "not_found" });
  })
  .listen(config.port, () => console.log(JSON.stringify({ level: "info", msg: "listening", port: config.port })));
