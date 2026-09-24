// @frozen
//
// statementFacts_v4 — THE PER-LINE SOURCE CITATION, resolved (#1037, the producer half of #990).
//
// WHAT THIS MODULE IS FOR. statementFacts.v4.prompts.mjs asks the TEXT reader to answer, per
// statement line, the `region_idx` it read that row from — the bracketed number of one of the
// numbered regions it was shown. That number is an INDEX INTO THE PROMPT and nothing else: it is
// never stored, never relayed, and never trusted as a fact about the page. This module turns it
// back into the two things `clara.bank_statement_lines` actually carries (0291) — the region's own
// `clara.document_regions.locator` and the page `clara.witness_citation_regions` published for it
// — and drops it on the floor if it cannot.
//
// THE JOIN IS THE DISPATCH'S OWN, RUN FOR ITS OTHER COLUMN. `statementFacts.v2.dispatch.mjs`'s
// `readStatementWitnessCitationRegions` already joins `clara.witness_citation_regions($1)` to
// `clara.document_regions` — it keeps `idx`, `page` and `text_content` and uses the locator only
// to SORT into reading order, then throws it away. This read is the same join asked for the
// column that one discards, kept deliberately separate rather than by copying that function:
// duplicating its `topLeft` and its three-key sort here would put the numbering the PROMPT shows
// and the numbering the WRITER resolves against into two places, which is precisely the drift the
// estate's one-numbering rule exists to prevent. The prompt keeps using v2's read, unchanged; this
// one is an order-free lookup and needs no sort at all.
//
// WHAT A STORED CITATION IS, EXACTLY (ADV-1037-02, so a later reader does not assume more).
// `clara.bank_statement_lines` gets the region's page and its locator COPIED onto the line, and
// `citation_extraction_id` beside them — but that id is the READER-1 extraction
// `clara._persist_statement_core_v2` creates for this read and stamps itself (`v_ext1`,
// unconditional; a producer cannot influence it), NOT the OCR extraction the region was read
// from. 0291's column comment reads the other way, which was measured wrong here rather than
// argued: the reader-1 row carries zero `clara.document_regions` rows. So the trio is not
// re-walkable — the viewer RENDERS the stored locator, and nothing navigates from the line back
// to the region it came from. Making it walkable needs either the OCR extraction id on the line
// or a lookup door, and both are a migration 0291 deliberately did not take.
//
// WHY THE FILTERING LIVES HERE AND IS THIS STRICT. 0291 put three constraints on the table —
// `citation_page >= 1`, `jsonb_typeof(citation_region) = 'object'`, and
// `(citation_extraction_id is null) = (citation_page is null) = (citation_region is null)` — and
// `clara._persist_statement_core_v2` raises CLR10 `{"reason":"chain_broken"}` on a malformed
// per-line shape BEFORE it writes anything. A statement is a paid two-channel read; losing the
// whole document because one region printed no page would be a bad trade for a field that is,
// by design, optional. So an unusable region is simply not citable: the line persists with no
// citation and the Matching tab says so in words (#990's `not_recorded` state, the nothing-dark
// face the owner's 2026-09-20 ruling asks for), rather than the statement failing.
//
// A WRONG NUMBER IS WORSE THAN NO NUMBER. An index the reader answered that names no region it
// was shown is treated as no citation at all, never as "the nearest region": a citation points a
// person at a patch of their own bank statement, and pointing them at the wrong patch is the one
// outcome worth refusing.
//
// AND "SHOWN" MEANS SHOWN, NOT "SOMEWHERE IN THE EXTRACTION" (ADV-1037-01, the review's major).
// `buildStatementWitnessTextPrompt` renders regions until a 60,000-char budget is spent and then
// STOPS, reporting the fact in `built.truncated` — and the builder's own comment says why the
// budget exists at all: "a bank statement's OCR text runs long". The first cut of this module
// resolved a reader's index against the WHOLE join, so on a statement that exhausts the budget an
// index naming a region the prompt never printed still resolved — to a real row, with a real page
// and a real polygon, none of which the reader had been shown. And the published idx set has GAPS
// with respect to reading order (`clara.witness_citation_regions` numbers by `row_number() over
// (order by id)` over uuids, while the prompt prints them spatially), so a model interpolating a
// bracket number lands on a real-but-unshown region rather than on nothing. The lookup is
// therefore built from THE PROMPT THAT WAS SENT — `renderedRegionIndexes` reads the bracket
// headers back out of the builder's own output — and it is FAIL-CLOSED: a rendering this module
// cannot read is worth zero citations, never citations resolved against a set it had to guess at.

