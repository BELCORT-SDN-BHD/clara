// F-A3 PR-3 (OQ-6, chatTurn_v14, owner ruling 2026-08-25) -- BANK CHAT PARITY acceptance.
//
// Proves the runtime half's two load-bearing facts, DB-side, CONTRACT-BLIND (no runtime TS
// imported here -- chatTurn.v14.bank.ts's own SQL text is asserted, not exercised, since a rig
// test cannot load an AI SDK workflow closure):
//
//   v14.reach   -- a client-pinned `interactive_client` credential, minted OBO a real human, can
//                  now EXECUTE a bank wake_* wrapper end to end (the sibling grant migration
//                  this PR ships makes `clara_wake_interactive` reach all 13 bank wake_*
//                  wrappers -- an extend-only Postgres ACL widening, argued in that file's own
//                  header).
//   v14.provenance -- the resulting bank_agent_receipts row names the real human and the real
//                  credential kind. RE-VERIFIED GREEN 2026-08-25 (from THIS instrument,
//                  independently, on the combined tree carrying lane-fa3-pr1a's SS5 provenance
//                  threading -- `clara._agent_wake_ctx` + the `_agent_bank_receipt` VALUES
//                  recut, 0129_f_a3_pr3_retirement_parity_doors.sql). This cell was a `{ todo:
//                  ... }` cell before SS5 landed (every `_agent_<verb>_core`, 0121, hardcoded
//                  is_agent=true/on_behalf_of=null/wake_kind='bank_agent' regardless of the real
//                  wake context) -- the flip to a genuine, unweakened GREEN is the joint
//                  acceptance proof the owner's ruling asked for.
//   v14.negative-twin -- an AUTONOMOUS bank_agent-kind call is completely unaffected: it still
//                  writes the exact agent-shaped receipt it always has. Proves the grant/allowlist
//                  widening this PR makes is additive, not a change to the existing unattended
//                  lane's own behaviour.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  a21EnsureReady, buildWorld, firmOf, upsertAccountClassed, grantConsent, idOf,
} from "./a21-helpers.mjs";
import { BANKCOA1, hasBankMatching, addBankAccount } from "./x38-match-fixtures.mjs";
import { wakeQuery, ROLES, AGENT_USER_ID } from "./rig-helpers.mjs";
import { RATIONALE, MODEL, mintCred, callWrapper } from "./f-a3-pr1b-wake-fixtures.mjs";

let ready = false;
let world = null;
let bankAccount = null;

function skipHere(t) {
  if (!ready) {
    markSkip();
    t.skip("chatTurn_v14 bank-parity surface not present -- dormant (needs F-A3 PR-3's SS4 + this PR's grant migration + PR-1c's bank_matching purpose)");
    return true;
  }
  return false;
}

/** Probed live, never assumed (review law 3): does clara_wake_interactive actually hold EXECUTE
 *  on the bank pack read? This is the ONE fact chatTurn_v14's own grant migration exists to make
 *  true, and it is the precondition every cell below depends on. */
async function grantLive() {
  const r = await rootQuery(
    `select has_function_privilege('clara_wake_interactive',
       'clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)'::regprocedure, 'execute') as ok`);
  return r.rows[0]?.ok === true;
}

/** get_bank_pack via a chat-shaped (`interactive_client`) credential -- the ONE mint path
 *  chatTurn.v14.infra.ts's `bankScoped` uses, replayed here at the SQL layer. */
async function chatGetPack(secret, client, bankAccountId, opKey) {
  return wakeQuery(ROLES.wakeInteractive, secret,
    callWrapper("wake_get_bank_pack", [
      { name: "p_client", cast: "uuid" }, { name: "p_bank_account", cast: "uuid" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }]),
    [client, bankAccountId, RATIONALE, JSON.stringify(MODEL), opKey]);
}

