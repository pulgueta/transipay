import { Link, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { isAccessDenied } from "@/lib/auth/guards";

/** A permission denial. A new try gives the same result, so this screen has no Retry button. */
const AccessDenied = () => (
  <section className="mx-auto flex max-w-md flex-col gap-4 py-16">
    <h1 className="text-2xl font-semibold tracking-tight">
      No tiene acceso a esta página
    </h1>
    <p className="text-muted-foreground">
      Su rol no tiene permiso para ver esta página. Si necesita acceso, hable
      con un administrador.
    </p>
    <Button
      className="self-start"
      nativeButton={false}
      render={<Link to="/" />}
      variant="outline"
    >
      Ir al inicio
    </Button>
  </section>
);

/** Default error boundary for routes. It does not show internal error details. */
export const ErrorPage = ({ error, reset }: ErrorComponentProps) => {
  const router = useRouter();

  if (error instanceof Error && isAccessDenied(error)) {
    return <AccessDenied />;
  }

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
