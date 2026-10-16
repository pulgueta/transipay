import { IconLogout } from "@tabler/icons-react";
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { LinkDocumentForm } from "@/components/auth/link-document-form";
import type { LinkDocumentValues } from "@/components/auth/link-document-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSession } from "@/lib/auth/guards";
import { roleLabel, roleNames } from "@/lib/auth/roles";
import { reloadForNewSession } from "@/lib/auth/session-change";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { DOCUMENT_TYPE_LABELS } from "@/lib/citizens/document";
import { getMyCitizenFn, linkCitizenFn } from "@/server/citizens/functions";

export const myCitizenQueryOptions = queryOptions({
  queryKey: ["citizens", "me"],
  queryFn: async () => await getMyCitizenFn(),
});

const LinkDocument = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const linkCitizen = useServerFn(linkCitizenFn);

  const link = async (values: LinkDocumentValues) => {
    try {
      await linkCitizen({ data: values });
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "No pudimos vincular el documento. Intente de nuevo.";
    }
    // Many cached queries depend on the citizen (obligations, appointments, courses), so load all of them again.
    await reloadForNewSession(queryClient, router);
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vincule su documento</CardTitle>
        <CardDescription>
          Su cuenta aún no tiene un documento. Lo necesitamos para buscar sus
          comparendos y trámites. Si el Tránsito ya registró su documento, el
          correo de ese registro debe ser el correo de esta cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LinkDocumentForm onLink={link} />
      </CardContent>
    </Card>
  );
};

const AccountPage = () => {
  const { session } = Route.useRouteContext();
  const { data: citizen } = useSuspenseQuery(myCitizenQueryOptions);
  const signOut = useSignOut();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-muted-foreground">
          Los datos de su cuenta de Transipay.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Nombre</dt>
            <dd>{session.user.name}</dd>
            <dt className="text-muted-foreground">Correo electrónico</dt>
            <dd className="break-all">{session.user.email}</dd>
            <dt className="text-muted-foreground">Rol</dt>
            <dd className="flex flex-wrap gap-1">
              {roleNames(session.user.role).map((role) => (
                <Badge key={role} variant="secondary">
                  {roleLabel(role)}
                </Badge>
              ))}
            </dd>
            <dt className="text-muted-foreground">Documento</dt>
            <dd>
              {citizen
                ? `${DOCUMENT_TYPE_LABELS[citizen.documentType]} ${citizen.documentNumber}`
                : "Sin documento"}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {citizen ? null : <LinkDocument />}

      <div className="flex flex-col gap-2">
        <Button
          className="self-start"
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
          variant="outline"
        >
          <IconLogout data-icon="inline-start" strokeWidth={1.75} />
          Cerrar sesión
        </Button>
        {signOut.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {signOut.error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export const Route = createFileRoute("/account")({
  beforeLoad: ({ context, location }) => ({
    // Narrows `context.session` for this route. A signed-out user goes to sign-in and comes back here.
    session: requireSession(context.session, location.href),
  }),
  loader: async ({ context }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.query).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureQueryData(myCitizenQueryOptions);
  },
  head: () => ({ meta: [{ title: "Mi cuenta | Transipay" }] }),
  component: AccountPage,
});
