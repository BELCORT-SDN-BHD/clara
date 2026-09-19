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
// ── WHAT A BAD REGION COSTS, PRICED HONESTLY (fix-round, adversarial A6) ─────────────────────
// The sentence above is about a region the database ACCEPTS. A region it does not accept is
// dearer than "a few extra rows": `clara._derive_opening_region_fact` RAISES CLR31 over an
// `opening_tb.line` whose `monetary_cents` disagrees with the text it re-derives, or whose amount
// is not positive (0017:1488-1499), and it is called from inside `clara.persist_document_
// extraction`'s region loop (0017:1587) — so the raise aborts the WHOLE persist and the document
// loses the entire extraction it legitimately earned, its invoice or payslip regions included.
// Before this wiring existed no production caller emitted such a region at all, so that abort was
// structurally unreachable; it is reachable now, on every azure-di layout pass, for every document
// kind, in every firm. `IT NEVER THROWS` below does NOT cover it: the raise is on the database
// side, one call later. That is why `disagreeingOpeningRegion` re-checks the database's own
// invariant here and drops the WHOLE set rather than shipping a row that would cost the document
// its extraction.
//
// ── IT NEVER THROWS ──────────────────────────────────────────────────────────────────────────
// This runs INSIDE an OCR normalisation that has already succeeded. A producer fault must not
// destroy an extraction the document legitimately earned, so every path below is contained and
// reports itself as `producer_error` with the message — fail-quiet HERE is fail-closed
// DOWNSTREAM, because emitting nothing is exactly what the lane did before this module existed.

import { cellsToOpeningTb } from "./opening-tb-cells.mjs";
// The mirror of `clara._derive_opening_region_fact`'s own grammar — the same function the reader
// self-checks with, used here on the EMITTED element (see `disagreeingOpeningRegion`).
import { parseOpeningTbLine } from "./opening-parse.mjs";

/** The ONE literal `0017`'s `_derive_opening_region_fact` and `ck_document_regions_opening_fact_0017`
 *  admit for an opening fact. It is a literal, not a namespace — see
 *  `packages/db/tests/document-regions-unique-field-path.test.mjs` cell 9. */
export const OPENING_TB_FIELD_PATH = "opening_tb.line";

/** The prefix `normalizeAzureLayout` gives every table-cell region (`egress.mjs:154-172`). */
const TABLE_FIELD_PREFIX = "tables.";

/**
 * #656 (fix-round, adversarial A1) — THE KEY THE REFUSAL TRAVELS UNDER, on the extraction
 * ENVELOPE rather than in a region.
 *
 * WHY THE ENVELOPE. The producer's whole contract is all-or-nothing: a trial balance it refuses
 * emits NO `opening_tb.line` region at all (F-H5). Before this key existed, `normalizeAzureLayout`
 * kept only `.regions` and dropped `status`/`reason`/`refusals`, so a REFUSED trial balance and a
 * document that is not a trial balance left byte-identical evidence — and the consumer
 * (`opening-parse.mjs`) answered both with its keyed-fallback signal `no_opening_tb_lines`, which
 * the face renders as an INFORMATION banner offering to key the balances. A professional whose
 * opening trial balance does not balance was invited to hand-key figures the machine had just
 * found internally inconsistent. The reason has to survive the pass for any surface to say so.
 *
 * `document_extractions.envelope` is the free jsonb the writer already stores verbatim, and this
 * estate already carries producer markers there (`envelope->>'corroboration_ineligible'`,
 * `0009:148` / `0015:634` / `0092:215`). So the refusal needs NO new `field_path`, no widening of
 * `ck_document_regions_opening_fact_0017` (which admits `opening_tb.line` and nothing else), and
 * no migration.
 *
 * THE LITERAL IS WRITTEN TWICE, deliberately, exactly as the `corroboration_ineligible` markers
 * are: once here (the producer side, used by `egress.mjs`) and once in `opening-parse.mjs` (the
 * consumer side), so the parse door does NOT gain an import edge into this module — an edge the
 * header above warns would freeze this file the day a Clara tool imports the door. The two
 * literals are pinned equal by `tests/opening-tb-produce.test.mjs`'s last cell.
 */
export const OPENING_TB_REFUSAL_ENVELOPE_KEY = "opening_tb_refusal";

