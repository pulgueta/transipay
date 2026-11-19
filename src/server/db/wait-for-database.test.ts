import { describe, expect, it, vi } from "vitest";

import { waitForDatabase } from "./wait-for-database";

const timeout = () =>
  Object.assign(new Error("connect"), { code: "ETIMEDOUT" });

describe(waitForDatabase, () => {
  it("returns when the database answers on the first try", async () => {
    const ping = vi.fn<() => Promise<void>>(async () => {});
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

    await waitForDatabase(ping, { attempts: 5, delayMs: 1000, sleep });

    expect(ping).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("tries again while a sleeping database wakes up", async () => {
    const ping = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(timeout())
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce();
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

    await waitForDatabase(ping, { attempts: 5, delayMs: 1000, sleep });

    expect(ping).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toStrictEqual([[1000], [1000]]);
  });

  it("throws the last error when the database does not answer in time", async () => {
    const ping = vi.fn<() => Promise<void>>().mockRejectedValue(timeout());
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

    await expect(
      waitForDatabase(ping, { attempts: 3, delayMs: 1000, sleep })
    ).rejects.toMatchObject({ code: "ETIMEDOUT" });
    expect(ping).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
