// F-A2 WINDOW B — the STATEMENT-lane model-call budget (the #270 review's registered gap).
// Unit only: no DB, no network, no key. The activation's ROUTING half — the registry repoint
// and the pre-egress provenance guard — lives in f-a2-statement-activation.test.mjs.
//
// WHY THIS LANE NEEDED ITS OWN PASS. Opener ③ bounded the INVOICE witness pair after the
// 2026-08-20 corpus run (`docs/plan/completed/f-a1-corpus-measurement.md`) and the #270 review
// registered the statement twin as an open gap. The statement bundle was never literally
// unbounded — it always composed an `AbortSignal.timeout` — so the gap is narrower and more
// interesting than "no timeout": the budget was frozen at IMPORT, a junk or typo'd knob was
// discarded in silence, the ratified knob name was not read at all, and a spent budget reached
// the failure taxonomy as a raw DOMException whose terminal classification was an ACCIDENT of
// what `.code` happened to be. This file judges all four, and the repoint that makes any of it
// reachable by live traffic.
//
// EVIDENCE LAW 3 THROUGHOUT: every "is it terminal?" question is put to the FROZEN classifier
// itself (`classifyStatementWitnessFailure`), never to a matching literal — and the repoint cell
// compares OBJECT IDENTITY against the imported workflow, never a name or a string.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

import {
  callStatementWitnessModel,
  statementWitnessModelTimeoutError,
  statementWitnessModelTimeoutMs,
  STATEMENT_WITNESS_ENGINE_SNAPSHOT,
  STATEMENT_WITNESS_MODEL_TIMEOUT_DEFAULT_MS,
  STATEMENT_WITNESS_MODEL_TIMEOUT_ENV_NAMES,
} from "../workflows/statementFacts.v2.services.mjs";
// The FROZEN taxonomy, imported so the settle-door cell asks the real judge.
import { classifyStatementWitnessFailure } from "../workflows/statementFacts.v2.behavior.mjs";

after(() => {
  delete globalThis.__claraModelForTest;
});

// ---------------------------------------------------------------------------
// THE BUDGET — parse, default, and the settle door
// ---------------------------------------------------------------------------

/** Parse-only: a sink warn + a throwaway ledger, so these cells judge the VALUE and never
 *  accidentally depend on (or pollute) the once-per-process warning state. */
const quiet = (env) => statementWitnessModelTimeoutMs(env, () => {}, new Set());

test("budget: the default is the value the corpus run proved, not a guess", () => {
  assert.equal(STATEMENT_WITNESS_MODEL_TIMEOUT_DEFAULT_MS, 180_000);
  assert.equal(quiet({}), 180_000, "an environment naming neither knob gets the default");
});

test("budget: ONE KNOB governs both witness lanes — the ratified name is the FIRST this lane reads", () => {
  // The choice this PR states out loud: the statement lane reads the SAME
  // CLARA_WITNESS_MODEL_TIMEOUT_MS the invoice pair reads, rather than minting a second timeout
  // surface. Two independent timeout knobs is the shape where an operator tunes one, believes
  // the fleet is bounded, and leaves the other at a default nobody re-checked.
  assert.equal(STATEMENT_WITNESS_MODEL_TIMEOUT_ENV_NAMES[0], "CLARA_WITNESS_MODEL_TIMEOUT_MS");
  assert.equal(quiet({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "300000" }), 300_000);
});

test("budget: the PR-4 statement-specific name is DEPRECATED but still binds", () => {
  // It is the name THIS bundle read in the image F-A1 PR-4 shipped, so it is the name any
  // already-deployed machine would be configured under. Dropping it would silently revert such a
  // deployment to the default — a config change nobody made and nobody would see.
  const said = [];
  assert.equal(
    statementWitnessModelTimeoutMs({ CLARA_STATEMENT_WITNESS_LLM_TIMEOUT_MS: "90000" }, (m) => said.push(m), new Set()),
    90_000,
  );
  assert.equal(said.length, 1);
  assert.match(said[0], /DEPRECATED/);
  assert.match(said[0], /still binds \(90000ms\)/, "the operator is told their value IS in force");
  assert.match(said[0], /CLARA_WITNESS_MODEL_TIMEOUT_MS/, "…and what to rename it to");
});

test("budget: the ratified name wins when both are set", () => {
  assert.equal(
    quiet({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "45000", CLARA_STATEMENT_WITNESS_LLM_TIMEOUT_MS: "90000" }),
    45_000,
  );
});

test("budget: junk NEVER switches the bound off — it falls through to the next name, then the default", () => {
  for (const junk of ["abc", "", "   ", "0", "-1", "Infinity", "NaN", undefined, null]) {
    assert.equal(
      quiet({ CLARA_WITNESS_MODEL_TIMEOUT_MS: junk }),
      180_000,
      `junk ${JSON.stringify(junk)} must not mean "no timeout"`,
    );
  }
  // A junk ratified name falls through to a VALID deprecated name rather than skipping straight
  // to the default — the fallthrough is per-name, not all-or-nothing.
  assert.equal(quiet({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "abc", CLARA_STATEMENT_WITNESS_LLM_TIMEOUT_MS: "70000" }), 70_000);
});

test("budget: a knob that is PRESENT but unusable is SAID, not silently discarded", () => {
  const said = [];
  assert.equal(statementWitnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "5m" }, (m) => said.push(m), new Set()), 180_000);
  assert.equal(said.length, 1, "exactly one line for the junk value");
  assert.match(said[0], /CLARA_WITNESS_MODEL_TIMEOUT_MS/);
  assert.match(said[0], /"5m"/, "it names WHAT it saw, not just that something was wrong");
  assert.match(said[0], /IGNORED/);
  assert.match(said[0], /180000/, "…and what is being used instead");
});

