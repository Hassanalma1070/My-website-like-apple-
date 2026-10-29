import { pool } from "./db.js";

// Records one export attempt. Never throws: a logging failure must not break the download.
export async function logExport({ user, categories, filters, recordCount, status }) {
  try {
    await pool.query(
      `INSERT INTO export_log (user_id, user_email, categories, filters, record_count, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.user_id, user.email, categories.map((c) => c.key), JSON.stringify(filters), recordCount, status],
    );
  } catch (err) {
    console.error("Could not write export_log:", err.message);
  }
}
