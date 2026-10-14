import type { user } from "@/server/db/schema/auth";

/** Checks the current admin record, not the role stored when the session began. */
export const canImpersonate = (
  adminUser:
    | Pick<typeof user.$inferSelect, "role" | "banned" | "banExpires">
    | null
    | undefined,
  now: Date
) => {
  if (
    adminUser === null ||
    adminUser === undefined ||
    !adminUser.role.split(",").includes("admin")
  ) {
    return false;
  }
  return (
    !adminUser.banned ||
    (adminUser.banExpires !== null &&
      adminUser.banExpires.getTime() < now.getTime())
  );
};
