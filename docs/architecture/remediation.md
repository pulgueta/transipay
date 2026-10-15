# Stack remediation design

Status: accepted, 2026-10-09. Authors: Claude and Codex (two review rounds).

This document gives the long-term fix for the review findings on the stacked pull requests #1 to #5. Each section is one root cause. Do not fix a finding with a local patch when its root cause has a rule here.

## Summary

| # | Root cause | Rule | Layer |
| --- | --- | --- | --- |
| 1 | Layers do not build alone, and there is no CI | Each pull request must pass the same CI gate | #1 and up |
| 2 | Domain rules are independent foreign keys | One composite foreign key for each ownership rule | #2 |
| 3 | The audit log trusts the application role | The database protects the audit log, not the application | #2, #3 |
| 4 | Security settings fail open | No unsafe default when configuration is missing | #2, #3 |
| 5 | Payment logic does not match the provider | Model attempts, uncertainty, and signed identity | #5 |
| 6 | Shared UI blocks have no contract tests | Each shared block has a test for its contract | #4 |

## 1. Each layer must build alone

### Problem

Layer #1 enables TanStack Start without a router. Layer #4 has a generated route tree that refers to routes from layer #5. Layer #5 sends the citizen to a route that does not exist.

### Rule

- The CI workflow `.github/workflows/ci.yml` runs on each pull request: `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- CI fails if `src/routeTree.gen.ts` changes after `pnpm build`. The build writes the route tree, so a difference shows that the committed tree is stale.
- From layer #2, CI applies all migrations to a clean PostgreSQL 18 and runs the database tests (`pnpm test:db`).
- Layer #1 has a minimal router and root route. Layer #4 adds to them. The `db:*` scripts move to layer #2, with `drizzle.config.ts`.

## 2. Domain rules live in the database

### Problem

Two foreign keys on one row are checked one by one. For example, a payout for entity A can use a bank account of entity B, and a course discount for citizen A can point to a fine of citizen B.

### Rule

- Each ownership rule is one named composite foreign key. The parent has `UNIQUE (id, owner_id)`. The child keeps `owner_id` and refers to `(id, owner_id)`. This extends the `(id, kind)` subtype pattern that fines and procedures use.
- Add a rule only when the domain requires it. Do not copy owners into all tables. A CEA can give a course that discounts an ITTB fine, so the course entity and the fine creditor can be different.
- Each rule has a negative test on a real PostgreSQL database for INSERT and for UPDATE. It also has a positive test for each valid cross-entity case.

### Rules in this change

| Child | Rule |
| --- | --- |
| `payout` | The bank account belongs to the payout entity. |
| `payment` | The installment belongs to an agreement of the same obligation. |
| `course_enrollment` | The obligation belongs to the enrolled citizen and is a `fine`. |
| `notification` | The obligation belongs to the recipient citizen. |
| `procedure` | The procedure type belongs to the obligation creditor. |
| `appointment` | The branch and the procedure type belong to the same entity. The obligation belongs to the citizen. |
| `course_session` | The branch belongs to the session entity. |
| `obligation` | A `procedure` can have an amount of zero. A `fine` must have an amount larger than zero. |

## 3. The database protects the audit log

### Problem

The audit trigger runs as the caller. The application role must have INSERT on `audit_log`, so it can also write false audit rows. better-auth admin actions (set role, ban, remove user) do not go through `withActor`, so their audit rows have no actor. A notification is legal evidence, but a DELETE removes it without a trace.

### Rule

- The application connects as a role that does not own the tables (`transipay_app`). Migrations run as the owner.
- The audit trigger function is `SECURITY DEFINER`, has a fixed `search_path`, and is owned by the table owner. The application role has only SELECT on `audit_log`.
- A trigger rejects privileged changes without an actor: a change to `auth.user.role` or to the ban columns, and a delete of a user.
- better-auth admin endpoints are in `disabledPaths`, so HTTP clients cannot call them. Our server functions call them through `createAuth(tx)` inside `withActor(actorId, tx => ...)`. The admin write and the actor setting then use the same connection and the same transaction.
- A notification keeps its content and recipient as a snapshot that does not change. The database rejects UPDATE of the snapshot columns and rejects DELETE.
- `appointment`, `course_session`, and `course_enrollment` have the audit trigger (migration 0018). Staff close appointments and record course attendance, and an attendance gives a fine discount.
- Staff record course attendance only after the session ends (database clock), because each result closes the enrollment. A session discount is from 1% to 99%, and an attendance that makes a fine free is refused, because a fine is settled only by a payment.

### Limit

`SECURITY DEFINER` does not stop a compromised application from setting a false actor id. It stops false audit rows and changes without an actor.

## 4. No unsafe default

### Rule

- When an admin is deleted, the database deletes the impersonation sessions of that admin (`ON DELETE CASCADE`).
- The auth middleware rejects an impersonation session when the admin does not exist, is banned, or no longer has the admin role.
- better-auth decides secure cookies from the HTTPS base URL. The code does not override it.
- A response that depends on the session has `Cache-Control: private, no-store`.
- The local database port listens only on `127.0.0.1`.
- A staff member works only with the entities of their `staff_member` rows (`staffScopeFor`). The admin works with all entities. Each staff read and write of entity data (obligations, payment reviews, payouts, appointments, course sessions, attendance) uses this scope. A record outside the scope reads as not found, and a write for an entity outside the scope is refused.
- A document number is not a secret. The server links an account to a registered citizen only when the email of the citizen record is the email of the account. Otherwise staff must link it.
- After sign-in, sign-up, and sign-out, the client removes all cached queries, because the query keys do not include the user.

### Open product decisions

- Sign-up can show if an email is registered. This is the better-auth default. The fix (email verification) needs email delivery first.
- Procedure codes are unique in the full system. A unique code for each entity is possible. The domain owner decides.

## 5. Payments match the provider

### Problem

Wompi can create a second transaction with the same reference after a decline (payment retry). The code marks that approval as a conflict, so the money is collected and the obligation stays unpaid. Payout logic treats HTTP 408 as a rejection, sends again after the 24-hour idempotency window, and returns a status that is not in the database. Webhooks find the local row by `reference`, but the event signature does not cover `reference`.

### Payments

- A payment is an intent. It has one or more attempts (`payment_attempt`). Each attempt is one Wompi transaction, and its transaction id is unique.
- The payment is approved when one attempt is approved. A second approval for the same payment goes to review (possible overpayment).
- A webhook only tells us that a transaction changed. After the signature check, the server gets the transaction from the Wompi API with the signed transaction id. The API response gives the reference and the status that we use.
- Receipt deduplication: `UNIQUE (integration, checksum)` on `payment_event`. Payout events use the same table.
- A `payment_event` row is a receipt. The trigger `payment_event_keep_receipt` refuses a delete and a change to a column other than `processed_at`. `processed_at` goes from null to a value one time. Thus the application cannot remove a receipt and record the same event again.
- Financial idempotency: the unique transaction id and a locked, conditional update. A different checksum must never cause a second money effect.
- An event that needs review stays unprocessed. Staff or a later run can process it again.
- Webhook routes read at most 64 KiB of body. A larger body gets HTTP 413 before the signature check.
- The checkout returns the citizen to `/payments/$paymentId`, which shows the payment status.
- A webhook can be lost. Reconciliation (`reconcilePayment`) asks Wompi for the transactions of the payment reference (`GET /transactions?reference=`) and applies each one through the same path as the webhook, so an approval pays the obligation one time only and a repeat changes nothing. A transaction with another reference is ignored. The result page refresh (`refreshPaymentFn`, same access rule as `getPaymentFn`) reconciles, then returns the payment as stored. The Wompi call runs outside the database transaction.
- A payment whose checkout link expired with no transaction becomes `expired`. A late transaction for that reference still moves the payment, because the money is collected. The result page shows "Payment link expired" and lets the citizen pay again.
- A payment that is not approved can still settle inside a window of 24 hours after its checkout started (`SETTLE_WINDOW_MS`, `canStillSettle`): Wompi can approve a retry with the same reference after a decline, and a bank transfer that started before the link expired can settle hours later. A pending payment can always settle. Inside the window, the checkout and the sweep reconcile a declined, voided, error, or expired payment, and the result page offers a refresh for it. After the window, a late approval still moves the payment through a webhook or a manual reconciliation.
- Before a new checkout, each payment of the same obligation (all targets) that can still settle is reconciled. Then, inside the obligation row lock: an approved payment makes the target not payable, so the checkout is refused; an approved attempt with a review reason on any target of the obligation refuses the checkout ("staff must examine an earlier payment", HTTP 409), because the money is collected and the obligation is not paid; a pending Wompi transaction on any target of the obligation refuses the checkout ("a payment is in progress"); an open link with the same amount is given again; an open link with a different amount refuses the checkout until it expires (the message gives the time); an expired link with no transaction does not block. When Wompi cannot answer, the checkout returns 503 and starts nothing.
- An attempt with a `review_reason` makes the result page show "Payment under review": staff must examine it and the citizen must not pay again. The page never shows an unresolved payment as complete.

### Payouts

The payout row is the queue. There is no broker and no outbox.

```
draft -> queued -> submitting -> submitted -> paid | failed
                         \-> uncertain -> (reconcile) -> submitted | failed | uncertain
