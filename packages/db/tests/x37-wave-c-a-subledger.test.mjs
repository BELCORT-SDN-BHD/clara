// 0037 Wave C-a -- the AR/AP open-item subledger + allocation battery.
//
// CONTRACT-BLIND: written from docs/plan/wave-c-a-subledger-design.md (v2, the
// review-hardened spec) + the orchestrator's pinned interface ONLY -- this lane
// never reads 0037's SQL. Every verb is called by its PINNED name with NAMED
// args; a 42883 / param-name / reason-token divergence at integration is a
// FINDING for orchestrator adjudication, never a silent test edit.
//
// THE ONE IDENTITY the whole slice exists to hold (design section 3):
//     control GL balance = SUM(open_items.amount)   per (client, domain)
// summed over EVERY account of that account_class (plural control accounts are
// legal, so this suite deliberately gives each client TWO receivable and TWO
// payable control accounts). assertTies() re-asserts it after every cell -- from
// zero, after every happy path, and after every refusal.
//
// The cells, in file order:
//   x37.a  the identity holds FROM ZERO (a fresh client, both domains)
//   x37.b  the RM100 three ways: company card / employee claim / director-paid
//          -- none of the three may mint a domain='ap' item (WC-R10)
//   x37.c  a typed supplier_bill mints exactly ONE ap `bill` item; ties
//   x37.d  partial settlement (allocate_receipt) + the typed events
//   x37.e  a batch receipt clearing N open AR items in one group
//   x37.f  over-payment: the residue IS the settlement item's outstanding
//   x37.g  credit application via apply_open_items -- ZERO GL movement
//   x37.h  unallocate -> re-allocate (exact-negation pairs, no double-undo)
//   x37.i  the two-sided bound, BOTH directions (over-allocation AND inflation)
//   x37.j  group law refusals: cross-counterparty + non-zero net per domain
//   x37.k  the concurrent allocation race (two sessions; the locks hold)
//   x37.l  the reversal matrix (clean unwind / settled refused / receipt refused
//          / high-stakes draft mirror approved later fires the hook)
//   x37.m  wrong-client correction of an open-itemed bill -> mirror unwind, ties
//   x37.n  the WCA-R9b named refusals (counterparty kind; cross-domain contra)
//   x37.o  the credit-note wall on allocate_payment
//   x37.p  the A+ belt: a rule-stamped settlement row violates the CHECK
//   x37.q  the A+ core refusal, named: settlement_not_autopostable
//   x37.r  no draft verb can make a settlement kind (WCA-R6/R7)
//   x37.s  authority catalog: composites authenticated-ONLY; cores ungranted;
//          zero wake allowlist entries
//   x37.t  approve_entry passes NO checked_via_rule_id; execute_rule_post stays
//          login-direct only
//   x37.u  the high-stakes threshold: draft -> a DISTINCT checker approves -> ties
//   x37.v  the solo-firm high-stakes variant (attestation)
//   x37.w  the WCA-R8 EVIDENCE PIN (three employee claims still breed a
//          vendor_account proposal -- the debt's live witness, not a fix)
//   x37.x  CLR26: an open client-scope question blocks money movement too
//   x37.y  outbox law: a failed composite leaves ZERO events/items/allocations
//   x37.z  decomposition correctness: a multi-counterparty generic JV and an
//          opening entry, classifier output vs materialised rows
//   x37.aa the structural belt: grain uniqueness (the backfill's idempotency),
//          append-only, force-RLS, the item_kind matrix, the allocation surface
//   x37.ab allocate_payment end-to-end (the AP mirror) with a discount received
//
// Serial discipline: --test-concurrency=1 (the race cell drives two sessions of
// the shared pool by hand, and the identity assertions are cumulative).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, withActor, namedCall, opk,
  endPool, printLaneNotes, printSkipCount, noteLane, markSkip, ROLES,
  a21EnsureReady, buildWorld, firmOf, createClient,
  upsertPayableAccount, upsertAccountClassed, grantConsent,
  freshResolution, draftEntryV3, approveEntry, reverseEntry, counterpartyRows,
  seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, statedIdentityFields, agreedEnvelope, factsRegion, mintInteractive, wakeDraftEntry,
  ev, FIELD, billLines, rm, reasonOf, idOf, roleCanExecute, fnSource, checkDefs,
  uniqueIndexDefs, rlsFlags, entryStatusOf, normalize,
  openQuestion, resolveOpenQuestion, proposeCorrection, approveCorrection,
  assertRaisesOneOf, HIGH_STAKES_CENTS,
} from "./a21-helpers.mjs";
import { holdThenContend, sawDeadlock, GUARD } from "./wave-a-race.mjs";

// ---------------------------------------------------------------------------
// Suite-scoped COA codes. Every one is this suite's OWN (grepped against every
// other battery's codes before choosing) -- two control accounts per class,
// because the tie-out identity is per DOMAIN and must sum over every account of
// the class, never per account.
// ---------------------------------------------------------------------------

const AR1 = "370-C37"; // receivable control  (asset,     account_class='receivable')
const AR2 = "371-C37"; // a SECOND receivable control -- the plural-account leg of the identity
const AP1 = "470-C37"; // payable control     (liability,  account_class='payable')
const AP2 = "471-C37"; // a SECOND payable control
const BANK = "170-C37"; // bank (asset, NO account_class) -- the settlement's non-control leg
const EXPN = "570-C37"; // ordinary expense (the RM100 debit)
const CLAIMX = "572-C37"; // the CLAIM expense -- its own account so x37.w's sighting count is clean
const BIRTHD = "573-C37"; // the counterparty-birth fixture's debit -- isolates the sighting pool
const DISCA = "571-C37"; // discount ALLOWED (expense)  -- allocate_receipt's discount leg
const REVN = "680-C37"; // revenue (income)
const DISCR = "681-C37"; // discount RECEIVED (income)   -- allocate_payment's discount leg
const BIRTHC = "682-C37"; // the birth fixture's credit
const EMPP = "271-C37"; // "amount due to employee" -- LIABILITY, NON-payable-class (WC-R10)
const DIRC = "272-C37"; // director current account -- LIABILITY, NON-payable-class

const CLR05 = "CLR05";
const CLR10 = "CLR10";
const CLR26 = "CLR26";

/** Belt-2's SQLSTATE is contract-SILENT (the design says the new refusals reuse
 *  existing codes and names no code for the deferred bound/group belts). This is
 *  the plausible existing-code set; the cell records the actual as an interface
 *  expectation rather than inventing a CLR. */
const BELT_CODES = [CLR10, "CLR07", "CLR08", "23514"];

let has37 = false;
let world = null;
let owners = null; // client -> the human who owns its firm

/** Loud + COUNTED (the house skip16/x36c0 discipline): a dormant suite must show
 *  up in printSkipCount, never quietly green. */
function skipHere(t) {
  if (!has37) {
    markSkip();
    t.skip("0037 not applied (clara.schema_migrations has no '0037_%' row) -- the Wave-C-a subledger battery is dormant");
    return true;
  }
  return false;
}

async function has0037() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0037_'");
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

before(async () => {
  const ready = await a21EnsureReady();
  has37 = Boolean(ready.base && ready.has16 && (await has0037()));
  if (!has37) {
    noteLane("0037 absent (or the 0011/0016 surface is not ready) -- x37 suite dormant");
    return;
  }
  world = await buildWorld();
  owners = new Map([
    [world.clients.A1, world.users.alice],
    [world.clients.A2, world.users.alice],
    [world.clients.S1, world.users.erin],
  ]);
  for (const [client, sub] of owners) {
    await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (x37)", type: "asset", accountClass: "receivable", opKey: opk("ar1") });
    await upsertAccountClassed(sub, { client, code: AR2, name: "Trade Debtors - retentions (x37)", type: "asset", accountClass: "receivable", opKey: opk("ar2") });
    await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (x37)", opKey: opk("ap1") });
    await upsertPayableAccount(sub, { client, code: AP2, name: "Trade Creditors - accruals (x37)", opKey: opk("ap2") });
    await upsertAccountClassed(sub, { client, code: BANK, name: "Maybank current (x37)", type: "asset", opKey: opk("bank") });
    await upsertAccountClassed(sub, { client, code: EXPN, name: "Prof Fees (x37)", type: "expense", opKey: opk("exp") });
    await upsertAccountClassed(sub, { client, code: CLAIMX, name: "Staff Reimbursables (x37)", type: "expense", opKey: opk("claim") });
    await upsertAccountClassed(sub, { client, code: BIRTHD, name: "Sundry (x37 birth)", type: "expense", opKey: opk("birthd") });
    await upsertAccountClassed(sub, { client, code: DISCA, name: "Discount Allowed (x37)", type: "expense", opKey: opk("disca") });
    await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (x37)", type: "income", opKey: opk("rev") });
    await upsertAccountClassed(sub, { client, code: DISCR, name: "Discount Received (x37)", type: "income", opKey: opk("discr") });
    await upsertAccountClassed(sub, { client, code: BIRTHC, name: "Sundry income (x37 birth)", type: "income", opKey: opk("birthc") });
    // WC-R10: a staff claim credits a NON-`payable`-class liability by GL account
    // convention. No COA template row exists for either, so both are created here
    // through the sanctioned account writer -- never a hand INSERT.
    await upsertAccountClassed(sub, { client, code: EMPP, name: "Amount Due To Employee (x37)", type: "liability", opKey: opk("empp") });
    await upsertAccountClassed(sub, { client, code: DIRC, name: "Director Current Account (x37)", type: "liability", opKey: opk("dirc") });
    await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  }
});

after(async () => {
  printLaneNotes("x37-wave-c-a-subledger");
  printSkipCount("x37-wave-c-a-subledger");
  await endPool();
});

// ---------------------------------------------------------------------------
// Readbacks -- the identity, the items, the allocations, the events. Root
// (superuser bypasses RLS): fixtures and assertions only, never the lane.
// ---------------------------------------------------------------------------

/** The control GL balance of one domain, summed over EVERY account of the class
 *  and over APPROVED entries only (design section 4.4 tail-assert 2). AR is a
 *  debit-positive control, AP a credit-positive one -- the sign convention the
 *  item amounts follow (AR + = the customer owes us; AP + = we owe the supplier). */
async function controlGl(client, domain) {
  const cls = domain === "ar" ? "receivable" : "payable";
  const net = domain === "ar" ? "l.debit_cents - l.credit_cents" : "l.credit_cents - l.debit_cents";
  const r = await rootQuery(
    `select coalesce(sum(${net}),0)::bigint as n
       from clara.journal_lines l
       join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and a.account_class=$2 and e.status='approved'`,
    [client, cls],
  );
  return Number(r.rows[0].n);
}

async function itemsSum(client, domain) {
  const r = await rootQuery(
    "select coalesce(sum(amount_cents),0)::bigint as n from clara.open_items where client_id=$1 and domain=$2",
    [client, domain],
  );
  return Number(r.rows[0].n);
}

/** THE identity, both domains. Called from zero and after every cell. */
async function assertTies(client, label) {
  for (const domain of ["ar", "ap"]) {
    const gl = await controlGl(client, domain);
    const items = await itemsSum(client, domain);
    assert.equal(
      items, gl,
      `${label}: THE IDENTITY (${domain}) -- sum(open_items.amount)=${items} must equal the ${domain} control GL summed over every account of the class (${gl})`,
    );
  }
}

async function itemsOf(entry) {
  const r = await rootQuery(
    "select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1 order by i.domain, i.item_kind, i.id",
    [entry],
  );
  return r.rows.map((x) => x.row);
}

