// Slice-6 rig — DELTA PROBE (1): 0009 DDL surface, overload/ACL hygiene, the
// PUBLIC zero-execute sweep, the widened account_code domain + RPR codes, and the
// NOLOGIN write-login shell. Contract-blind: derived from the contract v1.3,
// companion §1/§6/§9, and INTERFACE-PINS §1 — NEVER from 0009's source. Every
// test SKIPS until the 0009 surface lands (s6Ready), then turns green.
//
// Companion §11 probe (1) VERBATIM: "VERIFY-ON-RIG exact 0009 DDL compile on
// fresh AND 0001->0008 databases; pg_proc overload/ACL dump; PUBLIC zero-execute
// sweep." The fresh-vs-upgraded COMPILE half lives in s6-upgrade.test.mjs (it
// resets the DB, so it is reset-gated + runs alone); THIS file asserts the
// resulting SHAPE on the shared throwaway.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  rootQuery,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  opk,
  S6_NEW_TABLES,
  S6_GRANTED_FNS,
  S6_UNGRANTED_FNS,
  S6_EVENT_TYPES,
  RPR_VALID_CODES,
  RPR_HOSTILE_CODES,
  WRITE_LOGIN,
  CODING_TASKS_VIEW,
  upsertPayableAccount,
  upsertAccountClassed,
  PG,
  assertRaisesOneOf,
} from "./s6-helpers.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = await s6EnsureReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("s6-schema");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

