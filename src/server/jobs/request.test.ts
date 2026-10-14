import { describe, expect, it, vi } from "vitest";

import {
  JOBS_BODY_LIMIT_BYTES,
  handleJobsRequest,
  secretMatches,
} from "./request";
import type { ScheduledJobsResult } from "./run-jobs";

const url = "https://transipay.example.com/api/jobs/run";
const SECRET = "jobs-secret-0123456789abcdefghijklmnop";

const okResult: ScheduledJobsResult = {
  payouts: { ok: true, sent: 2 },
  payments: { ok: true, processed: 3, failed: 1 },
};

const post = (headers: Record<string, string> = {}, body?: string) =>
  new Request(url, { method: "POST", headers, body });

const authorized = (body?: string) =>
  post({ authorization: `Bearer ${SECRET}` }, body);

const handle = async (
  request: Request,
  options: { secret?: string; result?: ScheduledJobsResult } = {}
) => {
  const run = vi.fn<() => Promise<ScheduledJobsResult>>(
    async () => await Promise.resolve(options.result ?? okResult)
  );
  const response = await handleJobsRequest(request, {
    secret: "secret" in options ? options.secret : SECRET,
    run,
  });
  return { response, run };
};

describe(secretMatches, () => {
  it("accepts the same secret", () => {
    expect(secretMatches(SECRET, SECRET)).toBeTruthy();
  });

  it("refuses a different secret of the same length", () => {
    expect(secretMatches(`${SECRET.slice(0, -1)}X`, SECRET)).toBeFalsy();
  });

  it("refuses a shorter or a longer secret", () => {
    expect(secretMatches(SECRET.slice(0, -1), SECRET)).toBeFalsy();
    expect(secretMatches(`${SECRET}X`, SECRET)).toBeFalsy();
    expect(secretMatches("", SECRET)).toBeFalsy();
  });
});

describe(handleJobsRequest, () => {
  it("returns 404 and runs nothing when the secret is not set", async () => {
    const { response, run } = await handle(authorized(), { secret: undefined });

    expect(response.status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns 404 for another method when the secret is not set", async () => {
    const { response } = await handle(new Request(url), { secret: undefined });

    expect(response.status).toBe(404);
  });

  it("returns 405 for GET and runs nothing", async () => {
    const { response, run } = await handle(
      new Request(url, { headers: { authorization: `Bearer ${SECRET}` } })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ["no header", {}],
    ["a wrong secret", { authorization: `Bearer ${SECRET}X` }],
    ["another scheme", { authorization: `Basic ${SECRET}` }],
    ["an empty token", { authorization: "Bearer " }],
  ])("returns 401 with no detail for %s", async (_name, headers) => {
    const { response, run } = await handle(post(headers));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("");
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the jobs and returns the counts for the correct secret", async () => {
    const { response, run } = await handle(authorized());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual(okResult);
    expect(run).toHaveBeenCalledOnce();
  });

  it("returns 500 with the counts when one job fails", async () => {
    const result: ScheduledJobsResult = {
      payouts: { ok: false },
      payments: { ok: true, processed: 1, failed: 0 },
    };

    const { response } = await handle(authorized(), { result });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toStrictEqual(result);
  });

  it("returns 413 and runs nothing for a large body", async () => {
    const { response, run } = await handle(
      authorized("x".repeat(JOBS_BODY_LIMIT_BYTES + 1))
    );

    expect(response.status).toBe(413);
    expect(run).not.toHaveBeenCalled();
  });
});
