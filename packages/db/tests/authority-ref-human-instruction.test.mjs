// #977 [0250] — AN `authority_ref` INTO THE CHAT LANE IS ACCEPTED ONLY WHEN IT NAMES A HUMAN-
// AUTHORED CHAT TURN, IN BOTH DOORS THAT RESOLVE ONE.
//
// THE DEFECT, IN ONE SENTENCE: `clara.sign_depreciation_authority` and
// `clara.create_accounting_plan` both resolved a `{kind:'chat_task', id}` reference by a bare
// EXISTENCE test — a row with that id, in the same firm and client — never reading the named
// row's own kind or author, so a task the estate enqueued FOR ITSELF satisfied the same check as
// an instruction somebody actually typed.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (`signWithRef` / `createAccountingPlan`, both
// `humanQuery` at their own floor). `rootQuery` appears only as a READBACK, or as LABELLED
// fixture DML minting the agent task a reference names — and that minting says what it is in
// `fa-authority-sign-compat.mjs`'s own comment.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate977, NOT_HUMAN, UNRESOLVED, refusedWith,
  REFUSAL_CALL, INLINE_CHAT_LANE_EXISTENCE, normalizedBody, normalizeSrc,
  REFUSAL_FN_SIG, PLAN_WALL_FN_SIG, PLAN_WALL_CALL, AUTHORITY_REF_HUMAN_INSTRUCTION_STEM,
  accrualPlanAuthorityWallReady,
} from "./authority-ref-human-instruction-fixtures.mjs";
import { mintAgentTaskRef } from "./fa-authority-sign-compat.mjs";
import {
  faWorld, p651Client, proposeAuthority, signWithRef, authorityRows,
  printLaneNotes, printSkipCount, endPool, x41EnsureReady, rootQuery,
  EXPENSE, BANK,
} from "./depreciation-history-fixtures.mjs";
import {
  buildWorkWorld, freshWorkClient, createAccountingPlan, basis, todayInPlanZone,
  PLAN_KIND, gatePlans, instructionRef, admitJournalWork,
} from "./accounting-plans-fixtures.mjs";

let live = false;
before(async () => { live = await x41EnsureReady(); });
after(async () => {
  printLaneNotes("authority-ref-human-instruction");
  printSkipCount("authority-ref-human-instruction");
  await endPool();
});

/** Every cell needs 0041/0227 (the fixed-asset lane and its signing door), 0193/0223 (the plan
 *  door) and 0250 (this ruling). */
async function gate(t) {
  if (!live) {
    t.skip("0041 is not applied — the #977 battery is dormant");
    return true;
  }
  return gate977(t);
}

// ===========================================================================================
// 1 · THE FIXED-ASSET LANE'S DOOR — clara.sign_depreciation_authority (CLR38 axis, ADMIN+).
// ===========================================================================================

test("p977.sign.machine_task_refused clara.sign_depreciation_authority refuses a chat_task reference naming a task the estate made for itself — a wake task, which carries no author at all, and an autodraft run, which DOES carry one — with a reason token distinct from the unresolved-reference one, and signs nothing", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("sign_machine");
  const authority = await proposeAuthority(w.users.bob, { client });

  const stillProposed = async (label) => {
    const row = (await authorityRows(client)).find((a) => a.id === authority);
    assert.equal(row.status, "proposed", `${label}: NOTHING is signed`);
    assert.equal(row.authority_from, null, `${label}: …and no window floor is stamped`);
    assert.equal(row.authority_ref, null, `${label}: …and no instruction is recorded on the row`);
  };

  for (const [kind, author, label] of [
    ["wake", false, "a wake task — the estate enqueuing work for itself, no author by construction"],
    ["autodraft", true, "an autodraft run that DOES carry a named author — a run is not an instruction"],
  ]) {
    const ref = await mintAgentTaskRef(client, { kind, author });
    const detail = await refusedWith(
      () => signWithRef(w.users.hana, { client, authority, ref }),
      { code: "CLR38", reason: NOT_HUMAN }, `p977.sign.${kind}`);
    assert.notEqual(detail.reason, UNRESOLVED,
      `${label}: "that row is not a person's instruction" is told apart from "there is no such row"`);
    assert.equal(detail.kind, "chat_task", `${label}: the refusal names the reference's own kind`);
    assert.equal(detail.id, ref.id, `${label}: …and the row it refused`);
    await stillProposed(label);
  }

  // …AND THE OTHER REFUSAL IS STILL ITSELF. A reference naming no row at all keeps 0227's own
  // token, so the two answers cannot be collapsed into one by a future edit.
  const detail = await refusedWith(
    () => signWithRef(w.users.hana, {
      client, authority, ref: { kind: "chat_task", id: "00000000-0000-4000-8000-0000000000fe" } }),
    { code: "CLR38", reason: UNRESOLVED }, "p977.sign.nonexistent");
  assert.equal(detail.kind, "chat_task");
  await stillProposed("a reference naming no row at all");
});