/** outstanding(item) = amount + SUM(its allocations) -- derived, never stored. */
async function outstandingOf(item) {
  const r = await rootQuery(
    `select (i.amount_cents + coalesce(
        (select sum(a.amount_cents) from clara.open_item_allocations a where a.item_id=i.id),0))::bigint as n
       from clara.open_items i where i.id=$1`,
    [item],
  );
  return Number(r.rows[0].n);
}

async function allocationRows(group) {
  const r = await rootQuery(
    "select to_jsonb(a) as row from clara.open_item_allocations a where a.application_group=$1 order by a.created_at, a.id",
    [group],
  );
  return r.rows.map((x) => x.row);
}

/** Allocation rows of a given operation_kind touching any of `items` -- used where
 *  the design does not pin WHICH group the rows join (an undo may negate into the
 *  original group or into a fresh one; the pair mechanics are the assertion). */
async function allocationsByOp(items, op) {
  const r = await rootQuery(
    "select to_jsonb(a) as row from clara.open_item_allocations a where a.item_id = any($1) and a.operation_kind=$2 order by a.created_at, a.id",
    [items, op],
  );
  return r.rows.map((x) => x.row);
}

/** The newest application_group touching an item -- the fallback when a composite's
 *  receipt does not name its group under any of the probed keys. */
async function groupForItem(item) {
  const r = await rootQuery(
    "select application_group from clara.open_item_allocations where item_id=$1 order by created_at desc, id desc limit 1",
    [item],
  );
  return r.rows[0]?.application_group ?? null;
}

/** The classifier's OWN output for one entry -- the only decomposition logic, so
 *  a materialised row that disagrees with it is a real defect. */
async function classifyRows(entry) {
  const r = await rootQuery(
    "select * from clara._subledger_classify_entry($1) order by domain, item_kind",
    [entry],
  );
  return r.rows;
}

async function subledgerEventCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.domain_events where client_id=$1 and event_type like 'open_item.%'",
    [client],
  );
  return r.rows[0].n;
}

async function subledgerEventTypes(client) {
  const r = await rootQuery(
    "select distinct event_type from clara.domain_events where client_id=$1 and event_type like 'open_item.%'",
    [client],
  );
  return r.rows.map((x) => x.event_type).sort();
}

/** Run fn and return the raised error (or null on success) -- the refusal cells
 *  all turn on "was this refused, and with exactly which code/reason". */
async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

// ---------------------------------------------------------------------------
// The four composites -- NAMED args verbatim from the pinned interface. Optional
// trailing params are omitted unless the cell passes one, so a signature that
// defaults them differently still binds.
// ---------------------------------------------------------------------------

