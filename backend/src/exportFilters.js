// SQL fragments for export filters. Each helper appends its values to params and returns
// a condition (or "TRUE"), so callers can AND them into their own per-user WHERE clause.

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
