// #1147 [0362_standing_instruction_agent_read.sql] — THE FIRM STANDING INSTRUCTION'S THREE OPEN
// HALVES, closed as far as they were given: a chat read door, the plans a withdrawal leaves
// posting, and the deferred-revenue twin held by a census rather than by a comment.
//
// WHAT #1050 LEFT. Migration 0338 shipped the firm-level standing instruction whole on the HUMAN
// lane: `clara.record_firm_standing_instruction` and `clara.withdraw_firm_standing_instruction`
// are `clara_authenticated`-only by design (an instruction a machine recorded would name nobody),
// the relation grants nothing to any machine role, and 0338's own tail asserts that. Three halves
// #1050 was never given stayed open, and this file drives the two that are bounded:
//
//   1. THE CHAT MODEL HAS NO READ. A model asked "does this firm let Clara do this?" had no door
//      and no relation it may read. §A of 0362 mints ONE — `clara.wake_get_firm_standing_instruction`
//      — on 0320's / 0352's / 0353's own shape: EXECUTE to `clara_agent_ro` alone, one
//      `clara.wake_fn_allowlist` row for the `interactive` kind, firm-scoped through the CALLER'S
//      OWN credential rather than a firm argument.
//   2. WITHDRAWAL DOES NOT NAME ITS CONSEQUENCE. The plans the instruction already authorised keep
//      posting under the member who authorised them (#940's ruling for a retired roster enrolment,
//      restated), and neither the door's answer nor the settings card said so. §B adds ONE key to
//      the answer: `plans_still_posting`. WHAT WITHDRAWAL DOES TO A PLAN DOES NOT CHANGE HERE —
//      whether it should also pause them is an owner ruling #1050 was not given and #1147 records
//      rather than takes.
//   3. THE DEFERRED-REVENUE TWIN HAS NO WAKE LANE. `clara._prepayment_schedule_core` admits
//      ('human','obo','wake'); `clara._revenue_recognition_core` admits ('human','obo') and no wake
//      wrapper for it exists. 0338 states that asymmetry in a header comment. This file holds it
//      with a CENSUS instead, in the shape this estate already uses for a watched duplication
//      (`p1137.obo.plan_step_parity`): read off the LIVE catalog, failing the day one side is
//      widened without the other.
//
// THE SEAMS, named up front (WORK-ORDER rule 4):
//   S1. `clara.wake_get_firm_standing_instruction(p_instruction_key text)` — the model lane's door,
//       driven on a REAL least-privileged connection (`clara_agent_ro` + a real `interactive` wake
//       credential), never as `postgres` and never by calling a core directly.
//   S2. `clara.withdraw_firm_standing_instruction(p_instruction_key, p_reason, p_op_key)` — driven
//       through `humanQuery` as a real signed-in admin, with a live plan present and with none.
//   S3. The LIVE CATALOG — the relation's grants, the door's ACL, the allowlist, and the two
//       schedule cores' closed lane sets. Structural by necessity: the claims are about what a
//       LATER file may not do, which no behavioural cell written today can drive (WORK-ORDER rule
//       4's own carve-out for a repo-documented structural cell).
//
// WHAT IT DELIBERATELY DOES NOT PROVE. The whole of #1050's behaviour — that is
// `prepayment-close-standing-instruction.test.mjs`, which runs unchanged except for the ONE roster
// this file's new read joins (`p1050.doors.shape`).
//
// FRONTIER-GATED on the `standing_instruction_agent_read$` stable stem, never a number — numbers
// are claimed at merge (packages/db/README.md). A package-wide sweep preloads this file's
// pre-integration gate module and skips LOUDLY on a chain below 0362; a FOCUSED run sets nothing
// and FAILS, because a skip is not evidence.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { humanQuery, wakeQuery, roleQuery, rootQuery, assertRaises, ROLES, PG, opk }
  from "./rig-helpers.mjs";
