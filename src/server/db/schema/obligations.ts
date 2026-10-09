import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { checkIn } from "./checks";
import { citizen, vehicle } from "./citizens";
import { id, timestamps, timestamptz } from "./columns";
import { entity } from "./entities";

export const OBLIGATION_KINDS = ["fine", "procedure"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export const OBLIGATION_STATUSES = [
  "pending",
  "in_agreement",
  "paid",
  "void",
] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

/** Catalog of traffic infractions (for example, code 'C02'). */
export const infraction = pgTable(
  "infraction",
  {
    id: id(),
    code: text().notNull().unique("infraction_code_key"),
    description: text().notNull(),
    amountInCents: bigint({ mode: "number" }).notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    check("infraction_amount_in_cents_check", sql`${table.amountInCents} > 0`),
  ]
);

/** Catalog of procedures that an entity offers. */
export const procedureType = pgTable(
  "procedure_type",
  {
    id: id(),
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    code: text().notNull().unique("procedure_type_code_key"),
    name: text().notNull(),
    // Zero is valid: some procedures have no fee.
    amountInCents: bigint({ mode: "number" }).notNull(),
    requiresAppointment: boolean().notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    index("procedure_type_entity_id_idx").on(table.entityId),
    check(
      "procedure_type_amount_in_cents_check",
      sql`${table.amountInCents} >= 0`
    ),
  ]
);

/**
 * The single source of truth for what a citizen owes.
 * `fine` and `procedure` are 1:1 subtypes. The amount is a snapshot at issue time.
 */
export const obligation = pgTable(
  "obligation",
  {
    id: id(),
    citizenId: uuid()
      .notNull()
      .references(() => citizen.id, { onDelete: "restrict" }),
    // The creditor entity.
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    kind: text().$type<ObligationKind>().notNull(),
    number: text().notNull(),
    amountInCents: bigint({ mode: "number" }).notNull(),
    discountInCents: bigint({ mode: "number" }).notNull().default(0),
    status: text().$type<ObligationStatus>().notNull().default("pending"),
    issuedAt: timestamptz().notNull().defaultNow(),
    dueOn: date({ mode: "string" }),
    ...timestamps(),
  },
  (table) => [
    unique("obligation_entity_id_number_key").on(table.entityId, table.number),
    // Target of the subtype foreign keys. It makes sure a fine row points to a 'fine' obligation.
    unique("obligation_id_kind_key").on(table.id, table.kind),
    index("obligation_citizen_id_id_idx").on(table.citizenId, table.id),
    index("obligation_entity_id_status_id_idx").on(
      table.entityId,
      table.status,
      table.id
    ),
    checkIn("obligation_kind_check", table.kind, OBLIGATION_KINDS),
    checkIn("obligation_status_check", table.status, OBLIGATION_STATUSES),
    check("obligation_amount_in_cents_check", sql`${table.amountInCents} > 0`),
    check(
      "obligation_discount_in_cents_check",
      sql`${table.discountInCents} >= 0 and ${table.discountInCents} <= ${table.amountInCents}`
    ),
  ]
);

export const fine = pgTable(
  "fine",
  {
    obligationId: uuid().primaryKey(),
    // Constant column for the composite foreign key to obligation (id, kind).
    kind: text()
      .$type<"fine">()
      .notNull()
      .generatedAlwaysAs(sql`'fine'`),
    infractionId: uuid()
      .notNull()
      .references(() => infraction.id, { onDelete: "restrict" }),
    vehicleId: uuid().references(() => vehicle.id, { onDelete: "set null" }),
    location: text().notNull(),
    occurredAt: timestamptz().notNull(),
    agentCode: text(),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: "fine_obligation_id_kind_fkey",
      columns: [table.obligationId, table.kind],
      foreignColumns: [obligation.id, obligation.kind],
    }).onDelete("cascade"),
    index("fine_infraction_id_idx").on(table.infractionId),
    index("fine_vehicle_id_idx").on(table.vehicleId),
  ]
);

export const procedure = pgTable(
  "procedure",
  {
    obligationId: uuid().primaryKey(),
    // Constant column for the composite foreign key to obligation (id, kind).
    kind: text()
      .$type<"procedure">()
      .notNull()
      .generatedAlwaysAs(sql`'procedure'`),
    procedureTypeId: uuid()
      .notNull()
      .references(() => procedureType.id, { onDelete: "restrict" }),
    vehicleId: uuid().references(() => vehicle.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: "procedure_obligation_id_kind_fkey",
      columns: [table.obligationId, table.kind],
      foreignColumns: [obligation.id, obligation.kind],
    }).onDelete("cascade"),
    index("procedure_procedure_type_id_idx").on(table.procedureTypeId),
    index("procedure_vehicle_id_idx").on(table.vehicleId),
  ]
);
