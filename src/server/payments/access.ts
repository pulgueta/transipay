import { roles } from "@/lib/auth/permissions";

const isRoleName = (name: string): name is keyof typeof roles =>
  Object.hasOwn(roles, name);

/**
 * The owner citizen can read the payment. Staff can read any payment when one of their roles has `payment:read`.
 * The citizen role has `payment:read` only for the payments of that citizen, so it does not count as staff.
 * `role` is the better-auth role list, for example "citizen,cashier".
 */
export const canReadPayment = (input: {
  isOwner: boolean;
  role: string | null | undefined;
}) =>
  input.isOwner ||
  (input.role ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "citizen")
    .some(
      (name) =>
        isRoleName(name) && roles[name].authorize({ payment: ["read"] }).success
    );
