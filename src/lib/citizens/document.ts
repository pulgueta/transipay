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
  CC: "Cédula de ciudadanía (CC)",
  CE: "Cédula de extranjería (CE)",
  TI: "Tarjeta de identidad (TI)",
  PP: "Pasaporte (PP)",
  NIT: "NIT",
  PEP: "Permiso especial de permanencia (PEP)",
} satisfies Record<DocumentType, string>;

export const documentTypeSchema = z.enum(DOCUMENT_TYPE_VALUES, {
  message: "Seleccione un tipo de documento.",
});

/**
 * The canonical form of a document number: no spaces, points, or hyphens, and uppercase letters.
 * The database accepts only this form (`citizen_document_number_canonical_check`),
 * so "ab-1.234" and "AB1234" are the same identity.
 */
export const normalizeDocumentNumber = (value: string) =>
  value.replaceAll(/[\s.-]/gu, "").toUpperCase();

export const documentNumberSchema = z
  .string()
  .transform(normalizeDocumentNumber)
  .pipe(
    z.string().regex(/^[A-Z0-9]{4,20}$/u, "Escriba de 4 a 20 letras o números.")
  );

export const documentSchema = z.object({
  documentType: documentTypeSchema,
  documentNumber: documentNumberSchema,
});
