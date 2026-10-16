import { useState } from "react";
import { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";
import { FieldGroup } from "@/components/ui/field";

import { FormError } from "./form-error";

const signInSchema = z.object({
  email: z.email("Escriba su correo electrónico."),
  password: z.string().min(1, "Escriba su contraseña."),
});

export type SignInValues = z.infer<typeof signInSchema>;

interface SignInFormProps {
  /** Signs the user in. It returns the message to show when the sign-in fails, or null. */
  onSignIn: (values: SignInValues) => Promise<string | null>;
}

export const SignInForm = ({ onSignIn }: SignInFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onChange: signInSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      setFormError(await onSignIn(value));
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
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              autoComplete="email"
              label="Correo electrónico"
              type="email"
            />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.TextField
              autoComplete="current-password"
              label="Contraseña"
              type="password"
            />
          )}
        </form.AppField>
      </FieldGroup>
      <form.AppForm>
        <form.SubmitButton>Iniciar sesión</form.SubmitButton>
      </form.AppForm>
    </form>
  );
};
