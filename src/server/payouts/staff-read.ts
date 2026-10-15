import "@tanstack/react-start/server-only";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { toPage } from "@/server/db/pagination";
import { entity, entityBankAccount } from "@/server/db/schema/entities";
import { payout } from "@/server/db/schema/payments";
import type { PayoutStatus } from "@/server/db/schema/payments";
import type { StaffScope } from "@/server/staff/scope";

/** Limits the rows to the entities in the scope. */
const scopeFilter = (scope: StaffScope) =>
  scope.kind === "all" ? undefined : inArray(entity.id, scope.entityIds);

/** The payouts of the entities in the scope, newest first, with an optional status filter. Keyset on `id`. */
export const listPayouts = async (
  database: Database,
  input: {
    scope: StaffScope;
    status?: PayoutStatus;
    cursor?: string;
    limit: number;
  }
) => {
  const rows = await database
    .select({
      id: payout.id,
      entityName: entity.name,
      amountInCents: payout.amountInCents,
      currency: payout.currency,
      status: payout.status,
      reviewReason: payout.reviewReason,
      providerPayoutId: payout.providerPayoutId,
      reference: payout.reference,
      createdAt: payout.createdAt,
    })
    .from(payout)
    .innerJoin(entity, eq(entity.id, payout.entityId))
    .where(
      and(
        scopeFilter(input.scope),
        input.status === undefined
          ? undefined
          : eq(payout.status, input.status),
        input.cursor === undefined ? undefined : lt(payout.id, input.cursor)
      )
    )
    .orderBy(desc(payout.id))
    .limit(input.limit + 1);
  return toPage(rows, input.limit);
};

/** The active entities in the scope that can receive a payout now: each one has a default bank account. */
export const listPayoutTargets = async (
  database: Database,
  scope: StaffScope
) =>
  await database
    .select({ id: entity.id, name: entity.name, kind: entity.kind })
    .from(entity)
    .innerJoin(
      entityBankAccount,
      and(
        eq(entityBankAccount.entityId, entity.id),
        eq(entityBankAccount.isDefault, true)
      )
    )
    .where(and(eq(entity.isActive, true), scopeFilter(scope)))
    .orderBy(entity.name);
