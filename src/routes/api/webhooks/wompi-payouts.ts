import { createFileRoute } from "@tanstack/react-router";

import { handlePayoutWebhook } from "@/server/payouts/webhook";

// Public endpoint for Wompi payouts events. The event signature is the authentication.
export const Route = createFileRoute("/api/webhooks/wompi-payouts")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        new Response(null, {
          status: await handlePayoutWebhook(await request.text()),
        }),
    },
  },
});
