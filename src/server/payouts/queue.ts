import "@tanstack/react-start/server-only";
import { randomUUID } from "node:crypto";

import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { entity, entityBankAccount } from "@/server/db/schema/entities";
import { payout } from "@/server/db/schema/payments";
import type { PayoutStatus } from "@/server/db/schema/payments";
import { runAsActor } from "@/server/db/with-actor";

import { buildPayoutTransaction } from "./build-transaction";
import { resolveExistingPayout } from "./idempotency";
import type { PayoutDeps } from "./port";
import { decideReconcile, readLookup } from "./reconcile";
import type { Lookup, ReconcileDecision } from "./reconcile";
import { FINAL_PAYOUT_STATUSES, statusAfterSubmission } from "./status";
import { classifySubmission } from "./submission";

/** A claim holds a payout for this time. The Wompi SDK stops a request after 30 seconds. */
const LEASE_SECONDS = 120;

/**
 * After a lookup that does not change the status, reconciliation asks Wompi again after this time.
 * A fixed step is enough: the batch reads the payouts in schedule order, so each due payout gets its turn.
 * The trigger `payout_schedule_reconcile` sets the first time when the status changes.
 */
const RECHECK_UNCERTAIN_SECONDS = 15 * 60;
const RECHECK_SUBMITTED_SECONDS = 60 * 60;
/** A payout for staff changes only when staff act or Wompi finds it later. One lookup each day is enough. */
const RECHECK_REVIEW_SECONDS = 24 * 60 * 60;

/** The maximum number of payouts that one run reconciles or sends. */
export const BATCH_SIZE = 50;

/** Reads the status from the database, after the writes. */
const readStatus = async (database: Database, payoutId: string) => {
  const rows = await database
    .select({ status: payout.status })
    .from(payout)
    .where(eq(payout.id, payoutId));
  const row = rows.at(0);
  if (!row) {
    throw new Error("The payout is missing.");
  }
  return row.status;
};

const requireValue = <T>(value: T | null): T => {
  if (value === null) {
    throw new Error("The payout command is not complete.");
  }
  return value;
};

/**
 * Claims one queued payout: `FOR UPDATE SKIP LOCKED`, then status 'submitting' with a new lease.
 * The transaction commits before the Wompi call. Returns null when no payout is free.
 * A payout after its retry deadline is not claimed (the database also refuses it).
 * A payout that waits for staff (a review reason) or has no stored origin account is not claimed
 * (the database also refuses a send without the origin account).
 */
export const claimPayout = async (
  deps: Pick<PayoutDeps, "database" | "actorId">,
  { payoutId }: { payoutId?: string } = {}
) =>
  await runAsActor(deps.database, deps.actorId, async (tx) => {
    const rows = await tx
      .select({ id: payout.id, firstDispatchAt: payout.firstDispatchAt })
      .from(payout)
      .where(
        and(
          eq(payout.status, "queued"),
          payoutId === undefined ? undefined : eq(payout.id, payoutId),
          or(
            isNull(payout.retryDeadline),
            gt(payout.retryDeadline, sql`now()`)
          ),
          isNull(payout.reviewReason),
          isNotNull(payout.originAccountId)
        )
      )
      .orderBy(payout.id)
      .limit(1)
      .for("update", { skipLocked: true });
    const row = rows.at(0);
    if (!row) {
      return null;
    }

    const leaseToken = randomUUID();
    const [claimed] = await tx
      .update(payout)
      .set({
        status: "submitting",
        leaseToken,
        leaseExpiresAt: sql`now() + make_interval(secs => ${LEASE_SECONDS})`,
      })
      .where(eq(payout.id, row.id))
      .returning();
    return {
      ...requireValue(claimed ?? null),
      leaseToken,
      firstDispatch: row.firstDispatchAt === null,
    };
  });

type ClaimedPayout = NonNullable<Awaited<ReturnType<typeof claimPayout>>>;

/**
 * Tells if the claim is still valid on the database clock: the payout is 'submitting' with the same lease,
 * the lease did not end, and the retry deadline did not pass.
 */
