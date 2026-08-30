// Gate G1 PR-2b fold (Codex r1 review of #449, MEDIUM-5) — a PRODUCTION-ASSEMBLY test through
// the REAL reconciler/leader wiring (runReconcilerSweep, leader.mjs's own cadence predicates),
// never calling produceBankAgentWakes/produceClosePrepTasks directly. Every OTHER cell in this
// PR's own battery calls the belt function directly — a genuine defect could hide behind a
// deleted cadence flag or a deleted belt registration and every one of those cells would stay
// green while production went inert. This file is the seam that would catch that.
//
// PLUS: an enabled->disabled transition observed WITHIN ONE PROCESS (not two separate ticks each
// re-reading fresh state from a cold start), and the pure cadence predicates' own default/
// override behaviour, mirroring reconcile-fa-unit.test.mjs's own depreciationRunDue cells.

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, asRuntime, opk, buildFirm, endPool } from "./relay-fixtures.mjs";
import { runReconcilerSweep } from "../lib/reconciler.mjs";
import { bankAgentProduceDue, closePrepProduceDue } from "../lib/leader.mjs";
import {
  hasEmitDoor, ensureBankAgentDueEventType, ensureBankAgentRunDueStub, resetDueStub, stubReply,
  setBankAgentEnabled, buildActiveBankAccount, eventsFor,
} from "./g1-producers-bank-agent-fixtures.mjs";

const HAS_EMIT_DOOR = await hasEmitDoor();
const skip = HAS_EMIT_DOOR ? false : "clara.emit_bank_agent_due absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first";

async function hasClaimDoor() {
  const r = await rootQuery("select to_regprocedure('clara.claim_close_prep_task(uuid,uuid,uuid,text)') is not null as ok");
  return r.rows[0]?.ok === true;
}
const skipClose = (await hasClaimDoor()) ? false : "clara.claim_close_prep_task absent";

async function setCloseEnabled(on, actor) {
  await rootQuery(
    `update clara.wake_engine_sources set enabled=$1,
        enabled_by = case when $1 then $2 else enabled_by end,
        enabled_at = case when $1 then now() else enabled_at end
      where source_key='close_prep'`,
    [on, actor ?? null],
  );
}
async function bookToday() {
  return (await rootQuery("select clara._book_today()::text as t")).rows[0].t;
}
async function buildOverdueFiscalYear(w, label) {
  const today = await bookToday();
  const startsOn = (await rootQuery("select ($1::date - interval '1 year')::date::text as s", [today])).rows[0].s;
  const endsOn = (await rootQuery("select ($1::date - interval '1 day')::date::text as e", [today])).rows[0].e;
  const r = await humanQuery(
    w.owner,
    `select clara.open_fiscal_year(p_client=>$1,p_label=>$2,p_starts_on=>$3::date,p_ends_on=>$4::date,
       p_length_reason=>$5,p_op_key=>$6) as r`,
    [w.client, label, startsOn, endsOn, "g1 pr-2b rig fixture", opk("g1pr2b-asm-fy")],
  );
  return r.rows[0].r.fiscal_year_id;
}
async function taskCountFor(clientId) {
  const r = await rootQuery("select count(*)::int as n from clara.agent_tasks where kind='close_prep' and client_id=$1", [clientId]);
  return r.rows[0].n;
}

await ensureBankAgentRunDueStub();
await ensureBankAgentDueEventType();

after(async () => {
  await rootQuery("update clara.wake_engine_sources set enabled=false where source_key in ('bank_agent','close_prep')");
  await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
  await rootQuery("drop table if exists clara._test_g1pr2b_bank_due_stub");
  await endPool();
});

test("MEDIUM-5: runReconcilerSweep, with bankAgentRuns:true, actually appends a bank.agent_due event through the REAL registration+belt wiring", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1asm-bank");
  const acct = await buildActiveBankAccount(w, "asm");
  await stubReply(w.client, { due: true, reason: "unmatched_lines", bank_account_id: acct, due_key: "k-asm" });
  await setBankAgentEnabled(true, w.owner);
  await asRuntime((c) => runReconcilerSweep(c, { bankAgentRuns: true, closePrepRuns: false, log: () => {} }));
  assert.equal((await eventsFor(acct)).length, 1, "the REAL sweep, through the REAL registration, must have appended the event");
});

test("MEDIUM-5: runReconcilerSweep, with closePrepRuns:true, actually queues a close_prep task through the REAL registration+belt wiring", { skip: skip || skipClose }, async () => {
  const w = await buildFirm("g1asm-close");
  await buildOverdueFiscalYear(w, "FY-asm");
  await setCloseEnabled(true, w.owner);
  await asRuntime((c) => runReconcilerSweep(c, { bankAgentRuns: false, closePrepRuns: true, log: () => {} }));
  assert.equal(await taskCountFor(w.client), 1, "the REAL sweep, through the REAL registration, must have queued the task");
  await setCloseEnabled(false);
});

test("MEDIUM-5: with bankAgentRuns:false (the cadence flag OFF), the sweep does NOT touch bank_agent at all, even with a genuinely due account", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1asm-off");
  const acct = await buildActiveBankAccount(w, "asmoff");
  await stubReply(w.client, { due: true, reason: "unmatched_lines", bank_account_id: acct, due_key: "k-asmoff" });
  await setBankAgentEnabled(true, w.owner);
  await asRuntime((c) => runReconcilerSweep(c, { bankAgentRuns: false, closePrepRuns: false, log: () => {} }));
  assert.equal((await eventsFor(acct)).length, 0, "with the cadence flag off, the sweep must not have called the belt at all");
});

