// #1051 — ONE AUTHORITY-WALL PREDICATE. Migration: 0330_plan_authority_wall_predicate.sql.
// Frontier-gated on its own STABLE STEM (`plan_authority_wall_predicate$`), never its number —
// numbers are claimed at merge (packages/db/README.md).
//
// WHAT THE TICKET ASKED FOR, AND WHAT IT ACTUALLY IS. #1051 was filed saying
// `clara._obo_plan_core` admits TWO authority-reference kinds while
// `clara.create_accounting_plan` admits THREE. That is STALE: the riders wave-4 integrator
// carried `contract_confirmation` into BOTH bodies
// (`0308_deferred_revenue_recognition.sql:893` against the same list at line 614), so the two
// walls already admit the same three kinds. What is live is the SECOND half of the ticket: the
// two walls are two independently hand-written copies (0308:871-919 against 0308:597-640), and
// 0308:870's claim that the twin's copy is "verbatim from clara.create_accounting_plan" is not
// true of anything any more. So this is a REFACTOR THAT PRESERVES THE THREE KINDS, never a
// narrowing — the sweep plan's own re-brief
// (`docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md`, "The four narrowed tickets, and the one
// re-briefed") — and the ticket's own "keep the machine lane at two kinds" recommendation is
// NOT taken, because it would remove a kind the integrated wave deliberately added.
//
// SEAMS, the public interfaces the brief names (WORK-ORDER rule 4):
//   1. `clara.create_accounting_plan` — the human plan door, driven as a bookkeeper.
//   2. `clara.create_prepayment_schedule_for` — the ON-BEHALF entrance into
//      `clara._obo_plan_core`, driven on a real `clara_runtime` connection with no JWT.
//   3. THE CATALOG — the estate's own documented structural standard for a recut body (a
//      census, a prestate pin, a tail assertion); WORK-ORDER rule 4 says that standard wins
//      where it applies, and "there is exactly ONE spelling of the wall" is a claim only a
//      census can carry.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply;
// this file describes the live catalog and the two doors' behaviour.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
// ONE import site, so this battery rides the SAME pool and the SAME governed wrappers the
// prepayment OBO battery already uses (`prepayment-schedule-obo-fixtures.mjs` star-exports the
// prepayment, plan and work chains beneath it). `createPrepaymentScheduleFor` runs on a real
// least-privileged `clara_runtime` connection with no JWT; `createAccountingPlan` runs as a
// bookkeeper through `humanQuery`. Neither door is ever reached as `postgres`.
import {
  rootQuery, endPool, opk, nowhere, refusalOf,
  prepaymentScene, createPrepaymentScheduleFor, scheduleCountFor, planAuthority,
  extraDocument, extraRecognition, recordPeriod, chatTaskRef,
  createAccountingPlan, basis,
} from "./prepayment-schedule-obo-fixtures.mjs";

const MIGRATION = "0330_plan_authority_wall_predicate.sql";
const STEM = "plan_authority_wall_predicate$";

/** The ONE predicate #1051 mints. */
const PREDICATE = "clara._assert_plan_authority(text,jsonb,uuid,uuid)";
const PREDICATE_CALL = "clara._assert_plan_authority(";

/** The two bodies it folds. */
const HUMAN_DOOR =
  "clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)";
const OBO_DOOR =
  "clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)";

/** The third copy, which #1051 deliberately does NOT touch: `clara._accrual_plan_core` still
 *  carries 0222's own hand-written wall (`0222_accrual_adjustments.sql:1014-1025`). #1080 is the
 *  ticket that points it at this predicate, so the census below is stated as a RULE — a body
 *  either CALLS the predicate or KEEPS its own copy, never both, and no third name appears —
 *  rather than as a closed roster that #1080 would have to edit. */
const ACCRUAL_CORE = "_accrual_plan_core";

/** The wall's own sentence, the one 0193 wrote and #949 (0300) widened to three kinds. A body
 *  that still carries this carries its own copy of the wall. */
const WALL_SENTENCE = "a plan authority reference names an accounting_work";

/** Normalize a `prosrc` the way 0250's tail assertions do (comments stripped, lowercased,
 *  whitespace runs collapsed), so this file and the migrations can never disagree about what
 *  "the fragment" is. */
