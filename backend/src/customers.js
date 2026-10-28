import { pool } from "./db.js";

const COLUMNS = "customer_id, name, email, phone, created_at";

export async function listCustomers() {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM customer ORDER BY customer_id`);
  return rows;
}

export async function getCustomerById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM customer WHERE customer_id = $1`, [id]);
  return rows[0] ?? null;
}

// Case-insensitive partial match on name
export async function findCustomersByName(name) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM customer WHERE name ILIKE $1 ORDER BY customer_id`,
    [`%${name}%`],
  );
  return rows;
}

export async function createCustomer({ name, email = null, phone = null }) {
  const { rows } = await pool.query(
    `INSERT INTO customer (name, email, phone) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [name, email, phone],
  );
  return rows[0];
}

// Only updates the fields that are provided
export async function updateCustomer(id, fields) {
  const allowed = ["name", "email", "phone"].filter((k) => fields[k] !== undefined);
  if (allowed.length === 0) return getCustomerById(id);
  const sets = allowed.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await pool.query(
    `UPDATE customer SET ${sets} WHERE customer_id = $1 RETURNING ${COLUMNS}`,
    [id, ...allowed.map((k) => fields[k])],
  );
  return rows[0] ?? null;
}

export async function deleteCustomer(id) {
  const { rows } = await pool.query(
    `DELETE FROM customer WHERE customer_id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
}