// ===========================================================================================
// 2 · THE PLAN LANE'S DOOR — clara.create_accounting_plan (CLR10 axis, BOOKKEEPER+).
//
//     THE SAME RULE, THE SAME DEFINITION, A DIFFERENT ERROR CLASS. #977's point is that the two
//     doors stop maintaining two copies of the answer; what each does with that answer stays its
//     own business, and this cell pins that the plan lane keeps its CLR10 axis while the
//     fixed-asset lane keeps its CLR38 one.
// ===========================================================================================

/** A plan-lane world and a fresh client on it, built once for this file. */
let planWorld = null;
async function planClient(tag) {
  planWorld ??= await buildWorkWorld();
  return { w: planWorld, client: await freshWorkClient(planWorld.users.alice, tag) };
}

const planRowCount = async (client) =>
  Number((await rootQuery(
    "select count(*)::int as n from clara.accounting_plans where client_id = $1", [client])).rows[0].n);

test("p977.plan.machine_task_refused clara.create_accounting_plan refuses the SAME machine-created chat_task references, on its OWN error class, with the SAME new reason token, and writes no plan", async (t) => {
  if (await gate(t)) return;
  if (await gatePlans(t)) return;
  const { w, client } = await planClient("p977plan");
  const today = await todayInPlanZone();
  const effectiveFrom = `${today.slice(0, 7)}-01`;

  const create = (ref) => createAccountingPlan(w.users.alice, {
    client, kind: PLAN_KIND.recurring, purpose: "p977 monthly rent",
    authorityRef: ref, effectiveFrom, basis: basis({ postingDate: effectiveFrom }),
  });

  for (const [kind, author, label] of [
    ["wake", false, "a wake task — no author by construction"],
    ["autodraft", true, "an autodraft run that DOES carry a named author"],
  ]) {
    const ref = await mintAgentTaskRef(client, { kind, author });
    const before = await planRowCount(client);
    const detail = await refusedWith(() => create(ref),
      { code: "CLR10", reason: NOT_HUMAN }, `p977.plan.${kind}`);
    assert.notEqual(detail.reason, UNRESOLVED,
      `${label}: told apart from "there is no such row"`);
    assert.equal(detail.kind, "chat_task", `${label}: the refusal names the reference's own kind`);
    assert.equal(detail.id, ref.id, `${label}: …and the row it refused`);
    assert.equal(await planRowCount(client), before, `${label}: NOTHING is written`);
  }

  const before = await planRowCount(client);
  const detail = await refusedWith(
    () => create({ kind: "chat_task", id: "00000000-0000-4000-8000-0000000000fd" }),
    { code: "CLR10", reason: UNRESOLVED }, "p977.plan.nonexistent");
  assert.equal(detail.kind, "chat_task");
  assert.equal(await planRowCount(client), before, "a reference naming no row writes nothing either");
});

// ===========================================================================================
// 3 · THE ONE DEFINITION, OFF THE CATALOG — the structural standard this repo documents for a
//     recut body (a prestate pin, a tail assertion, a catalog census). Work order rule 4: where
//     the repo's own documented standard asks for a structural cell, that standard wins.
// ===========================================================================================

