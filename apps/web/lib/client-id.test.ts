// lib/client-id.ts — #614's shape gate. Every cell here is the regex's own
// literal answer for that input, not a claim about which ids are "real" —
// `isClientIdShape` never talks to RLS or the DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isClientIdShape } from "./client-id";

test("a well-formed v4 uuid (lowercase) passes", () => {
  assert.equal(isClientIdShape("22222222-2222-4222-8222-222222222222"), true);
});

test("uppercase hex is accepted — PostgREST's own uuid parser is case-insensitive", () => {
  assert.equal(isClientIdShape("22222222-2222-4222-8222-222222222222".toUpperCase()), true);
});

test("the nil uuid passes the SHAPE check (it is syntactically valid; it simply names no row)", () => {
  assert.equal(isClientIdShape("00000000-0000-0000-0000-000000000000"), true);
});

test("the #614 defect input fails — this is the exact segment that reached PostgREST as 22P02", () => {
  assert.equal(isClientIdShape("not-a-client"), false);
});

test("empty string fails", () => {
  assert.equal(isClientIdShape(""), false);
});

test("a well-formed uuid with a trailing segment fails — the regex is anchored end to end", () => {
  assert.equal(isClientIdShape("22222222-2222-4222-8222-222222222222-extra"), false);
});
