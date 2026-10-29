import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { setPassword } from "./users.js";

const TOKEN_TTL_MINUTES = 30;
const MAX_PER_HOUR = 3;

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const frontendUrl = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

/**
 * Create a single-use reset link for a user, cancelling their older unused links.
 * Returns null when the user already asked for MAX_PER_HOUR links in the last hour.
 */
export async function createResetLink(user) {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM password_reset WHERE user_id = $1 AND created_at > now() - interval '1 hour'",
    [user.user_id],
  );
  if (rows[0].n >= MAX_PER_HOUR) return null;

  const token = randomBytes(32).toString("base64url");
  await pool.query("UPDATE password_reset SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.user_id]);
  const { rows: created } = await pool.query(
    `INSERT INTO password_reset (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING expires_at`,
    [user.user_id, hashToken(token), TOKEN_TTL_MINUTES],
  );
  return { link: `${frontendUrl()}/?reset_token=${token}`, expiresAt: created[0].expires_at };
}

/**
 * Use a reset token to set a new password. Returns false when the token is unknown,
 * expired or already used. Marking the token used and changing the password happen in
 * one transaction, and the conditional UPDATE means a token can only ever be used once.
 */
export async function consumeResetToken(token, passwordHash) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE password_reset SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [hashToken(token)],
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await setPassword(rows[0].user_id, passwordHash, client);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// The one place a reset link leaves the server. Plug an email provider in here.
export async function sendPasswordResetLink(user, link) {
  if (process.env.NODE_ENV === "production") {
    console.warn(`Password reset requested for user ${user.user_id}, but no email provider is configured.`);
    return;
  }
  console.log(`Password reset link for ${user.email} (development only): ${link}`);
}
