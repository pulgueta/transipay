import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import type { Role } from "@/lib/auth/permissions";
import { auth, createAuth } from "@/server/auth";
import { withActor } from "@/server/db/with-actor";
import { requirePermission } from "@/server/middleware/auth";

const userInput = z.object({ userId: z.uuid() });

export const USERS_PAGE_SIZE = 25;

/**
 * Lists the users for the staff users page, newest first.
 * The admin plugin searches one field: a search with "@" looks in the email, else in the name.
 * The plugin pages with an offset. It is the only list in the app that does, because the plugin owns the query.
 */
export const listUsersFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ user: ["list"] })])
  .validator(
    z.object({
      search: z.string().trim().max(100).optional(),
      offset: z.int().min(0).default(0),
    })
  )
  .handler(async ({ data }) => {
    const search = data.search ?? "";
    const searchQuery =
      search === ""
        ? {}
        : {
            searchValue: search,
            searchField: search.includes("@")
              ? ("email" as const)
              : ("name" as const),
            searchOperator: "contains" as const,
          };
    const result = await auth.api.listUsers({
      headers: getRequestHeaders(),
      query: {
        limit: USERS_PAGE_SIZE,
        offset: data.offset,
        sortBy: "createdAt",
        sortDirection: "desc",
        ...searchQuery,
      },
    });
    const users = result.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role ?? null,
      banned: user.banned === true,
      banReason: user.banReason ?? null,
      banExpires: user.banExpires ?? null,
      createdAt: user.createdAt,
    }));
    const nextOffset = data.offset + users.length;
    return {
      users,
      total: result.total,
      nextOffset: nextOffset < result.total ? nextOffset : null,
    };
  });

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
