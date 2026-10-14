import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconClock,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import {
  queryOptions,
  useMutation,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import type { PaymentStatus } from "@/server/db/schema/payments";
import { createCheckoutFn, getPaymentFn } from "@/server/payments/functions";

const paymentQueryOptions = (paymentId: string) =>
  queryOptions({
    queryKey: ["payments", paymentId],
    queryFn: async () => await getPaymentFn({ data: { paymentId } }),
  });

interface StatusContent {
  icon: Icon;
  title: string;
  description: string;
  /** True when the citizen can start a new payment for the obligation. */
  canRetry: boolean;
}

const STATUS_CONTENT: Record<PaymentStatus, StatusContent> = {
  pending: {
    icon: IconClock,
    title: "Payment in progress",
    description:
      "We are waiting for the result from the bank. This can take a few minutes.",
    canRetry: false,
  },
  approved: {
    icon: IconCircleCheck,
    title: "Payment approved",
    description: "We received the payment. You do not need to do more.",
    canRetry: false,
  },
  declined: {
    icon: IconCircleX,
    title: "Payment declined",
    description:
      "The bank did not approve the payment, so we did not collect money. Try again with the same or a different payment method.",
    canRetry: true,
  },
  error: {
    icon: IconAlertTriangle,
    title: "Payment not completed",
    description:
      "An error stopped the payment, so we did not collect money. Try again.",
    canRetry: true,
  },
  voided: {
    icon: IconCircleX,
    title: "Payment cancelled",
    description: "This payment was cancelled. Try again to pay the obligation.",
    canRetry: true,
  },
  expired: {
    icon: IconClock,
    title: "Payment link expired",
    description:
      "This checkout expired, so we did not collect money. Pay again to get a new link.",
    canRetry: true,
  },
};

const formatAmount = (amountInCents: number, currency: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);

/** Starts a new checkout for the same obligation or installment. */
const RetryPayment = ({
  obligationId,
  installmentId,
}: {
  obligationId: string;
  installmentId: string | null;
}) => {
  const createCheckout = useServerFn(createCheckoutFn);
  const checkout = useMutation({
    mutationFn: async () =>
      await createCheckout({
        data: { obligationId, installmentId: installmentId ?? undefined },
      }),
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
      >
        {checkout.isPending ? "Opening the payment…" : "Try again"}
      </Button>
      {checkout.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {checkout.error.message}
        </p>
      ) : null}
    </div>
  );
};

const PaymentResult = () => {
  const { paymentId } = Route.useParams();
  const {
    data: payment,
    refetch,
    isRefetching,
  } = useSuspenseQuery(paymentQueryOptions(paymentId));
  const content = STATUS_CONTENT[payment.status];
  const StatusIcon = content.icon;

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      <div aria-live="polite" className="flex flex-col gap-2">
        <StatusIcon aria-hidden className="text-muted-foreground size-8" />
        <h1 className="text-lg font-medium">{content.title}</h1>
        <p className="text-muted-foreground text-sm">{content.description}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Amount</dt>
        <dd>{formatAmount(payment.amountInCents, payment.currency)}</dd>
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="break-all">{payment.reference}</dd>
      </dl>

      {payment.status === "pending" ? (
        <Button
          className="self-start"
          disabled={isRefetching}
          onClick={() => {
            // A failed refresh keeps the last status on the page.
            void refetch();
          }}
          variant="outline"
        >
          {isRefetching ? "Getting the status…" : "Refresh the status"}
        </Button>
      ) : null}

      {content.canRetry && payment.isOwner ? (
        <RetryPayment
          installmentId={payment.installmentId}
          obligationId={payment.obligationId}
        />
      ) : null}

      {payment.status === "approved" ? (
        <Button
          className="self-start"
          nativeButton={false}
          render={<Link to="/" />}
          variant="outline"
        >
          Go to the home page
        </Button>
      ) : null}
    </main>
  );
};

export const Route = createFileRoute("/payments/$paymentId")({
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.paymentId).success) {
      notFound({ throw: true });
    }
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.query).
    // oxlint-disable-next-line typescript/no-deprecated
    return await context.queryClient.ensureQueryData(
      paymentQueryOptions(params.paymentId)
    );
  },
  head: () => ({ meta: [{ title: "Payment status | Transipay" }] }),
  component: PaymentResult,
});
