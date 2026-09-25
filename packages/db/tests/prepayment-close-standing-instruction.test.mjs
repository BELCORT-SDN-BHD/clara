// #1050 (riders sweep wave, lane 02) — the clocked prepayment lane gets a DIRECTING HUMAN.
// Migration: 0338_prepayment_close_standing_instruction.sql. Frontier-gated on its own STABLE STEM
// (`prepayment_close_standing_instruction$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_wake_reroute$` idiom.
//
// WHAT THIS TICKET IS, AND WHY THE TICKET AS FILED IS NOT IT. #1036's fix round made
// `clara.wake_establish_prepayment_schedule` refuse CLR03 `wake_authority_absent`: an unattended
// `close_prep` wake names no directing human, so it could authorise no amortisation plan, and a
// plan authorised by `clara.agent_user_id()` could never admit a single occurrence (that user holds
// zero `clara.firm_memberships` rows). The owner ruled a DIRECTING HUMAN rather than a widened
// admission wall. The ticket as filed named "the member who enabled close_prep for the firm" —
// which does not exist: `clara.wake_engine_sources` is ONE global row per `source_key`, flipped
// operator-only by `clara.set_wake_source_enabled`, and its broadcast audit row to every other firm
// deliberately carries `actor = NULL`. The 2026-09-25 ruling on this ticket re-briefs it: a NAMED
// MEMBER of the firm records a FIRM-LEVEL STANDING INSTRUCTION, that member is the wake plan's
// directing human, admission runs under that member's authority and membership, and
// `clara.accounting_plans.authority_kind` gains ONE value.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the doors' behaviour, driven for real.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { humanQuery } from "./rig-helpers.mjs";
import { ensurePrepay, prepayGate, prepaidScene, rootQuery, opk } from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(() => {}); });
after(async () => {
  if (skipped > 0) {
    console.log(`p1050: ${skipped} cell(s) skipped -- probed at the live catalog`);
  }
});

/** The one instruction key this ticket mints. */
const KEY = "prepayment_schedule_at_close";
const REASON = "Let Clara establish prepayment schedules at close for this firm's clients.";

// A SECOND, INDEPENDENT gate, on THIS ticket's own migration: the F-A4 PR-2a frontier is true from
// 0140 onward, so a cell here needs its OWN stem check — `prepayment-wake-reroute.test.mjs`'s idiom.
let _standing = null;
async function hasStanding() {
  if (_standing !== null) return _standing;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations "
    + "where version ~ 'prepayment_close_standing_instruction$'");
  _standing = Number(r.rows[0].n) > 0;
  return _standing;
}
async function standingGate(t) {
  if (prepayGate(t, markSkip)) return true;
  if (!(await hasStanding())) {
    if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_CLOSE_STANDING_INSTRUCTION !== "1") {
      throw new Error(
        "#1050 premise 0338_prepayment_close_standing_instruction.sql is not applied (no "
        + "prepayment_close_standing_instruction$ row in clara.schema_migrations) and "
        + "CLARA_ALLOW_MISSING_PREPAYMENT_CLOSE_STANDING_INSTRUCTION is unset -- this is a FOCUSED "
        + "run and must fail loudly, not skip. Preload "
        + "./tests/prepayment-close-standing-instruction-preintegration-gate.mjs for an estate "
        + "sweep against a pre-#1050 chain.");
    }
    markSkip();
    t.skip("#1050 (0338_prepayment_close_standing_instruction) not applied -- probed at the live catalog");
    return true;
  }
  return false;
}

/** The record door, called for real as a named member through the governed human path. */
function record(sub, { key = KEY, reason = REASON, opKey } = {}) {
  return humanQuery(sub,
    "select clara.record_firm_standing_instruction($1,$2,$3) as r",
    [key, reason, opKey ?? opk("p1050-record")]).then((r) => r.rows[0].r);
}

/** The live standing-instruction row of a firm, read as root. */
async function liveRow(firm, key = KEY) {
  const r = await rootQuery(
    `select * from clara.firm_standing_instructions
      where firm_id = $1 and instruction_key = $2 and withdrawn_at is null`, [firm, key]);
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// THE INSTRUCTION ITSELF — A NAMED MEMBER OF THE FIRM RECORDS IT, AND THE ROW NAMES THEM.
// ---------------------------------------------------------------------------------------------
test("p1050.instruction.recorded -- a named member records the firm-level standing instruction "
  + "through the real door; the row carries the firm, the key, the member and the stated reason, "
  + "and a replay under the same op key returns the same instruction rather than a second one",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050record");

  assert.equal(await liveRow(sc.firm), null, "the scene already carries an instruction -- fixture leak");

  const key = opk("p1050-record-one");
  const r = await record(sc.alice, { opKey: key });
  assert.ok(r.instruction_id, "the door returned no instruction id");
  assert.equal(r.instruction_key, KEY);
  assert.equal(r.recorded_by, sc.alice, "the instruction does not name the member who recorded it");
  assert.equal(r.reason, REASON);
  assert.equal(r.active, true);

  const row = await liveRow(sc.firm);
  assert.ok(row, "the door answered but wrote no live row");
  assert.equal(row.id, r.instruction_id);
  assert.equal(row.firm_id, sc.firm, "the instruction is firm-scoped");
  assert.equal(row.recorded_by, sc.alice);
  assert.equal(row.reason, REASON);
  assert.equal(row.withdrawn_at, null);
  assert.equal(row.withdrawn_by, null);

  // THE REPLAY, under the SAME key: one instruction, not two.
  const again = await record(sc.alice, { opKey: key });
  assert.equal(again.instruction_id, r.instruction_id,
    "a replayed record minted a SECOND standing instruction");
  const all = await rootQuery(
    "select count(*)::int as n from clara.firm_standing_instructions where firm_id = $1", [sc.firm]);
  assert.equal(all.rows[0].n, 1, "the firm carries more than one standing-instruction row");
});
