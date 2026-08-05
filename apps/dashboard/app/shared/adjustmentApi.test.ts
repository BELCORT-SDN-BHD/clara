// shared/adjustmentApi.ts tests — mocks globalThis.fetch (the assetsApi.test.ts
// idiom).
//
// WHY THIS FILE EXISTS. The round-2 as-built finding: /rules called three RPCs
// that migration 0042 never shipped — `list_adjustment_templates`,
// `get_adjustment_run`, `list_adjustment_runs`. The dashboard lane invented the
// names as a documented ASSUMPTION and asked the DB lane to confirm or correct
// them; nobody did, so AdjustmentTemplatePanel took a PostgREST 404 on every
// load and sign / retire / run-manual were unreachable from the UI. The three
// reads are now authored in 0042 §S2.8, and the envelopes below were CAPTURED
// off a rig database carrying them (ids and all, row counts trimmed) — not
// shaped by hand, because a hand-shaped fixture reproduces the guess rather than
// the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listAdjustmentTemplates, listAdjustmentRuns, getAdjustmentRun, adjustmentRunDue,
  proposeAdjustmentTemplate, signAdjustmentTemplate, retireAdjustmentTemplate,
  runAdjustmentManual, reverseAdjustmentPair, approvePairReversal, cancelPairReversal,
} from "./adjustmentApi";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}

// --- captured 2026-08-03 off a 0042 rig (clara.list_adjustment_templates) ----
const TEMPLATES_ENVELOPE = {
  client_id: "8c513b53-a526-48a8-8dda-9db831abf3ef", // gitleaks:allow -- the sandbox client UUID captured with this envelope, a tenant identifier and not a credential
  live_count: 1,
  draft_blocked_count: 0,
  templates: [{
    name: "x42 d1a b8f44b",
    lines: [
      { debit_cents: 40000, description: "accrued charge", account_code: "900-D42", credit_cents: 0 },
      { debit_cents: 0, description: "accrual", account_code: "400-D42", credit_cents: 40000 },
    ],
    status: "live", cadence: "monthly", end_date: null,
    client_id: "8c513b53-a526-48a8-8dda-9db831abf3ef", // gitleaks:allow -- same captured tenant identifier, not a credential
    signed_at: "2026-08-03T00:04:56.703347+08:00",
    signed_by: "434e9d9e-d5cd-4a3e-b842-05ae809e5ee2",
    created_at: "2026-08-03T00:04:56.693528+08:00",
    retired_at: null, retired_by: null, start_date: "2026-05-01",
    proposed_by: "5ee9b113-3880-4655-95c5-49abf62c37f1",
    template_id: "5859ce7d-6c68-45bd-bc4a-4a0779124ecd",
    auto_reverse: false,
    content_hash: "9f4ac017c010aaa3e3e45c103a3d67b939a7aa97e5abd975dbfd056182fa21a7",
    memo_template: "x42 accrual", retired_reason: null,
    occurrence_draft_entry_id: "846a4e3f-154f-4bde-9bd9-bcf976b442ae",
  }],
};

// --- captured 2026-08-03 (clara.list_adjustment_runs), newest period first ----
const RUNS_ENVELOPE = {
  client_id: "8c513b53-a526-48a8-8dda-9db831abf3ef", // gitleaks:allow -- same captured tenant identifier, not a credential
  runs: [
    { id: "66b13ec0-9f6f-4819-8712-62ae4630a5b6", mode: "draft", entry_id: "c82dd5ec-cdd7-43be-a33a-fea8ca5d92eb", client_id: "8c513b53-a526-48a8-8dda-9db831abf3ef", created_at: "2026-08-03T00:04:56.780282+08:00", period_end: "2026-07-31", template_id: "5859ce7d-6c68-45bd-bc4a-4a0779124ecd", amount_cents: 40000, period_start: "2026-07-01", reversal_entry_id: null }, // gitleaks:allow -- same captured tenant identifier, not a credential
    { id: "90b21ae7-3423-4573-af79-34e6ce9d7e7c", mode: "draft", entry_id: "acbb5f23-f907-4567-9e4c-901ab2fabb5e", client_id: "8c513b53-a526-48a8-8dda-9db831abf3ef", created_at: "2026-08-03T00:04:56.768939+08:00", period_end: "2026-06-30", template_id: "5859ce7d-6c68-45bd-bc4a-4a0779124ecd", amount_cents: 40000, period_start: "2026-06-01", reversal_entry_id: null }, // gitleaks:allow -- same captured tenant identifier, not a credential
  ],
};

// --- reads --------------------------------------------------------------------

