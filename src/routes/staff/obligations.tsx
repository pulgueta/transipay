import { useSelector } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";

import { useAppForm } from "@/components/form/use-app-form";
import { STATE_LABELS } from "@/components/obligations/obligation-labels";
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
import { bogotaWallClockToInstant } from "@/lib/dates";
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
    "Escriba de 5 a 7 letras o números, o deje el campo vacío."
  );

const commonSchema = z.object({
  entityId: z.uuid("Seleccione una entidad."),
  number: z.string().trim().min(3, "Escriba el número oficial."),
  dueOn: z
    .string()
    .refine(
      (value) => value === "" || z.iso.date().safeParse(value).success,
      "Escriba una fecha válida."
    ),
  plate: plateSchema,
});

const fineSchema = commonSchema.extend({
  infractionId: z.uuid("Seleccione una infracción."),
  location: z.string().trim().min(3, "Escriba dónde ocurrió."),
  occurredAt: z.string().min(1, "Escriba cuándo ocurrió."),
  agentCode: optionalText,
});

const procedureSchema = commonSchema.extend({
  procedureTypeId: z.uuid("Seleccione un tipo de trámite."),
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
      {obligation.kind === "fine" ? "Comparendo" : "Trámite"}{" "}
      {obligation.number} registrado
    </AlertTitle>
    <AlertDescription>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>Id</dt>
        <dd className="font-mono text-xs">{obligation.id}</dd>
        <dt>Estado</dt>
        <dd>
          <Badge variant="secondary">{STATE_LABELS[obligation.status]}</Badge>
        </dd>
        <dt>Valor</dt>
        <dd>{formatAmount(obligation.amountInCents, "COP")}</dd>
        <dt>Fecha límite</dt>
        <dd>
          {obligation.dueOn === null
            ? "Sin fecha límite"
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
        setSubmitError(new Error("Primero busque al ciudadano."));
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
              // The input is Bogota time, also on a device in another time zone.
              occurredAt: bogotaWallClockToInstant(
                input.occurredAt
              ).toISOString(),
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
            : new Error("No pudimos registrar el comparendo. Intente de nuevo.")
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
                label="Entidad"
                placeholder="Seleccione la autoridad de tránsito"
              />
            )}
          </form.AppField>
          <form.AppField name="infractionId">
            {(field) => (
              <field.SelectField
                items={infractionItems}
                label="Infracción"
                placeholder="Seleccione una infracción"
              />
            )}
          </form.AppField>
          <form.AppField name="number">
            {(field) => (
              <field.TextField
                autoComplete="off"
                label="Número del comparendo"
              />
            )}
          </form.AppField>
          <form.AppField name="location">
            {(field) => <field.TextField label="Lugar" />}
          </form.AppField>
          <form.AppField name="occurredAt">
            {(field) => (
              <field.TextField
                label="Fecha y hora de la infracción (hora de Colombia)"
                type="datetime-local"
              />
            )}
          </form.AppField>
          <form.AppField name="agentCode">
            {(field) => (
              <field.TextField label="Código del agente (opcional)" />
            )}
          </form.AppField>
          <form.AppField name="dueOn">
            {(field) => (
              <field.TextField label="Fecha límite (opcional)" type="date" />
            )}
          </form.AppField>
          <form.AppField name="plate">
            {(field) => (
              <field.TextField
                aria-describedby="fine-plate-hint"
                autoCapitalize="characters"
                label="Placa (opcional)"
              />
            )}
          </form.AppField>
          <FieldDescription id="fine-plate-hint">
            El vehículo debe estar registrado. Deje el campo vacío para un
            comparendo sin vehículo.
          </FieldDescription>
        </FieldGroup>
      )}
      <InlineError error={entities.error ?? infractions.error ?? submitError} />
      <form.AppForm>
        <form.SubmitButton>Registrar comparendo</form.SubmitButton>
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
        setSubmitError(new Error("Primero busque al ciudadano."));
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
            : new Error("No pudimos registrar el trámite. Intente de nuevo.")
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
                label="Entidad"
                placeholder="Seleccione una entidad"
              />
            )}
          </form.AppField>
          <form.AppField name="procedureTypeId">
            {(field) => (
              <field.SelectField
                items={procedureTypeItems}
                label="Tipo de trámite"
                placeholder={
                  entityId === ""
                    ? "Primero seleccione una entidad"
                    : "Seleccione un tipo de trámite"
                }
              />
            )}
          </form.AppField>
          <form.AppField name="number">
            {(field) => (
              <field.TextField autoComplete="off" label="Número del trámite" />
            )}
          </form.AppField>
          <form.AppField name="dueOn">
            {(field) => (
              <field.TextField label="Fecha límite (opcional)" type="date" />
            )}
          </form.AppField>
          <form.AppField name="plate">
            {(field) => (
              <field.TextField
                autoCapitalize="characters"
                label="Placa (opcional)"
              />
            )}
          </form.AppField>
        </FieldGroup>
      )}
      <InlineError
        error={entities.error ?? procedureTypes.error ?? submitError}
      />
      <form.AppForm>
        <form.SubmitButton>Registrar trámite</form.SubmitButton>
      </form.AppForm>
      {created === null ? null : <CreatedObligation obligation={created} />}
    </form>
  );
};

const ObligationsPage = () => (
  <>
    <PageHeader
      description="Registre un comparendo o un trámite para un ciudadano. El valor viene del catálogo."
      title="Obligaciones"
    />
    <Tabs defaultValue="fine">
      <TabsList>
        <TabsTrigger value="fine">Nuevo comparendo</TabsTrigger>
        <TabsTrigger value="procedure">Nuevo trámite</TabsTrigger>
      </TabsList>
      <TabsContent value="fine">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Nuevo comparendo</CardTitle>
            <CardDescription>
              Solo la autoridad de tránsito expide comparendos. El comparendo
              toma el valor de la infracción en el catálogo.
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
            <CardTitle>Nuevo trámite</CardTitle>
            <CardDescription>
              El trámite toma la tarifa de su tipo. Un tipo sin tarifa crea una
              obligación sin valor a pagar.
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
  head: () => ({
    meta: [{ title: "Obligaciones | Funcionarios | Transipay" }],
  }),
  component: ObligationsPage,
});