/** The fence `buildStatementWitnessTextPrompt` wraps its numbered regions in. Spelled here
 *  rather than imported because the builder keeps it module-private — and it is also the string
 *  that builder NEUTRALIZES inside every region's own OCR text (`[fence]`), which is precisely
 *  what makes the block delimitable at all. */
const REGION_FENCE_OPEN = "<document_ocr_regions>";
const REGION_FENCE_CLOSE = "</document_ocr_regions>";

/**
 * THE REGIONS THE PROMPT ACTUALLY PRINTED, read back off the prompt the model was handed.
 *
 * WHY THIS IS READ AND NOT RECOMPUTED. The budget, the fence neutralization and the
 * whole-region-from-the-tail truncation all live in `buildStatementWitnessTextPrompt`, which is
 * frozen and shared; a second copy of that arithmetic here would be exactly the two-places drift
 * the rest of this module refuses. The builder's OUTPUT is its public contract, so the rendering
 * is READ: one line per region inside the fence (the builder replaces every newline in a region's
 * text with a space, so a region can never occupy a second line), each opened by its own bracket
 * header, and the regions consumed in the order the caller handed them.
 *
 * FAIL-CLOSED, DELIBERATELY. If the fence is missing, or a printed line does not open with the
 * header of the region that position belongs to, this returns the EMPTY set — no citations at all
 * — rather than a best guess. A later builder whose rendering this cannot read costs the
 * citations and says nothing untrue; one that guessed would point a person at the wrong patch of
 * their own bank statement, which is the outcome this module exists to refuse.
 *
 * @param {string} prompt `buildStatementWitnessTextPrompt(...).prompt`
 * @param {Array<{idx: unknown, page: unknown}>} regions the same array that built it, in order
 * @returns {Set<number>}
 */
export function renderedRegionIndexes(prompt, regions) {
  const lines = String(prompt ?? "").split("\n");
  const open = lines.indexOf(REGION_FENCE_OPEN);
  const close = lines.indexOf(REGION_FENCE_CLOSE);
  if (open < 0 || close < open) return new Set();
  const printed = lines.slice(open + 1, close);
  const shown = new Set();
  for (let i = 0; i < printed.length; i += 1) {
    const idx = regions?.[i]?.idx;
    if (!Number.isInteger(idx)) return new Set();
    // The header is `[idx]` or `[idx pN]`, so the character after the number is the only thing
    // worth pinning: matching the page format too would duplicate a second piece of the builder.
    if (!printed[i].startsWith(`[${idx} `) && !printed[i].startsWith(`[${idx}]`)) return new Set();
    shown.add(idx);
  }
  return shown;
}

/**
 * The lookup the writer resolves a reader's `region_idx` against. A region is CITABLE only if it
 * is BOTH — (1) one the prompt actually printed, and (2) one that can satisfy 0291's column
 * constraints. `shownIdxs` is a REQUIRED argument rather than an optional filter: a caller that
 * could forget it is a caller that can resolve an index against a region nobody was shown.
 *
 * @param {Array<{idx: unknown, page: unknown, locator: unknown}>} rows
 * @param {Set<number>} shownIdxs `renderedRegionIndexes`'s output
 * @returns {Map<number, {page: number, region: Record<string, unknown>}>}
 */
