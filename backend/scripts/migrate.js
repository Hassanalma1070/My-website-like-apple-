// Runs every sql/*.sql file in name order against DATABASE_URL.
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { pool } from "../src/db.js";

const dir = new URL("../sql/", import.meta.url);

try {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(await readFile(new URL(file, dir), "utf8"));
    console.log(`Applied ${file}`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