```

- `queued` stores a command that does not change: origin account, bank account snapshot, amount, reference, idempotency key, hash, `first_dispatch_at`, and `retry_deadline` (first dispatch plus 23 hours). The origin account (`origin_account_id`) comes from the configuration only when the payout is queued; a send always uses the stored value, so a retry repeats the original request also when the configuration changed. A payout queued before migration 0017 has no origin account: the dispatcher never claims it, the database refuses its send, and the sweep marks it for staff (`origin_account_missing`). A review reason on a queued payout holds it until staff clear the reason.
- A dispatcher claims a row with `FOR UPDATE SKIP LOCKED`, writes a lease, and commits before it calls Wompi.
- Immediately before the send, the dispatcher examines the claim again on the database clock: the same lease, the lease did not end, and `retry_deadline` did not pass. If the claim is not valid, it does not send.
- The result has two parts: submission certainty (`accepted`, `rejected`, `unknown`) and financial status (from Wompi). HTTP 408, 429, 5xx, 409, and network errors are `unknown`.
- `unknown` moves the payout to `uncertain`. An expired lease also moves it to `uncertain`. An `uncertain` payout is not sent again without reconciliation. Reconciliation asks Wompi for transactions with the payout reference. After `retry_deadline`, an empty answer does not allow a new send. Staff must decide.
- Reconciliation reads the due payouts in `next_reconcile_at` order. Each lookup moves this time, also when the status does not change or the lookup fails (uncertain: 15 minutes, submitted: 1 hour, staff review: 24 hours). Thus old payouts do not stop the reconciliation of newer payouts.
- A status change from the dispatcher is conditional, so it cannot overwrite a newer status from a webhook.
- A server function returns the status from the database after the write.
- An idempotency key is resolved before any other check, so a retry of a known request never fails because the default bank account changed.

### Scheduled jobs

- `POST /api/jobs/run` (`runScheduledJobs`) runs the payout queue (`runPayoutQueue`), then sweeps the pending payments through `reconcilePayment`. Without it, the queue runs only when staff call `reconcilePayoutsFn`, and a payment is reconciled only when the citizen refreshes the result page.
- Call it every 5 minutes from any scheduler (cron, a systemd timer, or a platform cron): `curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" https://<host>/api/jobs/run`.
- Authentication: `Authorization: Bearer <JOBS_SECRET>`. The server compares the SHA-256 digests with `timingSafeEqual`. When `JOBS_SECRET` is not set, the route gives 404 for all methods. A missing or wrong secret gets 401 with no detail. Another method gets 405. A body larger than 1 KiB gets 413.
- The audit actor is null, as for the webhooks: the scheduler, not a user, makes the changes.
- The sweep reads the payments that can still settle (pending, or not approved and inside the settle window) whose checkout started more than 5 minutes ago, oldest first, with a keyset on `id` (pages of 50, not more than 200 payments in one run). The partial index `payment_unsettled_created_at_idx` serves the settle-window branch. A payment that fails (Wompi does not answer, or an error) is counted, and the sweep continues.
- A failure of one job does not stop the other job. The response gives the counts and is 500 when a job failed.
- Two runs at the same time are safe without an extra lock: the queue claims each payout with `FOR UPDATE SKIP LOCKED` and a lease, and `reconcilePayment` locks the payment row and has no second effect. Two runs can ask Wompi about the same payment two times.

## 6. Shared UI blocks have contract tests

- `DataTable` renders only visible cells, and the empty row spans the visible columns.
- `TextField` shows string errors and `{ message }` errors.
- Component tests run in the Vitest `jsdom` environment.

## Order of work

The order puts the most risk reduction for the effort first.

1. Payout state machine and reconciliation (#5).
2. Signed webhook identity and payment attempts (#5).
3. Composite foreign keys with database tests (#2).
4. Audit role and attributed admin actions (#2, #3).
5. CI for each pull request and the minimal router (#1).

The implementation order is bottom-up (CI and the database test harness first), because later tasks need them for their tests.
