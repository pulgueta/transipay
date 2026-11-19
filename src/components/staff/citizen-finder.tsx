import { IconSearch } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { z } from "zod";

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
import {
  documentNumberInputMode,
  documentSchema,
} from "@/lib/citizens/document";
import type { findCitizenFn } from "@/server/obligations/staff-functions";

import { InlineError } from "./inline-error";

export type FoundCitizen = NonNullable<
  Awaited<ReturnType<typeof findCitizenFn>>
>;

/** The lookup. The page gives `useServerFn(findCitizenFn)`. */
export type FindCitizen = (options: {
  data: z.output<typeof documentSchema>;
}) => Promise<FoundCitizen | null>;

interface CitizenFinderProps {
  /** The prefix of the element ids, so two finders on one page do not share ids. */
  idPrefix: string;
  citizen: FoundCitizen | null;
  onChange: (citizen: FoundCitizen | null) => void;
  findCitizen: FindCitizen;
}

/** Finds a citizen by document. The staff forms need the citizen id before they can create an obligation. */
export const CitizenFinder = ({
  idPrefix,
  citizen,
  onChange,
  findCitizen,
}: CitizenFinderProps) => {
  const [documentType, setDocumentType] = useState("CC");
  const [documentNumber, setDocumentNumber] = useState("");
  const [inputError, setInputError] = useState<Error | null>(null);
  // The number of the current lookup. A change to the document starts a new number, so the result
  // of an earlier lookup cannot change the selection. `reset` does not stop the callbacks of a running lookup.
  const lookup = useRef(0);
  const find = useMutation({
    mutationFn: async (_lookupNumber: number) => {
      const parsed = documentSchema.safeParse({ documentType, documentNumber });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.at(0)?.message ?? "Revise el documento."
        );
      }
      return await findCitizen({ data: parsed.data });
    },
    onSuccess: (result, lookupNumber) => {
      if (lookupNumber === lookup.current) {
        onChange(result);
      }
    },
    // A failed lookup must not keep the citizen of an earlier lookup.
    onError: (_error, lookupNumber) => {
      if (lookupNumber === lookup.current) {
        onChange(null);
      }
    },
  });

  /** The document changed, so the selected citizen and the last result are not correct now. */
  const clearCitizen = () => {
    lookup.current += 1;
    find.reset();
    if (citizen !== null) {
      onChange(null);
    }
  };

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
                clearCitizen();
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
            inputMode={documentNumberInputMode(documentType)}
            onChange={(event) => {
              setDocumentNumber(event.target.value);
              setInputError(null);
              clearCitizen();
            }}
            value={documentNumber}
          />
        </Field>
        <Button
          disabled={find.isPending}
          onClick={() => {
            setInputError(null);
            find.mutate(lookup.current);
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
