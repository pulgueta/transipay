import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";

import { normalizeDocumentNumber } from "@/lib/citizens/document";
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
      reason:
        | "document_belongs_to_other_user"
        | "document_needs_verification"
        | "user_already_linked";
    };

/** Compares two emails without case and without spaces at the start and the end. */
const sameEmail = (stored: string | null, given: string) =>
  stored !== null && stored.trim().toLowerCase() === given.trim().toLowerCase();

/** The first word is the first name. The rest is the last name. */
const splitName = (name: string) => {
  const [firstName = "", ...rest] = name.trim().split(/\s+/u);
  return { firstName, lastName: rest.join(" ") };
};

/**
 * Links the user to the citizen with the document.
 * The ITTB registers citizens before they have an account, so the citizen can exist without a user.
 * A document number is not a secret. Thus it links a registered citizen only when the email
 * of that record is the email of the user. Otherwise staff must examine the link.
 * When no citizen has the document, it creates one from the user data.
 * It compares and stores the canonical document number (see `normalizeDocumentNumber`).
 */
export const linkCitizen = async (
  database: Database,
  input: LinkCitizenInput
): Promise<LinkCitizenOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const documentNumber = normalizeDocumentNumber(input.documentNumber);
    const mine = await tx.query.citizen.findFirst({
      where: eq(citizen.userId, input.userId),
      columns: { id: true, documentType: true, documentNumber: true },
    });
    if (mine) {
      const same =
        mine.documentType === input.documentType &&
        mine.documentNumber === documentNumber;
      return same
        ? { ok: true, citizenId: mine.id, created: false }
        : { ok: false, reason: "user_already_linked" };
    }

    const byDocument = await tx.query.citizen.findFirst({
      where: and(
        eq(citizen.documentType, input.documentType),
        eq(citizen.documentNumber, documentNumber)
      ),
      columns: { id: true, userId: true, email: true },
    });
    if (byDocument) {
      if (byDocument.userId !== null) {
        return { ok: false, reason: "document_belongs_to_other_user" };
      }
      if (!sameEmail(byDocument.email, input.email)) {
        return { ok: false, reason: "document_needs_verification" };
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
        documentNumber,
        email: input.email,
        ...splitName(input.name),
      })
      .returning({ id: citizen.id });
    if (created === undefined) {
      throw new Error("The citizen insert returned no row.");
    }
    return { ok: true, citizenId: created.id, created: true };
  });
