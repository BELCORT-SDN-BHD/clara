// Slice-6 rig — the human DRAFT-LIFECYCLE writers (revise_entry / withdraw_draft),
// last_human_editor stamping + its maker/checker consequence, revise as the
// convergent re-match act, and op-key replay. Contract-blind: contract §5/§6 +
// companion §8 + §12 + INTERFACE-PINS §1/§2 — NEVER from 0009.
//
// §12 split [N-F15]: the NEW revise/withdraw writers use CLR22 for the
// non-draft/lifecycle refusals; approve_entry KEEPS its as-built CLR10 on a
// non-draft (unchanged shipped semantics). CLR06 = stale token for all three.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROUTINE_CENTS,
  HIGH_STAKES_CENTS,
  assertRaises,
  assertRaisesOneOf,
  opk,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  CLR,
  CLR22,
  CLR23,
  CODING_KIND,
  firmOf,
  upsertPayableAccount,
  upsertAccountClassed,
  seedCitedDocument,
  draftEntryV3,
  approveEntry,
  reviseEntry,
  withdrawDraft,
  billLines,
  ev,
  freshResolution,
  mintInteractive,
  wakeDraftEntry,
  entryRow,
  entryLines,
  FIELD,
} from "./s6-fixtures.mjs";

let ready = false;
let world = null;
const AP = "400-000";
const EXP = "500-A01";

before(async () => {
  ready = await s6EnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
    }
  }
});
after(async () => {
  printLaneNotes("s6-lifecycle");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

/** A wake supplier-bill draft on a freshly-cited doc. */
async function wakeBill(sub, { client, amount = ROUTINE_CENTS, vendor = { new: { name: "REVCO SDN BHD", registration_no: "201801000321" } } }) {
  const firm = await firmOf(client);
  // F-A2 PR-1 (D11): the direction-family arm now binds every agent-lane coded draft, so this
  // shared fixture states its supplier. Direction only — no arithmetic, so nothing corroborates.
  const cited = await seedCitedDocument(sub, { firm, client, direction: "purchase" });
  const cred = await mintInteractive(firm);
  const res = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  const draft = await wakeDraftEntry(cred, {
    client, resolution: res, lines: billLines(EXP, AP, amount),
    document: cited.documentId, sha256: cited.sha256, vendor,
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], codingKind: CODING_KIND,
    opKey: `code-doc:${cited.filingId}:${cited.documentId}`,
  });
  return { draft, cited };
}

/** A human memo (non-document) draft carrying a proposed vendor. */
async function memoVendorDraft(sub, { client, vendor, amount = ROUTINE_CENTS, opKey = null }) {
  return draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "manual", subjectId: null }),
    lines: billLines(EXP, AP, amount), vendor, memo: "lifecycle vendor draft", opKey: opKey ?? opk("mv"),
  });
}

// ===========================================================================
// revise_entry.
// ===========================================================================

test("revise_entry is draft-only: revising an APPROVED entry → CLR22 (the N-F15 split; approve keeps CLR10)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const d = await memoVendorDraft(users.alice, { client: clients.A1, vendor: { new: { name: "APPROVEDCO", registration_no: "201801000900" } } });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  await assertRaises(CLR22, () => reviseEntry(users.alice, { entry: d.entry_id, lines: billLines(EXP, AP, ROUTINE_CENTS), vendor: { new: { name: "APPROVEDCO", registration_no: "201801000900" } }, expectedRevision: d.revision_token }), "revise on an approved entry → CLR22");
});

test("revise_entry: a stale token → CLR06; a successful revise ROTATES the token and replaces the lines", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const d = await memoVendorDraft(users.alice, { client: clients.A1, vendor: { new: { name: "ROTATECO", registration_no: "201801000901" } } });
  await assertRaises(CLR.revision, () => reviseEntry(users.alice, { entry: d.entry_id, lines: billLines(EXP, AP, ROUTINE_CENTS), vendor: { new: { name: "ROTATECO", registration_no: "201801000901" } }, expectedRevision: "00000000-0000-4000-8000-000000000000" }), "revise with a wrong token → CLR06");
  const receipt = await reviseEntry(users.alice, { entry: d.entry_id, lines: billLines(EXP, AP, 250000), vendor: { new: { name: "ROTATECO", registration_no: "201801000901" } }, expectedRevision: d.revision_token });
  const newTok = receipt.revision_token ?? (await entryRow(d.entry_id)).revision_token;
  assert.notEqual(newTok, d.revision_token, "revise rotated the revision token");
  const lines = await entryLines(d.entry_id);
  assert.ok(lines.some((l) => Number(l.debit_cents) === 250000 || Number(l.credit_cents) === 250000), "revise replaced the lines with the new amounts");
});

test("revise_entry re-validates line law: an unbalanced (> 5c) revise → CLR07", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const d = await memoVendorDraft(users.alice, { client: clients.A1, vendor: { new: { name: "BALCO", registration_no: "201801000902" } } });
  const bad = [
    { account_code: EXP, debit_cents: 100000, credit_cents: 0, description: "dr" },
    { account_code: AP, debit_cents: 0, credit_cents: 90000, description: "cr" }, // 100c off → unbalanced
  ];
  await assertRaisesOneOf([CLR.balance, CLR.badRequest], () => reviseEntry(users.alice, { entry: d.entry_id, lines: bad, vendor: { new: { name: "BALCO", registration_no: "201801000902" } }, expectedRevision: d.revision_token }), "unbalanced revise → CLR07");
});

