const config = require("./config");

const state = { inFlight: 0 };

const attempt = async (order) => {
  const res = await fetch(`${config.paymentsUrl}/v1/charges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: order.id, amount: order.total }),
    signal: AbortSignal.timeout(config.paymentsTimeoutMs),
  });
  if (!res.ok) throw new Error(`payments answered ${res.status}`);
  return res.json();
};

const charge = async (order) => {
  if (state.inFlight >= config.maxConcurrentCharges) throw new Error("too many charges in flight");
  state.inFlight += 1;
  try {
    for (let i = 0; ; i += 1) {
      try {
        return await attempt(order);
      } catch (err) {
        if (i >= config.paymentsRetries) throw err;
      }
    }
  } finally {
    state.inFlight -= 1;
  }
};

module.exports = { charge };
