// Wave B design part3 Block L / L3 (WB-R8, AMB-10) — the wiki lint belt, DB INTEGRATION.
// Mirrors tests/sst-watch-consumer.test.mjs's "the daily SST belt issues ONE ... per
// active client" technique (the evaluate_sst_watch clone contract the design pin names):
// proves the CONSUMER WIRING end-to-end against a real migrated (0017) Postgres — the
// per-client statement shape, the WB-R1 active-only exclusion (onboarding/archived
// clients are never examined — the belt does not even enumerate them, mirroring how
// reconciler-sst.mjs's activeClientIds() only selects status='active'), a real
// created-finding transition (a wiki_synthesis_holds row — the cheapest genuine L1/L2
// condition to stage) appending exactly one domain event, a converged repeat pass
// appending NO new event while still writing a fresh lint_runs receipt, and a genuinely
// thrown per-client statement (a simulated infra fault) never poisoning the cycle.
//
// The lint FINDINGS lifecycle itself (L1-L7: dedupe/converge/supersede/recheck, the
// WB-R5 opening-TB tie watch, queue surfacing, exactly-once notification, soft caps) is
// exhaustively proven in packages/db/tests/wave-b/wb-l-lint.test.mjs against
// clara.run_client_lint/run_lint_all directly — this file proves the RUNTIME belt
// (lib/reconciler-lint.mjs) calls those fns in the right shape, not the DB semantics
// themselves.
//
// Env from the ENVIRONMENT (relay-fixtures.mjs -> lib/relay.mjs connConfig throws
// otherwise); RELAY_TEST_MODE=1; serial. Row-scoped assertions, NEVER a global-count
// equality (the rig truncate/deadlock lesson + the sst-watch-consumer precedent — a
// concurrent lane sharing the ephemeral Postgres could otherwise race a global count).
// Group-role identity (asRuntime — run_client_lint/run_lint_all are clara_runtime
// GROUP-granted, no login-direct dance, part3 L3).

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, asRuntime, opk, buildFirm, createClient, headSeq, endPool } from "./relay-fixtures.mjs";
import { reconcileLintBelt } from "../lib/reconciler-lint.mjs";

async function probe0017() {
  const r = await rootQuery(
    `select
       (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'clara' and p.proname in ('run_client_lint','run_lint_all')) as fns,
       (select count(*)::int from pg_tables where schemaname = 'clara'
         and tablename in ('lint_findings','lint_finding_events','lint_runs','wiki_synthesis_holds')) as tbls`,
  );
  return Number(r.rows[0].fns) === 2 && Number(r.rows[0].tbls) === 4;
}
const HAS17 = await probe0017();
const skip = HAS17 ? false : "0017 wave-b lint surface absent — migrate the target first";

after(async () => {
  await endPool();
});

/** Begin a client onboarding (clara.begin_client_onboarding) and leave it UNCOMMITTED —
 *  the client stays in 'onboarding' status (WB-R1), which is exactly the fixture this
 *  file needs: a client the belt must never examine. */
async function beginOnboardingClient(sub, name) {
  const r = await humanQuery(sub, "select clara.begin_client_onboarding(p_name => $1, p_op_key => $2) as r", [name, opk("onb")]);
  return r.rows[0].r.client_id;
}

/** Root-flip a client to 'archived' (the wb-fixtures.mjs rig idiom — no archive verb is
 *  in scope here; buildWaveBWorld does the same root update). */
async function archiveClient(client) {
  await rootQuery("update clara.clients set status='archived' where id=$1", [client]);
}

/** The cheapest genuine L1/L2 lint condition to stage: a raw wiki_synthesis_holds row
 *  (W9 held state — run_client_lint's FIRST condition check). A root insert, mirroring
 *  the wb-fixtures.mjs raw-FK-target idiom (rawBalancedEntry/rawOpeningItem) — this is
 *  infrastructure staging, not a books mutation, so it needs no audited writer. */
async function holdClient(firm, client, reason = "wb runtime-belt rig hold") {
  await rootQuery(
    `insert into clara.wiki_synthesis_holds (client_id, firm_id, reason) values ($1, $2, $3)
       on conflict (client_id) do nothing`,
    [client, firm, reason],
  );
}

async function latestLintRun() {
  const r = await rootQuery(
    "select id, clients_examined, clients_changed, clients_failed, through_event_seq from clara.lint_runs order by started_at desc, id desc limit 1",
  );
  return r.rows[0] ?? null;
}

test("META: 0017 lint surface present (run_client_lint/run_lint_all + the L1/L4 tables)", { skip }, async () => {
  assert.ok(HAS17);
});

