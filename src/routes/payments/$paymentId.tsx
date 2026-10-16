import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconEyeSearch,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/format-amount";
import {
  createCheckoutFn,
  getPaymentFn,
  refreshPaymentFn,
} from "@/server/payments/functions";

import { resolveResultState } from "./-result-state";
import type { ResultState } from "./-result-state";

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

const STATUS_CONTENT: Record<ResultState, StatusContent> = {
  pending: {
    icon: IconClock,
    title: "Pago en proceso",
    description:
      "Estamos esperando la respuesta del banco. Esto puede tardar unos minutos.",
    canRetry: false,
  },
  approved: {
    icon: IconCircleCheck,
    title: "Pago aprobado",
    description: "Recibimos el pago. No tiene que hacer nada más.",
    canRetry: false,
  },
  declined: {
    icon: IconCircleX,
    title: "Pago rechazado",
    description:
      "El banco no aprobó el pago, así que no se cobró dinero. Intente de nuevo con el mismo medio de pago o con otro.",
    canRetry: true,
  },
  error: {
    icon: IconAlertTriangle,
    title: "Pago no completado",
    description:
      "Un error detuvo el pago, así que no se cobró dinero. Intente de nuevo.",
    canRetry: true,
  },
  voided: {
    icon: IconCircleX,
    title: "Pago anulado",
    description:
      "Este pago fue anulado. Intente de nuevo para pagar la obligación.",
    canRetry: true,
  },
  expired: {
    icon: IconClock,
    title: "El enlace de pago venció",
    description:
      "Este enlace de pago venció, así que no se cobró dinero. Pague de nuevo para obtener un enlace nuevo.",
    canRetry: true,
  },
  review: {
    icon: IconEyeSearch,
    title: "Pago en revisión",
    description:
      "Recibimos un pago, pero el personal debe revisarlo antes de confirmarlo. No pague de nuevo. Nos comunicaremos con usted.",
    canRetry: false,
  },
};

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
        {checkout.isPending ? "Abriendo el pago…" : "Intentar de nuevo"}
      </Button>
      {checkout.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {checkout.error.message}
        </p>
      ) : null}
    </div>
  );
};

/** Asks Wompi about the payment and shows the status that is stored after that. */
const RefreshPayment = ({ paymentId }: { paymentId: string }) => {
  const queryClient = useQueryClient();
  const refreshPayment = useServerFn(refreshPaymentFn);
  const refresh = useMutation({
    mutationFn: async () => await refreshPayment({ data: { paymentId } }),
    onSuccess: (payment) => {
      queryClient.setQueryData(
        paymentQueryOptions(paymentId).queryKey,
        payment
      );
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={refresh.isPending}
        onClick={() => {
          refresh.mutate();
        }}
        variant="outline"
      >
        {refresh.isPending ? "Consultando el estado…" : "Actualizar estado"}
      </Button>
      {refresh.isError ? (
        // A failed refresh keeps the last status on the page.
        <p className="text-destructive text-sm" role="alert">
          {refresh.error.message}
        </p>
      ) : null}
    </div>
  );
};

const PaymentResult = () => {
  const { paymentId } = Route.useParams();
  const { data: payment } = useSuspenseQuery(paymentQueryOptions(paymentId));
  const state = resolveResultState(payment);
  const content = STATUS_CONTENT[state];
  const StatusIcon = content.icon;

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 py-8">
      <div aria-live="polite" className="flex flex-col gap-2">
        <StatusIcon aria-hidden className="text-muted-foreground size-8" />
        <h1 className="text-lg font-medium">{content.title}</h1>
        <p className="text-muted-foreground text-sm">{content.description}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Valor</dt>
        <dd>{formatAmount(payment.amountInCents, payment.currency)}</dd>
        <dt className="text-muted-foreground">Referencia</dt>
        <dd className="break-all">{payment.reference}</dd>
      </dl>

      {/* A declined, cancelled, or expired payment can still settle for a time: Wompi can approve a retry. */}
      {payment.canStillSettle ? <RefreshPayment paymentId={paymentId} /> : null}

      {content.canRetry && payment.isOwner ? (
        <RetryPayment
          installmentId={payment.installmentId}
          obligationId={payment.obligationId}
        />
      ) : null}

      {state === "approved" ? (
        <Button
          className="self-start"
          nativeButton={false}
          render={<Link to="/" />}
          variant="outline"
        >
          Ir al inicio
        </Button>
      ) : null}
    </section>
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
  head: () => ({ meta: [{ title: "Estado del pago | Transipay" }] }),
  component: PaymentResult,
});
