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
} from "./authority-ref-human-instruction-fixtures.mjs";
import { mintAgentTaskRef } from "./fa-authority-sign-compat.mjs";
import {
  faWorld, p651Client, proposeAuthority, signWithRef, authorityRows,
  printLaneNotes, printSkipCount, endPool, x41EnsureReady,
} from "./depreciation-history-fixtures.mjs";

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
