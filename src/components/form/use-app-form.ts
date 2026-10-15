import { createFormHook } from "@tanstack/react-form";

import { fieldContext, formContext } from "./form-context";
import { SelectField } from "./select-field";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

/**
 * App form hook. Pass a zod schema as a validator, for example
 * `validators: { onChange: schema }` (zod 4 is a Standard Schema).
 *
 * `form.AppForm` gives only the context. Put the fields in a native form that calls `form.handleSubmit()`:
 *
 *   const form = useAppForm({ defaultValues, validators: { onChange: schema }, onSubmit });
 *   <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
 *     <form.AppField name="email">{(field) => <field.TextField label="Email" />}</form.AppField>
 *     <form.AppForm><form.SubmitButton>Save</form.SubmitButton></form.AppForm>
 *   </form>
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, SelectField },
  formComponents: { SubmitButton },
});
