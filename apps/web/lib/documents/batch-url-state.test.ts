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

test("the capacity copy says 08:00 and never 'midnight' or 'tomorrow'", async () => {
  // The STRING, read from the shipped message catalogue rather than from a component render, so
  // this cell fails if the copy is edited even when no component test happens to mount that state.
  const messages = (await import("../../messages/en.json", { with: { type: "json" } })).default as
    Record<string, Record<string, Record<string, string>>>;
  const body = messages.IntakeBatch.capacity.body;
  assert.match(body, /\{at\}/, "the reset moment comes from the DOOR, never from a local constant");
  assert.ok(!/midnight/i.test(body), "the daily window is a UTC day, which is 08:00 MYT — never midnight");
  assert.ok(!/tomorrow/i.test(body), "…and never 'tomorrow', which is wrong for most of the day");
  assert.match(messages.IntakeBatch.residual.preIntakeRefusal, /never joins a batch/,
    "the named residual is on the SURFACE, not only in a report");
});
