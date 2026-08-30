// 裁-44 R4 — THE ATTEMPT AND THE RECEIPT: what a run owes when its stream dies mid-pass, and what
// counts as proof that a database call actually did something.
//
// Split from g1-wake-gates.test.mjs for the 500-line module budget. Both cells are about the same
// question — when is a claim of success believable — asked once about an attempt and once about a
// reply.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import { skip0138 } from "./g1-wake-bodies.fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

test("G1B-I8-retry 裁-44 R4 / FOLD-21 — a stream failure AFTER tool activity is settled by THIS attempt, never rethrown into a clean retry", { skip: skip0138 }, async () => {
  // THE SCHEDULE: attempt one admits a durable write, a re-read comes back malformed and counts a
  // grounding fault, then fullStream throws a network error. Rethrowing hands the WDK a retry
  // whose record starts at ZERO — the write replays through its stable op key (or the clean pass
  // finds nothing due) and the task settles COMPLETED, erasing the first attempt's fault. The
  // whole run record is per-attempt, so the fault has no memory to survive in.
  const bank = await import("../workflows/bankAgent.v1.impl.ts");
  const close = await import("../workflows/closePrep.v1.impl.ts");
  const tools = await import("../workflows/bankAgent.v1.tools.ts");

  // (1) THE PREDICATE that decides rethrow-or-settle is ONE named counter, not a sum recomputed at
  // the call site — a sum drifts the moment a counter is added.
  const fresh = tools.newBankRunRecord("attempt-1");
  assert.equal(tools.hadToolActivity(fresh), false, "nothing has happened yet, so a stream failure here MAY retry clean");
  fresh.toolCalls += 1;
  assert.equal(tools.hadToolActivity(fresh), true, "one tool call is enough to make this attempt own its own outcome");

  // (2) THE OUTCOME the attempt settles instead of rethrowing. Driven through the shipping
  // classifiers with the record that schedule produces.
  const mid = { ...tools.newBankRunRecord("attempt-1"), toolCalls: 3, admitted: 1, digest: "abc", infraFaults: 1, streamFault: true };
  const bankOut = bank.classifyBankOutcome(mid, "");
  assert.equal(bankOut.kind, "refused", "an admitted act does NOT rescue a run whose grounding failed and whose stream then died");
  assert.equal(bankOut.code, "internal");

  // THE CLOSE LANE reaches the same verdict by its OWN branch: it keeps N12's partial-success rule
  // (no pack, so no corrupted evidence), but a stream that died mid-pass CUT THE RUN OFF, which is
  // a different thing from a fault it worked around.
  const closeMid = { acts: 2, reads: 6, infraFaults: 1, writeAttempts: 2, refusals: 0, cancelledAs: null, streamFault: true };
  const closeOut = close.classifyCloseOutcome(closeMid, "");
  assert.equal(closeOut.kind, "refused", "close settles the truncated pass as a failure too");
  assert.equal(closeOut.code, "internal");
  assert.match(String(closeOut.message), /incomplete/, "and says why, rather than reporting a quiet night");

  // AND THE ASYMMETRY IS STILL DELIBERATE: the same close record WITHOUT the stream fault keeps
  // N12's rule. Without this the cell would have quietly redefined the close lane.
  assert.equal(close.classifyCloseOutcome({ ...closeMid, streamFault: false }, "").kind, "proposed");

  // (2b) AND THE SHIPPING DECISION ITSELF, driven rather than read. 裁-44 R5 / FOLD-24 pulled the
  // rethrow-or-settle branch out of the catch into ONE named function per lane, which is what
  // finally makes it executable — the round-four version of this cell could only PIN the catch's
  // source text, and said so. G1B-I8-stream-part below drives the whole schedule end to end; these
  // two lines are the decision on its own.
  assert.equal(bank.latchStreamFault({ ...tools.newBankRunRecord("attempt-1"), toolCalls: 0 }), "retry", "nothing happened yet, so the WDK may have a clean attempt");
  const latched = { ...tools.newBankRunRecord("attempt-1"), toolCalls: 2 };
  assert.equal(bank.latchStreamFault(latched), "settle", "after tool activity THIS attempt owns the outcome");
  assert.equal(latched.streamFault, true, "and the fault is latched onto its own record");
  assert.equal(latched.infraFaults, 1, "counted as ours, which is what carries the settle to internal");

  // (3) THE SECOND ATTEMPT STANDS DOWN. Once attempt one has settled the task, a retry's claim CAS
  // finds it no longer 'running' — the existing wall, named here as the other half of the story.
  const w = await rig.buildFirm("g1bi8r");
  const { plantHeldWakeTask, readTask } = await import("./g1-wake-bodies.fixtures.mjs");
  const infra = await import("../workflows/bankAgent.v1.infra.ts");
  const { randomUUID } = await import("node:crypto");
  const t = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [t.taskId]);
  await rig.asRuntime((c) => infra.settleBankTask(c, t.taskId, "failed", "internal"));
  assert.equal((await readTask(t.taskId)).status, "failed", "attempt one settled it");
  const second = await rig.asRuntime((c) => infra.claimBankTask(c, t.taskId, randomUUID()));
  assert.equal(second.claimed, false, "and a retry cannot claim a task that is no longer running");
  assert.equal(second.bound, false, "so it settles nothing and cannot overwrite the failure");
});

