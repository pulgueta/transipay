import type { ObligationKind } from "@/server/db/schema/obligations";
import type { ObligationState } from "@/server/obligations/state";

export const KIND_LABELS: Record<ObligationKind, string> = {
  fine: "Comparendo",
  procedure: "Trámite",
};

export const STATE_LABELS: Record<ObligationState, string> = {
  pending: "Pendiente",
  overdue: "Vencida",
  in_agreement: "En acuerdo de pago",
  paid: "Pagada",
  void: "Anulada",
};
