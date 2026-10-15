import { useId } from "react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { useFieldContext } from "./form-context";
import { normalizeFieldErrors } from "./normalize-field-errors";

interface DateTimeFieldProps {
  label: string;
  /** The earliest value, as "YYYY-MM-DDTHH:mm" in the browser time zone. */
  min?: string;
  description?: string;
}

/**
 * A native `datetime-local` input for `form.AppField`.
 * The field value is "YYYY-MM-DDTHH:mm" in the browser time zone, or "" while empty.
 */
export const DateTimeField = ({
  label,
  min,
  description,
}: DateTimeFieldProps) => {
  const field = useFieldContext<string>();
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const describedBy =
    [
      description === undefined ? undefined : descriptionId,
      isInvalid ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        id={id}
        min={min}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        type="datetime-local"
        value={field.state.value}
      />
      {description === undefined ? null : (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {isInvalid ? (
        <FieldError
          errors={normalizeFieldErrors(field.state.meta.errors)}
          id={errorId}
        />
      ) : null}
    </Field>
  );
};
