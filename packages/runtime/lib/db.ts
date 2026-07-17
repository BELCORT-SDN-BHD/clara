import pg from "pg";

// Lightweight pool used by the /ready probe. Connection comes from the
// environment only (a DSN in DATABASE_URL/WORKFLOW_POSTGRES_URL, or libpq PG*
// vars — node-postgres reads PG* automatically when no connectionString is
// given). No credential ever appears in code.
//
// HARDENED (finding 11): the readiness check must never hang and must never leak
// raw DB error text. Bounded connect + statement timeouts, an overall deadline,
// and a SANITIZED error code (details are logged server-side only).
//
// ONE CANONICAL TARGET (finding 1): the durable WDK world reads ONLY
// WORKFLOW_POSTGRES_URL (worker.mjs maps DATABASE_URL -> WORKFLOW_POSTGRES_URL
// only when the latter is unset). So when the world is enabled, readiness probes
// the WORLD's DB, and if an operator set DATABASE_URL and WORKFLOW_POSTGRES_URL to
// DIFFERENT databases, /ready FAILS — otherwise it would green a DB the durable
// engine isn't using.
let pool: pg.Pool | undefined;

const CONNECT_TIMEOUT_MS = 3000;
const STATEMENT_TIMEOUT_MS = 3000;
const READY_DEADLINE_MS = 5000; // overall wall-clock cap for the whole check

/** Compare two DSNs by host/port/db only. Unparseable -> treated as different. */
function sameTarget(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const db = (u: URL) => (u.pathname || "").replace(/^\//, "") || "postgres";
    return (
      ua.hostname.toLowerCase() === ub.hostname.toLowerCase() &&
      (ua.port || "5432") === (ub.port || "5432") &&
      db(ua) === db(ub)
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the single canonical readiness DSN. When the world is enabled the
 * readiness DB is the world's DB (WORKFLOW_POSTGRES_URL, else DATABASE_URL); a
 * URL-vs-URL mismatch is a split that must fail /ready.
 */
function resolveReadiness(): { dsn: string | undefined; worldSplit: boolean } {
  const databaseUrl = process.env.DATABASE_URL;
  const workflowUrl = process.env.WORKFLOW_POSTGRES_URL;
  if (process.env.CLARA_START_WORLD === "1") {
    const worldSplit = !!(databaseUrl && workflowUrl && !sameTarget(databaseUrl, workflowUrl));
    return { dsn: workflowUrl || databaseUrl, worldSplit };
  }
  return { dsn: databaseUrl || workflowUrl, worldSplit: false };
}

function getPool(dsn: string | undefined): pg.Pool {
  if (!pool) {
    const common = {
      max: 2,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      query_timeout: STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: STATEMENT_TIMEOUT_MS,
    } as const;
    pool = dsn ? new pg.Pool({ connectionString: dsn, ...common }) : new pg.Pool({ ...common });
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
  error?: "db_unreachable" | "db_timeout" | "db_target_split";
}

/** Readiness check: a bounded round-trip confirming the DB is reachable. */
export async function checkDb(): Promise<DbCheck> {
  const start = Date.now();
  const { dsn, worldSplit } = resolveReadiness();
  if (worldSplit) {
    // The world runs on WORKFLOW_POSTGRES_URL but DATABASE_URL points elsewhere:
    // greening either would mislead the load balancer. Fail closed. Detail stays
    // server-side; the response carries only a sanitized code.
    console.error(
      "[clara-runtime] readiness: DB target split — DATABASE_URL and WORKFLOW_POSTGRES_URL point at different databases while CLARA_START_WORLD=1. Set them to the same target or unset one.",
    );
    return { ok: false, latency_ms: Date.now() - start, error: "db_target_split" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("__deadline__")), READY_DEADLINE_MS);
  });
  try {
    const r = (await Promise.race([getPool(dsn).query("select 1 as ok"), deadline])) as pg.QueryResult;
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
