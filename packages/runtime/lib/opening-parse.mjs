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

/**
 * #986 — THE OP KEY FOR A REFRESH, AND WHY IT IS A SECOND KEY RATHER THAN A WIDER FIRST ONE.
 *
 * `openingOpKey` is stable per (seed, document) ON PURPOSE: a retried POST of one parse must not
 * double a basis, and #656 pinned that shape. Adding the extraction to IT would have made every
 * re-read a fresh parse — which succeeds and leaves the OLD targets standing beside the new ones,
 * because a second reading mints new region ids and therefore new `line_key`s. So the remedy is a
 * SEPARATE door under a SEPARATE key that carries the reading: a retried refresh of the same
 * reading replays, and a LATER reading is a new act which must retire what the last one left.
 *
 * The literal is mirrored in `packages/db/tests/opening-source-reread.test.mjs` (that package does
 * not depend on this one); both spell it out so a drift here reds there.
 */
export function openingRefreshOpKey(seedId, documentId, extractionId) {
  return `openingreread:${seedId}:${documentId}:${extractionId}`;
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

/**
 * #656 (fix-round, adversarial A1) — THE REFUSAL THE READER MADE, READ BACK.
 *
 * The in-line producer (`lib/opening-tb-produce.mjs`, wired at `egress.mjs`'s OCR pass) is
 * ALL-OR-NOTHING: a trial balance it refuses — it does not balance, or one row is OCR-mangled —
 * emits ZERO `opening_tb.line` regions and states its reason on the extraction ENVELOPE. Without
 * reading that back, a refused read is byte-identical here to a document that is not a trial
 * balance, and this route answers the keyed-fallback signal `no_opening_tb_lines`, which the face
 * renders as an INFORMATION banner offering to key the balances. Over a document whose printed
 * figures the machine has just found internally inconsistent, that is not merely missing
 * information: it invites a person to hand-key an unreliable source.
 *
 * The key is the literal `egress.mjs` writes (`OPENING_TB_REFUSAL_ENVELOPE_KEY` in
 * `opening-tb-produce.mjs`), spelled out here rather than imported on purpose — the door must not
 * gain an import edge into the producer, which would freeze the producer the day a Clara tool
 * imports this door. `tests/opening-tb-produce.test.mjs` pins the two literals equal.
 */
export const OPENING_TB_REFUSAL_ENVELOPE_KEY = "opening_tb_refusal";

/** The longest producer reason this route will quote. Our own runtime writes it, but a reason is
 *  still text landing in a professional's face, and an unbounded one is not. */
const REFUSAL_REASON_MAX = 500;

/** The NEWEST done extraction of this document — the one whose reading governs — and nothing but
 *  its refusal marker. Read only when zero TB lines came back, so the ordinary path costs nothing.
 *  `clara_runtime` holds SELECT on `document_extractions` (0008); the envelope is the same jsonb
 *  `persist_document_extraction` stored verbatim. */
const SELECT_OPENING_REFUSAL_SQL =
  `select de.envelope -> $3 as refusal
     from clara.document_extractions de
    where de.document_id = $1 and de.firm_id = $2 and de.status = 'done'
    order by de.extracted_at desc, de.version_n desc, de.id desc
    limit 1`;

/**
 * The producer's named refusal for this document, or null when it made none. STRUCTURAL: an
 * envelope that does not carry exactly the shape the producer writes is treated as no refusal at
 * all, so a malformed marker degrades to today's answer rather than to a blank banner.
 * @returns {Promise<{reason:string, refusals:Array<object>}|null>}
 */
export async function readOpeningRefusal(client, { documentId, firmId }) {
  const r = await client.query(SELECT_OPENING_REFUSAL_SQL, [documentId, firmId, OPENING_TB_REFUSAL_ENVELOPE_KEY]);
  const marker = r.rows[0]?.refusal ?? null;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  if (marker.status !== "refused") return null;
  const reason = typeof marker.reason === "string" ? marker.reason.trim() : "";
  if (reason === "") return null;
  return {
    reason: reason.slice(0, REFUSAL_REASON_MAX),
    refusals: Array.isArray(marker.refusals) ? marker.refusals : [],
  };
}

// --- typed error mapping -----------------------------------------------------------

/** True iff a thrown error is a typed clara refusal (CLR##). */
export function isClaraError(err) {
  return typeof err?.code === "string" && /^CLR\d{2}$/.test(err.code);
}

/** The account-code grammar `clara.coa_accounts` enforces, mirrored so nothing that fails it can
 *  ever be quoted out of a database error string and into a caller's face. */
const ACCOUNT_CODE_RE = /^(?:[0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4})$/;
/** Postgres' own structured DETAIL for a foreign-key violation. Reading it is reading OUR OWN
 *  database's machine-generated shape, not third-party text — and the one field pulled out is
 *  re-validated against the grammar above before it reaches anybody. */
const FK_DETAIL_RE = /=\((?:[^,]+),\s*([^)]+)\)\s+is not present/;

