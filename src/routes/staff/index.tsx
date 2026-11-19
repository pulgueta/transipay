import { createFileRoute, redirect } from "@tanstack/react-router";

import { sectionsFor } from "@/components/staff/sections";

export const Route = createFileRoute("/staff/")({
  beforeLoad: ({ context }) => {
    const first = sectionsFor(context.session.user.role).at(0);
    // A staff role without a section (for example, a cashier) goes to the home page.
    redirect({ to: first?.to ?? "/", replace: true, throw: true });
  },
});
