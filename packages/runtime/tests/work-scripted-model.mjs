// Scripted models and a fake pool API for the #623 Work-lane cells.
//
// The MODEL half is `MockLanguageModelV4.doGenerate` — the shape the merge proof
// (docs/plan/active/refresh-2026-09-08-tool-loop-workflow-merge-proof.md) measured against a real
// `ToolLoopAgent`, which calls `generate()` and therefore `doGenerate`, not `doStream` (chat's
// mockModel.mjs scripts the streaming half for `streamText`). NO network, NO key.
//
// The POOL half is a hand-built `globalThis.__claraPools` that answers exactly the two statements
// this lane issues — `clara.trial_balance` on the read pool and `clara.wake_record_journal_entry`
// on the write pool — and RECORDS every mint and every call. Recording the mints is the point of
// the fake rather than a convenience: the cell that proves "the write is minted OBO the human,
// client-pinned" has to see WHICH credential was asked for, and a stub that only returns rows
// could not tell an `interactive` mint from an `interactive_client` one.

import { MockLanguageModelV4 } from "ai/test";

export function usage() {
  return {
    inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 7, text: 7, reasoning: undefined },
    raw: undefined,
  };
}

/** One scripted model TURN: a tool call. */
export function toolCall(toolCallId, toolName, input) {
  return {
    content: [{ type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls", raw: "tool_use" },
    usage: usage(),
    warnings: [],
  };
}

/** One scripted model TURN: plain narration that ends the loop. */
export function say(text) {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: usage(),
    warnings: [],
  };
}

/**
 * A model driven by an ordered SCRIPT of turns. Each entry is either a ready-made turn object or
 * a function `(options, callIndex) => turn` so a cell can assert what the model was shown (the
 * prototype's own `assert.match(promptJson, /STATE_CHANGED/)` shape).
 *
 * Running off the end THROWS rather than looping: a segment that called the model more times than
 * the cell scripted is a real finding, and a model that quietly repeated its last answer would
 * hide it.
 */
export function scriptedWorkModel(script) {
  const state = { calls: 0, prompts: [] };
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const index = state.calls;
      state.calls += 1;
      state.prompts.push(JSON.stringify(options?.prompt ?? options?.messages ?? null));
      const step = script[index];
      if (step === undefined) throw new Error(`scriptedWorkModel: unscripted model call ${index + 1} (script has ${script.length})`);
      return typeof step === "function" ? step(options, index) : step;
    },
  });
  return { model, state };
}

const TRIAL_BALANCE_SQL = /clara\.trial_balance/;
const RECORD_SQL = /clara\.wake_record_journal_entry/;

/**
 * A fake injected pool API. `accounts` is what `clara.trial_balance` returns; `record` is a
 * function `(params, callIndex) => receipt` that may THROW to simulate a database refusal.
 *
 * Everything else raises loudly: this lane issues exactly two statements, and a cell that silently
 * tolerated a third would stop being evidence of what the lane does.
 */
export function fakeWorkPools({ accounts = [], record = () => ({ posted: true }), runtime } = {}) {
  const calls = { trialBalance: 0, record: [], mints: [], runtime: [] };

  const readExec = {
    query: async (sql, params) => {
      if (TRIAL_BALANCE_SQL.test(sql)) {
        calls.trialBalance += 1;
        return { rows: [{ tb: accounts }], rowCount: 1 };
      }
      if (/get_journal_entry_for/.test(sql)) {
        return { rows: [{ e: { id: params?.[0] ?? null } }], rowCount: 1 };
      }
      throw new Error(`fakeWorkPools: unexpected READ statement: ${sql}`);
    },
  };

  const writeExec = {
    query: async (sql, params) => {
      if (!RECORD_SQL.test(sql)) throw new Error(`fakeWorkPools: unexpected WRITE statement: ${sql}`);
      const index = calls.record.length;
      calls.record.push(params);
      const receipt = record(params, index);
      return { rows: [{ r: receipt }], rowCount: 1 };
    },
  };

  const runtimeExec = {
    query: async (sql, params) => {
      calls.runtime.push({ sql, params });
      if (typeof runtime === "function") return runtime(sql, params);
      throw new Error(`fakeWorkPools: unexpected RUNTIME statement: ${sql}`);
    },
  };

  const api = {
    mintWakeCredential: async (firmId) => {
      calls.mints.push({ kind: "wake", firmId });
      return { credentialId: "cred", secret: "secret" };
    },
    mintWakeCredentialObo: async (firmId, oboUserId) => {
      calls.mints.push({ kind: "interactive", firmId, oboUserId, clientId: null });
      return { credentialId: "cred", secret: "secret" };
    },
    mintWakeCredentialClientObo: async (firmId, oboUserId, clientId) => {
      calls.mints.push({ kind: "interactive_client", firmId, oboUserId, clientId });
      return { credentialId: "cred", secret: "secret" };
    },
    withReadWakeScoped: async (secret, fn) => fn(readExec),
    withWriteWakeScoped: async (secret, fn) => fn(writeExec),
    withRuntime: async (fn) => fn(runtimeExec),
  };
  return { api, calls };
}

/** Install the fake pools + a scripted model for one cell, and hand back a restore function. */
export function installWorkTestDoubles({ pools, model }) {
  const priorPools = globalThis.__claraPools;
  const priorModel = globalThis.__claraModelForTest;
  globalThis.__claraPools = pools;
  globalThis.__claraModelForTest = model;
  return () => {
    globalThis.__claraPools = priorPools;
    globalThis.__claraModelForTest = priorModel;
  };
}

/** A minimal admitted Work row, as `loadWorkStep` would return it. */
export function loadedWork(overrides = {}) {
  const base = {
    workId: "11111111-1111-4111-8111-111111111111",
    firmId: "22222222-2222-4222-8222-222222222222",
    clientId: "33333333-3333-4333-8333-333333333333",
    initiator: "44444444-4444-4444-8444-444444444444",
    logicalOpId: "work:11111111-1111-4111-8111-111111111111:journal_entry:1",
    basis: {
      posting_date: "2026-09-01",
      memo: "office rent paid from Maybank",
      currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
        { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
      ],
    },
    basisOrigin: "user_direct",
    model: "gpt-5.6-terra",
    workStatus: "running",
    taskStatus: "running",
  };
  return Object.assign(base, overrides);
}

/** The two accounts the fixture chart carries, in `clara.trial_balance`'s own row shape. */
export const FIXTURE_ACCOUNTS = [
  { account_code: "1100", name: "Maybank current account", debit_cents: "0", credit_cents: "0" },
  { account_code: "6100", name: "Rent expense", debit_cents: "0", credit_cents: "0" },
];
