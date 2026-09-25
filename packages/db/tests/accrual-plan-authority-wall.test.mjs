// #1080 — THE ACCRUAL LANE JOINS THE ONE AUTHORITY WALL. Migration:
// 0331_accrual_plan_authority_wall.sql. Frontier-gated on its own STABLE STEM
// (`accrual_plan_authority_wall$`), never its number — numbers are claimed at merge
// (packages/db/README.md).
//
// THE DEFECT, IN ONE SENTENCE. `clara._accrual_plan_core` — the body BOTH accrual entrances nest,
// the human `clara.create_accrual_adjustment` and the on-behalf `clara.create_accrual_adjustment_for`
// — resolved a `{kind:'chat_task', id}` authority by a bare EXISTENCE probe against
// `clara.agent_tasks` (`0222_accrual_adjustments.sql:1014-1025`, carried forward verbatim by
// 0283's recut). #977 (0250) ruled that a task the estate enqueued FOR ITSELF is not a person's
// instruction and wired `clara.sign_depreciation_authority` and `clara.create_accounting_plan` at
// one shared definition; #1051 (0330) folded the plan family's whole wall into
// `clara._assert_plan_authority`. The accrual lane was never carried across, so until 0331 a wake
// task or an autodraft run COULD authorise an accrual adjustment plan through the runtime door.
//
// SEAMS, the public interfaces the brief names (WORK-ORDER rule 4):
//   1. `clara.create_accrual_adjustment_for` — the ON-BEHALF entrance, driven on a real
//      least-privileged `clara_runtime` connection carrying no human JWT. This is the lane the
//      ticket's own threat model names.
//   2. `clara.create_accrual_adjustment` — the human accrual door, driven as a bookkeeper.
//   3. THE CATALOG — this estate's documented structural standard for a recut body (a census, a
//      prestate pin, a tail assertion). WORK-ORDER rule 4 says that standard wins where it
//      applies, and "there is now exactly ONE spelling of the plan authority wall, and the inline
//      chat-lane probe survives nowhere" is a claim only a census can carry.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply;
// this file describes the live catalog and what the two accrual entrances actually do.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateAccruals, assertAccrualCohortPresent, buildWorkWorld, endPool, printLaneNotes,
  printSkipCount, opk, rootQuery, CLR, assertPair, instructionRef, todayInPlanZone, shiftMonths,
  accrual, freshAccrualClient, createAccrualAdjustment, createAccrualAdjustmentFor,
  ACCRUAL_REASON, ACCRUAL_TZ, ACHART, planRow,
} from "./accrual-adjustments-fixtures.mjs";
import { mintAgentTaskRef } from "./fa-authority-sign-compat.mjs";

const MIGRATION = "0331_accrual_plan_authority_wall.sql";
const STEM = "accrual_plan_authority_wall$";

/** #977's own token for "that row is a real row of this client's chat lane, and it is NOT a
 *  person's instruction". The whole of this ticket is that the accrual lane can now say it. */
const NOT_HUMAN = "authority_ref_not_human_instruction";

/** A uuid that names no row anywhere — the "there is no such row" arm, told apart from the
 *  "that row is not a person's instruction" one. */
const NOWHERE = "00000000-0000-4000-8000-0000000000fd";

/** The body this ticket recuts, and the ONE predicate it now calls (#1051, 0330). */
const ACCRUAL_CORE_SIG =
  "clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)";
const PREDICATE_CALL = "clara._assert_plan_authority(";

/** The wall's own sentence, in the PREFIX both spellings share — 0222's two-kind one and #949's
 *  three-kind one — so "this body still keeps a copy of the wall" cannot be dodged by a widening. */
const WALL_SENTENCE = "a plan authority reference names an accounting_work";

/** 0222's own unresolved sentence, the one only the on-behalf entrance ever gave. */
const ACCRUAL_SENTENCE = "the instruction this accrual cites";

/** #977's inline chat-lane EXISTENCE probe, normalized exactly the way 0250's own tail normalizes
 *  `prosrc` (comments stripped, lowercased, whitespace runs collapsed), so this file and the
 *  migrations can never disagree about what "the fragment" is. */
const INLINE_CHAT_LANE_PROBE = "from clara.agent_tasks t where t.id = v_ref_id";
const normalizeSrc = (src) =>
  String(src).replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ").trim();

