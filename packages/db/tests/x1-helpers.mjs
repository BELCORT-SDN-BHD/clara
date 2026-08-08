// Extraction slice, block X1 (migration 0022) — shared rig helpers (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it). Re-exports the a21 helper
// core so an X1 test file imports ONE leaf, and adds the 0022 verb wrappers plus the two
// fact-shape fixtures the tie cells need.
//
// Authority: docs/plan/extraction-slice-contract.md (v1.0, ADR-047). Kept OUT of
// a21-helpers.mjs deliberately — that module is the contract-blind 0016 lane's core and
// carries a header saying so, and it is already at the repo's 500-line cap.
//
// READINESS: the 0021 discipline, one migration up. Every cell FAILS loudly against a
// 21-migration database rather than skipping. A green X1 battery against a prestate that
// does not have the verbs would prove nothing at all.

import { randomUUID } from "node:crypto";
import {
  rootQuery, roleQuery, humanQuery, namedCall, opk, fnSource, firmOf,
  seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts,
  failInvoiceFacts, factField, rm, grantConsent,
} from "./a21-helpers.mjs";

export * from "./a21-helpers.mjs";
// The generic two-session forced-schedule drivers (the wave-a-race precedent: a
// concurrency cell imports THIS leaf, a non-concurrency cell imports a21-helpers).
// `holdThenContend` is what turns "the row lock serializes these calls" from a hope about
// timing into an assertion — it proves the blocked side really blocked, via pg_blocking_pids.
export { holdThenContend, concurrentTwoSession, waitBlockedBy, sawDeadlock } from "./rig-docs-race.mjs";

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export async function has0022() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0022_'");
    return r.rows.length > 0;
  } catch { return false; }
}

/** At 21 migrations every X1 cell FAILS loudly rather than skipping (the 0021 ratchet). */
export function fail0022(live) {
  if (!live) {
    throw new Error(
      "0022 NOT applied (clara.schema_migrations has no '0022_%' row) — clara.request_reextraction"
      + " and clara.set_firm_high_stakes_threshold do not exist, the sales tie is still the"
      + " service-charge-breaking `net + tax + rounding = gross`, and the OCR anchor lane carries"
      + " no dark guard. This battery is REQUIRED to fail against the 21-migration prestate.");
  }
}

// ---------------------------------------------------------------------------
// The two 0022 verbs, called as real firm members through the governed surface.
// ---------------------------------------------------------------------------

// NB on the op-key defaults below: they key off `undefined`, never `?? `. A cell that wants
// to prove the NULL-op_key refusal has to be able to PASS null, and `opKey ?? opk(...)`
// silently substitutes a fresh key for exactly that case — the wrapper would swallow the
// argument the cell exists to test.