test("the belt evaluates each ACTIVE client exactly once; onboarding + archived clients are NEVER examined (WB-R1); ONE receipt written LAST", { skip }, async () => {
  const { owner, client: active1 } = await buildFirm("lintbeltshape");
  const active2 = await createClient(owner, { name: `lintbeltshape_a2_${Date.now()}`, opKey: opk("cli") });
  const onboarding = await beginOnboardingClient(owner, `lintbeltshape_onb_${Date.now()}`);
  const toArchive = await createClient(owner, { name: `lintbeltshape_arch_${Date.now()}`, opKey: opk("cli") });
  await archiveClient(toArchive);

  const perClientIds = [];
  let receiptSeen = false;
  let receiptCount = 0;
  const out = await asRuntime((c) => {
    const proxy = {
      query: (sql, params) => {
        const s = String(sql);
        if (/run_lint_all/.test(s)) {
          receiptCount += 1;
          receiptSeen = true;
        } else if (/run_client_lint/.test(s)) {
          assert.equal(receiptSeen, false, "every per-client statement precedes the receipt");
          perClientIds.push(params[0]);
        }
        return c.query(sql, params);
      },
    };
    return reconcileLintBelt(proxy, { log: () => {} });
  });

  assert.equal(out.lintOk, true, "the sweep converges cleanly");
  assert.equal(receiptCount, 1, "run_lint_all (the ONLY lint_runs writer) is called exactly once, at the end");
  assert.equal(perClientIds.filter((id) => id === active1).length, 1, "active client #1 examined exactly once");
  assert.equal(perClientIds.filter((id) => id === active2).length, 1, "active client #2 examined exactly once");
  assert.ok(!perClientIds.includes(onboarding), "the onboarding client is never examined — the belt does not even enumerate it");
  assert.ok(!perClientIds.includes(toArchive), "the archived client is never examined — the belt does not even enumerate it");

  const run = await latestLintRun();
  assert.ok(run, "a lint_runs receipt exists after the belt runs");
  assert.ok(Number(run.clients_examined) >= 2, "the receipt re-examined at least our two active clients");
});

test("a real per-client transition (a wiki-synthesis hold) is caught and evented ONCE; a converged repeat pass appends NO new event but still writes a fresh receipt", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("lintbelttxn");
  void owner;
  await holdClient(firm, client);

  const seq0 = await headSeq(firm);
  const out1 = await asRuntime((c) => reconcileLintBelt(c, { log: () => {} }));
  assert.equal(out1.lintOk, true);
  assert.ok(out1.lintChanged >= 1, "the held client's condition is a real transition (changed=true)");
  const seq1 = await headSeq(firm);
  assert.ok(seq1 > seq0, "the belt's first pass appended a real lint.finding_transition domain event");
  const run1 = await latestLintRun();

  const out2 = await asRuntime((c) => reconcileLintBelt(c, { log: () => {} }));
  assert.equal(out2.lintOk, true);
  assert.equal(out2.lintChanged, 0, "the SECOND (converged) pass sees nothing new to change for this client");
  const seq2 = await headSeq(firm);
  assert.equal(seq2, seq1, "a converged pass appends NO new event (no firm_event_seq lock taken — the L3 convergence law)");

  const run2 = await latestLintRun();
  assert.notEqual(run2.id, run1.id, "a fresh lint_runs receipt is still written every cycle, converged or not");
});

test("a genuinely FAILING per-client statement (a simulated infra fault) never poisons the cycle: the rest are still evaluated and the receipt still writes", { skip }, async () => {
  const { owner, client: goodA } = await buildFirm("lintbeltfault");
  const goodB = await createClient(owner, { name: `lintbeltfault_b_${Date.now()}`, opKey: opk("cli") });

  const perClientIds = [];
  const logs = [];
  const out = await asRuntime((c) => {
    const proxy = {
      query: (sql, params) => {
        const s = String(sql);
        if (/run_client_lint/.test(s) && !/run_lint_all/.test(s)) {
          perClientIds.push(params[0]);
          // Simulate an infra fault (connection blip) for ONE specific client's statement —
          // the DB fn itself never raises (AMB-10); this proxy-level throw stands in for the
          // "thrown per-client error (infra fault)" branch reconciler-lint.mjs isolates.
          if (params[0] === goodA) return Promise.reject(new Error("simulated connection reset"));
        }
        return c.query(sql, params);
      },
    };
    return reconcileLintBelt(proxy, { log: (m) => logs.push(m) });
  });

  assert.ok(perClientIds.includes(goodA), "the faulted client was still attempted");
  assert.ok(perClientIds.includes(goodB), "the OTHER client was still evaluated — one fault never abandons the rest");
  assert.ok(logs.some((m) => m.includes(`lint client=${goodA} error:`)), "the simulated fault was logged, not swallowed silently");
  assert.equal(out.lintOk, true, "a single per-client fault is not a whole-belt failure — the cadence stays true");

  const run = await latestLintRun();
  assert.ok(run, "the receipt still writes after a per-client fault (run_lint_all's own real pass is unaffected by the proxy throw)");
});
