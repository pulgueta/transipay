import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { sectionsFor } from "@/components/staff/sections";

export const Route = createFileRoute("/staff/")({
  beforeLoad: ({ context }) => {
    const first = sectionsFor(context.session.user.role).at(0);
    if (!first) {
      // A staff role without a section (for example, a cashier) has no page here yet.
      notFound({ throw: true });
      // Not reached: `notFound({ throw: true })` throws.
      throw new Error("Not found.");
    }
    redirect({ to: first.to, throw: true });
  },
});