test("p977.definition.shape clara._authority_ref_refusal(text,uuid,uuid,uuid) exists, is owned by clara_fn_owner, stable, and UNGRANTED — PUBLIC and every named application role are denied EXECUTE", async (t) => {
  if (await gate(t)) return;

  const mig = await rootQuery(
    "select version from clara.schema_migrations where version ~ $1",
    [AUTHORITY_REF_HUMAN_INSTRUCTION_STEM]);
  assert.equal(mig.rows.length, 1,
    `exactly one applied ${AUTHORITY_REF_HUMAN_INSTRUCTION_STEM} migration (got ${mig.rows.map((x) => x.version).join(",")})`);

  const fn = await rootQuery(
    `select p.provolatile, p.prosecdef, p.proowner::regrole::text as owner,
            'search_path=clara, pg_temp' = any(p.proconfig) as pinned_path
       from pg_proc p where p.oid = $1::regprocedure`, [REFUSAL_FN_SIG]);
  assert.equal(fn.rows.length, 1, `${REFUSAL_FN_SIG} exists`);
  assert.equal(fn.rows[0].provolatile, "s", "…and is STABLE — the language itself refuses to let it write");
  assert.ok(fn.rows[0].prosecdef, "…SECURITY DEFINER, like every other ungranted internal core");
  assert.equal(fn.rows[0].owner, "clara_fn_owner", "…owned by clara_fn_owner, like its siblings");
  assert.ok(fn.rows[0].pinned_path, "…and its search_path is pinned");

  const acl = await rootQuery(
    `select count(*)::int as n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
      where p.oid = $1::regprocedure and a::text not like 'clara_fn_owner=%'`, [REFUSAL_FN_SIG]);
  assert.equal(acl.rows[0].n, 0, "no grant beyond the owner's own — an INTERNAL, granted to nobody");

  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro"]) {
    const has = await rootQuery(
      "select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok", [role, REFUSAL_FN_SIG]);
    assert.equal(has.rows[0].ok, false, `${role} does NOT hold EXECUTE on the shared definition`);
  }
});