let world = null;
let today = null;
let ready = false;
let executed = 0;
const EXPECTED_CELLS = 5;

before(async () => {
  world = await buildWorkWorld();
  today = await todayInPlanZone();
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  ready = r.rows[0].n > 0;
  if (!ready && process.env.CLARA_ALLOW_MISSING_ACCRUAL_PLAN_AUTHORITY_WALL !== "1") {
    throw new Error(
      `#1080 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) `
      + "and CLARA_ALLOW_MISSING_ACCRUAL_PLAN_AUTHORITY_WALL is unset -- this is a FOCUSED run "
      + "and must fail loudly, not skip. Preload "
      + "./tests/accrual-plan-authority-wall-preintegration-gate.mjs for an estate sweep against "
      + "a pre-#1080 chain.");
  }
});

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  printLaneNotes("accrual-plan-authority-wall");
  printSkipCount("accrual-plan-authority-wall");
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (!ready) { t.skip(`rig not ready: ${MIGRATION} is not applied`); return; }
    if (await assertAccrualCohortPresent(t)) return;
    if (await gateAccruals(t)) return;
    executed += 1;
    await fn(t);
  });
}

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const FIRM_A = () => world.firms.A;

/** The window this battery configures over, and the stated term that brackets it — 0222's own
 *  term law, which is not what this file is about: every cell uses one valid span so a refusal
 *  can only ever be the authority wall's. */
async function span() {
  const from = `${(await shiftMonths(today, -2)).slice(0, 7)}-01`;
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + interval '-1 month')) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today]);
  return { from, to: r.rows[0].d };
}

/** Every relation ONE accrual configuration writes, counted for one client. "Nothing was written"
 *  is asserted on the whole vector, never on a single table. */
async function footprint(client) {
  const r = await rootQuery(
    `select (select count(*)::int from clara.accounting_plans where client_id=$1) as plans,
            (select count(*)::int from clara.accounting_plan_revisions where client_id=$1) as revisions,
            (select count(*)::int from clara.accounting_plan_occurrences where client_id=$1) as occurrences,
            (select count(*)::int from clara.accrual_adjustments where client_id=$1) as accruals,
            (select count(*)::int from clara.accounting_work where client_id=$1) as work`,
    [client]);
  return r.rows[0];
}

// ===========================================================================================
// AC1 — THE GAP, AT THE SEAM THE TICKET NAMES: the ON-BEHALF entrance, on a real clara_runtime
//       connection with no human JWT, must refuse a machine-created chat task.
//
//       BOTH shapes #977 named, because they fail for DIFFERENT reasons and a wall that caught
//       only one would still be open: a `wake` task carries no author at all, and an `autodraft`
//       run DOES carry one (the human it was started for) without being that human's instruction.
// ===========================================================================================

cell("p1080.accrual.obo_machine_task_refused — clara.create_accrual_adjustment_for, on a real "
  + "clara_runtime connection, refuses a chat_task reference naming a task the estate made for "
  + "itself (a wake task with no author, and an autodraft run that does carry one) with CLR10 and "
  + "#977's own authority_ref_not_human_instruction token, naming the kind and the row; and it "
  + "writes no plan, revision, occurrence, accrual or Work",
async () => {
  const client = await freshAccrualClient(ALICE(), "p1080-obo");
  const { from, to } = await span();

  for (const [kind, author, label] of [
    ["wake", false, "a wake task — the estate enqueuing work for itself, no author by construction"],
    ["autodraft", true, "an autodraft run that DOES carry a named author — a run is not an instruction"],
  ]) {
    const ref = await mintAgentTaskRef(client, { kind, author });
    const before = await footprint(client);

    const { detail } = await assertPair(CLR.badRequest, NOT_HUMAN,
      () => createAccrualAdjustmentFor({
        client, author: BOB(), purpose: "p1080 monthly office rent accrual", authorityRef: ref,
        accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
        timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to,
        opKey: opk(`p1080-obo-${kind}`),
      }),
      `the on-behalf accrual entrance, on ${label}`);

    assert.notEqual(detail.reason, ACCRUAL_REASON.authorityRefUnresolved,
      `${label}: "that row is not a person's instruction" is told apart from "there is no such row"`);
    assert.equal(detail.kind, "chat_task", `${label}: the refusal names the reference's own kind`);
    assert.equal(detail.id, ref.id, `${label}: …and the row it refused`);
    assert.deepEqual(await footprint(client), before,
      `${label}: NOTHING is written — not a plan, a revision, an occurrence, an accrual or a Work`);
  }

  // …AND THE LANE'S OWN GOOD AUTHORITY STILL CONFIGURES, on the SAME client, so the refusals
  // above are the wall answering and not the scene being unusable.
  const good = await instructionRef({ client, author: BOB() });
  const ok = await createAccrualAdjustmentFor({
    client, author: BOB(), purpose: "p1080 monthly office rent accrual", authorityRef: good,
    accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
    timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to, opKey: opk("p1080-obo-ok"),
  });
  assert.ok(ok.accrual_id, "a real accounting_work instruction still configures an accrual");
});

