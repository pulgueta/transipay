/**
 * Makes the login role of the app: `transipay_web`, a member of `transipay_app`.
 * Run it after the migrations, as the table owner:
 *   DATABASE_OWNER_URL=... TRANSIPAY_WEB_PASSWORD=... node src/server/db/app-login-role.ts
 * Node runs this file without a build step, so it imports only packages.
 * You can run it again. It makes a missing role and sets the password each time.
 */
import { Pool } from "pg";

export interface AppLoginRoleInput {
  roleName: string;
  password: string;
}

/** Makes the roles when they are missing, sets the password, and grants `transipay_app`. */
export const ensureAppLoginRole = async (
  database: Pick<Pool, "query">,
  input: AppLoginRoleInput
) => {
  if (input.password === "") {
    throw new Error(
      "Set TRANSIPAY_WEB_PASSWORD to the password of the app role."
    );
  }
  // Migration 0005 makes transipay_app. The check here is for a database with no migrations.
  const statements = await database.query<{ statement: string }>(
    `select statement from (
       select 1 as step, format('create role %I nologin', 'transipay_app') as statement
       where not exists (select from pg_catalog.pg_roles where rolname = 'transipay_app')
       union all
       select 2, format('create role %I login', $1::text)
       where not exists (select from pg_catalog.pg_roles where rolname = $1::text)
       union all
       -- %L quotes the password as a literal, so the password cannot change the SQL.
       select 3, format('alter role %I with login password %L', $1::text, $2::text)
       union all
       select 4, format('grant transipay_app to %I', $1::text)
     ) as steps
     order by step`,
    [input.roleName, input.password]
  );
  // One query without parameters can hold many statements. They run in this order.
  await database.query(
    statements.rows.map(({ statement }) => statement).join(";\n")
  );
};

const main = async () => {
  const ownerUrl = process.env.DATABASE_OWNER_URL ?? "";
  if (ownerUrl === "") {
    throw new Error("Set DATABASE_OWNER_URL to the URL of the table owner.");
  }
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await ensureAppLoginRole(pool, {
      roleName: "transipay_web",
      password: process.env.TRANSIPAY_WEB_PASSWORD ?? "",
    });
    console.log("The role transipay_web is ready (member of transipay_app).");
  } finally {
    await pool.end();
  }
};

if (import.meta.main) {
  await main();
}
