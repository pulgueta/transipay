import { IconFileDescription, IconId } from "@tabler/icons-react";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { ObligationsList } from "@/components/obligations/obligations-list";
import { ObligationsSkeleton } from "@/components/obligations/obligations-skeleton";
import { obligationsQueryOptions } from "@/components/obligations/queries";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireSession } from "@/lib/auth/guards";

const PageHeader = () => (
  <div className="flex flex-col gap-1">
    <h1 className="text-2xl font-semibold tracking-tight">Obligaciones</h1>
    <p className="text-muted-foreground">
      Sus comparendos y trámites, con el valor a pagar y el estado de cada uno.
    </p>
  </div>
);

const NoDocument = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <IconId strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyTitle>Primero vincule su documento</EmptyTitle>
      <EmptyDescription>
        Buscamos sus comparendos y trámites con su documento. Agréguelo a su
        cuenta para verlos aquí.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button nativeButton={false} render={<Link to="/account" />}>
        Ir a mi cuenta
      </Button>
    </EmptyContent>
  </Empty>
);

const NoObligations = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <IconFileDescription strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyTitle>No tiene obligaciones</EmptyTitle>
      <EmptyDescription>
        No tiene comparendos ni trámites registrados. Cuando una entidad
        registre uno con su documento, aparecerá aquí.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const ObligationsPage = () => {
  const query = useSuspenseInfiniteQuery(obligationsQueryOptions);
  const { pages } = query.data;
  const items = pages.flatMap((page) => page.items);
  const hasCitizen = pages[0]?.hasCitizen ?? false;

  let content = <ObligationsList items={items} />;
  if (!hasCitizen) {
    content = <NoDocument />;
  } else if (items.length === 0) {
    content = <NoObligations />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      {content}
      {query.hasNextPage ? (
        <Button
          className="self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
          variant="outline"
        >
          {query.isFetchingNextPage ? "Cargando…" : "Cargar más"}
        </Button>
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/obligations/")({
  beforeLoad: ({ context, location }) => ({
    session: requireSession(context.session, location.href),
  }),
  loader: async ({ context }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.query).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureInfiniteQueryData(obligationsQueryOptions);
  },
  head: () => ({ meta: [{ title: "Obligaciones | Transipay" }] }),
  pendingComponent: () => (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <ObligationsSkeleton />
    </div>
  ),
  component: ObligationsPage,
});
