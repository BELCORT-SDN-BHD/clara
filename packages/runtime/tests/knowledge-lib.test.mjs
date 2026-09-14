// #644 — packages/runtime/lib/knowledge.mjs, the NON-FROZEN helper the next frozen chatTurn
// version will call. It exists now, tested now, so that closure is a two-line step rather than a
// new piece of reasoning inside a body nobody may edit afterwards.
//
// THE ONE RULE THESE CELLS EXIST FOR. `loadContextStepV10` (chatTurn.v10.impl.ts:127-139)
// swallows a failed context read into `contextPack = null`, and a null pack is indistinguishable
// from a client that genuinely has no knowledge. #603 resolved that explicitly: "required
// knowledge-read failures are technical retries/blocks, not silent empty knowledge and not
// requests for the user to repeat existing information." So `readKnowledgePack` NEVER returns
// null and NEVER throws into its caller — it returns a status the caller can act on, and an
// `unavailable` is a different thing from an `ok` with zero records.

import test from "node:test";
import assert from "node:assert/strict";

import { captureKnowledgeFor, readKnowledgePack } from "../lib/knowledge.mjs";

/** A minimal pg-client stand-in: records every call and answers from a script. */
function fakeSql(handler) {
  const calls = [];
  return {
    calls,
    async query(text, params) {
      calls.push({ text, params });
      return handler(text, params, calls.length);
    },
  };
}

const clrError = (code, reason, message = "refused") => {
  const e = new Error(message);
  e.code = code;
  if (reason) e.detail = JSON.stringify({ reason });
  return e;
};

const FIRM_ID = "44444444-4444-4444-8444-444444444444";

const PACK = {
  status: "ok",
  client_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  purpose: "wiki_coding",
  knowledge_version: "42",
  records: [{ knowledge_key: "msic", value: "46900", trust: "asserted" }],
};

// ---------------------------------------------------------------------------------------------
// readKnowledgePack
// ---------------------------------------------------------------------------------------------

test("kl.01 a door that RAISES yields status unavailable — never null, never a throw", async () => {
  const sql = fakeSql(() => { throw clrError("CLR11", null, "client not found"); });
  const out = await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "wiki_coding" });
  assert.notEqual(out, null, "readKnowledgePack must never answer null");
  assert.equal(out.status, "unavailable");
  assert.equal(out.reason, "refused");
  assert.equal(out.code, "CLR11");
  assert.deepEqual(out.records, [], "an unavailable pack carries no records to be mistaken for data");
  assert.equal(out.knowledge_version, null);
});

test("kl.02 a TRANSPORT failure is unavailable too, with its own reason", async () => {
  const sql = fakeSql(() => { throw new Error("connection terminated unexpectedly"); });
  const out = await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "wiki_coding" });
  assert.equal(out.status, "unavailable");
  assert.equal(out.reason, "read_failed");
  assert.match(out.message, /connection terminated/);
});

test("kl.03 success returns the door's envelope with knowledge_version VERBATIM", async () => {
  const sql = fakeSql(() => ({ rows: [{ pack: PACK }] }));
  const out = await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "wiki_coding" });
  assert.equal(out.status, "ok");
  assert.equal(out.knowledge_version, "42",
    "the version #631's trace records must survive the helper unchanged — no Number() coercion");
  assert.deepEqual(out.records, PACK.records);
  assert.equal(out.purpose, "wiki_coding");
  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /clara\.get_knowledge_pack/);
  assert.deepEqual(sql.calls[0].params, [PACK.client_id, "wiki_coding", null]);
});

test("kl.08 the TENANT BINDING rides through, by NAME — the pack never derives the firm from the client", async () => {
  const sql = fakeSql(() => ({ rows: [{ pack: PACK }] }));
  const out = await readKnowledgePack(sql, {
    clientId: PACK.client_id, purpose: "wiki_coding", firmId: FIRM_ID,
  });
  assert.equal(out.status, "ok");
  // NAMED, not positional: the door gained `p_firm` as a DEFAULTED parameter, and positional
  // binding to a function whose arity moved is how a silent mis-bind happens (the same law this
  // module already applies to capture_knowledge_for).
  assert.match(sql.calls[0].text, /p_client => \$1/);
  assert.match(sql.calls[0].text, /p_purpose => \$2/);
  assert.match(sql.calls[0].text, /p_firm => \$3/);
  assert.deepEqual(sql.calls[0].params, [PACK.client_id, "wiki_coding", FIRM_ID]);
  // A blank binding is a NULL, not an empty string the door would have to interpret.
  await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "wiki_coding", firmId: "  " });
  assert.equal(sql.calls[1].params[2], null);
});

