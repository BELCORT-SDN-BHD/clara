// Slice-4 rig — DURABLE RUNTIME part 6: CATALOG / GRANT-MATRIX / ROLES (§6
// item 7; contract §3.0). Contract-blind: derived from the contract v2.1, never
// from 0006. Sweeps are CATALOG-DERIVED (every clara fn / table enumerated from
// pg_catalog), never hand lists: a new object cannot silently escape.
//
// Hard laws: the exact new-fn signature set with no orphan overloads;
// resolve_chat_principal / begin_chat_turn / settle_chat_turn EXECUTE =
// clara_runtime ONLY; the three governance fns = clara_authenticated ONLY; zero
// PUBLIC-executable clara functions post-0006; FORCE RLS on every new table;
// the two NOLOGIN login-shells are members of exactly their one group role
// (S4-C3 — never a wake role or clara_authenticated).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  PG,
  ROLES,
  assertRaises,
  rootQuery,
  roleQuery,
  ensureReady,
  runtimeReady,
  endPool,
  buildWorld,
  insertUser,
  printLaneNotes,
  noteLane,
  withSessionAuth,
  createChatSession,
  finishTask,
  opk,
} from "./rig-runtime-fixtures.mjs";
import {
  S4_NEW_FNS,
  s4GrantAudit,
  overloadFailures,
  fnArgNames,
  s4RlsAudit,
  loginRoleAudit,
} from "./rig-runtime-meta.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await runtimeReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("catalog");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("Slice-4 runtime core not present — 0006 not yet applied");
    return true;
  }
  return false;
}

// ===========================================================================
// §3.0 — roles + the runtime's only membership surface.
// ===========================================================================

test("§3.0 login shells: clara_runtime_login → clara_runtime ONLY; clara_agent_read_login → clara_agent_ro ONLY; NOLOGIN/no-super/no-bypassrls; SET TRUE + INHERIT FALSE", async (t) => {
  if (unready(t)) return;
  assert.deepEqual(await loginRoleAudit(), [], "the §3.0 login-shell role audit is clean");
});

test("S4-AB1 real session authorization: bare logins hold NO ambient privilege; SET ROLE to their one group works; any other group refused", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  const session = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });

  // (a)+(b)+(d) clara_runtime_login.
  await withSessionAuth("clara_runtime_login", async (c) => {
    // Bare (INHERIT FALSE): no ambient privilege on schema clara.
    let bare = null;
    try {
      await c.query("select count(*) from clara.wake_intents");
    } catch (e) {
      bare = e.code;
    }
    assert.equal(bare, PG.insufficientPrivilege, `bare clara_runtime_login cannot read clara tables (got ${bare ?? "SUCCESS"})`);
    // (d) no lateral movement to any OTHER group role.
    for (const other of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.fnOwner]) {
      let denied = null;
      try {
        await c.query(`set role ${other}`);
        await c.query("reset role");
      } catch (e) {
        denied = e.code;
      }
      assert.equal(denied, PG.insufficientPrivilege, `clara_runtime_login must NOT set role ${other} (got ${denied ?? "SUCCESS"})`);
    }
    // (b) SET ROLE into its ONE group succeeds and reaches the runtime surface
    // — a REAL begin_chat_turn call, not a privilege-catalog read.
    await c.query(`set role ${ROLES.runtime}`);
    const ok = await c.query("select count(*)::int as n from clara.wake_intents");
    assert.ok(ok.rows[0].n >= 0, "after SET ROLE clara_runtime the runtime surface is readable");
    const turn = await c.query(
      "select clara.begin_chat_turn(p_session => $1, p_author => $2, p_turn_key => $3, p_user_parts => $4::jsonb, p_model => $5) as result",
      [session, users.alice, opk("ab1"), JSON.stringify([{ type: "text", text: "ab1" }]), "gpt-5.6-terra"],
    );
    assert.ok(turn.rows[0].result, "begin_chat_turn EXECUTEs under the runtime login's SET ROLE");
  });
  // Cap hygiene for firm A (S4-AB11-legal path).
  const tid = (await rootQuery("select id from clara.agent_tasks where session_id = $1 order by created_at desc limit 1", [session])).rows[0].id;
  await finishTask(tid);

  // (c)+(d) clara_agent_read_login.
  await withSessionAuth("clara_agent_read_login", async (c) => {
    let bare = null;
    try {
      await c.query("select count(*) from clara.firms");
    } catch (e) {
      bare = e.code;
    }
    assert.equal(bare, PG.insufficientPrivilege, `bare clara_agent_read_login cannot read clara tables (got ${bare ?? "SUCCESS"})`);
    for (const other of [ROLES.authenticated, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.fnOwner]) {
      let denied = null;
      try {
        await c.query(`set role ${other}`);
        await c.query("reset role");
      } catch (e) {
        denied = e.code;
      }
      assert.equal(denied, PG.insufficientPrivilege, `clara_agent_read_login must NOT set role ${other} (got ${denied ?? "SUCCESS"})`);
    }
    await c.query(`set role ${ROLES.agentRo}`);
    const read = await c.query("select count(*)::int as n from clara.firms");
    assert.equal(read.rows[0].n, 0, "after SET ROLE clara_agent_ro reads succeed (zero rows without a wake credential — RLS)");
    // Wave-A (ADR-015): get_context_pack is now a GUC-gated SECURITY DEFINER —
    // a SET-ROLE'd caller is invisible, so a secretless agent_ro session lands in
    // the human branch and is refused CLR04 (a uniform refusal for EVERY
    // credentialless caller, client existent or not — still no oracle; the S4-era
    // invoker null-collapse is superseded).
    let packDenied = null;
    try {
      await c.query("select clara.get_context_pack(p_client => $1, p_purpose => 'ab1 probe') as pack", [clients.A1]);
    } catch (e) {
      packDenied = e.code;
    }
    assert.equal(packDenied, "CLR04", `get_context_pack without a credential refuses CLR04 uniformly (got ${packDenied ?? "SUCCESS"})`);
    let writer = null;
    try {
      await c.query("select clara.create_client(p_name => 'ab1-illegal', p_op_key => 'ab1')");
    } catch (e) {
      writer = e.code;
    }
    assert.equal(writer, PG.insufficientPrivilege, `the agent read login can NEVER execute a writer (got ${writer ?? "SUCCESS"})`);
  });
});

