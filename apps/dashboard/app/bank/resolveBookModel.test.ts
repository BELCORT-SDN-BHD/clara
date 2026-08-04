// The AF-2 admission predicate — the round-3 walled-corridor fix's own battery.
//
// WHY THIS FILE EXISTS. The as-built ladder has caught the same defect shape
// three rounds running: something PROMISED an outcome by hand-deriving the
// admission logic of the act that would deliver it, and the hand-derivation
// drifted. Round 3's dashboard instance: a button labelled "Declare only
// (high-stakes park)" that sent neither `p_draft` nor `p_allocations` and so
// refused EVERY click.
//
// Round 3 also ruled that round 2's own cell "walks only the corridor the fix
// took, which is why 115/115 is green". So these cells deliberately do NOT just
// walk the six axes one at a time. They ask the CLASS questions:
//   · can the promise and the gate DISAGREE? (a property over a request table,
//     not a per-case assertion)
//   · can ANY refusal this predicate emits reach a user as a raw token? (a loop
//     over the predicate's OWN outputs, not a hardcoded gloss list)
//   · is the ORDER right? (round 1's defect was an arm ORDER, not an arm)
//   · can a request the predicate admits still be the WRONG-shaped one? (the
//     subset honesty: it must not claim to answer stateful questions)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  af2Admission, af2AdmissionBlockReason, settlementAllocationInputs, settlementLegInitialState,
  settlementLegReducer, type Af2Request, type SettlementLegAction, type SettlementLegState,
} from "./resolveBookModel";
import {
  describeBankRefusal, BANK_REFUSAL_AXIS_COPY, parseRefusalAxis, refundSubmitBlock,
  REFUND_SUBMIT_BLOCKED_MESSAGE,
} from "./matchModel";
import type { OpenItemRow } from "./model";
import { resolveAndBookBankLine } from "../shared/reconApi";
import type { PgrestError } from "../shared/wire";

const OK_DRAFT = {
  posting_date: "2035-01-15", memo: "unidentified deposit",
  lines: [
    { account_code: "170-B42", debit_cents: 100000, credit_cents: 0 },
    { account_code: "400-D42", debit_cents: 0, credit_cents: 100000 },
  ],
};
const ITEM = "0d87188e-645a-453a-953f-71df97773db7";
const OK_ALLOC = [{ item_id: ITEM, amount_cents: 100000 }];

function req(over: Partial<Af2Request> = {}): Af2Request {
  return { disposition: "matched_booking", note: "the deposit is ACME's invoice 42", ...over };
}

// ===========================================================================
// THE DEFECT ITSELF, pinned against the DB's own verbatim reply.
// ===========================================================================

/** Captured 2026-08-03 by calling clara.resolve_and_book_bank_line on a rig
 *  carrying 0042 sha a779171a with EXACTLY the payload the dead "Declare only
 *  (high-stakes park)" button sent (draft null, allocations null, no
 *  ancillaries). Not shaped by hand — a hand-shaped fixture would reproduce the
 *  guess rather than the contract. */
const DB_DECLARE_ONLY_REFUSAL = {
  code: "CLR10",
  details: '{"reason":"booking_request_invalid","axis":"no_booking"}',
  message: "resolve_and_book must book something: name p_draft (a hand-coded entry) or a non-empty p_allocations (an open-item settlement, whose counterparty this verb derives from the items named)",
};

test("[round-3 RED] the dead 'declare only' payload is inadmissible, on the axis the DB really raised", () => {
  const a = af2Admission(req({ draft: null, allocations: null, adjustments: null, chargeCents: 0, chargeAccount: null }));
  assert.equal(a.admitted, false);
  assert.equal(a.admitted === false && a.reason, "booking_request_invalid");
  assert.equal(a.admitted === false && a.axis, "no_booking");
  // …and those are byte-identical to what the shipped verb answered.
  const dbDetail = JSON.parse(DB_DECLARE_ONLY_REFUSAL.details) as { reason: string; axis: string };
  assert.equal(a.admitted === false && a.reason, dbDetail.reason);
  assert.equal(a.admitted === false && a.axis, dbDetail.axis);
});

