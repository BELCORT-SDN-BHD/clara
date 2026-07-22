// Wave A2.1 — the sst-watch consumer (lib/sst-watch.mjs), DB INTEGRATION. Proves the consumer
// reads real entry.approved events, invokes the group-granted clara.evaluate_sst_watch (which
// writes a real compliance_watch), converges its own checkpoint, stays independent of the
// router, and reports health. The evaluator's watch logic itself is exhaustively proven in
// packages/db/tests/a21-watch*.test.mjs — here we prove the CONSUMER WIRING end-to-end.
//
// A future-method attestation (record_future_attestation) is the cheap, deterministic way to
// give the evaluator a group to evaluate WITHOUT the full books ceremony — the attestation
// puts 'G' into the evaluated groups, so evaluate_sst_watch writes a 'monitored' watch. Events
// are produced only through audited writers / _append_event (never a raw books/event insert).
//
// Env from the ENVIRONMENT (rig.mjs throws otherwise); RELAY_TEST_MODE=1; serial. Row-scoped
// assertions, NEVER TRUNCATE (the truncate/deadlock law). Group-role identity (asRuntime — this
// consumer has NO login dance).

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, asRuntime, asFnOwner, opk, buildFirm, headSeq, checkpointSeq, deadLettersForFirm, endPool } from "./relay-fixtures.mjs";
import { runSstWatchCycle, sstWatchHealth, sstWatchRedrive, CONSUMERS, SST_WATCH_CONSUMER, SST_WATCH_EVENT_TYPE } from "../lib/sst-watch.mjs";