test("budget: the warning is ONCE per ledger, not once per call — it is read on every model call", () => {
  const said = [];
  const ledger = new Set();
  for (let i = 0; i < 5; i++) statementWitnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "5m" }, (m) => said.push(m), ledger);
  assert.equal(said.length, 1, "a per-call line is noise an operator learns to filter");
});

test("budget: an ABSENT knob is silent — absence is not a misconfiguration", () => {
  const said = [];
  assert.equal(statementWitnessModelTimeoutMs({}, (m) => said.push(m), new Set()), 180_000);
  assert.deepEqual(said, []);
});

test("budget: it is read at CALL time, not frozen at import", () => {
  // The defect a module-level const carries: an operator who changes the knob has to reason
  // about import order. Two calls against two different environments must give two answers.
  assert.equal(quiet({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "11000" }), 11_000);
  assert.equal(quiet({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "22000" }), 22_000);
});

test("settle door: a spent budget settles TERMINALLY through the frozen taxonomy — asked of the real judge", () => {
  const err = statementWitnessModelTimeoutError(180_000);
  assert.match(err.message, /exceeded its 180000ms budget/);
  assert.equal(err.statementWitnessTimeout, true);
  assert.notEqual(err.claraRetry, true, "a spent budget is NOT this lane's WAIT marker");
  // The load-bearing fact. classifyStatementWitnessFailure is the FROZEN body's own classifier:
  // retry false means the task settles via clara.fail_statement_facts(code) rather than
  // re-buying the call on a window the statement lane SHARES with intake OCR.
  assert.deepEqual(classifyStatementWitnessFailure(err), { retry: false, code: "internal" });
});

test("settle door: the code is NOT 'timeout' — which this lane's own RETRYABLE set would re-buy", () => {
  // The negative twin, proving the code choice is load-bearing rather than cosmetic: had the
  // adapter raised `timeout`, the SAME frozen classifier would have asked for a retry.
  const asTimeout = Object.assign(new Error("hypothetical"), { code: "timeout" });
  assert.deepEqual(classifyStatementWitnessFailure(asTimeout), { retry: true, code: "timeout" });
});

// ---------------------------------------------------------------------------
// THE ABORT — which signal fired, read positively
// ---------------------------------------------------------------------------

/** A provider that never answers but honours cancellation, exactly as a real fetch does.
 *
 *  THE KEEPER IS NOT DECORATION. `AbortSignal.timeout()` returns an UNREF'd timer, so it cannot
 *  by itself hold Node's event loop open; in production the in-flight socket does that, and a
 *  bare never-settling promise here does not — the loop would drain and the cell would report
 *  "Promise resolution is still pending" instead of exercising the budget it exists to test. */
function hangingObjectModel() {
  return new MockLanguageModelV4({
    doGenerate: async ({ abortSignal }) => new Promise((_resolve, reject) => {
      const keeper = setInterval(() => {}, 1_000);
      const fail = (reason) => { clearInterval(keeper); reject(reason); };
      if (abortSignal?.aborted) { fail(abortSignal.reason); return; }
      abortSignal?.addEventListener("abort", () => fail(abortSignal.reason), { once: true });
    }),
  });
}

test("abort: a hung statement call is ABORTED at the budget and raised as the typed timeout", async () => {
  globalThis.__claraModelForTest = hangingObjectModel();
  try {
    await assert.rejects(
      callStatementWitnessModel({
        channel: "text",
        system: "s",
        prompt: "p",
        schema: z.object({ ok: z.boolean() }),
        timeoutMs: 40,
      }),
      (err) => {
        assert.equal(err.statementWitnessTimeout, true, "the abort is normalised, not left as a raw DOMException");
        assert.equal(err.code, "internal", "the code the frozen taxonomy settles terminally on");
        assert.equal(err.budgetMs, 40);
        return true;
      },
    );
  } finally {
    delete globalThis.__claraModelForTest;
  }
});

test("abort: a caller's shutdown keeps its OWN identity — it is never reported as a timeout", async () => {
  globalThis.__claraModelForTest = hangingObjectModel();
  const ac = new AbortController();
  try {
    const pending = callStatementWitnessModel({
      channel: "vision",
      system: "s",
      prompt: "p",
      schema: z.object({ ok: z.boolean() }),
      // A budget far longer than the cell: only the caller's signal can end this call.
      timeoutMs: 60_000,
      abortSignal: ac.signal,
    });
    ac.abort(new Error("shutdown"));
    await assert.rejects(pending, (err) => {
      assert.notEqual(err?.statementWitnessTimeout, true, "a shutdown must not be laundered into a vendor timeout");
      return true;
    });
  } finally {
    delete globalThis.__claraModelForTest;
  }
});

// ---------------------------------------------------------------------------
// THE ENGINE SNAPSHOT — the runtime half of the paired literal
// ---------------------------------------------------------------------------

test("engine snapshot: the runtime's own engineId is the literal the router now stamps", () => {
  // The DB half of this pairing is asserted in packages/db/tests/f-a2-statement-activation.test.mjs
  // (cell f-a2.activation-engine-literal), which reads the migration's installed catalog source
  // and this module's source INDEPENDENTLY and compares. Held here too so a change to the
  // snapshot's SHAPE (not just its value) fails in the runtime suite as well as the DB one.
  assert.equal(STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId, "llm-openai:gpt-5.6-terra:stmt-witness-v1");
  assert.equal(STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineConfig.provider, "openai");
  assert.equal(STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineConfig.contract, "stmt-witness-v1");
});
