// C6 — the two bank payload readers. The load-bearing cells are the REFUSALS: this
// module's whole job is deciding what may reach a screen out of a jsonb blob, and a
// reader that admits too much would put an unvouched figure in front of a bookkeeper.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BANK_PACK_SCHEMA, LEDGER_FIELD_CAP, bankPackBudget, ledgerTextFields } from "./bankPayload";

/** The shape `clara._agent_get_bank_pack_core` actually returns
 *  (0121_f_a3_pr1b_agent_limb.sql builds `schema` + `budget` + the rest, then appends
 *  `digest`). Transcribed from the migration, never from what a card would like. */
const LIVE_PACK = {
  schema: BANK_PACK_SCHEMA,
  bank_account: { id: "acct-1" },
  statement: null,
  lines: [],
  candidates: [],
  open_items: [],
  learned_payers: { not_implemented: true },
  recon_terms: { not_implemented: true },
  open_proposals: [],
  budget: { lines: 12, candidates: 4, truncated: false },
  digest: "deadbeef",
};

describe("bankPackBudget", () => {
  it("reads the DB's own two counts and the truncation flag out of a live pack", () => {
    assert.deepEqual(bankPackBudget(LIVE_PACK), { lines: 12, candidates: 4, truncated: false });
  });

  it("refuses a payload that does not DECLARE the schema, even when it looks right", () => {
    // Spelling is not identity, applied to a shape: a `budget` that happens to have the
    // right fields is not evidence the producer is the one whose contract we read. The
    // check is on the DB's own version token.
    const undeclared = { ...LIVE_PACK, schema: undefined };
    assert.equal(bankPackBudget(undeclared), null);
    assert.equal(bankPackBudget({ ...LIVE_PACK, schema: "clara.bank-pack/v2" }), null);
    // The catalog's older hand-written fixture is exactly this case, and it must stay
    // unreadable rather than be duck-typed into something to render.
    assert.equal(bankPackBudget({ lines: 12 }), null);
  });

  it("refuses a HALF-PRESENT budget rather than showing one count beside a blank", () => {
    // "12 unmatched lines" with no candidate count reads as "and no candidates", which
    // is a claim about the ledger that a missing field does not support.
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { lines: 12, truncated: false } }), null);
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { candidates: 4, truncated: false } }), null);
  });

  it("refuses a non-numeric or non-finite count instead of formatting it", () => {
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { lines: "12", candidates: 4 } }), null);
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { lines: Number.NaN, candidates: 4 } }), null);
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { lines: 12, candidates: Number.POSITIVE_INFINITY } }), null);
  });

  it("keeps `truncated` THREE-VALUED — an absent flag is not evidence of completeness", () => {
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { lines: 1, candidates: 1 } })?.truncated, null);
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { lines: 1, candidates: 1, truncated: "yes" } })?.truncated, null);
    assert.equal(bankPackBudget({ ...LIVE_PACK, budget: { lines: 1, candidates: 1, truncated: true } })?.truncated, true);
  });

  it("fails closed on anything that is not an object at all", () => {
    for (const bad of [null, undefined, "pack", 7, [LIVE_PACK], true]) {
      assert.equal(bankPackBudget(bad), null, `${JSON.stringify(bad)} must not be read as a pack`);
    }
  });
});

