// Slice-6 rig — COUNTERPARTY CORE: registration-dominant identity, the match
// fingerprint, birth races, the filing-keyed one-open-draft law, and double-code
// refusal. Contract-blind: derived from contract §5 + companion §2 + §12 +
// INTERFACE-PINS §1/§2 — NEVER from 0009. Every test SKIPS until 0009 lands.
//
// Identity ladder [C-5/NEW-3, companion §2]:
//   (1) registration_normalized equal  -> reuse THAT row (registration DOMINATES)
//   (2) proposal has a registration but a name-equal row carries a DIFFERENT
//       non-null registration            -> CLR23 conflict-refusal (never reuse)
//   (3) proposal has NO registration but a REGISTERED vendor matches the name
//                                         -> ambiguity refusal (candidate surfaced)
//   (4) name_normalized equal among registration-null rows -> reuse
//   (5) else                              -> birth (+ counterparty.created)
// Vendor birth happens at APPROVE (nothing exists until approval, S6-R8). The
// propose-time decision persists as journal_entries.match_fingerprint; approve
// re-resolves and compares the FULL fingerprint — ANY divergence -> CLR23.
//
// WHERE a conflict/ambiguity surfaces (draft vs approve) is a build choice; the
// LAW is that it is refused with CLR23. The `expectRefusalInFlow` helper asserts
// CLR23 at draft-or-approve and records which step fired (an interface note).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROUTINE_CENTS,
  assertRaises,
  assertRaisesReason,
  opk,
  rootQuery,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  CLR23,
  CLR21,
  REASON,
  normalize,
  firmOf,
  upsertPayableAccount,
  draftEntryV3,
  approveEntry,
  billLines,
  seedCitedDocument,
  ev,
  counterpartyRows,
  entryLines,
  balanced,
  freshResolution,
  FIELD,
} from "./s6-helpers.mjs";

let ready = false;
let world = null;
const AP = "400-000"; // RPR trade-creditors control code (widened domain)

before(async () => {
  ready = await s6EnsureReady();
  if (ready) {
    world = await buildWorld();
    await upsertPayableAccount(world.users.alice, { client: world.clients.A1, code: AP, name: "Trade Creditors", opKey: opk("ap") });
    await upsertPayableAccount(world.users.alice, { client: world.clients.A2, code: AP, name: "Trade Creditors", opKey: opk("ap") });
  }
});
after(async () => {
  printLaneNotes("s6-counterparty");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

/** A human vendor-carrying draft (memo/non-document; Dr expense / Cr payable). A
 *  non-document draft still needs a valid client resolution (CLR01); a manual one
 *  is subject-independent. */
async function vendorDraft(sub, { client, vendor, amount = ROUTINE_CENTS, memo = "vendor draft" }) {
  return draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "manual", subjectId: null }), memo,
    lines: billLines(world.coa[clientKey(client)].expense, AP, amount),
    vendor, opKey: opk("vd"),
  });
}
function clientKey(client) {
  return client === world.clients.A1 ? "A1" : client === world.clients.A2 ? "A2" : "A1";
}

/** Assert a proposal is refused with CLR23 somewhere in draft→approve; record where. */
async function expectRefusalInFlow(sub, { client, vendor, label }) {
  let draft;
  try {
    draft = await vendorDraft(sub, { client, vendor });
  } catch (e) {
    if (e.code === CLR23) { noteLane(`${label}: CLR23 refused at DRAFT time (resolution runs at propose)`); return; }
    throw new Error(`${label}: draft raised ${e.code} (${e.message}); expected CLR23 (at draft) or a clean draft then CLR23 at approve`);
  }
  await assertRaises(CLR23, () => approveEntry(sub, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ap") }), `${label}: CLR23 at approve`);
  noteLane(`${label}: CLR23 refused at APPROVE time (birth re-resolution)`);
}

// ===========================================================================
// Identity ladder.
// ===========================================================================

test("§2(1) registration DOMINATES: same registration, differently-formatted name → the SECOND approval reuses the SAME counterparty (one row)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const reg = "201901000001";
  const d1 = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "ACME SDN BHD", registration_no: reg } } });
  await approveEntry(sub, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("ap") });
  const after1 = await counterpartyRows(clients.A1);
  assert.equal(after1.length, 1, "the first approval births exactly one counterparty");
  const born = after1[0];
  assert.equal(born.registration_normalized, normalize(reg), "registration is normalized (N-F6)");

  const d2 = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "Acme  Sdn. Bhd.", registration_no: reg } } });
  await approveEntry(sub, { entry: d2.entry_id, expectedRevision: d2.revision_token, opKey: opk("ap") });
  const after2 = await counterpartyRows(clients.A1);
  assert.equal(after2.length, 1, "the second approval REUSES the registration-matched vendor (registration dominates the differing name)");
  const lines2 = await entryLines(d2.entry_id);
  const payable2 = lines2.find((l) => l.account_code === AP);
  assert.equal(payable2.counterparty_id, born.id, "the second entry's payable line points at the SAME counterparty");
});

