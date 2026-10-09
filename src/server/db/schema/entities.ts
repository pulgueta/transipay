import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { checkIn } from "./checks";
import { id, timestamps } from "./columns";

export const ENTITY_KINDS = [
  "transit_authority",
  "cda",
  "cea",
  "collector",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const BANK_ACCOUNT_TYPES = [
  "AHORROS",
  "CORRIENTE",
  "DEPOSITO_ELECTRONICO",
] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

/** Legal id types that Wompi payouts accept for an account holder. */
export const HOLDER_LEGAL_ID_TYPES = [
  "CC",
  "NIT",
  "PP",
  "CE",
  "TI",
  "DNI",
] as const;
export type HolderLegalIdType = (typeof HOLDER_LEGAL_ID_TYPES)[number];

export const STAFF_ROLES = [
  "admin",
  "supervisor",
  "cashier",
  "scheduler",
  "instructor",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** A transit organization: the ITTB, a CDA, a CEA, or a collector. */
export const entity = pgTable(
  "entity",
  {
    id: id(),
    kind: text().$type<EntityKind>().notNull(),
    name: text().notNull(),
    taxId: text().notNull().unique("entity_tax_id_key"),
    email: text().notNull(),
    phone: text().notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (table) => [checkIn("entity_kind_check", table.kind, ENTITY_KINDS)]
);

export const branch = pgTable(
  "branch",
  {
    id: id(),
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    name: text().notNull(),
    address: text().notNull(),
    city: text().notNull().default("Barrancabermeja"),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  // The unique key starts with entity_id, so it also indexes the foreign key.
  (table) => [
    unique("branch_entity_id_name_key").on(table.entityId, table.name),
    // Target of the ownership foreign keys: a child row refers to a branch of its own entity.
    unique("branch_id_entity_id_key").on(table.id, table.entityId),
  ]
);

/** Bank account that receives Wompi payouts for an entity. */
export const entityBankAccount = pgTable(
  "entity_bank_account",
  {
    id: id(),
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    // Bank id from the Wompi payouts bank list.
    bankId: text().notNull(),
    accountType: text().$type<BankAccountType>().notNull(),
    accountNumber: text().notNull(),
    holderName: text().notNull(),
    holderLegalIdType: text().$type<HolderLegalIdType>().notNull(),
    holderLegalId: text().notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    // Target of the ownership foreign key: a payout uses an account of its own entity.
    unique("entity_bank_account_id_entity_id_key").on(table.id, table.entityId),
    unique("entity_bank_account_entity_id_bank_id_account_number_key").on(
      table.entityId,
      table.bankId,
      table.accountNumber
    ),
    uniqueIndex("entity_bank_account_entity_id_default_key")
      .on(table.entityId)
      .where(sql`${table.isDefault}`),
    checkIn(
      "entity_bank_account_account_type_check",
      table.accountType,
      BANK_ACCOUNT_TYPES
    ),
    checkIn(
      "entity_bank_account_holder_legal_id_type_check",
      table.holderLegalIdType,
      HOLDER_LEGAL_ID_TYPES
    ),
  ]
);

/**
 * Role of a user inside one entity.
 * `auth.user.role` is the platform role. This role is scoped to the entity.
 */
export const staffMember = pgTable(
  "staff_member",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    role: text().$type<StaffRole>().notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("staff_member_user_id_entity_id_key").on(
      table.userId,
      table.entityId
    ),
    index("staff_member_entity_id_idx").on(table.entityId),
    checkIn("staff_member_role_check", table.role, STAFF_ROLES),
  ]
);
