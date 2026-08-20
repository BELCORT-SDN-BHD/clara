// F-A2 openers ③④ — the unit battery (no DB, no network).
//
// Both subjects were minted by the SAME live incident: the 2026-08-20 corpus run
// (`docs/plan/completed/f-a1-corpus-measurement.md`, "The incident the run exposed"). Driving 63
// re-extractions at once showed a 2-slot lane being wedged from both ends — from above by a
// reconciler that mints one run per queued task regardless of how many can possibly claim, and
// from below by model calls with no enforced bound. This file judges the two fixes.
//
// ③ THE WITNESS MODEL-CALL BUDGET — parse, default, and the settle door. Pinned here rather than
//   left to a reviewer's reading because the CODE the timeout raises is the whole behaviour: it
//   decides whether a spent budget ENDS the task or re-buys the call. The proof imports the
//   FROZEN classifier and asks it, so the cell tests identity, not spelling (evidence law 3).
//
// ④ THE PACING ARITHMETIC — cap minus running, per (firm, window), and the two properties that
//   make it safe: zero free slots mints nothing, and a paced task is never starved (it stays
//   queued, untouched, and is minted oldest-first as soon as a slot frees).
//
// PURE unit cells with a scripted pg client, the convention of reconcile-belt-isolation-unit /
// reconcile-autodraft-settle-unit. The rig-backed halves of these lanes live in their own
// DB batteries; nothing here needs Postgres, a key, or a socket.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

import {
  laneCapHints,
  laneConcurrencyGroup,
  makeLaneMintBudget,
  runningCountsFromSnapshot,
} from "../lib/reconciler-pacing.mjs";
import { reconcileDocumentTasks } from "../lib/reconciler-documents.mjs";
// The engine-protective bound, imported from the module that SIZES the pool — the same identity
// the pacing module imports, so the cell proves the bound IS the pool, not a matching literal.
import { RUNTIME_POOL_MAX } from "../lib/pools.mjs";
import {
  callWitnessModel,
  witnessModelTimeoutError,
  witnessModelTimeoutMs,
  WITNESS_MODEL_TIMEOUT_DEFAULT_MS,
} from "../workflows/witnessFacts.v1.services.mjs";
// The FROZEN taxonomy, imported so the settle-door cell asks the real judge.
import { classifyWitnessFailure } from "../workflows/witnessFacts.v1.behavior.mjs";

let root;
let previousSpool;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-f-a2-openers-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  process.env.CLARA_SPOOL_DIR = root;
});

after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  delete globalThis.__claraModelForTest;
  await rm(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// ④ — the pacing arithmetic
// ---------------------------------------------------------------------------

const FIRM_A = "11111111-1111-4111-8111-111111111111";
const FIRM_B = "22222222-2222-4222-8222-222222222222";

test("④ the gated lanes map to the windows 0090 actually counts, and nothing else is paced", () => {
  // The shared triple is ONE window (ocr_concurrency counted across all three) …
  assert.equal(laneConcurrencyGroup("ocr"), "shared");
  assert.equal(laneConcurrencyGroup("invoice_facts"), "shared");
  assert.equal(laneConcurrencyGroup("statement_facts"), "shared");
  // … llm_witness is its OWN (M10 — deliberately not folded into the triple) …
  assert.equal(laneConcurrencyGroup("llm_witness"), "llm_witness");
  // … and every lane the claim does not gate is never paced by us either.
  for (const lane of ["structured_parse", "none", "statement_parse", "local_facts", "classify", "", "made_up"]) {
    assert.equal(laneConcurrencyGroup(lane), null, `${lane} must not be paced`);
  }
});

test("④ mint-cap arithmetic: the budget is cap minus running, spent one mint at a time", () => {
  const budget = makeLaneMintBudget(
    [{ firmId: FIRM_A, lane: "llm_witness", running: 1 }],
    { shared: 2, llm_witness: 3 },
  );
  assert.equal(budget.remainingFor(FIRM_A, "llm_witness"), 2, "3 cap - 1 running");
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), true);
  assert.equal(budget.remainingFor(FIRM_A, "llm_witness"), 1);
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), true);
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), false, "the third mint is refused");
  assert.equal(budget.remainingFor(FIRM_A, "llm_witness"), 0);
});

