// Slice-4 rig — DURABLE RUNTIME part 2: RLS / VISIBILITY MATRIX (§6 item 2;
// contract §3.2 masked view, §3.5 visibility law, §0.9 ruling, §3.7 trace
// grants). Contract-blind: derived from the contract v2.1, never from 0006.
//
// The law under test: cross-firm denial on EVERY new surface; SAME-FIRM
// private-session invisibility (sessions AND messages) for a non-author member;
// shared sessions readable AND continuable; the agent lane (clara_agent_ro) has
// ZERO access to every new table; trace_spans denied to BOTH human and agent
// lanes; humans have ZERO grant on the agent_tasks base table but the masked
// definer view works with per-row session masking; no existence oracle anywhere.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  PG,
  ROLES,
  assertRaises,
  opk,
  rootQuery,
  roleQuery,
  humanQuery,
  ensureReady,
  runtimeReady,
  endPool,
  buildWorld,
  observedNewTables,
  columnMap,
  denialOrEmpty,
  printLaneNotes,
  createChatSession,
  sessionAuthorColumn,
  beginChatTurn,
  taskIdOf,
  finishTask,
  insertInterruption,
  interruptionColumns,
  noteLane,
  CLR,
  CLR13,
} from "./rig-runtime-fixtures.mjs";

let ready = false;
let world = null;
let fix = null; // { privSession, privTask, sharedSession, sharedTask }

