import { createMiddleware } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseStatus,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import type { Permissions } from "@/lib/auth/permissions";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema/auth";

import { canImpersonate } from "./impersonation";

/**
 * Loads the session from the request cookie. Stops the call with 401 when there is no session.
 * Use `context.actorId` as the `withActor` user.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const result = await auth.api.getSession({ headers: getRequestHeaders() });

    if (!result) {
      setResponseStatus(401);
      throw new Error("Debe iniciar sesión para hacer esta operación.");
    }

    if (
      result.session.impersonatedBy !== undefined &&
      result.session.impersonatedBy !== null
    ) {
      const adminUser = await db.query.user.findFirst({
        where: eq(user.id, result.session.impersonatedBy),
        columns: { role: true, banned: true, banExpires: true },
      });
      if (!canImpersonate(adminUser, new Date())) {
        setResponseStatus(401);
        throw new Error("Debe iniciar sesión para hacer esta operación.");
      }
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
        throw new Error("No tiene permiso para hacer esta operación.");
      }

      return await next();
    });
