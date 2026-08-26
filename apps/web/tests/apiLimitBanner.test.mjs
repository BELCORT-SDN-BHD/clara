// `lib/clara/api.ts` `limitBanner` — ported verbatim from the sealed
// `apps/dashboard/app/chat/api.ts`. Guards a silent failure mode: joining a null
// `resetCopy` naively would render the literal string "null" into a user-facing banner.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { limitBanner } = await import("../lib/clara/api.ts");

test("joins message and resetCopy with a space", () => {
  assert.equal(limitBanner("usage limit reached", "resets at 00:00 UTC"), "usage limit reached resets at 00:00 UTC");
});

test("a null resetCopy never renders the literal string 'null'", () => {
  assert.equal(limitBanner("usage limit reached", null), "usage limit reached");
});

test("a blank resetCopy is dropped, not rendered as a trailing space", () => {
  assert.equal(limitBanner("usage limit reached", "   "), "usage limit reached");
});
