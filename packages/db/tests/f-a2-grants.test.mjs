// F-A2 PR-1 — Annex C.12: GRANTS AND CENSUS.
//
// Gated on `f_a2_posting_grants$` — PR-1's SECOND file, which is where the granted wrapper, its
// single grant, the allowlist rows, the zero-grant re-pin and the census tail live. Two cells
// are UNGATED because they assert something that must be true at every frontier: the
// `_approve_entry_core` zero-grant pin, and the shape of the app-executable-DML census itself.
//
// THE GRANT SPLIT IS THE SEAM, and it is why S1 was chosen over S2 and S3. The ladder sits in
// the POST VERB's own ungranted core, so no sequence of tool calls can post a draft that should
// not post: there is no alternate entry point to reach `_approve_entry_core` from an app role.
// A grant that leaked onto the core, or a second overload of the wrapper, would quietly reopen
// exactly that door — and neither shows up in any behavioural cell, because behaviour through
// the front door stays correct. That is what makes this file's cheap catalog reads load-bearing.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, noteLane, ROLES,
  gateGrants, gateCore, F_A2_POST_VERBS, F_A2_STEMS,
} from "./f-a2-post-world.mjs";

after(async () => {
  printLaneNotes("f-a2-grants");
  printSkipCount("f-a2-grants");
  await endPool();
});

/** Every clara-custom role that holds EXECUTE on a function, by exact identity. Reads the
 *  CATALOG through `has_function_privilege` — the instrument the server itself uses — rather
 *  than parsing `proacl`, which is empty when the default PUBLIC grant is still in place and
 *  therefore reads as "nobody" exactly when it means "everybody". */
async function executors(signature) {
  const r = await rootQuery(
    `select r.rolname from pg_roles r
      where r.rolname like 'clara%'
        and has_function_privilege(r.rolname, $1::regprocedure, 'EXECUTE')
      order by r.rolname`, [signature]);
  return r.rows.map((x) => x.rolname);
}
async function publicHas(signature) {
  const r = await rootQuery(
    "select has_function_privilege('public', $1::regprocedure, 'EXECUTE') as ok", [signature]);
  return r.rows[0].ok;
}
async function overloadsOf(name) {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=$1 order by 1`, [name]);
  return r.rows.map((x) => x.sig);
}

/**
 * The app-executable-DML census against `clara.journal_entries`, MEASURED BY RIG REPLAY at the
 * pre-F-A2 frontier (0001-0102, throwaway postgres:17, 2026-08-22). "Did not grow" is only a
 * claim if there is a before-state, and a census with no baseline is a number, not evidence.
 *
 * FIFTEEN members, and the cell's claim is that F-A2 adds a SIXTEENTH to none of them. The
 * wrapper raises only and carries no DML; the core that writes is ungranted; the deferred receipt
 * wall is a trigger function no role executes directly. If any of those three slips, this census
 * grows and says which one.
 *
 * The cell also carries a POSITIVE CONTROL, because a census returning a short list is the same
 * shape as a probe that measured nothing: with the app-role filter dropped, the same detector must
 * still find writers. A read that cannot say NO has a meaningless YES.
 */
const APP_DML_CENSUS_PRE_F_A2 = [
  "clara.accept_bank_rule_suggestion(uuid,uuid,uuid,text)",
  "clara.approve_wrong_client_correction(uuid,text,text,text)",
  "clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)",
  "clara.cancel_pair_reversal(uuid,uuid,text,text)",
  "clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)",
  "clara.finalize_close(uuid,text,text)",
  "clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)",
  "clara.persist_witness_facts(uuid,jsonb,jsonb,integer)",
  "clara.reopen_fiscal_year(uuid,text,jsonb,text,text)",
  "clara.resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)",
  "clara.reverse_entry(uuid,text,text)",
  "clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)",
  "clara.supersede_opening_item(uuid,jsonb,text)",
  "clara.unmatch_bank_match(uuid,uuid,text,text)",
  "clara.withdraw_draft(uuid,text,uuid,text)",
];

/** The app roles a human or the runtime can actually reach. `clara_fn_owner` is excluded on
 *  purpose — it owns the definers, so it can reach everything by construction, and including it
 *  would make the census say "everything is app-executable" and mean nothing. */
const APP_ROLES = [ROLES.authenticated, ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive];

/** Functions an APP role may EXECUTE whose body writes `clara.journal_entries`. */
async function appDmlCensus() {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig, p.proname
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara'
        and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+clara\\.journal_entries'
      order by 1`);
  const out = [];
  for (const row of r.rows) {
    const who = await executors(row.sig);
    if (who.some((w) => APP_ROLES.includes(w))) out.push(row.sig);
  }
  return out.sort();
}

