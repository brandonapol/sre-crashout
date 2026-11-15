import { serve, route, json } from "../../../../src/runtime/http";
import { env } from "../../../../src/runtime/config";
import { logNormal, pick, sleep } from "../../../../src/runtime/random";

const config = {
  campaign: env.string("CAMPAIGN", "winter"),
  medianMs: env.duration("PERSONALISATION_MEDIAN_LATENCY", "600ms"),
};

const banners = ["Winter pricing is live", "Bundle and save 15%", "Free shipping on orders over $50"];

serve({
  routes: [
    route("GET", "/v1/banner", async () => {
      await sleep(logNormal(config.medianMs, 0.4));
      return json(200, { campaign: config.campaign, text: pick(banners) });
    }),
  ],
});
