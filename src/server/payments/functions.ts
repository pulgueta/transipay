import { buildCheckoutUrl } from "@pulgueta/wompi/server";
import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { payment, paymentAttempt } from "@/server/db/schema/payments";
import { httpError, throwNotFound } from "@/server/http-error";
import { authMiddleware, requirePermission } from "@/server/middleware/auth";
import { getWompi } from "@/server/wompi";

import { canReadPayment } from "./access";
import { canStillSettle, checkoutExpiresAt } from "./checkout";
import { createCheckout } from "./create-checkout";
import type { CheckoutRefusal } from "./create-checkout";
import { reconcilePaymentWithWompi } from "./reconcile";

/** The messages for a refused checkout. The citizen reads them, so each one says what to do next. */
const CHECKOUT_MESSAGES: Record<
  Exclude<CheckoutRefusal["reason"], "other_amount_open">,
  string
> = {
  obligation_not_found: "We cannot find this obligation.",
  installment_not_found: "We cannot find this installment.",
  obligation_not_payable: "This obligation is paid or void. You cannot pay it.",
  installment_required:
    "This obligation has a payment agreement. Select an installment to pay.",
  installment_not_allowed:
    "This obligation has no payment agreement. Pay the full amount.",
  installment_not_payable: "This installment is paid.",
  nothing_due: "This obligation has no amount to pay.",
  earlier_payment_unavailable:
    "We cannot check the status of an earlier payment now. Try again in a few minutes.",
  payment_in_progress:
    "A payment for this obligation is in progress. Wait for its result before you pay again.",
  payment_under_review:
    "Staff must examine an earlier payment for this obligation. Do not pay again. We will contact you.",
};

const CHECKOUT_STATUSES: Record<CheckoutRefusal["reason"], number> = {
  obligation_not_found: 404,
  installment_not_found: 404,
  obligation_not_payable: 409,
  installment_required: 409,
  installment_not_allowed: 409,
  installment_not_payable: 409,
  nothing_due: 409,
  earlier_payment_unavailable: 503,
  payment_in_progress: 409,
  payment_under_review: 409,
  other_amount_open: 409,
};

const formatBogotaTime = (date: Date) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

/** Maps a refused checkout to the HTTP status and the message for the citizen. */
const checkoutError = (refusal: CheckoutRefusal) =>
  httpError(
    CHECKOUT_STATUSES[refusal.reason],
    refusal.reason === "other_amount_open"
      ? `An earlier payment link with a different amount is open until ${formatBogotaTime(refusal.until)}. Wait until then to pay again.`
      : CHECKOUT_MESSAGES[refusal.reason]
  );

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
 * An open payment for the same target is given again until its link expires (see `createCheckout`).
 * Wompi collects the card or bank data, so that data does not touch our servers.
 * The result comes through the Wompi webhook, or through `refreshPaymentFn` when the webhook is lost.
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
    const outcome = await createCheckout(
      {
        userId: context.user.id,
        actorId: context.actorId,
        obligationId: data.obligationId,
        installmentId: data.installmentId ?? null,
      },
      { database: db, reconcile: reconcilePaymentWithWompi }
    );
    if (!outcome.ok) {
      throw checkoutError(outcome);
    }
    const checkout = outcome.payment;

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
 * Reads one payment for the result page. The owner citizen and staff with `payment:read` can read it.
 * Other users get 404, so they cannot find out if the payment exists.
 */
const readPaymentView = async (
  paymentId: string,
  user: { id: string; role?: string | null }
) => {
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
      attemptCount: db.$count(
        paymentAttempt,
        eq(paymentAttempt.paymentId, payment.id)
      ),
      // An attempt with a review reason waits for staff: a second approval or a target that is not payable.
      needsReview: sql<boolean>`exists (select 1 from ${paymentAttempt}
        where ${paymentAttempt.paymentId} = ${payment.id} and ${paymentAttempt.reviewReason} is not null)`,
    })
    .from(payment)
    .innerJoin(citizen, eq(citizen.id, payment.citizenId))
    .where(eq(payment.id, paymentId));
  const row = rows.at(0);

  const isOwner = row !== undefined && row.ownerUserId === user.id;
  if (!row || !canReadPayment({ isOwner, role: user.role })) {
    return throwNotFound();
  }

  const { ownerUserId: _ownerUserId, ...result } = row;
  const expiresAt = checkoutExpiresAt(row.createdAt);
  const now = new Date();
  return {
    ...result,
    isOwner,
    expiresAt,
    // Decided here with the server clock, so the page shows the same state on the server and in the browser.
    checkoutExpired: expiresAt <= now,
    // True while a late Wompi transaction can still move the payment, so the page offers a refresh.
    canStillSettle: canStillSettle(row, now),
  };
};

/** Returns the status of one payment as it is in the database (see `readPaymentView` for the access rule). */
export const getPaymentFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ paymentId: z.uuid() }))
  .handler(
    async ({ context, data }) =>
      await readPaymentView(data.paymentId, context.user)
  );

/**
 * Asks Wompi about the payment, applies what it finds, and returns the payment as it is stored after that.
 * The result page uses it when the citizen waits for a webhook that did not arrive.
 * The same access rule as `getPaymentFn`: the access check runs before the Wompi call.
 */
export const refreshPaymentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ paymentId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const current = await readPaymentView(data.paymentId, context.user);
    const result = await reconcilePaymentWithWompi(current.id, context.actorId);
    if (result.kind === "unavailable") {
      throw httpError(
        503,
        "We cannot get the payment status now. Try again in a few minutes."
      );
    }
    return await readPaymentView(current.id, context.user);
  });
