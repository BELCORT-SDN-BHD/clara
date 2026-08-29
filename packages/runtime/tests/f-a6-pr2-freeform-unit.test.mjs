// F-A6 PR-2 — the runtime half's PURE battery. No DB, no network, no model.
//
// WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY DOES NOT DO. The walls that decide whether a
// freeform read is lawful live in `clara.wake_freeform_read` (migration 0131) and are proven by
// packages/db's F-A6 ladder battery. These cells prove the three things the RUNTIME owns and the
// DB cannot enforce for it — H-4, H-5, S-1 — plus the mint census, the consumer contract, the
// oracle discipline and the registry repoint. The live halves of H-4 and H-5 (a stalled fetch
// actually killed; an advisory lock actually released) are in the sibling DB file: a captured
// statement sequence proves what is ISSUED, never what Postgres DOES with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.env.RELAY_TEST_MODE ??= "1";

const { register } = await import("tsx/esm/api");
register();

const ff = await import("../lib/freeform-read.mjs");
const infra = await import("../workflows/chatTurn.v15.infra.ts");
const tool = await import("../workflows/chatTurn.v15.freeform.ts");
const prompt = await import("../workflows/chatTurn.v15.prompt.ts");
const tools15 = await import("../workflows/chatTurn.v15.tools.ts");
const tools14 = await import("../workflows/chatTurn.v14.tools.ts");
const usage = await import("../workflows/chatTurn.v15.usage.ts");
const errors = await import("../workflows/chatTurn.v10.errors.ts");
const registry = await import("../workflows/registry.ts");
const v14Module = await import("../workflows/chatTurn.v14.ts");
const v15Module = await import("../workflows/chatTurn.v15.ts");

const FF_PATH = fileURLToPath(new URL("../lib/freeform-read.mjs", import.meta.url));

const FIRM = "00000000-0000-0000-0000-000000000001";
const CLIENT = "00000000-0000-0000-0000-000000000002";
const USER = "00000000-0000-0000-0000-000000000003";
const TASK = "00000000-0000-0000-0000-000000000004";
const HOME_CTX = { firmId: FIRM, clientId: null, createdBy: USER, taskId: TASK };
const PINNED_CTX = { firmId: FIRM, clientId: CLIENT, createdBy: USER, taskId: TASK };

/** A pg.Pool stand-in that records every statement in order. `handler` decides what the verb
 *  call returns (or throws), so one harness drives every path. */
function recordingPool(handler) {
  const calls = [];
  const client = {
    on() {},
    removeListener() {},
    released: null,
    release(destroy) {
      client.released = destroy === true;
    },
    async query(sql, params) {
      calls.push({ sql, params });
      if (handler) return handler(sql, params);
      return { rows: [{ result: { ok: true, outcome: "ok" } }], rowCount: 1 };
    },
  };
  return { pool: { connect: async () => client }, calls, client, texts: () => calls.map((c) => c.sql) };
}

const OK_ARGS = { secret: "s3cret", sql: "select 1 as x", purpose: "why", taskId: TASK, opKey: "freeform:t:0:1" };

