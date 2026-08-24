// F-A9 PR-0 — the CLR14 → 429 payload, read as a payload rather than as source text.
// No DB and no world: the route module (.ts) is loaded through tsx's ESM loader and only
// the pure exported builder is exercised, the same shape wave-a-document-route.test.mjs
// uses for documentRouteStatus.
//
// WHY THIS FILE EXISTS. Until F-A9 PR-0 `begin_chat_turn` raised CLR14 for TWO reasons —
// a daily token budget and the concurrent compute-run floor — and this route answered both
// with the same 429 body, carrying `reset_copy: "Your firm's daily budget resets at 00:00
// UTC (08:00 Malaysia time)"` and `reset_utc: <next UTC midnight>`. The owner removed the
// budget gate (TA-P12 = A, the 2026-08-22 Track-A sitting; digest law 76 "meter, never
// cap"), so the only CLR14 admission can raise now is the concurrency floor — and a
// concurrency floor has no reset instant. Leaving either half of that pair would have the
// dashboard render a confident, precise, wrong sentence under a correct one, which is
// exactly what law 22 (a visible record must not lie) forbids.
//
// THE ASSERTION IS OVER THE PRODUCED VALUES, NOT OVER THE FILE. A substring sweep of the
// source would pass while the route emitted anything at all (spelling is not identity):
// these cells build the payload and read every string in it.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { turnLimitPayload } = await import("../src/chatRoutes.ts");

/** Every string value the payload carries, flattened — what a client can actually render. */
const strings = (payload) => Object.values(payload).filter((v) => typeof v === "string");

test("turnLimitPayload carries the DB's own concurrency message and NO spend-budget wording", () => {
  const dbMessage = "concurrent compute-run cap reached for firm (3 of 3 running)";
  const p = turnLimitPayload(dbMessage);

  assert.equal(p.error, "limit", "the typed error code is unchanged (the dashboard branches on it)");
  assert.equal(p.message, dbMessage, "the DB's own message passes through verbatim — it already names the live numbers");
  assert.match(p.message, /run|concurren|cap|slot/i, "the message names WHICH limit (runs)");

  for (const s of strings(p)) {
    assert.doesNotMatch(s, /budget/i, `no value in the 429 payload may say "budget" — got: ${s}`);
    assert.doesNotMatch(s, /\bdaily\b/i, `no value in the 429 payload may say "daily" — got: ${s}`);
    assert.doesNotMatch(s, /resets? at/i, `no value in the 429 payload may promise a reset time — got: ${s}`);
    assert.doesNotMatch(s, /malaysia time|myt/i, `no value in the 429 payload may name the MYT budget-day boundary — got: ${s}`);
  }
});

test("turnLimitPayload nulls BOTH halves of the retired reset pair — a concurrency floor has no reset instant", () => {
  const p = turnLimitPayload("concurrent compute-run cap reached for firm (3 of 3 running)");
  assert.equal(p.reset_copy, null, "reset_copy is null, not a reworded budget sentence");
  assert.equal(p.reset_utc, null, "reset_utc is null — a next-UTC-midnight timestamp is daily-budget semantics and would be a precise wrong answer");
  // The keys must still be PRESENT: apps/dashboard/app/chat/api.ts maps them and its typed
  // variant declares them `string | null`, so a missing key and a null are not the same
  // contract. Read as own-property existence, never as `=== undefined`.
  assert.ok(Object.hasOwn(p, "reset_copy"), "the reset_copy key is present (the dashboard's typed mapper reads it)");
  assert.ok(Object.hasOwn(p, "reset_utc"), "the reset_utc key is present (the dashboard's typed mapper reads it)");
});

test("turnLimitPayload fails closed on an empty or missing DB message — never a blank banner", () => {
  for (const bad of [undefined, ""]) {
    const p = turnLimitPayload(bad);
    assert.ok(p.message.length > 0, `an ${JSON.stringify(bad)} DB message still yields a non-empty message`);
    assert.match(p.message, /run|concurren|limit/i, `the fallback names the concurrency limit — got: ${p.message}`);
    assert.doesNotMatch(p.message, /budget|\bdaily\b/i, `the fallback must not be spelled as a spend budget — got: ${p.message}`);
  }
});
