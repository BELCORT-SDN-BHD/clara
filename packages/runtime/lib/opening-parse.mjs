// Opening-targets parse lane (Wave B, R2 · plan §3.3 / F12). A bookkeeper+-floored
// runtime route reads the CANONICAL extraction surface for an opening seed's TIE
// document (document_extractions + document_regions — 0007/0017) and turns the
// anchored `opening_tb.line` regions into document-primary opening targets via the
// audited `clara.record_opening_targets_parsed` writer. DETERMINISTIC: labels+amounts
// are re-derived from the SAME grammar the DB stores against — NO model, NO egress.
//
// Feasibility gate (F12): if the authoritative extraction has no `opening_tb.line`
// region that parses, the route returns 422 {status:'unparseable', reason} — the
// keyed-fallback signal D3 surfaces (Gate K rides ATTRIBUTED KEYED this wave). The
// DB independently re-derives + re-validates every triple, so a parse that the DB
// would reject can never author a target.
//
// STRICT PARSE HONESTY (F-H5): the parse is all-or-nothing. If ANY nonblank
// `opening_tb.line` region fails the grammar, the WHOLE parse returns 422 naming the
// failing regions (count + first few ids) — NEVER a partial target set from the
// survivors. A blank/whitespace region is not an authoritative row (skipped silently);
// zero parseable rows stays 422 as before.
//
// Reads run as clara_runtime (SELECT + `using(true)` RLS on opening_seed_registry,
// document_extractions, document_regions — 0008/0017); the writer is clara_runtime
// EXECUTE-granted. No `clara.documents` read is needed here — the writer re-reads and
// re-validates the tie document (filing, kind, sha, authoritative extraction) itself.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The canonical opening trial-balance line grammar. Byte-for-byte the DB's evidence
// pattern (clara._derive_opening_region_fact, 0017): <account> <label> RM <comma-
// grouped amount>.<sen> <DR|CR>. `[[:space:]]` → \s; the label is captured
// non-greedily so it does not swallow the RM anchor.
export const OPENING_TB_LINE_RE =
  /^([0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4})\s+(.+?)\s+RM\s+([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)\.([0-9]{2})\s+(DR|CR)$/;

/**
 * Derive the canonical {accountCode, label, amountCents, side} from one region's
 * text_content, or null when the text is not a TB line under the grammar. Pure —
 * the DB re-derives the identical triple and rejects any disagreement.
 * @param {unknown} text
 * @returns {{accountCode:string,label:string,amountCents:number,side:'debit'|'credit'}|null}
 */
export function parseOpeningTbLine(text) {
  if (typeof text !== "string") return null;
  const m = OPENING_TB_LINE_RE.exec(text);
  if (!m) return null;
  const ringgit = Number(m[3].replace(/,/g, ""));
  const sen = Number(m[4]);
  if (!Number.isSafeInteger(ringgit) || !Number.isSafeInteger(sen)) return null;
  const amountCents = ringgit * 100 + sen;
  if (amountCents <= 0) return null;
  const side = m[5] === "DR" ? "debit" : "credit";
  const label = m[2].trim() || m[1];
  return { accountCode: m[1], label, amountCents, side };
}

/**
 * Map authoritative `opening_tb.line` region rows to the p_lines array
 * `record_opening_targets_parsed` accepts. Each region contributes at most one line
 * (keyed by region id, so re-parse is stable). A blank/whitespace region is not an
 * authoritative row and is skipped silently; a NONBLANK region that fails the grammar
 * is a `failure` (never fabricated, never silently dropped) — the caller turns a
 * non-empty `failures` list into an honest 422 (F-H5). Pure.
 * @param {ReadonlyArray<{region_id:string,extraction_id:string,text_content:unknown}>} rows
 * @returns {{lines:Array<object>, parsedCount:number, failures:Array<{region_id:string,text:string}>}}
 */
export function mapRegionsToLines(rows) {
  const lines = [];
  const failures = [];
  for (const row of rows ?? []) {
    const raw = typeof row.text_content === "string" ? row.text_content : "";
    if (raw.trim() === "") continue; // a blank region is not an authoritative source row
    const fact = parseOpeningTbLine(row.text_content);
    if (!fact) {
      failures.push({ region_id: row.region_id, text: raw });
      continue;
    }
    lines.push({
      line_key: `r:${row.region_id}`,
      account_code: fact.accountCode,
      source_label: fact.label,
      debit_cents: fact.side === "debit" ? fact.amountCents : 0,
      credit_cents: fact.side === "credit" ? fact.amountCents : 0,
      extraction_ref: { extraction_id: row.extraction_id, region_id: row.region_id },
    });
  }
  return { lines, parsedCount: lines.length, failures };
}

/** Honest "N rows did not parse: id, id, ..." reason naming the failing identifiers
 *  (count + first few) — never a partial target set (F-H5). */
export function namedUnparseableReason(kind, identifiers) {
  const shown = identifiers.slice(0, 5);
  const suffix = identifiers.length > shown.length ? `, +${identifiers.length - shown.length} more` : "";
  return `${identifiers.length} ${kind} did not parse: ${shown.join(", ")}${suffix}`;
}

/** The stable, replay-safe op_key for a parse of one seed's tie document (plan §3.3). */
export function openingOpKey(seedId, documentId) {
  return `openingparse:${seedId}:${documentId}`;
}

// --- DB reads (clara_runtime) ------------------------------------------------------

const SELECT_OPENING_SEED_SQL =
  `select id, firm_id, client_id, plan_id, state, tie_document_id, tie_document_sha256
     from clara.opening_seed_registry where id = $1`;

// NEWEST PRODUCER, NEVER `superseded_by is null` (PR #154, the C-b acceptance lesson —
// the third sighting of this bug class after statement reader-1 and readPriorGlCells):
// the 0017 authority trigger supersedes KIND-BLIND, so a later doc_classify verdict
// "supersedes" the extraction that actually holds these typed regions and the bare filter
// returns zero rows for every classified document. The selector here is the typed regions
// themselves: the newest done extraction that CARRIES `opening_tb.line` rows wins, so a
// re-run of the producer replaces an older run and no verdict of another kind can starve
// it. Firm-scoped defense-in-depth on top of the permissive runtime RLS. `documents` is
// deliberately NOT joined (no runtime grant); the writer re-binds the tie document itself.
const SELECT_TIE_REGIONS_SQL =
  `with newest as (
     select de.id, de.firm_id
       from clara.document_extractions de
      where de.document_id = $1 and de.firm_id = $2 and de.status = 'done'
        and exists (
          select 1 from clara.document_regions dr
           where dr.extraction_id = de.id and dr.firm_id = de.firm_id
             and dr.field_path = 'opening_tb.line')
      order by de.extracted_at desc, de.version_n desc, de.id desc
      limit 1)
   select dr.id as region_id, de.id as extraction_id, dr.text_content
     from newest de
     join clara.document_regions dr
       on dr.extraction_id = de.id and dr.firm_id = de.firm_id
    where dr.field_path = 'opening_tb.line'
    order by dr.id`;

/** Load an opening seed by id (null when absent). */
export async function readOpeningSeed(client, seedId) {
  const r = await client.query(SELECT_OPENING_SEED_SQL, [seedId]);
  return r.rows[0] ?? null;
}

/** Read the authoritative tie-document TB-line regions (firm-scoped). */
export async function readTieRegions(client, { documentId, firmId }) {
  const r = await client.query(SELECT_TIE_REGIONS_SQL, [documentId, firmId]);
  return r.rows;
}

// --- typed error mapping -----------------------------------------------------------

/** True iff a thrown error is a typed clara refusal (CLR##). */
export function isClaraError(err) {
  return typeof err?.code === "string" && /^CLR\d{2}$/.test(err.code);
}
function claraReason(err) {
  try {
    return JSON.parse(err?.detail || "{}").reason ?? null;
  } catch {
    return null;
  }
}

/**
 * Map a `record_opening_targets_parsed` refusal to an HTTP shape. CLR11 (seed/client
 * gone) collapses to an indistinguishable 404; a registry-not-open refusal is 409; a
 * malformed-lines refusal is 422 (the surface could not yield valid targets); every
 * other CLR31/CLR02/CLR28 is a typed 409 refusal. Anything else re-throws.
 */
export function mapOpeningDbError(err) {
  if (!isClaraError(err)) return null;
  const reason = claraReason(err);
  if (err.code === "CLR11") return { http: 404, body: { error: "not_found", message: "not found" } };
  if (err.code === "CLR10") {
    return { http: 422, body: { status: "unparseable", reason: reason ?? "malformed_lines" } };
  }
  if (err.code === "CLR31" && reason === "registry_not_open") {
    return { http: 409, body: { status: "conflict", reason: "registry_not_open" } };
  }
  // CLR31 (tie_mismatch / extraction faults), CLR02 (tie unfiled), CLR28 (consent).
  return { http: 409, body: { status: "refused", code: err.code, reason: reason ?? null } };
}

// --- the route core (clara_runtime) ------------------------------------------------

/**
 * Parse an opening seed's tie document and record document-primary targets. Returns a
 * typed `{ http, body }` for the caller to serialize; never throws for an expected
 * refusal (only a genuine DB/infra fault, or a revoked-membership AuthError from
 * `reassert`, propagates). Runs on a clara_runtime client after the route has authorized
 * a bookkeeper+ of `firmId`.
 *
 * `reassert` (optional): an async guard the route supplies — re-resolves the LIVE caller
 * on THIS same connection and throws an AuthError 403 if the bookkeeper+ floor / firm
 * binding no longer holds. It runs IMMEDIATELY before the audited write so a revocation
 * during the (deterministic) parse window cannot outlive the authz (F-H7).
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{seedId:string, firmId:string, reassert?:() => Promise<void>}} args
 * @returns {Promise<{http:number, body:object}>}
 */
export async function parseOpeningTargets(client, { seedId, firmId, reassert }) {
  if (typeof seedId !== "string" || !UUID_RE.test(seedId)) {
    return { http: 404, body: { error: "not_found", message: "not found" } };
  }
  const seed = await readOpeningSeed(client, seedId);
  // Indistinguishable not-found: a foreign-firm seed and a missing seed look identical.
  if (!seed || seed.firm_id !== firmId) {
    return { http: 404, body: { error: "not_found", message: "not found" } };
  }
  if (seed.state !== "open") {
    return { http: 409, body: { status: "conflict", reason: "registry_not_open" } };
  }
  if (!seed.tie_document_id) {
    return { http: 422, body: { status: "unparseable", reason: "no_tie_document" } };
  }

  const regions = await readTieRegions(client, { documentId: seed.tie_document_id, firmId });
  const { lines, failures } = mapRegionsToLines(regions);
  if (failures.length > 0) {
    // STRICT (F-H5): any nonblank region that fails the grammar fails the WHOLE parse —
    // never author a partial target set. Name the failing regions.
    return {
      http: 422,
      body: {
        status: "unparseable",
        reason: namedUnparseableReason("opening_tb.line region(s)", failures.map((f) => f.region_id)),
      },
    };
  }
  if (lines.length === 0) {
    // The keyed-fallback signal (WB-R15): the surface yielded no parseable TB line.
    return { http: 422, body: { status: "unparseable", reason: "no_opening_tb_lines" } };
  }

  // Re-check the caller's authority on THIS connection right before the audited write —
  // the parse window must not outlive the authz (F-H7). A revoked member throws 403.
  if (reassert) await reassert();

  const opKey = openingOpKey(seed.id, seed.tie_document_id);
  try {
    const r = await client.query(
      "select clara.record_opening_targets_parsed($1, $2::jsonb, $3, $4) as r",
      [seed.id, JSON.stringify(lines), seed.tie_document_id, opKey],
    );
    const recorded = Number(r.rows[0]?.r?.targets_recorded ?? lines.length);
    return { http: 202, body: { status: "parsed", lines: recorded } };
  } catch (err) {
    const mapped = mapOpeningDbError(err);
    if (mapped) return mapped;
    throw err;
  }
}
