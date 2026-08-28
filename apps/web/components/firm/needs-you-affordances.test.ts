// Pure-function tests for the row-kind affordance registry (independent
// review, fix-required, 2026-08-28) — no rendering, same instrument as
// lib/*.test.ts's own plain node:test + assert shape, since
// getNeedsYouAffordance() has no React/DOM dependency of its own.
//
// THE FINDING THIS FILE PINS: before the fix, NEEDS_YOU_AFFORDANCES was a
// plain `{}` object literal, so `["constructor"]`/`["toString"]` resolved to
// INHERITED Object.prototype members rather than `undefined` — a THROW when
// needs-you-row.tsx tried to render "constructor" as a component, and the
// literal text "[object Undefined]" for "toString". The fix is two
// independent belts: NEEDS_YOU_AFFORDANCES is built on a null-prototype
// object (needs-you-affordances.tsx's own header), and getNeedsYouAffordance
// additionally guards with Object.hasOwn. Both are exercised here; see
// needs-you-a11y.test.tsx for the render-level confirmation that an unknown
// kind (including these two hostile names) produces no inline affordance.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getNeedsYouAffordance, NEEDS_YOU_AFFORDANCES } from "./needs-you-affordances";

test("getNeedsYouAffordance('constructor') returns undefined, not an inherited Object.prototype member", () => {
  assert.equal(getNeedsYouAffordance("constructor"), undefined);
});

test("getNeedsYouAffordance('toString') returns undefined, not an inherited Object.prototype member", () => {
  assert.equal(getNeedsYouAffordance("toString"), undefined);
});

test("getNeedsYouAffordance('__proto__') returns undefined, not the prototype object itself", () => {
  assert.equal(getNeedsYouAffordance("__proto__"), undefined);
});

test("getNeedsYouAffordance returns undefined for an unregistered but otherwise ordinary row_kind", () => {
  assert.equal(getNeedsYouAffordance("some_unregistered_kind"), undefined);
});

test("getNeedsYouAffordance still resolves open_question", () => {
  assert.equal(typeof getNeedsYouAffordance("open_question"), "function");
});

// F8 (independent review, fix-required, 2026-08-28): this file's own case
// above used to say "the ONE real entry" — stale the moment T3 registered a
// second one (needs-you-affordances.tsx's own table now carries
// fixed_asset_incomplete too). Proven here by name, not inferred from the
// other case still passing.
test("getNeedsYouAffordance resolves fixed_asset_incomplete (T3, port wave)", () => {
  assert.equal(typeof getNeedsYouAffordance("fixed_asset_incomplete"), "function");
});

// T10 (port wave): this file's own case above proved TWO real entries; this
// one proves a third BY NAME rather than being inferred from the others still
// passing — the same F8 reasoning (needs-you-affordances.tsx's own table, not
// this file's count of assertions) applies to every train that adds one.
test("getNeedsYouAffordance resolves compliance_watch (T10, port wave)", () => {
  assert.equal(typeof getNeedsYouAffordance("compliance_watch"), "function");
});

test("NEEDS_YOU_AFFORDANCES has no prototype (Object.getPrototypeOf is null)", () => {
  assert.equal(Object.getPrototypeOf(NEEDS_YOU_AFFORDANCES), null);
});

// T7 (port-wave plan §4/§5): three more row kinds registered, by name — this
// file's own F8 discipline (a stale "the ONE real entry" claim is worse than
// no claim at all).
test("getNeedsYouAffordance resolves uncoded_filing (T7, port wave)", () => {
  assert.equal(typeof getNeedsYouAffordance("uncoded_filing"), "function");
});

test("getNeedsYouAffordance resolves coding_task (T7, port wave)", () => {
  assert.equal(typeof getNeedsYouAffordance("coding_task"), "function");
});

test("getNeedsYouAffordance resolves lint_finding (T7, port wave)", () => {
  assert.equal(typeof getNeedsYouAffordance("lint_finding"), "function");
});

// 裁-17 (mohe-grill-rulings-2026-08-28.md): the ninth row_kind, by name — the
// same F8 discipline as every case above (this file's own count of assertions
// proves nothing; the registry table does).
test("getNeedsYouAffordance resolves seeding_proposal (裁-17, pre-beta)", () => {
  assert.equal(typeof getNeedsYouAffordance("seeding_proposal"), "function");
});
