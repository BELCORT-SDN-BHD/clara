// Wave-B battery — Block G (G1 event registry · G2 the ACL tuple matrix ·
// G3 zero allowlist rows · G4 op-hash discipline · G5 the tail asserts re-run
// OUT of the migration txn (the 0016 lesson) · G8 back-compat). CONTRACT-BLIND;
// FAILS below 0017.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery,
  endPool, printLaneNotes,
  fail0017, wbEnsureReady, roleCanExecute, fnSource, wbFnInventory,
  WB_EVENT_TYPES, WB_ACL, WB_ALL_FNS, WB_V7_PURPOSE,
} from "./wb-fixtures.mjs";

let live = false;
let inventory = []; // [R1-F13a] the live-catalog 0017-family fn inventory

/** Sweep surface = the pinned matrix ∪ the catalog inventory. */
const sweepFns = () => [...new Set([...WB_ALL_FNS, ...inventory])];

const ROLE_OF = {
  authenticated: "clara_authenticated",
  agent: "clara_agent_ro",
  wakeInteractive: "clara_wake_interactive",
  wakeProactive: "clara_wake_proactive",
  runtime: "clara_runtime",
};

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  inventory = await wbFnInventory();
});
after(async () => { printLaneNotes("wb-g-tail"); await endPool(); });

test("G1: every 0017 event type is registered client-scoped with its PINNED taxonomy decision", async () => {
  fail0017(live);
  for (const [name, decision] of Object.entries(WB_EVENT_TYPES)) {
    const et = await rootQuery("select client_scoped from clara.event_types where name=$1", [name]);
    assert.equal(et.rows.length, 1, `event_types carries ${name}`);
    assert.equal(et.rows[0].client_scoped, true, `${name} is client-scoped`);
    const tt = await rootQuery(
      `select t.decision from clara.trigger_taxonomy t
        join clara.taxonomy_active a on a.version=t.version and a.singleton
       where t.event_type=$1`, [name]);
    assert.equal(tt.rows.length, 1, `${name} is in the ACTIVE taxonomy`);
    assert.equal(tt.rows[0].decision, decision, `${name} decision='${decision}' (bulk projection types never flood the outbox)`);
  }
});

test("G2: the ACL tuple matrix holds ROW BY ROW (and internals hold NO app grant)", async () => {
  fail0017(live);
  const failures = [];
  for (const [fn, granted] of Object.entries(WB_ACL)) {
    for (const [token, role] of Object.entries(ROLE_OF)) {
      const want = token === "wakeInteractive" || token === "wakeProactive"
        ? false // the matrix's wake column is ✗ for every 0017 fn
        : granted.includes(token === "agent" ? "agentRo" : token);
      const got = await roleCanExecute(role, fn);
      if (got === null) { failures.push(`${fn}: MISSING`); break; }
      if (got !== want) failures.push(`${fn}: ${role} execute=${got}, matrix says ${want}`);
    }
  }
  assert.equal(failures.length, 0, `ACL divergences:\n${failures.join("\n")}`);
});

test("G2/[R1-F13a]: every CATALOG 0017-family fn outside the pinned matrix is an UNGRANTED internal", async () => {
  fail0017(live);
  const unpinned = inventory.filter((f) => !WB_ALL_FNS.includes(f));
  const offenders = [];
  for (const fn of unpinned) {
    for (const role of Object.values(ROLE_OF)) {
      if (await roleCanExecute(role, fn)) offenders.push(`${fn}: granted to ${role}`);
    }
  }
  assert.equal(offenders.length, 0,
    `unpinned family fns holding app grants (the sweep-escape class the memo proved):\n${offenders.join("\n")}`);
});

test("G2: THE AGENT ROLE GAINS ZERO EXECUTE ANYWHERE IN 0017 (matrix ∪ catalog; the 0016 tail law)", async () => {
  fail0017(live);
  for (const fn of sweepFns()) {
    const got = await roleCanExecute(ROLES.agentRo, fn);
    assert.ok(got === false || got === null, `clara_agent_ro must hold NO EXECUTE on ${fn}`);
  }
});

test("G3: wake authority — ZERO new allowlist rows for any 0017-family fn (matrix ∪ catalog)", async () => {
  fail0017(live);
  const r = await rootQuery(
    "select function_name from clara.wake_fn_allowlist where function_name = any($1::text[])", [sweepFns()]);
  assert.equal(r.rows.length, 0, `0017 fns in wake_fn_allowlist: ${r.rows.map((x) => x.function_name).join(",")}`);
});

// G4 — the per-writer op-key hash battery lives in wb-g-opkeys.test.mjs
// ([R2-F8]: the writer set is DERIVED from catalog bodies invoking _reserve_op,
// with a fixture or audited exemption per writer — no hand list).

