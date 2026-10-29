import { pool } from "./db.js";
import { dateRange } from "./exportFilters.js";

// This module holds the only queries in the app that read across users. They must stay behind
// requireRole("admin") and must never be exposed as agent tools.
export async function listSalesUsersWithCustomerCounts() {
  const [usersResult, totalResult] = await Promise.all([
    pool.query(
      `SELECT u.user_id, u.name, u.email, u.created_at, COUNT(c.customer_id)::int AS customer_count
       FROM app_user u
       LEFT JOIN customer c ON c.sales_user_id = u.user_id
       WHERE u.role = 'sales'
       GROUP BY u.user_id
       ORDER BY u.name, u.user_id`,
    ),
    pool.query("SELECT COUNT(*)::int AS total FROM customer"),
  ]);
  const users = usersResult.rows;
  return { summary: { sales_users: users.length, total_customers: totalResult.rows[0].total }, users };
}

// Export: sales users who joined within the filter's date range ({ from, to, tz }), with customer counts.
// Cross-user like the dashboard query, so it is admin only as well.
export async function countSalesUsersForExport(filters) {
  const params = [];
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM app_user u WHERE u.role = 'sales' AND ${dateRange("u.created_at", filters, params)}`,
    params,
  );
  return rows[0].n;
}

export async function listSalesUsersForExport(filters) {
  const params = [];
  const { rows } = await pool.query(
    `SELECT u.user_id, u.name, u.email, u.created_at, COUNT(c.customer_id)::int AS customer_count
     FROM app_user u
     LEFT JOIN customer c ON c.sales_user_id = u.user_id
     WHERE u.role = 'sales' AND ${dateRange("u.created_at", filters, params)}
     GROUP BY u.user_id
     ORDER BY u.name, u.user_id`,
    params,
  );
  return rows;
}
