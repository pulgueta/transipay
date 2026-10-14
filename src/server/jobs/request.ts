import { createHash, timingSafeEqual } from "node:crypto";

import { readBodyWithLimit } from "@/server/webhook-body";

import type { ScheduledJobsResult } from "./run-jobs";

/** The jobs route needs no body. A body larger than this gets HTTP 413. */
export const JOBS_BODY_LIMIT_BYTES = 1024;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Compares a given secret with the expected secret in constant time.
 * The two SHA-256 digests have the same length, so the time does not show the length or the first different byte.
 */
export const secretMatches = (given: string, expected: string) =>
  timingSafeEqual(sha256(given), sha256(expected));

const BEARER_PREFIX = "Bearer ";

const bearerToken = (request: Request) => {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length)
    : "";
};

const empty = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

/**
 * Handles a request to the scheduled jobs route.
 * When `secret` is not set, the route is disabled and gives HTTP 404 for all methods.
 * The caller sends `Authorization: Bearer <secret>`. A missing or wrong secret gets HTTP 401 with no detail.
 * The response is the job counts. It is HTTP 500 when one job failed, so a scheduler can see the failure.
 */
export const handleJobsRequest = async (
  request: Request,
  {
    secret,
    run,
  }: { secret: string | undefined; run: () => Promise<ScheduledJobsResult> }
) => {
  if (secret === undefined || secret === "") {
    return empty(404);
  }
  if (request.method !== "POST") {
    return empty(405, { Allow: "POST" });
  }
  const token = bearerToken(request);
  if (token === "" || !secretMatches(token, secret)) {
    return empty(401, { "WWW-Authenticate": "Bearer" });
  }
  if ((await readBodyWithLimit(request, JOBS_BODY_LIMIT_BYTES)) === null) {
    return empty(413);
  }

  const result = await run();
  const ok = result.payouts.ok && result.payments.ok;
  return Response.json(result, {
    status: ok ? 200 : 500,
    headers: { "Cache-Control": "no-store" },
  });
};
