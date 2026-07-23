// SeedingBatchView: the one branch a static render (no jsdom, no effects) can
// legitimately exercise is the `!token` gate (the KbRuleProposalCard/
// ComplianceWatchCard precedent) — the self-hydrating batch+proposals read only
// fires inside a useEffect, which renderToStaticMarkup never runs. The grouped-
// proposal / distinct-ceremony rendering this component composes is covered at the
// SeedingProposalRow level (props-driven, fully static-render-testable) plus the
// pure model.ts helpers it calls (groupProposalsByKind / batchIsOpen / isDecidable).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeedingBatchView } from "./SeedingBatchView";

test("with no token the view asks for a JWT and renders no batch content", () => {
  const html = renderToStaticMarkup(createElement(SeedingBatchView, { token: null, batchId: "b1" }));
  assert.ok(html.includes("Paste a session JWT"));
  assert.ok(!html.includes("approve all"), "the tick-list ceremony never offers a bulk verb");
});
