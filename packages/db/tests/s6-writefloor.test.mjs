// Slice-6 rig — DELTA PROBE (3): the write floor + the supplier-bill shape floor.
// Contract-blind: derived from contract §2/§5 + companion §2/§3 + §12 +
// INTERFACE-PINS §1/§2 — NEVER from 0009. Every test SKIPS until 0009 lands.
//
// Probe (3) VERBATIM: "VERIFY-ON-RIG payable-floor behavior on approve_entry,
// low-stakes reverse_entry, high-stakes reversal approval, pending-mirror
// adoption, and wrong-client correction, incl. zero-payable drafts."
//
// The supplier-bill floor [C-3/NEW-2, companion §2]: `_assert_supplier_bill_shape`
// keys on the entry's own coding_kind='supplier_bill' (NEVER on
// documents.document_kind) AND reversal_of IS NULL → at least one payable-class
// CREDIT line; EVERY payable-class line (any entry/path) carries counterparty_id;
// enforced at every approved-transition by a deferred constraint trigger + early
// writer-body CLR23s. coding_kind is set via the wake write-tool (p_coding_kind)
// at birth, so supplier-bill drafts use the wake lane. NOTE (task #36, 0028):
// coding_kind is NO LONGER immutable while status stays 'draft' — the vendor
// identity binding divergence mechanism (`revise_entry`) strips it (along with
// `vendor_binding_id`) when a human diverges a binding-backed draft's
// counterparty, by ratified design (`_tf_entry_immutable`'s draft->draft
// allowset now names both columns). The write floor still fully protects both
// columns during every OTHER status transition (draft->approved/withdrawn,
// approved->approved) and still protects every non-allowlisted column at every
// transition including draft->draft.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROUTINE_CENTS,
  HIGH_STAKES_CENTS,
  assertRaises,
  opk,
  rootQuery,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  CLR,
  CLR23,
  CODING_KIND,
  firmOf,
  upsertPayableAccount,
  upsertAccountClassed,
  draftEntryV3,
  approveEntry,
  reverseEntry,
  billLines,
  balanced,
  seedCitedDocument,
  ev,
  mintInteractive,
  wakeDraftEntry,
  entryRow,
  entryLines,
  freshResolution,
  FIELD,
} from "./s6-helpers.mjs";

let ready = false;
let world = null;
const AP = "400-000";
const EXP = "500-A01"; // an RPR-style expense code (widened domain)

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
  printLaneNotes("s6-writefloor");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

/** Build a wake supplier-bill draft bound to a freshly-cited document. Returns
 *  { draft, cited }. Amount → both legs; vendor proposed (born at approve). */
async function supplierBillDraft(sub, { client, amount = ROUTINE_CENTS, vendor = { new: { name: "BRIGHTPATH SDN BHD", registration_no: "201801000123" } }, codingKind = CODING_KIND, lines = null } = {}) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client });
  const cred = await mintInteractive(firm);
  const res = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  const draft = await wakeDraftEntry(cred, {
    client, resolution: res,
    lines: lines ?? billLines(EXP, AP, amount),
    document: cited.documentId, sha256: cited.sha256,
    vendor, evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    codingKind, opKey: `code-doc:${cited.filingId}:${cited.documentId}`,
  });
  return { draft, cited };
}

// ===========================================================================
// The supplier-bill shape floor + the coding_kind marker.
// ===========================================================================

test("a supplier_bill draft carries the coding_kind='supplier_bill' marker (set by the wake write tool, NOT derived from document_kind); the write floor still blocks every non-allowlisted column", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { draft } = await supplierBillDraft(users.alice, { client: clients.A1 });
  const row = await entryRow(draft.entry_id);
  assert.equal(row.coding_kind, CODING_KIND, "the draft's coding_kind is 'supplier_bill'");
  // coding_kind (task #36, 0028) is now in the draft->draft allowset — the vendor-binding
  // divergence mechanism relies on exactly this to strip it. Prove the widening is real...
  await assert.doesNotReject(
    () => rootQuery("update clara.journal_entries set coding_kind=null, updated_at=now() where id=$1", [draft.entry_id]),
    "coding_kind is draft->draft mutable by ratified design (0028 Slot B divergence)",
  );
  // ...but every column OUTSIDE the allowset is still fully immutable at draft->draft —
  // posting_date is never in any status transition's allowset, at any migration.
  await assertRaises(CLR.immutable, () => rootQuery("update clara.journal_entries set posting_date=posting_date-1,updated_at=now() where id=$1", [draft.entry_id]), "posting_date is immutable post-insert");
});

test("bill-shape happy path: Dr expense / Cr payable + vendor → approve births vendor, stamps counterparty_id on the payable credit line", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { draft } = await supplierBillDraft(users.alice, { client: clients.A1, amount: ROUTINE_CENTS });
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ap") });
  const row = await entryRow(draft.entry_id);
  assert.equal(row.status, "approved", "the supplier bill approves");
  const payable = (await entryLines(draft.entry_id)).find((l) => l.account_code === AP);
  assert.ok(payable.counterparty_id, "the approved payable credit line carries a counterparty_id");
});

test("bill-shape refusal: a supplier_bill with NO payable-class CREDIT line → CLR23 (at draft or approve; never a silent post)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  // Dr expense / Cr sales (income) — balanced, carries a vendor, but NO payable credit.
  const lines = [
    { account_code: EXP, debit_cents: ROUTINE_CENTS, credit_cents: 0, description: "exp" },
    { account_code: world.coa.A1.sales, debit_cents: 0, credit_cents: ROUTINE_CENTS, description: "sales" },
  ];
  let draft;
  try {
    ({ draft } = await supplierBillDraft(users.alice, { client: clients.A1, lines }));
  } catch (e) {
    assert.equal(e.code, CLR23, `a supplier bill with no payable credit is refused at DRAFT with CLR23 (got ${e.code} — ${e.message})`);
    return;
  }
  await assertRaises(CLR23, () => approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ap") }), "supplier bill with no payable credit → CLR23 at approve");
});

