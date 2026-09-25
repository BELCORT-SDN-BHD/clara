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
import { twoSessions, asHumanSession, waitBlockedByOrThrow } from "./binding-proposal-pr-1-helpers.mjs";
import { ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, opk, caught, wake12 }
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
/** The agent identity every unattended act is attributed to (0002's one fixed row). */
const AGENT = "00000000-0000-4000-8000-000000c1a7a0";

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

/** The withdraw door, called for real as a named member through the governed human path. */
function withdraw(sub, { key = KEY, reason = "p1050: the firm takes the instruction back", opKey } = {}) {
  return humanQuery(sub,
    "select clara.withdraw_firm_standing_instruction($1,$2,$3) as r",
    [key, reason, opKey ?? opk("p1050-withdraw")]).then((r) => r.rows[0].r);
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

test("p1050.record.race -- two members recording the firm's standing instruction at the SAME "
  + "moment are serialised at the door's own rung: the second blocks, then takes the lawful "
  + "version-forward branch and is answered with an ordinary receipt, rather than leaking the "
  + "unique index's raw 23505 with no CLR code and no reason a surface could read",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050race");
  assert.equal(await liveRow(sc.firm), null, "the scene already carries an instruction -- fixture leak");

  const settled = await twoSessions(async (cA, cB) => {
    const pidA = await asHumanSession(cA, sc.alice);
    const pidB = await asHumanSession(cB, sc.alice);
    await cA.query("begin");
    await cB.query("begin");

    // A records INSIDE an open transaction: its row is invisible to B's snapshot, which is the
    // window the unique index -- and nothing else -- was closing.
    const a = (await cA.query(
      "select clara.record_firm_standing_instruction($1,$2,$3) as r",
      [KEY, REASON, opk("p1050-raceA")])).rows[0].r;
    assert.ok(a.instruction_id, "session A's recording did not succeed");

    // B asks the same question under its OWN op key -- two admins, two tabs, one firm -- so
    // `clara._reserve_op` cannot answer it and it reaches the same live-row question A holds.
    const racing = cB.query(
      "select clara.record_firm_standing_instruction($1,$2,$3) as r",
      [KEY, REASON, opk("p1050-raceB")])
      .then((r) => ({ receipt: r.rows[0].r, error: null }), (error) => ({ receipt: null, error }));

    // PROVEN from pg_stat_activity, never from a sleep (0287's own cell's rule).
    await waitBlockedByOrThrow(pidB, pidA);

    await cA.query("commit");
    const out = await racing;
    await cB.query("commit");
    return { a, ...out };
  });

  assert.equal(settled.error, null,
    `the racing session leaked an untyped failure: ${settled.error?.code} ${settled.error?.message}`);
  assert.ok(settled.receipt?.instruction_id, "the racing session was answered with no instruction");
  assert.equal(settled.receipt.instruction_id, settled.a.instruction_id,
    "once serialised, an UNCHANGED re-recording is idempotent -- the second session must be "
    + "answered with the row the first one wrote, not a second one");
  assert.equal(settled.receipt.active, true);

  const live = await rootQuery(
    `select count(*)::int as n from clara.firm_standing_instructions
      where firm_id = $1 and instruction_key = $2 and withdrawn_at is null`, [sc.firm, KEY]);
  assert.equal(live.rows[0].n, 1, "the firm ended the race with more than one LIVE instruction");
});

