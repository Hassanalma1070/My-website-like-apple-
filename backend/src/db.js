import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Render-hosted Postgres requires SSL
  ssl: { rejectUnauthorized: false },
  max: 5,
});