async function allocateReceipt(sub, {
  client, counterparty, postingDate = "2026-04-15", memo = "x37 customer receipt",
  bankAccount = BANK, amountCents, allocations = [],
  discountCents = null, discountAccount = null, attestation = null, opKey = null,
  // This suite deliberately gives every client TWO control accounts per class (the
  // plural-accounts tie coverage), so the composite's no-silent-pick law requires the
  // explicit control-account lane on every call.
  controlAccount = AR1,
}) {
  const specs = [
    { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
    { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
    { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const vals = [client, counterparty, postingDate, memo, bankAccount, amountCents, JSON.stringify(allocations), opKey ?? opk("x37-rcpt")];
  if (discountCents != null) { specs.push({ name: "p_discount_cents", cast: "bigint" }); vals.push(discountCents); }
  if (discountAccount != null) { specs.push({ name: "p_discount_account" }); vals.push(discountAccount); }
  if (attestation != null) { specs.push({ name: "p_attestation" }); vals.push(attestation); }
  if (controlAccount != null) { specs.push({ name: "p_control_account" }); vals.push(controlAccount); }
  const r = await humanQuery(sub, namedCall("allocate_receipt", specs), vals);
  return r.rows[0].result;
}

async function allocatePayment(sub, {
  client, counterparty, postingDate = "2026-04-15", memo = "x37 supplier payment",
  bankAccount = BANK, amountCents, allocations = [],
  discountCents = null, discountAccount = null, attestation = null, opKey = null,
  controlAccount = AP1,
}) {
  const specs = [
    { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
    { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
    { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const vals = [client, counterparty, postingDate, memo, bankAccount, amountCents, JSON.stringify(allocations), opKey ?? opk("x37-pay")];
  if (discountCents != null) { specs.push({ name: "p_discount_cents", cast: "bigint" }); vals.push(discountCents); }
  if (discountAccount != null) { specs.push({ name: "p_discount_account" }); vals.push(discountAccount); }
  if (attestation != null) { specs.push({ name: "p_attestation" }); vals.push(attestation); }
  if (controlAccount != null) { specs.push({ name: "p_control_account" }); vals.push(controlAccount); }
  const r = await humanQuery(sub, namedCall("allocate_payment", specs), vals);
  return r.rows[0].result;
}

async function unallocateGroup(sub, { client, group, reason = "x37 unallocate", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("unallocate_group", [{ name: "p_client" }, { name: "p_group" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, group, reason, opKey ?? opk("x37-unalloc")],
  );
  return r.rows[0].result;
}

async function applyOpenItems(sub, { client, applications, reason = "x37 apply", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("apply_open_items", [
      { name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" },
    ]),
    [client, JSON.stringify(applications), reason, opKey ?? opk("x37-apply")],
  );
  return r.rows[0].result;
}

const groupOf = (receipt) => idOf(receipt, "group_id", "application_group", "group");

// ---------------------------------------------------------------------------
// Fixtures -- every synthetic object built THROUGH audited writers (dog-fooding).
// The generic lane is used for the AR/AP item mechanics deliberately: the human
// `draft_entry` verb carries no p_coding_kind at all (0016's core takes it only
// on the wake path), so a human-drafted control entry IS the design's section 4.3
// path-5 `adjustment` item -- exactly the shape WCA-R2 rules on.
// ---------------------------------------------------------------------------

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** Birth a counterparty of `kind` through draft+approve of a tiny non-control
 *  entry (counterparties are born at APPROVE, never at draft). The birth entry
 *  debits BIRTHD -- its own account -- so it can never contribute a sighting to
 *  the pools x37.w counts. */
async function birthCounterparty(sub, { client, name, kind = "vendor", registration = null }) {
  const proposal = { new: { name, ...(registration ? { registration_no: registration } : {}) } };
  if (kind === "customer") proposal.kind = "customer";
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x37 birth ${name}`,
    lines: [
      { account_code: BIRTHD, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: BIRTHC, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: proposal, opKey: opk("x37-birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37-birtha") });
  const want = normalize(name);
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the ${kind} counterparty ${name} was born (mandatory setup)`);
  assert.equal(cp.kind, kind, `${name} was born with kind='${kind}' (the domain<->kind consistency law depends on it)`);
  return cp.id;
}

/** An approved GENERIC control entry: Dr `debit` / Cr `credit`, both = cents,
 *  with `cp` stamped on whichever leg is control-class. Returns the entry id.
 *  `checker` and `attestation` exist because a fixture at or above the firm's
 *  high-stakes threshold must clear the maker-checker floor lawfully: a distinct
 *  checker in a two-checker firm, the self-attestation path in a solo one. */
async function approvedGeneric(sub, {
  client, cp, cpKind = "vendor", debit, credit, cents, memo = "x37 generic", postingDate = "2026-04-01",
  checker = null, attestation = null,
}) {
  // The existing_id lookup in _resolve_counterparty is KIND-scoped and defaults to
  // 'vendor' (0015:1139-1150) — binding a customer on a generic draft MUST state
  // kind:'customer' in the proposal. That is the WCA-R9b lane, not a workaround.
  const proposal = { existing_id: cp };
  if (cpKind !== "vendor") proposal.kind = cpKind;
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: proposal, opKey: opk("x37-gen"),
  });
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37-gena") };
  if (attestation != null) args.attestation = attestation;
  await approveEntry(checker ?? sub, args);
  return d.entry_id;
}

/** An open AR item for `cp` (Dr receivable control / Cr revenue). Returns
 *  { entry, item }. `control` picks which of the TWO receivable accounts, so the
 *  identity is exercised across plural accounts of the class. */
async function openArItem(sub, { client, cp, cents, control = AR1, memo = "x37 sale", checker = null, attestation = null }) {
  const entry = await approvedGeneric(sub, { client, cp, cpKind: "customer", debit: control, credit: REVN, cents, memo, checker, attestation });
  const items = await itemsOf(entry);
  assert.equal(items.length, 1, `an AR control entry mints exactly ONE item (got ${items.length})`);
  assert.equal(items[0].domain, "ar", "the item lands in the ar domain");
  assert.equal(Number(items[0].amount_cents), cents, "the item carries the SIGNED control net (+ = the customer owes us)");
  return { entry, item: items[0].id };
}

/** An open AP item for `cp` (Dr expense / Cr payable control). */
async function openApItem(sub, { client, cp, cents, control = AP1, memo = "x37 purchase", checker = null, attestation = null }) {
  const entry = await approvedGeneric(sub, { client, cp, debit: EXPN, credit: control, cents, memo, checker, attestation });
  const items = await itemsOf(entry);
  assert.equal(items.length, 1, `an AP control entry mints exactly ONE item (got ${items.length})`);
  assert.equal(items[0].domain, "ap", "the item lands in the ap domain");
  assert.equal(Number(items[0].amount_cents), cents, "the item carries the SIGNED control net (+ = we owe the supplier)");
  return { entry, item: items[0].id };
}

/** A facts-complete purchase document (states a ZERO tax and a net equal to its
 *  total -- what such a bill actually prints, and what 0036's nonzero-tax belt
 *  requires of a 2-leg shape). */
async function purchaseDoc(sub, { client, gross }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(gross), kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, rm(gross)),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, "X37 SUPPLIER SDN BHD"),
    factField(FIELD.invoiceId, `X37-${randomUUID().slice(0, 8)}`),
    ...statedIdentityFields(gross),
  ], { envelope: agreedEnvelope() });
  return cited;
}

/** A TYPED supplier_bill, approved -- the only lane that mints coding_kind
 *  ='supplier_bill' is the wake drafter (the human verb carries no coding kind). */
async function approvedSupplierBill(sub, { client, cp, cents, control = AP1 }) {
  const firm = await firmOf(client);
  const cited = await purchaseDoc(sub, { client, gross: cents });
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, FIELD.total);
  const d = await wakeDraftEntry(cred, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines: billLines(EXPN, control, cents), document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp }, evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind: "supplier_bill", opKey: opk("x37-bill"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37-billa") });
  return { entry: d.entry_id, ...cited };
}

// ===========================================================================
// x37.a -- THE IDENTITY FROM ZERO. A brand-new client with a full control COA
// and not one entry: both domains must read 0 = 0. Everything after this cell
// is a delta on a proven-zero base.
// ===========================================================================
test("x37.a the identity holds FROM ZERO: a fresh client with control accounts and no entries ties in both domains", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = await createClient(sub, { name: `x37_zero_${randomUUID().slice(0, 6)}`, opKey: opk("x37-cli") });
  await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (x37)", type: "asset", accountClass: "receivable", opKey: opk("ar1") });
  await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (x37)", opKey: opk("ap1") });
  assert.equal(await itemsSum(client, "ar"), 0, "a fresh client owns no ar items");
  assert.equal(await itemsSum(client, "ap"), 0, "a fresh client owns no ap items");
  await assertTies(client, "x37.a from zero");
});

// ===========================================================================
// x37.b -- THE RM100 THREE WAYS (contract C-a item 9 / WC-R10). The SAME RM100
// restaurant receipt entered three ways must produce, respectively: no open item
// (company card), an employee-payable that is NOT trade AP, and a director
// current account that is NOT trade AP. None of the three may ever appear in
// supplier aging -- which, in this model, means none may mint a domain='ap' item.
// Both liability accounts are created in setup through add-account (there is no
// COA template row for either) with NO account_class, which is precisely what
// keeps them out of the payable class.
// ===========================================================================
test("x37.b the RM100 three ways: company card / employee claim / director-paid -- NONE mints a domain='ap' open item", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const RM100 = 10000;
  const apBefore = await itemsSum(client, "ap");

  const ways = [
    { label: "company card (paid straight from the bank)", credit: BANK },
    { label: "employee claim (amount due to employee -- NON-payable-class)", credit: EMPP },
    { label: "director-paid (director current account -- NON-payable-class)", credit: DIRC },
  ];
  for (const way of ways) {
    const d = await draftEntryV3(sub, {
      client, resolution: await manualRes(sub, client), memo: `x37 RM100 -- ${way.label}`,
      lines: [
        { account_code: EXPN, debit_cents: RM100, credit_cents: 0, description: "meals" },
        { account_code: way.credit, debit_cents: 0, credit_cents: RM100, description: "settled by" },
      ],
      opKey: opk("x37-rm100"),
    });
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37-rm100a") });
    const items = await itemsOf(d.entry_id);
    assert.equal(
      items.filter((i) => i.domain === "ap").length, 0,
      `${way.label}: NO domain='ap' open item may exist -- a staff/director balance is not trade creditor aging (WC-R10)`,
    );
    assert.equal(items.length, 0, `${way.label}: the entry touches no control account at all, so it mints no item in either domain`);
  }
  assert.equal(await itemsSum(client, "ap"), apBefore, "the three RM100 entries moved the ap item total by ZERO");
  await assertTies(client, "x37.b RM100 three ways");
});

// ===========================================================================
// x37.c -- THE F3 DEBT PAID. A typed supplier_bill (the shape the ADR-050
// production autopost produces) now mints exactly one signed ap item behind its
// payable credit, and the classifier agrees with what was materialised.
// ===========================================================================
test("x37.c a typed supplier_bill mints exactly ONE ap `bill` item, classifier-congruent, and ties", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 BILLCO ${randomUUID().slice(0, 6)}`, registration: "201801370001" });
  const cents = 250000; // RM2,500 -- comfortably under the RM10k high-stakes default
  const { entry } = await approvedSupplierBill(sub, { client, cp, cents });

  const items = await itemsOf(entry);
  assert.equal(items.length, 1, `a supplier_bill mints exactly one item (got ${items.length})`);
  assert.equal(items[0].domain, "ap", "the item is an ap item");
  assert.equal(items[0].item_kind, "bill", "the typed anchor gives item_kind='bill' (design section 4.3 path 3)");
  assert.equal(Number(items[0].amount_cents), cents, "+ = we owe the supplier");
  assert.equal(items[0].counterparty_id, cp, "the item carries the canonical counterparty");

  const rows = await classifyRows(entry);
  assert.equal(rows.length, 1, "the classifier produces exactly one row for this entry");
  assert.equal(rows[0].domain, "ap", "classifier domain agrees");
  assert.equal(rows[0].item_kind, "bill", "classifier item_kind agrees");
  assert.equal(Number(rows[0].amount_cents), cents, "classifier amount agrees -- the materialised row IS the classifier's output");
  await assertTies(client, "x37.c typed supplier_bill");
});

// ===========================================================================
// x37.d -- PARTIAL SETTLEMENT. RM1,000 invoice, RM400 receipt: the invoice's
// outstanding falls to RM600, the settlement item is minted at FULL GROSS
// (-RM400) and its own outstanding is zero, the pair nets to zero, and the
// typed events land. This is the balanced-pair model's core claim.
// ===========================================================================
test("x37.d partial settlement: a RM400 receipt against a RM1,000 item leaves RM600 outstanding, the pair nets zero, events land", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 PARTIALCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(sub, { client, cp, cents: 100000 });
  const evBefore = await subledgerEventCount(client);

  const receipt = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 40000,
    allocations: [{ item_id: item, amount_cents: 40000 }],
  });
  assert.equal(receipt.status, "approved", "a below-threshold settlement approves in the SAME call (one transaction)");
  assert.equal(Number(receipt.residue_cents), 0, "a fully-allocated receipt leaves no residue");
  const group = groupOf(receipt);
  assert.ok(group, `the receipt carries its application_group (got ${JSON.stringify(receipt)})`);

  assert.equal(await outstandingOf(item), 60000, "outstanding(invoice) = amount + allocations = RM600");

  const settle = (await itemsOf(receipt.entry_id));
  assert.equal(settle.length, 1, "the settlement entry mints exactly one item of its own");
  assert.equal(settle[0].item_kind, "settlement", "item_kind='settlement'");
  assert.equal(Number(settle[0].amount_cents), -40000, "the settlement item is minted at FULL GROSS, negative");
  assert.equal(await outstandingOf(settle[0].id), 0, "a fully-applied receipt has zero outstanding (no on-account credit)");

  const allocs = await allocationRows(group);
  assert.equal(allocs.length, 2, `the group is a BALANCED PAIR (got ${allocs.length} rows)`);
  assert.equal(allocs.reduce((s, a) => s + Number(a.amount_cents), 0), 0, "the group nets to EXACTLY zero");
  assert.ok(allocs.every((a) => a.operation_kind === "allocate"), "both rows carry operation_kind='allocate'");
  assert.equal(new Set(allocs.map((a) => a.domain)).size, 1, "the group stays inside ONE domain");

  assert.ok(await subledgerEventCount(client) > evBefore, "the composite appended subledger events in-txn");
  const types = await subledgerEventTypes(client);
  for (const want of ["open_item.created", "open_item.allocated"]) {
    assert.ok(types.includes(want), `the typed event ${want} was appended (got ${types.join(",")})`);
  }
  await assertTies(client, "x37.d partial settlement");
});

// ===========================================================================
// x37.e -- BATCH RECEIPT. One Malaysian bank receipt routinely clears several
// invoices; the group law is per (client, domain), never per item, so N+1 rows
// in one group is the normal shape.
// ===========================================================================
test("x37.e a batch receipt clears THREE open AR items in one group; every one goes to zero and the group nets zero", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 BATCHCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  // Deliberately spread across BOTH receivable control accounts -- the identity is
  // per DOMAIN, and a batch may clear items sitting on different control accounts.
  const a = await openArItem(sub, { client, cp, cents: 30000, control: AR1 });
  const b = await openArItem(sub, { client, cp, cents: 45000, control: AR2 });
  const c = await openArItem(sub, { client, cp, cents: 25000, control: AR1 });

  const receipt = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 100000,
    allocations: [
      { item_id: a.item, amount_cents: 30000 },
      { item_id: b.item, amount_cents: 45000 },
      { item_id: c.item, amount_cents: 25000 },
    ],
  });
  assert.equal(receipt.status, "approved", "the batch receipt approves in one call");
  assert.equal(Number(receipt.residue_cents), 0, "the batch is exact -- no residue");
  for (const [label, x] of [["a", a], ["b", b], ["c", c]]) {
    assert.equal(await outstandingOf(x.item), 0, `item ${label} is fully settled`);
  }
  // The as-built writes one balanced PAIR per allocation (finer-grained than an
  // aggregated settlement row: each pair is auditable 1:1 and undoable alone).
  const settleId = (await itemsOf(receipt.entry_id))[0].id;
  const allocs = await allocationRows(groupOf(receipt));
  assert.equal(allocs.length, 6, `three balanced pairs = 6 rows (got ${allocs.length})`);
  assert.equal(allocs.reduce((s, r) => s + Number(r.amount_cents), 0), 0, "the batch group nets EXACTLY zero");
  const settleSide = allocs.filter((r) => r.item_id === settleId);
  assert.equal(settleSide.length, 3, "one settlement-side row per pair");
  assert.equal(settleSide.reduce((s, r) => s + Number(r.amount_cents), 0), 100000, "the settlement side sums to the full batch (+RM1,000)");
  await assertTies(client, "x37.e batch receipt");
});

// ===========================================================================
// x37.f -- OVER-PAYMENT. The residue is not a rounding bucket: it IS the
// settlement item's own outstanding, i.e. a real on-account credit that a later
// invoice can be applied against.
// ===========================================================================
test("x37.f over-payment: the residue equals the settlement item's outstanding (a live on-account credit)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 OVERCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(sub, { client, cp, cents: 100000 });

  const receipt = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 150000,
    allocations: [{ item_id: item, amount_cents: 100000 }],
  });
  assert.equal(Number(receipt.residue_cents), 50000, "residue = (amount + discount) - sum(allocations) = RM500");
  assert.equal(await outstandingOf(item), 0, "the invoice is fully settled");
  const settle = (await itemsOf(receipt.entry_id))[0];
  assert.equal(Number(settle.amount_cents), -150000, "the settlement item is the FULL gross, negative");
  assert.equal(
    await outstandingOf(settle.id), -Number(receipt.residue_cents),
    "outstanding(settlement) = -residue -- the on-account credit is a real, applyable item, not a bucket",
  );
  await assertTies(client, "x37.f over-payment residue");
});

// ===========================================================================
// x37.g -- CREDIT APPLICATION, ZERO GL. apply_open_items nets a negative item
// against a positive one with the same pair mechanics and NO journal movement at
// all: the GL already carries both, so a set-off between them is a subledger
// event, never a posting. (The negative item here is a generic `adjustment`
// credit -- see the DEVIATIONS note in the lane report on why the formal
// sales_credit_note kind is asserted structurally in x37.aa instead.)
// ===========================================================================
test("x37.g apply_open_items nets a credit against an invoice with ZERO GL movement and a zero-net group", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 CREDITCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await openArItem(sub, { client, cp, cents: 80000 });
  // The credit: Dr revenue / Cr receivable control -- a NEGATIVE ar item.
  const credEntry = await approvedGeneric(sub, { client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents: 30000, memo: "x37 credit to customer" });
  const credItem = (await itemsOf(credEntry))[0];
  assert.equal(Number(credItem.amount_cents), -30000, "a receivable CREDIT nets to a NEGATIVE ar item");

  const glBefore = await controlGl(client, "ar");
  const receipt = await applyOpenItems(sub, {
    client,
    applications: [{ source_item_id: credItem.id, target_item_id: inv.item, amount_cents: 30000 }],
  });
  let group = groupOf(receipt);
  if (!group) {
    noteLane(`x37.g apply_open_items' receipt did not name its application_group under group_id/application_group/group (got ${JSON.stringify(receipt)}) -- derived from the written rows; an interface expectation for adjudication`);
    group = await groupForItem(credItem.id);
  }
  assert.ok(group, "the apply wrote an application_group");
  assert.equal(await controlGl(client, "ar"), glBefore, "an apply moves the GL by ZERO -- it is a subledger event, not a posting");
  assert.equal(await outstandingOf(inv.item), 50000, "the invoice falls to RM500 outstanding");
  assert.equal(await outstandingOf(credItem.id), 0, "the credit is fully consumed (toward zero, never past it)");

  const allocs = await allocationRows(group);
  assert.equal(allocs.length, 2, "the apply writes the same balanced PAIR");
  assert.equal(allocs.reduce((s, r) => s + Number(r.amount_cents), 0), 0, "the apply group nets EXACTLY zero");
  assert.ok(allocs.every((r) => r.operation_kind === "apply"), "both rows carry operation_kind='apply'");
  assert.ok((await subledgerEventTypes(client)).includes("open_item.applied"), "open_item.applied was appended");
  await assertTies(client, "x37.g zero-GL apply");
});