test("④ zero free slots mints ZERO — the incident's exact shape", () => {
  // A 2-slot lane with both slots already running. Pre-fix, the sweep minted one run per queued
  // task and the incident recorded ~46 runs/sweep dying on CLR18
  // (docs/plan/completed/f-a1-corpus-measurement.md, "The incident the run exposed" §1). The
  // budget must mint none at all.
  const budget = makeLaneMintBudget([{ firmId: FIRM_A, lane: "llm_witness", running: 2 }], { shared: 2, llm_witness: 2 });
  assert.equal(budget.remainingFor(FIRM_A, "llm_witness"), 0);
  for (let i = 0; i < 46; i++) assert.equal(budget.tryMint(FIRM_A, "llm_witness"), false);
});

test("④ the GLOBAL cap bounds a sweep across firms, not just within one", () => {
  // The engine-protective layer. Ten firms each with a completely free 2-slot witness window:
  // per-firm pacing alone would happily mint 20 runs and hand the pool 20 checkouts it does not
  // have. The sweep-wide cap is what stops that, and it is the pool's OWN size.
  const budget = makeLaneMintBudget([], { shared: 2, llm_witness: 2 }, 3);
  const firms = Array.from({ length: 10 }, (_, i) => `firm-${i}`);
  const minted = firms.filter((f) => budget.tryMint(f, "llm_witness"));
  assert.equal(minted.length, 3, "the global cap binds even though every firm's window was free");
  assert.equal(budget.remainingGlobal(), 0);
  assert.equal(budget.remainingFor(firms[9], "llm_witness"), 2, "an untouched firm's own window is unspent");
});

test("④ the global cap is the RUNTIME POOL's own size, by identity — never a re-spelled literal", () => {
  // Evidence law 3: prove the bound IS its import rather than a number that happens to match.
  // A default-constructed budget must spend exactly RUNTIME_POOL_MAX mints and then refuse.
  const budget = makeLaneMintBudget([], { shared: 99, llm_witness: 99 });
  let minted = 0;
  while (budget.tryMint(`firm-${minted}`, "llm_witness")) minted += 1;
  assert.equal(minted, RUNTIME_POOL_MAX);
  assert.ok(RUNTIME_POOL_MAX > 0, "a non-positive pool size would make the sweep mint nothing");
});

test("④ a refusal by EITHER layer spends nothing from the other", () => {
  // A firm whose window is full must not drain the global budget on tasks it will never mint.
  const budget = makeLaneMintBudget([{ firmId: FIRM_A, lane: "llm_witness", running: 2 }], { shared: 2, llm_witness: 2 }, 4);
  for (let i = 0; i < 20; i++) assert.equal(budget.tryMint(FIRM_A, "llm_witness"), false);
  assert.equal(budget.remainingGlobal(), 4, "the full window consumed no global slots");
  assert.equal(budget.tryMint(FIRM_B, "llm_witness"), true, "another firm can still spend them");
  assert.equal(budget.remainingGlobal(), 3);
});

test("④ an ungated lane consumes the GLOBAL slot — it mints a real run and takes a real checkout", () => {
  const budget = makeLaneMintBudget([], { shared: 2, llm_witness: 2 }, 2);
  assert.equal(budget.remainingFor(FIRM_A, "classify"), Infinity, "no per-firm window exists for it");
  assert.equal(budget.tryMint(FIRM_A, "structured_parse"), true);
  assert.equal(budget.tryMint(FIRM_A, "structured_parse"), true);
  assert.equal(budget.tryMint(FIRM_A, "structured_parse"), false, "the pool cap still binds it");
});

