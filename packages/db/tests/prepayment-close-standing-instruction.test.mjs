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
import { ensurePrepay, prepayGate, prepaidScene, rootQuery, opk, caught }
  from "./f-a4-pr2a-fixtures.mjs";

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
/** A well-formed uuid this database holds nowhere. */
const NOWHERE = "00000000-0000-4000-8000-00000000dead";

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

// ---------------------------------------------------------------------------------------------
// THE AUTHORITY WALL — ONE MORE KIND, ADMITTED ONLY IN ITS OWN STRICT PAIRING.
//
// `clara.accounting_plans.authority_kind` was a CLOSED ONE-MEMBER check (0193:418) and gains
// exactly ONE value, which is the ruling's own words. The reference kind that carries it is
// `firm_standing_instruction`, and the two are admitted ONLY together: a standing instruction that
// cited a chat turn would be a label, and an explicit instruction that cited a standing-instruction
// row would be a person claiming their firm's blanket delegation as their own typed decision.
// ---------------------------------------------------------------------------------------------
test("p1050.authority.kind -- clara.accounting_plans.authority_kind admits EXACTLY "
  + "{explicit_instruction, standing_instruction}, and nothing else: the wall #977 built is "
  + "widened by ONE value rather than loosened",
async (t) => {
  if (await standingGate(t)) return;

  const def = await rootQuery(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid = 'clara.accounting_plans'::regclass
        and conname = 'accounting_plans_authority_kind_check'`);
  assert.equal(def.rows.length, 1,
    "the authority-kind CHECK is gone -- #977's wall must be widened, never dropped");
  const d = def.rows[0].d;
  // A CLOSED SET, read off the definition's own literals rather than by driving an insert, so the
  // claim is about the CHECK and not about a caller that happens to be refused earlier.
  const literals = [...d.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
  assert.deepEqual(literals, ["explicit_instruction", "standing_instruction"],
    `the authority-kind CHECK admits something the ruling did not name: ${d}`);
});

test("p1050.authority.resolve -- clara._authority_ref_refusal resolves a firm_standing_instruction "
  + "at FIRM scope: the firm's own LIVE row passes, an unknown id, a WITHDRAWN row and another "
  + "firm's row are each unresolved, and the three kinds that were already there did not move",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050resolve");

  const live = await record(sc.alice, { opKey: opk("p1050-resolve") });
  const ask = async (kind, id, firm = sc.firm, client = sc.client) => (await rootQuery(
    "select clara._authority_ref_refusal($1,$2::uuid,$3::uuid,$4::uuid) as r",
    [kind, id, firm, client])).rows[0].r;

  assert.equal(await ask("firm_standing_instruction", live.instruction_id), null,
    "the firm's own live standing instruction does not resolve");

  // NOT CLIENT-SCOPED, and that is the point rather than an oversight: the instruction is the
  // FIRM's, and it stands for every client of the firm. A sibling client of the same firm resolves
  // the same row.
  const sibling = await rootQuery(
    "select id from clara.clients where firm_id = $1 and id <> $2 limit 1", [sc.firm, sc.client]);
  if (sibling.rows[0]) {
    assert.equal(await ask("firm_standing_instruction", live.instruction_id, sc.firm,
      sibling.rows[0].id), null, "the firm's instruction did not stand for a sibling client");
  }

  assert.equal(await ask("firm_standing_instruction", NOWHERE),
    "authority_ref_unresolved", "an instruction this database does not hold was admitted");

  // A RESTATED reason withdraws the live row and mints a fresh one (§B's version-forward fold),
  // which is how this battery reaches a withdrawn row without a withdraw door.
  const restated = await record(sc.alice,
    { reason: `${REASON} Restated.`, opKey: opk("p1050-resolve-restate") });
  assert.notEqual(restated.instruction_id, live.instruction_id,
    "the restatement did not version forward");
  assert.equal(await ask("firm_standing_instruction", live.instruction_id),
    "authority_ref_unresolved", "a WITHDRAWN standing instruction still authorises plans");
  assert.equal(await ask("firm_standing_instruction", restated.instruction_id), null,
    "the restated instruction does not resolve");

  // ANOTHER FIRM'S instruction is not this firm's authority.
  const other = await rootQuery(
    "select id from clara.firms where id <> $1 limit 1", [sc.firm]);
  assert.ok(other.rows[0], "the world holds only one firm -- the cross-firm arm cannot be driven");
  assert.equal(await ask("firm_standing_instruction", restated.instruction_id,
    other.rows[0].id, sc.client), "authority_ref_unresolved",
  "one firm's standing instruction authorised another firm's plan");

  // THE THREE KINDS THAT WERE ALREADY THERE, unmoved -- this file widens the definition and must
  // not have touched them.
  assert.equal(await ask("accounting_work", NOWHERE), "authority_ref_unresolved");
  assert.equal(await ask("chat_task", NOWHERE), "authority_ref_unresolved");
  assert.equal(await ask("contract_confirmation", NOWHERE), "authority_ref_unresolved");
  const unknown = await caught(() => ask("not_a_kind", NOWHERE));
  assert.ok(unknown, "an unknown reference kind stopped raising");
  assert.equal(unknown.code, "CLR10");
});

test("p1050.authority.paired -- the OBO plan step admits standing_instruction ONLY with a "
  + "firm_standing_instruction reference and vice versa; every sentence the EXPLICIT kind can be "
  + "refused by is byte-identical to clara.create_accounting_plan's, which is #915's parity",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050paired");
  const live = await record(sc.alice, { opKey: opk("p1050-paired") });

  /** The OBO plan step, driven directly as its owner -- it is ungranted, and the authority walls
   *  it carries raise BEFORE the schedule and basis assertions, so a null basis reaches them. */
  const obo = (kind, ref) => rootQuery(
    `select clara._obo_plan_core('amortisation_schedule', $1::uuid, $2::uuid, $3::uuid,
       'p1050 pairing', $4, $5::jsonb, 'monthly', 'last_day_of_month', null,
       'Asia/Kuala_Lumpur', '2025-02-01'::date, '2025-04-30'::date, null::jsonb) as r`,
    [sc.firm, sc.client, sc.alice, kind, ref === null ? null : JSON.stringify(ref)]);
  /** The HUMAN door, on the same state, for the parity half. */
  const human = (kind, ref) => humanQuery(sc.alice,
    `select clara.create_accounting_plan($1::uuid, 'amortisation_schedule', 'p1050 pairing',
       $2, $3::jsonb, 'monthly', 'last_day_of_month', null, 'Asia/Kuala_Lumpur',
       '2025-02-01'::date, '2025-04-30'::date, null::jsonb, null, $4) as r`,
    [sc.client, kind, ref === null ? null : JSON.stringify(ref), opk("p1050-parity")]);

  // ---- THE PAIRING, BOTH WAYS ----------------------------------------------------------------
  const standingWithChat = await caught(
    () => obo("standing_instruction", { kind: "chat_task", id: NOWHERE }));
  assert.ok(standingWithChat, "a standing instruction citing a chat turn was admitted");
  assert.equal(standingWithChat.code, "CLR10");
  assert.deepEqual(
    [JSON.parse(standingWithChat.detail).reason, JSON.parse(standingWithChat.detail).constraint],
    ["authority_ref_invalid", "kind"]);

  const explicitWithStanding = await caught(
    () => obo("explicit_instruction", { kind: "firm_standing_instruction", id: live.instruction_id }));
  assert.ok(explicitWithStanding,
    "an explicit instruction citing a standing-instruction row was admitted");
  assert.deepEqual(
    [JSON.parse(explicitWithStanding.detail).reason,
      JSON.parse(explicitWithStanding.detail).constraint],
    ["authority_ref_invalid", "kind"]);

  // ---- THE PARITY #915 MEASURES. Every refusal the EXPLICIT kind can take must still be the
  //      human door's own sentence, byte for byte, or the two plan steps have drifted.
  const pairs = [
    ["authority_rule", { kind: "chat_task", id: NOWHERE }],
    ["not_a_kind", { kind: "chat_task", id: NOWHERE }],
    ["explicit_instruction", null],
    ["explicit_instruction", { kind: "email", id: NOWHERE }],
    ["explicit_instruction", { kind: "firm_standing_instruction", id: live.instruction_id }],
    ["explicit_instruction", { kind: "chat_task", id: "not a uuid" }],
    ["explicit_instruction", { kind: "chat_task", id: NOWHERE }],
  ];
  for (const [kind, ref] of pairs) {
    const o = await caught(() => obo(kind, ref));
    const h = await caught(() => human(kind, ref));
    assert.ok(o && h, `both entrances must refuse ${kind} / ${JSON.stringify(ref)}`);
    assert.equal(o.message, h.message,
      `the two plan steps drifted on ${kind} / ${JSON.stringify(ref)}`);
    assert.equal(o.code, h.code);
    assert.deepEqual(JSON.parse(o.detail), JSON.parse(h.detail));
  }

  // ---- AND THE HUMAN DOOR IS NOT WIDENED. The ruling gives the new kind to the lane that has no
  //      person at the keyboard; a person types clara.create_prepayment_schedule.
  const humanStanding = await caught(
    () => human("standing_instruction", { kind: "firm_standing_instruction", id: live.instruction_id }));
  assert.ok(humanStanding, "the human plan door admitted a standing instruction");
  assert.equal(JSON.parse(humanStanding.detail).reason, "invalid_authority_kind");
});