test("listAdjustmentTemplates posts p_client to list_adjustment_templates and unwraps the REAL 0042 envelope", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(TEMPLATES_ENVELOPE);
  });
  setup();
  const read = await listAdjustmentTemplates("jwt", "8c513b53-a526-48a8-8dda-9db831abf3ef");
  assert.ok(seenUrl.includes("/rpc/list_adjustment_templates"), "the RPC 0042 actually ships");
  assert.equal(seenBody.p_client, "8c513b53-a526-48a8-8dda-9db831abf3ef");
  assert.equal(read.available, true);
  assert.equal(read.templates.length, 1);
  // template_id is the ONE spelling — the same key adjustment_run_due's blocked[]
  // and every write receipt use, so sign/retire can name what they act on.
  assert.equal(read.templates[0]?.template_id, "5859ce7d-6c68-45bd-bc4a-4a0779124ecd");
  assert.equal(read.templates[0]?.status, "live");
  assert.equal(read.templates[0]?.lines.length, 2);
  assert.equal(read.templates[0]?.lines[0]?.debit_cents, 40000);
  assert.equal(read.templates[0]?.occurrence_draft_entry_id, "846a4e3f-154f-4bde-9bd9-bcf976b442ae",
    "the blocking draft is NAMED, so blocked[]'s remedy is reachable and not merely stated");
  assert.equal(read.live_count, 1);
});

test("listAdjustmentRuns unwraps {runs} newest-period-first, and getAdjustmentRun posts p_run and unwraps {run}", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(RUNS_ENVELOPE));
  setup();
  const list = await listAdjustmentRuns("jwt", "8c513b53-a526-48a8-8dda-9db831abf3ef");
  assert.equal(list.available, true);
  assert.equal(list.runs.length, 2);
  assert.equal(list.runs[0]?.period_end, "2026-07-31", "the DB orders newest period first; the panel takes the head, it does not sort");
  assert.equal(list.runs[0]?.amount_cents, 40000);

  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    // [round-8 F4] the run envelope carries M1's correctable/active_pair_* triplet
    // (M1-intersection-gate.md §Finding-4) — proving the WIRE round-trip, not only
    // the mapper (adjustmentModel.test.ts owns that half).
    return jsonRes({ run: { ...RUNS_ENVELOPE.runs[0], correctable: false, active_pair_id: "p1", active_pair_status: "pending" } });
  });
  const single = await getAdjustmentRun("jwt", "66b13ec0-9f6f-4819-8712-62ae4630a5b6");
  assert.ok(seenUrl.includes("/rpc/get_adjustment_run"));
  assert.equal(seenBody.p_run, "66b13ec0-9f6f-4819-8712-62ae4630a5b6");
  assert.equal(single.available, true);
  assert.equal(single.run?.mode, "draft");
  assert.equal(single.run?.amount_cents, 40000);
  assert.equal(single.run?.correctable, false);
  assert.equal(single.run?.active_pair_id, "p1");
  assert.equal(single.run?.active_pair_status, "pending");
});

test("a WRONG shape reads as UNAVAILABLE, never as 'this client has no templates'", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([]));
  setup();
  const read = await listAdjustmentTemplates("jwt", "c1");
  assert.equal(read.available, false);
  assert.deepEqual(read.templates, []);
  assert.equal((await listAdjustmentRuns("jwt", "c1")).available, false);
});

test("adjustmentRunDue carries blocked[] through with BOTH of its reason kinds", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({
    due: false, reason: "all_blocked",
    blocked: [
      { template_id: "t1", reason: "occurrence_draft_outstanding" },
      { template_id: "t2", reason: "template_line_ineligible" },
    ],
  }));
  setup();
  const due = await adjustmentRunDue("jwt", "c1");
  assert.equal(due.due, false);
  assert.equal(due.blocked.length, 2);
  assert.equal(due.blocked[1]?.reason, "template_line_ineligible");
});

// --- actions: every write mints a FRESH op_key per call ----------------------

