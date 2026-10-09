import { createFileRoute } from "@tanstack/react-router";

import { handlePaymentWebhook } from "@/server/payments/webhook";

// Public endpoint for Wompi payments events. The event signature is the authentication.
export const Route = createFileRoute("/api/webhooks/wompi")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        new Response(null, {
          status: await handlePaymentWebhook(await request.text()),
        }),
    },
  },
});
