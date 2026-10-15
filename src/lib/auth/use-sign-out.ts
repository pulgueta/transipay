import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { authClient } from "./client";

/** Ends the session, goes to the home page, and loads the routes again without the session. */
export const useSignOut = () => {
  const router = useRouter();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) {
        throw new Error(
          error.message ?? "We could not sign you out. Try again."
        );
      }
    },
    onSuccess: async () => {
      await navigate({ to: "/" });
      await router.invalidate();
    },
  });
};
