// F-A4 PR-2c close-prep chat lane: ten DB cells. Cell 9 is the owner-ruled PR-A boundary,
// not PR-B's card-emission assertion. CONTRACT-BLIND: all claims hit the live catalog/behaviour.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, noteLane, markSkip, printLaneNotes, printSkipCount, opk,
} from "./wave-a-fixtures.mjs";
import { CLR } from "./rig-helpers.mjs";
import { beginClose } from "./x56-fixtures.mjs";
import {
  caught, derivedOpKey, mintClosePrepSession, receiptById, scene,
} from "./f-a4-pr1c-fixtures.mjs";
import {
  hasPR2C, createChatTask, mintChatCloseSession, mintLegacy, listFy, getPlan, begin, openFy,
  caughtShape, refusalToken, completeChatTask, walkClockedAllTwelve, freshUuid,
  assertPR2CWallCensus,
} from "./f-a4-pr2c-fixtures.mjs";

let ready = false;
before(async () => {
  ready = await hasPR2C();
  if (ready) return;
  if (process.env.CLARA_ALLOW_MISSING_F_A4_PR2C_CLOSE_CHAT === "1") {
    noteLane("F-A4 PR-2c migration absent -- chat-lane battery preintegration-skipped");
    return;
  }
  throw new Error(
    "F-A4 PR-2c close-chat migration is missing; focused runs fail closed. "
    + "Apply a numbered scratch copy or explicitly preload its preintegration gate.",
  );
});
after(async () => {
  printLaneNotes("f-a4-pr2c-chat-lane");
  printSkipCount("f-a4-pr2c-chat-lane");
  await endPool();
});
const gate = (t) => {
  if (ready) return false;
  markSkip();
  t.skip("F-A4 PR-2c close-chat migration not applied");
  return true;
};
const detailReason = (e) => JSON.parse(e?.detail ?? "{}").reason;

// Mutant M5: remove task from _close_expected_op_key. MUST-RED: cell 1. MUST-NOT-RED: cells 2, 8.
test("fa4pr2c.1 cross-task staleness is refused in BOTH directions at W7", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c1");
  const a = await mintChatCloseSession(sc.firm, sc.client, sc.bob);
  const b = await mintChatCloseSession(sc.firm, sc.client, sc.bob);
  const keyA = derivedOpKey(a.task, "wake_list_fiscal_years", sc.client);
  const keyB = derivedOpKey(b.task, "wake_list_fiscal_years", sc.client);

  // Constraint A: list_fiscal_years is a viewer/no-gap verb, so W3 is independently known to pass.
  const aKeyUnderB = await caught(() => listFy(b, sc.client, keyA));
  assert.equal(aKeyUnderB?.code, CLR.badRequest);
  assert.equal(detailReason(aKeyUnderB), "op_key_not_derived");

  const actedA = await listFy(a, sc.client, keyA);
  assert.equal(actedA.status, "acted");
  const receiptA = await receiptById(actedA.receipt_id);
  assert.equal(receiptA.wake_task_id, a.task, "task-A credential records task A, never call prose");

  const bKeyUnderA = await caught(() => listFy(a, sc.client, keyB));
  assert.equal(bKeyUnderA?.code, CLR.badRequest);
  assert.equal(detailReason(bKeyUnderA), "op_key_not_derived");
});

// Mutant M1: drop A8's obo condition. MUST-RED: cell 2. MUST-NOT-RED: cell 8.
// Mutant M2 control: replacing the director with agent_user_id MUST-NOT-RED cell 2 (obo is NULL).
test("fa4pr2c.2 A8 is a byte-no-op for the clocked close_prep lane across all twelve", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c2", { startsOn: "2025-01-01" });
  const walked = await walkClockedAllTwelve(sc);
  const normalized = walked.map(({ name, status, tokens }) => ({ name, status, tokens }));
  assert.deepEqual(normalized, [
    { name: "wake_abandon_close", status: "acted", tokens: [] },
    { name: "wake_begin_close", status: "acted", tokens: [] },
    { name: "wake_dry_run_close_readiness", status: "acted", tokens: [] },
    { name: "wake_get_close_plan", status: "acted", tokens: [] },
    { name: "wake_get_close_readiness", status: "acted", tokens: [] },
    { name: "wake_list_fiscal_years", status: "acted", tokens: [] },
    { name: "wake_mint_month_snapshot", status: "acted", tokens: [] },
    { name: "wake_open_fiscal_year", status: "acted", tokens: [] },
    { name: "wake_propose_close", status: "refused", tokens: ["receipt_incomplete"] },
    { name: "wake_run_depreciation_catchup", status: "refused",
      tokens: ["depreciation_authority_absent"] },
    { name: "wake_snapshot_state", status: "acted", tokens: [] },
    { name: "wake_verify_close", status: "acted", tokens: [] },
  ], "the post-migration normalized G0 outcome is exactly the captured pre-migration outcome");
  for (const outcome of walked) {
    const receipt = await receiptById(outcome.receiptId);
    assert.equal(receipt?.via_wake_kind, "close_prep", `${outcome.name}: existing carrier unchanged`);
    assert.equal(receipt?.on_behalf_of, null, `${outcome.name}: clocked lane remains unattended`);
  }
});

