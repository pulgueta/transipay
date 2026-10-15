import type { QueryClient } from "@tanstack/react-query";

/**
 * Removes the data of the old session, then loads the routes again with the new session.
 * The cached queries do not have the user in their keys, so they must not go to the next user.
 */
export const reloadForNewSession = async (
  queryClient: QueryClient,
  router: { invalidate: () => Promise<void> }
) => {
  queryClient.clear();
  await router.invalidate();
};