before(async () => {
  await ensureReady();
  ready = await runtimeReady();
  if (!ready) return;
  world = await buildWorld();
  const { users, firms } = world;
  const privSession = await createChatSession({ firm: firms.A, author: users.alice, visibility: "private" });
  const privTask = taskIdOf(await beginChatTurn({ session: privSession, author: users.alice, turnKey: opk("vp") }));
  const sharedSession = await createChatSession({ firm: firms.A, author: users.alice, visibility: "firm" });
  const sharedTask = taskIdOf(await beginChatTurn({ session: sharedSession, author: users.alice, turnKey: opk("vs") }));
  fix = { privSession, privTask, sharedSession, sharedTask };
});
after(async () => {
  printLaneNotes("visibility");
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
// §3.5 / §0.9 — the visibility law on sessions + messages.
// ===========================================================================

test("§0.9 private-by-default: a SAME-FIRM non-author sees neither the private session nor its messages; the author sees both; no oracle", async (t) => {
  if (unready(t)) return;
  const { users } = world;
  const { privSession } = fix;

  // Author sees the session + its message.
  const own = await humanQuery(users.alice, "select id from clara.chat_sessions where id = $1", [privSession]);
  assert.equal(own.rowCount, 1, "the author reads their private session");
  const ownMsg = await humanQuery(users.alice, "select id from clara.chat_messages where session_id = $1", [privSession]);
  assert.ok(ownMsg.rowCount >= 1, "the author reads the private session's messages");

  // A same-firm write-capable member (bob) sees NOTHING — rows, not errors (no oracle).
  const bobS = await humanQuery(users.bob, "select id from clara.chat_sessions where id = $1", [privSession]);
  assert.equal(bobS.rowCount, 0, "same-firm non-author: ZERO rows for the private session (S4 invisibility)");
  const bobM = await humanQuery(users.bob, "select id from clara.chat_messages where session_id = $1", [privSession]);
  assert.equal(bobM.rowCount, 0, "same-firm non-author: ZERO rows for the private session's messages");

  // A viewer sees nothing either.
  const carolS = await humanQuery(users.carol, "select id from clara.chat_sessions where id = $1", [privSession]);
  assert.equal(carolS.rowCount, 0, "same-firm viewer: ZERO rows for the private session");

  // Cross-firm (dave) sees nothing.
  const daveS = await humanQuery(users.dave, "select id from clara.chat_sessions where id = $1", [privSession]);
  assert.equal(daveS.rowCount, 0, "cross-firm: ZERO rows (empty, not an error — no oracle)");
});

test("§0.9 shared sessions: firm-readable (sessions AND messages) and CONTINUABLE by a member; non-author continuation of a private session probed", async (t) => {
  if (unready(t)) return;
  const { users } = world;
  const { sharedSession, sharedTask, privSession, privTask } = fix;

  const bobS = await humanQuery(users.bob, "select id from clara.chat_sessions where id = $1", [sharedSession]);
  assert.equal(bobS.rowCount, 1, "a member reads the shared session");
  const bobM = await humanQuery(users.bob, "select id from clara.chat_messages where session_id = $1", [sharedSession]);
  assert.ok(bobM.rowCount >= 1, "a member reads the shared session's messages");
  const daveS = await humanQuery(users.dave, "select id from clara.chat_sessions where id = $1", [sharedSession]);
  assert.equal(daveS.rowCount, 0, "cross-firm still sees ZERO rows of a shared session");

  // Free the sessions' live turns first (one-live-turn would mask the real
  // outcome of the continuation probes with a CLR13). finishTask walks the
  // S4-AB11-legal path (queued→running→settle).
  await finishTask(sharedTask);
  await finishTask(privTask);

  // Continuable: a member's turn on the SHARED session is admitted (the §4.2
  // ingress passes the member as p_author).
  const cont = await beginChatTurn({ session: sharedSession, author: users.bob, turnKey: opk("cont") });
  assert.ok(taskIdOf(cont), "a same-firm member CONTINUES a shared session (ruling 9)");

  // Non-author continuation of a PRIVATE session: ruling 9 forbids it at the
  // product boundary, but §3.5's role-gate honesty note allows the DB-level
  // begin (runtime lane) to leave this to the §4.2 ingress. PROBE and record:
  // a refusal must be a clean CLR code; a success is recorded as an
  // ingress-enforced honesty observation, not a rig failure.
  try {
    await beginChatTurn({ session: privSession, author: users.bob, turnKey: opk("nope") });
    noteLane("begin_chat_turn ADMITS a non-author turn on a PRIVATE session — continuation authority is ingress-enforced only (§3.5 honesty note); confirm the §4.2 authorization module covers it");
  } catch (e) {
    assert.ok(
      [CLR.authz, CLR.notFound, CLR13, CLR.badRequest].includes(e.code),
      `a refused non-author private continuation must be a clean CLR code (got ${e.code}: ${e.message})`,
    );
  }
});

// ===========================================================================
// §6 item 2 — catalog-derived denial sweeps over EVERY new surface.
// ===========================================================================

test("§6 cross-firm denial sweep: a firm-B human sees ZERO firm-A rows on every new firm-scoped table (empty or denied, never data)", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const tables = await observedNewTables();
  assert.ok(tables.length >= 5, `the new-surface sweep found the Slice-4 tables (got: ${tables.join(", ")})`);
  for (const tbl of tables) {
    const byName = await columnMap(tbl);
    if (!byName.has("firm_id")) continue; // non-firm-scoped (e.g. heartbeats) — grant sweep below covers it
    const probe = await denialOrEmpty(
      () => humanQuery(users.dave, `select count(*)::int as n from clara.${tbl} where firm_id = $1`, [firms.A]),
      `dave reads firm-A ${tbl}`,
    );
    if (probe.mode === "rows") {
      const n = (await humanQuery(users.dave, `select count(*)::int as n from clara.${tbl} where firm_id = $1`, [firms.A])).rows[0].n;
      assert.equal(n, 0, `firm-B human sees ZERO firm-A rows in ${tbl}`);
    }
    // mode 'denied' (42501 — no human grant at all) is an equally clean denial.
  }
});

test("§6 agent lane: clara_agent_ro has ZERO access to every new table (42501, grant-level)", async (t) => {
  if (unready(t)) return;
  const tables = await observedNewTables();
  const slice5AgentReads = new Set(["document_filings", "document_extractions", "document_regions"]);
  // [S6 §9/C-11] counterparties + entry_evidence carry a firm-scoped agent SELECT grant BY
  // DESIGN (the client-pinned reads project them); coding_tasks/coding_attempts/
  // processing_call_reservations stay zero-access to agent_ro and are still asserted below.
  const s6AgentReads = new Set(["counterparties", "entry_evidence"]);
  // [Wave E lane δ, design part2 §6(c)] the NINE catalog tables 0059 grants clara_agent_ro a
  // firm-scoped SELECT on, so the agent can read WHICH metrics and account sets exist when it
  // narrates. Sanctioned, and deliberately narrow: it is the catalog only — every table carrying a
  // computed FIGURE or its provenance (metric_cells, the cell junctions, the evaluation contexts,
  // the input snapshots and their four fact families, the evaluator registry, the assessments, the
  // A30b attempt receipts) stays zero-access and is still asserted by the loop below. 0060's own
  // security tail counts this set at exactly nine and revokes agent SELECT from every other δ
  // table, so a tenth appearing here would be caught in-migration as well as by this cell.
  const deltaAgentCatalogReads = new Set([
    "metric_definitions", "metric_definition_versions", "account_sets", "account_set_versions",
    "presentation_maps", "presentation_map_versions", "metric_constants", "edge_policy_sets",
    "metric_edge_policies",
  ]);
  // EVERY EXCEPTION IS POSITIVELY VERIFIED, because a skip-list cannot fail by growing. Measured
  // while adding the δ nine: appending an UNSANCTIONED table to this set (metric_cells) left the
  // suite green, since an excepted table is simply not asserted — so the list was a place where a
  // real grant could be waved through silently, which is the whole failure mode these cells exist
  // to prevent. Each name below must therefore actually BE granted; an entry that is stale, or one
  // added to quiet a failure rather than to record a sanctioned grant, now fails here by name.
  // [#624 / #644, migrations 0191 + 0192] FOUR MORE SANCTIONED AGENT READS, and every one of them
  // is a read the lane has NO DOOR for — which is the test each of these had to pass, because the
  // fifth table of the same wave FAILED it. clara.document_capabilities (0191's global registry)
  // was granted to the agent lane too and is NOT here: 0191 EXECUTE-grants it
  // clara._document_capability / clara._document_format / clara.get_document_state, all three
  // SECURITY DEFINER, so the table grant was a second way in with nothing behind it and 0191 now
  // revokes it — 0165's own ruling for that registry's twin, clara.document_kind_codeability.
  //
  //   · document_fact_validations (0191) — FIRM-SCOPED agent SELECT by design, the same shape
  //     counterparties/entry_evidence carry above: p_document_fact_validations_agent is
  //     `wake_firm()`-scoped and its sibling p_document_fact_validations_human is
  //     `jwt_firm()`-scoped, deliberately split so neither lane can fall back on the other's
  //     accessor (0002:440-443 forbids clara.actor_firm_id() as an authorization basis). The
  //     predicate is measured ROW-WISE, not merely counted, by cell 8 of
  //     document-fact-validation-belt.test.mjs (a firm-B agent reads ZERO of firm A's).
  //   · knowledge_records (0192) — FIRM-SCOPED agent SELECT under p_knowledge_records_agent
  //     (`firm_id = clara.wake_firm()`). 0192 §H is explicit that this table grant IS the agent
  //     lane's path and that granting it the READ DOORS instead would be the defect: those doors
  //     are `_human_ctx`-gated, and a human-gated read granted to a role that carries no JWT is a
  //     dark grant (0057's ruling). There is therefore no door to route this one through.
  //   · knowledge_keys, knowledge_plan_item_map (0192) — GLOBAL product vocabulary with no tenant
  //     column, the δ-nine shape above: the agent may read WHICH knowledge keys exist and which
  //     onboarding item each answers when it narrates. No figure and no client value is in either.
  const wave2AgentReads = new Set([
    "document_fact_validations", "knowledge_records", "knowledge_keys", "knowledge_plan_item_map",
  ]);
  // [#1092, migration 0346_fa_retired_policy_agent_read — riders sweep wave, lane L5] ONE MORE
  // SANCTIONED AGENT READ, and it is a RULING rather than a discovery. SWEEP-PLAN.md flagged this
  // widening as the wave's security item ("that widens a runtime credential onto client tax data.
  // Security. Opus."); it went through the security review, the adversarial review and a recheck,
  // and was ruled in. The read that consumes it is the fixed-asset particulars proposal's
  // retired-policy ground, which the runtime reaches out of its READ pool, whose group role is
  // clara_agent_ro — there is no door to route it through, the same shape knowledge_records takes
  // above.
  //
  // WHAT THE RULING ADMITS, AND THE CELL CARVES OUT EXACTLY THAT AND NO MORE. 0346 grants SELECT
  // and only SELECT, to clara_agent_ro and only clara_agent_ro, behind a row-level policy
  // (p_fadp_agent) scoped to clara.wake_firm() — never a blanket table read. So this entry is not
  // a bare name on a skip-list: the three assertions below re-measure the ruling's own shape off
  // the catalog, and a later file that widened the grant to INSERT, to a second role, or to an
  // unscoped policy would red this cell even though the table stays excepted from the sweep.
  const sweepAgentReads = new Set(["fa_account_depreciation_policies"]);
  for (const tbl of sweepAgentReads) {
    for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      assert.equal(
        (await rootQuery("select has_table_privilege($1,$2,$3) ok", [ROLES.agentRo, `clara.${tbl}`, priv])).rows[0].ok,
        false,
        `clara.${tbl} is a sanctioned agent READ: #1092's ruling grants SELECT and nothing else, but the agent lane holds ${priv}`,
      );
    }
    const agentPolicies = await rootQuery(
      `select p.polname, pg_get_expr(p.polqual, p.polrelid) as qual, p.polcmd
         from pg_policy p
        where p.polrelid = ('clara.' || $1)::regclass
          and $2 = any (select rolname from pg_roles where oid = any (p.polroles))`,
      [tbl, ROLES.agentRo]);
    assert.equal(agentPolicies.rowCount, 1,
      `clara.${tbl} must carry exactly ONE clara_agent_ro policy, not ${agentPolicies.rowCount}`);
    assert.equal(agentPolicies.rows[0].polcmd, "r",
      `clara.${tbl}'s agent policy must be FOR SELECT, not a write arm`);
    assert.match(agentPolicies.rows[0].qual, /wake_firm\(\)/,
      `clara.${tbl}'s agent policy must be scoped to clara.wake_firm() — an unscoped read is not what #1092 ruled`);
  }
  for (const tbl of [...deltaAgentCatalogReads, ...wave2AgentReads, ...sweepAgentReads]) {
    assert.equal(
      (await rootQuery("select has_table_privilege($1,$2,'SELECT') ok", [ROLES.agentRo, `clara.${tbl}`])).rows[0].ok,
      true,
      `clara.${tbl} is listed as a sanctioned agent-catalog read but carries no agent SELECT grant — remove the exception or restore the grant`,
    );
  }
  for (const tbl of tables) {
    if (slice5AgentReads.has(tbl) || s6AgentReads.has(tbl) || deltaAgentCatalogReads.has(tbl)
        || wave2AgentReads.has(tbl) || sweepAgentReads.has(tbl)) continue;
    await assertRaises(
      PG.insufficientPrivilege,
      () => roleQuery(ROLES.agentRo, `select count(*) from clara.${tbl}`),
      `agent_ro SELECT clara.${tbl}`,
    );
  }
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery(ROLES.agentRo, "select count(*) from clara.agent_tasks_visible"),
    "agent_ro SELECT agent_tasks_visible (the masked view is a human surface)",
  );
});

