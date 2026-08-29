// F-A6 PR-2 — the runtime half's LIVE battery, against a real migrated Postgres.
//
// THE UNIT FILE PROVES WHAT IS ISSUED; THIS ONE PROVES WHAT POSTGRES DOES WITH IT. A captured
// statement sequence can show that `set statement_timeout` precedes the verb call and that the
// release text is `discard all`; it cannot show that a stalled FETCH is actually killed, or that
// an advisory lock a payload took is actually gone. Those are the two obligations whose whole
// point is the DB's behaviour, so each gets a live cell with a discriminating control:
//
//   H-4  the kill time MOVES WITH the pool's own GUC (two arms, same 20-second payload), which is
//        what proves the bound is THIS wall and not something else in the stack of a similar
//        duration. Law 31: a wall never asked is not a wall.
//   H-5  `reset all` is shown, on this exact server, to LEAVE the lock held, and `discard all` to
//        release it — the instrument is mutated rather than trusted — and then the real wrapper is
//        shown to leave nothing behind.
//   S-1  the grant that makes the runtime discipline load-bearing is READ, not assumed: if
//        `clara_freeform_ro` could NOT execute `_freeform_arm`, the unit census would be a wall
//        with a zero population.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import * as rig from "./rig.mjs";
import { mintWakeCredentialObo, mintWakeCredentialClientObo, withRuntime, endPools } from "../lib/pools.mjs";
import * as ff from "../lib/freeform-read.mjs";

const { register } = await import("tsx/esm/api");
register();
const tool = await import("../workflows/chatTurn.v15.freeform.ts");

const READY = await rig
  .rootQuery("select to_regprocedure('clara.wake_freeform_read(text,text,uuid,text,int)') is not null as ok")
  .then((r) => r.rows[0]?.ok === true)
  .catch(() => false);
const skip = READY ? false : "F-A6 (0131) surface absent";

// The tool path reads its pools off the same global the supervisor injects at boot.
const priorPools = globalThis.__claraPools;
globalThis.__claraPools = { mintWakeCredentialObo, mintWakeCredentialClientObo, withFreeformRead: ff.withFreeformRead, withRuntime };

after(async () => {
  globalThis.__claraPools = priorPools;
  await endPools();
  await rig.endPool();
});

/** A firm + a chat session + a LIVE turn — the three things TA-P4's binding needs. */
async function turnFixture(label, { home = false } = {}) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const session = await rig.createChatSession({ author: owner, client: home ? null : client });
  const receipt = await rig.beginChatTurn({ session, author: owner });
  return {
    owner,
    firm,
    client,
    session,
    taskId: receipt.task_id,
    ctx: { firmId: firm, clientId: home ? null : client, createdBy: owner, taskId: receipt.task_id },
  };
}

const receiptFor = (opKey) =>
  rig
    .rootQuery(
      "select id, query_text, purpose, outcome, refusal_reason, settled_at, scope, client_scope, via_wake_kind, task_id, relations_read, row_count from clara.freeform_read_log where op_key = $1",
      [opKey],
    )
    .then((r) => r.rows);

/** Mint the kind the mint census would mint for this ctx, and call the verb directly. Used by the
 *  H-4/H-5 cells, which need a payload the TOOL's own schema would never carry. */
async function rawRead(ctx, sql, opKey, purpose = "battery probe") {
  const { secret } = ctx.clientId
    ? await mintWakeCredentialClientObo(ctx.firmId, ctx.createdBy, ctx.clientId)
    : await mintWakeCredentialObo(ctx.firmId, ctx.createdBy);
  return ff.withFreeformRead({ secret, sql, purpose, taskId: ctx.taskId, opKey, rowCap: null });
}

// =============================================================================================
// S-1 · the grant this discipline exists to guard is REAL (law 31 — no zero-population wall).
// =============================================================================================

