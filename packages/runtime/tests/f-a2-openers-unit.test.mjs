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
  // A 2-slot lane with both slots already running: the pre-fix sweep minted one run per queued
  // task and ~44 of 46 died on CLR18. The budget must mint none at all.
  const budget = makeLaneMintBudget([{ firmId: FIRM_A, lane: "llm_witness", running: 2 }], { shared: 2, llm_witness: 2 });
  assert.equal(budget.remainingFor(FIRM_A, "llm_witness"), 0);
  for (let i = 0; i < 46; i++) assert.equal(budget.tryMint(FIRM_A, "llm_witness"), false);
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

test("④ an ungated lane is never paced, however deep its queue", () => {
  const budget = makeLaneMintBudget([], { shared: 2, llm_witness: 2 });
  assert.equal(budget.remainingFor(FIRM_A, "classify"), Infinity);
  for (let i = 0; i < 50; i++) assert.equal(budget.tryMint(FIRM_A, "structured_parse"), true);
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
  assert.equal(witnessModelTimeoutMs({}), 180_000, "an environment naming neither knob gets the default");
});

test("③ the budget parses from either knob name, newest first", () => {
  assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "300000" }), 300_000);
  assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_LLM_TIMEOUT_MS: "90000" }), 90_000, "the PR-2 name a live machine may still carry");
  assert.equal(
    witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "45000", CLARA_WITNESS_LLM_TIMEOUT_MS: "90000" }),
    45_000,
    "the ratified name wins when both are set",
  );
});

test("③ junk NEVER switches the bound off — it falls through to the next name, then the default", () => {
  for (const junk of ["abc", "", "   ", "0", "-1", "Infinity", "NaN", undefined, null]) {
    assert.equal(
      witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: junk }),
      180_000,
      `junk ${JSON.stringify(junk)} must not mean "no timeout"`,
    );
  }
  // A junk new name falls through to a VALID legacy name rather than skipping straight to default.
  assert.equal(witnessModelTimeoutMs({ CLARA_WITNESS_MODEL_TIMEOUT_MS: "abc", CLARA_WITNESS_LLM_TIMEOUT_MS: "70000" }), 70_000);
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
