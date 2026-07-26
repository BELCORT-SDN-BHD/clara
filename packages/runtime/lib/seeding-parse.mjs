// Prior-GL seeding-prepare lane (Wave B, R2 · plan §3.4 / F13). An ADMIN-floored runtime
// route turns a stamped prior_gl (or management_account) document into typed S1 seeding
// proposals with evidence (occurrence counts, date spans, line cites) → the audited
// `clara.create_seeding_batch` writer. DETERMINISTIC: NO model, NO egress. Two sources in
// order: (a) EXTRACTION FACTS — authoritative `prior_gl.line` regions vs the fixed grammar
// `<date> <counterparty> <account> RM <amount> <DR|CR>`; (b) XLSX bytes — a self-contained
// ZIP+XML reader (node:zlib + fast-xml-parser, no external lib) over the first worksheet.
//
// XLSX-ness is decided BY BYTES (F-M13): the source is fetched (bounded by
// MAX_XLSX_SOURCE_BYTES) and sniffed for the ZIP magic (PK\x03\x04) + the OOXML
// `[Content_Types].xml` entry — mime/filename are only hints. STRICT PARSE HONESTY (F-H5):
// all-or-nothing — any NONBLANK row that fails (a prior_gl.line region; an xlsx data row
// under the header) 422s the WHOLE parse naming the failing rows, never a partial batch
// (blank rows skipped). LINE-CITE UNION (F-M14): each `evidence.line_cites[]` is
// `{row:number,text:string}` (an xlsx PHYSICAL worksheet row — the <row r> attribute,
// sparse-aware, NOT the array index) OR `{region_id:string,text:string}` (an extraction
// anchor); the dashboard binds it, wiki_projection cites it (no anchor ⇒ refused, not faked).
// The DB owns the hard rules: control accounts refused at parse; a duplicate open batch
// trips the (client, sha) unique → 409 {existing:true, batchId}. Never fabricates.

// The self-contained ZIP/XLSX reader lives in its own deep module (kept seeding-parse
// under the line ceiling); re-exported so callers/tests keep one import surface.
import { UnparseableError, colIndex, readXlsxSheet, looksLikeXlsx } from "./xlsx-reader.mjs";
export { UnparseableError, colIndex, readXlsxSheet, looksLikeXlsx };
// Source (c): the OCR table-cell reader for a PRINTED ledger (see prior-gl-cells.mjs).
import { cellsToEntries } from "./prior-gl-cells.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_RE = "[0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4}";
const MAX_XLSX_SOURCE_BYTES = 8 * 1024 * 1024; // raw source cap before we download+sniff (F-M13)

