// seedingApi tests: defensive mappers (arbitrary/absent jsonb never crash) + the
// governed-writer op_key freshness + the §3.4 prepare client's three branches
// (created/existing/unparseable) against a stubbed global fetch. No live DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toSeedingBatch, toSeedingProposal, toSeedingEvidence, tickSeedingProposal,
  declineSeedingProposal, prepareSeedingBatch, type RuntimeApiError,
} from "./seedingApi";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// --- mappers: defensive on a full row + on an empty/malformed one ----------------

test("toSeedingBatch maps a full row and defaults stats keys", () => {
  const b = toSeedingBatch({
    id: "b1", firm_id: "f1", client_id: "c1", source_document_id: "d1",
    source_sha256: "a".repeat(64), state: "open",
    stats: { proposal_count: 5, refused_count: 1 },
    created_by: null, created_at: "2026-07-24T00:00:00Z",
    completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  });
  assert.equal(b.id, "b1");
  assert.equal(b.stats.proposal_count, 5);
  assert.equal(b.stats.ticked, null, "an absent stats key degrades to null, never crashes");
});

test("toSeedingBatch never crashes on an empty/malformed row", () => {
  const b = toSeedingBatch({});
  assert.equal(b.id, "");
  assert.equal(b.state, "open", "state defaults honestly");
  assert.deepEqual(b.stats, {
    proposal_count: null, refused_count: null, ticked: null, declined: null, refused: null,
    still_proposed: null, source_document_id: null,
  });
  assert.doesNotThrow(() => toSeedingBatch(null));
  assert.doesNotThrow(() => toSeedingBatch(undefined));
  assert.doesNotThrow(() => toSeedingBatch("garbage"));
});

test("toSeedingProposal defaults state to proposed and evidence/payload to objects", () => {
  const p = toSeedingProposal({ id: "p1", proposal_kind: "wiki_fact" });
  assert.equal(p.state, "proposed");
  assert.deepEqual(p.payload, {});
  assert.deepEqual(p.evidence.line_cites, []);
  assert.equal(p.evidence.occurrence_count, null);
  assert.equal(p.evidence.date_span, null);
});

// --- evidence: occurrence/date-span/cite aliasing, and the raw-preserving degrade ---

test("toSeedingEvidence binds the exact row/region cite union (F-M14)", () => {
  const e = toSeedingEvidence({
    occurrence_count: 7,
    date_span: { from: "2026-01-01", to: "2026-06-30" },
    line_cites: [{ row: 12, text: "recurring rent" }, { region_id: "reg-9", text: "TB line 4" }],
  });
  assert.equal(e.occurrence_count, 7);
  assert.deepEqual(e.date_span, { from: "2026-01-01", to: "2026-06-30" });
  assert.equal(e.line_cites.length, 2);
  const c0 = e.line_cites[0]!;
  assert.ok(c0.kind === "row" && c0.row === 12 && c0.text === "recurring rent", "a {row,text} cite binds as a row cite");
  const c1 = e.line_cites[1]!;
  assert.ok(c1.kind === "region" && c1.region_id === "reg-9" && c1.text === "TB line 4", "a {region_id,text} cite binds as a region cite");
});

test("toSeedingEvidence falls back across known occurrence/date aliases without inventing data", () => {
  const e = toSeedingEvidence({
    occurrences: 3,
    first_seen: "2026-02-01", last_seen: "2026-02-28",
    prior_gl_line_cites: [{ row: 4, text: "opening cash" }],
  });
  assert.equal(e.occurrence_count, 3);
  assert.deepEqual(e.date_span, { from: "2026-02-01", to: "2026-02-28" });
  const c = e.line_cites[0]!;
  assert.ok(c.kind === "row" && c.row === 4 && c.text === "opening cash");
});

test("F-M14: an unrecognised cite shape degrades to a raw cite (never dropped)", () => {
  const e = toSeedingEvidence({ line_cites: [{ mystery: "x", amount_cents: 5 }] });
  assert.equal(e.line_cites.length, 1);
  const c = e.line_cites[0]!;
  assert.equal(c.kind, "raw", "a cite that matches neither {row,text} nor {region_id,text} keeps its raw shape");
  assert.deepEqual(c.raw, { mystery: "x", amount_cents: 5 });
});

test("toSeedingEvidence degrades an unknown shape to empty fields but keeps `raw`", () => {
  const e = toSeedingEvidence({ some_new_key: "value" });
  assert.equal(e.occurrence_count, null);
  assert.equal(e.date_span, null);
  assert.deepEqual(e.line_cites, []);
  assert.deepEqual(e.raw, { some_new_key: "value" }, "an unrecognized shape is never dropped — it rides `raw`");
});

// --- writers: fresh op_key per call ------------------------------------------------

test("tickSeedingProposal sends a fresh op_key on every call", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ proposal_id: "p1", status: "ticked", proposal_kind: "vendor_account_rule", wiki_dispatch_required: false });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await tickSeedingProposal("jwt", "p1");
  await tickSeedingProposal("jwt", "p1");
  assert.equal(bodies.length, 2);
  assert.notEqual(bodies[0]?.p_op_key, bodies[1]?.p_op_key, "each tick mints its own op_key — never replayed");
  assert.equal(bodies[0]?.p_proposal, "p1");
});

test("declineSeedingProposal carries the reason + a fresh op_key", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ proposal_id: "p1", status: "declined" });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await declineSeedingProposal("jwt", "p1", "not needed");
  assert.equal(bodies[0]?.p_reason, "not needed");
  assert.ok(typeof bodies[0]?.p_op_key === "string" && (bodies[0]?.p_op_key as string).length > 0);
});

// --- §3.4 prepare client: created / existing / unparseable / genuine error --------

test("prepareSeedingBatch: 202 -> created with DB-authored proposal_count + refused_count (F-H9)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ status: "created", batchId: "b1", proposal_count: 4, refused_count: 1 }, 202));
  const r = await prepareSeedingBatch("jwt", "c1", "d1");
  // proposal_count is DB-authored and already INCLUDES the refused ones — bound verbatim, no sum.
  assert.deepEqual(r, { status: "created", batchId: "b1", proposal_count: 4, refused_count: 1 });
});

test("prepareSeedingBatch: 409 existing -> opens that batch, does not throw", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ existing: true, batchId: "b2" }, 409));
  const r = await prepareSeedingBatch("jwt", "c1", "d1");
  assert.deepEqual(r, { status: "existing", batchId: "b2" });
});

test("prepareSeedingBatch: 422 -> the honest unparseable surface, not a throw", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ reason: "no recognizable ledger columns" }, 422));
  const r = await prepareSeedingBatch("jwt", "c1", "d1");
  assert.deepEqual(r, { status: "unparseable", reason: "no recognizable ledger columns" });
});

test("prepareSeedingBatch: a 409 without the existing shape is a genuine RuntimeApiError", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ code: "CLR11", message: "seeding batch not in your firm" }, 409));
  await assert.rejects(() => prepareSeedingBatch("jwt", "c1", "d1"), (e: RuntimeApiError) => {
    assert.equal(e.status, 409);
    assert.equal(e.code, "CLR11");
    return true;
  });
});

test("prepareSeedingBatch: a 500 throws RuntimeApiError with the status + message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ message: "internal error" }, 500));
  await assert.rejects(() => prepareSeedingBatch("jwt", "c1", "d1"), (e: RuntimeApiError) => {
    assert.equal(e.status, 500);
    assert.ok(e.message.includes("internal error"));
    return true;
  });
});