const claimIsValid = async (database: Database, claimed: ClaimedPayout) => {
  const rows = await database
    .select({ id: payout.id })
    .from(payout)
    .where(
      and(
        eq(payout.id, claimed.id),
        eq(payout.status, "submitting"),
        eq(payout.leaseToken, claimed.leaseToken),
        gt(payout.leaseExpiresAt, sql`now()`),
        gt(payout.retryDeadline, sql`now()`)
      )
    );
  return rows.length === 1;
};

/**
 * Sends a claimed payout to Wompi from its stored command, with its idempotency key.
 * The origin account comes from the command, never from the configuration: a retry must repeat the original request.
 * Before the send, it checks the claim again. If the claim is not valid, it does not send:
 * the lease sweep and the reconciliation handle the payout.
 * The result changes the payout only while it is 'submitting' with the same lease,
 * so it does not overwrite a newer status from a webhook or from the lease sweep.
 */
export const sendClaimed = async (deps: PayoutDeps, claimed: ClaimedPayout) => {
  if (!(await claimIsValid(deps.database, claimed))) {
    return;
  }
  const result = await deps.payouts.createPayout(
    {
      reference: claimed.reference,
      accountId: requireValue(claimed.originAccountId),
      paymentType: "PROVIDERS",
      transactions: [
        buildPayoutTransaction(
          {
            bankId: requireValue(claimed.bankId),
            accountType: requireValue(claimed.accountType),
            accountNumber: requireValue(claimed.accountNumber),
            holderName: requireValue(claimed.holderName),
            holderLegalIdType: requireValue(claimed.holderLegalIdType),
            holderLegalId: requireValue(claimed.holderLegalId),
          },
          {
            email: requireValue(claimed.recipientEmail),
            amountInCents: claimed.amountInCents,
          }
        ),
      ],
    },
    { idempotencyKey: claimed.idempotencyKey }
  );

  const submission = classifySubmission(result);
  const status = statusAfterSubmission(submission.certainty, {
    firstDispatch: claimed.firstDispatch,
  });
  await runAsActor(deps.database, deps.actorId, async (tx) => {
    await tx
      .update(payout)
      .set({
        status,
        leaseToken: null,
        leaseExpiresAt: null,
        providerPayoutId:
          submission.certainty === "accepted"
            ? submission.providerPayoutId
            : undefined,
        finalizedAt: FINAL_PAYOUT_STATUSES.includes(status) ? new Date() : null,
      })
      .where(
        and(
          eq(payout.id, claimed.id),
          eq(payout.status, "submitting"),
          eq(payout.leaseToken, claimed.leaseToken)
        )
      );
  });
};

/** Claims one queued payout and sends it with its stored command. Returns false when no payout was claimed. */
export const dispatchPayout = async (
  deps: PayoutDeps,
  options: { payoutId?: string } = {}
) => {
  const claimed = await claimPayout(deps, options);
  if (!claimed) {
    return false;
  }
  await sendClaimed(deps, claimed);
  return true;
};

/** Sends the queued payouts, one at a time. */
export const dispatchQueuedPayouts = async (deps: PayoutDeps) => {
  let sent = 0;
  // oxlint-disable-next-line no-await-in-loop -- Each claim must commit before the next one.
  while (sent < BATCH_SIZE && (await dispatchPayout(deps))) {
    sent += 1;
  }
  return sent;
};

/**
 * Moves a 'submitting' payout with an expired lease to 'uncertain': the send can have reached Wompi.
 * Also moves a queued payout after its retry deadline to 'uncertain', because a send is not safe then.
 * A queued payout without a stored origin account (queued before migration 0017) goes to staff:
 * a send with the current configuration could debit another account than the original request.
 */
