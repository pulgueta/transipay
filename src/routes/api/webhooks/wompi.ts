import { createFileRoute } from "@tanstack/react-router";

import { handlePaymentWebhook } from "@/server/payments/webhook";
import { handleLimitedWebhook } from "@/server/webhook-body";

// Public endpoint for Wompi payments events. The event signature is the authentication.
export const Route = createFileRoute("/api/webhooks/wompi")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        await handleLimitedWebhook(request, handlePaymentWebhook),
    },
  },
});