/**
 * #656 — THE ACCOUNT A PRINTED TRIAL BALANCE NAMES AND THE CHART HAS NOT GOT.
 *
 * MEASURED on the rig (`packages/db/tests/opening-ledger-source.test.mjs`,
 * `p656.tie.unmapped_blocks`): `clara.opening_tb_targets` carries
 * `fk_opening_tb_targets_account (client_id, account_code) -> clara.coa_accounts`, so a parsed
 * target naming an account this client's chart does not carry is refused by the KEY — SQLSTATE
 * 23503, with no CLR code and no `detail.reason`. `mapOpeningDbError` classified only CLR codes,
 * so that refusal fell through `parseOpeningTargets`'s `throw err` and the route answered **500
 * internal**.
 *
 * That is the single likeliest outcome of reading a REAL trial balance: a firm's chart rarely
 * carries every code the client's previous accountant printed. A 500 tells the professional
 * nothing, which is the opposite of this lane's whole value — D13.2: the refusal must NAME every
 * failing row. So it is classified here, as a 422 in the same `unparseable` family as the other
 * honest no-result answers, carrying the account code when the database's own detail states one
 * and it passes the chart's own grammar.
 *
 * The runtime CANNOT pre-flight this: `clara_runtime` holds no SELECT on `clara.coa_accounts`
 * (measured), and adding a granted door for it is out of #656's scope. Classifying the refusal
 * after the fact is therefore the whole of what this lane can honestly do; creating the missing
 * account stays a human act on the Chart of Accounts register.
 */
