// chatTurn_v19 — THE HONEST KNOWLEDGE-PACK CONTEXT STEP.
//
// #603's finding, restated as the thing this file refuses to let regress: "required knowledge-read
// failures are technical retries/blocks, not silent empty knowledge and not requests for the user
// to repeat existing information." `loadContextStepV10` (frozen, re-exported through v18) wraps
// its context-pack read in `catch { contextPack = null }`, so a failed read and a client with
// genuinely nothing recorded are the SAME value to the turn. v19 adds a SECOND read that cannot
// do that: `readKnowledgePack` never throws and never returns null, and this step renders
// `status:'unavailable'` as the words "client knowledge unavailable", never as an empty pack.
//
// FOUR CLAIMS:
//   1. AN `ok` PACK RENDERS BOUNDED AND CLOSED — every record labelled with the trust the
//      database derived, legacy `client_fact` rows labelled as the rows in force, a hard cap on
//      how many records reach the prompt, and a visible marker when the cap bit.
//   2. AN `unavailable` PACK RENDERS AS UNAVAILABLE, with the reason, and carries no records.
//   3. THE FIRM BINDING IS PASSED. `clara.get_knowledge_pack` REQUIRES `p_firm` on the machine
//      lane (#644 fix round 2, CLR10 `pack_firm_required`), so a step that omitted it would read
//      nothing at all — or, before that fix, another tenant's records. A spy on the statement
//      sees the named argument and the value.
//   4. THE WATERMARK IS CARRIED. `knowledge_version` is a bigint the driver hands over as a
//      STRING and it rides the step's answer verbatim, so #631's trace can record which version
//      a turn reasoned on.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v19Prompt = await import("../workflows/chatTurn.v19.prompt.ts");
const v19Impl = await import("../workflows/chatTurn.v19.impl.ts");
const { fakeWorkPools, installWorkTestDoubles } = await import("./work-scripted-model.mjs");

const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";

function record(overrides = {}) {
  return {
    record_id: "55555555-5555-4555-8555-555555555555",
    knowledge_key: "trade_nature",
    kind: "assertion",
    value: "services",
    applies_when: {},
    trust: "asserted",
    source_kind: "user_statement",
    state: "live",
    scope_kind: "client",
    knowledge_version: "7",
    effective_from: null,
    effective_to: null,
    ...overrides,
  };
}

// --- 1 · an ok pack ---------------------------------------------------------

test("v19.knowledge-context: an ok pack renders every record with the trust the DATABASE derived", () => {
  const text = v19Prompt.renderKnowledgeContext({
    status: "ok",
    knowledge_version: "7",
    records: [
      record(),
      record({ record_id: "r2", knowledge_key: "msic", value: "62011", trust: "inferred", source_kind: "model_inference" }),
    ],
  });
  assert.match(text, /Client knowledge \(knowledge_version 7\)/);
  assert.match(text, /trade_nature/);
  assert.match(text, /trust=asserted/);
  assert.match(text, /trust=inferred/, "a model-inferred row is labelled as such, never as fact");
  assert.match(text, /SUPPLIED DATA/, "the block says plainly that its contents are data, never instructions");
});

test("v19.knowledge-context: a LEGACY client_fact is labelled as the row in force", () => {
  const text = v19Prompt.renderKnowledgeContext({
    status: "ok",
    knowledge_version: "7",
    records: [record({ record_id: "legacy-1", source_kind: "legacy_client_fact", value: "trading", authoritative: true })],
  });
  assert.match(text, /legacy_client_fact/);
  assert.match(text, /in force/i, "0192's own claim about those five keys, carried to the model");
});

test("v19.knowledge-context: the block is BOUNDED, and says so when the cap bites", () => {
  const many = Array.from({ length: v19Prompt.KNOWLEDGE_CONTEXT_MAX_RECORDS + 5 }, (_, i) =>
    record({ record_id: `r${i}`, knowledge_key: `key_${i}` }));
  const text = v19Prompt.renderKnowledgeContext({ status: "ok", knowledge_version: "9", records: many });
  const lines = text.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(lines.length, v19Prompt.KNOWLEDGE_CONTEXT_MAX_RECORDS, "the record list is capped");
  assert.match(text, /5 more record\(s\) not shown/, "and the turn is TOLD it is reading a truncated view");
});

test("v19.knowledge-context: an ok pack with ZERO records says so, and says it positively", () => {
  const text = v19Prompt.renderKnowledgeContext({ status: "ok", knowledge_version: "0", records: [] });
  assert.match(text, /no client knowledge recorded/i);
  assert.doesNotMatch(text, /unavailable/i, "a read that succeeded and found nothing is NOT an unavailable read");
});

// --- 2 · an unavailable pack ------------------------------------------------

