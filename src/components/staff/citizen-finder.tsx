import { IconSearch } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { DOCUMENT_TYPE_ITEMS } from "@/components/auth/sign-up-form";
import { Button } from "@/components/ui/button";
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
import { documentSchema } from "@/lib/citizens/document";
import { findCitizenFn } from "@/server/obligations/staff-functions";

import { InlineError } from "./inline-error";

export type FoundCitizen = NonNullable<
  Awaited<ReturnType<typeof findCitizenFn>>
>;

interface CitizenFinderProps {
  /** The prefix of the element ids, so two finders on one page do not share ids. */
  idPrefix: string;
  citizen: FoundCitizen | null;
  onChange: (citizen: FoundCitizen | null) => void;
}

/** Finds a citizen by document. The staff forms need the citizen id before they can create an obligation. */
export const CitizenFinder = ({
  idPrefix,
  citizen,
  onChange,
}: CitizenFinderProps) => {
  const findCitizen = useServerFn(findCitizenFn);
  const [documentType, setDocumentType] = useState("CC");
  const [documentNumber, setDocumentNumber] = useState("");
  const [inputError, setInputError] = useState<Error | null>(null);
  const find = useMutation({
    mutationFn: async () => {
      const parsed = documentSchema.safeParse({ documentType, documentNumber });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.at(0)?.message ?? "Revise el documento."
        );
      }
      return await findCitizen({ data: parsed.data });
    },
    onSuccess: onChange,
  });

  return (
    <div className="flex flex-col gap-3">
      <FieldGroup className="sm:flex-row sm:items-end">
        <Field className="sm:w-56">
          <FieldLabel htmlFor={`${idPrefix}-document-type`}>
            Tipo de documento
          </FieldLabel>
          <Select
            items={DOCUMENT_TYPE_ITEMS}
            onValueChange={(value) => {
              if (value !== null) {
                setDocumentType(value);
              }
            }}
            value={documentType}
          >
            <SelectTrigger className="w-full" id={`${idPrefix}-document-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DOCUMENT_TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-document-number`}>
            Número de documento
          </FieldLabel>
          <Input
            id={`${idPrefix}-document-number`}
            inputMode="numeric"
            onChange={(event) => {
              setDocumentNumber(event.target.value);
              setInputError(null);
            }}
            value={documentNumber}
          />
        </Field>
        <Button
          disabled={find.isPending}
          onClick={() => {
            setInputError(null);
            find.mutate();
          }}
          type="button"
          variant="outline"
        >
          {find.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconSearch data-icon="inline-start" strokeWidth={1.75} />
          )}
          Buscar ciudadano
        </Button>
      </FieldGroup>
      <InlineError error={inputError ?? find.error} />
      {find.isSuccess && citizen === null ? (
        <p className="text-muted-foreground text-sm">
          Ningún ciudadano tiene este documento. Primero debe registrar al
          ciudadano.
        </p>
      ) : null}
      {citizen === null ? null : (
        <output className="text-sm">
          Ciudadano:{" "}
          <span className="font-medium">
            {citizen.firstName} {citizen.lastName}
          </span>{" "}
          ({citizen.documentType} {citizen.documentNumber})
        </output>
      )}
    </div>
  );
};
