import { pool } from "./db.js";
import { getCustomerById } from "./customers.js";
import { OPEN_STAGES, STAGES } from "./dealValidation.js";
import { dateRange, search } from "./exportFilters.js";

// Every function takes the owner's user_id first and only touches that user's deals,
// so another user's deal behaves exactly like one that does not exist.
// A deal's customer is fixed at creation and always belongs to the same user.

const COLUMNS = `d.deal_id, d.customer_id, c.name AS customer_name, d.title, d.amount, d.stage,
  d.expected_close_date, d.created_at, d.updated_at`;
const FROM = "FROM deal d JOIN customer c USING (customer_id)";
const ORDER = "ORDER BY d.expected_close_date NULLS LAST, d.deal_id";

// filters: { stage (a stage, "open" or "closed"), customerId, q (title contains) }
function listWhere(userId, { stage, customerId, q } = {}) {
  const params = [userId];
  const where = ["d.sales_user_id = $1"];
  if (stage === "open" || stage === "closed") {
    params.push(OPEN_STAGES);
    const isOpen = `d.stage = ANY($${params.length})`;
    where.push(stage === "open" ? isOpen : `NOT (${isOpen})`);
  } else if (stage) {
    params.push(stage);
    where.push(`d.stage = $${params.length}`);
  }
  if (customerId) {
    params.push(customerId);
    where.push(`d.customer_id = $${params.length}`);
  }
  where.push(search(["d.title"], q, params));
  return { where: where.join(" AND "), params };
}

export async function listDeals(userId, filters) {
  const { where, params } = listWhere(userId, filters);
  const { rows } = await pool.query(`SELECT ${COLUMNS} ${FROM} WHERE ${where} ${ORDER}`, params);
  return rows;
}

const money = (expr) => `COALESCE(SUM(d.amount) FILTER (WHERE ${expr}), 0)::numeric(16,2)::text`;
const count = (expr) => `COUNT(*) FILTER (WHERE ${expr})::int`;

// Totals for the same filters as listDeals. "Won this month" uses updated_at in the user's time zone.
export async function dealSummary(userId, filters, tz) {
  const { where, params } = listWhere(userId, filters);
  params.push(tz);
  const tzParam = `$${params.length}`;
  const open = `d.stage IN (${OPEN_STAGES.map((s) => `'${s}'`).join(", ")})`;
  const wonThisMonth = `d.stage = 'won' AND date_trunc('month', d.updated_at AT TIME ZONE ${tzParam}) = date_trunc('month', now() AT TIME ZONE ${tzParam})`;
  const stageColumns = STAGES.flatMap((s) => [`${count(`d.stage = '${s}'`)} AS ${s}_count`, `${money(`d.stage = '${s}'`)} AS ${s}_amount`]);
  const { rows } = await pool.query(
    `SELECT ${stageColumns.join(", ")},
       ${count(open)} AS open_count, ${money(open)} AS open_amount,
       ${count(wonThisMonth)} AS won_month_count, ${money(wonThisMonth)} AS won_month_amount
     ${FROM} WHERE ${where}`,
    params,
  );
  const r = rows[0];
  return {
    by_stage: Object.fromEntries(STAGES.map((s) => [s, { count: r[`${s}_count`], amount: r[`${s}_amount`] }])),
    open: { count: r.open_count, amount: r.open_amount },
    won_this_month: { count: r.won_month_count, amount: r.won_month_amount },
  };
}

export async function getDeal(userId, id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} ${FROM} WHERE d.deal_id = $1 AND d.sales_user_id = $2`, [id, userId]);
  return rows[0] ?? null;
}

// null when the customer is not this user's
export async function listCustomerDeals(userId, customerId) {
  if (!(await getCustomerById(userId, customerId))) return null;
  return listDeals(userId, { customerId });
}

// Inserts only if the customer belongs to the user, in one statement; null otherwise
export async function createDeal(userId, { customerId, title, amount, stage = "lead", expectedCloseDate = null }) {
  const { rows } = await pool.query(
    `INSERT INTO deal (customer_id, sales_user_id, title, amount, stage, expected_close_date)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE EXISTS (SELECT 1 FROM customer WHERE customer_id = $1 AND sales_user_id = $2)
     RETURNING deal_id`,
    [customerId, userId, title, amount, stage, expectedCloseDate],
  );
  return rows[0] ? getDeal(userId, rows[0].deal_id) : null;
}

const UPDATABLE = { title: "title", amount: "amount", stage: "stage", expectedCloseDate: "expected_close_date" };

// Only the provided fields change; customer_id and the owner never change
export async function updateDeal(userId, id, fields) {
  const keys = Object.keys(UPDATABLE).filter((k) => fields[k] !== undefined);
  const sets = keys.map((k, i) => `${UPDATABLE[k]} = $${i + 3}`);
  const { rowCount } = await pool.query(
    `UPDATE deal SET ${[...sets, "updated_at = now()"].join(", ")} WHERE deal_id = $1 AND sales_user_id = $2`,
    [id, userId, ...keys.map((k) => fields[k])],
  );
  return rowCount ? getDeal(userId, id) : null;
}

export async function deleteDeal(userId, id) {
  const deal = await getDeal(userId, id);
  if (!deal) return null;
  await pool.query("DELETE FROM deal WHERE deal_id = $1 AND sales_user_id = $2", [id, userId]);
  return deal;
}

// Export: the user's deals created within the filter's date range, sorted by deal_id
function exportWhere(userId, filters) {
  const params = [userId];
  return { where: `d.sales_user_id = $1 AND ${dateRange("d.created_at", filters, params)}`, params };
}

export async function countDealsForExport(userId, filters) {
  const { where, params } = exportWhere(userId, filters);
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM deal d WHERE ${where}`, params);
  return rows[0].n;
}

export async function listDealsForExport(userId, filters) {
  const { where, params } = exportWhere(userId, filters);
  const { rows } = await pool.query(`SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY d.deal_id`, params);
  return rows;
}
