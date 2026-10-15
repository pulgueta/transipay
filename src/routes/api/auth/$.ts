import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/server/auth";
import { withPrivateNoStore } from "@/server/auth-response";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withPrivateNoStore(await auth.handler(request)),
      POST: async ({ request }) =>
        withPrivateNoStore(await auth.handler(request)),
    },
  },
});
