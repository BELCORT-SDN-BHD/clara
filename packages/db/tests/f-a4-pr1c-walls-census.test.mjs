// F-A4 PR-1c close-domain agent limb, part 2: law 71, Tier C, oracles, parity and census.
// Part 1 is f-a4-pr1c-close-agent-limb.test.mjs; both share f-a4-pr1c-fixtures.mjs.
// CONTRACT-BLIND: every claim reads the LIVE catalog or behaviour, never migration text.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, getPool, endPool, printLaneNotes, printSkipCount,
  noteLane, markSkip, opk,
} from "./wave-a-fixtures.mjs";
import { ROLES, CLR, PG, asRole } from "./rig-helpers.mjs";
import { beginClose } from "./x56-fixtures.mjs";
import {
  WRAPPERS, PARKED_WRAPPER, RATIONALE, MODEL, caught, derivedOpKey, callWake,
  mintClosePrepSession, VERBS, receiptById, tokens, ensureLimb, limbGate, scene,
} from "./f-a4-pr1c-fixtures.mjs";
import { assertPR2CWallCensus } from "./f-a4-pr2c-fixtures.mjs";
const gate = (t) => limbGate(t, markSkip);
before(async () => { await ensureLimb(noteLane); });
after(async () => {
  printLaneNotes("f-a4-pr1c-walls");
  printSkipCount("f-a4-pr1c-walls");
  await endPool();
});
// D -- LAW 71. begin/abandon/open-year/snapshot-mint are hers; finalize/reopen/attest remain
// human forever. Four instruments prove structural unreachability independently.
test("fa4c.D1 law 71: no wake verb can finalize, reopen or attest -- not by allowlist, not by grant, not by call graph, not by capability", async (t) => {
  if (gate(t)) return;
  // (a) NO allowlist row admits a reserved act under ANY wake kind.
  const rows = await rootQuery(
    `select wake_kind, function_name from clara.wake_fn_allowlist
      where function_name ~ 'finaliz|reopen|attest'`);
  assert.deepEqual(rows.rows, [], "the allowlist names no reserved act, for any kind");
  // (b) NO wake or agent role holds EXECUTE on a reserved human door, nor on the human close verbs.
  const acl = await rootQuery(
    `select p.proname, a.grantee::regrole::text as grantee
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname='clara'
        and p.proname in ('finalize_close','reopen_fiscal_year','attest_close_exception',
                          'begin_close','abandon_close','hold_close_prep','release_close_prep',
                          'settle_close_proposal')
        and a.privilege_type='EXECUTE'
        and a.grantee::regrole::text in ('clara_wake_interactive','clara_wake_proactive',
                                         'clara_agent_ro','clara_runtime')`);
  assert.deepEqual(acl.rows, [],
    "no wake, agent or runtime role executes a human close door -- including the HOLD, which the lane must not be able to lift off itself, and the SETTLE door, which it must not be able to work on its own proposal");

  // (c) NO clara.wake_* body CALLS a reserved act, read off the live prosrc.
  const calls = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname like 'wake!_%' escape '!'
        and p.prosrc ~ '(finalize_close|reopen_fiscal_year|attest_close_exception)\\s*\\('`);
  assert.deepEqual(calls.rows, [], "no wake wrapper reaches a reserved act in its own body");

  // (d) NOR does any close agent core this PR ships.
  const cores = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname ~ '^_agent_.*(close|fiscal_year|snapshot|depreciation)'
        and p.prosrc ~ '(finalize_close|reopen_fiscal_year|attest_close_exception)\\s*\\('`);
  assert.deepEqual(cores.rows, [], "and no close agent core does either");

  // (e) The AGENT IDENTITY holds no close capability anywhere -- §3.1's entrance seam depends on
  // that being structurally unsatisfiable, not merely unseeded today.
  //
  // WITH A POSITIVE CONTROL (fix round, N7). Asserting zero against a table that may simply be
  // empty is only non-vacuous by suite ORDER -- run this file alone and the cell passes without
  // the query having discriminated anything. So a real grant is planted for a REAL human first:
  // now the table demonstrably holds rows, the agent-scoped read still returns none, and the zero
  // means "not the agent" rather than "not anybody".
  const w = await scene("d1ctl");
  await humanQuery(w.alice, "select clara.grant_firm_capability($1,$2,$3,$4) as r",
    [w.bob, "close_and_attest", "fa4c d1: a positive control for the agent-capability census",
      opk("fa4c-d1-ctl")]);
  const anyGrant = await rootQuery(
    "select count(*)::int as n from clara.firm_capability_grants where revoked_at is null");
  assert.ok(anyGrant.rows[0].n >= 1,
    "the capability table HOLDS live rows, so the agent-scoped zero below is a discrimination");
  const cap = await rootQuery(
    `select 1 from clara.firm_capability_grants
      where user_id = clara.agent_user_id() and revoked_at is null`);
  assert.equal(cap.rows.length, 0, "and no capability row exists for the agent identity");
});

