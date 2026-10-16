const BOGOTA = "America/Bogota";

/** Day, month, year, hour, and minute in Bogota time, for example "14 de oct de 2026, 09:30". */
export const formatDateTime = (value: Date | string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));

/** A `date` column value (YYYY-MM-DD), shown as a Bogota calendar day. */
export const formatDay = (day: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00-05:00`));

/** Shows the first 8 characters of an id, for a dense table. Put the full id in the title. */
export const shortId = (id: string) => id.slice(0, 8);
