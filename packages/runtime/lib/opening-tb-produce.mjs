// #656 — THE WIRE between the `opening_tb.line` PRODUCER and the OCR pass that has been walking
// past it since Wave B.
//
// ── WHAT THIS MODULE IS, IN ONE SENTENCE ─────────────────────────────────────────────────────
// One non-frozen adapter: it takes the `tables.N.cells.M` region payloads `normalizeAzureLayout`
// has just built (`egress.mjs`), hands them to `cellsToOpeningTb` unchanged, and hands back the
// `opening_tb.line` regions `clara.persist_document_extraction(p_regions)` accepts — or NOTHING
// plus a named reason. It is an adapter and a containment shell, nothing else.
//
// ── IT ADDS NO GRAMMAR OF ITS OWN, AND THAT IS A RULE RATHER THAN A STYLE ─────────────────────
// Every durable rule about what a trial-balance line IS lives in two places that are hard to
// change on purpose: migration `0017_wave_b.sql` (`_derive_opening_region_fact`,
// `_assert_opening_target_fact`, `ck_document_regions_opening_fact_0017`) and
// `lib/opening-tb-cells.mjs`'s four refusal laws. Nothing here decides anything about accounts,
// amounts, sides, totals or refusals; it only carries the reader's verdict across a package seam.
//
// ── THE FREEZE WARNING, VERBATIM AND ON PURPOSE ──────────────────────────────────────────────
// ANY FUTURE CLARA OPENING TOOL THAT IMPORTS THIS MODULE FREEZES IT. `scripts/check-frozen-
// workflows.mjs` locks a workflow's whole transitive relative-import closure, and this estate
// has already sprung that trap once (`lib/periodic-adjustment-basis.ts` is frozen today because
// a behaviour body reached it). So: durable rules belong in `0228`/`0017` and in
// `opening-tb-cells.mjs`, NEVER here. If a rule ends up in this file, the next successor cut
// cannot change it without a `_vN` re-mint.
//
// ── WHY IN-LINE AT THE OCR PASS, RATHER THAN A ROUTED LANE ───────────────────────────────────
// Orchestrator ruling D13.1 (wave 2026-09-18): in-line, through ONE new non-frozen module. No
// new processing lane, no new `engine_kind`, no CHECK widening, no `_enqueue_invoice_facts_core`
// splice. The wiring is therefore KIND-BLIND — it runs over every Azure layout pass, not only
// over documents filed as `opening_balance_doc` — and that is ACCEPTED rather than overlooked,
// for two measured reasons:
//
//   (a) the reader must POSITIVELY identify a balancing trial balance (a header carrying code +
//       description + BOTH amount columns, no date column, no `Code :` ledger block header) and
//       returns `null` otherwise — `opening-tb-cells.mjs:305-322`, `:378-390`; and
//   (b) an `opening_tb.line` region is INERT until an opening seed ties that document, and
//       `clara.create_opening_seed` re-checks the document's kind at that moment
//       (`0017:2913-2917`, CLR02 for anything but `opening_balance_doc` / `management_account`).
//
// So the worst case of a false positive is a few extra evidence rows on a document nobody ever
// ties — never a number that reaches an accounting effect.
//
// ── IT NEVER THROWS ──────────────────────────────────────────────────────────────────────────
// This runs INSIDE an OCR normalisation that has already succeeded. A producer fault must not
// destroy an extraction the document legitimately earned, so every path below is contained and
// reports itself as `producer_error` with the message — fail-quiet HERE is fail-closed
// DOWNSTREAM, because emitting nothing is exactly what the lane did before this module existed.

import { cellsToOpeningTb } from "./opening-tb-cells.mjs";

/** The ONE literal `0017`'s `_derive_opening_region_fact` and `ck_document_regions_opening_fact_0017`
 *  admit for an opening fact. It is a literal, not a namespace — see
 *  `packages/db/tests/document-regions-unique-field-path.test.mjs` cell 9. */
export const OPENING_TB_FIELD_PATH = "opening_tb.line";

/** The prefix `normalizeAzureLayout` gives every table-cell region (`egress.mjs:154-172`). */
const TABLE_FIELD_PREFIX = "tables.";

/** The empty envelope, with the reason the caller must be able to show a human. */
const nothing = (status, reason) => ({ status, reason, regions: [], refusals: [], totals: null });

/**
 * Read the `opening_tb.line` regions out of one OCR pass's table cells.
 *
 * @param {Array<object>} regions the FULL region array `normalizeAzureLayout` has built; this
 *   function selects the `tables.*` elements itself and never mutates the array it is given.
 * @returns {{
 *   status: 'ok'|'not_a_trial_balance'|'refused'|'producer_error',
 *   reason: string|null,
 *   regions: Array<object>,
 *   refusals: Array<{reason:string, detail:string|null, row_key:string, text:string}>,
 *   totals: {debitCents: string, creditCents: string}|null,
 * }}
 *
 * `regions` is EMPTY for every status but `ok`; there is no partial set, because a partial
 * opening basis is worse than none (the house all-or-nothing law, F-H5). Cents travel as
 * DECIMAL STRINGS: they are BigInt in the reader, JSON has no bigint, and the database casts
 * `(elem->>'monetary_cents')::bigint`.
 */
export function produceOpeningTbRegions(regions) {
  try {
    if (!Array.isArray(regions)) return nothing("not_a_trial_balance", "no table cells on this extraction");
    const cells = regions.filter(
      (r) => r && typeof r === "object" && typeof r.field_path === "string" && r.field_path.startsWith(TABLE_FIELD_PREFIX),
    );
    if (cells.length === 0) return nothing("not_a_trial_balance", "no table cells on this extraction");

    const read = cellsToOpeningTb(cells);

    // `null` is the CONSERVATIVE default and the loudest thing it means is "I learned nothing":
    // the caller must behave exactly as it did before this module existed.
    if (read === null) {
      return nothing("not_a_trial_balance", "the table cells on this document are not a trial balance");
    }
    if (read.status === "refused") {
      return {
        status: "refused",
        reason: read.reason,
        regions: [],
        refusals: Array.isArray(read.refusals) ? read.refusals : [],
        totals: null,
      };
    }
    return {
      status: "ok",
      reason: null,
      regions: read.regions,
      refusals: [],
      totals: {
        debitCents: String(read.totals.debitCents),
        creditCents: String(read.totals.creditCents),
      },
    };
  } catch (err) {
    // See the header: containment, not silence. The reason names the fault so an operator reading
    // the extraction can tell "this document is not a trial balance" from "the producer broke".
    return nothing("producer_error", `opening trial-balance producer failed: ${err?.message ?? String(err)}`);
  }
}
