import { describe, expect, it } from "vitest";

import { canImpersonate } from "./impersonation";

const now = new Date("2026-10-09T12:00:00Z");
const past = new Date("2026-10-09T11:59:59Z");
const future = new Date("2026-10-09T12:00:01Z");

describe("impersonation admin", () => {
  it.each([
    { name: "missing user", user: undefined, allowed: false },
    { name: "deleted user", user: null, allowed: false },
    {
      name: "admin",
      user: { role: "admin", banned: false, banExpires: null },
      allowed: true,
    },
    {
      name: "multiple roles",
      user: { role: "citizen,admin", banned: false, banExpires: null },
      allowed: true,
    },
    {
      name: "removed admin role",
      user: { role: "supervisor", banned: false, banExpires: null },
      allowed: false,
    },
    {
      name: "role substring",
      user: { role: "superadmin", banned: false, banExpires: null },
      allowed: false,
    },
    {
      name: "no role",
      user: { role: "", banned: false, banExpires: null },
      allowed: false,
    },
    {
      name: "permanent ban",
      user: { role: "admin", banned: true, banExpires: null },
      allowed: false,
    },
    {
      name: "current ban",
      user: { role: "admin", banned: true, banExpires: future },
      allowed: false,
    },
    {
      name: "ban ends now",
      user: { role: "admin", banned: true, banExpires: now },
      allowed: false,
    },
    {
      name: "expired ban",
      user: { role: "admin", banned: true, banExpires: past },
      allowed: true,
    },
    {
      name: "expired ban without admin role",
      user: { role: "citizen", banned: true, banExpires: past },
      allowed: false,
    },
    {
      name: "inactive ban",
      user: { role: "admin", banned: false, banExpires: future },
      allowed: true,
    },
  ])("checks $name", ({ user, allowed }) => {
    expect(canImpersonate(user, now)).toBe(allowed);
  });
});