test("fa4c.D1.pr2c additive census: chat minter ACL, exact rows, shared grant, and every wake role's wall", async (t) => {
  if (gate(t)) return;
  const live = await rootQuery(`select to_regprocedure(
    'clara.mint_chat_close_credential(uuid,uuid,uuid,uuid,interval)') is not null as live`);
  if (!live.rows[0].live) {
    markSkip(); t.skip("F-A4 PR-2c is wholly absent; the PR-1c-only census remains valid"); return;
  }
  await assertPR2CWallCensus();
});

test("fa4c.D2 the entrance seam holds for HUMANS too: a bookkeeper without close_and_attest is still refused CLR04, while the agent path succeeds on the same firm", async (t) => {
  if (gate(t)) return;
  const sc = await scene("d2");
  // bob is a bookkeeper with no close capability granted; alice is the owner (capability implied
  // by literal firm-owner membership, 0056:1114-1126).
  const refused = await caught(() => beginClose(sc.bob, { fy: sc.fy }));
  assert.equal(refused?.code, CLR.authz, "the human wall is unmoved by PR-1c's additive layer");
  assert.match(String(refused?.detail ?? ""), /capability_missing/);
  const ok = await VERBS.begin(sc.s, { fy: sc.fy });
  assert.equal(ok.status, "acted", "neither entrance reaches the other's wall");
});

// =====================================================================================
// E -- TIER C: no receipt, no act.
// =====================================================================================

test("fa4c.E1 the deferred wall refuses an agent-authored close run whose receipt is suppressed, at COMMIT", async (t) => {
  if (gate(t)) return;
  const sc = await scene("e1");
  const c = await getPool().connect();
  let err = null;
  try {
    await c.query("begin");
    await c.query("set role clara_fn_owner");
    // A hand-built agent-authored run with NO agent_act_receipts row: exactly the state the wall
    // exists to catch. It INSERTs fine (the trigger is DEFERRED) and dies at COMMIT.
    await c.query(
      `insert into clara.close_runs(firm_id, client_id, fiscal_year_id, started_by)
         values ($1,$2,$3, clara.agent_user_id())`, [sc.firm, sc.client, sc.fy]);
    await c.query("commit");
  } catch (e) {
    err = e;
    try { await c.query("rollback"); } catch { /* already aborted */ }
  } finally {
    try { await c.query("reset role"); } catch { /* best effort */ }
    try { await c.query("reset all"); } catch { /* best effort */ }
    c.release();
  }
  assert.ok(err, "the commit was refused");
  assert.equal(err.code, CLR.immutable, "CLR08 -- no receipt, no act");
  assert.match(String(err.detail ?? ""), /close_agent_receipt_missing/);
  const n = await rootQuery("select count(*)::int as n from clara.close_runs where client_id=$1", [sc.client]);
  assert.equal(n.rows[0].n, 0, "and nothing durable survived");
});