test("④ running OVER the cap clamps to zero, never to a negative budget", () => {
  // Reachable for real: a firm's limit lowered while three runs already hold slots.
  const budget = makeLaneMintBudget([{ firmId: FIRM_A, lane: "llm_witness", running: 5 }], { shared: 2, llm_witness: 2 });
  assert.equal(budget.remainingFor(FIRM_A, "llm_witness"), 0);
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), false);
});

test("④ the triple shares ONE window; llm_witness and other firms are isolated from it", () => {
  const budget = makeLaneMintBudget(
    [{ firmId: FIRM_A, lane: "ocr", running: 1 }, { firmId: FIRM_A, lane: "invoice_facts", running: 1 }],
    { shared: 2, llm_witness: 2 },
  );
  // ocr + invoice_facts are counted TOGETHER against ocr_concurrency, so the window is full …
  assert.equal(budget.tryMint(FIRM_A, "statement_facts"), false, "the triple shares one window");
  // … while this firm's witness window is untouched …
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), true);
  // … and so is another firm's shared window (the caps are per firm).
  assert.equal(budget.tryMint(FIRM_B, "ocr"), true);
  assert.equal(budget.tryMint(FIRM_B, "ocr"), true);
  assert.equal(budget.tryMint(FIRM_B, "ocr"), false);
});

test("④ an ungated lane has no PER-FIRM window — the DB never counts it, so neither do we", () => {
  // It is still subject to the global layer (proved in its own cell above); what it must never
  // acquire is a per-firm concurrency window the database does not actually enforce.
  const budget = makeLaneMintBudget([{ firmId: FIRM_A, lane: "classify", running: 99 }], { shared: 2, llm_witness: 2 }, 50);
  assert.equal(budget.remainingFor(FIRM_A, "classify"), Infinity);
  assert.equal(budget.remainingFor(FIRM_A, "structured_parse"), Infinity);
  for (let i = 0; i < 50; i++) assert.equal(budget.tryMint(FIRM_A, "structured_parse"), true);
  assert.equal(budget.remainingFor(FIRM_A, "llm_witness"), 2, "a running ungated task never consumed a gated window");
});

test("④ an absent census degrades to the full cap — bounded, never unlimited and never zero", () => {
  const budget = makeLaneMintBudget([], { shared: 2, llm_witness: 2 });
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), true);
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), true);
  assert.equal(budget.tryMint(FIRM_A, "llm_witness"), false, "the cap still bounds a blind sweep");
});

test("④ cap hints: DB defaults mirrored, env honoured, junk floored to the default", () => {
  assert.deepEqual(laneCapHints({}), { shared: 2, llm_witness: 2 }, "coalesce(...,2) mirrored");
  assert.deepEqual(laneCapHints({ CLARA_OCR_CONCURRENCY_HINT: "6", CLARA_LLM_WITNESS_CONCURRENCY_HINT: "4" }), { shared: 6, llm_witness: 4 });
  // A typo must be able to SLOW the pipeline, never to stop it: zero/negative/junk all fall back.
  for (const junk of ["0", "-1", "abc", "", "Infinity", "NaN", undefined]) {
    assert.deepEqual(laneCapHints({ CLARA_LLM_WITNESS_CONCURRENCY_HINT: junk }).llm_witness, 2, `junk ${JSON.stringify(junk)}`);
  }
});

test("④ the degraded census counts only RUNNING rows in gated lanes", () => {
  const rows = runningCountsFromSnapshot([
    { firmId: FIRM_A, lane: "llm_witness", status: "running" },
    { firmId: FIRM_A, lane: "llm_witness", status: "running" },
    { firmId: FIRM_A, lane: "llm_witness", status: "queued" },
    { firmId: FIRM_A, lane: "classify", status: "running" },
    { firmId: FIRM_B, lane: "ocr", status: "running" },
    null,
  ]);
  assert.deepEqual(
    rows.sort((a, b) => a.firmId.localeCompare(b.firmId)),
    [{ firmId: FIRM_A, lane: "llm_witness", running: 2 }, { firmId: FIRM_B, lane: "ocr", running: 1 }],
  );
});

