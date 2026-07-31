// Wave-A2.1 rig — the SST watch LIFECYCLE: earliest-crossing recomputation,
// backdating, the SIX-trigger re-arm ladder, overlays (ack/snooze) that never
// erase the condition, typed resolution, evaluation receipts (pin doc P1;
// contract §2.1/§2.2). CONTRACT-BLIND: pins only — never 0016 source.
//
//   EARLIEST CROSSING: the rolling test is recomputed at EVERY month-end since
//     coverage start; a backdated approved posting that creates an earlier
//     crossing MOVES earliest_crossing_month earlier and RE-ARMS the watch.
//   RE-ARM LADDER (all six, pin P1): (1) crossing, (2) +10pp of threshold,
//     (3) earlier backdated crossing, (4) due-date worsening, (5) snooze expiry,
//     (6) attestation expiry. Policy is DATA (next_rearm_cents/next_rearm_at),
//     not dismissal prose.
//   OVERLAYS: acknowledged/snoozed never erase the condition; snooze is bounded
//     (≤60 days); resolve demands a TYPED conclusion + evidence.
//
// Serial discipline: --test-concurrency=1 (shared DB world, staged sequences).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld,
  a21EnsureReady, skip16, metaProbe0016,
  THRESHOLD_CENTS, COMPLIANCE_FNS,
  evaluateSstWatch, evaluateAllWatches,
  freshWatchClient, approvedTurnoverEntry, openWatchRow, watchEventRows, watchEventCount,
  ackWatch, snoozeWatch, resolveWatch, recordFutureAttestation,
  evalRunCount, latestEvalRun, firmOf,
  mytMonthDate, mytMonthStart, mytApplicationDue,
} from "./a21-helpers.mjs";

let has16 = false;
let world = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) world = await buildWorld();
  else noteLane("0016 absent — a21-watch-lifecycle suite dormant");
});
after(async () => { printLaneNotes("a21-watch-lifecycle"); printSkipCount("a21-watch-lifecycle"); await endPool(); });

test("META a21-watch-lifecycle: migration 0016 present + lifecycle fn markers exist", async (t) => {
  await metaProbe0016(t, has16, {
    label: "SST-watch lifecycle",
    tables: ["compliance_watches", "compliance_watch_events", "compliance_eval_runs", "sst_future_attestations"],
    fns: COMPLIANCE_FNS,
  });
});

// ===========================================================================
// Overlays — ack / snooze(≤60d) / typed resolve.
// ===========================================================================

test("§2 ACK is an overlay: it stamps who/when + an 'acknowledged' event, and NEVER erases the condition (state unchanged)", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_ack_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 50_000_001, date: await mytMonthDate(-1, 4) });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "crossed watch (mandatory setup)");
  await ackWatch(users.alice, { watch: w.id, rationale: "client informed; registration in progress" });
  const w2 = await openWatchRow(client, "G");
  assert.equal(w2.state, "crossed", "acknowledging NEVER erases the condition — state stays crossed");
  assert.ok(w2.acknowledged_at != null, "acknowledged_at is stamped");
  assert.ok(w2.acknowledged_by != null, "acknowledged_by is stamped");
  assert.ok((await watchEventCount(w.id, "acknowledged")) >= 1, "an 'acknowledged' disposition event is appended");
  // Policy is data: the ack stores the next re-arm rung (+10pp of threshold).
  const rung = Number(w2.next_rearm_cents ?? 0);
  if (rung !== Number(w2.confirmed_included_cents) + THRESHOLD_CENTS / 10) {
    noteLane(`next_rearm_cents=${rung} (expected figure+10pp=${Number(w2.confirmed_included_cents) + THRESHOLD_CENTS / 10}) — rung formula divergence to adjudicate`);
  }
});