test("p1050.record.race_snapshot -- the rung serialises, but a caller holding an OLDER SNAPSHOT "
  + "(repeatable read) still cannot see the row it waited for; the door answers that with the "
  + "estate's own retryable refusal rather than with the index's 23505",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050racesnap");
  assert.equal(await liveRow(sc.firm), null, "the scene already carries an instruction -- fixture leak");

  const settled = await twoSessions(async (cA, cB) => {
    await asHumanSession(cA, sc.alice);
    await asHumanSession(cB, sc.alice);

    // B's SNAPSHOT IS TAKEN FIRST and then frozen: under repeatable read the advisory rung is
    // free by the time B takes it (A has committed and released it), and B's own `select` still
    // reads the world as it was before A wrote. The unique index is NOT snapshot-bound, so the
    // insert meets it. This is the one interleave the rung cannot close.
    await cB.query("begin isolation level repeatable read");
    await cB.query("select 1");

    await cA.query("begin");
    const a = (await cA.query(
      "select clara.record_firm_standing_instruction($1,$2,$3) as r",
      [KEY, REASON, opk("p1050-snapA")])).rows[0].r;
    await cA.query("commit");

    const out = await cB.query(
      "select clara.record_firm_standing_instruction($1,$2,$3) as r",
      [KEY, REASON, opk("p1050-snapB")])
      .then((r) => ({ receipt: r.rows[0].r, error: null }), (error) => ({ receipt: null, error }));
    await cB.query("rollback");
    return { a, ...out };
  });

  assert.ok(settled.error, "the stale-snapshot session wrote a second live instruction");
  assert.equal(settled.error.code, "CLR13",
    `an untyped refusal reached the caller: ${settled.error.code} ${settled.error.message}`);
  const d = JSON.parse(settled.error.detail);
  assert.equal(d.reason, "operation_in_flight",
    "the refusal carries no reason a surface could key on");
  assert.equal(d.instruction_key, KEY,
    "the refusal does not name WHICH standing instruction was recorded underneath it");

  const live = await rootQuery(
    `select count(*)::int as n from clara.firm_standing_instructions
      where firm_id = $1 and instruction_key = $2 and withdrawn_at is null`, [sc.firm, KEY]);
  assert.equal(live.rows[0].n, 1, "the firm ended with more than one LIVE instruction");
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

test("p1050.authority.human_lane_unwidened -- the second kind is the unattended lane's alone, and "
  + "that is asserted of the LANE rather than of one body's text: neither the human plan door nor "
  + "the shared wall it delegates to after #1051 names standing_instruction anywhere, and nothing "
  + "outside the plan family resolves an authority reference",
async (t) => {
  if (await standingGate(t)) return;

  // NOT A SHA PIN, and not a pin on any particular spelling: `clara.create_accounting_plan` and
  // `clara._obo_plan_core` are written by lane L1 (#1051) as well as by this one, so the claim is
  // stated as the FACT the ruling owns. It reads the same on a chain with L1's 0330 and on one
  // without it -- which is exactly why it is worth having.
  const widened = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('create_accounting_plan', '_assert_plan_authority')
        and position('standing_instruction' in p.prosrc) > 0`);
  assert.deepEqual(widened.rows.map((r) => r.proname), [],
    "the human plan lane admits standing_instruction -- the ruling gives the second kind to the "
    + "unattended lane only");

  // #977's CLOSED WORLD IS A ROSTER OF NAMES, NOT A COUNT: #1051 folds two readers into one
  // predicate and #1080 points a third at it, so the count legitimately moves while the invariant
  // does not.
  const readers = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname <> '_authority_ref_refusal'
        and p.prosrc like '%clara._authority_ref_refusal(%'
        and p.proname not in ('create_accounting_plan', '_obo_plan_core', '_accrual_plan_core',
                              '_assert_plan_authority', 'sign_depreciation_authority')`);
  assert.deepEqual(readers.rows.map((r) => r.proname), [],
    "a body outside the plan family resolves an authority reference -- #977's closed world");
  const all = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname <> '_authority_ref_refusal'
        and p.prosrc like '%clara._authority_ref_refusal(%'`);
  assert.ok(all.rows[0].n >= 1, "nothing reads clara._authority_ref_refusal -- #977's wall is gone");
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

// ---------------------------------------------------------------------------------------------
// THE CLOCKED LANE ITSELF — #1036's AC1 AND AC2, WHICH HAVE NEVER PASSED.
//
// The lane refuses today for a reason that was RIGHT (#1036's fix round): an unattended wake named
// no directing human. It re-opens here with one, and the refusal survives unchanged for the firm
// that has instructed nothing — which is every firm until a member says otherwise.
// ---------------------------------------------------------------------------------------------

/** Everything durable a wake call could leave behind, for one client. p1036's own footprint. */
async function footprint(sc) {
  const r = await rootQuery(
    `select (select count(*)::int from clara.prepayment_schedules where client_id = $1) as schedules,
            (select count(*)::int from clara.accounting_plans where client_id = $1) as plans,
            (select count(*)::int from clara.adjustment_templates where firm_id = $2) as templates,
            (select count(*)::int from clara.op_receipts where firm_id = $2
              and fn = 'create_prepayment_schedule') as reservations`,
    [sc.client, sc.firm]);
  return r.rows[0];
}

test("p1050.wake.absent -- a firm that has instructed NOTHING is answered exactly as it was before "
  + "this ticket: CLR03 wake_authority_absent, nothing written, the human door still named -- and "
  + "the refusal now also names the door a member uses to give the instruction",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050absent");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  assert.equal(await liveRow(sc.firm), null, "the scene already carries an instruction -- fixture leak");

  const before = await footprint(sc);
  const err = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target }));
  assert.ok(err, "a firm that instructed nothing had a schedule configured for it");
  assert.equal(err.code, "CLR03", "a wake-authority refusal is CLR03, the estate's own wake class");
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "wake_authority_absent", "#1036's own reason token moved");
  assert.equal(d.lane, "wake");
  assert.equal(d.wake_kind, "close_prep");
  assert.equal(d.remedy, "clara.create_prepayment_schedule",
    "the refusal must still name the door a PERSON uses to configure this one schedule");
  assert.equal(d.standing_remedy, "clara.record_firm_standing_instruction",
    "the refusal does not name the door that gives Clara the standing instruction");
  assert.equal(d.instruction_key, KEY,
    "the refusal does not name WHICH standing instruction is missing");

  assert.deepEqual(await footprint(sc), before, "the refused wake left something durable behind");
});

test("p1050.wake.configures -- under a LIVE standing instruction the clocked lane configures ONE "
  + "amortisation schedule: the plan names the RECORDING MEMBER as its directing human, "
  + "authority_kind standing_instruction, citing the instruction row AND the wake task that acted "
  + "on it; the schedule names the AGENT as the run that wrote it; and a second wake under the "
  + "same key yields the same schedule rather than a second one (#1036 AC1)",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050configures");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });

  // THE INSTRUCTION IS GIVEN BY A NAMED MEMBER, through the real door.
  const si = await record(sc.alice, { opKey: opk("p1050-configures") });

  // NO op key of this battery's own: `clara.wake_establish_prepayment_schedule` admits ONLY the
  // key derived from (task, verb, subject), so the replay below is driven the way the production
  // belt drives it -- the same task asking twice.
  const r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(r.schedule_id, `the clocked lane refused under a live standing instruction: ${JSON.stringify(r)}`);
  assert.ok(r.plan_id, "the schedule carries no plan");
  assert.equal(r.configuration_only, true, "an accepted configuration is not a posted occurrence");
  assert.ok(Array.isArray(r.next_occurrences) && r.next_occurrences.length > 0,
    "the plan yields no occurrence -- a schedule that can never post is what #1036 refused");

  const plan = (await rootQuery(
    "select * from clara.accounting_plans where id = $1", [r.plan_id])).rows[0];
  assert.equal(plan.authorised_by, sc.alice,
    "the plan's directing human is not the member who recorded the standing instruction");
  assert.equal(plan.created_by, sc.alice,
    "the plan is authored by the member whose instruction produced it");
  assert.equal(plan.authority_kind, "standing_instruction",
    "the plan is labelled as something a person typed");
  assert.equal(plan.authority_ref.kind, "firm_standing_instruction");
  assert.equal(plan.authority_ref.id, si.instruction_id,
    "the plan does not cite the instruction row that authorised it");
  assert.equal(plan.authority_ref.wake_kind, "close_prep");
  assert.equal(plan.authority_ref.task_id, sc.s.task,
    "the plan does not name the clocked task that acted on the instruction");
  assert.equal(plan.kind, "amortisation_schedule");
  assert.equal(plan.status, "active");

  // THE SCHEDULE ROW NAMES THE RUN THAT WROTE IT, which is the agent -- the member authorised the
  // act, Clara performed it, and the two are different facts the trail keeps apart.
  const sched = (await rootQuery(
    "select * from clara.prepayment_schedules where id = $1", [r.schedule_id])).rows[0];
  assert.equal(sched.created_by, AGENT,
    "the schedule does not name the unattended run that actually wrote it");
  assert.equal(sched.plan_id, r.plan_id);

  // #1036 AC1's second half: TWICE YIELDS ONE.
  const again = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(again.schedule_id, r.schedule_id, "a replayed wake configured a SECOND schedule");
  const n = await rootQuery(
    "select count(*)::int as n from clara.prepayment_schedules where client_id = $1", [sc.client]);
  assert.equal(n.rows[0].n, 1, "the client carries more than one schedule");
  const plans = await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where client_id = $1", [sc.client]);
  assert.equal(plans.rows[0].n, 1, "the client carries more than one plan");

  // NOTHING IS ADMITTED ON THE AGENT'S OWN AUTHORITY -- the invariant #1036 left behind.
  const agentPlans = await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where client_id = $1 and authorised_by = $2",
    [sc.client, AGENT]);
  assert.equal(agentPlans.rows[0].n, 0,
    "the clocked lane wrote a plan under clara.agent_user_id() -- it could never admit an occurrence");
});

test("p1050.wake.lapsed -- when the recording member is no longer an ACTIVE member of the firm the "
  + "clocked lane refuses CLR03 wake_authority_lapsed and writes nothing, rather than configuring "
  + "a plan that could never post",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050lapsed");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const si = await record(sc.alice, { opKey: opk("p1050-lapsed") });

  const before = await footprint(sc);

  // THE LAPSE IS COMMITTED, not held in a rolled-back transaction, and it has to be: the wake door
  // is driven on its OWN `clara_wake_interactive` connection (the production path this battery
  // never reaches around), so a membership change this cell held uncommitted would be invisible to
  // it -- which is exactly how this cell first went green against an unbuilt wall. Every scene
  // builds its own firm and its own users, so the mutation is local to this cell's world, and it
  // is restored in a `finally`.
  let err;
  try {
    // A SECOND OWNER FIRST: `clara._tf_guard_last_owner` refuses to remove the last active owner,
    // and the state this cell needs is "the member who instructed Clara has left", not "the firm
    // has no owner".
    await rootQuery(
      "update clara.firm_memberships set role = 'owner' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.bob]);
    await rootQuery(
      "update clara.firm_memberships set status = 'removed' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.alice]);
    err = await caught(() => wake12(sc.s,
      { client: sc.client, entry: sc.entry, target: sc.target }));
  } finally {
    await rootQuery(
      "update clara.firm_memberships set status = 'active' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.alice]);
    await rootQuery(
      "update clara.firm_memberships set role = 'bookkeeper' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.bob]);
  }
  const still = await rootQuery(
    "select status from clara.firm_memberships where firm_id = $1 and user_id = $2",
    [sc.firm, sc.alice]);
  assert.equal(still.rows[0].status, "active", "the membership mutant was not restored");

  assert.ok(err, "a lapsed member's standing instruction still configured a schedule");
  assert.equal(err.code, "CLR03");
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "wake_authority_lapsed");
  assert.equal(d.lane, "wake");
  assert.equal(d.instruction_id, si.instruction_id,
    "the refusal does not name the instruction whose author lapsed");
  assert.equal(d.standing_remedy, "clara.record_firm_standing_instruction",
    "the refusal does not name the door another member uses to re-record it");
  assert.equal(d.axis, "membership",
    "the refusal does not say WHICH half of the authority lapsed");

  assert.deepEqual(await footprint(sc), before, "the refused wake left something durable behind");
});

test("p1050.wake.replay_after_withdrawal -- a clocked task that ALREADY SUCCEEDED gets its own "
  + "receipt back when it asks again, even though the firm has withdrawn the instruction in "
  + "between: a lost response must never turn into a refusal that says the schedule was never "
  + "configured, which is the very defect `clara._reserve_op` exists to prevent",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050replay");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  await record(sc.alice, { opKey: opk("p1050-replay-rec") });

  // THE WAKE SUCCEEDS. This is the state that did not exist before this ticket: until #1050 the
  // clocked lane always refused, so there was never a completed receipt to replay.
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(first.schedule_id, `the clocked lane refused under a live instruction: ${JSON.stringify(first)}`);

  // THE FIRM TAKES THE INSTRUCTION BACK, between the write and the reply the caller lost.
  await withdraw(sc.alice, { opKey: opk("p1050-replay-wd") });
  assert.equal(await liveRow(sc.firm), null, "the withdrawal did not close the instruction");

  // THE SAME TASK ASKS AGAIN. `clara.wake_establish_prepayment_schedule` derives its key from
  // (task, verb, subject), so this is the production belt's own replay, not a key this cell chose.
  const again = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(again.schedule_id, first.schedule_id,
    "the replayed task was not given back the schedule it had already configured");
  assert.equal(again.plan_id, first.plan_id);

  const n = await rootQuery(
    "select count(*)::int as n from clara.prepayment_schedules where client_id = $1", [sc.client]);
  assert.equal(n.rows[0].n, 1, "the replay configured a SECOND schedule");
});

test("p1050.wake.demoted -- a member who is still ACTIVE but no longer ranks as a bookkeeper has "
  + "lost the authority the plan needs every month, so the clocked lane refuses at configuration "
  + "time rather than writing a plan whose every occurrence would answer CLR04 insufficient_role",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050demoted");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const si = await record(sc.alice, { opKey: opk("p1050-demoted") });

  const before = await footprint(sc);

  // THE DEMOTION IS COMMITTED, for the reason the lapsed cell states: the wake door runs on its
  // own `clara_wake_interactive` connection, so a role change held uncommitted would be invisible
  // to it. Alice stays an ACTIVE member throughout -- this cell is about RANK and nothing else.
  // A second owner goes first, because `clara._tf_guard_last_owner` refuses to leave the firm
  // without one.
  let err;
  try {
    await rootQuery(
      "update clara.firm_memberships set role = 'owner' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.bob]);
    await rootQuery(
      "update clara.firm_memberships set role = 'viewer' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.alice]);
    const still = await rootQuery(
      "select status, role from clara.firm_memberships where firm_id = $1 and user_id = $2",
      [sc.firm, sc.alice]);
    assert.equal(still.rows[0].status, "active",
      "this cell is about rank: the member must still be ACTIVE when the wake runs");
    assert.equal(still.rows[0].role, "viewer");
    err = await caught(() => wake12(sc.s,
      { client: sc.client, entry: sc.entry, target: sc.target }));
  } finally {
    await rootQuery(
      "update clara.firm_memberships set role = 'owner' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.alice]);
    await rootQuery(
      "update clara.firm_memberships set role = 'bookkeeper' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.bob]);
  }
  const restored = await rootQuery(
    "select role from clara.firm_memberships where firm_id = $1 and user_id = $2",
    [sc.firm, sc.alice]);
  assert.equal(restored.rows[0].role, "owner", "the role mutant was not restored");

  assert.ok(err,
    "a demoted member's standing instruction still configured a plan that could never post");
  assert.equal(err.code, "CLR03");
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "wake_authority_lapsed",
    "a lapsed authority keeps its own token whichever half of it lapsed");
  assert.equal(d.axis, "role_rank",
    "the refusal does not say that it is the RANK, not the membership, that lapsed");
  assert.equal(d.lane, "wake");
  assert.equal(d.instruction_id, si.instruction_id);
  assert.equal(d.standing_remedy, "clara.record_firm_standing_instruction");

  assert.deepEqual(await footprint(sc), before, "the refused wake left something durable behind");
});

// ---------------------------------------------------------------------------------------------
// #1036's AC2 — THE PLAN A CLOCKED RUN WROTE ACTUALLY POSTS, AND IT POSTS AS THE MEMBER.
//
// This is the cell that could not exist before this ticket: the whole reason the lane refused was
// that a plan written on it could never admit a single occurrence. Admission is driven for real,
// through `clara._plan_admit_occurrence`, which hands the plan's `authorised_by` to
// `clara.admit_journal_work` -- the door that rechecks membership, activity, role rank and client
// status every month.
// ---------------------------------------------------------------------------------------------
test("p1050.admit.under_member -- the clocked lane's plan ADMITS its first occurrence and the Work "
  + "is initiated by the RECORDING MEMBER, not by the agent; once that membership is removed the "
  + "next occurrence is refused BY NAME and no Work is written for it (#1036 AC2)",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050admit");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  await record(sc.alice, { opKey: opk("p1050-admit") });

  const r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(r.schedule_id, `the clocked lane refused: ${JSON.stringify(r)}`);
  assert.ok(r.next_occurrences.length >= 2,
    "this scene must yield at least two occurrences for the lapse half of this cell");

  const admit = (due) => rootQuery(
    "select clara._plan_admit_occurrence($1::uuid,$2::date,'primary','p1050') as r",
    [r.plan_id, due]).then((x) => x.rows[0].r);

  const first = await admit(r.next_occurrences[0].due_date);
  assert.equal(first.admitted, true,
    `the clocked lane's plan could not admit its own first occurrence: ${JSON.stringify(first)}`);
  assert.ok(first.work_id, "an admitted occurrence with no Work");

  const work = (await rootQuery(
    "select initiator, client_id from clara.accounting_work where id = $1", [first.work_id])).rows[0];
  assert.equal(work.initiator, sc.alice,
    "the month's Work is not initiated by the member whose standing instruction authorised it");
  assert.notEqual(work.initiator, AGENT, "the month's Work is initiated by the agent");
  assert.equal(work.client_id, sc.client);

  // ---- THE LAPSE. Committed, and restored in a `finally` -- the admission door reads the
  //      membership on its own connection, exactly as the wake door does.
  let second;
  try {
    await rootQuery(
      "update clara.firm_memberships set role = 'owner' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.bob]);
    await rootQuery(
      "update clara.firm_memberships set status = 'removed' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.alice]);
    second = await admit(r.next_occurrences[1].due_date);
  } finally {
    await rootQuery(
      "update clara.firm_memberships set status = 'active' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.alice]);
    await rootQuery(
      "update clara.firm_memberships set role = 'bookkeeper' where firm_id = $1 and user_id = $2",
      [sc.firm, sc.bob]);
  }

  assert.equal(second.admitted, false,
    "a plan whose directing human has left the firm still posted a month's Work");
  assert.ok(second.reason && second.reason !== "unclassified",
    `the refusal is not named: ${JSON.stringify(second)}`);
  assert.equal(second.work_id, undefined, "a refused occurrence carried a Work id");
  // The occurrence keeps its own refusal on the plan's append-only ledger, which is how a person
  // reading Needs you finds out WHY the month did not post.
  const occ = (await rootQuery(
    "select outcome from clara.accounting_plan_occurrences where id = $1",
    [second.occurrence_id])).rows[0];
  assert.equal(occ.outcome.state, "refused");
  assert.equal(occ.outcome.reason, second.reason);

  // …AND THE PLAN RESUMES once the member is back: the instruction did not need re-recording, and
  // the month that was refused is not lost.
  const retry = await admit(r.next_occurrences[1].due_date);
  assert.equal(retry.admitted, true,
    `the plan did not resume after its directing human was restored: ${JSON.stringify(retry)}`);
});

// ---------------------------------------------------------------------------------------------
// #1036's AC4 — THE TRAIL. Instruction, wake and plan are linked, and a reader needs no join it
// cannot make: the plan's own `authority_ref` carries BOTH the instruction row and the clocked
// task, and the audit log carries the three acts with the right actor on each.
// ---------------------------------------------------------------------------------------------
test("p1050.trail -- the instruction, the clocked run and the plan are one chain: the plan's "
  + "authority_ref names the instruction row AND the wake task, the audit log carries the "
  + "recording act under the MEMBER, the plan creation under the MEMBER, and the schedule write "
  + "under the AGENT",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050trail");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const si = await record(sc.alice, { opKey: opk("p1050-trail") });
  const r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(r.schedule_id, `the clocked lane refused: ${JSON.stringify(r)}`);

  const plan0 = (await rootQuery(
    "select authority_kind, authority_ref, authorised_by from clara.accounting_plans where id = $1",
    [r.plan_id])).rows[0];

  const audits = await rootQuery(
    `select fn, actor, args, via_wake_kind from clara.audit_log
      where firm_id = $1 and fn in ('record_firm_standing_instruction',
        'create_accounting_plan', 'create_prepayment_schedule')
      order by at, id`, [sc.firm]);
  const byAction = (a) => audits.rows.filter((x) => x.fn === a);

  const recorded = byAction("record_firm_standing_instruction");
  assert.equal(recorded.length, 1, "the recording act is not in the audit log exactly once");
  assert.equal(recorded[0].actor, sc.alice, "the recording act does not name the member");
  assert.equal(recorded[0].args.instruction_id, si.instruction_id);
  assert.equal(recorded[0].args.instruction_key, KEY);

  const planned = byAction("create_accounting_plan");
  assert.equal(planned.length, 1, "the plan creation is not in the audit log exactly once");
  assert.equal(planned[0].actor, sc.alice,
    "the plan creation is not attributed to the member whose instruction authorised it");
  assert.equal(planned[0].args.plan, r.plan_id);
  assert.equal(planned[0].args.authority.kind, "firm_standing_instruction");
  assert.equal(planned[0].args.authority.id, si.instruction_id,
    "the plan's audit row does not cite the instruction");
  assert.equal(planned[0].args.authority.task_id, sc.s.task,
    "the plan's audit row does not name the clocked task that acted");
  assert.equal(planned[0].args.via, "create_prepayment_schedule_for",
    "a reader cannot tell which entrance wrote this plan");

  const scheduled = byAction("create_prepayment_schedule");
  assert.equal(scheduled.length, 1, "the schedule write is not in the audit log exactly once");
  assert.equal(scheduled[0].actor, AGENT,
    "the schedule write is not attributed to the unattended run that performed it");
  assert.equal(scheduled[0].args.schedule, r.schedule_id);
  assert.equal(scheduled[0].args.plan, r.plan_id);

  assert.equal(scheduled[0].via_wake_kind, "close_prep",
    "the schedule's audit row does not say a CLOCKED run wrote it -- without via_wake_kind the "
    + "only thing telling this from a typed configuration is an actor id a reader must recognise");
  assert.equal(recorded[0].via_wake_kind, null, "the recording act was attributed to a wake");
  assert.equal(planned[0].via_wake_kind, null,
    "the plan creation is the MEMBER's act and must not be stamped with a wake kind");

  // THE TASK THE PLAN CITES IS A REAL CLOCKED RUN of this firm and client, so the chain closes on
  // rows rather than on a string the wrapper happened to echo. (`clara.agent_act_receipts` is NOT
  // the link here: `clara._close_wake_ctx` writes none for this verb, measured -- the receipts in
  // that relation belong to the close-limb verbs that mint them themselves.)
  const task = (await rootQuery(
    "select kind, firm_id, client_id from clara.agent_tasks where id = $1",
    [plan0.authority_ref.task_id])).rows[0];
  assert.ok(task, "the plan cites a clocked task this database does not hold");
  assert.equal(task.kind, "close_prep");
  assert.equal(task.firm_id, sc.firm);
  assert.equal(task.client_id, sc.client);

  // AND THE PLAN ROW ITSELF IS THE WHOLE CHAIN, readable with no audit log at all.
  assert.deepEqual(
    [plan0.authority_kind, plan0.authority_ref.kind, plan0.authority_ref.id,
      plan0.authority_ref.task_id, plan0.authorised_by],
    ["standing_instruction", "firm_standing_instruction", si.instruction_id, sc.s.task, sc.alice]);
});

// ---------------------------------------------------------------------------------------------
// A STANDING INSTRUCTION THAT CANNOT BE TAKEN BACK IS NOT AN INSTRUCTION, IT IS A SWITCH.
//
// The relation carries the withdrawal interval from §A, and the ruling's own words are "until
// somebody withdraws it". A firm that could only ever record one would have delegated to Clara
// permanently on its first try, which is the opposite of what a standing instruction is.
// ---------------------------------------------------------------------------------------------
test("p1050.withdraw.closes -- a named member withdraws the firm's standing instruction through "
  + "the real door; the row keeps its interval and gains the withdrawal stamp, the clocked lane "
  + "closes again with the SAME wake_authority_absent it gave before anything was instructed, and "
  + "re-recording re-opens it",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050withdraw");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const si = await record(sc.alice, { opKey: opk("p1050-withdraw-rec") });

  const WHY = "The firm will configure prepayment schedules by hand this year.";
  const key = opk("p1050-withdraw");
  const w = await withdraw(sc.alice, { reason: WHY, opKey: key });
  assert.equal(w.instruction_id, si.instruction_id, "the withdrawal named a different row");
  assert.equal(w.active, false);

  const row = (await rootQuery(
    "select * from clara.firm_standing_instructions where id = $1", [si.instruction_id])).rows[0];
  assert.equal(row.withdrawn_by, sc.alice, "the withdrawal does not name the member who made it");
  assert.ok(row.withdrawn_at, "the withdrawal left no stamp");
  assert.equal(row.withdraw_reason, WHY, "a withdrawal owes its own sentence");
  assert.equal(row.recorded_by, sc.alice, "the withdrawal rewrote the recording half of the row");
  assert.equal(row.reason, REASON, "the withdrawal rewrote the instruction's own reason");
  assert.equal(await liveRow(sc.firm), null, "the firm still carries a live instruction");

  // A REPLAY under the same key is the same withdrawal, not a second one.
  const again = await withdraw(sc.alice, { reason: WHY, opKey: key });
  assert.equal(again.instruction_id, w.instruction_id);

  // THE LANE CLOSES, with the sentence a firm that never instructed anything gets.
  const err = await caught(() => wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: sc.target }));
  assert.ok(err, "a withdrawn standing instruction still opened the clocked lane");
  assert.equal(err.code, "CLR03");
  assert.equal(JSON.parse(err.detail).reason, "wake_authority_absent");
  assert.equal(JSON.parse(err.detail).standing_remedy, "clara.record_firm_standing_instruction");
  const n = await rootQuery(
    "select count(*)::int as n from clara.prepayment_schedules where client_id = $1", [sc.client]);
  assert.equal(n.rows[0].n, 0, "the refused wake configured a schedule anyway");

  // AND IT RE-OPENS. The withdrawn row is kept forever; a fresh one stands beside it.
  const si2 = await record(sc.alice, { opKey: opk("p1050-withdraw-again") });
  assert.notEqual(si2.instruction_id, si.instruction_id,
    "re-recording resurrected the withdrawn row instead of minting a new one");
  const r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(r.schedule_id, `the lane did not re-open: ${JSON.stringify(r)}`);
  const plan = (await rootQuery(
    "select authority_ref from clara.accounting_plans where id = $1", [r.plan_id])).rows[0];
  assert.equal(plan.authority_ref.id, si2.instruction_id,
    "the new plan cites the WITHDRAWN instruction rather than the one in force");

  const all = await rootQuery(
    "select count(*)::int as n from clara.firm_standing_instructions where firm_id = $1", [sc.firm]);
  assert.equal(all.rows[0].n, 2, "the firm's instruction history was overwritten rather than kept");
});