// ===========================================================================================
// AC1/AC3 — THE TWO ENTRANCES NOW ANSWER THE SAME WALL, AND THEY SAY THE SAME THING.
//
//     `clara.create_accrual_adjustment` (human, clara_authenticated) nests
//     `clara.create_accounting_plan`, so it has been behind #977's definition since 0250 and
//     behind #1051's predicate since 0330. `clara.create_accrual_adjustment_for` (clara_runtime)
//     nests `clara._accrual_plan_core`, which is what 0331 recuts. Before 0331 the two entrances
//     gave one client DIFFERENT answers for one refusal — a different admitted-kind list, a
//     different sentence, and, for a machine chat task, a refusal on one side and an admitted
//     plan on the other. This cell drives BOTH on the same authority references and requires the
//     whole refusal — SQLSTATE, sentence and detail payload — to be identical.
// ===========================================================================================

/** The whole refusal, as a comparable value. Both axes and the sentence, never one: two doors
 *  answering with the same token and different prose is exactly the drift this ticket closes. */
async function refusalOf(fn, label) {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, `${label}: expected a refusal but the call SUCCEEDED`);
  let detail = null;
  try {
    detail = JSON.parse(String(err.detail ?? "null"));
  } catch {
    assert.fail(`${label}: the refusal carries no JSON detail (detail=${String(err.detail)})`);
  }
  return { code: err.code, message: err.message, detail };
}

