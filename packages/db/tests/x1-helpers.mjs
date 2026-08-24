// Extraction slice, block X1 (migration 0022) — shared rig helpers (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it). Re-exports the a21 helper
// core so an X1 test file imports ONE leaf, and adds the 0022 verb wrappers plus the two
// fact-shape fixtures the tie cells need.
//
// Authority: docs/plan/completed/extraction-slice-contract.md (v1.0, ADR-047). Kept OUT of
// a21-helpers.mjs deliberately — that module is the contract-blind 0016 lane's core and
// carries a header saying so, and it is already at the repo's 500-line cap.
//
// READINESS: the 0021 discipline, one migration up. Every cell FAILS loudly against a
// 21-migration database rather than skipping. A green X1 battery against a prestate that
// does not have the verbs would prove nothing at all.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, fnSource, firmOf,
  seedCitedDocument, claimTask, persistInvoiceFacts,
  failInvoiceFacts, factField, rm, grantConsent, mintLegacyInvoiceFactsTask,
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

/** F-A1 PR-3: the WITNESS-regime sibling of extractionsOf. Reads engine_kind='llm_text_facts'
 *  -- the CANONICAL, region-bearing, pointer-landing half of the pair (design SS3.1/SS3.3) --
 *  the same way extractionsOf reads invoice_facts alone. The kind-scoped 0017 trigger
 *  supersedes text-by-text, never cross-kind, so this is the chain a witness-regime cell
 *  reads for older/newer/superseded_by exactly as extractionsOf's callers do for the legacy
 *  chain. */
export async function witnessExtractionsOf(document) {
  const r = await rootQuery(
    `select id, version_n, status, superseded_by from clara.document_extractions
      where document_id=$1 and engine_kind='llm_text_facts' order by version_n, id`, [document]);
  return r.rows;
}

/** The router's locked engine literal for the cutover invoice arm, READ FROM ITS OWN CATALOG
 *  BODY rather than re-typed here.
 *
 *  It used to be a hand-typed `:v1` constant. F-A2 opener ② moves it to `:v2` (witnessFacts.v2
 *  is a new frozen prompt closure, so its reads need a distinguishable engine identity), and a
 *  version pinned by hand goes stale the moment that ceremony runs — at which point every cell
 *  reusing it fails as DRIFT rather than as the behaviour it meant to test. What these cells
 *  actually assert is "the task the door minted carries the SAME literal the door mints", and
 *  that is a question only the live body can answer. The shape is still checked, so an
 *  unreadable or off-shape literal is a loud failure and never a silent pass. */
// PRECONDITION, STATED BECAUSE IT IS A FRONTIER QUESTION: this reads the mint arm the PR-3
// CUTOVER installed, so it only answers on a post-cutover database and THROWS otherwise. Every
// caller today is gated on cutover-ness or runs only at the full frontier, and no slice list
// (`packages/db/tests/split-lists/`) names one of them — checked, not assumed. If one is ever
// added to a slice list, gate it on the cutover rather than on 0022/0025: the cells that use
// this constant are post-cutover cells whatever the literal says, and a throw here would red
// that leg with a message about a regex instead of about the frontier — the appliedStem-class
// mistake this file's x42 sibling already paid for once.
export async function witnessEngineId() {
  const r = await rootQuery(
    "select prosrc from pg_proc where oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure");
  const m = /v_lane:='llm_witness'; v_engine:='(llm-openai:[^']+)';/.exec(r.rows[0]?.prosrc ?? "");
  if (!m || !/^llm-openai:gpt-5\.6-terra:v[0-9]+$/.test(m[1])) {
    throw new Error(`F-A1/F-A2: the router's witness engine literal is unreadable or off-shape (${JSON.stringify(m?.[1] ?? null)})`);
  }
  return m[1];
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

