import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createTestDatabase } from "./testing";

const INSUFFICIENT_PRIVILEGE = "42501";
const RAISE_EXCEPTION = "P0001";

let pool: Pool;

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

/**
 * Runs `fn` in one transaction as the application role `transipay_app`.
 * When `actorId` is set, the transaction sets `app.actor_id` as `withActor` does.
 * The transaction commits when `fn` resolves and rolls back when it rejects.
 */
const asApp = async <T>(
  fn: (client: PoolClient) => Promise<T>,
  actorId?: string,
  client?: PoolClient
) => {
  const connection = client ?? (await pool.connect());
  try {
    await connection.query("begin");
    await connection.query("set local role transipay_app");
    if (actorId !== undefined) {
      await connection.query("select set_config('app.actor_id', $1, true)", [
        actorId,
      ]);
    }
    const result = await fn(connection);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    if (!client) {
      connection.release();
    }
  }
};

const firstId = (result: { rows: { id: string }[] }) => {
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The query returned no row.");
  }
  return row.id;
};

const seedEntity = async () =>
  firstId(
    await pool.query<{ id: string }>(
      `insert into entity (kind, name, tax_id, email, phone)
       values ('cda', 'Entity', $1, 'entity@example.com', '3000000000') returning id`,
      [unique()]
    )
  );

const seedCitizen = async () =>
  firstId(
    await pool.query<{ id: string }>(
      `insert into citizen (document_type, document_number, first_name, last_name)
       values ('CC', $1, 'Ana', 'Rojas') returning id`,
      [unique()]
    )
  );

const insertBankAccount = async (client: PoolClient, entityId: string) =>
  firstId(
    await client.query<{ id: string }>(
      `insert into entity_bank_account
         (entity_id, bank_id, account_type, account_number, holder_name, holder_legal_id_type, holder_legal_id)
       values ($1, '1007', 'AHORROS', $2, 'Holder', 'NIT', '900000000') returning id`,
      [entityId, unique()]
    )
  );

const auditRows = async (tableName: string, recordId: string) => {
  const result = await pool.query<{
    action: string;
    actor_user_id: string | null;
  }>(
    "select action, actor_user_id from audit_log where table_name = $1 and record_id = $2 order by id",
    [tableName, recordId]
  );
  return result.rows;
};

const seedUser = async (input: {
  role?: string;
  banned?: boolean;
  banExpiresSql?: string;
}) =>
  firstId(
    await pool.query<{ id: string }>(
      `insert into auth."user" (name, email, role, banned, ban_reason, ban_expires)
       values ('User', $1, $2, $3, $4, ${input.banExpiresSql ?? "null"}) returning id`,
      [
        `${unique()}@example.com`,
        input.role ?? "citizen",
        input.banned ?? false,
        input.banned === true ? "Spam" : null,
      ]
    )
  );

const seedNotification = async () =>
  firstId(
    await pool.query<{ id: string }>(
      `insert into notification (citizen_id, channel, template, body)
       values ($1, 'email', 'fine_issued', 'You have a new fine.') returning id`,
      [await seedCitizen()]
    )
  );

const AUTO_UNBAN = `update auth."user" set banned = false, ban_reason = null, ban_expires = null where id = $1`;

const seedImpersonation = async () => {
  const adminId = await seedUser({ role: "admin" });
  const citizenUserId = await seedUser({});
  const sessionId = firstId(
    await pool.query<{ id: string }>(
      `insert into auth.session (expires_at, token, user_id, impersonated_by)
       values (now() + interval '1 hour', $1, $2, $3) returning id`,
      [unique(), citizenUserId, adminId]
    )
  );
  return { adminId, sessionId };
};

const sessionExists = async (sessionId: string) => {
  const result = await pool.query("select 1 from auth.session where id = $1", [
    sessionId,
  ]);
  return result.rowCount === 1;
};