// Mutant M2: A8 checks agent_user_id instead of the director. MUST-RED: cell 3.
// MUST-NOT-RED: cell 2, whose real credential has obo NULL and skips A8 entirely.
test("fa4pr2c.3 A8 uses the real director: live grant/revoke and admin promotion controls", async (t) => {
  if (gate(t)) return;
  const control = await scene("pr2c_c3_ctl");
  await humanQuery(control.alice, "select clara.grant_firm_capability($1,$2,$3,$4)",
    [control.bob, "close_and_attest", "pr2c positive-control grant", opk("pr2c-c3-ctl")]);
  const planted = await rootQuery(
    `select count(*)::int as n from clara.firm_capability_grants
      where user_id=$1 and capability='close_and_attest' and revoked_at is null`, [control.bob]);
  assert.equal(planted.rows[0].n, 1,
    "a DIFFERENT human has a real live grant, so the target absence is non-vacuous");

  const sc = await scene("pr2c_c3_cap");
  const attended = await mintChatCloseSession(sc.firm, sc.client, sc.bob);
  const targetBefore = await rootQuery(
    `select count(*)::int as n from clara.firm_capability_grants
      where user_id=$1 and capability='close_and_attest' and revoked_at is null`, [sc.bob]);
  assert.equal(targetBefore.rows[0].n, 0, "the exact directing human starts ungranted");
  const refused = await caught(() => begin(attended, sc.fy));
  assert.equal(refused?.code, CLR.authz);
  assert.equal(detailReason(refused), "capability_missing");

  await humanQuery(sc.alice, "select clara.grant_firm_capability($1,$2,$3,$4)",
    [sc.bob, "close_and_attest", "pr2c attended begin control", opk("pr2c-c3-grant")]);
  const granted = await rootQuery(
    `select count(*)::int as n from clara.firm_capability_grants
      where user_id=$1 and capability='close_and_attest' and revoked_at is null`, [sc.bob]);
  assert.equal(granted.rows[0].n, 1, "the target grant is live before the positive call");
  const acted = await begin(attended, sc.fy);
  assert.equal(acted.status, "acted");

  await humanQuery(sc.alice, "select clara.revoke_firm_capability($1,$2,$3,$4)",
    [sc.bob, "close_and_attest", "pr2c attended begin revoke", opk("pr2c-c3-revoke")]);
  const refusedAgain = await caught(() => begin(attended, sc.fy));
  assert.equal(refusedAgain?.code, CLR.authz);
  assert.equal(detailReason(refusedAgain), "capability_missing", "revocation restores the wall");

  const admin = await scene("pr2c_c3_admin");
  await humanQuery(admin.alice, "select clara.set_client_fy_end($1,$2,$3,$4)",
    [admin.client, 12, 31, opk("pr2c-c3-fye")]);
  const humanRun = await beginClose(admin.alice, { fy: admin.fy });
  assert.ok(humanRun.close_run_id);
  await humanQuery(admin.alice, "select clara.finalize_close($1,$2,$3)",
    [admin.fy, "pr2c admin positive control", opk("pr2c-c3-fin")]);
  const adminSession = await mintChatCloseSession(admin.firm, admin.client, admin.bob);
  const rankRefused = await caught(() => openFy(
    adminSession, admin.client, "FY2026 before promotion", "2026-01-01"));
  assert.equal(rankRefused?.code, CLR.authz);
  assert.equal(detailReason(rankRefused), "insufficient_role");
  const membership = await rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [admin.firm, admin.bob]);
  await humanQuery(admin.alice, "select clara.set_member_role($1,$2,$3)",
    [membership.rows[0].id, "admin", opk("pr2c-c3-promote")]);
  const rank = await rootQuery(
    "select role from clara.firm_memberships where id=$1", [membership.rows[0].id]);
  assert.equal(rank.rows[0].role, "admin", "the directing human is independently proven admin");
  const opened = await openFy(adminSession, admin.client, "FY2026 after promotion", "2026-01-01");
  assert.equal(opened.status, "acted", "the exact same attended door passes after real promotion");
});

