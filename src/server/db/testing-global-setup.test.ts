import { describe, expect, it } from "vitest";

import { createFreshDatabase } from "./testing-global-setup";

const source = "postgres://test:test@127.0.0.1/test";

describe("fresh database cleanup", () => {
  it("closes both pools when migration and database removal fail", async () => {
    const events: string[] = [];
    let connection = 0;
    const connect = () => {
      connection += 1;
      const role = connection === 1 ? "admin" : "migration";
      return {
        query: async (sql: string) => {
          events.push(`${role}:${sql}`);
          if (sql.startsWith("DROP DATABASE")) {
            await Promise.resolve();
            throw new Error("drop failed");
          }
          await Promise.resolve();
        },
        end: async () => {
          events.push(`${role}:end`);
          await Promise.resolve();
        },
        migrate: async () => {
          await Promise.resolve();
          throw new Error("migration failed");
        },
      };
    };

    await expect(
      createFreshDatabase(source, () => {}, {
        connect,
      })
    ).rejects.toThrow("drop failed");
    expect(events).toContain("migration:end");
    expect(events).toContain("admin:end");
  });

  it("closes the admin pool when teardown fails", async () => {
    const events: string[] = [];
    const connect = () => ({
      query: async (sql: string) => {
        events.push(sql);
        if (sql.startsWith("DROP DATABASE")) {
          await Promise.resolve();
          throw new Error("drop failed");
        }
        await Promise.resolve();
      },
      end: async () => {
        events.push("end");
        await Promise.resolve();
      },
      migrate: async () => {
        await Promise.resolve();
      },
    });

    const teardown = await createFreshDatabase(source, () => {}, {
      connect,
    });
    await expect(teardown()).rejects.toThrow("drop failed");
    expect(events.filter((event) => event === "end")).toHaveLength(2);
  });
});
