import pg from "pg";

// Lightweight pool used by the /ready probe. Connection comes from the
// environment only (a DSN in DATABASE_URL/WORKFLOW_POSTGRES_URL, or libpq PG*
// vars — node-postgres reads PG* automatically when no connectionString is
// given). No credential ever appears in code.
//
// HARDENED (finding 11): the readiness check must never hang and must never leak
// raw DB error text. Bounded connect + statement timeouts, an overall deadline,
// and a SANITIZED error code (details are logged server-side only).
let pool: pg.Pool | undefined;

const CONNECT_TIMEOUT_MS = 3000;
const STATEMENT_TIMEOUT_MS = 3000;
const READY_DEADLINE_MS = 5000; // overall wall-clock cap for the whole check

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
    const common = {
      max: 2,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      query_timeout: STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: STATEMENT_TIMEOUT_MS,
    } as const;
    pool = url ? new pg.Pool({ connectionString: url, ...common }) : new pg.Pool({ ...common });
    // A pool-level error (e.g. a backend terminating an idle client) must not
    // crash the process — log and let the next /ready re-establish.
    pool.on("error", (err) => console.error("[clara-runtime] db pool error:", err.message));
  }
  return pool;
}

export interface DbCheck {
  ok: boolean;
  latency_ms?: number;
  /** Sanitized code only — never raw DB error text. */
  error?: "db_unreachable" | "db_timeout";
}

/** Readiness check: a bounded round-trip confirming the DB is reachable. */
export async function checkDb(): Promise<DbCheck> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("__deadline__")), READY_DEADLINE_MS);
  });
  try {
    const r = (await Promise.race([getPool().query("select 1 as ok"), deadline])) as pg.QueryResult;
    return { ok: r.rows[0]?.ok === 1, latency_ms: Date.now() - start };
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === "__deadline__";
    // Full detail server-side only; the response carries a sanitized code.
    console.error(
      "[clara-runtime] readiness DB check failed:",
      isTimeout ? `exceeded ${READY_DEADLINE_MS}ms deadline` : err instanceof Error ? err.message : String(err),
    );
    return { ok: false, latency_ms: Date.now() - start, error: isTimeout ? "db_timeout" : "db_unreachable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