export function mapOpeningFkError(err) {
  if (err?.code !== "23503" || err?.constraint !== "fk_opening_tb_targets_account") return null;
  const m = FK_DETAIL_RE.exec(String(err.detail ?? ""));
  const code = m && ACCOUNT_CODE_RE.test(m[1].trim()) ? m[1].trim() : null;
  return {
    http: 422,
    body: {
      status: "unparseable",
      reason: code
        ? `account ${code} is printed on this document but is not in this client's chart of accounts`
        : "this document prints an account that is not in this client's chart of accounts",
      unmapped_accounts: code ? [code] : [],
    },
  };
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
    // #656 — THE RE-READ CONFLICT, told honestly instead of as "malformed".
    //
    // MEASURED: this lane's op key is stable per (seed, document) — `openingOpKey`, deliberately,
    // so a retried POST cannot double a basis — while the payload it hashes is keyed by REGION ID
    // (`mapRegionsToLines` mints `line_key: r:<region_id>`). So when the tie document is READ
    // AGAIN, the second parse arrives with the same op key and a different payload, and
    // `clara._reserve_op` (0002) refuses it CLR10 'op_key reused with different args' with NO
    // `detail.reason`. The generic CLR10 arm below then reported that as `malformed_lines`, which
    // is not what happened and sends a professional to look at the document's rows.
    //
    // Classified here as the CONFLICT it is. The narrow discriminator is `_reserve_op`'s own
    // message — a house function of ours, not third-party text — and it is deliberately narrow:
    // every other CLR10 keeps the unparseable answer it always had.
    //
    // #986 CLOSED THE DEAD END THIS ARM USED TO NAME, AND DID NOT TOUCH THE ARM. The refusal is
    // still the right answer — a second reading is not a retry, and the pinned (seed, document)
    // key must keep saying so. What changed is that it is no longer the end of the road:
    // `refreshOpeningTargets` below brings the basis onto the new reading under a key that carries
    // the extraction, retiring the targets the old reading left. A surface that renders this
    // conflict should offer that act by name.
    if (reason === null && /op_key reused with different args/.test(String(err.message ?? ""))) {
      return { http: 409, body: { status: "conflict", reason: "source_reread_since_parse" } };
    }
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
 * The half BOTH doors share: resolve the basis, read the authoritative tie-document reading, and
 * map it to the `p_lines` payload a writer takes. Returns either `{ refusal }` — the typed
 * `{ http, body }` the caller returns verbatim — or `{ seed, lines }` when the reading yielded a
 * whole, parseable target set.
 *
 * EXTRACTED, NOT REWRITTEN (#986). Every branch below is #656's, in #656's order and with #656's
 * words and tokens; the only thing that changed is that a second door now stands on it. The
 * seventeen cells `tests/wave-b-opening-parse.test.mjs` already carried are the proof that
 * nothing moved — they drive `parseOpeningTargets`, which is now this function plus its own write.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{seedId:string, firmId:string}} args
 * @returns {Promise<{refusal:{http:number, body:object}}|{seed:object, lines:Array<object>}>}
 */
async function readOpeningParseSubject(client, { seedId, firmId }) {
  if (typeof seedId !== "string" || !UUID_RE.test(seedId)) {
    return { refusal: { http: 404, body: { error: "not_found", message: "not found" } } };
  }
  const seed = await readOpeningSeed(client, seedId);
  // Indistinguishable not-found: a foreign-firm seed and a missing seed look identical.
  if (!seed || seed.firm_id !== firmId) {
    return { refusal: { http: 404, body: { error: "not_found", message: "not found" } } };
  }
  if (seed.state !== "open") {
    return { refusal: { http: 409, body: { status: "conflict", reason: "registry_not_open" } } };
  }
  if (!seed.tie_document_id) {
    return { refusal: { http: 422, body: { status: "unparseable", reason: "no_tie_document" } } };
  }

  const regions = await readTieRegions(client, { documentId: seed.tie_document_id, firmId });
  const { lines, failures } = mapRegionsToLines(regions);
  if (failures.length > 0) {
    // STRICT (F-H5): any nonblank region that fails the grammar fails the WHOLE parse —
    // never author a partial target set. Name the failing regions.
    return {
      refusal: {
        http: 422,
        body: {
          status: "unparseable",
          reason: namedUnparseableReason("opening_tb.line region(s)", failures.map((f) => f.region_id)),
        },
      },
    };
  }
  if (lines.length === 0) {
    // ZERO LINES HAS TWO MEANINGS AND THEY ARE NOT THE SAME ANSWER (#656 fix-round, A1).
    //   · the reader REFUSED a trial balance it did read (it does not balance; a row is
    //     unparseable) — its reason names what is wrong and the person must go and look at the
    //     document. Answered VERBATIM, in the `unparseable` family but NOT as the keyed-fallback
    //     token, so the face renders it as a warning carrying the reason rather than as an
    //     information banner offering to key the balances.
    //   · the document is not a trial balance this reader knows — the keyed-fallback signal
    //     (WB-R15), unchanged.
    const refused = await readOpeningRefusal(client, { documentId: seed.tie_document_id, firmId });
    if (refused) {
      return {
        refusal: {
          http: 422,
          body: {
            status: "unparseable",
            reason: refused.reason,
            source_refusal: true,
            failing_rows: refused.refusals
              .map((r) => (r && typeof r.row_key === "string" ? r.row_key : null))
              .filter((k) => k !== null),
          },
        },
      };
    }
    return { refusal: { http: 422, body: { status: "unparseable", reason: "no_opening_tb_lines" } } };
  }
  return { seed, lines };
}

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
  const subject = await readOpeningParseSubject(client, { seedId, firmId });
  if (subject.refusal) return subject.refusal;
  const { seed, lines } = subject;

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
    const mapped = mapOpeningDbError(err) ?? mapOpeningFkError(err);
    if (mapped) return mapped;
    throw err;
  }
}

