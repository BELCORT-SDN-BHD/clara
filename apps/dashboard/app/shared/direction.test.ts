// §6.2 direction-aware vocabulary tests (pure). directionOf maps coding_kind → the
// transaction direction; the nouns follow. Where direction is unknowable the helpers
// keep the AP-loop default (vendor / bill) — never a guess. Also covers the two
// direction-parameterized copy helpers (lane reasons + CLR21) that keep their Record
// exports compatible for existing callers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { directionOf, counterpartyNoun, docNoun } from "./direction";
import { laneReasonCopy, LANE_REASON_COPY } from "./reviewCardTypes";
import { clr21Copy, CLR21_COPY } from "../chat/reviewCopy";

test("directionOf maps sales kinds to sales, supplier_bill to purchase, else null", () => {
  assert.equal(directionOf("sales_invoice"), "sales");
  assert.equal(directionOf("sales_credit_note"), "sales");
  assert.equal(directionOf("supplier_bill"), "purchase");
  assert.equal(directionOf("journal_entry"), null); // generic voucher — unknowable
  assert.equal(directionOf(null), null);
  assert.equal(directionOf(undefined), null);
  assert.equal(directionOf("something_new"), null);
});

test("counterpartyNoun: sales → customer; purchase/null → vendor (the AP default)", () => {
  assert.equal(counterpartyNoun("sales"), "customer");
  assert.equal(counterpartyNoun("purchase"), "vendor");
  assert.equal(counterpartyNoun(null), "vendor");
});

test("docNoun: sales → invoice; purchase/null → bill (the AP default)", () => {
  assert.equal(docNoun("sales"), "invoice");
  assert.equal(docNoun("purchase"), "bill");
  assert.equal(docNoun(null), "bill");
});

test("laneReasonCopy swaps vendor→customer for sales, keeps current wording otherwise", () => {
  assert.equal(laneReasonCopy("vendor_unresolved", "sales"), "customer not resolved");
  assert.equal(laneReasonCopy("vendor_ambiguous", "sales"), "customer is ambiguous — confirm identity");
  // purchase + null keep the Record wording (vendor) — the existing callers are stable.
  assert.equal(laneReasonCopy("vendor_unresolved", "purchase"), LANE_REASON_COPY.vendor_unresolved);
  assert.equal(laneReasonCopy("vendor_unresolved", null), LANE_REASON_COPY.vendor_unresolved);
  assert.equal(laneReasonCopy("already_coded", "sales"), LANE_REASON_COPY.already_coded); // non-vendor reason unchanged
  assert.equal(laneReasonCopy("unknown_token", null), "unknown_token"); // unknown → echoed
  // 0049 — the abstain token must NOT fall through to the echo above. queueKindCatalog renders
  // every reason through this function, so a missing entry puts the raw token on a human card.
  assert.notEqual(laneReasonCopy("direction_unresolved", null), "direction_unresolved");
  assert.equal(laneReasonCopy("direction_unresolved", "sales"), LANE_REASON_COPY.direction_unresolved);
});

test("clr21Copy swaps the vendor noun for sales, else matches CLR21_COPY", () => {
  assert.ok(clr21Copy("vendor_malformed", "sales")?.includes("customer"));
  assert.ok(!clr21Copy("vendor_malformed", "sales")?.includes("vendor"));
  assert.equal(clr21Copy("vendor_malformed", "purchase"), CLR21_COPY.vendor_malformed);
  assert.equal(clr21Copy("vendor_malformed", null), CLR21_COPY.vendor_malformed);
  assert.equal(clr21Copy("amount_conflict", "sales"), CLR21_COPY.amount_conflict); // non-vendor discriminant unchanged
});

// 0016 raises ONE duplicate token per direction — duplicate_bill is gated on
// coding_kind='supplier_bill', duplicate_sales on the sales kinds — so each token owns
// its own nouns and neither is remapped by direction.
test("the duplicate discriminants are per-direction tokens, not a direction remap", () => {
  const bill = CLR21_COPY.duplicate_bill;
  assert.ok(bill?.includes("vendor") && bill?.includes("bill"), "duplicate_bill keeps AP nouns");
  const sales = CLR21_COPY.duplicate_sales;
  assert.ok(sales?.includes("customer") && sales?.includes("invoice"), "duplicate_sales speaks AR");
  // A sales direction never rewrites duplicate_bill — the DB cannot raise that pair.
  assert.equal(clr21Copy("duplicate_bill", "sales"), bill);
  assert.equal(clr21Copy("duplicate_sales", "sales"), sales);
  assert.equal(clr21Copy("duplicate_sales", null), sales); // guidance renders without a known direction
});