test("§3.7 trace_spans: denied to BOTH clara_authenticated and clara_agent_ro (runtime-only grants)", async (t) => {
  if (unready(t)) return;
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "select count(*) from clara.trace_spans"), "human SELECT trace_spans");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, "select count(*) from clara.trace_spans"), "agent SELECT trace_spans");
});

test("§3.2 humans have ZERO grant on the agent_tasks BASE table (S4-ND1) — select/insert/update/delete all 42501", async (t) => {
  if (unready(t)) return;
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "select count(*) from clara.agent_tasks"), "human SELECT agent_tasks");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "insert into clara.agent_tasks (id) values ($1)", [randomUUID()]), "human INSERT agent_tasks");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "update clara.agent_tasks set status = 'cancelled'"), "human UPDATE agent_tasks");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "delete from clara.agent_tasks"), "human DELETE agent_tasks");
});

// ===========================================================================
// §3.2 — the masked human surface (agent_tasks_visible).
// ===========================================================================

test("§3.2 masked view: firm-pinned; session_id/created_by NULL for a private session's task to a non-author, real for the author + shared; trace_id never exposed; no oracle", async (t) => {
  if (unready(t)) return;
  const { users } = world;
  const { privSession, privTask, sharedSession, sharedTask } = fix;
  const authorCol = (await sessionAuthorColumn()) ?? "created_by";

  // Structure: a plain DEFINER view (NOT security_invoker), owned by clara_fn_owner,
  // and trace_id is NOT among its columns.
  const meta = await rootQuery(
    `select c.relkind, pg_get_userbyid(c.relowner) as owner, coalesce(array_to_string(c.reloptions, ','), '') as opts
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'agent_tasks_visible'`,
  );
  assert.equal(meta.rowCount, 1, "clara.agent_tasks_visible exists");
  assert.equal(meta.rows[0].relkind, "v", "agent_tasks_visible is a view");
  assert.equal(meta.rows[0].owner, ROLES.fnOwner, "the view is owned by clara_fn_owner (definer semantics)");
  assert.ok(!/security_invoker\s*=\s*(true|on)/i.test(meta.rows[0].opts), "the view is NOT security_invoker (S4-ND1: plain definer view)");
  const viewCols = await rootQuery(
    "select column_name from information_schema.columns where table_schema = 'clara' and table_name = 'agent_tasks_visible'",
  );
  const names = viewCols.rows.map((r) => r.column_name);
  assert.ok(!names.includes("trace_id"), "trace_id is NEVER exposed through the view");
  for (const k of ["id", "kind", "status"]) assert.ok(names.includes(k), `the view exposes ${k}`);

  // The non-author sees the PRIVATE session's task row, but masked.
  const bobRow = (await humanQuery(users.bob, "select * from clara.agent_tasks_visible where id = $1", [privTask])).rows[0];
  assert.ok(bobRow, "a same-firm member sees the task row itself (firm-visible work)");
  assert.equal(bobRow.session_id ?? null, null, "session_id is MASKED (null) for a private session's task to a non-author");
  assert.equal(bobRow.created_by ?? null, null, "created_by is MASKED (null) for a private session's task to a non-author");

  // The author sees real values.
  const aliceRow = (await humanQuery(users.alice, "select * from clara.agent_tasks_visible where id = $1", [privTask])).rows[0];
  assert.ok(aliceRow, "the author sees the task row");
  assert.equal(aliceRow.session_id, privSession, "the author sees the real session_id");
  assert.equal(aliceRow.created_by ?? aliceRow[authorCol], users.alice, "the author sees the real created_by");

  // A firm-shared session's task shows real values to every member.
  const bobShared = (await humanQuery(users.bob, "select * from clara.agent_tasks_visible where id = $1", [sharedTask])).rows[0];
  assert.ok(bobShared, "a member sees the shared session's task");
  assert.equal(bobShared.session_id, sharedSession, "shared session's task exposes session_id to members");
  assert.equal(bobShared.created_by ?? null, users.alice, "shared session's task exposes created_by to members");

  // Firm-pinned + no oracle: cross-firm queries return EMPTY, not errors.
  const dave = await humanQuery(users.dave, "select * from clara.agent_tasks_visible where id = $1", [privTask]);
  assert.equal(dave.rowCount, 0, "cross-firm view query → zero rows (no oracle)");
  const bogus = await humanQuery(users.bob, "select * from clara.agent_tasks_visible where id = $1", [randomUUID()]);
  assert.equal(bogus.rowCount, 0, "an unknown id → zero rows, no error");
});

// ===========================================================================
// §0.5 — clarify content is FIRM-visible (ruling 5), still firm-bounded.
// ===========================================================================

test("§0.5 clarify content: a same-firm member reads the interruption (question included); cross-firm sees nothing", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const { privTask } = fix;
  const marker = `RIGQ_${randomUUID().slice(0, 8)}`;
  const interruption = await insertInterruption({
    task: privTask,
    firm: firms.A,
    question: `${marker} — which client is this?`,
  });
  const { questionCol } = await interruptionColumns();

  const bob = await humanQuery(users.bob, "select to_jsonb(i) as row from clara.agent_interruptions i where i.id = $1", [interruption]);
  assert.equal(bob.rowCount, 1, "a same-firm member reads the clarify row (ruling 5: firm-visible by design)");
  if (questionCol) {
    assert.ok(JSON.stringify(bob.rows[0].row).includes(marker), "the member sees the clarify QUESTION content");
  }
  const dave = await humanQuery(users.dave, "select id from clara.agent_interruptions where id = $1", [interruption]);
  assert.equal(dave.rowCount, 0, "cross-firm: ZERO clarify rows (no oracle)");
});
