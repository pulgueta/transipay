import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { useFormContext } from "./form-context";

/** Submit button for `form.AppForm`. It is disabled while the form submits or has errors. */
export const SubmitButton = ({ children }: { children: ReactNode }) => {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isSubmitting] as const}
    >
      {([canSubmit, isSubmitting]) => (
        <Button disabled={!canSubmit || isSubmitting} type="submit">
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
};
