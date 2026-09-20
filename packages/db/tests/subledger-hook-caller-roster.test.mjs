// #868 — `clara._subledger_on_approve` carried no statement of its own live caller roster. Two
// wave migrations (0216, 0221) each had to re-derive the six independently rather than reading it
// from the hook, and the first thing a grep on the function's name finds is 0037:3840-3845's
// four-name census, stale since 0056 (`finalize_close`) and 0085 (`reopen_fiscal_year`,
// superseding its earlier delegation through `reverse_entry` -- 0086 pinned the resulting six)
// grew the roster to six. Migration 0236 closes it with ONE `comment on function`, re-derived
// from the catalog and refusing to apply unless the live roster still matches 0216/0221's own pin
// (its own prestate/tail carry that guard; see packages/db/README.md's "0236" section).
//
// SEAM: the catalog comment itself (`obj_description`) -- the one public surface the ticket's
// Agent Brief names ("gains a comment; body untouched"). No door, no wire shape, no new relation.
//
// NON-REGRESSION (AC3): 0236 must change nothing else about the hook -- same prosrc, same owner,
// same SECURITY DEFINER flag, the same (empty) grant to every application role, and it must still
// be reachable by no trigger directly (it is `perform`-called from its six callers' bodies, never
// itself a trigger function).

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, endPool } from "./rig-fixtures.mjs";

const HOOK = "clara._subledger_on_approve(uuid)";
const MIGRATION = "0236_subledger_hook_caller_roster.sql";
const STEM = "subledger_hook_caller_roster$";

/** The hook's own prosrc sha256, MEASURED on this rig at 230 migrations (0001->0235) before 0236
 *  existed -- never transcribed from 0037, because 0037 is where the body was AUTHORED, not
 *  necessarily where a reader would look to confirm it is unmoved. 0236's own prestate carries
 *  the same pin and refuses to apply against a drifted body; this cell re-asserts it from the
 *  other side, after. */
const HOOK_SHA = "6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd";

/** The measured six, in the catalog's own sort order -- the same array 0216 and 0221 each
 *  independently re-derived and pinned. */
const ROSTER = [
  "_approve_entry_core", "_approve_opening_entry", "approve_wrong_client_correction",
  "finalize_close", "reopen_fiscal_year", "reverse_entry",
];

/** Each caller paired with the migration its comment must credit it to -- an INDEPENDENT
 *  derivation from the migration history (grep evidence in the #868 report), not a value the
 *  migration's own SQL is asked to agree with itself: 0037 created the hook already called by the
 *  first four; 0056 created `finalize_close` already calling it; 0085 gave `reopen_fiscal_year`
 *  its OWN direct call (0056's original body routed its unwind through `reverse_entry` instead --
 *  confirmed absent in 0056's own text and stated in 0085's header). 0216's parenthetical ("0056
 *  added two") is imprecise on this point; 0085/0086 is the correct citation. */
const ARRIVAL = [
  ["_approve_entry_core", "0037"],
  ["_approve_opening_entry", "0037"],
  ["approve_wrong_client_correction", "0037"],
  ["reverse_entry", "0037"],
  ["finalize_close", "0056"],
  ["reopen_fiscal_year", "0085"],
];

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_SUBLEDGER_HOOK_ROSTER !== "1") {
      throw new Error(
        `#868 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) ` +
        "and CLARA_ALLOW_MISSING_SUBLEDGER_HOOK_ROSTER is unset -- this is a FOCUSED run and must " +
        "fail loudly, not skip. Preload " +
        "./tests/subledger-hook-caller-roster-preintegration-gate.mjs for an estate sweep against " +
        "a pre-#868 chain.");
    }
    ready = false;
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() failed, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

test("sr.1 the hook carries a comment naming all six live callers", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(`select obj_description(to_regprocedure($1), 'pg_proc') as d`, [HOOK]);
  const d = r.rows[0].d ?? "";
  assert.ok(d.length > 0, "clara._subledger_on_approve carries no comment");
  for (const name of ROSTER) {
    assert.ok(d.includes(name), `comment does not name ${name}`);
  }
});

test("sr.2 the comment credits each caller with the migration it arrived in", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(`select obj_description(to_regprocedure($1), 'pg_proc') as d`, [HOOK]);
  const d = r.rows[0].d ?? "";
  for (const [name, migration] of ARRIVAL) {
    const at = d.indexOf(name);
    assert.notEqual(at, -1, `comment does not name ${name}`);
    const window = d.slice(at, at + name.length + 12);
    assert.ok(window.includes(migration),
      `comment does not credit ${name} to ${migration} (found: ${JSON.stringify(window)})`);
  }
});

test("sr.3 the comment states the historical four-name pin is stale, and by how much", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(`select obj_description(to_regprocedure($1), 'pg_proc') as d`, [HOOK]);
  const d = r.rows[0].d ?? "";
  assert.match(d, /0037/, "comment does not cite 0037, the census it supersedes");
  assert.match(d, /stale/i, "comment does not say the historical pin is stale");
  assert.match(d, /0216/, "comment does not name a migration that had to re-derive the roster itself");
  assert.match(d, /0221/, "comment does not name the second migration that had to re-derive the roster itself");
});

test("sr.4 AC3 non-regression: the hook's body, owner, definer flag and grant are byte-for-byte unmoved", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha,
            r.rolname as owner, p.prosecdef as secdef, coalesce(p.proacl::text,'(null)') as acl
       from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.oid = to_regprocedure($1)`,
    [HOOK],
  );
  assert.equal(r.rowCount, 1, "clara._subledger_on_approve does not resolve");
  const row = r.rows[0];
  assert.equal(row.sha, HOOK_SHA, "0236 must not touch the hook's body");
  assert.equal(row.owner, "clara_fn_owner", "0236 must not change the hook's owner");
  assert.equal(row.secdef, true, "0236 must not change the hook's SECURITY DEFINER flag");
  assert.equal(row.acl, "{clara_fn_owner=X/clara_fn_owner}",
    "0236 must not grant EXECUTE to any application role");
});

test("sr.5 AC3 non-regression: no trigger names the hook directly, and the measured six is still exactly six", async (t) => {
  if (unready(t)) return;
  const trig = await rootQuery(
    "select count(*)::int as n from pg_trigger where tgfoid = to_regprocedure($1)", [HOOK]);
  assert.equal(trig.rows[0].n, 0,
    "the hook must remain reachable only by `perform`, never installed as a trigger function itself");
  const callers = await rootQuery(
    `select array_agg(p.proname::text order by p.proname) as names
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
        and p.proname <> '_subledger_on_approve'`,
  );
  assert.deepEqual(callers.rows[0].names, ROSTER,
    "the live caller roster drifted from the six 0236's own guard measured at apply time");
});