test("action verbs each POST a fresh p_op_key, and run_adjustment_manual sends the DB's own period unaltered", async (t) => {
  const seenKeys: string[] = [];
  let lastBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    lastBody = JSON.parse(String(init?.body));
    if (typeof lastBody.p_op_key === "string") seenKeys.push(lastBody.p_op_key);
    return jsonRes({});
  });
  setup();
  await proposeAdjustmentTemplate("jwt", {
    clientId: "c1", name: "Audit fee accrual", cadence: "monthly", startDate: "2026-01-01", endDate: null,
    autoReverse: true, lines: [{ account_code: "900-000", debit_cents: 50000, credit_cents: 0 }, { account_code: "400-000", debit_cents: 0, credit_cents: 50000 }],
    memoTemplate: "Audit fee accrual",
  });
  await signAdjustmentTemplate("jwt", "c1", "t1");
  await retireAdjustmentTemplate("jwt", "c1", "t1", "superseded");
  await runAdjustmentManual("jwt", "c1", "t1", "2026-07-01", "2026-07-31");
  assert.equal(lastBody.p_period_start, "2026-07-01", "the period is the oracle's, passed through verbatim");
  assert.equal(lastBody.p_period_end, "2026-07-31");
  assert.equal(lastBody.p_mode, undefined, "mode is decided IN-VERB — the UI never sends one");
  await reverseAdjustmentPair("jwt", "c1", "entry-1", "wrong accrual");
  await approvePairReversal("jwt", "c1", "pair-1", "checked");
  await cancelPairReversal("jwt", "c1", "pair-1", "not needed");

  assert.equal(seenKeys.length, 7, "every action call must carry a p_op_key");
  assert.equal(new Set(seenKeys).size, seenKeys.length, "no two action calls may share an op_key");
});

// [round-7 F-F1] the AdjustmentRunReceiptCard correction affordance calls these
// three verbs directly (ABI §A) — pinned here at the wire layer, byte-exact,
// since the card itself renders each phase from PROPS (no jsdom to click
// through) and this is where "the happy path calls the right RPC with the
// right payload" is actually provable end to end.
test("[F-F1] reverseAdjustmentPair posts EXACTLY p_client/p_occurrence/p_reason/p_op_key, and the trailing optional attestation on approve/cancel round-trips (incl. null)", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ pair_id: "p1", status: "completed" });
  });
  setup();

  const r1 = await reverseAdjustmentPair("jwt", "c1", "occ-1", "wrong accrual");
  assert.deepEqual(Object.keys(bodies[0] ?? {}).sort(), ["p_client", "p_occurrence", "p_op_key", "p_reason"]);
  assert.equal(bodies[0]?.p_client, "c1");
  assert.equal(bodies[0]?.p_occurrence, "occ-1");
  assert.equal(bodies[0]?.p_reason, "wrong accrual");
  assert.equal(r1.pair_id, "p1");
  assert.equal(r1.status, "completed");

  await approvePairReversal("jwt", "c1", "pair-1", "checked by admin");
  assert.deepEqual(Object.keys(bodies[1] ?? {}).sort(), ["p_attestation", "p_client", "p_op_key", "p_pair"]);
  assert.equal(bodies[1]?.p_attestation, "checked by admin");

  // The card sends `attestation.trim() || null` when the field is left blank —
  // the wrapper must forward that null, never coerce it to undefined (which
  // PostgREST would drop, changing the argument SET the RPC resolves by).
  await approvePairReversal("jwt", "c1", "pair-1", null);
  assert.equal(bodies[2]?.p_attestation, null);

  await cancelPairReversal("jwt", "c1", "pair-1", "not needed");
  assert.deepEqual(Object.keys(bodies[3] ?? {}).sort(), ["p_client", "p_op_key", "p_pair", "p_reason"]);
  assert.equal(bodies[3]?.p_reason, "not needed");
});

// === ROUND-11 XP2 — THE LINEAGE DECLARATION ACTUALLY LEAVES THE BROWSER ============
// MEASURED (W1 finding 3 / Codex r11 finding 2): this wrapper posted nine named args and
// no `p_replaces`, so a dashboard-shaped propose always left the column NULL and the whole
// P1 lineage build — the period prohibition, replaced_generations, the predecessor-candidate
// grammar — was reachable only from a hand-crafted PostgREST call.

const BASE_PROPOSE = {
  clientId: "c1", name: "Audit fee accrual", cadence: "monthly" as const, startDate: "2026-01-01",
  endDate: null, autoReverse: true,
  lines: [
    { account_code: "900-000", debit_cents: 50000, credit_cents: 0 },
    { account_code: "400-000", debit_cents: 0, credit_cents: 50000 },
  ],
  memoTemplate: "Audit fee accrual",
};

test("[round-11 XP2] a DECLARED predecessor is posted as p_replaces — the arg the DB has always had and nothing ever sent", async (t) => {
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return jsonRes({ template_id: "t-new", status: "proposed", warnings: [] });
  });
  setup();
  await proposeAdjustmentTemplate("jwt", { ...BASE_PROPOSE, replaces: "t-old" });
  assert.equal(body.p_replaces, "t-old");
  assert.deepEqual(Object.keys(body).sort(), [
    "p_auto_reverse", "p_cadence", "p_client", "p_end_date", "p_lines", "p_memo_template",
    "p_name", "p_op_key", "p_replaces", "p_start_date",
  ]);
});