// ---------------------------------------------------------------------------
// ④ — pacing never starves, through the real sweeper
// ---------------------------------------------------------------------------

/** A scripted pg client over an in-memory task table: the snapshot SELECT and the running
 *  census both read the SAME rows, so a cell can move a task to 'running' between sweeps and
 *  watch the budget close. Every other statement answers benignly. */
function pacingClient(rows) {
  return {
    query(sql) {
      const s = String(sql);
      if (/count\(\*\)::int as running/.test(s)) {
        const counts = new Map();
        for (const r of rows.filter((x) => x.status === "running")) {
          const key = `${r.firm_id}|${r.lane}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Promise.resolve({
          rows: [...counts].map(([key, running]) => ({ firm_id: key.split("|")[0], lane: key.split("|")[1], running })),
          rowCount: counts.size,
        });
      }
      if (/select t\.id as task_id/.test(s)) {
        const open = rows.filter((r) => ["queued", "held_egress", "running"].includes(r.status));
        return Promise.resolve({ rows: open.map((r) => ({ ...r })), rowCount: open.length });
      }
      return Promise.resolve({ rows: [{ receipt: {} }], rowCount: 1 });
    },
  };
}

function witnessRow(firmId, ageSeconds) {
  const createdAt = new Date(Date.now() - ageSeconds * 1000);
  return {
    id: randomUUID(),
    task_id: randomUUID(),
    document_id: randomUUID(),
    firm_id: firmId,
    engine_id: "llm-openai:gpt-5.6-terra:v1",
    engine_config: {},
    version_n: 1,
    lane: "llm_witness",
    status: "queued",
    workflow_run_id: null,
    created_at: createdAt,
  };
}

test("④ pacing never starves: capped tasks stay queued and are minted oldest-first next sweep", async () => {
  // Five queued witness tasks, one firm, a 2-slot lane. Ages descend so created_at order is
  // unambiguous and FIFO is observable rather than assumed.
  const rows = [60, 50, 40, 30, 20].map((age) => witnessRow(FIRM_A, age));
  const client = pacingClient(rows);
  const minted = [];
  const deps = {
    onlyFirm: null,
    graceMs: 0,
    enqueueDocumentIngest: async () => ({ runId: randomUUID() }),
    enqueueWitnessFacts: async (taskId) => { minted.push(taskId); return { runId: randomUUID() }; },
    getRun: () => { throw new Error("no run should be probed — every task is queued with a null run"); },
    log: () => {},
  };

  // SWEEP 1 — two slots free, five candidates.
  const first = await reconcileDocumentTasks(client, deps);
  assert.equal(first.documentPacingSource, "db", "the census read really answered");
  assert.equal(first.documentReenqueued, 2, "exactly the free slots were minted");
  assert.equal(first.documentPacedDeferred, 3, "the rest were deferred, not dispatched");
  assert.deepEqual(minted, [rows[0].task_id, rows[1].task_id], "oldest first");
  // The deferred three were not failed, not requeued, not touched at all.
  assert.equal(rows.filter((r) => r.status === "queued").length, 5, "pacing changes no row's status");

  // The two minted runs claim: the window is now full.
  rows[0].status = "running";
  rows[1].status = "running";
  const second = await reconcileDocumentTasks(client, deps);
  assert.equal(second.documentReenqueued, 0, "a full window mints nothing");
  assert.equal(second.documentPacedDeferred, 3);
  assert.equal(minted.length, 2, "no second dispatch of anything");

  // They finish; the slots free.
  rows[0].status = "done";
  rows[1].status = "done";
  const third = await reconcileDocumentTasks(client, deps);
  assert.equal(third.documentReenqueued, 2, "the freed slots are filled");
  assert.deepEqual(minted.slice(2), [rows[2].task_id, rows[3].task_id], "still oldest-first — no starvation");
  assert.equal(third.documentPacedDeferred, 1, "one candidate left over");
});

test("④ a census that cannot be read still paces — from the sweep's own snapshot", async () => {
  const rows = [60, 50, 40].map((age) => witnessRow(FIRM_A, age));
  rows.push({ ...witnessRow(FIRM_A, 90), status: "running" });
  const base = pacingClient(rows);
  const client = {
    query(sql) {
      if (/count\(\*\)::int as running/.test(String(sql))) return Promise.reject(Object.assign(new Error("permission denied"), { code: "42501" }));
      return base.query(sql);
    },
  };
  const minted = [];
  const out = await reconcileDocumentTasks(client, {
    onlyFirm: null,
    graceMs: 0,
    enqueueDocumentIngest: async () => ({ runId: randomUUID() }),
    enqueueWitnessFacts: async (taskId) => { minted.push(taskId); return { runId: randomUUID() }; },
    getRun: () => { throw new Error("no run should be probed"); },
    log: () => {},
  });
  assert.equal(out.documentPacingSource, "snapshot", "the fallback is SAID, not inferred");
  // The snapshot saw the one running witness task, so the budget is 2 - 1 = 1.
  assert.equal(out.documentReenqueued, 1);
  assert.equal(out.documentPacedDeferred, 2);
  assert.equal(minted.length, 1);
});

// ---------------------------------------------------------------------------
// ③ — the witness model-call budget
// ---------------------------------------------------------------------------

test("③ the budget default is the value the corpus run proved, not a guess", () => {
  assert.equal(WITNESS_MODEL_TIMEOUT_DEFAULT_MS, 180_000);
  assert.equal(witnessModelTimeoutMs({}, () => {}, new Set()), 180_000, "an environment naming neither knob gets the default");
});

/** Parse-only: a sink warn + a throwaway ledger, so these cells judge the VALUE and never
 *  accidentally depend on (or pollute) the once-per-process warning state. */
const quietTimeout = (env) => witnessModelTimeoutMs(env, () => {}, new Set());

test("③ the budget parses from either knob name, newest first", () => {
  assert.equal(quietTimeout({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "300000" }), 300_000);
  assert.equal(quietTimeout({ CLARA_WITNESS_LLM_TIMEOUT_MS: "90000" }), 90_000, "the PR-2 name a live machine may still carry");
  assert.equal(
    quietTimeout({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "45000", CLARA_WITNESS_LLM_TIMEOUT_MS: "90000" }),
    45_000,
    "the ratified name wins when both are set",
  );
});

test("③ junk NEVER switches the bound off — it falls through to the next name, then the default", () => {
  for (const junk of ["abc", "", "   ", "0", "-1", "Infinity", "NaN", undefined, null]) {
    assert.equal(
      quietTimeout({ CLARA_WITNESS_MODEL_TIMEOUT_MS: junk }),
      180_000,
      `junk ${JSON.stringify(junk)} must not mean "no timeout"`,
    );
  }
  // A junk new name falls through to a VALID legacy name rather than skipping straight to default.
  assert.equal(quietTimeout({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "abc", CLARA_WITNESS_LLM_TIMEOUT_MS: "70000" }), 70_000);
});

test("③ a knob that is PRESENT but unusable is SAID, not silently discarded", () => {
  // The other failure mode of a fallback: an operator typed something deliberate and the process
  // ignored it without a word. Absence is not a mistake and must stay quiet; a typed value that
  // cannot be honoured must not. Each cell brings its OWN warn-once ledger so the cells are
  // order-independent — the shared process ledger is what the next cell is actually about.
  const said = [];
  const warn = (m) => said.push(m);
  assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "5m" }, warn, new Set()), 180_000);
  assert.equal(said.length, 1, "exactly one line for the junk value");
  assert.match(said[0], /CLARA_WITNESS_MODEL_TIMEOUT_MS/);
  assert.match(said[0], /"5m"/, "it names WHAT it saw, not just that something was wrong");
  assert.match(said[0], /IGNORED/);
  assert.match(said[0], /180000/, "…and what is being used instead");
});

test("③ the warning is ONCE per ledger, not once per call — it is read on every model call", () => {
  const said = [];
  const warn = (m) => said.push(m);
  const ledger = new Set();
  for (let i = 0; i < 5; i++) witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "5m" }, warn, ledger);
  assert.equal(said.length, 1, "a per-call line is noise an operator learns to filter");
});

test("③ an ABSENT knob is silent — absence is not a misconfiguration", () => {
  const said = [];
  assert.equal(witnessModelTimeoutMs({}, (m) => said.push(m), new Set()), 180_000);
  assert.deepEqual(said, []);
});

test("③ the deprecated PR-2 knob still BINDS, and says it is obsolete", () => {
  // It is kept because it is the name this file read on `main` (witnessFacts.v1.services.mjs:71
  // at d13341b, shipped by PR #265), i.e. the name any already-deployed machine would be
  // configured under. Dropping it would revert such a deployment to the default with no signal.
  const said = [];
  assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_LLM_TIMEOUT_MS: "90000" }, (m) => said.push(m), new Set()), 90_000);
  assert.equal(said.length, 1);
  assert.match(said[0], /DEPRECATED/);
  assert.match(said[0], /still binds \(90000ms\)/, "the operator is told their value IS in force");
  assert.match(said[0], /CLARA_WITNESS_MODEL_TIMEOUT_MS/, "…and what to rename it to");
});

test("③ a spent budget settles TERMINALLY through the frozen taxonomy — asked of the real judge", () => {
  const err = witnessModelTimeoutError(180_000);
  assert.match(err.message, /exceeded its 180000ms budget/);
  assert.equal(err.witnessTimeout, true);
  // The load-bearing fact. classifyWitnessFailure is the FROZEN body's own classifier: retry
  // false means the task settles via clara.fail_witness_facts(code) — the audited door the four
  // live hangs went out of — rather than re-buying the call until the 45-minute wait budget.
  assert.deepEqual(classifyWitnessFailure(err), { retry: false, code: "internal" });
});

/** A provider that never answers but honours cancellation, exactly as a real fetch does.
 *
 *  THE KEEPER IS NOT DECORATION. `AbortSignal.timeout()` returns an UNREF'd timer, so it cannot
 *  by itself hold Node's event loop open; in production the in-flight socket does that, and a
 *  bare never-settling promise here does not — the loop would drain and the cell would report
 *  "Promise resolution is still pending" instead of exercising the budget it exists to test. The
 *  interval models the socket. */
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

test("③ a hung call is ABORTED at the budget and raised as the typed timeout", async () => {
  globalThis.__claraModelForTest = hangingObjectModel();
  try {
    await assert.rejects(
      callWitnessModel({
        channel: "text",
        system: "s",
        prompt: "p",
        schema: z.object({ ok: z.boolean() }),
        timeoutMs: 40,
      }),
      (err) => {
        assert.equal(err.witnessTimeout, true, "the abort is normalised, not left as a raw DOMException");
        assert.equal(err.code, "internal", "the code the frozen taxonomy settles terminally on");
        assert.equal(err.budgetMs, 40);
        return true;
      },
    );
  } finally {
    delete globalThis.__claraModelForTest;
  }
});

test("③ a caller's shutdown abort keeps its OWN identity — it is never reported as a timeout", async () => {
  globalThis.__claraModelForTest = hangingObjectModel();
  const ac = new AbortController();
  try {
    const pending = callWitnessModel({
      channel: "text",
      system: "s",
      prompt: "p",
      schema: z.object({ ok: z.boolean() }),
      // A budget far longer than the test: only the caller's signal can end this call.
      timeoutMs: 60_000,
      abortSignal: ac.signal,
    });
    ac.abort(new Error("shutdown"));
    await assert.rejects(pending, (err) => {
      assert.notEqual(err?.witnessTimeout, true, "a shutdown must not be laundered into a vendor timeout");
      return true;
    });
  } finally {
    delete globalThis.__claraModelForTest;
  }
});
