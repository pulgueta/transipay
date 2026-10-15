import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { documentSchema } from "@/lib/citizens/document";
import { db } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { httpError } from "@/server/http-error";
import { authMiddleware } from "@/server/middleware/auth";

import { linkCitizen } from "./link-citizen";
import type { LinkCitizenOutcome } from "./link-citizen";

/** The citizen reads these messages, so each one says what to do next. */
const LINK_MESSAGES: Record<
  Extract<LinkCitizenOutcome, { ok: false }>["reason"],
  string
> = {
  document_belongs_to_other_user:
    "This document is linked to another account. If it is yours, sign in with that account or contact the ITTB.",
  user_already_linked:
    "Your account already has a document. Open your account to see it.",
};

/** Links the signed-in user to the citizen with this document, or creates the citizen. */
export const linkCitizenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(documentSchema)
  .handler(async ({ context, data }) => {
    const outcome = await linkCitizen(db, {
      userId: context.user.id,
      actorId: context.actorId,
      name: context.user.name,
      email: context.user.email,
      ...data,
    });
    if (!outcome.ok) {
      throw httpError(409, LINK_MESSAGES[outcome.reason]);
    }
    return outcome;
  });

/** The citizen record of the signed-in user, or null when the account has no document yet. */
export const getMyCitizenFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async ({ context }) =>
      (await db.query.citizen.findFirst({
        where: eq(citizen.userId, context.user.id),
        columns: {
          id: true,
          documentType: true,
          documentNumber: true,
          firstName: true,
          lastName: true,
        },
      })) ?? null
  );