test("§2(2) registration CONFLICT: same normalized name, DIFFERENT registration → CLR23 (never reuse)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  // Birth ACME reg=A first.
  const d = await vendorDraft(sub, { client: clients.A2, vendor: { new: { name: "CONFLICTCO SDN BHD", registration_no: "201900000010" } } });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  // A same-name proposal with a DIFFERENT registration must never reuse — CLR23.
  await expectRefusalInFlow(sub, { client: clients.A2, vendor: { new: { name: "CONFLICTCO SDN BHD", registration_no: "209999999999" } }, label: "registration conflict" });
});

test("§2(3) ambiguity: NO registration but a REGISTERED vendor matches the name → refuse (CLR23), never silently birth a duplicate", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const d = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "BETA REGISTERED BHD", registration_no: "201911111111" } } });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  const before = (await counterpartyRows(clients.A1)).length;
  await expectRefusalInFlow(sub, { client: clients.A1, vendor: { new: { name: "BETA REGISTERED BHD" } }, label: "registered-name-without-registration ambiguity" });
  assert.equal((await counterpartyRows(clients.A1)).length, before, "no duplicate vendor was born beside the registered one");
});

test("§2(4) name match among UNREGISTERED rows → reuse (one row)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const d1 = await vendorDraft(sub, { client: clients.A2, vendor: { new: { name: "GAMMA TRADING" } } });
  await approveEntry(sub, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("ap") });
  const one = (await counterpartyRows(clients.A2)).filter((c) => c.name_normalized === normalize("GAMMA TRADING"));
  assert.equal(one.length, 1, "an unregistered vendor is born once");
  const d2 = await vendorDraft(sub, { client: clients.A2, vendor: { new: { name: "gamma trading" } } });
  await approveEntry(sub, { entry: d2.entry_id, expectedRevision: d2.revision_token, opKey: opk("ap") });
  const still = (await counterpartyRows(clients.A2)).filter((c) => c.name_normalized === normalize("GAMMA TRADING"));
  assert.equal(still.length, 1, "the second unregistered proposal REUSES the name-matched row (case 4)");
});

test("§2(2) same-name / DIFFERENT registration is a CONFLICT (case 2), not a dual birth: the second proposal → CLR23", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  // Birth ECHO reg=...001.
  const d1 = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "ECHO ENTERPRISE", registration_no: "201800000001" } } });
  await approveEntry(sub, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("ap") });
  // A same-NAME proposal carrying a DIFFERENT non-null registration is case 2 → CLR23
  // (the ladder refuses BEFORE birth, even though the registration unique would permit it).
  await expectRefusalInFlow(sub, { client: clients.A1, vendor: { new: { name: "ECHO ENTERPRISE", registration_no: "201800000002" } }, label: "same-name/different-registration" });
  const echoes = (await counterpartyRows(clients.A1)).filter((c) => c.name_normalized === normalize("ECHO ENTERPRISE"));
  assert.equal(echoes.length, 1, "no second same-name vendor is born beside the first (case 2 conflict, not a dual birth)");
});

test("counterparty.created event is emitted on birth; a payable line at approve carries counterparty_id", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const firm = await firmOf(clients.A1);
  const d = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "EVENTCO SDN BHD", registration_no: "201700000009" } } });
  const beforeEv = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='counterparty.created'", [firm])).rows[0].n;
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  const afterEv = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='counterparty.created'", [firm])).rows[0].n;
  assert.equal(afterEv, beforeEv + 1, "exactly one counterparty.created event on birth");
  const line = (await entryLines(d.entry_id)).find((l) => l.account_code === AP);
  assert.ok(line.counterparty_id, "the approved payable line carries a counterparty_id (intrinsic-subledger floor)");
});

// ===========================================================================
// Fingerprint congruence at approve — a changed match landscape refuses [NEW-3].
// ===========================================================================