test("kl.09 an UNBOUND read is the DOOR's refusal, verbatim — never a silently unbound pack", async () => {
  // This module decides nothing about authority: it does not pre-empt the door with a local
  // "firmId is required", because that would be a second copy of a rule the database enforces
  // and the two would drift. What it MUST do is carry the refusal back typed and unmistakable.
  const sql = fakeSql(() => { throw clrError("CLR10", "pack_firm_required",
    "the runtime knowledge pack names the firm it is reading"); });
  const out = await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "wiki_coding" });
  assert.equal(out.status, "unavailable");
  assert.equal(out.reason, "refused");
  assert.equal(out.code, "CLR10");
  assert.equal(out.detail_reason, "pack_firm_required");
  assert.deepEqual(out.records, [], "an unbound read must never look like a client with no knowledge");
  assert.equal(out.knowledge_version, null);
});

test("kl.0a a WRONG binding is the door's CLR11, and still never throws or returns null", async () => {
  const sql = fakeSql(() => { throw clrError("CLR11", null, "client not found"); });
  const out = await readKnowledgePack(sql, {
    clientId: PACK.client_id, purpose: "wiki_coding", firmId: FIRM_ID,
  });
  assert.notEqual(out, null);
  assert.equal(out.status, "unavailable");
  assert.equal(out.code, "CLR11");
  assert.equal(out.message, "client not found", "the database's own sentence, never re-worded");
});

test("kl.04 a client-less turn never touches the database and says why", async () => {
  const sql = fakeSql(() => { throw new Error("must not be called"); });
  const out = await readKnowledgePack(sql, { clientId: null, purpose: "wiki_coding" });
  assert.equal(out.status, "unavailable");
  assert.equal(out.reason, "no_client");
  assert.equal(sql.calls.length, 0);
});

test("kl.05 a malformed or absent envelope is unavailable, NOT an empty pack (law 2)", async () => {
  for (const body of [null, undefined, {}, { status: "ok" }, { status: "ok", records: "nope" }]) {
    const sql = fakeSql(() => ({ rows: [{ pack: body }] }));
    const out = await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "wiki_coding" });
    assert.equal(out.status, "unavailable", `body ${JSON.stringify(body)} must not read as ok`);
    assert.equal(out.reason, "malformed");
    assert.deepEqual(out.records, []);
  }
});

test("kl.06 a genuinely EMPTY pack is ok with zero records — the opposite of unavailable", async () => {
  const sql = fakeSql(() => ({ rows: [{ pack: { ...PACK, records: [], knowledge_version: "0" } }] }));
  const out = await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "wiki_coding" });
  assert.equal(out.status, "ok");
  assert.deepEqual(out.records, []);
  assert.equal(out.knowledge_version, "0");
});

