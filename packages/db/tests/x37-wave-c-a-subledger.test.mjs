// 0037 Wave C-a -- the AR/AP open-item subledger + allocation battery.
//
// CONTRACT-BLIND: written from docs/plan/completed/wave-c-a-subledger-design.md (v2, the
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
//   x37.k  the concurrent races (two sessions, blocking PROVEN): allocate vs
//          allocate, and reverse vs allocate (the client advisory rung)
//   x37.l  the reversal matrix (clean unwind / settled refused / receipt refused
//          / high-stakes draft mirror approved later fires the hook / a revise of a
//          mirror is refused reversal_mirror_not_revisable / an allocation against a
//          reversed entry's item is refused allocation_target_reversed and the
//          reversal unwind applies instead)
//   x37.m  wrong-client correction of an open-itemed bill -> mirror unwind, ties
//   x37.n  the WCA-R9b named refusals (counterparty kind; cross-domain contra)
//   x37.o  the credit-note wall on allocate_payment + its approve-time re-derivation
//   x37.p  the A+ belt: a rule-stamped settlement row violates the CHECK
//   x37.q  the A+ core refusal, named: settlement_not_autopostable
//   x37.r  no draft verb can make a settlement kind (WCA-R6/R7)
//   x37.s  authority catalog: composites authenticated-ONLY; cores ungranted;
//          zero wake allowlist entries; the section-4.9 lock-order acquisition
//          sequence, pinned off prosrc for all four composites + both patched verbs
//   x37.t  approve_entry passes NO checked_via_rule_id; execute_rule_post stays
//          login-direct only
//   x37.u  the high-stakes threshold: draft -> a DISTINCT checker approves -> ties,
//          plus the FIVE staleness axes that refuse CLR10 allocation_stale at the
//          checker's approve (counterparty / settlement_item_count /
//          settlement_amount / outstanding / proposal_unpinned)
//   x37.v  the solo-firm high-stakes variant (attestation)
//   x37.w  the WCA-R8 EVIDENCE PIN (three employee claims still breed a
//          vendor_account proposal -- the debt's live witness, not a fix)
//   x37.x  CLR26: an open client-scope question blocks money movement too
//   x37.y  outbox law: a composite that fails AFTER its entry insert (the CLR26
//          block, inside the core) leaves ZERO events/items/allocations/entries
//   x37.y2 input validation: a duplicated item in one allocation set, refused by
//          name BEFORE any write (the cell x37.y used to be, retitled honestly)
//   x37.z  decomposition correctness: a multi-counterparty generic JV and an
//          opening entry, classifier output vs materialised rows
//   x37.aa the structural belt: grain uniqueness (the backfill's idempotency),
//          append-only, force-RLS, the item_kind matrix, the allocation surface
//   x37.ab allocate_payment end-to-end (the AP mirror) with a discount received
//   x37.ac the SIX settlement-floor CLR23 refusals, one named reason each, plus the
//          deferred-trigger proof that the floor really fires at commit
//   x37.ad belt-1 REFUSES a raw-approved control entry with no item
//          (subledger_entry_untied) -- the belt's positive half is every other cell
//   x37.ae a REAL sales_credit_note end to end: the classifier's ladder-3 branch and
//          the kind matrix's negative sign on a live AR lane
//   x37.af the section-4.10 sweep force-complete guard: a recovered run completes the
//          DRAFTED task and leaves the non-drafted running task alone (both directions)
//   x37.ah the unwind lineage law: a reversal unwind may NOT be applied to an
//          unrelated live invoice (unwind_lineage_mismatch); a non-unwind item still
//          hits the reversed-entry wall; the sanctioned pair still closes to zero
//   x37.ai one unwind closes BOTH items of a merge-collapsed original -- entry-level
//          pairing, since reversal_unwind_of can only ever name min(id) of the set
//   x37.aj a merge that nets an entry's items to zero is LAWFUL: no belt false
//          positive, the entry still reverses, the mirror mints nothing, books tie
//   x37.ak a canonical-duplicate item is row-wise indistinguishable and dies on
//          belt-2's AGGREGATE congruence check (belt-1 never sees a lone item insert)
//   x37.ag the composites refuse a control-class discount account (both domains)
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
  seedCitedDocument, invoiceFactsTask, mintLegacyInvoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, statedIdentityFields, agreedEnvelope, factsRegion, mintInteractive, wakeDraftEntry,
  ev, FIELD, billLines, rm, reasonOf, idOf, roleCanExecute, fnSource, checkDefs,
  uniqueIndexDefs, rlsFlags, entryStatusOf, normalize,
  openQuestion, resolveOpenQuestion, proposeCorrection, approveCorrection,
  assertRaisesOneOf, HIGH_STAKES_CENTS,
  reviseEntry, mergeCounterparties, openSweepRun, reconcileSweepRuns,
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

// (There is no CLR05 constant: the maker-checker floor is exercised by BUILDING the
// lawful shape -- a distinct checker, or the solo firm's attestation -- never by
// asserting its SQLSTATE, so a bound constant here would only be dead weight.)
const CLR10 = "CLR10";
const CLR26 = "CLR26";

/** Belt-2's SQLSTATE. The design is contract-SILENT about it (it says the new
 *  refusals reuse existing codes and names none for the deferred bound/group belts),
 *  so the first run of this battery recorded the ACTUAL code as a lane note. It is
 *  CLR10 for both belt-2 arms (the two-sided bound and the group law) -- observed on
 *  the integration run, and now PINNED rather than left as a tolerant any-of set. A
 *  tolerant set is how a belt that starts raising 23514 (a bare CHECK, i.e. the
 *  named refusal was LOST) keeps passing; this pin turns that into a red cell. */
const BELT_CODES = [CLR10];

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
// F-A2 PR-1 (D11): `vendorName` states WHOSE page this is, and therefore its DIRECTION. The
// draft core's direction-family arm now binds every agent-lane coded draft rather than only the
// autodraft wake kind, and this helper feeds clara.wake_draft_entry — so a SALES coding kind on
// a page naming a third-party supplier is refused CLR21 `direction_family_mismatch`. The default
// is the third party (purchase, the (P2) arm); a sales caller passes the CLIENT's own registered
// name (the (S) arm). One stated field, and a real invoice states it.
async function purchaseDoc(sub, { client, gross, vendorName = "X37 SUPPLIER SDN BHD" }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(gross), kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, rm(gross)),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, vendorName),
    factField(FIELD.invoiceId, `X37-${randomUUID().slice(0, 8)}`),
    ...statedIdentityFields(gross),
  ], { envelope: agreedEnvelope() });
  return cited;
}

/** A TYPED supplier_bill, approved -- the only lane that mints coding_kind
 *  ='supplier_bill' is the wake drafter (the human verb carries no coding kind). */
