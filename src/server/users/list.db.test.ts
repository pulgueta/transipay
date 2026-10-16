import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { listUsers } from "./list";

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

const seedUser = async (name: string, email: string) => {
  const result = await database.pool.query<{ id: string }>(
    `insert into auth."user" (name, email) values ($1, $2) returning id`,
    [name, email]
  );
  return result.rows.at(0)?.id ?? "";
};

describe(listUsers, () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("pages the users that match the name or the email, newest first, with a keyset", async () => {
    const tag = randomUUID().slice(0, 8);
    const first = await seedUser(`Ana ${tag}`, `ana-${tag}@example.com`);
    const second = await seedUser("Bruno", `bruno-${tag}@example.com`);
    const third = await seedUser(`Carla ${tag.toUpperCase()}`, `c@${tag}.co`);
    await seedUser("Other", `other-${randomUUID()}@example.com`);

    const page1 = await listUsers(appDatabase, { search: tag, limit: 2 });
    expect(page1.users.map((user) => user.id)).toStrictEqual([third, second]);
    expect(page1).toMatchObject({ total: 3, nextCursor: second });

    const page2 = await listUsers(appDatabase, {
      search: tag,
      cursor: page1.nextCursor ?? undefined,
      limit: 2,
    });
    expect(page2).toMatchObject({
      users: [
        {
          id: first,
          name: `Ana ${tag}`,
          email: `ana-${tag}@example.com`,
          role: "citizen",
          banned: false,
          banReason: null,
          banExpires: null,
        },
      ],
      total: 3,
      nextCursor: null,
    });
  });

  it("reads a percent sign or an underscore in the search as a normal character", async () => {
    const tag = randomUUID().slice(0, 8);
    const literal = await seedUser(`50%_${tag}`, `p-${tag}@example.com`);
    await seedUser(`50ab${tag}`, `q-${tag}@example.com`);

    const page = await listUsers(appDatabase, {
      search: `50%_${tag}`,
      limit: 10,
    });

    expect(page.users.map((user) => user.id)).toStrictEqual([literal]);
  });
});
