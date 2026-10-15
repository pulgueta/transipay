import { describe, expect, it } from "vitest";

import { resolveObligationState } from "./state";

const now = new Date("2026-10-14T15:00:00Z");

describe(resolveObligationState, () => {
  it("is pending while the due date did not pass", () => {
    expect(
      resolveObligationState({ status: "pending", dueOn: "2026-10-14" }, now)
    ).toBe("pending");
  });

  it("is overdue when the due date passed in Bogota", () => {
    expect(
      resolveObligationState({ status: "pending", dueOn: "2026-10-13" }, now)
    ).toBe("overdue");
  });

  it("is pending without a due date", () => {
    expect(
      resolveObligationState({ status: "pending", dueOn: null }, now)
    ).toBe("pending");
  });

  it("keeps the other statuses", () => {
    expect(
      resolveObligationState({ status: "paid", dueOn: "2020-01-01" }, now)
    ).toBe("paid");
    expect(
      resolveObligationState({ status: "void", dueOn: "2020-01-01" }, now)
    ).toBe("void");
    expect(
      resolveObligationState(
        { status: "in_agreement", dueOn: "2020-01-01" },
        now
      )
    ).toBe("in_agreement");
  });
});
