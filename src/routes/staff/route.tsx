import { Outlet, createFileRoute, notFound } from "@tanstack/react-router";

import { sectionsFor } from "@/components/staff/sections";
import { StaffNav } from "@/components/staff/staff-nav";
import { requireSession } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/roles";

const StaffLayout = () => {
  const { session } = Route.useRouteContext();

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <StaffNav sections={sectionsFor(session.user.role)} />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Outlet />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/staff")({
  beforeLoad: ({ context, location }) => {
    const session = requireSession(context.session, location.href);
    // A citizen gets the not-found page, so the staff area does not show that it exists.
    if (!isStaff(session.user.role)) {
      notFound({ throw: true });
    }
    return { session };
  },
  component: StaffLayout,
});