test("f-a6.pr2.db.s1-non-vacuous: clara_freeform_ro CAN execute _freeform_arm and _freeform_settle directly", { skip }, async () => {
  const r = await rig.rootQuery(
    `select has_function_privilege('clara_freeform_ro','clara._freeform_arm(text,text,uuid,text)','EXECUTE') as arm,
            has_function_privilege('clara_freeform_ro','clara._freeform_settle(text,int,bigint,text[],int,jsonb)','EXECUTE') as settle,
            has_function_privilege('clara_freeform_ro','clara.wake_freeform_read(text,text,uuid,text,int)','EXECUTE') as verb`,
  );
  assert.equal(r.rows[0].verb, true, "positive control — the verb the wrapper DOES call is reachable");
  assert.equal(r.rows[0].arm, true, "the arm IS directly callable — which is exactly why S-1 is a runtime discipline");
  assert.equal(r.rows[0].settle, true, "so is the settle");
});

// =============================================================================================
// The happy path, the receipt, and the scope compiled from the credential (both directions).
// =============================================================================================

test("f-a6.pr2.db.home: a HOME read is admitted, narrative, firm-scoped, and leaves ONE settled receipt", { skip }, async () => {
  const f = await turnFixture("fa6home", { home: true });
  const opKey = `freeform:${f.taskId}:0:1`;
  const sql = "select count(*) as n from clara.journal_entries";
  const out = await rawRead(f.ctx, sql, opKey, "how many entries does this firm have");
  assert.equal(out.ok, true, `expected an admitted read, got ${JSON.stringify(out)}`);
  assert.equal(out.authority, "narrative", "TA-P10 C′ — never an authoritative number");
  assert.equal(out.claim_eligible, false);
  assert.equal(out.scope, "firm");
  assert.equal(out.scope_clients, null, "a HOME read compiles NO client pin");
  assert.ok(Number.isInteger(out.read_id) || typeof out.read_id === "string");

  const rows = await receiptFor(opKey);
  assert.equal(rows.length, 1, "exactly one receipt row per committed read");
  assert.equal(rows[0].query_text, sql, "byte-identical text identity (R-3)");
  assert.equal(rows[0].purpose, "how many entries does this firm have");
  assert.equal(rows[0].outcome, "ok");
  assert.ok(rows[0].settled_at !== null, "the DEFERRED must-settle trigger would have aborted the commit otherwise");
  assert.equal(rows[0].via_wake_kind, "interactive");
  assert.equal(rows[0].task_id, f.taskId, "TA-P4 — bound to the triggering turn");
});

test("f-a6.pr2.db.pinned: a client-bound session's read compiles the pin FROM THE CREDENTIAL", { skip }, async () => {
  const f = await turnFixture("fa6pin");
  const opKey = `freeform:${f.taskId}:0:1`;
  const out = await rawRead(f.ctx, "select id from clara.clients", opKey);
  assert.equal(out.ok, true, `expected an admitted read, got ${JSON.stringify(out)}`);
  assert.equal(out.scope, "client");
  assert.deepEqual(out.scope_clients, [f.client]);
  assert.match(String(out.scope_note), /cannot see or compare against/, "a narrowed answer can never read as a complete one");
  const rows = await receiptFor(opKey);
  assert.equal(rows[0].via_wake_kind, "interactive_client");
  assert.deepEqual(rows[0].client_scope, [f.client]);
  // ...and the S-1c arm actually scopes: the pinned session sees ONE client, not the firm's set.
  assert.equal(out.row_count, 1, "clara.clients is pinned on `id`, not on a `client_id` column it does not have");
});

// =============================================================================================
// H-4 · a stalled FETCH is bounded, and the bound MOVES WITH the pool's own GUC.
// =============================================================================================

test("f-a6.pr2.db.h4: a 20-second fetch is killed at the pool's session statement_timeout, and the kill time tracks it", { skip }, async () => {
  const f = await turnFixture("fa6h4", { home: true });
  const prior = process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
  const stall = "select pg_sleep(20)::text as x";
  const arm = async (ms, opKey) => {
    process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = String(ms);
    const t0 = Date.now();
    let err = null;
    try {
      await rawRead(f.ctx, stall, opKey);
    } catch (e) {
      err = e;
    }
    return { elapsed: Date.now() - t0, err };
  };
  try {
    const a = await arm(2000, `freeform:${f.taskId}:0:1`);
    const b = await arm(6000, `freeform:${f.taskId}:0:2`);
    assert.ok(a.err, "the stalled fetch must NOT return — it is killed");
    assert.equal(a.err.code, "57014", `expected query_canceled, got ${a.err.code}: ${a.err.message}`);
    assert.ok(a.elapsed < 12000, `killed well before the payload's own 20s — took ${a.elapsed}ms`);
    assert.ok(b.err && b.err.code === "57014", "the same payload is killed at the larger bound too");
    assert.ok(
      b.elapsed > a.elapsed + 1500,
      `the kill time must MOVE WITH the GUC (2s arm ${a.elapsed}ms vs 6s arm ${b.elapsed}ms) — otherwise something else is doing the bounding`,
    );
    // TIER D, stated rather than papered over: the transaction died with the statement, so there
    // is no committed receipt. The runtime's task record is the honest home (design §3.5 Tier D).
    assert.equal((await receiptFor(`freeform:${f.taskId}:0:1`)).length, 0, "a Tier-D death leaves NO receipt — and the design says so");
  } finally {
    if (prior === undefined) delete process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
    else process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = prior;
  }
});

