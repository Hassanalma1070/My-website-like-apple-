// Prints a password reset link for a user: npm run reset-link -- user@example.com
import "dotenv/config";
import { pool } from "../src/db.js";
import { findUserByEmail } from "../src/users.js";
import { createResetLink } from "../src/passwordResets.js";

const email = process.argv[2];

try {
  if (!email) throw new Error("Usage: npm run reset-link -- user@example.com");
  const user = await findUserByEmail(email);
  if (!user) throw new Error(`No user with email ${email}`);
  const reset = await createResetLink(user);
  if (!reset) throw new Error("This user already requested 3 reset links in the last hour. Try again later.");
  console.log(`Reset link for ${user.email} (user ${user.user_id}), expires ${reset.expiresAt.toISOString()}:`);
  console.log(reset.link);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
