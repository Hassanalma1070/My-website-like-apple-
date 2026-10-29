import { pool } from "./db.js";

// token_version is internal (it is signed into tokens); routes strip it with publicUser()
const COLUMNS = "user_id, name, email, role, created_at, token_version";

export class DuplicateEmailError extends Error {}

// The user fields that are safe to send to clients
export function publicUser({ user_id, name, email, role, created_at }) {
  return { user_id, name, email, role, created_at };
}

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

// Only used by the seed-admin command; registration always gets the database default role ('sales')
export async function createAdmin({ name, email, passwordHash }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_user (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING ${COLUMNS}`,
      [name, email.toLowerCase(), passwordHash],
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23505") throw new DuplicateEmailError("Email is already registered");
    throw err;
  }
}

// Includes password_hash; only used to check a password
export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}, password_hash FROM app_user WHERE email = $1`,
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

// Includes password_hash; only used to check a password
export async function findUserWithHashById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS}, password_hash FROM app_user WHERE user_id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getUserById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM app_user WHERE user_id = $1`, [id]);
  return rows[0] ?? null;
}

// Read on every authenticated request, so a password or role change applies to existing tokens
export async function getAuthState(id) {
  const { rows } = await pool.query("SELECT token_version, role FROM app_user WHERE user_id = $1", [id]);
  return rows[0] ?? null;
}

// Sets a new password and bumps token_version, which signs out every existing token.
// Pass a pg client to run inside a caller's transaction.
export async function setPassword(id, passwordHash, db = pool) {
  const { rows } = await db.query(
    `UPDATE app_user SET password_hash = $2, token_version = token_version + 1 WHERE user_id = $1 RETURNING ${COLUMNS}`,
    [id, passwordHash],
  );
  return rows[0] ?? null;
}