// F-A1 PR-3 CUTOVER NOTE (0097_f_a1_cutover.sql): the router's invoice-kind arm now
// mints llm_witness, not invoice_facts, for EVERY invoice-shaped document -- no dual-run
// (design D9). extractedDoc/failedFactsDoc below exist to prove the LEGACY invoice_facts
// regime's WRITE boundary (claim -> persist/fail) still works unchanged for a document that
// already carries a legacy task -- exactly the continuity property f-a1-dispatch.test.mjs's
// own CONTINUITY/CROSS-REGIME cells need (a MULTI-GENERATION legacy document resolving
// through the recut dispatcher). mintLegacyInvoiceFactsTask (s6-fixtures.mjs, riding the
// export * chain here) is the SHARED bypass -- see its own header for the full rationale.

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
  const task = await mintLegacyInvoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, fields ?? [
    factField("invoice.total", rm(cents)),
    factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", `RIG-${randomUUID().slice(0, 8)}`),
    factField("invoice.invoice_date", "2026-06-15", { polygon: [], confidence: 0.9 }),
  ]);
  return cited;
}

// ---------------------------------------------------------------------------
// The extraction-recovery door's readiness gate (migration 0051)
// ---------------------------------------------------------------------------

/** Is the extraction-recovery door live on this database? Returns {ledger, installed}.
 *
 *  KEYED ON THE STABLE SUFFIX, NEVER THE NUMBER. Migration numbers are claimed at MERGE time
 *  (CLAUDE.md's standing law), so a battery pinned to `version ~ '^0051_'` goes quietly
 *  dormant the instant the file is renumbered in a merge train: 0 pass / N skip, exit 0 — a
 *  green run that proved nothing at all. The repo has already paid for this lesson once
 *  (the RC3 note in wave-d-b-asbuilt-part2). The suffix is the part that does not move.
 *
 *  AND IT IS CROSS-CHECKED AGAINST THE CATALOG. "No ledger row" and "no door" are different
 *  facts, and only one of them means dormant. If the door's code is INSTALLED while no ledger
 *  row names it — or a ledger row exists while the code is absent — the database's ledger
 *  disagrees with its own catalog, and a battery that skips there hides precisely the drift
 *  it exists to catch. `requireRecoveryDoor` fails LOUDLY on either half (the fail0022 idiom
 *  one migration up). */
export async function recoveryDoorState() {
  const led = await rootQuery(
    "select count(*)::int n from clara.schema_migrations where version like '%extraction\\_recovery\\_door'");
  let installed = false;
  try {
    installed = (await fnSource("finalize_document_intake")).includes("v_recovery");
  } catch { installed = false; }
  return { ledger: led.rows[0].n > 0, installed };
}

/** true when the door is live, false when genuinely dormant, THROWS on ledger/catalog drift. */
export async function requireRecoveryDoor() {
  const s = await recoveryDoorState();
  if (s.installed && !s.ledger) {
    throw new Error(
      "extraction-recovery door DRIFT: clara.finalize_document_intake carries the door's code but "
      + "clara.schema_migrations has no '%extraction_recovery_door' row. This battery refuses to "
      + "report itself dormant against a database whose ledger disagrees with its catalog — that is "
      + "the exact state a silent skip would hide.");
  }
  if (s.ledger && !s.installed) {
    throw new Error(
      "extraction-recovery door DRIFT: clara.schema_migrations records the migration but "
      + "clara.finalize_document_intake does not carry the door — the recorded apply did not install "
      + "what it claims, or a later recut reverted it.");
  }
  return s.ledger && s.installed;
}

/** Seed a filed, kind-stamped invoice document whose ONLY invoice_facts attempt is
 *  TERMINALLY FAILED — the F6 / LUMINOUS shape, reproduced through the REAL writers
 *  (enqueue -> claim -> fail_invoice_facts), never by hand-writing a task row.
 *
 *  The live exhibit this mirrors, quoted: docs/plan/completed/wave-7a-acceptance-h1.md:542-545 —
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
  // F-A1 PR-3 cutover note: see mintLegacyInvoiceFactsTask's header above extractedDoc --
  // the real enqueue path no longer produces this lane for an invoice-kind document.
  const task = await mintLegacyInvoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await failInvoiceFacts(task.id, reason);
  return { ...cited, taskId: task.id, versionN: task.version_n };
}

/** F-A1 PR-3: the WITNESS-regime sibling of failedFactsDoc. 0051's failed_retry admission
 *  door reads the document's CURRENT v_lane's newest task -- for an invoice-shaped document
 *  that is llm_witness, never invoice_facts, so failedFactsDoc's legacy failure (real as it
 *  is for x51-intake-recovery-style ingest-failure exhibits) no longer sits where this door
 *  looks. This fixture reproduces "a terminally-failed FIRST attempt" on the lane that
 *  actually resolves post-cutover: seed an invoice-kind document WITHOUT granting
 *  witness_extraction consent, so the coding-time backstop's own auto-enqueue (file_document
 *  -> _enqueue_invoice_facts_core) fails immediately at the enqueue-time consent gate
 *  (witness_consent_inactive) -- a genuinely terminal, never-claimed first (and only) attempt,
 *  functionally equivalent to an engine fault for failed_retry's purposes (its own condition
 *  reads `pft.status='failed'`, no reason discriminant). Returns the seedCitedDocument receipt
 *  plus `{ taskId, versionN }` of the failed attempt, matching failedFactsDoc's shape. */
