import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { checkIn } from "./checks";
import { citizen } from "./citizens";
import { id, timestamps, timestamptz } from "./columns";
import { branch, entity } from "./entities";
import { obligation, procedureType } from "./obligations";

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "attended",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const ENROLLMENT_STATUSES = [
  "enrolled",
  "attended",
  "absent",
  "cancelled",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const appointment = pgTable(
  "appointment",
  {
    id: id(),
    citizenId: uuid()
      .notNull()
      .references(() => citizen.id, { onDelete: "restrict" }),
    // The entity of the branch and of the procedure type (see the foreign keys below).
    entityId: uuid().notNull(),
    branchId: uuid().notNull(),
    procedureTypeId: uuid().notNull(),
    // Optional. When it is set, the obligation belongs to the appointment citizen.
    obligationId: uuid(),
    scheduledAt: timestamptz().notNull(),
    status: text().$type<AppointmentStatus>().notNull().default("scheduled"),
    ...timestamps(),
  },
  (table) => [
    index("appointment_branch_id_scheduled_at_idx").on(
      table.branchId,
      table.scheduledAt
    ),
    index("appointment_citizen_id_id_idx").on(table.citizenId, table.id),
    index("appointment_procedure_type_id_idx").on(table.procedureTypeId),
    index("appointment_obligation_id_idx").on(table.obligationId),
    foreignKey({
      name: "appointment_branch_id_entity_id_fkey",
      columns: [table.branchId, table.entityId],
      foreignColumns: [branch.id, branch.entityId],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointment_procedure_type_id_entity_id_fkey",
      columns: [table.procedureTypeId, table.entityId],
      foreignColumns: [procedureType.id, procedureType.entityId],
    }).onDelete("restrict"),
    // RESTRICT, not SET NULL: SET NULL also clears citizen_id.
    foreignKey({
      name: "appointment_obligation_id_citizen_id_fkey",
      columns: [table.obligationId, table.citizenId],
      foreignColumns: [obligation.id, obligation.citizenId],
    }).onDelete("restrict"),
    checkIn("appointment_status_check", table.status, APPOINTMENT_STATUSES),
  ]
);

/** A pedagogical course session. Attendance gives a discount on a fine. */
export const courseSession = pgTable(
  "course_session",
  {
    id: id(),
    // The CEA or the ITTB that gives the course.
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    // The branch belongs to the session entity (see the foreign key below).
    branchId: uuid().notNull(),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz().notNull(),
    capacity: integer().notNull(),
    discountPercent: smallint().notNull(),
    ...timestamps(),
  },
  (table) => [
    index("course_session_entity_id_idx").on(table.entityId),
    foreignKey({
      name: "course_session_branch_id_entity_id_fkey",
      columns: [table.branchId, table.entityId],
      foreignColumns: [branch.id, branch.entityId],
    }).onDelete("restrict"),
    index("course_session_branch_id_starts_at_idx").on(
      table.branchId,
      table.startsAt
    ),
    check(
      "course_session_ends_at_check",
      sql`${table.endsAt} > ${table.startsAt}`
    ),
    check("course_session_capacity_check", sql`${table.capacity} > 0`),
    check(
      "course_session_discount_percent_check",
      sql`${table.discountPercent} between 0 and 100`
    ),
  ]
);

export const courseEnrollment = pgTable(
  "course_enrollment",
  {
    id: id(),
    courseSessionId: uuid()
      .notNull()
      .references(() => courseSession.id, { onDelete: "restrict" }),
    citizenId: uuid()
      .notNull()
      .references(() => citizen.id, { onDelete: "restrict" }),
    // The fine that gets the discount. It belongs to the enrolled citizen (see the foreign keys below).
    // The course entity and the fine creditor can be different: a CEA course can discount an ITTB fine.
    obligationId: uuid().notNull(),
    // Constant column for the composite foreign key to obligation (id, kind).
    obligationKind: text()
      .$type<"fine">()
      .notNull()
      .generatedAlwaysAs(sql`'fine'`),
    status: text().$type<EnrollmentStatus>().notNull().default("enrolled"),
    attendedAt: timestamptz(),
    ...timestamps(),
  },
  (table) => [
    unique("course_enrollment_course_session_id_citizen_id_key").on(
      table.courseSessionId,
      table.citizenId
    ),
    // One live enrollment per fine. A cancelled enrollment does not block a new one.
    uniqueIndex("course_enrollment_obligation_id_key")
      .on(table.obligationId)
      .where(sql`${table.status} <> 'cancelled'`),
    // The partial index above does not cover cancelled rows, so the foreign key needs its own index.
    index("course_enrollment_obligation_id_idx").on(table.obligationId),
    index("course_enrollment_citizen_id_idx").on(table.citizenId),
    foreignKey({
      name: "course_enrollment_obligation_id_citizen_id_fkey",
      columns: [table.obligationId, table.citizenId],
      foreignColumns: [obligation.id, obligation.citizenId],
    }).onDelete("restrict"),
    foreignKey({
      name: "course_enrollment_obligation_id_obligation_kind_fkey",
      columns: [table.obligationId, table.obligationKind],
      foreignColumns: [obligation.id, obligation.kind],
    }).onDelete("restrict"),
    checkIn(
      "course_enrollment_status_check",
      table.status,
      ENROLLMENT_STATUSES
    ),
    check(
      "course_enrollment_attended_at_check",
      sql`(${table.status} = 'attended') = (${table.attendedAt} is not null)`
    ),
  ]
);
