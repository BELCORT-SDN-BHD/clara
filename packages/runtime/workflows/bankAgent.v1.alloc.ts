// @frozen
//
// FROZEN — part of the bankAgent_v1 closure (see bankAgent.v1.infra.ts for what this class is).
//
// THIS FILE (alloc) — the single pure judgement that turns "which lines, which entries" into the
// exact cents each entry settles. Split from bankAgent.v1.pack.ts for the 500-line module budget;
// it is the one function hard constraint 2 rests on for this lane, so it reads on its own.

import { isSafeBig, type BankPackView } from "./bankAgent.v1.pack.js";

/** What a match allocation derivation produced: either the exact entry rows to send, or a typed
 *  reason the model can act on. `reason` is a stable token, not prose — the cells pin it. */
export type BankAllocation =
  | { ok: true; entries: Array<{ entry_id: string; matched_cents: number }>; lineCents: number }
  | { ok: false; reason: string; detail: string };

/**
 * DERIVE THE ALLOCATION FROM THE PACK — the whole of 裁-44 / FOLD-1 in one pure function.
 *
 * WHAT THE DATABASE'S OWN LADDER DOES NOT CATCH, and why this function has to exist. 0121's
 * `tie_nonzero` checks only the AGGREGATE (`v_line_cents <> v_entry_cents + v_adj_cents`,
 * :5897); `capacity_exhausted` bounds each amount by that entry's OWN remaining capacity
 * (:5955-5967); `same_amount_ambiguous` searches for an UNSELECTED entry whose capacity equals
 * the aggregate (:5911-5918). A 10,000-cent line split 4,999 + 5,001 across two entries that
 * each have spare capacity passes all three — and the model's invented split becomes a durable
 * clara.bank_match_entry_members row. That is a model-generated numeral in a client's books,
 * which hard constraint 2 forbids outright.
 *
 * THE TWO ADMISSIBLE SHAPES, and there is no third:
 *   ONE entry   — matched_cents is the signed min of the line total and that entry's remaining
 *                 capacity on the matching side. When the capacity is the larger of the two the
 *                 line settles in full and the entry is partly consumed; when it is the smaller,
 *                 the derived amount cannot tie and the DATABASE refuses on tie_nonzero, which is
 *                 the right court for that verdict.
 *   MANY entries — every selected entry contributes its FULL remaining capacity, and their sum
 *                 must equal the line total exactly. A model that wants a different division does
 *                 not get one: there is no arithmetic left for it to invent.
 * Anything else is refused HERE, with a typed reason, and the prompt sends the model to
 * propose_line_exception — a human dividing an amount is the whole point of that door.
 *
 * THE SIGN CONVENTION is the estate's: matched_cents is the signed effect on the BANK account, so
 * a positive line (money in) is settled by DEBIT capacity and a negative line by CREDIT capacity.
 */
export function deriveMatchAllocation(pack: BankPackView, lineIds: string[], entryIds: string[]): BankAllocation {
  const lines = [...new Set(lineIds.map((v) => v.toLowerCase()))];
  const entries = [...new Set(entryIds.map((v) => v.toLowerCase()))];
  if (lines.length === 0) return { ok: false, reason: "no_lines", detail: "name at least one statement line" };
  if (entries.length === 0) return { ok: false, reason: "no_entries", detail: "name at least one journal entry" };

  const missingLine = lines.find((id) => !pack.lineCents.has(id));
  if (missingLine !== undefined) {
    return { ok: false, reason: "line_not_in_pack", detail: `line ${missingLine} is not among the unmatched lines of the pack this run read` };
  }
  const missingEntry = entries.find((id) => !pack.entryCaps.has(id));
  if (missingEntry !== undefined) {
    return { ok: false, reason: "entry_not_in_pack", detail: `entry ${missingEntry} is not among the candidates of the pack this run read` };
  }

  // 裁-44 R3 / FOLD-18 — THE AGGREGATE IS SUMMED IN BigInt AND CHECKED. Every LEAF is a safe
  // integer by now (exactCents refused anything else), but a sum of safe integers is not itself
  // guaranteed safe: enough large lines add past 2^53 and the total starts rounding, which is the
  // very defect FOLD-10 closed one level down. BigInt makes the addition exact; the check refuses
  // a total this process cannot carry rather than shipping a rounded one.
  const lineTotal = lines.reduce((sum, id) => sum + BigInt(pack.lineCents.get(id) ?? 0), 0n);
  if (!isSafeBig(lineTotal)) {
    return { ok: false, reason: "aggregate_unrepresentable", detail: "the lines you named total more than this run can carry exactly — match them in smaller groups" };
  }
  const lineCents = Number(lineTotal);
  if (lineCents === 0) {
    return { ok: false, reason: "lines_net_to_zero", detail: "the lines you named net to zero, and a match must settle a non-zero amount" };
  }
  const sign = lineCents > 0 ? 1 : -1;
  const want = Math.abs(lineCents);
  const capacityOf = (id: string): number => {
    const cap = pack.entryCaps.get(id);
    return cap === undefined ? 0 : sign > 0 ? cap.dr : cap.cr;
  };

  const empty = entries.find((id) => capacityOf(id) <= 0);
  if (empty !== undefined) {
    return {
      ok: false,
      reason: "entry_has_no_capacity",
      detail: `entry ${empty} has no remaining ${sign > 0 ? "debit" : "credit"} capacity against this bank account in the pack this run read`,
    };
  }

  const only = entries[0];
  if (entries.length === 1 && only !== undefined) {
    const magnitude = Math.min(want, capacityOf(only));
    return { ok: true, entries: [{ entry_id: only, matched_cents: sign * magnitude }], lineCents };
  }

  // Same BigInt discipline on the capacity side (裁-44 R3 / FOLD-18): several full capacities can
  // sum past 2^53 even though each one is exact.
  const totalBig = entries.reduce((sum, id) => sum + BigInt(capacityOf(id)), 0n);
  if (!isSafeBig(totalBig)) {
    return { ok: false, reason: "aggregate_unrepresentable", detail: "the entries you named carry more capacity between them than this run can carry exactly — match them in smaller groups" };
  }
  const total = Number(totalBig);
  if (total !== want) {
    return {
      ok: false,
      reason: "entries_do_not_tie",
      // 裁-44 R4 / FOLD-22(b) — NO CENTS IN THIS SENTENCE. It used to interpolate BOTH totals,
      // which made the PR's own claim ("a refusal carries rung names, not amounts") false and
      // handed the model a derived figure it could copy into a durable rationale. The model
      // already has the pack; it does not need our arithmetic read back to it. The ENTRY IDS stay
      // — they are what makes the refusal actionable, and an id is not an amount.
      //
      // SCOPED TO THIS REASON ALONE: `aggregate_unrepresentable` is already amount-free, and
      // `entry_has_no_capacity` names an id and a side but no cents. Stripping those would lose
      // actionable detail for nothing.
      detail:
        `the entries you named (${entries.join(", ")}) do not settle the line(s) you named between them — ` +
        "a multi-entry match settles every entry in FULL, so pick a set that adds up, or propose an exception for a human to divide",
    };
  }
  return { ok: true, entries: entries.map((id) => ({ entry_id: id, matched_cents: sign * capacityOf(id) })), lineCents };
}
