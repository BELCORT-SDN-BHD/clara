// The pg_dump/psql fixture, and the ONE reason a cell that clones the ambient database may be
// skipped (#806).
//
// `cloneAmbientDatabase()` (packages/db/tests/migrate-harness.mjs) pg_dump|psql-clones the
// ambient (estate) database into a private, disposable one — the shape fs7-v17-chatturn-db.
// test.mjs, relay-taxonomy.test.mjs and leader-state.test.mjs all depend on. Without pg_dump/
// psql on PATH, the clone throws plainly (`pg_dump failed to start (spawnSync pg_dump ENOENT)`),
// and — because two of those three files run their setup as top-level `await` and the third runs
// it inside an uncaught `before()` — the failure reads as a regression rather than an unmet host
// dependency: a module-LOAD failure or a hook failure, never a clean skip. This has been
// re-diagnosed and re-labelled a "known Windows artefact" by successive workers rather than
// handled once (RIG.md, docs/plan/active/refresh-wave-2026-09-14/HANDOFF.md).
//
// The disposition (#806, mirroring the #693 EICAR fixture's shape exactly): PROBE for the
// binaries — resolve them the SAME way cloneAmbientDatabase() does (the `PG_DUMP`/`PSQL`
// overrides read from THIS process's own env, never the `sourceEnv` handed to the child; a bare
// PATH check would skip wrongly on a host where the binaries live under a custom path) — and skip
// with a named, exported reason when either is missing. The verdict is reached ONCE, before any
// cell is defined and before any disposable database is created, so a skipping host neither
// creates nor orphans a throwaway database.
//
// `pgToolsSkipReason` takes the PROBE RESULT rather than reading the environment itself, so both
// outcomes are testable on a host where the condition (binaries present or absent) cannot be
// reproduced — see this file's own pg-tools-fixture.test.mjs.

import { spawnSync } from "node:child_process";

/** The one reason these cells may skip. Asserted verbatim by every cell that pins this behaviour. */
export const PG_TOOLS_SKIP_REASON = "pg_dump/psql not found on PATH";

/**
 * The skip verdict for a pg_dump/psql-dependent cell: `false` (run it) or the reason string.
 *
 * @param {{pgDumpFound: boolean, psqlFound: boolean}} arg
 * @returns {false|string}
 */
export function pgToolsSkipReason({ pgDumpFound, psqlFound }) {
  return pgDumpFound && psqlFound ? false : PG_TOOLS_SKIP_REASON;
}

/**
 * Resolve one binary EXACTLY the way `cloneAmbientDatabase()` does (`process.env.PG_DUMP ||
 * "pg_dump"`, `process.env.PSQL || "psql"` — this process's own env, never a `sourceEnv` handed
 * to a child) and report whether it can actually be spawned. `--version` is a real measurement
 * (spawnSync's own ENOENT surfaces on `result.error`), never a bare PATH string search — a probe
 * that only checked PATH would skip wrongly on a host where the override points somewhere else.
 *
 * @param {string} envVar "PG_DUMP" or "PSQL"
 * @param {string} fallback "pg_dump" or "psql"
 * @returns {boolean}
 */
function binaryIsSpawnable(envVar, fallback) {
  const bin = process.env[envVar] || fallback;
  const result = spawnSync(bin, ["--version"], { stdio: "ignore" });
  return !result.error;
}

/**
 * Probe both binaries this host would actually reach if `cloneAmbientDatabase()` ran right now.
 *
 * @returns {{pgDumpFound: boolean, psqlFound: boolean}}
 */
export function probePgTools() {
  return {
    pgDumpFound: binaryIsSpawnable("PG_DUMP", "pg_dump"),
    psqlFound: binaryIsSpawnable("PSQL", "psql"),
  };
}

/**
 * The suite-start verdict for THIS host: `false` when both binaries are reachable, else the
 * shared reason. Computed once, before any cell in a consuming file is defined.
 *
 * @returns {false|string}
 */
export function pgToolsSkipForThisHost() {
  return pgToolsSkipReason(probePgTools());
}
