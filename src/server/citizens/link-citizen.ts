import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import type { DocumentType } from "@/server/db/schema/citizens";
import { runAsActor } from "@/server/db/with-actor";

export interface LinkCitizenInput {
  /** The signed-in user. */
  userId: string;
  /** The audit actor (the admin during impersonation). */
  actorId: string;
  /** The name and email of the user, for a new citizen record. */
  name: string;
  email: string;
  documentType: DocumentType;
  documentNumber: string;
}

export type LinkCitizenOutcome =
  | { ok: true; citizenId: string; created: boolean }
  | {
      ok: false;
      reason: "document_belongs_to_other_user" | "user_already_linked";
    };

/** The first word is the first name. The rest is the last name. */
const splitName = (name: string) => {
  const [firstName = "", ...rest] = name.trim().split(/\s+/u);
  return { firstName, lastName: rest.join(" ") };
};

/**
 * Links the user to the citizen with the document.
 * The ITTB registers citizens before they have an account, so the citizen can exist without a user.
 * When no citizen has the document, it creates one from the user data.
 */
export const linkCitizen = async (
  database: Database,
  input: LinkCitizenInput
): Promise<LinkCitizenOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const mine = await tx.query.citizen.findFirst({
      where: eq(citizen.userId, input.userId),
      columns: { id: true, documentType: true, documentNumber: true },
    });
    if (mine) {
      const same =
        mine.documentType === input.documentType &&
        mine.documentNumber === input.documentNumber;
      return same
        ? { ok: true, citizenId: mine.id, created: false }
        : { ok: false, reason: "user_already_linked" };
    }

    const byDocument = await tx.query.citizen.findFirst({
      where: and(
        eq(citizen.documentType, input.documentType),
        eq(citizen.documentNumber, input.documentNumber)
      ),
      columns: { id: true, userId: true },
    });
    if (byDocument) {
      if (byDocument.userId !== null) {
        return { ok: false, reason: "document_belongs_to_other_user" };
      }
      await tx
        .update(citizen)
        .set({ userId: input.userId })
        .where(eq(citizen.id, byDocument.id));
      return { ok: true, citizenId: byDocument.id, created: false };
    }

    const [created] = await tx
      .insert(citizen)
      .values({
        userId: input.userId,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        email: input.email,
        ...splitName(input.name),
      })
      .returning({ id: citizen.id });
    if (created === undefined) {
      throw new Error("The citizen insert returned no row.");
    }
    return { ok: true, citizenId: created.id, created: true };
  });
