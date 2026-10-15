/**
 * Gives a copy of a better-auth response with `Cache-Control: private, no-store`.
 * The auth HTTP routes do not go through `authMiddleware`, so they set the same header here.
 */
export const withPrivateNoStore = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
