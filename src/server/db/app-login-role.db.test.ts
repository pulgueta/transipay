import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { ensureAppLoginRole } from "./app-login-role";
import { assertPostgresCode, createTestPool } from "./testing";

const INSUFFICIENT_PRIVILEGE = "42501";
const INVALID_PASSWORD = "28P01";

let owner: Pool;
// A role for each test file. Roles are cluster-wide, so a fixed name can collide with the local role.
const roleName = `transipay_web_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

/** A connection to the test database as the login role. */
const loginAs = (password: string) => {
  const url = new URL(inject("testDatabaseUrl"));
  url.username = roleName;
  url.password = password;
  return new Pool({ connectionString: url.toString(), max: 1 });
};

const roleFacts = async () => {
  const result = await owner.query<{
    canLogin: boolean;
    isMember: boolean;
    ownedTables: number;
  }>(
    `select r.rolcanlogin as "canLogin",
            pg_has_role(r.rolname, 'transipay_app', 'MEMBER') as "isMember",
            (select count(*)::int from pg_tables where tableowner = r.rolname) as "ownedTables"
     from pg_roles r where r.rolname = $1`,
    [roleName]
  );
  return result.rows.at(0);
};

describe(ensureAppLoginRole, () => {
  beforeAll(() => {
    owner = createTestPool(inject("testDatabaseUrl"));
  });

  afterAll(async () => {
    await owner.query(`drop role if exists "${roleName}"`);
    await owner.end();
  });

  it("refuses an empty password", async () => {
    await expect(
      ensureAppLoginRole(owner, { roleName, password: "" })
    ).rejects.toThrow("TRANSIPAY_WEB_PASSWORD");
  });

  it("makes a login role that is a member of transipay_app and owns no table", async () => {
    await ensureAppLoginRole(owner, { roleName, password: "first-password" });

    await expect(roleFacts()).resolves.toStrictEqual({
      canLogin: true,
      isMember: true,
      ownedTables: 0,
    });
  });

  it("lets the role read the audit log but not write it", async () => {
    const app = loginAs("first-password");
    try {
      const read = await app.query<{ count: number }>(
        "select count(*)::int as count from audit_log"
      );
      expect(read.rows.at(0)?.count).toBeGreaterThanOrEqual(0);
      await assertPostgresCode(
        app.query(
          `insert into audit_log (action, table_name, record_id)
           values ('insert', 'entity', uuidv7())`
        ),
        INSUFFICIENT_PRIVILEGE
      );
    } finally {
      await app.end();
    }
  });

  it("runs again without change and applies a new password", async () => {
    await ensureAppLoginRole(owner, { roleName, password: "first-password" });
    await ensureAppLoginRole(owner, { roleName, password: "second'password" });

    await expect(roleFacts()).resolves.toStrictEqual({
      canLogin: true,
      isMember: true,
      ownedTables: 0,
    });
    const oldPassword = loginAs("first-password");
    const newPassword = loginAs("second'password");
    try {
      await assertPostgresCode(oldPassword.query("select 1"), INVALID_PASSWORD);
      await expect(newPassword.query("select 1")).resolves.toBeDefined();
    } finally {
      await oldPassword.end();
      await newPassword.end();
    }
  });
});