async function approvedSupplierBill(sub, { client, cp, cents, control = AP1, checker = null, attestation = null }) {
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
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37-billa") };
  // A wake-drafted bill is AGENT-MADE, so at/above the high-stakes threshold the CLR05 floor
  // demands an attestation from whoever approves it -- checker distinctness does not clear an
  // agent maker. Callers that build a high-stakes fixture pass one.
  if (attestation != null) args.attestation = attestation;
  await approveEntry(checker ?? sub, args);
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
// x37.c2 -- THE POSITIVE due_date BIRTH-STAMP (fix-wave E3, asbuilt-authority.md
// finding 7). WCC-R4 (design section 4.4, register entry 7a): a typed
// invoice/bill item is stamped `due_date = posting_date + payment_terms_days`
// AT BIRTH (append-only -- open_items never back-fills). x40.ae (Wave C-c)
// already proves the NEGATIVE half (an out-of-scope item kind is never
// stamped) against this suite's own fixture world, which cannot cheaply mint a
// TYPED entry -- so it left this positive half explicitly OWED. This cell pays
// it here, the one fixture world that CAN mint a typed supplier_bill through
// the wake lane, using the exact numbers named in the finding: terms 30,
// item_date 2033-03-05 -> due_date 2033-04-04 EXACT.
//
// GATED LOCALLY (not by has37/skipHere alone): the due_date PRODUCER and
// set_counterparty_terms are BOTH 0040-vintage (0037 ships the due_date COLUMN
// with "NO PRODUCER", 0037:717); this suite's own has0037() gate does not
// distinguish "37-39 applied" from "37-40 applied". Skip gracefully rather
// than hard-fail if 0040's objects are not yet part of the applied chain.
// ===========================================================================
test("x37.c2 due_date is stamped at BIRTH for a REAL typed supplier_bill: terms 30, item_date 2033-03-05 -> due_date 2033-04-04 exact", async (t) => {
  if (skipHere(t)) return;
  const has0040Terms = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='set_counterparty_terms' limit 1",
  );
  if (has0040Terms.rowCount === 0) {
    markSkip();
    t.skip("clara.set_counterparty_terms not found -- 0040 is not (yet) part of the applied migration chain");
    return;
  }
  const sub = world.users.alice;
  const client = world.clients.A1;
  // registration grepped clean against every other cell's in this file (0001/0077/0088/0099/0111
  // are all claimed elsewhere -- 0099 collided with x37.ab's PAYCO and cost it "counterparty was
  // born", the exact neighbor-perturbation this note now guards against by name).
  const cp = await birthCounterparty(sub, { client, name: `X37C2 BILLCO ${randomUUID().slice(0, 6)}`, registration: "201801370042" });

  await humanQuery(
    sub,
    namedCall("set_counterparty_terms", [{ name: "p_counterparty" }, { name: "p_days" }, { name: "p_op_key" }]),
    [cp, 30, opk("x37c2-terms")],
  );
  const cents = 180000; // RM1,800 -- comfortably under the RM10k high-stakes default
  const firm = await firmOf(client);
  const cited = await purchaseDoc(sub, { client, gross: cents });
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, FIELD.total);
  const d = await wakeDraftEntry(cred, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines: billLines(EXPN, AP1, cents), document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp }, evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind: "supplier_bill", postingDate: "2033-03-05", opKey: opk("x37c2-bill"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37c2-billa") });

  const items = await itemsOf(d.entry_id);
  assert.equal(items.length, 1, "the typed supplier_bill mints exactly one ap item");
  assert.equal(items[0].item_kind, "bill", "item_kind='bill' -- the ONLY typed kind this fixture can mint besides 'invoice'");
  assert.equal(items[0].item_date, "2033-03-05", "x37.c2 mandatory setup: item_date falls back to the entry's posting_date");
  assert.equal(items[0].due_date, "2033-04-04", "x37.c2: due_date = item_date(2033-03-05) + 30 days = 2033-04-04 EXACT, stamped at birth from the terms in effect at approval");
  await assertTies(client, "x37.c2 due_date birth-stamp");
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
  // The receipt NAMES its group (`group_id`) -- asserted, not merely hoped for: a verb
  // whose receipt stops naming the group it wrote is a real interface regression for
  // C-c's workbench, and the derived fallback below would have hidden it.
  assert.ok(
    groupOf(receipt),
    `apply_open_items' receipt names its application_group under group_id (got ${JSON.stringify(receipt)})`,
  );
  // The fallback stays as a belt: if the receipt ever loses the field the cell fails on the
  // assertion above rather than on an opaque null-group query three lines later.
  const group = groupOf(receipt) ?? (await groupForItem(credItem.id));
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
      // AMENDMENT 0040: effective_date is NOT NULL (the as-of grain C-c added). A forged
      // insert that omits it dies at 23502 BEFORE the belt runs, which would silently
      // retire this cell's real subject -- the two-sided bound. Supplied so the BELT is
      // still what refuses.
      `insert into clara.open_item_allocations(firm_id,client_id,domain,item_id,application_group,operation_kind,amount_cents,effective_date,reason,created_by)
       values($1,$2,'ar',$3,$4,'apply',50000,current_date,'x37 inflation probe',$6),
              ($1,$2,'ar',$5,$4,'apply',-50000,current_date,'x37 inflation probe',$6)`,
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
      // AMENDMENT 0040: effective_date is NOT NULL -- supplied so the BELT, not the
      // column's own constraint, is what refuses this group.
      `insert into clara.open_item_allocations(firm_id,client_id,domain,item_id,application_group,operation_kind,amount_cents,effective_date,reason,created_by)
       values($1,$2,'ar',$3,$4,'apply',-20000,current_date,'x37 non-zero-net probe',$5)`,
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

  // -------------------------------------------------------------------------
  // THE SECOND RACE: REVERSE vs ALLOCATE. The first race is allocate-vs-allocate,
  // which the composites serialize on the client advisory rung they both take.
  // reverse_entry historically took NEITHER advisory rung -- only the JE row lock,
  // which a composite settling a PRE-EXISTING item never touches. So the two verbs
  // ran fully concurrently past each other's reads: reverse checks "does this
  // entry's item carry allocations?" and allocates writes "yes it does", in either
  // order, and the loser is a reversed entry whose items carry live allocations
  // pointing at an unwind that has already been written. This schedule proves the
  // rung closed it -- and it proves it the only way a lock claim CAN be proven:
  // by observing the second session BLOCK (pg_blocking_pids), because a schedule
  // that never blocked would pass against no locking at all.
  // -------------------------------------------------------------------------
  const target = await openArItem(users.alice, { client, cp, cents: 41000, memo: "x37 reverse-vs-allocate target" });
  const reverseSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      "select clara.reverse_entry(p_entry => $1, p_reason => $2, p_op_key => $3) as r",
      [target.entry, "x37 race reversal", opk("x37-raceRev")],
    );
    return r.rows[0].r;
  })();
  const allocateSide = (c) => (async () => {
    await c.query(GUARD);
    const r = await c.query(
      `select clara.allocate_receipt(p_client => $1, p_counterparty => $2, p_posting_date => $3::date,
         p_memo => $4, p_bank_account => $5, p_amount_cents => $6::bigint,
         p_allocations => $7::jsonb, p_op_key => $8, p_control_account => $9) as r`,
      [client, cp, "2026-04-21", "x37 race receipt vs reversal", BANK, 41000,
        JSON.stringify([{ item_id: target.item, amount_cents: 41000 }]), opk("x37-raceAlloc"), AR1],
    );
    return r.rows[0].r;
  })();

  const rr = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: users.bob, run: reverseSide },
    b: { role: ROLES.authenticated, jwtSub: users.alice, run: allocateSide },
  });
  assert.ok(rr.provedBlocked, "the allocating session BLOCKED on the reversing session's client advisory rung (blocking-pid proven) -- reverse and allocate are serialized");
  assert.ok(!sawDeadlock(rr), `no deadlock in either direction (a=${rr.a?.code ?? "ok"} b=${rr.b?.code ?? "ok"})`);
  assert.equal(rr.a.ok, true, `the reversal committed (got ${rr.a.code} -- ${rr.a.message})`);
  assert.equal(rr.b.ok, false, "the allocation that woke up behind it did NOT settle a claim the books had just withdrawn");
  assert.equal(
    /allocation_target_reversed/.test(String(rr.b.message)), true,
    `the loser is refused by NAME -- allocation_target_reversed (got ${rr.b.code}: ${String(rr.b.message).slice(0, 200)})`,
  );
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.open_item_allocations where item_id=$1", [target.item])).rows[0].n,
    0, "and it wrote no allocation row at all -- the reversed entry's unwind stands alone",
  );
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

  // (4b) THE MIRROR IS NOT REVISABLE. The sanctioned sequence high-stakes reverse ->
  // revise_entry(the draft mirror, new amounts) -> approve_entry would otherwise break the
  // unwind identity SILENTLY: revise rewrites the legs wholesale (and does not carry
  // counterparty_id onto them), so the "exact negation" the whole reversal story rests on
  // would become whatever the reviser typed. The refusal is the cheap structural guard;
  // belt-1's legs-derived arm is the expensive one behind it.
  const revised = await caught(() => reviseEntry(users.bob, {
    entry: bigMirror.id, expectedRevision: bigMirror.revision_token,
    lines: [
      { account_code: AR2, debit_cents: 0, credit_cents: 1000, description: "revised mirror ar" },
      { account_code: REVN, debit_cents: 1000, credit_cents: 0, description: "revised mirror rev" },
    ],
    opKey: opk("x37-revmirror"),
  }));
  assert.ok(revised, "revising a REVERSAL MIRROR must be refused -- an unwind is a negation, not a draft to edit");
  assert.equal(revised.code, CLR10, `the mirror-revise refusal is CLR10 (got ${revised.code} -- ${revised.message})`);
  assert.equal(
    reasonOf(revised), "reversal_mirror_not_revisable",
    `the named reason is reversal_mirror_not_revisable (got ${reasonOf(revised)})`,
  );
  assert.ok(/withdraw/i.test(String(revised.message)), `the message names the remedy -- withdraw the mirror and re-reverse (got: ${revised.message})`);
  assert.equal(await entryStatusOf(bigMirror.id), "draft", "the refused revise left the mirror a draft");

  await approveEntry(users.alice, {
    entry: bigMirror.id, expectedRevision: bigMirror.revision_token,
    attestation: "x37 reviewed high-stakes reversal", opKey: opk("x37-rev5a"),
  });
  assert.equal(await entryStatusOf(bigMirror.id), "approved", "the checker approved the mirror");
  const bigUnwind = await itemsOf(bigMirror.id);
  assert.equal(bigUnwind.length, 1, "approving the mirror fires the hook through approve path 1");
  assert.equal(Number(bigUnwind[0].amount_cents), -HIGH_STAKES_CENTS, "the deferred unwind is still the exact negation");

  // (5) THE REVERSED TARGET IS NOT ALLOCATABLE -- the real-cash half. `clean` was reversed
  // in (1): its item still reads +RM350 outstanding (the unwind is a SEPARATE item, and
  // outstanding is per item, never netted across the pair), so without a reversed_by read
  // every settlement verb would happily pay real money against a claim the books have
  // already withdrawn. All THREE verbs must refuse under one named reason, and the message
  // must point at the route that IS correct: apply the unwind.
  assert.equal(await outstandingOf(clean.item), 35000, "the reversed entry's item still reads its full outstanding (this is exactly why the guard is needed)");
  const cleanUnwindItem = unwind[0].id;

  const rcptRev = await caught(() => allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 35000,
    allocations: [{ item_id: clean.item, amount_cents: 35000 }],
  }));
  assert.ok(rcptRev, "allocate_receipt must REFUSE an item whose entry has been reversed");
  assert.equal(rcptRev.code, CLR10, `the reversed-target refusal is CLR10 (got ${rcptRev.code} -- ${rcptRev.message})`);
  assert.equal(reasonOf(rcptRev), "allocation_target_reversed", `the named reason is allocation_target_reversed (got ${reasonOf(rcptRev)})`);
  assert.ok(/unwind|revers/i.test(String(rcptRev.message)), `the message points at the reversal unwind (got: ${rcptRev.message})`);

  // The AP mirror of the same law, on its own reversed bill.
  const apCp = await birthCounterparty(sub, { client, name: `X37 REVAPCO ${randomUUID().slice(0, 6)}` });
  const apRev = await openApItem(sub, { client, cp: apCp, cents: 28000, memo: "x37 reversible purchase" });
  await reverseEntry(users.bob, { entry: apRev.entry, reason: "x37 ap unwind", opKey: opk("x37-rev6") });
  const payRev = await caught(() => allocatePayment(sub, {
    client, counterparty: apCp, amountCents: 28000,
    allocations: [{ item_id: apRev.item, amount_cents: 28000 }],
  }));
  assert.ok(payRev, "allocate_payment must REFUSE an item whose entry has been reversed");
  assert.equal(reasonOf(payRev), "allocation_target_reversed", `the AP arm carries the same named reason (got ${reasonOf(payRev)})`);

  // apply_open_items too -- an UNRELATED credit may not be set off against a withdrawn claim.
  const strayEntry = await approvedGeneric(sub, {
    client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents: 12000, memo: "x37 stray credit",
  });
  const strayItem = (await itemsOf(strayEntry))[0];
  const applyRev = await caught(() => applyOpenItems(sub, {
    client, applications: [{ source_item_id: strayItem.id, target_item_id: clean.item, amount_cents: 12000 }],
  }));
  assert.ok(applyRev, "apply_open_items must REFUSE an unrelated credit against a reversed entry's item");
  assert.equal(reasonOf(applyRev), "allocation_target_reversed", `the apply arm carries the same named reason (got ${reasonOf(applyRev)})`);

  // (6) ...AND THE ROUTE THE MESSAGE NAMES ACTUALLY WORKS. The item's OWN reversal unwind
  // applies against it: both sides go to zero, the GL never moves, and the pair leaves no
  // phantom outstanding behind. This is the whole point of refusing (5) rather than
  // silently allowing cash to chase a withdrawn claim -- so it is asserted here, not
  // assumed. (It is also the boundary the guard must respect: the unwind's own entry is
  // the MIRROR, which carries reversal_of, not reversed_by.)
  const glBeforeUnwind = await controlGl(client, "ar");
  const unwindApply = await applyOpenItems(sub, {
    client, reason: "x37 apply the reversal unwind",
    applications: [{ source_item_id: cleanUnwindItem, target_item_id: clean.item, amount_cents: 35000 }],
  });
  assert.ok(groupOf(unwindApply), "the unwind application commits and names its group");
  assert.equal(await outstandingOf(clean.item), 0, "the reversed entry's item is closed by its own unwind");
  assert.equal(await outstandingOf(cleanUnwindItem), 0, "and the unwind item is consumed exactly");
  assert.equal(await controlGl(client, "ar"), glBeforeUnwind, "applying an unwind moves the GL by ZERO -- it is a subledger event");
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

  // THE APPROVE-TIME RE-DERIVATION (the TOCTOU half). set_document_kind can flip a
  // document invoice -> credit_note at ANY moment, and the WCA-R7 draft window is a wide
  // one: the composite's read happens when the maker proposes, the money moves when the
  // checker approves, and between those two the wall has to be re-asked where the cash
  // actually leaves. A maker-time-only wall is a wall with a scheduled opening.
  const cp2 = await birthCounterparty(sub, { client, name: `X37 CNLATECO ${randomUUID().slice(0, 6)}`, registration: "201801370111" });
  const big = await approvedSupplierBill(sub, {
    client, cp: cp2, cents: HIGH_STAKES_CENTS, checker: world.users.bob,
    attestation: "x37 reviewed the high-stakes agent-drafted bill",
  });
  const bigItem = (await itemsOf(big.entry))[0];
  const draftPay = await allocatePayment(sub, {
    client, counterparty: cp2, amountCents: HIGH_STAKES_CENTS,
    allocations: [{ item_id: bigItem.id, amount_cents: HIGH_STAKES_CENTS }],
  });
  assert.equal(draftPay.status, "draft", "at the threshold the payment waits for a checker (the window this probe needs)");
  // ...and the mis-code is discovered DURING that window (the x36c0 raw-stamp fixture idiom).
  await rootQuery("update clara.documents set document_kind='credit_note' where id=$1", [big.documentId]);
  const rev = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [draftPay.entry_id])).rows[0].revision_token;
  const late = await caught(() => approveEntry(world.users.bob, {
    entry: draftPay.entry_id, expectedRevision: rev, opKey: opk("x37-cnlate"),
  }));
  assert.ok(late, "the checker's approve must be REFUSED once the target's document is a credit note");
  assert.equal(late.code, CLR10, `the approve-time wall refuses CLR10 (got ${late.code} -- ${late.message})`);
  assert.equal(reasonOf(late), "credit_note_item", `the approve-time wall carries the SAME named reason (got ${reasonOf(late)})`);
  assert.equal(await entryStatusOf(draftPay.entry_id), "draft", "the refused approve left the settlement a draft");
  assert.equal(await outstandingOf(bigItem.id), HIGH_STAKES_CENTS, "and moved nothing against the mis-coded item");
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
  // 0042 (D-b SS4, [L3/V3+C3-1]) factored the two allocation composites into preheld-aware
  // CORES so the AF-2 composite can pre-reserve their op keys and call them. The census of
  // ungranted subledger internals therefore GREW by two: the cores now hold the money-moving
  // body, so a grant on one would be a bypass of the bookkeeper+ floor that lives in the
  // public wrapper. Pinned at the NEW membership, not at 0037's three.
  const cores = ["_subledger_classify_entry", "_subledger_on_approve", "_subledger_decompose_preview",
    "_allocate_receipt_core", "_allocate_payment_core"];
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

  // ---------------------------------------------------------------------
  // THE LOCK-ORDER PIN (design section 4.9, as amended to the AS-BUILT order).
  //
  // A total lock order is a claim about ACQUISITION SEQUENCE, and the only place that
  // sequence exists is the function bodies. A prose paragraph in a design doc cannot fail;
  // this can. Every future verb that touches open_items has to slot into the same ladder or
  // turn one of these pins red -- which is the whole point, because the failure mode a lock
  // order prevents (a deadlock between two lawful callers) is exactly the kind that shows up
  // once, in production, under load, and never in a serial test run.
  //
  // The ladder, in acquisition order:
  //   op-receipt -> advisory 203005003 (client:counterparty) -> advisory 203005004 (client)
  //   -> open_items (batch FOR UPDATE ... ORDER BY id) -> journal_entries
  // with ONE named exception, stated in the design's amended section 4.9: a verb that locks
  // a PRE-EXISTING journal_entries row (reverse_entry, approve_wrong_client_correction)
  // takes that row lock BEFORE the client advisory -- because the core does, and inverting
  // it in one verb would be the deadlock. The composites never lock a pre-existing entry:
  // they lock only the entry they just inserted, which no other session can see.
  const positions = (src, needles) => needles.map((n) => src.indexOf(n));
  const ordered = (src, needles, label) => {
    const at = positions(src, needles);
    at.forEach((p, i) => assert.ok(p >= 0, `${label}: the body must contain the rung "${needles[i]}" (not found)`));
    for (let i = 1; i < at.length; i++) {
      assert.ok(
        at[i - 1] < at[i],
        `${label}: "${needles[i - 1]}" must be acquired BEFORE "${needles[i]}" (got ${at[i - 1]} vs ${at[i]}) -- the total lock order is inverted`,
      );
    }
  };

  // 0042 (design SS4 "public wrappers reserve-then-delegate; S4.Z pins move to the cores",
  // [L3/V3+C3-1]) moved the two allocation BODIES into clara._allocate_{receipt,payment}_core.
  // The ladder is a claim about the body that ACQUIRES, so the pin follows it there -- not one
  // rung dropped, same order, same needles. The wrapper keeps its own pin below, because a pin
  // that only watched the core would let a future build quietly re-inline the ladder into the
  // public verb and escape this cell entirely.
  for (const fn of ["_allocate_receipt_core", "_allocate_payment_core"]) {
    ordered(await fnSource(fn), [
      "clara._reserve_op(",                       // the op-receipt rung
      "pg_advisory_xact_lock(203005003",          // client:counterparty
      "pg_advisory_xact_lock(203005004",          // client
      "for update",                               // the open_items batch lock
      "insert into clara.journal_entries",        // its OWN new entry, last
    ], `${fn} lock order`);
  }
  // THE WRAPPER PIN. Each public verb is now a delegator: the bookkeeper+ floor, then the core
  // call, and NOTHING that acquires. `receipt_preheld=false` is what keeps the public path's
  // receipt identical to its pre-0042 one (the core still reserves under the verb's own fn
  // name), so a replayed op_key still returns the receipt the caller remembers.
  for (const fn of ["allocate_receipt", "allocate_payment"]) {
    const src = await fnSource(fn);
    ordered(src, [
      "clara._human_ctx(clara.role_rank('bookkeeper'))", // the floor stays in the wrapper ...
      `clara._${fn}_core(`,                              // ... above the delegation
    ], `${fn} delegation order`);
    assert.ok(src.includes("'receipt_preheld', false"),
      `clara.${fn} must hand the core receipt_preheld=false -- otherwise the core skips its own clara._reserve_op and the public path posts with NO op receipt at all`);
    for (const rung of ["clara._reserve_op(", "pg_advisory_xact_lock(203005003",
      "pg_advisory_xact_lock(203005004", "for update", "insert into clara.journal_entries"]) {
      assert.ok(!src.includes(rung),
        `clara.${fn} must acquire NOTHING in its own body -- found the rung "${rung}", so the ladder has been re-inlined above the core and the core's pin no longer covers the live path`);
    }
  }
  for (const fn of ["unallocate_group", "apply_open_items"]) {
    // These two never reach the core and never insert an entry, so their ladder is the tail
    // of the same order: receipt -> client advisory -> open_items batch.
    ordered(await fnSource(fn), [
      "clara._reserve_op(",
      "pg_advisory_xact_lock(203005004",
      "for update",
    ], `${fn} lock order`);
  }
  // The two PATCHED verbs -- the named exception. JE row lock FIRST (as the core does),
  // then the client advisory, and only THEN the subledger read the advisory exists to make
  // safe. A body that probed the subledger before taking 203005004 would be back to the
  // check-then-act window the concurrency cell proves is closed.
  ordered(await fnSource("reverse_entry"), [
    "from clara.journal_entries where id=p_entry for update",
    "pg_advisory_xact_lock(203005004",
    "clara._subledger_allocated_items_present(",
  ], "reverse_entry lock order");
  ordered(await fnSource("approve_wrong_client_correction"), [
    "for update of je",
    "pg_advisory_xact_lock(203005004",
    "clara._subledger_allocated_items_present(",
  ], "approve_wrong_client_correction lock order");
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

  // =========================================================================
  // THE STALENESS AXES. WCA-R7 buys /queue muscle memory with a WINDOW: the composite
  // validates when the maker proposes, the money moves when the checker approves, and
  // between the two the world is free to move. The stored proposal is a statement ABOUT a
  // world; the hook's job at approve is to re-derive that world under the locks and refuse
  // if it moved -- never to silently re-aim somebody's money at whatever the entry now says.
  //
  // Five axes, one reason token (`allocation_stale` -- the remedy is identical in every
  // case: re-run the allocation), discriminated by `axis` in DETAIL. Four of them move the
  // SETTLEMENT ENTRY (the draft window is also a revise window, and revise_entry rewrites
  // legs wholesale WITHOUT carrying counterparty_id, 0016:4836-4840); the fifth moves the
  // TARGET (another human allocates the same invoice first). The perturbations are applied
  // to the DRAFT by direct construction rather than through revise_entry, deliberately: a
  // draft's lines are mutable by anything with write access (t_jl_immutable guards only the
  // POST-APPROVAL row), so direct surgery is the strictly WIDER threat model -- it covers
  // revise_entry and anything else that ever learns to touch a draft.
  // =========================================================================
  const axisOf = (err) => {
    const m = /"axis"\s*:\s*"([a-z_]+)"/.exec(err?.detail ?? "");
    return m ? m[1] : null;
  };
  /** A fresh at-threshold settlement DRAFT + its target, ready to be perturbed. */
  const stageDraft = async (tag) => {
    const party = await birthCounterparty(users.alice, { client, name: `X37 STALE${tag} ${randomUUID().slice(0, 6)}`, kind: "customer" });
    const target = await openArItem(users.alice, { client, cp: party, cents: threshold, control: AR2, checker: users.bob });
    const draft = await allocateReceipt(users.alice, {
      client, counterparty: party, amountCents: threshold,
      allocations: [{ item_id: target.item, amount_cents: threshold }],
    });
    assert.equal(draft.status, "draft", `x37.u/${tag}: the at-threshold composite left a draft (mandatory setup)`);
    return { party, target, draft };
  };
  const checkerApprove = async (entry, tag) => {
    const token = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [entry])).rows[0].revision_token;
    return caught(() => approveEntry(users.bob, { entry, expectedRevision: token, opKey: opk(`x37-stale-${tag}`) }));
  };
  const assertStale = async (err, axis, tag, entry, targetItem, targetOutstanding) => {
    assert.ok(err, `x37.u/${tag}: the checker's approve must be REFUSED once the world moved`);
    assert.equal(err.code, CLR10, `x37.u/${tag}: the refusal is CLR10 (got ${err.code} -- ${err.message})`);
    assert.equal(reasonOf(err), "allocation_stale", `x37.u/${tag}: the named reason is allocation_stale (got ${reasonOf(err)})`);
    assert.equal(axisOf(err), axis, `x37.u/${tag}: the DETAIL names axis='${axis}' (got ${axisOf(err)}) -- the axes must be distinguishable to the maker`);
    assert.equal(await entryStatusOf(entry), "draft", `x37.u/${tag}: the refused approve left the settlement a draft`);
    assert.equal((await itemsOf(entry)).length, 0, `x37.u/${tag}: and materialised NOTHING`);
    assert.equal(await outstandingOf(targetItem), targetOutstanding, `x37.u/${tag}: the target is untouched`);
  };

  // AXIS 1 -- COUNTERPARTY. The control leg is re-stamped to a different customer, so the
  // settlement item this entry now mints belongs to somebody else than the proposal names.
  {
    const s = await stageDraft("cp");
    const other = await birthCounterparty(users.alice, { client, name: `X37 STALEOTHER ${randomUUID().slice(0, 6)}`, kind: "customer" });
    await rootQuery(
      "update clara.journal_lines set counterparty_id=$2 where entry_id=$1 and counterparty_id is not null",
      [s.draft.entry_id, other],
    );
    await assertStale(await checkerApprove(s.draft.entry_id, "cp"), "counterparty", "cp", s.draft.entry_id, s.target.item, threshold);
  }
  // AXIS 2 -- SETTLEMENT ITEM COUNT. The single control credit is split across two
  // customers, so the entry now carries TWO ar items and the proposal describes neither.
  {
    const s = await stageDraft("cnt");
    const other = await birthCounterparty(users.alice, { client, name: `X37 STALESPLIT ${randomUUID().slice(0, 6)}`, kind: "customer" });
    // ONE transaction: the balance constraint trigger is DEFERRED, so a perturbation split
    // across two autocommit statements would die on the intermediate unbalanced state
    // instead of reaching the approve this axis is about.
    await withActor({ transaction: true }, async (c) => {
      const ctrl = (await c.query(
        "select line_no from clara.journal_lines where entry_id=$1 and counterparty_id is not null order by line_no limit 1",
        [s.draft.entry_id],
      )).rows[0];
      await c.query("update clara.journal_lines set credit_cents=credit_cents-1000 where entry_id=$1 and line_no=$2", [s.draft.entry_id, ctrl.line_no]);
      await c.query(
        `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
         values($1,99,$2,0,1000,'x37 split control leg',$3)`,
        [s.draft.entry_id, AR1, other],
      );
    });
    await assertStale(await checkerApprove(s.draft.entry_id, "cnt"), "settlement_item_count", "cnt", s.draft.entry_id, s.target.item, threshold);
  }
  // AXIS 3 -- SETTLEMENT AMOUNT, revised DOWN. The entry now discharges less than the
  // proposal allocates: paying RM(threshold) of invoices out of a smaller receipt is how a
  // subledger silently stops tying.
  {
    const s = await stageDraft("amt");
    await withActor({ transaction: true }, async (c) => {
      await c.query("update clara.journal_lines set debit_cents=debit_cents-1000 where entry_id=$1 and debit_cents>0", [s.draft.entry_id]);
      await c.query("update clara.journal_lines set credit_cents=credit_cents-1000 where entry_id=$1 and credit_cents>0", [s.draft.entry_id]);
    });
    await assertStale(await checkerApprove(s.draft.entry_id, "amt"), "settlement_amount", "amt", s.draft.entry_id, s.target.item, threshold);
  }
  // AXIS 4 -- OUTSTANDING (CX-M1). Nothing is perturbed at all: a SECOND human simply
  // allocates part of the same invoice through the ordinary lane while the first proposal
  // waits in the queue. "Still fits" would accept this silently whenever the remainder
  // happened to be large enough; only EQUALITY against the outstanding the composite
  // actually saw means "nothing moved".
  {
    const s = await stageDraft("out");
    const interim = await allocateReceipt(users.alice, {
      client, counterparty: s.party, amountCents: 1000,
      allocations: [{ item_id: s.target.item, amount_cents: 1000 }],
    });
    assert.equal(interim.status, "approved", "the intervening partial receipt is below the threshold and commits in-call (mandatory setup)");
    assert.equal(await outstandingOf(s.target.item), threshold - 1000, "the target's outstanding really moved between maker and checker");
    await assertStale(await checkerApprove(s.draft.entry_id, "out"), "outstanding", "out", s.draft.entry_id, s.target.item, threshold - 1000);
  }
  // AXIS 5 -- PROPOSAL UNPINNED, fail-CLOSED. A proposal carrying no expected outstanding
  // was not written by the composites this migration ships (a pre-fix draft parked in the
  // queue across the deploy, or a hand-built one). It cannot be equality-checked, so it is
  // refused rather than approved on a weaker test.
  {
    const s = await stageDraft("pin");
    await rootQuery(
      `update clara.journal_entries e
          set flags = jsonb_set(e.flags, '{settlement_allocation,allocations}', (
                select coalesce(jsonb_agg(x.elem - 'expected_outstanding_cents'), '[]'::jsonb)
                  from jsonb_array_elements(e.flags->'settlement_allocation'->'allocations') as x(elem)))
        where e.id=$1`,
      [s.draft.entry_id],
    );
    await assertStale(await checkerApprove(s.draft.entry_id, "pin"), "proposal_unpinned", "pin", s.draft.entry_id, s.target.item, threshold);
  }
  await assertTies(client, "x37.u staleness axes");
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
  // THE AS-BUILT BRANCH, PINNED. The design allowed either shape (draft-then-self-approve,
  // or an in-call attested approve); the build chose the FIRST -- at/above the threshold the
  // composite always leaves a draft, in a solo firm exactly as in a two-checker one, and the
  // attestation is spent on the ordinary approve_entry that follows. That is the better of
  // the two (one high-stakes path, not two) and it is now asserted rather than tolerated: a
  // build that started auto-approving attested settlements in-call would be a real widening
  // of what one person can do in one call, and a shape-tolerant cell would not see it.
  assert.equal(
    receipt.status, "draft",
    `at/above the threshold the composite leaves a DRAFT even in a solo firm with an attestation in hand (got '${receipt.status}')`,
  );
  assert.equal((await itemsOf(receipt.entry_id)).length, 0, "the solo draft materialises nothing either");
  {
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
  // With the draft branch pinned above, the unattested call cannot reach an approve at all,
  // so the assertion is the END STATE both readings agree on: never approved. (A build that
  // ever moves to the in-call attested-approve shape would refuse this call CLR05 instead --
  // which this assertion would ALSO catch, because a raised error is not a draft.)
  const noAttest = await allocateReceipt(sub, {
    client, counterparty: cp, amountCents: threshold,
    allocations: [{ item_id: item2, amount_cents: threshold }],
  });
  assert.equal(noAttest.status, "draft", "without an attestation the settlement can only be a draft, never approved");
  assert.equal(await entryStatusOf(noAttest.entry_id), "draft", "and it really is one");
  assert.equal(await outstandingOf(item2), threshold, "and its target is untouched while it waits");
  await assertTies(client, "x37.v solo unattested");
});

