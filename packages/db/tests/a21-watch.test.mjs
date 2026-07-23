// Wave-A2.1 rig — the SST registration-watch DATA PLANE + evaluator arithmetic
// (pin doc P1/P6/P7; contract §2.1/§2.4). CONTRACT-BLIND: written from the pins
// ONLY — never 0016 source. The load-bearing invariants:
//
//   BOUNDARY (statutory "exceeds"): a rolling-12-month included sum of EXACTLY
//     RM 500,000.00 is NOT crossed; RM 500,000.01 IS. Tier ladder monitored →
//     early_warning at ≥80% (RM 400,000.00 exactly IS early_warning).
//   TRI-STATE default: a MISSING client_turnover_accounts row buckets the account
//     as unknown_or_mixed — surfaced, never silently excluded, never confirmed.
//   SEPARATE figures: confirmed-included / unknown_or_mixed / all-income screening
//     proxy are three DISTINCT figures (never summed into one).
//   PER-GROUP: G and I never aggregate — 300k+300k across two groups crosses nothing.
//   COVERAGE: opening-balance entries are excluded from observed turnover and flip
//     the coverage flag; future-dated entries excluded; a reversal mirror nets out;
//     is_year_end is excluded ONLY with the closing_transfer marker (P7).
//   P6 must-nots: no open_questions writes from any compliance fn; no watch logic
//     in _approve_entry_core; the agent role holds ZERO EXECUTE anywhere new;
//     evaluator failure is exception-isolated (never blocks a sweep or an approval).
//
// Serial discipline: run under --test-concurrency=1 (shared DB world).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, opk,
  a21EnsureReady, skip16, metaProbe0016,
  A21_TABLES, COMPLIANCE_FNS, A21_NEW_FNS, A21_EVENT_TYPES, THRESHOLD_CENTS,
  WATCH_STATES, FM_STATUSES, RESOLVED_CONCLUSIONS, TRI_STATE,
  evaluateSstWatch, evaluateAllWatches,
  freshWatchClient, approvedTurnoverEntry, openWatchRow, latestEvalRun, evalRunCount,
  ackWatch,
  CASH, INC, INC2, INC_I,
  checkDefs, uniqueIndexDefs, rlsFlags, roleCanExecute, fnSource,
  reverseEntry, draftEntryV3, approveEntry, freshResolution,
} from "./a21-helpers.mjs";

let has16 = false;
let world = null;

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) world = await buildWorld();
  else noteLane(ready.base ? "0016 absent — a21-watch suite dormant" : "base surface absent — a21-watch suite dormant");
});
after(async () => { printLaneNotes("a21-watch"); printSkipCount("a21-watch"); await endPool(); });

// ===========================================================================
// META — the integration flip-on probe (work-order requirement).
// ===========================================================================

test("META a21-watch: migration 0016 present + the SST-watch data plane markers exist", async (t) => {
  await metaProbe0016(t, has16, {
    label: "SST-watch data plane",
    tables: A21_TABLES,
    fns: COMPLIANCE_FNS,
  });
});

// ===========================================================================
// Structural — tables, seeds, CHECK vocabularies, index, grants.
// ===========================================================================

test("P1 the six compliance tables are RLS + FORCE RLS; the append-only three carry no app-role UPDATE/DELETE grant", async (t) => {
  if (skip16(t, has16)) return;
  for (const tbl of A21_TABLES) {
    const f = await rlsFlags(tbl);
    assert.ok(f, `clara.${tbl} exists`);
    assert.ok(f.rls && f.force, `clara.${tbl} is RLS + FORCE RLS (per-firm like siblings)`);
  }
  // INTEGRATION (CLASS T): append-only-at-the-grant-level means no LANE role
  // (authenticated/agent/wake/runtime) holds a write grant. The table OWNER is
  // clara_fn_owner (the 0011/0015 sibling idiom — audit_log/domain_events are
  // identical): owner privileges are implicit Postgres ownership, carried by the
  // DEFINER writers, and excluded from this probe.
  for (const tbl of ["sst_future_attestations", "compliance_watch_events", "compliance_eval_runs"]) {
    const g = await rootQuery(
      `select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
         cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
         join pg_roles r on r.oid=a.grantee
        where n.nspname='clara' and c.relname=$1 and r.rolname like 'clara_%'
          and r.rolname <> 'clara_fn_owner'
          and a.privilege_type in ('UPDATE','DELETE','TRUNCATE')`,
      [tbl],
    );
    assert.equal(g.rows[0].n, 0, `clara.${tbl} is append-only at the grant level (no lane-role UPDATE/DELETE)`);
    const owner = await rootQuery(
      "select r.rolname from pg_class c join pg_roles r on r.oid=c.relowner join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1",
      [tbl],
    );
    assert.equal(owner.rows[0].rolname, "clara_fn_owner", `clara.${tbl} is clara_fn_owner-owned (the DEFINER-writer idiom)`);
  }
});

