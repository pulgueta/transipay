import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { reloadForNewSession } from "./session-change";

describe(reloadForNewSession, () => {
  it("removes the cached queries before the routes load again", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["citizens", "me"], { id: "citizen-1" });
    queryClient.setQueryData(["staff", "payouts"], []);
    let queriesAtReload = -1;
    const router = {
      invalidate: async () => {
        queriesAtReload = queryClient.getQueryCache().getAll().length;
        await Promise.resolve();
      },
    };

    await reloadForNewSession(queryClient, router);

    expect(queriesAtReload).toBe(0);
    expect(queryClient.getQueryData(["citizens", "me"])).toBeUndefined();
  });
});
