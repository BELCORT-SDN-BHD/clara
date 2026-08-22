// Slice-6 rig — coding-floor shared helper CORE (NOT a test file). Written by the
// CONTRACT-BLIND rig lane (L2) from contract v1.3 + companion §1–§11 + delegated
// decisions + INTERFACE-PINS §1/§2 + migrations 0001–0008 + the existing rig.
// It NEVER reads 0009_coding_floor.sql. The battery encodes the SPEC; a divergence
// between an expectation here and observed 0009 behavior is a FINDING for
// orchestrator adjudication, never a silent test edit. Re-exports rig-docs-fixtures
// so a test file imports ONE module. Pinned 0009 signatures are called with NAMED
// args verbatim — a named 14-arg wake_draft_entry fails 42883 at 0008 so suites
// SKIP via s6Ready(); at 0009 a param-name divergence is a finding.

import { createHash } from "node:crypto";
import {
  ROLES,
  rootQuery,
  humanQuery,
  opk,
  noteLane,
  mintWake,
  seedVerifiedDocument,
  fileDocument,
  freshResolution,
  namedCall,
} from "./rig-docs-fixtures.mjs";

export * from "./rig-docs-fixtures.mjs";

// ---------------------------------------------------------------------------
// §12 error-map constants (contract §12 + INTERFACE-PINS §2). New in Slice 6.
// ---------------------------------------------------------------------------

export const CLR21 = "CLR21"; // coding-tool law (Tier-A mismatch, currency, vendor, evidence, double-code)
export const CLR22 = "CLR22"; // draft-lifecycle law (revise/withdraw on non-draft; withdraw w/o reason)
export const CLR23 = "CLR23"; // counterparty law (payable line w/o vendor; registration conflict; bill-shape)
export const CLR24 = "CLR24"; // coding_tasks transitions (off-matrix, result-proof, wrong-firm→not-found)
export const CLR25 = "CLR25"; // stale evidence at approve (a verified total now contradicts bound evidence)

/** CLR21 machine-readable reason discriminant tokens — carried in the exception
 *  DETAIL as json {"reason": <token>} (INTERFACE-PINS §2 + S6-D1). */
export const REASON = {
  amountConflict: "amount_conflict", // resolvable via the amount-exception flow
  currencyUnsupported: "currency_unsupported",
  vendorMalformed: "vendor_malformed",
  evidenceInvalid: "evidence_invalid",
  doubleCoded: "double_coded",
  duplicateBill: "duplicate_bill", // FIX-round W2/§6.6 — exact (client, counterparty, invoice_id) dup
  sessionUnbound: "session_unbound", // RUNTIME-labeled only — never a DB raise
};

// ---------------------------------------------------------------------------
// Pinned object names / vocabularies (INTERFACE-PINS §1 + companion §1/§5/§6).
// ---------------------------------------------------------------------------

export const INVOICE_ENGINE_ID = "azure-di:prebuilt-invoice:2024-11-30"; // §5 / INTERFACE-PINS §3
export const INVOICE_FACTS_LANE = "invoice_facts";
export const INVOICE_FACTS_KIND = "invoice_facts";
export const CODING_KIND = "supplier_bill";

/** field_path vocabulary the facts normalizer persists (companion §5 / pins §3). */
export const FIELD = {
  total: "invoice.total",
  amountDue: "invoice.amount_due",
  currency: "invoice.currency",
  vendorName: "invoice.vendor_name",
  invoiceId: "invoice.invoice_id",
  invoiceDate: "invoice.invoice_date",
  deposit: "invoice.deposit",
};

/** The seven NEW event types — additive coupled pairs into the ACTIVE taxonomy
 *  (v2): event_type + trigger_taxonomy rows (companion §1 / pins §1 / P5). */
export const S6_EVENT_TYPES = [
  "counterparty.created",
  "entry.revised",
  "entry.withdrawn",
  "coding_task.opened",
  "coding_task.closed",
  "document.invoice_facts_completed",
  "document.invoice_facts_failed",
];

/** New tables 0009 adds (companion §1 + NEW-4 metering carrier). */
export const S6_NEW_TABLES = [
  "counterparties",
  "coding_tasks",
  "entry_evidence",
  "coding_attempts",
  "processing_call_reservations",
];