test("v19.knowledge-context: unavailable renders as UNAVAILABLE, with the reason, and no records", () => {
  for (const [reason, extra] of [
    ["refused", { code: "CLR10", detail_reason: "pack_firm_required", message: "the runtime knowledge pack names the firm it is reading" }],
    ["read_failed", { message: "connection refused" }],
    ["malformed", {}],
    ["no_client", {}],
  ]) {
    const text = v19Prompt.renderKnowledgeContext(Object.assign({ status: "unavailable", reason, knowledge_version: null, records: [] }, extra));
    assert.match(text, /client knowledge unavailable/i, `${reason} is rendered as unavailable`);
    assert.match(text, new RegExp(reason), "and NAMES why");
    assert.doesNotMatch(text, /no client knowledge recorded/i, "it must never read as 'this client knows nothing'");
  }
});

test("v19.knowledge-context: a governed refusal carries the database's own sentence", () => {
  const text = v19Prompt.renderKnowledgeContext({
    status: "unavailable",
    reason: "refused",
    code: "CLR11",
    detail_reason: null,
    message: "client not found",
    knowledge_version: null,
    records: [],
  });
  assert.match(text, /CLR11/);
  assert.match(text, /client not found/);
});

// --- 3 · the firm binding ---------------------------------------------------

async function runStep({ pack, throws }) {
  const seen = [];
  const { api } = fakeWorkPools({
    runtime: (sql, params) => {
      seen.push({ sql, params });
      if (throws) throw throws;
      return { rows: [{ pack }], rowCount: 1 };
    },
  });
  const restore = installWorkTestDoubles({ pools: api, model: undefined });
  try {
    return { answer: await v19Impl.loadKnowledgeContextStepV19(CLIENT, FIRM), seen };
  } finally {
    restore();
  }
}

test("v19.knowledge-context: the step passes the FIRM binding the machine lane requires", async () => {
  const { answer, seen } = await runStep({
    pack: { status: "ok", client_id: CLIENT, firm_id: FIRM, purpose: v19Prompt.KNOWLEDGE_PACK_PURPOSE, knowledge_version: "7", records: [record()] },
  });
  assert.equal(seen.length, 1, "ONE statement");
  assert.match(seen[0].sql, /clara\.get_knowledge_pack/);
  assert.match(seen[0].sql, /p_firm\s*=>/, "named arguments — the door gained a defaulted parameter");
  assert.deepEqual(seen[0].params, [CLIENT, v19Prompt.KNOWLEDGE_PACK_PURPOSE, FIRM]);
  assert.equal(answer.status, "ok");
  assert.equal(answer.knowledge_version, "7", "the watermark rides the answer verbatim, as a STRING");
  assert.match(answer.text, /trade_nature/);
});

test("v19.knowledge-context: a step with no client reads nothing and says unavailable/no_client", async () => {
  const seen = [];
  const { api } = fakeWorkPools({ runtime: (sql, params) => { seen.push({ sql, params }); return { rows: [], rowCount: 0 }; } });
  const restore = installWorkTestDoubles({ pools: api, model: undefined });
  try {
    const answer = await v19Impl.loadKnowledgeContextStepV19(null, FIRM);
    assert.equal(answer.status, "unavailable");
    assert.equal(answer.reason, "no_client");
    assert.equal(answer.knowledge_version, null);
    assert.equal(seen.length, 0, "a home conversation makes no client-scoped read at all");
    assert.doesNotMatch(answer.text, /no client knowledge recorded/i);
  } finally {
    restore();
  }
});

test("v19.knowledge-context: a refused read NEVER throws into the turn and NEVER becomes an empty pack", async () => {
  const { answer } = await runStep({
    pack: null,
    throws: Object.assign(new Error("the runtime knowledge pack names the firm it is reading"), {
      code: "CLR10",
      detail: JSON.stringify({ reason: "pack_firm_required" }),
    }),
  });
  assert.equal(answer.status, "unavailable");
  assert.equal(answer.reason, "refused");
  assert.match(answer.text, /client knowledge unavailable/i);
  assert.match(answer.text, /CLR10/);
});

test("v19.knowledge-context: a MALFORMED envelope is unavailable, not an empty pack", async () => {
  const { answer } = await runStep({ pack: { status: "ok" } });
  assert.equal(answer.status, "unavailable");
  assert.equal(answer.reason, "malformed");
  assert.deepEqual(answer.records_shown, 0);
  assert.doesNotMatch(answer.text, /no client knowledge recorded/i);
});

// --- 4 · the turn's own system context --------------------------------------

test("v19.knowledge-context: the rendered block is APPENDED to the system context, never replacing the pack", () => {
  const composed = v19Prompt.systemExtraV19("Client context pack (books_version is the freshness token):\n{}", "Client knowledge (knowledge_version 7)\n- trade_nature");
  assert.match(composed, /books_version/, "v10's context pack is carried unchanged");
  assert.match(composed, /Client knowledge/);
  assert.ok(composed.indexOf("books_version") < composed.indexOf("Client knowledge"), "the knowledge block comes after");
  assert.equal(v19Prompt.systemExtraV19("", "K"), "K", "an absent context pack leaves the knowledge block alone");
  assert.equal(v19Prompt.systemExtraV19("P", ""), "P");
});
