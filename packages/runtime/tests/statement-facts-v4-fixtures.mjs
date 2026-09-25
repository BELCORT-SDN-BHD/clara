// #1037 — live-rig fixtures for the statementFacts_v4 citation battery (NOT a test file: the
// name has no `.test.` segment, so `node --test` ignores it).
//
// Everything here is built through the estate's OWN doors wherever a door exists — the COA
// upsert, `add_bank_account`, the typed consent grant + activation — and by direct insert only
// where the db-side statement fixtures already do the same and for the same reason: nothing on
// this frontier mints a `statement_facts` task from a raw filing, and `clara.document_extractions`
// is append-only, so the substrate a witness read needs has to be seeded rather than produced.
//
// The SHAPE of this file is `f-a1-witness-fixtures.mjs`'s, reapplied to the statement lane. It
// deliberately does NOT import `packages/db/tests/*`: those helpers run on packages/db's own pool
// and helper stack, and reaching across the package boundary for them would put two pools on one
// rig database in one process.

import { randomUUID } from "node:crypto";

import * as fx from "./relay-fixtures.mjs";

/** The seeded reference institution every other bank battery uses (0038's roster). */
export const BANK_CODE = "MBB";
/** The typed governed-egress purpose the statement witness pair dispatches under. */
export const WITNESS_PURPOSE = "witness_extraction";

const digitsOnly = (s) => String(s).replace(/[^0-9]/g, "");

/** A named-argument call, so an argument-order mistake is impossible to make silently. */
function namedCall(fn, names) {
  return `select clara.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as result`;
}

let coaSeq = 0;
/** A fresh asset COA code — `add_bank_account`'s congruence wants one live bank account per COA
 *  code, so every registration gets its own. `ck_coa_account_code_0009` is
 *  `^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$`, hence exactly three digits before the hyphen. */
export async function freshCoa(sub, client) {
  coaSeq += 1;
  const code = `8${String(coaSeq % 100).padStart(2, "0")}-S4`;
  await fx.humanQuery(
    sub,
    namedCall("upsert_account", ["p_client", "p_code", "p_name", "p_type", "p_op_key"]),
    [client, code, `v4 citation bank gl ${coaSeq}`, "asset", fx.opk(`s4-coa-${coaSeq}`)],
  );
  return code;
}

export function freshAcctNumber() {
  const n = randomUUID().replace(/[^0-9]/g, "").padEnd(12, "1").slice(0, 10);
  const printed = `114-5-${n.slice(0, 5)}-${n.slice(5, 7)}`;
  return { printed, digits: digitsOnly(printed) };
}

/** Register a LIVE bank account for `client` on the seeded MBB institution. Returns the
 *  digits-only identity the witness header binds on. */
export async function registerAccount(sub, client) {
  const coa = await freshCoa(sub, client);
  const acct = freshAcctNumber();
  const r = await fx.humanQuery(
    sub,
    namedCall("add_bank_account", ["p_client", "p_bank_code", "p_account_number", "p_coa_account_code", "p_op_key"]),
    [client, BANK_CODE, acct.printed, coa, fx.opk("s4-bankacct")],
  );
  const receipt = r.rows[0].result ?? {};
  return { bankAccountId: receipt.bank_account_id ?? receipt.id ?? null, coa, ...acct };
}

/** A live-shaped `clara.documents` row. `storage_path` must satisfy
 *  `ck_documents_storage_path_v2` (`^firms/<firm>/docs/<sha>.<ext>$`), so it is built from the
 *  sha rather than invented. */
export async function seedDocument({ firm, kind = "bank_statement", mime = "application/pdf", pageCount = 2, sha256 = null }) {
  // #1037 AC3 — a caller that will SERVE the canonical bytes (a World leg's vision channel reads
  // them through `downloadCanonical`, which verifies the digest) hands in the sha of the bytes it
  // is going to serve. Every other caller keeps the random one: nothing reads those bytes.
  const sha = sha256 ?? fx.sha(`stmt-v4-${randomUUID()}`);
  const ext = mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "bin");
  const r = await fx.rootQuery(
    `insert into clara.documents
       (firm_id, sha256, original_filename, mime_type, byte_size, storage_path, status,
        bytes_verified_at, page_count, document_kind)
     values ($1,$2,$3,$4,$5,$6,'ingested', now(), $7, $8) returning id`,
    [firm, sha, `statement.${ext}`, mime, 4096, `firms/${firm}/docs/${sha}.${ext}`, pageCount, kind],
  );
  return { documentId: r.rows[0].id, sha256: sha, mime, storagePath: `firms/${firm}/docs/${sha}.${ext}`, pageCount };
}

/** File the document to ONE client (basis 'legacy-0007' — the only basis that takes a null
 *  resolution, per `ck_document_filings_resolution`). */
export async function fileTo({ firm, documentId, client }) {
  const r = await fx.rootQuery(
    `insert into clara.document_filings (firm_id, document_id, client_id, basis)
     values ($1,$2,$3,'legacy-0007') returning id`,
    [firm, documentId, client],
  );
  return r.rows[0].id;
}

