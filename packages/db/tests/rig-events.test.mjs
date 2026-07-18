// Slice-3 rig — the EVENT SPINE, part 1: EMISSION + ABORT PURITY (contract §4.1/§4.2).
// Adversarial, contract-driven suite for migration 0005, written straight from
// scratchpad/slice3-design.md v2.1 — a SECOND implementation of the contract that
// cross-checks lane-migration's schema. Where the schema diverges, the assertion
// stays as the contract states (a suspected defect), never weakened.
//
// The rest of the event-spine suite: rig-events-freshness.test.mjs (§3 replay + §4
// freshness gate), rig-events-structure.test.mjs (§5 isolation/matrix, §6 append-only,
// §7 catalog/validation, §8 context pack, §9 deadlocks, §10 stamping, §P6 allocator),
// and rig-events-upgrade.test.mjs (§4.11 reset-gated upgrade/cutover).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  ROLES,
  AGENT_USER_ID,
  HIGH_STAKES_CENTS,
  ROUTINE_CENTS,
  assertRaises,
  balanced,
  opk,
  sha,
  rootQuery,
  human,
  ensureReady,
  buildWorld,
  endPool,
  draftEntry,
  approveEntry,
  reverseEntry,
  recordResolution,
  ingestDocument,
  recordNotification,
  createClient,
  createFirm,
  addMember,
  setMemberRole,
  removeMember,
  upsertAccount,
  freshResolution,
  mintWake,
  membershipId,
  insertUser,
  seedAdmission,
  eventsReady,
  maxSeq,
  counterN,
  eventsSince,
  allSeqs,
  seedFreshFirm,
  EVT,
} from "./rig-events-helpers.mjs";

let world = null;
let ready = false;

before(async () => {
  await ensureReady(); // apply migrations (idempotent, advisory-locked)
  ready = await eventsReady(); // the Slice-3 surface (domain_events + _append_event)
  if (ready) world = await buildWorld();
});
after(endPool);

/** true → the event spine is not present yet (0005 not landed); skip. */
function unready(t) {
  if (!ready) {
    t.skip("Slice-3 event spine not present — lane-migration 0005 not yet applied");
    return true;
  }
  return false;
}