before(async () => {
  const base = await a21EnsureReady();
  const grant = base.base && (await hasBankMatching()) ? await grantLive() : false;
  ready = Boolean(base.base && (await hasBankMatching()) && grant);
  if (!ready) { noteLane("chatTurn_v14 bank-parity surface absent -- suite dormant"); return; }
  world = await buildWorld();
  const client = world.clients.A1;
  const sub = world.users.alice;
  await upsertAccountClassed(sub, { client, code: BANKCOA1, name: "Maybank current (v14pr)", type: "asset", opKey: opk("v14pr-bcoa1") });
  await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  const purposeCheck = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid='clara.client_egress_purpose_consents'::regclass and contype='c'
         and pg_get_constraintdef(oid) like '%purpose = ANY%'`);
  if (purposeCheck.rows[0]?.def?.includes("bank_matching")) {
    const firm = await firmOf(client);
    const { consentEvidenceDoc } = await import("./wave-b/wb-0020-helpers.mjs");
    const evidence = await consentEvidenceDoc(sub, { firm });
    const consent = await rootQuery(
      `insert into clara.client_egress_purpose_consents(firm_id, client_id, purpose, scope_note, evidence_document_id, granted_by)
         values ($1,$2,'bank_matching','v14pr test consent',$3,$4) returning id`,
      [firm, client, evidence.documentId, sub]);
    await rootQuery(
      `insert into clara.client_egress_purpose_activations(firm_id, client_id, purpose, consent_id, activated_by)
         values ($1,$2,'bank_matching',$3,$4)`,
      [firm, client, consent.rows[0].id, sub]);
  } else {
    ready = false;
    noteLane("PRE-PR GATE: 'bank_matching' purpose not yet admitted -- v14 bank-parity cells skip");
    return;
  }
  const a = await addBankAccount(sub, { client, coaAccountCode: BANKCOA1, accountNumber: `v14pr${randomUUID().slice(0, 6)}` });
  bankAccount = idOf(a, "bank_account_id", "id");
});

after(async () => {
  printLaneNotes("f-a3-pr3-chatturn-v14-bank-parity");
  printSkipCount("f-a3-pr3-chatturn-v14-bank-parity");
  await endPool();
});

test("v14.reach a client-pinned interactive_client credential, OBO a real human, can EXECUTE the bank pack read end to end", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("interactive_client", firm, world.clients.A1, world.users.bob);
  const r = await chatGetPack(cred.secret, world.clients.A1, bankAccount, opk("v14-reach"));
  assert.notEqual(r.rows[0]?.r?.status, "refused", `the chat-driven pack read must be admitted: ${JSON.stringify(r.rows[0]?.r)}`);
  assert.ok(r.rows[0]?.r?.digest, "the admitted pack read returns a digest (the receipt this closure's own mint path proves out)");
});

test("v14.provenance the receipt from a chat-driven act names the real human and the real credential kind, not the agent -- the joint acceptance proof for the owner's 2026-08-25 ruling", async (t) => {
  // FORMERLY a `{ todo: ... }` cell, BLOCKED on lane-fa3-pr1a's own half: every `_agent_<verb>_
  // core` (0121) hardcoded is_agent=true/on_behalf_of=null/wake_kind='bank_agent' regardless of
  // the real wake context, and `_agent_bank_receipt` hardcoded the same again in the receipt row
  // it wrote. FIXED by SS5 (F-A3 PR-3, this same migration file, `clara._agent_wake_ctx` +
  // the `_agent_bank_receipt` VALUES recut) -- re-verified GREEN here, independently, on the
  // combined tree: this cell flipping from `not ok ... # TODO` to a genuine `ok` (confirmed on
  // this rig before the annotation was dropped) IS the joint acceptance proof the owner's ruling
  // asked for. Never weaken this assertion; if it ever regresses, that is real news.
  //
  // approval_arm (opus finding F5): this cell exercises get_bank_pack, a READ, so it is not
  // the write-verb proof that the receipt's ATTENDED arm actually gates anything -- that
  // sibling proof is f-a3-pr3-doors.test.mjs's own "f-a3pr3.ss5.interactive" cell, which
  // performs a chat-driven MATCH (a write) and asserts the same four columns plus
  // bank_matches.origin='human'. Asserting approval_arm here too, alongside the other three,
  // is still worth doing: it is the SAME receipt row, and a value this cell can cheaply prove
  // should not go unchecked just because the write-side proof lives elsewhere.
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("interactive_client", firm, world.clients.A1, world.users.bob);
  const key = opk("v14-provenance");
  await chatGetPack(cred.secret, world.clients.A1, bankAccount, key);
  const receipt = await rootQuery(
    `select acting_actor, on_behalf_of, via_wake_kind, approval_arm from clara.bank_agent_receipts
      where op_key = $1 and firm_id = $2`,
    [key, firm],
  );
  assert.equal(receipt.rows[0]?.via_wake_kind, "interactive_client", "the receipt should name the REAL credential kind the chat lane used, not the agent's own kind");
  assert.equal(receipt.rows[0]?.on_behalf_of, world.users.bob, "the receipt should name the REAL acting human (the credential's OBO subject)");
  assert.notEqual(receipt.rows[0]?.acting_actor, AGENT_USER_ID, "a chat-driven act must not be attributed to the autonomous agent identity");
  assert.equal(receipt.rows[0]?.approval_arm, "interactive_client_attended", "the receipt's approval_arm should be an ATTENDED value, never agent_unattended");
});

