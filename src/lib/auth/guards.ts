import { redirect } from "@tanstack/react-router";

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
