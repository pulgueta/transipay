import { IconCalendarEvent } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { KIND_LABELS } from "@/components/obligations/obligation-labels";
import { ObligationStateBadge } from "@/components/obligations/obligation-state-badge";
import { installmentsSummary } from "@/components/obligations/obligations-list";
import { ObligationSkeleton } from "@/components/obligations/obligations-skeleton";
import { PayButton } from "@/components/obligations/pay-button";
import { obligationQueryOptions } from "@/components/obligations/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/auth/guards";
import { formatBogotaDate, formatBogotaDateTime } from "@/lib/dates";
import { formatAmount } from "@/lib/format-amount";
import type {
  InstallmentStatus,
  PaymentStatus,
} from "@/server/db/schema/payments";

const CURRENCY = "COP";

const INSTALLMENT_LABELS: Record<InstallmentStatus, string> = {
  pending: "Pendiente",
  paid: "Pagada",
  overdue: "Vencida",
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "En proceso",
  approved: "Aprobado",
  declined: "Rechazado",
  voided: "Anulado",
  error: "No completado",
  expired: "Vencido",
};

const SectionTitle = ({ children }: { children: string }) => (
  <h2 className="text-base font-semibold">{children}</h2>
);

const ObligationPage = () => {
  const { obligationId } = Route.useParams();
  const { data: obligation } = useSuspenseQuery(
    obligationQueryOptions(obligationId)
  );
  const isOpen =
    obligation.state === "pending" || obligation.state === "overdue";
  // A procedure can cost zero, and a discount can cover the full amount.
  const canPayInFull = isOpen && obligation.amountDueInCents > 0;
  const canBookAppointment =
    obligation.kind === "procedure" && obligation.status === "pending";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{KIND_LABELS[obligation.kind]}</Badge>
          <ObligationStateBadge state={obligation.state} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {obligation.description}
        </h1>
        <p className="text-muted-foreground">
          {obligation.entityName} · Número {obligation.number} · Expedida el{" "}
          {formatBogotaDateTime(obligation.issuedAt)}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Valor</dt>
        <dd className="tabular-nums">
          {formatAmount(obligation.amountInCents, CURRENCY)}
        </dd>
        {obligation.discountInCents > 0 ? (
          <>
            <dt className="text-muted-foreground">Descuento</dt>
            <dd className="tabular-nums">
              {formatAmount(obligation.discountInCents, CURRENCY)}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Valor a pagar</dt>
        <dd className="text-lg font-semibold tabular-nums">
          {formatAmount(obligation.amountDueInCents, CURRENCY)}
        </dd>
        <dt className="text-muted-foreground">Fecha límite</dt>
        <dd>
          {obligation.dueOn === null
            ? "Sin fecha"
            : formatBogotaDate(obligation.dueOn)}
        </dd>
        {obligation.agreement === null ? null : (
          <>
            <dt className="text-muted-foreground">Cuotas</dt>
            <dd>{installmentsSummary(obligation.agreement)}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-3">
        {canPayInFull ? (
          <PayButton obligationId={obligation.id}>Pagar</PayButton>
        ) : null}
        {isOpen && !canPayInFull ? (
          <p className="text-muted-foreground self-center text-sm">
            No hay valor a pagar
          </p>
        ) : null}
        {canBookAppointment ? (
          <Button
            nativeButton={false}
            render={
              <Link
                search={{ obligationId: obligation.id }}
                to="/appointments/new"
              />
            }
            variant="outline"
          >
            <IconCalendarEvent data-icon="inline-start" strokeWidth={1.75} />
            Agendar cita
          </Button>
        ) : null}
      </div>

      {obligation.installments.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Cuotas</SectionTitle>
          <p className="text-muted-foreground text-sm">
            Pague cada cuota en su fecha. La obligación queda pagada cuando
            todas las cuotas estén pagadas.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="sr-only">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {obligation.installments.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.number}</TableCell>
                  <TableCell>{formatBogotaDate(item.dueOn)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(item.amountInCents, CURRENCY)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === "overdue" ? "destructive" : "outline"
                      }
                    >
                      {INSTALLMENT_LABELS[item.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.status === "paid" ||
                    obligation.status !== "in_agreement" ? null : (
                      <PayButton
                        installmentId={item.id}
                        obligationId={obligation.id}
                        size="sm"
                        variant="outline"
                      >
                        Pagar esta cuota
                      </PayButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <Separator />

      <section className="flex flex-col gap-3">
        <SectionTitle>Pagos recientes</SectionTitle>
        {obligation.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Esta obligación aún no tiene pagos.
          </p>
        ) : (
          <ul className="divide-y">
            {obligation.payments.map((item) => (
              <li
                className="flex items-center justify-between gap-4 py-3 text-sm"
                key={item.id}
              >
                <div className="flex flex-col gap-0.5">
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    params={{ paymentId: item.id }}
                    to="/payments/$paymentId"
                  >
                    {formatAmount(item.amountInCents, item.currency)}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {formatBogotaDateTime(item.createdAt)}
                    {item.installmentId === null ? "" : " · Cuota"}
                  </span>
                </div>
                <Badge variant="outline">{PAYMENT_LABELS[item.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export const Route = createFileRoute("/obligations/$obligationId")({
  beforeLoad: ({ context, location }) => ({
    session: requireSession(context.session, location.href),
  }),
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.obligationId).success) {
      notFound({ throw: true });
    }
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.query).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureQueryData(
      obligationQueryOptions(params.obligationId)
    );
  },
  head: () => ({ meta: [{ title: "Obligación | Transipay" }] }),
  pendingComponent: () => (
    <div className="mx-auto w-full max-w-3xl">
      <ObligationSkeleton />
    </div>
  ),
  component: ObligationPage,
});
