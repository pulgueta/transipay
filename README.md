<img src="assets/icon.svg" width="64" height="64" alt="">

# Transipay

Transipay is a platform for the Transit Inspection of Barrancabermeja (ITTB). It puts the transit entities (ITTB, CDAs, CEAs, and collectors) in one portal and one database. A citizen can look up obligations, book an appointment, and pay from one place.

## What it does

- Keeps one state for each obligation (fine or procedure).
- Records appointments, pedagogical courses, payment agreements, and installments.
- Sends payments to Wompi Web Checkout and records the result from the Wompi webhook.
- Sends payouts (dispersions) to the bank accounts of the entities.
- Gives each user only the data and operations of their role.
- Writes an audit row for each change to sensitive data.

Transipay does not replace RUNT or SIMIT. It does not process the card transaction. Wompi does that.

## Stack

| Part     | Tool                                                              |
| -------- | ----------------------------------------------------------------- |
| App      | TanStack Start, Router, Query, Form, Table v9, React 19, Vite 8   |
| UI       | shadcn/ui (`base-nova`, Base UI), Tailwind CSS 4                  |
| Database | PostgreSQL 18, Drizzle ORM, `pg` driver, UUIDv7 primary keys      |
| Auth     | better-auth in the Postgres schema `auth`, admin plugin for roles |
| Payments | Wompi through `@pulgueta/wompi` (payments, webhooks, payouts)     |
| Tooling  | pnpm 12, TypeScript 7, Ultracite (Oxlint and Oxfmt), Vitest       |

## Start the project

You need Node.js 26, pnpm 12, and Docker or Podman.

1. Install the dependencies:

   ```sh
   pnpm install
   ```

2. Copy the environment file. Then set the values:

   ```sh
   cp .env.example .env
   ```

   Make `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Get the Wompi keys from the Wompi dashboard. Use the sandbox keys and `WOMPI_SANDBOX=true` for development.

3. Start PostgreSQL 18:

   ```sh
   docker compose up -d   # or: podman compose up -d
   ```

4. Apply the migrations:

   ```sh
   pnpm db:migrate
   ```

5. Start the app on <http://localhost:3000>:

   ```sh
   pnpm dev
   ```

## Deploy on Railway

Set these values in the settings of the app service. Railway no longer reads new `railway.json` files (Config as Code is deprecated).

| Setting | Value |
| --- | --- |
| Build command | `pnpm run build` |
| Start command | `pnpm start` |
| Pre-deploy command | `pnpm run deploy:prepare` |
| Healthcheck path | `/` |

`pnpm start` serves `dist/server/server.js` and `dist/client` with srvx on the port in `PORT`.

Set these variables on the app service:

| Variable | Value |
| --- | --- |
| `DATABASE_OWNER_URL` | The URL of the role that owns the tables. The pre-deploy command uses it. |
| `DATABASE_URL` | The URL of the app login role `transipay_web`, not the owner. |
| `TRANSIPAY_WEB_PASSWORD` | The password of `transipay_web`. It must be the same as the password in `DATABASE_URL`. |
| `BETTER_AUTH_URL` | The public HTTPS URL of the app. |
| `DEMO_SEED` | `true` adds the demo data. Any other value adds nothing. |
| `DEMO_PASSWORD` | The password of all demo accounts (12 characters or more). It is necessary when `DEMO_SEED` is `true`. |

Also set the variables of `.env.example` (`BETTER_AUTH_SECRET` and the Wompi keys).

The pre-deploy command (`pnpm run deploy:prepare`) runs these steps in this order. When a step fails, the deployment stops.

1. `pnpm db:migrate` applies the migrations as the owner.
2. `pnpm db:app-role` makes `transipay_app` and `transipay_web` when they do not exist, sets the password of `transipay_web`, and makes it a member of `transipay_app`.
3. `pnpm db:demo-seed` adds the demo data when `DEMO_SEED` is `true`.

The demo seed makes accounts on `transipay.test` with the password in `DEMO_PASSWORD`: `admin@`, `supervisor@`, `cajero@`, `agendador@`, and one account for each demo citizen. It makes the demo data (entities, citizens, fines, procedures, appointments, and courses) one time only. On each deployment, it sets the password, the role, and the ban of the demo accounts again, so that a shared demo stays usable. It makes no payments or payouts. Do not set `DEMO_SEED` on a production database with real users.

## Wompi webhooks

Set these URLs in the Wompi dashboard:

| Events | URL | Key |
| --- | --- | --- |
| Payments | `<app URL>/api/webhooks/wompi` | `WOMPI_EVENTS_KEY` |
| Payouts | `<app URL>/api/webhooks/wompi-payouts` | `WOMPI_PAYOUTS_EVENTS_KEY` |

The webhooks check the event signature. A webhook with a bad signature gets `401`. A body larger than 64 KiB gets `413`. The webhook reads the transaction or payout from the Wompi API with the signed id. If the API does not answer, the webhook returns `502` and Wompi sends the event again. The same event two times has no second effect.

A lost payment webhook does not block the citizen. The "Refresh the status" button on `/payments/$paymentId` asks Wompi for the transactions of the payment reference and applies them through the same path as the webhook. A new checkout does the same for the earlier pending payments of the obligation before it starts, so a citizen cannot pay the same obligation two times.

## Payouts

A payout goes through these states: `draft`, `queued`, `submitting`, `submitted`, then `paid` or `failed`. When the result of a send is not known, the payout goes to `uncertain`. Reconciliation (`reconcilePayoutsFn`) asks Wompi for the payout reference. It sends again only before the `retry_deadline` (23 hours after the first send). After the deadline, staff must decide.

## Scheduled jobs

`POST /api/jobs/run` runs the payout queue and reconciles the pending payments whose checkout started more than 5 minutes ago. Thus a lost webhook or no staff action does not keep a payout or a payment open.

1. Set `JOBS_SECRET` (32 characters or more, for example `openssl rand -base64 32`). When it is not set, the route gives `404`.
2. Call the route every 5 minutes from a scheduler (cron, a systemd timer, or the cron of your platform):

   ```sh
   curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" https://<host>/api/jobs/run
   ```

A missing or wrong secret gets `401`. The response gives the counts: `payouts.sent`, `payments.processed`, and `payments.failed`. When one job fails, the response is `500`, so `curl -f` fails and the scheduler shows the error. Two runs at the same time are safe.

## Scripts

| Script             | What it does                                      |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | Starts the app on port 3000.                      |
| `pnpm build`       | Builds the app.                                   |
| `pnpm start`       | Serves the build on the port in `PORT`.           |
| `pnpm check`       | Lints and checks the format.                      |
| `pnpm fix`         | Applies the safe lint and format fixes.           |
| `pnpm typecheck`   | Checks the types.                                 |
| `pnpm test`        | Runs the unit tests without a database.           |
| `pnpm test:db`     | Runs the database tests in a fresh database.      |
| `pnpm db:generate` | Makes a migration from the schema.                |
| `pnpm db:migrate`  | Applies the migrations.                           |
| `pnpm db:studio`   | Opens Drizzle Studio.                             |
| `pnpm intent list` | Shows the agent skills of the installed packages. |

To run database tests locally, use `TEST_DATABASE_URL=postgres://transipay:transipay@127.0.0.1:5432/transipay pnpm test:db`.