/** The intake OCR pass the TEXT channel reads. The same substrate the invoice witness reads —
 *  this lane never mints a statement-specific extraction of its own. */
export async function seedOcrExtraction({ firm, documentId, pageCount = 2, versionN = 1 }) {
  const r = await fx.rootQuery(
    `insert into clara.document_extractions
       (firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
     values ($1,$2,'azure-di:prebuilt-layout:2024-11-30','ocr',$3,'done',$4,'{}'::jsonb)
     returning id`,
    [firm, documentId, versionN, pageCount],
  );
  return r.rows[0].id;
}

/** One `clara.document_regions` row. The LOCATOR is the whole point of this battery: it is what
 *  `clara.witness_citation_regions` publishes a page from, and what a v4 citation stores. */
export async function seedOcrRegion({ firm, extraction, fieldPath, textContent, locator }) {
  const r = await fx.rootQuery(
    `insert into clara.document_regions
       (firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
     values ($1,$2,'page_polygon',$3::jsonb,$4,$5,0.97) returning id`,
    [firm, extraction, JSON.stringify(locator), fieldPath, textContent],
  );
  return r.rows[0].id;
}

/** A CLAIMED (`running`) `statement_facts` task PLUS its processing-call reservation, which
 *  `_settle_processing_call` requires unconditionally in v2. Direct-inserted for the reason the
 *  db-side fixture names: nothing mints one from a raw `document_filings` insert. */