/** The masked coding-tasks view (house `_visible` pattern, pins §1). */
export const CODING_TASKS_VIEW = "coding_tasks_visible";

/** New GRANTED functions + their expected EXECUTE lane audience (companion §9 +
 *  pins §1). null-lane internal helpers are NOT granted (asserted separately). */
export const S6_GRANTED_FNS = {
  // reads (security invoker) — clara_authenticated + clara_agent_ro
  list_unassigned_documents: [ROLES.authenticated, ROLES.agentRo],
  get_document_extract: [ROLES.authenticated, ROLES.agentRo],
  get_draft_review: [ROLES.authenticated, ROLES.agentRo],
  list_uncoded_filings: [ROLES.authenticated, ROLES.agentRo],
  get_journal_entry_for: [ROLES.authenticated, ROLES.agentRo],
  get_coding_attempt: [ROLES.runtime], // PIN-AB-1: runtime ONLY; sanctioned §13 amendment
  // human draft-lifecycle + coding-task writers — clara_authenticated (bookkeeper+)
  revise_entry: [ROLES.authenticated],
  withdraw_draft: [ROLES.authenticated],
  open_coding_task: [ROLES.authenticated],
  complete_coding_task: [ROLES.authenticated],
  dismiss_coding_task: [ROLES.authenticated],
  // invoice-facts lane — clara_runtime
  enqueue_invoice_facts: [ROLES.runtime],
  persist_invoice_facts: [ROLES.runtime],
  fail_invoice_facts: [ROLES.runtime],
};

/** Ungranted internal helpers (companion §9: granted to NO app role). */
export const S6_UNGRANTED_FNS = ["_validate_entry_lines", "_assert_supplier_bill_shape", "_resolve_counterparty"];

/** The NOLOGIN write login shell created in-migration (companion §10/§5). */
export const WRITE_LOGIN = "clara_wake_write_login";

// ---------------------------------------------------------------------------
// account_code domain widening (companion §6 / C-16). Every reviewed RPR-style
// code shape must PASS the widened CHECK; hostile inputs must FAIL. The widened
// grammar (pins §1): `^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$`.
// ---------------------------------------------------------------------------

/** RPR-style + legacy codes that MUST pass the widened account_code CHECK. */
export const RPR_VALID_CODES = [
  "1000", "12345678", // legacy 4–8 digit (existing data passes)
  "100-000", "400-000", "900-A01", "500-A12", "300-XY", "100-0000",
];
/** Hostile codes that MUST still be REJECTED by the widened CHECK
 *  (`^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$`). NB `100-A1` is VALID (3-digit + 2
 *  alnum), so it is deliberately NOT here. */
export const RPR_HOSTILE_CODES = [
  "abc", "12-34", "100-", "100-0", "100-00000", "100- 00", " 100-000",
  "100_000", "1000000000", "123", "100-a01lower", "",
];

/** N-F6 normalization — one expression everywhere (pins §1). */
export const normalize = (s) => (s == null ? null : String(s).toLowerCase().replace(/[^a-z0-9]/g, ""));

// ---------------------------------------------------------------------------
// Assertions — SQLSTATE + the CLR21 reason discriminant (DETAIL json, pins §2).
// ---------------------------------------------------------------------------

/** The machine-readable reason token from a raised error's DETAIL (json
 *  {"reason": <token>}) — best-effort across a raw string or json DETAIL. */
export function reasonOf(err) {
  const d = err?.detail ?? "";
  const m = /"reason"\s*:\s*"([a-z_]+)"/.exec(d);
  return m ? m[1] : null;
}

/** Assert fn() raises SQLSTATE `code` AND (when given) carries reason `reason` in
 *  DETAIL. A wrong code, no error, or a wrong reason all FAIL (surfacing actuals).
 *  When the DETAIL reason is absent the reason check is recorded as a soft note —
 *  the discriminant location is contract-pinned to DETAIL, so its absence is a
 *  finding but not fatal to the SQLSTATE assertion. */
export async function assertRaisesReason(code, reason, fn, label = "operation") {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  if (!err) throw new Error(`${label}: expected SQLSTATE ${code} but the call SUCCEEDED (no error)`);
  if (err.code !== code) throw new Error(`${label}: expected SQLSTATE ${code} but got ${err.code ?? "(none)"} — ${err.message}`);
  if (reason) {
    const got = reasonOf(err);
    if (got == null) noteLane(`${label}: ${code} raised but no reason discriminant in DETAIL (expected '${reason}') — finding (pins §2 requires DETAIL json {"reason":...})`);
    else if (got !== reason) throw new Error(`${label}: ${code} carried reason '${got}', expected '${reason}'`);
  }
  return err;
}

