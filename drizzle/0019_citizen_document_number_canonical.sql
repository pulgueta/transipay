-- Store each document number in the canonical form: no spaces, points, or hyphens, and uppercase letters.
-- If two rows have the same canonical number, the unique constraint stops the migration. Staff must merge them first.
UPDATE "citizen" SET "document_number" = upper(regexp_replace("document_number", '[\s.-]', '', 'g')) WHERE "document_number" <> upper(regexp_replace("document_number", '[\s.-]', '', 'g'));--> statement-breakpoint
ALTER TABLE "citizen" ADD CONSTRAINT "citizen_document_number_canonical_check" CHECK ("citizen"."document_number" = upper(regexp_replace("citizen"."document_number", '[\s.-]', '', 'g')));
