import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { useFormContext } from "./form-context";

/**
 * Submit button for `form.AppForm`. It is disabled only while the form submits.
 * A click on an invalid form touches all fields, which shows their errors.
 */
export const SubmitButton = ({ children }: { children: ReactNode }) => {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button disabled={isSubmitting} type="submit">
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
};