import { mintWake5 } from "./wave-a-fixtures.mjs";
import { ensurePrepay, prepayGate, prepaidScene, recordPeriod, wake12, caught }
  from "./f-a4-pr2a-fixtures.mjs";

const STEM = "standing_instruction_agent_read$";
const READ_DOOR = "wake_get_firm_standing_instruction";

/** The ONE instruction key 0338 mints; the closed set is one member today. */
const KEY = "prepayment_schedule_at_close";
const REASON = "p1147: our subscriptions are annual and we close monthly.";

let skipped = 0;
const markSkip = () => { skipped += 1; };
let lane = null;

before(async () => { await ensurePrepay(() => {}); });
after(async () => {
  if (skipped > 0) console.log(`p1147: ${skipped} cell(s) skipped -- probed at the live catalog`);
});

async function lanePresent() {
  if (lane !== null) return lane;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  lane = Number(r.rows[0].n) > 0;
  return lane;
}

/** The armed skip: a package sweep on a pre-0362 chain skips LOUDLY; a focused run FAILS. */
async function readGate(t) {
  if (prepayGate(t, markSkip)) return true;
  if (!(await lanePresent())) {
    if (process.env.CLARA_ALLOW_MISSING_STANDING_INSTRUCTION_AGENT_READ !== "1") {
      throw new Error(
        `#1147: no migration matching /${STEM}/ is applied to this database and `
        + "CLARA_ALLOW_MISSING_STANDING_INSTRUCTION_AGENT_READ is unset -- this is a FOCUSED run "
        + "and must fail loudly rather than skip. Apply "
        + "0362_standing_instruction_agent_read.sql, or preload "
        + "./tests/standing-instruction-agent-read-preintegration-gate.mjs for an estate sweep "
        + "against a pre-0362 chain.");
    }
    markSkip();
    t.skip("#1147 (0362_standing_instruction_agent_read) not applied -- probed at the live catalog");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// The two lanes' calls, spelled once.
// ---------------------------------------------------------------------------------------------

/** 0338's recording door, as a real signed-in member on the governed human path. */
function record(sub, { key = KEY, reason = REASON, opKey } = {}) {
  return humanQuery(sub, "select clara.record_firm_standing_instruction($1,$2,$3) as r",
    [key, reason, opKey ?? opk("p1147-record")]).then((r) => r.rows[0].r);
}

/** 0338 §G's withdraw door, recut by 0362 §B, on the same governed human path. */
function withdraw(sub, { key = KEY, reason = "p1147: the firm takes it back", opKey } = {}) {
  return humanQuery(sub, "select clara.withdraw_firm_standing_instruction($1,$2,$3) as r",
    [key, reason, opKey ?? opk("p1147-withdraw")]).then((r) => r.rows[0].r);
}

/** An `interactive` wake credential — what the chat lane's `readScoped` mints: plain, on behalf of
 *  the initiating human, no client pin. */
function chatCredential(firm, onBehalfOf) {
  return mintWake5({ kind: "interactive", firm, onBehalfOf });
}

/** THE MODEL LANE'S DOOR, driven on the READ role the chat lane's read pool SET ROLEs to, under a
 *  real wake credential bound txn-locally. Never as root, never by calling a body directly. */
function readInstruction(secret, key = KEY) {
  return wakeQuery(ROLES.agentRo, secret,
    `select clara.${READ_DOOR}(p_instruction_key => $1) as result`, [key])
    .then((r) => r.rows[0].result);
}

// =============================================================================================
// S1 — THE MODEL LANE CAN ASK WHAT THE FIRM HAS INSTRUCTED, AND IS ANSWERED THE FIRM'S OWN WORDS.
// =============================================================================================

test("p1147.read.live -- under a live standing instruction the model lane's door answers the key, "
  + "the firm's own sentence, the member who recorded it and when, driven on a real clara_agent_ro "
  + "connection under an interactive wake credential rather than as postgres",
async (t) => {
  if (await readGate(t)) return;
  const sc = await prepaidScene("p1147live");

  // BEFORE the instruction exists the door must already answer -- absence is a STATE, not an
  // error (law 2), and a model that met a raise here would have to guess what it meant.
  const { secret } = await chatCredential(sc.firm, sc.bob);
  const before = await readInstruction(secret);
  assert.equal(before.active, false, `a firm that instructed nothing reads active:false: ${JSON.stringify(before)}`);
  assert.equal(before.instruction_key, KEY);
  assert.equal(before.reason, null);
  assert.equal(before.recorded_by, null);
  assert.equal(before.recorded_at, null);

  // A NAMED MEMBER records it through the real human door.
  const si = await record(sc.alice, { opKey: opk("p1147-live") });
  assert.ok(si.instruction_id, "the recording door answered with no instruction");

  const { secret: s2 } = await chatCredential(sc.firm, sc.bob);
  const after = await readInstruction(s2);
  assert.equal(after.active, true, `the door does not see the live instruction: ${JSON.stringify(after)}`);
  assert.equal(after.instruction_key, KEY);
  // THE FIRM'S OWN SENTENCE, verbatim: the row is the record of record and the reason is the whole
  // point of the relation (0338 §A). A projection that dropped it would answer "yes" with no basis.
  assert.equal(after.reason, REASON, "the reason sentence is not projected");
  assert.equal(after.recorded_by, sc.alice, "the read does not name the member who recorded it");
  assert.ok(typeof after.recorded_at === "string" && after.recorded_at.length > 0,
    `the read carries no recorded_at: ${JSON.stringify(after)}`);

  // …AND THE ROW IS WHAT IT PROJECTED, read independently as root.
  const row = (await rootQuery(
    `select id, reason, recorded_by, recorded_at from clara.firm_standing_instructions
      where firm_id = $1 and instruction_key = $2 and withdrawn_at is null`, [sc.firm, KEY])).rows[0];
  assert.ok(row, "the door answered active:true with no live row behind it");
  assert.equal(row.recorded_by, after.recorded_by);
  assert.equal(row.reason, after.reason);

  // A WITHDRAWAL CLOSES THE READ: the door answers the LIVE instruction, and a withdrawn row is
  // the firm's history, not its standing.
  await withdraw(sc.alice, { opKey: opk("p1147-live-wd") });
  const { secret: s3 } = await chatCredential(sc.firm, sc.bob);
  const closed = await readInstruction(s3);
  assert.equal(closed.active, false, "the door still reports a withdrawn instruction as standing");
  assert.equal(closed.reason, null, "a withdrawn instruction's sentence still reaches the model lane");
});

// =============================================================================================
// S1b — AND IT IS NOT AN EXISTENCE ORACLE FOR ANOTHER FIRM'S ROW.
// =============================================================================================

test("p1147.read.no_oracle -- a firm that has instructed nothing and a caller whose SIBLING firm "
  + "holds a live instruction are answered IDENTICALLY, byte for byte: the door takes no firm "
  + "argument at all, so there is nothing to probe with",
async (t) => {
  if (await readGate(t)) return;
  const sc = await prepaidScene("p1147oracle");

  // FIRM A INSTRUCTS. This is the row the other two firms must not be able to detect.
  const si = await record(sc.alice, { opKey: opk("p1147-oracle") });
  assert.ok(si.instruction_id, "the recording door answered with no instruction");

  // FIRM B — a sibling firm of the same estate, whose OWNER is a bookkeeper+ and therefore a
  // lawful on-behalf-of human. Firm A's live row exists while this read runs.
  const { secret: sB } = await chatCredential(sc.w.firms.B, sc.w.users.dave);
  const answerB = await readInstruction(sB);

  // FIRM S — a third firm, also with nothing of its own. Its answer is the CONTROL: "absent"
  // with no neighbour holding one is what "absent" has to look like.
  const { secret: sS } = await chatCredential(sc.w.firms.S, sc.w.users.erin);
  const answerS = await readInstruction(sS);

  assert.deepEqual(answerB, answerS,
    `firm B's answer differs from a firm with no neighbour holding one -- the door is an oracle: `
    + `${JSON.stringify(answerB)} vs ${JSON.stringify(answerS)}`);
  assert.equal(answerB.active, false, "a sibling firm is told firm A's instruction stands");
  assert.equal(answerB.reason, null, "another firm's sentence reached this caller");
  assert.equal(answerB.recorded_by, null, "another firm's member was named to this caller");
  assert.equal(answerB.recorded_at, null, "another firm's timestamp reached this caller");

  // …AND FIRM A ITSELF STILL SEES ITS OWN. Without this half the cell above would pass on a door
  // that answers `active:false` to everybody.
  const { secret: sA } = await chatCredential(sc.firm, sc.bob);
  const answerA = await readInstruction(sA);
  assert.equal(answerA.active, true,
    `the firm that instructed is no longer told so: ${JSON.stringify(answerA)}`);
  assert.equal(answerA.recorded_by, sc.alice);
});

// =============================================================================================
// S1c — THE CEREMONY: what the read door asks for before it reads anything, and who may ask.
// =============================================================================================

const READ_SQL = `select clara.${READ_DOOR}(p_instruction_key => $1) as result`;

test("p1147.read.acl -- clara_agent_ro alone holds the read door; every other application role is "
  + "refused 42501 on it; the relation itself stays unreadable by every machine role; and the two "
  + "WRITE doors are still closed to the machine lane, driven rather than read off the catalog",
async (t) => {
  if (await readGate(t)) return;
  const sc = await prepaidScene("p1147acl");

  // DRIVEN: the role that is supposed to hold it does.
  const { secret } = await chatCredential(sc.firm, sc.bob);
  assert.ok(await readInstruction(secret), "clara_agent_ro cannot call the read door");

  // …and nobody else can, including the WRITE pool and the human lane (a member reads the
  // relation directly under RLS and needs no door at all).
  for (const role of [ROLES.runtime, ROLES.authenticated, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    await assertRaises(PG.insufficientPrivilege,
      () => roleQuery(role, READ_SQL, [KEY]), `${role} on ${READ_DOOR}`);
  }

  // THE RELATION IS STILL NO MACHINE ROLE'S TO READ. This is 0338's own tail assertion, which
  // #1147's acceptance criterion asks be proved to still hold: the door exists PRECISELY because
  // the machine lane holds nothing here, so if this ever flipped the door would be redundant and
  // the wall would be gone at the same moment.
  const rel = (await rootQuery(
    `select has_table_privilege('clara_authenticated','clara.firm_standing_instructions','SELECT') as human,
            has_table_privilege('clara_agent_ro','clara.firm_standing_instructions','SELECT') as agent,
            has_table_privilege('clara_runtime','clara.firm_standing_instructions','SELECT') as runtime,
            has_table_privilege('clara_wake_interactive','clara.firm_standing_instructions','SELECT') as wakei,
            has_table_privilege('clara_wake_proactive','clara.firm_standing_instructions','SELECT') as wakep,
            has_table_privilege('public','clara.firm_standing_instructions','SELECT') as pub,
            has_table_privilege('clara_authenticated','clara.firm_standing_instructions','INSERT') as h_ins,
            has_table_privilege('clara_authenticated','clara.firm_standing_instructions','UPDATE') as h_upd,
            has_table_privilege('clara_authenticated','clara.firm_standing_instructions','DELETE') as h_del`)).rows[0];
  assert.deepEqual(
    [rel.human, rel.agent, rel.runtime, rel.wakei, rel.wakep, rel.pub, rel.h_ins, rel.h_upd, rel.h_del],
    [true, false, false, false, false, false, false, false, false],
    "the standing-instruction relation's grants moved -- 0338's tail assertion no longer holds");

  // AND NO ACT CAME WITH THE READ. Giving the instruction and taking it back are firm governance
  // and must NAME the member who did it, which is #1050's whole point.
  for (const door of ["record_firm_standing_instruction", "withdraw_firm_standing_instruction"]) {
    for (const role of [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      await assertRaises(PG.insufficientPrivilege,
        () => roleQuery(role, `select clara.${door}($1,$2,$3)`, [KEY, "never", opk("p1147-never")]),
        `${role} on the ${door} ACT`);
    }
  }
});

test("p1147.read.ceremony -- the read door refuses without a credential, refuses a wake kind its "
  + "one allowlist row does not name, refuses a credential that names no person, and refuses an "
  + "instruction key outside 0338's closed set in 0338's own vocabulary",
async (t) => {
  if (await readGate(t)) return;
  const sc = await prepaidScene("p1147ceremony");
  await record(sc.alice, { opKey: opk("p1147-ceremony") });

  // (a) NO CREDENTIAL AT ALL: the read role alone proves nothing.
  const bare = await caught(() => roleQuery(ROLES.agentRo, READ_SQL, [KEY]));
  assert.ok(bare, "the read door answered a connection carrying no wake credential");
  assert.equal(bare.code, "CLR03", `expected CLR03 without a credential, got ${bare.code}: ${bare.message}`);

  // (b) A REAL CREDENTIAL OF A KIND THE ALLOWLIST DOES NOT NAME. `close_prep` is the clocked lane
  //     that RESOLVES this instruction inside clara._prepayment_schedule_core (0338 §F) and has no
  //     business ASKING about the firm's governance posture with nobody at the keyboard. The
  //     credential is real, minted for a real task by the real minter.
  const wrongKind = await caught(() => readInstruction(sc.s.secret));
  assert.ok(wrongKind, "a close_prep credential reached a door allowlisted for `interactive` alone");
  assert.equal(wrongKind.code, "CLR03",
    `expected CLR03 from the allowlist, got ${wrongKind.code}: ${wrongKind.message}`);
  assert.match(wrongKind.message, /close_prep/,
    `the allowlist refusal does not name the kind it refused: ${wrongKind.message}`);

  // (c) A CREDENTIAL THAT NAMES NOBODY. This read rides a named person's authority: an
  //     `interactive` credential minted with no on_behalf_of is refused by name.
  const { secret: nameless } = await mintWake5({ kind: "interactive", firm: sc.firm, onBehalfOf: null });
  const anon = await caught(() => readInstruction(nameless));
  assert.ok(anon, "a credential naming nobody read the firm's standing instruction");
  assert.equal(anon.code, "CLR03");
  assert.equal(JSON.parse(anon.detail ?? "{}").reason, "wake_authority_absent",
    `the refusal does not carry its reason token: ${anon.detail}`);

  // (d) AN UNKNOWN KEY, answered in 0338's own vocabulary so a surface and a model read ONE
  //     refusal for this family rather than two spellings of it.
  const { secret } = await chatCredential(sc.firm, sc.bob);
  const unknown = await caught(() => readInstruction(secret, "let_clara_do_anything"));
  assert.ok(unknown, "the read door admitted an instruction key outside 0338's closed set");
  assert.equal(unknown.code, "CLR10");
  const d = JSON.parse(unknown.detail ?? "{}");
  assert.equal(d.reason, "firm_standing_instruction_invalid");
  assert.equal(d.axis, "instruction_key_unknown");
});

test("p1147.read.floor_is_the_credential -- the read's OWN floor is viewer (every member may see "
  + "what their firm instructed Clara to do), and the credential's floor is strictly ABOVE it: a "
  + "credential on behalf of a viewer cannot be minted at all, so the door can never be reached "
  + "below bookkeeper",
async (t) => {
  if (await readGate(t)) return;
  const sc = await prepaidScene("p1147floor");
  await record(sc.alice, { opKey: opk("p1147-floor") });

  // CAROL is a VIEWER of this firm (buildWorld's own roster). She may read the relation herself…
  const carol = sc.w.users.carol;
  const own = await humanQuery(carol,
    `select count(*)::int as n from clara.firm_standing_instructions
      where instruction_key = $1 and withdrawn_at is null`, [KEY]);
  assert.equal(own.rows[0].n, 1,
    "a viewer of the firm cannot read what their own firm instructed -- the read's floor moved");

  // …but no wake credential may RIDE her: clara.mint_wake_credential refuses below bookkeeper, so
  // the door's effective floor is the credential's and is strictly narrower than the read's own.
  const refused = await caught(() => mintWake5({ kind: "interactive", firm: sc.firm, onBehalfOf: carol }));
  assert.ok(refused, "an interactive credential was minted on behalf of a VIEWER");
  assert.equal(refused.code, "CLR10",
    `expected the minter's CLR10 authority_lost, got ${refused.code}: ${refused.message}`);
});

// =============================================================================================
// S2 — WITHDRAWAL NAMES ITS CONSEQUENCE: HOW MANY PLANS KEEP POSTING.
//
// WHAT WITHDRAWAL DOES TO A PLAN DOES NOT CHANGE HERE. The plans an instruction already
// authorised keep posting under the member who authorised them — #940's own ruling for a retired
// roster enrolment, restated by 0338 §G. Whether withdrawal should ALSO pause them is an
// accounting and product ruling #1050 was never given; #1147 makes the consequence VISIBLE and
// records the question rather than taking it. These cells therefore assert BOTH halves: the count
// is answered, AND the plans are still exactly as they were.
// =============================================================================================

/** The plan rows a firm's instruction authorised, read independently as root. */
async function plansUnder(instructionId) {
  const r = await rootQuery(
    `select id, status from clara.accounting_plans
      where authority_kind = 'standing_instruction'
        and authority_ref ->> 'kind' = 'firm_standing_instruction'
        and authority_ref ->> 'id' = $1::text
      order by created_at, id`, [instructionId]);
  return r.rows;
}

test("p1147.withdraw.counts -- the withdraw door's answer carries how many LIVE plans the "
  + "instruction it is withdrawing authorised: one where the clocked lane wrote one, zero where "
  + "the firm instructed and Clara never acted -- and the plan itself is untouched either way",
async (t) => {
  if (await readGate(t)) return;

  // (1) A FIRM THAT INSTRUCTED AND WHOSE CLOCKED LANE ACTED. The plan is written by the real wake
  //     wrapper on a real close_prep credential -- the production path, never a hand-built row.
  const sc = await prepaidScene("p1147count1");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const si = await record(sc.alice, { opKey: opk("p1147-count-1") });
  const w = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(w.plan_id, `mandatory setup: the clocked lane configured a plan (${JSON.stringify(w)})`);

  const before = await plansUnder(si.instruction_id);
  assert.equal(before.length, 1, "mandatory setup: exactly one plan cites this instruction");
  assert.equal(before[0].status, "active");

  const out = await withdraw(sc.alice, { opKey: opk("p1147-count-1-wd") });
  assert.equal(out.active, false, "the withdrawal did not close the instruction");
  assert.equal(out.instruction_id, si.instruction_id);
  assert.equal(out.plans_still_posting, 1,
    `the withdrawal does not say how many plans keep posting: ${JSON.stringify(out)}`);

  // …AND NOTHING WAS DONE TO THE PLAN. This is the ruling #1147 does not take, asserted rather
  // than assumed: the plan is still ACTIVE, under the same directing human.
  const after = await plansUnder(si.instruction_id);
  assert.deepEqual(after, before,
    "withdrawing the instruction changed a plan it authorised -- that is the ruling this ticket "
    + "was NOT given (issue #1147, 'Out of scope')");

  // (2) A FIRM THAT INSTRUCTED AND WHOSE CLOCKED LANE NEVER ACTED: zero, not null and not absent.
  //     A surface that has to tell "no plans" from "the door did not say" would guess.
  const sc0 = await prepaidScene("p1147count0");
  const si0 = await record(sc0.alice, { opKey: opk("p1147-count-0") });
  assert.deepEqual(await plansUnder(si0.instruction_id), [],
    "mandatory setup: nothing was authorised under this instruction");
  const out0 = await withdraw(sc0.alice, { opKey: opk("p1147-count-0-wd") });
  assert.equal(out0.plans_still_posting, 0,
    `a firm whose instruction authorised nothing is not told zero: ${JSON.stringify(out0)}`);

  // (3) THE FOUR KEYS 0338 ANSWERED WITH DID NOT MOVE. The count is an ADDITION; a surface built
  //     against 0338's receipt still reads everything it read before.
  for (const k of ["instruction_id", "instruction_key", "recorded_by", "withdrawn_by", "active"]) {
    assert.ok(k in out, `the withdrawal receipt lost 0338's own key \`${k}\`: ${JSON.stringify(out)}`);
  }
  assert.equal(out.recorded_by, sc.alice);
  assert.equal(out.withdrawn_by, sc.alice);
});

test("p1147.withdraw.counts_only_what_still_posts -- the count is of LIVE plans of THIS firm under "
  + "THIS instruction: a plan a person has paused is not still posting, and a plan another firm's "
  + "instruction authorised was never this firm's to count",
async (t) => {
  if (await readGate(t)) return;

  const sc = await prepaidScene("p1147countlive");
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const si = await record(sc.alice, { opKey: opk("p1147-live-1") });
  const w = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.ok(w.plan_id, "mandatory setup: the clocked lane configured a plan");

  // A SECOND FIRM, instructing and acting for itself. Its plan must never reach firm A's count.
  const other = await prepaidScene("p1147countother");
  await recordPeriod(other.alice, { document: other.document, start: "2025-02-01", end: "2025-04-30" });
  const siOther = await record(other.alice, { opKey: opk("p1147-live-other") });
  const wOther = await wake12(other.s, { client: other.client, entry: other.entry, target: other.target });
  assert.ok(wOther.plan_id, "mandatory setup: the sibling firm's clocked lane configured a plan");
  assert.notEqual(other.firm, sc.firm, "mandatory setup: the two scenes are different firms");
  assert.equal((await plansUnder(siOther.instruction_id)).length, 1);

  // A PERSON PAUSES firm A's plan through the real door. A paused plan posts nothing, so it is
  // not something a withdrawal leaves running.
  await humanQuery(sc.alice, "select clara.pause_accounting_plan($1,$2,$3) as r",
    [w.plan_id, "p1147: parked while the firm decides", opk("p1147-pause")]);
  const paused = (await rootQuery(
    "select status from clara.accounting_plans where id = $1", [w.plan_id])).rows[0];
  assert.equal(paused.status, "paused", "mandatory setup: the plan is paused");

  const out = await withdraw(sc.alice, { opKey: opk("p1147-live-wd") });
  assert.equal(out.plans_still_posting, 0,
    `a paused plan was counted as still posting, or the sibling firm's plan reached this count: `
    + `${JSON.stringify(out)}`);
  assert.equal(out.instruction_id, si.instruction_id);

  // THE SIBLING FIRM IS UNTOUCHED, and its own withdrawal still counts its own plan -- without
  // this half the cell above would pass on a door that always answers zero.
  const outOther = await withdraw(other.alice, { opKey: opk("p1147-live-other-wd") });
  assert.equal(outOther.plans_still_posting, 1,
    `the sibling firm's own live plan is not counted at its own withdrawal: ${JSON.stringify(outOther)}`);
});