const normalizeSrc = (src) =>
  String(src).replace(/--[^\n]*/g, "").toLowerCase().replace(/\s+/g, " ").trim();

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 2;

before(async () => {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  ready = r.rows[0].n > 0;
  if (!ready && process.env.CLARA_ALLOW_MISSING_PLAN_AUTHORITY_WALL !== "1") {
    throw new Error(
      `#1051 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) `
      + "and CLARA_ALLOW_MISSING_PLAN_AUTHORITY_WALL is unset -- this is a FOCUSED run and must "
      + "fail loudly, not skip. Preload ./tests/plan-authority-wall-preintegration-gate.mjs for "
      + "an estate sweep against a pre-#1051 chain.");
  }
});

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (!ready) { t.skip(`rig not ready: ${MIGRATION} is not applied`); return; }
    executed += 1;
    await fn(t);
  });
}

/** Every `clara` routine, with the two facts the census is about. */
async function wallCensus() {
  const r = await rootQuery(
    "select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'clara' order by p.proname");
  return r.rows.map((row) => ({
    name: row.proname,
    carriesOwnWall: normalizeSrc(row.prosrc).includes(WALL_SENTENCE),
    callsPredicate: row.prosrc.includes(PREDICATE_CALL),
  }));
}

// ===========================================================================================
// AC1a — THE ONE SPELLING, OFF THE CATALOG.
// ===========================================================================================

cell("p1051.wall.one_definition — clara._assert_plan_authority exists as an UNGRANTED, STABLE, "
  + "definer-owned internal with a pinned search_path; both plan doors CALL it and neither keeps "
  + "a line of the wall any more; and no clara body both calls it and keeps its own copy",
async () => {
  // 1 — THE PREDICATE ITSELF, in the shape every ungranted internal of this estate takes
  //     (`clara._authority_ref_refusal`'s own, which it wraps).
  const fn = await rootQuery(
    `select p.provolatile, p.prosecdef, p.proowner::regrole::text as owner,
            'search_path=clara, pg_temp' = any(p.proconfig) as pinned_path
       from pg_proc p where p.oid = $1::regprocedure`, [PREDICATE]);
  assert.equal(fn.rows.length, 1, `${PREDICATE} exists`);
  assert.equal(fn.rows[0].provolatile, "s", "…and is STABLE — the language refuses to let it write");
  assert.ok(fn.rows[0].prosecdef, "…SECURITY DEFINER, like every other ungranted internal core");
  assert.equal(fn.rows[0].owner, "clara_fn_owner", "…owned by clara_fn_owner, like its siblings");
  assert.ok(fn.rows[0].pinned_path, "…and its search_path is pinned");

  const acl = await rootQuery(
    `select count(*)::int as n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
      where p.oid = $1::regprocedure and a::text not like 'clara_fn_owner=%'`, [PREDICATE]);
  assert.equal(acl.rows[0].n, 0, "no grant beyond the owner's own — an INTERNAL, granted to nobody");
  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro"]) {
    const has = await rootQuery(
      "select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok", [role, PREDICATE]);
    assert.equal(has.rows[0].ok, false, `${role} does NOT hold EXECUTE on the shared predicate`);
  }

  // 2 — THE TWO DOORS: each calls it, and each has stopped maintaining its own copy.
  for (const sig of [HUMAN_DOOR, OBO_DOOR]) {
    const src = await rootQuery(
      "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure", [sig]);
    assert.equal(src.rows.length, 1, `${sig} exists`);
    assert.ok(src.rows[0].src.includes(PREDICATE_CALL),
      `${sig} reaches the wall through ${PREDICATE_CALL}`);
    assert.ok(!normalizeSrc(src.rows[0].src).includes(WALL_SENTENCE),
      `${sig} no longer carries its own copy of the wall — the fold is real`);
  }

  // 3 — THE CENSUS, as a RULE rather than a roster. `_accrual_plan_core` is the third copy this
  //     ticket deliberately leaves standing (#1080 owns it), so it may be a CARRIER today and a
  //     CALLER after #1080 — but never both, and no other name may be either.
  const census = await wallCensus();
  const carriers = census.filter((c) => c.carriesOwnWall).map((c) => c.name);
  const callers = census.filter((c) => c.callsPredicate).map((c) => c.name);

  assert.ok(callers.includes("create_accounting_plan") && callers.includes("_obo_plan_core"),
    `both plan doors call the predicate (callers: ${callers.join(", ")})`);
  assert.deepEqual(carriers.filter((n) => n !== ACCRUAL_CORE), ["_assert_plan_authority"],
    "the wall's own sentence lives in exactly ONE body besides the third copy #1080 owns "
    + `(carriers: ${carriers.join(", ")})`);
  assert.deepEqual(
    callers.filter((n) => !["create_accounting_plan", "_obo_plan_core", ACCRUAL_CORE].includes(n)),
    [],
    `no body outside the plan family calls the predicate (callers: ${callers.join(", ")})`);
  const both = census.filter((c) => c.carriesOwnWall && c.callsPredicate);
  assert.deepEqual(both.map((c) => c.name), [],
    "no body both calls the shared predicate and keeps its own copy of the wall");
});