// ===========================================================================
// The wrapper's single grant.
// ===========================================================================

test("f-a2.c12.wrapper wake_post_entry is executable by clara_wake_interactive and NOTHING else", async (t) => {
  if (await gateGrants(t)) return;
  const sigs = await overloadsOf("wake_post_entry");
  assert.equal(sigs.length, 1, `c12.wrapper: exactly ONE overload (found ${sigs.length}: ${sigs.join(" | ")}). A second overload is a second door with its own grant`);
  const who = await executors(sigs[0]);
  assert.deepEqual(who.filter((x) => x !== "clara_fn_owner" && !/_login$/.test(x)), [ROLES.wakeInteractive],
    `c12.wrapper: exactly one group role holds EXECUTE (got ${who.join(", ")})`);
  assert.equal(await publicHas(sigs[0]), false, "c12.wrapper: PUBLIC holds nothing");
  const logins = who.filter((x) => /_login$/.test(x));
  if (logins.length) {
    noteLane(`c12.wrapper: LOGIN roles reaching the wrapper by group membership: ${logins.join(", ")} — recorded, because a login-direct grant is a DIFFERENT posture from a group grant and the estate already carries both (the executor's login-direct grant vs reconcile's group grant)`);
  }
});

test("f-a2.c12.core the ungranted core really is UNGRANTED", async (t) => {
  if (await gateGrants(t)) return;
  for (const name of ["_agent_post_entry_core", "_tf_assert_agent_post_receipt"]) {
    const sigs = await overloadsOf(name);
    assert.equal(sigs.length, 1, `c12.core: ${name} has exactly one overload (found ${sigs.join(" | ")})`);
    assert.equal(await publicHas(sigs[0]), false, `c12.core: PUBLIC holds nothing on ${name}`);
    const who = (await executors(sigs[0])).filter((x) => x !== "clara_fn_owner");
    assert.deepEqual(who, [],
      `c12.core: NO app role reaches ${name} (got ${who.join(", ")}). The whole S1 argument is that the ladder has no alternate entry point`);
  }
});

test("f-a2.c12.agent-ro clara_agent_ro holds NOTHING in the posting lane", async (t) => {
  if (await gateGrants(t)) return;
  for (const name of F_A2_POST_VERBS) {
    const sigs = await overloadsOf(name);
    // PRESENCE FIRST. "No role can execute it" is trivially true of a function that does not
    // exist, and a loop over an empty list is the classic vacuous green — the exact absence-as-
    // evidence shape this repo keeps paying for.
    assert.ok(sigs.length > 0,
      `c12.agent-ro: clara.${name} EXISTS, so the privilege read below has something to be false about`);
    for (const sig of sigs) {
      assert.equal(
        (await rootQuery("select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok",
          [ROLES.agentRo, sig])).rows[0].ok, false,
        `c12.agent-ro: the READ-ONLY agent role cannot execute ${sig}. A read role that can post is not a read role`);
    }
  }
});

