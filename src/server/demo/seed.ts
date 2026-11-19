/**
 * Seeds a public demo: demo accounts with one shared password, and sample data for Barrancabermeja.
 * It runs only when DEMO_SEED is "true". Run it after the migrations, as the table owner:
 *   DATABASE_OWNER_URL=... DEMO_SEED=true DEMO_PASSWORD=... node src/server/demo/seed.ts
 * Node runs this file without a build step, so it imports only packages and plain relative files.
 *
 * On each run it restores the demo accounts (password, role, ban, entity roles, citizen link).
 * It creates the domain data one time only: when the first demo citizen exists, the data exists.
 * All writes are in one transaction that sets `app.actor_id` to the demo admin, as `withActor` does.
 * It adds no payments or payouts: Wompi does not know them, so they cannot follow the payment rules.
 */
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { Pool } from "pg";
import type { Pool as PgPool, PoolClient } from "pg";

import {
  DEMO_BRANCHES,
  DEMO_CITIZENS,
  DEMO_ENTITIES,
  DEMO_INFRACTIONS,
  DEMO_MARKER,
  DEMO_PROCEDURE_TYPES,
  DEMO_STAFF,
  buildDemoDomain,
} from "./data.ts";

const MIN_PASSWORD_LENGTH = 12;

export interface DemoSeedSummary {
  domainCreated: boolean;
  usersCreated: number;
  usersRestored: number;
  passwordsSet: number;
  counts: Record<string, number>;
  staffEmails: Record<string, string>;
}

const ACCOUNTS = [
  ...DEMO_STAFF.map(({ name, email, role }) => ({ name, email, role })),
  ...DEMO_CITIZENS.map((citizen) => ({
    name: `${citizen.firstName} ${citizen.lastName}`,
    email: citizen.email,
    role: "citizen",
  })),
];

const COUNTED_TABLES = [
  "citizen",
  "vehicle",
  "obligation",
  "fine",
  "procedure",
  "appointment",
  "course_session",
  "course_enrollment",
  "staff_member",
] as const;

/**
 * Runs the SQL with the rows as a JSON array in $1 (read it with `json_to_recordset($1::json)`).
 * It throws when the count of written rows is not the count of rows, for example when a join found no parent.
 */
const writeRows = async (
  client: PoolClient,
  table: string,
  sql: string,
  rows: readonly object[],
  extra: readonly unknown[] = []
) => {
  const result = await client.query(sql, [JSON.stringify(rows), ...extra]);
  if (result.rowCount !== rows.length) {
    throw new Error(
      `The demo seed wrote ${String(result.rowCount)} of ${String(rows.length)} rows in ${table}.`
    );
  }
};

/** Makes the demo admin when it is missing. Its id is the audit actor of the seed. */
const ensureAdmin = async (client: PoolClient) => {
  const admin = DEMO_STAFF.find((staff) => staff.role === "admin");
  if (admin === undefined) {
    throw new Error("The demo staff has no admin.");
  }
  const result = await client.query<{ id: string }>(
    `with created as (
       insert into auth."user" (name, email, role) values ($1, $2, 'admin')
       on conflict (email) do nothing
       returning id
     )
     select id from created
     union all
     select id from auth."user" where email = $2`,
    [admin.name, admin.email]
  );
  const id = result.rows.at(0)?.id;
  if (id === undefined) {
    throw new Error("The demo admin has no id.");
  }
  return id;
};

/** Makes the missing users and restores the name, the role, and the ban of each demo user. */
const ensureUsers = async (client: PoolClient) => {
  const accounts = JSON.stringify(ACCOUNTS);
  const created = await client.query(
    `insert into auth."user" (name, email, role)
     select x.name, x.email, x.role
     from json_to_recordset($1::json) as x(name text, email text, role text)
     on conflict (email) do nothing`,
    [accounts]
  );
  const restored = await client.query(
    `update auth."user" as u
     set name = x.name, role = x.role, banned = false, ban_reason = null, ban_expires = null
     from json_to_recordset($1::json) as x(name text, email text, role text)
     where u.email = x.email
       and (u.name <> x.name or u.role <> x.role or u.banned
         or u.ban_reason is not null or u.ban_expires is not null)`,
    [accounts]
  );
  return { created: created.rowCount ?? 0, restored: restored.rowCount ?? 0 };
};

