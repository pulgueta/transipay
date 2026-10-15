const TIME_ZONE = "America/Bogota";

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

// A `date` column is a calendar date. UTC keeps the same date for every reader.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
});

// en-CA gives YYYY-MM-DD.
const isoDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** Shows an instant as a date and time in Bogota, for example "Oct 14, 2026, 10:30 AM". */
export const formatBogotaDateTime = (date: Date) => dateTimeFormat.format(date);

/** Shows a `date` column value ("YYYY-MM-DD") as a date, for example "Oct 20, 2026". */
export const formatBogotaDate = (date: string) =>
  dateFormat.format(new Date(date));

/** The calendar date in Bogota as "YYYY-MM-DD". Compare it with a `date` column value. */
export const bogotaDateString = (now: Date) => isoDateFormat.format(now);

const pad = (value: number) => String(value).padStart(2, "0");

/** Formats a date in the browser time zone for a `datetime-local` input ("YYYY-MM-DDTHH:mm"). */
export const toDateTimeLocalValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