// The prior-GL line grammar for the extraction-facts path. Non-greedy counterparty so
// it does not swallow the strict account token that anchors the amount.
export const PRIOR_GL_LINE_RE = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2})\\s+(.+?)\\s+(${ACCOUNT_RE})\\s+RM\\s+([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)\\.([0-9]{2})\\s+(DR|CR)$`,
);

/** lower + strip non-alphanumerics — matches the DB's counterparty name_normalized. */
export function normalizeName(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The stable, replay-safe op_key for one prepare of a source document (plan §3.4). */
export function seedingOpKey(clientId, sha) {
  return `seedprep:${clientId}:${sha}`;
}

/** Parse one `prior_gl.line` region text into a normalized GL entry, or null. Pure. */
export function parsePriorGlLine(text) {
  if (typeof text !== "string") return null;
  const m = PRIOR_GL_LINE_RE.exec(text);
  if (!m) return null;
  const ringgit = Number(m[4].replace(/,/g, ""));
  const sen = Number(m[5]);
  if (!Number.isSafeInteger(ringgit) || !Number.isSafeInteger(sen)) return null;
  const amountCents = ringgit * 100 + sen;
  const counterparty = m[2].trim();
  if (!counterparty || amountCents <= 0) return null;
  return { date: m[1], counterparty, accountCode: m[3], amountCents, side: m[6] === "DR" ? "debit" : "credit" };
}

/** Honest "N rows did not parse: id, id, ..." reason naming the failing identifiers
 *  (count + first few) — never a partial batch (F-H5). */
export function namedUnparseableReason(kind, identifiers) {
  const shown = identifiers.slice(0, 5);
  const suffix = identifiers.length > shown.length ? `, +${identifiers.length - shown.length} more` : "";
  return `${identifiers.length} ${kind} did not parse: ${shown.join(", ")}${suffix}`;
}

// ---------------------------------------------------------------------------
// Rows/regions → normalized entries → typed S1 proposals.
// ---------------------------------------------------------------------------

const HEADER_SYNONYMS = {
  accountCode: ["account_code", "account code", "account", "acct", "account no", "account_no", "gl account", "code"],
  counterparty: ["counterparty", "vendor", "supplier", "customer", "name", "party", "payee", "description"],
  date: ["date", "posting date", "txn date", "transaction date", "doc date"],
  debit: ["debit", "dr", "debit amount"],
  credit: ["credit", "cr", "credit amount"],
  amount: ["amount", "value", "total"],
};

/** Map a header row to column indices; throws when the mandatory pair is absent. */
export function mapHeaderColumns(headerRow) {
  const norm = (headerRow ?? []).map((h) => String(h ?? "").toLowerCase().trim());
  const find = (syns) => {
    for (let i = 0; i < norm.length; i++) if (syns.includes(norm[i])) return i;
    return -1;
  };
  const cols = {};
  for (const [key, syns] of Object.entries(HEADER_SYNONYMS)) cols[key] = find(syns);
  if (cols.accountCode < 0 || cols.counterparty < 0) throw new UnparseableError("unrecognized_columns");
  return cols;
}

const isValidDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** True when every cell of a dense xlsx row is blank — not an authoritative source row. */
function isBlankRow(row) {
  return (row ?? []).every((cell) => String(cell ?? "").trim() === "");
}

/**
 * xlsx rows (header + data) → normalized GL entries. STRICT (F-H5): a NONBLANK data row
 * under the recognized header that does not yield a (counterparty, account) pair fails the
 * WHOLE parse (UnparseableError naming the PHYSICAL rows) — never a partial batch. Blank
 * rows are skipped. Each cite carries the PHYSICAL worksheet row number (F-M14).
 * @param {string[][]} rows
 * @param {number[]} [rowNums]  parallel physical row numbers from readXlsxSheet
 */
export function rowsToEntries(rows, rowNums) {
  if (!Array.isArray(rows) || rows.length < 2) throw new UnparseableError("no_rows");
  const cols = mapHeaderColumns(rows[0]);
  const entries = [];
  const failures = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const physicalRow = Array.isArray(rowNums) && Number.isInteger(rowNums[r]) ? rowNums[r] : r + 1;
    if (isBlankRow(row)) continue; // a blank row is not an authoritative source row
    const counterparty = String(row[cols.counterparty] ?? "").trim();
    const accountRaw = String(row[cols.accountCode] ?? "").trim();
    const account = new RegExp(`^(?:${ACCOUNT_RE})$`).exec(accountRaw)?.[0] ?? null;
    if (!counterparty || !account) { failures.push(physicalRow); continue; }
    const date = cols.date >= 0 && isValidDate(String(row[cols.date] ?? "").trim())
      ? String(row[cols.date]).trim() : null;
    entries.push({ counterparty, accountCode: account, date, cite: { row: physicalRow, text: row.join(" | ") } });
  }
  if (failures.length > 0) throw new UnparseableError(namedUnparseableReason("xlsx data row(s)", failures));
  if (entries.length === 0) throw new UnparseableError("no_rows");
  return entries;
}

/**
 * `prior_gl.line` region rows → normalized GL entries. STRICT (F-H5): a NONBLANK region
 * that fails the grammar fails the WHOLE parse (UnparseableError naming the region ids) —
 * never a partial batch. A blank/whitespace region is not a source row (skipped).
 */
export function regionsToEntries(regions) {
  const entries = [];
  const failures = [];
  for (const region of regions ?? []) {
    const raw = typeof region.text_content === "string" ? region.text_content : "";
    if (raw.trim() === "") continue; // a blank region is not an authoritative source row
    const parsed = parsePriorGlLine(region.text_content);
    if (!parsed) { failures.push(region.region_id); continue; }
    entries.push({ ...parsed, cite: { region_id: region.region_id, text: region.text_content } });
  }
  if (failures.length > 0) throw new UnparseableError(namedUnparseableReason("prior_gl.line region(s)", failures));
  return entries;
}

function dateSpan(dates) {
  const valid = dates.filter(Boolean).sort();
  return valid.length ? { first: valid[0], last: valid[valid.length - 1] } : { first: null, last: null };
}

/** Build a deterministic wiki_fact markdown body from a counterparty's GL activity. */
export function buildWikiFactContent({ name, accounts, occurrences, span }) {
  const acctLine = accounts.length ? accounts.join(", ") : "(none)";
  const spanLine = span.first ? `${span.first} to ${span.last}` : "(no dated lines)";
  return [
    `# Prior-GL activity — ${name}`,
    "",
    "Deterministically derived from the prior general ledger during onboarding seeding.",
    "This note informs professional judgement; it never decides.",
    "",
    `- Occurrences: ${occurrences}`,
    `- Accounts seen: ${acctLine}`,
    `- Date span: ${spanLine}`,
    "",
  ].join("\n");
}

