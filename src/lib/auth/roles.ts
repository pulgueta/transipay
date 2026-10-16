import { isRole } from "./permissions";
import type { Role } from "./permissions";

const STAFF_ROLES = new Set<string>([
  "cashier",
  "scheduler",
  "supervisor",
  "admin",
] satisfies Role[]);

/** Splits the role column. The admin plugin can store a comma-separated list, for example "citizen,admin". */
export const roleNames = (role?: string | null): string[] =>
  (role ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

export const ROLE_LABELS: Record<Role, string> = {
  citizen: "Ciudadano",
  cashier: "Cajero",
  scheduler: "Agendador",
  supervisor: "Supervisor",
  admin: "Administrador",
};

/** The label of one role name. A name that is not an app role shows as it is. */
export const roleLabel = (name: string) =>
  isRole(name) ? ROLE_LABELS[name] : name;

/** True when one of the roles belongs to transit staff. Use it for navigation only. The server checks permissions. */
export const isStaff = (role?: string | null): boolean =>
  roleNames(role).some((name) => STAFF_ROLES.has(name));
