import { redirect } from "@tanstack/react-router";

import { canUser } from "@/lib/auth/permissions";
import type { Permissions } from "@/lib/auth/permissions";
import type { getSessionFn } from "@/server/session";

/** The session that the root route puts in the router context. Null when the user is signed out. */
export type AppSession = NonNullable<Awaited<ReturnType<typeof getSessionFn>>>;

/** Keeps only a path in this app, so a sign-in link cannot send the user to another site. */
export const sanitizeRedirect = (value: string | undefined): string => {
  if (
    value === undefined ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  return value;
};

/**
 * Use it in a route `beforeLoad`: `requireSession(context.session, location.href)`.
 * It sends a signed-out user to the sign-in page, which sends the user back to `href` after sign-in.
 * This is navigation only. A server function must check the session again.
 */
export const requireSession = <TSession>(
  session: TSession | null,
  href: string
): TSession => {
  if (session === null) {
    redirect({
      to: "/sign-in",
      search: { redirect: sanitizeRedirect(href) },
      throw: true,
    });
    // Not reached: `redirect({ throw: true })` throws.
    throw new Error("You must sign in to open this page.");
  }
  return session;
};

/** The message of a 403 from a server function (see `requirePermission`). The guards use the same message. */
const ACCESS_DENIED_MESSAGE = "No tiene permiso para hacer esta operación.";

/** True when the error is a permission denial from a guard or from a server function. */
export const isAccessDenied = (error: Error): boolean =>
  error.message === ACCESS_DENIED_MESSAGE;

/** The error that a guard throws for a permission denial. The error page shows the access-denied screen for it. */
export const accessDeniedError = (): Error => new Error(ACCESS_DENIED_MESSAGE);

/**
 * Use it in a route `beforeLoad` after `requireSession`. It stops the route with an access-denied error
 * when the role does not have the permissions, so the page does not show controls that the server refuses.
 * This is navigation only. A server function must check the permissions again.
 */
export const requirePermissions = (
  role: string | null | undefined,
  permissions: Permissions
): void => {
  if (!canUser(role, permissions)) {
    throw accessDeniedError();
  }
};