async function checkDefs(table) {
  const r = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname=$1 and c.contype='c'`,
    [table],
  );
  return r.rows.map((x) => x.def).join(" ~~ ");
}
async function columnsOf(table) {
  const r = await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name=$1",
    [table],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

// ===========================================================================
// New tables + FORCE RLS (companion §1 / §2 / §4 / §5).
// ===========================================================================

test("§1 the five new tables all exist and are FORCE-RLS (companion §1: counterparties, coding_tasks, entry_evidence, coding_attempts, processing_call_reservations)", async (t) => {
  if (unready(t)) return;
  const rows = await rootQuery(
    "select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind='r'",
  );
  const present = new Map(rows.rows.map((r) => [r.relname, r]));
  for (const t2 of S6_NEW_TABLES) {
    const r = present.get(t2);
    assert.ok(r, `clara.${t2} exists (companion §1)`);
    assert.ok(r.rls && r.force, `clara.${t2}: FORCE RLS required (rls=${r?.rls} force=${r?.force})`);
  }
  // The masked coding-tasks view exists (house _visible pattern).
  const v = await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind in ('v','m')",
    [CODING_TASKS_VIEW],
  );
  assert.equal(v.rowCount, 1, `clara.${CODING_TASKS_VIEW} masked view exists`);
});

test("§2 altered columns: journal_lines.counterparty_id; journal_entries.proposed_counterparty/match_fingerprint/coding_kind; coa_accounts.account_class", async (t) => {
  if (unready(t)) return;
  assert.ok((await columnsOf("journal_lines")).has("counterparty_id"), "journal_lines.counterparty_id added (composite FK)");
  const je = await columnsOf("journal_entries");
  for (const c of ["proposed_counterparty", "match_fingerprint", "coding_kind"]) {
    assert.ok(je.has(c), `journal_entries.${c} added (§2 / NEW-2)`);
  }
  assert.ok((await columnsOf("coa_accounts")).has("account_class"), "coa_accounts.account_class added (§2 payable designation)");
});

test("§2 CHECK domains: coding_kind admits 'supplier_bill'; account_class admits 'payable'", async (t) => {
  if (unready(t)) return;
  assert.ok((await checkDefs("journal_entries")).includes("'supplier_bill'"), "journal_entries.coding_kind CHECK admits 'supplier_bill'");
  assert.ok((await checkDefs("coa_accounts")).includes("'payable'"), "coa_accounts.account_class CHECK admits 'payable'");
});

test("§5 lane + engine_kind CHECKs gain 'invoice_facts'", async (t) => {
  if (unready(t)) return;
  assert.ok((await checkDefs("document_processing_tasks")).includes("'invoice_facts'"), "document_processing_tasks.lane CHECK gains 'invoice_facts'");
  assert.ok((await checkDefs("document_extractions")).includes("'invoice_facts'"), "document_extractions.engine_kind CHECK gains 'invoice_facts'");
});

// ===========================================================================
// §6 — account_code domain widened DELIBERATELY. Existing data passes; every
// reviewed RPR code shape passes; hostile inputs still fail.
// ===========================================================================

test("§6 account_code CHECK is widened to admit RPR-style codes AND still rejects hostile inputs (C-16)", async (t) => {
  if (unready(t)) return;
  const defs = await checkDefs("coa_accounts");
  // The widened alternation must be present (both legacy 4–8 digit AND NNN-XX form).
  assert.ok(/\[0-9\]\{3\}-\[0-9A-Z\]/.test(defs) || defs.includes("100-"), `account_code CHECK widened to the NNN-XX grammar (defs: ${defs.slice(0, 240)})`);

  const { users, clients } = world;
  // Functional: every reviewed RPR code loads through the governed writer.
  for (const code of RPR_VALID_CODES) {
    await upsertAccountClassed(users.alice, { client: clients.A1, code, name: `acct ${code}`, type: "asset", opKey: opk("rpr") });
  }
  const loaded = await rootQuery("select account_code from clara.coa_accounts where client_id=$1", [clients.A1]);
  const have = new Set(loaded.rows.map((r) => r.account_code));
  for (const code of RPR_VALID_CODES) assert.ok(have.has(code), `RPR-valid code ${code} loaded (widened domain)`);

  // Hostile inputs still refused (23514 CHECK or CLR10 from the writer's own guard).
  for (const bad of RPR_HOSTILE_CODES) {
    await assertRaisesOneOf(
      [PG.checkViolation, "CLR10"],
      () => upsertAccountClassed(users.alice, { client: clients.A2, code: bad, name: "hostile", type: "asset", opKey: opk("hostile") }),
      `hostile account_code ${JSON.stringify(bad)} rejected`,
    );
  }
});

test("§6 upsert_account carries p_account_class: a payable control account loads with account_class='payable'", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  await upsertPayableAccount(users.alice, { client: clients.A1, code: "400-000", name: "Trade Creditors", opKey: opk("ap") });
  const r = await rootQuery("select account_class, account_type from clara.coa_accounts where client_id=$1 and account_code=$2", [clients.A1, "400-000"]);
  assert.equal(r.rows[0]?.account_class, "payable", "payable account carries account_class='payable'");
  assert.equal(r.rows[0]?.account_type, "liability", "the payable control account is a liability type");
});

// ===========================================================================
// C-1 — overload + ACL hygiene. Recreated writers hold exactly ONE overload;
// no clara function carries a PUBLIC EXECUTE (the migration-tail belt).
// ===========================================================================

test("C-1 the arity-changed writers hold EXACTLY ONE overload each (DROP+CREATE, never CREATE OR REPLACE across arity)", async (t) => {
  if (unready(t)) return;
  for (const fn of ["wake_draft_entry", "draft_entry", "upsert_account", "_draft_entry_core", "approve_entry", "reverse_entry", "approve_wrong_client_correction"]) {
    const r = await rootQuery(
      "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1",
      [fn],
    );
    assert.equal(r.rows[0].n, 1, `clara.${fn} has exactly ONE overload (got ${r.rows[0].n}) — an unqualified call must never throw 42725`);
  }
});

test("C-1 PUBLIC has ZERO execute on every clara function (the migration-tail belt sweep)", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara'
        and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'))`,
  );
  assert.equal(r.rowCount, 0, `no clara fn carries a PUBLIC EXECUTE (offenders: ${r.rows.map((x) => x.proname).join(", ")})`);
});

// ===========================================================================
// §9 — grants delta (verbatim). New granted fns land on their lanes ONLY; the
// internal helpers are granted to no app role; agent_ro LOSES get_journal_entry.
// ===========================================================================

