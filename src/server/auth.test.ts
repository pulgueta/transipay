import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";

import { createAuth } from "./auth";

const auth = createAuth(drizzle.mock());

describe("admin HTTP paths", () => {
  it.each([
    "/admin/set-role",
    "/admin/ban-user",
    "/admin/unban-user",
    "/admin/remove-user",
    "/admin/update-user",
    "/admin/create-user",
    "/admin/set-user-password",
  ])("disables %s", (path) => {
    expect(auth.options.disabledPaths ?? []).toContain(path);
  });

  it.each([
    "/admin/get-user",
    "/admin/list-users",
    "/admin/list-user-sessions",
    "/admin/has-permission",
    // Its only actorless user write (clear an expired ban) is allowed by trigger user_require_actor.
    "/admin/impersonate-user",
    "/admin/stop-impersonating",
    "/admin/revoke-user-session",
    "/admin/revoke-user-sessions",
  ])("keeps %s enabled", (path) => {
    expect(auth.options.disabledPaths ?? []).not.toContain(path);
  });

  it("uses secure cookies for an HTTPS base URL outside production", async () => {
    const context = await auth.$context;
    expect(context.authCookies.sessionToken.attributes.secure).toBeTruthy();
  });
});