const passwordMatches = async (hash: string | null, password: string) => {
  if (hash === null) {
    return false;
  }
  try {
    return await verifyPassword({ hash, password });
  } catch {
    // A value that is not a better-auth hash does not match.
    return false;
  }
};

/**
 * Gives each demo user a credential account with the demo password, as an email sign-up does:
 * `provider_id` is "credential" and `account_id` is the user id. A hash that does not match gets a new hash.
 */
const ensurePasswords = async (client: PoolClient, password: string) => {
  const current = await client.query<{
    userId: string;
    accountId: string | null;
    hash: string | null;
  }>(
    `select u.id as "userId", a.id as "accountId", a.password as hash
     from auth."user" as u
     left join auth.account as a on a.user_id = u.id and a.provider_id = 'credential'
     where u.email = any($1::text[])`,
    [ACCOUNTS.map((account) => account.email)]
  );
  const checked = await Promise.all(
    current.rows.map(async (row) => ({
      ...row,
      matches: await passwordMatches(row.hash, password),
    }))
  );
  const missing = checked.filter((row) => row.accountId === null);
  const stale = checked.filter((row) => row.accountId !== null && !row.matches);
  if (missing.length === 0 && stale.length === 0) {
    return 0;
  }

  const hash = await hashPassword(password);
  if (missing.length > 0) {
    await writeRows(
      client,
      "auth.account",
      `insert into auth.account (account_id, provider_id, user_id, password)
       select x.user_id::text, 'credential', x.user_id, $2::text
       from json_to_recordset($1::json) as x(user_id uuid)`,
      missing.map((row) => ({ user_id: row.userId })),
      [hash]
    );
  }
  if (stale.length > 0) {
    await writeRows(
      client,
      "auth.account",
      `update auth.account as a set password = $2::text
       from json_to_recordset($1::json) as x(account_id uuid)
       where a.id = x.account_id`,
      stale.map((row) => ({ account_id: row.accountId })),
      [hash]
    );
  }
  return missing.length + stale.length;
};

const insertCatalog = async (client: PoolClient) => {
  await writeRows(
    client,
    "entity",
    `insert into entity (tax_id, kind, name, email, phone)
     select x.tax_id, x.kind, x.name, x.email, x.phone
     from json_to_recordset($1::json) as x(tax_id text, kind text, name text, email text, phone text)`,
    DEMO_ENTITIES.map((item) => ({
      tax_id: item.taxId,
      kind: item.kind,
      name: item.name,
      email: item.email,
      phone: item.phone,
    }))
  );
  await writeRows(
    client,
    "branch",
    `insert into branch (entity_id, name, address)
     select e.id, x.name, x.address
     from json_to_recordset($1::json) as x(entity_tax_id text, name text, address text)
     join entity as e on e.tax_id = x.entity_tax_id`,
    DEMO_BRANCHES.map((item) => ({
      entity_tax_id: item.entityTaxId,
      name: item.name,
      address: item.address,
    }))
  );
  // The catalog can exist already (for example, from staff). Keep the codes that exist.
  await client.query(
    `insert into infraction (code, description, amount_in_cents)
     select x.code, x.description, x.amount_in_cents
     from json_to_recordset($1::json) as x(code text, description text, amount_in_cents bigint)
     on conflict (code) do nothing`,
    [
      JSON.stringify(
        DEMO_INFRACTIONS.map((item) => ({
          code: item.code,
          description: item.description,
          amount_in_cents: item.amountInCents,
        }))
      ),
    ]
  );
  await writeRows(
    client,
    "procedure_type",
    `insert into procedure_type (entity_id, code, name, amount_in_cents, requires_appointment)
     select e.id, x.code, x.name, x.amount_in_cents, x.requires_appointment
     from json_to_recordset($1::json)
       as x(entity_tax_id text, code text, name text, amount_in_cents bigint, requires_appointment boolean)
     join entity as e on e.tax_id = x.entity_tax_id`,
    DEMO_PROCEDURE_TYPES.map((item) => ({
      entity_tax_id: item.entityTaxId,
      code: item.code,
      name: item.name,
      amount_in_cents: item.amountInCents,
      requires_appointment: item.requiresAppointment,
    }))
  );
};

