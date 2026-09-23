// lib/bank/citation.ts — the #990 three-state source-citation label.

import { test } from "node:test";
import assert from "node:assert/strict";
import { citationState, citationLabel } from "./citation";

test("citationState · structured and human are ALWAYS lane_none, whatever citation_page carries", () => {
  assert.equal(citationState("structured", null), "lane_none");
  assert.equal(citationState("structured", 4), "lane_none", "a lane_none verdict never depends on citation_page");
  assert.equal(citationState("human", null), "lane_none");
});

test("citationState · a machine lane (ocr/witness) with a page is present; without one is not_recorded", () => {
  assert.equal(citationState("witness", 3), "present");
  assert.equal(citationState("ocr", 1), "present");
  assert.equal(citationState("witness", null), "not_recorded");
  assert.equal(citationState("ocr", null), "not_recorded");
});

test("citationState · an unrecognised or null ingest_mode is treated as a machine lane's own silence, never lane_none", () => {
  assert.equal(citationState(null, null), "not_recorded");
  assert.equal(citationState(null, 2), "present");
  assert.equal(citationState("some-future-lane", null), "not_recorded");
});

test("citationLabel · renders from the app's own message catalogue, one key per state", () => {
  const calls: Array<{ key: string; params?: Record<string, string | number> }> = [];
  const t = (key: string, params?: Record<string, string | number>) => {
    calls.push({ key, params });
    return `[${key}]`;
  };
  assert.equal(citationLabel(t, "witness", 5), "[citationPage]");
  assert.deepEqual(calls[0], { key: "citationPage", params: { page: 5 } });

  assert.equal(citationLabel(t, "structured", null), "[citationLaneNone]");
  assert.equal(citationLabel(t, "witness", null), "[citationNotRecorded]");
});