export const sweepPayouts = async (
  deps: Pick<PayoutDeps, "database" | "actorId">
) => {
  await runAsActor(deps.database, deps.actorId, async (tx) => {
    await tx
      .update(payout)
      .set({ status: "uncertain", leaseToken: null, leaseExpiresAt: null })
      .where(
        or(
          and(
            eq(payout.status, "submitting"),
            lte(payout.leaseExpiresAt, sql`now()`)
          ),
          and(
            eq(payout.status, "queued"),
            lte(payout.retryDeadline, sql`now()`)
          )
        )
      );
    await tx
      .update(payout)
      .set({ reviewReason: "origin_account_missing" })
      .where(
        and(
          eq(payout.status, "queued"),
          isNull(payout.originAccountId),
          isNull(payout.reviewReason)
        )
      );
  });
};

/** Asks Wompi for the payout. A thrown error is a failed lookup, so that one payout does not stop the run. */
const lookUp = async (deps: PayoutDeps, reference: string): Promise<Lookup> => {
  try {
    return readLookup(
      await deps.payouts.listTransactionsByReference(reference)
    );
  } catch {
    return { kind: "unavailable" };
  }
};

/** The seconds until the next lookup of a payout whose status does not change. */
const recheckSeconds = (
  status: "uncertain" | "submitted",
  decision: ReconcileDecision
) => {
  if (decision.kind === "review") {
    return RECHECK_REVIEW_SECONDS;
  }
  return status === "submitted"
    ? RECHECK_SUBMITTED_SECONDS
    : RECHECK_UNCERTAIN_SECONDS;
};

/**
 * Asks Wompi about each due payout ('uncertain' or 'submitted' with `next_reconcile_at` in the past), by the payout reference.
 * See `decideReconcile`. Each change is conditional on the status that the decision used.
 * Each lookup moves the schedule of the payout, also when nothing changes or the lookup fails.
 * Thus the next run reads other payouts, and old payouts do not block the newer ones.
 */
