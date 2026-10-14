import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const NotFoundPage = () => (
  <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
    <h1 className="text-lg font-medium">Page not found</h1>
    <p className="text-muted-foreground text-sm">
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
  </main>
);