test("G1B-I8-stream-part 裁-44 R5 / FOLD-24 — an SDK ERROR PART is a stream failure too, and a tool-error part is a different event", async () => {
  // THE DEFECT: FOLD-21's latch lived in a `catch`, so it ran only when the ITERATOR rejected. The
  // AI SDK does not always throw — `streamText` carries failures as PARTS, and its documented
  // failed-follow-up path enqueues an error part and closes WITHOUT a `finish`. Both loops read
  // only `text-delta`, so a run could act, lose its stream, and still settle through ordinary
  // classification with `streamFault` unset.
  //
  // The injected streams below are hand-rolled async generators, and the tool call inside them is
  // a REAL call through the SHIPPING tool set — which is what makes it tool ACTIVITY rather than a
  // number this cell wrote onto a record. The calls fail LOCALLY (no pools injected), before any
  // database access.
  const bank = await import("../workflows/bankAgent.v1.impl.ts");
  const close = await import("../workflows/closePrep.v1.impl.ts");
  const bankTools = await import("../workflows/bankAgent.v1.tools.ts");
  const closeTools = await import("../workflows/closePrep.v1.tools.ts");
  const { randomUUID } = await import("node:crypto");

  const previous = globalThis.__claraPools;
  globalThis.__claraPools = undefined;
  try {
    // ---- BANK: a tool call, then a TERMINAL error part, then the stream closes with no finish ---
    const brec = bankTools.newBankRunRecord("attempt-1");
    const bbuilt = bankTools.buildBankAgentTools(
      { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null },
      "gpt-5.6-terra",
      brec,
    );
    async function* bankDied() {
      yield { type: "text-delta", text: "reading the pack first" };
      const out = await bbuilt.get_bank_pack.execute({ rationale: "the call the model made before its stream died" });
      assert.ok(out?.error, "the tool call failed locally — it still HAPPENED, which is the whole point");
      yield { type: "error", error: new Error("provider connection reset") };
      // and the generator RETURNS here: no `finish` part, exactly the shape the SDK's failed
      // follow-up produces and the shape the old loop discarded.
    }
    await assert.rejects(bank.drainBankStream(brec, bankDied()), /ended on an error part/, "a terminal error part must be RAISED, not discarded");
    assert.ok(brec.toolCalls >= 1, "the shipping tool moved the shared counter, so this attempt owns its outcome");
    assert.equal(bank.latchStreamFault(brec), "settle");
    assert.equal(brec.streamFault, true);
    const bout = bank.classifyBankOutcome(brec, "");
    assert.equal(bout.kind, "refused", "the bank lane settles the truncated pass as a failure");
    assert.equal(bout.code, "internal", "and it is OUR code, not the model's");

    // THE INVERSE: an error part BEFORE any tool call may retry — nothing durable happened.
    const bfresh = bankTools.newBankRunRecord("attempt-1");
    async function* bankDiedEarly() {
      yield { type: "error", error: new Error("provider connection reset") };
    }
    await assert.rejects(bank.drainBankStream(bfresh, bankDiedEarly()), /ended on an error part/);
    assert.equal(bfresh.toolCalls, 0);
    assert.equal(bank.latchStreamFault(bfresh), "retry", "a retry is lawful when nothing has happened");
    assert.equal(bfresh.streamFault, false, "and nothing is latched onto a record that owes nothing");
    assert.equal(bfresh.infraFaults, 0);

    // A `tool-error` PART IS NOT THE SAME EVENT. One call failed; the loop may continue and the
    // model may recover and act. It counts as activity and as OUR fault — and it must NOT set
    // streamFault, or a pass that recovered would settle as though it had been cut off.
    const brecovered = bankTools.newBankRunRecord("attempt-1");
    async function* bankRecovered() {
      yield { type: "tool-error", error: new Error("the SDK could not parse the model's tool input") };
      yield { type: "text-delta", text: "trying again" };
      yield { type: "finish" };
    }
    assert.equal(await bank.drainBankStream(brecovered, bankRecovered()), "trying again", "a tool-error does not end the drain");
    assert.equal(brecovered.toolCalls, 1, "the model DID call something");
    assert.equal(brecovered.infraFaults, 1, "and it failed on our side of the model");
    assert.equal(brecovered.streamFault, false, "but the stream did not die");

    // ---- CLOSE: the same schedule, and the same distinction, on the lane where it is VISIBLE ----
    const crec = closeTools.newCloseRunRecord();
    const cbuilt = closeTools.buildClosePrepTools({ taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID() }, "gpt-5.6-terra", crec);
    async function* closeDied() {
      const out = await cbuilt.list_fiscal_years.execute({ rationale: "the read the model made before its stream died" });
      assert.ok(out?.error, "the read failed locally — it still happened");
      yield { type: "error", error: "the provider closed the stream" };
    }
    await assert.rejects(close.drainCloseStream(crec, closeDied()), /ended on an error part/);
    assert.ok(crec.toolCalls >= 1);
    assert.equal(close.latchCloseStreamFault(crec), "settle");
    assert.equal(crec.streamFault, true);
    const cout = close.classifyCloseOutcome(crec, "");
    assert.equal(cout.kind, "refused");
    assert.equal(cout.code, "internal");

    const cfresh = closeTools.newCloseRunRecord();
    async function* closeDiedEarly() {
      yield { type: "error", error: null };
    }
    await assert.rejects(close.drainCloseStream(cfresh, closeDiedEarly()), /ended on an error part/);
    assert.equal(close.latchCloseStreamFault(cfresh), "retry");
    assert.equal(cfresh.streamFault, false);

    // AND THE HALF THAT KEEPS THIS FROM BEING A BLUNT INSTRUMENT — a run that took a tool-error and
    // WENT ON TO ACT must settle green. Flattening the two part kinds into "the stream failed"
    // would fail this night, which is why they are two entry points and not one.
    const crecovered = closeTools.newCloseRunRecord();
    async function* closeRecovered() {
      yield { type: "tool-error", error: new Error("one call failed") };
      yield { type: "finish" };
    }
    await close.drainCloseStream(crecovered, closeRecovered());
    assert.equal(crecovered.toolCalls, 1);
    assert.equal(crecovered.infraFaults, 1);
    assert.equal(crecovered.streamFault, false);
    const settled = close.classifyCloseOutcome({ ...crecovered, acts: 2, reads: 4, writeAttempts: 2 }, "");
    assert.equal(settled.kind, "proposed", "N12's partial-success rule still stands for a pass that RECOVERED");
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-I8-stream-integration Gate G1 PR-2b (Codex r6 LOW #2) — a REAL registered tool's REAL SDK-shaped tool-error; a following terminal error settles the attempt; an unheld claim proves no settlement", { skip: skip0138 }, async () => {
  // WHY THIS CELL EXISTS AND WHAT G1B-I8-stream-part DOES NOT COVER: that cell's injected streams
  // are HAND-ROLLED async generators whose tool-error parts are `{type:"tool-error", error}` —
  // shaped the way THIS CODE reads them, not the way the real AI SDK actually produces them. This
  // cell drives the REAL `ai` package's `streamText` over the REAL, frozen tool set
  // (buildBankAgentTools) with a MockLanguageModelV4 (ai/test — the exact harness
  // mockModel.mjs/classify-unit.test.mjs already use), so the tool-error part `drainBankStream`
  // reads is the SDK's OWN production, never a shape this test invented.
  //
  // MEASURED, NOT ASSUMED — TWO REAL SDK BEHAVIOURS THIS CELL'S SHAPE IS BUILT AROUND (found
  // empirically driving ai@7.0.77 directly, not read from docs):
  //   (a) A malformed tool-input (fails the tool's own zod schema) never reaches this closure's
  //       execute() at all — the SDK's OWN input-validation refuses it BEFORE dispatch — but it
  //       DOES emit a fully-shaped `{type:"tool-error", toolCallId, toolName, input, error}` part
  //       carrying a real `AI_InvalidToolInputError`/`ZodError` chain, which is exactly the
  //       "real tool → real SDK-shaped tool-error" this Codex LOW asks for: genuine SDK output,
  //       not a hand-typed `{type:"tool-error", error}` stub.
  //   (b) A tool-call and a TERMINAL stream error cannot coexist inside the SAME provider step —
  //       ai@7.0.77's streamStep discards an in-progress step's tool dispatch entirely when the
  //       raw provider stream errors before that step's own `finish`, so a single-step schedule
  //       of [tool-call, error] never calls execute() and toolCalls stays 0 (verified directly:
  //       an identical schedule with a trailing `finish` instead of `error` DOES call execute()
  //       and increments toolCalls to 1). The two-part schedule this Codex LOW asks for — "real
  //       tool, then the stream dies" — is therefore built as TWO STEPS: step 1 finishes normally
  //       carrying the malformed-input tool-error (rec.toolCalls becomes 1, matching
  //       drainBankStream's own tool-error branch, `bankAgent.v1.impl.ts`); step 2's raw stream
  //       is the terminal error. `stopWhen` lets the SDK's own multi-step loop request step 2.
  //
  // MEDIUM-6 (G1 PR-2b fold, Codex r1 review of #449): "this is genuine SDK integration, but
  // still a component test — it never drives runBankAgentModelStep or workflow settlement."
  // Correct, and DEFERRED to a G1 PR-2c follow-up rather than built here, for a concrete reason
  // rather than a silent skip: `runBankAgentModelStep` carries `"use step"` (bankAgent.v1.impl.ts)
  // and cannot be invoked outside a real WDK-managed workflow run — the ONLY harness in this
  // codebase that drives a real WDK run end-to-end is `tests/world-e2e.mjs`, built specifically
  // for the HTTP-triggered chatTurn family (boots the full built server with
  // CLARA_START_WORLD=1, mints a JWT, polls agent_tasks over HTTP). It has never been extended to
  // a wake-engine-dispatched workflow, and #437's OWN battery (which shipped bankAgent_v1/
  // closePrep_v1) explicitly declined to drive the model loop through the real pipeline for the
  // identical reason (g1-wake-bank-e2e.test.mjs's own header: "It does NOT drive the model loop
  // — no LLM is called; the tools' `.execute` is invoked directly"). Building a wake-engine
  // analogue of world-e2e.mjs — enabling wake_engine_sources, booting the built server, injecting
  // a mock model, and polling through routing -> drain -> wake-engine-claim -> model-run -> settle
  // — is a materially larger undertaking than this PR's own producer-plumbing scope. The API
  // that is missing, named per MEDIUM-6's own instruction: a WDK-native test harness for
  // wake-engine-dispatched (as opposed to HTTP-dispatched) workflow runs.
  const bank = await import("../workflows/bankAgent.v1.impl.ts");
  const bankTools = await import("../workflows/bankAgent.v1.tools.ts");
  const { streamText, isStepCount } = await import("ai");
  const { MockLanguageModelV4, simulateReadableStream } = await import("ai/test");
  const { randomUUID } = await import("node:crypto");

  const previous = globalThis.__claraPools;
  globalThis.__claraPools = undefined; // the real tool's execute() fails LOCALLY, before any DB access — G1B-I8-tool-counter's own precedent
  try {
    const rec = bankTools.newBankRunRecord("integration-1");
    const built = bankTools.buildBankAgentTools(
      { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null },
      "gpt-5.6-terra",
      rec,
    );
    const toolCallId = "g1b-i8-si-1";
    const toolName = "match_bank_line";
    // MALFORMED on purpose — missing the required `lines`/`entries` arrays entirely, so the
    // SDK's own zod validation against the SHIPPING schema genuinely fails.
    const badInput = JSON.stringify({ rationale: "no lines or entries at all" });
    let calls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                { type: "tool-input-start", id: toolCallId, toolName },
                { type: "tool-input-delta", id: toolCallId, delta: badInput },
                { type: "tool-input-end", id: toolCallId },
                { type: "tool-call", toolCallId, toolName, input: badInput },
                { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: { inputTokens: 1, outputTokens: 1 } },
              ],
              chunkDelayInMs: 1,
            }),
          };
        }
        // Step 2 — the stream dies with a terminal provider error, no tool activity of its own.
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "error", error: new Error("provider connection reset after the tool call") },
            ],
            chunkDelayInMs: 1,
          }),
        };
      },
    });
    const result = streamText({
      model,
      tools: built,
      messages: [{ role: "user", content: "go" }],
      stopWhen: [isStepCount(5)],
    });
    await assert.rejects(
      bank.drainBankStream(rec, result.fullStream),
      /ended on an error part/,
      "the terminal provider error (step 2) must still be raised as drainBankStream's own contract",
    );
    assert.equal(calls, 2, "the SDK must genuinely have taken two steps — the schedule this cell claims to drive");
    assert.equal(rec.toolCalls, 1, "step 1's REAL, SDK-produced tool-error must have moved the shared counter — this is genuine tool ACTIVITY, not a number this test wrote onto the record");
    assert.equal(bank.latchStreamFault(rec), "settle", "tool activity happened, so THIS attempt owns its own outcome");
    const outcome = bank.classifyBankOutcome(rec, "");
    assert.equal(outcome.kind, "refused");
    assert.equal(outcome.code, "internal", "our fault, never the model's — a real tool call genuinely happened and the pass was cut off on our side");

    // THE INVERSE — a terminal error with NO tool activity first must stay eligible for a clean
    // retry, through the SAME real-SDK pipeline (single step, no tool-call at all).
    const recEarly = bankTools.newBankRunRecord("integration-2");
    const modelEarly = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [{ type: "stream-start", warnings: [] }, { type: "error", error: new Error("provider connection reset") }],
          chunkDelayInMs: 1,
        }),
      }),
    });
    const resultEarly = streamText({ model: modelEarly, tools: built, messages: [{ role: "user", content: "go" }] });
    await assert.rejects(bank.drainBankStream(recEarly, resultEarly.fullStream), /ended on an error part/);
    assert.equal(recEarly.toolCalls, 0);
    assert.equal(bank.latchStreamFault(recEarly), "retry", "nothing durable happened, so a retry is lawful");
  } finally {
    globalThis.__claraPools = previous;
  }

  // "EXACTLY ONE releaseLock" — a STRUCTURAL proof off the shipping source (no harness here can
  // drive the real "use step" wrapper — the same gap MEDIUM-6 names). FIND-12 (opus r1 review of
  // #449): kept as a regex deliberately (a fake-writer count would only prove something about a
  // stand-in), widened whitespace/comment-tolerant (`[\s\S]*?`) so a reformat can't false-red it.
  const implSrc = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../workflows/bankAgent.v1.impl.ts", import.meta.url), "utf8"),
  );
  const releaseLockCalls = implSrc.match(/writer\.releaseLock\(\)/g) ?? [];
  assert.equal(releaseLockCalls.length, 1, "writer.releaseLock() must appear exactly once in the shipping source");
  assert.match(implSrc, /finally\s*\{[\s\S]*?writer\.releaseLock\(\);[\s\S]*?\}/, "and it must sit inside a finally block, so it runs on every exit path exactly once");

  // "AN UNHELD RUN PROVES NO SETTLEMENT" — claimBankTask/settleBankTask are plain, rig-callable
  // functions, so this half IS directly testable. FIND-5 (opus r1 review of #449): the ORIGINAL
  // cut never actually CALLED settleBankTask — "no settle call is made" proved nothing about its
  // OWN refusal wall. Fixed: call it for real and assert CLR13 (no legal edge out of 'cancelled').
  const infra = await import("../workflows/bankAgent.v1.infra.ts");
  const { plantHeldWakeTask, readTask } = await import("./g1-wake-bodies.fixtures.mjs");
  const w = await rig.buildFirm("g1bi8si");
  const t = await plantHeldWakeTask({ owner: w.owner, client: w.client, payload: { bank_account_id: randomUUID() } });
  // Cancel it WHILE STILL HELD — never claimed 'running' at all.
  await rig.rootQuery("update clara.agent_tasks set status='cancelled' where id=$1 and status='held'", [t.taskId]);
  const claim = await rig.asRuntime((c) => infra.claimBankTask(c, t.taskId, randomUUID()));
  assert.equal(claim.claimed, false, "a cancelled, never-run task cannot be claimed");
  assert.equal(claim.bound, false, "and it was never bound to any run");
  const before = await readTask(t.taskId);
  assert.equal(before.status, "cancelled", "the failed claim must not have touched the row's status");
  await assert.rejects(
    rig.asRuntime((c) => infra.settleBankTask(c, t.taskId, "failed", "internal")),
    /CLR13|illegal.*transition/i,
    "settleBankTask must itself refuse a settle attempt on an already-terminal, never-run task — this is the wall, not merely this test's own restraint",
  );
  const after = await readTask(t.taskId);
  assert.deepEqual(after, before, "unchanged — a REJECTED settle attempt on an unheld run must leave the row untouched too");
});