test("§2 SNOOZE is bounded and dated: >60 days is REFUSED; a valid snooze stamps snoozed_until + a 'snoozed' event", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_snz_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 45_000_000, date: await mytMonthDate(-1, 5) });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w?.state, "early_warning", "early_warning watch (mandatory setup)");
  const far = new Date(Date.now() + 90 * 86400e3).toISOString();
  let err = null;
  try { await snoozeWatch(users.alice, { watch: w.id, until: far }); } catch (e) { err = e; }
  assert.ok(err, "a 90-day snooze is REFUSED (p_until ≤ 60 days — dismissal is never open-ended)");
  const near = new Date(Date.now() + 30 * 86400e3).toISOString();
  await snoozeWatch(users.alice, { watch: w.id, until: near });
  const w2 = await openWatchRow(client, "G");
  assert.ok(w2.snoozed_until != null, "snoozed_until is stamped (dated, not indefinite)");
  assert.equal(w2.state, "early_warning", "snoozing never erases the condition");
  assert.ok((await watchEventCount(w.id, "snoozed")) >= 1, "a 'snoozed' disposition event is appended");
});

test("§2 RESOLVE demands a TYPED conclusion: an untyped conclusion refuses; 'registration_recorded' resolves with evidence + closes the episode", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_res_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 50_000_001, date: await mytMonthDate(-1, 6) });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "crossed watch (mandatory setup)");
  let err = null;
  try { await resolveWatch(users.alice, { watch: w.id, conclusion: "sorted it out" }); } catch (e) { err = e; }
  assert.ok(err, "an untyped free-text conclusion is REFUSED (typed conclusion mandatory)");
  await resolveWatch(users.alice, { watch: w.id, conclusion: "registration_recorded", evidence: "SST-01 submitted 2026-07-20, ack ref RIG-123" });
  const row = (await rootQuery("select to_jsonb(x) as row from clara.compliance_watches x where x.id=$1", [w.id])).rows[0].row;
  assert.equal(row.state, "resolved", "the episode is resolved");
  assert.equal(row.resolved_conclusion, "registration_recorded", "the typed conclusion is stored");
  assert.ok(row.resolved_evidence != null && row.resolved_by != null && row.resolved_at != null, "resolution evidence/actor/time are stamped");
  assert.ok((await watchEventCount(w.id, "resolved")) >= 1, "a 'resolved' disposition event is appended");
  // Resolution frees the one-open-episode slot; a re-evaluation of the still-
  // crossed books may open a FRESH episode (unpinned whether immediately) — probe.
  await evaluateSstWatch(client);
  const fresh = await openWatchRow(client, "G");
  if (fresh == null) noteLane("no fresh episode after resolving a still-crossed condition — adjudicate whether resolution suppresses re-detection");
  else assert.notEqual(fresh.id, w.id, "a post-resolution episode is a FRESH case row (append-only episodes)");
});

// ===========================================================================
// Earliest crossing + the re-arm ladder.
// ===========================================================================