test("P1 sst_threshold_schedule is seeded G + I at 50,000,000¢ effective 2018-09-01, and NO firm-editable writer exists", async (t) => {
  if (skip16(t, has16)) return;
  const rows = (await rootQuery("select service_group, threshold_cents::bigint as c, effective_from::text as ef, effective_to, source_note from clara.sst_threshold_schedule order by service_group, effective_from")).rows;
  for (const g of ["G", "I"]) {
    const row = rows.find((x) => x.service_group === g && x.ef === "2018-09-01");
    assert.ok(row, `schedule row ('${g}', effective 2018-09-01) is seeded`);
    assert.equal(Number(row.c), THRESHOLD_CENTS, `group ${g} threshold is exactly RM500k in cents`);
    assert.equal(row.effective_to, null, `group ${g} seed row is open-ended`);
    assert.ok((row.source_note ?? "").length > 0, `group ${g} seed cites its source (source_note)`);
  }
  // No LANE-role write grant on the table (system-maintained, migration-shipped).
  // INTEGRATION (CLASS T): the table owner clara_fn_owner is excluded — owner
  // privileges are implicit Postgres ownership (the sibling idiom); the firm-lane
  // prosrc probe below proves no GRANTED fn writes it either.
  const g = await rootQuery(
    `select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
       join pg_roles r on r.oid=a.grantee
      where n.nspname='clara' and c.relname='sst_threshold_schedule' and r.rolname like 'clara_%'
        and r.rolname <> 'clara_fn_owner'
        and a.privilege_type in ('INSERT','UPDATE','DELETE')`,
  );
  assert.equal(g.rows[0].n, 0, "no lane role can write sst_threshold_schedule directly");
  // No GRANTED clara fn writes it (grep-assert over prosrc of granted fns).
  const writers = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara'
        and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+(clara\\.)?sst_threshold_schedule'
        and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      join pg_roles r on r.oid=a.grantee
                     where r.rolname in ('clara_authenticated','clara_agent_ro','clara_wake_interactive','clara_wake_proactive')
                       and a.privilege_type='EXECUTE')`,
  );
  assert.equal(writers.rows.length, 0, `no firm-lane fn writes the schedule (found: ${writers.rows.map((x) => x.proname).join(",")})`);
});

test("P1 CHECK vocabularies: tri-state classification, watch states, event kinds, future-method, typed conclusions; one-open-episode partial unique", async (t) => {
  if (skip16(t, has16)) return;
  const cta = await checkDefs("client_turnover_accounts");
  for (const v of TRI_STATE) assert.ok(cta.includes(`'${v}'`), `client_turnover_accounts CHECK admits '${v}'`);
  const uq = await uniqueIndexDefs("client_turnover_accounts");
  assert.ok(
    uq.some((d) => /client_id/.test(d) && /account_code/.test(d) && /effective_from/.test(d)),
    `client_turnover_accounts UNIQUE(client, account_code, effective_from) exists (got: ${uq.join(" ~~ ").slice(0, 200)})`,
  );
  const cw = await checkDefs("compliance_watches");
  for (const v of WATCH_STATES) assert.ok(cw.includes(`'${v}'`), `compliance_watches state CHECK admits '${v}'`);
  assert.ok(cw.includes("'sst_registration'"), "watch_kind CHECK admits 'sst_registration'");
  for (const v of FM_STATUSES) assert.ok(cw.includes(`'${v}'`), `future_method_status CHECK admits '${v}'`);
  for (const v of RESOLVED_CONCLUSIONS) assert.ok(cw.includes(`'${v}'`), `resolved_conclusion CHECK admits '${v}'`);
  const cwe = await checkDefs("compliance_watch_events");
  for (const v of ["created", "tier_change", "acknowledged", "snoozed", "re_armed", "resolved", "evaluation"]) {
    assert.ok(cwe.includes(`'${v}'`), `compliance_watch_events event_kind CHECK admits '${v}'`);
  }
  const wuq = await uniqueIndexDefs("compliance_watches");
  const oneOpen = wuq.find((d) => /client_id/.test(d) && /service_group/.test(d) && /watch_kind/.test(d) && /resolved/.test(d));
  assert.ok(oneOpen, `the one-open-episode partial UNIQUE (client, service_group, watch_kind) WHERE state <> 'resolved' exists (got: ${wuq.join(" ~~ ").slice(0, 300)})`);
});

test("P1 ix_je_client_approved_posting exists (partial on status='approved') and the planner uses it for the rolling scan shape", async (t) => {
  if (skip16(t, has16)) return;
  const idx = await rootQuery(
    "select indexdef from pg_indexes where schemaname='clara' and tablename='journal_entries' and indexname='ix_je_client_approved_posting'",
  );
  assert.ok(idx.rows.length, "ix_je_client_approved_posting exists on clara.journal_entries");
  const def = idx.rows[0].indexdef;
  for (const tok of ["client_id", "posting_date", "id", "approved"]) assert.ok(def.includes(tok), `index def carries ${tok} (got: ${def})`);
  // EXPLAIN evidence (pin P1: "EXPLAIN-evidenced in the rig") — with seqscan
  // discouraged the evaluator's shape must be index-eligible.
  const { getPool } = await import("./a21-helpers.mjs");
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query("set local enable_seqscan = off");
    const plan = await c.query(
      "explain (format json) select id from clara.journal_entries where client_id=$1 and status='approved' order by posting_date, id",
      [randomUUID()],
    );
    const txt = JSON.stringify(plan.rows);
    assert.ok(txt.includes("ix_je_client_approved_posting"), `the approved-postings scan is served by ix_je_client_approved_posting (plan: ${txt.slice(0, 300)})`);
    await c.query("rollback");
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
});

test("P1/P6 grant matrix: evaluators are clara_runtime ONLY; human writers are authenticated; agent + wake roles hold ZERO EXECUTE on every new fn", async (t) => {
  if (skip16(t, has16)) return;
  for (const fn of ["evaluate_sst_watch", "evaluate_sst_watches_all", "classify_document"]) {
    assert.equal(await roleCanExecute("clara_runtime", fn), true, `clara_runtime may EXECUTE ${fn}`);
    assert.equal(await roleCanExecute("clara_authenticated", fn), false, `clara_authenticated may NOT execute ${fn} (runtime-only)`);
  }
  for (const fn of ["set_turnover_classification", "record_future_attestation", "ack_compliance_watch", "snooze_compliance_watch", "resolve_compliance_watch", "set_document_kind"]) {
    assert.equal(await roleCanExecute("clara_authenticated", fn), true, `clara_authenticated may EXECUTE ${fn} (human lane)`);
  }
  for (const fn of A21_NEW_FNS) {
    const present = await roleCanExecute("clara_agent_ro", fn);
    if (present == null) { noteLane(`${fn} absent from the catalog — grant cell noted (marker fns asserted in META)`); continue; }
    assert.equal(present, false, `clara_agent_ro holds ZERO EXECUTE on ${fn} (P6 — the wave adds the agent nothing)`);
    assert.equal(await roleCanExecute("clara_wake_interactive", fn), false, `clara_wake_interactive cannot execute ${fn}`);
    assert.equal(await roleCanExecute("clara_wake_proactive", fn), false, `clara_wake_proactive cannot execute ${fn}`);
  }
  // Behavioral 42501 — the agent role calling the evaluator.
  await assert.rejects(
    () => roleQuery(ROLES.agentRo, "select clara.evaluate_sst_watch(p_client => $1, p_op_key => $2)", [randomUUID(), opk("x")]),
    (e) => e.code === "42501",
    "clara_agent_ro is denied EXECUTE (42501) on evaluate_sst_watch",
  );
  // Not in any wake allowlist (tolerant probe — the allowlist table name is as-built).
  const allowTables = (await rootQuery(
    "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind='r' and c.relname ~ 'allow'",
  )).rows.map((x) => x.relname);
  for (const tbl of allowTables) {
    const hit = await rootQuery(`select count(*)::int as n from clara.${tbl} t where to_jsonb(t)::text ilike '%evaluate_sst%'`);
    assert.equal(hit.rows[0].n, 0, `evaluate_sst_watch is in NO wake allowlist (checked clara.${tbl})`);
  }
});

test("P6 grep-asserts: no open_questions writes from compliance fns; no watch logic in _approve_entry_core; evaluators carry exception isolation", async (t) => {
  if (skip16(t, has16)) return;
  for (const fn of COMPLIANCE_FNS) {
    const src = await fnSource(fn);
    if (!src) { noteLane(`${fn} has no source (absent?) — P6 grep cell noted`); continue; }
    assert.ok(!/open_questions/i.test(src), `${fn} never touches open_questions (the watch is non-blocking BY CONSTRUCTION, WA21-R3)`);
  }
  const core = await fnSource("_approve_entry_core");
  assert.ok(core.length > 0, "_approve_entry_core exists");
  assert.ok(!/compliance_watch|evaluate_sst/i.test(core), "_approve_entry_core gains NO watch logic (Codex refuse-list — the watch rides the entry.approved spine event)");
  // The evaluator's failure isolation is structural: a per-client EXCEPTION block.
  const ev1 = await fnSource("evaluate_sst_watch");
  assert.ok(/exception/i.test(ev1), "evaluate_sst_watch carries an EXCEPTION handler (exception-isolated per client)");
  const evAll = await fnSource("evaluate_sst_watches_all");
  assert.ok(/exception/i.test(evAll), "evaluate_sst_watches_all counts per-client failures via an EXCEPTION handler (never raises)");
});

test("P5 event_types registers compliance.watch_transition + document.classified", async (t) => {
  if (skip16(t, has16)) return;
  for (const name of A21_EVENT_TYPES) {
    const r = await rootQuery("select 1 from clara.event_types where name=$1", [name]);
    assert.ok(r.rows.length, `event_type '${name}' is registered`);
  }
});

// ===========================================================================
// Evaluator arithmetic — the boundary, tiers, tri-state, groups, coverage.
// ===========================================================================

test("§2 BOUNDARY: exactly RM 500,000.00 is NOT crossed (early_warning); +1 sen IS crossed with the exact earliest month + statutory due date", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_boundary_${randomUUID().slice(0, 6)}` });
  // RM 499,999.99 + RM 0.01 = exactly RM 500,000.00 in June-2026.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 49_999_999, date: "2026-06-03" });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 1, date: "2026-06-04" });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.ok(w, "a watch case exists for (client, G) after evaluation");
  assert.equal(Number(w.confirmed_included_cents), 50_000_000, "confirmed-included is EXACTLY 50,000,000¢ (to the sen)");
  assert.equal(w.state, "early_warning", `RM 500,000.00 exactly is NOT crossed — the boundary is strict '>' (state=${w.state})`);
  assert.equal(w.earliest_crossing_month, null, "no crossing month at exactly the threshold");
  assert.equal(w.future_method_status, "not_assessed", "future method is not_assessed without an attestation (WA21-R6 — never inferred)");
  assert.equal(Number(w.unknown_or_mixed_cents), 0, "nothing lands in the unknown bucket (every active account is classified)");
  // +1 sen → crossed.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 1, date: "2026-06-05" });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(Number(w.confirmed_included_cents), 50_000_001, "confirmed-included is 50,000,001¢");
  assert.equal(w.state, "crossed", "RM 500,000.01 EXCEEDS the threshold (crossed)");
  assert.equal(w.earliest_crossing_month, "2026-06-01", "earliest crossing month = June-2026");
  assert.equal(w.application_due, "2026-07-31", "application due = last day of crossing-month + 1 (s.13(1))");
});