test("f-a2.c12.approve-core-pin _approve_entry_core's zero-grant pin still holds", async () => {
  // UNGATED, on purpose. This pin (0015:3592-3596) predates F-A2 and must hold at every
  // frontier; F-A2 recuts that body as its 8th, and the single cheapest way for a body recut to
  // go wrong is for the recreate to drop the REVOKE and leave the default PUBLIC grant standing.
  // A cell gated on F-A2 could not tell "the pin held" from "F-A2 is not applied".
  const sigs = await overloadsOf("_approve_entry_core");
  if (!sigs.length) { noteLane("c12.approve-core-pin: _approve_entry_core is absent at this frontier"); return; }
  for (const sig of sigs) {
    assert.equal(await publicHas(sig), false, `c12.approve-core-pin: PUBLIC holds nothing on ${sig}`);
    const who = (await executors(sig)).filter((x) => x !== "clara_fn_owner");
    assert.deepEqual(who, [], `c12.approve-core-pin: and no app role does either (got ${who.join(", ")}) — ${sig}`);
  }
});

// ===========================================================================
// The censuses.
// ===========================================================================

test("f-a2.c12.dml-census the app-executable-DML census against journal_entries did NOT grow", async (t) => {
  if (await gateCore(t)) return;
  // THE POSITIVE CONTROL FIRST. The census below is expected to be EMPTY, which is also exactly
  // what a broken probe returns — so the same query, minus the app-role filter, must find the
  // ungranted cores. If this control finds nothing, the census that follows proves nothing and
  // the cell says so instead of reporting a green.
  const anyWriter = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara'
        and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+clara\\.journal_entries'`);
  assert.ok(anyWriter.rows[0].n > 0,
    "c12.dml-census POSITIVE CONTROL: the detector finds journal_entries writers when the app-role filter is dropped. A read that cannot say NO has a meaningless YES");

  const live = await appDmlCensus();
  const grew = live.filter((s) => !APP_DML_CENSUS_PRE_F_A2.includes(s));
  assert.deepEqual(grew, [],
    `c12.dml-census: F-A2 adds NO new app-executable path that writes journal_entries. New: ${grew.join(", ")} — the wrapper raises only, and the core that writes is ungranted`);
  const shrank = APP_DML_CENSUS_PRE_F_A2.filter((s) => !live.includes(s));
  if (shrank.length) noteLane(`c12.dml-census: the census SHRANK by ${shrank.join(", ")} — retirement is PR-3's, so a shrink at PR-1 is a finding worth reading`);
});

test("f-a2.c12.public-zero PUBLIC holds ZERO and every touched function carries exactly ONE overload", async (t) => {
  if (await gateGrants(t)) return;
  const TOUCHED = [
    ...F_A2_POST_VERBS,
    "_approve_entry_core", "_draft_entry_core",
    "_assert_control_leg_counterparty_at",
    "_assert_supplier_bill_shape_at", "_assert_sales_invoice_shape_at",
    "_assert_supplier_bill_shape", "_assert_sales_invoice_shape",
    "_tf_assert_supplier_bill_shape", "_tf_assert_sales_invoice_shape",
  ];
  for (const name of TOUCHED) {
    const sigs = await overloadsOf(name);
    if (!sigs.length) {
      // The three F-A2 verbs MUST exist once the grants file is applied; everything else on this
      // list is pre-existing or newly-extracted and may legitimately carry another live identity,
      // which is a note for integration rather than a failure here.
      assert.ok(!F_A2_POST_VERBS.includes(name),
        `c12.public-zero: clara.${name} is one of F-A2's OWN verbs and must exist once ${F_A2_STEMS.grants} is applied`);
      noteLane(`c12.public-zero: clara.${name} is absent — record its live identity at integration rather than assuming a rename`);
      continue;
    }
    assert.equal(sigs.length, 1,
      `c12.public-zero: clara.${name} carries exactly ONE overload (found ${sigs.length}: ${sigs.join(" | ")}). A stray second overload is how a "recreate" silently leaves the old body callable`);
    assert.equal(await publicHas(sigs[0]), false, `c12.public-zero: PUBLIC holds nothing on ${sigs[0]}`);
  }
});

