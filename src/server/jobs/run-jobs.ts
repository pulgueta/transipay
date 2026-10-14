import "@tanstack/react-start/server-only";
import { and, asc, gt, lte } from "drizzle-orm";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import { payment } from "@/server/db/schema/payments";
import {
  canStillSettleFilter,
  reconcilePayment,
} from "@/server/payments/reconcile";
import type { ReconcileDeps } from "@/server/payments/reconcile";
import type { PayoutDeps } from "@/server/payouts/port";
import { runPayoutQueue } from "@/server/payouts/queue";
import { getWompi, getWompiPayouts } from "@/server/wompi";

/**
 * The sweep reconciles a payment only after this time from the start of its checkout.
 * Before this time, the webhook usually arrives, and the citizen can still be on the checkout.
 */
export const SWEEP_MIN_AGE_MS = 5 * 60 * 1000;
/** The sweep reads the payments in pages of this size, with a keyset on `id`. */
export const SWEEP_PAGE_SIZE = 50;
/** The maximum number of payments that one run reconciles. One Wompi call for each payment. */
export const SWEEP_MAX_PAYMENTS = 200;

export interface ScheduledJobsDeps {
  payouts: PayoutDeps;
  payments: ReconcileDeps;
}

export interface ScheduledJobsResult {
  payouts: { ok: true; sent: number } | { ok: false };
  payments: { ok: true; processed: number; failed: number } | { ok: false };
}

/**
 * Reconciles the payments that can still settle (see `canStillSettle`) whose checkout started before
 * `now - SWEEP_MIN_AGE_MS`, oldest first. A declined payment inside the settle window is included,
 * because Wompi can approve a retry with the same reference after the decline webhook.
 * A failed payment (Wompi does not answer, or an error) is counted, and the sweep continues with the next payment.
 */
const sweepUnsettledPayments = async (deps: ReconcileDeps, now: Date) => {
  const startedBefore = new Date(now.getTime() - SWEEP_MIN_AGE_MS);
  let processed = 0;
  let failed = 0;
  let cursor: string | null = null;

  while (processed + failed < SWEEP_MAX_PAYMENTS) {
    const limit = Math.min(
      SWEEP_PAGE_SIZE,
      SWEEP_MAX_PAYMENTS - processed - failed
    );
    // oxlint-disable-next-line no-await-in-loop -- Each page starts after the last id of the page before it.
    const rows: { id: string }[] = await deps.database
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          canStillSettleFilter(now),
          lte(payment.createdAt, startedBefore),
          cursor === null ? undefined : gt(payment.id, cursor)
        )
      )
      .orderBy(asc(payment.id))
      .limit(limit);

    for (const row of rows) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- One Wompi call at a time.
        const result = await reconcilePayment(row.id, deps, null);
        if (result.kind === "unavailable") {
          failed += 1;
        } else {
          processed += 1;
        }
      } catch (error) {
        console.error("The scheduled reconciliation of a payment failed.", {
          paymentId: row.id,
          error,
        });
        failed += 1;
      }
    }

    const last = rows.at(-1);
    if (rows.length < limit || !last) {
      break;
    }
    cursor = last.id;
  }

  return { processed, failed };
};

/**
 * One scheduled run: the payout queue (`runPayoutQueue`), then the sweep of unsettled payments (`reconcilePayment`).
 * The audit actor is null: the scheduler, not a user, makes these changes.
 * A failure in one job does not stop the other job. The result shows which job failed.
 * Two runs at the same time are safe: the payout queue claims each payout with a lease,
 * and the reconciliation of a payment locks the payment row and has no second effect.
 */
export const runScheduledJobs = async (
  deps: ScheduledJobsDeps,
  { now = new Date() }: { now?: Date } = {}
): Promise<ScheduledJobsResult> => {
  let payouts: ScheduledJobsResult["payouts"];
  try {
    const { sent } = await runPayoutQueue(deps.payouts);
    payouts = { ok: true, sent };
  } catch (error) {
    console.error("The scheduled payout queue failed.", { error });
    payouts = { ok: false };
  }

  let payments: ScheduledJobsResult["payments"];
  try {
    payments = {
      ok: true,
      ...(await sweepUnsettledPayments(deps.payments, now)),
    };
  } catch (error) {
    console.error("The scheduled payment sweep failed.", { error });
    payments = { ok: false };
  }

  return { payouts, payments };
};

/** Runs the scheduled jobs with the configured database and Wompi accounts. */
export const runScheduledJobsWithWompi = async () =>
  await runScheduledJobs({
    payouts: {
      database: db,
      payouts: getWompiPayouts(),
      originAccountId: serverEnv.WOMPI_PAYOUTS_ACCOUNT_ID,
      actorId: null,
    },
    payments: {
      database: db,
      listTransactions: async (reference) =>
        await getWompi().transactions.listTransactions({ reference }),
    },
  });
