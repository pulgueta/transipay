import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const migrationsFolder = new URL("../../../drizzle/", import.meta.url).pathname;

interface SetupContext {
  provide: (key: "testDatabaseUrl", value: string) => void;
}

interface Connection {
  query: (sql: string) => Promise<void>;
  end: () => Promise<void>;
  migrate: () => Promise<void>;
}

interface Dependencies {
  connect: (url: string) => Connection;
}

export const createFreshDatabase = async (
  source: string,
  provide: SetupContext["provide"],
  dependencies: Dependencies
) => {
  const name = `transipay_test_${randomUUID().replaceAll("-", "")}`;
  const testUrl = new URL(source);
  testUrl.pathname = `/${name}`;
  const admin = dependencies.connect(source);
  let created = false;

  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const migrationPool = dependencies.connect(testUrl.toString());
    try {
      await migrationPool.migrate();
    } finally {
      await migrationPool.end();
    }
    provide("testDatabaseUrl", testUrl.toString());
  } catch (error) {
    try {
      if (created) {
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      }
    } finally {
      await admin.end();
    }
    throw error;
  }

  return async () => {
    try {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  };
};

const setup = async ({ provide }: SetupContext) => {
  const source = process.env.TEST_DATABASE_URL;
  if (source === undefined || source === "") {
    throw new Error("Set TEST_DATABASE_URL before you run database tests.");
  }

  return await createFreshDatabase(source, provide, {
    connect: (url) => {
      const pool = new Pool({ connectionString: url });
      return {
        query: async (sql) => {
          await pool.query(sql);
        },
        end: async () => {
          await pool.end();
        },
        migrate: async () => {
          await migrate(drizzle(pool), { migrationsFolder });
        },
      };
    },
  });
};

export default setup;
