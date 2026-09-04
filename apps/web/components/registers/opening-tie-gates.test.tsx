// CB-AE2E-020 — the opening "Ties" banner was a FALSE GREEN.
//
// `approve_opening_seed` calls `clara._assert_opening_tie` (0017:3955), and that
// function raises on FOUR conditions (0017:3674-3697), in this order:
//
//   (i)   no TB target line exists for the seed at all      -> CLR31 tie_mismatch
//   (ii)  a target line is not mapped to an account_code    -> CLR31 tie_mismatch
//   (iii) any account is off its target (a nonzero delta)   -> CLR31 tie_mismatch
//   (iv)  opening-balance-equity does not net to zero       -> CLR31 obe_not_nil
//
// The strip rendered ONE of them — `obe_net_cents === 0` — under the words "Ties".
// So a seed with nothing keyed at all, whose OBE trivially nets zero because
// nothing has been posted, painted a quiet pass and then refused `tie_mismatch` on
// Approve. It also mislabelled the one gate it did render: the DB reports that arm
// as `obe_not_nil`, never as a tie.
//
// Every gate below is a boolean over a collection the DB already returned, or the
// DB's own signed `obe_net_cents` compared to zero — no numeral is minted here, and
// the tie itself is never re-derived (constraint 2).

import { test } from "node:test";
import assert from "node:assert/strict";

import { openingTieGates } from "./opening-dryrun-strip";
import type { OpeningDryrun, OpeningTbTargetRow } from "@/lib/registers/opening-types";

function dryrun(overrides: Partial<OpeningDryrun> = {}): OpeningDryrun {
  return {
    seed_id: "s1",
    as_of: "2026-01-01",
    obe_net_cents: 0,
    deltas: [],
    unmapped_labels: [],
    missing_must_asks: [],
    ...overrides,
  } as OpeningDryrun;
}

function target(lineKey: string): OpeningTbTargetRow {
  return {
    id: `t-${lineKey}`, firm_id: "f1", client_id: "c1", seed_id: "s1",
    line_key: lineKey, account_code: "1000", source_label: lineKey,
    debit_cents: 1000, credit_cents: 0, provenance_kind: "keyed",
    document_id: null, source_sha256: null, extraction_ref: null,
    entered_by: "u1", created_at: "2026-01-01T00:00:00Z",
  } as OpeningTbTargetRow;
}

function byKey(gates: ReturnType<typeof openingTieGates>) {
  return Object.fromEntries(gates.map((g) => [g.key, g.passed]));
}

test("CB-AE2E-020: a seed with ZERO targets and a nil OBE is NOT ready — the false green, caught", () => {
  const gates = openingTieGates(dryrun(), []);
  const passed = byKey(gates);
  assert.equal(passed.targetsPresent, false, "gate 1 is the one the old single-comparison banner could not see");
  assert.equal(passed.obeNil, true, "OBE nets zero trivially when nothing has been posted — which is exactly why it cannot stand alone");
  assert.equal(gates.every((g) => g.passed), false, "so the strip must NOT report ready");
});

test("CB-AE2E-020: an unmapped target line fails gate 2 while the others hold — discrimination, not a blanket red", () => {
  const gates = openingTieGates(
    dryrun({ unmapped_labels: [{ line_key: "cash", source_label: "Cash at bank" }] as never }),
    [target("cash")],
  );
  const passed = byKey(gates);
  assert.deepEqual(passed, { targetsPresent: true, allMapped: false, allTie: true, obeNil: true });
});

test("CB-AE2E-020: a nonzero delta fails gate 3 while gates 1, 2 and 4 pass", () => {
  const gates = openingTieGates(
    dryrun({ deltas: [{ account_code: "1000", target_debit: 1000, target_credit: 0, actual_debit: 900, actual_credit: 0, delta_debit: 100, delta_credit: 0 }] as never }),
    [target("cash")],
  );
  const passed = byKey(gates);
  assert.deepEqual(passed, { targetsPresent: true, allMapped: true, allTie: false, obeNil: true });
});

test("CB-AE2E-020: a nonzero OBE fails gate 4 — and it is named obe_not_nil, which is NOT a tie mismatch", () => {
  const gates = openingTieGates(dryrun({ obe_net_cents: -2500 }), [target("cash")]);
  const passed = byKey(gates);
  assert.deepEqual(passed, { targetsPresent: true, allMapped: true, allTie: true, obeNil: false });
  const obe = gates.find((g) => g.key === "obeNil");
  assert.equal(obe?.reason, "obe_not_nil", "the DB reports this arm under its OWN reason token, never tie_mismatch");
  for (const g of gates.filter((x) => x.key !== "obeNil")) {
    assert.equal(g.reason, "tie_mismatch", "the other three arms all raise CLR31 tie_mismatch");
  }
});

// MUST-NOT-RED CONTROL: all four satisfied is the ready state, and the gate ORDER
// is _assert_opening_tie's own.
test("CB-AE2E-020 control: all four satisfied reports ready, in the DB function's own order", () => {
  const gates = openingTieGates(dryrun(), [target("cash")]);
  assert.equal(gates.every((g) => g.passed), true);
  assert.deepEqual(gates.map((g) => g.key), ["targetsPresent", "allMapped", "allTie", "obeNil"]);
});
