// Creates the default admin account: npm run seed-admin
// ADMIN_EMAIL and ADMIN_PASSWORD in .env override the defaults. Never changes an existing account.
import "dotenv/config";
import { pool } from "../src/db.js";
import { createAdmin, findUserByEmail } from "../src/users.js";
import { hashPassword } from "../src/auth.js";

const email = (process.env.ADMIN_EMAIL || "admin@admin.com").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "123456789";

try {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`ADMIN_EMAIL is not a valid email: ${email}`);
  if (password.length < 8 || Buffer.byteLength(password) > 72) throw new Error("ADMIN_PASSWORD must be 8 to 72 characters");
  const existing = await findUserByEmail(email);
  if (existing?.role === "admin") {
    console.log(`Admin ${email} already exists. Nothing changed.`);
  } else if (existing) {
    throw new Error(`${email} belongs to a ${existing.role} user. Refusing to change it; set ADMIN_EMAIL to another address.`);
  } else {
    const admin = await createAdmin({ name: "Administrator", email, passwordHash: await hashPassword(password) });
    console.log(`Created admin ${admin.email} (user ${admin.user_id}).`);
    if (!process.env.ADMIN_PASSWORD) console.log("It uses the default password. Change it after the first login.");
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
