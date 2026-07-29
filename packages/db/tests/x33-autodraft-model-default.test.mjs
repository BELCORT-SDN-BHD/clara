// Migration 0033 -- ledger #44 (GitHub #42): clara.request_autodraft's one-click
// default fell back to a Vercel-AI-Gateway-shaped id ('openai/gpt-5-mini') that this
// runtime's @ai-sdk/openai provider cannot resolve -- confirmed live: the FIRST
// production one-click autodraft run died with `AI_APICallError: The requested model
// 'openai/gpt-5-mini' does not exist.` (decoded off workflow.workflow_stream_chunks,
// run wrun_01KYP1D0V61F9XS1Y4Z66GX10Z). The fix corrects the fallback to
// 'gpt-5.6-terra', the SAME bare id the sweep admission path has always used
// (packages/runtime/lib/autodraft.mjs's SWEEP_MODEL) -- no application code anywhere
// ever sets the clara.autodraft_model GUC this fallback exists for, so the default is
// the ENTIRE story for one-click.
//
// READY-reachability caveat (the wave-a-admission.test.mjs convention, unchanged
// here): primeReadyFiling maximizes the chance of reaching the coding lane's 'ready'
// state but cannot guarantee it -- the READY predicate is definer-internal and has
// been recut three times, most recently by 0031's vendor-binding unification (x31.a
// needed a full signed EZSEC-shaped binding to reach ready; that machinery is 0031's
// own domain, unrelated to this migration's one-line default-string fix, and is
// deliberately NOT duplicated here).
//   x33.a -- the UNCONDITIONAL, catalog-level regression guard: the deployed function
//            body itself, read straight from pg_proc, never a fixture. Always runs.
//   x33.b -- drives a real one-click admission end-to-end WHEN primeReadyFiling
//            reaches ready, and records a finding (not a failure) otherwise, exactly
//            like wave-a-admission.test.mjs's own established convention for this
//            fixture's known limitation.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, noteLane, skipUnready, waveAEnsureReady,
  buildWorld, upsertPayableAccount, upsertAccountClassed, primeReadyFiling, requestAutodraft,
} from "./wave-a-fixtures.mjs";

async function has33() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0033_autodraft_model_default'",
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

let ready = false;
let world = null;
before(async () => {
  ready = (await waveAEnsureReady()) && (await has33());
  if (ready) {
    world = await buildWorld();
    await upsertPayableAccount(world.users.alice, { client: world.clients.A1, code: "400-000", name: "Trade Creditors", opKey: opk("x33-ap") });
    await upsertAccountClassed(world.users.alice, { client: world.clients.A1, code: "500-A01", name: "Prof Fees", type: "expense", opKey: opk("x33-exp") });
  }
});
after(async () => { printLaneNotes("x33-autodraft-model-default"); await endPool(); });

test("x33.a clara.request_autodraft's deployed source carries the corrected default and NEVER the broken gateway-shaped id (catalog-level, unconditional)", async () => {
  const src = (await rootQuery(
    "select pg_get_functiondef('clara.request_autodraft(uuid)'::regprocedure) as src",
  )).rows[0]?.src;
  assert.ok(src, "clara.request_autodraft(uuid) must exist");
  assert.doesNotMatch(src, /openai\/gpt-5-mini/, "the broken gateway-shaped default id must never reappear in the deployed source");
  assert.match(src, /'gpt-5\.6-terra'/, "the corrected bare-id default must be present, matching the sweep path");
});

test("x33.b a real one-click admission stamps model_snapshot='gpt-5.6-terra' -- never the broken gateway-shaped id", async (t) => {
  if (skipUnready(t, ready, "Wave-A daily loop / 0033 not present")) return;
  const rf = await primeReadyFiling(world.users.alice, {
    client: world.clients.A1,
    vendorName: "X33READYCO SDN BHD",
    registration: "201801009900",
  });
  const admitted = await requestAutodraft(world.users.bob, { filing: rf.filingId });
  if (admitted.outcome !== "admitted" || !admitted.task_id) {
    noteLane(`x33.b FINDING(candidate): primeReadyFiling did not reach READY -- one-click admit outcome=${JSON.stringify(admitted)} -- the catalog-level x33.a cell above still proves the fix`);
    return;
  }
  const row = (await rootQuery(
    "select model_snapshot from clara.agent_tasks where id=$1",
    [admitted.task_id],
  )).rows[0];
  assert.equal(
    row.model_snapshot,
    "gpt-5.6-terra",
    "the one-click admission must snapshot the SAME bare model id the sweep path uses -- never the broken gateway-shaped default",
  );
});
