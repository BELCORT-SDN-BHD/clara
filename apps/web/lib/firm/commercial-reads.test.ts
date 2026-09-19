// #635 — the three doors' names and their positive-shape decoders.
//
// AN UNREADABLE ROW IS DROPPED, NEVER HALF-RENDERED — `lib/registration/legal-reads.ts:100-119`'s
// discipline, copied deliberately rather than re-invented. The three SCALARS on the standing
// payload are different: a missing `standing_live` drops the WHOLE payload, because there is no
// honest default (false paints the alarming face on a read failure; true hides a real
// withdrawal).

import test from "node:test";
import assert from "node:assert/strict";

import {
  FIRM_AI_USAGE_DOOR,
  FIRM_COMMERCIAL_STATE_DOOR,
  FIRM_LEGAL_STANDING_DOOR,
  decodeFirmCommercialState,
  decodeFirmLegalStanding,
  decodeFirmUsageRow,
  decodeFirmUsageRows,
} from "./commercial-reads";

const DOC = {
  kind: "terms",
  version: 2,
  status: "published",
  title: "Terms of Service (Clara beta)",
  effective_from: "2026-09-12T16:00:00.000Z",
  published_at: "2026-09-18T13:46:54.777Z",
  firm_accepted: true,
  accepted_at: "2026-09-19T01:00:00.000Z",
  accepted_by: "11111111-1111-4111-8111-111111111111",
  accepted_by_name: "Alice Tan",
  my_accepted_version: 2,
  my_accepted_at: "2026-09-19T01:00:00.000Z",
};

const DPA = { ...DOC, kind: "dpa", title: "Data processing agreement", my_accepted_version: null, my_accepted_at: null };

test("p635.reads.door_names the three doors are spelled exactly as migration 0233 creates them", () => {
  assert.equal(FIRM_LEGAL_STANDING_DOOR, "get_firm_legal_standing");
  assert.equal(FIRM_COMMERCIAL_STATE_DOOR, "get_firm_commercial_state");
  assert.equal(FIRM_AI_USAGE_DOOR, "get_firm_ai_usage");
});

test("p635.reads.standing_decodes and orders terms before the DPA, whatever order the door returned", () => {
  const decoded = decodeFirmLegalStanding({
    documents: [DPA, DOC],
    standing_live: true,
    can_accept_for_firm: true,
    masked: false,
  });
  assert.ok(decoded);
  assert.deepEqual(decoded.documents.map((d) => d.kind), ["terms", "dpa"],
    "LEGAL_KINDS' own order — the order the signup stage presents them in, not a second idea of it");
  assert.equal(decoded.standingLive, true);
  assert.equal(decoded.documents[0]!.acceptedByName, "Alice Tan");
  assert.equal(decoded.documents[1]!.myAcceptedVersion, null);
});

test("p635.reads.standing_drops_unreadable_row an entry this build cannot read is dropped, and the rest still renders", () => {
  const decoded = decodeFirmLegalStanding({
    documents: [DOC, { ...DPA, version: "two" }],
    standing_live: false,
    can_accept_for_firm: false,
    masked: true,
  });
  assert.ok(decoded);
  assert.deepEqual(decoded.documents.map((d) => d.kind), ["terms"],
    "a standing card that painted a partial row would be telling a firm something it could not vouch for");
});

test("p635.reads.standing_requires_its_scalars a payload missing standing_live is not rendered at all", () => {
  assert.equal(decodeFirmLegalStanding({ documents: [DOC], can_accept_for_firm: true, masked: false }), null,
    "there is no honest default: false paints the alarm on a read failure, true hides a real withdrawal");
  assert.equal(decodeFirmLegalStanding({ documents: [DOC], standing_live: true, masked: false }), null);
  assert.equal(decodeFirmLegalStanding({ documents: [DOC], standing_live: true, can_accept_for_firm: true }), null);
  assert.equal(decodeFirmLegalStanding(null), null);
  assert.equal(decodeFirmLegalStanding("nope"), null);
});

test("p635.reads.standing_masked_nulls a masked attribution decodes as NULL and firm_accepted survives it", () => {
  const decoded = decodeFirmLegalStanding({
    documents: [{ ...DOC, accepted_at: null, accepted_by: null, accepted_by_name: null }],
    standing_live: true,
    can_accept_for_firm: false,
    masked: true,
  });
  assert.ok(decoded);
  assert.equal(decoded.masked, true);
  assert.equal(decoded.documents[0]!.firmAccepted, true,
    "WHETHER the firm accepted is not masked; only WHO and WHEN are");
  assert.equal(decoded.documents[0]!.acceptedBy, null);
});

const COMMERCIAL = {
  firm: { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "Tan & Partners", created_at: "2026-01-02T00:00:00.000Z", is_operator: false },
  plan: { local_key: "clara-beta-2026", name: "Clara Beta", currency: "MYR", amount_cents: 0, amounts_ruled: false },
  payment: { recorded: false, recorded_at: null, subscription_present: false, customer_present: false },
  invoices: { available: false, reason: "not_collected" },
  capacity: { docs_per_day: null, pages_per_day: null, ocr_concurrency: null, llm_witness_concurrency: null, source: "firm_document_limits" },
};