cell("p1080.accrual.entrances_agree — the human accrual door and the on-behalf one answer the "
  + "plan authority wall IDENTICALLY (SQLSTATE, sentence and detail payload) for a machine "
  + "chat_task, a chat_task naming no row, an accounting_work naming no row and a kind nobody "
  + "admits; the not-human and unresolved answers stay told apart; and neither entrance writes "
  + "anything on any of them",
async () => {
  const hClient = await freshAccrualClient(ALICE(), "p1080-agree-h");
  const oClient = await freshAccrualClient(ALICE(), "p1080-agree-o");
  const { from, to } = await span();

  const human = (ref, tag) => createAccrualAdjustment(BOB(), {
    client: hClient, purpose: "p1080 monthly office rent accrual", authorityRef: ref,
    accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
    timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to, opKey: opk(`p1080-h-${tag}`),
  });
  const obo = (ref, tag) => createAccrualAdjustmentFor({
    client: oClient, author: BOB(), purpose: "p1080 monthly office rent accrual", authorityRef: ref,
    accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
    timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to, opKey: opk(`p1080-o-${tag}`),
  });

  // Each reference is minted ON EACH CLIENT, because the wall resolves under the firm-AND-client
  // ladder: one row shared between two clients would be "unresolved" on the second and the cells
  // would agree for the wrong reason.
  const cases = [
    ["wake", async (client) => mintAgentTaskRef(client, { kind: "wake", author: false }),
      NOT_HUMAN, "a wake task — no author by construction"],
    ["autodraft", async (client) => mintAgentTaskRef(client, { kind: "autodraft", author: true }),
      NOT_HUMAN, "an autodraft run that DOES carry a named author"],
    ["ghost_task", async () => ({ kind: "chat_task", id: NOWHERE }),
      ACCRUAL_REASON.authorityRefUnresolved, "a chat_task naming no row at all"],
    ["ghost_work", async () => ({ kind: "accounting_work", id: NOWHERE }),
      ACCRUAL_REASON.authorityRefUnresolved, "an accounting_work naming no row at all"],
    ["alien", async () => ({ kind: "knowledge_record", id: NOWHERE }),
      ACCRUAL_REASON.authorityRefInvalid, "an authority kind nobody admits"],
  ];

  for (const [tag, mint, reason, label] of cases) {
    const hBefore = await footprint(hClient);
    const oBefore = await footprint(oClient);
    const hRef = await mint(hClient);
    const oRef = await mint(oClient);
    const h = await refusalOf(() => human(hRef, tag), `the human accrual door, on ${label}`);
    const o = await refusalOf(() => obo(oRef, tag), `the on-behalf accrual entrance, on ${label}`);

    assert.equal(h.detail.reason, reason, `${label}: the human door's token`);
    assert.equal(o.detail.reason, reason, `${label}: the on-behalf entrance's token`);
    assert.equal(h.code, "CLR10", `${label}: the plan lane's own error class, human side`);
    assert.equal(o.code, "CLR10", `${label}: …and on-behalf side`);
    assert.equal(o.message, h.message,
      `${label}: ONE sentence for one refusal, whichever entrance ran`);
    // The payloads name each entrance's OWN row, so compare the shape and every field but the id.
    assert.deepEqual(
      Object.keys(o.detail).sort(), Object.keys(h.detail).sort(),
      `${label}: the two payloads carry the same keys`);
    assert.equal(o.detail.kind ?? null, h.detail.kind ?? null, `${label}: …and the same kind`);
    assert.equal(o.detail.constraint ?? null, h.detail.constraint ?? null,
      `${label}: …and the same constraint`);
    if (h.detail.id !== undefined) {
      assert.equal(h.detail.id, hRef.id, `${label}: the human refusal names the row it refused`);
      assert.equal(o.detail.id, oRef.id, `${label}: …and so does the on-behalf one`);
    }
    assert.deepEqual(await footprint(hClient), hBefore, `${label}: the human door wrote nothing`);
    assert.deepEqual(await footprint(oClient), oBefore, `${label}: the on-behalf one wrote nothing`);
  }

  // …AND THE TWO TOKENS ARE NOT ONE TOKEN. #977's whole point is that a caller can tell "that row
  // is not a person's instruction" from "there is no such row"; this lane can now say both.
  assert.notEqual(NOT_HUMAN, ACCRUAL_REASON.authorityRefUnresolved);
});

// ===========================================================================================
// AC1 (the other half) — WHAT MUST STILL BE ADMITTED, AND THE THIRD KIND THE ON-BEHALF ENTRANCE
//     USED TO REFUSE WHILE THE HUMAN ONE ADMITTED IT.
//
//     A wall that refused everything would pass the cells above. This one drives the three kinds
//     the estate admits through BOTH accrual entrances and reads the plan row back: the authority
//     it cites, and the human it is authorised by. `contract_confirmation` (#949, 0300) is the
//     parity half — the human accrual entrance has admitted it since 0300 because it nests the
//     human plan door, and the on-behalf entrance refused it `authority_ref_invalid`/`kind`
//     because 0222's list was frozen at two kinds.
// ===========================================================================================

/** A `clara.contract_plan_confirmations` row for this scene's own firm and client, planted
 *  directly.
 *
 *  A FIXTURE SHORTCUT AROUND A DOOR THIS BATTERY IS NOT ABOUT, stated as one rather than hidden
 *  (the same shape `plan-authority-wall.test.mjs`'s own `contractConfirmationRef` takes). The real
 *  writer is #949's tenancy confirm door, which needs a whole tenancy agreement with extracted
 *  terms and a proposal recorded against it; `tenancy-rent-plan.test.mjs` owns that door. What
 *  THIS cell is about is the ACCRUAL lane's treatment of the kind, and
 *  `clara._authority_ref_refusal` resolves a confirmation by EXISTENCE under the firm-and-client
 *  ladder. `confirmed_by` is NOT NULL — that is the whole reason this kind counts as a person's
 *  instruction — so the fixture names a real person. */
