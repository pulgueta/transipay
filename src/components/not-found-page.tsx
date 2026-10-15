import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const NotFoundPage = () => (
  <section className="mx-auto flex max-w-md flex-col gap-4 py-16">
    <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
    <p className="text-muted-foreground">
      This page does not exist. Make sure that the address is correct.
    </p>
    <Button
      className="self-start"
      nativeButton={false}
      render={<Link to="/" />}
      variant="outline"
    >
      Go to the home page
    </Button>
  </section>
);