// ---------------------------------------------------------------------------
// Readiness — the Slice-6 surface must be present (0009 applied), else SKIP.
// Marker: the `counterparties` table (companion §2) + the `revise_entry` fn
// (companion §8). Follows the docsReady()/runtimeReady() pattern exactly; never
// reads the migration file.
// ---------------------------------------------------------------------------

/**
 * Best-effort migrate, then report Slice-6 readiness from the CATALOG (not from
 * migrate success). If 0009 is on disk but does not apply cleanly (e.g. it leaves
 * a role set and the runner's bookkeeping insert is denied), the migrate throws,
 * the failed transaction rolls back to the prior applied version, and this returns
 * false → suites SKIP. So the battery is runnable at 0008 whether 0009 is ABSENT
 * or PRESENT-BUT-NOT-CLEANLY-APPLIED, and turns green once 0009 applies cleanly
 * (the orchestrator applies it to clara_blind_test). The migrate error is recorded
 * as a lane note — the apply-cleanliness itself is a FINDING (probe 1), reported
 * separately, never silently swallowed. */
export async function s6EnsureReady() {
  const { ensureReady } = await import("./rig-docs-fixtures.mjs");
  try {
    await ensureReady();
  } catch (e) {
    noteLane(`migrate did not reach a clean state (${e.message}) — running at the current applied version; 0009 apply-cleanliness is a probe-1 finding`);
  }
  return s6Ready();
}

export async function s6Ready() {
  const r = await rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'clara' and c.relname = 'counterparties' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'clara' and p.proname = 'revise_entry' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}

/** Does clara.<fn> exist at all (any overload)? (blind catalog inspection). */
export async function fnExists(name) {
  const r = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1",
    [name],
  );
  return r.rowCount > 0;
}

/** Whether clara.<table> has column <col> (blind catalog inspection). */
export async function hasColumn(table, col) {
  const r = await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
    [table, col],
  );
  return r.rowCount > 0;
}

// ---------------------------------------------------------------------------
// Fixtures — every synthetic object built THROUGH audited writers (dog-fooding).
// ---------------------------------------------------------------------------

export async function firmOf(client) {
  const r = await rootQuery("select firm_id from clara.clients where id = $1", [client]);
  return r.rows[0]?.firm_id ?? null;
}

/** The client's firm's current max event seq — the fresh wake books_version. */
export async function booksVersion(client) {
  const r = await rootQuery(
    "select coalesce(max(d.seq),0)::int as v from clara.domain_events d join clara.clients c on c.firm_id = d.firm_id where c.id = $1",
    [client],
  );
  return r.rows[0].v;
}

/** upsert_account recreated with a trailing p_account_class (pins §1). A payable
 *  control account: account_type='liability', account_class='payable'. Built via
 *  the recreated named signature; a param-name/domain divergence is a finding. */
export async function upsertPayableAccount(sub, { client, code = "2000", name = "Trade Creditors", opKey = null }) {
  await humanQuery(
    sub,
    "select clara.upsert_account(p_client => $1, p_code => $2, p_name => $3, p_type => $4, p_account_class => $5, p_op_key => $6) as r",
    [client, code, name, "liability", "payable", opKey ?? opk("payacct")],
  );
  return code;
}

/** upsert_account for an ordinary (non-payable) account through the recreated fn.
 *  When p_account_class is omitted the account is a plain expense/asset/etc. */
export async function upsertAccountClassed(sub, { client, code, name, type = "expense", accountClass = null, special = null, opKey = null }) {
  const specs = [{ name: "p_client" }, { name: "p_code" }, { name: "p_name" }, { name: "p_type" }];
  const vals = [client, code, name, type];
  if (special != null) { specs.push({ name: "p_special_acc_type" }); vals.push(special); }
  if (accountClass != null) { specs.push({ name: "p_account_class" }); vals.push(accountClass); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("acct"));
  await humanQuery(sub, namedCall("upsert_account", specs), vals);
  return code;
}