describe("audit and evidence", () => {
  beforeAll(() => {
    ({ pool } = createTestDatabase(inject("testDatabaseUrl")));
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("audit_log privileges", () => {
    it("lets the app role read audit_log", async () => {
      await expect(
        asApp(async (client) => await client.query("select 1 from audit_log"))
      ).resolves.toBeDefined();
    });

    it.each([
      "insert into audit_log (action, table_name, record_id) values ('insert', 'fake', uuidv7())",
      "update audit_log set table_name = 'fake'",
      "delete from audit_log",
      "truncate audit_log",
    ])("rejects this statement by the app role: %s", async (statement) => {
      await expect(
        asApp(async (client) => await client.query(statement))
      ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    });
  });

  describe("audit trigger as the app role", () => {
    it("writes an audit row with the actor of the transaction", async () => {
      const entityId = await seedEntity();
      const actorId = randomUUID();
      const accountId = await asApp(
        async (client) => await insertBankAccount(client, entityId),
        actorId
      );
      await expect(
        auditRows("entity_bank_account", accountId)
      ).resolves.toStrictEqual([{ action: "insert", actor_user_id: actorId }]);
    });

    it("keeps the actor local to its transaction on a pooled connection", async () => {
      const entityId = await seedEntity();
      const client = await pool.connect();
      try {
        const actorId = randomUUID();
        const first = await asApp(
          async (connection) =>
            await connection.query<{ actor: string }>(
              "select current_setting('app.actor_id', true) as actor"
            ),
          actorId,
          client
        );
        expect(first.rows.at(0)?.actor).toBe(actorId);
        const accountId = await asApp(
          async (connection) => {
            const setting = await connection.query<{ actor: string | null }>(
              "select nullif(current_setting('app.actor_id', true), '') as actor"
            );
            expect(setting.rows.at(0)?.actor).toBeNull();
            return await insertBankAccount(connection, entityId);
          },
          undefined,
          client
        );
        await expect(
          auditRows("entity_bank_account", accountId)
        ).resolves.toStrictEqual([{ action: "insert", actor_user_id: null }]);
      } finally {
        client.release();
      }
    });

    it("leaves no audit row after a rollback", async () => {
      const entityId = await seedEntity();
      let accountId = "";
      await expect(
        asApp(async (client) => {
          accountId = await insertBankAccount(client, entityId);
          throw new Error("Roll back on purpose.");
        }, randomUUID())
      ).rejects.toThrow("Roll back on purpose.");
      expect(accountId).not.toBe("");
      await expect(
        auditRows("entity_bank_account", accountId)
      ).resolves.toStrictEqual([]);
    });
  });

  describe("privileged changes to auth.user need an actor", () => {
    const changes = [
      ["role", `update auth."user" set role = 'admin' where id = $1`],
      ["ban", `update auth."user" set banned = true where id = $1`],
      [
        "ban expiry",
        `update auth."user" set ban_expires = now() + interval '1 day' where id = $1`,
      ],
      ["delete", `delete from auth."user" where id = $1`],
    ] as const;

    it.each(changes)(
      "rejects a %s change without an actor",
      async (_name, statement) => {
        const userId = await seedUser({});
        await expect(
          asApp(async (client) => await client.query(statement, [userId]))
        ).rejects.toMatchObject({ code: RAISE_EXCEPTION });
      }
    );

    it.each(changes)(
      "accepts a %s change with an actor",
      async (_name, statement) => {
        const userId = await seedUser({});
        await expect(
          asApp(
            async (client) => await client.query(statement, [userId]),
            randomUUID()
          )
        ).resolves.toBeDefined();
      }
    );

    it("accepts a change to other columns without an actor", async () => {
      const userId = await seedUser({});
      await expect(
        asApp(
          async (client) =>
            await client.query(
              `update auth."user" set name = 'New name' where id = $1`,
              [userId]
            )
        )
      ).resolves.toBeDefined();
    });

    it("accepts the better-auth unban of an expired ban without an actor", async () => {
      const userId = await seedUser({
        banned: true,
        banExpiresSql: "now() - interval '1 hour'",
      });
      await expect(
        asApp(async (client) => await client.query(AUTO_UNBAN, [userId]))
      ).resolves.toBeDefined();
    });

    it.each([
      ["a ban that did not expire", "now() + interval '1 hour'"],
      ["a ban without an end", "null"],
    ])(
      "rejects an unban of %s without an actor",
      async (_name, banExpiresSql) => {
        const userId = await seedUser({ banned: true, banExpiresSql });
        await expect(
          asApp(async (client) => await client.query(AUTO_UNBAN, [userId]))
        ).rejects.toMatchObject({ code: RAISE_EXCEPTION });
      }
    );

    it("rejects a role change together with an expired unban without an actor", async () => {
      const userId = await seedUser({
        banned: true,
        banExpiresSql: "now() - interval '1 hour'",
      });
      await expect(
        asApp(
          async (client) =>
            await client.query(
              `update auth."user" set banned = false, ban_reason = null, ban_expires = null, role = 'admin' where id = $1`,
              [userId]
            )
        )
      ).rejects.toMatchObject({ code: RAISE_EXCEPTION });
    });
  });

  describe("notification is evidence", () => {
    it("writes an audit row for a notification", async () => {
      const notificationId = await seedNotification();
      await expect(
        auditRows("notification", notificationId)
      ).resolves.toStrictEqual([{ action: "insert", actor_user_id: null }]);
    });

    it("rejects a DELETE", async () => {
      const notificationId = await seedNotification();
      await expect(
        asApp(
          async (client) =>
            await client.query("delete from notification where id = $1", [
              notificationId,
            ]),
          randomUUID()
        )
      ).rejects.toMatchObject({ code: RAISE_EXCEPTION });
    });

    it.each([
      ["body", "body = 'Changed'"],
      ["subject", "subject = 'Changed'"],
      ["template", "template = 'other'"],
      ["channel", "channel = 'sms'"],
      ["citizen_id", "citizen_id = $2"],
    ])(
      "rejects an UPDATE of the snapshot column %s",
      async (_name, assignment) => {
        const notificationId = await seedNotification();
        const values = assignment.includes("$2")
          ? [notificationId, await seedCitizen()]
          : [notificationId];
        await expect(
          asApp(
            async (client) =>
              await client.query(
                `update notification set ${assignment} where id = $1`,
                values
              ),
            randomUUID()
          )
        ).rejects.toMatchObject({ code: RAISE_EXCEPTION });
      }
    );

    it("accepts an UPDATE of the delivery status", async () => {
      const notificationId = await seedNotification();
      await asApp(
        async (client) =>
          await client.query(
            "update notification set status = 'sent', sent_at = now() where id = $1",
            [notificationId]
          ),
        randomUUID()
      );
      const row = await pool.query<{ status: string }>(
        "select status from notification where id = $1",
        [notificationId]
      );
      expect(row.rows.at(0)?.status).toBe("sent");
    });
  });

  describe("impersonation sessions", () => {
    it("deletes the impersonation sessions of a deleted admin", async () => {
      const adminId = await seedUser({ role: "admin" });
      const citizenUserId = await seedUser({});
      const sessionId = firstId(
        await pool.query<{ id: string }>(
          `insert into auth.session (expires_at, token, user_id, impersonated_by)
           values (now() + interval '1 hour', $1, $2, $3) returning id`,
          [unique(), citizenUserId, adminId]
        )
      );
      await asApp(
        async (client) =>
          await client.query(`delete from auth."user" where id = $1`, [
            adminId,
          ]),
        randomUUID()
      );
      const rows = await pool.query(
        "select 1 from auth.session where id = $1",
        [sessionId]
      );
      expect(rows.rowCount).toBe(0);
    });

    it("deletes the impersonation sessions of a banned admin", async () => {
      const { adminId, sessionId } = await seedImpersonation();
      await asApp(
        async (client) =>
          await client.query(
            `update auth."user" set banned = true where id = $1`,
            [adminId]
          ),
        randomUUID()
      );
      await expect(sessionExists(sessionId)).resolves.toBeFalsy();
    });

    it("deletes the impersonation sessions of a user who is no longer admin", async () => {
      const { adminId, sessionId } = await seedImpersonation();
      await asApp(
        async (client) =>
          await client.query(
            `update auth."user" set role = 'supervisor' where id = $1`,
            [adminId]
          ),
        randomUUID()
      );
      await expect(sessionExists(sessionId)).resolves.toBeFalsy();
    });

    it("keeps the impersonation sessions of an admin who stays admin", async () => {
      const { adminId, sessionId } = await seedImpersonation();
      await asApp(
        async (client) =>
          await client.query(
            `update auth."user" set name = 'New name' where id = $1`,
            [adminId]
          ),
        randomUUID()
      );
      await expect(sessionExists(sessionId)).resolves.toBeTruthy();
    });
  });
});