// ===========================================================================
// x37.h -- UNALLOCATE then RE-ALLOCATE. The undo is an exact-negation PAIR with
// reverses_allocation_id set (and unique), so the outstanding returns exactly and
// a second undo of the same group is structurally impossible.
// ===========================================================================
test("x37.h unallocate writes exact-negation pairs (no double-undo) and the outstanding is re-allocatable", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 UNDOCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(sub, { client, cp, cents: 70000 });

  const receipt = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 70000,
    allocations: [{ item_id: item, amount_cents: 70000 }],
  });
  const group = groupOf(receipt);
  const settle = (await itemsOf(receipt.entry_id))[0];
  assert.equal(await outstandingOf(item), 0, "settled to zero first");

  const undo = await unallocateGroup(sub, { client, group, reason: "x37 misapplied receipt" });
  assert.ok(undo, "unallocate_group returns a receipt");
  assert.equal(await outstandingOf(item), 70000, "the invoice returns to its FULL outstanding");
  assert.equal(await outstandingOf(settle.id), -70000, "the settlement item returns to its full on-account credit");

  // The design does not pin WHICH group the negations join (the original, or a
  // fresh one), so the rows are found by item + operation_kind -- the pair
  // mechanics and the reverses_allocation_id lineage are the assertion.
  const negations = await allocationsByOp([item, settle.id], "unallocate");
  assert.equal(negations.length, 2, `the undo is an exact-negation PAIR (got ${negations.length} unallocate rows)`);
  assert.equal(negations.reduce((s, r) => s + Number(r.amount_cents), 0), 0, "the undo group nets EXACTLY zero");
  assert.ok(negations.every((r) => r.reverses_allocation_id != null), "every undo row names the allocation it reverses");

  const twice = await caught(() => unallocateGroup(sub, { client, group, reason: "x37 double undo" }));
  assert.ok(twice, "a SECOND unallocate of the same group must be refused -- reverses_allocation_id is unique");

  // Re-allocate the returned outstanding against the SAME settlement item's credit.
  const re = await applyOpenItems(sub, {
    client,
    applications: [{ source_item_id: settle.id, target_item_id: item, amount_cents: 70000 }],
  });
  assert.ok(groupOf(re), "the re-allocation commits");
  assert.equal(await outstandingOf(item), 0, "the invoice settles again");
  assert.equal(await outstandingOf(settle.id), 0, "the on-account credit is consumed again");
  assert.ok((await subledgerEventTypes(client)).includes("open_item.unallocated"), "open_item.unallocated was appended");
  await assertTies(client, "x37.h unallocate then re-allocate");
});

// ===========================================================================
// x37.i -- THE TWO-SIDED BOUND, BOTH DIRECTIONS. sign(amount) * (amount + SUM
// allocations) must stay inside [0, |amount|]:
//   (i)  OVER-ALLOCATION past zero -- refused by the composite, under locks;
//   (ii) INFLATION past face value -- unreachable through any verb (apply's
//        source must be the negative side), so it is probed where it actually
//        lives: a direct root INSERT of a zero-net, same-party, same-domain pair
//        that pushes ONE item above its own face value. Belt-2 must catch it at
//        COMMIT. Its SQLSTATE is contract-silent; the actual code is recorded.
// ===========================================================================
test("x37.i the two-sided bound holds BOTH ways: over-allocation is refused, and a direct-insert inflation pair dies at commit", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const cp = await birthCounterparty(sub, { client, name: `X37 BOUNDCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(sub, { client, cp, cents: 60000 });

  // (i) over-allocation: RM700 of allocations against a RM600 item.
  const over = await caught(() => allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 70000,
    allocations: [{ item_id: item, amount_cents: 70000 }],
  }));
  assert.ok(over, "allocating MORE than an item's outstanding must be refused, never silently clamped");
  assert.equal(over.code, CLR10, `over-allocation refuses CLR10 (got ${over.code} / ${reasonOf(over)} -- ${over.message})`);
  noteLane(`x37.i over-allocation refusal reason: ${reasonOf(over) ?? "(none in DETAIL)"}`);
  assert.equal(await outstandingOf(item), 60000, "the refused composite left the item untouched");

  // Build the headroom the inflation probe needs, and a SECOND item still sitting
  // at FACE value (zero allocations) -- pushing a + row onto an item that is
  // merely at zero outstanding is a lawful un-application, NOT inflation, so the
  // probe has to target an untouched item to isolate the upper bound.
  const receipt = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 90000,
    allocations: [{ item_id: item, amount_cents: 60000 }],
  });
  const settle = (await itemsOf(receipt.entry_id))[0];
  const atFace = await openArItem(sub, { client, cp, cents: 40000, memo: "x37 at-face item" });
  assert.equal(await outstandingOf(atFace.item), 40000, "the second item sits at FACE value -- any + on it is pure inflation");
  assert.equal(await outstandingOf(settle.id), -30000, "the settlement item still carries RM300 of credit");

  // (ii) inflation: +RM500 onto the at-FACE RM400 item (40000 -> 90000, past its
  // own face value), balanced by -RM500 on the settlement item (whose own bound
  // stays satisfied: -90000 + 60000 - 50000 = -80000, inside [-90000, 0]).
  // The group nets zero, stays in ONE domain and ONE canonical counterparty, so
  // the ONLY law it breaks is the per-item upper bound -- exactly the point.
  const inflation = await caught(() => withActor({ transaction: true }, async (c) => {
    const g = randomUUID();
    await c.query(
      `insert into clara.open_item_allocations(firm_id,client_id,domain,item_id,application_group,operation_kind,amount_cents,reason,created_by)
       values($1,$2,'ar',$3,$4,'apply',50000,'x37 inflation probe',$6),
              ($1,$2,'ar',$5,$4,'apply',-50000,'x37 inflation probe',$6)`,
      [firm, client, atFace.item, g, settle.id, sub],
    );
  }));
  assert.ok(inflation, "an allocation pair that inflates an item PAST its face value must be refused at commit");
  await assertRaisesOneOf(BELT_CODES, () => Promise.reject(inflation), "belt-2 two-sided bound (inflation)");
  noteLane(`x37.i inflation refusal SQLSTATE ${inflation.code} -- belt-2's code is contract-silent; recorded as an interface expectation`);
  assert.equal(await outstandingOf(atFace.item), 40000, "the aborted insert left the at-face item untouched -- the abort is total");
  assert.equal(await outstandingOf(item), 0, "and the settled item too");
  await assertTies(client, "x37.i two-sided bound");
});

// ===========================================================================
// x37.j -- THE GROUP LAW (the teeming-and-lading wall). A cross-counterparty
// set-off is a GL event and must ride a (refused -> split) GL entry, never an
// application; and a group that does not net to exactly zero per (client,
// domain) is not an application at all.
// ===========================================================================
test("x37.j group law: a cross-counterparty apply is refused, and a non-zero-net direct-insert group dies at commit", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const alpha = await birthCounterparty(sub, { client, name: `X37 ALPHACO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const beta = await birthCounterparty(sub, { client, name: `X37 BETACO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const invAlpha = await openArItem(sub, { client, cp: alpha, cents: 40000 });
  const credBetaEntry = await approvedGeneric(sub, { client, cp: beta, cpKind: "customer", debit: REVN, credit: AR1, cents: 40000, memo: "x37 beta credit" });
  const credBeta = (await itemsOf(credBetaEntry))[0];

  const cross = await caught(() => applyOpenItems(sub, {
    client,
    applications: [{ source_item_id: credBeta.id, target_item_id: invAlpha.item, amount_cents: 40000 }],
  }));
  assert.ok(cross, "applying ONE party's credit to ANOTHER party's invoice must be refused (the teeming-and-lading wall)");
  assert.equal(cross.code, CLR10, `the cross-party apply refuses CLR10 (got ${cross.code} -- ${cross.message})`);
  noteLane(`x37.j cross-counterparty refusal reason: ${reasonOf(cross) ?? "(none in DETAIL)"} -- message: ${String(cross.message).slice(0, 160)}`);
  assert.equal(await outstandingOf(invAlpha.item), 40000, "the refused apply moved nothing");

  // A non-zero-net group, direct-inserted: ONE lonely -RM200 row against a live
  // RM400 item. The amount is deliberately INSIDE the item's own two-sided bound
  // (outstanding falls to RM200, still in [0, RM400]) so the ONLY law it breaks
  // is the group's zero-net rule -- otherwise this probe would prove the bound
  // again instead of the group law.
  const lonely = await caught(() => withActor({ transaction: true }, async (c) => {
    await c.query(
      `insert into clara.open_item_allocations(firm_id,client_id,domain,item_id,application_group,operation_kind,amount_cents,reason,created_by)
       values($1,$2,'ar',$3,$4,'apply',-20000,'x37 non-zero-net probe',$5)`,
      [firm, client, invAlpha.item, randomUUID(), sub],
    );
  }));
  assert.ok(lonely, "an application_group that does not net to zero per (client,domain) must be refused at commit");
  await assertRaisesOneOf(BELT_CODES, () => Promise.reject(lonely), "belt-2 group zero-net law");
  noteLane(`x37.j non-zero-net refusal SQLSTATE ${lonely.code} -- recorded as an interface expectation`);
  assert.equal(await outstandingOf(invAlpha.item), 40000, "the aborted insert left the item untouched");
  await assertTies(client, "x37.j group law");
});

// ===========================================================================
// x37.k -- THE CONCURRENT ALLOCATION RACE. Two sessions each try to take the
// whole outstanding of the SAME item. The write-skew both design reviews found
// is closed by validating under locks, so the second session must BLOCK (proven
// via pg_blocking_pids -- a schedule that never blocked proves nothing) and then
// lose against the first session's COMMITTED state. Exactly one wins.
// ===========================================================================
test("x37.k concurrent allocation race: the second session BLOCKS (proven) and then loses -- exactly one allocation wins", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = world.clients.A1;
  const cp = await birthCounterparty(users.alice, { client, name: `X37 RACECO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(users.alice, { client, cp, cents: 55000 });

  const call = (opKey) => (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      `select clara.allocate_receipt(p_client => $1, p_counterparty => $2, p_posting_date => $3::date,
         p_memo => $4, p_bank_account => $5, p_amount_cents => $6::bigint,
         p_allocations => $7::jsonb, p_op_key => $8, p_control_account => $9) as r`,
      [client, cp, "2026-04-20", "x37 race receipt", BANK, 55000,
        JSON.stringify([{ item_id: item, amount_cents: 55000 }]), opKey, AR1],
    );
    return r.rows[0].r;
  })();

  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: call(opk("x37-raceA")) },
    b: { role: ROLES.authenticated, jwtSub: users.bob, run: call(opk("x37-raceB")) },
  });
  assert.ok(out.provedBlocked, "session B BLOCKED on session A's locks (blocking-pid proven) -- there is no check-then-act window");
  assert.ok(!sawDeadlock(out), `no deadlock in either direction (a=${out.a?.code ?? "ok"} b=${out.b?.code ?? "ok"})`);
  assert.equal(out.a.ok, true, `session A committed its allocation (got ${out.a.code} -- ${out.a.message})`);
  assert.equal(out.b.ok, false, "session B did NOT also allocate the same outstanding -- the second full allocation is refused");
  noteLane(`x37.k losing session code=${out.b.code} reason=${String(out.b.message).slice(0, 160)}`);
  assert.equal(await outstandingOf(item), 0, "the item is settled EXACTLY once (outstanding zero, never negative)");
  await assertTies(client, "x37.k allocation race");
});

// ===========================================================================
// x37.l -- THE REVERSAL MATRIX (contract item 8, resolved). Four shapes:
//   (1) an UNSETTLED item reverses cleanly -- the unwind is an exact negation;
//   (2) a SETTLED item REFUSES ("unallocate first") until it is unallocated;
//   (3) the RECEIPT itself refuses while its own allocations live;
//   (4) a HIGH-STAKES reversal leaves a DRAFT mirror; approving it later fires
//       the hook through approve path 1 and the books tie.
// Unwind is keyed on reversal_of, never on a copied coding_kind -- the mirror
// carries neither coding_kind nor document_id, by design.
// ===========================================================================
test("x37.l reversal matrix: clean unwind / settled refused until unallocated / receipt refused / high-stakes draft mirror fires the hook", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const sub = users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 REVCO ${randomUUID().slice(0, 6)}`, kind: "customer" });

  // (1) unsettled -> clean unwind.
  const clean = await openArItem(sub, { client, cp, cents: 35000, memo: "x37 reversible sale" });
  await reverseEntry(users.bob, { entry: clean.entry, reason: "x37 clean unwind", opKey: opk("x37-rev1") });
  const mirror = (await rootQuery("select id, coding_kind, document_id from clara.journal_entries where reversal_of=$1", [clean.entry])).rows[0];
  assert.ok(mirror, "the reversal mirror exists");
  assert.equal(mirror.coding_kind, null, "the mirror never carries a copied coding_kind -- the unwind keys on reversal_of");
  const unwind = await itemsOf(mirror.id);
  assert.equal(unwind.length, 1, "the mirror mints exactly one unwind item");
  assert.equal(unwind[0].item_kind, "reversal_unwind", "item_kind='reversal_unwind'");
  assert.equal(Number(unwind[0].amount_cents), -35000, "the unwind is the EXACT negation of the original item");
  assert.equal(unwind[0].reversal_unwind_of, clean.item, "the unwind names the item it unwinds (lineage)");
  assert.ok((await subledgerEventTypes(client)).includes("open_item.unwound"), "open_item.unwound was appended");

  // (2) settled -> refused until unallocated.
  const settled = await openArItem(sub, { client, cp, cents: 42000, memo: "x37 settled sale" });
  const receipt = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 42000,
    allocations: [{ item_id: settled.item, amount_cents: 42000 }],
  });
  const group = groupOf(receipt);
  const blocked = await caught(() => reverseEntry(users.bob, { entry: settled.entry, reason: "x37 blocked", opKey: opk("x37-rev2") }));
  assert.ok(blocked, "reversing an entry whose items carry live allocations must be REFUSED (unallocate first)");
  assert.equal(blocked.code, CLR10, `the refusal is CLR10 (got ${blocked.code} -- ${blocked.message})`);
  assert.equal(reasonOf(blocked), "allocated_items_present", `the reason is the named allocated_items_present (got ${reasonOf(blocked)})`);
  assert.ok(/unallocate/i.test(String(blocked.message)), `the message points at the remedy (got: ${blocked.message})`);

  // (3) the RECEIPT side refuses too, for the same reason.
  const receiptBlocked = await caught(() => reverseEntry(users.bob, { entry: receipt.entry_id, reason: "x37 blocked receipt", opKey: opk("x37-rev3") }));
  assert.ok(receiptBlocked, "reversing the SETTLEMENT entry while its allocations live must be refused too");
  assert.equal(reasonOf(receiptBlocked), "allocated_items_present", `the receipt refusal carries the same named reason (got ${reasonOf(receiptBlocked)})`);

  // ...unallocate, then the same reversal succeeds.
  await unallocateGroup(sub, { client, group, reason: "x37 unallocate before reversal" });
  await reverseEntry(users.bob, { entry: settled.entry, reason: "x37 now reversible", opKey: opk("x37-rev4") });
  const settledMirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [settled.entry])).rows[0];
  assert.ok(settledMirror, "after unallocation the reversal proceeds");
  assert.equal(Number((await itemsOf(settledMirror.id))[0].amount_cents), -42000, "the unwind is still the exact negation");

  // (4) HIGH-STAKES: the mirror stays a DRAFT; approving it later fires the hook.
  // A fixture at the high-stakes default needs a DISTINCT checker to clear the
  // maker-checker floor lawfully (firm A carries two eligible checkers).
  const big = await openArItem(sub, { client, cp, cents: HIGH_STAKES_CENTS, memo: "x37 high-stakes sale", control: AR2, checker: users.bob });
  await reverseEntry(users.bob, { entry: big.entry, reason: "x37 high-stakes reversal", opKey: opk("x37-rev5") });
  const bigMirror = (await rootQuery(
    "select id, status, revision_token from clara.journal_entries where reversal_of=$1", [big.entry],
  )).rows[0];
  assert.ok(bigMirror, "the high-stakes reversal produced a mirror");
  assert.equal(bigMirror.status, "draft", "a high-stakes reversal mirror stays a DRAFT for a checker");
  assert.equal((await itemsOf(bigMirror.id)).length, 0, "a DRAFT mirror materialises NOTHING -- only approved is in the books");
  await approveEntry(users.alice, {
    entry: bigMirror.id, expectedRevision: bigMirror.revision_token,
    attestation: "x37 reviewed high-stakes reversal", opKey: opk("x37-rev5a"),
  });
  assert.equal(await entryStatusOf(bigMirror.id), "approved", "the checker approved the mirror");
  const bigUnwind = await itemsOf(bigMirror.id);
  assert.equal(bigUnwind.length, 1, "approving the mirror fires the hook through approve path 1");
  assert.equal(Number(bigUnwind[0].amount_cents), -HIGH_STAKES_CENTS, "the deferred unwind is still the exact negation");
  await assertTies(client, "x37.l reversal matrix");
});