test("fa4c.E2 a HUMAN-authored close run owes no agent receipt (the wall reads users.is_agent, not a name)", async (t) => {
  if (gate(t)) return;
  const sc = await scene("e2");
  const run = await beginClose(sc.alice, { fy: sc.fy });
  assert.ok(run.close_run_id, "a human begin commits with no agent receipt at all");
  const n = await rootQuery(
    "select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [sc.client]);
  assert.equal(n.rows[0].n, 0, "and none was written");
});

// =====================================================================================
// F -- THE ORACLES AND THE PARITY READS.
// =====================================================================================

test("fa4c.F1 C-19's positive control, RE-CUT: BOTH live due oracles are unreachable from the wake lane, and both additive ungranted cores answer", async (t) => {
  if (gate(t)) return;
  const sc = await scene("f1");
  const firmOfClient = "(select firm_id from clara.clients where id=$1)";

  // THE DESIGN'S C-19 EXPECTED ONE REFUSAL AND ONE ANSWER. Measured at the live frontier, BOTH
  // oracles refuse a wake session, and adjustment_run_due refuses one rung EARLIER than the gate
  // predicted: clara_wake_interactive holds no EXECUTE on either verb at all, so the ACL (42501)
  // answers before _assert_due_read_ctx's CLR03 ever runs. Either refusal proves the same fact --
  // the live verb cannot be called from this lane -- so the cell asserts UNREACHABILITY by the two
  // codes that mean it, and records which one actually fired rather than pinning the gate's guess.
  const both = ["adjustment_run_due", "depreciation_run_due"];
  for (const o of both) {
    const raised = await caught(() => roleQuery(ROLES.wakeInteractive,
      `select clara.${o}($1) as r`, [sc.client]));
    assert.ok(raised, `${o} refuses a wake session`);
    assert.ok([PG.insufficientPrivilege, CLR.wake].includes(raised.code),
      `${o} refuses by ACL (42501) or by admission (CLR03), not by answering: got ${raised.code}`);
  }

  // BOTH ungranted cores answer, reached from the definer chain exactly as rung B13 reaches them.
  const adj = await rootQuery(
    `select clara._adjustment_run_due_core($1, ${firmOfClient}) as r`, [sc.client]);
  assert.equal(adj.rows[0].r.due, false, "the ADJ core answers rather than raising");
  assert.ok("blocked" in adj.rows[0].r, "in the oracle's own ABI shape, not a new one");
  const fa = await rootQuery(
    `select clara._depreciation_run_due_core($1, ${firmOfClient}) as r`, [sc.client]);
  assert.equal(fa.rows[0].r.due, false, "and so does the FA core");
  assert.equal(fa.rows[0].r.reason, "authority_not_live",
    "with _fa_oldest_unmet_period's own envelope, unchanged by the extraction");

  // Neither core is app-callable by anybody (the extractions add no reach).
  for (const sig of ["clara._adjustment_run_due_core(uuid,uuid)", "clara._depreciation_run_due_core(uuid,uuid)"]) {
    const acl = await rootQuery(
      `select a.grantee::regrole::text as g from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid=$1::regprocedure and a.privilege_type='EXECUTE'
          and a.grantee <> 'clara_fn_owner'::regrole`, [sig]);
    assert.deepEqual(acl.rows, [], `${sig} is ungranted`);
  }

  // x42.d8's CLOSED CENSUS IS UNMOVED: exactly two bodies consult the shared admission predicate,
  // and they are the two live oracles -- the cores deliberately are not members.
  const consumers = await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.prokind='f'
        and p.prosrc like '%clara._assert_due_read_ctx(%' order by 1`);
  assert.deepEqual(consumers.rows.map((r) => r.proname), both,
    "the two-member due family still cannot drift apart");
});

test("fa4c.F2 close_prep_due admits a passed, unstarted year and drops it on a hold, a live run and a close -- and only clara_runtime may ask", async (t) => {
  if (gate(t)) return;
  const sc = await scene("f2");
  const due = async () => (await roleQuery(ROLES.runtime,
    "select * from clara.close_prep_due() where client_id = $1", [sc.client])).rows;

  // scene()'s own mint already consumed the cadence window (clause 5's herd wall, itself proven
  // by this line's necessity) -- age it out so the oracle's OTHER five clauses are what is read.
  await rootQuery(
    "update clara.wake_credentials set created_at = now() - interval '3 days' where client_id=$1", [sc.client]);

  let rows = await due();
  assert.equal(rows.length, 1, "a year whose ends_on has passed, with nobody started, is due");
  assert.equal(rows[0].fiscal_year_id, sc.fy);
  assert.equal(rows[0].reason, "fy_end_passed", "and it SAYS why, rather than leaving it derived");

  await humanQuery(sc.alice, "select clara.hold_close_prep($1,$2,$3) as r",
    [sc.client, "rig: brake", opk("fa4c-f2h")]);
  assert.equal((await due()).length, 0, "a held client is not due");
  await humanQuery(sc.alice, "select clara.release_close_prep($1,$2,$3) as r",
    [sc.client, "rig: resume", opk("fa4c-f2r")]);
  assert.equal((await due()).length, 1, "and comes back on release");

  await beginClose(sc.alice, { fy: sc.fy });
  assert.equal((await due()).length, 0, "a year with a live run is not due");

  const denied = await caught(() => roleQuery(ROLES.wakeInteractive, "select * from clara.close_prep_due()"));
  assert.equal(denied?.code, PG.insufficientPrivilege, "the wake role cannot execute the oracle");
  const granted = await rootQuery(
    `select a.grantee::regrole::text as g from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid='clara.close_prep_due()'::regprocedure and a.privilege_type='EXECUTE'
        and a.grantee <> 'clara_fn_owner'::regrole order by 1`);
  assert.deepEqual(granted.rows.map((r) => r.g), ["clara_runtime"], "close_prep_due is clara_runtime's alone");
});

test("fa4c.F3 C-21 parity: the extracted reads answer IDENTICALLY through the human verb and through the core, has_active_reopen_receipt included", async (t) => {
  if (gate(t)) return;
  const sc = await scene("f3");
  await beginClose(sc.alice, { fy: sc.fy });

  const h1 = await humanQuery(sc.alice, "select clara.list_fiscal_years($1) as r", [sc.client]);
  const c1 = await rootQuery("select clara._list_fiscal_years_core($2,$1) as r", [sc.client, sc.firm]);
  assert.deepEqual(c1.rows[0].r, h1.rows[0].r, "list_fiscal_years is byte-identical across the extraction");
  assert.ok(Object.prototype.hasOwnProperty.call(h1.rows[0].r[0], "has_active_reopen_receipt"),
    "the tell key gate GM-2 worried about is present in BOTH payloads");

  const h2 = await humanQuery(sc.alice, "select clara.get_close_readiness($1,$2) as r", [sc.client, sc.fy]);
  const c2 = await rootQuery("select clara._close_readiness_core($3,$1,$2) as r", [sc.client, sc.fy, sc.firm]);
  assert.deepEqual(c2.rows[0].r, h2.rows[0].r, "get_close_readiness is byte-identical across the extraction");

  // And a cross-firm read still refuses through BOTH entrances -- the extraction moved the firm
  // check, it did not delete it.
  const otherScene = await scene("f3b");
  const crossHuman = await caught(() => humanQuery(sc.alice, "select clara.list_fiscal_years($1) as r", [otherScene.client]));
  assert.equal(crossHuman?.code, CLR.notFound, "a foreign client refuses through the human verb");
  const crossCore = await caught(() => rootQuery(
    "select clara._list_fiscal_years_core($2,$1) as r", [otherScene.client, sc.firm]));
  assert.equal(crossCore?.code, CLR.notFound, "and through the core, with the firm passed explicitly");
});

// =====================================================================================
// G -- THE ROSTER AND CENSUS SURFACES.
// =====================================================================================

test("fa4c.G1 the wake surface census: the built wrappers, their allowlist rows, the parked/unparked thirteenth, and no role but clara_wake_interactive", async (t) => {
  if (gate(t)) return;
  // SUCCESSION-AWARE (.claude/rules/db-tests.md): F-A4 PR-2a UNPARKS the thirteenth verb, so this
  // gate's twelve-and-absent assertion goes false BY DESIGN the moment that migration lands -- not
  // drift. The witness is a CATALOG one, probed by EXACT SIGNATURE rather than a bare name (law 3)
  // and never by a migration NUMBER, which is claimed at merge. Both arms assert; neither skips.
  const w = await rootQuery(
    `select (to_regprocedure('clara.prepayment_schedule_v1(uuid,uuid)') is not null
             and to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)') is not null) as unparked`);
  const unparked = w.rows[0].unparked;
  const expected = unparked ? [...WRAPPERS, PARKED_WRAPPER].sort() : [...WRAPPERS].sort();

  const rows = await rootQuery(
    "select function_name from clara.wake_fn_allowlist where wake_kind='close_prep' order by 1");
  assert.deepEqual(rows.rows.map((r) => r.function_name), expected,
    unparked
      ? "with PR-2a applied the allowlist is the twelve wrappers PLUS the unparked thirteenth"
      : "the allowlist is exactly the twelve built wrappers");

  // THE THIRTEENTH, read POSITIVELY in BOTH directions (law 31 + review law 2) -- absent while
  // parked, present at its exact signature once unparked. A count that happens to be twelve is not
  // evidence either way.
  const parked = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname in ($1,'prepayment_schedule_v1')`, [PARKED_WRAPPER]);
  if (unparked) {
    assert.ok(parked.rows[0].n >= 2, "the unparked prepayment half does not resolve");
  } else {
    assert.equal(parked.rows[0].n, 0, "the parked prepayment half is provably absent");
  }

  for (const w2 of unparked ? [...WRAPPERS, PARKED_WRAPPER] : WRAPPERS) {
    const w = w2;
    const acl = await rootQuery(
      `select a.grantee::regrole::text as g from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where n.nspname='clara' and p.proname=$1 and a.privilege_type='EXECUTE'
          and a.grantee <> 'clara_fn_owner'::regrole order by 1`, [w]);
    assert.deepEqual(acl.rows.map((r) => r.g), ["clara_wake_interactive"],
      `${w} is executable by clara_wake_interactive and nothing else`);
  }

  // G1's own INSERT-and-flip obligation is NOT discharged by this PR: the close_prep source stays
  // registered-and-disabled until the closePrep.v1 workflow body ships (PR-2).
  const src = await rootQuery(
    "select carrier, task_kind, wake_kind, enabled from clara.wake_engine_sources where source_key='close_prep'");
  assert.equal(src.rows.length, 1, "the source is registered");
  assert.equal(src.rows[0].enabled, false, "and still DISABLED -- the flip belongs to PR-2");
  assert.equal(src.rows[0].task_kind, "close_prep");
});

test("fa4c.G2 the receipt carrier: zero DML grant to every role, append-only even for the owner, a bookkeeper-readable panel", async (t) => {
  if (gate(t)) return;
  const sc = await scene("g2");
  await VERBS.dryRun(sc.s, { client: sc.client, fy: sc.fy });

  // clara_fn_owner is the table OWNER, so its implicit privileges are excluded by name: the claim
  // is "no APPLICATION role holds DML", which is what the close_write_permits posture means.
  const dml = await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='clara' and table_name in ('agent_act_receipts','close_proposals','close_prep_holds')
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
        and grantee <> 'clara_fn_owner'`);
  assert.deepEqual(dml.rows, [], "no application role holds DML on any of the three new carriers");

  const panel = await humanQuery(sc.alice, "select clara.list_agent_act_receipts($1,null) as r", [sc.client]);
  assert.ok(Array.isArray(panel.rows[0].r) && panel.rows[0].r.length >= 1,
    "a bookkeeper+ can READ the receipts -- a receipt nobody can read is not an audit control");
  assert.equal(panel.rows[0].r[0].via_wake_kind, "close_prep");
  assert.equal(panel.rows[0].r[0].model.version, MODEL.version, "with the model triple rendered");

  // A foreign client is refused rather than silently empty (no cross-tenant read, no oracle).
  const other = await scene("g2b");
  const cross = await caught(() => humanQuery(sc.alice,
    "select clara.list_agent_act_receipts($1,null) as r", [other.client]));
  assert.equal(cross?.code, CLR.notFound, "the panel refuses a client outside the reader's firm");

  // Append-only: even the owner role cannot rewrite a receipt.
  // SEPARATE STATEMENTS, A REAL TARGET ROW, TYPED CODE (FIX-9). The dry run above wrote a
  // receipt for this client, so the UPDATE has something to hit -- an update matching zero rows
  // fires no row trigger and would have been a green cell proving nothing.
  const before = await rootQuery(
    "select count(*)::int as n from clara.agent_act_receipts where client_id=$1", [sc.client]);
  assert.ok(before.rows[0].n >= 1, "there is a real receipt row to attempt the update against");
  const upd = await caught(() => asRole(ROLES.fnOwner, (c) =>
    c.query("update clara.agent_act_receipts set rationale='x' where client_id=$1", [sc.client])));
  assert.equal(upd?.code, CLR.immutable, "the receipt carrier is append-only, by its own code");
});