/** Strip // and /* *\/ comments so a source census reads CODE, not prose. This file's subject
 *  NAMES `_freeform_arm` in its own header on purpose (S-1's rationale is written there), so a
 *  naive grep would go green for the wrong reason and red for the right one. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// =============================================================================================
// 1 · S-1 — the wrapper calls ONLY the one verb, on every code path.
// =============================================================================================

test("f-a6.pr2.s1.sequence: a successful read issues the setup, begin, the txn-local secret, THE ONE VERB, commit, then rollback + DISCARD ALL — and nothing else", async () => {
  const h = recordingPool();
  const out = await ff.withFreeformRead(OK_ARGS, { pool: h.pool });
  assert.deepEqual(out, { ok: true, outcome: "ok" }, "the verb's own jsonb rides through verbatim");
  const texts = h.texts();
  assert.equal(texts[0], ff.freeformSetupSql(), "the session setup is the FIRST statement");
  assert.deepEqual(texts.slice(1), ["begin", ff.FREEFORM_SECRET_SQL, ff.FREEFORM_VERB_SQL, "commit", "rollback", ff.FREEFORM_RELEASE_SQL]);
  const known = new Set([ff.freeformSetupSql(), ...ff.FREEFORM_SQL_TEXTS]);
  for (const t of texts) assert.ok(known.has(t), `an unexpected statement reached the freeform connection: ${t}`);
});

test("f-a6.pr2.s1.bind-not-concat: the model's SQL is a PARAMETER of the one verb, never part of its text", async () => {
  const payload = "select clara._freeform_arm('x','y',null,'z')"; // a hostile payload, verbatim
  const h = recordingPool();
  await ff.withFreeformRead({ ...OK_ARGS, sql: payload }, { pool: h.pool });
  const verbCall = h.calls.find((c) => c.sql === ff.FREEFORM_VERB_SQL);
  assert.ok(verbCall, "the verb was called");
  assert.equal(verbCall.params[0], payload, "the payload travels as $1");
  for (const c of h.calls) {
    assert.ok(!c.sql.includes(payload), "no issued statement TEXT ever contains the payload");
  }
  // ...and the payload naming the arm directly is the DB's problem, not a text the runtime ran.
  assert.ok(!ff.FREEFORM_VERB_SQL.includes("_freeform_arm"));
});

test("f-a6.pr2.s1.source-census: the module's CODE never names _freeform_arm or _freeform_settle", async () => {
  const code = stripComments(await readFile(FF_PATH, "utf8"));
  assert.ok(code.includes("wake_freeform_read"), "positive control — the census can see the verb it DOES call");
  assert.ok(!code.includes("_freeform_arm"), "the wrapper must never call the arm directly (S-1)");
  assert.ok(!code.includes("_freeform_settle"), "the wrapper must never call the settle directly (S-1)");
});

test("f-a6.pr2.s1.no-callback-seam: withFreeformRead accepts arguments, never a function to run on the connection", async () => {
  const h = recordingPool();
  // A function handed where the args object goes destructures to undefined fields and is refused
  // by the argument guards — there is no path on which a caller-supplied callback executes SQL.
  await assert.rejects(() => ff.withFreeformRead(() => {}, { pool: h.pool }), /secret is required/);
  await assert.rejects(() => ff.withFreeformRead(undefined, { pool: h.pool }), /secret is required/);
  assert.equal(h.calls.length, 0, "a malformed call never even checks out a connection");
});

// =============================================================================================
// 2 · H-4 — the POOL sets a session statement_timeout, BEFORE the verb call.
// =============================================================================================

test("f-a6.pr2.h4.setup: the session setup arms statement_timeout, is not read-only, and SET ROLEs first", () => {
  const setup = ff.freeformSetupSql();
  const parts = setup.split("; ");
  assert.equal(parts[0], `set role ${ff.FREEFORM_ROLE}`, "N10 — role first, never the bare login");
  assert.ok(
    parts.some((p) => /^set statement_timeout = \d+$/.test(p)),
    `the setup must arm a session statement_timeout — got ${setup}`,
  );
  assert.ok(
    !setup.includes("default_transaction_read_only"),
    "NOT read-only: the receipt is written by definers inside this transaction and must be able to COMMIT",
  );
});

test("f-a6.pr2.h4.ordering: the timeout is armed in a statement issued BEFORE the verb call", async () => {
  const h = recordingPool();
  await ff.withFreeformRead(OK_ARGS, { pool: h.pool });
  const texts = h.texts();
  const armedAt = texts.findIndex((t) => t.includes("set statement_timeout"));
  const verbAt = texts.indexOf(ff.FREEFORM_VERB_SQL);
  assert.ok(armedAt >= 0, "the timeout is armed");
  assert.ok(verbAt >= 0, "the verb is called");
  assert.ok(armedAt < verbAt, "PG arms the statement timer at the top-level statement's START — a later SET cannot bound it");
});

test("f-a6.pr2.h4.value: the backstop is finite, non-zero, and LOOSER than the verb's own in-loop deadline", () => {
  const ms = ff.freeformStatementTimeoutMs();
  assert.ok(Number.isFinite(ms) && ms > 0, "0 means UNLIMITED in Postgres — the one value that would silently delete this wall");
  assert.ok(
    ms > ff.FREEFORM_VERB_DEADLINE_MS,
    "the receipted in-loop deadline must win in the ordinary case; this is the Tier-D backstop for a fetch that gets nowhere",
  );
});

test("f-a6.pr2.h4.env: the operator's own env moves the wall, and is read per checkout", () => {
  const prior = process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
  try {
    process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = "7331";
    assert.equal(ff.freeformStatementTimeoutMs(), 7331);
    assert.ok(ff.freeformSetupSql().includes("set statement_timeout = 7331"), "the setup picks the new value up without a restart");
  } finally {
    if (prior === undefined) delete process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
    else process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = prior;
  }
  assert.equal(ff.freeformStatementTimeoutMs(), ff.FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS, "and restores");
});

// =============================================================================================
// 3 · H-5 — DISCARD ALL on release, on every path.
// =============================================================================================

test("f-a6.pr2.h5.text: the release statement is DISCARD ALL and never reset all", () => {
  assert.equal(ff.FREEFORM_RELEASE_SQL, "discard all");
  assert.notEqual(ff.FREEFORM_RELEASE_SQL, "reset all", "reset all does not release a payload's session advisory lock");
});

test("f-a6.pr2.h5.throw-path: a failing verb still rolls back AND discards, and the connection is reused", async () => {
  const h = recordingPool((sql) => {
    if (sql === ff.FREEFORM_VERB_SQL) throw Object.assign(new Error("boom"), { code: "CLR10" });
    return { rows: [{}], rowCount: 1 };
  });
  await assert.rejects(() => ff.withFreeformRead(OK_ARGS, { pool: h.pool }), /boom/);
  const texts = h.texts();
  assert.equal(texts.filter((t) => t === "rollback").length, 2, "the catch rolls back, and the shared cleanup rolls back again");
  assert.equal(texts[texts.length - 1], ff.FREEFORM_RELEASE_SQL, "DISCARD ALL is the LAST statement on the failure path too");
  assert.equal(h.client.released, false, "a plain query error leaves the connection healthy — it is returned, not destroyed");
});

test("f-a6.pr2.h5.broken-release: a DISCARD ALL that fails DESTROYS the connection rather than returning it (P4)", async () => {
  const h = recordingPool((sql) => {
    if (sql === ff.FREEFORM_RELEASE_SQL) throw new Error("connection terminated");
    return { rows: [{ result: { ok: true, outcome: "ok" } }], rowCount: 1 };
  });
  await ff.withFreeformRead(OK_ARGS, { pool: h.pool });
  assert.equal(h.client.released, true, "release(true) — the physical connection is discarded, never handed to the next read");
});

// =============================================================================================
// 4 · The mint census (D-23) — forced BOTH ways.
// =============================================================================================

function stubPools(sink, over = {}) {
  const prior = globalThis.__claraPools;
  globalThis.__claraPools = {
    mintWakeCredentialObo: async () => {
      sink.push({ kind: "interactive" });
      return { credentialId: "c1", secret: "s1" };
    },
    mintWakeCredentialClientObo: async (firm, obo, client) => {
      sink.push({ kind: "interactive_client", client });
      return { credentialId: "c2", secret: "s2" };
    },
    withFreeformRead: async (args) => {
      sink.push({ call: "withFreeformRead", args });
      return { ok: true, outcome: "ok", authority: "narrative", claim_eligible: false, read_id: 7 };
    },
    withRuntime: async (fn) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
    ...over,
  };
  return () => {
    globalThis.__claraPools = prior;
  };
}

test("f-a6.pr2.mint.pinned: a client-bound session mints interactive_client, pinned to THAT client", async () => {
  const sink = [];
  const restore = stubPools(sink);
  try {
    await infra.freeformScoped(PINNED_CTX, { sql: "select 1", purpose: "p", opKey: "k" });
  } finally {
    restore();
  }
  assert.deepEqual(sink[0], { kind: "interactive_client", client: CLIENT });
});

test("f-a6.pr2.mint.home: a HOME session (no client) mints plain interactive OBO — the OTHER direction", async () => {
  const sink = [];
  const restore = stubPools(sink);
  try {
    await infra.freeformScoped(HOME_CTX, { sql: "select 1", purpose: "p", opKey: "k" });
  } finally {
    restore();
  }
  assert.deepEqual(sink[0], { kind: "interactive" });
});

test("f-a6.pr2.mint.turn-binding: the taskId comes from the CONTEXT, never from the tool arguments", async () => {
  const sink = [];
  const restore = stubPools(sink);
  try {
    // Even handed a rogue taskId-shaped field, the args type has no such member and the context wins.
    await infra.freeformScoped(PINNED_CTX, { sql: "select 1", purpose: "p", opKey: "k", taskId: "not-this" });
  } finally {
    restore();
  }
  const call = sink.find((s) => s.call === "withFreeformRead");
  assert.equal(call.args.taskId, TASK, "TA-P4's binding is the turn the runtime is executing, not a model-supplied id");
  assert.equal(call.args.secret, "s2", "the pinned credential's secret is the one used");
});

test("f-a6.pr2.mint.one-rule: the kind the credential is MINTED under and the kind the LEDGER records come from one function", () => {
  assert.equal(infra.freeformWakeKindFor(PINNED_CTX), "interactive_client");
  assert.equal(infra.freeformWakeKindFor(HOME_CTX), "interactive");
  assert.equal(infra.freeformWakeKindFor({ ...PINNED_CTX, clientId: "" }), "interactive", "an empty string is not a pin");
  // The two consumers are pinned together by the metering cells below, which assert the recorded
  // kind for both ctx shapes — a second copy of this rule is how a ledger comes to describe a
  // mint that did not happen.
});

test("f-a6.pr2.pools.positive-read: an image whose startWorld predates this PR is refused by NAME, not by a TypeError", () => {
  const prior = globalThis.__claraPools;
  globalThis.__claraPools = { mintWakeCredentialObo: async () => ({}), withRuntime: async () => ({}) };
  try {
    assert.throws(() => infra.poolsV15(), (e) => e.code === "CLR03" && /withFreeformRead/.test(e.message));
  } finally {
    globalThis.__claraPools = prior;
  }
});

// =============================================================================================
// 5 · The consumer contract — POSITIVE admission only (design §3.5 / F-A2's D26).
// =============================================================================================

test("f-a6.pr2.consumer: only ok===true AND outcome==='ok' admits; everything else is non-admitting", () => {
  assert.equal(tool.isAdmittedFreeformRead({ ok: true, outcome: "ok" }), true);
  for (const bad of [
    null,
    undefined,
    [],
    "ok",
    { ok: true },                              // outcome missing — an absent input is never a pass
    { outcome: "ok" },                         // ok missing
    { ok: "true", outcome: "ok" },             // string, not boolean
    { ok: 1, outcome: "ok" },                  // truthy, not true
    { ok: true, outcome: "refused" },
    { ok: true, outcome: "partially_ok" },     // an UNKNOWN future value must not admit
    { ok: false, outcome: "ok" },
  ]) {
    assert.equal(tool.isAdmittedFreeformRead(bad), false, `must not admit ${JSON.stringify(bad)}`);
  }
});

// =============================================================================================
// 6 · The oracle discipline (Annex D.2) and the two named branches.
// =============================================================================================

test("f-a6.pr2.oracle.one-string: every denied/unknown/not-enumerated token collapses to ONE message AND ONE reason", () => {
  assert.ok(tool.FREEFORM_ORACLE_REASONS.length >= 5, "the family is non-empty");
  const seen = new Set();
  for (const r of tool.FREEFORM_ORACLE_REASONS) {
    const refusal = tool.freeformRefusal(r);
    seen.add(`${refusal.reason}|${refusal.message}`);
    assert.equal(refusal.reason, tool.FREEFORM_ORACLE_REASON, `${r} must not leak its own token to the model`);
  }
  assert.equal(seen.size, 1, "a probing prompt cannot tell the family's members apart from the refusal");
});

test("f-a6.pr2.oracle.by-identity: the shared string IS readToolRefusalMessage's, not a retyped copy (review law 3)", () => {
  assert.equal(tool.FREEFORM_ORACLE_MESSAGE, errors.readToolRefusalMessage({ code: "42501" }));
});

test("f-a6.pr2.oracle.fail-closed: an unknown or absent token takes the oracle branch, never an invented sentence", () => {
  for (const t of [null, undefined, "", "some_future_token_this_frozen_body_never_heard_of", "runtime_error"]) {
    const r = tool.freeformRefusal(t);
    assert.equal(r.reason, tool.FREEFORM_ORACLE_REASON);
    assert.equal(r.message, tool.FREEFORM_ORACLE_MESSAGE);
  }
});

test("f-a6.pr2.oracle.named-branches: read_timeout and malformed_statement keep their own names and sentences", () => {
  for (const t of ["read_timeout", "malformed_statement", "statement_shape", "plan_cost_ceiling", "result_row_cap", "result_byte_cap"]) {
    const r = tool.freeformRefusal(t);
    assert.equal(r.reason, t, `${t} is about the QUERY, not about what exists — it keeps its name`);
    assert.notEqual(r.message, tool.FREEFORM_ORACLE_MESSAGE);
    assert.ok(r.message.length > 20);
  }
});

test("f-a6.pr2.cross-client: the refusal NAMES the deferred action instead of implying the read is forbidden (D-22)", () => {
  const r = tool.freeformRefusalFromThrown(
    Object.assign(new Error("freeform read: cross_client_unavailable — this session is bound to one client and the read reaches past it."), { code: "CLR10" }),
  );
  assert.equal(r.reason, "cross_client_unavailable");
  assert.match(r.message, /deferred, not forbidden/);
  assert.match(r.message, /separate, named action/);
});

test("f-a6.pr2.cross-client.fail-closed: any OTHER thrown error takes the oracle branch", () => {
  const r = tool.freeformRefusalFromThrown(Object.assign(new Error("freeform read: session_pin_missing"), { code: "CLR03" }));
  assert.equal(r.reason, tool.FREEFORM_ORACLE_REASON);
  assert.equal(r.message, tool.FREEFORM_ORACLE_MESSAGE);
});

// =============================================================================================
// 7 · Metering — F-A9's "every call kind" obligation, on EVERY path.
// =============================================================================================

function meteringHarness(readImpl) {
  const rows = [];
  const sink = [];
  const restore = stubPools(sink, {
    withFreeformRead: readImpl,
    withRuntime: async (fn) =>
      fn({
        query: async (sql, params) => {
          if (sql.includes("pg_get_function_identity_arguments")) return { rows: [{ ident: usage.AGENT_USAGE_IDENT }], rowCount: 1 };
          rows.push(params);
          return { rows: [{ id: "u1" }], rowCount: 1 };
        },
      }),
  });
  return { rows, restore };
}

test("f-a6.pr2.metering: a row lands on success, refusal, timeout AND error — with the kind actually minted", async () => {
  const cases = [
    { impl: async () => ({ ok: true, outcome: "ok" }), ctx: PINNED_CTX, outcome: "success", kind: "interactive_client" },
    { impl: async () => ({ ok: false, outcome: "refused", refusal_reason: "relation_not_enumerated" }), ctx: HOME_CTX, outcome: "refused", kind: "interactive" },
    { impl: async () => ({ ok: false, outcome: "refused", refusal_reason: "read_timeout" }), ctx: HOME_CTX, outcome: "timeout", kind: "interactive" },
    { impl: async () => { throw Object.assign(new Error("dead"), { code: "57014" }); }, ctx: PINNED_CTX, outcome: "error", kind: "interactive_client" },
  ];
  for (const c of cases) {
    const h = meteringHarness(c.impl);
    try {
      await tool.runFreeformRead(c.ctx, { sql: "select 1", purpose: "p" }, "gpt-test", 0, 1);
    } finally {
      h.restore();
    }
    assert.equal(h.rows.length, 1, `exactly one metering row for the ${c.outcome} path`);
    const [firm, callKind, engineId, outcome, client, , , task, actor, viaWakeKind, , , inTok, outTok] = h.rows[0];
    assert.equal(callKind, usage.FREEFORM_CALL_KIND);
    assert.equal(callKind, "freeform_read", "0110 WALL 1's own registered token");
    assert.equal(outcome, c.outcome);
    assert.equal(viaWakeKind, c.kind, "the ledger records the kind that was MINTED, not a guess");
    assert.equal(firm, FIRM);
    assert.equal(client, c.ctx.clientId);
    assert.equal(task, TASK);
    assert.equal(actor, USER);
    assert.equal(engineId, usage.freeformEngineId("gpt-test"));
    assert.ok(!engineId.startsWith("llm-openai:"), "a DB read must never join the LLM price table");
    assert.equal(inTok, null, "a DB read spends no tokens — NULL, never a fabricated zero");
    assert.equal(outTok, null);
  }
});

test("f-a6.pr2.metering.never-refuses: a metering failure leaves a good read admitted (law 76)", async () => {
  const sink = [];
  const restore = stubPools(sink, {
    withFreeformRead: async () => ({ ok: true, outcome: "ok", read_id: 9 }),
    withRuntime: async () => {
      throw new Error("ledger unreachable");
    },
  });
  try {
    const r = await tool.runFreeformRead(HOME_CTX, { sql: "select 1", purpose: "p" }, "gpt-test", 0, 1);
    assert.equal(r.ok, true, "metering must never be the thing that refuses work");
  } finally {
    restore();
  }
});

// =============================================================================================
// 8 · The tool surface, the op key, and the prompt's audit line.
// =============================================================================================

test("f-a6.pr2.opkey: deterministic, and distinct across segments and successive reads", () => {
  assert.equal(tool.freeformOpKey(TASK, 0, 1), tool.freeformOpKey(TASK, 0, 1), "replay-stable");
  const keys = new Set([tool.freeformOpKey(TASK, 0, 1), tool.freeformOpKey(TASK, 0, 2), tool.freeformOpKey(TASK, 1, 1)]);
  assert.equal(keys.size, 3, "two genuinely different reads never share one receipt row's key");
});

test("f-a6.pr2.toolset: v15 is v14's whole tool set PLUS exactly one new tool", () => {
  const v14Names = Object.keys(tools14.buildToolsV14(PINNED_CTX, "gpt-test", 0));
  const v15Names = Object.keys(tools15.buildToolsV15(PINNED_CTX, "gpt-test", 0));
  for (const n of v14Names) assert.ok(v15Names.includes(n), `v15 dropped v14's tool '${n}'`);
  assert.deepEqual(
    v15Names.filter((n) => !v14Names.includes(n)),
    [tool.FREEFORM_READ_TOOL],
    "exactly one addition — P6's four cards are a LATER version, not this one",
  );
  assert.equal(v15Names.length, new Set(v15Names).size, "no duplicate tool name");
});

test("f-a6.pr2.toolset.per-segment-counter: each read in a segment gets its own sequence, and a rebuild replays from 1", async () => {
  const sink = [];
  const restore = stubPools(sink, {
    withFreeformRead: async (args) => {
      sink.push({ call: "withFreeformRead", args });
      return { ok: true, outcome: "ok" };
    },
  });
  try {
    const set = tools15.buildToolsV15(PINNED_CTX, "gpt-test", 3);
    const t = set[tool.FREEFORM_READ_TOOL];
    await t.execute({ sql: "select 1", purpose: "p" });
    await t.execute({ sql: "select 2", purpose: "p" });
    const keys = sink.filter((s) => s.call === "withFreeformRead").map((s) => s.args.opKey);
    assert.deepEqual(keys, [tool.freeformOpKey(TASK, 3, 1), tool.freeformOpKey(TASK, 3, 2)]);
    const rebuilt = tools15.buildToolsV15(PINNED_CTX, "gpt-test", 3);
    sink.length = 0;
    await rebuilt[tool.FREEFORM_READ_TOOL].execute({ sql: "select 1", purpose: "p" });
    assert.equal(sink.find((s) => s.call === "withFreeformRead").args.opKey, tool.freeformOpKey(TASK, 3, 1), "a WDK replay of the segment reproduces the same keys");
  } finally {
    restore();
  }
});

test("f-a6.pr2.audit-line: the enumerated surface is stated to the model, 35 relations, no duplicates", () => {
  assert.equal(tool.FREEFORM_ENUMERATED_RELATIONS.length, 35, "0131 §7's own count — the DB-side drift cell is in the sibling DB file");
  assert.equal(new Set(tool.FREEFORM_ENUMERATED_RELATIONS).size, 35);
  for (const r of tool.FREEFORM_ENUMERATED_RELATIONS) assert.ok(prompt.FREEFORM_GUIDANCE.includes(r), `${r} is missing from the model-facing audit line`);
  for (const excluded of ["wiki_pages", "document_extractions", "document_regions", "audit_log", "freeform_read_log", "wake_credentials", "chat_messages", "llm_usage_events", "firm_memberships"]) {
    assert.ok(!tool.FREEFORM_ENUMERATED_RELATIONS.includes(excluded), `${excluded} is EXCLUDED by Annex A.1 and must not be advertised`);
  }
});

test("f-a6.pr2.prompt: v15's system prompt is v14's plus the freeform guidance, and states the narrative wall", () => {
  assert.ok(prompt.SYSTEM_PROMPT_V15.startsWith(prompt.SYSTEM_PROMPT_V14), "v14's prompt is carried BYTE-FOR-BYTE at the front");
  assert.equal(prompt.SYSTEM_PROMPT_V15, `${prompt.SYSTEM_PROMPT_V14}\n\n${prompt.FREEFORM_GUIDANCE}`);
  assert.match(prompt.FREEFORM_GUIDANCE, /authority=narrative/);
  assert.match(prompt.FREEFORM_GUIDANCE, /claim_eligible=false/);
  assert.match(prompt.FREEFORM_GUIDANCE, /Do NOT add a/, "the model is told not to write its own scope filter (TA-P9 A(1))");
});

// =============================================================================================
// 9 · Parts — no new kind, and a refusal reaches the transcript.
// =============================================================================================

test("f-a6.pr2.parts.no-new-kind: a SUCCESSFUL read promotes only the tool_call/tool_result pair", () => {
  const content = [
    { type: "tool-call", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, input: { sql: "select 1", purpose: "p" } },
    { type: "tool-result", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, output: { ok: true, read: { ok: true, outcome: "ok", read_id: 3, rows: [] } } },
  ];
  const parts = prompt.toTypedParts_v15(content);
  assert.deepEqual(parts.map((p) => p.type), ["tool_call", "tool_result"], "PART_CATALOG is untouched — freeform_result is P6's later wire bump");
});

test("f-a6.pr2.parts.refusal: a refused read DOES reach the transcript, deduped on code+reason+message", () => {
  const refusal = tool.freeformRefusal("result_row_cap");
  const one = { type: "tool-result", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, output: { ok: false, refusal } };
  const two = { type: "tool-result", toolCallId: "c2", toolName: tool.FREEFORM_READ_TOOL, output: { ok: false, refusal } };
  const parts = prompt.toTypedParts_v15([one, two]);
  assert.equal(parts.filter((p) => p.type === "refusal").length, 1, "two identical refusals collapse to one transcript entry");
  assert.equal(parts.filter((p) => p.type === "tool_result").length, 2, "both calls still show as tool results");
});

test("f-a6.pr2.parts.not-acting-intent: a freeform read is NOT coding intent (C-19 is about acts, not reads)", () => {
  assert.equal(prompt.hasCodingIntent_v15([{ type: "tool-call", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, input: {} }]), false);
});

// =============================================================================================
// 10 · The registry repoint.
// =============================================================================================

test("f-a6.pr2.registry: chatTurn: repoints to v15, and v14 stays exported and IS its own function", () => {
  assert.equal(typeof registry.chatTurn_v14, "function");
  assert.equal(registry.chatTurn_v14, v14Module.chatTurn_v14, "no parked run is stranded by the repoint");
  assert.equal(registry.chatTurn_v15, v15Module.chatTurn_v15, "the registry's v15 export IS chatTurn.v15.ts's own function");
  assert.equal(registry.workflows.chatTurn, v15Module.chatTurn_v15);
  assert.notEqual(registry.workflows.chatTurn, registry.chatTurn_v14);
});
