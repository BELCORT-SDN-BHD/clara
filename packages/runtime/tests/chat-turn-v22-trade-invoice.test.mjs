// chatTurn_v22 — roster entries A1 (#982) and A2 (#1007) of the 2026-09-25 cut.
//
// TWO CONTRACTS ON ONE TOOL, APPLIED IN THE ORDER §1.10 FIXES: #982 first (the TIN resolves a
// party at the registration number's own tier, and the nineteenth refusal token), then #1007 (the
// duplicate probe, the question in the turn, and the acknowledgement written before the
// admission). Each counted from the SAME base of eighteen, which is the trap the cut plan names:
// applied together the map holds TWENTY-ONE tokens, not nineteen and not twenty.
//
// WHAT THIS FILE PROVES:
//   1. The successor carrier is a NEW module. `lib/trade-invoice-basis.ts` is frozen
//      (`frozen-workflows.json`) and stays byte-untouched; `lib/trade-invoice-basis.v2.ts` carries
//      the delta and re-exports everything unchanged BY REFERENCE.
//   2. The refusal map is twenty-one tokens, the eighteen predecessors byte-identical, and each of
//      the three new sentences matches `apps/web/messages/en.json` byte for byte.
//   3. `party_ambiguous` is NOT reworded and `party_identifier_conflict` is NOT collapsed into it.
//   4. The probe is called BEFORE the admission, with the door's own argument order, and a match
//      ASKS rather than refuses.
//   5. `record_anyway` is the only way past the question, it is tool-local, and it never reaches
//      the wire: `tradeInvoiceFromInput` is v1's, byte for byte, and the particulars the probe
//      sees are the particulars the door receives.
//   6. The prompt stanza says twenty-one, and says Clara never picks an identifier.
//
// NO DATABASE IS NEEDED HERE: every cell is over pure functions, module constants and source text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const v1 = await import("../lib/trade-invoice-basis.ts");
const v2 = await import("../lib/trade-invoice-basis.v2.ts");
const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");
const v22Prompt = await import("../workflows/chatTurn.v22.prompt.ts");

const en = JSON.parse(readFileSync(new URL("../../../apps/web/messages/en.json", import.meta.url), "utf8"));

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};

/** A well-formed supplier bill, the shape every cell below varies from. */
function bill(extra = {}) {
  return {
    kind: "supplier_bill",
    counterparty: { name: "Alpha Supplies Sdn Bhd" },
    document_date: "2026-03-04",
    due_date: null,
    due_date_source: "absent",
    reference: "ALPHA-2026-0042",
    currency: "MYR",
    total_cents: 106000,
    tax_facts: null,
    posting_date: "2026-03-04",
    memo: "March supplies",
    lines: [
      { account_code: "5100", debit_cents: 106000, credit_cents: 0, description: null },
      { account_code: "2100", debit_cents: 0, credit_cents: 106000, description: null },
    ],
    document_id: null,
    basis_origin: "clara_interpreted",
    ...extra,
  };
}

/** The file's CODE with comments stripped — a source pin that reads comments is not a source pin. */
function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// 1 · the map — TWENTY-ONE, and the eighteen are byte-identical
// ---------------------------------------------------------------------------

test("v22.trade-invoice: the refusal map is v1's EIGHTEEN plus exactly three, byte for byte", () => {
  const base = Object.keys(v1.TRADE_INVOICE_REFUSALS).sort();
  const cut = Object.keys(v2.TRADE_INVOICE_REFUSALS_V2).sort();
  assert.equal(base.length, 18, "v1's measured map, counted rather than read off a comment");
  assert.equal(cut.length, 21, "#982 adds one and #1007 adds two, both counting from eighteen");
  assert.deepEqual(cut.filter((k) => !base.includes(k)).sort(),
    ["nothing_acknowledged", "party_identifier_conflict", "unknown_acknowledged_invoice"]);
  assert.deepEqual(base.filter((k) => !cut.includes(k)), [], "no predecessor token is dropped");
  // EVERY INHERITED SENTENCE IS THE SAME STRING. #982's contract says so in as many words, and
  // `party_ambiguous` in particular must NOT be reworded: the door now raises it for a TIN as well
  // as a name, and one reason still names one thing.
  for (const key of base) {
    assert.equal(v2.TRADE_INVOICE_REFUSALS_V2[key], v1.TRADE_INVOICE_REFUSALS[key], key);
  }
  assert.equal(v2.TRADE_INVOICE_REFUSALS_V2.party_ambiguous, "More than one party answers to that name. Say which one.");
});

test("v22.trade-invoice: the three new sentences match apps/web/messages/en.json byte for byte", () => {
  // The file's own rule: "These strings are the SAME in the migration, in this module and in the
  // stanza." A surface that renders a different sentence for one reason is two answers to one
  // question.
  for (const key of ["party_identifier_conflict", "nothing_acknowledged", "unknown_acknowledged_invoice"]) {
    assert.equal(v2.TRADE_INVOICE_REFUSALS_V2[key], en.TradeInvoice.refusals[key], key);
  }
});

