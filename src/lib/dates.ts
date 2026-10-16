const TIME_ZONE = "America/Bogota";

const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

// A `date` column is a calendar date. UTC keeps the same date for every reader.
const dateFormat = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  dateStyle: "medium",
});

// en-CA gives YYYY-MM-DD.
const isoDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** Shows an instant as a date and time in Bogota, for example "14/10/2026, 10:30 a. m.". */
export const formatBogotaDateTime = (date: Date) => dateTimeFormat.format(date);

/** Shows a `date` column value ("YYYY-MM-DD") as a date, for example "20/10/2026". */
export const formatBogotaDate = (date: string) =>
  dateFormat.format(new Date(date));

/** The calendar date in Bogota as "YYYY-MM-DD". Compare it with a `date` column value. */
export const bogotaDateString = (now: Date) => isoDateFormat.format(now);

// Bogota has no daylight saving time, so its offset is always -05:00.
const BOGOTA_OFFSET = "-05:00";
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");

/** Formats an instant as Bogota time for a `datetime-local` input ("YYYY-MM-DDTHH:mm"). */
export const toBogotaDateTimeLocalValue = (date: Date) => {
  // The UTC fields of the shifted instant are the Bogota wall clock.
  const wall = new Date(date.getTime() + BOGOTA_OFFSET_MS);
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
};

const DATE_TIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u;

/**
 * Reads a `datetime-local` value ("YYYY-MM-DDTHH:mm", seconds optional) as Bogota time.
 * The result does not depend on the time zone of the device.
 * Throws a RangeError when the value is not a valid date and time.
 */
export const bogotaWallClockToInstant = (value: string): Date => {
  if (!DATE_TIME_LOCAL.test(value)) {
    throw new RangeError(`"${value}" is not a datetime-local value.`);
  }
  const instant = new Date(`${value}${BOGOTA_OFFSET}`);
  // A value such as February 30 must not move to another day.
  if (
    Number.isNaN(instant.getTime()) ||
    toBogotaDateTimeLocalValue(instant) !== value.slice(0, 16)
  ) {
    throw new RangeError(`"${value}" is not a valid date and time.`);
  }
  return instant;
};
