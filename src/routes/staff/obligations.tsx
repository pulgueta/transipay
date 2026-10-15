import { useSelector } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";
import { CitizenFinder } from "@/components/staff/citizen-finder";
import type { FoundCitizen } from "@/components/staff/citizen-finder";
import { formatDay } from "@/components/staff/format";
import { InlineError } from "@/components/staff/inline-error";
import { PageHeader } from "@/components/staff/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAmount } from "@/lib/format-amount";
import {
  listInfractionsFn,
  listProcedureTypesFn,
} from "@/server/catalog/functions";
import {
  createFineFn,
  createProcedureFn,
} from "@/server/obligations/staff-functions";
import { listStaffEntitiesFn } from "@/server/staff/functions";

type StoredObligation = Awaited<ReturnType<typeof createFineFn>>;

const optionalText = z.string().trim();

const plateSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^[A-Za-z0-9]{5,7}$/u.test(value),
    "Enter 5 to 7 letters or digits, or leave it empty."
  );

const commonSchema = z.object({
  entityId: z.uuid("Select an entity."),
  number: z.string().trim().min(3, "Enter the official number."),
  dueOn: z
    .string()
    .refine(
      (value) => value === "" || z.iso.date().safeParse(value).success,
      "Enter a valid date."
    ),
  plate: plateSchema,
});

const fineSchema = commonSchema.extend({
  infractionId: z.uuid("Select an infraction."),
  location: z.string().trim().min(3, "Enter where it happened."),
  occurredAt: z.string().min(1, "Enter when it happened."),
  agentCode: optionalText,
});

const procedureSchema = commonSchema.extend({
  procedureTypeId: z.uuid("Select a procedure type."),
});

const emptyToUndefined = (value: string) => (value === "" ? undefined : value);

/** The stored obligation after a create. Staff see the id and the status inline. */
const CreatedObligation = ({
  obligation,
}: {
  obligation: StoredObligation;
}) => (
  <Alert>
    <AlertTitle>
      {obligation.kind === "fine" ? "Fine" : "Procedure"} {obligation.number}{" "}
      registered
    </AlertTitle>
    <AlertDescription>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>Id</dt>
        <dd className="font-mono text-xs">{obligation.id}</dd>
        <dt>Status</dt>
        <dd>
          <Badge variant="secondary">{obligation.status}</Badge>
        </dd>
        <dt>Amount</dt>
        <dd>{formatAmount(obligation.amountInCents, "COP")}</dd>
        <dt>Due on</dt>
        <dd>
          {obligation.dueOn === null
            ? "No due date"
            : formatDay(obligation.dueOn)}
        </dd>
      </dl>
    </AlertDescription>
  </Alert>
);