// ===========================================================================
// x37.m -- THE WRONG-CLIENT CORRECTION of an open-itemed bill. The correction
// verb approves its reversal mirror INLINE (it never touches the shared core),
// so it is the fourth approve path -- and the one a v1 census missed. If it did
// not carry the hook, the unwind would never materialise and belt-1 would refuse
// the whole correction at commit. Either way, this cell sees it.
// ===========================================================================
test("x37.m a wrong-client correction of an open-itemed bill unwinds the item through the FOURTH approve path, and both clients tie", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const cp = await birthCounterparty(sub, { client: clients.A1, name: `X37 MISFILECO ${randomUUID().slice(0, 6)}`, registration: "201801370077" });
  const cents = 120000;
  const bill = await approvedSupplierBill(sub, { client: clients.A1, cp, cents });
  const items = await itemsOf(bill.entry);
  assert.equal(items.length, 1, "the misfiled bill minted its ap item in A1");
  assert.equal(Number(items[0].amount_cents), cents, "A1 carries the full payable");

  // The destination attribution must be recorded BEFORE propose -- its own domain
  // event would otherwise stale the hash-bound plan (the correction battery's law).
  await freshResolution(sub, clients.A2, { subjectKind: "document", subjectId: bill.documentId });
  const proposal = await proposeCorrection(sub, {
    document: bill.documentId, fromClient: clients.A1, toClient: clients.A2, reason: "x37 filed to the wrong client",
  });
  const correctionId = idOf(proposal, "correction_id", "correction");
  assert.ok(correctionId, `propose returned a correction id (got ${JSON.stringify(proposal)})`);
  const planHash = proposal.plan_hash
    ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  await approveCorrection(users.bob, { correction: correctionId, planHash });

  const mirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [bill.entry])).rows[0];
  assert.ok(mirror, "the correction reversed the misfiled entry (whole-consequence mirror)");
  const unwind = await itemsOf(mirror.id);
  assert.equal(unwind.length, 1, "the correction's INLINE mirror approve fired the subledger hook (approve path 4)");
  assert.equal(Number(unwind[0].amount_cents), -cents, "the unwind is the exact negation");
  assert.equal(unwind[0].item_kind, "reversal_unwind", "and it carries the unwind kind");
  await assertTies(clients.A1, "x37.m corrected-away client");
  await assertTies(clients.A2, "x37.m destination client");
});

// ===========================================================================
// x37.n -- THE TWO WCA-R9(b) NAMED REFUSALS. Both lanes write WRONG attributions
// silently today; refusal WITH A PATH is the honest upgrade.
//   (a) a receivable control leg stamped with a VENDOR-kind counterparty (the
//       NULL-coding_kind birth default) -> counterparty_kind_mismatch;
//   (b) one generic entry with control nets in BOTH domains -> cross_domain_
//       control_entry, remedy: split via a clearing account.
// ===========================================================================
test("x37.n WCA-R9b: a vendor-kind counterparty on a receivable leg and a cross-domain contra are both REFUSED with named reasons", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;

  // (a) kind contradiction: a NULL-coding_kind proposal defaults the birth to
  // 'vendor' (0035), so a receivable line stamped with it contradicts its domain.
  const d1 = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x37 vendor on a receivable leg",
    lines: [
      { account_code: AR1, debit_cents: 20000, credit_cents: 0, description: "ar" },
      { account_code: REVN, debit_cents: 0, credit_cents: 20000, description: "rev" },
    ],
    vendor: { new: { name: `X37 KINDCLASH ${randomUUID().slice(0, 6)}` } }, opKey: opk("x37-kind"),
  });
  const kindErr = await caught(() => approveEntry(sub, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("x37-kinda") }));
  assert.ok(kindErr, "a vendor-kind counterparty on a receivable control leg must be refused, not silently mis-attributed");
  assert.equal(kindErr.code, CLR10, `the kind refusal is CLR10 (got ${kindErr.code} -- ${kindErr.message})`);
  assert.equal(reasonOf(kindErr), "counterparty_kind_mismatch", `the named reason is counterparty_kind_mismatch (got ${reasonOf(kindErr)})`);
  assert.ok(/customer/i.test(String(kindErr.message)), `the message states the remedy -- kind:'customer' in the proposal (got: ${kindErr.message})`);
  assert.equal(await entryStatusOf(d1.entry_id), "draft", "the refused entry stays a draft -- the abort is total");

  // (b) cross-domain contra in ONE entry.
  const cp = await birthCounterparty(sub, { client, name: `X37 CONTRACO ${randomUUID().slice(0, 6)}` });
  const d2 = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x37 cross-domain contra",
    lines: [
      { account_code: AR1, debit_cents: 15000, credit_cents: 0, description: "ar leg" },
      { account_code: AP1, debit_cents: 0, credit_cents: 15000, description: "ap leg" },
    ],
    vendor: { existing_id: cp }, opKey: opk("x37-contra"),
  });
  const contraErr = await caught(() => approveEntry(sub, { entry: d2.entry_id, expectedRevision: d2.revision_token, opKey: opk("x37-contraa") }));
  assert.ok(contraErr, "one entry netting control in BOTH domains must be refused");
  assert.equal(contraErr.code, CLR10, `the contra refusal is CLR10 (got ${contraErr.code} -- ${contraErr.message})`);
  if (reasonOf(contraErr) !== "cross_domain_control_entry") {
    noteLane(`x37.n cross-domain contra refused with reason '${reasonOf(contraErr)}' -- expected cross_domain_control_entry; a kind-check ordering finding for adjudication`);
  }
  assert.equal(reasonOf(contraErr), "cross_domain_control_entry", `the named reason is cross_domain_control_entry (got ${reasonOf(contraErr)})`);
  assert.ok(/clear|split/i.test(String(contraErr.message)), `the message names the route -- split via a clearing account (got: ${contraErr.message})`);
  await assertTies(client, "x37.n WCA-R9b refusals");
});

