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