test("p635.reads.commercial_decodes the unruled plan, the absent payment and the null capacity all travel as themselves", () => {
  const decoded = decodeFirmCommercialState(COMMERCIAL);
  assert.ok(decoded);
  assert.equal(decoded.plan?.amountsRuled, false, "the render condition, carried as data");
  assert.equal(decoded.plan?.amountCents, 0);
  assert.equal(decoded.payment.recorded, false);
  assert.equal(decoded.invoices.reason, "not_collected");
  assert.equal(decoded.capacity.docsPerDay, null,
    "a firm with no firm_document_limits row has no STORED cap — the column defaults are not this firm's numbers");
  assert.equal(decoded.capacity.source, "firm_document_limits");
});

test("p635.reads.commercial_bigint_amount a bigint arriving as a string still decodes, and a nonsense one drops the payload", () => {
  const asString = decodeFirmCommercialState({ ...COMMERCIAL, plan: { ...COMMERCIAL.plan, amount_cents: "19900", amounts_ruled: true } });
  assert.equal(asString?.plan?.amountCents, 19900, "PostgREST may send a bigint as a string");
  assert.equal(decodeFirmCommercialState({ ...COMMERCIAL, plan: { ...COMMERCIAL.plan, amount_cents: "lots" } }), null,
    "a NaN in a money position is never rendered — the whole payload drops instead");
  assert.equal(decodeFirmCommercialState({ ...COMMERCIAL, firm: { ...COMMERCIAL.firm, id: "" } }), null);
  assert.equal(decodeFirmCommercialState({ plan: COMMERCIAL.plan }), null, "a payload missing a whole section is not half-rendered");
});

const USAGE = {
  scope: "firm",
  call_kind: "chat",
  calls: "12",
  input_tokens: "3000000",
  output_tokens: "400000",
  priced_calls: "10",
  unpriced_calls: "2",
  spend_cents: "340",
  price_currency: "USD",
};

test("p635.reads.usage_decodes bigint counts arrive as strings and decode to safe integers", () => {
  const decoded = decodeFirmUsageRow(USAGE);
  assert.ok(decoded);
  assert.equal(decoded.calls, 12);
  assert.equal(decoded.inputTokens, 3_000_000);
  assert.equal(decoded.unpricedCalls, 2);
  assert.equal(decoded.priceCurrency, "USD",
    "carried per row, not hoisted to a constant this module believes — a widening of 0110:497's CHECK must arrive as data");
});

test("p635.reads.usage_drops_unreadable a row whose numbers cannot be read is dropped, never silently zeroed, and the DROP IS COUNTED", () => {
  const table = decodeFirmUsageRows([USAGE, { ...USAGE, calls: "many" }, { ...USAGE, scope: "elsewhere" }, null]);
  assert.ok(table);
  assert.equal(table.rows.length, 1,
    "a table with one silently-zeroed row is worse than one missing it: the total would look complete");
  assert.equal(table.rows[0]!.scope, "firm");
  // FIX ROUND 1 (adversarial A4). A table missing a row reads as COMPLETE, which is the same
  // defect one step further along. The count comes back so the card can say so beside the money
  // column and the CSV can carry it, exactly as `unpriced_calls` already is.
  assert.equal(table.dropped, 3, "three rows this build could not read, counted rather than forgotten");
});

test("p635.reads.usage_not_a_table a payload that is not a table is a FAILURE, never an empty period", () => {
  // `[]` for a refusal-shaped or otherwise unreadable payload made the card render its named
  // zero — "No model calls in this period." — for a read that did not happen. The two sibling
  // reads throw; so does this one now.
  assert.equal(decodeFirmUsageRows("nope"), null);
  assert.equal(decodeFirmUsageRows({ code: "CLR99", message: "boom" }), null);
  assert.deepEqual(decodeFirmUsageRows([]), { rows: [], dropped: 0 },
    "an EMPTY table is still a table: a month with no calls is a real, complete answer");
});

// ───────────────────────────────────────────────────────────────────────────
// FIX ROUND 1 — NO CURRENT PLAN (adversarial A6). `uq_billing_plans_current`
// (0163:207) caps the current plan at one row and permits ZERO; the door's
// `select ... where b.is_current` into a record then yields a plan whose every
// column is NULL. Dropping the whole payload for it turned an ABSENCE into a
// transport failure and took the payment, the invoice explanation, the four
// capacity numbers and the identity card's "In Clara since" down with it.
// ───────────────────────────────────────────────────────────────────────────

test("p635.reads.commercial_no_current_plan is an absence with a shape, not a dropped payload", () => {
  const decoded = decodeFirmCommercialState({
    ...COMMERCIAL,
    plan: { local_key: null, name: null, currency: null, amount_cents: null, amounts_ruled: false },
  });
  assert.ok(decoded, "the rest of the answer is perfectly readable and must survive");
  assert.equal(decoded.plan, null, "no plan is current — said as itself, never as a failure");
  assert.equal(decoded.payment.recorded, false);
  assert.equal(decoded.invoices.reason, "not_collected");
  assert.equal(decoded.firm.name, "Tan & Partners", "the identity card rides this answer too");
});

test("p635.reads.commercial_half_a_plan still drops the payload", () => {
  // A plan with a NAME but no currency is not an absence; it is a payload this build cannot
  // read, and half-rendering a money row is the defect the decoder exists to refuse.
  assert.equal(
    decodeFirmCommercialState({ ...COMMERCIAL, plan: { local_key: "x", name: "Clara Beta", currency: null, amount_cents: null, amounts_ruled: false } }),
    null,
  );
});