const P = () => `evt_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
const types = (rows) => rows.map((e) => e.event_type);

// ===========================================================================
// §1 — EMISSION: every audited writer emits exactly its contract event set.
// ===========================================================================
test("§1 emission: human writers each emit exactly their contract event, ids/actor correct", async (t) => {
  if (unready(t)) return;
  const prefix = P();
  const owner = await insertUser(prefix, "owner");
  const token = await seedAdmission();

  // create_firm → firm.created (firm-level; actor = creator; no wake fields)
  const firm = await createFirm(owner, { name: `${prefix}_firm`, token, opKey: opk() });
  let ev = await eventsSince(firm, 0);
  assert.deepEqual(types(ev), [EVT.firmCreated], "create_firm emits exactly firm.created");
  assert.equal(ev[0].client_id, null, "firm.created is firm-level (client_id null)");
  assert.equal(ev[0].actor, owner, "firm.created actor = creator");
  assert.equal(ev[0].via_wake_kind, null, "human event carries no via_wake_kind");
  assert.equal(ev[0].on_behalf_of, null, "human event carries no on_behalf_of");

  // create_client → client.created
  let m = await maxSeq(firm);
  const client = await createClient(owner, { name: `${prefix}_c1`, opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.clientCreated], "create_client emits exactly client.created");
  assert.equal(ev[0].client_id, client, "client.created carries the new client id");
  assert.equal(ev[0].actor, owner);

  // upsert_account → account.upserted
  m = await maxSeq(firm);
  await upsertAccount(owner, { client, code: "1000", name: "Cash", type: "asset", opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.accountUpserted], "upsert_account emits exactly account.upserted");
  assert.equal(ev[0].client_id, client);
  await upsertAccount(owner, { client, code: "4000", name: "Sales", type: "income", opKey: opk() });
  await upsertAccount(owner, { client, code: "9990", name: "Rounding", type: "equity", special: "rounding", opKey: opk() });

  // add_member → member.added (firm-level)
  const bob = await insertUser(prefix, "bob");
  m = await maxSeq(firm);
  await addMember(owner, { firm, user: bob, role: "bookkeeper", opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.memberAdded], "add_member emits exactly member.added");
  assert.equal(ev[0].client_id, null, "member.added is firm-level");

  // set_member_role → member.role_changed
  const bobM = await membershipId(firm, bob);
  m = await maxSeq(firm);
  await setMemberRole(owner, { membership: bobM, role: "admin", opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.memberRoleChanged], "set_member_role emits exactly member.role_changed");

  // remove_member → member.removed (add a throwaway viewer so we never hit last-owner)
  const carol = await insertUser(prefix, "carol");
  await addMember(owner, { firm, user: carol, role: "viewer", opKey: opk() });
  const carolM = await membershipId(firm, carol);
  m = await maxSeq(firm);
  await removeMember(owner, { membership: carolM, opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.memberRemoved], "remove_member emits exactly member.removed");

  // ingest_document → document.ingested
  m = await maxSeq(firm);
  const doc = await ingestDocument(human(owner), { client, sha256: sha(randomUUID()), opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.documentIngested], "ingest_document emits exactly document.ingested");
  assert.equal(ev[0].client_id, client);
  assert.equal(ev[0].document_id, doc, "document.ingested carries the document id");

  // record_client_resolution → client.resolved
  m = await maxSeq(firm);
  const res = await recordResolution(human(owner), { client, confidence: 0.98, opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.clientResolved], "record_client_resolution emits exactly client.resolved");
  assert.equal(ev[0].client_id, client);
  assert.equal(ev[0].resolution_id, res, "client.resolved carries the resolution id");

  // record_notification → notification.recorded
  m = await maxSeq(firm);
  await recordNotification(human(owner), { client, kind: "rig.note", opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.notificationRecorded], "record_notification emits exactly notification.recorded");
  assert.equal(ev[0].client_id, client);

  // draft_entry → entry.drafted
  const res2 = await recordResolution(human(owner), { client, confidence: 0.98, opKey: opk() });
  m = await maxSeq(firm);
  const draft = await draftEntry(human(owner), { client, resolution: res2, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.entryDrafted], "draft_entry emits exactly entry.drafted");
  assert.equal(ev[0].client_id, client);
  assert.equal(ev[0].entry_id, draft.entry_id, "entry.drafted carries the entry id");

  // approve_entry → entry.approved
  m = await maxSeq(firm);
  await approveEntry(owner, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk() });
  ev = await eventsSince(firm, m);
  assert.deepEqual(types(ev), [EVT.entryApproved], "approve_entry emits exactly entry.approved");
  assert.equal(ev[0].entry_id, draft.entry_id, "entry.approved carries the entry id");
});

test("§1 emission: a routine reversal emits drafted+approved(mirror) + reversed(original)", async (t) => {
  if (unready(t)) return;
  const { owner, firm, client, coa } = await seedFreshFirm(P(), "rev");
  const res = await freshResolution(owner, client);
  const draft = await draftEntry(human(owner), { client, resolution: res, lines: balanced(coa, ROUTINE_CENTS), opKey: opk() });
  await approveEntry(owner, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk() });

  const m = await maxSeq(firm);
  const rev = await reverseEntry(owner, { entry: draft.entry_id, reason: "correction", opKey: opk() });
  const ev = await eventsSince(firm, m);
  assert.deepEqual(
    types(ev).sort(),
    [EVT.entryDrafted, EVT.entryApproved, EVT.entryReversed].sort(),
    "routine reverse emits the mirror draft+approve and the original's reversed",
  );
  assert.equal(ev.find((e) => e.event_type === EVT.entryReversed).entry_id, draft.entry_id, "entry.reversed carries the ORIGINAL id");
  assert.equal(ev.find((e) => e.event_type === EVT.entryApproved).entry_id, rev.reversal_id, "entry.approved carries the MIRROR id");
  assert.equal(ev.find((e) => e.event_type === EVT.entryDrafted).entry_id, rev.reversal_id, "entry.drafted carries the MIRROR id");
});

test("§1 emission: high-stakes reverse emits only entry.drafted; approving the mirror emits approved(mirror)+reversed(original)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  const res = await freshResolution(users.bob, clients.A1);
  const hs = await draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines: balanced(coa.A1, HIGH_STAKES_CENTS), opKey: opk() });
  await approveEntry(users.alice, { entry: hs.entry_id, expectedRevision: hs.revision_token, opKey: opk() });

  let m = await maxSeq(firms.A);
  const rev = await reverseEntry(users.bob, { entry: hs.entry_id, reason: "hs correction", opKey: opk() });
  let ev = await eventsSince(firms.A, m);
  assert.deepEqual(types(ev), [EVT.entryDrafted], "high-stakes reverse emits only entry.drafted (mirror lands draft)");
  assert.equal(ev[0].entry_id, rev.reversal_id);

  const mtok = (await rootQuery("select revision_token from clara.journal_entries where id = $1", [rev.reversal_id])).rows[0].revision_token;
  m = await maxSeq(firms.A);
  await approveEntry(users.alice, { entry: rev.reversal_id, expectedRevision: mtok, opKey: opk() });
  ev = await eventsSince(firms.A, m);
  assert.deepEqual(types(ev).sort(), [EVT.entryApproved, EVT.entryReversed].sort(), "approving the mirror emits approved(mirror)+reversed(original)");
  assert.equal(ev.find((e) => e.event_type === EVT.entryReversed).entry_id, hs.entry_id, "entry.reversed carries the original");
  assert.equal(ev.find((e) => e.event_type === EVT.entryApproved).entry_id, rev.reversal_id, "entry.approved carries the mirror");
});

test("§1 emission: wake writers stamp actor=agent, via_wake_kind, on_behalf_of", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  const cred = await mintWake({ kind: "interactive", firm: firms.A, onBehalfOf: users.bob });
  let m = await maxSeq(firms.A);
  const doc = await ingestDocument({ kind: "wake", role: ROLES.wakeInteractive, secret: cred.secret }, { client: clients.A1, sha256: sha(randomUUID()), opKey: opk(), wake: true });
  let ev = await eventsSince(firms.A, m);
  assert.deepEqual(types(ev), [EVT.documentIngested], "wake_ingest_document emits document.ingested");
  assert.equal(ev[0].actor, AGENT_USER_ID, "wake event actor = the global agent id (never a human)");
  assert.equal(ev[0].via_wake_kind, "interactive", "wake event via_wake_kind = interactive");
  assert.equal(ev[0].on_behalf_of, users.bob, "wake event on_behalf_of = the credential's obo");
  assert.equal(ev[0].document_id, doc);

  const cred2 = await mintWake({ kind: "interactive", firm: firms.A });
  m = await maxSeq(firms.A);
  await recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: cred2.secret }, { kind: "rig.wnote", opKey: opk(), wake: true });
  ev = await eventsSince(firms.A, m);
  assert.deepEqual(types(ev), [EVT.notificationRecorded]);
  assert.equal(ev[0].actor, AGENT_USER_ID);
  assert.equal(ev[0].on_behalf_of, null, "a no-obo credential → on_behalf_of null");
});

test("§1 emission: per-firm seq is strictly monotonic and DENSE (no gaps) across a burst", async (t) => {
  if (unready(t)) return;
  const { owner, firm, client, coa } = await seedFreshFirm(P(), "dense");
  for (let i = 0; i < 6; i++) {
    const res = await freshResolution(owner, client);
    const d = await draftEntry(human(owner), { client, resolution: res, lines: balanced(coa, ROUTINE_CENTS), opKey: opk() });
    await approveEntry(owner, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk() });
  }
  const seqs = await allSeqs(firm);
  assert.ok(seqs.length >= 6, "the burst produced events");
  assert.equal(seqs[0], 1, "the firm's first event is seq 1 (firm.created)");
  for (let i = 0; i < seqs.length; i++) assert.equal(seqs[i], i + 1, `seq is dense + monotonic at index ${i} (got ${seqs[i]})`);
  assert.equal(await counterN(firm), seqs[seqs.length - 1], "firm_event_seq.n == the max committed seq");
});

// ===========================================================================
// §2 — ABORT PURITY: a failing writer emits nothing and leaves no gap.
// ===========================================================================
test("§2 abort purity: an unbalanced draft (CLR07) emits NO event and leaves NO seq gap", async (t) => {
  if (unready(t)) return;
  const { owner, firm, client, coa } = await seedFreshFirm(P(), "abort");
  const resFail = await freshResolution(owner, client);
  const resOk = await freshResolution(owner, client);
  const before = await maxSeq(firm);

  const over = [
    { account_code: coa.cash, debit_cents: 10000, credit_cents: 0 },
    { account_code: coa.sales, debit_cents: 0, credit_cents: 9990 }, // residual 10c > 5c → CLR07
  ];
  await assertRaises(CLR.balance, () => draftEntry(human(owner), { client, resolution: resFail, lines: over, opKey: opk() }), "unbalanced draft");
  assert.equal(await maxSeq(firm), before, "the aborted writer emitted no event");

  const d = await draftEntry(human(owner), { client, resolution: resOk, lines: balanced(coa, ROUTINE_CENTS), opKey: opk() });
  const ev = await eventsSince(firm, before);
  assert.equal(ev.length, 1, "only the successful draft emitted");
  assert.equal(ev[0].entry_id, d.entry_id);
  assert.equal(ev[0].seq, before + 1, "the next event fills before+1 — the aborted allocation reverted (no gap)");
});