test("[round-3] the DB's OWN refusal envelope now glosses — no raw token can reach the user", () => {
  const reason = parseReason(DB_DECLARE_ONLY_REFUSAL.details);
  const axis = parseRefusalAxis(DB_DECLARE_ONLY_REFUSAL.details);
  assert.equal(reason, "booking_request_invalid");
  assert.equal(axis, "no_booking");
  const gloss = describeBankRefusal(reason, axis);
  assert.ok(gloss && gloss.length > 20, "before this round `booking_request_invalid` had NO entry at all");
  assert.match(gloss as string, /park is not a separate act/i, "the gloss must correct the mental model, not just restate the token");
});

function parseReason(details: string): string | null {
  return (JSON.parse(details) as { reason?: string }).reason ?? null;
}

// ===========================================================================
// THE CLASS QUESTIONS.
// ===========================================================================

/** Every distinct request shape the surface (or a future one) can build. Each
 *  is exercised through BOTH readers of the shared body below. */
const REQUEST_TABLE: { label: string; r: Af2Request; expect: null | { reason: string; axis: string | null } }[] = [
  { label: "hand-draft, clean", r: req({ draft: OK_DRAFT }), expect: null },
  { label: "settlement, clean", r: req({ allocations: OK_ALLOC }), expect: null },
  { label: "neither leg (the dead button)", r: req({ draft: null, allocations: null }), expect: { reason: "booking_request_invalid", axis: "no_booking" } },
  { label: "empty allocation array", r: req({ allocations: [] }), expect: { reason: "booking_request_invalid", axis: "no_booking" } },
  { label: "BOTH legs", r: req({ draft: OK_DRAFT, allocations: OK_ALLOC }), expect: { reason: "booking_request_invalid", axis: "draft_and_allocations" } },
  { label: "charge on the draft leg", r: req({ draft: OK_DRAFT, chargeCents: 500 }), expect: { reason: "booking_request_invalid", axis: "settle_argument_on_draft_leg" } },
  { label: "charge ACCOUNT on the draft leg", r: req({ draft: OK_DRAFT, chargeAccount: "600-X" }), expect: { reason: "booking_request_invalid", axis: "settle_argument_on_draft_leg" } },
  { label: "adjustments on the draft leg", r: req({ draft: OK_DRAFT, adjustments: [{ account_code: "600-X", amount_cents: 100 }] }), expect: { reason: "booking_request_invalid", axis: "settle_argument_on_draft_leg" } },
  { label: "draft with no lines", r: req({ draft: { ...OK_DRAFT, lines: [] } }), expect: { reason: "booking_request_invalid", axis: "draft_malformed" } },
  { label: "draft with no posting date", r: req({ draft: { ...OK_DRAFT, posting_date: "  " } }), expect: { reason: "booking_request_invalid", axis: "draft_malformed" } },
  { label: "advance payload on the settle leg", r: req({ allocations: OK_ALLOC, advanceApplications: { kind: "bank_return", reason: "r", allocations: [] } }), expect: { reason: "booking_request_invalid", axis: "advance_payload_without_draft" } },
  // [round-8 M3-F1] the period-exception acknowledgement is draft-leg-only: the settle
  // leg posts at the line's own entry_date and has nothing to acknowledge (arm 7b, the
  // byte-mirror of the composite's own refusal). TRUE on the draft leg is admitted.
  { label: "period-ack on the settle leg", r: req({ allocations: OK_ALLOC, ackPeriodExceptions: true }), expect: { reason: "booking_request_invalid", axis: "ack_without_draft" } },
  { label: "period-ack on the draft leg", r: req({ draft: OK_DRAFT, ackPeriodExceptions: true }), expect: null },
  { label: "allocation with a non-uuid item", r: req({ allocations: [{ item_id: "not-a-uuid", amount_cents: 100 }] }), expect: { reason: "allocations_malformed", axis: null } },
  // NOTE the honest asymmetry (resolveBookModel arm (8)): a zero/fractional
  // amount is `allocations_malformed` here, not `no_booking` — the array IS
  // non-empty, so the verb's leg derivation is satisfied and the fault is the
  // allocation itself. Pinned so nobody "tidies" it into the wrong arm.
  { label: "allocation of zero cents", r: req({ allocations: [{ item_id: ITEM, amount_cents: 0 }] }), expect: { reason: "allocations_malformed", axis: null } },
  { label: "allocation of a fractional sen", r: req({ allocations: [{ item_id: ITEM, amount_cents: 10.5 }] }), expect: { reason: "allocations_malformed", axis: null } },
  { label: "bank_corrective_line", r: req({ disposition: "bank_corrective_line", allocations: OK_ALLOC }), expect: { reason: "disposition_unsupported", axis: null } },
  { label: "blank note", r: req({ note: "   ", allocations: OK_ALLOC }), expect: { reason: "resolution_note_required", axis: null } },
];

