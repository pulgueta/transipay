import { createFormHook } from "@tanstack/react-form";

import { fieldContext, formContext } from "./form-context";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

/**
 * App form hook. Pass a zod schema as a validator, for example
 * `validators: { onChange: schema }` (zod 4 is a Standard Schema).
 *
 *   const form = useAppForm({ defaultValues, validators: { onChange: schema }, onSubmit });
 *   <form.AppField name="email">{(field) => <field.TextField label="Email" />}</form.AppField>
 *   <form.AppForm><form.SubmitButton>Save</form.SubmitButton></form.AppForm>
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
});
