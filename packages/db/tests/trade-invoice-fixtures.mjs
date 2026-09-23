// #655 — TRADE INVOICES, SUPPLIER BILLS AND THE OPEN ITEM THEY BIRTH: the battery's extra frontier
// gate, chart, particulars/basis builders, verb wrappers and readers (NOT a test file: the name
// does not end in `.test.mjs`, so `node --test` ignores it).
//
// It sits BESIDE `staff-expense-claim-fixtures.mjs` for the reason that module states about
// `work-journal-fixtures.mjs`: #655's migration is a separate frontier from #623's, #634's, #643's
// and #638's, and the lanes' cells must be able to skip independently when `db-slice-frontiers`
// runs this package against a database pinned between them.
//
// THE WIRE CONTRACT THIS MODULE ENCODES:
//
//   clara.admit_trade_invoice_work(p_client, p_author, p_intent_key, p_kind, p_particulars,
//                                  p_basis, p_basis_origin, p_source_refs, p_model)
//                       -> {work_id, task_id, logical_op_id, status, replayed, invoice_id,
//                           kind, counterparty_id, due_date, due_date_source}
//   clara.get_trade_invoice(p_work)                                                  -> jsonb|null
//   clara.wake_record_journal_entry(...)  — UNCHANGED as a SIGNATURE, and that is the claim this
//                                          battery tests: a trade invoice is a `journal_entry`-
//                                          purpose Work, so it commits through the SAME frozen
//                                          wake verb. The posting core BEHIND it is the sixth copy.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, namedCall, opk, ROLES, MODEL, noteLane, basis as journalBasis,
} from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";
import { asRole, asRoot } from "./rig-helpers.mjs";

export * from "./work-journal-fixtures.mjs";
export { createCounterparty, addAlias } from "./wave-a-fixtures.mjs";

// ===========================================================================================
// 1 · The #655 frontier gate — keyed on the migration's STABLE STEM, never its number.
// ===========================================================================================

/** The #655 migration's STABLE STEM. */
export const TI_STEM = "trade_invoices$";

let _ready = null;
export async function tiLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [TI_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** #982's migration STABLE STEM — a SEPARATE frontier from `TI_STEM`: a chain can carry 0225 and
 *  not 0274, and on that chain #655's battery must still run in full while #982's skips. */
export const TI_TIN_STEM = "trade_invoice_party_tin$";

let _tinReady = null;
export async function tiTinLaneReady() {
  if (_tinReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [TI_TIN_STEM]);
      _tinReady = r.rows[0].n > 0;
    } catch {
      _tinReady = false;
    }
  }
  return _tinReady;
}

/** `if (await gateTiTin(t)) return;` — #982's own per-cell frontier gate, the same idiom as
 *  `gateTi` below and keyed on `TI_TIN_STEM`. */
export async function gateTiTin(t) {
  if (await tiTinLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_TRADE_INVOICE_PARTY_TIN === "1") {
    markSkip();
    t.skip(`#982 trade-invoice TIN resolution absent (no ${TI_TIN_STEM} migration applied)`);
    return true;
  }
  assert.fail(
    "#982: the trade-invoice TIN resolution arm is absent. Apply 0274_trade_invoice_party_tin.sql "
    + "(or its numbered suite copy), or set CLARA_ALLOW_MISSING_TRADE_INVOICE_PARTY_TIN=1 for the "
    + "package-wide pre-integration sweep.",
  );
  return true;
}

/** #1007's migration STABLE STEM — a THIRD frontier on this lane: a chain can carry 0225 and
 *  0274 and not 0275, and on that chain #655's and #982's batteries must still run in full while
 *  #1007's skips. */
export const TI_DUP_STEM = "trade_invoice_duplicate_probe$";

let _dupReady = null;
export async function tiDupLaneReady() {
  if (_dupReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [TI_DUP_STEM]);
      _dupReady = r.rows[0].n > 0;
    } catch {
      _dupReady = false;
    }
  }
  return _dupReady;
}

/** `if (await gateTiDup(t)) return;` — #1007's own per-cell frontier gate, the same idiom as
 *  `gateTi` and `gateTiTin`, keyed on `TI_DUP_STEM`. */