/** Seed a verified document and file it to a client (active filing + resolution
 *  ABOUT the document). Returns { documentId, filingId, sha256 }. The S5 proven
 *  chain (rig-docs-filings-provenance): seed → file_document w/ freshResolution. */
export async function filedDocument(sub, { firm, client, kind = null, financialDate = null }) {
  const seed = await seedVerifiedDocument({ firm, kind, financialDate });
  const filingId = await fileDocument(sub, {
    document: seed.documentId,
    client,
    resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: seed.documentId }),
  });
  return { documentId: seed.documentId, filingId, sha256: seed.sha256 };
}

/** Mint an interactive wake credential for the firm (optionally OBO a user). */
export async function mintInteractive(firm, onBehalfOf = null) {
  return mintWake({ kind: "interactive", firm, onBehalfOf });
}

/** Seed a filed verified document PLUS a primary OCR extraction + one region, so
 *  a document-bound draft can cite REAL evidence (region↔extraction↔document
 *  congruence, C-9). Returns { documentId, filingId, sha256, extractionId,
 *  regionId, quote }. Uses the S5 seedExtraction/seedRegion fixtures. */
// 0016 (pin P3/WA21-R7): `kind` pass-through — the classify-first facts gate sends a
// NULL-kind pdf to `classify`; facts-lane fixtures seed kind:'invoice' (source-stamped
// corpus) so invoice_facts engages directly (the classify loop is proven in a21-classifier-gate).
// F-A2 PR-1 (D11): `direction` — MINT A FACTS EXTRACTION THAT STATES ITS SUPPLIER, so the
// document has a testable direction. Default null keeps every existing caller byte-identical.
//
// WHY A FIXTURE NEEDS THIS NOW. The draft core's direction-family arm used to fire only for
// `p_wake_kind='autodraft'`; D11 re-cuts it to `not p_is_human`, so EVERY agent-lane coded draft
// is now held to the document's direction — the chat lane included, which is the point (chat is
// direction-blind today). A document carrying only an `ocr` extraction has no facts extraction
// at all, so clara._document_facts_extraction returns NULL, clara._document_direction raises
// CLR30 and the tri-state answers 'unresolved' — the honest answer, and a refusal. A fixture
// that wants a coded agent draft must therefore state what a real supplier bill states.
//
// It states the MINIMUM: a total and a third-party vendor name. That reaches the resolver's (P2)
// arm — a stated supplier identity that is not this client, on a name-only page — and answers
// 'purchase'. It deliberately does NOT state the arithmetic (`statedIdentityFields`) and carries
// no agreement envelope, so the document does NOT corroborate: direction and corroboration are
// different questions, and a fixture that wants only the first must not accidentally buy the
// second.
export async function seedCitedDocument(sub, { firm, client, quote = "RM 5,000.00", fieldPath = FIELD.total, kind = null, direction = null } = {}) {
  const { seedExtraction, seedRegion } = await import("./rig-docs-fixtures.mjs");
  // A document whose DIRECTION the fixture wants stated is an invoice-kind document: 0016's
  // classify-first gate only lets the facts lane engage on a kind-stamped doc, and without a
  // facts task there is no facts extraction for the resolver to read. An explicit `kind` still
  // wins — this only supplies the one the direction evidence implies.
  const doc = await filedDocument(sub, { firm, client, kind: kind ?? (direction ? "invoice" : null) });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  const regionId = await seedRegion({ firm, extraction: extractionId, fieldPath, textContent: quote, locator: { page: 1, polygon: [0, 0, 1, 1] } });
  if (direction) await seedPurchaseDirection(sub, { client, document: doc.documentId, quote, direction });
  return { ...doc, extractionId, regionId, quote };
}

/** The facts extraction that makes a document's direction READABLE as a purchase (D11).
 *  Legacy `invoice_facts` lane on purpose: it is the arm clara._document_facts_extraction
 *  falls back to, and it needs no witness pair to be believable. */
