import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

import { InlineError } from "./inline-error";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** The label of the button that does the action. */
  confirmLabel: string;
  destructive?: boolean;
  isPending: boolean;
  error: Error | null;
  onConfirm: () => void;
}

/** Asks for a second confirmation before an action that cannot be undone. */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  isPending,
  error,
  onConfirm,
}: ConfirmDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <InlineError error={error} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          Cancelar
        </DialogClose>
        <Button
          disabled={isPending}
          onClick={onConfirm}
          variant={destructive ? "destructive" : "default"}
        >
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