export async function gateTiDup(t) {
  if (await tiDupLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_TRADE_INVOICE_DUPLICATE_PROBE === "1") {
    markSkip();
    t.skip(`#1007 trade-invoice duplicate probe absent (no ${TI_DUP_STEM} migration applied)`);
    return true;
  }
  assert.fail(
    "#1007: the trade-invoice duplicate probe is absent. Apply 0275_trade_invoice_duplicate_probe.sql "
    + "(or its numbered suite copy), or set CLARA_ALLOW_MISSING_TRADE_INVOICE_DUPLICATE_PROBE=1 for "
    + "the package-wide pre-integration sweep.",
  );
  return true;
}

/**
 * `if (await gateTi(t)) return;` — the house per-cell frontier gate.
 *
 * IT SKIPS ONLY FOR THE PACKAGE-WIDE PRE-INTEGRATION SWEEP, which preloads
 * `tests/trade-invoice-preintegration-gate.mjs` and thereby sets the env var below. A FOCUSED
 * invocation does not preload it and therefore FAILS loudly when the lane is absent — the
 * `firm-document-limits` idiom, and the reason a skipped battery is never evidence.
 */
export async function gateTi(t) {
  if (await tiLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_TRADE_INVOICES === "1") {
    markSkip();
    t.skip(`#655 trade-invoice lane absent (no ${TI_STEM} migration applied)`);
    return true;
  }
  assert.fail(
    "#655: the trade-invoice lane is absent. Apply 0225_trade_invoices.sql (or its numbered suite "
    + "copy), or set CLARA_ALLOW_MISSING_TRADE_INVOICES=1 for the package-wide pre-integration sweep.",
  );
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary. Every assertion in this battery uses THESE strings — they are the
//     door's own raise ladder, and the runtime module and the chatTurn_v21 stanza carry the same.
// ===========================================================================================

export const TI_REASON = {
  partyAmbiguous: "party_ambiguous",
  partyUnresolved: "party_unresolved",
  creditShape: "credit_shape_not_admitted",
  invalidTotal: "invalid_total",
  unbalanced: "unbalanced_basis",
  controlLegMissing: "control_leg_missing",
  wrongControlDomain: "wrong_control_domain",
  invalidDueDate: "invalid_due_date",
  sourceAlreadyPosted: "source_already_posted",
  clientInactive: "client_inactive",
  insufficientRole: "insufficient_role",
  invalidIntentKey: "invalid_intent_key",
  intentConflict: "intent_payload_conflict",
  periodLocked: "period_locked",
  // THE FIFTEENTH, named rather than hidden (0225 section B's header): a `kind` that is neither
  // admitted value and is not credit-shaped either. The brief fixed the map at FOURTEEN and said
  // "the ladder binds, the number describes".
  invalidKind: "invalid_kind",
  // AND THE SIXTEENTH, SEVENTEENTH AND EIGHTEENTH (review finding F2): three payload-shape
  // failures that `invalid_kind` used to answer for, each of which the door can now name. One
  // reason names one thing, or the sentence a person is shown is about the wrong field.
  invalidParticulars: "invalid_particulars",
  invalidCurrency: "invalid_currency",
  invalidTaxFacts: "invalid_tax_facts",
  // THE NINETEENTH (#982, owner's ruling 2026-09-20): the submitted registration number and the
  // submitted TIN each name a DIFFERENT live party of the wanted kind. Distinct from
  // `party_unresolved` (nothing answered) and from `party_ambiguous` (one identifier, several
  // parties) because the remedy is different: the person is choosing between two identifiers the
  // document itself carries, not between two parties one identifier reaches.
  partyIdentifierConflict: "party_identifier_conflict",
  // Raised by the birth trigger and by clara._tf_open_items_validate, not by the door.
  counterpartyKindMismatch: "counterparty_kind_mismatch",
  genericControlLeg: "generic_control_leg",
};

export const TI_KIND = { sales: "sales_invoice", bill: "supplier_bill" };
/** #1007 · the TWO independent duplicate signals the probe reports, and the ONLY two. Amount
 *  alone, or counterparty alone, is never one: a monthly rent bill legitimately repeats both. */
export const TI_DUP_SIGNAL = { reference: "same_reference", money: "same_total_and_date" };
/** #1007's own refusal tokens — the ACK door's, never the probe's: the probe warns and refuses
 *  nothing, by the owner's ruling of 2026-09-20. */
export const TI_ACK_REASON = {
  nothingAcknowledged: "nothing_acknowledged",
  unknownAcknowledgedInvoice: "unknown_acknowledged_invoice",
};
export const DUE_SOURCE = { stated: "stated", terms: "counterparty_terms", absent: "absent" };

/** The chart this battery posts against, ON TOP of `WCHART`. Codes are the starter template's own
 *  (0150) wherever one exists. */
export const TICHART = {
  expense: "6300",      // expense   — the debit side of a supplier bill
  sstInput: "6310",     // expense   — the tax leg, a PLAIN expense account on purpose: this lane
                        //             leaves coding_kind NULL, so the document-anchored
                        //             sst_purchase_cost tie never arms and must not be simulated
  revenue: "4100",      // income    — the credit side of a sales invoice
  payable: "2000",      // liability — Trade Payables CONTROL (account_class = 'payable')
  receivable: "1200",   // asset     — Trade Receivables CONTROL (account_class = 'receivable')
  nonControl: "2010",   // liability — Other Payables, account_class NULL (the non-control probe)
};

export const TI_DATE = { document: "2026-03-04", posting: "2026-03-31" };

// ===========================================================================================
// 3 · The chart and the parties.
// ===========================================================================================

/** Add this battery's accounts to a client that already carries `WCHART`. */
export async function ensureTiChart(sub, client, label = "ti") {
  const mk = (code, name, type, accountClass = null) =>
    upsertAccountClassed(sub, { client, code, name, type, accountClass, opKey: opk("ti-coa") })
      .catch((e) => noteLane(`ensureTiChart(${label}/${code}) raised ${e.code}: ${e.message}`));
  await mk(TICHART.expense, "Office Supplies", "expense");
  await mk(TICHART.sstInput, "SST on Purchases", "expense");
  await mk(TICHART.revenue, "Service Revenue", "income");
  await mk(TICHART.payable, "Trade Payables Control", "liability", "payable");
  await mk(TICHART.receivable, "Trade Receivables Control", "asset", "receivable");
  await mk(TICHART.nonControl, "Other Payables", "liability", null);
}

/** A vendor of this client, optionally with agreed payment terms. `tin` rides through to
 *  `clara.create_counterparty`'s own `p_tin`, which is how #982's TIN resolution arm gets a party
 *  to find without a root UPDATE. */
export async function vendor(sub, { client, name = null, registration = null, tin = null, termsDays = null }) {
  const { createCounterparty } = await import("./wave-a-fixtures.mjs");
  const r = await createCounterparty(sub, {
    client, kind: "vendor", name: name ?? `Alpha Supplies ${randomUUID().slice(0, 8)}`,
    registration, tin, opKey: opk("ti-cp"),
  });
  const id = r.counterparty_id ?? r;
  if (termsDays !== null) await setTerms(sub, { counterparty: id, days: termsDays });
  return id;
}

/** A customer of this client, optionally with agreed payment terms and a TIN (#982). */
export async function customer(sub, { client, name = null, registration = null, tin = null, termsDays = null }) {
  const { createCounterparty } = await import("./wave-a-fixtures.mjs");
  const r = await createCounterparty(sub, {
    client, kind: "customer", name: name ?? `Rome Properties ${randomUUID().slice(0, 8)}`,
    registration, tin, opKey: opk("ti-cp"),
  });
  const id = r.counterparty_id ?? r;
  if (termsDays !== null) await setTerms(sub, { counterparty: id, days: termsDays });
  return id;
}

/** 0040's own terms door — never a root UPDATE, because the due-date fallback under test IS the
 *  thing that reads what this door wrote. */
export async function setTerms(sub, { counterparty, days, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.set_counterparty_terms(p_counterparty => $1::uuid, p_days => $2::integer,"
    + " p_op_key => $3::text) as result", [counterparty, days, opKey ?? opk("ti-terms")]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · Particulars and basis builders. Exact minor units only — never a float anywhere here.
// ===========================================================================================

/**
 * The canonical SUPPLIER BILL: Alpha Supplies RM1,060.00 for Rome Properties —
 * Dr 1,000.00 expense / Dr 60.00 SST input / Cr 1,060.00 payable control.
 */
export function billParticulars({
  counterparty = null, name = null, registration = null, tin = null,
  documentDate = TI_DATE.document, dueDate = null, dueDateSource = null,
  reference = "ALPHA-2026-0042", totalCents = 106000,
  taxFacts = { stated_code: "SR", stated_cents: 6000, note: "as printed on the bill" },
  extra = {},
} = {}) {
  const party = counterparty !== null
    ? { id: counterparty }
    : { ...(name === null ? {} : { name }),
        ...(registration === null ? {} : { registration_no: registration }),
        ...(tin === null ? {} : { tin }) };
  return {
    counterparty: party,
    document_date: documentDate,
    due_date: dueDate,
    ...(dueDateSource === null ? {} : { due_date_source: dueDateSource }),
    reference,
    currency: "MYR",
    total_cents: totalCents,
    tax_facts: taxFacts,
    ...extra,
  };
}

/** The AR mirror: Dr 1,060.00 receivable control / Cr 1,000.00 revenue / Cr 60.00 SST output —
 *  here credited to the same revenue account, because this lane validates the tax facts against
 *  NOTHING and a second income account would test the fixture rather than the lane. */
export function invoiceParticulars(o = {}) {
  return billParticulars({ reference: "ROME-2026-0007", ...o });
}

/** The journal basis a supplier bill posts: expense + tax debit, control credit. */
export function billBasis({
  postingDate = TI_DATE.posting, totalCents = 106000, taxCents = 6000,
  control = TICHART.payable, memo = "Alpha Supplies bill, office paper and SST",
  lines = null,
} = {}) {
  return {
    posting_date: postingDate,
    memo,
    currency: "MYR",
    lines: lines ?? [
      { account_code: TICHART.expense, debit_cents: totalCents - taxCents, credit_cents: 0,
        description: "office supplies" },
      ...(taxCents > 0
        ? [{ account_code: TICHART.sstInput, debit_cents: taxCents, credit_cents: 0,
             description: "SST on purchases" }]
        : []),
      { account_code: control, debit_cents: 0, credit_cents: totalCents, description: "payable" },
    ],
  };
}

/** The journal basis a sales invoice posts: control debit, revenue credit. */
export function invoiceBasis({
  postingDate = TI_DATE.posting, totalCents = 106000,
  control = TICHART.receivable, memo = "March services invoiced to Rome Properties",
  lines = null,
} = {}) {
  return {
    posting_date: postingDate,
    memo,
    currency: "MYR",
    lines: lines ?? [
      { account_code: control, debit_cents: totalCents, credit_cents: 0, description: "receivable" },
      { account_code: TICHART.revenue, debit_cents: 0, credit_cents: totalCents,
        description: "services" },
    ],
  };
}

// ===========================================================================================
// 5 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a divergence
//     there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

export async function admitTradeInvoiceWork({
  client, author, intentKey = null, kind = TI_KIND.bill, particulars, basis: b,
  origin = "user_direct", sourceRefs = [], model = MODEL, role = ROLES.runtime,
}) {
  const r = await roleQuery(role, namedCall("admit_trade_invoice_work", [
    { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_intent_key", cast: "text" }, { name: "p_kind", cast: "text" },
    { name: "p_particulars", cast: "jsonb" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_basis_origin", cast: "text" }, { name: "p_source_refs", cast: "jsonb" },
    { name: "p_model", cast: "text" },
  ]), [client, author, intentKey ?? `ti-intent-${randomUUID()}`, kind,
    JSON.stringify(particulars), JSON.stringify(b), origin, JSON.stringify(sourceRefs), model]);
  return r.rows[0].result;
}

export async function getTradeInvoice(sub, workId) {
  const r = await humanQuery(sub,
    "select clara.get_trade_invoice(p_work => $1::uuid) as result", [workId]);
  return r.rows[0].result;
}

/** #1007 · THE PROBE, driven as the SIGNED-IN HUMAN — its only production caller is the browser,
 *  through PostgREST, as the bookkeeper who is about to record the invoice. */
export async function probeTradeInvoiceDuplicates(sub, { client, kind = TI_KIND.bill, particulars }) {
  const r = await humanQuery(sub, namedCall("probe_trade_invoice_duplicates", [
    { name: "p_client", cast: "uuid" }, { name: "p_kind", cast: "text" },
    { name: "p_particulars", cast: "jsonb" },
  ]), [client, kind, JSON.stringify(particulars)]);
  return r.rows[0].result;
}

/** #1007 · THE RUNTIME TWIN, actor-explicit, for the chat lane. Same answer, same matcher; the
 *  authority preamble is `clara.admit_trade_invoice_work`'s own. */
export async function probeTradeInvoiceDuplicatesFor({
  client, author, kind = TI_KIND.bill, particulars, role = ROLES.runtime,
}) {
  const r = await roleQuery(role, namedCall("probe_trade_invoice_duplicates_for", [
    { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_kind", cast: "text" }, { name: "p_particulars", cast: "jsonb" },
  ]), [client, author, kind, JSON.stringify(particulars)]);
  return r.rows[0].result;
}

/** #1007 · THE "RECORDED ANYWAY" RECORD. A runtime act OBO a named human, exactly as admission is
 *  — the route writes it BEFORE it admits, so no invoice can carry a warning nobody kept. */
export async function recordTradeInvoiceDuplicateAck({
  client, author, intentKey, kind = TI_KIND.bill, particulars, shown, role = ROLES.runtime,
}) {
  const r = await roleQuery(role, namedCall("record_trade_invoice_duplicate_ack", [
    { name: "p_client", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_intent_key", cast: "text" }, { name: "p_kind", cast: "text" },
    { name: "p_particulars", cast: "jsonb" }, { name: "p_shown", cast: "jsonb" },
  ]), [client, author, intentKey, kind, JSON.stringify(particulars), JSON.stringify(shown)]);
  return r.rows[0].result;
}

/** #1007 · what a reviewer reads afterwards: the acknowledgement this Work was admitted under. */
export async function getTradeInvoiceDuplicateAck(sub, workId) {
  const r = await humanQuery(sub,
    "select clara.get_trade_invoice_duplicate_ack(p_work => $1::uuid) as result", [workId]);
  return r.rows[0].result;
}

/**
 * HOLD THE DOOR'S OWN CLIENT RUNG from a THIRD session, so two concurrent admissions are BOTH past
 * their (unlocked) world half before either can take it — `withClientRungHeld`'s reason, verbatim
 * (0221's fixtures): a race that is not barriered is a coin toss.
 */
export async function withClientRungHeld(client, fn) {
  return asRole(ROLES.runtime, async (c) => {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(203005004, hashtext($1::text))", [client]);
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await c.query("commit");
    };
    try {
      return await fn(release);
    } finally {
      await release().catch(() => { /* the transaction's end releases it anyway */ });
    }
  });
}

/** Wait until `n` sessions are BLOCKED on the door's client rung (classid 203005004), read from
 *  `pg_locks` rather than slept for — a fixed sleep is the flake this battery must not add. */
export async function awaitRungWaiters(n, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    const waiting = (await rootQuery(
      "select count(*)::int as n from pg_locks"
      + " where locktype='advisory' and classid=203005004 and not granted")).rows[0].n;
    if (waiting >= n) return waiting;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `awaitRungWaiters: ${waiting} of ${n} session(s) queued on the door's client rung after `
        + `${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// ===========================================================================================
// 5b · THE ONE LABELLED OWNER-LEVEL FIXTURE, and it is labelled because it is NOT a door.
// ===========================================================================================

/**
 * REACH PAST EVERY DOOR AND RE-KIND A COUNTERPARTY. Used by exactly one cell,
 * `p655.birth.abort_is_atomic`, and it exists because NO DOOR IN THE ESTATE reaches
 * `clara._tf_je_open_item_birth`'s raises — measured, not assumed:
 *
 *   1 `clara._assert_trade_invoice_basis` step 3 refuses a party whose `kind` contradicts the
 *     invoice's kind, at ADMISSION (0225:895-899, driven by `p655.polarity.matrix(b)`);
 *   2 …step 4 refuses a control leg of the opposite class (0225:706-717, `matrix(b2)`);
 *   3 …step 5 ties the control leg's SIGNED amount to the stated total (0225:739-741,
 *     `matrix(e2)`), which is what closes the birth's `invalid_total` arm;
 *   4 `clara.record_journal_entry` re-asks the control-leg class AT COMMIT (0225:1757-1772),
 *     behind the basis-digest wall that refuses any basis but the admitted one (0225:1684-1689),
 *     so a run cannot post a basis the admission never saw;
 *   5 `clara.trade_invoices` is append-only (0225:411-419, `p655.appendonly`), so the invoice's
 *     party cannot be repointed after admission;
 *   6 `clara.merge_counterparties` refuses a CROSS-KIND merge outright (0015:2274-2280), so the
 *     canonical party a merge leaves behind can never be of the other kind;
 *   7 `clara._tf_counterparty_update_0011` admits only name / merge columns on an UPDATE and no
 *     DELETE at all (0011:940-956), so `kind` is immutable through every role including root.
 *
 * THAT IS THE POINT OF THE TIER RULING, not an argument against it: DECISIONS §6.3 files this
 * trigger as Tier D · ABORT, and a tier is a statement about what happens WHEN a door is
 * loosened. So the cell makes the world the trigger is meant to refuse, and the only way to make
 * it is from outside the doors.
 *
 * HOW, AND WHY THIS SHAPE. One root transaction that sets `session_replication_role` TXN-LOCALLY
 * (`set_config(..., is_local => true)`), so the suppression lives on THIS connection for THIS
 * transaction and is gone at COMMIT — no DDL, no `ALTER TABLE ... DISABLE TRIGGER`, and therefore
 * no ACCESS EXCLUSIVE lock that a parallel test file could be let through. `withActor`'s own
 * `finally` rolls back and `RESET ALL`s the pooled client whatever happens here.
 */
export async function forceCounterpartyKind(counterparty, kind) {
  return asRoot(async (c) => {
    await c.query("begin");
    await c.query("select set_config('session_replication_role', 'replica', true)");
    const r = await c.query(
      "update clara.counterparties set kind = $2 where id = $1 returning id, kind",
      [counterparty, kind]);
    await c.query("commit");
    return r.rows[0] ?? null;
  });
}

// ===========================================================================================
// 6 · Readers. Root-side, and ONLY for facts that are not themselves under test — every
//     least-privilege claim goes through `humanQuery` / `roleQuery` in the cells.
// ===========================================================================================

export async function invoiceRow(id) {
  const r = await rootQuery(
    "select *, document_date::text as document_date_text, due_date::text as due_date_text"
    + " from clara.trade_invoices where id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function invoiceForWork(work) {
  const r = await rootQuery(
    "select *, document_date::text as document_date_text, due_date::text as due_date_text"
    + " from clara.trade_invoices where work_id = $1", [work]);
  return r.rows[0] ?? null;
}

export async function invoiceCount(client) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.trade_invoices where client_id = $1", [client]);
  return r.rows[0].n;
}

export async function invoiceStatus(invoiceId) {
  const r = await rootQuery(
    "select * from clara.trade_invoice_status where invoice_id = $1 order by recorded_at, state",
    [invoiceId]);
  return r.rows;
}

export async function openItemsForEntry(entry) {
  const r = await rootQuery(
    "select id, domain, item_kind, amount_cents, counterparty_id, item_date::text as item_date,"
    + " due_date::text as due_date from clara.open_items where entry_id = $1"
    + " order by domain, counterparty_id", [entry]);
  return r.rows;
}

export async function openItemsForClient(client) {
  const r = await rootQuery(
    "select id, entry_id, domain, item_kind, amount_cents, counterparty_id,"
    + " item_date::text as item_date, due_date::text as due_date from clara.open_items"
    + " where client_id = $1 order by created_at", [client]);
  return r.rows;
}

export async function classifyEntry(entry) {
  const r = await rootQuery(
    "select * from clara._subledger_classify_entry($1::uuid) order by domain, item_kind", [entry]);
  return r.rows;
}

export async function entryRow(id) {
  const r = await rootQuery(
    "select id, status, coding_kind, is_opening_balance, reversal_of, document_id,"
    + " posting_date::text as posting_date, revision_token from clara.journal_entries where id=$1",
    [id]);
  return r.rows[0] ?? null;
}

/** The control-account GL balance for a client and account class, from the LEDGER — the tie target
 *  `p655.tieout.control` proves the subledger equals. */
export async function controlBalance(client, accountClass) {
  const r = await rootQuery(
    `select coalesce(sum(case when a.account_class='receivable'
                              then l.debit_cents - l.credit_cents
                              else l.credit_cents - l.debit_cents end),0)::bigint as n
       from clara.journal_lines l
       join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
       join clara.journal_entries e on e.id = l.entry_id
      where l.client_id = $1 and a.account_class = $2 and e.status = 'approved'`,
    [client, accountClass]);
  return BigInt(r.rows[0].n);
}

/** The subledger's own outstanding for a client and domain. */
export async function subledgerOutstanding(client, domain) {
  const r = await rootQuery(
    "select coalesce(sum(clara._subledger_outstanding(oi.id)),0)::bigint as n"
    + " from clara.open_items oi where oi.client_id = $1 and oi.domain = $2", [client, domain]);
  return BigInt(r.rows[0].n);
}

export { journalBasis };
