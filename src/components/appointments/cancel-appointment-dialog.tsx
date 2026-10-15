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
import { cancelAppointmentFn } from "@/server/appointments/functions";

import { APPOINTMENTS_KEY } from "./queries";

interface CancelAppointmentDialogProps {
  appointmentId: string;
  scheduledAt: Date;
  procedureTypeName: string;
}

/** Asks for confirmation, then cancels the appointment and reloads the list. */
export const CancelAppointmentDialog = ({
  appointmentId,
  scheduledAt,
  procedureTypeName,
}: CancelAppointmentDialogProps) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const cancelAppointment = useServerFn(cancelAppointmentFn);
  const cancel = useMutation({
    mutationFn: async () =>
      await cancelAppointment({ data: { appointmentId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      setOpen(false);
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Cancel
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this appointment?</DialogTitle>
          <DialogDescription>
            {procedureTypeName} on {formatBogotaDateTime(scheduledAt)}. You can
            book a new appointment at any time.
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
            Keep it
          </Button>
          <Button
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate();
            }}
            variant="destructive"
          >
            {cancel.isPending ? "Cancelling…" : "Cancel the appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