test("v22.trade-invoice: isTradeInvoiceRefusalV2 reads the NEW map's keys, not the frozen one's", () => {
  assert.equal(v2.isTradeInvoiceRefusalV2("party_identifier_conflict"), true);
  assert.equal(v2.isTradeInvoiceRefusalV2("nothing_acknowledged"), true);
  assert.equal(v2.isTradeInvoiceRefusalV2("unknown_acknowledged_invoice"), true);
  assert.equal(v1.isTradeInvoiceRefusal("party_identifier_conflict"), false, "the frozen map is untouched");
  assert.equal(v2.isTradeInvoiceRefusalV2("party_invented"), false);
});

// ---------------------------------------------------------------------------
// 2 · the zod input — the TIN tier, and the tool-local acknowledgement
// ---------------------------------------------------------------------------

test("v22.trade-invoice: only the TIN's describe moves; every other key is carried", () => {
  const before = v1.startTradeInvoiceWorkInputSchema.shape;
  const after = v2.startTradeInvoiceWorkInputSchemaV2.shape;
  assert.deepEqual(
    Object.keys(after).filter((k) => !Object.keys(before).includes(k)),
    ["record_anyway"],
    "#1007's question needs one tool-local flag and nothing else",
  );
  assert.deepEqual(Object.keys(before).filter((k) => !Object.keys(after).includes(k)), []);
  // The TIN's own description is the thing that changed, and it says what it now does.
  const tin = v2.tradeInvoicePartySchemaV2.shape.tin.description;
  assert.match(tin, /at the same tier as the registration number/);
  assert.match(tin, /party_identifier_conflict/);
  assert.doesNotMatch(tin, /it is not a lookup key/, "the v1 sentence is now false and must not survive");
});

test("v22.trade-invoice: the input stays `.strict()` and record_anyway is a boolean", () => {
  assert.equal(v2.startTradeInvoiceWorkInputSchemaV2.safeParse(bill()).success, true);
  assert.equal(v2.startTradeInvoiceWorkInputSchemaV2.safeParse(bill({ record_anyway: true })).success, true);
  assert.equal(v2.startTradeInvoiceWorkInputSchemaV2.safeParse(bill({ record_anyway: "yes" })).success, false);
  // A model may not name the rows it was shown: the shown ids are the TOOL's own measurement, and
  // a uuid a model supplied is a uuid nobody checked.
  assert.equal(
    v2.startTradeInvoiceWorkInputSchemaV2.safeParse(bill({ acknowledged_invoice_ids: [] })).success,
    false,
  );
});

test("v22.trade-invoice: record_anyway does NOT move the intent key — two calls, one recording", () => {
  // ADV-C1-01/ADV-C1-08 (cut-phase adversarial round). The sibling cell below proves the flag is
  // absent from `p_particulars`; it says nothing about `p_intent_key`, which is the value that
  // decides whether the admission door REPLAYS or admits a second invoice. The question the tool
  // asks and the "go ahead" that answers it are ONE recording, so they must carry ONE key: the
  // flag is the person's answer to a question, never part of what is being recorded.
  const plain = v22Tools.tradeInvoiceIntentKeyV22(CTX.taskId, bill());
  const acknowledged = v22Tools.tradeInvoiceIntentKeyV22(CTX.taskId, bill({ record_anyway: true }));
  assert.equal(acknowledged, plain,
    "record_anyway must not mint a second idempotency key for the same invoice");
  // …and the key still moves for a change to the recording ITSELF, or the assertion above would
  // be satisfied by a key that hashes nothing.
  assert.notEqual(v22Tools.tradeInvoiceIntentKeyV22(CTX.taskId, bill({ total_cents: 106001 })), plain);
  assert.notEqual(v22Tools.tradeInvoiceIntentKeyV22(CTX.taskId, bill({ reference: "ALPHA-2026-0043" })), plain);
});

test("v22.trade-invoice: record_anyway is absent from the particulars the door receives", () => {
  // TITLE NARROWED to what this cell measures (ADV-C1-08): it proves the flag's absence from
  // `p_particulars` and NOTHING about `p_intent_key`. The key is the cell above.
  // The particulars the probe sees are byte-identical to the particulars the door receives, and
  // neither carries the flag. `tradeInvoiceFromInput` is the FROZEN v1 function, reached by
  // reference rather than re-spelled.
  assert.equal(v2.tradeInvoiceFromInput, v1.tradeInvoiceFromInput);
  const withFlag = v2.tradeInvoiceFromInput(bill({ record_anyway: true }));
  const without = v2.tradeInvoiceFromInput(bill());
  assert.deepEqual(withFlag, without);
  assert.equal(Object.prototype.hasOwnProperty.call(withFlag, "record_anyway"), false);
});