/**
 * Normalized GL entries → typed S1 proposals: a vendor_account_rule per
 * (counterparty, account) pair and a wiki_fact per counterparty (grammar-safe slug).
 * Deterministic ordering (sorted keys) so a replay produces identical proposals.
 * @returns {Array<{proposal_kind:string, proposal_key:string, payload:object, evidence:object}>}
 */
export function entriesToProposals(entries) {
  const byPair = new Map(); // norm account -> {name, account, cites[], dates[]}
  const byCp = new Map(); // norm -> {name, accounts:Set, cites[], dates[]}
  for (const e of entries) {
    const norm = normalizeName(e.counterparty);
    if (!norm) continue;
    const pk = `${norm} ${e.accountCode}`;
    if (!byPair.has(pk)) byPair.set(pk, { norm, name: e.counterparty, account: e.accountCode, cites: [], dates: [] });
    const pair = byPair.get(pk);
    pair.cites.push(e.cite);
    pair.dates.push(e.date ?? null);
    if (!byCp.has(norm)) byCp.set(norm, { name: e.counterparty, accounts: new Set(), cites: [], dates: [] });
    const cp = byCp.get(norm);
    cp.accounts.add(e.accountCode);
    cp.cites.push(e.cite);
    cp.dates.push(e.date ?? null);
  }
  const proposals = [];
  for (const key of [...byPair.keys()].sort()) {
    const p = byPair.get(key);
    proposals.push({
      proposal_kind: "vendor_account_rule",
      proposal_key: `rule:${p.norm}:${p.account}`,
      payload: { name: p.name, account_code: p.account },
      evidence: { occurrence_count: p.cites.length, date_span: dateSpan(p.dates), line_cites: p.cites },
    });
  }
  for (const norm of [...byCp.keys()].sort()) {
    const cp = byCp.get(norm);
    const accounts = [...cp.accounts].sort();
    const span = dateSpan(cp.dates);
    const content = buildWikiFactContent({ name: cp.name, accounts, occurrences: cp.cites.length, span });
    proposals.push({
      proposal_kind: "wiki_fact",
      proposal_key: `wiki:${norm}`,
      payload: {
        wiki: {
          slug: `prior-gl/${norm}`.slice(0, 200),
          title: `Prior-GL activity — ${cp.name}`.slice(0, 200),
          page_kind: "recurring_pattern",
          content,
        },
        counterparty_name: cp.name,
        accounts,
      },
      evidence: { occurrence_count: cp.cites.length, date_span: span, line_cites: cp.cites },
    });
  }
  return proposals;
}

// ---------------------------------------------------------------------------
// DB reads + the route core (clara_runtime).
// ---------------------------------------------------------------------------

const SELECT_PRIOR_GL_REGIONS_SQL =
  `select dr.id as region_id, de.id as extraction_id, dr.text_content
     from clara.document_extractions de
     join clara.document_regions dr
       on dr.extraction_id = de.id and dr.firm_id = de.firm_id
    where de.document_id = $1 and de.firm_id = $2
      and de.status = 'done' and de.superseded_by is null
      and dr.field_path = 'prior_gl.line'
    order by dr.id`;

/** Read the authoritative prior-GL line regions for a document (firm-scoped). */
export async function readPriorGlRegions(client, { documentId, firmId }) {
  const r = await client.query(SELECT_PRIOR_GL_REGIONS_SQL, [documentId, firmId]);
  return r.rows;
}

