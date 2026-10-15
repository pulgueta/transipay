import { useId } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useFieldContext } from "./form-context";
import { normalizeFieldErrors } from "./normalize-field-errors";

export interface SelectFieldItem {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  items: readonly SelectFieldItem[];
  /** Shows while no item is selected. */
  placeholder: string;
}

/** Select for `form.AppField`. The field value is the item value, or "" while nothing is selected. */
export const SelectField = ({
  label,
  items,
  placeholder,
}: SelectFieldProps) => {
  const field = useFieldContext<string>();
  const id = useId();
  const errorId = `${id}-error`;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        name={field.name}
        onValueChange={(value) => {
          field.handleChange(value ?? "");
        }}
        value={field.state.value === "" ? null : field.state.value}
      >
        <SelectTrigger
          aria-describedby={isInvalid ? errorId : undefined}
          aria-invalid={isInvalid}
          className="w-full"
          id={id}
          onBlur={field.handleBlur}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {isInvalid ? (
        <FieldError
          errors={normalizeFieldErrors(field.state.meta.errors)}
          id={errorId}
        />
      ) : null}
    </Field>
  );
};