test("G5(a): the constraint swaps re-verified live (clients/open_questions/coa/documents)", async () => {
  fail0017(live);
  const probe = async (table, conname, needle) => {
    const r = await rootQuery(
      `select pg_get_constraintdef(c.oid) as d from pg_constraint c
        join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
       where n.nspname='clara' and t.relname=$1 and c.conname=$2`, [table, conname]);
    assert.ok(r.rows.length, `${conname} exists on ${table}`);
    for (const s of [].concat(needle)) assert.ok(r.rows[0].d.includes(s), `${conname} ~ ${s}`);
  };
  await probe("clients", "clients_status_check_0017", "'onboarding'");
  await probe("open_questions", "open_questions_origin_check_0017", "'onboarding'");
  await probe("coa_accounts", "coa_accounts_special_acc_type_check", ["'opening_balance_equity'", "'retained_earnings'"]);
  await probe("documents", "documents_document_kind_check", "'prior_gl'");
  for (const c of ["ck_coa_obe_equity", "ck_coa_retained_earnings_equity"]) {
    const r = await rootQuery("select 1 from pg_constraint where conname=$1", [c]);
    assert.ok(r.rows.length, `${c} exists`);
  }
});

test("G5(b): prosrc asserts — pack v4 keys carried + wiki LAST, queue CoR keys, guard flip, firm wrap, prior_gl", async () => {
  fail0017(live);
  const pack = await fnSource("get_context_pack");
  // The live body's version literal is the CURRENT one, not 0017's: Wave E delta's residual surgery
  // rewrote 4 -> 5 when it spliced the period/snapshot registry block in. The 0017 shape this cell
  // is really about is carried by the purpose, wiki-block and ordering assertions below.
  assert.ok(pack.includes("'pack_schema_version',5"), "pack_schema_version 5 literal (delta's v5 splice)");
  assert.ok(pack.includes(WB_V7_PURPOSE), `[AMB-1] the v7 purpose literal ('${WB_V7_PURPOSE}') in prosrc`);
  assert.ok(pack.includes("'wiki'"), "the wiki block key");
  assert.ok(pack.includes("sst_registration_watch"), "v3 key CARRIED: sst_registration_watch");
  assert.ok(pack.includes("surface_and_request_professional_review_only"), "v3 key CARRIED: the framing literal");
  assert.ok(pack.indexOf("'wiki'") > pack.indexOf("sst_registration_watch"), "the wiki block is APPENDED LAST");
  const queue = await fnSource("list_review_queue");
  assert.ok(queue.includes("lint_finding"), "queue CoR: the lint_rows CTE");
  assert.ok(queue.includes("finding_id"), "queue CoR: the null-defaulted finding_id column");
  assert.ok(/status\s*=\s*'active'/.test(queue), "queue CoR: the WB-R1 guard predicate");
  assert.ok((await fnSource("_draft_entry_core")).includes("_assert_client_operational"),
    "_draft_entry_core rides the O2 allowlist guard");
  assert.ok((await fnSource("create_firm")).includes("consumed_op_key"), "create_firm receipt wrap");
  assert.ok((await fnSource("classify_document")).includes("prior_gl"), "classify_document knows prior_gl");
  assert.ok((await fnSource("set_document_kind")).includes("prior_gl"), "set_document_kind knows prior_gl");
});

test("G5(c): must-NOT greps — no sighting mint / rule loop in the K family; no autopost in the tick; no lint in _approve_entry_core", async () => {
  fail0017(live);
  for (const fn of ["approve_opening_seed", "_approve_opening_entry", "approve_opening_correction"]) {
    const src = await fnSource(fn);
    assert.ok(src.length > 0, `${fn} exists`);
    assert.ok(!src.includes("rule_sightings"), `${fn} contains NO rule_sightings insert (K13/WB-R2)`);
    assert.ok(!src.includes("kb_rule"), `${fn} contains NO kb_rule literal`);
  }
  assert.ok(!(await fnSource("tick_seeding_proposal")).includes("autopost"), "no autopost from seeding EVER");
  const core = await fnSource("_approve_entry_core");
  assert.ok(!core.includes("lint_"), "no lint logic inside _approve_entry_core");
});

test("G5(h): the PUBLIC sweep ran — no 0017-family fn (matrix ∪ catalog) is PUBLIC-executable", async () => {
  fail0017(live);
  const r = await rootQuery(`
    select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname = any($1::text[])
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'))`,
  [sweepFns()]);
  assert.equal(r.rows.length, 0, `PUBLIC-executable 0017 fns: ${r.rows.map((x) => x.proname).join(",")}`);
});

test("G8: back-compat — the 1-arg trial_balance is NEVER CoR'd; frozen taxonomy pointers unmoved", async () => {
  fail0017(live);
  const tb = await rootQuery(`
    select pg_get_function_identity_arguments(p.oid) as args, p.prosrc
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname='trial_balance'`);
  assert.equal(tb.rows.length, 1, "exactly one trial_balance overload (the sibling is trial_balance_as_of)");
  assert.ok(!tb.rows[0].args.includes("p_as_of"), "the 1-arg signature untouched");
  assert.ok(!tb.rows[0].prosrc.includes("p_as_of"), "the 1-arg body untouched (the pack prosrc assert depends on it)");
  const dec = async (t) => (await rootQuery(
    `select t.decision from clara.trigger_taxonomy t
      join clara.taxonomy_active a on a.version=t.version and a.singleton where t.event_type=$1`, [t])).rows[0]?.decision;
  assert.equal(await dec("compliance.watch_transition"), "notification", "0016 pointer unmoved");
  assert.equal(await dec("document.classified"), "ignore", "0016 pointer unmoved");
});
