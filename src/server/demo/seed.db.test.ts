import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { serverEnv } from "@/env/server";
import { createAuth } from "@/server/auth";
import { createIsolatedDatabase } from "@/server/db/testing";

import { DEMO_CITIZENS, DEMO_PASSWORD, DEMO_STAFF } from "./data";
import { seedDemo } from "./seed";

const NOW = new Date("2026-11-18T15:00:00Z");

const TABLES = [
  'auth."user"',
  "auth.account",
  "entity",
  "branch",
  "staff_member",
  "citizen",
  "vehicle",
  "infraction",
  "procedure_type",
  "obligation",
  "fine",
  "procedure",
  "appointment",
  "course_session",
  "course_enrollment",
  "audit_log",
] as const;

let database: Awaited<ReturnType<typeof createIsolatedDatabase>>;

const countRows = async () => {
  const counts = await Promise.all(
    TABLES.map(async (table) => {
      const result = await database.pool.query<{ count: number }>(
        `select count(*)::int as count from ${table}`
      );
      return [table, result.rows.at(0)?.count ?? 0] as const;
    })
  );
  return Object.fromEntries(counts);
};

// better-auth allows 3 sign-ins in 10 seconds for one IP address. Each test request uses a new address.
let requestCount = 0;

const signIn = async (email: string, password: string) => {
  requestCount += 1;
  const response = await createAuth(database.db).handler(
    new Request(`${serverEnv.BETTER_AUTH_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(serverEnv.BETTER_AUTH_URL).origin,
        "x-forwarded-for": `198.51.100.${String(requestCount)}`,
      },
      body: JSON.stringify({ email, password }),
    })
  );
  return response.status;
};

const userState = async (email: string) => {
  const result = await database.pool.query<{ role: string; banned: boolean }>(
    `select role, banned from auth."user" where email = $1`,
    [email]
  );
  return result.rows.at(0);
};

describe(seedDemo, () => {
  beforeAll(async () => {
    database = await createIsolatedDatabase(inject("testDatabaseUrl"));
  });

  afterAll(async () => {
    await database.drop();
  });

  it("has a shared password that the app accepts (12 characters or more)", () => {
    expect(DEMO_PASSWORD.length).toBeGreaterThanOrEqual(12);
  });

  it("creates one account for each demo citizen and staff member", async () => {
    const summary = await seedDemo(database.pool, NOW);

    expect(summary?.domainCreated).toBeTruthy();
    const counts = await countRows();
    expect(counts.citizen).toBe(DEMO_CITIZENS.length);
    expect(counts['auth."user"']).toBe(
      DEMO_CITIZENS.length + DEMO_STAFF.length
    );
    expect(counts["auth.account"]).toBe(counts['auth."user"']);
  });

  it("creates the domain data for the staff panels", async () => {
    const counts = await countRows();
    expect({
      citizens: DEMO_CITIZENS.length >= 25,
      entities: counts.entity,
      fines: counts.fine >= 30,
      procedures: counts.procedure >= 10,
      obligations: counts.obligation === counts.fine + counts.procedure,
      sessions: counts.course_session >= 5,
      enrollments: counts.course_enrollment >= 10,
      memberships: counts.staff_member,
    }).toStrictEqual({
      citizens: true,
      entities: 4,
      fines: true,
      procedures: true,
      obligations: true,
      sessions: true,
      enrollments: true,
      memberships: 7,
    });
  });

  it("gives each staff account its role", async () => {
    const states = await Promise.all(
      DEMO_STAFF.map(async (staff) => await userState(staff.email))
    );
    expect(states.map((state) => state?.role)).toStrictEqual(
      DEMO_STAFF.map((staff) => staff.role)
    );
    expect(DEMO_STAFF.map((staff) => staff.role).toSorted()).toStrictEqual([
      "admin",
      "cashier",
      "scheduler",
      "supervisor",
    ]);
  });

  it("has upcoming and past appointments and several obligation states", async () => {
    const result = await database.pool.query<{
      upcoming: number;
      past: number;
      statuses: string[];
    }>(
      `select
         (select count(*)::int from appointment where scheduled_at > $1 and status = 'scheduled') as upcoming,
         (select count(*)::int from appointment where scheduled_at < $1 and status <> 'scheduled') as past,
         (select array_agg(distinct status order by status) from obligation) as statuses`,
      [NOW]
    );
    const facts = result.rows.at(0);
    expect(facts?.upcoming).toBeGreaterThan(0);
    expect(facts?.past).toBeGreaterThan(0);
    expect(facts?.statuses).toStrictEqual(["pending", "void"]);
  });

  it("gives the course discount only to the fines with an attended enrollment", async () => {
    const result = await database.pool.query<{
      wrong: number;
      attended: number;
    }>(
      `select
         count(*) filter (where (e.status = 'attended') <> (o.discount_in_cents > 0))::int as wrong,
         count(*) filter (where e.status = 'attended')::int as attended
       from course_enrollment e
       join obligation o on o.id = e.obligation_id`
    );
    const facts = result.rows.at(0);
    expect(facts?.wrong).toBe(0);
    expect(facts?.attended).toBeGreaterThan(0);
  });

  it("records an actor on the audit rows of the domain data", async () => {
    const result = await database.pool.query<{ count: number }>(
      `select count(*)::int as count from audit_log
       where actor_user_id is null and table_name <> 'user'`
    );
    expect(result.rows.at(0)?.count).toBe(0);
  });

  it("lets a demo citizen and each staff account sign in with the password", async () => {
    const emails = [DEMO_CITIZENS[0].email, ...DEMO_STAFF.map((s) => s.email)];
    const statuses = await Promise.all(
      emails.map(async (email) => await signIn(email, DEMO_PASSWORD))
    );
    expect(statuses).toStrictEqual(emails.map(() => 200));
    await expect(
      signIn(DEMO_CITIZENS[0].email, "wrong-password-1")
    ).resolves.toBe(401);
  });

  it("adds no rows on a second run", async () => {
    const before = await countRows();
    const summary = await seedDemo(database.pool, NOW);
    expect(summary?.domainCreated).toBeFalsy();
    await expect(countRows()).resolves.toStrictEqual(before);
  });

  it("restores a changed password, role, and ban", async () => {
    const citizenEmail = DEMO_CITIZENS[1].email;
    const cashier = DEMO_STAFF.find((staff) => staff.role === "cashier");
    const admin = DEMO_STAFF.find((staff) => staff.role === "admin");
    if (cashier === undefined || admin === undefined) {
      throw new Error("The demo staff has no cashier or admin.");
    }
    const client = await database.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `select set_config('app.actor_id', (select id::text from auth."user" where email = $1), true)`,
        [admin.email]
      );
      await client.query(
        `update auth."user" set role = 'citizen' where email = $1`,
        [cashier.email]
      );
      await client.query(
        `update auth."user" set banned = true, ban_reason = 'Test' where email = $1`,
        [citizenEmail]
      );
      await client.query(
        `update auth.account set password = 'not-a-hash'
         where user_id = (select id from auth."user" where email = $1)`,
        [citizenEmail]
      );
      await client.query("commit");
    } finally {
      client.release();
    }

    await seedDemo(database.pool, NOW);

    await expect(userState(cashier.email)).resolves.toStrictEqual({
      role: "cashier",
      banned: false,
    });
    await expect(userState(citizenEmail)).resolves.toStrictEqual({
      role: "citizen",
      banned: false,
    });
    await expect(signIn(citizenEmail, DEMO_PASSWORD)).resolves.toBe(200);
  });
});
