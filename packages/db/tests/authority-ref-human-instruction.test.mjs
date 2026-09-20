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
} from "./authority-ref-human-instruction-fixtures.mjs";
import { mintAgentTaskRef } from "./fa-authority-sign-compat.mjs";
import {
  faWorld, p651Client, proposeAuthority, signWithRef, authorityRows,
  printLaneNotes, printSkipCount, endPool, x41EnsureReady, rootQuery,
} from "./depreciation-history-fixtures.mjs";
import {
  buildWorkWorld, freshWorkClient, createAccountingPlan, basis, todayInPlanZone,
  PLAN_KIND, gatePlans,
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

test("p977.definition.one both doors READ clara._authority_ref_refusal and neither still carries its own inline chat-lane existence test; that inline test now survives in exactly one clara function — the accrual lane's core, which the owner's ruling deliberately leaves alone", async (t) => {
  if (await gate(t)) return;

  const SIGN = "clara.sign_depreciation_authority(uuid,uuid,text,jsonb)";
  const PLAN = "clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)";

  for (const sig of [SIGN, PLAN]) {
    const src = await normalizedBody(sig);
    assert.ok(src.includes(REFUSAL_CALL.toLowerCase()),
      `${sig} reads the shared definition ${REFUSAL_CALL}`);
    assert.ok(!src.includes(INLINE_CHAT_LANE_EXISTENCE),
      `${sig} no longer carries its own inline chat-lane existence test — the fold is real`);
  }

  // Normalized in JS by the SAME rule the migration's tail uses in SQL, so this cell and the
  // migration can never disagree about what "the fragment" is.
  const bodies = await rootQuery(
    "select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'clara' order by p.proname");
  const carriers = bodies.rows
    .filter((r) => normalizeSrc(r.prosrc).includes(INLINE_CHAT_LANE_EXISTENCE))
    .map((r) => r.proname);
  assert.deepEqual(carriers, ["_accrual_plan_core"],
    "the inline existence test survives in exactly the one body the ruling leaves alone "
    + "(the accrual lane's core) — never in either door, and never in a third place");

  const readers = bodies.rows
    .filter((r) => r.proname !== "_authority_ref_refusal" && r.prosrc.includes(REFUSAL_CALL))
    .map((r) => r.proname);
  assert.deepEqual(readers,
    ["create_accounting_plan", "sign_depreciation_authority"],
    "…and exactly the two doors the ruling names read the one definition");
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