test("p1050.withdraw.refusals -- withdrawing what nobody instructed is refused BY NAME, a blank "
  + "sentence is refused, an unknown key is refused, and both doors are ADMIN-floored: a "
  + "bookkeeper of the firm is refused by rank at each of them",
async (t) => {
  if (await standingGate(t)) return;
  const sc = await prepaidScene("p1050floor");

  const nothing = await caught(() => withdraw(sc.alice,
    { reason: "nothing to take back", opKey: opk("p1050-nothing") }));
  assert.ok(nothing, "a firm with no standing instruction withdrew one");
  assert.equal(nothing.code, "CLR11");
  assert.equal(JSON.parse(nothing.detail).reason, "firm_standing_instruction_absent");

  await record(sc.alice, { opKey: opk("p1050-floor-rec") });

  const blank = await caught(() => withdraw(sc.alice,
    { reason: "   ", opKey: opk("p1050-blank") }));
  assert.ok(blank, "a withdrawal with no sentence was accepted");
  assert.deepEqual([JSON.parse(blank.detail).reason, JSON.parse(blank.detail).axis],
    ["firm_standing_instruction_invalid", "withdraw_reason_missing"]);

  const unknown = await caught(() => withdraw(sc.alice,
    { key: "let_clara_do_anything", reason: "x", opKey: opk("p1050-unknownkey") }));
  assert.ok(unknown, "an unknown instruction key was accepted");
  assert.deepEqual([JSON.parse(unknown.detail).reason, JSON.parse(unknown.detail).axis],
    ["firm_standing_instruction_invalid", "instruction_key_unknown"]);

  // THE FLOOR. Standing an act is a firm-level governance act, so it sits at admin even though
  // the act it authorises (configuring one client's amortisation) is bookkeeper work. Bob is a
  // bookkeeper of this firm.
  const bobRecords = await caught(() => record(sc.bob, { opKey: opk("p1050-bob-rec") }));
  assert.ok(bobRecords, "a bookkeeper recorded a firm-level standing instruction");
  const bobWithdraws = await caught(() => withdraw(sc.bob,
    { reason: "x", opKey: opk("p1050-bob-wd") }));
  assert.ok(bobWithdraws, "a bookkeeper withdrew a firm-level standing instruction");
  for (const e of [bobRecords, bobWithdraws]) {
    assert.equal(e.code, "CLR04", `a rank refusal is CLR04, got ${e.code}: ${e.message}`);
  }
  // …and the instruction is untouched by either refused attempt.
  const row = await liveRow(sc.firm);
  assert.ok(row && row.withdrawn_at === null, "a refused attempt moved the instruction");
});