test("universal payable-line clause: a NON-bill draft with a payable-class line but NO vendor → CLR23 at approve", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  // Human (non-supplier-bill) draft: Dr expense / Cr payable, but no proposed_counterparty.
  const d = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "manual", subjectId: null }),
    lines: billLines(EXP, AP, ROUTINE_CENTS), memo: "payable without vendor", opKey: opk("nv"),
  });
  await assertRaises(CLR23, () => approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") }), "payable line without a counterparty at approve → CLR23");
});

test("zero-payable exemption: a plain balanced draft with NO payable line approves normally (the bill-shape floor does not over-fire)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const d = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "manual", subjectId: null }),
    lines: balanced(world.coa.A1, ROUTINE_CENTS), memo: "plain non-bill entry", opKey: opk("z"),
  });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  assert.equal((await entryRow(d.entry_id)).status, "approved", "a non-bill, no-payable entry approves without any counterparty");
});

// ===========================================================================
// reverse_entry + reversal approval copy the counterparty onto the mirror
// (the payable leg inverts to a debit; reversal_of IS NULL scopes off the
// payable-CREDIT clause, but the payable-line-needs-counterparty clause holds).
// ===========================================================================

test("low-stakes reverse_entry copies counterparty_id onto the auto-approved mirror's payable (now debit) line", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { draft } = await supplierBillDraft(users.alice, { client: clients.A1, amount: ROUTINE_CENTS });
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ap") });
  const origPayable = (await entryLines(draft.entry_id)).find((l) => l.account_code === AP);

  const rev = await reverseEntry(users.alice, { entry: draft.entry_id, reason: "rig reversal", opKey: opk("rev") });
  assert.equal(rev.status, "approved", "a low-stakes reversal auto-approves the mirror");
  const mirror = rev.reversal_id;
  const mirrorPayable = (await entryLines(mirror)).find((l) => l.account_code === AP);
  assert.ok(mirrorPayable, "the mirror has a line on the payable account (inverted to a debit)");
  assert.equal(mirrorPayable.counterparty_id, origPayable.counterparty_id, "the mirror's payable line copies the original counterparty_id (C-3)");
  assert.ok(mirrorPayable.debit_cents > 0, "the payable leg inverted to a debit on the reversal mirror");
});

test("high-stakes reversal: the mirror stays a draft; a DISTINCT checker approves it (bill-shape trigger fires, mirror is reversal_of-scoped, counterparty copied)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  // A high-stakes supplier bill (>= RM10k). The wake-drafted original has no human
  // editor, so bob can approve it without a distinct checker — but WA-D5 now requires
  // a non-blank attestation on an agent-made high-stakes approval (else CLR05).
  const { draft } = await supplierBillDraft(users.alice, { client: clients.A1, amount: HIGH_STAKES_CENTS });
  await approveEntry(users.bob, { entry: draft.entry_id, expectedRevision: draft.revision_token, attestation: "rig hs attest", opKey: opk("ap") });

  // bob reverses → the mirror is high-stakes → stays DRAFT with last_human_editor=bob.
  const rev = await reverseEntry(users.bob, { entry: draft.entry_id, reason: "rig hs reversal", opKey: opk("rev") });
  assert.equal(rev.status, "draft", "a high-stakes reversal mirror stays a draft (needs a distinct approver)");
  const mirror = rev.reversal_id;
  const mrow = await entryRow(mirror);

  // bob (the maker/editor) approving the high-stakes mirror → CLR05 distinct-checker.
  await assertRaises(CLR.makerChecker, () => approveEntry(users.bob, { entry: mirror, expectedRevision: mrow.revision_token, opKey: opk("ap") }), "self-approval of a high-stakes mirror → CLR05");
  // alice (distinct checker) approves → succeeds; the mirror's payable line carries the copied counterparty.
  await approveEntry(users.alice, { entry: mirror, expectedRevision: mrow.revision_token, opKey: opk("ap") });
  const mirrorPayable = (await entryLines(mirror)).find((l) => l.account_code === AP);
  assert.equal((await entryRow(mirror)).status, "approved", "the distinct checker approves the high-stakes reversal");
  assert.ok(mirrorPayable.counterparty_id, "the approved high-stakes mirror's payable line carries a copied counterparty_id");
});

test("client isolation on the payable line: journal_lines.counterparty_id carries a COMPOSITE tenant FK (id, firm_id, client_id) → counterparties (C-6)", async (t) => {
  if (unready(t)) return;
  // Blind structural check: the FK on journal_lines.counterparty_id references
  // counterparties on the FULL (id, firm_id, client_id) tuple, so a line cannot
  // structurally cite another client's or firm's vendor.
  const r = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='journal_lines' and c.contype='f'
        and pg_get_constraintdef(c.oid) ilike '%counterpart%'`,
  );
  assert.ok(r.rowCount >= 1, "a FK from journal_lines to counterparties exists");
  const def = r.rows.map((x) => x.def).join(" | ");
  assert.ok(/counterparty_id/.test(def) && /firm_id/.test(def) && /client_id/.test(def), `the counterparty FK is composite over (counterparty_id, firm_id, client_id) — got: ${def}`);
});