// ===========================================================================
// x37.w -- THE WCA-R8 EVIDENCE PIN, **FLIPPED** (F-A2 PR-1, D39).
//
// THE RETIRED CLAIM, named rather than deleted: *"three employee claims STILL breed a
// vendor_account proposal (the section 5.3 debt's live witness)"*. The cell asserted a DEFECT
// on purpose -- the sighting pool was not segregated by posting shape or party role, so three
// approved staff claims bred an autopost proposal binding a natural person to the claim expense
// account -- and its own header said the assertion FLIPS the day the debt is paid: *"when pool
// segregation lands this assertion must flip to 0 and this cell must be re-ruled."*
//
// IT IS PAID, THOUGH NOT BY SEGREGATION, AND THE GROUND MATTERS. The eighth
// `clara._approve_entry_core` body excises `0037:2046-2100` whole (design 3.5), so approval
// breeds nothing at all: no sighting, no vendor_account proposal, no `rule_proposal` question.
// The section 5.3 vector is CLOSED BY REMOVAL rather than by segregation, and that is a
// stronger closure than the one this pin was waiting for -- there is no pool to segregate.
// The re-ruling the header demanded is D39's claim split, and this cell is now the
// employee-claim arm of C.8's inverted twin set (`f-a2.c8.inv-employee` forces the same
// inversion inside the F-A2 battery). The claim-shaped halves of the old cell -- the employee
// really is birthed as a 'vendor', a staff claim mints no ap item, the books still tie --
// survive verbatim, because none of them was ever about breeding.
// ===========================================================================
test("x37.w WCA-R8 evidence pin FLIPPED (D39): three employee claims no longer breed a vendor_account proposal -- the section 5.3 vector is closed by the excision", async (t) => {
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
    proposal.rowCount, 0,
    `WCA-R8 PIN, FLIPPED (D39): NO vendor_account proposal row exists -- three approved staff claims no longer bind a natural person to an expense account, because the eighth _approve_entry_core body breeds nothing at all. The exact vector WC-R10(ii) named was the CLAIMX expense account; got ${JSON.stringify(proposal.rows.map((r) => [r.account_code, r.status]))}.`,
  );
  // …AND THE POOL ITSELF IS EMPTY, which is the reason rather than a second symptom. Reading
  // only the proposal would leave a segregated-pool world (sightings accrue, proposals are
  // withheld) indistinguishable from this one, and the two are different closures.
  assert.equal(
    (await rootQuery(
      "select count(*)::int as n from clara.rule_sightings where client_id=$1 and counterparty_id=$2",
      [client, cp])).rows[0].n,
    0, "…and the sighting pool behind it is empty too -- the vector is closed by REMOVAL, not by segregation");
  noteLane(`x37.w WCA-R8 evidence pin FLIPPED: the section 5.3 debt (an employee-as-vendor bound to ${CLAIMX} by three assisted approvals) is closed by F-A2's breeding excision. Successor cell: f-a2.c8.inv-employee.`);
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
// x37.y -- THE OUTBOX LAW, PROVEN PAST THE FIRST WRITE. A composite that refuses
// mid-flight rolls its events back with everything else: zero new items, zero
// allocations, zero open_item.* events, zero new entries of ANY status.
//
// The instrument matters more than the claim here. The v1 cell drove this with a
// duplicated allocation line -- an input-validation refusal that fires in the
// argument-normalisation block, BEFORE the composite has written a single row.
// "Nothing survived" is then arithmetically true of a call that never wrote
// anything, and the outbox law was never exercised at all. This version uses the
// CLR26 open-question block, which lives inside _approve_entry_core: the composite
// has already inserted its settlement entry, its lines and its op-receipt
// reservation by the time it raises. THAT is a rollback with something to roll back.
// ===========================================================================
test("x37.y outbox law: a composite that fails AFTER inserting its entry leaves ZERO events, items, allocations and entries", async (t) => {
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
    lines: (await rootQuery("select count(*)::int as n from clara.journal_lines where client_id=$1", [client])).rows[0].n,
    // The op-receipt reservation is part of the claim: a rolled-back reservation
    // VANISHES (0004:43-60), which is what makes a retry with the same key legal.
    receipts: (await rootQuery(
      "select count(*)::int as n from clara.op_receipts r join clara.clients c on c.firm_id=r.firm_id where c.id=$1 and r.fn like 'allocate%'",
      [client],
    )).rows[0].n,
  });

  // The block is a CLIENT-scope open question -- resolved in a finally, because left open it
  // would poison every later approve on this client (the x37.x discipline).
  const q = await openQuestion(sub, { client, scopeKind: "client", scopeId: client, question: "x37.y which account is this receipt?" });
  const qid = q?.question_id ?? q?.id ?? q;
  try {
    const before = await snap();
    const err = await caught(() => allocateReceipt(sub, {
      client, counterparty: cp, amountCents: 20000,
      allocations: [{ item_id: item, amount_cents: 20000 }],
    }));
    assert.ok(err, "the composite refused (mandatory setup for an outbox-law probe)");
    assert.equal(err.code, CLR26, `the refusal is the CLR26 block, i.e. it fired INSIDE the core, past the entry insert (got ${err.code} -- ${err.message})`);
    const after = await snap();
    assert.deepEqual(after, before, `the aborted composite left NOTHING behind (before=${JSON.stringify(before)} after=${JSON.stringify(after)})`);
    assert.equal(await outstandingOf(item), 20000, "and the target it was about to settle is untouched");
    await assertTies(client, "x37.y outbox rollback");
  } finally {
    await resolveOpenQuestion(sub, { question: qid, resolution: "x37.y answered" }).catch(() => {});
  }
});