test("[CLASS] the promise and the gate cannot disagree — the wire caller refuses EXACTLY what the predicate refuses", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let sent = 0;
  t.mock.method(globalThis, "fetch", async () => {
    sent += 1;
    return new Response(JSON.stringify({ branch: "live", entry_id: "e1" }), { status: 200, headers: { "content-type": "application/json" } });
  });

  for (const row of REQUEST_TABLE) {
    const predicate = af2Admission(row.r);
    const before = sent;
    let wireErr: PgrestError | null = null;
    try {
      await resolveAndBookBankLine("jwt", {
        clientId: "c1", exceptionId: "exc1",
        disposition: row.r.disposition as "matched_booking", note: row.r.note,
        draft: row.r.draft ?? null, allocations: row.r.allocations ?? null,
        adjustments: row.r.adjustments ?? null, advanceApplications: (row.r.advanceApplications ?? null) as never,
        ackPeriodExceptions: row.r.ackPeriodExceptions ?? false,
        chargeCents: row.r.chargeCents ?? 0, chargeAccount: row.r.chargeAccount ?? null,
      });
    } catch (e) {
      wireErr = e as PgrestError;
    }
    if (row.expect === null) {
      assert.equal(predicate.admitted, true, `${row.label}: the predicate must admit`);
      assert.equal(wireErr, null, `${row.label}: the wire caller must not refuse what the predicate admits`);
      assert.equal(sent, before + 1, `${row.label}: an admitted request must actually reach the DB`);
    } else {
      assert.equal(predicate.admitted, false, `${row.label}: the predicate must refuse`);
      assert.equal(predicate.admitted === false && predicate.reason, row.expect.reason, `${row.label}: reason`);
      assert.equal(predicate.admitted === false && predicate.axis, row.expect.axis, `${row.label}: axis`);
      assert.ok(wireErr, `${row.label}: the wire caller must refuse it too — one body, two readers`);
      assert.equal(wireErr?.reason, row.expect.reason, `${row.label}: the wire caller reports the SAME token`);
      assert.equal(parseRefusalAxis(wireErr?.pgDetails), row.expect.axis, `${row.label}: …and the SAME axis`);
      assert.equal(sent, before, `${row.label}: an inadmissible request must never leave the browser`);
    }
  }
});

test("[CLASS] every refusal this predicate can emit HAS a gloss — derived from the predicate's own outputs, not a hardcoded list", () => {
  const emitted = new Set<string>();
  for (const row of REQUEST_TABLE) {
    const a = af2Admission(row.r);
    if (a.admitted) continue;
    emitted.add(`${a.reason}/${a.axis ?? ""}`);
    const gloss = describeBankRefusal(a.reason, a.axis);
    assert.ok(gloss && gloss.length > 10,
      `no gloss for ${a.reason}${a.axis ? `/${a.axis}` : ""} — a user would see a raw token`);
    // The predicate's OWN message must also be usable copy for a disabled control.
    assert.ok((af2AdmissionBlockReason(row.r) ?? "").length > 10);
  }
  // Not vacuous: the table really does cover more than one reason token.
  assert.ok(emitted.size >= 6, `expected several distinct refusals, got ${[...emitted].join(", ")}`);
  // And every AXIS gloss shipped is reachable from some real refusal OR is one
  // of the two the DB raises for states this predicate deliberately cannot see.
  const unreachable = Object.keys(BANK_REFUSAL_AXIS_COPY).filter(
    (k) => !emitted.has(k.endsWith("/") ? k : k)
      && !k.startsWith("pending_branch_ancillary_unsupported/")
      && k !== "booking_request_invalid/allocation_counterparty_underivable",
  );
  assert.deepEqual(unreachable, [], "an axis gloss that nothing can raise is dead copy");
});

