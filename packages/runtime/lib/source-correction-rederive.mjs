// #1030 — RE-DERIVING A JOURNAL BASIS AFTER A SOURCE CORRECTION. Pure: no DB, no model, no clock.
//
// WHY THIS LIVES IN THE RUNTIME AT ALL. 0268 measured that it cannot live below it:
// `journalBasisSchema` is a posting date, a memo, a currency and lines of integer cents, with no
// back-link from a line to the document field path it came from, so mapping a corrected
// `invoice.total` onto debit and credit lines is an interpretation act. This module is that act,
// written down as a decision procedure instead of a judgement call.
//
// WHAT IT MAY READ, AND THE DISTINCTION IS THE RULING'S OWN.
//   · THE FIGURES come from the document's LIVE FACTS and from nowhere else. That is
//     `reports/wave2-lane09-fix.md` §3a's "never the retired Work's `basis`", and the reason is
//     the blocker #885 measured: a successor carrying the retired basis could post ONLY the
//     pre-correction figure, against the corrected document, and be accepted.
//   · THE SHAPE comes from the retired instruction — which accounts, which side, what memo, what
//     posting date. A correction of what the document SAYS does not move the instruction a person
//     gave: "the facts changed, the instruction did not" (§2 of the same report). There is no
//     other durable record of which accounts this instruction meant, and inventing one would be
//     this lane making an accounting judgement nobody asked it for.
//
// AND EVERYTHING IT RETURNS IS A PROPOSAL, NEVER A POSTING. The successor is admitted parked on a
// confirmation question naming BOTH figures, and nothing may post until a person answers it. That
// is what makes a CONSERVATIVE derivation the right one: where the mapping is not obvious the
// honest answer is to decline by name — the estate then stands exactly where #885 left it, with a
// person told to give the instruction again — rather than to guess and rely on someone catching
// it. Every decline is recorded through `clara.settle_source_corrected_rederivation`, so the lane
// decides once and a person can read why.
//
// THE ONE RULE, STATED PLAINLY: every line of the retired instruction that carried the figure the
// document used to say now carries the figure the document says; every other line is carried
// unchanged; and if the result does not balance, or the old figure appears on no line at all, the
// re-derivation is DECLINED.

/** Every reason this module may decline with. Closed on purpose: the reason rides
 *  `clara.settle_source_corrected_rederivation`'s `p_reason` onto a receipt a person reads, and a
 *  roster that grew a member nobody declared would put an unexplained word in front of them. */
export const REDERIVATION_DECLINED = Object.freeze([
  "correction_not_monetary",
  "figure_not_in_basis",
  "prior_reading_not_monetary",
  "rederivation_does_not_balance",
  "rederivation_is_unchanged",
  "retired_basis_unreadable",
  "source_moved_again",
]);

const declined = (reason, detail = {}) => ({ ok: false, reason, detail });

/** A fact value's cents as an INTEGER, or null. The database hands `{text, cents}` with `cents` as
 *  a bigint, which `pg` returns as a STRING — a comparison against a number would silently be
 *  false for every value, which is the kind of bug a belt hides for weeks. */
function centsOf(value) {
  if (value === null || typeof value !== "object" || !("cents" in value)) return null;
  const raw = value.cents;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw));
  return Number.isSafeInteger(n) ? n : null;
}

function lineCents(line, key) {
  const raw = line?.[key];
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "number" ? raw : Number(String(raw));
  return Number.isSafeInteger(n) ? n : NaN;
}

function readableBasis(basis) {
  if (!basis || typeof basis !== "object") return null;
  if (!Array.isArray(basis.lines) || basis.lines.length === 0) return null;
  for (const l of basis.lines) {
    if (!l || typeof l !== "object" || typeof l.account_code !== "string") return null;
    if (Number.isNaN(lineCents(l, "debit_cents")) || Number.isNaN(lineCents(l, "credit_cents"))) return null;
  }
  return basis;
}

/**
 * Re-derive the basis a source correction owes, from the brief
 * `clara.source_correction_rederivations` hands the belt.
 *
 * @returns `{ok: true, basis, from: {field_path, cents, source: "live_facts"}}`, or
 *          `{ok: false, reason, detail}` with `reason` drawn from `REDERIVATION_DECLINED`.
 */
export function rederivedBasis(b) {
  if (!b || typeof b !== "object") return declined("retired_basis_unreadable", { brief: null });
  const fieldPath = typeof b.field_path === "string" ? b.field_path : null;
  if (!fieldPath) return declined("retired_basis_unreadable", { brief: "no field_path" });

  const basis = readableBasis(b.retired_basis);
  if (!basis) return declined("retired_basis_unreadable", { field_path: fieldPath });

  // THE CORRECTED FIGURE, OFF THE LIVE FACTS. A non-monetary correction (a vendor name, a currency
  // code, an invoice id) moves no figure this lane could place, and saying so is the whole answer.
  const live = b.live_facts && typeof b.live_facts === "object" ? b.live_facts[fieldPath] : null;
  const liveCents = centsOf(live);
  if (liveCents === null) return declined("correction_not_monetary", { field_path: fieldPath });

  const priorCents = centsOf(b.prior_value);
  if (priorCents === null) return declined("prior_reading_not_monetary", { field_path: fieldPath });

  // THE BRIEF MAY BE STALE. A second correction can land between the backlog read and this
  // derivation; the live reading is then not the one the correction in hand produced, and
  // re-deriving from either would be re-deriving from a reading nobody is looking at. The next
  // sweep reads the newest correction and this one is settled by its own successor or decline.
  const correctionCents = centsOf(b.new_value);
  if (correctionCents !== null && correctionCents !== liveCents) {
    return declined("source_moved_again", { live_cents: liveCents, correction_cents: correctionCents });
  }

  let moved = 0;
  const lines = basis.lines.map((l) => {
    const debit = lineCents(l, "debit_cents");
    const credit = lineCents(l, "credit_cents");
    // Object.assign rather than an object spread: the parts-parity census REFUSES a spread it
    // cannot classify, because a spread is exactly how an unreviewed type discriminant reaches a
    // transcript part without anyone seeing it. Same reason claraWork.v5.impl.ts gives for its own.
    const out = Object.assign({}, l);
    if (debit === priorCents && priorCents !== 0) { out.debit_cents = liveCents; moved += 1; }
    if (credit === priorCents && priorCents !== 0) { out.credit_cents = liveCents; moved += 1; }
    return out;
  });

  if (moved === 0) {
    return declined("figure_not_in_basis", { prior_cents: priorCents, field_path: fieldPath });
  }

  const debits = lines.reduce((s, l) => s + lineCents(l, "debit_cents"), 0);
  const credits = lines.reduce((s, l) => s + lineCents(l, "credit_cents"), 0);
  if (debits !== credits) {
    // The instruction split the corrected figure across more than one line — a net line and a tax
    // line, most often. Nothing here knows how a professional would re-split it, and a proposal
    // that cannot be posted is not a proposal.
    return declined("rederivation_does_not_balance", { debits_cents: debits, credits_cents: credits });
  }

  if (liveCents === priorCents) {
    // Defensive: the correcting door already refuses a no-op before anything is written (0268,
    // widened by 0321), so a brief that reaches here with an unmoved figure means something above
    // this lane is wrong. Declining says so instead of admitting a Work that changes nothing.
    return declined("rederivation_is_unchanged", { cents: liveCents });
  }

  return {
    ok: true,
    basis: Object.assign({}, basis, { lines }),
    from: { field_path: fieldPath, cents: liveCents, source: "live_facts" },
  };
}
