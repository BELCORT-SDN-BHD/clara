// The card-catalog PARITY + REACHABILITY gate (DIRECTION §3 / contract §3). This
// is the CI mechanism that closes the Slice-5 silent-drop: a new wire part type
// added without a persisted-render branch would vanish (`return null`). It runs
// WITHOUT a DB — fixtures only (test/bootstrap.mjs stubs CSS + sets the JSX runtime).
//
// Guarantees:
//   1. Parity     — every registered render type produces a visible element (never
//                   the fallback chip); the compile-time asserts in partCatalog.ts
//                   additionally forbid a wire type that is neither registered nor a
//                   status-resolver.
//   2. Reachability — every registered type has ≥1 fixture that renders non-empty.
//   3. Fallback   — an unknown/unsupported part type renders the explicit chip.
//   4. Resolvers  — tool_result / tool_error render nothing standalone (by design).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClaraPart } from "./api";
import { PART_CATALOG, RENDER_BRANCH_TYPES, STATUS_RESOLVER_TYPES } from "./partCatalog";
import { TranscriptParts, FALLBACK_UNSUPPORTED_PREFIX } from "./parts";

function render(parts: ClaraPart[]): string {
  // No token → the je_review card renders its id-only state (still non-empty); no
  // DB call fires (useEffect does not run under renderToStaticMarkup).
  return renderToStaticMarkup(createElement(TranscriptParts, { parts }));
}

// 1 + 2: parity + reachability for every registered render-branch type.
for (const type of RENDER_BRANCH_TYPES) {
  const entry = PART_CATALOG[type];
  test(`parity/reachability: ${type} has a non-empty persisted-render branch`, () => {
    assert.ok(entry.fixtures.length >= 1, `${type} must have >=1 reachability fixture`);
    for (const fixture of entry.fixtures) {
      const html = render([fixture]);
      assert.ok(html.trim().length > 0, `${type} rendered empty — missing/blank persisted-render branch`);
      assert.ok(
        !html.includes(FALLBACK_UNSUPPORTED_PREFIX),
        `${type} hit the unsupported fallback chip — it has NO persisted-render branch in TranscriptParts`,
      );
    }
  });
}

// 3: an unregistered/unknown part type renders the explicit fallback chip (visible,
// never silently dropped).
test("unknown part type renders the explicit unsupported fallback chip", () => {
  const html = render([{ type: "totally_unknown_v9" } as unknown as ClaraPart]);
  assert.ok(html.includes(FALLBACK_UNSUPPORTED_PREFIX), `expected the fallback chip, got: ${html}`);
  assert.ok(html.includes("totally_unknown_v9"), "the fallback chip should name the unknown type");
});

// 4: status-resolver types intentionally render nothing on their own.
for (const type of STATUS_RESOLVER_TYPES) {
  test(`status-resolver ${type} renders nothing standalone`, () => {
    const fixture =
      type === "tool_result"
        ? ({ type, tool: "trial_balance", tool_call_id: "c1", output: null } as ClaraPart)
        : ({ type, tool: "trial_balance", tool_call_id: "c1", error: "boom" } as ClaraPart);
    assert.equal(render([fixture]).trim(), "");
  });
}

// Belt-and-braces: the je_review + refusal types the slice introduces are actually
// registered (guards against a future refactor dropping them from the catalog).
test("slice-6 part types are registered in the catalog", () => {
  assert.ok(RENDER_BRANCH_TYPES.includes("je_review"), "je_review must be registered");
  assert.ok(RENDER_BRANCH_TYPES.includes("refusal"), "refusal must be registered");
});

// Belt-and-braces: the FOUR surviving Wave-A part types are registered (the union
// unification + new card set — contract §9). kb_rule_proposal RETIRED with F-A2 PR-3
// (GM-11 — it rendered get_coding_rule, a dropped verb). A future refactor dropping
// one of these four fails here AND fails the compile-time parity guard in partCatalog.ts.
test("wave-a part types are registered in the catalog", () => {
  for (const t of ["doc_review", "diff", "sweep_receipt", "open_question"]) {
    assert.ok(RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]), `${t} must be registered`);
  }
});