test("§9 the new granted fns hold EXACTLY their lane grants; internal helpers hold none", async (t) => {
  if (unready(t)) return;
  const ALL = [ROLES.authenticated, ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const [fn, lanes] of Object.entries(S6_GRANTED_FNS)) {
    const present = await rootQuery(
      "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1",
      [fn],
    );
    if (!present.rowCount) { assert.fail(`clara.${fn} is ABSENT (companion §1/§7 names it — finding)`); }
    for (const role of ALL) {
      const ok = (await rootQuery(
        `select has_function_privilege($1, p.oid, 'execute') as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$2 limit 1`,
        [role, fn],
      )).rows[0].ok;
      const expected = lanes.includes(role);
      assert.equal(ok, expected, `${role} EXECUTE clara.${fn}: expected ${expected}, got ${ok}`);
    }
  }
  for (const fn of S6_UNGRANTED_FNS) {
    for (const role of ALL) {
      const row = await rootQuery(
        `select has_function_privilege($1, p.oid, 'execute') as ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$2 limit 1`,
        [role, fn],
      );
      if (!row.rowCount) { noteLane(`${fn} absent — internal-helper name may differ (interface expectation)`); continue; }
      assert.equal(row.rows[0].ok, false, `${role} must NOT execute internal helper clara.${fn}`);
    }
  }
});

test("§9 C-11: clara_agent_ro LOSES get_journal_entry(uuid); the human grant is unchanged", async (t) => {
  if (unready(t)) return;
  const oid = (await rootQuery("select to_regprocedure('clara.get_journal_entry(uuid)') as oid")).rows[0].oid;
  assert.ok(oid, "clara.get_journal_entry(uuid) still exists");
  const agent = (await rootQuery("select has_function_privilege($1, 'clara.get_journal_entry(uuid)', 'execute') as ok", [ROLES.agentRo])).rows[0].ok;
  const human = (await rootQuery("select has_function_privilege($1, 'clara.get_journal_entry(uuid)', 'execute') as ok", [ROLES.authenticated])).rows[0].ok;
  assert.equal(agent, false, "clara_agent_ro no longer executes get_journal_entry(uuid) — closes the same-firm entry oracle (C-11)");
  assert.equal(human, true, "the human lane keeps get_journal_entry(uuid)");
});

// ===========================================================================
// §10/§5 — the NOLOGIN write-login shell, single-membership (SET TRUE, INHERIT
// FALSE) of clara_wake_interactive alone.
// ===========================================================================

test("§5/§10 clara_wake_write_login is NOLOGIN, member of clara_wake_interactive ALONE (SET TRUE, INHERIT FALSE)", async (t) => {
  if (unready(t)) return;
  const role = (await rootQuery("select rolcanlogin, rolinherit from pg_roles where rolname=$1", [WRITE_LOGIN])).rows;
  assert.equal(role.length, 1, `${WRITE_LOGIN} role exists`);
  assert.equal(role[0].rolcanlogin, false, `${WRITE_LOGIN} is NOLOGIN in-migration (LOGIN enabled only at the operator ceremony)`);

  const mem = await rootQuery(
    `select g.rolname as grp, m.inherit_option, m.set_option
       from pg_auth_members m
       join pg_roles r on r.oid=m.member
       join pg_roles g on g.oid=m.roleid
      where r.rolname=$1`,
    [WRITE_LOGIN],
  );
  assert.equal(mem.rowCount, 1, `${WRITE_LOGIN} is a member of EXACTLY ONE group (single-membership law) — got ${mem.rows.map((x) => x.grp).join(", ")}`);
  assert.equal(mem.rows[0].grp, ROLES.wakeInteractive, `${WRITE_LOGIN}'s single membership is clara_wake_interactive`);
  assert.equal(mem.rows[0].inherit_option, false, "INHERIT FALSE (no ambient books-writer privilege)");
  assert.equal(mem.rows[0].set_option, true, "SET TRUE (may SET ROLE clara_wake_interactive)");
});

// ===========================================================================
// P5 / companion §1 — the seven new event types are registered (the additive
// taxonomy pair is asserted in s6-tasks.test.mjs; here: the types exist at all).
// ===========================================================================

test("companion §1 the seven new event types are registered in clara.event_types", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery("select name from clara.event_types where name = any($1)", [S6_EVENT_TYPES]);
  const have = new Set(r.rows.map((x) => x.name));
  for (const et of S6_EVENT_TYPES) assert.ok(have.has(et), `event_type '${et}' registered`);
});