async function contractConfirmationRef(client, { firm, start, end }) {
  const { seedVerifiedDocument, fileDocument } = await import("./rig-docs-fixtures.mjs");
  const doc = await seedVerifiedDocument({ firm, client: null, filename: `p1080-${opk("doc")}.pdf` });
  await fileDocument(BOB(), { document: doc.documentId, client, opKey: opk("p1080-file") });
  const r = await rootQuery(
    `insert into clara.contract_plan_confirmations(
        firm_id, client_id, document_id, kind, monthly_rent_cents, rent_account_code,
        payable_account_code, term_start, term_end, treatment, professional_judgement, confirmed_by)
      values ($1, $2, $3, 'rent_plan', 150000, $4, $5, $6, $7, $8::jsonb, $9, $10)
      returning id`,
    [firm, client, doc.documentId, ACHART.expense, ACHART.liability, start, end,
      JSON.stringify({ drafts: false, framework: "MPERS", source: "p1080 rig fixture" }),
      "p1080 rig fixture: the confirming person's own judgement, recorded so the row is the shape "
      + "the tenancy door writes",
      BOB()]);
  return { kind: "contract_confirmation", id: r.rows[0].id };
}

cell("p1080.accrual.three_kinds_admitted — an accounting_work, a HUMAN-AUTHORED chat turn and a "
  + "contract_confirmation are each admitted by BOTH accrual entrances, each plan citing the row "
  + "it resolved and authorised by the human; the contract_confirmation arm is the parity half "
  + "the on-behalf entrance refused before 0331 while the human one admitted it",
async () => {
  const { from, to } = await span();

  for (const [entrance, drive] of [
    ["the human accrual door", (client, ref, tag) => createAccrualAdjustment(BOB(), {
      client, purpose: `p1080 human ${tag}`, authorityRef: ref,
      accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
      timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to, opKey: opk(`p1080-adm-h-${tag}`),
    })],
    ["the on-behalf accrual entrance", (client, ref, tag) => createAccrualAdjustmentFor({
      client, author: BOB(), purpose: `p1080 obo ${tag}`, authorityRef: ref,
      accrual: accrual({ servicePeriodStart: from, servicePeriodEnd: to }),
      timezone: ACCRUAL_TZ, effectiveFrom: from, effectiveTo: to, opKey: opk(`p1080-adm-o-${tag}`),
    })],
  ]) {
    for (const [tag, mint] of [
      ["work", (client) => instructionRef({ client, author: BOB() })],
      ["turn", (client) => mintAgentTaskRef(client, { kind: "chat_turn", author: true })],
      ["confirmation", (client) => contractConfirmationRef(client, { firm: FIRM_A(), start: from, end: to })],
    ]) {
      // ONE CLIENT PER ADMISSION: a second plan on one client is an overlap advisory, not a
      // refusal, but a fresh client keeps each admission's readback unambiguous.
      const client = await freshAccrualClient(ALICE(), `p1080-adm-${tag}`);
      const ref = await mint(client);
      const answer = await drive(client, ref, tag);
      assert.ok(answer.accrual_id, `${entrance} admits a ${ref.kind} authority`);
      const plan = await planRow(answer.plan_id);
      assert.deepEqual(plan.authority_ref, ref, `…citing the ${ref.kind} row it resolved`);
      assert.equal(plan.authority_kind, "explicit_instruction");
      assert.equal(plan.authorised_by, BOB(),
        "…and the plan's authority is the human's, never the run's");
    }
  }
});

