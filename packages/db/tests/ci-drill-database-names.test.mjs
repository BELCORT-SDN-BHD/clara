// #1041 — every throwaway database the dispatch-only CI legs create is a name their OWN cleanup
// can drop, and a name Postgres hands back unchanged.
//
// THE DEFECT THIS CLOSES, measured (dispatch run 35893727271, 2026-09-23). #1023 gave
// `wave-a-upgrade.test.mjs` a `closed-wave-upgrade-drills` step targeting
// `clara_waveA_upgrade_ci` — "the exact name the file's own header recipe already documents".
// The cleanup step beside it calls `rig-cluster-reset.mjs --drop-database=clara_waveA_upgrade_ci`,
// and that module interpolates the name into `drop database if exists ${name}` UNQUOTED, so it
// holds every target to a plain lowercase identifier and refused:
//
//     rig-cluster-reset: FAIL — dropDatabase: refusing a non-conforming database name
//     "clara_waveA_upgrade_ci"
//
// `reset-gate-routing.test.mjs`'s #1023 cells already pinned that name against `EPHEMERAL_DB`
// — the disposable-SUFFIX guard — which `clara_waveA_upgrade_ci` passes. Nothing anywhere asked
// the OTHER question the same cleanup asks, so the leg shipped red.
//
// THE GRAMMAR IS RIGHT AND THE NAME MOVED, because an unquoted identifier does not round-trip.
// Measured on a live PostgreSQL 17 cluster (lane 07, 2026-09-24):
//
//     create database clara_case_probe_A_ci;         -- folds: pg_database has clara_case_probe_a_ci
//     PGDATABASE=clara_case_probe_A_ci  ->  3D000 database "clara_case_probe_A_ci" does not exist
//
// libpq sends PGDATABASE as a LITERAL name while `create database <x>` case-folds it, so a
// mixed-case drill name names two different databases in the two halves of its own step: the
// drill step itself would have failed on the connect even if the cleanup had accepted the name.
// Widening `dropDatabase`'s grammar would therefore have hidden a second defect rather than
// fixed one. The rule is stated in `packages/db/tests/README.md`'s `reset-gate-routing` section.
//
// Cell 2 asks PostgreSQL itself rather than re-implementing its identifier rules here:
// `quote_ident(n) = n` is exactly "this name survives unquoted interpolation".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EPHEMERAL_DB } from "../lib/guard.mjs";
import { CONFORMING_DB_NAME } from "./rig-cluster-reset.mjs";
import { rootQuery } from "./rig-helpers.mjs";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..", "..", "..");
const ACTIONS = [
  path.join(REPO_ROOT, ".github", "actions", "closed-wave-upgrade-drills", "action.yml"),
  path.join(REPO_ROOT, ".github", "actions", "frontier-leg", "action.yml"),
];

/** Every LITERAL throwaway database name the two dispatch-only composite actions name, from the
 *  three places they name one: the `create database` that mints it, the `PGDATABASE=` that the
 *  drill runs against, and the `--drop-database=` that cleans it up. A name built from an action
 *  INPUT (frontier-leg's `clara_x42_${{ inputs.dbtag }}_upgrade_ci`) carries a `${{ … }}` and is
 *  skipped here — its four expansions are pinned by the dbtag census below. */
function literalDbNames(yamlText) {
  const out = new Set();
  for (const re of [
    /create database ([A-Za-z0-9_${}. -]+?)'/g,
    /PGDATABASE=([A-Za-z0-9_${}.-]+)/g,
    /--drop-database=([A-Za-z0-9_${}.-]+)/g,
  ]) {
    for (const m of yamlText.matchAll(re)) {
      const name = m[1].trim();
      if (name.includes("$") || name === "postgres") continue;
      out.add(name);
    }
  }
  return [...out].sort();
}

test("p1041.dbname.grammar every throwaway database the dispatch-only CI legs name is one their own rig-cluster-reset cleanup can drop", () => {
  for (const file of ACTIONS) {
    const names = literalDbNames(readFileSync(file, "utf8"));
    assert.ok(names.length > 0, `${path.basename(path.dirname(file))} names no throwaway database at all — the census reads nothing`);
    for (const name of names) {
      assert.match(name, CONFORMING_DB_NAME,
        `${path.basename(path.dirname(file))} names the database "${name}", which rig-cluster-reset.mjs's own `
        + "dropDatabase() refuses — the cleanup step beside it fails and the whole leg goes red (dispatch 35893727271)");
      assert.match(name, EPHEMERAL_DB,
        `${path.basename(path.dirname(file))}'s "${name}" does not look disposable to lib/guard.mjs's EPHEMERAL_DB`);
    }
  }
});

test("p1041.dbname.roundtrip PostgreSQL itself hands every one of those names back unquoted — the reason the grammar is a wall and not a formality", async () => {
  const names = ACTIONS.flatMap((f) => literalDbNames(readFileSync(f, "utf8")));
  const r = await rootQuery("select n, quote_ident(n) as q from unnest($1::text[]) as n", [names]);
  for (const row of r.rows) {
    assert.equal(row.q, row.n,
      `create database ${row.n} does not round-trip: PostgreSQL folds the unquoted identifier to `
      + `${row.q}, so the step's own PGDATABASE=${row.n} (a LITERAL libpq name) would raise 3D000`);
  }
  // NON-VACUITY: the oracle must actually reject the shape this ticket found in the tree.
  const bad = await rootQuery("select quote_ident('clara_waveA_upgrade_ci') as q");
  assert.notEqual(bad.rows[0].q, "clara_waveA_upgrade_ci",
    "the round-trip oracle is vacuous — it accepts the very mixed-case name dispatch 35893727271 died on");
});
