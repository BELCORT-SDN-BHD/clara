// Wave-A rig — 0011 DDL SHAPE: the ten new tables + FORCE RLS, new columns,
// widened CHECKs, the nine new event types + additive-taxonomy coverage (no version
// flip), and the SIX-row autodraft wake allowlist (PIN-DELTA-1). Contract-blind:
// derived from contract v1.1 §1/§8/§10 + companion §2–§12 + INTERFACE-PINS §2/§3 —
// NEVER from 0011's source. Every test SKIPS (loudly, counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, skipUnready, waveAEnsureReady,
  WA_NEW_TABLES, WA_EVENT_TYPES, WA_NOTIFICATION_EVENTS, WA_AUTODRAFT_ALLOWLIST,
} from "./wave-a-fixtures.mjs";

let ready = false;
before(async () => { ready = await waveAEnsureReady(); });
after(async () => { printLaneNotes("wave-a-shape"); printSkipCount("wave-a-shape"); await endPool(); });

async function checkDefs(table) {
  const r = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname=$1 and c.contype='c'`, [table]);
  return r.rows.map((x) => x.def).join(" ~~ ");
}
async function columnsOf(table) {
  const r = await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name=$1", [table]);
  return new Set(r.rows.map((x) => x.column_name));
}

// ===========================================================================
// New tables + FORCE RLS + zero direct grants (PINS §2 / companion §13).
// ===========================================================================

test("§2 the ten new tables all exist and are RLS + FORCE RLS", async (t) => {
  if (skipUnready(t, ready)) return;
  const rows = await rootQuery(
    "select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force, pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind='r'");
  const present = new Map(rows.rows.map((r) => [r.relname, r]));
  for (const tbl of WA_NEW_TABLES) {
    const r = present.get(tbl);
    assert.ok(r, `clara.${tbl} exists (companion §2)`);
    assert.ok(r.rls && r.force, `clara.${tbl}: RLS + FORCE RLS required (rls=${r?.rls} force=${r?.force})`);
    assert.equal(r.owner, "clara_fn_owner", `clara.${tbl} owned by clara_fn_owner (non-BYPASSRLS)`);
  }
});

test("§13 the new tables carry ZERO direct DML/SELECT grant to any app role (fn-fronted only)", async (t) => {
  if (skipUnready(t, ready)) return;
  const APP = ["clara_authenticated", "clara_agent_ro", "clara_runtime", "clara_wake_interactive", "clara_wake_proactive"];
  for (const tbl of WA_NEW_TABLES) {
    for (const role of APP) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        const ok = (await rootQuery("select has_table_privilege($1, $2, $3) as ok", [role, `clara.${tbl}`, priv])).rows[0].ok;
        assert.equal(ok, false, `${role} must NOT ${priv} clara.${tbl} directly (fn-fronted only)`);
      }
    }
  }
});

test("§2 _tf_no_truncate + append-only: the new tables refuse a superuser TRUNCATE", async (t) => {
  if (skipUnready(t, ready)) return;
  const { truncateGuardError } = await import("./rig-txn.mjs");
  // A representative append-only surface: journal_entry_revisions + rule_sightings.
  for (const tbl of ["journal_entry_revisions", "rule_sightings"]) {
    const err = await truncateGuardError(`truncate clara.${tbl}`);
    assert.ok(err, `TRUNCATE clara.${tbl} was refused (guard fired)`);
    assert.ok(["CLR08", "0A000", "2BP01"].includes(err.code) || /truncate/i.test(err.message), `clara.${tbl} truncate refused with an append-only/guard error (got ${err.code} ${err.message})`);
  }
});

// ===========================================================================
// New columns (PINS §2 / companion §2/§4/§5).
// ===========================================================================

// F-A9 PR-1B: the `sweep_budget_share` half of this Slice-4 contract is RETIRED, not
// relaxed. The column is dropped (owner ruling TA-P12 = A; digest law 76), so a cell that
// positively asserts it EXISTS with a 0.60 default is no longer a contract — it is a pin
// on a decision that has been reversed. The `max_concurrent_sweeps` half is KEPT and
// still asserted in full, and the retired half is replaced by its own positive-by-absence
// assertion below rather than silently dropped (a deleted assertion proves nothing).
test("§2 new columns: counterparties.merged_into + retired_at; wake_credentials.client_id; firm_limits.max_concurrent_sweeps", async (t) => {
  if (skipUnready(t, ready)) return;
  const cp = await columnsOf("counterparties");
  assert.ok(cp.has("merged_into"), "counterparties.merged_into (self-FK, immutable-once-set)");
  assert.ok(cp.has("retired_at"), "counterparties.retired_at (merge sets it; companion §2 note)");
  assert.ok((await columnsOf("wake_credentials")).has("client_id"), "wake_credentials.client_id (autodraft pinning)");
  const fl = await columnsOf("firm_limits");
  assert.ok(fl.has("max_concurrent_sweeps"), "firm_limits.max_concurrent_sweeps (default 2)");
});

test("§2 firm_limits: max_concurrent_sweeps=2 survives; the three F-A9-retired cap columns are GONE", async (t) => {
  if (skipUnready(t, ready)) return;
  const r = await rootQuery(
    "select column_name, column_default from information_schema.columns where table_schema='clara' and table_name='firm_limits' and column_name in ('sweep_budget_share','max_concurrent_sweeps','daily_token_limit','sales_admission_daily_cap')");
  const def = new Map(r.rows.map((x) => [x.column_name, x.column_default ?? ""]));
  assert.ok((def.get("max_concurrent_sweeps") ?? "").includes("2"), `max_concurrent_sweeps default 2 (got ${def.get("max_concurrent_sweeps")})`);
  for (const dead of ["sweep_budget_share", "daily_token_limit", "sales_admission_daily_cap"]) {
    assert.equal(def.has(dead), false, `firm_limits.${dead} is DROPPED at F-A9 PR-1B (meter, never cap) — it is still present`);
  }
});

test("§2 wake_credentials.client_id CHECK: non-null iff wake_kind='autodraft' (companion §4)", async (t) => {
  if (skipUnready(t, ready)) return;
  const defs = await checkDefs("wake_credentials");
  assert.ok(/client_id/.test(defs) && /autodraft/.test(defs), `a CHECK ties wake_credentials.client_id to wake_kind='autodraft' (defs: ${defs.slice(0, 300)})`);
});

// ===========================================================================
// Widened CHECK domains (PINS §2).
// ===========================================================================

test("§2 widened CHECKs: wake_credentials.wake_kind + agent_tasks.kind admit 'autodraft'; fingerprint admits 'alias_match'", async (t) => {
  if (skipUnready(t, ready)) return;
  assert.ok((await checkDefs("wake_credentials")).includes("'autodraft'"), "wake_credentials.wake_kind CHECK admits 'autodraft'");
  assert.ok((await checkDefs("agent_tasks")).includes("'autodraft'"), "agent_tasks.kind CHECK admits 'autodraft'");
  assert.ok((await checkDefs("journal_entries")).includes("'alias_match'"), "ck_je_match_fingerprint_shape widened to admit 'alias_match'");
});

test("§2 CHECK domains on the new tables: sweep_run_items.outcome, coding_rules.status, open_questions.scope_kind, autodraft_attempts.state", async (t) => {
  if (skipUnready(t, ready)) return;
  const item = await checkDefs("sweep_run_items");
  // 'refused_concurrency' joins at F-A9 PR-1B and 'refused_budget' STAYS: the swap is
  // extend-only, so every value the pre-F-A9 CHECK admitted is still admitted (law 6).
  for (const o of ["drafted", "skipped_lane", "refused_budget", "refused_concurrency", "refused_attempts", "noop_existing"]) assert.ok(item.includes(`'${o}'`), `sweep_run_items.outcome admits '${o}'`);
  const rule = await checkDefs("coding_rules");
  for (const s of ["proposed", "live", "declined", "retired"]) assert.ok(rule.includes(`'${s}'`), `coding_rules.status admits '${s}'`);
  const q = await checkDefs("open_questions");
  for (const s of ["document", "vendor", "client"]) assert.ok(q.includes(`'${s}'`), `open_questions.scope_kind admits '${s}'`);
  const att = await checkDefs("autodraft_attempts");
  for (const s of ["active", "parked", "idle"]) assert.ok(att.includes(`'${s}'`), `autodraft_attempts.state admits '${s}'`);
});

// ===========================================================================
// New partial-unique constraints that carry the race semantics (companion §2/§4/§5/§7/§10).
// ===========================================================================

test("§2/§4/§5 partial-unique constraints exist: one-live-alias, one-active-attempt/filing, one-live-rule, sighting grain, one-live-consent, item (run,filing)", async (t) => {
  if (skipUnready(t, ready)) return;
  const idx = await rootQuery(
    `select t.relname as tbl, i.relname as idx, pg_get_indexdef(ix.indexrelid) as def
       from pg_index ix join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid
       join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname = any($1) and ix.indisunique`,
    [WA_NEW_TABLES]);
  const byTbl = (tbl) => idx.rows.filter((r) => r.tbl === tbl).map((r) => r.def).join(" ~~ ");
  assert.ok(/alias_normalized/.test(byTbl("counterparty_aliases")) && /where/i.test(byTbl("counterparty_aliases")), "counterparty_aliases: partial unique on (client_id, alias_normalized) where unretired");
  assert.ok(/filing_id/.test(byTbl("autodraft_attempts")), "autodraft_attempts: unique(filing_id) — one attempt row per filing");
  assert.ok(/counterparty_id/.test(byTbl("coding_rules")) && /where/i.test(byTbl("coding_rules")), "coding_rules: partial unique one-live per (client, counterparty, rule_type)");
  assert.ok(/entry_id/.test(byTbl("rule_sightings")) && /account_code/.test(byTbl("rule_sightings")), "rule_sightings: unique (client, counterparty, account_code, entry_id)");
  assert.ok(/run_id/.test(byTbl("sweep_run_items")) && /filing_id/.test(byTbl("sweep_run_items")), "sweep_run_items: unique (run_id, filing_id)");
  assert.ok(/revision_no/.test(byTbl("journal_entry_revisions")), "journal_entry_revisions: unique (entry_id, revision_no)");
  assert.ok(/client_id/.test(byTbl("client_egress_consents")) && /where/i.test(byTbl("client_egress_consents")), "client_egress_consents: partial unique one-live per client");
  // PIN-ANSWERS §5b(A): sweep_run_items.run_id FK → sweep_runs.id (the sweep linkage
  // threaded through admission's p_run_id → registry → the settle item write).
  const fk = await rootQuery(
    `select conname, pg_get_constraintdef(con.oid) as def from pg_constraint con
       join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='sweep_run_items' and con.contype='f'`);
  assert.ok(fk.rows.some((r) => /run_id/.test(r.def) && /sweep_runs/.test(r.def)), `sweep_run_items.run_id is a FK → sweep_runs.id (§5b A; defs: ${fk.rows.map((r) => r.def).join(" ~~ ").slice(0, 200)})`);
});

// ===========================================================================
// New event types + additive taxonomy (PINS §3 / companion §12 / probe P7).
// ===========================================================================

test("§3 the nine new event types are registered in clara.event_types", async (t) => {
  if (skipUnready(t, ready)) return;
  const r = await rootQuery("select name from clara.event_types where name = any($1)", [WA_EVENT_TYPES]);
  const have = new Set(r.rows.map((x) => x.name));
  for (const et of WA_EVENT_TYPES) assert.ok(have.has(et), `event_type '${et}' registered`);
});

test("§3 additive-insert into the ACTIVE taxonomy version (2) — coverage whole, NO version flip; the two notification types route to 'notification'", async (t) => {
  if (skipUnready(t, ready)) return;
  const active = (await rootQuery("select version from clara.taxonomy_active where singleton")).rows[0].version;
  assert.equal(active, 2, "the active taxonomy version is unchanged (additive-insert, NO flip — probe P7)");
  // Coverage whole: every registered type has a trigger_taxonomy row at the active version.
  // Exclude the reserved rig.% namespace: a concurrent test file (rig-events-structure)
  // inserts uncovered rig.% event types on the shared CI DB to exercise the coverage
  // guard — they must not false-fail this test (the house precedent, AB-7 / rig-events).
  const uncovered = await rootQuery(
    `select e.name from clara.event_types e
      where e.name not like 'rig.%'
        and not exists (select 1 from clara.trigger_taxonomy tt where tt.event_type=e.name and tt.version=$1)`, [active]);
  assert.equal(uncovered.rowCount, 0, `taxonomy coverage is whole at v${active} (uncovered: ${uncovered.rows.map((x) => x.name).join(", ")})`);
  // The two notification types route to 'notification'; the rest 'ignore'.
  const dec = await rootQuery(
    "select event_type, decision from clara.trigger_taxonomy where version=$1 and event_type = any($2)", [active, WA_EVENT_TYPES]);
  const byType = new Map(dec.rows.map((x) => [x.event_type, x.decision]));
  for (const et of WA_EVENT_TYPES) {
    const want = WA_NOTIFICATION_EVENTS.includes(et) ? "notification" : "ignore";
    assert.equal(byType.get(et), want, `trigger_taxonomy[v${active}].${et} decision = ${want}`);
  }
});

// ===========================================================================
// The autodraft wake allowlist — SIX rows (PIN-DELTA-1), nothing else.
// ===========================================================================

test("PIN-DELTA-1 the wake_kind 'autodraft' allowlist is EXACTLY the six pinned rows", async (t) => {
  if (skipUnready(t, ready)) return;
  const r = await rootQuery("select coalesce(fn_name, function_name) as fn from clara.wake_fn_allowlist where wake_kind='autodraft'");
  const have = new Set(r.rows.map((x) => x.fn));
  for (const fn of WA_AUTODRAFT_ALLOWLIST) assert.ok(have.has(fn), `autodraft allowlist includes ${fn} (PIN-DELTA-1)`);
  // F-A2 PR-1: the posting verb joins the autodraft lane, as a LEDGER-GATED cohort for the same
  // reason x42-s5's roster is one (B.3) — db-slice-frontiers runs this battery against databases
  // pinned at EARLIER frontiers, where clara.wake_post_entry does not exist, and an
  // unconditional entry would turn every one of those legs red while saying nothing about the
  // allowlist. Gated on appliedStem, NEVER on a migration number: numbers are claimed at merge,
  // so a number-keyed gate is a guess that silently never fires. Exact in BOTH directions at
  // either frontier — a missing row still fails.
  const postingLane = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ 'f_a2_posting_grants$'")).rows[0].n === 1;
  const expected = postingLane ? [...WA_AUTODRAFT_ALLOWLIST, "wake_post_entry"] : [...WA_AUTODRAFT_ALLOWLIST];
  if (postingLane) assert.ok(have.has("wake_post_entry"), "the autodraft lane carries wake_post_entry once F-A2 PR-1 is applied");
  assert.equal(have.size, expected.length, `autodraft allowlist is EXACTLY the pinned rows — no list fns, no approve-shaped anything (got: ${[...have].join(", ")})`);
  // The two legacy kinds are byte-identical (no seeding risk) — interactive keeps wake_draft_entry.
  const legacy = await rootQuery("select coalesce(fn_name, function_name) as fn from clara.wake_fn_allowlist where wake_kind='interactive'");
  assert.ok(legacy.rows.some((x) => x.fn === "wake_draft_entry"), "interactive lane still carries wake_draft_entry (legacy unchanged)");
  // PIN-ANSWERS §5b(D): wake_open_question allowlist rows are EXACTLY
  // ('autodraft','wake_open_question') + ('interactive','wake_open_question') — never proactive.
  assert.ok(legacy.rows.some((x) => x.fn === "wake_open_question"), "the interactive lane carries wake_open_question (§5b D)");
  const woq = await rootQuery("select wake_kind from clara.wake_fn_allowlist where coalesce(fn_name, function_name)='wake_open_question' order by wake_kind");
  const woqKinds = new Set(woq.rows.map((x) => x.wake_kind));
  // F-A2 PR-1 (D34): the pinned chat kind joins THIS verb and nothing else. That single row is
  // the whole of interactive_client's authority — it is why the kind can land a typed open
  // question and can never carry a post — and asserting it here is the closed-world half.
  // Still never proactive, at either frontier.
  const woqExpected = postingLane
    ? ["autodraft", "interactive", "interactive_client"] : ["autodraft", "interactive"];
  assert.deepEqual([...woqKinds].sort(), woqExpected, `wake_open_question is allowlisted for EXACTLY ${woqExpected.join(" + ")}, never proactive (got ${[...woqKinds].join(", ")})`);
});