// ===========================================================================
// x37.y2 -- INPUT VALIDATION (the cell x37.y used to be, retitled to what it
// actually proves). A duplicated item in one allocation set is refused by NAME in
// the normalisation block -- before the op-key is even reserved -- so a caller
// gets `allocations_duplicated` rather than a two-line group that over-allocates
// past zero and dies in belt-2 with a message about bounds.
// ===========================================================================
test("x37.y2 input validation: the same open item twice in ONE allocation set is refused by name, before any write", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 DUPARGCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const { item } = await openArItem(sub, { client, cp, cents: 20000 });

  const err = await caught(() => allocateReceipt(sub, {
    client, counterparty: cp, amountCents: 20000,
    allocations: [{ item_id: item, amount_cents: 10000 }, { item_id: item, amount_cents: 10000 }],
  }));
  assert.ok(err, "one item stated twice in a single allocation set must be refused");
  assert.equal(err.code, CLR10, `the refusal is CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "allocations_duplicated", `the named reason is allocations_duplicated (got ${reasonOf(err)})`);
  assert.equal(await outstandingOf(item), 20000, "nothing moved");
  await assertTies(client, "x37.y2 input validation");
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
  // The read-only diff surface the ceremony's mandatory dry-run precheck uses. Listing its
  // columns proves nothing; the GO/NO-GO the owner actually reads is diff_cents, so that is
  // what is asserted. On a database whose every approved entry was decomposed by the hook,
  // EVERY row must read zero -- a single nonzero row means classifier output and
  // materialised rows have diverged, which is precisely the condition the precheck exists to
  // catch before a ceremony starts. Both domains, not just one.
  const preview = await rootQuery("select * from clara._subledger_decompose_preview($1,$2)", [client, null]);
  assert.ok(preview.rowCount > 0, "the read-only decompose preview returns this client's decomposition (non-vacuous)");
  noteLane(`x37.z decompose preview columns: ${preview.fields.map((f) => f.name).join(",")}`);
  const drift = preview.rows.filter((r) => Number(r.diff_cents) !== 0);
  assert.equal(
    drift.length, 0,
    `every preview row must read diff_cents=0 -- classified equals materialised (drifted: ${JSON.stringify(drift.slice(0, 3))})`,
  );
  const apRows = preview.rows.filter((r) => r.domain === "ap");
  assert.ok(apRows.length > 0, "the preview covers the ap domain (the JV + opening rows above)");
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
});

// ===========================================================================
// x37.ac -- THE SIX SETTLEMENT-FLOOR REFUSALS, ONE NAMED REASON EACH. The two
// shape floors are the taxonomy's teeth: a `customer_receipt` that recognises
// income, or a `supplier_payment` that carries an expense leg, is not a
// settlement at all -- it is a purchase somebody typed the wrong kind onto, and
// letting it through would mint a settlement item against an obligation that was
// never discharged.
//
// Driven by DIRECT CONSTRUCTION, because no verb can build these shapes (the
// composites are the only settlement writers and they emit the correct legs by
// construction) -- and the floors exist precisely for the world where something
// else learns to write one. Each probe calls the floor's own entry point on a
// draft, which isolates ONE refusal per probe; the deferred TRIGGER (the thing
// that actually runs in production) is proven separately at the end, where the
// entry is really approved and the refusal really arrives at COMMIT.
// ===========================================================================
test("x37.ac the two settlement floors refuse all SIX wrong shapes, each with its own named CLR23 reason, and the deferred trigger fires at commit", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const customer = await birthCounterparty(sub, { client, name: `X37 FLOORCUST ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const vendor = await birthCounterparty(sub, { client, name: `X37 FLOORVEND ${randomUUID().slice(0, 6)}` });

  /** A DRAFT entry of `kind` with the given legs, built by hand. Drafts materialise
   *  nothing, so this pollutes no tie-out; the floors read the legs regardless of status. */
  const draftShaped = async (kind, lines, cp) => withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,coding_kind,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft',$3,'2026-04-25',$4,'manual',$5) returning id`,
      [firm, client, kind, `x37 floor probe ${kind}`, sub],
    );
    const id = r.rows[0].id;
    let n = 0;
    for (const l of lines) {
      n += 1;
      await c.query(
        `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [id, n, l.code, l.dr ?? 0, l.cr ?? 0, l.d ?? "probe", l.cp ? cp : null],
      );
    }
    return id;
  });
  const floorRefusal = async (fn, entry) => caught(() => rootQuery(`select clara.${fn}($1)`, [entry]));
  const assertFloor = async (err, reason, label) => {
    assert.ok(err, `${label}: the floor must refuse this shape`);
    assert.equal(err.code, "CLR23", `${label}: the refusal is CLR23, the leg-SHAPE family (got ${err.code} -- ${err.message})`);
    assert.equal(reasonOf(err), reason, `${label}: the named reason is ${reason} (got ${reasonOf(err)})`);
  };

  // --- customer_receipt: three ways to get the shape wrong. ---
  await assertFloor(
    await floorRefusal("_assert_customer_receipt_shape", await draftShaped("customer_receipt", [
      { code: BANK, dr: 10000 }, { code: AR1, cr: 6000, cp: true }, { code: AR2, cr: 4000, cp: true },
    ], customer)),
    "receipt_control_shape", "x37.ac receipt/two control legs",
  );
  await assertFloor(
    await floorRefusal("_assert_customer_receipt_shape", await draftShaped("customer_receipt", [
      { code: BANK, dr: 10000 }, { code: AR1, cr: 7000, cp: true }, { code: REVN, cr: 3000 },
    ], customer)),
    "receipt_income_leg", "x37.ac receipt/income leg (the F3-3 foreclosure)",
  );
  await assertFloor(
    await floorRefusal("_assert_customer_receipt_shape", await draftShaped("customer_receipt", [
      { code: BANK, dr: 10000 }, { code: AR1, cr: 7000, cp: true }, { code: AP1, cr: 3000, cp: true },
    ], customer)),
    "receipt_payable_leg", "x37.ac receipt/payable leg (a cross-domain contra)",
  );

  // --- supplier_payment: the exact mirror, three ways. ---
  await assertFloor(
    await floorRefusal("_assert_supplier_payment_shape", await draftShaped("supplier_payment", [
      { code: AP1, dr: 6000, cp: true }, { code: AP2, dr: 4000, cp: true }, { code: BANK, cr: 10000 },
    ], vendor)),
    "payment_control_shape", "x37.ac payment/two control legs",
  );
  await assertFloor(
    await floorRefusal("_assert_supplier_payment_shape", await draftShaped("supplier_payment", [
      { code: AP1, dr: 7000, cp: true }, { code: EXPN, dr: 3000 }, { code: BANK, cr: 10000 },
    ], vendor)),
    "payment_expense_leg", "x37.ac payment/expense leg (a counter purchase is not a settlement)",
  );
  await assertFloor(
    await floorRefusal("_assert_supplier_payment_shape", await draftShaped("supplier_payment", [
      { code: AP1, dr: 7000, cp: true }, { code: AR1, dr: 3000, cp: true }, { code: BANK, cr: 10000 },
    ], vendor)),
    "payment_receivable_leg", "x37.ac payment/receivable leg (a cross-domain contra)",
  );

  // --- THE DEFERRED TRIGGER, for real. The six probes above call the floor directly, which
  // proves the LOGIC; this proves the WIRING -- that an approved row carrying a wrong shape
  // actually dies at COMMIT, which is the only thing that protects the books from a future
  // writer. The congruent settlement item is inserted alongside so belt-1 is satisfied and
  // the refusal that arrives is unambiguously the floor's (both control legs carry the same
  // customer, so the classifier yields exactly one -RM100 ar item).
  const wired = await caught(() => withActor({ transaction: true }, async (c) => {
    // Draft FIRST, then the lines, then the status flip: t_jl_immutable refuses a line
    // written against an already-approved entry (CLR08), so the forgery has to follow the
    // same order a real approve path does.
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,coding_kind,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft','customer_receipt','2026-04-25','x37 floor trigger probe','manual',$3) returning id`,
      [firm, client, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,10000,0,'bank',null),($1,2,$3,0,6000,'ar one',$5),($1,3,$4,0,4000,'ar two',$5)`,
      [id, BANK, AR1, AR2, customer],
    );
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, world.users.bob],
    );
    await c.query(
      `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
       values($1,$2,'ar',$3,$4,'settlement','2026-04-25',-10000,$5)`,
      [firm, client, customer, id, sub],
    );
  }));
  assert.ok(wired, "an APPROVED customer_receipt with two control legs must die at commit");
  assert.equal(wired.code, "CLR23", `the deferred floor trigger is what refuses it (got ${wired.code} -- ${wired.message})`);
  assert.equal(reasonOf(wired), "receipt_control_shape", `and it carries the same named reason as the direct call (got ${reasonOf(wired)})`);
  await assertTies(client, "x37.ac settlement floors");
});

// ===========================================================================
// x37.ad -- BELT-1 REFUSES. Every other cell in this file is belt-1's POSITIVE
// half: hundreds of approved entries whose items match the classifier exactly.
// None of them can tell you the belt would notice if they did not. This one
// forges the exact shape a forgotten fifth approve path would leave behind -- an
// approved entry with a control leg and NO open item -- and requires the named
// refusal at COMMIT. Without this cell the belt could be a no-op and the suite
// would be just as green.
// ===========================================================================
test("x37.ad belt-1 REFUSES a raw-approved control entry that materialised no item (subledger_entry_untied)", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const cp = await birthCounterparty(sub, { client, name: `X37 UNTIEDCO ${randomUUID().slice(0, 6)}` });

  const err = await caught(() => withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft','2026-04-26','x37 belt-1 negative probe','manual',$3) returning id`,
      [firm, client, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,45000,0,'expense',null),($1,2,$3,0,45000,'payable',$4)`,
      [id, EXPN, AP1, cp],
    );
    // The forgery: the status flip WITHOUT the hook -- exactly what a fifth approve path
    // that nobody taught about the subledger would do.
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, world.users.bob],
    );
  }));
  assert.ok(err, "an approved control entry with no open item must be refused at COMMIT");
  assert.equal(err.code, CLR10, `belt-1's refusal is CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "subledger_entry_untied", `the named reason is subledger_entry_untied (got ${reasonOf(err)})`);
  assert.ok(/materialise|open item/i.test(String(err.message)), `the message says what was forgotten (got: ${err.message})`);
  await assertTies(client, "x37.ad belt-1 negative");
});

// ===========================================================================
// x37.ae -- A REAL sales_credit_note, END TO END. x37.aa asserts the `credit_note`
// kind exists in the DDL matrix; that is a statement about text. This cell drives
// the ladder-3 branch on a LIVE AR lane -- a cited, facts-complete document, the
// wake drafter carrying the coding kind, a human approve through the ordinary
// verb -- and requires the item the classifier mints to be NEGATIVE, because a
// credit note reduces what the customer owes. It is the only cell in the file
// where the sign law and the kind matrix are exercised by a real document rather
// than by construction.
// ===========================================================================
test("x37.ae a REAL sales_credit_note mints ONE negative ar `credit_note` item, classifier-congruent, and the sign matrix refuses the positive twin", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const cp = await birthCounterparty(sub, { client, name: `X37 CNCUSTOMER ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const cents = 47000;

  // A facts-complete document stating a ZERO tax and a net equal to its total -- the shape
  // the sales floor ties against for a 2-leg credit note (no type_code is stated, so the
  // type<->polarity binding is inert, exactly as it is for the live OCR corpus).
  // F-A2 PR-1 (D11): a credit note is a SALES page, so the seller it names is THIS CLIENT (the
  // resolver's (S) arm). With the direction arm now binding every agent lane, the third-party
  // default would resolve `purchase` and the sales_credit_note draft would be refused at the
  // door -- a fixture that states the wrong party, not a finding about the subledger.
  const cited = await purchaseDoc(sub, {
    client, gross: cents,
    vendorName: (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0].name,
  });
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, FIELD.total);
  const d = await wakeDraftEntry(cred, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    // CREDIT-NOTE POLARITY: Cr receivable control (gross), Dr revenue (net) -- the mirror of
    // an invoice. The sales floor refuses invoice polarity on a CN outright.
    lines: [
      { account_code: AR1, debit_cents: 0, credit_cents: cents, description: "cn-ar" },
      { account_code: REVN, debit_cents: cents, credit_cents: 0, description: "cn-rev" },
    ],
    document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp, kind: "customer" },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind: "sales_credit_note", opKey: opk("x37-cn"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x37-cna") });

  const items = await itemsOf(d.entry_id);
  assert.equal(items.length, 1, `a sales credit note mints exactly one item (got ${items.length})`);
  assert.equal(items[0].domain, "ar", "it lands in the ar domain");
  assert.equal(items[0].item_kind, "credit_note", "the typed anchor gives item_kind='credit_note' (ladder 3)");
  assert.equal(Number(items[0].amount_cents), -cents, "and it is NEGATIVE -- a credit note reduces what the customer owes");
  assert.equal(items[0].counterparty_id, cp, "bound to the customer it credits");

  const rows = await classifyRows(d.entry_id);
  assert.equal(rows.length, 1, "the classifier produces exactly one row");
  assert.equal(rows[0].item_kind, "credit_note", "classifier kind agrees");
  assert.equal(Number(rows[0].amount_cents), -cents, "classifier sign agrees -- the materialised row IS its output");

  // THE SIGN MATRIX, the other way round: a POSITIVE credit_note item is refused by the DDL
  // CHECK itself, so no writer -- present or future -- can mint one.
  const other = await birthCounterparty(sub, { client, name: `X37 CNSIGNCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const sign = await caught(() => rootQuery(
    `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
     values($1,$2,'ar',$3,$4,'credit_note','2026-04-27',$5,$6)`,
    [firm, client, other, d.entry_id, cents, sub],
  ));
  assert.ok(sign, "a POSITIVE credit_note item must be refused");
  assert.equal(sign.code, "23514", `the item_kind sign matrix (a CHECK) is what refuses it (got ${sign.code} -- ${sign.message})`);
  await assertTies(client, "x37.ae real sales credit note");
});

// ===========================================================================
// x37.af -- THE SECTION-4.10 SWEEP FORCE-COMPLETE GUARD. The defect: the recovery
// pass force-completed EVERY still-running task in a run the moment ANY filing in
// that run was recovered, so a live task's real outcome was discarded on the
// `completed` replay branch and its attempt wedged at state='active' with a live
// reservation -- which 0034 then reads as `already_done` forever. The guard is one
// predicate (complete only tasks that actually DRAFTED), and a one-predicate fix
// is exactly the kind that a later refactor drops silently, so BOTH directions are
// asserted here: the drafted task completes AND the non-drafted one is left alone.
// ===========================================================================
test("x37.af the sweep force-complete guard: recovery completes ONLY the task that drafted, and leaves the still-running one alone", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);

  // Two filings, both genuinely admitted to ONE open sweep run, both with a RUNNING task.
  // The rows are staged directly: the admission lane's own gates (budget, consent, vendor
  // readiness) are proven in the wave-A batteries and are not what is under test here --
  // the reconciler's completion predicate is.
  const stage = async (tag, drafted) => {
    const cited = await purchaseDoc(sub, { client, gross: 30000 });
    // An autodraft task is CREATED queued with a model snapshot (0011's admission trigger
    // demands exactly that shape), and only then moves to running -- the same two steps
    // admit_autodraft_task + begin_autodraft_task take.
    const task = (await rootQuery(
      `insert into clara.agent_tasks(firm_id,client_id,kind,status,workflow_run_id,model_snapshot)
       values($1,$2,'autodraft','queued',$3,'x37-sweep-model') returning id`,
      [firm, client, `x37-sweep-${tag}-${randomUUID().slice(0, 8)}`],
    )).rows[0].id;
    await rootQuery("update clara.agent_tasks set status='running' where id=$1", [task]);
    await rootQuery(
      `insert into clara.autodraft_attempts(firm_id,client_id,document_id,filing_id,task_id,origin,run_id,state,reserved_tokens,usage_date)
       values($1,$2,$3,$4,$5,'sweep',$6,'active',1000,current_date)`,
      [firm, client, cited.documentId, cited.filingId, task, run],
    );
    let entry = null;
    if (drafted) {
      // A REAL draft entry through the human verb, then the coding_attempts row that binds
      // it to the task -- the exact shape the recovery branch looks for.
      const d = await draftEntryV3(sub, {
        client, resolution: await manualRes(sub, client), memo: `x37 sweep recovery ${tag}`,
        lines: [
          { account_code: EXPN, debit_cents: 30000, credit_cents: 0, description: "dr" },
          { account_code: BANK, debit_cents: 0, credit_cents: 30000, description: "cr" },
        ],
        opKey: opk("x37-sweepdraft"),
      });
      entry = d.entry_id;
      await rootQuery(
        `insert into clara.coding_attempts(firm_id,client_id,task_id,filing_id,document_id,entry_id,part_payload)
         values($1,$2,$3,$4,$5,$6,'{}'::jsonb)`,
        [firm, client, task, cited.filingId, cited.documentId, entry],
      );
    }
    return { task, filing: cited.filingId, entry };
  };
  await openSweepRun({ firm, expected: 2 });
  const run = (await rootQuery(
    "select id from clara.sweep_runs where firm_id=$1 and state='open' order by created_at desc limit 1", [firm],
  )).rows[0].id;
  const drafted = await stage("drafted", true);
  const running = await stage("running", false);

  const statusOf = async (task) => (await rootQuery("select status from clara.agent_tasks where id=$1", [task])).rows[0].status;
  assert.equal(await statusOf(drafted.task), "running", "both tasks start RUNNING (mandatory setup)");
  assert.equal(await statusOf(running.task), "running", "…including the one that never drafted");

  await reconcileSweepRuns();

  // DIRECTION 1 -- the recovery really happened (otherwise direction 2 proves nothing: a
  // reconciler that completed NOTHING would also leave the second task running).
  const item = await rootQuery(
    "select outcome, entry_id from clara.sweep_run_items where run_id=$1 and filing_id=$2", [run, drafted.filing],
  );
  assert.equal(item.rowCount, 1, "the recovery pass minted the drafted filing's sweep_run_item (the branch under test really ran)");
  assert.equal(item.rows[0].outcome, "drafted", "…as 'drafted'");
  assert.equal(item.rows[0].entry_id, drafted.entry, "…binding the recovered draft");
  assert.equal(await statusOf(drafted.task), "completed", "the task that DRAFTED is completed");

  // DIRECTION 2 -- the guard. Without the coding_attempts predicate this task would have
  // been completed too, discarding a live outcome and wedging its attempt at `already_done`.
  assert.equal(
    await statusOf(running.task), "running",
    "the still-running task that never drafted is LEFT ALONE -- one recovered filing may not force-complete its neighbours",
  );
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.sweep_run_items where run_id=$1 and filing_id=$2", [run, running.filing])).rows[0].n,
    0, "and no item was minted for it",
  );
  await assertTies(client, "x37.af sweep guard");
});