// Source (c): the OCR/layout TABLE CELLS of a printed ledger.
//
// PICK THE NEWEST LAYOUT EXTRACTION BY ENGINE — do NOT filter on `superseded_by is null`.
// `superseded_by` chains PER DOCUMENT, not per engine: `classify_document` writes its own
// `doc_classify` extraction, which supersedes the `ocr` one that actually holds the layout
// regions. Measured on live: 36 of 38 `ocr` extractions are superseded, so a
// `superseded_by is null` filter silently returns ZERO cells for any classified document —
// i.e. for every document that has reached this lane. That mistake shipped once and was
// caught only by running the real ceremony (a 422 `no_parse_source` on a ledger with 1,907
// perfectly good cells); the pure unit tests could not see it because it lives in a predicate.
// This mirrors the idiom `readExtractionText` (classify.mjs) already uses.
const SELECT_PRIOR_GL_CELLS_SQL =
  `with newest as (
     select e.id, e.firm_id
       from clara.document_extractions e
      where e.document_id = $1 and e.firm_id = $2 and e.status = 'done'
        and e.engine_kind in ('ocr','structured_parse')
      order by e.extracted_at desc, e.version_n desc, e.id desc
      limit 1)
   select dr.id as region_id, dr.text_content, dr.locator
     from newest e
     join clara.document_regions dr
       on dr.extraction_id = e.id and dr.firm_id = e.firm_id
    where dr.field_path like 'tables.%'
    order by dr.id`;

/** Read the layout table cells for a document (firm-scoped). */
export async function readPriorGlCells(client, { documentId, firmId }) {
  const r = await client.query(SELECT_PRIOR_GL_CELLS_SQL, [documentId, firmId]);
  return r.rows;
}

/** Look up the open seeding batch id that owns a (client, sha) — the 409 target. */
export async function findOpenBatch(client, { clientId, sha }) {
  const r = await client.query(
    "select id from clara.seeding_batches where client_id = $1 and source_sha256 = $2 and state = 'open' limit 1",
    [clientId, sha],
  );
  return r.rows[0]?.id ?? null;
}

/** Document metadata via the membership-checked DEFINER (no runtime `documents` grant). */
export async function readDocumentMeta(client, { documentId, sub }) {
  const r = await client.query("select clara.get_document_for_human_read($1::uuid, $2::uuid) as d", [documentId, sub]);
  return (r.rows[0]?.d ?? null);
}

function claraReason(err) {
  try {
    return JSON.parse(err?.detail || "{}").reason ?? null;
  } catch {
    return null;
  }
}
export function isClaraError(err) {
  return typeof err?.code === "string" && /^CLR\d{2}$/.test(err.code);
}

/** Map a create_seeding_batch refusal to an HTTP shape (duplicate handled by caller). */
export function mapSeedingDbError(err) {
  if (!isClaraError(err)) return null;
  const reason = claraReason(err);
  if (err.code === "CLR34" && reason === "not_prior_gl") {
    return { http: 422, body: { status: "unparseable", reason: "not_prior_gl" } };
  }
  if (err.code === "CLR11") return { http: 404, body: { error: "not_found", message: "not found" } };
  if (err.code === "CLR10") return { http: 422, body: { status: "unparseable", reason: reason ?? "malformed" } };
  // CLR02 (not filed/verified), CLR28 (consent evidence), other CLR34.
  return { http: 409, body: { status: "refused", code: err.code, reason: reason ?? null } };
}

/**
 * Prepare a prior-GL seeding batch. Returns a typed `{ http, body }`. Runs on a
 * clara_runtime client after the route authorized an admin of `firmId`. `deps.fetchBytes`
 * is injectable (default: download from Storage) so the xlsx path is unit-testable.
 *
 * `reassert` (optional): an async guard the route supplies — re-resolves the LIVE caller on
 * THIS connection and throws an AuthError 403 if the admin floor / firm binding no longer
 * holds. It runs IMMEDIATELY before create_seeding_batch so the xlsx download/parse window
 * cannot outlive the authz (F-H7).
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{clientId:string, documentId:string, principal:{sub:string, firmId:string}, deps?:object, reassert?:() => Promise<void>}} args
 * @returns {Promise<{http:number, body:object}>}
 */