/**
 * The envelope entry for one producer run, or `null` when there is nothing to report.
 *
 * ONLY `refused` is carried, and that is a judgement rather than an omission:
 *   · `ok` / `not_a_trial_balance` — nothing to say. A document nobody claims is a trial balance
 *     must not be reported as a refused one, or every invoice in the estate would carry a refusal.
 *   · `producer_error` — an INTERNAL fault, not a verdict about the document. The reader never
 *     judged the figures, so quoting it at a professional as a refusal of THEIR document would be
 *     the same misattribution from the other direction; the keyed path stays the honest answer and
 *     the fault is the operator's to find (the status is still in the return value here).
 * @param {{status:string, reason:string|null, refusals:Array<object>}} out
 */
export function openingRefusalEnvelopeEntry(out) {
  if (!out || out.status !== "refused") return null;
  return {
    status: "refused",
    reason: String(out.reason ?? "the opening trial balance on this document was refused"),
    refusals: Array.isArray(out.refusals) ? out.refusals : [],
  };
}

/** The empty envelope, with the reason the caller must be able to show a human. */
const nothing = (status, reason) => ({ status, reason, regions: [], refusals: [], totals: null });

/**
 * Read the `opening_tb.line` regions out of one OCR pass's table cells.
 *
 * @param {Array<object>} regions the FULL region array `normalizeAzureLayout` has built; this
 *   function selects the `tables.*` elements itself and never mutates the array it is given.
 * @param {{readCells?: (cells: Array<object>) => object|null}} [deps] the reader seam. Production
 *   passes NOTHING and gets `cellsToOpeningTb`; it exists so the emission guard below can be
 *   exercised over a reading that drifts, which is the only way to prove the all-or-nothing law
 *   holds at the ADAPTER and not merely inside the reader.
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
/**
 * #656 (fix-round, adversarial A6) — THE DATABASE'S OWN INVARIANT, RE-CHECKED BEFORE EMISSION.
 *
 * `clara._derive_opening_region_fact` re-derives `(account, amount, side)` from an
 * `opening_tb.line`'s `text_content` and RAISES `opening_extraction_monetary_mismatch` (CLR31)
 * when the supplied `monetary_cents` disagrees — inside `persist_document_extraction`'s region
 * loop, so the raise costs the document its whole extraction. The reader already proves the
 * triple once (`opening-tb-cells.mjs`'s `text_does_not_round_trip` self-check); this is the
 * ADAPTER's own re-check of the EMITTED element, so a future drift in `toRegion` (a renamed key,
 * a cents field that stops being a decimal string, a text rewritten after the cents were
 * computed) is refused HERE, where it costs nothing, instead of at the writer, where it costs the
 * document.
 *
 * @param {ReadonlyArray<object>} regions the elements about to be emitted
 * @returns {object|null} the first region that does not agree with its own text, or null
 */
export function disagreeingOpeningRegion(regions) {
  for (const region of regions ?? []) {
    if (!region || typeof region !== "object") return region ?? {};
    if (region.field_path !== OPENING_TB_FIELD_PATH) return region;
    const fact = parseOpeningTbLine(region.text_content);
    if (!fact) return region;
    if (typeof region.monetary_cents !== "string" || region.monetary_cents !== String(fact.amountCents)) return region;
    if (!(fact.amountCents > 0)) return region;
  }
  return null;
}

export function produceOpeningTbRegions(regions, { readCells = cellsToOpeningTb } = {}) {
  try {
    if (!Array.isArray(regions)) return nothing("not_a_trial_balance", "no table cells on this extraction");
    const cells = regions.filter(
      (r) => r && typeof r === "object" && typeof r.field_path === "string" && r.field_path.startsWith(TABLE_FIELD_PREFIX),
    );
    if (cells.length === 0) return nothing("not_a_trial_balance", "no table cells on this extraction");

    const read = readCells(cells);

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
    // THE EMISSION GUARD (A6). One region the database would raise over costs the document its
    // whole extraction, so a disagreement drops the WHOLE set — the same all-or-nothing law the
    // reader applies to its rows, applied one layer lower.
    const bad = disagreeingOpeningRegion(read.regions);
    if (bad) {
      return {
        status: "refused",
        reason: "an opening trial-balance row does not agree with its own text and was not emitted",
        regions: [],
        refusals: [{
          reason: "region_does_not_agree_with_text",
          detail: typeof bad?.monetary_cents === "string" ? bad.monetary_cents : null,
          row_key: typeof bad?.text_content === "string" ? bad.text_content.slice(0, 120) : "unknown_row",
          text: typeof bad?.text_content === "string" ? bad.text_content.slice(0, 200) : "",
        }],
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
