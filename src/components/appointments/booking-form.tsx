import { useState } from "react";
import { z } from "zod";

import { FormError } from "@/components/auth/form-error";
import { useAppForm } from "@/components/form/use-app-form";
import { FieldGroup } from "@/components/ui/field";
import {
  bogotaWallClockToInstant,
  toBogotaDateTimeLocalValue,
} from "@/lib/dates";
import { formatAmount } from "@/lib/format-amount";
import type { readBookingOptions } from "@/server/appointments/appointments";
import { earliestScheduledAt } from "@/server/appointments/decisions";

type BookingOptions = Awaited<ReturnType<typeof readBookingOptions>>;

const NO_OBLIGATION = "none";

const formSchema = z.object({
  entityId: z.string().min(1, "Select an entity."),
  branchId: z.string().min(1, "Select a branch."),
  procedureTypeId: z.string().min(1, "Select a procedure."),
  obligationId: z.string(),
  scheduledAt: z.string().min(1, "Select a date and time."),
});

export interface BookingValues {
  entityId: string;
  branchId: string;
  procedureTypeId: string;
  obligationId?: string;
  /** ISO instant. */
  scheduledAt: string;
}

interface BookingFormProps {
  options: BookingOptions;
  /** Preselects a procedure obligation and its entity. */
  obligationId?: string;
  /** Books the appointment. It returns the message to show when it fails, or null. */
  onBook: (values: BookingValues) => Promise<string | null>;
}

export const BookingForm = ({
  options,
  obligationId,
  onBook,
}: BookingFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const prefilled = options.obligations.find(
    (item) => item.id === obligationId
  );
  // Bogota time, where the branches are. The device time zone has no effect.
  // oxlint-disable-next-line react/hook-use-state -- The earliest time is fixed at mount. Nothing sets it later.
  const [min] = useState(() =>
    toBogotaDateTimeLocalValue(earliestScheduledAt(new Date()))
  );

  const form = useAppForm({
    defaultValues: {
      entityId: prefilled?.entityId ?? "",
      branchId: "",
      procedureTypeId: prefilled?.procedureTypeId ?? "",
      obligationId: prefilled?.id ?? NO_OBLIGATION,
      scheduledAt: "",
    },
    validators: { onChange: formSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      setFormError(
        await onBook({
          entityId: value.entityId,
          branchId: value.branchId,
          procedureTypeId: value.procedureTypeId,
          obligationId:
            value.obligationId === NO_OBLIGATION
              ? undefined
              : value.obligationId,
          scheduledAt: bogotaWallClockToInstant(
            value.scheduledAt
          ).toISOString(),
        })
      );
    },
  });

  const entityItems = options.entities.map((item) => ({
    value: item.id,
    label: item.name,
  }));

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
        <form.AppField
          listeners={{
            onChange: () => {
              // A branch, a procedure type, and an obligation belong to one entity.
              form.setFieldValue("branchId", "");
              form.setFieldValue("procedureTypeId", "");
              form.setFieldValue("obligationId", NO_OBLIGATION);
            },
          }}
          name="entityId"
        >
          {(field) => (
            <field.SelectField
              items={entityItems}
              label="Entity"
              placeholder="Select an entity"
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.entityId}>
          {(entityId) => {
            const selected = options.entities.find(
              (item) => item.id === entityId
            );
            const branchItems = (selected?.branches ?? []).map((item) => ({
              value: item.id,
              label: `${item.name}, ${item.address}`,
            }));
            const typeItems = (selected?.procedureTypes ?? []).map((item) => ({
              value: item.id,
              label:
                item.amountInCents === 0
                  ? item.name
                  : `${item.name} · ${formatAmount(item.amountInCents, "COP")}`,
            }));
            return (
              <>
                <form.AppField name="branchId">
                  {(field) => (
                    <field.SelectField
                      items={branchItems}
                      label="Branch"
                      placeholder={
                        selected ? "Select a branch" : "Select an entity first"
                      }
                    />
                  )}
                </form.AppField>
                <form.AppField
                  listeners={{
                    onChange: () => {
                      // An obligation is for one procedure type.
                      form.setFieldValue("obligationId", NO_OBLIGATION);
                    },
                  }}
                  name="procedureTypeId"
                >
                  {(field) => (
                    <field.SelectField
                      items={typeItems}
                      label="Procedure"
                      placeholder={
                        selected
                          ? "Select a procedure"
                          : "Select an entity first"
                      }
                    />
                  )}
                </form.AppField>
              </>
            );
          }}
        </form.Subscribe>
        <form.Subscribe
          selector={(state) => [
            state.values.entityId,
            state.values.procedureTypeId,
          ]}
        >
          {([entityId, procedureTypeId]) => {
            // Only the obligations of the selected entity and procedure type.
            const matching = options.obligations.filter(
              (item) =>
                item.entityId === entityId &&
                item.procedureTypeId === procedureTypeId
            );
            if (matching.length === 0) {
              return null;
            }
            const obligationItems = [
              { value: NO_OBLIGATION, label: "No obligation" },
              ...matching.map((item) => ({
                value: item.id,
                label: `${item.number} · ${item.entityName}`,
              })),
            ];
            return (
              <form.AppField name="obligationId">
                {(field) => (
                  <field.SelectField
                    items={obligationItems}
                    label="Pending procedure (optional)"
                    placeholder="No obligation"
                  />
                )}
              </form.AppField>
            );
          }}
        </form.Subscribe>
        <form.AppField name="scheduledAt">
          {(field) => (
            <field.DateTimeField
              description="Select a time at least one hour from now."
              label="Date and time (Bogota time)"
              min={min}
            />
          )}
        </form.AppField>
      </FieldGroup>
      <form.AppForm>
        <form.SubmitButton>Book the appointment</form.SubmitButton>
      </form.AppForm>
    </form>
  );
};