// ===========================================================================================
// AC1b — THE SAME KINDS, THROUGH BOTH DOORS, DRIVEN.
//
// The structural cell above proves there is ONE spelling of the wall. This one proves what that
// one spelling SAYS, at both seams, on one client: all three admitted kinds are admitted by both
// doors and a fourth is refused by both with the same sentence. It is the cell the ticket's first
// acceptance criterion asks for, and the `contract_confirmation` arm is the half nothing drove
// before: `tenancy-rent-plan.test.mjs`'s `S5` drives the HUMAN door with a confirmation, and no
// cell anywhere drove the OBO twin with one — the wave-4 integrator's widening of the twin was
// asserted in prose and measured only as a byte-comparison against the human door's own copy.
// ===========================================================================================

/** A `contract_plan_confirmations` row for this scene's own firm and client, planted directly.
 *
 *  A FIXTURE SHORTCUT AROUND A DOOR THIS BATTERY IS NOT ABOUT, stated as one rather than hidden —
 *  the same shape `plan-overlap-template-arm-retired.test.mjs`'s `plantLiveTemplate` takes. The
 *  real writer is #949's tenancy confirm door, which needs a whole tenancy agreement document
 *  with extracted terms and a proposal recorded against it; what THIS cell is about is the
 *  authority wall's treatment of the row, not how the row is born, and
 *  `clara._authority_ref_refusal`'s `contract_confirmation` arm resolves it by EXISTENCE under
 *  the firm-and-client ladder exactly as it resolves a Work row. `confirmed_by` is NOT NULL, and
 *  that is the whole reason this kind counts as a person's instruction, so the fixture names a
 *  real person. */
async function contractConfirmationRef(scene, tag) {
  const doc = await extraDocument(scene, { tag });
  const r = await rootQuery(
    `insert into clara.contract_plan_confirmations(
        firm_id, client_id, document_id, kind, monthly_rent_cents, rent_account_code,
        payable_account_code, term_start, term_end, treatment, professional_judgement,
        confirmed_by)
      values ($1, $2, $3, 'rent_plan', 150000, $4, $5, $6, $7, $8::jsonb, $9, $10)
      returning id`,
    [scene.firm, scene.client, doc.documentId, scene.target, "170-C56",
      scene.termStart, scene.termEnd,
      JSON.stringify({ drafts: false, framework: "MPERS", source: "p1051 rig fixture" }),
      "p1051 rig fixture: the confirming person's own judgement, recorded so the row is the "
      + "shape the tenancy door writes",
      scene.bob]);
  return { kind: "contract_confirmation", id: r.rows[0].id };
}

/** Another eligible prepayment source on this scene, with its document's service period recorded
 *  so the term derives — one per OBO admission, because a second schedule on one source entry is
 *  refused `prepayment_schedule_exists` before the wall is ever reached. */
async function anotherSource(scene, tag) {
  const rec = await extraRecognition(scene, { cents: 90000, postingDate: scene.postingDate, tag });
  await recordPeriod(scene.bob, {
    document: rec.document, start: scene.termStart, end: scene.termEnd });
  return rec.entry;
}