export async function seedPurchaseDirection(sub, { client, document, quote = "RM 5,000.00", direction = "purchase" }) {
  const { mintLegacyInvoiceFactsTask, claimTask, persistInvoiceFacts, factField, ensureClientEgress } =
    await import("./s6-fixtures.mjs");
  // THE SALES ARM states the client's OWN registered name as the supplier — the resolver's (S)
  // arm, which reads a supplier identity that IS this client and answers 'sales'. It is the same
  // one-field statement as the purchase arm, pointed the other way, and it is why a sales fixture
  // does not need a customer identity at all.
  const vendorName = direction === "sales"
    ? (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0]?.name
    : "RIG DIRECTION SUPPLIER SDN BHD";
  // The claim runs through the EGRESS gate, so a client with no standing consent parks the task
  // at held_egress and the persist below refuses CLR16 'task is not running'. Best-effort: a
  // client that already holds a live consent raises CLR28, which this helper absorbs.
  await ensureClientEgress(sub, { client }).catch(() => {});
  // Use the row the mint RETURNS rather than re-resolving by document: the resolver would hand
  // back whichever task it finds, including a done one from an earlier fixture on the same doc.
  const task = await mintLegacyInvoiceFactsTask(document);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, quote),
    factField("invoice.currency", "MYR"),
    // Purchase: a third party, never this client — the (P2) arm's own condition.
    // Sales: this client's own registered name — the (S) arm's.
    factField("invoice.vendor_name", vendorName),
  ]);
  return task;
}

/**
 * wake_draft_entry recreated to carry the coding payload (pins §1, 14 args). Runs
 * under the wake lane in one transaction (the wake GUC is txn-local). Builds the
 * NAMED call from the pinned parameter names — at 0008 (10-arg) this throws 42883
 * and callers SKIP via s6Ready(); at 0009 it binds by name, so a name divergence
 * is a finding. `vendor` → p_proposed_counterparty; `evidence` → p_evidence;
 * `coding` → p_coding {task_id, part_payload}; `codingKind` → p_coding_kind.
 */
export async function wakeDraftEntry(cred, {
  client, resolution, lines, document = null, sha256 = null, flags = {},
  vendor = null, evidence = null, coding = null, codingKind = null,
  memo = "rig supplier bill", postingDate = "2026-03-15", booksVersion: bv = null, opKey = null,
}) {
  const { getPool } = await import("./rig-docs-fixtures.mjs");
  const resolvedRes = await resolution; // callers may pass an unawaited freshResolution(...)
  const client_ = await getPool().connect();
  const freshBv = bv ?? (await booksVersion(client));
  const sql =
    `select clara.wake_draft_entry(` +
    `p_client => $1, p_resolution => $2, p_posting_date => $3::date, p_memo => $4, ` +
    `p_lines => $5::jsonb, p_document => $6, p_sha256 => $7, p_flags => $8::jsonb, ` +
    `p_op_key => $9, p_books_version => $10::bigint, ` +
    `p_proposed_counterparty => $11::jsonb, p_evidence => $12::jsonb, ` +
    `p_coding => $13::jsonb, p_coding_kind => $14) as result`;
  const params = [
    client, resolvedRes ?? null, postingDate, memo, JSON.stringify(lines), document, sha256,
    JSON.stringify(flags ?? {}), opKey ?? opk("wdraft"), freshBv,
    vendor == null ? null : JSON.stringify(vendor),
    evidence == null ? null : JSON.stringify(evidence),
    coding == null ? null : JSON.stringify(coding),
    codingKind,
  ];
  try {
    await client_.query(`set role ${ROLES.wakeInteractive}`);
    await client_.query("begin");
    await client_.query("select set_config('clara.wake_secret', $1, true)", [cred.secret]);
    const r = await client_.query(sql, params);
    await client_.query("commit");
    return r.rows[0].result;
  } catch (e) {
    await client_.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client_.query("reset role").catch(() => {});
    await client_.query("reset all").catch(() => {});
    client_.release();
  }
}

/**
 * draft_entry recreated (human lane) with the two new trailing args
 * p_proposed_counterparty + p_evidence (pins §1, 11 args). Runs as `sub`. A NAMED
 * call from the pinned names → 42883 at 0008 (9-arg) so callers SKIP via s6Ready.
 * `vendor` → p_proposed_counterparty ({existing_id}|{new:{name,registration_no?}});
 * `evidence` → p_evidence (required when document is set — CLR21 otherwise).
 */
