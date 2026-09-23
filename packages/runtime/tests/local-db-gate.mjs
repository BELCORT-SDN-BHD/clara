// #1018 — the shared loopback-host + allowed-database-name safety gate every standalone runtime
// World e2e driver runs at startup, before it does anything destructive. Before this module
// existed, each of the 23 driver files carried its own inline copy: a PGDATABASE-anchored regex,
// and (for most of them) a SECOND, independently hand-typed regex or URL-parsing block re-encoding
// the SAME allowed-name list against WORKFLOW_POSTGRES_URL. Nothing stopped a file's own two
// copies from drifting apart, and widening the gate for a new naming convention (the wave's
// `clara_l<NN>` per-lane databases, admitted by only four of the twenty-three) meant editing every
// file by hand instead of one shared place.
//
// This module owns the CHECKING LOGIC only. Each driver still supplies its OWN allowed shapes —
// exactly the ones it admitted before this refactor — via `allowedDbPattern`, composed from the
// named `DB_NAME_SHAPE` constants below where a shape is shared with another driver. A future
// change to a shared shape (say, a new per-lane convention for a later wave) is then a one-line
// edit to that ONE constant, picked up by every driver that references it, with no driver able to
// carry a second, disagreeing copy of the check ever again.

export const LOCAL_HOSTS = Object.freeze(new Set(["127.0.0.1", "localhost"]));

export function isLoopbackHost(host) {
  return LOCAL_HOSTS.has(host);
}

// Named building blocks for the database-name SHAPES drivers compose into their own allow-list.
// Each value is a regex ALTERNATIVE's source — no anchors, no leading "clara_" — so a driver
// stays free to admit only the shapes it always admitted.
export const DB_NAME_SHAPE = Object.freeze({
  RT_TEST: "rt_test",
  WAVE_B_CI: "wave_b_ci",
  INTAKE_CI: "intake_ci",
  PER_TICKET: "\\d{3}",
  PER_TICKET_3_OR_4: "\\d{3,4}",
  PER_LANE: "l\\d{2}",
});

// Builds the anchored PGDATABASE regex AND the matching WORKFLOW_POSTGRES_URL string regex from
// ONE alternation body, so the two can never independently drift the way the pre-#1018 driver
// files' own hand-typed pairs did. `outerOptionalSuffix`, when given, applies AFTER whichever
// alternative matched (intake-batch-e2e's historical `(rt_test|intake_ci|\d{3})(_world)?` shape —
// distinct from a shape that bakes `_world` into only ONE alternative, like
// `\d{3}(?:_world)?`, which a driver composes directly into its own body string instead).
export function allowedDbPattern(body, { outerOptionalSuffix } = {}) {
  if (!body) throw new Error("allowedDbPattern needs a non-empty alternation body");
  const suffix = outerOptionalSuffix ? `(?:${outerOptionalSuffix})?` : "";
  const dbRegex = new RegExp(`^clara_(?:${body})${suffix}$`);
  const dsnRegex = new RegExp(`(?:\\/\\/|@)(?:127\\.0\\.0\\.1|localhost):\\d+\\/clara_(?:${body})${suffix}(?:\\?|$)`);
  return Object.freeze({
    dbRegex,
    dsnRegex,
    describe: () => `clara_(${body})${suffix}`,
  });
}

// The "parsed-DSN equality" style: every field of the DSN must equal the corresponding PG* value
// exactly, not merely satisfy the SAME allowed shape independently — the style that structurally
// cannot drift from the PGDATABASE check, because there is no second list of names to re-type.
export function dsnAgreesWithEnv(dsn, { port, database }) {
  let u;
  try {
    u = new URL(dsn);
  } catch {
    return false;
  }
  return (
    u.protocol === "postgres:"
    && isLoopbackHost(u.hostname)
    && u.port === String(port ?? "")
    && u.pathname === "/" + (database ?? "")
    && [...u.searchParams.keys()].length === 0
  );
}

// The combined guard every driver calls once at the top of its file, in place of its own inline
// copy. `pattern` is the driver's OWN composed `allowedDbPattern(...)` — this function changes
// nothing about which names a given driver admits. `checkDsnString` and `checkDsnParsed` are
// independent flags because the pre-#1018 files disagreed on which DSN check(s) they ran: some
// ran only the string form, some only the parsed form, some both, and one driver
// (work-knowledge-e2e) ran neither. Passing neither flag preserves that driver's original,
// weaker-than-its-siblings behaviour rather than widening its enforcement as a side effect of
// this refactor. Throws with the driver's own label on any failure; returns nothing on success.
export function assertLocalDbGate({ label, pattern, checkDsnString = false, checkDsnParsed = false, env = process.env }) {
  const host = env.PGHOST;
  const database = env.PGDATABASE;
  if (!isLoopbackHost(host) || !pattern.dbRegex.test(database ?? "")) {
    throw new Error(`${label} is hard-gated to a loopback host + PGDATABASE matching ${pattern.describe()}`);
  }
  if (!checkDsnString && !checkDsnParsed) return;
  const dsn = env.WORKFLOW_POSTGRES_URL;
  if (checkDsnString && (!dsn || !pattern.dsnRegex.test(dsn))) {
    throw new Error(`${label} needs WORKFLOW_POSTGRES_URL targeting a loopback host + ${pattern.describe()}`);
  }
  if (checkDsnParsed) {
    if (!dsn) throw new Error(`${label} needs WORKFLOW_POSTGRES_URL beside the PG env`);
    if (!dsnAgreesWithEnv(dsn, { host, port: env.PGPORT, database })) {
      throw new Error(`${label}: WORKFLOW_POSTGRES_URL failed the parsed DSN gate (got ${dsn})`);
    }
  }
}