export const reconcilePayouts = async (deps: PayoutDeps, now = new Date()) => {
  const rows = await deps.database
    .select({
      id: payout.id,
      status: payout.status,
      reference: payout.reference,
      retryDeadline: payout.retryDeadline,
    })
    .from(payout)
    .where(
      and(
        inArray(payout.status, ["uncertain", "submitted"]),
        lte(payout.nextReconcileAt, sql`now()`)
      )
    )
    .orderBy(payout.nextReconcileAt, payout.id)
    .limit(BATCH_SIZE);

  for (const row of rows) {
    if (row.status !== "uncertain" && row.status !== "submitted") {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- One Wompi lookup at a time.
    const lookup = await lookUp(deps, row.reference);
    const decision = decideReconcile({
      status: row.status,
      lookup,
      now,
      retryDeadline: row.retryDeadline,
    });

    const recheck = recheckSeconds(row.status, decision);
    const unchanged = and(eq(payout.id, row.id), eq(payout.status, row.status));
    // oxlint-disable-next-line no-await-in-loop -- One payout at a time.
    await runAsActor(deps.database, deps.actorId, async (tx) => {
      // A status change also moves the schedule (trigger `payout_schedule_reconcile`).
      if (decision.kind === "apply") {
        const providerPayoutId =
          lookup.kind === "found" ? lookup.providerPayoutId : null;
        await tx
          .update(payout)
          .set({
            status: decision.status,
            providerPayoutId: sql`coalesce(${payout.providerPayoutId}, ${providerPayoutId})`,
            reviewReason: null,
            finalizedAt: FINAL_PAYOUT_STATUSES.includes(decision.status)
              ? new Date()
              : null,
          })
          .where(unchanged);
      } else if (decision.kind === "requeue") {
        await tx
          .update(payout)
          .set({ status: "queued", reviewReason: null })
          .where(unchanged);
      } else {
        await tx
          .update(payout)
          .set({
            reviewReason:
              decision.kind === "review"
                ? "not_found_after_deadline"
                : undefined,
            nextReconcileAt: sql`now() + make_interval(secs => ${recheck})`,
          })
          .where(unchanged);
      }
    });
  }
};

/**
 * One run of the payout queue: sweep expired leases, reconcile, then send the queued payouts.
 * A staff action or a scheduler can call it. It is safe to run at the same time as another run.
 */
export const runPayoutQueue = async (deps: PayoutDeps) => {
  await sweepPayouts(deps);
  await reconcilePayouts(deps);
  return { sent: await dispatchQueuedPayouts(deps) };
};

export type CreatePayoutResult =
  | { kind: "ok"; payoutId: string; status: PayoutStatus }
  | { kind: "conflict" }
  | { kind: "entity_not_found" }
  | { kind: "entity_inactive" }
  | { kind: "no_default_account" }
  | { kind: "not_configured" };

interface CreatePayoutRequest {
  entityId: string;
  amountInCents: number;
  idempotencyKey: string;
}

/** Handles a request with a known idempotency key. It never reads the entity or its bank accounts. */
const resolveKnownKey = async (
  deps: PayoutDeps,
  request: CreatePayoutRequest
): Promise<CreatePayoutResult | null> => {
  const rows = await deps.database
    .select({
      id: payout.id,
      entityId: payout.entityId,
      amountInCents: payout.amountInCents,
      status: payout.status,
    })
    .from(payout)
    .where(eq(payout.idempotencyKey, request.idempotencyKey));
  const existing = rows.at(0);
  if (!existing) {
    return null;
  }

  const action = resolveExistingPayout(existing, request);
  if (action === "conflict") {
    return { kind: "conflict" };
  }
  if (action === "dispatch") {
    await dispatchPayout(deps, { payoutId: existing.id });
  }
  return {
    kind: "ok",
    payoutId: existing.id,
    status: await readStatus(deps.database, existing.id),
  };
};

/**
 * Queues a payout to the default bank account of an entity, then sends it.
 * The idempotency key is resolved first: a known key returns the stored payout,
 * also when the entity changed its default bank account. Only a new key reads the entity.
 * The configured origin account is stored in the command of the new payout. A later send uses the stored value.
 * The returned status comes from the database after the writes.
 */
export const createPayout = async (
  deps: PayoutDeps,
  request: CreatePayoutRequest
): Promise<CreatePayoutResult> => {
  const known = await resolveKnownKey(deps, request);
  if (known) {
    return known;
  }
  const { originAccountId } = deps;
  if (originAccountId === undefined) {
    return { kind: "not_configured" };
  }

  const targets = await deps.database
    .select({
      email: entity.email,
      isActive: entity.isActive,
      account: entityBankAccount,
    })
    .from(entity)
    .leftJoin(
      entityBankAccount,
      and(
        eq(entityBankAccount.entityId, entity.id),
        eq(entityBankAccount.isDefault, true)
      )
    )
    .where(eq(entity.id, request.entityId));
  const target = targets.at(0);
  if (!target) {
    return { kind: "entity_not_found" };
  }
  if (!target.isActive) {
    return { kind: "entity_inactive" };
  }
  const { account } = target;
  if (!account) {
    return { kind: "no_default_account" };
  }

  const inserted = await runAsActor(
    deps.database,
    deps.actorId,
    async (tx) =>
      // On a key conflict, the insert waits for the other transaction and then does nothing.
      await tx
        .insert(payout)
        .values({
          entityId: request.entityId,
          entityBankAccountId: account.id,
          amountInCents: request.amountInCents,
          reference: `tp_po_${randomUUID()}`,
          idempotencyKey: request.idempotencyKey,
          status: "queued",
          originAccountId,
          bankId: account.bankId,
          accountType: account.accountType,
          accountNumber: account.accountNumber,
          holderName: account.holderName,
          holderLegalIdType: account.holderLegalIdType,
          holderLegalId: account.holderLegalId,
          recipientEmail: target.email,
        })
        .onConflictDoNothing({ target: payout.idempotencyKey })
        .returning({ id: payout.id })
  );
  const created = inserted.at(0);
  if (!created) {
    // Another request with the same key won the insert.
    return (await resolveKnownKey(deps, request)) ?? { kind: "conflict" };
  }

  await dispatchPayout(deps, { payoutId: created.id });
  return {
    kind: "ok",
    payoutId: created.id,
    status: await readStatus(deps.database, created.id),
  };
};