test("G1B-I8-tool-counter 裁-44 R5 (LOW) — every shipping tool moves the SHARED counter, on both lanes", async () => {
  // G1B-I8-retry drives the predicate on a record it increments BY HAND, so deleting a shipping
  // `rec.toolCalls += 1` would leave it green while the retry latch went blind. Every bank verb and
  // both close paths are invoked for real here; with no pools injected they all fail LOCALLY,
  // before any database access, which is what makes driving all of them cheap.
  const bankTools = await import("../workflows/bankAgent.v1.tools.ts");
  const closeTools = await import("../workflows/closePrep.v1.tools.ts");
  const { randomUUID } = await import("node:crypto");

  const previous = globalThis.__claraPools;
  globalThis.__claraPools = undefined;
  try {
    const brec = bankTools.newBankRunRecord("counter");
    const b = bankTools.buildBankAgentTools(
      { taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID(), bankAccountId: randomUUID(), dueReason: null },
      "gpt-5.6-terra",
      brec,
    );
    const crec = closeTools.newCloseRunRecord();
    const c = closeTools.buildClosePrepTools({ taskId: randomUUID(), firmId: randomUUID(), clientId: randomUUID() }, "gpt-5.6-terra", crec);

    const calls = [
      ["bank", brec, "get_bank_pack", () => b.get_bank_pack.execute({ rationale: "a read that never reaches the database" })],
      ["bank", brec, "match_bank_line", () => b.match_bank_line.execute({ lines: [randomUUID()], entries: [randomUUID()], rationale: "an ungrounded match" })],
      ["bank", brec, "propose_line_exception", () => b.propose_line_exception.execute({ line_id: randomUUID(), kind: "disputed", reason: "r", rationale: "an ungrounded exception" })],
      ["bank", brec, "propose_identifier_promotion", () => b.propose_identifier_promotion.execute({ counterparty_id: randomUUID(), identifier_kind: "tin", identifier_value: "123456789", rationale: "an ungrounded promotion" })],
      ["close", crec, "list_fiscal_years", () => c.list_fiscal_years.execute({ rationale: "a read that never reaches the database" })],
      ["close", crec, "open_fiscal_year", () => c.open_fiscal_year.execute({ label: "FY2030", starts_on: "2030-01-01", rationale: "a write that never reaches the database" })],
    ];

    for (const [lane, rec, name, call] of calls) {
      const before = rec.toolCalls;
      const out = await call();
      assert.ok(out?.error, `${lane}/${name} must fail locally in this cell — got ${JSON.stringify(out)?.slice(0, 200)}`);
      assert.equal(rec.toolCalls, before + 1, `${lane}/${name} must move the SHARED counter, not a local one`);
    }
    // ENUMERATED, so a fifth bank verb that forgets the increment is caught by the count as well as
    // by its own row above.
    assert.equal(Object.keys(b).length, 4, "all four bank verbs were driven");
    assert.equal(brec.toolCalls, 4);
    assert.equal(crec.toolCalls, 2, "one close read and one close write, the two shapes the counter lives in");
    assert.equal(crec.writeAttempts, 1, "and the write went through the gate, which is where a write's counter sits");
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-I13 裁-44 R4 / FOLD-22(a) — a purported success that carries no verifiable receipt is OURS, not an act", { skip: skip0138 }, async () => {
  // MEDIUM-1: admission accepted any string id, and the close lane counted a bare {status:'acted'}
  // — so a malformed reply could increment reads, take nothing_due, and settle GREEN with no
  // receipt behind it. Incomplete positive evidence is not positive evidence (review law 2).
  const tools = await import("../workflows/bankAgent.v1.tools.ts");
  const reads = await import("../workflows/closePrep.v1.reads.ts");
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const other = randomUUID();

  // --- the BANK lane -------------------------------------------------------------------------
  const bankVerdict = (verb, reply, subject) => tools.classifyBankReply(verb, reply, subject);
  assert.equal(bankVerdict("match", { status: "live", match_id: id }), "admitted");
  assert.equal(bankVerdict("match", { status: "live", match_id: "ok" }), "malformed", "any string used to count a durable act");
  assert.equal(bankVerdict("match", { status: "live" }), "malformed", "and a bare status names nothing an audit can follow");
  assert.equal(bankVerdict("match", { status: "refused", rung_vector: {} }), "refused", "a real refusal is still the model's");
  assert.equal(bankVerdict("exception", { status: "open", proposal_id: id, line_id: other }, other), "admitted");
  assert.equal(bankVerdict("exception", { status: "open", proposal_id: id, line_id: other }, id), "malformed", "a receipt about a DIFFERENT line is not this act's");
  assert.equal(bankVerdict("exception", { status: "open", proposal_id: id }, other), "malformed", "and one with no subject at all is not either");
  assert.equal(bankVerdict("promotion", { status: "open", proposal_id: id, counterparty_id: other }, other), "admitted");
  assert.equal(bankVerdict("promotion", { status: "open", proposal_id: "nope", counterparty_id: other }, other), "malformed");

  // A malformed reply is counted as OURS and never as an act or a refusal.
  const rec = tools.newBankRunRecord("cell");
  tools.countIfAdmitted(rec, "match", { status: "live", match_id: "ok" });
  assert.equal(rec.admitted, 0, "not an act");
  assert.equal(rec.refusals, 0, "not the model's refusal either");
  assert.equal(rec.infraFaults, 1, "ours — which on this lane settles internal");

  // --- the CLOSE lane ------------------------------------------------------------------------
  assert.equal(reads.classifyCloseReply({ status: "acted", receipt_id: id, result: {} }), "acted");
  assert.equal(reads.classifyCloseReply({ status: "acted" }), "malformed", "a bare 'acted' used to count a read and carry a run to a green settle");
  assert.equal(reads.classifyCloseReply({ status: "acted", receipt_id: "nope", result: {} }), "malformed");
  assert.equal(reads.classifyCloseReply({ status: "acted", receipt_id: id }), "malformed", "0138's documented shape carries a result object");
  assert.equal(reads.classifyCloseReply({ status: "refused", rung_vector: [] }), "refused");
  // begin_close alone must also name the run id the rest of the pass depends on (0138:2104).
  assert.equal(reads.classifyCloseReply({ status: "acted", receipt_id: id, result: {} }, { needsCloseRunId: true }), "malformed");
  assert.equal(reads.classifyCloseReply({ status: "acted", receipt_id: id, result: { close_run_id: other } }, { needsCloseRunId: true }), "acted");

  const crec = reads.newCloseRunRecord();
  reads.countIfAdmitted(crec, { status: "acted" });
  assert.equal(crec.acts, 0);
  assert.equal(crec.refusals, 0);
  assert.equal(crec.infraFaults, 1);

  // --- 裁-44 R5 / FOLD-25: the RESULT'S KIND IS THE VERB'S, in BOTH directions -----------------
  // `typeof [] === "object"` is true, so `result: []` used to pass as an act on every verb: a
  // structurally drifted write with a real receipt id incremented `acts`, took `nothing_due`, and
  // settled green against the wrong contract.
  //
  // AND THE OPPOSITE ERROR WOULD HAVE BEEN WORSE, which is why this is a MAP and not a ban:
  // wake_list_fiscal_years returns coalesce(jsonb_agg(...), '[]') (0138:1012-1019), so `[]` is the
  // lawful reply of the lane's very FIRST call on a client with no fiscal years — measured on a rig,
  // not reasoned about. "Arrays are malformed" would have INFRA-faulted every run's opening read.
  assert.equal(reads.closeResultKind("wake_list_fiscal_years"), "array", "the one collection read among the twelve");
  for (const verb of ["wake_get_close_plan", "wake_get_close_readiness", "wake_verify_close", "wake_snapshot_state",
    "wake_dry_run_close_readiness", "wake_open_fiscal_year", "wake_begin_close", "wake_abandon_close",
    "wake_propose_close", "wake_run_depreciation_catchup", "wake_mint_month_snapshot"]) {
    assert.equal(reads.closeResultKind(verb), "record", `${verb} returns a jsonb OBJECT — its result must be a record`);
  }

  const acted = (result, opts) => reads.classifyCloseReply({ status: "acted", receipt_id: id, result }, opts);
  // null is malformed EVERYWHERE, whichever kind the verb owes.
  assert.equal(acted(null), "malformed");
  assert.equal(acted(null, { resultKind: "array" }), "malformed");
  // `[]` is the LIST read's own answer, and nobody else's.
  assert.equal(acted([], { resultKind: "array" }), "acted", "an empty fiscal-year list is a real, admitted read");
  assert.equal(acted([{ fiscal_year_id: other }], { resultKind: "array" }), "acted");
  assert.equal(acted([]), "malformed", "the same shape from an object-returning read or write is not that verb's result");
  assert.equal(acted([{ close_run_id: other }], { needsCloseRunId: true }), "malformed", "and a write cannot smuggle its run id inside an array");
  // A record where an array is owed fails the other way — the map is read in both directions.
  assert.equal(acted({ fiscal_years: [] }, { resultKind: "array" }), "malformed", "a record is not the list read's contract either");
  // The valid shapes still pass, so the gate is not simply refusing everything.
  assert.equal(acted({ fiscal_year_id: other }), "acted");
  assert.equal(acted({ close_run_id: other }, { needsCloseRunId: true }), "acted");

  // Driven through the SHIPPING read counter as well, not only the classifier: the verb's kind has
  // to reach it, or the map above is a fact nothing consults.
  const lrec = reads.newCloseRunRecord();
  reads.countIfAdmitted(lrec, { status: "acted", receipt_id: id, result: [] }, { resultKind: reads.closeResultKind("wake_list_fiscal_years") });
  assert.equal(lrec.acts, 1, "the list read's empty array is an ACT");
  reads.countIfAdmitted(lrec, { status: "acted", receipt_id: id, result: [] }, { resultKind: reads.closeResultKind("wake_propose_close") });
  assert.equal(lrec.acts, 1, "and the same shape from propose_close is not");
  assert.equal(lrec.infraFaults, 1, "it is OURS — a purported success we cannot verify");
});