// ---------------------------------------------------------------------------
// 3 · the probe, the question, and the acknowledgement
// ---------------------------------------------------------------------------

test("v22.trade-invoice: a match ASKS; it never refuses and it writes nothing", () => {
  const asked = v2.duplicateQuestion({
    match_count: 1,
    counterparty_name: "Alpha Supplies Sdn Bhd",
    matches: [{
      invoice_id: "65509aaa-0000-4000-8000-000000000001",
      reference: "ALPHA-2026-0042",
      document_date: "2026-03-04",
      total_cents: 106000,
      signals: ["same_reference"],
      state: "posted",
    }],
  });
  assert.equal(asked.ok, true, "the owner's ruling: a look-alike is a question, never a refusal");
  assert.equal(asked.status, "duplicates_found");
  assert.equal(asked.match_count, 1);
  // THE FIGURES ARE THE PROBE'S. A question that hid them would make the person answer blind.
  assert.equal(asked.matches[0].reference, "ALPHA-2026-0042");
  assert.equal(asked.matches[0].total_cents, 106000);
  assert.match(asked.question, /ALPHA-2026-0042/);
  assert.match(asked.question, /Record this one anyway, or stop\?/);
});

test("v22.trade-invoice: the acknowledged ids are the PROBE's own, in the probe's own order", () => {
  const shown = v2.shownInvoiceIds({
    matches: [
      { invoice_id: "65509aaa-0000-4000-8000-000000000001" },
      { invoice_id: "65509aaa-0000-4000-8000-000000000002" },
      { invoice_id: null },
    ],
  });
  assert.deepEqual(shown, [
    "65509aaa-0000-4000-8000-000000000001",
    "65509aaa-0000-4000-8000-000000000002",
  ], "a match with no invoice id is not acknowledged: the door would answer unknown_acknowledged_invoice");
  assert.deepEqual(v2.shownInvoiceIds({ matches: [] }), []);
  assert.deepEqual(v2.shownInvoiceIds(null), []);
});

test("v22.trade-invoice: the tool calls the probe, then the ack, then the admission — in that order", () => {
  const src = codeOf(new URL("../workflows/chatTurn.v22.tools.ts", import.meta.url));
  const probe = src.indexOf("clara.probe_trade_invoice_duplicates_for");
  const ack = src.indexOf("clara.record_trade_invoice_duplicate_ack");
  const admit = src.indexOf("clara.admit_trade_invoice_work");
  assert.ok(probe > 0 && ack > probe && admit > ack, "the acknowledgement is written BEFORE the admission");
  // The probe's argument order is the door's own, and the fourth argument is the SAME object the
  // door will receive (`wave3-lane02-fix.md` amendment 1).
  assert.match(src, /probe_trade_invoice_duplicates_for\(\$1::uuid, \$2::uuid, \$3::text, \$4::jsonb\)/);
  assert.match(src, /record_trade_invoice_duplicate_ack\(\$1::uuid, \$2::uuid, \$3::text, \$4::text,\s*"?\s*\+?\s*"?\s*\$5::jsonb, \$6::jsonb\)/);
});

// ---------------------------------------------------------------------------
// 4 · the roster and the prompt
// ---------------------------------------------------------------------------

test("v22.trade-invoice: v22 serves start_trade_invoice_work from its OWN schema", () => {
  const built = v22Tools.buildToolsV22(CTX, "gpt-5.6-terra", 0);
  assert.ok(built.start_trade_invoice_work, "the name is unchanged: a widened argument is not a new act");
  assert.equal(built.start_trade_invoice_work.inputSchema, v2.startTradeInvoiceWorkInputSchemaV2);
});

test("v22.trade-invoice: the stanza says TWENTY-ONE and refuses to collapse the conflict", () => {
  const stanza = v22Prompt.TRADE_INVOICE_V22_CHAT_GUIDANCE;
  assert.match(stanza, /twenty-one/i, "#982's contract: the refusal-map sentence must read the applied count");
  assert.doesNotMatch(stanza, /\bnineteen\b/i, "nineteen counted #1007 out; twenty counted #982 out");
  // #982: the TIN resolves at the registration number's own tier, and Clara never picks between
  // two identifiers that disagree.
  assert.match(stanza, /tax identification number/i);
  assert.match(stanza, /never pick/i);
  // #1007: ask before recording a look-alike, and keep the choice with the recording.
  assert.match(stanza, /ask whether to record this one[\s\S]{0,8}anyway/i);
  assert.match(stanza, /record_anyway/);
  assert.match(stanza, /never refuse it yourself/i);
  assert.ok(v22Prompt.SYSTEM_PROMPT_V22.includes(stanza), "the stanza is in the prompt the model reads");
});
