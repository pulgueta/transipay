import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";

import { FormError } from "@/components/auth/form-error";
import { useAppForm } from "@/components/form/use-app-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { formatBogotaDateTime } from "@/lib/dates";
import { formatAmount } from "@/lib/format-amount";
import { enrollInCourseFn } from "@/server/courses/functions";

import { COURSES_KEY } from "./queries";

interface Fine {
  id: string;
  number: string;
  description: string;
  amountInCents: number;
}

interface EnrollDialogProps {
  courseSessionId: string;
  startsAt: Date;
  discountPercent: number;
  fines: Fine[];
}

const schema = z.object({ obligationId: z.string().min(1, "Select a fine.") });

/** Asks which pending fine gets the discount, then enrolls the citizen and reloads the page data. */
export const EnrollDialog = ({
  courseSessionId,
  startsAt,
  discountPercent,
  fines,
}: EnrollDialogProps) => {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const enrollInCourse = useServerFn(enrollInCourseFn);
  const enroll = useMutation({
    mutationFn: async (obligationId: string) =>
      await enrollInCourse({ data: { courseSessionId, obligationId } }),
  });

  const form = useAppForm({
    defaultValues: {
      obligationId: fines.length === 1 ? (fines[0]?.id ?? "") : "",
    },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await enroll.mutateAsync(value.obligationId);
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "We could not enroll you. Try again."
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: COURSES_KEY });
      setOpen(false);
    },
  });

  const items = fines.map((item) => ({
    value: item.id,
    label: `${item.description} · ${formatAmount(item.amountInCents, "COP")}`,
  }));

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Enroll</DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Enroll in the course</DialogTitle>
            <DialogDescription>
              Session on {formatBogotaDateTime(startsAt)}. When staff record
              that you attended, the fine gets a {discountPercent}% discount, if
              you did not pay it yet.
            </DialogDescription>
          </DialogHeader>
          <FormError message={formError} />
          <FieldGroup>
            <form.AppField name="obligationId">
              {(field) => (
                <field.SelectField
                  items={items}
                  label="Fine that gets the discount"
                  placeholder="Select a fine"
                />
              )}
            </form.AppField>
          </FieldGroup>
          <DialogFooter>
            <Button
              onClick={() => {
                setOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <form.AppForm>
              <form.SubmitButton>Enroll</form.SubmitButton>
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
