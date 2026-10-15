import type { ObligationKind } from "@/server/db/schema/obligations";
import type { ObligationState } from "@/server/obligations/state";

export const KIND_LABELS: Record<ObligationKind, string> = {
  fine: "Fine",
  procedure: "Procedure",
};

export const STATE_LABELS: Record<ObligationState, string> = {
  pending: "Pending",
  overdue: "Overdue",
  in_agreement: "In agreement",
  paid: "Paid",
  void: "Void",
};
