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

  // (2b) AND THE SHIPPING CATCH BLOCK ACTUALLY CONSULTS IT. The two checks above are pure — they
  // would both still pass against a body that rethrew unconditionally, because neither reaches the
  // stream's own catch. No cell in this repo can execute that catch (it needs a real model stream
  // inside a real WDK step), so the branch is pinned by READING THE SHIPPING SOURCE, exactly as
  // G1B-I11 pins the attempt key's missing clock. Named as a source pin rather than dressed up as
  // behaviour.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  for (const [file, guard] of [
    ["bankAgent.v1.impl.ts", /if \(!hadToolActivity\(rec\)\) throw err;/],
    ["closePrep.v1.impl.ts", /if \(rec\.toolCalls > 0\) \{/],
  ]) {
    const src = readFileSync(fileURLToPath(new URL(`../workflows/${file}`, import.meta.url)), "utf8");
    const start = src.indexOf("catch (err) {");
    const body = src.slice(start, src.indexOf("} finally {", start));
    assert.match(body, guard, `${file}: the stream catch must gate its rethrow on tool activity`);
    assert.match(body, /streamFault = true/, `${file}: and latch the fault onto this attempt's own record`);
    assert.match(body, /return \{ outcome: classify/, `${file}: returning an outcome THIS attempt settles`);
  }

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
});