test("v14.negative-twin an AUTONOMOUS bank_agent-kind call still writes the exact agent-shaped receipt it always has -- unaffected by this PR's grant/allowlist widening", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const key = opk("v14-negative-twin");
  const r = await wakeQuery("clara_wake_bank_login", cred.secret,
    callWrapper("wake_get_bank_pack", [
      { name: "p_client", cast: "uuid" }, { name: "p_bank_account", cast: "uuid" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }]),
    [world.clients.A1, bankAccount, RATIONALE, JSON.stringify(MODEL), key]);
  assert.notEqual(r.rows[0]?.r?.status, "refused", `the autonomous pack read must still be admitted: ${JSON.stringify(r.rows[0]?.r)}`);
  const receipt = await rootQuery(
    `select acting_actor, on_behalf_of, via_wake_kind, approval_arm from clara.bank_agent_receipts
      where op_key = $1 and firm_id = $2`,
    [key, firm],
  );
  assert.equal(receipt.rows[0]?.via_wake_kind, "bank_agent", "the autonomous lane's own receipt still names bank_agent, byte-unchanged");
  assert.equal(receipt.rows[0]?.on_behalf_of, null, "the autonomous lane's receipt still carries no on_behalf_of");
  assert.equal(receipt.rows[0]?.acting_actor, AGENT_USER_ID, "the autonomous lane's receipt still attributes to the agent identity, exactly as before this PR");
  assert.equal(receipt.rows[0]?.approval_arm, "agent_unattended", "the autonomous lane's approval_arm is unchanged");
});

test("v14.reread the same-segment fresh-read seam: two reads of the same account within one segment both admit (readSeq), and an act reaches PAST digest verification citing either digest (C2's task-scoped binding)", async (t) => {
  // MUST fix, split finding (Codex adversarial round 2026-08-25): the runtime half
  // (chatTurn.v14.bank.ts's readSeq counter) and the DB half (lane-fa3-pr1a's
  // _agent_verify_inputs_digest recut, split_part(op_key, ':', 2) task-id binding) were built
  // and reviewed separately by design -- this cell is the ONE place that proves the seam as a
  // WHOLE, since neither f-a3-pr3-doors.test.mjs (the DB half's own battery) nor this file's
  // other cells exercise two reads of the SAME account within what would be one segment.
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("interactive_client", firm, world.clients.A1, world.users.bob);
  const taskId = opk("v14-reread-task");
  const segment = 0;
  const readOpKey = (seq) => `bank-get_bank_pack:${taskId}:${segment}:${JSON.stringify({ bank_account_id: bankAccount, readSeq: seq })}`;
  const read = (seq) =>
    wakeQuery(ROLES.wakeInteractive, cred.secret,
      callWrapper("wake_get_bank_pack", [
        { name: "p_client", cast: "uuid" }, { name: "p_bank_account", cast: "uuid" },
        { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }]),
      [world.clients.A1, bankAccount, RATIONALE, JSON.stringify(MODEL), readOpKey(seq)]);

  const read1 = await read(1);
  assert.notEqual(read1.rows[0]?.r?.status, "refused", `read 1 (readSeq=1) must be admitted: ${JSON.stringify(read1.rows[0]?.r)}`);
  const read2 = await read(2);
  assert.notEqual(read2.rows[0]?.r?.status, "refused", `read 2 (readSeq=2, SAME account, SAME segment) must be admitted -- if this refuses op_key_identity_mismatch, the same-segment re-read bug is back: ${JSON.stringify(read2.rows[0]?.r)}`);
  assert.notEqual(read1.rows[0].r.digest, undefined, "read 1 returns a digest");
  assert.notEqual(read2.rows[0].r.digest, undefined, "read 2 returns a digest");

  // Cite read 1's digest in a same-task act. A nonexistent match_id makes the ACT itself refuse
  // (CLR11, not found) -- the point is proving it gets PAST _agent_verify_inputs_digest first,
  // never that the act succeeds.
  const actOpKey = `bank-unmatch_bank_match:${taskId}:${segment}:${JSON.stringify({ match_id: "00000000-0000-0000-0000-000000000000" })}`;
  await assert.rejects(
    () => wakeQuery(ROLES.wakeInteractive, cred.secret,
      callWrapper("wake_unmatch_bank_match", [
        { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
        { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
      [world.clients.A1, "00000000-0000-0000-0000-000000000000", "v14.reread", RATIONALE, JSON.stringify(MODEL), read1.rows[0].r.digest, actOpKey]),
    (e) => {
      // Must fail on the NOT-FOUND match, never on digest verification -- a CLR10/
      // inputs_digest_unverified here means the task-scoped binding rejected a digest from the
      // SAME task, which is exactly the seam this cell exists to prove closed.
      assert.notEqual(e.detail && String(e.detail).includes("inputs_digest_unverified"), true, `the act must not be refused on digest verification: ${e.code} ${e.message} ${e.detail}`);
      return true;
    },
  );
});
