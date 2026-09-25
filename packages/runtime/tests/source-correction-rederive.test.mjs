// #1030 — THE RE-DERIVATION ITSELF, AS A PURE FUNCTION.
//
// 0268 measured that a corrected basis cannot be derived in SQL: `journalBasisSchema` is a posting
// date, a memo, a currency and lines of integer cents, with no back-link from a line to the
// document field path it came from. So the mapping is the RUNTIME's, and this file is its whole
// decision procedure with no database, no model and no clock in it.
//
// WHAT THE FUNCTION IS ALLOWED TO USE, and the distinction is the ruling's own. The FIGURES come
// from the document's LIVE FACTS and from nowhere else — "never the retired Work's own basis". The
// retired basis supplies only the SHAPE of the instruction the person gave (which accounts, which
// side, what memo, what posting date), which a correction of what the document SAYS does not move:
// the facts changed, the instruction did not (`reports/wave2-lane09-fix.md` §2).
//
// AND IT IS A PROPOSAL, NEVER A POSTING. Everything this function returns is re-admitted parked on
// a confirmation question that names both figures; nothing can post until a person answers it.
// That is why a conservative derivation is the right one: where the mapping is not obvious the
// answer is to DECLINE by name, not to guess and let a person catch it.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { rederivedBasis, REDERIVATION_DECLINED } = await import("../lib/source-correction-rederive.mjs");

/** The shape `clara.source_correction_rederivations` hands the belt, with only the keys the
 *  derivation reads. Written out per cell rather than mutated from a shared object, so a cell
 *  cannot be green because a sibling left a key behind. */
function brief({
  fieldPath = "invoice.total", priorCents = 64000, liveCents = 99900, newCents = null,
  lines = [
    { account_code: "6000", debit_cents: 64000, credit_cents: 0, description: "rent" },
    { account_code: "1010", debit_cents: 0, credit_cents: 64000, description: "bank" },
  ],
  basis = null,
} = {}) {
  return {
    op_key: "source_corrected:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    field_path: fieldPath,
    prior_value: priorCents === null ? { text: "n/a" } : { text: "prior", cents: String(priorCents) },
    new_value: { text: "new", cents: String(newCents ?? liveCents) },
    live_facts: { [fieldPath]: liveCents === null ? { text: "n/a" } : { text: "live", cents: String(liveCents) } },
    retired_basis: basis ?? {
      posting_date: "2026-03-05", memo: "Office rent paid from Maybank", currency: "MYR", lines,
    },
  };
}

test("1030.rederive: the corrected figure comes off the LIVE facts and lands on every line that carried the retired one", () => {
  const out = rederivedBasis(brief());
  assert.equal(out.ok, true, "a two-line basis whose both sides carried the retired figure is re-derivable");
  // The expected basis is written as a literal, from the corrected document, not recomputed the
  // way the function computes it.
  assert.deepEqual(out.basis, {
    posting_date: "2026-03-05",
    memo: "Office rent paid from Maybank",
    currency: "MYR",
    lines: [
      { account_code: "6000", debit_cents: 99900, credit_cents: 0, description: "rent" },
      { account_code: "1010", debit_cents: 0, credit_cents: 99900, description: "bank" },
    ],
  });
  assert.equal(out.from.field_path, "invoice.total");
  assert.equal(out.from.cents, 99900, "…and the function says WHERE the figure came from");
  assert.equal(out.from.source, "live_facts",
    "…which is the document's live reading, never the retired basis");
});

test("1030.rederive: the retired figure is gone from the proposal — the blocker #885 measured, as an absence", () => {
  const out = rederivedBasis(brief());
  assert.equal(out.ok, true);
  const cents = out.basis.lines.flatMap((l) => [l.debit_cents, l.credit_cents]).filter((c) => c !== 0);
  assert.deepEqual(cents, [99900, 99900],
    "no line of the proposal carries 64000 — a successor that could post the pre-correction "
    + "figure against the corrected document is exactly what the ruling forbids");
});

test("1030.rederive: a live reading that has moved AGAIN since the correction is DERIVED FROM, never declined into a dead end", () => {
  // ADV-C1-05 (cut-phase adversarial round). The first cut DECLINED here, on the argument that
  // "the next sweep reads the newest correction and this one is settled by its own successor or
  // decline". That argument does not hold, and the measurement is the estate's own:
  // `clara._source_corrected_work` retires only a Work in ('queued','running','awaiting_input'),
  // so a SECOND correction landing after the first retirement — while the Work is already
  // `cancelled` and no successor exists yet — retires nothing and writes no `source_corrected:`
  // receipt, which is the only thing `clara.source_correction_rederivations` reads. The decline
  // meanwhile CONSUMED the first correction's op key through `clara._reserve_op`, so it is final.
  // Net: the person's instruction retired, nothing re-derived, no successor, and Needs-you showing
  // nothing — which is the exact state #1030's AC4 exists to end.
  //
  // THE HONEST ANSWER IS THE ONE THE RULING ALREADY GIVES: the figures come from `live_facts`,
  // which IS what the document says now. Deriving from the live reading needs no guess, and the
  // successor is admitted PARKED on a confirmation question naming both figures — so a person
  // sees the current figure and confirms it, rather than seeing nothing at all. A third correction
  // arriving after that retires the successor (it is queued or awaiting_input) and the chain
  // continues; that is what makes this self-healing where the decline was a cul-de-sac.
  const out = rederivedBasis(brief({ newCents: 99900, liveCents: 120000 }));
  assert.equal(out.ok, true, "the reading moved again, and the live reading is still a reading");
  const cents = out.basis.lines.flatMap((l) => [l.debit_cents, l.credit_cents]).filter((c) => c !== 0);
  assert.deepEqual(cents, [120000, 120000], "the proposal carries what the document says NOW");
  assert.equal(out.from.cents, 120000);
  assert.equal(out.from.source, "live_facts");
  // …and the belt is TOLD the reading moved, so the fact is on the record rather than inferred.
  assert.equal(out.from.moved_again, true);
  assert.equal(out.from.correction_cents, 99900);
  // A brief whose correction agrees with the live reading says so too, in the same shape.
  assert.equal(rederivedBasis(brief()).from.moved_again, false);
});