## Database

The domain tables are in the `public` schema. The better-auth tables are in the `auth` schema. The schema code is in `src/server/db/schema/`, and the SQL migrations are in `drizzle/`.

| Area | Tables |
| --- | --- |
| Entities | `entity`, `branch`, `entity_bank_account`, `staff_member` |
| Citizens | `citizen`, `driver_license`, `vehicle`, `vehicle_document` |
| Obligations | `infraction`, `procedure_type`, `obligation`, `fine`, `procedure` |
| Scheduling | `appointment`, `course_session`, `course_enrollment` |
| Payments | `payment`, `payment_attempt`, `payment_agreement`, `installment`, `payment_event`, `payout` |
| Records | `audit_log`, `notification` |

Each primary key is a UUIDv7 that PostgreSQL makes with `uuidv7()`. The ids are in time order, so lists use keyset pagination on `id`.

### Database roles

Run the migrations as the role that owns the tables. Run the app as a login role that is a member of `transipay_app`. This role does not own the tables and can only read `audit_log`, so the app cannot change the audit log. For example:

```sql
CREATE ROLE transipay_web LOGIN PASSWORD '<password>' IN ROLE transipay_app;
```

- The app connects as a login role that is a member of `transipay_app` (in local development, `transipay_web`). This role does not own the tables, so the protections of migration 0005 apply to it.
- Migrations run as the table owner. drizzle-kit uses `DATABASE_OWNER_URL`. When it is not set, drizzle-kit uses `DATABASE_URL`.
- Migration 0005 makes `transipay_app` only when the role does not exist. To make it, the migration role must have CREATEROLE. In production, run `CREATE ROLE transipay_app NOLOGIN;` before the migrations, or run the migrations with a role that has CREATEROLE.
- In local development, `docs/postgres/init/01-app-role.sh` makes `transipay_app` and `transipay_web`. The Postgres image runs it only when it makes a new data volume. To make a new volume, run `podman compose down -v` (or `docker compose down -v`). This deletes all local data. To add the roles to a volume that exists, run `podman exec -i -e TRANSIPAY_WEB_PASSWORD=transipay_web transipay-pg sh < docs/postgres/init/01-app-role.sh`.