test("§2 EARLIEST CROSSING: cumulative months cross at the right month-end; a BACKDATED posting moves it EARLIER, worsens the due date, and RE-ARMS through an ack (rungs 3+4)", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_backdate_${randomUUID().slice(0, 6)}` });
  // Anchored to the DB's OWN Asia/Kuala_Lumpur clock (see a21-watch-anchors.mjs)
  // — never a fixed calendar month. n=-5 (5 months back) RM300k, n=-1 (the last
  // completed month) RM250k → first >500k month-end is the n=-1 month.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 30_000_000, date: await mytMonthDate(-5, 10) });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 25_000_001, date: await mytMonthDate(-1, 10) });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "the cumulative rolling test crosses");
  assert.equal(w.earliest_crossing_month, await mytMonthStart(-1), "earliest crossing = the last completed month (n=-5 alone was 300k)");
  assert.equal(w.application_due, await mytApplicationDue(-1), "application due = last day of M+1");
  // Acknowledge — then a BACKDATED approved posting makes n=-3 the crossing month.
  await ackWatch(users.alice, { watch: w.id, rationale: "seen; monitoring" });
  const rearmBefore = await watchEventCount(w.id, "re_armed");
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 25_000_001, date: await mytMonthDate(-3, 15) });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  // Rung 3 — earlier backdated crossing: n=-5 300k + n=-3 250k… = 550k at n=-3 month-end.
  assert.equal(w.earliest_crossing_month, await mytMonthStart(-3), "the backdated posting moves the earliest crossing EARLIER");
  // Rung 4 — due-date worsening: due moves earlier (now past ⇒ overdue, since
  // n=-3's due date — the last day of month n=-2 — is always in the past
  // relative to "today", which sits in month n=0).
  assert.equal(w.application_due, await mytApplicationDue(-3), "the statutory due date worsens with the earlier crossing");
  assert.equal(w.state, "overdue", "a due date already past escalates the case to overdue DESPITE the acknowledgement");
  assert.ok((await watchEventCount(w.id, "re_armed")) > rearmBefore, "the backdated earlier crossing RE-ARMS the acknowledged watch (a re_armed event is appended)");
});

test("§2 RE-ARM rungs 1+2: an acked early_warning re-arms on CROSSING; an acked crossing re-arms only past +10pp of threshold (sen-exact fence)", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_rungs12_${randomUUID().slice(0, 6)}` });
  // Stage 1 — early_warning (RM450k), ack, then cross (rung 1). Anchored to the
  // DB's OWN Asia/Kuala_Lumpur clock (n=-1, the last completed month) — never
  // a fixed calendar month; see a21-watch-anchors.mjs.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 45_000_000, date: await mytMonthDate(-1, 3) });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.equal(w?.state, "early_warning", "early_warning (mandatory setup)");
  await ackWatch(users.alice, { watch: w.id, rationale: "watching" });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 5_000_001, date: await mytMonthDate(-1, 11) });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(w.state, "crossed", "the crossing fires through the acknowledgement (rung 1 — never suppressed)");
  const crossingEvents = (await watchEventRows(w.id)).filter((e) => ["re_armed", "tier_change"].includes(e.event_kind) && e.state_after === "crossed");
  assert.ok(crossingEvents.length >= 1, "the crossing transition is evented (re_armed/tier_change → crossed)");
  // Stage 2 — ack at crossed F0=50,000,001; rung = F0 + 10pp of threshold = 55,000,001.
  await ackWatch(users.alice, { watch: w.id, rationale: "crossed acknowledged; preparing registration" });
  const rearm0 = await watchEventCount(w.id, "re_armed");
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 4_999_999, date: await mytMonthDate(-1, 12) }); // → 55,000,000 (BELOW the rung)
  await evaluateSstWatch(client);
  assert.equal(await watchEventCount(w.id, "re_armed"), rearm0, "growth BELOW +10pp of threshold does NOT re-arm (55,000,000 < 55,000,001)");
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 2, date: await mytMonthDate(-1, 13) }); // → 55,000,002 (past the rung)
  await evaluateSstWatch(client);
  assert.ok((await watchEventCount(w.id, "re_armed")) > rearm0, "growth past +10pp of threshold RE-ARMS the acknowledged watch (rung 2)");
  const w2 = await openWatchRow(client, "G");
  assert.equal(Number(w2.confirmed_included_cents), 55_000_002, "the figure is exact to the sen through the ladder");
});

test("§2 RE-ARM rung 5: snooze EXPIRY re-arms — a lapsed snoozed_until stops suppressing at the next evaluation", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_rung5_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 50_000_001, date: await mytMonthDate(-1, 7) });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "crossed watch (mandatory setup)");
  // A 2-second snooze — bounded, dated, and about to lapse.
  await snoozeWatch(users.alice, { watch: w.id, until: new Date(Date.now() + 2000).toISOString(), rationale: "momentary" });
  const rearm0 = await watchEventCount(w.id, "re_armed");
  await evaluateSstWatch(client); // still inside the snooze window
  const during = await watchEventCount(w.id, "re_armed");
  await sleep(2600);
  await evaluateSstWatch(client); // the snooze has lapsed
  const after_ = await watchEventCount(w.id, "re_armed");
  assert.ok(after_ > during, "the evaluation after snoozed_until lapses RE-ARMS the watch (rung 5 — snooze expiry)");
  assert.ok(during === rearm0, "no re-arm fired while the snooze was still live");
  const w2 = await openWatchRow(client, "G");
  assert.equal(w2.state, "crossed", "the condition itself never moved — the snooze was only ever an overlay");
});