cell("p1080.accrual.confirmation_cannot_be_self_minted — the parity half cannot become a run's "
  + "own authority: exactly two bodies write a rent-plan confirmation, both are the tenancy "
  + "lane's human doors, clara_runtime can reach neither them nor the table, and the row cannot "
  + "exist without naming who confirmed it",
async () => {
  // WHY THIS CELL EXISTS. 0331 lets the ON-BEHALF accrual entrance admit `contract_confirmation`,
  // a kind it refused before, and a kind list that grows on a `clara_runtime`-only door is
  // measured against the standing owner ruling that access control is never loosened (spec review
  // 2026-09-25, SPEC-01). The case for calling it PARITY rather than a widening is that no runtime
  // connection can MANUFACTURE the row such a plan would cite — it can only act on a row a person
  // wrote. That case was an argument in 0331's header; here it is a closed-world measurement, so a
  // later lane that grants one of these paths turns this cell red instead of quietly making the
  // header false.
  const CONFIRMATION_DOORS = [
    "clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)",
    "clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)",
  ];

  // 1 — THE ONLY WRITERS, as a closed world over every clara body rather than a spot check.
  const writers = (await rootQuery(
    "select p.oid::regprocedure::text as sig from pg_proc p "
    + "join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'clara' "
    + "  and p.prosrc like '%insert into clara.contract_plan_confirmations%' "
    + "order by p.proname")).rows.map((r) => r.sig);
  assert.deepEqual(writers, CONFIRMATION_DOORS,
    "exactly the tenancy lane's own two confirmation doors write clara.contract_plan_confirmations");

  // 2 — AND NO ROLE ON THE MACHINE LANE CAN REACH THEM. `order by` is over `proname`, the
  //     catalog's own C-ordered name type, so no database collation can change this roster.
  const MACHINE_ROLES = ["clara_runtime", "clara_agent_ro", "clara_wake_interactive",
    "clara_wake_proactive", "clara_wake_bank", "clara_wake_filing"];
  for (const sig of CONFIRMATION_DOORS) {
    const acl = (await rootQuery(
      "select has_function_privilege('clara_authenticated', $1::regprocedure, 'execute') as auth, "
      + "       has_function_privilege('public', $1::regprocedure, 'execute') as pub", [sig])).rows[0];
    assert.equal(acl.auth, true, `${sig} is the human lane's own door`);
    assert.equal(acl.pub, false, `${sig} is not public`);
    for (const role of MACHINE_ROLES) {
      const r = (await rootQuery(
        "select case when to_regrole($2) is null then false "
        + "            else has_function_privilege($2, $1::regprocedure, 'execute') end as ex",
        [sig, role])).rows[0];
      assert.equal(r.ex, false, `${role} cannot execute ${sig}`);
    }
  }

  // 3 — NOR THE TABLE ITSELF. The doors are SECURITY DEFINER; a direct INSERT is the other way in.
  for (const role of ["clara_runtime", "clara_authenticated", "clara_agent_ro"]) {
    const r = (await rootQuery(
      "select case when to_regrole($1) is null then false else "
      + "  has_table_privilege($1, 'clara.contract_plan_confirmations', 'insert') end as ins",
      [role])).rows[0];
    assert.equal(r.ins, false, `${role} cannot insert into clara.contract_plan_confirmations`);
  }

  // 4 — AND THE ROW NAMES A PERSON BY CONSTRUCTION. CONTEXT.md's "Authorising instruction" says a
  //     confirmation "is proof as it stands ... the row cannot exist without naming who confirmed
  //     it"; that is a NOT NULL, and this reads it rather than repeating it.
  const notNull = (await rootQuery(
    "select attnotnull as nn from pg_attribute "
    + "where attrelid = 'clara.contract_plan_confirmations'::regclass and attname = 'confirmed_by'"
  )).rows[0].nn;
  assert.equal(notNull, true, "clara.contract_plan_confirmations.confirmed_by is NOT NULL");
});

// ===========================================================================================
// AC3 — THE CATALOG. "There is exactly ONE spelling of the plan authority wall, and #977's
//       inline chat-lane probe survives nowhere" is a claim only a census can carry: it is about
//       every `clara` body at once, and `clara._accrual_plan_core` is an ungranted internal with
//       no public interface of its own. WORK-ORDER rule 4: where this repo's own documented
//       standard asks for a structural cell, that standard wins.
//
//       0250's tail (`0250_authority_ref_human_instruction.sql:604`) pinned the surviving inline
//       probe to exactly `{_accrual_plan_core}` because its own header (0250:63) says it could
//       not reach that body. This cell is the other end of that sentence.
// ===========================================================================================

/** Every `clara` routine, with the four facts this census is about. `order by p.proname` is the
 *  catalog's own C ordering (`proname` is `name`, which never takes a database collation), so
 *  comparing the result against a literal roster is collation-proof by construction. */
async function wallCensus() {
  const r = await rootQuery(
    "select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'clara' order by p.proname");
  return r.rows.map((row) => ({
    name: row.proname,
    carriesOwnWall: row.prosrc.includes(WALL_SENTENCE),
    callsPredicate: row.prosrc.includes(PREDICATE_CALL),
    carriesInlineProbe: normalizeSrc(row.prosrc).includes(INLINE_CHAT_LANE_PROBE),
    carriesAccrualSentence: row.prosrc.includes(ACCRUAL_SENTENCE),
  }));
}

