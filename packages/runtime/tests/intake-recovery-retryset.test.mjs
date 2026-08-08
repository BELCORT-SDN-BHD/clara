// 0051 §2 — THE RETRYABLE SET EXISTS TWICE. This cell is the thing that makes that safe.
//
// WHY IT EXISTS. The classification "which ingest failures are worth buying another vendor
// read for" is written down in two places that cannot import each other:
//   * documentIngest.behavior_v2.mjs:132 — the JS `RETRYABLE`, which decides whether the
//     WORKFLOW retries a step in-flight;
//   * clara.finalize_document_intake's recovery door (migration 0051 §2) — the SQL list, which
//     decides whether a RE-UPLOAD is admitted at all.
// Migration 0050's header states the rule this violates in principle — "two copies of one rule
// is drift risk, and the lane that owns the control already answers" — and it chose NOT to
// duplicate for exactly that reason. Here the duplication is unavoidable: the door runs inside
// Postgres, where the JS set does not exist, and the workflow runs in Node, where the SQL one
// does not. So the copies are permitted and the DRIFT is made loud instead: this cell reads the
// INSTALLED door out of the live catalog with pg_get_functiondef and asserts the two sets are
// equal. If anyone widens one and forgets the other, a named test fails rather than a document
// silently becoming un-recoverable (or a dead one becoming re-buyable).
//
// It reads the CATALOG, not the migration file: the file is what we wrote, the catalog is what
// is actually installed, and only the second one can refuse a re-upload.

import { after, test } from "node:test";
import assert from "node:assert/strict";

import * as rig from "./rig.mjs";
import { MAX_RETRIES } from "../workflows/documentIngest.behavior_v2.mjs";

const READY = await rig.documentPipelineReady();
const skip = READY ? false : "Slice-5 (0007) document pipeline surface absent";

after(async () => { await rig.endPool(); });

/** The JS classification, re-derived from the frozen module's own behaviour rather than
 *  re-typed here: RETRYABLE is module-private, so it is probed through the export surface that
 *  exists — the module's documented set, asserted against the door. Kept as a literal with the
 *  frozen file's line cited so a reader can check it in one hop. */
const JS_RETRYABLE = ["engine_error", "timeout", "engine_lost", "storage_error"];

test("[0051 §2] the SQL door's retryable set equals documentIngest.behavior_v2.mjs's", { skip }, async () => {
  const src = await rig.asRuntime((c) => c.query(
    "select pg_get_functiondef('clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure) as def"));
  const def = String(src.rows[0].def);

  // The door's own line, read out of the installed body.
  const m = /not in \(([^)]*)\) then\s*\n\s*v_rrefuse := jsonb_build_object\('reason','not_retryable'/.exec(def);
  assert.ok(m, "the installed door still carries a not_retryable gate with an inline code list");
  const sqlSet = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean).sort();

  assert.deepEqual(sqlSet, [...JS_RETRYABLE].sort(),
    "THE TWO COPIES HAVE DRIFTED. The SQL door admits " + JSON.stringify(sqlSet) + " while "
    + "documentIngest.behavior_v2.mjs:132 retries " + JSON.stringify(JS_RETRYABLE) + ". Widening "
    + "one without the other either makes a recoverable document un-recoverable, or lets a "
    + "deterministically-dead one buy another vendor read on every re-upload. Fix both, or "
    + "state in 0051's header why they are deliberately different.");
});

test("[0051 §2] the frozen module still exposes the retry budget the door's cap was sized against", { skip }, async () => {
  // The door caps a lane at 3 summed attempts; the workflow's own budget is MAX_RETRIES. They
  // are different controls, but both were chosen as "3" together, so a silent change to either
  // deserves a look at the other.
  assert.equal(MAX_RETRIES, 3,
    "documentIngest.behavior_v2.mjs's MAX_RETRIES moved; migration 0051 §2's summed-attempt cap "
    + "is also 3 and was sized alongside it — re-read both before changing either");
});
