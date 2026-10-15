import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { insertPayout, seedEntity } from "./payout-testing";
import { listPayoutTargets, listPayouts } from "./staff-read";

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

describe("staff payout reads", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("lists only the payouts of the entities in the staff scope", async () => {
    const own = await seedEntity(database.pool);
    const other = await seedEntity(database.pool);
    const ownPayout = await insertPayout(database.pool, {
      ...own,
      status: "queued",
    });
    const otherPayout = await insertPayout(database.pool, {
      ...other,
      status: "queued",
    });

    const scoped = await listPayouts(appDatabase, {
      scope: { kind: "entities", entityIds: [own.entityId] },
      limit: 100,
    });
    expect(scoped.items.map((item) => item.id)).toStrictEqual([ownPayout.id]);

    const all = await listPayouts(appDatabase, {
      scope: { kind: "all" },
      limit: 100,
    });
    expect(all.items.map((item) => item.id)).toStrictEqual(
      expect.arrayContaining([ownPayout.id, otherPayout.id])
    );
  });

  it("offers only the entities in the staff scope as payout targets", async () => {
    const own = await seedEntity(database.pool);
    const other = await seedEntity(database.pool);

    const scoped = await listPayoutTargets(appDatabase, {
      kind: "entities",
      entityIds: [own.entityId],
    });
    expect(scoped.map((row) => row.id)).toStrictEqual([own.entityId]);

    const all = await listPayoutTargets(appDatabase, { kind: "all" });
    expect(all.map((row) => row.id)).toStrictEqual(
      expect.arrayContaining([own.entityId, other.entityId])
    );
  });
});