test("NEW-3 fingerprint divergence: a draft's decision=birth becomes registration_match after another draft births it → approve refuses CLR23", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const reg = "201600000077";
  // draft1 proposes a NEW vendor (fingerprint decision=birth) — not approved yet.
  const d1 = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "ZULU HOLDINGS", registration_no: reg } } });
  // draft2 proposes the same vendor and is approved FIRST → births ZULU.
  const d2 = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "ZULU HOLDINGS", registration_no: reg } } });
  await approveEntry(sub, { entry: d2.entry_id, expectedRevision: d2.revision_token, opKey: opk("ap") });
  // Now d1's persisted fingerprint (birth) diverges from a fresh re-resolution
  // (registration_match) → CLR23. The convergent act is revise_entry (lifecycle suite).
  await assertRaises(CLR23, () => approveEntry(sub, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("ap") }), "stale-fingerprint approve refuses");
});

test("match_fingerprint is persisted at propose (decision + name_normalized)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const d = await vendorDraft(users.alice, { client: clients.A2, vendor: { new: { name: "FINGERPRINTCO", registration_no: "201500000033" } } });
  const fp = (await rootQuery("select match_fingerprint from clara.journal_entries where id=$1", [d.entry_id])).rows[0].match_fingerprint;
  assert.ok(fp, "the draft carries a match_fingerprint after propose");
  assert.ok(["birth", "registration_match", "name_match_unregistered"].includes(fp.decision), `fingerprint.decision is a known token (got ${fp?.decision})`);
  assert.equal(fp.name_normalized, normalize("FINGERPRINTCO"), "fingerprint carries the normalized name");
});

// ===========================================================================
// One-open-draft law (filing-keyed) + double-code refusal [C-15 / P6 / §12].
// ===========================================================================

test("§2 one-open-draft is FILING-keyed: a second draft on the SAME filing → CLR21 double_coded; a draft on a DIFFERENT filing of a shared doc succeeds", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const sub = users.alice;
  const cited = await seedCitedDocument(sub, { firm, client: clients.A1 });
  const lines = balanced(world.coa.A1, ROUTINE_CENTS);
  const evi = [ev(cited.regionId, cited.quote, FIELD.total)];
  const first = await draftEntryV3(sub, { client: clients.A1, resolution: await freshResolution(sub, clients.A1), document: cited.documentId, sha256: cited.sha256, lines, evidence: evi, opKey: opk("f1") });
  assert.ok(first.entry_id, "the first draft on a filing succeeds");
  // A second OPEN draft on the SAME filing trips the partial unique → CLR21 double_coded.
  await assertRaisesReason(CLR21, REASON.doubleCoded,
    () => draftEntryV3(sub, { client: clients.A1, resolution: freshResolution(sub, clients.A1), document: cited.documentId, sha256: cited.sha256, lines, evidence: evi, opKey: opk("f2") }),
    "second open draft on the same filing → CLR21 double_coded");

  // Shared doc A+B: file the SAME document to a sibling client → two filings; each
  // filing gets its own coding.
  const { fileDocument } = await import("./rig-docs-fixtures.mjs");
  await fileDocument(sub, { document: cited.documentId, client: clients.A2, resolution: await freshResolution(sub, clients.A2, { subjectKind: "document", subjectId: cited.documentId }) });
  const bDraft = await draftEntryV3(sub, { client: clients.A2, resolution: await freshResolution(sub, clients.A2), document: cited.documentId, sha256: cited.sha256, lines: balanced(world.coa.A2, ROUTINE_CENTS), evidence: evi, opKey: opk("fB") });
  assert.ok(bDraft.entry_id, "a draft on client B's DISTINCT filing of the shared doc succeeds (filing-keyed, not doc-keyed)");
});

test("double-code: an APPROVED unreversed entry already binds the active filing → a NEW draft on that filing → CLR21 double_coded", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const sub = users.alice;
  const cited = await seedCitedDocument(sub, { firm, client: clients.A1 });
  const lines = balanced(world.coa.A1, ROUTINE_CENTS);
  const evi = [ev(cited.regionId, cited.quote, FIELD.total)];
  const d = await draftEntryV3(sub, { client: clients.A1, resolution: await freshResolution(sub, clients.A1), document: cited.documentId, sha256: cited.sha256, lines, evidence: evi, opKey: opk("dc1") });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  await assertRaisesReason(CLR21, REASON.doubleCoded,
    () => draftEntryV3(sub, { client: clients.A1, resolution: freshResolution(sub, clients.A1), document: cited.documentId, sha256: cited.sha256, lines, evidence: evi, opKey: opk("dc2") }),
    "new draft on a filing already bound by an approved unreversed entry → CLR21 double_coded");
});
