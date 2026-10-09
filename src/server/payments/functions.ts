import { buildCheckoutUrl } from "@pulgueta/wompi/server";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { obligation } from "@/server/db/schema/obligations";
import {
  installment,
  payment,
  paymentAgreement,
} from "@/server/db/schema/payments";
import { withActor } from "@/server/db/with-actor";
import { httpError, throwNotFound } from "@/server/http-error";
import { authMiddleware, requirePermission } from "@/server/middleware/auth";
import { getWompi } from "@/server/wompi";

import { canReadPayment } from "./access";
import { resolveAmountDue } from "./amount";
import type { AmountDueError } from "./amount";
import { checkoutExpiresAt, findReusablePayment } from "./checkout";

const AMOUNT_DUE_MESSAGES: Record<AmountDueError, string> = {
  obligation_not_payable: "This obligation is paid or void. You cannot pay it.",
  installment_required:
    "This obligation has a payment agreement. Select an installment to pay.",
  installment_not_allowed:
    "This obligation has no payment agreement. Pay the full amount.",
  installment_not_payable: "This installment is paid.",
  nothing_due: "This obligation has no amount to pay.",
};

/** Wompi terms that the citizen must accept before a payment. Show the permalinks as links. */
export const getAcceptanceTokensFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const [error, merchant] = await getWompi().merchants.getMerchant();
    const acceptance = merchant?.presigned_acceptance;
    const personalDataAuth = merchant?.presigned_personal_data_auth;

    if (error || !acceptance || !personalDataAuth) {
      throw httpError(502, "We cannot get the payment terms now. Try again.");
    }

    return {
      acceptance: {
        token: acceptance.acceptance_token,
        permalink: acceptance.permalink,
      },
      personalDataAuth: {
        token: personalDataAuth.acceptance_token,
        permalink: personalDataAuth.permalink,
      },
    };
  });

/**
 * Records a pending payment and returns the Wompi Web Checkout URL.
 * An open payment for the same target is given again until its link expires.
 * Wompi collects the card or bank data, so that data does not touch our servers.
 * The result comes later through the Wompi webhook.
 */
export const createCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ payment: ["create"] })])
  .validator(
    z.object({
      obligationId: z.uuid(),
      installmentId: z.uuid().optional(),
    })
  )
  .handler(async ({ context, data }) => {
    const checkout = await withActor(context.actorId, async (tx) => {
      // The join on citizen.user_id limits the citizen to their own obligations.
      // The row locks (obligation, then agreement, then installment) make parallel checkouts wait.
      const owned = await tx
        .select({
          citizenId: obligation.citizenId,
          status: obligation.status,
          amountInCents: obligation.amountInCents,
          discountInCents: obligation.discountInCents,
        })
        .from(obligation)
        .innerJoin(citizen, eq(citizen.id, obligation.citizenId))
        .where(
          and(
            eq(obligation.id, data.obligationId),
            eq(citizen.userId, context.user.id)
          )
        )
        .for("update", { of: obligation });
      const target = owned.at(0);
      if (!target) {
        throw httpError(404, "We cannot find this obligation.");
      }

      let selectedInstallment = null;
      if (data.installmentId !== undefined) {
        const agreements = await tx
          .select({ id: paymentAgreement.id })
          .from(paymentAgreement)
          .where(
            and(
              eq(paymentAgreement.obligationId, data.obligationId),
              eq(paymentAgreement.status, "active")
            )
          )
          .for("update");
        const agreement = agreements.at(0);

        const installments = agreement
          ? await tx
              .select({
                status: installment.status,
                amountInCents: installment.amountInCents,
              })
              .from(installment)
              .where(
                and(
                  eq(installment.id, data.installmentId),
                  eq(installment.paymentAgreementId, agreement.id)
                )
              )
              .for("update")
          : [];
        selectedInstallment = installments.at(0) ?? null;
        if (!selectedInstallment) {
          throw httpError(404, "We cannot find this installment.");
        }
      }

      const amountDue = resolveAmountDue(target, selectedInstallment);
      if (!amountDue.ok) {
        throw httpError(409, AMOUNT_DUE_MESSAGES[amountDue.reason]);
      }

      // No unique index on open payments: an expired link stays pending, and a new payment can replace it.
      const open = await tx
        .select({
          id: payment.id,
          reference: payment.reference,
          amountInCents: payment.amountInCents,
          createdAt: payment.createdAt,
        })
        .from(payment)
        .where(
          and(
            eq(payment.obligationId, data.obligationId),
            data.installmentId === undefined
              ? isNull(payment.installmentId)
              : eq(payment.installmentId, data.installmentId),
            eq(payment.status, "pending")
          )
        )
        .orderBy(desc(payment.id));
      const reusable = findReusablePayment(
        open,
        amountDue.amountInCents,
        new Date()
      );
      if (reusable) {
        return reusable;
      }

      const [row] = await tx
        .insert(payment)
        .values({
          citizenId: target.citizenId,
          obligationId: data.obligationId,
          installmentId: data.installmentId ?? null,
          amountInCents: amountDue.amountInCents,
          reference: `tp_${crypto.randomUUID()}`,
        })
        .returning({
          id: payment.id,
          reference: payment.reference,
          amountInCents: payment.amountInCents,
          createdAt: payment.createdAt,
        });
      return row;
    });

    // The same payment gives the same expiration time, so a second tab gets the same link.
    const checkoutUrl = await buildCheckoutUrl({
      publicKey: serverEnv.WOMPI_PUBLIC_KEY,
      integrityKey: serverEnv.WOMPI_INTEGRITY_KEY,
      reference: checkout.reference,
      amountInCents: checkout.amountInCents,
      currency: "COP",
      expirationTime: checkoutExpiresAt(checkout.createdAt).toISOString(),
      redirectUrl: `${serverEnv.BETTER_AUTH_URL}/payments/${checkout.id}`,
      customerData: { email: context.user.email },
    });

    return { paymentId: checkout.id, checkoutUrl };
  });

/**
 * Returns the status of one payment. The owner citizen and staff with `payment:read` can read it.
 * Other users get 404, so they cannot find out if the payment exists.
 */
export const getPaymentFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ paymentId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const rows = await db
      .select({
        id: payment.id,
        obligationId: payment.obligationId,
        installmentId: payment.installmentId,
        reference: payment.reference,
        amountInCents: payment.amountInCents,
        currency: payment.currency,
        status: payment.status,
        paymentMethodType: payment.paymentMethodType,
        finalizedAt: payment.finalizedAt,
        createdAt: payment.createdAt,
        ownerUserId: citizen.userId,
      })
      .from(payment)
      .innerJoin(citizen, eq(citizen.id, payment.citizenId))
      .where(eq(payment.id, data.paymentId));
    const row = rows.at(0);

    const isOwner = row !== undefined && row.ownerUserId === context.user.id;
    if (!row || !canReadPayment({ isOwner, role: context.user.role })) {
      return throwNotFound();
    }

    const { ownerUserId: _ownerUserId, ...result } = row;
    return { ...result, isOwner };
  });
