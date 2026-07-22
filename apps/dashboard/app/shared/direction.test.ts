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
});

test("clr21Copy swaps vendor/bill nouns for sales, else matches CLR21_COPY", () => {
  assert.ok(clr21Copy("vendor_malformed", "sales")?.includes("customer"));
  assert.ok(!clr21Copy("vendor_malformed", "sales")?.includes("vendor"));
  const dup = clr21Copy("duplicate_bill", "sales");
  assert.ok(dup?.includes("invoice") && dup?.includes("customer"));
  assert.equal(clr21Copy("vendor_malformed", "purchase"), CLR21_COPY.vendor_malformed);
  assert.equal(clr21Copy("vendor_malformed", null), CLR21_COPY.vendor_malformed);
  assert.equal(clr21Copy("amount_conflict", "sales"), CLR21_COPY.amount_conflict); // non-vendor discriminant unchanged
});