// ===========================================================================
// x37.o -- THE CREDIT-NOTE WALL (contract section 3's direct instruction).
// `supplier_credit_note` has no coding home, so a supplier CN can only arrive
// mis-coded as a bill. allocate_payment refuses to pay against an item whose
// document was classified `credit_note`: the refusal converts the trap from "a
// path to real cash" back into a visible coding error.
// ===========================================================================
test("x37.o the credit-note wall: allocate_payment REFUSES an item whose document is classified credit_note", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 CNCO ${randomUUID().slice(0, 6)}`, registration: "201801370088" });
  const bill = await approvedSupplierBill(sub, { client, cp, cents: 60000 });
  const item = (await itemsOf(bill.entry))[0];
  // The document is re-classified AFTER approval (the x36c0 fixture idiom: a raw
  // kind stamp, so no verb-side gate stands between the fixture and the wall).
  await rootQuery("update clara.documents set document_kind='credit_note' where id=$1", [bill.documentId]);

  const err = await caught(() => allocatePayment(sub, {
    client, counterparty: cp, amountCents: 60000,
    allocations: [{ item_id: item.id, amount_cents: 60000 }],
  }));
  assert.ok(err, "paying against a credit-note-documented item must be refused -- fix the mis-code first");
  assert.equal(err.code, CLR10, `the wall refuses CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "credit_note_item", `the named reason is credit_note_item (got ${reasonOf(err)})`);
  assert.equal(await outstandingOf(item.id), 60000, "the refused payment moved nothing");
  await assertTies(client, "x37.o credit-note wall");
});

// ===========================================================================
// x37.p -- THE A+ BELT, DURABLE HALF. The journal_entries CHECK is caller-
// independent: no direct row construction can produce a rule-stamped settlement,
// in either direction (a fresh INSERT, or the draft->approved stamp that IS what
// a rule post does). Which of three RM5,000 open bills a payment settles is a
// JUDGEMENT, not a document fact.
// ===========================================================================
test("x37.p the A+ CHECK: a rule-stamped settlement row is impossible by direct INSERT and by the draft->approved stamp", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const cp = await birthCounterparty(users.alice, { client, name: `X37 CHECKCO ${randomUUID().slice(0, 6)}`, kind: "customer" });

  // (a) a fresh INSERT carrying both a settlement kind and a rule id.
  const insertErr = await caught(() => rootQuery(
    `insert into clara.journal_entries
       (firm_id, client_id, status, coding_kind, posting_date, memo, origin, maker_actor, checked_via_rule_id)
     values ($1,$2,'draft','customer_receipt','2026-04-22','x37 rule-stamped settlement','manual',$3,$4)`,
    [firm, client, users.alice, randomUUID()],
  ));
  assert.ok(insertErr, "a settlement row carrying checked_via_rule_id must be refused at INSERT");
  assert.equal(insertErr.code, "23514", `the refusal is the CHECK constraint (23514), got ${insertErr.code} -- ${insertErr.message}`);
  assert.ok(
    /settlement/i.test(String(insertErr.constraint ?? "") + String(insertErr.message)),
    `the violated constraint names the settlement rule (constraint=${insertErr.constraint})`,
  );

  // (b) the draft->approved stamp -- exactly the shape a rule post writes.
  const draft = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries
         (firm_id, client_id, status, coding_kind, posting_date, memo, origin, maker_actor)
       values ($1,$2,'draft','customer_receipt','2026-04-22','x37 settlement draft','manual',$3) returning id`,
      [firm, client, users.alice],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,25000,0,'bank',null),($1,2,$3,0,25000,'ar control',$4)`,
      [id, BANK, AR1, cp],
    );
    return id;
  });
  const stampErr = await caught(() => rootQuery(
    `update clara.journal_entries
        set status='approved', checker_actor=$2, approved_at=now(), checked_via_rule_id=$3
      where id=$1`,
    [draft, users.bob, randomUUID()],
  ));
  assert.ok(stampErr, "stamping a rule id on a settlement approval must be refused even by direct construction");
  assert.equal(stampErr.code, "23514", `the stamp dies on the CHECK (23514), got ${stampErr.code} -- ${stampErr.message}`);
  assert.equal(await entryStatusOf(draft), "draft", "the refused stamp left the entry a draft");
});

// ===========================================================================
// x37.q -- THE A+ BELT, BEHAVIOURAL HALF. The CHECK is durable but silent; the
// core carries the NAMED refusal, early -- after the locked status/revision
// checks and before any mutation -- so a rule-driven approval of a settlement
// propagates honestly instead of dying on a constraint. Driven straight at the
// ungranted core (root), which is the only lane that can hand it a rule ctx.
// ===========================================================================
test("x37.q the core refuses a rule-driven settlement approval with the NAMED reason settlement_not_autopostable", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const cp = await birthCounterparty(users.alice, { client, name: `X37 COREREFCO ${randomUUID().slice(0, 6)}`, kind: "customer" });

  const draft = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries
         (firm_id, client_id, status, coding_kind, posting_date, memo, origin, maker_actor)
       values ($1,$2,'draft','customer_receipt','2026-04-23','x37 core-refusal settlement','manual',$3) returning id`,
      [firm, client, users.alice],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,17000,0,'bank',null),($1,2,$3,0,17000,'ar control',$4)`,
      [id, BANK, AR1, cp],
    );
    return id;
  });
  const rev = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draft])).rows[0].revision_token;
  const ctx = JSON.stringify({
    actor: users.alice, firm,
    checked_via_rule_id: randomUUID(),
    // ADV-R4#1: a rule-driven approval may never run unpinned, so the ctx must
    // carry a bound extraction to reach the settlement gate at all.
    bound_extraction: randomUUID(),
    receipt_preheld: true,
  });
  const err = await caught(() => rootQuery(
    "select clara._approve_entry_core($1::jsonb,$2,$3,null,$4) as r",
    [ctx, draft, rev, opk("x37-corepost")],
  ));
  assert.ok(err, "a rule-driven approval of a settlement kind must be refused by the core itself");
  assert.equal(err.code, CLR10, `the core refusal is CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "settlement_not_autopostable", `the named reason is settlement_not_autopostable (got ${reasonOf(err)})`);
  assert.equal(await entryStatusOf(draft), "draft", "the refused core call mutated nothing -- the refusal is early");
});

// ===========================================================================
// x37.r -- WCA-R6 as amended by WCA-R7: the settlement kinds are creatable ONLY
// by the composites. The draft core's allowlist stays invoice-only, so no draft
// verb -- human or agent -- can mint one; the maker-checker draft the composite
// leaves above the threshold is still composite-born.
// ===========================================================================
test("x37.r no draft verb can make a settlement kind: the wake drafter refuses, and the core allowlist is still invoice-only", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const cp = await birthCounterparty(sub, { client, name: `X37 DRAFTGATE ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const cred = await mintInteractive(firm);

  for (const kind of ["customer_receipt", "supplier_payment"]) {
    const resolution = await manualRes(sub, client);
    const err = await caught(() => wakeDraftEntry(cred, {
      client, resolution, memo: `x37 illegal ${kind} draft`,
      lines: [
        { account_code: BANK, debit_cents: 10000, credit_cents: 0, description: "bank" },
        { account_code: AR1, debit_cents: 0, credit_cents: 10000, description: "ar" },
      ],
      vendor: { existing_id: cp }, codingKind: kind, opKey: opk("x37-draftgate"),
    }));
    assert.ok(err, `the drafter must refuse coding_kind='${kind}'`);
    assert.equal(err.code, CLR10, `an unsupported coding kind is CLR10 (got ${err.code} -- ${err.message})`);
  }

  // The structural half: the draft core's allowlist is unchanged by 0037. Recorded
  // rather than asserted -- a body that NAMES a settlement kind is not necessarily
  // one that ADMITS it (an explicit named refusal would also mention it), and the
  // behavioural half above is the law. A hit here is a finding to adjudicate.
  const src = await fnSource("_draft_entry_core");
  assert.ok(src.length > 0, "clara._draft_entry_core exists");
  for (const kind of ["customer_receipt", "supplier_payment"]) {
    if (src.includes(kind)) {
      noteLane(`x37.r _draft_entry_core's body NAMES '${kind}' -- confirm it is a refusal, not an allowlist widening (WCA-R6 says the allowlist stays invoice-only)`);
    }
  }
});

// ===========================================================================
// x37.s -- THE AUTHORITY CATALOG. The four composites are human verbs: granted
// to clara_authenticated ONLY, with ZERO wake-allowlist entries (no agent lane
// moves money). The decomposition helpers are ungranted internals -- the ONLY
// decomposition logic, reachable by no app role at all.
// ===========================================================================
test("x37.s authority: the composites are authenticated-ONLY with no wake entries; the subledger cores are ungranted to every app role", async (t) => {
  if (skipHere(t)) return;
  const composites = ["allocate_receipt", "allocate_payment", "unallocate_group", "apply_open_items"];
  const cores = ["_subledger_classify_entry", "_subledger_on_approve", "_subledger_decompose_preview"];
  const otherRoles = [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive];

  for (const fn of composites) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true, `clara_authenticated may execute clara.${fn} (the human lane)`);
    for (const role of otherRoles) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn} -- money movement is human-only`);
    }
  }
  const wake = await rootQuery(
    "select count(*)::int as n from clara.wake_fn_allowlist where function_name = any($1)",
    [composites],
  );
  assert.equal(wake.rows[0].n, 0, "ZERO wake_fn_allowlist entries name a settlement composite -- no wake authority exists for them");

  for (const fn of cores) {
    for (const role of [ROLES.authenticated, ...otherRoles]) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn} -- the classifier is an internal, ungranted helper`);
    }
  }
});

// ===========================================================================
// x37.t -- THE UNCHANGED AUTHORITY SURFACE. Teaching the shared core the
// subledger must not have widened anything: the human wrapper still hands the
// core NO rule id (so a human approval can never look rule-driven), and the
// executor is still granted login-direct only.
// ===========================================================================
test("x37.t approve_entry still passes NO checked_via_rule_id, and execute_rule_post is still granted login-direct only", async (t) => {
  if (skipHere(t)) return;
  const def = (await rootQuery(
    `select string_agg(pg_get_functiondef(p.oid), ' ~~ ') as d
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='approve_entry'`,
  )).rows[0].d ?? "";
  assert.ok(def.length > 0, "clara.approve_entry exists");
  assert.ok(
    !def.includes("checked_via_rule_id"),
    "the human approve_entry wrapper never names checked_via_rule_id -- a human approval can never be mistaken for a rule post",
  );

  const sig = "clara.execute_rule_post(uuid,text)";
  const has = async (role) => (await rootQuery("select pg_catalog.has_function_privilege($1,$2,'execute') as ok", [role, sig])).rows[0].ok;
  const login = await caught(() => has("clara_runtime_login"));
  if (login instanceof Error) {
    noteLane(`x37.t execute_rule_post signature probe failed (${login.message}) -- arity assumption (uuid,text) may differ; adjudicate`);
    return;
  }
  assert.equal(await has("clara_runtime_login"), true, "clara_runtime_login still holds the login-direct grant");
  for (const role of [ROLES.runtime, ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await has(role), false, `${role} must still NOT execute execute_rule_post`);
  }
});

