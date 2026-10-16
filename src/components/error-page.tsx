import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

/** Default error boundary for routes. It does not show internal error details. */
export const ErrorPage = ({ reset }: ErrorComponentProps) => {
  const router = useRouter();

  const retry = () => {
    reset();
    // Loads the route data again. The error boundary shows a new error if it fails.
    void router.invalidate();
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Ocurrió un error
      </h1>
      <p className="text-muted-foreground">
        No pudimos mostrar esta página. Intente de nuevo.
      </p>
      <Button className="self-start" onClick={retry}>
        Intentar de nuevo
      </Button>
    </section>
  );
};