test("[round-3 RED, finding 2] the SETTLEMENT leg actually reaches the DB — p_allocations is forwarded, p_draft is null", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ branch: "pending", resolution_exception_id: "exc1" }),
      { status: 200, headers: { "content-type": "application/json" } });
  });
  const out = await resolveAndBookBankLine("jwt", {
    clientId: "c1", exceptionId: "exc1", disposition: "matched_booking",
    note: "the deposit is ACME invoice 42", allocations: OK_ALLOC,
  });
  // Before this round the panel's handler dropped `allocations` entirely, so the
  // ONLY leg that can park could not be called and `pending_resolution` — which
  // the exceptions table already badges — was unreachable from every dashboard
  // act. This is the cell that would have caught that.
  assert.deepEqual(body.p_allocations, OK_ALLOC);
  assert.equal(body.p_draft, null);
  assert.equal(body.p_advance_applications, null);
  assert.equal(body.p_charge_cents, 0);
  assert.ok(typeof body.p_op_key === "string" && body.p_op_key.length > 0, "a fresh op_key per call");
  // …and the PARK the DB answers is carried through as the DB's own word.
  assert.equal(out.branch, "pending");
  assert.equal(out.resolution_exception_id, "exc1");
});

test("[round-3] an EMPTY adjustments array is sent as null, so a park is never refused `ancillaries` over nothing", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ branch: "live" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await resolveAndBookBankLine("jwt", {
    clientId: "c1", exceptionId: "exc1", disposition: "written_off_adjustment",
    note: "written off", allocations: OK_ALLOC, adjustments: [],
  });
  assert.equal(body.p_adjustments, null,
    "`[]` would be counted by _bank_adjustments_norm on the park branch — 'none' must be indistinguishable from 'never named'");
});

test("[CLASS — ORDER, round 1's defect shape] naming BOTH legs is draft_and_allocations, never no_booking", () => {
  // If arm (3) were ordered after arm (4), an empty-lines draft PLUS allocations
  // would answer `draft_malformed` or `no_booking` and misdirect the user to add
  // a line when the real fault is that they asked for two bookings.
  const a = af2Admission(req({ draft: { ...OK_DRAFT, lines: [] }, allocations: OK_ALLOC }));
  assert.equal(a.admitted === false && a.axis, "draft_and_allocations");
  // And a blank NOTE outranks every leg question, exactly as the verb orders it.
  const b = af2Admission(req({ note: "", draft: OK_DRAFT, allocations: OK_ALLOC }));
  assert.equal(b.admitted === false && b.reason, "resolution_note_required");
  // …and the disposition outranks even the note.
  const c = af2Admission(req({ disposition: "nonsense", note: "" }));
  assert.equal(c.admitted === false && c.reason, "disposition_unsupported");
});

test("[CLASS — SUBSET HONESTY] the predicate answers SHAPE only; it never claims a park, a role or a live statement", () => {
  // A clean settlement is ADMITTED regardless of amount — the predicate must not
  // try to guess `is_high_stakes`, because that is the DB's answer and guessing
  // it would rebuild the walled corridor with a new promise.
  const small = af2Admission(req({ allocations: [{ item_id: ITEM, amount_cents: 1 }] }));
  const huge = af2Admission(req({ allocations: [{ item_id: ITEM, amount_cents: 999_999_999 }] }));
  assert.equal(small.admitted, true);
  assert.equal(huge.admitted, true);
  assert.equal(small.admitted && small.leg, "settle");
  assert.equal(huge.admitted && huge.leg, "settle");
  // The leg is DERIVED, never selected — the verb takes no leg argument.
  const d = af2Admission(req({ draft: OK_DRAFT }));
  assert.equal(d.admitted && d.leg, "draft");
});

