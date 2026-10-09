<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement. Before editing files for a substantial task:

- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

Use `pnpm intent <command>` in place of `pnpm exec intent <command>`. `@tanstack/devtools-vite` 0.8.5 ships an old `intent` bin that hides the real CLI. Other project skills (better-auth, Postgres, shadcn) are in `.claude/skills/`.

# Agent guide

Transipay is a platform for the Transit Inspection of Barrancabermeja (ITTB). It unifies the transit entities (ITTB, CDAs, CEAs, and collectors) in one portal and one database. Citizens look up their obligations (fines and procedures), book appointments, attend courses for a fine discount, and pay through Wompi.

## Stack

- TanStack Start (React 19, Vite 8) with TanStack Router, Query, Form, and Table v9.
- shadcn/ui (`base-nova` style, Base UI, Tabler icons). Generated components are in `src/components/ui/`.
- PostgreSQL 18 with Drizzle ORM 0.45 and the `pg` driver.
- better-auth in the Postgres schema `auth`.
- Wompi payments and payouts through `@pulgueta/wompi`.

## Commands

Use `pnpm` as the package manager.

- `pnpm dev`: start the app on port 3000.
- `pnpm check`: lint (Oxlint, type-aware) and format check (Oxfmt) through Ultracite.
- `pnpm fix`: apply the safe lint and format fixes.
- `pnpm typecheck`: run `tsc --noEmit`.
- `pnpm test`: run Vitest.
- `pnpm build`: build the app.
- `pnpm db:generate`: make a SQL migration from the schema in `src/server/db/schema/`.
- `pnpm db:migrate`: apply the migrations in `drizzle/`.
- `pnpm db:check` and `pnpm db:studio`: check the migrations and open Drizzle Studio.

Run `check`, `typecheck`, and `test` before you finish a change.

## Layout

- `src/routes/`: file routes. `api/auth/$.ts` is the better-auth handler. `api/webhooks/` has the Wompi webhooks.
- `src/server/`: server-only code. `db/` has the client, schema, `withActor`, and keyset pagination. `payments/` and `payouts/` have the Wompi logic and server functions. `middleware/auth.ts` has `authMiddleware` and `requirePermission`.
- `src/lib/auth/`: access control (shared by client and server) and the auth client.
- `src/env/`: environment validation. `server.ts` is server-only. Do not import it in client code.
- `src/components/form/` and `src/components/data-table/`: TanStack Form and Table building blocks.

## Database rules

- Every primary key is `uuid` with the default `uuidv7()`. Ids are time-ordered, so paginate with a keyset on `id` (`src/server/db/pagination.ts`). Do not use `OFFSET`.
- Use `text` with a CHECK constraint for statuses and kinds. Declare the values as an `as const` array and build the CHECK with `checkIn`. Do not use Postgres enums.
- Store money as `amount_in_cents` (`bigint`, COP). Use `timestamptz` for instants and `date` for calendar dates.
- Index every foreign key. Set `onDelete` on every foreign key.
- Do sensitive writes through `withActor(userId, fn)`. A trigger writes `audit_log` rows, and `withActor` records the actor. `audit_log` is append-only.
- Change the schema in `src/server/db/schema/`, then run `pnpm db:generate`. Do not edit applied migrations.

## Code rules

Ultracite sets the rules (`oxlint.config.ts`, `oxfmt.config.ts`). Do not add rule overrides without a reason.

- Write components and functions as arrow functions. Do not add barrel files.
- Server functions use `.middleware()`, `.validator()`, then `.handler()`. Do not use the deprecated `.inputValidator()`.
- Protect every private server function with `authMiddleware` or `requirePermission`. Webhooks have no session. The event signature is their authentication.
- Use `queryOptions` with `ensureQueryData` in loaders and `useSuspenseQuery` in components.
- Every table needs a unique `key` and a call to `useTanStackTableDevtools(table)`.
- Keep tests next to the source as `*.test.ts`. Write the test first.
- Write UI copy, docs, and comments in ASD-STE100 Simplified Technical English.