cell("p1080.wall.one_spelling — clara._accrual_plan_core reaches the wall through "
  + "clara._assert_plan_authority and keeps neither the wall's sentence nor #977's inline "
  + "chat-lane existence probe, with its definer shape, owner, pinned search_path and owner-only "
  + "ACL unmoved by the recut; across the whole clara schema the wall's sentence lives in exactly "
  + "one body, the predicate is called by exactly the three plan bodies, and both the inline "
  + "probe and 0222's own accrual-specific sentence survive in none",
async () => {
  // 1 — THE RECUT BODY'S POSTURE. A `create or replace` preserves an ACL; this is the cell that
  //     would see a recut which quietly granted the core to an application role.
  const fn = await rootQuery(
    `select p.provolatile, p.prosecdef, p.proowner::regrole::text as owner,
            'search_path=clara, pg_temp' = any(p.proconfig) as pinned_path,
            (select count(*)::int from unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
              where a::text not like 'clara_fn_owner=%') as extra_grants
       from pg_proc p where p.oid = $1::regprocedure`, [ACCRUAL_CORE_SIG]);
  assert.equal(fn.rows.length, 1, `${ACCRUAL_CORE_SIG} exists`);
  assert.equal(fn.rows[0].provolatile, "v", "…and is still VOLATILE — it writes the plan");
  assert.ok(fn.rows[0].prosecdef, "…SECURITY DEFINER");
  assert.equal(fn.rows[0].owner, "clara_fn_owner", "…owned by clara_fn_owner");
  assert.ok(fn.rows[0].pinned_path, "…and its search_path is still pinned");
  assert.equal(fn.rows[0].extra_grants, 0,
    "no grant beyond the owner's own — it is a definer-internal core (0004:6-12)");
  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro"]) {
    const has = await rootQuery(
      "select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok",
      [role, ACCRUAL_CORE_SIG]);
    assert.equal(has.rows[0].ok, false, `${role} does NOT hold EXECUTE on the accrual plan core`);
  }

  // 2 — THE FOLD, IN THE BODY'S OWN TEXT.
  const src = (await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure",
    [ACCRUAL_CORE_SIG])).rows[0].src;
  assert.ok(src.includes(PREDICATE_CALL),
    `${ACCRUAL_CORE_SIG} reaches the wall through ${PREDICATE_CALL}`);
  assert.ok(!src.includes(WALL_SENTENCE),
    "…and no longer carries its own copy of the wall — the fold is real");
  assert.ok(!normalizeSrc(src).includes(INLINE_CHAT_LANE_PROBE),
    "…nor #977's inline chat-lane existence probe, which is the authority gap itself");

  // 3 — THE WHOLE SCHEMA, AS AN EXACT CLOSED WORLD.
  const census = await wallCensus();
  assert.deepEqual(census.filter((c) => c.carriesOwnWall).map((c) => c.name),
    ["_assert_plan_authority"],
    "the wall's sentence lives in exactly ONE clara body — #1051's predicate");
  assert.deepEqual(census.filter((c) => c.callsPredicate).map((c) => c.name),
    ["_accrual_plan_core", "_obo_plan_core", "create_accounting_plan"],
    "and exactly the three plan bodies call it — the two #1051 folded and this ticket's third");
  assert.deepEqual(census.filter((c) => c.carriesInlineProbe).map((c) => c.name), [],
    "#977's inline chat-lane existence probe survives in NO clara body; 0250:604 pinned it at "
    + "one because 0250 could not reach this lane, and this is the ticket that took it to none");
  assert.deepEqual(census.filter((c) => c.carriesAccrualSentence).map((c) => c.name), [],
    "and 0222's own 'the instruction this accrual cites' sentence survives nowhere: one client "
    + "now gets ONE sentence for this refusal, whichever accrual entrance ran");
  assert.deepEqual(census.filter((c) => c.carriesOwnWall && c.callsPredicate).map((c) => c.name), [],
    "no body both calls the shared predicate and keeps its own copy of the wall");
});