test("fa4pr2c.4 refused-credential trio pins W2, W5, and M2 specifically", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c4");
  const interactive = await mintLegacy("interactive", sc.firm, sc.bob, null);
  const w2 = await caught(() => listFy(
    { ...interactive, task: freshUuid() }, sc.client, freshUuid().replaceAll("-", "")));
  assert.equal(w2?.code, CLR.wake, "CLR03 -- the allowlist wall");
  assert.ok(!w2?.detail, "W2 has no structured detail, unlike the client-pin wall");
  assert.match(String(w2?.message ?? ""), /may not call/i, "the allowlist's own refusal message");

  // Constraint B: NULL obo deliberately skips W3, and list_fiscal_years is viewer-bucket too.
  const unbound = await mintLegacy("interactive_client", sc.firm, null, sc.client);
  const w5 = await caught(() => listFy(
    { ...unbound, task: freshUuid() }, sc.client, freshUuid().replaceAll("-", "")));
  assert.equal(w5?.code, CLR.wake);
  assert.equal(detailReason(w5), "wake_task_unbound", "the valid client pin reached W5");

  const task = await createChatTask(sc.firm, sc.client, sc.bob);
  const m2 = await caught(() => rootQuery(
    "select * from clara.mint_chat_close_credential($1,$2,$3,null,'00:15:00'::interval)",
    [sc.firm, sc.client, task.task]));
  assert.equal(m2?.code, CLR.badRequest);
  assert.equal(detailReason(m2), "on_behalf_of_required");
});

// Mutant M3: relax the kind check. MUST-RED: cell 5 wrong-kind arm. MUST-NOT-RED: cells 1-4,6-9.
// Mutant M4: drop the liveness rung. MUST-RED: cell 5 completed arm. MUST-NOT-RED: cells 1-4,6-9.
test("fa4pr2c.5 task kind and liveness are separate M6/M7 walls", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c5");
  const clocked = await mintClosePrepSession(sc.firm, sc.client);
  const wrongKind = await caught(() => rootQuery(
    "select * from clara.mint_chat_close_credential($1,$2,$3,$4,'00:15:00'::interval)",
    [sc.firm, sc.client, clocked.task, sc.bob]));
  assert.equal(wrongKind?.code, CLR.notFound);
  assert.equal(detailReason(wrongKind), "wake_task_incongruent");

  const completed = await createChatTask(sc.firm, sc.client, sc.bob);
  await completeChatTask(completed.task);
  const dead = await caught(() => rootQuery(
    "select * from clara.mint_chat_close_credential($1,$2,$3,$4,'00:15:00'::interval)",
    [sc.firm, sc.client, completed.task, sc.bob]));
  assert.equal(dead?.code, "CLR13", "M7 uses the task-lifecycle-conflict family");
  assert.equal(detailReason(dead), "wake_task_not_live");
});

test("fa4pr2c.6 foreign fiscal year and wrong client are byte-indistinguishable at W4", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c6a");
  const foreign = await scene("pr2c_c6b");
  const attended = await mintChatCloseSession(sc.firm, sc.client, sc.bob);
  // Constraint A: get-plan and list-fiscal-years are both viewer/no-gap verbs, so W3 passes.
  const foreignFy = await caught(() => getPlan(attended, foreign.fy));
  const missingFy = await caught(() => getPlan(attended, freshUuid()));
  const wrongClient = await caught(() => listFy(attended, foreign.client));
  assert.deepEqual(caughtShape(foreignFy), caughtShape(wrongClient),
    "an existing foreign FY and a wrong client disclose the exact same code/detail/message bytes");
  assert.deepEqual(caughtShape(foreignFy), caughtShape(missingFy),
    "an existing foreign FY and a nonexistent FY disclose the exact same refusal bytes");
  assert.equal(foreignFy?.code, CLR.wake);
  assert.equal(detailReason(foreignFy), "wake_client_pin_mismatch");
});