// ===========================================================================
// x37.u -- THE HIGH-STAKES THRESHOLD (WCA-R7). A settlement at EXACTLY the
// firm's threshold in a two-checker firm does not auto-approve: the composite
// leaves a DRAFT carrying the validated allocation proposal, the checker approves
// it through the ordinary /queue verb, and the hook materialises + re-validates
// at that moment. Nothing is in the books until then.
// ===========================================================================
test("x37.u a settlement at EXACTLY the high-stakes threshold leaves a draft; a DISTINCT checker approves it and the books tie", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = world.clients.A1;
  const cp = await birthCounterparty(users.alice, { client, name: `X37 HSCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const threshold = Number((await rootQuery(
    "select f.high_stakes_amount_cents as n from clara.firms f join clara.clients c on c.firm_id=f.id where c.id=$1", [client],
  )).rows[0].n);
  const { item } = await openArItem(users.alice, { client, cp, cents: threshold, control: AR2, checker: users.bob });

  const receipt = await allocateReceipt(users.alice, {
    client, counterparty: cp, amountCents: threshold,
    allocations: [{ item_id: item, amount_cents: threshold }],
  });
  assert.equal(receipt.status, "draft", "AT the threshold the composite leaves a DRAFT for the checker (WCA-R7)");
  assert.equal(await entryStatusOf(receipt.entry_id), "draft", "the entry really is a draft");
  assert.equal((await itemsOf(receipt.entry_id)).length, 0, "a draft settlement materialises NOTHING");
  assert.equal(await outstandingOf(item), threshold, "and the invoice is still fully outstanding");
  const glMid = await controlGl(client, "ar");
  assert.equal(await itemsSum(client, "ar"), glMid, "the identity holds while the settlement waits in the queue");

  const rev = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [receipt.entry_id])).rows[0].revision_token;
  // WCA-R7's "/queue muscle memory, CLR05 law untouched" means a DISTINCT checker
  // approves with NO attestation -- which requires the composite to stamp
  // last_human_editor on the draft it leaves. If that fails, retry attested so the
  // HOOK half of the cell still runs, and report the precise finding at the end.
  const plain = await caught(() => approveEntry(users.bob, { entry: receipt.entry_id, expectedRevision: rev, opKey: opk("x37-hs-approve") }));
  if (plain) {
    noteLane(`x37.u FINDING: the composite-born draft refused a DISTINCT checker's plain approve (${plain.code}/${reasonOf(plain)}) -- last_human_editor is probably not stamped on the composite's draft, so WCA-R7's /queue muscle memory is not met. Retried WITH an attestation.`);
    await approveEntry(users.bob, {
      entry: receipt.entry_id, expectedRevision: rev,
      attestation: "x37 checker attestation (fallback)", opKey: opk("x37-hs-approve2"),
    });
  }
  assert.equal(await entryStatusOf(receipt.entry_id), "approved", "the DISTINCT checker approved it through the ordinary verb");
  const settle = await itemsOf(receipt.entry_id);
  assert.equal(settle.length, 1, "the approve hook materialised the settlement item");
  assert.equal(Number(settle[0].amount_cents), -threshold, "at full gross, negative");
  assert.equal(await outstandingOf(item), 0, "and the stored allocation proposal was materialised too -- the invoice is settled");
  await assertTies(client, "x37.u high-stakes settlement");
  assert.equal(
    plain, null,
    `WCA-R7: a DISTINCT checker must be able to approve the composite-born draft through the ordinary verb with NO attestation (the composite must stamp last_human_editor on its draft) -- got ${plain?.code}/${reasonOf(plain ?? {})}`,
  );
});

