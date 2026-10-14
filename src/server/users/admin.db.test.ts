import { createHmac, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { serverEnv } from "@/env/server";
import { createAuth } from "@/server/auth";
import { createTestDatabase } from "@/server/db/testing";

let database: ReturnType<typeof createTestDatabase>;

const seedUser = async (role = "citizen") => {
  const result = await database.pool.query<{ id: string }>(
    `insert into auth."user" (name, email, role)
     values ('User', $1, $2) returning id`,
    [`${randomUUID()}@example.com`, role]
  );
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The user was not created.");
  }
  return row.id;
};

const adminSession = async () => {
  const adminId = await seedUser("admin");
  const token = randomUUID();
  await database.pool.query(
    `insert into auth.session (expires_at, token, user_id)
     values (now() + interval '1 hour', $1, $2)`,
    [token, adminId]
  );
  // better-call signs the token with SHA-256 HMAC and standard base64.
  const signature = createHmac("sha256", serverEnv.BETTER_AUTH_SECRET)
    .update(token)
    .digest("base64");
  const headers = new Headers({
    cookie: `__Secure-transipay.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
  });
  return { adminId, headers };
};

const userState = async (id: string) => {
  const users = await database.pool.query<{ role: string }>(
    'select role from auth."user" where id = $1',
    [id]
  );
  const audit = await database.pool.query<{
    actor_user_id: string | null;
    old_role: string;
    new_role: string;
  }>(
    `select actor_user_id, old_data ->> 'role' as old_role,
       new_data ->> 'role' as new_role from audit_log
     where table_name = 'user' and record_id = $1 and action = 'update'`,
    [id]
  );
  return { role: users.rows.at(0)?.role, audit: audit.rows };
};

describe("attributed admin actions", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("returns 404 for an HTTP role change with an admin session", async () => {
    const { headers } = await adminSession();
    const userId = await seedUser();
    headers.set("content-type", "application/json");
    headers.set("origin", serverEnv.BETTER_AUTH_URL);
    const response = await createAuth(database.db).handler(
      new Request(`${serverEnv.BETTER_AUTH_URL}/api/auth/admin/set-role`, {
        method: "POST",
        headers,
        body: JSON.stringify({ userId, role: "cashier" }),
      })
    );
    expect(response.status).toBe(404);
    await expect(userState(userId)).resolves.toStrictEqual({
      role: "citizen",
      audit: [],
    });
  });

  it("writes the role and actor through the transaction-bound admin API", async () => {
    const { adminId, headers } = await adminSession();
    const userId = await seedUser();
    await database.db.transaction(async (tx) => {
      await tx.execute(sql`set local role transipay_app`);
      await tx.execute(
        sql`select set_config('app.actor_id', ${adminId}, true)`
      );
      await createAuth(tx).api.setRole({
        body: { userId, role: "cashier" },
        headers,
      });
    });
    await expect(userState(userId)).resolves.toStrictEqual({
      role: "cashier",
      audit: [
        { actor_user_id: adminId, old_role: "citizen", new_role: "cashier" },
      ],
    });
  });

  it("rejects the same API role change without an actor", async () => {
    const { headers } = await adminSession();
    const userId = await seedUser();
    await expect(
      database.db.transaction(async (tx) => {
        await tx.execute(sql`set local role transipay_app`);
        await createAuth(tx).api.setRole({
          body: { userId, role: "cashier" },
          headers,
        });
      })
    ).rejects.toMatchObject({
      cause: {
        code: "P0001",
        message:
          "A change to the role or ban of a user needs an actor (app.actor_id)",
      },
    });
    await expect(userState(userId)).resolves.toStrictEqual({
      role: "citizen",
      audit: [],
    });
  });
});