// The Wave-A2 rule_post_receipt part RETIRED with F-A2 PR-3 — it rendered the
// rule_post_runs receipt from a signed-and-executed autopost rule, and the whole
// rules-execution tier (including the verb that ever produced such a run) is dropped.
// A forced NEGATIVE cell, not a deletion of the claim: the type must NOT be registered.
test("wave-a2 rule_post_receipt is RETIRED — no longer registered in the catalog", () => {
  assert.ok(!RENDER_BRANCH_TYPES.includes("rule_post_receipt" as (typeof RENDER_BRANCH_TYPES)[number]), "rule_post_receipt must not be registered post-retirement");
});

// Belt-and-braces: the two Wave C-c parts (bank_recon_receipt/bank_rule_proposal,
// design v2.1 §7) are registered and render non-empty.
test("wave-c-c bank_recon_receipt and bank_rule_proposal are registered and render non-empty", () => {
  for (const t of ["bank_recon_receipt", "bank_rule_proposal"]) {
    assert.ok(RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]), `${t} must be registered`);
  }
  const recon = render([{ type: "bank_recon_receipt", statement_id: "stmt-1010", client_id: "client-1111" }]);
  assert.ok(recon.includes("Bank reconciliation"), "the id-only receipt card state must render");
  assert.ok(!recon.includes(FALLBACK_UNSUPPORTED_PREFIX));
  const rule = render([{ type: "bank_rule_proposal", rule_id: "rule-1111", client_id: "client-1111" }]);
  assert.ok(rule.includes("Bank rule proposal"), "the id-only proposal card state must render");
  assert.ok(!rule.includes(FALLBACK_UNSUPPORTED_PREFIX));
});

// Belt-and-braces: the two Wave D-a parts (fixed_asset/depreciation_run_receipt,
// design v2.1 §6/§7) are registered and render non-empty.
test("wave-d-a fixed_asset and depreciation_run_receipt are registered and render non-empty", () => {
  for (const t of ["fixed_asset", "depreciation_run_receipt"]) {
    assert.ok(RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]), `${t} must be registered`);
  }
  const asset = render([{ type: "fixed_asset", client_id: "client-1111", asset_id: "asset-1212" }]);
  assert.ok(asset.includes("Fixed asset"), "the id-only asset card state must render");
  assert.ok(!asset.includes(FALLBACK_UNSUPPORTED_PREFIX));
  const run = render([{ type: "depreciation_run_receipt", client_id: "client-1111", run_id: "run-1313" }]);
  assert.ok(run.includes("Depreciation run"), "the id-only run receipt card state must render");
  assert.ok(!run.includes(FALLBACK_UNSUPPORTED_PREFIX));
});

// Belt-and-braces: the two Wave D-b parts (adjustment_run_receipt/staff_advance,
// design §2.7/§2.8/§3.4/§7) are registered and render non-empty.
test("wave-d-b adjustment_run_receipt and staff_advance are registered and render non-empty", () => {
  for (const t of ["adjustment_run_receipt", "staff_advance"]) {
    assert.ok(RENDER_BRANCH_TYPES.includes(t as (typeof RENDER_BRANCH_TYPES)[number]), `${t} must be registered`);
  }
  const run = render([{ type: "adjustment_run_receipt", client_id: "client-1111", run_id: "run-1414" }]);
  assert.ok(run.includes("Adjustment run"), "the id-only run receipt card state must render");
  assert.ok(!run.includes(FALLBACK_UNSUPPORTED_PREFIX));
  const advance = render([{ type: "staff_advance", client_id: "client-1111", advance_id: "advance-1515" }]);
  assert.ok(advance.includes("Staff advance"), "the id-only advance card state must render");
  assert.ok(!advance.includes(FALLBACK_UNSUPPORTED_PREFIX));
});
