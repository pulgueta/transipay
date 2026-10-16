import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "./use-now";

describe(useNow, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("gives the time at mount, then a new time after each interval", () => {
    const { result } = renderHook(() => useNow(30_000));
    expect(result.current).toBe(Date.parse("2026-10-15T10:00:00Z"));

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(result.current).toBe(Date.parse("2026-10-15T10:00:00Z"));

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(Date.parse("2026-10-15T10:00:30Z"));
  });

  it("stops the timer when the component unmounts", () => {
    const { unmount } = renderHook(() => useNow(30_000));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