test("p977.definition.one both doors REACH clara._authority_ref_refusal — the signing door by naming it, the plan door and #941's on-behalf twin of it through #1051's one shared plan-authority wall once that is live — and none of them still carries its own inline chat-lane existence test; that inline test survives in exactly one clara function below #1080 (the accrual lane's core, which 0250 could not reach) and in NO clara function at all from 0331 on", async (t) => {
  if (await gate(t)) return;

  const SIGN = "clara.sign_depreciation_authority(uuid,uuid,text,jsonb)";
  const PLAN = "clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)";

  // #1051 (0330) — MEASURED, NEVER ASSUMED, the same rule this cell already applies to the OBO
  // twin below. On a pre-0330 chain the plan door NAMES the shared definition; on a post-0330
  // chain it reaches it through `clara._assert_plan_authority`, the one predicate both plan
  // bodies now call. Either way there is exactly ONE definition and no door keeps its own copy,
  // which is #977's whole claim; what moves is how many hops away the plan lane stands.
  const planWallLive = (await rootQuery(
    "select to_regprocedure($1) is not null as ok", [PLAN_WALL_FN_SIG])).rows[0].ok;
  const planReach = planWallLive ? PLAN_WALL_CALL : REFUSAL_CALL;

  for (const [sig, reach] of [[SIGN, REFUSAL_CALL], [PLAN, planReach]]) {
    const src = await normalizedBody(sig);
    assert.ok(src.includes(reach.toLowerCase()),
      `${sig} reaches the shared definition through ${reach}`);
    assert.ok(!src.includes(INLINE_CHAT_LANE_EXISTENCE),
      `${sig} no longer carries its own inline chat-lane existence test — the fold is real`);
  }
  if (planWallLive) {
    const wall = await normalizedBody(PLAN_WALL_FN_SIG);
    assert.ok(wall.includes(REFUSAL_CALL.toLowerCase()),
      "…and #1051's shared plan wall is itself a READER of the one definition, not a second copy of it");
    assert.ok(!wall.includes(INLINE_CHAT_LANE_EXISTENCE),
      "…carrying no inline chat-lane existence test of its own either");
  }

  // Normalized in JS by the SAME rule the migration's tail uses in SQL, so this cell and the
  // migration can never disagree about what "the fragment" is.
  const bodies = await rootQuery(
    "select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'clara' order by p.proname");
  const carriers = bodies.rows
    .filter((r) => normalizeSrc(r.prosrc).includes(INLINE_CHAT_LANE_EXISTENCE))
    .map((r) => r.proname);
  // #1080 (0331) TAKES THE LAST CARRIER AWAY. 0250 named `clara._accrual_plan_core` as the one
  // body it could not reach and pinned the probe there; 0331 points that body at #1051's shared
  // predicate, so from 0331 on the probe lives in NO clara function — the state 0250's own prose
  // always described and could not yet assert. MEASURED off the applied chain (0331 mints no
  // name, so `to_regprocedure` cannot feature-detect it and asking the body itself would be
  // asking the subject under test what it should be). Still an EXACT closed world in either
  // branch: a carrier outside the expected roster still reds this cell.
  const accrualWallLive = await accrualPlanAuthorityWallReady();
  assert.deepEqual(carriers, accrualWallLive ? [] : ["_accrual_plan_core"],
    accrualWallLive
      ? "from #1080 (0331) the inline existence test survives in NO clara body at all — not in "
        + "either door, not in the accrual lane's core, and not in a third place"
      : "below #1080 the inline existence test survives in exactly the one body 0250 could not "
        + "reach (the accrual lane's core) — never in either door, and never in a third place");

  // THE THIRD READER, AND WHY IT IS ONE (riders wave 4, #941/0308). `clara._obo_plan_core` is the
  // ON-BEHALF twin of the plan door's own plan step: #915 wrote it because
  // `clara.create_accounting_plan` resolves its actor through `clara._human_ctx` ->
  // `clara.jwt_sub()`, which a `clara_runtime` connection cannot satisfy, so an OBO lane cannot
  // nest the door itself. 0308 §D copies the door's authority shape VERBATIM and says so in the
  // body ("THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan"), and two of lane
  // 04's own cells MEASURE that copy — `p915.obo.refusals_match` (prepayment-schedule-obo.test.mjs)
  // and `p941.obo.authority` (revenue-recognition.test.mjs) compare the two entrances' whole
  // refusal payloads byte for byte. So the twin reading the shared definition is #977's rule
  // HOLDING on the machine lane, not escaping it: the alternative — a second inline existence
  // test — is exactly the drift this ticket folded away, and 0308's own header records that the
  // accrual lane's uncorrected copy is what taught the wave to prefer the shared read.
  //
  // MEASURED, never assumed: the twin does not exist on a pre-0308 database, so it joins the
  // expected roster only when the catalog carries it. Everything else stays an EXACT closed
  // world — a FOURTH reader still reds this cell.
  const OBO_TWIN_SIG = "clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,"
    + "integer,text,date,date,jsonb)";
  const oboTwinLive = (await rootQuery(
    "select to_regprocedure($1) is not null as ok", [OBO_TWIN_SIG])).rows[0].ok;
  // THE FOURTH READER, AND WHY IT IS ONE (riders sweep wave, #1137/0353). The owner's ruling of
  // 2026-09-25 on #1137 lets Clara confirm a TENANCY rent plan on a named bookkeeper's behalf from
  // the conversation, and that confirmation ends in a plan — so it needs a plan step for the same
  // reason #915's and #941's did: `clara.create_accounting_plan` resolves its actor through
  // `clara._human_ctx` -> `clara.jwt_sub()`, which a `clara_runtime` connection cannot satisfy.
  // `clara._tenancy_plan_core` is `clara._obo_plan_core`'s body with the kind fixed to
  // `recurring_journal`, and it READS the shared definition rather than carrying an inline copy —
  // which is #977's rule holding on one more machine lane, not escaping it. 0353's own
  // `p1137.obo.refusals_match` (tenancy-agent-twins.test.mjs) MEASURES the copy: seven shared
  // refusals driven through BOTH entrances and compared on sqlstate, sentence and typed detail.
  //
  // …and AT INTEGRATION IT STOPPED BEING A READER, which is why it is not on the roster below.
  // This lane was cut from the cut head, which carries no 0330, so 0353 pasted 0300's authority
  // block into that step under the comment "THE AUTHORITY SHAPE, verbatim from
  // clara.create_accounting_plan" — a FOURTH hand-written copy of the wall #1051 exists to fold,
  // and the only one that would have been left standing. 0353's own note says the step "belongs in
  // clara._obo_plan_core … and is separate only because lane L1 of the same wave recuts that body",
  // and names the follow-up that merges them. THE MERGE IS WHERE THAT FOLLOW-UP LANDED: the
  // integration recut points the step at `clara._assert_plan_authority`, exactly as 0330 pointed
  // the two plan doors and 0331 the accrual core. It had to, because #1051's own census refuses any
  // body that both calls the predicate and keeps a copy of the wall's sentence.
  //
  // So the step now reaches the definition through the shared predicate rather than by naming it,
  // and this cell asserts THAT rather than listing it: below, a live tenancy step must NOT be a
  // reader. Nothing it admits or refuses moved — 0353's own `p1137.obo.refusals_match` drives seven
  // shared refusals through BOTH entrances and compares sqlstate, sentence and typed detail, and
  // that parity is now exact by construction, because both entrances reach the same body.
  //
  // MEASURED, never assumed, on the same terms as the twin above: the roster stays an EXACT closed
  // world, and a reader this cell does not name still reds it.
  const TENANCY_STEP_SIG = "clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,"
    + "integer,text,date,date,jsonb)";
  const tenancyStepLive = (await rootQuery(
    "select to_regprocedure($1) is not null as ok", [TENANCY_STEP_SIG])).rows[0].ok;
  const readers = bodies.rows
    .filter((r) => r.proname !== "_authority_ref_refusal" && r.prosrc.includes(REFUSAL_CALL))
    .map((r) => r.proname);
  // #1051 (0330) COLLAPSES THE PLAN LANE'S TWO READERS INTO ONE. Before it, the plan door and
  // its OBO twin each named the definition; after it, neither does and `_assert_plan_authority`
  // names it once for both — which is the same claim ("no door keeps its own copy") counted at
  // the place the copies actually live. Still an EXACT closed world in either branch: a reader
  // outside the expected roster still reds this cell.
  // #1050 (0338) GIVES THE TWIN ONE KIND OF ITS OWN, and that makes it a reader again. Recut at
  // integration (riders sweep wave, L1's 0330 against L2's 0338). The owner's re-brief of #1050
  // lets a named member of the firm record a FIRM-LEVEL STANDING INSTRUCTION, and the unattended
  // prepayment lane cites that row as its directing human. 0338 §E answers that one kind inside
  // `clara._obo_plan_core` and hands every other kind to #1051's shared predicate, deliberately:
  // folding `standing_instruction` into the predicate would admit a firm's blanket delegation at
  // the HUMAN plan door too, which the ruling gives it to nobody and which 0338's own tail item 6
  // refuses. Answering it there means resolving it, and it is resolved through THIS definition —
  // the same #977 resolver every other kind goes through, at firm scope. So the twin is back on
  // the roster, and that is #977's rule holding on the machine lane rather than escaping it.
  //
  // MEASURED, never assumed, the same way the twin's own presence is: 0338 mints
  // `clara.firm_standing_instructions`, so the catalog carrying that relation is the fact that
  // says this chain has the second kind on it. Everything else stays an EXACT closed world — a
  // reader outside the expected roster still reds this cell.
  const standingKindLive = (await rootQuery(
    "select to_regclass('clara.firm_standing_instructions') is not null as ok")).rows[0].ok;
  const oboReads = oboTwinLive && standingKindLive;
  assert.deepEqual(readers,
    // `order by p.proname` above is the catalog's own C ordering (proname is `name`), so the
    // underscore-led names sort first.
    planWallLive
      ? (oboReads
        ? ["_assert_plan_authority", "_obo_plan_core", "sign_depreciation_authority"]
        : ["_assert_plan_authority", "sign_depreciation_authority"])
      : [...(oboTwinLive ? ["_obo_plan_core"] : []),
        "create_accounting_plan", "sign_depreciation_authority"],
    "…and exactly the two doors the ruling names — plus #941's on-behalf twin of the plan door, "
    + "counted at #1051's shared wall once that is live, and counted again in its own right once "
    + "#1050's standing-instruction kind gives it a reference of its own to resolve — read the "
    + "one definition");

  // AND THE TENANCY STEP IS NOT ONE, which is the integration recut's own claim, asserted here
  // rather than left to the roster's silence: a body that quietly went back to naming the
  // definition would otherwise only show up as a roster mismatch with no reason attached.
  if (tenancyStepLive) {
    const step = bodies.rows.find((r) => r.proname === "_tenancy_plan_core");
    assert.ok(step, "the tenancy plan step resolves but is not in the catalog census");
    assert.ok(!step.prosrc.includes(REFUSAL_CALL),
      "clara._tenancy_plan_core names clara._authority_ref_refusal again -- 0353's integration "
      + "recut onto #1051's shared predicate was lost");
    assert.ok(step.prosrc.includes(PLAN_WALL_CALL),
      "clara._tenancy_plan_core does not reach #1051's shared plan-authority wall at all");
    assert.ok(!normalizeSrc(step.prosrc).includes(INLINE_CHAT_LANE_EXISTENCE),
      "clara._tenancy_plan_core carries an inline chat-lane existence test of its own");
  }
});

