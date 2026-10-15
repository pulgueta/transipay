import "@tanstack/react-start/server-only";
import { and, desc, eq, lt, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { toPage } from "@/server/db/pagination";
import { citizen } from "@/server/db/schema/citizens";
import { entity } from "@/server/db/schema/entities";
import {
  fine,
  infraction,
  obligation,
  procedure,
  procedureType,
} from "@/server/db/schema/obligations";
import {
  installment,
  payment,
  paymentAgreement,
} from "@/server/db/schema/payments";

import { resolveObligationState } from "./state";

const RECENT_PAYMENTS = 10;

/** The columns that the list and the detail page share. */
const obligationColumns = {
  id: obligation.id,
  kind: obligation.kind,
  number: obligation.number,
  status: obligation.status,
  amountInCents: obligation.amountInCents,
  discountInCents: obligation.discountInCents,
  issuedAt: obligation.issuedAt,
  dueOn: obligation.dueOn,
  entityName: entity.name,
  // A fine shows its infraction. A procedure shows its procedure type.
  description: sql<string>`coalesce(${infraction.code} || ' ' || ${infraction.description}, ${procedureType.name}, '')`,
  // Pending: the amount minus the discount. In an agreement: the unpaid installments. Else nothing.
  amountDueInCents: sql<number>`case
    when ${obligation.status} = 'pending' then ${obligation.amountInCents} - ${obligation.discountInCents}
    when ${obligation.status} = 'in_agreement' then coalesce((select sum(${installment.amountInCents}) from ${installment}
      where ${installment.paymentAgreementId} = ${paymentAgreement.id} and ${installment.status} <> 'paid'), 0)
    else 0 end`.mapWith(Number),
  agreementId: paymentAgreement.id,
  installmentCount: paymentAgreement.installmentCount,
  paidCount: sql<number>`(select count(*) from ${installment}
    where ${installment.paymentAgreementId} = ${paymentAgreement.id} and ${installment.status} = 'paid')`.mapWith(
    Number
  ),
};

/** Joins the obligation with its subtype, creditor, and active agreement, limited to the citizen of the user. */
const obligationQuery = (database: Database, userId: string) =>
  database
    .select(obligationColumns)
    .from(obligation)
    .innerJoin(citizen, eq(citizen.id, obligation.citizenId))
    .innerJoin(entity, eq(entity.id, obligation.entityId))
    .leftJoin(fine, eq(fine.obligationId, obligation.id))
    .leftJoin(infraction, eq(infraction.id, fine.infractionId))
    .leftJoin(procedure, eq(procedure.obligationId, obligation.id))
    .leftJoin(procedureType, eq(procedureType.id, procedure.procedureTypeId))
    .leftJoin(
      paymentAgreement,
      and(
        eq(paymentAgreement.obligationId, obligation.id),
        eq(paymentAgreement.status, "active")
      )
    )
    .$dynamic()
    .where(eq(citizen.userId, userId));

type ObligationRow = Awaited<ReturnType<typeof obligationQuery>>[number];

const toView = (row: ObligationRow, now: Date) => {
  const { agreementId, installmentCount, paidCount, ...rest } = row;
  return {
    ...rest,
    state: resolveObligationState(row, now),
    agreement:
      agreementId === null || installmentCount === null
        ? null
        : { installmentCount, paidCount },
  };
};

export type ObligationView = ReturnType<typeof toView>;

const hasCitizen = async (database: Database, userId: string) =>
  (await database.query.citizen.findFirst({
    where: eq(citizen.userId, userId),
    columns: { id: true },
  })) !== undefined;

/** One page of the obligations of the user, newest first (keyset on `id`). */
export const listObligations = async (
  database: Database,
  input: { userId: string; cursor?: string; limit: number }
) => {
  if (!(await hasCitizen(database, input.userId))) {
    return { hasCitizen: false, items: [], nextCursor: null };
  }

  const rows = await obligationQuery(database, input.userId)
    .where(
      and(
        eq(citizen.userId, input.userId),
        input.cursor === undefined ? undefined : lt(obligation.id, input.cursor)
      )
    )
    .orderBy(desc(obligation.id))
    .limit(input.limit + 1);
  const now = new Date();

  return {
    hasCitizen: true,
    ...toPage(
      rows.map((row) => toView(row, now)),
      input.limit
    ),
  };
};

/** One obligation of the user with its installments and recent payments. Null when it is not the citizen's. */
export const readObligation = async (
  database: Database,
  input: { userId: string; obligationId: string }
) => {
  const rows = await obligationQuery(database, input.userId).where(
    and(eq(citizen.userId, input.userId), eq(obligation.id, input.obligationId))
  );
  const row = rows.at(0);
  if (!row) {
    return null;
  }

  const installments =
    row.agreementId === null
      ? []
      : await database
          .select({
            id: installment.id,
            number: installment.number,
            dueOn: installment.dueOn,
            amountInCents: installment.amountInCents,
            status: installment.status,
          })
          .from(installment)
          .where(eq(installment.paymentAgreementId, row.agreementId))
          .orderBy(installment.number);
  const payments = await database
    .select({
      id: payment.id,
      installmentId: payment.installmentId,
      amountInCents: payment.amountInCents,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt,
    })
    .from(payment)
    .where(eq(payment.obligationId, row.id))
    .orderBy(desc(payment.id))
    .limit(RECENT_PAYMENTS);

  return { ...toView(row, new Date()), installments, payments };
};
