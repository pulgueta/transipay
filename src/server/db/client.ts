import "@tanstack/react-start/server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { serverEnv } from "@/env/server";

import * as audit from "./schema/audit";
import * as auth from "./schema/auth";
import * as citizens from "./schema/citizens";
import * as entities from "./schema/entities";
import * as notifications from "./schema/notifications";
import * as obligations from "./schema/obligations";
import * as payments from "./schema/payments";
import * as relations from "./schema/relations";
import * as scheduling from "./schema/scheduling";

export const schema = {
  ...audit,
  ...auth,
  ...citizens,
  ...entities,
  ...notifications,
  ...obligations,
  ...payments,
  ...relations,
  ...scheduling,
};

const pool = new Pool({ connectionString: serverEnv.DATABASE_URL });

export const db = drizzle(pool, { schema, casing: "snake_case" });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