// =============================================================================================
// H-5 · DISCARD ALL releases what RESET ALL would have left behind.
// =============================================================================================

const LOCK_A = 918273;
const LOCK_B = 645;
const lockCount = () =>
  rig
    .rootQuery("select count(*)::int as n from pg_locks where locktype='advisory' and classid=$1 and objid=$2", [LOCK_A, LOCK_B])
    .then((r) => r.rows[0].n);

test("f-a6.pr2.db.h5-instrument: on THIS server, `reset all` leaves a session advisory lock held and `discard all` releases it", { skip }, async () => {
  // The instrument is mutated, not trusted: if `reset all` had sufficed, H-5 would be a
  // preference. This cell is what makes it a wall.
  const c = new pg.Client({});
  await c.connect();
  try {
    await c.query("select pg_advisory_lock($1,$2)", [LOCK_A, LOCK_B]);
    assert.equal(await lockCount(), 1, "the lock is held");
    await c.query("reset all");
    assert.equal(await lockCount(), 1, "RESET ALL restores GUCs and NOTHING else — the lock survives");
    await c.query("discard all");
    assert.equal(await lockCount(), 0, "DISCARD ALL runs pg_advisory_unlock_all()");
  } finally {
    await c.query("select pg_advisory_unlock_all()").catch(() => {});
    await c.end();
  }
});

test("f-a6.pr2.db.h5: a payload that takes a session advisory lock leaves NOTHING behind after the wrapper releases", { skip }, async () => {
  const f = await turnFixture("fa6h5", { home: true });
  assert.equal(await lockCount(), 0, "clean before");
  const out = await rawRead(f.ctx, `select pg_advisory_lock(${LOCK_A}, ${LOCK_B}) is null as x`, `freeform:${f.taskId}:0:1`);
  assert.equal(out.ok, true, `the payload itself is lawful — that is the point (${JSON.stringify(out?.refusal_reason)})`);
  assert.equal(await lockCount(), 0, "the checkout released it — R-9's whole failure mode, closed");
});

// =============================================================================================
// The refusal surface: the receipt records the exact token, the model gets one string.
// =============================================================================================

test("f-a6.pr2.db.oracle: a pg_proc payload is refused relation_not_enumerated IN THE RECEIPT, and collapses for the model", { skip }, async () => {
  const f = await turnFixture("fa6cat", { home: true });
  const opKey = `freeform:${f.taskId}:0:1`;
  const out = await rawRead(f.ctx, "select prosrc from pg_proc limit 1", opKey, "probing the catalog");
  assert.equal(out.ok, false, "a PUBLIC-readable catalog relation is the ONE non-vacuous relation-census cell (D-24)");
  assert.equal(out.refusal_reason, "relation_not_enumerated");
  const rows = await receiptFor(opKey);
  assert.equal(rows.length, 1, "a Tier-B refusal COMMITS its receipt so the reason is durable");
  assert.equal(rows[0].outcome, "refused");
  assert.equal(rows[0].refusal_reason, "relation_not_enumerated", "the receipt keeps the exact token");
  const refusal = tool.freeformRefusal(out.refusal_reason);
  assert.equal(refusal.reason, tool.FREEFORM_ORACLE_REASON, "...and the model does not");
  assert.equal(refusal.message, tool.FREEFORM_ORACLE_MESSAGE);
});