// ===========================================================================================
// 4 · THE OTHER HALF OF THE CLAIM — AUTHORSHIP.
//
//     Kind alone is not the rule. `clara.agent_tasks.created_by` is nullable for every kind, and
//     the chat ingress is what stamps it; a `chat_turn` row with no author is a turn nobody
//     signed, and it is not a person's instruction either. This cell is what forces the
//     predicate to be a CONJUNCTION rather than a kind test.
// ===========================================================================================

test("p977.both.unauthored_chat_turn_refused a chat_turn task carrying NO author is refused by both doors with the same new token — authorship is half the rule, not a consequence of the kind", async (t) => {
  if (await gate(t)) return;

  const w = await faWorld();
  const faClient = await p651Client("sign_unauthored");
  const authority = await proposeAuthority(w.users.bob, { client: faClient });
  const faRef = await mintAgentTaskRef(faClient, { kind: "chat_turn", author: false });
  const faDetail = await refusedWith(
    () => signWithRef(w.users.hana, { client: faClient, authority, ref: faRef }),
    { code: "CLR38", reason: NOT_HUMAN }, "p977.sign.unauthored_chat_turn");
  assert.equal(faDetail.id, faRef.id);
  assert.equal(
    (await authorityRows(faClient)).find((a) => a.id === authority).status, "proposed",
    "NOTHING is signed");

  if (await gatePlans(t)) return;
  const { w: pw, client } = await planClient("p977unauth");
  const today = await todayInPlanZone();
  const effectiveFrom = `${today.slice(0, 7)}-01`;
  const planRef = await mintAgentTaskRef(client, { kind: "chat_turn", author: false });
  const before = await planRowCount(client);
  const planDetail = await refusedWith(
    () => createAccountingPlan(pw.users.alice, {
      client, kind: PLAN_KIND.recurring, purpose: "p977 unauthored turn",
      authorityRef: planRef, effectiveFrom, basis: basis({ postingDate: effectiveFrom }),
    }),
    { code: "CLR10", reason: NOT_HUMAN }, "p977.plan.unauthored_chat_turn");
  assert.equal(planDetail.id, planRef.id);
  assert.equal(await planRowCount(client), before, "NOTHING is written");
});