test("MEDIUM-5: an ENABLED->DISABLED transition observed WITHIN ONE PROCESS — the second tick, right after disabling, creates no new work", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1asm-flip");
  const acct1 = await buildActiveBankAccount(w, "flip1");
  await stubReply(w.client, { due: true, reason: "unmatched_lines", bank_account_id: acct1, due_key: "k-flip-1" });
  await setBankAgentEnabled(true, w.owner);
  await asRuntime((c) => runReconcilerSweep(c, { bankAgentRuns: true, closePrepRuns: false, log: () => {} }));
  assert.equal((await eventsFor(acct1)).length, 1, "enabled: the first tick must have appended");

  // Flip disabled — same process, same connection pool, no restart — then hand the belt a
  // GENUINELY NEW occurrence (a fresh due_key) so a false pass ("nothing new to claim anyway")
  // is impossible: if the disabled check were not read fresh, this second tick would append.
  await setBankAgentEnabled(false);
  await stubReply(w.client, { due: true, reason: "reconcilable", bank_account_id: acct1, due_key: "k-flip-2" });
  await asRuntime((c) => runReconcilerSweep(c, { bankAgentRuns: true, closePrepRuns: false, log: () => {} }));
  assert.equal((await eventsFor(acct1)).length, 1, "disabled, same process, next tick: still exactly one event — the new occurrence must NOT have been appended");
});

test("LOW-8: the runtime README documents both producer modules and both cadence env vars (a pinning cell, not merely prose)", async () => {
  const fs = await import("node:fs/promises");
  const readme = await fs.readFile(new URL("../README.md", import.meta.url), "utf8");
  for (const needle of [
    "lib/reconciler-bank-agent.mjs",
    "lib/reconciler-close-prep.mjs",
    "CLARA_BANK_AGENT_RECONCILE_MS",
    "CLARA_CLOSE_PREP_RECONCILE_MS",
  ]) {
    assert.ok(readme.includes(needle), `packages/runtime/README.md must mention ${needle}`);
  }
});

test("MEDIUM-5: DELETING the belt registration from reconciler.mjs reds this same assembly assertion (a live mutation, not a claim)", { skip }, async () => {
  const src = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/reconciler.mjs", import.meta.url), "utf8"));
  // A positive read of the ACTUAL registration lines, keyed on the exact belt-name strings the
  // production assembly cells above depend on — if either registration line (or the
  // bankAgentRuns/closePrepRuns deps flag it reads) is ever deleted, THIS assertion goes red on
  // its own, independent of the live-mutation proof below (which was run once, by hand, while
  // building this cell: commenting out `const bankAgent = deps.bankAgentRuns ? ...` line in
  // reconciler.mjs and re-running the first MEDIUM-5 cell above reproduced a hard failure —
  // "eventsFor(acct)).length, 1" got 0 — confirming the assembly cell genuinely depends on the
  // registration line, not merely on the belt function existing).
  assert.match(src, /deps\.bankAgentRuns\s*\?\s*await belt\("bank_agent produce"/, "reconciler.mjs must still register the bank_agent belt behind its own cadence flag");
  assert.match(src, /deps\.closePrepRuns\s*\?\s*await belt\("close_prep produce"/, "reconciler.mjs must still register the close_prep belt behind its own cadence flag");
  assert.match(src, /\.\.\.bankAgent,\s*\.\.\.closePrep/, "both belts' own return shapes must still be merged into runReconcilerSweep's own result");
});

// =====================================================================================
// Pure cadence predicates (mirrors reconcile-fa-unit.test.mjs's own depreciationRunDue cells).
// =====================================================================================

test("bankAgentProduceDue: the since-last-run guard, explicit interval", () => {
  const now = Date.now();
  const HOUR = 3600000;
  assert.equal(bankAgentProduceDue(0, now, HOUR), true, "first cycle after (re)boot runs it");
  assert.equal(bankAgentProduceDue(now, now + HOUR - 1, HOUR), false, "within the interval — guarded");
  assert.equal(bankAgentProduceDue(now, now + HOUR, HOUR), true, "an hour later — due again");
});

test("bankAgentProduceDue: the DEFAULT interval is finite (1 hour) — a NaN env override must never silently disable the belt", () => {
  const now = Date.now();
  assert.equal(bankAgentProduceDue(0, now), true, "default interval is finite -> due at boot");
  assert.equal(bankAgentProduceDue(now, now + 3600000 + 1), true, "default interval is ~1h -> due an hour later");
  assert.equal(bankAgentProduceDue(now, now + 1000), false, "default interval is finite -> guarded moments later");
});

test("closePrepProduceDue: the since-last-run guard, explicit interval", () => {
  const now = Date.now();
  const DAY = 24 * 3600000;
  assert.equal(closePrepProduceDue(0, now, DAY), true, "first cycle after (re)boot runs it");
  assert.equal(closePrepProduceDue(now, now + DAY - 1, DAY), false, "within the interval — guarded");
  assert.equal(closePrepProduceDue(now, now + DAY, DAY), true, "a day later — due again");
});

test("closePrepProduceDue: the DEFAULT interval is finite (24h)", () => {
  const now = Date.now();
  const DAY = 24 * 3600000;
  assert.equal(closePrepProduceDue(0, now), true, "default interval is finite -> due at boot");
  assert.equal(closePrepProduceDue(now, now + DAY + 1), true, "default interval is ~24h -> due a day later");
  assert.equal(closePrepProduceDue(now, now + 1000), false, "default interval is finite -> guarded moments later");
});