cell("p1051.wall.same_kinds — the one predicate says the same thing at both seams: an "
  + "accounting_work, an authored chat_task and a contract_confirmation are all ADMITTED by the "
  + "human plan door and by the on-behalf twin, and a fourth kind is refused by both with the "
  + "same sentence, the same SQLSTATE and the same authority_ref_invalid/kind payload",
async () => {
  const scene = await prepaymentScene("wall-kinds");

  // THE FOURTH KIND FIRST, so the admissions below are also the proof that the refusal wrote
  // nothing: a schedule left behind by the refused call would make the first admission answer
  // `prepayment_schedule_exists` instead.
  const alien = { kind: "knowledge_record", id: nowhere() };
  const oboRefusal = await refusalOf(() => createPrepaymentScheduleFor({
    client: scene.client, author: scene.bob, sourceEntry: scene.entry,
    expenseAccount: scene.target, authorityRef: alien, opKey: opk("p1051-obo-alien"),
  }), "the OBO twin, on an authority kind nobody admits");
  const humanRefusal = await refusalOf(() => createAccountingPlan(scene.bob, {
    client: scene.client, authorityRef: alien, purpose: "p1051 alien kind",
    effectiveFrom: scene.termStart,
    basis: basis({ postingDate: scene.termStart, memo: "p1051 alien kind", cents: 50000,
      debitAccount: scene.target, creditAccount: "170-C56" }),
    opKey: opk("p1051-human-alien"),
  }), "the human plan door, on an authority kind nobody admits");
  assert.deepEqual(oboRefusal, humanRefusal,
    "the two doors answer an unadmitted authority kind IDENTICALLY — code, sentence and payload");
  assert.deepEqual([humanRefusal.detail.reason, humanRefusal.detail.constraint],
    ["authority_ref_invalid", "kind"]);
  assert.equal(await scheduleCountFor(scene.entry), 0, "the refused OBO call wrote no schedule");

  // THE THREE ADMITTED KINDS, each a REAL row of this firm and client: a Work (#640's own
  // instruction), an AUTHORED chat turn (#977's narrowing) and a rent-plan confirmation (#949's
  // third kind, the one the wave-4 integrator carried into the twin by hand).
  const refs = [
    ["accounting_work", scene.authorityRef],
    ["chat_task", await chatTaskRef({ firm: scene.firm, client: scene.client, author: scene.bob })],
    ["contract_confirmation", await contractConfirmationRef(scene, "confirm")],
  ];
  const sources = [scene.entry, await anotherSource(scene, "k2"), await anotherSource(scene, "k3")];

  for (const [i, [label, ref]] of refs.entries()) {
    // THE ON-BEHALF TWIN, on a real clara_runtime connection.
    const obo = await createPrepaymentScheduleFor({
      client: scene.client, author: scene.bob, sourceEntry: sources[i],
      expenseAccount: scene.target, authorityRef: ref, opKey: opk(`p1051-obo-${label}`),
    });
    assert.ok(obo.schedule_id, `the twin admits a ${label} authority`);
    const oboPlan = await planAuthority(obo.plan_id);
    assert.deepEqual(oboPlan.authority_ref, ref, `…citing the ${label} row it resolved`);
    assert.equal(oboPlan.authorised_by, scene.bob,
      "…and the plan's authority is the human's, never the run's");

    // THE HUMAN DOOR, as a bookkeeper.
    const human = await createAccountingPlan(scene.bob, {
      client: scene.client, authorityRef: ref, purpose: `p1051 human ${label}`,
      effectiveFrom: scene.termStart,
      basis: basis({ postingDate: scene.termStart, memo: `p1051 human ${label}`, cents: 50000,
        debitAccount: scene.target, creditAccount: "170-C56" }),
      opKey: opk(`p1051-human-${label}`),
    });
    assert.ok(human.plan_id, `the human door admits a ${label} authority`);
    const humanPlan = await planAuthority(human.plan_id);
    assert.deepEqual(humanPlan.authority_ref, ref, `…citing the same ${label} row`);
    assert.equal(humanPlan.authority_kind, "explicit_instruction");
  }
});
