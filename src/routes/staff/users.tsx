import { IconDotsVertical, IconSearch } from "@tabler/icons-react";
import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useTanStackTableDevtools } from "@tanstack/react-table-devtools";
import { useMemo, useState } from "react";
import { z } from "zod";

import { DataTable } from "@/components/data-table/data-table";
import { ConfirmDialog } from "@/components/staff/confirm-dialog";
import { formatDateTime } from "@/components/staff/format";
import { InlineError } from "@/components/staff/inline-error";
import { LoadMore } from "@/components/staff/load-more";
import { PageHeader } from "@/components/staff/page-header";
import { SortableHeader } from "@/components/staff/sortable-header";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { banDaysToSeconds } from "@/lib/auth/ban-duration";
import { isRole } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/permissions";
import { ROLE_LABELS, roleLabel, roleNames } from "@/lib/auth/roles";
import {
  banUserFn,
  listUsersFn,
  removeUserFn,
  setUserRoleFn,
  unbanUserFn,
} from "@/server/users/functions";

const searchSchema = z.object({ q: z.string().optional() });

const noCursor = (): string | undefined => undefined;

const usersQueryOptions = (search: string | undefined) =>
  infiniteQueryOptions({
    queryKey: ["staff", "users", search ?? ""],
    queryFn: async ({ pageParam }) =>
      await listUsersFn({ data: { search, cursor: pageParam } }),
    initialPageParam: noCursor(),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

type UserRow = Awaited<ReturnType<typeof listUsersFn>>["users"][number];

const ROLE_ITEMS: { value: Role; label: string }[] = [
  { value: "citizen", label: ROLE_LABELS.citizen },
  { value: "cashier", label: ROLE_LABELS.cashier },
  { value: "scheduler", label: ROLE_LABELS.scheduler },
  { value: "supervisor", label: ROLE_LABELS.supervisor },
  { value: "admin", label: ROLE_LABELS.admin },
];

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime },
});
const helper = createColumnHelper<typeof features, UserRow>();

type Action = "role" | "ban" | "remove";

/** The row menu and its dialogs. Each action calls an existing attributed server function. */
const UserActions = ({ user }: { user: UserRow }) => {
  const queryClient = useQueryClient();
  const setRoleFn = useServerFn(setUserRoleFn);
  const ban = useServerFn(banUserFn);
  const unban = useServerFn(unbanUserFn);
  const remove = useServerFn(removeUserFn);
  const [action, setAction] = useState<Action | null>(null);
  const [role, setRole] = useState<Role>(
    roleNames(user.role).find(isRole) ?? "citizen"
  );
  const [banReason, setBanReason] = useState("");
  const [banDays, setBanDays] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff", "users"] });
    setAction(null);
  };

  const roleMutation = useMutation({
    mutationFn: async () =>
      await setRoleFn({ data: { userId: user.id, role } }),
    onSuccess: refresh,
  });
  const banMutation = useMutation({
    mutationFn: async () =>
      await ban({
        data: {
          userId: user.id,
          banReason: banReason.trim() || undefined,
          banExpiresIn: banDaysToSeconds(banDays),
        },
      }),
    onSuccess: refresh,
  });
  const unbanMutation = useMutation({
    mutationFn: async () => await unban({ data: { userId: user.id } }),
    onSuccess: refresh,
  });
  const removeMutation = useMutation({
    mutationFn: async () => await remove({ data: { userId: user.id } }),
    onSuccess: refresh,
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Acciones para ${user.email}`}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <IconDotsVertical strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setAction("role");
              }}
            >
              Cambiar rol
            </DropdownMenuItem>
            {user.banned ? (
              <DropdownMenuItem
                disabled={unbanMutation.isPending}
                onClick={() => {
                  unbanMutation.mutate();
                }}
              >
                Quitar suspensión
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  setAction("ban");
                }}
              >
                Suspender usuario
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setAction("remove");
              }}
              variant="destructive"
            >
              Eliminar usuario
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineError error={unbanMutation.error} />

      <Dialog
        onOpenChange={(open) => {
          setAction(open ? "role" : null);
        }}
        open={action === "role"}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar rol</DialogTitle>
            <DialogDescription>
              El nuevo rol de {user.email} aplica desde la próxima solicitud.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`role-${user.id}`}>Rol</FieldLabel>
              <Select
                items={ROLE_ITEMS}
                onValueChange={(value) => {
                  if (value) {
                    setRole(value);
                  }
                }}
                value={role}
              >
                <SelectTrigger className="w-full" id={`role-${user.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ROLE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <InlineError error={roleMutation.error} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              disabled={roleMutation.isPending}
              onClick={() => {
                roleMutation.mutate();
              }}
            >
              {roleMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Guardar rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          setAction(open ? "ban" : null);
        }}
        open={action === "ban"}
      >
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              banMutation.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Suspender usuario</DialogTitle>
              <DialogDescription>
                {user.email} no puede iniciar sesión mientras la suspensión esté
                activa. El motivo se guarda con la suspensión.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`ban-reason-${user.id}`}>
                  Motivo
                </FieldLabel>
                <Input
                  id={`ban-reason-${user.id}`}
                  onChange={(event) => {
                    setBanReason(event.target.value);
                  }}
                  value={banReason}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`ban-days-${user.id}`}>
                  Duración en días (vacío: sin fin)
                </FieldLabel>
                <Input
                  id={`ban-days-${user.id}`}
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => {
                    setBanDays(event.target.value);
                  }}
                  type="number"
                  value={banDays}
                />
              </Field>
            </FieldGroup>
            <InlineError error={banMutation.error} />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button disabled={banMutation.isPending} type="submit">
                {banMutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Suspender usuario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Eliminar usuario"
        description={`Esto elimina la cuenta de ${user.email} y sus sesiones. El registro de auditoría guarda el cambio. No se puede deshacer.`}
        destructive
        error={removeMutation.error}
        isPending={removeMutation.isPending}
        onConfirm={() => {
          removeMutation.mutate();
        }}
        onOpenChange={(open) => {
          setAction(open ? "remove" : null);
        }}
        open={action === "remove"}
        title="Eliminar usuario"
      />
    </>
  );
};

