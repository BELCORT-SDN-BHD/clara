// 0051 §2 — THE RETRYABLE SET EXISTS TWICE. This cell is the thing that makes that safe.
//
// WHY IT EXISTS. The classification "which ingest failures are worth buying another vendor
// read for" is written down in two places that cannot import each other:
//   * documentIngest.behavior_v2.mjs — the JS `RETRYABLE`, which decides whether the WORKFLOW
//     retries a step in-flight;
//   * clara.finalize_document_intake's recovery door (migration 0051 §2) — the SQL list, which
//     decides whether a RE-UPLOAD is admitted at all.
// Migration 0050's header states the rule this violates in principle — "two copies of one rule
// is drift risk, and the lane that owns the control already answers" — and it chose NOT to
// duplicate for exactly that reason. Here the duplication is unavoidable: the door runs inside
// Postgres, where the JS set does not exist, and the workflow runs in Node, where the SQL one
// does not. So the copies are permitted and the DRIFT is made loud instead.
//
// IT MUST PROTECT BOTH DIRECTIONS, AND THE FIRST CUT DID NOT. That version compared the
// installed door against a hand-typed literal in this file — which was a THIRD copy: widen the
// JS set and forget the SQL, and the cell would have passed against the stale hand-copy while
// the two real sets disagreed. Review caught it. Both sides are now READ FROM THEIR SOURCE at
// test time, by the same kind of instrument:
//   * the SQL side out of the LIVE CATALOG (pg_get_functiondef) — what is actually installed,
//     not what the migration file says;
//   * the JS side out of the FROZEN FILE'S OWN TEXT — `RETRYABLE` is a module-private const, so
//     it cannot be imported without editing a hash-frozen file, and reading the text is the way
//     to observe it without touching it.
// NOBODY SHOULD "UPGRADE" THE JS SIDE INTO AN IMPORT: that would mean adding an export to a
// frozen, deployed module, which the freeze-lint exists to forbid. Text is the correct
// instrument here precisely BECAUSE the file is hash-frozen — the freeze makes the text and
// the behaviour the same thing.

import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import assert from "node:assert/strict";

import * as rig from "./rig.mjs";
import { MAX_RETRIES } from "../workflows/documentIngest.behavior_v2.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";
const BEHAVIOR_V2 = new URL("../workflows/documentIngest.behavior_v2.mjs", import.meta.url);

after(async () => { await rig.endPool(); });

/** The JS classification, read out of the frozen module's own source text.
 *  THROWS when the shape it depends on is gone — a regex that silently matches nothing would
 *  make both sides empty and "equal", which is the exact way a drift guard becomes decorative. */
export function jsRetryableFrom(text) {
  const m = /const RETRYABLE = new Set\(\[([^\]]*)\]\)/.exec(text);
  if (!m) throw new Error("documentIngest.behavior_v2.mjs no longer declares `const RETRYABLE = new Set([...])` — this guard's instrument is broken and must be re-pointed, not deleted");
  const set = m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean).sort();
  if (set.length === 0) throw new Error("the frozen module's RETRYABLE set parsed EMPTY — refusing to compare nothing against nothing");
  return set;
}

/** The SQL classification, read out of the INSTALLED door. Same fail-loud discipline. */
export function sqlRetryableFrom(def) {
  const m = /not in \(([^)]*)\) then\s*\n\s*v_rrefuse := jsonb_build_object\('reason','not_retryable'/.exec(def);
  if (!m) throw new Error("the installed clara.finalize_document_intake no longer carries a not_retryable gate with an inline code list — this guard's instrument is broken and must be re-pointed, not deleted");
  const set = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean).sort();
  if (set.length === 0) throw new Error("the installed door's retryable set parsed EMPTY — refusing to compare nothing against nothing");
  return set;
}

test("[0051 §2] the SQL door's retryable set equals the frozen workflow's — both read from source", { skip }, async () => {
  const src = await rig.asRuntime((c) => c.query(
    "select pg_get_functiondef('clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure) as def"));
  const sqlSet = sqlRetryableFrom(String(src.rows[0].def));
  const jsSet = jsRetryableFrom(await readFile(BEHAVIOR_V2, "utf8"));

  assert.ok(jsSet.length >= 4, "the frozen module's set was read, not guessed");
  assert.deepEqual(sqlSet, jsSet,
    "THE TWO COPIES HAVE DRIFTED. The SQL door admits " + JSON.stringify(sqlSet)
    + " while documentIngest.behavior_v2.mjs retries " + JSON.stringify(jsSet)
    + ". Widening one without the other either makes a recoverable document un-recoverable, or "
    + "lets a deterministically-dead one buy another vendor read on every re-upload. Fix both, "
    + "or state in 0051's header why they are deliberately different.");
});

test("[0051 §2] the guard catches drift in BOTH directions, and refuses to compare nothing", async () => {
  // The negative control. A drift guard that has never been seen to fail is not evidence, and
  // this one has to fail on either side — the first cut could only ever have caught the SQL.
  const real = await readFile(BEHAVIOR_V2, "utf8");
  const jsReal = jsRetryableFrom(real);

  // (1) JS SIDE drifts (someone widens the workflow and forgets the door).
  const doctored = real.replace(
    /const RETRYABLE = new Set\(\[([^\]]*)\]\)/,
    (_all, inner) => `const RETRYABLE = new Set([${inner}, "corrupt"])`,
  );
  const jsDrifted = jsRetryableFrom(doctored);
  assert.notDeepEqual(jsDrifted, jsReal, "the doctored source really did change the parsed set");
  assert.ok(jsDrifted.includes("corrupt"), "…by adding the code the door would still refuse");

  // (2) SQL SIDE drifts (someone widens the door and forgets the workflow).
  const sqlDrifted = sqlRetryableFrom(
    "not in ('engine_error','timeout','engine_lost','storage_error','encrypted') then\n"
    + "          v_rrefuse := jsonb_build_object('reason','not_retryable'");
  assert.notDeepEqual(sqlDrifted, jsReal, "a widened SQL list is caught against the real JS set");

  // (3) A BROKEN INSTRUMENT is loud, never a silent pass. This is the failure mode that would
  // otherwise turn the whole cell into decoration.
  assert.throws(() => jsRetryableFrom("// the const was renamed"), /no longer declares/,
    "a JS set the regex cannot find raises rather than returning empty");
  assert.throws(() => sqlRetryableFrom("create function ... no gate here"), /no longer carries/,
    "…and so does a door whose gate the regex cannot find");
});

test("[0051 §2] the frozen module still exposes the retry budget the door's cap was sized against", { skip }, async () => {
  // The door caps a lane at 3 summed attempts; the workflow's own budget is MAX_RETRIES. They
  // are different controls, but both were chosen as "3" together, so a silent change to either
  // deserves a look at the other. MAX_RETRIES is a real export, so this side can import.
  assert.equal(MAX_RETRIES, 3,
    "documentIngest.behavior_v2.mjs's MAX_RETRIES moved; migration 0051 §2's summed-attempt cap "
    + "is also 3 and was sized alongside it — re-read both before changing either");
});