test("§2 TIER: RM 399,999.99 is monitored; RM 400,000.00 exactly (≥80%) is early_warning", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_tier_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 39_999_999, date: "2026-06-02" });
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.ok(w, "a monitored watch row exists below 80%");
  assert.equal(w.state, "monitored", "RM 399,999.99 (<80%) is monitored");
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 1, date: "2026-06-02" });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(w.state, "early_warning", "RM 400,000.00 exactly (≥80% of threshold) is early_warning");
});

test("§2 TRI-STATE default: an UNCLASSIFIED income account lands in unknown_or_mixed — never excluded, never confirmed; three separate figures", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_tristate_${randomUUID().slice(0, 6)}`, unclassified: [INC2] });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 700_00, date: "2026-05-10", account: INC }); // RM700 confirmed
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 300_00, date: "2026-05-11", account: INC2 }); // RM300 unknown (no row!)
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.ok(w, "the watch row exists");
  assert.equal(Number(w.confirmed_included_cents), 700_00, "confirmed-included carries ONLY the classified account (70,000¢)");
  assert.equal(Number(w.unknown_or_mixed_cents), 300_00, "the missing-classification account's credits land in unknown_or_mixed (30,000¢) — missing row ⇒ unknown, never excluded");
  assert.equal(Number(w.screening_proxy_cents), 1000_00, "the all-income screening proxy is the third SEPARATE figure (100,000¢ = both income accounts)");
});

test("§2 PER-GROUP: G and I never aggregate — RM300k+RM300k across two groups crosses NOTHING; a later G-only push crosses G alone", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, {
    name: `a21_groups_${randomUUID().slice(0, 6)}`,
    groups: { [INC]: "G", [INC_I]: "I" },
  });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 30_000_000, date: "2026-06-08", account: INC });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 30_000_000, date: "2026-06-09", account: INC_I });
  await evaluateSstWatch(client);
  const g = await openWatchRow(client, "G");
  const i = await openWatchRow(client, "I");
  assert.ok(g && i, "one watch case per service group (G and I both exist)");
  assert.notEqual(g.id, i.id, "the G and I cases are distinct rows");
  assert.equal(Number(g.confirmed_included_cents), 30_000_000, "G carries only G turnover");
  assert.equal(Number(i.confirmed_included_cents), 30_000_000, "I carries only I turnover");
  assert.ok(g.state !== "crossed" && g.state !== "overdue", `600k across two groups crosses neither (G=${g.state})`);
  assert.ok(i.state !== "crossed" && i.state !== "overdue", `600k across two groups crosses neither (I=${i.state})`);
  // Push ONLY G over: +RM200,000.01.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 20_000_001, date: "2026-06-10", account: INC });
  await evaluateSstWatch(client);
  const g2 = await openWatchRow(client, "G");
  const i2 = await openWatchRow(client, "I");
  assert.equal(g2.state, "crossed", "G crosses on its own turnover");
  assert.ok(i2.state !== "crossed" && i2.state !== "overdue", `I is untouched by G's crossing (I=${i2.state})`);
});