// ===========================================================================
// x37.ah -- THE UNWIND IS NOT A FLOATING CREDIT. A reversal_unwind item is a
// negative position, so every arithmetic guard in apply_open_items (source must be
// negative, both sides move toward zero, the group nets zero, one party, one
// domain) is SATISFIED by pointing it at any live invoice of the same customer --
// and its own entry is the MIRROR, which carries reversal_of and never
// reversed_by, so the reversed-entry wall found nothing to complain about either.
// The unwind would have settled a LIVE claim while the item it was minted to
// cancel stayed open at full face value: cash the client still owes, discharged
// against paper. The lineage law is what refuses it, and it has to be stated on
// the ORIGINAL ENTRY (see x37.ai for why the exact-id pointer cannot).
// ===========================================================================
test("x37.ah an unwind may not be applied to an UNRELATED live invoice -- refused by name, and the sanctioned pair still works", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const cp = await birthCounterparty(sub, { client, name: `X37 UNWINDCO ${randomUUID().slice(0, 6)}`, kind: "customer" });

  // The reversed claim and its unwind...
  const reversed = await openArItem(sub, { client, cp, cents: 35000, memo: "x37 unwind-law reversed sale" });
  await reverseEntry(world.users.bob, { entry: reversed.entry, reason: "x37 unwind-law reversal", opKey: opk("x37-ahrev") });
  const mirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [reversed.entry])).rows[0].id;
  const unwind = (await itemsOf(mirror))[0];
  assert.equal(unwind.item_kind, "reversal_unwind", "the mirror minted the unwind (mandatory setup)");
  assert.equal(Number(unwind.amount_cents), -35000, "…as the exact negation");

  // ...and a SECOND, entirely live invoice for the SAME customer. Same domain, same
  // canonical party, and small enough that the two-sided bound is satisfied on both
  // sides -- so nothing but the lineage law stands between the unwind and it.
  const live = await openArItem(sub, { client, cp, cents: 20000, memo: "x37 unwind-law live sale" });

  const stolen = await caught(() => applyOpenItems(sub, {
    client, reason: "x37 unwind against an unrelated live invoice",
    applications: [{ source_item_id: unwind.id, target_item_id: live.item, amount_cents: 20000 }],
  }));
  assert.ok(stolen, "applying a reversal unwind to an UNRELATED live invoice must be REFUSED");
  assert.equal(stolen.code, CLR10, `the refusal is CLR10 (got ${stolen.code} -- ${stolen.message})`);
  assert.equal(
    reasonOf(stolen), "unwind_lineage_mismatch",
    `the named reason is unwind_lineage_mismatch (got ${reasonOf(stolen)} -- ${stolen.message})`,
  );
  assert.ok(/unwind/i.test(String(stolen.message)), `the message says what an unwind may discharge (got: ${stolen.message})`);
  assert.equal(await outstandingOf(live.item), 20000, "the refused apply left the live invoice untouched");
  assert.equal(await outstandingOf(unwind.id), -35000, "…and the unwind still carries its whole negation");
  assert.equal(await outstandingOf(reversed.item), 35000, "…and the reversed claim is still open, which is exactly why the theft mattered");

  // THE EXEMPTION CANNOT BE ENTERED BY A NON-UNWIND ITEM. An ordinary credit note for
  // the same customer, aimed at the reversed entry's item, still hits the wall under
  // its own name -- the branch is keyed on item_kind, not on "one of these is odd".
  const strayEntry = await approvedGeneric(sub, {
    client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents: 15000, memo: "x37 unwind-law stray credit",
  });
  const stray = (await itemsOf(strayEntry))[0];
  const wall = await caught(() => applyOpenItems(sub, {
    client, reason: "x37 stray credit against a reversed claim",
    applications: [{ source_item_id: stray.id, target_item_id: reversed.item, amount_cents: 15000 }],
  }));
  assert.ok(wall, "a NON-unwind credit against a reversed entry's item is still refused");
  assert.equal(
    reasonOf(wall), "allocation_target_reversed",
    `…under the reversed-entry wall's own name (got ${reasonOf(wall)} -- ${wall.message})`,
  );

  // AND THE ROUTE THE LAW LEAVES OPEN WORKS: the unwind against its OWN original.
  const glBefore = await controlGl(client, "ar");
  await applyOpenItems(sub, {
    client, reason: "x37 apply the unwind to its own original",
    applications: [{ source_item_id: unwind.id, target_item_id: reversed.item, amount_cents: 35000 }],
  });
  assert.equal(await outstandingOf(reversed.item), 0, "the reversed claim closes against its own unwind");
  assert.equal(await outstandingOf(unwind.id), 0, "…consuming the unwind exactly");
  assert.equal(await controlGl(client, "ar"), glBefore, "…with ZERO GL movement");
  await assertTies(client, "x37.ah unwind lineage law");
});