describe("ledgerTextFields", () => {
  it("renders the ledger's own string and boolean leaves, keyed by the DB's field names", () => {
    // `_agent_match_bank_line_core` returns the delegate's row; `match_id` is its
    // identifier for this verb (0121).
    assert.deepEqual(
      ledgerTextFields({ match_id: "match-1", status: "live", reversed: false }),
      [["match_id", "match-1"], ["reversed", "false"], ["status", "live"]],
    );
  });

  it("drops a numeral that arrived as a STRING — the live settle return, verbatim", () => {
    // THE CELL A MUTANT PANEL DID NOT ASK FOR AND A REVIEWER DID. This is not a
    // hypothetical payload: `clara._settle_from_bank_line_core`'s `_finish_op` object
    // (0121_f_a3_pr1b_agent_limb.sql:1628) builds `'group_id', v_res->>'group_id',
    // 'residue_cents', v_res->>'residue_cents'` — `->>` returns TEXT — and returns it
    // through `wake_settle_from_bank_line` to `classifyBankResult`, which puts it on the
    // wire as `bank_act.result`. A type-based filter printed the cents figure.
    const settleReturn = {
      match_id: "m-1",
      status: "live",
      group_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      residue_cents: "1250",
    };
    const fields = ledgerTextFields(settleReturn);
    const keys = fields.map(([k]) => k);
    assert.equal(keys.includes("residue_cents"), false, "a figure that arrived as text is still a figure");
    assert.equal(JSON.stringify(fields).includes("1250"), false);
    // And the three that SHOULD survive do — the uuid especially, which is full of
    // digits and must not be caught by the numeral guard.
    assert.deepEqual(keys.sort(), ["group_id", "match_id", "status"]);
    assert.equal(fields.find(([k]) => k === "group_id")?.[1], "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  });

  it("drops numeric text in every shape a ledger might format it in, and keeps ids that merely contain digits", () => {
    const dropped = ledgerTextFields({
      plain: "1250", signed: "-1250", positive: "+7", grouped: "12,500", decimal: "12500.00", mixed: "1_000",
    });
    assert.deepEqual(dropped, [], `nothing numeric may survive: ${JSON.stringify(dropped)}`);

    // MUST-NOT-DROP: identifiers, op keys and tokens are full of digits and are the whole
    // point of this block. A guard that ate them would be worse than the defect.
    const kept = ledgerTextFields({
      op_key: "bank-settle_from_bank_line:task-1:0:{}",
      entry_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      account_code: "620-000",
      status: "live",
      period: "2026-08",
      version: "v1.2",
    }).map(([k]) => k);
    assert.deepEqual(kept.sort(), ["account_code", "entry_id", "op_key", "period", "status", "version"]);
  });

  it("NEVER renders a numeral out of this payload — the structural half of constraint 2", () => {
    // `result` carries no version token, so nothing here can vouch for a figure inside
    // it. Dropping every numeral is what makes that guarantee hold for payloads no one
    // has written yet, rather than for the ones that exist today.
    const fields = ledgerTextFields({ match_id: "m-1", matched_cents: 12_500, lines: 3 });
    assert.deepEqual(fields, [["match_id", "m-1"]]);
    assert.equal(JSON.stringify(fields).includes("12500"), false);
    assert.equal(JSON.stringify(fields).includes("3"), false);
  });

  it("never walks a nested object or array — `[object Object]` is not a rendering", () => {
    assert.deepEqual(ledgerTextFields({ rung_vector: { m11: "pass" }, entries: ["e-1"], id: "x" }), [["id", "x"]]);
  });

  it("drops null, undefined and whitespace-only values rather than showing an empty row", () => {
    assert.deepEqual(ledgerTextFields({ a: null, b: undefined, c: "   ", d: "" , e: "kept" }), [["e", "kept"]]);
  });

  it("sorts by key so the same payload always renders in the same order", () => {
    // A jsonb object's key order is not a contract, and a card that reshuffles between
    // renders of the same receipt looks like a receipt that changed.
    assert.deepEqual(
      ledgerTextFields({ zebra: "z", alpha: "a" }).map(([k]) => k),
      ledgerTextFields({ alpha: "a", zebra: "z" }).map(([k]) => k),
    );
  });

  it("caps the field count so a future verb's larger return cannot become a data dump", () => {
    const wide = Object.fromEntries(Array.from({ length: LEDGER_FIELD_CAP + 5 }, (_, i) => [`f${i + 10}`, `v${i}`]));
    assert.equal(ledgerTextFields(wide).length, LEDGER_FIELD_CAP);
  });

  it("fails closed on anything that is not an object at all", () => {
    for (const bad of [null, undefined, "result", 7, ["a"], true]) {
      assert.deepEqual(ledgerTextFields(bad), [], `${JSON.stringify(bad)} must yield no fields`);
    }
  });
});