test("[round-11 XP2] 'replaces nothing' OMITS the key rather than posting null — PostgREST resolves an overload by the key SET, and this dashboard ships ahead of its migrations", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ template_id: "t-new", status: "proposed", warnings: [] });
  });
  setup();
  await proposeAdjustmentTemplate("jwt", { ...BASE_PROPOSE, replaces: null });
  await proposeAdjustmentTemplate("jwt", BASE_PROPOSE);
  for (const b of bodies) {
    assert.ok(!("p_replaces" in b),
      "posting p_replaces:null would 404 every propose against a database where the tenth arg is not deployed; the DB's own `default null` supplies the same value");
    assert.equal(Object.keys(b).length, 9, "the undeclared call must reproduce the pre-fix nine-arg body exactly");
  }
});

test("[round-11 XP2/W2 F3] the propose receipt's warnings survive the mapper on all THREE axes, and a junk warnings key never refuses an ADMITTED proposal", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({
    template_id: "t-new", status: "proposed", content_hash: "abc",
    warnings: [
      { axis: "colliding_live_sibling", containment: "identical", standing_charges: 2, first_period: "2026-04-01", last_period: "2026-05-31", colliding_elements: ["400-D42:C", "900-D42:D"], message: "…would book those periods twice." },
      { axis: "replaced_period_overlap", template_id: "t-old", name: "old accrual", status: "retired", standing_charges: 4, first_period: "2026-01-01", last_period: "2026-04-30", message: "the generation this replaces still carries 4 approved charge(s)." },
      { axis: "implausible_start_date", start_date: "2019-01-01", plausible_from: "2025-01-01", message: "that start date is years early." },
    ],
  }));
  setup();
  const receipt = await proposeAdjustmentTemplate("jwt", { ...BASE_PROPOSE, replaces: "t-old" });
  assert.equal(receipt.template_id, "t-new");
  assert.deepEqual(receipt.warnings.map((w) => w.axis), ["colliding_live_sibling", "replaced_period_overlap", "implausible_start_date"]);
  assert.equal(receipt.warnings[0]?.standing_charges, 2);
  assert.deepEqual(receipt.warnings[0]?.colliding_elements, ["400-D42:C", "900-D42:D"]);
  assert.equal(receipt.warnings[1]?.name, "old accrual");
  assert.equal(receipt.warnings[1]?.last_period, "2026-04-30");
  assert.match(receipt.warnings[2]?.message ?? "", /years early/);

  // Tolerance: the advisory is not the receipt. A malformed warnings key must degrade to an
  // empty advisory, never throw away a proposal the DB already admitted.
  t.mock.method(globalThis, "fetch", async () => jsonRes({ template_id: "t2", status: "proposed", warnings: "nope" }));
  const tolerant = await proposeAdjustmentTemplate("jwt", BASE_PROPOSE);
  assert.equal(tolerant.template_id, "t2");
  assert.deepEqual(tolerant.warnings, []);
});

// [round-12, Codex CXR1] SIGN ANSWERS WITH A RECEIPT, AND THE RECEIPT CARRIES THE ADVISORY.
// clara.sign_adjustment_template re-asks the period-overlap question at the last human moment
// (the predecessor can retire, or start charging, between propose and sign). This wrapper
// returned `void`; a dropped key is a dropped pixel, which is the defect class this round closes.
test("[round-12 CXR1] signAdjustmentTemplate returns the receipt with its warnings, and an older envelope degrades to 'nothing to say'", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({
    template_id: "t1", status: "live",
    warnings: [{ axis: "replaced_period_overlap", template_id: "t0", status: "live",
      standing_charges: 2, message: "the LIVE template t0 still carries 2 standing charge(s)" }],
  }));
  setup();
  const receipt = await signAdjustmentTemplate("jwt", "c1", "t1");
  assert.equal(receipt.status, "live");
  assert.equal(receipt.warnings.length, 1);
  assert.equal(receipt.warnings[0]?.axis, "replaced_period_overlap");
  assert.match(receipt.warnings[0]?.message ?? "", /still carries 2 standing charge/,
    "the DB's sentence is the payload — nothing here re-words it");
});

test("[round-12 CXR1] a sign receipt minted before the advisory existed reads as an empty advisory, never a crash", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ template_id: "t1", status: "live" }));
  setup();
  const receipt = await signAdjustmentTemplate("jwt", "c1", "t1");
  assert.deepEqual(receipt.warnings, [], "an absent key is 'nothing to say', tolerantly");
  assert.equal(receipt.template_id, "t1");
});
