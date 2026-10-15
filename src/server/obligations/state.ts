import { bogotaDateString } from "@/lib/dates";
import type { ObligationStatus } from "@/server/db/schema/obligations";

/** What the citizen sees. `overdue` is a pending obligation whose due date passed. */
export type ObligationState = ObligationStatus | "overdue";

/** Decides the state with the server clock, so the list and the detail page agree. */
export const resolveObligationState = (
  obligation: { status: ObligationStatus; dueOn: string | null },
  now: Date
): ObligationState =>
  obligation.status === "pending" &&
  obligation.dueOn !== null &&
  obligation.dueOn < bogotaDateString(now)
    ? "overdue"
    : obligation.status;
