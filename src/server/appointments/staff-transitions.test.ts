import { describe, expect, it } from "vitest";

import {
  STAFF_APPOINTMENT_OUTCOMES,
  canStaffTransition,
} from "./staff-transitions";

describe(canStaffTransition, () => {
  it("lets staff close a scheduled appointment as attended or no-show", () => {
    expect(canStaffTransition("scheduled", "attended")).toBeTruthy();
    expect(canStaffTransition("scheduled", "no_show")).toBeTruthy();
  });

  it.each(["attended", "cancelled", "no_show"] as const)(
    "does not move an appointment that is %s",
    (from) => {
      expect(canStaffTransition(from, "attended")).toBeFalsy();
      expect(canStaffTransition(from, "no_show")).toBeFalsy();
    }
  );

  it("lists only the outcomes that staff can set", () => {
    expect(STAFF_APPOINTMENT_OUTCOMES).toStrictEqual(["attended", "no_show"]);
  });
});