const NewFineForm = () => {
  const createFine = useServerFn(createFineFn);
  const [citizen, setCitizen] = useState<FoundCitizen | null>(null);
  const [created, setCreated] = useState<StoredObligation | null>(null);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const entities = useQuery({
    queryKey: ["staff", "entities", "obligation", "transit_authority"],
    queryFn: async () =>
      await listStaffEntitiesFn({
        data: { purpose: "obligation", kind: "transit_authority" },
      }),
  });
  const infractions = useQuery({
    queryKey: ["catalog", "infractions"],
    queryFn: async () => await listInfractionsFn(),
  });
  const entityItems = useMemo(
    () =>
      (entities.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [entities.data]
  );
  const infractionItems = useMemo(
    () =>
      (infractions.data ?? []).map((row) => ({
        value: row.id,
        label: `${row.code}: ${row.description} (${formatAmount(row.amountInCents, "COP")})`,
      })),
    [infractions.data]
  );

  const form = useAppForm({
    defaultValues: {
      entityId: "",
      infractionId: "",
      number: "",
      location: "",
      occurredAt: "",
      agentCode: "",
      dueOn: "",
      plate: "",
    },
    validators: { onChange: fineSchema },
    onSubmit: async ({ value, formApi }) => {
      setSubmitError(null);
      if (citizen === null) {
        setSubmitError(new Error("Find the citizen first."));
        return;
      }
      const input = fineSchema.parse(value);
      try {
        setCreated(
          await createFine({
            data: {
              citizenId: citizen.id,
              entityId: input.entityId,
              infractionId: input.infractionId,
              number: input.number,
              location: input.location,
              // The browser reads the local time of the staff member and sends an instant.
              occurredAt: new Date(input.occurredAt).toISOString(),
              agentCode: emptyToUndefined(input.agentCode),
              dueOn: emptyToUndefined(input.dueOn),
              plate: emptyToUndefined(input.plate),
            },
          })
        );
        formApi.reset();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error
            : new Error("We could not register the fine. Try again.")
        );
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <CitizenFinder citizen={citizen} idPrefix="fine" onChange={setCitizen} />
      <Separator />
      {entities.isPending || infractions.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <FieldGroup>
          <form.AppField name="entityId">
            {(field) => (
              <field.SelectField
                items={entityItems}
                label="Entity"
                placeholder="Select the transit authority"
              />
            )}
          </form.AppField>
          <form.AppField name="infractionId">
            {(field) => (
              <field.SelectField
                items={infractionItems}
                label="Infraction"
                placeholder="Select an infraction"
              />
            )}
          </form.AppField>
          <form.AppField name="number">
            {(field) => (
              <field.TextField autoComplete="off" label="Fine number" />
            )}
          </form.AppField>
          <form.AppField name="location">
            {(field) => <field.TextField label="Location" />}
          </form.AppField>
          <form.AppField name="occurredAt">
            {(field) => (
              <field.TextField label="Occurred at" type="datetime-local" />
            )}
          </form.AppField>
          <form.AppField name="agentCode">
            {(field) => <field.TextField label="Agent code (optional)" />}
          </form.AppField>
          <form.AppField name="dueOn">
            {(field) => (
              <field.TextField label="Due on (optional)" type="date" />
            )}
          </form.AppField>
          <form.AppField name="plate">
            {(field) => (
              <field.TextField
                aria-describedby="fine-plate-hint"
                autoCapitalize="characters"
                label="Plate (optional)"
              />
            )}
          </form.AppField>
          <FieldDescription id="fine-plate-hint">
            The vehicle must be registered. Leave it empty for a fine without a
            vehicle.
          </FieldDescription>
        </FieldGroup>
      )}
      <InlineError error={entities.error ?? infractions.error ?? submitError} />
      <form.AppForm>
        <form.SubmitButton>Register fine</form.SubmitButton>
      </form.AppForm>
      {created === null ? null : <CreatedObligation obligation={created} />}
    </form>
  );
};

const NewProcedureForm = () => {
  const createProcedure = useServerFn(createProcedureFn);
  const [citizen, setCitizen] = useState<FoundCitizen | null>(null);
  const [created, setCreated] = useState<StoredObligation | null>(null);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const entities = useQuery({
    queryKey: ["staff", "entities", "obligation"],
    queryFn: async () =>
      await listStaffEntitiesFn({ data: { purpose: "obligation" } }),
  });
  const entityItems = useMemo(
    () =>
      (entities.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [entities.data]
  );

  const form = useAppForm({
    defaultValues: {
      entityId: "",
      procedureTypeId: "",
      number: "",
      dueOn: "",
      plate: "",
    },
    validators: { onChange: procedureSchema },
    onSubmit: async ({ value, formApi }) => {
      setSubmitError(null);
      if (citizen === null) {
        setSubmitError(new Error("Find the citizen first."));
        return;
      }
      const input = procedureSchema.parse(value);
      try {
        setCreated(
          await createProcedure({
            data: {
              citizenId: citizen.id,
              entityId: input.entityId,
              procedureTypeId: input.procedureTypeId,
              number: input.number,
              dueOn: emptyToUndefined(input.dueOn),
              plate: emptyToUndefined(input.plate),
            },
          })
        );
        formApi.reset();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error
            : new Error("We could not register the procedure. Try again.")
        );
      }
    },
  });
  const entityId = useSelector(form.store, (state) => state.values.entityId);
  const procedureTypes = useQuery({
    queryKey: ["catalog", "procedure-types", entityId],
    queryFn: async () => await listProcedureTypesFn({ data: { entityId } }),
    enabled: entityId !== "",
  });
  const procedureTypeItems = useMemo(
    () =>
      (procedureTypes.data ?? []).map((row) => ({
        value: row.id,
        label: `${row.name} (${formatAmount(row.amountInCents, "COP")})`,
      })),
    [procedureTypes.data]
  );

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <CitizenFinder
        citizen={citizen}
        idPrefix="procedure"
        onChange={setCitizen}
      />
      <Separator />
      {entities.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <FieldGroup>
          <form.AppField name="entityId">
            {(field) => (
              <field.SelectField
                items={entityItems}
                label="Entity"
                placeholder="Select an entity"
              />
            )}
          </form.AppField>
          <form.AppField name="procedureTypeId">
            {(field) => (
              <field.SelectField
                items={procedureTypeItems}
                label="Procedure type"
                placeholder={
                  entityId === ""
                    ? "Select an entity first"
                    : "Select a procedure type"
                }
              />
            )}
          </form.AppField>
          <form.AppField name="number">
            {(field) => (
              <field.TextField autoComplete="off" label="Procedure number" />
            )}
          </form.AppField>
          <form.AppField name="dueOn">
            {(field) => (
              <field.TextField label="Due on (optional)" type="date" />
            )}
          </form.AppField>
          <form.AppField name="plate">
            {(field) => (
              <field.TextField
                autoCapitalize="characters"
                label="Plate (optional)"
              />
            )}
          </form.AppField>
        </FieldGroup>
      )}
      <InlineError
        error={entities.error ?? procedureTypes.error ?? submitError}
      />
      <form.AppForm>
        <form.SubmitButton>Register procedure</form.SubmitButton>
      </form.AppForm>
      {created === null ? null : <CreatedObligation obligation={created} />}
    </form>
  );
};

const ObligationsPage = () => (
  <>
    <PageHeader
      description="Register a fine or a procedure for a citizen. The amount comes from the catalog."
      title="Obligations"
    />
    <Tabs defaultValue="fine">
      <TabsList>
        <TabsTrigger value="fine">New fine</TabsTrigger>
        <TabsTrigger value="procedure">New procedure</TabsTrigger>
      </TabsList>
      <TabsContent value="fine">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>New fine</CardTitle>
            <CardDescription>
              Only the transit authority issues fines. The fine gets the
              infraction amount of the catalog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewFineForm />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="procedure">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>New procedure</CardTitle>
            <CardDescription>
              The procedure gets the fee of its type. A type with no fee makes
              an obligation with no amount to pay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewProcedureForm />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </>
);

export const Route = createFileRoute("/staff/obligations")({
  head: () => ({ meta: [{ title: "Obligations | Staff | Transipay" }] }),
  component: ObligationsPage,
});
