import pg from "pg";

// Return DATE columns as "YYYY-MM-DD" strings. By default pg builds a Date at server-local midnight,
// which shifts the day when serialized as UTC. NUMERIC already comes back as a string.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Render-hosted Postgres requires SSL
  ssl: { rejectUnauthorized: false },
  max: 5,
});