test("fa4pr2c.7 both minters retain the same four congruence facts without token drift", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c7a");
  const other = await scene("pr2c_c7b");
  const oldMint = (firm, client, task) => rootQuery(
    "select * from clara.mint_wake_credential_for_task('close_prep',$1,$2,$3,'00:15:00'::interval)",
    [firm, client, task]);
  const newMint = (firm, client, task) => rootQuery(
    "select * from clara.mint_chat_close_credential($1,$2,$3,$4,'00:15:00'::interval)",
    [firm, client, task, sc.bob]);
  const compareBytes = async (oldCall, newCall, label) => {
    const [a, b] = await Promise.all([caught(oldCall), caught(newCall)]);
    assert.equal(refusalToken(a), refusalToken(b), `${label}: SQLSTATE + DETAIL bytes match`);
  };
  const unknownFirm = freshUuid();
  await compareBytes(() => oldMint(unknownFirm, sc.client, null),
    () => newMint(unknownFirm, sc.client, null), "bad firm");
  await compareBytes(() => oldMint(sc.firm, sc.client, null),
    () => newMint(sc.firm, sc.client, null), "task mandatory");
  const absentTask = freshUuid();
  await compareBytes(() => oldMint(sc.firm, sc.client, absentTask),
    () => newMint(sc.firm, sc.client, absentTask), "task congruence");

  const oldClient = await caught(() => oldMint(sc.firm, other.client, null));
  const newClient = await caught(() => newMint(sc.firm, other.client, null));
  assert.equal(oldClient?.code, newClient?.code, "bad client uses the same CLR10 family");
  assert.match(detailReason(oldClient), /_client_incongruent$/);
  assert.match(detailReason(newClient), /_client_incongruent$/);
  assert.notEqual(detailReason(oldClient), detailReason(newClient),
    "the established kind-named reasons legitimately differ; code-and-shape, not text equality");
});

// M1 MUST-NOT-RED control and M5 MUST-NOT-RED control: this cell walks catalogs, not A8/hash logic.
test("fa4pr2c.8 law-71 census: exact rows/grants and zero reserved reachability", async (t) => {
  if (gate(t)) return;
  await assertPR2CWallCensus();
});

test("fa4pr2c.9 PR-A boundary: Tier-A raises write no receipt and therefore emit no DB card fact", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c9");
  const attended = await mintChatCloseSession(sc.firm, sc.client, sc.bob);
  const beforeRows = await rootQuery(
    "select count(*)::int as n from clara.agent_act_receipts where wake_task_id=$1", [attended.task]);
  const refused = await caught(() => listFy(attended, sc.client, "0".repeat(64)));
  assert.equal(refused?.code, CLR.badRequest);
  assert.equal(detailReason(refused), "op_key_not_derived");
  const afterRows = await rootQuery(
    "select count(*)::int as n from clara.agent_act_receipts where wake_task_id=$1", [attended.task]);
  assert.equal(afterRows.rows[0].n, beforeRows.rows[0].n,
    "Tier A raises before reserve/receipt; PR-B must test cards only for receipted Tier-B/C outcomes");
});

test("fa4pr2c.10 task created_by, not a caller-chosen qualified human, directs A8 authority", async (t) => {
  if (gate(t)) return;
  const sc = await scene("pr2c_c10");
  const qualified = await rootQuery(
    `select count(*)::int as n from clara.firm_memberships m
      where m.firm_id=$1 and m.user_id=any($2::uuid[]) and m.status='active'
        and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')`,
    [sc.firm, [sc.bob, sc.alice]]);
  assert.equal(qualified.rows[0].n, 2, "both Bob and Alice independently pass the earlier M3 floor");
  const bobTask = await createChatTask(sc.firm, sc.client, sc.bob);
  const mismatch = await caught(() => rootQuery(
    "select * from clara.mint_chat_close_credential($1,$2,$3,$4,'00:15:00'::interval)",
    [sc.firm, sc.client, bobTask.task, sc.alice]));
  assert.equal(mismatch?.code, CLR.notFound);
  assert.equal(detailReason(mismatch), "wake_task_director_mismatch",
    "the new director wall fires after M3, never on_behalf_of_incongruent");
  const matching = await mintChatCloseSession(sc.firm, sc.client, sc.bob);
  assert.ok(matching.credentialId, "created_by = on_behalf_of remains the admitted control");
});
