import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getMyObligationFn,
  listMyObligationsFn,
} from "@/server/obligations/functions";

export const OBLIGATIONS_KEY = ["obligations"] as const;

/** The first page has no cursor. */
const FIRST_PAGE = "";

/** The pages of the list. Each page sends the `nextCursor` of the page before it. */
export const obligationsQueryOptions = infiniteQueryOptions({
  queryKey: [...OBLIGATIONS_KEY, "list"],
  queryFn: async ({ pageParam }) =>
    await listMyObligationsFn({
      data: { cursor: pageParam === FIRST_PAGE ? undefined : pageParam },
    }),
  initialPageParam: FIRST_PAGE,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

export const obligationQueryOptions = (obligationId: string) =>
  queryOptions({
    queryKey: [...OBLIGATIONS_KEY, obligationId],
    queryFn: async () => await getMyObligationFn({ data: { obligationId } }),
  });