// ===========================================================================
// [MERGE GATE PR #184, finding 1 — THE MERGE-BLOCKER] THE PARTY SWITCH.
//
// The settlement sub-form cleared its DISPLAYED open items when the user
// switched counterparty or customer/vendor kind, and kept the allocation map.
// The submit payload was derived from that map, and the composite DERIVES ITS
// COUNTERPARTY FROM THE ITEM IDS IT IS GIVEN — so the surface could show party B
// while settling party A, with nothing on screen naming the survivors.
//
// These cells drive the reducer through the EXACT action sequence the controls
// dispatch (`scope` = the Customer/Vendor toggle, `counterparty` = the picker,
// `items_loaded`/`items_unreadable` = the open-item effect, `allocate` = the
// cents input). They are the transition half of the regression; the render half
// is in ExceptionBookingFields.test.tsx.
// ===========================================================================

const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";
const B1 = "33333333-3333-4333-8333-333333333333";

function item(id: string, counterparty: string): OpenItemRow {
  return {
    id, domain: "ar", counterparty_id: counterparty, item_kind: "invoice",
    item_date: "2035-01-02", due_date: null, amount_cents: 100000,
    outstanding_cents: 100000, entry_id: `e-${id}`,
  };
}
const PARTY_A = [item(A1, "cp-A"), item(A2, "cp-A")];
const PARTY_B = [item(B1, "cp-B")];

function drive(state: SettlementLegState, actions: SettlementLegAction[]): SettlementLegState {
  return actions.reduce(settlementLegReducer, state);
}

/** Party A picked, its items loaded, one of them allocated — the state the user
 *  is in the instant before the switch that used to leak. */
function allocatedUnderA(): SettlementLegState {
  const s = drive(settlementLegInitialState("customer"), [
    { type: "counterparty", counterpartyId: "cp-A" },
    { type: "items_loaded", items: PARTY_A },
    { type: "allocate", itemId: A1, cents: 100000 },
  ]);
  // Not vacuous: the pre-switch payload really does name party A.
  assert.deepEqual(settlementAllocationInputs(s), [{ item_id: A1, amount_cents: 100000 }]);
  return s;
}

test("[MG184 F1 RED] switching COUNTERPARTY leaves zero party-A ids in the payload", () => {
  const after = drive(allocatedUnderA(), [{ type: "counterparty", counterpartyId: "cp-B" }]);
  assert.deepEqual(after.allocations, {}, "the map itself is void, not merely filtered on the way out");
  assert.deepEqual(settlementAllocationInputs(after), []);
  // …and the submit is a CLEAN SLATE: the request it would send is the empty
  // one, which the admission body refuses on the same axis an untouched form does.
  const a = af2Admission(req({ allocations: settlementAllocationInputs(after) }));
  assert.equal(a.admitted, false);
  assert.equal(a.admitted === false && a.axis, "no_booking");
  // The whole scope is reset, not just the map — a party-B load must not inherit
  // party A's list either.
  assert.deepEqual(after.openItems, []);
  assert.equal(after.itemsAvailable, null);
  assert.equal(after.counterpartyId, "cp-B");
});

test("[MG184 F1 RED] switching KIND leaves zero party-A ids in the payload, and voids the party too", () => {
  const after = drive(allocatedUnderA(), [{ type: "scope", kind: "vendor" }]);
  assert.deepEqual(after.allocations, {});
  assert.deepEqual(settlementAllocationInputs(after), []);
  assert.equal(after.counterpartyId, "", "a vendor list cannot keep a customer selection");
  assert.equal(after.kind, "vendor");
  assert.deepEqual(after.openItems, []);
});

