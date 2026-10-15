import { Badge } from "@/components/ui/badge";
import type { ObligationState } from "@/server/obligations/state";

import { STATE_LABELS } from "./obligation-labels";

const VARIANTS: Record<
  ObligationState,
  "outline" | "secondary" | "destructive"
> = {
  pending: "outline",
  overdue: "destructive",
  in_agreement: "secondary",
  paid: "secondary",
  void: "outline",
};

export const ObligationStateBadge = ({ state }: { state: ObligationState }) => (
  <Badge variant={VARIANTS[state]}>{STATE_LABELS[state]}</Badge>
);