test("fa4c.G0 ALL TWELVE wrappers fire end-to-end through a real wake session -- every grant, every allowlist row and every delegate, exercised once", async (t) => {
  if (gate(t)) return;
  // The f31w.v precedent: a per-verb cell that only ever reaches a REFUSAL proves the ladder and
  // nothing about the delegate underneath it. This cell drives each wrapper to the far side --
  // the reads to their extracted cores, the writers to the estate's own shared cores -- so a
  // wrapper whose delegate cannot answer under a wake session (gate GB-2/GB-3's whole worry) is
  // a finding HERE rather than at the first clocked close.
  const sc = await scene("g0", { startsOn: "2025-01-01" });
  const S = () => mintClosePrepSession(sc.firm, sc.client);   // a fresh task per act: a new wake
                                                              // task is a new operation (D-25).
  const call = async (verb, subject, name, specs, extra) => {
    const s = await S();
    return { s, r: await callWake(s.secret, name, specs,
      [...extra, RATIONALE, JSON.stringify(MODEL), derivedOpKey(s.task, name, subject)]) };
  };
  const U = { cast: "uuid" };
  const TRIPLE = [{ name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }];
  const fired = [];

  // 1 · the FY list.
  fired.push(["wake_list_fiscal_years", (await call("wake_list_fiscal_years", sc.client,
    "wake_list_fiscal_years", [{ name: "p_client", ...U }, ...TRIPLE], [sc.client])).r]);
  // 2 · the plan -- reached through clara.get_close_plan UNCHANGED (D-04), whose own firm
  // resolution is clara.actor_firm_id(): the wake half of that coalesce is what this proves.
  fired.push(["wake_get_close_plan", (await call("wake_get_close_plan", sc.fy,
    "wake_get_close_plan", [{ name: "p_fiscal_year_id", ...U }, ...TRIPLE], [sc.fy])).r]);
  // 3 · readiness, 6 · the dry run.
  fired.push(["wake_get_close_readiness", (await call("wake_get_close_readiness", sc.fy,
    "wake_get_close_readiness", [{ name: "p_client", ...U }, { name: "p_fy", ...U }, ...TRIPLE],
    [sc.client, sc.fy])).r]);
  fired.push(["wake_dry_run_close_readiness", (await call("wake_dry_run_close_readiness", sc.fy,
    "wake_dry_run_close_readiness", [{ name: "p_client", ...U }, { name: "p_fy", ...U }, ...TRIPLE],
    [sc.client, sc.fy])).r]);
  // 13 · the snapshot mint, then 5 · its state read on the id it just minted.
  const mint = await call("wake_mint_month_snapshot", sc.client, "wake_mint_month_snapshot",
    [{ name: "p_client", ...U }, { name: "p_month_start", cast: "date" }, ...TRIPLE],
    [sc.client, "2025-02-01"]);
  fired.push(["wake_mint_month_snapshot", mint.r]);
  const snapId = mint.r.result?.snapshot_id;
  assert.ok(snapId, "the mint returned a snapshot id");
  fired.push(["wake_snapshot_state", (await call("wake_snapshot_state", snapId,
    "wake_snapshot_state", [{ name: "p_snapshot", ...U }, ...TRIPLE], [snapId])).r]);
  // 11 · the depreciation catch-up. NO signed authority exists on this fixture, so B9 refuses --
  // and a receipted refusal is still the wrapper, the allowlist row and the rung firing for real.
  const dep = await call("wake_run_depreciation_catchup", sc.client, "wake_run_depreciation_catchup",
    [{ name: "p_client", ...U }, { name: "p_through", cast: "date" }, ...TRIPLE],
    [sc.client, "2025-12-31"]);
  assert.deepEqual(tokens(dep.r), ["depreciation_authority_absent"],
    "she EXECUTES an existing authority and never signs one");
  fired.push(["wake_run_depreciation_catchup", dep.r]);
  // 8 · begin, 10 · propose, 9 · abandon -- in the only order the estate admits.
  const begun = await call("wake_begin_close", sc.fy, "wake_begin_close",
    [{ name: "p_fy", ...U }, ...TRIPLE], [sc.fy]);
  fired.push(["wake_begin_close", begun.r]);
  const run = begun.r.result?.close_run_id;
  assert.ok(run, `begin acted: ${JSON.stringify(tokens(begun.r))}`);
  const prop = await call("wake_propose_close", run, "wake_propose_close",
    [{ name: "p_close_run", ...U }, { name: "p_drafted", cast: "jsonb" }, { name: "p_narrative" }, ...TRIPLE],
    [run, JSON.stringify([]), "nothing outstanding"]);
  // An EMPTY drafted array is a shape refusal, not a delegate failure -- the wrapper reached its
  // core and the core judged. Recorded as fired either way; the token proves which.
  fired.push(["wake_propose_close", prop.r]);
  fired.push(["wake_abandon_close", (await call("wake_abandon_close", run, "wake_abandon_close",
    [{ name: "p_close_run", ...U }, { name: "p_reason" }, ...TRIPLE],
    [run, "g0: done measuring"])).r]);
  // 4 · verify a REAL close receipt. FY1 is finalized FIRST -- the ordering rung means a later
  // year cannot be begun while an earlier one is open, so the human close has to land here, on
  // the year the agent just finished measuring.
  const humanRun = await beginClose(sc.alice, { fy: sc.fy });
  assert.ok(humanRun.close_run_id);
  const fin = await humanQuery(sc.alice, "select clara.finalize_close($1,$2,$3) as r",
    [sc.fy, "g0 self-attestation", opk("fa4c-g0fin")]);
  const receipt = fin.rows[0].r.receipt_id ?? fin.rows[0].r.close_receipt_id;
  assert.ok(receipt, `finalize produced a receipt: ${JSON.stringify(fin.rows[0].r)}`);
  // 7 · open the NEXT fiscal year. FIRST the NEGATIVE, on the fixture as built: this client's file
  // carries NO fy_end_month, so _propose_fiscal_year_core answers with fallback=true and B8
  // refuses -- choosing a fiscal-year end is an assertion about the client's constitution and
  // stays human (OQ-A4-9). Accepting a DEFAULT is not "the file already carries an end".
  const noFile = await call("wake_open_fiscal_year", sc.client, "wake_open_fiscal_year",
    [{ name: "p_client", ...U }, { name: "p_label" }, { name: "p_starts_on", cast: "date" }, ...TRIPLE],
    [sc.client, "FY2026 (should refuse)", "2026-01-01"]);
  assert.deepEqual(tokens(noFile.r), ["fy_end_not_on_file"],
    "the agent may not choose a fiscal-year end, and a 31-December fallback is a choice");
  // Now the fixture states the fact, through the human door that owns it.
  await humanQuery(sc.alice, "select clara.set_client_fy_end($1,$2,$3,$4) as r",
    [sc.client, 12, 31, opk("fa4c-g0fye")]);
  const opened = await call("wake_open_fiscal_year", sc.client, "wake_open_fiscal_year",
    [{ name: "p_client", ...U }, { name: "p_label" }, { name: "p_starts_on", cast: "date" }, ...TRIPLE],
    [sc.client, "FY2026 (agent-opened)", "2026-01-01"]);
  assert.equal(opened.r.status, "acted", `open_fy: ${JSON.stringify(tokens(opened.r))}`);
  assert.equal(opened.r.result.fy_end_source, "asserted_by_file",
    "on file, accepted unchanged, not asserted by a human at this moment");
  fired.push(["wake_open_fiscal_year", opened.r]);
  const ver = await call("wake_verify_close", receipt, "wake_verify_close",
    [{ name: "p_receipt", ...U }, ...TRIPLE], [receipt]);
  assert.equal(ver.r.status, "acted");
  assert.equal(ver.r.result.receipt_id, receipt, "the extracted core answered about the real receipt");
  fired.push(["wake_verify_close", ver.r]);

  // EVERY WRAPPER FIRED, and every one left a durable receipt naming its own act.
  assert.deepEqual(fired.map(([n]) => n).sort(), [...WRAPPERS].sort(),
    "all twelve wrappers were exercised end-to-end");
  for (const [name, answer] of fired) {
    assert.ok(["acted", "refused"].includes(answer.status), `${name} returned a typed answer`);
    const r = await receiptById(answer.receipt_id);
    assert.ok(r, `${name} left a receipt`);
    assert.equal(r.via_wake_kind, "close_prep");
    assert.equal(r.on_behalf_of, null, `${name}: the clocked lane has no directing human`);
  }
});

