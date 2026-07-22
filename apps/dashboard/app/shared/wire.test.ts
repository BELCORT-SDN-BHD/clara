// The governed CLR envelope parse (shared/wire.ts + the chat/api.ts copy). The CLR
// code IS the SQLSTATE — every governed raise carries it as `using errcode='CLRxx'`
// and NONE embeds the token in its message text — so PostgREST reports it in
// `body.code`. Parsing the message instead yields null for every real refusal, which
// silently kills every refusal branch in the cards. These tests pin the code-first
// parse, the non-CLR SQLSTATE case, and the message fallback.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClrCode, pgrestError, parseReasonToken, type PgrestError } from "./wire";
import { parseClrCode as chatParseClrCode } from "../chat/api";

function pgrestBody(body: Record<string, unknown>, status = 400): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("parseClrCode reads the SQLSTATE first — the shape PostgREST actually returns", () => {
  assert.equal(parseClrCode("CLR04", "insufficient role"), "CLR04");
  assert.equal(parseClrCode("CLR21", "proposed total conflicts with the machine-corroborated total"), "CLR21");
  assert.equal(parseClrCode("CLR10", "op_key is required"), "CLR10");
});

test("a non-CLR SQLSTATE is not a governed refusal", () => {
  assert.equal(parseClrCode("23505", "duplicate key value violates unique constraint"), null);
  assert.equal(parseClrCode("PGRST202", "Could not find the function"), null);
  assert.equal(parseClrCode(undefined, undefined), null);
  assert.equal(parseClrCode("", ""), null);
});

test("the message regex survives only as a fallback when the code is not a CLR", () => {
  assert.equal(parseClrCode(undefined, "CLR19: a distinct checker is required"), "CLR19");
  // The SQLSTATE always wins, so a token loose in the message can never mislabel a
  // governed refusal — the case that made the old message-only parse unsafe.
  assert.equal(parseClrCode("CLR04", "0011 CLR05 probe rollback"), "CLR04");
  // With a non-CLR SQLSTATE the fallback does read the message. The only text in the
  // tree shaped like this is a migration self-test probe (0011 raises 'CLR05 probe
  // rollback' under errcode ZA011) which lives inside a DO block and never reaches a
  // client, so the fallback stays as harmless defence for a hand-rolled body.
  assert.equal(parseClrCode("ZA011", "0011 CLR05 probe rollback"), "CLR05");
});

test("the chat/api.ts copy parses identically (the two lanes must not disagree)", () => {
  for (const [code, message] of [["CLR04", "insufficient role"], ["23505", "dup"], ["ZA011", "0011 CLR05 probe rollback"]] as const) {
    assert.equal(chatParseClrCode(code, message), parseClrCode(code, message), `${code} parses the same in both lanes`);
  }
});

test("pgrestError lifts the governed envelope off a real PostgREST body", async () => {
  const err: PgrestError = await pgrestError(
    pgrestBody({ code: "CLR21", message: "an approved sales invoice already exists for this customer", details: '{"reason": "duplicate_sales"}' }),
    "approve_entry",
  );
  assert.equal(err.clr, "CLR21");
  assert.equal(err.reason, "duplicate_sales");
  assert.equal(err.pgCode, "CLR21");
  assert.ok(err.message.includes("an approved sales invoice already exists for this customer"), "the DB message renders verbatim");
});

test("pgrestError leaves clr null for an ungoverned Postgres error", async () => {
  const err: PgrestError = await pgrestError(pgrestBody({ code: "23505", message: "duplicate key value violates unique constraint" }), "read");
  assert.equal(err.clr, null);
  assert.equal(err.reason, null);
  assert.equal(err.pgCode, "23505");
});

test("parseReasonToken reads the DETAIL discriminant, and never throws on junk", () => {
  assert.equal(parseReasonToken('{"reason": "amount_conflict"}'), "amount_conflict");
  assert.equal(parseReasonToken('{"reason": 7}'), null);
  assert.equal(parseReasonToken("not json at all"), null);
  assert.equal(parseReasonToken(undefined), null);
});
