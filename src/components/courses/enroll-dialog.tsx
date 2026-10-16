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

const schema = z.object({
  obligationId: z.string().min(1, "Seleccione un comparendo."),
});

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
            : "No pudimos inscribirlo. Intente de nuevo."
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
      <DialogTrigger render={<Button size="sm" />}>Inscribirse</DialogTrigger>
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
            <DialogTitle>Inscribirse en el curso</DialogTitle>
            <DialogDescription>
              Sesión del {formatBogotaDateTime(startsAt)}. Cuando el personal
              registre su asistencia, el comparendo recibe un {discountPercent}%
              de descuento, si aún no lo ha pagado.
            </DialogDescription>
          </DialogHeader>
          <FormError message={formError} />
          <FieldGroup>
            <form.AppField name="obligationId">
              {(field) => (
                <field.SelectField
                  items={items}
                  label="Comparendo que recibe el descuento"
                  placeholder="Seleccione un comparendo"
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
              Cancelar
            </Button>
            <form.AppForm>
              <form.SubmitButton>Inscribirse</form.SubmitButton>
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