export async function draftEntryV3(sub, {
  client, resolution, lines, document = null, sha256 = null, flags = null,
  vendor = null, evidence = null, memo = "rig v3 draft", postingDate = "2026-03-15", opKey = null,
}) {
  const resolved = await resolution; // callers may pass an unawaited freshResolution(...)
  const specs = [
    { name: "p_client" }, { name: "p_resolution" }, { name: "p_posting_date", cast: "date" },
    { name: "p_memo" }, { name: "p_lines", cast: "jsonb" },
  ];
  const vals = [client, resolved ?? null, postingDate, memo, JSON.stringify(lines)];
  if (document != null) { specs.push({ name: "p_document" }); vals.push(document); }
  if (sha256 != null) { specs.push({ name: "p_sha256" }); vals.push(sha256); }
  if (flags != null) { specs.push({ name: "p_flags", cast: "jsonb" }); vals.push(JSON.stringify(flags)); }
  specs.push({ name: "p_op_key" }); vals.push(opKey ?? opk("v3draft"));
  if (vendor != null) { specs.push({ name: "p_proposed_counterparty", cast: "jsonb" }); vals.push(JSON.stringify(vendor)); }
  if (evidence != null) { specs.push({ name: "p_evidence", cast: "jsonb" }); vals.push(JSON.stringify(evidence)); }
  const r = await humanQuery(sub, namedCall("draft_entry", specs), vals);
  return r.rows[0].result;
}

/** A balanced supplier-bill line set: Dr expense / Cr payable, both = amount. */
export function billLines(expenseCode, payableCode, amount, { desc = "bill" } = {}) {
  return [
    { account_code: expenseCode, debit_cents: amount, credit_cents: 0, description: `${desc}-exp` },
    { account_code: payableCode, debit_cents: 0, credit_cents: amount, description: `${desc}-ap` },
  ];
}

/** An evidence array element (region_id + exact quote + field_path). */
export function ev(region, quote, fieldPath = FIELD.total) {
  return { region_id: region, quote, field_path: fieldPath };
}

// ---------------------------------------------------------------------------
// Invoice-facts extraction seeding (blind: the facts row is written by the
// runtime `persist_invoice_facts` writer; for pure-DB battery we exercise that
// writer where possible, and otherwise assert its output shape). These helpers
// read + drive the facts surface without asserting; assertions call the writers.
// ---------------------------------------------------------------------------

/** Row-level readback of a document's invoice-facts extraction (root; RLS bypass). */
export async function invoiceFactsExtraction(document) {
  const r = await rootQuery(
    "select to_jsonb(e) as row from clara.document_extractions e where e.document_id=$1 and e.engine_kind=$2 order by e.version_n desc limit 1",
    [document, INVOICE_FACTS_KIND],
  );
  return r.rows[0]?.row ?? null;
}

/** Entry-evidence rows for an entry (root readback). */
export async function evidenceRows(entry) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.entry_evidence x where x.entry_id=$1 order by x.field_path", [entry]);
  return r.rows.map((x) => x.row);
}

/** The coding-attempt row for a task (root readback; the granted read is runtime-only). */
export async function codingAttemptRow(task) {
  const r = await rootQuery("select to_jsonb(a) as row from clara.coding_attempts a where a.task_id=$1", [task]);
  return r.rows[0]?.row ?? null;
}

/** A row-level readback of an entry (root; RLS bypass). */
export async function entryRow(entry) {
  const r = await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry]);
  return r.rows[0]?.row ?? null;
}

/** The lines of an entry with counterparty_id, ordered by line_no. */
export async function entryLines(entry) {
  const r = await rootQuery("select to_jsonb(l) as row from clara.journal_lines l where l.entry_id=$1 order by l.line_no", [entry]);
  return r.rows.map((x) => x.row);
}

/** A firm's counterparty rows (root readback). */
export async function counterpartyRows(client) {
  const r = await rootQuery("select to_jsonb(c) as row from clara.counterparties c where c.client_id=$1 order by c.created_at", [client]);
  return r.rows.map((x) => x.row);
}

/** Deterministic sha256 hex of a string (for op-key request-hash reasoning). */
export const digestOf = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Set the doc-egress flag on the SESSION (GUC) — used to simulate flag ON/OFF
 *  where the claim writer reads it from a GUC. The mechanism is contract-silent
 *  (env vs GUC); this is a best-effort probe recorded as an interface note. */
export const EGRESS_GUC = "clara.doc_egress_approved";