// ===========================================================================================
// 5 · WHAT MUST NOT HAVE MOVED — the other side of the ruling.
//
//     A ruling that refused everything would pass every cell above. These two cells are the
//     estate's "unmoved" discipline applied to BEHAVIOUR: the two shapes that were accepted
//     before #977 and must still be accepted, at both doors, with the same receipts.
// ===========================================================================================

test("p977.both.person_instruction_accepted a chat_turn task carrying a named author is accepted by both doors, exactly as before the ruling — the signature goes live carrying the instruction it resolved, and the plan is created active", async (t) => {
  if (await gate(t)) return;

  const w = await faWorld();
  const faClient = await p651Client("sign_authored");
  const authority = await proposeAuthority(w.users.bob, { client: faClient });
  const faRef = await mintAgentTaskRef(faClient, { kind: "chat_turn", author: true });
  const signed = await signWithRef(w.users.hana, { client: faClient, authority, ref: faRef });
  assert.equal(signed.status, "live", "the signature goes through");
  assert.deepEqual(signed.authority_ref, faRef, "…and the receipt carries the instruction it resolved");
  const row = (await authorityRows(faClient)).find((a) => a.id === authority);
  assert.deepEqual(row.authority_ref, faRef, "…and so does the row");
  assert.ok(row.authority_from, "…and the window floor is stamped, exactly as before");

  if (await gatePlans(t)) return;
  const { w: pw, client } = await planClient("p977authored");
  const today = await todayInPlanZone();
  const effectiveFrom = `${today.slice(0, 7)}-01`;
  const planRef = await mintAgentTaskRef(client, { kind: "chat_turn", author: true });
  const plan = await createAccountingPlan(pw.users.alice, {
    client, kind: PLAN_KIND.recurring, purpose: "p977 authored turn",
    authorityRef: planRef, effectiveFrom, basis: basis({ postingDate: effectiveFrom }),
  });
  assert.equal(plan.status, "active", "the plan is created");
  assert.equal(plan.revision, 1);
  const stored = await rootQuery(
    "select authority_ref from clara.accounting_plans where id = $1", [plan.plan_id]);
  assert.deepEqual(stored.rows[0].authority_ref, planRef,
    "…and the row carries the instruction it resolved");
});

