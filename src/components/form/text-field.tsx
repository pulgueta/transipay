import { useId } from "react";
import type { ComponentProps } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { useFieldContext } from "./form-context";
import { normalizeFieldErrors } from "./normalize-field-errors";

type TextFieldProps = { label: string } & Omit<
  ComponentProps<typeof Input>,
  "id" | "name" | "value" | "onBlur" | "onChange" | "aria-invalid"
>;

/** Text input for `form.AppField`. It shows errors only after the user leaves the field. */
export const TextField = ({
  "aria-describedby": describedBy,
  label,
  ...props
}: TextFieldProps) => {
  const field = useFieldContext<string>();
  const id = useId();
  const errorId = `${id}-error`;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  // Screen readers read the error with the input only while the error shows.
  const describedByIds =
    [describedBy, isInvalid ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        aria-describedby={describedByIds}
        aria-invalid={isInvalid}
        id={id}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        value={field.state.value}
      />
      {isInvalid ? (
        <FieldError
          errors={normalizeFieldErrors(field.state.meta.errors)}
          id={errorId}
        />
      ) : null}
    </Field>
  );
};
