import { pool } from "./db.js";
import { dateRange, search } from "./exportFilters.js";

// Every function takes the owner's user_id first and only touches that user's rows,
// so another user's customer behaves exactly like one that does not exist.

const COLUMNS = "customer_id, name, email, phone, created_at, sales_user_id";

export class DuplicateCustomerEmailError extends Error {}

// customer.email is unique across the whole table
async function write(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === "23505") throw new DuplicateCustomerEmailError("A customer with this email already exists");
    throw err;
  }
}

export async function listCustomers(userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE sales_user_id = $1 ORDER BY customer_id`,
    [userId],
  );
  return rows;
}

export async function getCustomerById(userId, id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE customer_id = $1 AND sales_user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

// Case-insensitive partial match on name
export async function findCustomersByName(userId, name) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE sales_user_id = $1 AND name ILIKE $2 ORDER BY customer_id`,
    [userId, `%${name}%`],
  );
  return rows;
}

export async function createCustomer(userId, { name, email = null, phone = null }) {
  const { rows } = await write(
    `INSERT INTO customer (name, email, phone, sales_user_id) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [name, email, phone, userId],
  );
  return rows[0];
}

// Only updates the fields that are provided; the owner can never change
export async function updateCustomer(userId, id, fields) {
  const allowed = ["name", "email", "phone"].filter((k) => fields[k] !== undefined);
  if (allowed.length === 0) return getCustomerById(userId, id);
  const sets = allowed.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const { rows } = await write(
    `UPDATE customer SET ${sets} WHERE customer_id = $1 AND sales_user_id = $2 RETURNING ${COLUMNS}`,
    [id, userId, ...allowed.map((k) => fields[k])],
  );
  return rows[0] ?? null;
}

export async function deleteCustomer(userId, id) {
  const { rows } = await pool.query(
    `DELETE FROM customer WHERE customer_id = $1 AND sales_user_id = $2 RETURNING ${COLUMNS}`,
    [id, userId],
  );
  return rows[0] ?? null;
}

// Export: the user's customers matching the filters ({ q, from, to, tz }), sorted by customer_id.
// q matches like the customers screen's search: name, email, phone or customer ID.
function exportWhere(userId, filters) {
  const params = [userId];
  const where = [
    "sales_user_id = $1",
    search(["name", "email", "phone", "customer_id::text"], filters.q, params),
    dateRange("created_at", filters, params),
  ].join(" AND ");
  return { where, params };
}

export async function countCustomersForExport(userId, filters) {
  const { where, params } = exportWhere(userId, filters);
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM customer WHERE ${where}`, params);
  return rows[0].n;
}

export async function listCustomersForExport(userId, filters) {
  const { where, params } = exportWhere(userId, filters);
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM customer WHERE ${where} ORDER BY customer_id`, params);
  return rows;
}
