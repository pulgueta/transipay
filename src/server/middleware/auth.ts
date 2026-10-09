import { createMiddleware } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseStatus,
} from "@tanstack/react-start/server";

import type { Permissions } from "@/lib/auth/permissions";
import { auth } from "@/server/auth";

/**
 * Loads the session from the request cookie. Stops the call with 401 when there is no session.
 * Use `context.actorId` as the `withActor` user.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const result = await auth.api.getSession({ headers: getRequestHeaders() });

    if (!result) {
      setResponseStatus(401);
      throw new Error("You must sign in to do this operation.");
    }

    // During impersonation, the audit log records the admin, not the impersonated user.
    const actorId = result.session.impersonatedBy ?? result.user.id;

    return await next({
      context: { session: result.session, user: result.user, actorId },
    });
  }
);

/** Lets the call continue only when the user role has all the permissions. Else it stops with 403. */
export const requirePermission = (permissions: Permissions) =>
  createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(async ({ context, next }) => {
      const { success } = await auth.api.userHasPermission({
        body: { userId: context.user.id, permissions },
      });

      if (!success) {
        setResponseStatus(403);
        throw new Error("You do not have permission to do this operation.");
      }

      return await next();
    });
