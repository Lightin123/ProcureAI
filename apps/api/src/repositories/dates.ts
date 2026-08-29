/**
 * Converting a PostgreSQL `date` to the calendar day it actually is.
 *
 * `node-postgres` parses a `date` column into a JavaScript `Date` at local
 * midnight. `toISOString()` then converts that instant to UTC, which for any
 * timezone ahead of UTC lands on the previous day: a deadline stored as
 * 2026-09-19 is read back at 2026-09-19T00:00+05:30, which is
 * 2026-09-18T18:30Z, and slicing the ISO string yields "2026-09-18".
 *
 * Every user of this system is in IST, so that is not an edge case — it is
 * every date, always one day early. A response deadline shown a day before the
 * one an official set is a defect a supplier would act on.
 *
 * The fix is to read the calendar fields the parser already resolved in local
 * time rather than re-projecting the instant through UTC. A `date` has no
 * time and no zone; the day it names is the whole of its content.
 */

export function toIsoDay(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  // Some drivers and some queries (an explicit ::text cast) hand back the day
  // already formatted. It is already correct; re-parsing it would reintroduce
  // exactly the zone shift this function exists to avoid.
  if (typeof value === "string") return value.slice(0, 10);

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Today, as the calendar day it is here.
 *
 * Deadlines are `date` columns and are compared against the day an official or
 * a supplier is actually living in, not against a UTC instant. Building it from
 * the local calendar fields is the same rule `toIsoDay` applies in the opposite
 * direction, and for the same reason (D77).
 */
export function todayIsoDay(): string {
  return toIsoDay(new Date()) ?? "";
}

/** Whether an ISO day has already gone by. A null deadline never passes. */
export function dayHasPassed(isoDay: string | null): boolean {
  return isoDay !== null && isoDay < todayIsoDay();
}
