// Filter helpers shared by exports and lists. The SQL helpers append their values to params and
// return a condition (or "TRUE"), so callers can AND them into their own per-user WHERE clause.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar date in YYYY-MM-DD (rejects 2026-02-30)
export function validDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validTimeZone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// from/to are inclusive YYYY-MM-DD dates in the user's time zone
export function dateRange(column, { from, to, tz }, params) {
  const conditions = [];
  if (from) {
    params.push(from, tz);
    conditions.push(`${column} >= ($${params.length - 1}::date)::timestamp AT TIME ZONE $${params.length}`);
  }
  if (to) {
    params.push(to, tz);
    conditions.push(`${column} < ($${params.length - 1}::date + 1)::timestamp AT TIME ZONE $${params.length}`);
  }
  return conditions.length ? conditions.join(" AND ") : "TRUE";
}

// Case-insensitive substring match on any of the columns, like the customers screen's search box.
// %, _ and \ in the search text match literally.
export function search(columns, q, params) {
  if (!q) return "TRUE";
  params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
  return `(${columns.map((c) => `${c} ILIKE $${params.length}`).join(" OR ")})`;
}