test("kl.07 a missing purpose is refused locally — the pack is never read for an unstated purpose", async () => {
  const sql = fakeSql(() => { throw new Error("must not be called"); });
  const out = await readKnowledgePack(sql, { clientId: PACK.client_id, purpose: "  " });
  assert.equal(out.status, "unavailable");
  assert.equal(out.reason, "no_purpose");
  assert.equal(sql.calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// captureKnowledgeFor
// ---------------------------------------------------------------------------------------------

const CAPTURE_ARGS = {
  assertedBy: "33333333-3333-4333-8333-333333333333",
  clientId: PACK.client_id,
  knowledgeKey: "coa_seed_decision",
  value: { seed: "manual" },
  basis: "the client said so in chat on 14 Sep",
  opKey: "kn_tool_1",
};

test("kl.10 a capture posts the door's NAMED args, in the runtime lane's own order", async () => {
  const sql = fakeSql(() => ({ rows: [{ receipt: { status: "captured", record_id: "r1" } }] }));
  const out = await captureKnowledgeFor(sql, CAPTURE_ARGS);
  assert.equal(out.ok, true);
  assert.equal(out.receipt.status, "captured");
  assert.match(sql.calls[0].text, /clara\.capture_knowledge_for/);
  assert.match(sql.calls[0].text, /p_asserted_by => \$1/);
  assert.deepEqual(sql.calls[0].params, [
    CAPTURE_ARGS.assertedBy, CAPTURE_ARGS.clientId, CAPTURE_ARGS.knowledgeKey,
    JSON.stringify(CAPTURE_ARGS.value), CAPTURE_ARGS.basis, "kn_tool_1",
    "user_statement", "{}", null, null, "{}", null,
  ]);
});

test("kl.11 a governed refusal comes back TYPED and verbatim — never thrown, never re-worded", async () => {
  const sql = fakeSql(() => { throw clrError("CLR10", "knowledge_already_live", "this client already holds a live coa_seed_decision record"); });
  const out = await captureKnowledgeFor(sql, CAPTURE_ARGS);
  assert.equal(out.ok, false);
  assert.equal(out.kind, "refusal");
  assert.equal(out.code, "CLR10");
  assert.equal(out.reason, "knowledge_already_live");
  assert.equal(out.message, "this client already holds a live coa_seed_decision record");
});

test("kl.12 a transport failure is a DIFFERENT outcome from a refusal", async () => {
  const sql = fakeSql(() => { throw new Error("connection terminated unexpectedly"); });
  const out = await captureKnowledgeFor(sql, CAPTURE_ARGS);
  assert.equal(out.ok, false);
  assert.equal(out.kind, "unavailable");
  assert.equal(out.code, null);
});

test("kl.13 a correction reason rides through, and the optional pins are passed as the door expects", async () => {
  const sql = fakeSql(() => ({ rows: [{ receipt: { status: "corrected" } }] }));
  const out = await captureKnowledgeFor(sql, {
    ...CAPTURE_ARGS,
    sourceKind: "document_extraction",
    appliesWhen: { segment: "digital" },
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    source: { document_id: "d1", extraction_id: "e1" },
    correctionReason: "the client corrected it in chat",
  });
  assert.equal(out.ok, true);
  assert.deepEqual(sql.calls[0].params.slice(6), [
    "document_extraction", JSON.stringify({ segment: "digital" }), "2026-01-01", null,
    JSON.stringify({ document_id: "d1", extraction_id: "e1" }), "the client corrected it in chat",
  ]);
});

test("kl.14 a missing required argument is refused LOCALLY, without a database round trip", async () => {
  const sql = fakeSql(() => { throw new Error("must not be called"); });
  for (const missing of ["assertedBy", "clientId", "knowledgeKey", "basis"]) {
    const args = { ...CAPTURE_ARGS };
    delete args[missing];
    const out = await captureKnowledgeFor(sql, args);
    assert.equal(out.ok, false, `${missing} must be required`);
    assert.equal(out.kind, "invalid_request");
    assert.match(out.message, new RegExp(missing));
  }
  // …and a value of `undefined` is not the same as a legitimate JSON null.
  const noValue = await captureKnowledgeFor(sql, { ...CAPTURE_ARGS, value: undefined });
  assert.equal(noValue.ok, false);
  assert.equal(noValue.kind, "invalid_request");
  assert.equal(sql.calls.length, 0);
});

test("kl.15 an absent op_key is MINTED, and a supplied one is used verbatim so a retry is idempotent", async () => {
  const sql = fakeSql(() => ({ rows: [{ receipt: { status: "captured" } }] }));
  const args = { ...CAPTURE_ARGS };
  delete args.opKey;
  await captureKnowledgeFor(sql, args);
  const minted = sql.calls[0].params[5];
  assert.equal(typeof minted, "string");
  assert.ok(minted.length >= 8, "a minted op_key must be a real key");
  await captureKnowledgeFor(sql, args);
  assert.notEqual(sql.calls[1].params[5], minted, "each fresh call mints its own key");
  await captureKnowledgeFor(sql, { ...CAPTURE_ARGS, opKey: "stable_key" });
  assert.equal(sql.calls[2].params[5], "stable_key");
});
