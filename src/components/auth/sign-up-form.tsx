import { useState } from "react";
import { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import {
  DOCUMENT_TYPE_LABELS,
  documentNumberSchema,
  documentTypeSchema,
} from "@/lib/citizens/document";

import { FormError } from "./form-error";

/** The password length that `src/server/auth.ts` requires. */
export const MIN_PASSWORD_LENGTH = 12;

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.email("Enter your email address."),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use ${MIN_PASSWORD_LENGTH} characters or more.`),
  documentType: documentTypeSchema,
  documentNumber: documentNumberSchema,
});

export type SignUpValues = z.infer<typeof signUpSchema>;

export const DOCUMENT_TYPE_ITEMS = Object.entries(DOCUMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

interface SignUpFormProps {
  /** Creates the account. It returns the message to show when it fails, or null. */
  onSignUp: (values: SignUpValues) => Promise<string | null>;
}

export const SignUpForm = ({ onSignUp }: SignUpFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      documentType: "",
      documentNumber: "",
    },
    validators: { onChange: signUpSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      // The schema makes sure that the document type is valid before this runs.
      setFormError(await onSignUp(signUpSchema.parse(value)));
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
        <form.AppField name="name">
          {(field) => <field.TextField autoComplete="name" label="Full name" />}
        </form.AppField>
        <form.AppField name="email">
          {(field) => (
            <field.TextField autoComplete="email" label="Email" type="email" />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.TextField
              aria-describedby="sign-up-password-hint"
              autoComplete="new-password"
              label="Password"
              type="password"
            />
          )}
        </form.AppField>
        <FieldDescription id="sign-up-password-hint">
          Use {MIN_PASSWORD_LENGTH} characters or more.
        </FieldDescription>
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
              aria-describedby="sign-up-document-hint"
              autoComplete="off"
              inputMode="numeric"
              label="Document number"
            />
          )}
        </form.AppField>
        <FieldDescription id="sign-up-document-hint">
          We use it to find your fines and procedures.
        </FieldDescription>
      </FieldGroup>
      <form.AppForm>
        <form.SubmitButton>Create account</form.SubmitButton>
      </form.AppForm>
    </form>
  );
};
