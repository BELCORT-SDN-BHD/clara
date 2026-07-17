import pg from "pg";

// Lightweight pool used by the /ready probe. Connection comes from the
// environment only (a DSN in DATABASE_URL/WORKFLOW_POSTGRES_URL, or libpq PG*
// vars — node-postgres reads PG* automatically when no connectionString is
// given). No credential ever appears in code.
let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
    pool = url ? new pg.Pool({ connectionString: url, max: 2 }) : new pg.Pool({ max: 2 });
  }
  return pool;
}

export interface DbCheck {
  ok: boolean;
  latency_ms?: number;
  error?: string;
}

/** Readiness check: a trivial round-trip to confirm the DB is reachable. */
export async function checkDb(): Promise<DbCheck> {
  const start = Date.now();
  try {
    const r = await getPool().query("select 1 as ok");
    return { ok: r.rows[0]?.ok === 1, latency_ms: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