export async function prepareSeeding(client, { clientId, documentId, principal, deps = {}, reassert }) {
  if (typeof clientId !== "string" || !UUID_RE.test(clientId)
      || typeof documentId !== "string" || !UUID_RE.test(documentId)) {
    return { http: 404, body: { error: "not_found", message: "not found" } };
  }
  // Membership-checked metadata (also masks a foreign-firm document as 404).
  let meta;
  try {
    meta = await readDocumentMeta(client, { documentId, sub: principal.sub });
  } catch (err) {
    if (isClaraError(err) && err.code === "CLR11") return { http: 404, body: { error: "not_found", message: "not found" } };
    throw err;
  }
  if (!meta || !meta.sha256) return { http: 404, body: { error: "not_found", message: "not found" } };

  // Source (a): extraction facts; (c): a PRINTED ledger's table cells; (b): xlsx bytes decided
  // BY BYTES (F-M13). Honest 422 when none applies.
  //
  // (c) IS TRIED BEFORE (b) ON PURPOSE and cannot disturb it: a spreadsheet's structured_parse
  // regions are `sheets.*`, never `tables.*`, so cellsToEntries sees nothing for an xlsx and
  // returns null. It also returns null for any PDF it cannot POSITIVELY identify as a ledger,
  // so a non-ledger source still reaches the byte path and still 422s exactly as before.
  // Trying it first also avoids downloading a large PDF only to discover it is not a workbook.
  let proposals;
  let unattributedRows = 0;
  try {
    const regions = await readPriorGlRegions(client, { documentId, firmId: principal.firmId });
    const cells = regions.length > 0 ? [] : await readPriorGlCells(client, { documentId, firmId: principal.firmId });
    const printed = cells.length > 0 ? cellsToEntries(cells) : null;
    if (regions.length > 0) {
      proposals = entriesToProposals(regionsToEntries(regions));
    } else if (printed && printed.entries.length > 0) {
      unattributedRows = printed.unattributed.length;
      proposals = entriesToProposals(printed.entries);
    } else {
      // No extraction facts: fetch the canonical bytes (bounded by the source cap) and SNIFF
      // for xlsx-ness — mime/filename never gate. A too-large or non-xlsx source is honest 422.
      const size = Number(meta.byte_size);
      if (Number.isFinite(size) && size > MAX_XLSX_SOURCE_BYTES) {
        return { http: 422, body: { status: "unparseable", reason: "no_parse_source" } };
      }
      const fetchBytes = deps.fetchBytes ?? defaultFetchBytes;
      const bytes = await fetchBytes({ storagePath: meta.storage_path, sha256: meta.sha256, sub: principal.sub, documentId });
      if (!looksLikeXlsx(bytes)) {
        return { http: 422, body: { status: "unparseable", reason: "no_parse_source" } };
      }
      const { rows, rowNums } = readXlsxSheet(bytes);
      proposals = entriesToProposals(rowsToEntries(rows, rowNums));
    }
  } catch (err) {
    if (err instanceof UnparseableError) return { http: 422, body: { status: "unparseable", reason: err.reason } };
    throw err;
  }
  if (!proposals || proposals.length === 0) {
    return { http: 422, body: { status: "unparseable", reason: "no_proposals" } };
  }

  // Re-check the caller's authority on THIS connection right before the audited write —
  // the download/parse window must not outlive the authz (F-H7). A revoked member throws 403.
  if (reassert) await reassert();

  const opKey = seedingOpKey(clientId, meta.sha256);
  try {
    const r = await client.query(
      "select clara.create_seeding_batch($1, $2, $3::jsonb, $4) as r",
      [clientId, documentId, JSON.stringify(proposals), opKey],
    );
    const out = r.rows[0]?.r ?? {};
    // F-H9: relay the DB receipt counts VERBATIM (proposal_count already INCLUDES refused).
    return {
      http: 202,
      body: {
        status: "created",
        batchId: out.batch_id,
        proposal_count: out.proposal_count,
        refused_count: out.refused_count,
        // NO SILENT CAPS: dated ledger rows that carry no counterparty (internal journals —
        // payroll accruals, statutory contributions) yield no vendor rule. Reporting the count
        // is what stops a thin batch from reading as a complete one. 0 on every other source.
        unattributed_row_count: unattributedRows,
      },
    };
  } catch (err) {
    if (isClaraError(err) && err.code === "CLR34" && claraReason(err) === "duplicate_batch") {
      const batchId = await findOpenBatch(client, { clientId, sha: meta.sha256 });
      return { http: 409, body: { existing: true, batchId } };
    }
    const mapped = mapSeedingDbError(err);
    if (mapped) return mapped;
    throw err;
  }
}

/** Default byte source: the membership-checked DEFINER read + the custody download. */
async function defaultFetchBytes({ storagePath, sha256 }) {
  const { downloadCanonical } = await import("./storage.mjs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { randomUUID } = await import("node:crypto");
  const { readFile, rm } = await import("node:fs/promises");
  const tmp = join(tmpdir(), `clara-seedsrc-${randomUUID()}`);
  try {
    await downloadCanonical(storagePath, tmp, sha256);
    return await readFile(tmp);
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}
