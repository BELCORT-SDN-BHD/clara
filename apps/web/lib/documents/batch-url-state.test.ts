// #636 — `?batch=` and `?batchFacet=`, the parameter contract.
//
// THREE ANSWERS, not two. A malformed id is NOT folded into "nothing is open": a person following
// a stale or hand-edited link is owed the not-found state plus a URL that stops repeating the lie.
// (`url-state.test.ts`'s own rule for `?document=`, restated for this parameter.)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_FACETS, DEFAULT_BATCH_FACET, applyBatchFacetParam, applyBatchParam, batchUrl, isBatchFacet,
  parseBatchFacetParam, parseBatchParam,
} from "./batch-url-state";

const UUID = "b1111111-1111-4111-8111-111111111111";

test("parseBatchParam: three answers, and a malformed id is its own answer", () => {
  assert.deepEqual(parseBatchParam(new URLSearchParams("")), { kind: "none" });
  assert.deepEqual(parseBatchParam(new URLSearchParams("batch=")), { kind: "none" });
  assert.deepEqual(parseBatchParam(new URLSearchParams("batch=%20%20")), { kind: "none" });
  assert.deepEqual(parseBatchParam(new URLSearchParams(`batch=${UUID}`)), { kind: "batch", id: UUID });
  assert.deepEqual(
    parseBatchParam(new URLSearchParams("batch=not-a-uuid")),
    { kind: "malformed", raw: "not-a-uuid" },
    "a hand-edited id is a NOT-FOUND question, never a database one — a malformed uuid reaching a uuid door is a 22P02 that throws",
  );
});

test("applyBatchParam: every other parameter survives, and closing deletes the key rather than blanking it", () => {
  const base = new URLSearchParams("document=d1&tab=facts&batchFacet=waiting");
  const opened = applyBatchParam(base, UUID);
  assert.equal(opened.get("batch"), UUID);
  assert.equal(opened.get("document"), "d1", "the open document survives");
  assert.equal(opened.get("tab"), "facts", "so does the document's tab");
  assert.equal(base.get("batch"), null, "the input is not mutated");

  const closed = applyBatchParam(opened, null);
  assert.equal(closed.has("batch"), false, "the URL never accumulates a dead ?batch= across closes");
  assert.equal(closed.has("batchFacet"), false,
    "…and the facet goes with it: a filter over nothing would be silently inherited by the next open");
  assert.equal(closed.get("document"), "d1");
});

test("parseBatchFacetParam: a hand-edited facet is not an error state — there is nothing to not-find", () => {
  assert.equal(parseBatchFacetParam(new URLSearchParams("")), DEFAULT_BATCH_FACET);
  assert.equal(parseBatchFacetParam(new URLSearchParams("batchFacet=lunch")), DEFAULT_BATCH_FACET);
  assert.equal(parseBatchFacetParam(new URLSearchParams("batchFacet=waiting")), "waiting");
  for (const facet of BATCH_FACETS) assert.equal(isBatchFacet(facet), true);
  assert.equal(isBatchFacet("settled"), true);
  assert.equal(isBatchFacet(null), false);
});

test("applyBatchFacetParam: the default is DELETED rather than written, so one view has one spelling", () => {
  const withFacet = applyBatchFacetParam(new URLSearchParams(`batch=${UUID}`), "failed");
  assert.equal(withFacet.get("batchFacet"), "failed");
  assert.equal(withFacet.get("batch"), UUID);
  const backToAll = applyBatchFacetParam(withFacet, "all");
  assert.equal(backToAll.has("batchFacet"), false);
  assert.equal(backToAll.get("batch"), UUID, "clearing the filter does not close the batch");
});

test("batchUrl: no trailing bare `?`, because that is a different string for the same address", () => {
  assert.equal(batchUrl("/clients/c1/documents", new URLSearchParams("")), "/clients/c1/documents");
  assert.equal(
    batchUrl("/clients/c1/documents", new URLSearchParams(`batch=${UUID}`)),
    `/clients/c1/documents?batch=${UUID}`,
  );
});

test("the five facets are the door's own populations plus `all` — the card never invents a sixth grouping", () => {
  assert.deepEqual([...BATCH_FACETS], ["all", "waiting", "failed", "unassigned", "settled"]);
});

test("the capacity copy names the DOOR's own reset moment, and promises no resume the record cannot keep", async () => {
  // RECUT (#964 / L05-SPEC-05, ADV-W2L05-09). This cell used to be titled "the capacity copy says
  // 08:00 …" and its failure message asserted "the daily window is a UTC day, which is 08:00 MYT".
  // #964's 0252 retired that wall: the window is an Asia/Kuala_Lumpur day and the reset is MYT
  // midnight. What survives the move is the REASON the original cell existed — the moment is the
  // door's `resets_at_local`, never a constant this app keeps a second copy of.
  //
  // The STRING, read from the shipped message catalogue rather than from a component render, so
  // this cell fails if the copy is edited even when no component test happens to mount that state.
  const messages = (await import("../../messages/en.json", { with: { type: "json" } })).default as unknown as
    { IntakeBatch: { capacity: { reset: string; body: string }; residual: { preIntakeRefusal: string } } };
  const { reset, body } = messages.IntakeBatch.capacity;
  assert.match(reset, /\{at\}/, "the reset moment comes from the DOOR, never from a local constant");
  assert.match(reset, /\{zone\}/, "…and so does its zone");
  for (const [label, text] of [["reset", reset], ["body", body]] as const) {
    assert.ok(!/\d{1,2}:\d{2}/.test(text),
      `capacity.${label} hardcodes a clock time — the wall belongs to the door, which already reports it`);
  }
  // ADV-W2L05-03: nothing in the estate re-drives a quota-refused file, so the banner must not
  // say it continues on its own.
  assert.ok(!/continue after the reset/i.test(body),
    "capacity.body promises an automatic resume nothing performs");
  assert.match(body, /upload it again/i, "…it states the remedy the firm actually has");
  // L05-SPEC-02 / ADV-W2L05-02: the residual sentence must state what 0254 does, not what the
  // pre-#965 door did.
  const residual = messages.IntakeBatch.residual.preIntakeRefusal;
  assert.ok(!/never joins a batch/i.test(residual),
    "the retired claim is still in the shipped catalogue — #965 made it false");
  assert.match(residual, /keeps its record/i,
    "the named residual is on the SURFACE, not only in a report");
});
