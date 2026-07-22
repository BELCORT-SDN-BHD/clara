// §6.2 direction-aware vocabulary. The entry's `coding_kind` fixes the transaction
// direction; the counterparty / document nouns follow. Where direction is genuinely
// unknowable — a generic journal_entry, a NULL-kind voucher, or a pre-0016 payload
// that predates the field — directionOf → null and every caller keeps the house
// AP-loop default (vendor / bill) wording, never a guess.

export type Direction = "sales" | "purchase";

/** Sales for a sales invoice / sales credit note; purchase for a supplier bill.
 *  Anything else (journal_entry, null, an unknown kind) → null (unknowable). */
export function directionOf(codingKind: string | null | undefined): Direction | null {
  if (codingKind === "sales_invoice" || codingKind === "sales_credit_note") return "sales";
  if (codingKind === "supplier_bill") return "purchase";
  return null;
}

/** The counterparty noun. A null direction keeps the AP default (vendor). */
export function counterpartyNoun(direction: Direction | null): "customer" | "vendor" {
  return direction === "sales" ? "customer" : "vendor";
}

/** The source-document noun. A null direction keeps the AP default (bill). */
export function docNoun(direction: Direction | null): "invoice" | "bill" {
  return direction === "sales" ? "invoice" : "bill";
}
