import { pool } from "./db.js";

// The only query in the app that reads across users. It must stay behind requireRole("admin")
// and must never be exposed as an agent tool.
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