const columns = helper.columns([
  helper.accessor("name", {
    header: ({ column }) => <SortableHeader column={column} label="Nombre" />,
    sortFn: "alphanumeric",
  }),
  helper.accessor("email", {
    header: ({ column }) => <SortableHeader column={column} label="Correo" />,
    sortFn: "alphanumeric",
    cell: ({ getValue }) => <span className="break-all">{getValue()}</span>,
  }),
  helper.accessor("role", {
    header: "Roles",
    enableSorting: false,
    cell: ({ getValue }) => (
      <span className="flex flex-wrap gap-1">
        {roleNames(getValue()).map((role) => (
          <Badge key={role} variant="secondary">
            {roleLabel(role)}
          </Badge>
        ))}
      </span>
    ),
  }),
  helper.accessor("banned", {
    header: "Estado",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.banned ? (
        <Badge
          title={row.original.banReason ?? undefined}
          variant="destructive"
        >
          {row.original.banExpires
            ? `Suspendido hasta ${formatDateTime(row.original.banExpires)}`
            : "Suspendido"}
        </Badge>
      ) : (
        <Badge variant="outline">Activo</Badge>
      ),
  }),
  helper.accessor("createdAt", {
    header: ({ column }) => <SortableHeader column={column} label="Creado" />,
    sortFn: "datetime",
    cell: ({ getValue }) => formatDateTime(getValue()),
  }),
  helper.display({
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: ({ row }) => <UserActions user={row.original} />,
  }),
]);

const UsersPage = () => {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [draft, setDraft] = useState(q ?? "");
  const query = useSuspenseInfiniteQuery(usersQueryOptions(q));
  const data = useMemo(
    () => query.data.pages.flatMap((page) => page.users),
    [query.data]
  );
  const total = query.data.pages.at(0)?.total ?? 0;

  const table = useTable({
    key: "staff-users",
    features,
    columns,
    data,
    getRowId: (row) => row.id,
  });
  useTanStackTableDevtools(table);

  return (
    <>
      <PageHeader
        description="Las cuentas de ciudadanos y funcionarios. Cambie un rol, suspenda una cuenta o elimínela."
        title="Usuarios"
      />
      <search>
        <form
          className="flex max-w-md gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            void navigate({ search: { q: value === "" ? undefined : value } });
          }}
        >
          <Input
            aria-label="Buscar por nombre o correo"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="Nombre o correo"
            type="search"
            value={draft}
          />
          <Button type="submit" variant="outline">
            <IconSearch data-icon="inline-start" strokeWidth={1.75} />
            Buscar
          </Button>
        </form>
      </search>
      <p className="text-muted-foreground text-sm">
        {data.length} de {total} usuarios
      </p>
      <DataTable
        emptyMessage="Ningún usuario coincide con la búsqueda."
        table={table}
      />
      <LoadMore
        error={query.error}
        hasNextPage={query.hasNextPage}
        isFetching={query.isFetchingNextPage}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
      />
    </>
  );
};

export const Route = createFileRoute("/staff/users")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ context, deps }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.infiniteQuery).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureInfiniteQueryData(
      usersQueryOptions(deps.q)
    );
  },
  head: () => ({ meta: [{ title: "Usuarios | Funcionarios | Transipay" }] }),
  component: UsersPage,
});
