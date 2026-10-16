import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

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
import { formatBogotaDateTime } from "@/lib/dates";
import { cancelEnrollmentFn } from "@/server/courses/functions";

import { COURSES_KEY } from "./queries";

/** Asks for confirmation, then cancels the enrollment and reloads the page data. */
export const CancelEnrollmentDialog = ({
  enrollmentId,
  startsAt,
}: {
  enrollmentId: string;
  startsAt: Date;
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const cancelEnrollment = useServerFn(cancelEnrollmentFn);
  const cancel = useMutation({
    mutationFn: async () => await cancelEnrollment({ data: { enrollmentId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: COURSES_KEY });
      setOpen(false);
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Cancelar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Cancelar esta inscripción?</DialogTitle>
          <DialogDescription>
            Sesión del {formatBogotaDateTime(startsAt)}. El comparendo conserva
            su valor completo. Puede inscribirse en otra sesión más adelante.
          </DialogDescription>
        </DialogHeader>
        {cancel.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {cancel.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={cancel.isPending}
            onClick={() => {
              setOpen(false);
            }}
            variant="outline"
          >
            Conservar inscripción
          </Button>
          <Button
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate();
            }}
            variant="destructive"
          >
            {cancel.isPending ? "Cancelando…" : "Cancelar inscripción"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