async function probe0016() {
  const r = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname in ('evaluate_sst_watch','evaluate_sst_watches_all','record_future_attestation')`,
  );
  return Number(r.rows[0].n) === 3;
}
const HAS16 = await probe0016();
const skip = HAS16 ? false : "0016 SST-watch surface absent — migrate the target first";

after(async () => {
  await endPool();
});

// A future-method attestation above the 'G' threshold (RM 500,000 = 50,000,000 cents), valid
// (expires in the future) — enough for the evaluator to evaluate group 'G' and write a watch.
async function attestFutureMethod(owner, firm, client) {
  await humanQuery(
    owner,
    `select clara.record_future_attestation(p_client=>$1,p_service_group=>$2,p_expected_cents=>$3,
       p_horizon_start=>$4::date,p_evidence=>$5,p_expires_at=>$6::date,p_op_key=>$7) as r`,
    [client, "G", 60000000, "2026-07-01", "sst-watch rig attestation", "2027-12-31", opk("att")],
  );
}

// Emit ONE real entry.approved (client-scoped) via the audited _append_event helper (never a raw
// domain_events insert). Returns { seq, eventId }.
async function emitEntryApproved(firm, client, actor) {
  return asFnOwner(async (c) => {
    const s = await c.query(
      "select clara._append_event($1,'entry.approved',$2,$3,null,null,null,null,null,'{}'::jsonb) as seq",
      [firm, client, actor],
    );
    const seq = Number(s.rows[0].seq);
    const e = await c.query("select id from clara.domain_events where firm_id=$1 and seq=$2", [firm, seq]);
    return { seq, eventId: e.rows[0].id };
  });
}

// Drive the sst-watch consumer to convergence (the evaluator emits compliance.watch_transition,
// which grows head — the consumer then walks past that non-target event, like drainMatcher).
async function drainSstWatch(firm) {
  return asRuntime(async (c) => {
    for (let i = 0; i < 30; i++) {
      await runSstWatchCycle(c, { onlyFirm: firm, batchSize: 50 });
      if ((await checkpointSeq(firm, SST_WATCH_CONSUMER)) === (await headSeq(firm))) return;
    }
    throw new Error(`drainSstWatch: firm ${firm} did not converge to head`);
  });
}

const watchesFor = (client) =>
  rootQuery("select count(*)::int as n from clara.compliance_watches where client_id=$1 and watch_kind='sst_registration'", [client]).then(
    (r) => Number(r.rows[0].n),
  );

test("cycle: processes entry.approved → evaluate_sst_watch writes a compliance_watch; the checkpoint converges to head", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("sstc");
  await attestFutureMethod(owner, firm, client);
  await emitEntryApproved(firm, client, owner);

  await drainSstWatch(firm);

  assert.equal(await checkpointSeq(firm, SST_WATCH_CONSUMER), await headSeq(firm), "sst_watch checkpoint converged to firm head");
  assert.ok((await watchesFor(client)) >= 1, "the evaluator wrote a compliance_watch for the client (the consumer invoked it)");
  assert.equal((await deadLettersForFirm(firm, SST_WATCH_CONSUMER)).length, 0, "no sst_watch dead-letters — a clean evaluator run");
});

test("cycle: a firm with ONLY non-target events advances the checkpoint without invoking the evaluator", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("sstc");
  await attestFutureMethod(owner, firm, client);
  // buildFirm emitted firm/client creation events (non-target) but NO entry.approved.
  const before = await watchesFor(client);
  await drainSstWatch(firm);
  assert.equal(await checkpointSeq(firm, SST_WATCH_CONSUMER), await headSeq(firm), "checkpoint walked to head over non-target events");
  assert.equal(await watchesFor(client), before, "no watch written when there is no entry.approved to evaluate");
});

test("checkpoints are independent: the router pointer is untouched by an sst_watch run", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("sstc");
  await attestFutureMethod(owner, firm, client);
  await emitEntryApproved(firm, client, owner);
  await drainSstWatch(firm);
  assert.equal(await checkpointSeq(firm, SST_WATCH_CONSUMER), await headSeq(firm), "sst_watch reached head");
  assert.equal(await checkpointSeq(firm, "router"), null, "the router's own pointer is untouched (it never ran)");
});

test("redrive: a seeded sst_watch dead-letter re-runs the evaluator and resolves", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("sstc");
  await attestFutureMethod(owner, firm, client);
  const { eventId } = await emitEntryApproved(firm, client, owner);
  // Seed a dead-letter row for the entry.approved event (the relay stamping trigger derives
  // firm/seq/type). A raw relay-infra seed — never a books/event insert.
  await rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
       values ($1, $2, 'rig-seeded', null)`,
    [SST_WATCH_CONSUMER, eventId],
  );
  const res = await asRuntime((c) => sstWatchRedrive(c, eventId));
  assert.deepEqual({ resolved: res.resolved, consumer: res.consumer }, { resolved: true, consumer: SST_WATCH_CONSUMER });
  const dl = (await deadLettersForFirm(firm, SST_WATCH_CONSUMER)).find((d) => d.eventId === eventId);
  assert.equal(dl.status, "resolved", "the dead-letter is marked resolved");
  assert.ok((await watchesFor(client)) >= 1, "the evaluator ran on redrive (a watch exists)");
});

test("redrive refuses when there is no sst_watch dead-letter (a never-dead-lettered event is never resolved)", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("sstc");
  const { eventId } = await emitEntryApproved(firm, client, owner);
  await assert.rejects(() => asRuntime((c) => sstWatchRedrive(c, eventId)), /no dead-letter for consumer='sst_watch'/);
});

test("registry + health: the sst_watch entry is group-runtime and health reports lag/dead-letters", { skip }, async () => {
  assert.equal(CONSUMERS.sst_watch.name, SST_WATCH_CONSUMER);
  assert.equal(CONSUMERS.sst_watch.identity, "runtime-role", "sst_watch redrive needs only the runtime role (a plain group call)");
  assert.equal(SST_WATCH_EVENT_TYPE, "entry.approved");
  const h = await asRuntime((c) => sstWatchHealth(c));
  assert.equal(h.consumer, SST_WATCH_CONSUMER);
  assert.equal(typeof h.lag, "number");
  assert.equal(typeof h.pendingDeadLetters, "number");
  assert.ok(h.lag >= 0 && h.pendingDeadLetters >= 0);
});
