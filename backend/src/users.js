import { pool } from "./db.js";

const COLUMNS = "user_id, name, email, role, created_at";

export class DuplicateEmailError extends Error {}

export async function createUser({ name, email, passwordHash }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_user (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [name, email.toLowerCase(), passwordHash],
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23505") throw new DuplicateEmailError("Email is already registered");
    throw err;
  }
}

// Includes password_hash; only used to check a login
export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}, password_hash FROM app_user WHERE email = $1`,
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function getUserById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM app_user WHERE user_id = $1`, [id]);
  return rows[0] ?? null;
}