export function indexStatementRegionCitations(rows, shownIdxs) {
  const byIdx = new Map();
  const shown = shownIdxs instanceof Set ? shownIdxs : new Set();
  for (const row of rows ?? []) {
    const idx = row?.idx;
    const page = row?.page;
    const region = row?.locator;
    if (!Number.isInteger(idx)) continue;
    if (!shown.has(idx)) continue;
    if (!Number.isInteger(page) || page < 1) continue;
    if (region === null || typeof region !== "object" || Array.isArray(region)) continue;
    byIdx.set(idx, { page, region });
  }
  return byIdx;
}

/**
 * THE READ, and the ONE door this module offers the behaviour: it cannot be called without the
 * set of indexes the prompt printed, so a lookup that outruns the prompt is not expressible.
 *
 * The same join `readStatementWitnessCitationRegions` performs, asked for the locator it
 * discards — plus the FIRM PREDICATE that read does not carry (ADV-1037-03). The predicate is
 * not reachable today: the extraction id comes from `readPinnedStatementOcrExtraction`, which
 * filters `document_id = $1 and firm_id = $2`. It is added because v4 is the first version that
 * WRITES what this read returns into `clara.bank_statement_lines` — `clara.witness_citation_regions`
 * is SECURITY DEFINER with no firm check and `p_document_regions_runtime_read`'s qual is `true`,
 * so `clara_runtime` can read every firm's regions, and the blast radius of a wrong extraction id
 * would rise from "foreign text in a prompt" to "foreign page geometry persisted into this firm's
 * rows". `doc.firm_id` is already in the caller's hand (it passes it to `prepare`/`consume` in the
 * same function), so isolation costs one bound parameter and is carried by the read that
 * PERSISTS, not only by the read that pinned the extraction.
 *
 * @param {{query(sql: string, params?: unknown[]): Promise<{rows: Array<Record<string, unknown>>}>}} client
 * @param {{extractionId: string, firmId: string, shownIdxs: Set<number>}} args
 */
export async function readStatementWitnessRegionCitations(client, { extractionId, firmId, shownIdxs }) {
  const r = await client.query(
    "select w.idx, w.page, r.locator"
    + " from clara.witness_citation_regions($1) w"
    + " join clara.document_regions r on r.id = w.region_id and r.firm_id = $2",
    [extractionId, firmId],
  );
  return indexStatementRegionCitations(r.rows.map((row) => ({
    idx: row.idx == null ? null : Number(row.idx),
    page: row.page == null ? null : Number(row.page),
    locator: row.locator ?? null,
  })), shownIdxs);
}

/**
 * Attach each writer line's citation, by the SAME array position `toWriterLines` assigns
 * `line_no` from — the reader answered one object per printed row, in printed order, and the
 * writer numbered them 1..N from that same order, so position is the only correspondence either
 * side ever had.
 *
 * `page` and `region` are set TOGETHER or not at all, which is what makes 0291's shape guard
 * unreachable from this body. `region_idx` is never copied onto a writer line: it is not a field
 * `clara._stmt_lines_norm` reads, and leaving it on the payload would put a number the model
 * invented into a stored read that nothing verifies.
 *
 * @param {Array<Record<string, unknown>>} writerLines `toWriterLines`'s output
 * @param {unknown} wireLines the model's own answer array, aligned by position
 * @param {Map<number, {page: number, region: Record<string, unknown>}>} byIdx
 */
export function attachStatementLineCitations(writerLines, wireLines, byIdx) {
  const wire = Array.isArray(wireLines) ? wireLines : [];
  return (writerLines ?? []).map((line, index) => {
    const answered = wire[index];
    const idx = answered && typeof answered === "object" ? answered.region_idx : null;
    const citation = Number.isInteger(idx) ? byIdx?.get(idx) : undefined;
    if (!citation) return line;
    return { ...line, page: citation.page, region: citation.region };
  });
}
