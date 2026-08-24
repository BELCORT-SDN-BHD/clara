// F-A9 PR-0 — the chat "limit" banner, the third hop of the CLR14 chain.
//
// THE CHAIN, so a reader does not have to reconstruct it: clara.begin_chat_turn raises
// CLR14 → packages/runtime/src/chatRoutes.ts's turnLimitPayload builds the 429 body →
// api.ts's postTurn maps it to a `limit` TurnResult → this helper renders the banner.
// The runtime half is proven in packages/runtime/tests/chat-limit-copy.test.mjs.
//
// WHAT CHANGED. Until F-A9 PR-0 the runtime attached a second sentence — "Your firm's
// daily budget resets at 00:00 UTC (08:00 Malaysia time)" — plus a next-UTC-midnight
// timestamp, because CLR14 could mean a daily token budget. The owner removed that gate
// (TA-P12 = A; digest law 76 "meter, never cap"), so CLR14 now means the concurrent
// compute-run floor and nothing else, and both halves of the reset pair are null. A
// concurrency floor has no reset instant, so a banner that promised one would be a
// visible record that lies (law 22).
//
// WHY A HELPER AND A TEST FOR THREE LINES. The failure mode is silent and user-facing:
// a join that forgets to drop a null renders the literal "null" into the banner, and a
// `?? ""` renders a trailing space. TypeScript catches neither — `string | null` joined
// into a string is well-typed and wrong.

import { test } from "node:test";
import assert from "node:assert/strict";
import { limitBanner } from "./api";

const DB_MESSAGE = "concurrent compute-run cap reached for firm (3 of 3 running)";

test("limitBanner renders the DB message ALONE when resetCopy is null (the post-F-A9-PR-0 shape)", () => {
  const out = limitBanner(DB_MESSAGE, null);
  assert.equal(out, DB_MESSAGE, "the banner is exactly the server's own sentence");
  assert.doesNotMatch(out, /null/i, 'the banner never renders the literal string "null"');
  assert.equal(out, out.trim(), "no trailing space from a dropped second sentence");
  assert.doesNotMatch(out, /budget|\bdaily\b|resets? at/i, "no retired daily-budget wording survives on the banner");
});

test("limitBanner drops an empty or whitespace-only second sentence rather than appending a gap", () => {
  assert.equal(limitBanner(DB_MESSAGE, ""), DB_MESSAGE, "an empty resetCopy adds nothing");
  assert.equal(limitBanner(DB_MESSAGE, "   "), DB_MESSAGE, "a whitespace-only resetCopy adds nothing");
});

test("limitBanner still joins a REAL second sentence — the seam drops nulls, it does not drop copy", () => {
  // Nothing produces a resetCopy today, and this cell is why that is a fact rather than a
  // coincidence: if a future limit legitimately has a reset instant, the banner carries it.
  const out = limitBanner(DB_MESSAGE, "Slots free as your running turns finish.");
  assert.equal(out, `${DB_MESSAGE} Slots free as your running turns finish.`);
});

test("limitBanner invents NO copy of its own — the server's words are the only words", () => {
  // The pin is the boundary, not the empty string: this helper must never grow a local
  // default ("usage limit reached", a reset sentence, a reassurance). The dashboard cannot
  // know which limit fired or what frees it; only the DB message can say, and the non-empty
  // guarantee therefore belongs upstream in turnLimitPayload (proven in
  // packages/runtime/tests/chat-limit-copy.test.mjs), never here.
  assert.equal(limitBanner("", null), "", "given nothing to render, the banner renders nothing rather than a locally-invented sentence");
  assert.equal(limitBanner("", "  "), "", "and the same with a blank second sentence");
});
