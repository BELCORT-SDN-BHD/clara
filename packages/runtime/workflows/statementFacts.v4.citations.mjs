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

/**
 * The lookup the writer resolves a reader's `region_idx` against: only the regions that can
 * actually satisfy 0291's column constraints appear in it.
 *
 * @param {Array<{idx: unknown, page: unknown, locator: unknown}>} rows
 * @returns {Map<number, {page: number, region: Record<string, unknown>}>}
 */
export function indexStatementRegionCitations(rows) {
  const byIdx = new Map();
  for (const row of rows ?? []) {
    const idx = row?.idx;
    const page = row?.page;
    const region = row?.locator;
    if (!Number.isInteger(idx)) continue;
    if (!Number.isInteger(page) || page < 1) continue;
    if (region === null || typeof region !== "object" || Array.isArray(region)) continue;
    byIdx.set(idx, { page, region });
  }
  return byIdx;
}

/**
 * THE READ. The same join `readStatementWitnessCitationRegions` performs, asked for the locator
 * it discards. Returns the lookup above, already filtered.
 *
 * @param {{query(sql: string, params?: unknown[]): Promise<{rows: Array<Record<string, unknown>>}>}} client
 * @param {string} ocrExtractionId
 */
export async function readStatementWitnessRegionCitations(client, ocrExtractionId) {
  const r = await client.query(
    "select w.idx, w.page, r.locator"
    + " from clara.witness_citation_regions($1) w"
    + " join clara.document_regions r on r.id = w.region_id",
    [ocrExtractionId],
  );
  return indexStatementRegionCitations(r.rows.map((row) => ({
    idx: row.idx == null ? null : Number(row.idx),
    page: row.page == null ? null : Number(row.page),
    locator: row.locator ?? null,
  })));
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