test("§3.0 resolve_chat_principal: returns the sub's LIVE firm + role to the runtime lane; empty for a member-less sub; EXECUTE = clara_runtime ONLY", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;

  const r = await roleQuery(ROLES.runtime, "select to_jsonb(x) as row from clara.resolve_chat_principal(p_sub => $1) x", [users.alice]);
  assert.equal(r.rowCount, 1, "the runtime resolves a live member");
  const row = JSON.stringify(r.rows[0].row);
  assert.ok(row.includes(firms.A), `the principal carries the LIVE firm (got ${row})`);
  assert.ok(row.includes("owner"), `the principal carries the LIVE role (got ${row})`);

  const ghost = await insertUser(`s4cat_${Date.now().toString(36)}`, "ghost");
  const g = await roleQuery(ROLES.runtime, "select 1 from clara.resolve_chat_principal(p_sub => $1)", [ghost]);
  assert.equal(g.rowCount, 0, "a sub with NO active membership resolves to zero rows (live revocation)");

  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "select * from clara.resolve_chat_principal(p_sub => $1)", [users.alice]), "human EXECUTE resolve_chat_principal");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, "select * from clara.resolve_chat_principal(p_sub => $1)", [users.alice]), "agent EXECUTE resolve_chat_principal");
});

// ===========================================================================
// §6 item 7 — the fn signature set.
// ===========================================================================

test("§6 signature set: every contract-named fn exists with its NAMED params, single overload each; no orphan overloads anywhere in clara", async (t) => {
  if (unready(t)) return;
  const dupes = await overloadFailures();
  assert.deepEqual(dupes, [], `no clara proname carries two overloads (orphan sweep): ${dupes.join("; ")}`);

  for (const [name, spec] of Object.entries(S4_NEW_FNS)) {
    const overloads = await fnArgNames(name);
    assert.ok(overloads, `clara.${name} exists (contract names it)`);
    assert.equal(overloads.length, 1, `exactly one overload of clara.${name}`);
    const args = overloads[0];
    if (spec.params) {
      for (const p of spec.params) assert.ok(args.includes(p), `clara.${name} carries the contract-named param ${p} (has: ${args.join(", ")})`);
    }
    if (spec.mustInclude) {
      for (const p of spec.mustInclude) assert.ok(args.includes(p), `clara.${name} carries ${p} (has: ${args.join(", ")})`);
      noteLane(`share_chat_session as-built params: (${args.join(", ")}) — the contract names only p_op_key`);
    }
  }
});

// ===========================================================================
// §6 item 7 — the five-lane EXECUTE matrix + zero PUBLIC (catalog-derived).
// ===========================================================================

test("§6 EXECUTE matrix: re-asserted across the five lanes incl. the new fns; runtime-only begin/settle/resolve; authenticated-only governance; ZERO PUBLIC", async (t) => {
  if (unready(t)) return;
  const { hard, observations } = await s4GrantAudit();
  for (const o of observations) noteLane(`grant observation (contract-silent fn): ${o}`);
  assert.deepEqual(hard, [], `the Slice-4 EXECUTE matrix holds:\n${hard.join("\n")}`);

  // Spot re-asserts of the single-audience laws (belt over the sweep).
  const lanes = [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime];
  const expectOnly = async (fn, only) => {
    const f = await rootQuery(
      "select p.oid::int8 as oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = $1",
      [fn],
    );
    assert.equal(f.rowCount, 1, `${fn} exists once`);
    for (const role of lanes) {
      const ok = (await rootQuery("select has_function_privilege($1, $2::oid, 'execute') as ok", [role, f.rows[0].oid])).rows[0].ok;
      assert.equal(ok, role === only, `${role} EXECUTE ${fn} must be ${role === only}`);
    }
  };
  await expectOnly("resolve_chat_principal", ROLES.runtime);
  await expectOnly("begin_chat_turn", ROLES.runtime);
  await expectOnly("settle_chat_turn", ROLES.runtime);
  await expectOnly("open_interruption", ROLES.runtime);
  await expectOnly("checkpoint_turn", ROLES.runtime);
  await expectOnly("answer_interruption", ROLES.authenticated);
  await expectOnly("cancel_agent_task", ROLES.authenticated);
  await expectOnly("share_chat_session", ROLES.authenticated);
});

// ===========================================================================
// §6 item 7 — FORCE RLS on every new table (derived, with an unlisted catch).
// ===========================================================================

test("§6 FORCE-RLS sweep: every §3 table exists RLS-forced; any unlisted new table is flagged", async (t) => {
  if (unready(t)) return;
  const { problems, observations } = await s4RlsAudit();
  for (const o of observations) noteLane(`RLS observation: ${o}`);
  assert.deepEqual(problems, [], `the FORCE-RLS sweep holds:\n${problems.join("\n")}`);
});
