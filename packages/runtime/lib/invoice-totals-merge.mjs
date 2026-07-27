// Reconciling the X2 totals reader against Azure's own TYPED fields (ADR-047).
//
// WHY THIS IS ITS OWN MODULE. The reader answers "what does the layout say"; the mapper's
// FIELD_MAP answers "what did the model type". This file answers the third, sharper question:
// when those two disagree, what may reach the database? It is short, it is entirely about a
// DB failure mode, and it is the piece most likely to need revisiting — so it sits apart from
// both producers rather than buried in either.
//
// THE HAZARD IT EXISTS FOR. Azure types `SubTotal` NONDETERMINISTICALLY: a fresh call on the
// very document whose production extraction had none returned 435,560.40. So a reader emission
// colliding with a typed one is a live event, not a hypothetical. And 0016:3609-3615 (widened
// by 0022) forfeits the WHOLE extraction when one field_path carries two differing values —
// which would destroy today's working 29/29 `invoice.total` capture, not merely lose the new
// field. Handing the DB both readings is therefore never an option.
//
// THE FOUR OUTCOMES, and the reasoning behind each:
//   * typed row ABSENT            -> emit the reader's row.
//   * typed row present but BLANK -> the reader fills the hole. This is the shape that
//     motivated the invoice_id recovery in the mapper (a typed field with a bounding region
//     and no value), and the same precedent applies: never override a real typed hit, always
//     fill an empty one.
//   * SAME cents                  -> keep the TYPED row; it carries Azure's own bounding
//     region and confidence. Cents, not text, because that is how the DB compares duplicates.
//   * DIFFERENT cents             -> emit NEITHER. There is no adjudicator: ADR-047 Q1 removed
//     vendor confidence from gating entirely, so a disagreement is a refusal by construction.

import { centsOfRaw, TOTALS_FIELD_PATHS } from "./invoice-totals-reader.mjs";

/**
 * Merge reader emissions into the mapper's field list, in place, reconciling against typed
 * rows. Mutates `out` and the reader's `receipt` counters; returns nothing.
 *
 * @param {Array<{field_path:string,value_raw:string}>} out the mapper's accumulated fields
 * @param {{fields:Array, receipt:object}} totals the reader's result
 */
export function mergeTotalsIntoFields(out, totals) {
  for (const row of totals.fields) {
    const typed = out.find((r) => r.field_path === row.field_path);
    if (!typed) {
      out.push(row);
      totals.receipt.emitted += 1;
      continue;
    }
    if (!String(typed.value_raw ?? "").trim()) {
      Object.assign(typed, row);
      totals.receipt.typed_recovered += 1;
      totals.receipt.emitted += 1;
      continue;
    }
    const typedCents = centsOfRaw(typed.value_raw);
    if (typedCents !== null && typedCents === centsOfRaw(row.value_raw)) {
      totals.receipt.typed_collapsed += 1;
      continue;
    }
    out.splice(out.indexOf(typed), 1);
    totals.receipt.typed_disagreement += 1;
  }

  // A PRINTED DASH IS A READING, and it has to reconcile like one. The loop above only sees
  // fields the reader EMITTED, so a field where the document states an explicit nil would
  // otherwise leave a typed value standing unopposed. The two measured failures: a typed
  // `TotalTax="N/A"` normalizes to NULL and makes 0022 forfeit the entire extraction, taking
  // the good `invoice.total` with it; and a typed `TotalTax="5.66"` on a face that prints a
  // dash persists a figure the document contradicts, which a supplier entry can then tie an
  // SST leg against. Either way the typed row is withdrawn, exactly as a value-vs-value
  // disagreement withdraws it.
  //
  // `ambiguous` and `unparseable` deliberately do NOT reconcile: those are the reader failing
  // to read, not the document stating something. A typed value stands there untouched — which
  // is precisely v5 behaviour, preserved on purpose.
  for (const field_path of TOTALS_FIELD_PATHS) {
    if (totals.receipt.fields?.[field_path]?.outcome !== "nil") continue;
    const typed = out.find((r) => r.field_path === field_path);
    if (!typed || !String(typed.value_raw ?? "").trim()) continue;
    out.splice(out.indexOf(typed), 1);
    totals.receipt.typed_vs_dash += 1;
  }
}
