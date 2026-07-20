// Destructive-operation guard for the data-plane scripts (reset / restore /
// dr-selftest). No script that DROPs or overwrites may run against an arbitrary
// database that happens to be in the ambient PG* / DATABASE_URL environment.
//
// Policy (findings 5, 6, 9): a destructive op is REFUSED unless
//   1. CLARA_ALLOW_DESTRUCTIVE=1 is set (explicit intent), AND
//   2. the resolved target is disposable — either it matches an ephemeral
//      pattern (localhost, or a *_ci / *_test / *_tmp database, i.e. CI's
//      throwaway postgres:17), OR the operator names the EXACT target via
//      CLARA_DESTRUCTIVE_TARGET (must equal the resolved USER@host:port/db). The
//      named-target confirmation is what makes running against a real project
//      deliberate and also defeats the "whichever DB is in ambient PG*" footgun.
//
// The named target is USER-QUALIFIED for a reason (found while verifying the DR
// drill). On a managed pooler the PROJECT IDENTITY LIVES IN THE USERNAME: every
// Supabase project in a region shares one pooler host and the `postgres` database,
// so a bare `host:port/db` is byte-identical across projects. Keyed on that, this
// guard would have ACCEPTED a restore aimed at the live project while the operator
// had named a throwaway — exactly the footgun it exists to prevent. The ephemeral
// check stays host/db-based (localhost + *_ci/_test names are unambiguous).
//
// There is no interactive fallback: these run non-interactively (CI, agents), so
// a TTY prompt would auto-decline anyway — the sentinel + named-target IS the
// non-interactive confirmation.

import { targetLabel, destructiveTargetLabel, assertNoTargetSplit } from "./pg.mjs";

// Disposable database-name shapes (suffix or whole-name).
const EPHEMERAL_DB = /(^|[._-])(ci|test|tmp|temp|scratch|ephemeral)$/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Split "host:port/db" (from targetLabel) into { host, db }. */
function parseLabel(label) {
  const slash = label.indexOf("/");
  const hostPort = slash === -1 ? label : label.slice(0, slash);
  const db = slash === -1 ? "" : label.slice(slash + 1);
  const host = hostPort.split(":")[0] || "";
  return { host: host.toLowerCase(), db };
}

/** True when the resolved target looks disposable (safe to drop). */
export function targetIsEphemeral(label = targetLabel()) {
  const { host, db } = parseLabel(label);
  return LOCAL_HOSTS.has(host) || EPHEMERAL_DB.test(db);
}

/**
 * Throw unless the destructive op is explicitly authorized against a disposable
 * or explicitly-named target.
 * @param {{ action: string }} opts
 */
export function assertDestructiveAllowed({ action }) {
  // Resolve ONE canonical target first: refuse if a DSN URL var and PG* disagree
  // (finding 1) — otherwise the guard could clear one DB while pg_dump/psql (which
  // read PG*) operate on another.
  assertNoTargetSplit();
  const label = targetLabel(); // host:port/db — the ephemeral shape check
  const identity = destructiveTargetLabel(); // user@host:port/db — the confirmation
  if (process.env.CLARA_ALLOW_DESTRUCTIVE !== "1") {
    throw new Error(
      `${action} is destructive and REFUSED. Target ${identity}. Set CLARA_ALLOW_DESTRUCTIVE=1 to authorize, and run only against a disposable target.`,
    );
  }
  if (targetIsEphemeral(label)) return; // disposable target + sentinel is enough
  const named = process.env.CLARA_DESTRUCTIVE_TARGET;
  if (named && named === identity) return; // explicit, exact-target confirmation
  throw new Error(
    `${action} REFUSED for non-ephemeral target ${identity}. This is not a *_ci/*_test/localhost database, so confirm you mean this EXACT database by setting CLARA_DESTRUCTIVE_TARGET="${identity}" (guards against the ambient-DSN footgun). NOTE the user@ prefix: on a managed pooler every project in a region shares one host and the \`postgres\` database, so the username is what identifies the project — a host-only match could authorize the WRONG project. Refusing.`,
  );
}