/** request_reextraction(p_document, p_reason, p_op_key) — bookkeeper floor (ADR-047 Q2). */
export async function requestReextraction(sub, { document, reason = "rig re-extraction", opKey } = {}) {
  const specs = [{ name: "p_document" }, { name: "p_reason" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("request_reextraction", specs),
    [document, reason, opKey === undefined ? opk("rex") : opKey]);
  return r.rows[0].result;
}

/** set_firm_high_stakes_threshold(p_cents, p_op_key) — owner floor. */
export async function setHighStakes(sub, { cents, opKey } = {}) {
  const specs = [{ name: "p_cents", cast: "bigint" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("set_firm_high_stakes_threshold", specs),
    [cents, opKey === undefined ? opk("hs") : opKey]);
  return r.rows[0].result;
}

/** Either verb driven from a NON-human role, to prove the refusal is at the GRANT. */
export function callAsRole(role, sql, params) { return roleQuery(role, sql, params); }

// ---------------------------------------------------------------------------
// Readbacks (root; superuser bypasses RLS — fixtures and asserts only).
// ---------------------------------------------------------------------------

export async function laneTasks(document, lane = "invoice_facts") {
  const r = await rootQuery(
    `select id, version_n, status, engine_id, error_code from clara.document_processing_tasks
      where document_id=$1 and lane=$2 order by version_n, id`, [document, lane]);
  return r.rows;
}

export async function extractionsOf(document) {
  const r = await rootQuery(
    `select id, version_n, status, superseded_by from clara.document_extractions
      where document_id=$1 and engine_kind='invoice_facts' order by version_n, id`, [document]);
  return r.rows;
}

export async function authoritativeExtraction(document) {
  const r = await rootQuery(
    "select authoritative_extraction_id from clara.documents where id=$1", [document]);
  return r.rows[0]?.authoritative_extraction_id ?? null;
}

export async function firmThreshold(firm) {
  const r = await rootQuery("select high_stakes_amount_cents from clara.firms where id=$1", [firm]);
  return r.rows[0]?.high_stakes_amount_cents ?? null;
}

export async function auditArgs(fn, key, value) {
  const r = await rootQuery(
    `select actor, on_behalf_of, via_wake_kind, args, outcome from clara.audit_log
      where fn=$1 and args->>$2 = $3 order by at desc, id desc limit 1`,
    [fn, key, String(value)]);
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Fact fixtures
// ---------------------------------------------------------------------------

/** The X3 component taxonomy, as field_paths (ADR-047's CLOSED enumeration). */
export const COMPONENT = {
  net: "invoice.total_excl_tax",
  tax: "invoice.tax_total",
  rounding: "invoice.rounding",
  serviceCharge: "invoice.service_charge",
  discount: "invoice.discount",
  delivery: "invoice.delivery",
};

/** LAI LOU MEI, the real document from the refusal record — the shape the 0016 identity
 *  `net + tax + rounding = gross` gets WRONG (94.30 + 5.66 + 0.02 = 99.98 <> 103.75) and
 *  the X3 identity gets right (94.30 + 3.77 + 5.66 + 0.02 = 103.75). Cents, exact. */
export const LAI_LOU_MEI = {
  gross: 10375, net: 9430, serviceCharge: 377, tax: 566, rounding: 2,
};

/** Seed a filed, kind-stamped invoice document and settle ONE done invoice_facts
 *  extraction over `fields` through the REAL writer (claim -> persist), so every guard the
 *  write boundary carries actually runs. Returns the seedCitedDocument receipt. */
export async function extractedDoc(sub, { client, cents = 90000, fields = null, quote = null } = {}) {
  const firm = await firmOf(client);
  // WA-D1 lane-carve: with zero live client_egress_consents rows the invoice_facts CLAIM
  // fail-closes to held_egress/CLR28 and persist then raises CLR16 'task is not running'.
  // Tolerant of a pre-existing live consent (one-live-per-client).
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: quote ?? rm(cents) });
  // The 0016 P3 kind gate sends a NULL-kind pdf to `classify` first; the fixture models the
  // source-stamped corpus (kind at seed, no classifier verdict) exactly as a21-ocr-envelope
  // does, so invoice_facts engages directly.
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, fields ?? [
    factField("invoice.total", rm(cents)),
    factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", `RIG-${randomUUID().slice(0, 8)}`),
    factField("invoice.invoice_date", "2026-06-15", { polygon: [], confidence: 0.9 }),
  ]);
  return cited;
}

/** Seed a filed, kind-stamped invoice document whose ONLY invoice_facts attempt is
 *  TERMINALLY FAILED — the F6 / LUMINOUS shape, reproduced through the REAL writers
 *  (enqueue -> claim -> fail_invoice_facts), never by hand-writing a task row.
 *
 *  The live exhibit this mirrors, quoted: docs/plan/wave-7a-acceptance-h1.md:542-545 —
 *  "invoice_facts FAILED on its only-ever attempt: `document_processing_tasks`
 *  status='failed', error_code='internal', attempt_count=1 (OCR on the SAME document
 *  completed fine)". `seedCitedDocument` supplies that same completed-OCR half (it seeds a
 *  done engine_kind='ocr' extraction + its region), so the fixture is the whole shape, not
 *  just the failing half.
 *
 *  THE THING TO NOTICE, because it is what 0051's door had to be built around:
 *  `clara.fail_invoice_facts` (0009:2152-2178) writes NO `clara.document_extractions` row —
 *  it only terminalises the task. So this fixture ends with ZERO invoice_facts extractions,
 *  which is precisely why an admission guard phrased against the extraction table could
 *  never have admitted it. Cells assert that emptiness explicitly rather than assuming it.
 *
 *  Returns the seedCitedDocument receipt plus `{ taskId, versionN }` of the failed attempt. */