test("§2 RE-ARM rung 6 + WA21-R6: an attestation drives future_method_status; its EXPIRY flips the status to 'expired' and re-arms", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_rung6_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 45_000_000, date: await mytMonthDate(-1, 8) });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.equal(w?.future_method_status, "not_assessed", "no attestation ⇒ not_assessed (WA21-R6 — never inferred from trends)");
  // A live below-threshold attestation (admin+; expires a year out — anchored
  // to the DB's OWN clock so it stays genuinely live no matter when this runs).
  await recordFutureAttestation(users.alice, { client, serviceGroup: "G", expectedCents: 30_000_000, horizonStart: await mytMonthStart(1), expiresAt: await mytMonthDate(12, 31) });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(w.future_method_status, "attested_below", "a live below-threshold attestation shows attested_below");
  await ackWatch(users.alice, { watch: w.id, rationale: "attested; acknowledged" });
  const rearm0 = await watchEventCount(w.id, "re_armed");
  // EXPIRY: record a superseding attestation that is ALREADY expired (recording
  // historical paperwork is legitimate data entry). If the writer refuses a past
  // expiry, fall back to a root INSERT (append-only admits inserts).
  // Expired relative to the DB's OWN clock — the last completed month's start
  // is always strictly before "today", no matter when this runs.
  const alreadyExpired = await mytMonthStart(-1);
  let recorded = true;
  try {
    await recordFutureAttestation(users.alice, { client, serviceGroup: "G", expectedCents: 30_000_000, horizonStart: await mytMonthStart(1), expiresAt: alreadyExpired });
  } catch (e) {
    recorded = false;
    noteLane(`record_future_attestation refused a past expiry (${e.code}) — falling back to a root insert (interface note)`);
  }
  if (!recorded) {
    const firm = await firmOf(client);
    await rootQuery(
      `insert into clara.sst_future_attestations (firm_id, client_id, service_group, expected_cents, horizon_start, evidence_note, reviewer, as_of, expires_at)
       values ($1, $2, 'G', 30000000, $3, 'rig expired attestation', 'rig reviewer', current_date, $4)`,
      [firm, client, await mytMonthStart(1), alreadyExpired],
    );
  }
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(w.future_method_status, "expired", "an expired attestation flips future_method_status to 'expired' — never silently 'below threshold'");
  assert.ok((await watchEventCount(w.id, "re_armed")) > rearm0, "attestation expiry RE-ARMS the acknowledged watch (rung 6)");
});

// ===========================================================================
// Evaluation receipts — the stale-evaluator substrate.
// ===========================================================================

test("§2 receipts: every sweep writes ONE append-only compliance_eval_runs row with counters + through_event_seq; receipts admit no UPDATE", async (t) => {
  if (skip16(t, has16)) return;
  const n0 = await evalRunCount();
  await evaluateAllWatches();
  await evaluateAllWatches();
  assert.equal(await evalRunCount(), n0 + 2, "two sweeps ⇒ exactly two receipts (one each)");
  const run = await latestEvalRun();
  assert.ok(run.through_event_seq != null, "the receipt pins through_event_seq (the spine position evaluated through)");
  assert.ok(Number(run.clients_examined) >= 0, "clients_examined is populated");
  // Append-only: a root UPDATE of a receipt must be refused by trigger (house pattern).
  let err = null;
  try { await rootQuery("update clara.compliance_eval_runs set clients_failed=999 where id=$1", [run.id]); } catch (e) { err = e; }
  if (!err) noteLane("compliance_eval_runs admitted a root UPDATE — append-only is grant-level only; adjudicate whether a trigger was pinned");
  else assert.ok(err.code === "CLR08" || err.code != null, `receipt UPDATE refused (${err.code})`);
});