test("fa4c.G3 F14's binding and D-25's derivation: one receipt per (task, verb, subject), a NEW task re-measures, wake_context still five columns", async (t) => {
  if (gate(t)) return;
  const sc = await scene("g3");

  const cred = await rootQuery(
    "select agent_task_id from clara.wake_credentials where id=$1", [sc.s.credentialId]);
  assert.equal(cred.rows[0].agent_task_id, sc.s.task, "the sibling minter records the task");

  const a = await VERBS.listFy(sc.s, { client: sc.client });
  const b = await VERBS.listFy(sc.s, { client: sc.client });
  assert.equal(a.receipt_id, b.receipt_id,
    "a retry inside ONE wake task replays the stored receipt rather than minting a second");

  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const c = await VERBS.listFy(s2, { client: sc.client });
  assert.notEqual(c.receipt_id, a.receipt_id, "a NEW wake task is a NEW operation, re-measured");
  const r = await receiptById(c.receipt_id);
  assert.equal(r.wake_task_id, s2.task, "and its receipt binds the new task");

  // wake_context() is byte-untouched: FIVE columns, the task arrives by the sibling (D-13, C14).
  const cols = await rootQuery(
    `select count(*)::int as n from pg_proc p, unnest(p.proargmodes) m
      where p.oid='clara.wake_context()'::regprocedure and m='t'`);
  assert.equal(cols.rows[0].n, 5, "wake_context still returns five columns");

  // The sibling minter refuses an INCONGRUENT task (a task of another client), read positively.
  const other = await scene("g3b");
  const bad = await caught(() => rootQuery(
    "select * from clara.mint_wake_credential_for_task('close_prep',$1,$2,$3,'00:15:00'::interval)",
    [sc.firm, sc.client, other.s.task]));
  assert.equal(bad?.code, CLR.notFound, "a task belonging to another client cannot be bound");
});
