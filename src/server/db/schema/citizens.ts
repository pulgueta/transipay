import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { checkIn } from "./checks";
import { id, timestamps } from "./columns";
import { entity } from "./entities";

export const DOCUMENT_TYPES = ["CC", "CE", "TI", "PP", "NIT", "PEP"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const LICENSE_CATEGORIES = [
  "A1",
  "A2",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
] as const;
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];

export const VEHICLE_TYPES = [
  "car",
  "motorcycle",
  "truck",
  "bus",
  "van",
  "other",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const SERVICE_TYPES = ["private", "public", "official"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const VEHICLE_DOCUMENT_KINDS = ["soat", "technical_inspection"] as const;
export type VehicleDocumentKind = (typeof VEHICLE_DOCUMENT_KINDS)[number];

/**
 * A person with obligations. The user link is optional:
 * the ITTB registers fines for people who do not have an account yet.
 * For the same reason, the contact fields are optional.
 */
export const citizen = pgTable(
  "citizen",
  {
    id: id(),
    userId: uuid()
      .unique("citizen_user_id_key")
      .references(() => user.id, { onDelete: "set null" }),
    documentType: text().$type<DocumentType>().notNull(),
    documentNumber: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    email: text(),
    phone: text(),
    address: text(),
    ...timestamps(),
  },
  (table) => [
    unique("citizen_document_type_document_number_key").on(
      table.documentType,
      table.documentNumber
    ),
    checkIn("citizen_document_type_check", table.documentType, DOCUMENT_TYPES),
    // The canonical form (see `normalizeDocumentNumber`): no spaces, points, or hyphens, and uppercase letters.
    check(
      "citizen_document_number_canonical_check",
      sql`${table.documentNumber} = upper(regexp_replace(${table.documentNumber}, '[\\s.-]', '', 'g'))`
    ),
  ]
);

export const driverLicense = pgTable(
  "driver_license",
  {
    id: id(),
    citizenId: uuid()
      .notNull()
      .references(() => citizen.id, { onDelete: "cascade" }),
    number: text().notNull().unique("driver_license_number_key"),
    category: text().$type<LicenseCategory>().notNull(),
    issuedOn: date({ mode: "string" }).notNull(),
    expiresOn: date({ mode: "string" }).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("driver_license_citizen_id_category_key").on(
      table.citizenId,
      table.category
    ),
    checkIn(
      "driver_license_category_check",
      table.category,
      LICENSE_CATEGORIES
    ),
    check(
      "driver_license_expires_on_check",
      sql`${table.expiresOn} > ${table.issuedOn}`
    ),
  ]
);

export const vehicle = pgTable(
  "vehicle",
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => citizen.id, { onDelete: "restrict" }),
    plate: text().notNull().unique("vehicle_plate_key"),
    vehicleType: text().$type<VehicleType>().notNull(),
    serviceType: text().$type<ServiceType>().notNull(),
    brand: text().notNull(),
    line: text().notNull(),
    modelYear: smallint().notNull(),
    ...timestamps(),
  },
  (table) => [
    index("vehicle_owner_id_idx").on(table.ownerId),
    check("vehicle_plate_check", sql`${table.plate} = upper(${table.plate})`),
    checkIn("vehicle_vehicle_type_check", table.vehicleType, VEHICLE_TYPES),
    checkIn("vehicle_service_type_check", table.serviceType, SERVICE_TYPES),
  ]
);

/** SOAT policy or technical inspection certificate of a vehicle. */
export const vehicleDocument = pgTable(
  "vehicle_document",
  {
    id: id(),
    vehicleId: uuid()
      .notNull()
      .references(() => vehicle.id, { onDelete: "cascade" }),
    kind: text().$type<VehicleDocumentKind>().notNull(),
    number: text().notNull(),
    issuerEntityId: uuid().references(() => entity.id, {
      onDelete: "set null",
    }),
    validFrom: date({ mode: "string" }).notNull(),
    validUntil: date({ mode: "string" }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("vehicle_document_vehicle_id_kind_valid_until_idx").on(
      table.vehicleId,
      table.kind,
      table.validUntil
    ),
    index("vehicle_document_issuer_entity_id_idx").on(table.issuerEntityId),
    checkIn("vehicle_document_kind_check", table.kind, VEHICLE_DOCUMENT_KINDS),
    check(
      "vehicle_document_valid_until_check",
      sql`${table.validUntil} >= ${table.validFrom}`
    ),
  ]
);
