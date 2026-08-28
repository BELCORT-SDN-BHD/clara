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

test("getNeedsYouAffordance still resolves the one real, registered entry", () => {
  assert.equal(typeof getNeedsYouAffordance("open_question"), "function");
});

test("NEEDS_YOU_AFFORDANCES has no prototype (Object.getPrototypeOf is null)", () => {
  assert.equal(Object.getPrototypeOf(NEEDS_YOU_AFFORDANCES), null);
});
