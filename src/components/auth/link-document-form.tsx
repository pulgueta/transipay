import { useState } from "react";
import type { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";
import { FieldGroup } from "@/components/ui/field";
import { documentSchema } from "@/lib/citizens/document";

import { FormError } from "./form-error";
import { DOCUMENT_TYPE_ITEMS } from "./sign-up-form";

export type LinkDocumentValues = z.infer<typeof documentSchema>;

interface LinkDocumentFormProps {
  /** Links the document to the account. It returns the message to show when it fails, or null. */
  onLink: (values: LinkDocumentValues) => Promise<string | null>;
}

/** For an account without a document, for example after a refused link at sign-up. */
export const LinkDocumentForm = ({ onLink }: LinkDocumentFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { documentType: "", documentNumber: "" },
    validators: { onChange: documentSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      setFormError(await onLink(documentSchema.parse(value)));
    },
  });

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FormError message={formError} />
      <FieldGroup>
        <form.AppField name="documentType">
          {(field) => (
            <field.SelectField
              items={DOCUMENT_TYPE_ITEMS}
              label="Document type"
              placeholder="Select a document type"
            />
          )}
        </form.AppField>
        <form.AppField name="documentNumber">
          {(field) => (
            <field.TextField
              autoComplete="off"
              inputMode="numeric"
              label="Document number"
            />
          )}
        </form.AppField>
      </FieldGroup>
      <form.AppForm>
        <form.SubmitButton>Link the document</form.SubmitButton>
      </form.AppForm>
    </form>
  );
};