test("f-a2.c12.allowlist the posting allowlist rows are exactly the posting wake kinds — proactive never among them", async (t) => {
  if (await gateGrants(t)) return;
  const r = await rootQuery(
    `select wake_kind from clara.wake_fn_allowlist
      where coalesce(fn_name, function_name)='wake_post_entry' order by wake_kind`);
  const kinds = r.rows.map((x) => x.wake_kind);
  assert.ok(kinds.length > 0, "c12.allowlist: wake_post_entry carries at least one allowlist row, or the wrapper is unreachable by anyone");
  assert.ok(!kinds.includes("proactive"),
    `c12.allowlist: 'proactive' is NEVER a posting kind — single-use is that kind's defining property and it is unrelated to posting (got ${kinds.join(", ")})`);
  assert.ok(!kinds.includes("interactive_client"),
    `c12.allowlist: and neither is 'interactive_client' — per R-1 it is minted for wake_open_question ALONE, and a second allowlist row is exactly how it would quietly become a posting kind (got ${kinds.join(", ")})`);
  for (const k of kinds) {
    assert.ok(["autodraft", "interactive"].includes(k),
      `c12.allowlist: every posting kind is one Annex E.1's via_wake_kind CHECK also admits (got '${k}')`);
  }
  noteLane(`c12.allowlist: wake_post_entry allowlist kinds = ${kinds.join(", ")}. Any live test mirroring 0011:4170-4175's "exactly 6 autodraft rows" count must be TRUED when this row joins (§D.5)`);
});

test("f-a2.c12.relations every relation the battery asserts against is NAMED FROM THE CATALOG", async () => {
  // v6.1's C.12 addition, and it is on the record because this battery got it wrong: two cells
  // joined `clara.chart_of_accounts` on a column `code`. Neither exists. The accounts relation is
  // `clara.coa_accounts`, keyed `(client_id, account_code)`, which is how the live supplier floor
  // spells it (`0036:621`) — and a 42P01/42703 raised by a TEST reads like a fixture problem when
  // it is really the test asserting against a table that was never there.
  //
  // UNGATED, because the point is to hold at EVERY frontier: a relation the battery invents is
  // wrong before F-A2 lands as well as after. Names resolve through `to_regclass`, the instrument
  // the server itself uses, and the ABSENT names are asserted absent too — otherwise this cell
  // could pass by naming nothing.
  const MUST_EXIST = [
    "clara.coa_accounts", "clara.journal_entries", "clara.journal_lines", "clara.entry_evidence",
    "clara.document_regions", "clara.document_extractions", "clara.document_processing_tasks",
    "clara.document_filings", "clara.documents", "clara.counterparties", "clara.open_questions",
    "clara.sweep_run_items", "clara.sweep_runs", "clara.agent_tasks", "clara.op_receipts",
    "clara.domain_events", "clara.audit_log", "clara.wake_credentials", "clara.wake_fn_allowlist",
    "clara.rule_sightings", "clara.coding_rules", "clara.rule_decisions", "clara.schema_migrations",
  ];
  for (const rel of MUST_EXIST) {
    const r = await rootQuery("select to_regclass($1) as rel", [rel]);
    assert.ok(r.rows[0].rel, `c12.relations: ${rel} EXISTS — the battery asserts against it`);
  }
  // The NEGATIVE half: names this battery must never reach for again.
  for (const ghost of ["clara.chart_of_accounts", "clara.accounts", "clara.entry_post_receipt"]) {
    const r = await rootQuery("select to_regclass($1) as rel", [ghost]);
    assert.equal(r.rows[0].rel, null,
      `c12.relations: ${ghost} does NOT exist — a name a test invented fails as a fixture bug, never as a finding`);
  }
  // The COLUMN half, because the relation name alone was only half the mistake.
  const col = await rootQuery(
    `select count(*)::int as n from information_schema.columns
      where table_schema='clara' and table_name='coa_accounts' and column_name = any($1)`,
    [["account_code", "account_class", "account_type", "special_acc_type"]]);
  assert.equal(col.rows[0].n, 4,
    "c12.relations: coa_accounts carries account_code / account_class / account_type / special_acc_type — there is no bare `code` column");
});