test("§2 COVERAGE: an opening-balance entry is EXCLUDED from observed turnover and flips the coverage flag", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_coverage_${randomUUID().slice(0, 6)}` });
  // draft_entry never trusts is_opening_balance from flags (0004 §E) and the entry
  // immutability trigger freezes the flag after insert — so the fixture raw-inserts
  // a flagged DRAFT (entry INSERT is unguarded; the rig-txn precedent) binding a
  // REAL audited resolution, then approves it through the audited approve_entry.
  const res = await freshResolution(users.alice, client);
  // INTEGRATION (CLASS T): the balance backstop is a DEFERRED constraint trigger —
  // it fires at COMMIT of the entry-insert transaction, so a lines-less entry in
  // its own autocommit statement dies CLR07 before the lines ever land. The raw
  // fixture must write entry + lines in ONE statement (one transaction).
  // [R1-F1] (0017 lifecycle isolation, SANCTIONED): generic approve_entry now
  // REFUSES an is_opening_balance draft — the refusal IS the fix, and this
  // fixture's coverage purpose is the EVALUATOR's exclusion arithmetic, not the
  // approval lane. The raw fixture therefore lands the entry ALREADY APPROVED
  // (checker_actor/approved_at stamped; the flag frozen at insert), exactly the
  // approved-OB shape the K5 batch produces.
  const entryId = (await rootQuery(
    `with e as (
       insert into clara.journal_entries (client_id, posting_date, memo, origin, status, maker_actor, last_human_editor, resolution_id, is_opening_balance)
       values ($1, '2025-09-15', 'opening balance load', 'manual', 'draft', $2, $2, $3, true) returning id
     ), l as (
       insert into clara.journal_lines (entry_id, line_no, account_code, debit_cents, credit_cents)
       select e.id, x.line_no, x.code, x.d, x.c from e
         cross join (values (1, $4::text, 50000::bigint, 0::bigint), (2, $5::text, 0::bigint, 50000::bigint)) as x(line_no, code, d, c)
       returning entry_id
     ) select id from e`,
    [client, users.alice, res, CASH, INC],
  )).rows[0].id;
  // …then the 0003 trigger's draft→approved allowlist shape (lines freeze once the parent approves).
  await rootQuery(
    "update clara.journal_entries set status='approved', checker_actor=$2, approved_at=now() where id=$1",
    [entryId, users.bob]);
  const flag = (await rootQuery("select is_opening_balance, status from clara.journal_entries where id=$1", [entryId])).rows[0];
  assert.equal(flag.is_opening_balance, true, "the fixture opening-balance entry is flagged (mandatory setup)");
  assert.equal(flag.status, "approved", "the opening-balance entry is approved (mandatory setup)");
  // A normal observed entry beside it.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 200_00, date: "2026-05-20" });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.ok(w, "the watch row exists");
  assert.equal(Number(w.confirmed_included_cents), 200_00, "the RM500 opening-balance credit is EXCLUDED from observed turnover (only RM200 confirmed)");
  assert.equal(w.coverage_complete, false, "the opening-balance presence surfaces as missing-history (coverage_complete=false)");
});

test("§2 future-dated entries are excluded; a reversal MIRROR is included (the pair nets to zero)", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_futrev_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 400_00, date: "2026-05-05" });
  const revTarget = await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 300_00, date: "2026-05-06" });
  // Future-dated: excluded by the evaluator. If the draft lane itself refuses a
  // future posting date the exclusion is upstream-enforced — either way the
  // asserted figure is identical (noted, not failed).
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 900_00, date: "2027-01-15" })
    .catch((e) => noteLane(`future-dated draft refused ${e.code} — exclusion enforced upstream of the evaluator`));
  await evaluateSstWatch(client);
  let w = await openWatchRow(client, "G");
  assert.equal(Number(w.confirmed_included_cents), 700_00, "a future-dated entry contributes NOTHING (70,000¢ = the two past entries)");
  // Reverse the RM300 entry (routine → the mirror auto-approves). ADV-7
  // (round 1): the mirror posts TODAY, i.e. into the month IN PROGRESS — so it
  // nets immediately in the PROVISIONAL figure, while the statutory figure
  // (completed months only, s.12 month-end basis) keeps the original until the
  // mirror's month completes. The pair still nets — in the window that
  // contains both legs.
  await reverseEntry(users.bob, { entry: revTarget, reason: "rig watch reversal", opKey: opk("rev") });
  await evaluateSstWatch(client);
  w = await openWatchRow(client, "G");
  assert.equal(Number(w.confirmed_included_cents), 700_00, "the STATUTORY figure (completed months) keeps the original until the mirror's month ends");
  assert.equal(Number(w.provisional_included_cents), 400_00, "the PROVISIONAL figure nets the reversed pair immediately (40,000¢ remain)");
});

test("P7 closing-transfer: is_year_end alone still COUNTS; is_year_end + closing_transfer is EXCLUDED; the column defaults false", async (t) => {
  if (skip16(t, has16)) return;
  const col = await rootQuery(
    "select column_default, is_nullable from information_schema.columns where table_schema='clara' and table_name='journal_entries' and column_name='closing_transfer'",
  );
  assert.ok(col.rows.length, "journal_entries.closing_transfer exists (P7)");
  assert.equal(col.rows[0].is_nullable, "NO", "closing_transfer is NOT NULL");
  assert.match(col.rows[0].column_default ?? "", /false/, "closing_transfer defaults false (backfill posture)");
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_closing_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 500_00, date: "2026-04-10" });
  // A year-end revenue CORRECTION (is_year_end, NOT closing_transfer) — still counts.
  await approvedTurnoverEntry({
    maker: users.alice, checker: users.bob, client, cents: 100_00, date: "2026-04-30",
    flags: { is_year_end: true },
  });
  // The closing TRANSFER (is_year_end + closing_transfer, P7 flags-style): debits
  // income into equity at year end — must NOT be read as negative turnover.
  const { upsertAccountClassed } = await import("./a21-helpers.mjs");
  await upsertAccountClassed(users.alice, { client, code: "3000", name: "Retained Earnings", type: "equity", opKey: opk("re") }).catch((e) => noteLane(`equity acct ${e.code}`));
  const d = await draftEntryV3(users.alice, {
    client, resolution: await freshResolution(users.alice, client),
    lines: [
      { account_code: INC, debit_cents: 600_00, credit_cents: 0, description: "close income" },
      { account_code: "3000", debit_cents: 0, credit_cents: 600_00, description: "to retained earnings" },
    ],
    flags: { is_year_end: true, closing_transfer: true },
    postingDate: "2026-04-30", memo: "year-end closing transfer", opKey: opk("ct"),
  });
  await approveEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("cta") });
  const ct = (await rootQuery("select closing_transfer, is_year_end from clara.journal_entries where id=$1", [d.entry_id])).rows[0];
  assert.equal(ct.closing_transfer, true, "the human draft path (flags-style) sets closing_transfer (P7)");
  assert.equal(ct.is_year_end, true, "the closing transfer is also is_year_end");
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  // RM500 + RM100 (year-end correction counts) − 0 (the closing transfer's RM600
  // income DEBIT is excluded) = RM600 confirmed. A blanket is_year_end exclusion
  // would show RM500; including the transfer would show RM0.
  assert.equal(Number(w.confirmed_included_cents), 600_00, "is_year_end-only counts; is_year_end+closing_transfer is excluded (60,000¢ exactly)");
});

// ===========================================================================
// Non-blocking + isolation (contract §2.4 / pin P1).
// ===========================================================================

test("§2.4 evaluator failure isolation: a garbage client NEVER raises; the sweep completes over the whole world with ONE receipt and counted failures", async (t) => {
  if (skip16(t, has16)) return;
  // A nonexistent client is a poisoned input — the evaluator must swallow it
  // (exception-isolated), never raise into the caller's transaction.
  await assert.doesNotReject(
    () => evaluateSstWatch(randomUUID()),
    "evaluate_sst_watch on an unknown client returns (exception-isolated) instead of raising",
  );
  const before_ = await evalRunCount();
  await assert.doesNotReject(() => evaluateAllWatches(), "the daily sweep wrapper never raises");
  const after_ = await evalRunCount();
  assert.equal(after_, before_ + 1, "evaluate_sst_watches_all writes exactly ONE compliance_eval_runs receipt");
  const run = await latestEvalRun();
  assert.ok(run, "the receipt row is readable");
  for (const k of ["clients_examined", "clients_changed", "clients_failed"]) {
    assert.ok(Number.isInteger(Number(run[k])), `receipt.${k} is an integer count (got ${run[k]})`);
  }
});

test("§2.4 NOTHING BLOCKS: approvals proceed while a crossed watch is open (the watch can never gate an approval)", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_noblock_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 50_000_001, date: "2026-06-06" });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "the watch is open + crossed (mandatory setup)");
  // An ordinary approval on the SAME client while crossed — must simply work.
  await assert.doesNotReject(
    () => approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 250_00, date: "2026-06-20" }),
    "an approval on a crossed-watch client is NEVER blocked by the watch (§2.4 hard-nots)",
  );
});

test("§2 RLS isolation: a firm-B admin can neither ACK nor read firm A's watch; direct table reads are ungranted", async (t) => {
  if (skip16(t, has16)) return;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_rls_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 50_000_001, date: "2026-06-07" });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.ok(w, "firm A's watch exists (mandatory setup)");
  // dave (firm B owner) acks firm A's watch → not-found/authz, NEVER success.
  let err = null;
  try { await ackWatch(users.dave, { watch: w.id }); } catch (e) { err = e; }
  assert.ok(err, "a cross-firm ack is refused");
  assert.ok(["CLR11", "CLR04", "CLR10"].includes(err.code), `cross-firm ack refuses in the not-found/authz family without an existence oracle (got ${err.code})`);
  const w2 = await openWatchRow(client, "G");
  assert.equal(w2.acknowledged_at ?? null, null, "the foreign ack left no acknowledgement");
  // Direct SELECT under clara_authenticated (no grant → 42501; RLS is belt+braces).
  await assert.rejects(
    () => roleQuery(ROLES.authenticated, "select count(*) from clara.compliance_watches", []),
    (e) => e.code === "42501",
    "compliance_watches carries no direct app-role SELECT (fn-mediated reads only)",
  );
});