const insertCitizens = async (
  client: PoolClient,
  domain: ReturnType<typeof buildDemoDomain>
) => {
  await writeRows(
    client,
    "citizen",
    `insert into citizen (user_id, document_type, document_number, first_name, last_name, email, phone, address)
     select u.id, x.document_type, x.document_number, x.first_name, x.last_name, x.email, x.phone, x.address
     from json_to_recordset($1::json) as x(document_type text, document_number text, first_name text,
       last_name text, email text, phone text, address text)
     left join auth."user" as u on u.email = x.email
       and not exists (select from citizen as linked where linked.user_id = u.id)`,
    DEMO_CITIZENS.map((item) => ({
      document_type: item.documentType,
      document_number: item.documentNumber,
      first_name: item.firstName,
      last_name: item.lastName,
      email: item.email,
      phone: item.phone,
      address: item.address,
    }))
  );
  await writeRows(
    client,
    "vehicle",
    `insert into vehicle (owner_id, plate, vehicle_type, service_type, brand, line, model_year)
     select c.id, x.plate, x.vehicle_type, x.service_type, x.brand, x.line, x.model_year
     from json_to_recordset($1::json) as x(owner_document text, plate text, vehicle_type text,
       service_type text, brand text, line text, model_year smallint)
     join citizen as c on c.document_number = x.owner_document`,
    domain.vehicles.map((item) => ({
      owner_document: item.ownerDocument,
      plate: item.plate,
      vehicle_type: item.vehicleType,
      service_type: item.serviceType,
      brand: item.brand,
      line: item.line,
      model_year: item.modelYear,
    }))
  );
};