// ===========================================================================
// x37.v -- THE SOLO-FIRM VARIANT. With no second eligible checker the CLR05
// self-attestation path is the lawful route. The design states the composite
// takes p_attestation but ALSO that at/above the threshold it leaves a draft;
// this cell asserts the END STATE (approved, materialised, tied) and RECORDS
// which of the two shapes the as-built chose -- an interface expectation, not a
// silent edit.
// ===========================================================================
test("x37.v the solo-firm high-stakes settlement rides the attestation path to an approved, materialised, tied state", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.erin;
  const client = world.clients.S1;
  const cp = await birthCounterparty(sub, { client, name: `X37 SOLOCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const threshold = Number((await rootQuery(
    "select f.high_stakes_amount_cents as n from clara.firms f join clara.clients c on c.firm_id=f.id where c.id=$1", [client],
  )).rows[0].n);
  // Firm S is solo (one eligible checker), so the fixture itself rides the CLR05
  // self-attestation path -- the same path the settlement under test must ride.
  const attest = "x37 solo attestation -- reviewed myself, no second checker exists";
  const { item } = await openArItem(sub, { client, cp, cents: threshold, attestation: attest });

  const receipt = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: threshold,
    allocations: [{ item_id: item, amount_cents: threshold }],
    attestation: attest,
  });
  noteLane(`x37.v solo composite returned status='${receipt.status}' for an at-threshold settlement (design allows draft-then-self-approve OR in-call attested approve)`);
  if (receipt.status === "draft") {
    const rev = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [receipt.entry_id])).rows[0].revision_token;
    await approveEntry(sub, {
      entry: receipt.entry_id, expectedRevision: rev, attestation: attest, opKey: opk("x37-solo-approve"),
    });
  }
  assert.equal(await entryStatusOf(receipt.entry_id), "approved", "the solo settlement reaches approved through the attestation path");
  const settle = await itemsOf(receipt.entry_id);
  assert.equal(settle.length, 1, "the settlement item is materialised");
  assert.equal(await outstandingOf(item), 0, "the invoice is settled");
  await assertTies(client, "x37.v solo attestation");

  // The negative half: a solo high-stakes settlement WITHOUT an attestation must
  // not slip through the maker-checker floor.
  const { item: item2 } = await openArItem(sub, { client, cp, cents: threshold, control: AR2, attestation: attest });
  const noAttest = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: threshold,
    allocations: [{ item_id: item2, amount_cents: threshold }],
  }).catch((e) => e);
  if (noAttest instanceof Error) {
    assert.equal(noAttest.code, CLR05, `an unattested solo high-stakes settlement refuses CLR05 (got ${noAttest.code} -- ${noAttest.message})`);
  } else {
    assert.equal(noAttest.status, "draft", "without an attestation the unapproved settlement can only be a draft, never approved");
    assert.equal(await entryStatusOf(noAttest.entry_id), "draft", "and it really is one");
  }
  await assertTies(client, "x37.v solo unattested");
});

// ===========================================================================
// x37.w -- THE WCA-R8 EVIDENCE PIN. **This cell asserts a DEFECT, deliberately.**
// The sighting pool is not segregated by posting shape or party role (design
// debt section 5.3), so three approved employee claims -- a natural person
// birthed as a 'vendor' because a NULL coding_kind defaults the birth that way --
// still breed a vendor_account autopost proposal onto the claim expense account.
// WCA-R8 rules that this is PINNED AS EVIDENCE, not fixed here: the human
// signature gate is the standing defense, and wholesale pool segregation is a
// later wave. THIS ASSERTION FLIPS (to "no proposal row") the day segregation
// lands -- that is the intended failure, and the signal it carries.
// ===========================================================================
test("x37.w WCA-R8 evidence pin: three employee claims STILL breed a vendor_account proposal (the section 5.3 debt's live witness)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2; // its own client, so no other cell's sightings can interfere
  const name = `X37 EMPLOYEE ${randomUUID().slice(0, 6)}`;
  let cp = null;

  for (let i = 0; i < 3; i++) {
    const d = await draftEntryV3(sub, {
      client, resolution: await manualRes(sub, client), memo: `x37 staff claim ${i + 1}`,
      lines: [
        { account_code: CLAIMX, debit_cents: 12000, credit_cents: 0, description: "reimbursable" },
        { account_code: EMPP, debit_cents: 0, credit_cents: 12000, description: "due to employee" },
      ],
      vendor: cp ? { existing_id: cp } : { new: { name } }, opKey: opk("x37-claim"),
    });
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37-claima") });
    if (!cp) {
      const want = normalize(name);
      cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want)?.id ?? null;
      assert.ok(cp, "the employee was birthed as a counterparty (kind='vendor' -- the NULL-coding_kind default)");
    }
    // The claim credits a NON-payable-class liability, so it never enters AP aging.
    assert.equal((await itemsOf(d.entry_id)).filter((x) => x.domain === "ap").length, 0, "a staff claim mints no ap item");
  }

  const proposal = await rootQuery(
    `select id, status, account_code from clara.coding_rules
      where client_id=$1 and counterparty_id=$2 and rule_type='vendor_account'`,
    [client, cp],
  );
  assert.equal(
    proposal.rowCount, 1,
    "WCA-R8 PIN: the vendor_account proposal row EXISTS -- three staff claims bred an autopost proposal binding a natural person to an expense account. This is the recorded debt (section 5.3), not a passing feature; when pool segregation lands this assertion must flip to 0 and this cell must be re-ruled.",
  );
  assert.equal(proposal.rows[0].account_code, CLAIMX, "the proposal binds the CLAIM expense account -- the exact vector WC-R10(ii) named");
  noteLane(`x37.w WCA-R8 evidence pin HOLDS: proposal ${proposal.rows[0].id} (status=${proposal.rows[0].status}) binds an employee-as-vendor to ${CLAIMX}. The human signature gate remains the only defense.`);
  await assertTies(client, "x37.w employee claims");
});

// ===========================================================================
// x37.x -- CLR26 REACHES MONEY MOVEMENT. Settlements inherit the open-question
// block: a blocking client-scope question stops a receipt exactly as it stops an
// approval. Intended, named in the design, pinned here.
// ===========================================================================
test("x37.x CLR26: an open CLIENT-scope question blocks allocate_receipt, and resolving it clears the block", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 QCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(sub, { client, cp, cents: 33000 });

  // The open question is CLIENT-scope: left open by a mid-cell failure it would block
  // every later approve on this client and poison the cells behind it -- resolve in a
  // finally so this cell can only ever fail alone.
  const q = await openQuestion(sub, { client, scopeKind: "client", scopeId: client, question: "x37 which bank is this?" });
  const qid = q?.question_id ?? q?.id ?? q;
  try {
    const blocked = await caught(() => allocateReceipt(sub, {
      client, counterparty: cp, amountCents: 33000,
      allocations: [{ item_id: item, amount_cents: 33000 }],
    }));
    assert.ok(blocked, "an open client-scope question must block money movement too");
    assert.equal(blocked.code, CLR26, `the block is CLR26 (got ${blocked.code} -- ${blocked.message})`);
    assert.equal(await outstandingOf(item), 33000, "the blocked composite moved nothing");
    await assertTies(client, "x37.x blocked by CLR26");
  } finally {
    await resolveOpenQuestion(sub, { question: qid, resolution: "x37 answered" }).catch(() => {});
  }
  const after = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 33000,
    allocations: [{ item_id: item, amount_cents: 33000 }],
  });
  assert.equal(after.status, "approved", "with the question resolved the same receipt commits");
  assert.equal(await outstandingOf(item), 0, "and settles the item");
  await assertTies(client, "x37.x after resolve");
});

// ===========================================================================
// x37.y -- THE OUTBOX LAW. A composite that refuses mid-flight rolls its events
// back with everything else: zero new items, zero allocations, zero open_item.*
// events, zero new approved entries. An aborted composite leaves no trace but
// the op-receipt reservation, which itself vanishes with the rollback.
// ===========================================================================
test("x37.y outbox law: a failed composite leaves ZERO events, ZERO items and ZERO allocations behind", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 ROLLBACKCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(sub, { client, cp, cents: 20000 });

  const snap = async () => ({
    events: await subledgerEventCount(client),
    items: (await rootQuery("select count(*)::int as n from clara.open_items where client_id=$1", [client])).rows[0].n,
    allocs: (await rootQuery("select count(*)::int as n from clara.open_item_allocations where client_id=$1", [client])).rows[0].n,
    // EVERY status, not just approved: a composite that created its settlement
    // entry and then refused must leave no draft behind either.
    entries: (await rootQuery("select count(*)::int as n from clara.journal_entries where client_id=$1", [client])).rows[0].n,
  });
  const before = await snap();

  // Over-allocate. Whether the refusal lands before or after the entry insert is
  // the composite's business; the invariant asserted here is the outbox law --
  // nothing at all survives an aborted composite.
  const err = await caught(() => allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 20000,
    allocations: [{ item_id: item, amount_cents: 20000 }, { item_id: item, amount_cents: 20000 }],
  }));
  assert.ok(err, "the malformed/over-allocating composite refused");
  const after = await snap();
  assert.deepEqual(after, before, `the aborted composite left NOTHING behind (before=${JSON.stringify(before)} after=${JSON.stringify(after)})`);
  await assertTies(client, "x37.y outbox rollback");
});

// ===========================================================================
// x37.z -- DECOMPOSITION CORRECTNESS (the backfill's real property). A backfill
// cannot be observed in-suite (0037 is already applied before the first cell
// runs), so the honest instrument is the one the backfill itself uses: the
// classifier. Two shapes no verb can build -- a MULTI-COUNTERPARTY generic JV
// (draft_entry stamps ONE counterparty on every control line, so per-party legs
// only exist by direct construction) and an OPENING entry -- are built by hand
// WITH their congruent items, and the classifier must reproduce those items
// exactly. That also proves belt-1 accepts a congruent hand-built pair.
// ===========================================================================
test("x37.z the classifier decomposes a multi-counterparty generic JV per party, and an opening entry as `opening` -- both congruent with what is materialised", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const v1 = await birthCounterparty(sub, { client, name: `X37 JVONE ${randomUUID().slice(0, 6)}` });
  const v2 = await birthCounterparty(sub, { client, name: `X37 JVTWO ${randomUUID().slice(0, 6)}` });

  // (a) a generic JV crediting TWO different suppliers on the SAME entry.
  const jv = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft','2026-04-05','x37 multi-counterparty accrual','manual',$3) returning id`,
      [firm, client, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,90000,0,'accrued expense',null),
             ($1,2,$3,0,50000,'party one',$4),
             ($1,3,$5,0,40000,'party two',$6)`,
      [id, EXPN, AP1, v1, AP2, v2],
    );
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, world.users.bob],
    );
    // The congruent items belt-1 demands at commit -- one per (domain, counterparty).
    await c.query(
      `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
       values($1,$2,'ap',$3,$4,'adjustment','2026-04-05',50000,$6),
             ($1,$2,'ap',$5,$4,'adjustment','2026-04-05',40000,$6)`,
      [firm, client, v1, id, v2, sub],
    );
    return id;
  });
  const jvRows = (await classifyRows(jv)).sort((a, b) => Number(b.amount_cents) - Number(a.amount_cents));
  assert.equal(jvRows.length, 2, `the classifier splits the JV per counterparty (got ${jvRows.length} rows)`);
  assert.ok(jvRows.every((r) => r.domain === "ap"), "both rows are ap");
  assert.ok(jvRows.every((r) => r.item_kind === "adjustment"), "a NULL-coding_kind control entry decomposes to `adjustment` items (WCA-R2)");
  assert.deepEqual(
    jvRows.map((r) => [r.counterparty_id, Number(r.amount_cents)]),
    [[v1, 50000], [v2, 40000]],
    "the per-party split matches the control nets exactly -- several payable legs never collapse across parties",
  );
  const jvItems = await itemsOf(jv);
  assert.equal(jvItems.length, 2, "and exactly those two items are materialised");

  // (b) an OPENING entry -- path 2 of the precedence ladder.
  const ob = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor,is_opening_balance)
       values($1,$2,'draft','2025-12-31','x37 opening balance load','manual',$3,true) returning id`,
      [firm, client, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,64000,0,'opening expense',null),($1,2,$3,0,64000,'opening payable',$4)`,
      [id, EXPN, AP1, v1],
    );
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, world.users.bob],
    );
    await c.query(
      `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
       values($1,$2,'ap',$3,$4,'opening','2025-12-31',64000,$5)`,
      [firm, client, v1, id, sub],
    );
    return id;
  });
  const obRows = await classifyRows(ob);
  assert.equal(obRows.length, 1, "the opening entry decomposes to one item");
  assert.equal(obRows[0].item_kind, "opening", "is_opening_balance takes precedence over the coding_kind ladder (path 2)");
  assert.equal(Number(obRows[0].amount_cents), 64000, "from the control-leg net, never from opening_items as an independent source");

  // The read-only diff surface the ceremony's mandatory dry-run precheck uses.
  const preview = await rootQuery("select * from clara._subledger_decompose_preview($1,$2)", [client, "ap"]);
  assert.ok(preview.rowCount > 0, "the read-only decompose preview returns this client's ap decomposition");
  noteLane(`x37.z decompose preview columns: ${preview.fields.map((f) => f.name).join(",")}`);
  await assertTies(client, "x37.z decomposition correctness");
});

// ===========================================================================
// x37.aa -- THE STRUCTURAL BELT. The grain unique IS the backfill's idempotency
// (a re-run cannot double-write), and the house table laws apply: append-only,
// force RLS, the item_kind sign matrix in the DDL, and the allocations surface.
// ===========================================================================
test("x37.aa structural: the (entry,domain,counterparty) grain is unique (= backfill idempotency), both tables are append-only + force-RLS, and the kind matrix is in the DDL", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);

  const idx = await uniqueIndexDefs("open_items");
  assert.ok(
    idx.some((d) => /entry_id/.test(d) && /domain/.test(d) && /counterparty_id/.test(d)),
    `open_items carries the (entry_id, domain, counterparty_id) unique grain -- got: ${idx.join(" | ")}`,
  );

  // The idempotency PROOF: a second row at the same grain is impossible, so a
  // re-run of the backfill over an already-decomposed entry cannot double-write.
  const existing = (await rootQuery(
    "select * from clara.open_items where client_id=$1 order by created_at limit 1", [client],
  )).rows[0];
  assert.ok(existing, "this client owns at least one item by now (mandatory setup)");
  const dup = await caught(() => rootQuery(
    `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [firm, client, existing.domain, existing.counterparty_id, existing.entry_id, existing.item_kind,
      existing.item_date, existing.amount_cents, sub],
  ));
  assert.ok(dup, "a duplicate row at the grain must be refused");
  assert.equal(dup.code, "23505", `the grain unique is what refuses it (got ${dup.code} -- ${dup.message})`);

  for (const tbl of ["open_items", "open_item_allocations"]) {
    const flags = await rlsFlags(tbl);
    assert.ok(flags, `clara.${tbl} exists`);
    assert.equal(flags.rls, true, `${tbl} has row level security enabled`);
    assert.equal(flags.force, true, `${tbl} FORCEs row level security (the owner is not exempt)`);
    // Both probes run inside a txn that ALWAYS aborts (the marker raise): if the
    // append-only guard is missing, the probe still cannot damage the books that
    // every later tie-out reads -- it just reports the marker instead of a guard.
    const probe = async (sql) => caught(() => withActor({ transaction: true }, async (c) => {
      await c.query(sql, [client]);
      throw Object.assign(new Error("x37.aa probe rollback marker"), { code: "X37RB" });
    }));
    // Non-vacuous by construction: a 0-row UPDATE/DELETE fires no row trigger and would
    // "prove" append-only that was never exercised. The earlier cells guarantee rows.
    const live = await rootQuery(`select 1 from clara.${tbl} where client_id=$1 limit 1`, [client]);
    assert.ok(live.rows.length > 0, `${tbl} holds at least one row for this client (mandatory setup -- a 0-row probe proves nothing)`);
    const upd = await probe(`update clara.${tbl} set amount_cents = amount_cents + 1 where client_id=$1`);
    assert.ok(upd, `${tbl} is append-only -- a bare UPDATE must be refused`);
    assert.notEqual(upd.code, "X37RB", `${tbl} accepted an UPDATE -- the append-only guard did not fire (the probe reached its own rollback marker)`);
    const del = await probe(`delete from clara.${tbl} where client_id=$1`);
    assert.ok(del, `${tbl} is append-only -- a DELETE must be refused`);
    assert.notEqual(del.code, "X37RB", `${tbl} accepted a DELETE -- the append-only guard did not fire`);
    noteLane(`x37.aa ${tbl} append-only codes: update=${upd.code} delete=${del.code}`);
  }

  const itemChecks = await checkDefs("open_items");
  for (const kind of ["invoice", "credit_note", "bill", "settlement", "adjustment", "opening", "reversal_unwind"]) {
    assert.ok(itemChecks.includes(kind), `the item_kind matrix names '${kind}' in the DDL (got: ${itemChecks.slice(0, 400)})`);
  }
  assert.ok(/amount_cents/.test(itemChecks), "open_items constrains amount_cents (the <> 0 law lives in the DDL)");
  const allocChecks = await checkDefs("open_item_allocations");
  for (const op of ["allocate", "unallocate", "apply"]) {
    assert.ok(allocChecks.includes(op), `operation_kind admits '${op}' (got: ${allocChecks.slice(0, 400)})`);
  }
  const allocIdx = await uniqueIndexDefs("open_item_allocations");
  assert.ok(
    allocIdx.some((d) => /reverses_allocation_id/.test(d)),
    `reverses_allocation_id is unique where not null -- no double-undo (got: ${allocIdx.join(" | ")})`,
  );
});

// ===========================================================================
// x37.ab -- THE AP MIRROR, END TO END. allocate_payment is the exact mirror:
// Dr AP control (amount + discount), Cr bank, and the discount-received leg is
// INCOME-class (a settlement discount on a purchase is income, not a negative
// expense). The identity holds on the payable side too.
// ===========================================================================
test("x37.ab allocate_payment mirrors the receipt end to end, discount received included, and the ap side ties", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 PAYCO ${randomUUID().slice(0, 6)}`, registration: "201801370099" });
  const { item } = await openApItem(sub, { client, cp, cents: 100000 });
  const bankBefore = Number((await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n from clara.journal_lines l
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'`, [client, BANK],
  )).rows[0].n);

  // Pay RM980 and take RM20 of settlement discount: the payable clears in full.
  const pay = await allocatePayment(sub, {
    client, counterparty: cp, amountCents: 98000,
    allocations: [{ item_id: item, amount_cents: 100000 }],
    discountCents: 2000, discountAccount: DISCR,
  });
  assert.equal(pay.status, "approved", "a below-threshold payment approves in the same call");
  assert.equal(Number(pay.residue_cents), 0, "amount + discount exactly matches the allocation -- no residue");
  assert.equal(await outstandingOf(item), 0, "the bill is fully settled by cash plus discount");

  const settle = (await itemsOf(pay.entry_id))[0];
  assert.equal(settle.domain, "ap", "the settlement item lands in the ap domain");
  assert.equal(settle.item_kind, "settlement", "item_kind='settlement'");
  assert.equal(Number(settle.amount_cents), -100000, "the settlement item is the FULL gross (cash + discount), negative");

  const lines = (await rootQuery(
    `select l.account_code, l.debit_cents, l.credit_cents from clara.journal_lines l
      where l.entry_id=$1 order by l.line_no`, [pay.entry_id],
  )).rows;
  const byCode = Object.fromEntries(lines.map((l) => [l.account_code, l]));
  assert.ok(byCode[BANK], "the payment credits the bank");
  assert.equal(Number(byCode[BANK].credit_cents), 98000, "the bank is credited with the CASH only");
  assert.ok(byCode[DISCR], "the discount rides its own income-class leg");
  assert.equal(Number(byCode[DISCR].credit_cents), 2000, "discount received is credited to income");
  const bankAfter = Number((await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n from clara.journal_lines l
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'`, [client, BANK],
  )).rows[0].n);
  assert.equal(bankAfter, bankBefore - 98000, "exactly the cash left the bank");
  await assertTies(client, "x37.ab allocate_payment");
  await assertTies(world.clients.A2, "x37 final sweep A2");
  await assertTies(world.clients.S1, "x37 final sweep S1");
});