// ===========================================================================
// x37.ai -- THE MANY-TO-ONE CLOSURE, and why the lineage law is stated on the
// ENTRY rather than on reversal_unwind_of. When a merge collapses two parties of
// ONE original into one canonical party, the mirror mints exactly ONE unwind for
// the whole collapsed set, and its reversal_unwind_of column can name only min(id)
// of it -- a POINTER, not the set. A law keyed on that pointer therefore closes
// exactly one of the original items and leaves every other one permanently
// unclosable by the only instrument that exists for it (the reversed-entry wall
// refuses every other application against it, by design). Entry-level pairing is
// what makes the remedy total.
// ===========================================================================
test("x37.ai one unwind closes BOTH items of a merge-collapsed original -- entry-level pairing, not a min(id) pointer", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const partyP = await birthCounterparty(sub, { client, name: `X37 COLLAPSEP ${randomUUID().slice(0, 6)}` });
  const partyQ = await birthCounterparty(sub, { client, name: `X37 COLLAPSEQ ${randomUUID().slice(0, 6)}` });

  // A multi-COUNTERPARTY generic JV -- two payable legs, two parties, TWO control
  // accounts. No verb builds this (draft_entry stamps ONE resolved counterparty on
  // every control line), so it is constructed with its congruent items exactly as
  // x37.z does, and belt-1 accepts the pair at commit.
  const jv = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft','2026-04-08','x37 collapse accrual','manual',$3) returning id`,
      [firm, client, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,90000,0,'accrued expense',null),
             ($1,2,$3,0,50000,'party P',$4),
             ($1,3,$5,0,40000,'party Q',$6)`,
      [id, EXPN, AP1, partyP, AP2, partyQ],
    );
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, world.users.bob],
    );
    await c.query(
      `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
       values($1,$2,'ap',$3,$4,'adjustment','2026-04-08',50000,$6),
             ($1,$2,'ap',$5,$4,'adjustment','2026-04-08',40000,$6)`,
      [firm, client, partyP, id, partyQ, sub],
    );
    return id;
  });
  const originals = await itemsOf(jv);
  assert.equal(originals.length, 2, "the JV carries TWO same-domain items (mandatory setup)");

  // THE MERGE, after approval: one canonical party now owes the whole RM900.
  await mergeCounterparties(sub, { client, survivor: partyQ, merged: partyP, reason: "x37 collapse duplicate", opKey: opk("x37-aimerge") });

  await reverseEntry(world.users.bob, { entry: jv, reason: "x37 collapse reversal", opKey: opk("x37-airev") });
  const mirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [jv])).rows[0].id;
  const unwind = await itemsOf(mirror);
  assert.equal(unwind.length, 1, `the mirror mints ONE unwind for the collapsed set (got ${unwind.length})`);
  assert.equal(Number(unwind[0].amount_cents), -90000, "…the negation of the whole RM900");
  assert.equal(unwind[0].counterparty_id, partyQ, "…booked to the canonical survivor");
  // THE POINTER IS A POINTER. It names ONE of the two originals -- so an exact-id
  // pairing law could never have closed the other, which is the defect being fixed.
  assert.ok(
    originals.some((o) => o.id === unwind[0].reversal_unwind_of),
    "the unwind's lineage names one of the two originals",
  );
  assert.equal(
    originals.filter((o) => o.id === unwind[0].reversal_unwind_of).length, 1,
    "…exactly ONE of them -- the other is unreachable through the pointer",
  );

  // ONE application closes BOTH, in one group, with zero GL movement.
  const glBefore = await controlGl(client, "ap");
  const closure = await applyOpenItems(sub, {
    client, reason: "x37 unwind the collapsed accrual",
    applications: originals.map((o) => ({
      source_item_id: unwind[0].id, target_item_id: o.id, amount_cents: Number(o.amount_cents),
    })),
  });
  assert.ok(groupOf(closure), "the closure commits and names its application group");
  for (const o of originals) {
    assert.equal(await outstandingOf(o.id), 0, `original item ${o.id} is closed to zero by the single unwind`);
  }
  assert.equal(await outstandingOf(unwind[0].id), 0, "…and the unwind is consumed exactly");
  assert.equal(await controlGl(client, "ap"), glBefore, "…with ZERO GL movement (it is a subledger event)");
  await assertTies(client, "x37.ai many-to-one unwind closure");
});

// ===========================================================================
// x37.aj -- THE CANONICAL ZERO-NET COLLAPSE IS LAWFUL, NOT A BREACH. An entry may
// legitimately carry +X for one party and -X for another in the same domain (a
// reclass between two suppliers). If those two parties are LATER merged, the
// classifier -- which nets per CANONICAL party and drops zero nets, as every
// ladder does -- stops producing any row for that entry, while its two items go on
// existing (history is never repointed). Both sides still say the same thing: the
// group contributes zero. A belt whose ITEM side kept the zero net would read that
// agreement as a divergence and refuse the next UPDATE to touch the entry -- which
// in practice means reverse_entry would be permanently wedged on it, with a
// diagnosis about an untied subledger that is false.
// ===========================================================================
test("x37.aj a merge that nets an entry's two items to zero does NOT false-positive the belt -- the entry still reverses, and the books tie", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const partyR = await birthCounterparty(sub, { client, name: `X37 NETR ${randomUUID().slice(0, 6)}` });
  const partyS = await birthCounterparty(sub, { client, name: `X37 NETS ${randomUUID().slice(0, 6)}` });

  // A same-domain reclass: RM150 moved OFF party S and ONTO party R. The two control
  // legs balance each other, so the entry needs no other line at all.
  const reclass = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft','2026-04-09','x37 supplier reclass','manual',$3) returning id`,
      [firm, client, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,0,15000,'onto party R',$3),
             ($1,2,$4,15000,0,'off party S',$5)`,
      [id, AP1, partyR, AP2, partyS],
    );
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, world.users.bob],
    );
    await c.query(
      `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
       values($1,$2,'ap',$3,$4,'adjustment','2026-04-09',15000,$6),
             ($1,$2,'ap',$5,$4,'adjustment','2026-04-09',-15000,$6)`,
      [firm, client, partyR, id, partyS, sub],
    );
    return id;
  });
  assert.equal((await itemsOf(reclass)).length, 2, "the reclass carries +RM150 and -RM150 (mandatory setup)");
  assert.equal((await classifyRows(reclass)).length, 2, "…and the classifier produces both rows while the parties are distinct");

  // THE MERGE. R into S: one canonical party, and the entry's canonical net is now ZERO.
  await mergeCounterparties(sub, { client, survivor: partyS, merged: partyR, reason: "x37 net-zero duplicate", opKey: opk("x37-ajmerge") });
  assert.equal(
    (await classifyRows(reclass)).length, 0,
    "post-merge the classifier produces NO row for the entry -- the canonical net is zero and every ladder drops a zero net",
  );
  assert.equal((await itemsOf(reclass)).length, 2, "…while both items still exist (a merge never repoints history)");

  // THE CELL: reverse_entry UPDATEs journal_entries, which fires belt-1 on this entry.
  // Un-fixed, arm 1 saw a materialised group with no classifier row and arm 2 saw an
  // item side its own legs side had already dropped -- both refused
  // `subledger_entry_untied` over a book that is exactly tied.
  const apBefore = await controlGl(client, "ap");
  const itemsBefore = await itemsSum(client, "ap");
  await reverseEntry(world.users.bob, { entry: reclass, reason: "x37 reclass reversed after a merge", opKey: opk("x37-ajrev") });
  const mirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [reclass])).rows[0];
  assert.ok(mirror, "reverse_entry SUCCEEDS on an entry whose items canonically net to zero");
  assert.equal(
    (await itemsOf(mirror.id)).length, 0,
    "the mirror mints NO unwind -- negating a zero net produces no row, exactly as the classifier says",
  );
  assert.equal(await controlGl(client, "ap"), apBefore, "the reversal moved the ap control by zero (it was a zero net)");
  assert.equal(await itemsSum(client, "ap"), itemsBefore, "…and the item side by zero too");
  await assertTies(client, "x37.aj canonical zero-net collapse");
});

// ===========================================================================
// x37.ak -- THE CANONICAL DUPLICATE ITEM. The grain unique is keyed on the STORED
// counterparty id, and merges never repoint history -- so once A has merged into
// B, an entry already carrying an item that names A will accept a SECOND item
// naming B: a different grain key, a live FK, the right domain, the right kind,
// and an amount the classifier really does produce for that canonical group. Every
// ROW-WISE test says yes. The group it lands in now sums to twice what the ledger
// says, and belt-1 never sees it (a lone open_items insert touches no
// journal_entries row). Only an AGGREGATE congruence check catches it.
// ===========================================================================
test("x37.ak a canonical-duplicate item is row-wise indistinguishable and still dies on belt-2's AGGREGATE congruence check", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  const dupOld = await birthCounterparty(sub, { client, name: `X37 DUPOLD ${randomUUID().slice(0, 6)}` });
  const dupNew = await birthCounterparty(sub, { client, name: `X37 DUPNEW ${randomUUID().slice(0, 6)}` });
  const bill = await openApItem(sub, { client, cp: dupOld, cents: 33000, memo: "x37 duplicate-item base" });

  await mergeCounterparties(sub, { client, survivor: dupNew, merged: dupOld, reason: "x37 duplicate supplier", opKey: opk("x37-akmerge") });

  // ROW-WISE INDISTINGUISHABLE, asserted rather than claimed: the classifier really
  // does produce a row with exactly the domain, canonical party, amount and kind the
  // duplicate would carry -- so the per-row congruence test that shipped first would
  // have waved it through.
  const cls = await classifyRows(bill.entry);
  assert.equal(cls.length, 1, "post-merge the entry classifies to ONE canonical row");
  assert.equal(cls[0].counterparty_id, dupNew, "…under the survivor");
  assert.equal(Number(cls[0].amount_cents), 33000, "…at the full amount");
  assert.equal(cls[0].item_kind, "adjustment", "…and the same kind the duplicate would claim");

  const dup = await caught(() => withActor({ transaction: true }, async (c) => {
    await c.query(
      `insert into clara.open_items(firm_id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,amount_cents,created_by)
       values($1,$2,'ap',$3,$4,'adjustment','2026-04-10',33000,$5)`,
      [firm, client, dupNew, bill.entry, sub],
    );
  }));
  assert.ok(dup, "a second item under the SURVIVOR on an entry already carrying one under the merged-away id must be refused");
  await assertRaisesOneOf(BELT_CODES, () => Promise.reject(dup), "belt-2 aggregate classifier congruence");
  assert.equal(
    reasonOf(dup), "subledger_item_not_classified",
    `the named reason is subledger_item_not_classified (got ${reasonOf(dup)} -- ${dup.message})`,
  );
  noteLane(`x37.ak canonical-duplicate refusal SQLSTATE ${dup.code} / ${reasonOf(dup)}`);
  assert.equal((await itemsOf(bill.entry)).length, 1, "the aborted insert left exactly the one lawful item");
  assert.equal(await outstandingOf(bill.item), 33000, "…untouched");
  await assertTies(client, "x37.ak canonical-duplicate item");
});

// ===========================================================================
// x37.ag -- THE DISCOUNT ACCOUNT IS NOT A CONTROL ACCOUNT. Both composites take a
// settlement-discount leg and check it is active and of the right TYPE. Type alone
// is not enough: account_class is orthogonal to account_type in this schema (the
// 0015 CHECK admits `receivable`/`payable` on any type), so an expense account
// carrying a control class would ride in as a discount leg and quietly add a
// SECOND control leg to the settlement -- which the entry's own item then nets
// into, moving the subledger by the discount. The refusal must be the composite's
// named one, at the point the caller can act on it, not a floor refusal three
// steps later about a leg the caller never knowingly added.
// ===========================================================================
test("x37.ag a control-class discount account is refused by NAME in both composites", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const customer = await birthCounterparty(sub, { client, name: `X37 DISCCUST ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const vendor = await birthCounterparty(sub, { client, name: `X37 DISCVEND ${randomUUID().slice(0, 6)}` });
  const inv = await openArItem(sub, { client, cp: customer, cents: 50000 });
  const bill = await openApItem(sub, { client, cp: vendor, cents: 50000 });

  // Two accounts of the RIGHT type and the WRONG class, created through the sanctioned
  // writer (which does not police type-vs-class -- that is the whole point of the probe).
  const DISCA_BAD = "574-C37";
  const DISCR_BAD = "684-C37";
  await upsertAccountClassed(sub, { client, code: DISCA_BAD, name: "Discount Allowed (control-classed, x37)", type: "expense", accountClass: "receivable", opKey: opk("discabad") });
  await upsertAccountClassed(sub, { client, code: DISCR_BAD, name: "Discount Received (control-classed, x37)", type: "income", accountClass: "payable", opKey: opk("discrbad") });

  const rcpt = await caught(() => allocateReceipt(sub, {
    client, counterparty: customer, amountCents: 48000,
    allocations: [{ item_id: inv.item, amount_cents: 50000 }],
    discountCents: 2000, discountAccount: DISCA_BAD,
  }));
  assert.ok(rcpt, "a receipt discount booked to a receivable-class account must be refused");
  assert.equal(rcpt.code, CLR10, `the refusal is CLR10 (got ${rcpt.code} -- ${rcpt.message})`);
  assert.equal(reasonOf(rcpt), "discount_account_invalid", `the named reason is discount_account_invalid (got ${reasonOf(rcpt)})`);
  assert.equal(await outstandingOf(inv.item), 50000, "the refused receipt moved nothing");

  const pay = await caught(() => allocatePayment(sub, {
    client, counterparty: vendor, amountCents: 48000,
    allocations: [{ item_id: bill.item, amount_cents: 50000 }],
    discountCents: 2000, discountAccount: DISCR_BAD,
  }));
  assert.ok(pay, "a payment discount booked to a payable-class account must be refused");
  assert.equal(pay.code, CLR10, `the refusal is CLR10 (got ${pay.code} -- ${pay.message})`);
  assert.equal(reasonOf(pay), "discount_account_invalid", `the named reason is discount_account_invalid (got ${reasonOf(pay)})`);
  assert.equal(await outstandingOf(bill.item), 50000, "the refused payment moved nothing");

  await assertTies(client, "x37.ag control-class discount accounts");
  await assertTies(world.clients.A2, "x37 final sweep A2");
  await assertTies(world.clients.S1, "x37 final sweep S1");
});
