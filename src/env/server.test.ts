import { afterEach, describe, expect, it, vi } from "vitest";

const loadServerEnv = async () => {
  vi.resetModules();
  const { serverEnv } = await import("./server");
  return serverEnv;
};

describe("JOBS_SECRET", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is undefined when it is not set or empty", async () => {
    vi.stubEnv("JOBS_SECRET", "");

    await expect(loadServerEnv()).resolves.toMatchObject({
      JOBS_SECRET: undefined,
    });
  });

  it("accepts a secret of 32 characters", async () => {
    const secret = "a".repeat(32);
    vi.stubEnv("JOBS_SECRET", secret);

    await expect(loadServerEnv()).resolves.toMatchObject({
      JOBS_SECRET: secret,
    });
  });

  it("refuses a secret shorter than 32 characters", async () => {
    vi.stubEnv("JOBS_SECRET", "a".repeat(31));

    await expect(loadServerEnv()).rejects.toThrow(
      "Invalid environment variables"
    );
  });
});
