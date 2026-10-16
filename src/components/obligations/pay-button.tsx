import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { createCheckoutFn } from "@/server/payments/functions";

interface PayButtonProps {
  obligationId: string;
  installmentId?: string;
  children: string;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
}

/**
 * Starts a Wompi checkout for the obligation or one installment and opens it.
 * A refused checkout shows the message from the server, which says what to do next.
 */
export const PayButton = ({
  obligationId,
  installmentId,
  children,
  size,
  variant,
}: PayButtonProps) => {
  const createCheckout = useServerFn(createCheckoutFn);
  const checkout = useMutation({
    mutationFn: async () =>
      await createCheckout({ data: { obligationId, installmentId } }),
    onSuccess: ({ checkoutUrl }) => {
      window.location.assign(checkoutUrl);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={checkout.isPending}
        onClick={() => {
          checkout.mutate();
        }}
        size={size}
        variant={variant}
      >
        {checkout.isPending ? "Abriendo el pago…" : children}
      </Button>
      {checkout.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {checkout.error.message}
        </p>
      ) : null}
    </div>
  );
};