test("C-4 revise stamps last_human_editor → a human who revised an agent's high-stakes bill cannot solo-approve it (CLR05)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  // An agent-drafted high-stakes supplier bill (last_human_editor NULL).
  const { draft, cited } = await wakeBill(users.alice, { client: clients.A1, amount: HIGH_STAKES_CENTS });
  // bob revises it (same shape) → last_human_editor := bob, token rotates.
  const rec = await reviseEntry(users.bob, { entry: draft.entry_id, lines: billLines(EXP, AP, HIGH_STAKES_CENTS), vendor: { new: { name: "REVCO SDN BHD", registration_no: "201801000321" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], expectedRevision: draft.revision_token });
  const tok = rec.revision_token ?? (await entryRow(draft.entry_id)).revision_token;
  assert.equal((await entryRow(draft.entry_id)).last_human_editor, users.bob, "revise stamped last_human_editor = the editor (bob)");
  await assertRaises(CLR.makerChecker, () => approveEntry(users.bob, { entry: draft.entry_id, expectedRevision: tok, opKey: opk("ap") }), "bob (the editor) solo-approving the high-stakes bill → CLR05");
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: tok, opKey: opk("ap") });
  assert.equal((await entryRow(draft.entry_id)).status, "approved", "a distinct checker (alice) approves");
});

test("NEW-3 revise is the convergent re-match: a stale-fingerprint draft (CLR23 at approve) is revised → re-resolves → approves", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const reg = "201801000444";
  const d1 = await memoVendorDraft(users.alice, { client: clients.A2, vendor: { new: { name: "CONVERGECO", registration_no: reg } } });
  const d2 = await memoVendorDraft(users.alice, { client: clients.A2, vendor: { new: { name: "CONVERGECO", registration_no: reg } } });
  await approveEntry(users.alice, { entry: d2.entry_id, expectedRevision: d2.revision_token, opKey: opk("ap") }); // births CONVERGECO
  await assertRaises(CLR23, () => approveEntry(users.alice, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("ap") }), "d1's birth-fingerprint now diverges → CLR23");
  const rec = await reviseEntry(users.alice, { entry: d1.entry_id, lines: billLines(EXP, AP, ROUTINE_CENTS), vendor: { new: { name: "CONVERGECO", registration_no: reg } }, expectedRevision: d1.revision_token });
  const tok = rec.revision_token ?? (await entryRow(d1.entry_id)).revision_token;
  await approveEntry(users.alice, { entry: d1.entry_id, expectedRevision: tok, opKey: opk("ap") });
  assert.equal((await entryRow(d1.entry_id)).status, "approved", "after revise re-resolves to registration_match, approve succeeds (convergent)");
});

// ===========================================================================
// withdraw_draft.
// ===========================================================================

test("withdraw_draft: draft→withdrawn with a reason; withdraw without a reason → CLR22; non-draft → CLR22", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const d = await memoVendorDraft(users.alice, { client: clients.A1, vendor: { new: { name: "WITHDRAWCO", registration_no: "201801000905" } } });
  await assertRaises(CLR22, () => withdrawDraft(users.alice, { entry: d.entry_id, reason: "", expectedRevision: d.revision_token }), "withdraw without a reason → CLR22");
  await withdrawDraft(users.alice, { entry: d.entry_id, reason: "duplicate", expectedRevision: d.revision_token });
  assert.equal((await entryRow(d.entry_id)).status, "withdrawn", "the draft is withdrawn");
  const tok2 = (await entryRow(d.entry_id)).revision_token;
  await assertRaises(CLR22, () => withdrawDraft(users.alice, { entry: d.entry_id, reason: "again", expectedRevision: tok2 }), "withdraw of a non-draft → CLR22");
});

// ===========================================================================
// op-key replay (reserve-first).
// ===========================================================================

test("op-key replay: draft_entry with the same op_key + same args returns a BYTE-IDENTICAL receipt; a different arg-set on the same op_key → CLR10", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const key = opk("replay");
  const res = await freshResolution(users.alice, clients.A1, { subjectKind: "manual", subjectId: null });
  const lines = billLines(EXP, AP, ROUTINE_CENTS);
  const vendor = { new: { name: "REPLAYCO", registration_no: "201801000909" } };
  const first = await draftEntryV3(users.alice, { client: clients.A1, resolution: res, lines, vendor, memo: "replay", opKey: key });
  const replay = await draftEntryV3(users.alice, { client: clients.A1, resolution: res, lines, vendor, memo: "replay", opKey: key });
  assert.deepEqual(replay, first, "a commit→ACK-loss replay (same op_key, same args) returns the byte-identical receipt");
  await assertRaises(CLR.badRequest, () => draftEntryV3(users.alice, { client: clients.A1, resolution: res, lines: billLines(EXP, AP, 999999), vendor, memo: "replay", opKey: key }), "same op_key with a DIFFERENT arg-set → CLR10");
});
