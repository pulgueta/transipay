import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import type { Role } from "@/lib/auth/permissions";
import { createAuth } from "@/server/auth";
import { db } from "@/server/db/client";
import { withActor } from "@/server/db/with-actor";
import { requirePermission } from "@/server/middleware/auth";

import { listUsers } from "./list";

const userInput = z.object({ userId: z.uuid() });

export const USERS_PAGE_SIZE = 25;

/** Lists the users for the staff users page, newest first, with a keyset on `id` (see `listUsers`). */
export const listUsersFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ user: ["list"] })])
  .validator(
    z.object({
      search: z.string().trim().max(100).optional(),
      cursor: z.uuid().optional(),
    })
  )
  .handler(
    async ({ data }) =>
      await listUsers(db, {
        search: data.search,
        cursor: data.cursor,
        limit: USERS_PAGE_SIZE,
      })
  );

export const setUserRoleFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ user: ["set-role"] })])
  .validator(
    userInput.extend({
      role: z.enum([
        "citizen",
        "cashier",
        "scheduler",
        "supervisor",
        "admin",
      ] as const satisfies readonly Role[]),
    })
  )
  .handler(
    async ({ context, data }) =>
      await withActor(
        context.actorId,
        async (tx) =>
          await createAuth(tx).api.setRole({
            body: data,
            headers: getRequestHeaders(),
          })
      )
  );

export const banUserFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ user: ["ban"] })])
  .validator(
    userInput.extend({
      banReason: z.string().trim().min(1).optional(),
      banExpiresIn: z.number().int().positive().optional(),
    })
  )
  .handler(
    async ({ context, data }) =>
      await withActor(
        context.actorId,
        async (tx) =>
          await createAuth(tx).api.banUser({
            body: data,
            headers: getRequestHeaders(),
          })
      )
  );

export const unbanUserFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ user: ["ban"] })])
  .validator(userInput)
  .handler(
    async ({ context, data }) =>
      await withActor(
        context.actorId,
        async (tx) =>
          await createAuth(tx).api.unbanUser({
            body: data,
            headers: getRequestHeaders(),
          })
      )
  );

export const removeUserFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ user: ["delete"] })])
  .validator(userInput)
  .handler(
    async ({ context, data }) =>
      await withActor(
        context.actorId,
        async (tx) =>
          await createAuth(tx).api.removeUser({
            body: data,
            headers: getRequestHeaders(),
          })
      )
  );
