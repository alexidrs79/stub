/// Local calendar day as `YYYY-MM-DD`, the format a date input expects.
export function localDateKey(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

/**
 * A date input gives a day, not a moment. Midday local keeps the entry on the
 * day the viewer picked once it is stored as UTC.
 */
export function dayToIso(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date, 12, 0, 0).toISOString()
}
