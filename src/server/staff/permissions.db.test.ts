import { createHmac, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { serverEnv } from "@/env/server";
import { createAuth } from "@/server/auth";
import { createTestDatabase } from "@/server/db/testing";

let database: ReturnType<typeof createTestDatabase>;

/** A signed-in session for a new user with the role, as `requirePermission` reads it from the cookie. */
const sessionFor = async (role: string) => {
  const result = await database.pool.query<{ id: string }>(
    `insert into auth."user" (name, email, role) values ('User', $1, $2) returning id`,
    [`${randomUUID()}@example.com`, role]
  );
  const userId = result.rows.at(0)?.id ?? "";
  const token = randomUUID();
  await database.pool.query(
    `insert into auth.session (expires_at, token, user_id)
     values (now() + interval '1 hour', $1, $2)`,
    [token, userId]
  );
  // better-call signs the token with SHA-256 HMAC and standard base64.
  const signature = createHmac("sha256", serverEnv.BETTER_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return new Headers({
    cookie: `__Secure-transipay.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
  });
};

const hasPermission = async (
  role: string,
  permissions: Record<string, string[]>
) => {
  const headers = await sessionFor(role);
  const { success } = await createAuth(database.db).api.userHasPermission({
    body: { permissions },
    headers,
  });
  return success;
};

describe("staff permissions", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it.each<Record<string, string[]>>([
    { user: ["list"] },
    { payout: ["read"] },
    { payment: ["review"] },
    { obligation: ["create"] },
    { appointment: ["update"] },
    { course: ["create"] },
  ])("refuses a citizen session for %o", async (permissions) => {
    await expect(hasPermission("citizen", permissions)).resolves.toBeFalsy();
  });

  it("lets a supervisor session review payments and a scheduler update appointments", async () => {
    await expect(
      hasPermission("supervisor", { payment: ["review"] })
    ).resolves.toBeTruthy();
    await expect(
      hasPermission("scheduler", { appointment: ["update"] })
    ).resolves.toBeTruthy();
    await expect(
      hasPermission("scheduler", { payment: ["review"] })
    ).resolves.toBeFalsy();
  });
});
