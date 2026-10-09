import { describe, inject, it, expect } from "vitest";

import { assertPostgresCode, createTestDatabase } from "./testing";

describe("database migrations", () => {
  it("migrations give audit log a UUIDv7 default", async () => {
    const { pool } = createTestDatabase(inject("testDatabaseUrl"));
    try {
      const result = await pool.query<{ id: string }>(
        "insert into audit_log (action, table_name, record_id) values ('insert', 'test', uuidv7()) returning id"
      );
      expect(result.rows[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      );
    } finally {
      await pool.end();
    }
  });

  it("migrations reject audit log UPDATE", async () => {
    const { pool } = createTestDatabase(inject("testDatabaseUrl"));
    try {
      const row = await pool.query<{ id: string }>(
        "insert into audit_log (action, table_name, record_id) values ('insert', 'test', uuidv7()) returning id"
      );
      await expect(
        assertPostgresCode(
          pool.query(
            "update audit_log set table_name = 'changed' where id = $1",
            [row.rows[0]?.id]
          ),
          "P0001"
        )
      ).resolves.toBeUndefined();
    } finally {
      await pool.end();
    }
  });
});
