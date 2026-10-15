import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/server/db/client";
import { pageInputSchema } from "@/server/db/pagination";
import { throwNotFound } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";

import { listObligations, readObligation } from "./read";

/** One page of the obligations of the signed-in citizen. `hasCitizen` is false when the account has no document. */
export const listMyObligationsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ obligation: ["read"] })])
  .validator(pageInputSchema)
  .handler(
    async ({ context, data }) =>
      await listObligations(db, { userId: context.user.id, ...data })
  );

/** One obligation of the signed-in citizen. Another citizen's obligation gives 404, so its existence stays private. */
export const getMyObligationFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ obligation: ["read"] })])
  .validator(z.object({ obligationId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const result = await readObligation(db, {
      userId: context.user.id,
      obligationId: data.obligationId,
    });
    return result ?? throwNotFound();
  });
