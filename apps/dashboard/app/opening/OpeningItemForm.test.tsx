// OpeningItemForm render tests (the regionOverlay/ComplianceWatchCard pattern:
// createElement + renderToStaticMarkup, no jsdom — the form's initial render only, no
// effects/network). Locks two adjudicated fixes:
//   F-H4: a KEYED seed does NOT offer the fixed-asset kind (seed_fixed_asset derives its
//         resolution from a tie document, so it would fail CLR01), and shows the honest
//         FORK-7 path with a link to the plan page. A DOCUMENT seed keeps the FA option.
//   F-C1: a keyed seed disables drafting until an EXPLICIT client attribution exists (the
//         resolution id is passed in from the workbench), with an honest hint.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpeningItemForm } from "./OpeningItemForm";
import type { OpeningSeedRow } from "./openingModel";

function mkSeed(p: Partial<OpeningSeedRow> = {}): OpeningSeedRow {
  return {
    id: "seed-1", client_id: "c1", plan_id: "pl1", as_of: "2026-06-30", state: "open",
    tie_document_id: null, tie_document_sha256: null, batch_n: 1, finalized_at: null, created_at: null, ...p,
  };
}

test("F-H4: a keyed seed does NOT offer the fixed-asset kind and shows the honest FORK-7 path", () => {
  const html = renderToStaticMarkup(createElement(OpeningItemForm, {
    token: "jwt", seed: mkSeed({ tie_document_id: null }), clientId: "c1", keyedResolution: "res-1", onChanged: () => {},
  }));
  assert.ok(!html.includes(">Fixed asset<"), "the fixed-asset option is not offered on a keyed seed");
  assert.ok(html.includes("cannot register fixed assets"), "the honest FORK-7 path renders");
  assert.ok(html.includes("/clients/plan?client_id=c1"), "it links to the plan page to record the todo");
});

test("F-H4: a document-tied seed DOES offer the fixed-asset kind and shows no FORK-7 refusal", () => {
  const html = renderToStaticMarkup(createElement(OpeningItemForm, {
    token: "jwt", seed: mkSeed({ tie_document_id: "doc-1", tie_document_sha256: "a".repeat(64) }), clientId: "c1", keyedResolution: null, onChanged: () => {},
  }));
  assert.ok(html.includes(">Fixed asset<"), "a document-tied seed keeps the fixed-asset option");
  assert.ok(!html.includes("cannot register fixed assets"), "no FORK-7 refusal on a document seed");
});

test("F-C1: a keyed seed without a confirmed attribution disables drafting with an honest hint", () => {
  const html = renderToStaticMarkup(createElement(OpeningItemForm, {
    token: "jwt", seed: mkSeed({ tie_document_id: null }), clientId: "c1", keyedResolution: null, onChanged: () => {},
  }));
  assert.match(html, /<button[^>]*disabled[^>]*>Draft item<\/button>/, "drafting is disabled until the attribution exists");
  assert.ok(html.includes("Confirm client attribution on this keyed seed"), "the honest attribution hint is shown");
});

test("F-C1: a keyed seed WITH a confirmed attribution enables drafting", () => {
  const html = renderToStaticMarkup(createElement(OpeningItemForm, {
    token: "jwt", seed: mkSeed({ tie_document_id: null }), clientId: "c1", keyedResolution: "res-1", onChanged: () => {},
  }));
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Draft item<\/button>/, "drafting is enabled once the attribution exists");
});
