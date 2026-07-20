// Runtime-wire parity for the canonical ClaraPart union (PIN-DELTA-3). The runtime's
// three frozen `ClaraPart` unions (chatTurn*.prompt.ts) can never import this module
// (workflow immutability + the freeze IMPORT-ESCAPE law), so parity is pinned HERE by
// fixture: every shape the AS-BUILT runtime (chatTurn.v3) actually emits on the wire —
// INCLUDING the `attachment` part it handles only through an `as` cast (its own union
// never declared it) — is transcribed as a `ClaraPart` fixture. If any shape were not
// assignable, THIS FILE would not typecheck (`pnpm typecheck`) — that is the compile-
// time half. The render half asserts the dashboard renderer handles every one (never
// the silent-drop fallback), closing the dashboard-side attachment cast-gap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClaraPart } from "./parts";
import { TranscriptParts, FALLBACK_UNSUPPORTED_PREFIX } from "../chat/parts";

function render(parts: ClaraPart[]): string {
  return renderToStaticMarkup(createElement(TranscriptParts, { parts }));
}

// The EXACT shapes chatTurn.v3.prompt.ts emits (transcribed verbatim), plus the
// attachment cast shape from chatTurn.v3.impl.ts:40 (`p as { document_id }`). Typed as
// ClaraPart[] — assignability is enforced by tsc.
const RUNTIME_WIRE_FIXTURES: ClaraPart[] = [
  { type: "text", text: "Booked to 620-000." },
  { type: "tool_call", tool: "read_document", tool_call_id: "c1", input: { document_id: "d1" } },
  { type: "tool_result", tool: "read_document", tool_call_id: "c1", output: { ok: true } },
  { type: "tool_error", tool: "read_document", tool_call_id: "c1", error: "boom" },
  { type: "clarify", tool_call_id: "c2", question: "Which client?", context: "two share this vendor", framing: "Visible to your firm." },
  { type: "clarify_closed", reason: "expired", framing: "Visible to your firm." },
  // The attachment cast-gap: the runtime rides this on the wire but never declares it.
  { type: "attachment", document_id: "d1", intake_id: "i1" },
  { type: "je_review", entry_id: "e1", revision_token: "r1", client_id: "cl1", document_id: "d1", provenance_tier: "verified", uncertainty: { note: "n", alternatives: ["a", "b"] }, exception: true },
  { type: "refusal", code: "CLR21", reason: "amount_conflict", message: "CLR21: mismatch." },
];

// Every runtime wire shape is HANDLED by the dashboard renderer — none reaches the
// unsupported fallback (the Slice-5 silent-drop the union unification closes).
test("runtime-wire: no emitted part hits the unsupported fallback", () => {
  for (const fixture of RUNTIME_WIRE_FIXTURES) {
    const html = render([fixture]);
    assert.ok(!html.includes(FALLBACK_UNSUPPORTED_PREFIX), `runtime part ${fixture.type} hit the unsupported fallback — the dashboard union does not cover it`);
  }
});

// The attachment part specifically renders a visible chip (the cast-gap closure).
test("runtime-wire: the attachment cast-gap part renders a visible chip", () => {
  const html = render([{ type: "attachment", document_id: "d1", intake_id: "i1" }]);
  assert.ok(html.trim().length > 0, "attachment rendered empty");
  assert.ok(!html.includes(FALLBACK_UNSUPPORTED_PREFIX), "attachment hit the unsupported fallback");
});

// Non-resolver runtime parts render something visible; tool_result/tool_error resolve
// an earlier chip and render nothing standalone (unchanged Slice-4 contract).
test("runtime-wire: visible parts render non-empty; resolvers render empty", () => {
  for (const fixture of RUNTIME_WIRE_FIXTURES) {
    const html = render([fixture]).trim();
    if (fixture.type === "tool_result" || fixture.type === "tool_error") {
      assert.equal(html, "", `${fixture.type} should render nothing standalone`);
    } else {
      assert.ok(html.length > 0, `${fixture.type} rendered empty`);
    }
  }
});
