// The card-catalog PARITY + REACHABILITY gate, ported from
// apps/dashboard/app/chat/partCatalog.test.tsx. Runs WITHOUT a DB — fixtures only
// (test/bootstrap.mjs sets the JSX runtime; no CSS stub needed here).
//
// Guarantees:
//   1. Parity       — every registered render type produces a visible element
//                     (never the fallback chip); the compile-time asserts in
//                     catalog.ts additionally forbid a wire type that is neither
//                     registered nor a status-resolver (proven separately below by
//                     the deliberate-breakage drill recorded in the build report,
//                     not re-run here since it requires editing types.ts).
//   2. Reachability — every registered type has >=1 fixture that renders non-empty.
//   3. Fallback     — an unknown/unsupported part type renders the explicit chip.
//   4. Resolvers    — tool_result / tool_error render nothing standalone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClaraPart } from "./types";
import { PART_CATALOG, RENDER_BRANCH_TYPES, STATUS_RESOLVER_TYPES } from "./catalog";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "../../components/parts/PartRenderer";

function render(part: ClaraPart): string {
  return renderToStaticMarkup(createElement(PartRenderer, { part }));
}

// 1 + 2: parity + reachability for every registered render-branch type.
for (const type of RENDER_BRANCH_TYPES) {
  const entry = PART_CATALOG[type];
  test(`parity/reachability: ${type} has a non-empty persisted-render branch`, () => {
    assert.ok(entry.fixtures.length >= 1, `${type} must have >=1 reachability fixture`);
    for (const fixture of entry.fixtures) {
      const html = render(fixture);
      assert.ok(html.trim().length > 0, `${type} rendered empty — missing/blank persisted-render branch`);
      assert.ok(
        !html.includes(FALLBACK_UNSUPPORTED_PREFIX),
        `${type} hit the unsupported fallback chip — it has NO persisted-render branch in PartRenderer`,
      );
    }
  });
}

// 3: an unregistered/unknown part type renders the explicit fallback chip.
test("unknown part type renders the explicit unsupported fallback chip", () => {
  const html = render({ type: "totally_unknown_v9" } as unknown as ClaraPart);
  assert.ok(html.includes(FALLBACK_UNSUPPORTED_PREFIX), `expected the fallback chip, got: ${html}`);
  assert.ok(html.includes("totally_unknown_v9"), "the fallback chip should name the unknown type");
});

// 3b: a part-shaped value with a non-string `type` still falls back honestly
// (never throws, never prints "undefined" or "[object Object]").
test("a malformed part with a non-string type still renders the fallback, never throws", () => {
  const html = render({ type: 42 } as unknown as ClaraPart);
  assert.ok(html.includes(`${FALLBACK_UNSUPPORTED_PREFIX}?`), `expected the '?' fallback, got: ${html}`);
});

// 4: status-resolver types intentionally render nothing on their own.
for (const type of STATUS_RESOLVER_TYPES) {
  test(`status-resolver ${type} renders nothing standalone`, () => {
    const fixture =
      type === "tool_result"
        ? ({ type, tool: "trial_balance", tool_call_id: "c1", output: null } as ClaraPart)
        : ({ type, tool: "trial_balance", tool_call_id: "c1", error: "boom" } as ClaraPart);
    assert.equal(render(fixture).trim(), "");
  });
}

// Belt-and-braces: the catalog is exactly 18 live types (16 render branches + 2
// status resolvers) — the corrected count from
// docs/plan/active/codex-frontend-handoff-errata-2026-08-27.md (ii), not the stale
// 21 in frontend-handoff-2026-08-23.md §3.1.
test("the catalog totals 18 live part types (16 render branches + 2 status resolvers)", () => {
  assert.equal(RENDER_BRANCH_TYPES.length, 16);
  assert.equal(STATUS_RESOLVER_TYPES.length, 2);
  const retired = ["kb_rule_proposal", "rule_post_receipt", "bank_rule_proposal"];
  for (const t of retired) {
    assert.ok(!RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]), `${t} is retired — must not be registered`);
  }
});

// The refusal card renders the CLR code + message VERBATIM (contract §3.2's
// deliberate no-hydrate exception) — never re-worded.
test("refusal renders the CLR code and message verbatim", () => {
  const html = render({ type: "refusal", code: "CLR21", reason: "amount_conflict", message: "CLR21: the proposed lines do not match the machine-corroborated total." });
  assert.match(html, /CLR21/);
  assert.match(html, /amount_conflict/);
  assert.match(html, /the proposed lines do not match the machine-corroborated total/);
});
