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
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-medium">An error occurred</h1>
      <p className="text-muted-foreground text-sm">
        We cannot show this page now. Try again.
      </p>
      <Button className="self-start" onClick={retry}>
        Try again
      </Button>
    </main>
  );
};