export async function runningStatementTask({ firm, documentId, engineId, versionN = 1, pagesReserved = 5, status = "running" }) {
  // #1037 AC3 — `status: "queued"` is the shape a WORLD leg needs and the unit batteries do not:
  // a task the reconciler may still discover, bound to NO workflow run, so the engine itself
  // mints the run and the body under test is the one the image pins. 'running' with a synthetic
  // run token stays the default, because every unit cell above drives the frozen behaviour
  // directly and would otherwise have its task claimed out from under it.
  const queued = status === "queued";
  const r = await fx.rootQuery(
    `insert into clara.document_processing_tasks
       (firm_id, document_id, engine_id, version_n, lane, status, workflow_run_id, started_at)
     values ($1,$2,$3,$4,'statement_facts',$6,$5, case when $6 = 'running' then now() else null end) returning id`,
    [firm, documentId, engineId, versionN, queued ? null : `rig-stmt-v4-${randomUUID().slice(0, 8)}`, status],
  );
  const taskId = r.rows[0].id;
  await fx.rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values($1,$2,'reserved',$3) on conflict do nothing`,
    [firm, taskId, pagesReserved],
  );
  return { taskId, engineId, versionN };
}

/** A live typed `witness_extraction` consent + activation through the AUDITED owner verbs. The
 *  evidence document is a verified consent-evidence artifact, which `grant_client_egress_purpose`
 *  refuses to proceed without. */
export async function liveWitnessConsent(ownerSub, { firm, client }) {
  const evidence = await seedDocument({ firm, kind: "consent_evidence", pageCount: 1 });
  const granted = await fx.humanQuery(
    ownerSub,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_evidence_document => $3, p_scope_note => $4, p_op_key => $5) as r`,
    [client, WITNESS_PURPOSE, evidence.documentId, "runtime rig statement witness consent", fx.opk("gwc")],
  );
  const consentId = granted.rows[0].r.consent_id;
  await fx.humanQuery(
    ownerSub,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_consent => $3, p_op_key => $4) as r`,
    [client, WITNESS_PURPOSE, consentId, fx.opk("awa")],
  );
  return { evidence, consentId };
}

/**
 * THE WORKED EXAMPLE, written out rather than computed: a three-row June 2026 statement on an
 * opening balance of RM1,000.00.
 *
 *   opening                       100000
 *   02/06  transfer in    +50000  150000
 *   03/06  cheque out     -20000  130000
 *   04/06  deposit        +30000  160000
 *   printed total debit  20000 · printed total credit 80000 · printed closing 160000
 *
 * Every figure above is arithmetic a reader can check by hand, which is the point: the chain the
 * DB walks must be verified against a source independent of any code in this repository.
 */
export const WORKED_STATEMENT = Object.freeze({
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  openingCents: 100000,
  closingCents: 160000,
  totalDebitCents: 20000,
  totalCreditCents: 80000,
  lines: Object.freeze([
    Object.freeze({ entry_date: "2026-06-02", value_date: null, description: "TRANSFER IN", amount_cents: 50000, running_balance_cents: 150000 }),
    Object.freeze({ entry_date: "2026-06-03", value_date: null, description: "CHEQUE 004411", amount_cents: -20000, running_balance_cents: 130000 }),
    Object.freeze({ entry_date: "2026-06-04", value_date: null, description: "CASH DEPOSIT", amount_cents: 30000, running_balance_cents: 160000 }),
  ]),
});

/** The wire header both channels answer for the worked example. Every key is one
 *  `clara._stmt_header_norm` reads. */
export function workedHeader(accountDigits) {
  return {
    institution_code: BANK_CODE,
    account_number: accountDigits,
    currency: "MYR",
    period_start: WORKED_STATEMENT.periodStart,
    period_end: WORKED_STATEMENT.periodEnd,
    statement_date: WORKED_STATEMENT.periodEnd,
    opening_cents: WORKED_STATEMENT.openingCents,
    closing_cents: WORKED_STATEMENT.closingCents,
    opening_label: "BEGINNING BALANCE",
    closing_label: "ENDING BALANCE",
    total_debit_cents: WORKED_STATEMENT.totalDebitCents,
    total_credit_cents: WORKED_STATEMENT.totalCreditCents,
  };
}

/**
 * The whole situation in one call: firm, client, a registered MBB account, a filed bank statement,
 * an OCR extraction with one `clara.document_regions` row per printed transaction row (each on its
 * own page, so a citation's page is distinguishable per line), a running `statement_facts` task
 * stamped with `engineId`, and a live typed consent.
 *
 * The published numbering is READ BACK rather than assumed: `clara.witness_citation_regions`
 * numbers by `row_number() over (order by id)` over UUIDs, so it is effectively random with
 * respect to insertion order — which is exactly what makes a cell that resolves an idx meaningful
 * instead of tautological.
 */
export async function buildStatementSituation(label, { engineId, pageCount = 3, taskStatus = "running", sha256 = null } = {}) {
  const { owner, firm, client } = await fx.buildFirm(label);
  const account = await registerAccount(owner, client);
  const doc = await seedDocument({ firm, pageCount, sha256 });
  await fileTo({ firm, documentId: doc.documentId, client });
  const ocrId = await seedOcrExtraction({ firm, documentId: doc.documentId, pageCount });
  const regionIds = [];
  for (const [i, line] of WORKED_STATEMENT.lines.entries()) {
    regionIds.push(await seedOcrRegion({
      firm,
      extraction: ocrId,
      fieldPath: `pages.1.lines.${i}`,
      textContent: `${line.entry_date} ${line.description} ${(line.amount_cents / 100).toFixed(2)}`,
      // ONE PAGE PER ROW, and the page rides inside the locator — which is where
      // `clara.witness_citation_regions` reads it from (`locator->>'page'`).
      locator: { page: i + 1, polygon: [0.1, 0.2 + i * 0.1, 0.9, 0.2 + i * 0.1, 0.9, 0.26 + i * 0.1, 0.1, 0.26 + i * 0.1] },
    }));
  }
  const numbered = (await fx.rootQuery(
    "select idx, region_id, page from clara.witness_citation_regions($1) order by idx", [ocrId])).rows;
  const task = await runningStatementTask({ firm, documentId: doc.documentId, engineId, status: taskStatus });
  const consent = await liveWitnessConsent(owner, { firm, client });
  return {
    owner, firm, client, account, ocrId, regionIds, numbered, consent,
    documentId: doc.documentId, sha256: doc.sha256, storagePath: doc.storagePath,
    taskId: task.taskId, engineId: task.engineId, versionN: task.versionN,
    /** The claim-receipt-shaped `doc` the frozen behaviour consumes. */
    claimDoc: {
      document_id: doc.documentId, firm_id: firm, lane: "statement_facts",
      storage_path: doc.storagePath, sha256: doc.sha256, mime_type: doc.mime, byte_size: 4096,
    },
    /** idx published for the region seeded for printed row `i` (0-based). */
    idxForLine(i) {
      const row = numbered.find((n) => n.region_id === regionIds[i]);
      if (!row) throw new Error(`no published idx for seeded region ${i}`);
      return Number(row.idx);
    },
  };
}

/** The injected services bundle: the REAL engine snapshot, a scripted model, a storage stub.
 *  `answer` is called with the channel and must return the object the provider would have. */
export function statementServices({ engineId, answer, calls }) {
  return {
    engineSnapshot: { engineId },
    async callStatementWitnessModel(call) {
      calls.push(call);
      return { object: answer(call), usage: { input_tokens: 128, output_tokens: 64 } };
    },
    statementWitnessMediaType: () => "application/pdf",
    taskTempPath: (taskId) => `/tmp/clara-stmt-v4-${taskId}`,
    removeTempFile: async () => {},
    // Storage is not the subject here and this rig has no object store: the download is stubbed,
    // exactly as the vision channel's own pre-egress guards are the thing under test elsewhere.
    downloadCanonical: async () => {},
    log: () => {},
  };
}

/** Root reads for assertions (bypass RLS so a cell sees every firm). */
export const readStatementLines = (statementId) => fx.rootQuery(
  `select line_no, entry_date, amount_cents, running_balance_cents,
          citation_extraction_id, citation_page, citation_region
     from clara.bank_statement_lines where statement_id=$1 order by line_no`,
  [statementId],
).then((r) => r.rows);

export const readRegionLocator = (regionId) => fx.rootQuery(
  "select locator from clara.document_regions where id=$1", [regionId],
).then((r) => r.rows[0]?.locator ?? null);

export const readTask = (id) => fx.rootQuery(
  "select status, error_code from clara.document_processing_tasks where id=$1", [id],
).then((r) => r.rows[0] ?? null);