// ---------------------------------------------------------------------------------------------
// THE TWO DOORS' SHAPE — the ACL claim this ticket rests on, read off the live catalog.
// An instruction a machine recorded would name nobody, which is the whole point of the ticket.
// ---------------------------------------------------------------------------------------------
test("p1050.doors.shape -- both doors are clara_authenticated's alone (no clara_runtime, no agent "
  + "read role, no wake lane, no PUBLIC), security definer, owned by clara_fn_owner; neither has "
  + "an OBO twin or a wake wrapper anywhere in the catalog; and the relation itself is readable "
  + "only by the human lane and writable by nobody but the doors",
async (t) => {
  if (await standingGate(t)) return;

  const sigs = [
    "clara.record_firm_standing_instruction(text,text,text)",
    "clara.withdraw_firm_standing_instruction(text,text,text)",
  ];
  for (const sig of sigs) {
    const row = (await rootQuery(
      `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl,
              pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef
         from pg_proc p where p.oid = to_regprocedure($1)`, [sig])).rows;
    assert.equal(row.length, 1, `${sig} does not resolve at its exact signature`);
    assert.match(row[0].acl, /clara_authenticated=X\/clara_fn_owner/, `${sig}: the human lane lost EXECUTE`);
    assert.doesNotMatch(row[0].acl,
      /clara_runtime=|clara_agent_ro=|clara_agent_chat_ro=|clara_wake_|=X\/clara_fn_owner\|=X/,
      `${sig}: a machine lane can reach a door only a person may use`);
    assert.equal(row[0].owner, "clara_fn_owner");
    assert.equal(row[0].secdef, true);
  }

  // NO TWIN AND NO WRAPPER, by NAME across the whole schema -- the stronger claim.
  const kin = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and (p.proname like '%firm_standing_instruction%_for'
             or p.proname like 'wake_%firm_standing_instruction%'
             or p.proname like '%firm_standing_instruction%_wake')`);
  assert.deepEqual(kin.rows, [],
    `a machine twin of the standing-instruction doors exists: ${JSON.stringify(kin.rows)}`);

  // THE RELATION. Forced RLS, SELECT for the human lane, no write grant to anybody, no grant at
  // all to any machine role.
  const rel = (await rootQuery(
    `select c.relrowsecurity as rls, c.relforcerowsecurity as forced,
            has_table_privilege('clara_authenticated','clara.firm_standing_instructions','SELECT') as h_sel,
            has_table_privilege('clara_authenticated','clara.firm_standing_instructions','INSERT') as h_ins,
            has_table_privilege('clara_authenticated','clara.firm_standing_instructions','UPDATE') as h_upd,
            has_table_privilege('clara_authenticated','clara.firm_standing_instructions','DELETE') as h_del,
            has_table_privilege('clara_runtime','clara.firm_standing_instructions','SELECT') as rt_sel,
            has_table_privilege('clara_agent_ro','clara.firm_standing_instructions','SELECT') as ag_sel,
            has_table_privilege('public','clara.firm_standing_instructions','SELECT') as pub_sel
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'firm_standing_instructions'`)).rows[0];
  assert.deepEqual(
    [rel.rls, rel.forced, rel.h_sel, rel.h_ins, rel.h_upd, rel.h_del, rel.rt_sel, rel.ag_sel, rel.pub_sel],
    [true, true, true, false, false, false, false, false, false],
    "the standing-instruction relation's posture moved");
});
