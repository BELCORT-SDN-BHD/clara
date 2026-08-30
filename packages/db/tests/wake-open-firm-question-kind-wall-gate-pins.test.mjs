// Pin the preintegration decision itself. These cells replace the live body only inside a
// savepoint on one dedicated connection, so no other session can observe the planted body.
// The behavioural battery remains the acceptance proof; this file proves its skip arm cannot
// drift back to "new marker absent" or another spelling-based, fail-open predicate.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, endPool } from "./rig-fixtures.mjs";
import {
  readWakeOpenFirmQuestionKindWallState,
  WAKE_OPEN_FIRM_QUESTION_KIND_WALL_FILE,
  WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA,
  WAKE_OPEN_FIRM_QUESTION_PREIMAGE_SHA,
} from "./wake-open-firm-question-kind-wall-gate-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const migrationText = readFileSync(
  join(here, "..", "migrations", "UNNUMBERED_wake_open_firm_question_kind_wall.sql"),
  "utf8",
);
const testText = readFileSync(join(here, "wake-open-firm-question-kind-wall.test.mjs"), "utf8");

const recutStart = migrationText.indexOf(
  "create or replace function clara.wake_open_firm_question(\n",
);
const recutEndMarker = "end $fn$;";
const recutEnd = migrationText.indexOf(recutEndMarker, recutStart);
assert.ok(recutStart >= 0 && recutEnd > recutStart, "pin fixture: find the shipped recut");
const newBodyDdl = migrationText.slice(recutStart, recutEnd + recutEndMarker.length);

const spliceStartMarker = "  -- PROGRESS.md Known-issues 3a / this migration";
const spliceEndMarker = "  v_dedupe := clara._reserve_op";
const spliceStart = newBodyDdl.indexOf(spliceStartMarker);
const spliceEnd = newBodyDdl.indexOf(spliceEndMarker, spliceStart);
assert.ok(spliceStart >= 0 && spliceEnd > spliceStart, "pin fixture: find the kind-wall splice");
const oldBodyDdl = newBodyDdl.slice(0, spliceStart) + newBodyDdl.slice(spliceEnd);

const unknownBodyDdl = `create or replace function clara.wake_open_firm_question(
    p_document uuid, p_kind text, p_question text, p_candidates jsonb, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  return jsonb_build_object('unknown_stub', true);
end $fn$;`;

after(async () => { await endPool(); });

async function stateWithBody(ddl) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("savepoint kind_wall_gate_pin");
    await client.query(ddl);
    return await readWakeOpenFirmQuestionKindWallState(
      (sql, params) => client.query(sql, params),
      "1",
    );
  } finally {
    await client.query("rollback").catch(() => {});
    await client.query("reset role").catch(() => {});
    await client.query("reset all").catch(() => {});
    client.release();
  }
}

test("kind-wall gate pin: preload 1 + the reviewed new body executes every behavioural cell", async () => {
  const state = await stateWithBody(newBodyDdl);
  assert.equal(state.bodySha, WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA);
  assert.equal(state.oldBody, false, "the reviewed body never takes the authoring-state arm");
  assert.equal(state.skipReason, null, "the reviewed body produces zero gate skips");
});

test("kind-wall gate pin: preload 1 + the exact old body planted in a savepoint yields exactly the 17 counted battery skips, naming the UNNUMBERED file", async () => {
  const state = await stateWithBody(oldBodyDdl);
  assert.equal(state.bodySha, WAKE_OPEN_FIRM_QUESTION_PREIMAGE_SHA);
  assert.equal(state.oldBody, true, "only the exact known pre-image takes the authoring arm");
  assert.match(state.skipReason, new RegExp(WAKE_OPEN_FIRM_QUESTION_KIND_WALL_FILE.replaceAll("/", "\\/")));

  const gateCallSites = (testText.match(/if \(unready\(t\)\) return;/g) ?? []).length;
  const admittedKinds = testText.match(/const ADMITTED_KINDS = \[([^\]]+)\]/)?.[1].match(/"[^"]+"/g) ?? [];
  const doorOwnedKinds = testText.match(/const DOOR_OWNED_KINDS = \[([^\]]+)\]/)?.[1].match(/"[^"]+"/g) ?? [];
  // Each array-driven loop contributes one source call-site but registers one cell per kind.
  const countedSkips = gateCallSites + admittedKinds.length - 1 + doorOwnedKinds.length - 1;
  assert.equal(countedSkips, 17, "the old-body arm reaches exactly the 17 original wall cells (CI 1919-1935)");
});

test("kind-wall gate pin: preload 1 + an unknown stub body executes with zero skips", async () => {
  const state = await stateWithBody(unknownBodyDdl);
  assert.notEqual(state.bodySha, WAKE_OPEN_FIRM_QUESTION_PREIMAGE_SHA);
  assert.notEqual(state.bodySha, WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA);
  assert.equal(state.oldBody, false, "an unknown body fails through to behavioural execution");
  assert.equal(state.skipReason, null, "an unknown body never becomes vacuously green");
});
