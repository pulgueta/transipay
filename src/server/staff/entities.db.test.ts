import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { listStaffEntities } from "./entities";

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

const seedEntity = async (kind: string, isActive = true) => {
  const result = await database.pool.query<{ id: string }>(
    `insert into entity (kind, name, tax_id, email, phone, is_active)
     values ($1, $2, $3, 'entity@example.com', '3000000000', $4) returning id`,
    [kind, `Entity ${unique()}`, unique(), isActive]
  );
  return result.rows.at(0)?.id ?? "";
};

describe(listStaffEntities, () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("lists only the active entities where the role has the permissions, with the role", async () => {
    const asSupervisor = await seedEntity("transit_authority");
    const asCashier = await seedEntity("transit_authority");
    const inactive = await seedEntity("cea", false);

    const rows = await listStaffEntities(appDatabase, {
      scope: {
        kind: "entities",
        memberships: [
          { entityId: asSupervisor, role: "supervisor" },
          { entityId: asCashier, role: "cashier" },
          { entityId: inactive, role: "supervisor" },
        ],
      },
      permissions: { obligation: ["create"] },
    });

    expect(rows).toStrictEqual([
      expect.objectContaining({
        id: asSupervisor,
        kind: "transit_authority",
        role: "supervisor",
      }),
    ]);
  });

  it("lists all active entities of the kind for the admin, with the admin role", async () => {
    const cea = await seedEntity("cea");

    const rows = await listStaffEntities(appDatabase, {
      scope: { kind: "all" },
      permissions: { course: ["create"] },
      kind: "cea",
    });

    expect(rows).toContainEqual(
      expect.objectContaining({ id: cea, kind: "cea", role: "admin" })
    );
    expect(rows.every((row) => row.kind === "cea")).toBeTruthy();
  });
});