export async function failedWitnessDoc(sub, { client, cents = 90000 } = {}) {
  const firm = await firmOf(client);
  // M-7 (cross-model review): MAKE the failure -- grant a live witness_extraction consent
  // first so the auto-enqueue backstop queues NORMALLY (a consent refusal is a DIFFERENT,
  // already separately-tested wall — see f-a1-cutover.test.mjs's own consent battery — not
  // what this fixture exists to prove), claim the resulting task, then fail it for real
  // through clara.fail_witness_facts, exactly the settle verb a genuine engine failure drives
  // in production. Selected by version_n desc (never bare `order by id`, which is not a
  // version ordering guarantee) so a caller reusing this client across multiple documents
  // always gets ITS document's newest task.
  const { consentEvidenceDoc, grantPurpose, activatePurpose } = await import("./wave-b/wb-0020-helpers.mjs");
  const evidence = await consentEvidenceDoc(sub, { firm });
  const grant = await grantPurpose(sub, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId }).catch(() => null);
  if (grant) await activatePurpose(sub, { client, purpose: "witness_extraction", consent: grant.consent_id });
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents), kind: "invoice" });
  const task = (await rootQuery(
    "select id, version_n from clara.document_processing_tasks where document_id=$1 and lane='llm_witness' order by version_n desc limit 1",
    [cited.documentId])).rows[0];
  assert.ok(task, "mandatory setup: the auto-enqueue backstop opened an llm_witness task");
  await claimTask(task.id, { egressApproved: true });
  await roleQuery(ROLES.runtime, "select clara.fail_witness_facts($1,$2) as r", [task.id, "internal"]);
  const after = (await rootQuery(
    "select status from clara.document_processing_tasks where id=$1", [task.id])).rows[0];
  assert.equal(after.status, "failed", "mandatory setup: failedWitnessDoc actually produced a FAILED task, not an inferred one");
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
  vendorName = null,
}) {
  const f = [
    factField("invoice.total", rm(gross)),
    factField("invoice.currency", currency),
    factField("invoice.invoice_id", invoiceId ?? `RIG-${randomUUID().slice(0, 8)}`),
    factField("invoice.invoice_date", invoiceDate, { polygon: [], confidence: 0.9 }),
  ];
  // F-A2 PR-1 (D11): a SUPPLIER IDENTITY makes the document's direction readable. The draft
  // core's direction-family arm now binds every agent-lane coded draft rather than only the
  // autodraft wake kind, and a page that names nobody has no testable direction — the resolver
  // raises CLR30 and the tri-state answers 'unresolved', which is a refusal. Callers pass the
  // CLIENT's own registered name for a sales document (the resolver's (S) arm) and a third
  // party's for a purchase. It is one stated field, and a real invoice states it.
  if (vendorName) f.push(factField("invoice.vendor_name", vendorName));
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

// X4 — the dark guard helper (ocrAnchorDarkGuard) RETIRED (F-A2 PR-3, Annex B.1/C.15's
// "the two SOFT-failing helpers are deleted"). It read `fnSource("execute_rule_post")` for a
// marker string; with execute_rule_post dropped, fnSource returns "" for the missing function
// and the check would silently stop proving its own claim without going red (the same soft-
// fail shape x37.t's caught()-wrapped ACL probe had, fixed in the same round). Its only two
// callers (a21-adversarial.test.mjs's ADV-3/ADV-5) were already `{skip: ...}`-gated for the
// same retirement, so the fix is deletion, not a positive-absence rewrite: the guard's whole
// subject — the OCR-sales anchor lane inside execute_rule_post — no longer exists to probe.
