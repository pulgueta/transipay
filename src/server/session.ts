import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseHeader,
} from "@tanstack/react-start/server";

import { auth } from "@/server/auth";

/** Returns the current session, or null. Use it in route `beforeLoad` for UX only, not as a data guard. */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    return await auth.api.getSession({ headers: getRequestHeaders() });
  }
);
