import { describe, expect, it } from "vitest";

import { withPrivateNoStore } from "./auth-response";

describe(withPrivateNoStore, () => {
  it("marks the response as private and not stored", async () => {
    const original = Response.json(
      { ok: true },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "Set-Cookie": "a=1" },
      }
    );

    const response = withPrivateNoStore(original);

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBe("a=1");
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toStrictEqual({ ok: true });
  });
});
