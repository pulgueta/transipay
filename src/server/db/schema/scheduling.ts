import { sql } from "drizzle-orm";
import {
  check,
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
    branchId: uuid()
      .notNull()
      .references(() => branch.id, { onDelete: "restrict" }),
    procedureTypeId: uuid()
      .notNull()
      .references(() => procedureType.id, { onDelete: "restrict" }),
    obligationId: uuid().references(() => obligation.id, {
      onDelete: "set null",
    }),
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
    branchId: uuid()
      .notNull()
      .references(() => branch.id, { onDelete: "restrict" }),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz().notNull(),
    capacity: integer().notNull(),
    discountPercent: smallint().notNull(),
    ...timestamps(),
  },
  (table) => [
    index("course_session_entity_id_idx").on(table.entityId),
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
    // The fine that gets the discount.
    obligationId: uuid()
      .notNull()
      .references(() => obligation.id, { onDelete: "restrict" }),
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