test("[MG184 F1 BELT] the payload names ONLY items currently on screen — even if a map ever survives", () => {
  // The belt is asserted directly rather than through a transition, because its
  // job is to hold for a transition NOBODY HAS WRITTEN YET. A hand-built state
  // whose map speaks about a party that is no longer displayed sends nothing.
  const stale: SettlementLegState = {
    kind: "customer", counterpartyId: "cp-B", openItems: PARTY_B, itemsAvailable: true,
    allocations: { [A1]: 100000, [A2]: 50000, [B1]: 700 },
  };
  assert.deepEqual(settlementAllocationInputs(stale), [{ item_id: B1, amount_cents: 700 }]);
  // And a RE-LOAD narrows the map itself, so the survivors cannot ride a later
  // load back onto the screen either.
  const reloaded = settlementLegReducer(stale, { type: "items_loaded", items: PARTY_B });
  assert.deepEqual(reloaded.allocations, { [B1]: 700 });
});

test("[MG184 F1] an UNREADABLE open-item list voids the map — fail-closed, the OpenItemAllocations law", () => {
  const after = drive(allocatedUnderA(), [{ type: "items_unreadable" }]);
  assert.equal(after.itemsAvailable, false);
  assert.deepEqual(after.openItems, []);
  assert.deepEqual(settlementAllocationInputs(after), [],
    "a list that could not be read must never be settled against — an allocation typed before the failure is not evidence");
});

test("[MG184 F1] re-picking the SAME counterparty is not a switch — typed work survives an idle re-select", () => {
  const s = allocatedUnderA();
  const same = settlementLegReducer(s, { type: "counterparty", counterpartyId: "cp-A" });
  assert.equal(same, s, "identity: no re-render, no lost input");
  assert.deepEqual(settlementAllocationInputs(same), [{ item_id: A1, amount_cents: 100000 }]);
});

test("[MG184 F1] zero cents never reaches the wire, and the map is the only writer", () => {
  const s = drive(allocatedUnderA(), [
    { type: "allocate", itemId: A2, cents: 0 },
    { type: "allocate", itemId: A1, cents: 0 },
  ]);
  assert.deepEqual(settlementAllocationInputs(s), [], "clearing every box is an empty payload, not a zero-cent one");
  assert.equal(af2Admission(req({ allocations: settlementAllocationInputs(s) })).admitted, false);
});

// ===========================================================================
// [MERGE GATE PR #184, finding 2] THE REFUND QUADRANT BLOCKS, IT DOES NOT WARN.
// ===========================================================================

test("[MG184 F2] the refund quadrants BLOCK the submit; the lawful ones do not", () => {
  // All four quadrants, both signs — so this cannot pass by measuring one.
  assert.equal(refundSubmitBlock("customer", -50_000), REFUND_SUBMIT_BLOCKED_MESSAGE, "customer + outflow = refund");
  assert.equal(refundSubmitBlock("vendor", 50_000), REFUND_SUBMIT_BLOCKED_MESSAGE, "vendor + inflow = refund");
  assert.equal(refundSubmitBlock("customer", 50_000), null, "customer + inflow is an ordinary receipt");
  assert.equal(refundSubmitBlock("vendor", -50_000), null, "vendor + outflow is an ordinary payment");
  // No amount = no claim: the DB stays the authority and nothing is blocked on a
  // quadrant this surface cannot compute.
  assert.equal(refundSubmitBlock("customer", null), null);
  assert.equal(refundSubmitBlock("vendor", null), null);
});

test("[MG184 F2] the blocking copy names the DB's own refusal token — a blocked control says why", () => {
  assert.match(REFUND_SUBMIT_BLOCKED_MESSAGE, /refund_not_supported/);
  assert.ok(REFUND_SUBMIT_BLOCKED_MESSAGE.length > 40);
  // …and the gloss the DB's own refusal would render is still reachable, so the
  // local block and the remote refusal cannot drift into two different stories.
  assert.ok((describeBankRefusal("refund_not_supported", null) ?? "").length > 20);
});