const insertObligations = async (
  client: PoolClient,
  domain: ReturnType<typeof buildDemoDomain>
) => {
  const obligations = [
    ...domain.fines.map((item) => ({ ...item, kind: "fine" })),
    ...domain.procedures.map((item) => ({ ...item, kind: "procedure" })),
  ];
  await writeRows(
    client,
    "obligation",
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents, status, issued_at, due_on)
     select c.id, e.id, x.kind, x.number, x.amount_in_cents, x.status, x.issued_at, x.due_on
     from json_to_recordset($1::json) as x(document_number text, entity_tax_id text, kind text,
       number text, amount_in_cents bigint, status text, issued_at timestamptz, due_on date)
     join citizen as c on c.document_number = x.document_number
     join entity as e on e.tax_id = x.entity_tax_id`,
    obligations.map((item) => ({
      document_number: item.documentNumber,
      entity_tax_id: item.entityTaxId,
      kind: item.kind,
      number: item.number,
      amount_in_cents: item.amountInCents,
      status: item.status,
      issued_at: item.issuedAt,
      due_on: item.dueOn,
    }))
  );
  await writeRows(
    client,
    "fine",
    `insert into fine (obligation_id, infraction_id, vehicle_id, location, occurred_at, agent_code)
     select o.id, i.id, v.id, x.location, x.occurred_at, x.agent_code
     from json_to_recordset($1::json) as x(entity_tax_id text, number text, infraction_code text,
       plate text, location text, occurred_at timestamptz, agent_code text)
     join entity as e on e.tax_id = x.entity_tax_id
     join obligation as o on o.entity_id = e.id and o.number = x.number
     join infraction as i on i.code = x.infraction_code
     left join vehicle as v on v.plate = x.plate`,
    domain.fines.map((item) => ({
      entity_tax_id: item.entityTaxId,
      number: item.number,
      infraction_code: item.infractionCode,
      plate: item.plate,
      location: item.location,
      occurred_at: item.issuedAt,
      agent_code: item.agentCode,
    }))
  );
  await writeRows(
    client,
    "procedure",
    `insert into procedure (obligation_id, entity_id, procedure_type_id, vehicle_id)
     select o.id, e.id, t.id, v.id
     from json_to_recordset($1::json) as x(entity_tax_id text, number text, procedure_type_code text, plate text)
     join entity as e on e.tax_id = x.entity_tax_id
     join obligation as o on o.entity_id = e.id and o.number = x.number
     join procedure_type as t on t.code = x.procedure_type_code
     left join vehicle as v on v.plate = x.plate`,
    domain.procedures.map((item) => ({
      entity_tax_id: item.entityTaxId,
      number: item.number,
      procedure_type_code: item.procedureTypeCode,
      plate: item.plate,
    }))
  );
};

const insertScheduling = async (
  client: PoolClient,
  domain: ReturnType<typeof buildDemoDomain>
) => {
  await writeRows(
    client,
    "appointment",
    `insert into appointment (citizen_id, entity_id, branch_id, procedure_type_id, obligation_id, scheduled_at, status)
     select c.id, e.id, b.id, t.id, o.id, x.scheduled_at, x.status
     from json_to_recordset($1::json) as x(document_number text, entity_tax_id text, branch_name text,
       procedure_type_code text, obligation_number text, scheduled_at timestamptz, status text)
     join citizen as c on c.document_number = x.document_number
     join entity as e on e.tax_id = x.entity_tax_id
     join branch as b on b.entity_id = e.id and b.name = x.branch_name
     join procedure_type as t on t.code = x.procedure_type_code
     left join obligation as o on o.entity_id = e.id and o.number = x.obligation_number`,
    domain.appointments.map((item) => ({
      document_number: item.documentNumber,
      entity_tax_id: item.entityTaxId,
      branch_name: item.branchName,
      procedure_type_code: item.procedureTypeCode,
      obligation_number: item.obligationNumber,
      scheduled_at: item.scheduledAt,
      status: item.status,
    }))
  );
  await writeRows(
    client,
    "course_session",
    `insert into course_session (entity_id, branch_id, starts_at, ends_at, capacity, discount_percent)
     select e.id, b.id, x.starts_at, x.ends_at, x.capacity, x.discount_percent
     from json_to_recordset($1::json) as x(entity_tax_id text, branch_name text, starts_at timestamptz,
       ends_at timestamptz, capacity integer, discount_percent smallint)
     join entity as e on e.tax_id = x.entity_tax_id
     join branch as b on b.entity_id = e.id and b.name = x.branch_name`,
    domain.sessions.map((item) => ({
      entity_tax_id: item.entityTaxId,
      branch_name: item.branchName,
      starts_at: item.startsAt,
      ends_at: item.endsAt,
      capacity: item.capacity,
      discount_percent: item.discountPercent,
    }))
  );
  await writeRows(
    client,
    "course_enrollment",
    `insert into course_enrollment (course_session_id, citizen_id, obligation_id, status, attended_at)
     select s.id, c.id, o.id, x.status, x.attended_at
     from json_to_recordset($1::json) as x(document_number text, branch_name text, starts_at timestamptz,
       fine_entity_tax_id text, fine_number text, status text, attended_at timestamptz)
     join citizen as c on c.document_number = x.document_number
     join branch as b on b.name = x.branch_name
     join course_session as s on s.branch_id = b.id and s.starts_at = x.starts_at
     join entity as e on e.tax_id = x.fine_entity_tax_id
     join obligation as o on o.entity_id = e.id and o.number = x.fine_number`,
    domain.enrollments.map((item) => ({
      document_number: item.documentNumber,
      branch_name: item.branchName,
      starts_at: item.startsAt,
      fine_entity_tax_id: item.fineEntityTaxId,
      fine_number: item.fineNumber,
      status: item.status,
      attended_at: item.attendedAt,
    }))
  );
  // An attendance gives the session discount on the fine, as `recordAttendance` does.
  await client.query(
    `update obligation as o
     set discount_in_cents = round(o.amount_in_cents * s.discount_percent / 100.0)
     from course_enrollment as ce
     join course_session as s on s.id = ce.course_session_id
     where ce.obligation_id = o.id and ce.status = 'attended'
       and o.status = 'pending' and o.discount_in_cents = 0`
  );
};

/** Restores the entity roles of the staff and the user link of each demo citizen. */
const restoreLinks = async (client: PoolClient) => {
  const memberships = DEMO_STAFF.flatMap((staff) =>
    staff.memberships.map((membership) => ({
      email: staff.email,
      entity_tax_id: membership.entityTaxId,
      role: membership.role,
    }))
  );
  await client.query(
    `insert into staff_member (user_id, entity_id, role)
     select u.id, e.id, x.role
     from json_to_recordset($1::json) as x(email text, entity_tax_id text, role text)
     join auth."user" as u on u.email = x.email
     join entity as e on e.tax_id = x.entity_tax_id
     on conflict (user_id, entity_id) do update set role = excluded.role
     where staff_member.role is distinct from excluded.role`,
    [JSON.stringify(memberships)]
  );
  await client.query(
    `update citizen as c set user_id = u.id
     from json_to_recordset($1::json) as x(document_type text, document_number text, email text)
     join auth."user" as u on u.email = x.email
     where c.document_type = x.document_type and c.document_number = x.document_number
       and c.user_id is null
       and not exists (select from citizen as linked where linked.user_id = u.id)`,
    [
      JSON.stringify(
        DEMO_CITIZENS.map((item) => ({
          document_type: item.documentType,
          document_number: item.documentNumber,
          email: item.email,
        }))
      ),
    ]
  );
};

const countRows = async (client: PoolClient) => {
  const result = await client.query<Record<string, number>>(
    `select ${COUNTED_TABLES.map((table) => `(select count(*)::int from ${table}) as ${table}`).join(", ")}`
  );
  return result.rows.at(0) ?? {};
};

/** Seeds the demo in one transaction. `now` sets the dates of the domain data. */
export const seedDemo = async (
  pool: Pick<PgPool, "connect">,
  password: string,
  now: Date
): Promise<DemoSeedSummary> => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const adminId = await ensureAdmin(client);
    await client.query("select set_config('app.actor_id', $1, true)", [
      adminId,
    ]);
    const users = await ensureUsers(client);
    const passwordsSet = await ensurePasswords(client, password);

    const marker = await client.query(
      "select 1 from citizen where document_type = $1 and document_number = $2",
      [DEMO_MARKER.documentType, DEMO_MARKER.documentNumber]
    );
    const domainCreated = marker.rowCount === 0;
    if (domainCreated) {
      const domain = buildDemoDomain(now);
      await insertCatalog(client);
      await insertCitizens(client, domain);
      await insertObligations(client, domain);
      await insertScheduling(client, domain);
    }
    await restoreLinks(client);
    const counts = await countRows(client);
    await client.query("commit");
    return {
      domainCreated,
      usersCreated: users.created,
      usersRestored: users.restored,
      passwordsSet,
      counts,
      staffEmails: Object.fromEntries(
        DEMO_STAFF.map((staff) => [staff.role, staff.email])
      ),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

/** Reads DEMO_SEED and DEMO_PASSWORD. Returns null and writes nothing when DEMO_SEED is not "true". */
export const runDemoSeed = async (
  pool: Pick<PgPool, "connect">,
  env: Record<string, string | undefined>,
  now = new Date()
) => {
  if (env.DEMO_SEED !== "true") {
    return null;
  }
  const password = env.DEMO_PASSWORD ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Set DEMO_PASSWORD to ${String(MIN_PASSWORD_LENGTH)} characters or more.`
    );
  }
  return await seedDemo(pool, password, now);
};

const main = async () => {
  if (process.env.DEMO_SEED !== "true") {
    console.log("DEMO_SEED is not true. The demo seed did nothing.");
    return;
  }
  const ownerUrl = process.env.DATABASE_OWNER_URL ?? "";
  if (ownerUrl === "") {
    throw new Error("Set DATABASE_OWNER_URL to the URL of the table owner.");
  }
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    const summary = await runDemoSeed(pool, process.env);
    if (summary !== null) {
      console.log(
        summary.domainCreated
          ? "The demo seed created the domain data."
          : "The domain data exists. The demo seed did not change it."
      );
      console.log(
        `Users: ${String(summary.usersCreated)} created, ${String(summary.usersRestored)} restored. Passwords set: ${String(summary.passwordsSet)}.`
      );
      console.log("Rows:", summary.counts);
      console.log("Staff accounts:", summary.staffEmails);
    }
  } finally {
    await pool.end();
  }
};

if (import.meta.main) {
  await main();
}
