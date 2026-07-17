import pg from "pg";

let pool: pg.Pool | undefined;

/**
 * Lazy pool for the spike DOMAIN tables (spike.*). The engine has its own
 * pool inside @workflow/world-postgres; this one is only for step bodies.
 * Uses DATABASE_URL (Supavisor SESSION mode, port 5432 - see README).
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env and paste the Supabase session-mode connection string.",
      );
    }
    pool = new pg.Pool({ connectionString, max: 5 });
  }
  return pool;
}
