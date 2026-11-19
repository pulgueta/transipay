import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchFormProps {
  /** The search in the URL. */
  value: string | undefined;
  label: string;
  placeholder: string;
  /** Gets the trimmed text, or undefined for empty text. */
  onSearch: (value: string | undefined) => void;
}

/** The search box of a staff list. */
export const SearchForm = ({
  value,
  label,
  placeholder,
  onSearch,
}: SearchFormProps) => {
  const [draft, setDraft] = useState(value ?? "");
  // Back and Forward change the search in the URL. Then the input shows that search again.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setDraft(value ?? "");
  }

  return (
    <search>
      <form
        className="flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          onSearch(text === "" ? undefined : text);
        }}
      >
        <Input
          aria-label={label}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder={placeholder}
          type="search"
          value={draft}
        />
        <Button type="submit" variant="outline">
          <IconSearch data-icon="inline-start" strokeWidth={1.75} />
          Buscar
        </Button>
      </form>
    </search>
  );
};