test("p977.both.accounting_work_ref_unchanged an accounting_work reference is accepted by both doors exactly as today — a Work row cannot exist without an initiator, so its existence IS the proof, and this arm of the resolution did not move", async (t) => {
  if (await gate(t)) return;
  if (await gatePlans(t)) return;

  // THE COLUMN THE OWNER'S RULING RESTS ON, read off the catalog rather than taken on trust.
  const initiator = await rootQuery(
    `select a.attnotnull from pg_attribute a
      where a.attrelid = 'clara.accounting_work'::regclass and a.attname = 'initiator'`);
  assert.equal(initiator.rows[0]?.attnotnull, true,
    "clara.accounting_work.initiator is NOT NULL — a Work cannot exist without naming who asked");

  // The fixed-asset lane, on an FA client, with a Work admitted on that same client.
  const w = await faWorld();
  const faClient = await p651Client("sign_work_ref");
  const authority = await proposeAuthority(w.users.bob, { client: faClient });
  const work = await admitJournalWork({
    client: faClient, author: w.users.bob,
    basis: basis({ debitAccount: EXPENSE, creditAccount: BANK }),
  });
  const faRef = { kind: "accounting_work", id: work.work_id };
  const signed = await signWithRef(w.users.hana, { client: faClient, authority, ref: faRef });
  assert.equal(signed.status, "live", "the signing door accepts a Work reference, unchanged");
  assert.deepEqual(signed.authority_ref, faRef);

  // The plan lane, through its own established instruction-Work fixture.
  const { w: pw, client } = await planClient("p977workref");
  const planRef = await instructionRef({ client, author: pw.users.alice });
  assert.equal(planRef.kind, "accounting_work");
  const today = await todayInPlanZone();
  const effectiveFrom = `${today.slice(0, 7)}-01`;
  const plan = await createAccountingPlan(pw.users.alice, {
    client, kind: PLAN_KIND.recurring, purpose: "p977 work-authorised plan",
    authorityRef: planRef, effectiveFrom, basis: basis({ postingDate: effectiveFrom }),
  });
  assert.equal(plan.status, "active", "the plan door accepts a Work reference, unchanged");

  // …and a Work of ANOTHER client still resolves to nothing here: the ladder is firm AND client,
  // and #977 did not loosen it.
  const other = await freshWorkClient(pw.users.alice, "p977workother");
  const foreign = await instructionRef({ client: other, author: pw.users.alice });
  await refusedWith(
    () => createAccountingPlan(pw.users.alice, {
      client, kind: PLAN_KIND.recurring, purpose: "p977 foreign work",
      authorityRef: foreign, effectiveFrom, basis: basis({ postingDate: effectiveFrom }),
    }),
    { code: "CLR10", reason: UNRESOLVED }, "p977.plan.foreign_work");
});