/**
 * #986 — BRING A BASIS ONTO A NEW READING OF ITS OWN TIE DOCUMENT.
 *
 * THE WAY FORWARD FROM `source_reread_since_parse`, and nothing else. `parseOpeningTargets` above
 * still refuses a re-read exactly as it did — the op key is stable per (seed, document) and the
 * payload is keyed by region id, so `_reserve_op` sees the same key with different args — and that
 * refusal is correct: a second reading is not a retry. What #656 had no answer for is what a
 * person does NEXT, because the basis's targets then cite an extraction the document has
 * superseded, and `clara.approve_opening_seed` refuses those too (`extraction_not_accepted`). This
 * door is that answer: it retires the targets standing on the reading the document left and
 * records the new reading's, under a key that carries the new extraction.
 *
 * SAME READ HALF, DIFFERENT WRITE HALF: one reading, whole or not at all, every figure re-derived
 * by the database from its own stored region. It refuses `no_reread_to_refresh` on a basis nobody
 * re-read, so it can never become a second road past the pinned parse key.
 *
 * Contract: 202 `{status:'refreshed', lines, retired}` · 409 `{status:'conflict'|'refused', …}` ·
 * 422 `{status:'unparseable', reason}` · 404 — the parse route's own shapes, with one extra
 * success word, because "I replaced what was there" is not the same news as "I read this".
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{seedId:string, firmId:string, reassert?:() => Promise<void>}} args
 * @returns {Promise<{http:number, body:object}>}
 */
export async function refreshOpeningTargets(client, { seedId, firmId, reassert }) {
  const subject = await readOpeningParseSubject(client, { seedId, firmId });
  if (subject.refusal) return subject.refusal;
  const { seed, lines } = subject;

  // WHICH READING THIS ACT IS ABOUT. `SELECT_TIE_REGIONS_SQL` returns the regions of exactly ONE
  // extraction, so every line carries the same `extraction_id`; it is read off the first rather
  // than re-derived, and the database's own `refresh_extraction_mixed` wall is what refuses a
  // payload that somehow mixed readings. Naming it here is not a second guard — it is how the op
  // key learns which reading it is keyed to.
  const extractionId = lines[0].extraction_ref.extraction_id;

  // F-H7, unchanged: the window between reading the evidence and the audited write must not
  // outlive the authz.
  if (reassert) await reassert();

  const opKey = openingRefreshOpKey(seed.id, seed.tie_document_id, extractionId);
  try {
    const r = await client.query(
      "select clara.refresh_opening_targets_from_reread($1, $2::jsonb, $3, $4, $5) as r",
      [seed.id, JSON.stringify(lines), seed.tie_document_id, extractionId, opKey],
    );
    const receipt = r.rows[0]?.r ?? {};
    return {
      http: 202,
      body: {
        status: "refreshed",
        lines: Number(receipt.targets_recorded ?? lines.length),
        retired: Number(receipt.targets_retired ?? 0),
      },
    };
  } catch (err) {
    const mapped = mapOpeningDbError(err) ?? mapOpeningFkError(err);
    if (mapped) return mapped;
    throw err;
  }
}
