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
import { roleNames } from "@/lib/auth/roles";
import {
  banUserFn,
  listUsersFn,
  removeUserFn,
  setUserRoleFn,
  unbanUserFn,
} from "@/server/users/functions";

const searchSchema = z.object({ q: z.string().optional() });

const usersQueryOptions = (search: string | undefined) =>
  infiniteQueryOptions({
    queryKey: ["staff", "users", search ?? ""],
    queryFn: async ({ pageParam }) =>
      await listUsersFn({ data: { search, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });

type UserRow = Awaited<ReturnType<typeof listUsersFn>>["users"][number];

const ROLE_ITEMS: { value: Role; label: string }[] = [
  { value: "citizen", label: "Citizen" },
  { value: "cashier", label: "Cashier" },
  { value: "scheduler", label: "Scheduler" },
  { value: "supervisor", label: "Supervisor" },
  { value: "admin", label: "Admin" },
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
              aria-label={`Actions for ${user.email}`}
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
              Change role
            </DropdownMenuItem>
            {user.banned ? (
              <DropdownMenuItem
                disabled={unbanMutation.isPending}
                onClick={() => {
                  unbanMutation.mutate();
                }}
              >
                Remove ban
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => {
                  setAction("ban");
                }}
              >
                Ban user
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
              Delete user
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
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              The new role of {user.email} applies to the next request.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`role-${user.id}`}>Role</FieldLabel>
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
              Cancel
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
              Save role
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
              <DialogTitle>Ban user</DialogTitle>
              <DialogDescription>
                {user.email} cannot sign in while the ban is active. The reason
                is stored with the ban.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`ban-reason-${user.id}`}>
                  Reason
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
                  Duration in days (empty: no end)
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
                Cancel
              </DialogClose>
              <Button disabled={banMutation.isPending} type="submit">
                {banMutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Ban user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Delete user"
        description={`This deletes the account of ${user.email} and its sessions. The audit log keeps the change. You cannot undo it.`}
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
        title="Delete user"
      />
    </>
  );
};

const columns = helper.columns([
  helper.accessor("name", {
    header: ({ column }) => <SortableHeader column={column} label="Name" />,
    sortFn: "alphanumeric",
  }),
  helper.accessor("email", {
    header: ({ column }) => <SortableHeader column={column} label="Email" />,
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
            {role}
          </Badge>
        ))}
      </span>
    ),
  }),
  helper.accessor("banned", {
    header: "Status",
    enableSorting: false,
    cell: ({ row }) =>
      row.original.banned ? (
        <Badge
          title={row.original.banReason ?? undefined}
          variant="destructive"
        >
          {row.original.banExpires
            ? `Banned until ${formatDateTime(row.original.banExpires)}`
            : "Banned"}
        </Badge>
      ) : (
        <Badge variant="outline">Active</Badge>
      ),
  }),
  helper.accessor("createdAt", {
    header: ({ column }) => <SortableHeader column={column} label="Created" />,
    sortFn: "datetime",
    cell: ({ getValue }) => formatDateTime(getValue()),
  }),
  helper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
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
        description="The accounts of citizens and staff. Change a role, ban an account, or delete it."
        title="Users"
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
            aria-label="Search by name or email"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="Name or email"
            type="search"
            value={draft}
          />
          <Button type="submit" variant="outline">
            <IconSearch data-icon="inline-start" strokeWidth={1.75} />
            Search
          </Button>
        </form>
      </search>
      <p className="text-muted-foreground text-sm">
        {data.length} of {total} users
      </p>
      <DataTable emptyMessage="No users match the search." table={table} />
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
  head: () => ({ meta: [{ title: "Users | Staff | Transipay" }] }),
  component: UsersPage,
});