export async function failedFactsDoc(sub, { client, cents = 90000, reason = "internal" } = {}) {
  const firm = await firmOf(client);
  // Same lane-carve as extractedDoc: without a live consent the invoice_facts CLAIM
  // fail-closes to held_egress and the task never reaches 'running', so it could not be
  // FAILED either — the fixture would silently model a different shape.
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await failInvoiceFacts(task.id, reason);
  return { ...cited, taskId: task.id, versionN: task.version_n };
}

/** to_jsonb of one processing task — the whole row, so a cell can prove a terminal row was
 *  not touched without having to enumerate (and therefore under-enumerate) its columns. */
export async function taskRow(taskId) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.document_processing_tasks t where t.id=$1",
    [taskId]);
  return r.rows[0]?.row ?? null;
}

/** The fact field list for a stated-component sales document. Omitted components are NOT
 *  emitted at all (that is what "absent" means on a document face); a component present
 *  with value 0 is a different statement and callers pass 0 explicitly for it. */
export function componentFields({
  gross, net = null, tax = null, rounding = null,
  serviceCharge = null, discount = null, delivery = null,
  currency = "MYR", invoiceId = null, invoiceDate = "2026-06-15",
}) {
  const f = [
    factField("invoice.total", rm(gross)),
    factField("invoice.currency", currency),
    factField("invoice.invoice_id", invoiceId ?? `RIG-${randomUUID().slice(0, 8)}`),
    factField("invoice.invoice_date", invoiceDate, { polygon: [], confidence: 0.9 }),
  ];
  const add = (path, cents) => {
    if (cents === null || cents === undefined) return;
    f.push(factField(path, rm(cents), { polygon: [], confidence: 0.9 }));
  };
  add(COMPONENT.net, net);
  add(COMPONENT.tax, tax);
  add(COMPONENT.rounding, rounding);
  add(COMPONENT.serviceCharge, serviceCharge);
  add(COMPONENT.discount, discount);
  add(COMPONENT.delivery, delivery);
  return f;
}

// ---------------------------------------------------------------------------
// X4 — the dark guard, read off the LIVE catalog
// ---------------------------------------------------------------------------

/** Is the OCR-sales anchor lane held shut by the extraction-slice DARK GUARD?
 *
 *  0022 adds a leading `if true` disjunct to the executor's multi-anchor block so
 *  `anchor_missing` keeps firing for EVERY ocr_sales draft until X5 (corroboration by
 *  two-reader agreement) removes it deliberately. Contract §2 X4 / gate XG5: emitting the
 *  net + tax facts (X2) would otherwise switch a LIVE posting barrier off as a side effect,
 *  which is the ground on which the naive Gate-P build was refused
 *  (docs/plan/research/wave-b/gate-p-build-refused-2026-07-27.md, FATAL 2).
 *
 *  Derived from the live catalog rather than from a migration number ON PURPOSE: the day X5
 *  deletes that disjunct, every cell that consults this flips back to asserting the post
 *  with NO test edit. A hard-coded expectation would have to be re-litigated at exactly the
 *  moment the pressure is to make the test agree with whatever shipped.
 *
 *  NOT OBVIOUS, SO STATED: the anchor block sits BEFORE controls (d) `customer_unresolved`
 *  and (e2) `floor_lost`. While the guard is armed those two skips are SHADOWED — still
 *  present, still re-derived, but unreachable THROUGH THE EXECUTOR, because the anchor block
 *  returns first. Cells naming them assert the shadowing explicitly rather than pretending
 *  the control was exercised. */
export async function ocrAnchorDarkGuard() {
  return (await fnSource("execute_rule_post")).includes("X4 DARK GUARD");
}