test("1030.rederive: a document corrected BACK to the retired reading is re-offered, not declined as unchanged", () => {
  // The other half of ADV-C1-05, and the dead end the fix must not simply move: correction 1 takes
  // 64000 to 99900 and retires the Work, correction 2 takes it back to 64000 before the sweep. The
  // live reading now equals the figure the retired instruction was admitted on, so the
  // `rederivation_is_unchanged` arm would fire — and that arm's own comment says it exists for a
  // state "something above this lane is wrong" produces. Nothing is wrong here: the document
  // simply says again what it said, and the honest successor is the retired instruction itself,
  // re-offered for confirmation. Declining would leave the same cul-de-sac by another name.
  const out = rederivedBasis(brief({ priorCents: 64000, newCents: 99900, liveCents: 64000 }));
  assert.equal(out.ok, true);
  const cents = out.basis.lines.flatMap((l) => [l.debit_cents, l.credit_cents]).filter((c) => c !== 0);
  assert.deepEqual(cents, [64000, 64000]);
  assert.equal(out.from.moved_again, true);

  // …while a brief whose correction AGREES with a live reading equal to the prior one is still the
  // defensive decline it always was: there the correcting door should have refused before
  // anything was written, and admitting a Work that changes nothing would hide that.
  const unchanged = rederivedBasis(brief({ priorCents: 64000, newCents: 64000, liveCents: 64000 }));
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.reason, "rederivation_is_unchanged");
});

test("1030.rederive: a correction that is not money, or a basis that never carried the figure, is declined BY NAME", () => {
  // A · the corrected field is not monetary at all (a vendor name, a currency code).
  const name = rederivedBasis(brief({ fieldPath: "invoice.vendor_name", priorCents: null, liveCents: null }));
  assert.equal(name.ok, false);
  assert.equal(name.reason, "correction_not_monetary");

  // B · the figure that moved appears on NO line of the retired instruction. The person's
  // instruction was about something else on this document, and re-deriving it would be this lane
  // inventing an accounting judgement.
  const elsewhere = rederivedBasis(brief({
    lines: [
      { account_code: "6000", debit_cents: 12000, credit_cents: 0, description: "other" },
      { account_code: "1010", debit_cents: 0, credit_cents: 12000, description: "bank" },
    ],
  }));
  assert.equal(elsewhere.ok, false);
  assert.equal(elsewhere.reason, "figure_not_in_basis");
  assert.equal(elsewhere.detail.prior_cents, 64000);
});

test("1030.rederive: a re-derivation that would not balance is declined — a proposal that cannot be posted is not a proposal", () => {
  // The document's total moved, but the instruction split it across a net line and a tax line.
  // Moving only the line that carried the total leaves 64000 against 99900, and NOTHING in this
  // lane knows how a professional would re-split the tax.
  const out = rederivedBasis(brief({
    lines: [
      { account_code: "6000", debit_cents: 60000, credit_cents: 0, description: "net" },
      { account_code: "1500", debit_cents: 4000, credit_cents: 0, description: "tax" },
      { account_code: "1010", debit_cents: 0, credit_cents: 64000, description: "bank" },
    ],
  }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, "rederivation_does_not_balance");
  assert.equal(out.detail.debits_cents, 64000);
  assert.equal(out.detail.credits_cents, 99900);
});

test("1030.rederive: an unreadable brief or basis is declined rather than throwing — this runs on a belt", () => {
  for (const bad of [null, undefined, {}, { field_path: "invoice.total" }]) {
    const out = rederivedBasis(bad);
    assert.equal(out.ok, false, `a ${JSON.stringify(bad)} brief is declined`);
    assert.ok(REDERIVATION_DECLINED.includes(out.reason), `…by a named reason (${out.reason})`);
  }
  const noLines = rederivedBasis(brief({ basis: { posting_date: "2026-03-05", currency: "MYR", memo: "m" } }));
  assert.equal(noLines.ok, false);
  assert.equal(noLines.reason, "retired_basis_unreadable");
});

test("1030.rederive: every declined reason is one the settlement can record, and the roster is closed", () => {
  // The decline reason rides `clara.settle_source_corrected_rederivation`'s `p_reason`, which a
  // person can read on the receipt. A roster that grew a member nobody declared would put an
  // unexplained word in front of them.
  assert.deepEqual([...REDERIVATION_DECLINED].sort(), [
    "correction_not_monetary",
    "figure_not_in_basis",
    "prior_reading_not_monetary",
    "rederivation_does_not_balance",
    "rederivation_is_unchanged",
    "retired_basis_unreadable",
  ]);
  // `source_moved_again` LEFT this roster in the cut-phase fix round (ADV-C1-05): it is no longer
  // a decline, so a settlement can no longer record it, so it may not sit in a roster whose whole
  // purpose is "every word this lane can put on a receipt a person reads".
  assert.equal(REDERIVATION_DECLINED.includes("source_moved_again"), false);
});
