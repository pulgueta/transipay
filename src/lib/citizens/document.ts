import { z } from "zod";

import type { DocumentType } from "@/server/db/schema/citizens";

/**
 * The document types, for the client. The schema file owns `DOCUMENT_TYPES`, but it loads Drizzle.
 * `satisfies` refuses a value that the schema does not have. The labels below refuse a missing one.
 */
export const DOCUMENT_TYPE_VALUES = [
  "CC",
  "CE",
  "TI",
  "PP",
  "NIT",
  "PEP",
] as const satisfies readonly DocumentType[];

export const DOCUMENT_TYPE_LABELS: Record<
  (typeof DOCUMENT_TYPE_VALUES)[number],
  string
> = {
  CC: "Citizen ID (CC)",
  CE: "Foreigner ID (CE)",
  TI: "Identity card (TI)",
  PP: "Passport (PP)",
  NIT: "Tax ID (NIT)",
  PEP: "Special stay permit (PEP)",
} satisfies Record<DocumentType, string>;

export const documentTypeSchema = z.enum(DOCUMENT_TYPE_VALUES, {
  message: "Select a document type.",
});

export const documentNumberSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9-]{4,20}$/u,
    "Enter 4 to 20 letters or numbers, without spaces or points."
  );

export const documentSchema = z.object({
  documentType: documentTypeSchema,
  documentNumber: documentNumberSchema,
});