test("f-a6.pr2.db.cross-client: a pinned credential against another client's session is refused, and the runtime NAMES the deferred action", { skip }, async () => {
  const f = await turnFixture("fa6xc");
  // A SECOND client in the same firm, and a ctx pointing at it while the turn's session is bound
  // to the first — the one structural, non-lexical signal of a cross-client reach (0131 §6.3(a)).
  const other = await rig.createClient(f.owner, { name: `${f.client}_sibling`, opKey: rig.opk("cli2") });
  const rogueCtx = { ...f.ctx, clientId: other };
  let thrown = null;
  try {
    await rawRead(rogueCtx, "select count(*) as n from clara.journal_entries", `freeform:${f.taskId}:0:9`);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, "the congruence pair raises rather than quietly narrowing");
  assert.equal(thrown.code, "CLR10");
  const refusal = tool.freeformRefusalFromThrown(thrown);
  assert.equal(refusal.reason, "cross_client_unavailable", "the runtime's projection-read of the message lands on the right branch, live");
  assert.match(refusal.message, /deferred, not forbidden/);
  assert.equal((await receiptFor(`freeform:${f.taskId}:0:9`)).length, 0, "a Tier-A raise aborts and leaves no receipt");
});

test("f-a6.pr2.db.session-pin-missing: an UNPINNED credential on a client-bound session is refused by the DB belt too", { skip }, async () => {
  const f = await turnFixture("fa6spm");
  // The exact failure the runtime mint census exists to prevent — forced here by bypassing it.
  const homeCtx = { ...f.ctx, clientId: null };
  await assert.rejects(
    () => rawRead(homeCtx, "select count(*) as n from clara.journal_entries", `freeform:${f.taskId}:0:8`),
    (e) => e.code === "CLR03" && /session_pin_missing/.test(e.message),
    "belts, not substitutes: the runtime stops the call being made, the DB stops it landing",
  );
});

// =============================================================================================
// The enumerated list, the tool path end to end, and the metering row.
// =============================================================================================

test("f-a6.pr2.db.drift: the model-facing enumerated list matches the LIVE grant, both directions", { skip }, async () => {
  const r = await rig.rootQuery(
    `select c.relname::text as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relkind in ('r','p','v','m')
        and has_table_privilege('clara_freeform_ro', c.oid, 'SELECT') order by 1`,
  );
  const live = r.rows.map((x) => x.rel);
  const declared = [...tool.FREEFORM_ENUMERATED_RELATIONS].sort();
  assert.deepEqual(
    live.slice().sort(),
    declared,
    "R-1: the enumerated list is a moving wall — a grant change without a prompt change costs the model a wasted refusal, and this cell is what says so",
  );
});

test("f-a6.pr2.db.tool-path: runFreeformRead admits, and meters ONE freeform_read row against the turn", { skip }, async () => {
  const f = await turnFixture("fa6meter");
  const before = await rig.rootQuery("select count(*)::int as n from clara.llm_usage_events where agent_task_id = $1 and call_kind = 'freeform_read'", [f.taskId]);
  const out = await tool.runFreeformRead(f.ctx, { sql: "select count(*) as n from clara.journal_entries", purpose: "a real tool-path read" }, "gpt-test", 0, 1);
  assert.equal(out.ok, true, `expected an admitted read, got ${JSON.stringify(out)}`);
  assert.equal(out.read.authority, "narrative");
  const after = await rig.rootQuery(
    "select call_kind, outcome, via_wake_kind, engine_id, input_tokens, output_tokens, duration_ms, client_id, triggering_actor from clara.llm_usage_events where agent_task_id = $1 and call_kind = 'freeform_read'",
    [f.taskId],
  );
  assert.equal(after.rows.length, before.rows[0].n + 1, "exactly one metering row per call (law 76 — meter, never cap)");
  const row = after.rows[after.rows.length - 1];
  assert.equal(row.outcome, "success");
  assert.equal(row.via_wake_kind, "interactive_client", "the kind actually minted for a client-bound session");
  assert.equal(row.client_id, f.client);
  assert.equal(row.triggering_actor, f.owner);
  assert.equal(row.input_tokens, null, "a DB read spends no tokens");
  assert.equal(row.output_tokens, null);
  assert.ok(Number.isInteger(row.duration_ms) && row.duration_ms >= 0);
});
