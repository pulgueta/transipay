import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const NotFoundPage = () => (
  <section className="mx-auto flex max-w-md flex-col gap-4 py-16">
    <h1 className="text-2xl font-semibold tracking-tight">
      Página no encontrada
    </h1>
    <p className="text-muted-foreground">
      Esta página no existe. Revise que la dirección sea correcta.
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
