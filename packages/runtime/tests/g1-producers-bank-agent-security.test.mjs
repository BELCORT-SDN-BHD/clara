// Gate G1 PR-2b — HIGH-2 (SECURITY DEFINER owner + role matrix) and HIGH-3 (the DB-owned
// idempotency claim under REAL concurrency) for emit_bank_agent_due. Split out of
// g1-producers-bank-agent.test.mjs at the G1 PR-2b fold (Codex r1 review of #449) for the
// 500-line module budget; fixtures shared via g1-producers-bank-agent-fixtures.mjs.

process.env.RELAY_TEST_MODE ??= "1";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, asRuntime, buildFirm, endPool, getPool } from "./relay-fixtures.mjs";
import {
  hasEmitDoor, ensureBankAgentDueEventType, ensureFirmLevelStubType, ensureBankAgentRunDueStub,
  buildActiveBankAccount, eventsFor, STUB_FIRM_LEVEL_TYPE,
} from "./g1-producers-bank-agent-fixtures.mjs";

const HAS_EMIT_DOOR = await hasEmitDoor();
const skip = HAS_EMIT_DOOR ? false : "clara.emit_bank_agent_due(uuid,uuid,text,text) absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first";

before(async () => {
  await ensureBankAgentRunDueStub();
  await ensureBankAgentDueEventType();
  await ensureFirmLevelStubType();
});

after(async () => {
  await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
  await rootQuery("drop table if exists clara._test_g1pr2b_bank_due_stub");
  await endPool();
});

// =====================================================================================
// HIGH-2 — the SECURITY DEFINER owner + the role matrix.
// =====================================================================================

test("HIGH-2: emit_bank_agent_due is owned by clara_fn_owner, SECURITY DEFINER, search_path pinned", { skip }, async () => {
  const r = await rootQuery(
    `select p.proowner::regrole::name as owner, p.prosecdef as secdef,
            'search_path=clara, pg_temp' = any(coalesce(p.proconfig,'{}'::text[])) as path_pinned
       from pg_proc p where p.oid = 'clara.emit_bank_agent_due(uuid,uuid,text,text)'::regprocedure`,
  );
  assert.equal(r.rows[0].owner, "clara_fn_owner");
  assert.equal(r.rows[0].secdef, true);
  assert.equal(r.rows[0].path_pinned, true);
});

test("HIGH-2: the role matrix — ONLY clara_runtime may execute emit_bank_agent_due, and clara_runtime still cannot execute _append_event directly", { skip }, async () => {
  const sig = "clara.emit_bank_agent_due(uuid,uuid,text,text)";
  const runtime = await rootQuery("select has_function_privilege('clara_runtime', $1, 'execute') as ok", [sig]);
  assert.equal(runtime.rows[0].ok, true, "clara_runtime must be able to execute the wrapper");
  for (const role of ["public", "clara_authenticated", "clara_agent_ro"]) {
    const r = await rootQuery("select has_function_privilege($2, $1, 'execute') as ok", [sig, role]);
    assert.equal(r.rows[0].ok, false, `${role} must NOT be able to execute emit_bank_agent_due`);
  }
  const appendSig = "clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)";
  const cannotAppend = await rootQuery("select has_function_privilege('clara_runtime', $1, 'execute') as ok", [appendSig]);
  assert.equal(cannotAppend.rows[0].ok, false, "clara_runtime must still be unable to call _append_event directly — the whole reason this narrow door exists");
});

test("HIGH-2: NULL / inactive / foreign client, and an inactive bank account, are all refused CLR10 THROUGH THE WRAPPER ITSELF (not by calling _append_event directly)", { skip }, async () => {
  const w1 = await buildFirm("g1ba-neg1");
  const w2 = await buildFirm("g1ba-neg2");
  const acct1 = await buildActiveBankAccount(w1, "neg1");

  // NULL client.
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [null, acct1, "k", "unmatched_lines"])),
    /CLR10|unknown or inactive client/i,
  );
  // Unknown client (a fresh random uuid, never inserted).
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [randomUUID(), acct1, "k", "unmatched_lines"])),
    /CLR10|unknown or inactive client/i,
  );
  // Inactive client — deactivate w1's client, then try its own (previously valid) account.
  await rootQuery("update clara.clients set status='archived' where id=$1", [w1.client]);
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w1.client, acct1, "k", "unmatched_lines"])),
    /CLR10|unknown or inactive client/i,
  );
  await rootQuery("update clara.clients set status='active' where id=$1", [w1.client]);
  // Foreign client — w1's account, called with w2's (different, active) client id.
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w2.client, acct1, "k", "unmatched_lines"])),
    /CLR10|not an active account/i,
  );
  // Inactive bank account — deactivate w1's own account, then call with its OWN client (correct
  // pairing, wrong account status).
  await rootQuery("update clara.bank_accounts set active=false, deactivated_at=now(), deactivated_by=$2, deactivated_reason='g1pr2b negative control' where id=$1", [acct1, w1.owner]);
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w1.client, acct1, "k", "unmatched_lines"])),
    /CLR10|not an active account/i,
  );
});

test("HIGH-2: a firm-level event type is refused CLR10 by _append_event's own insert-trigger derivation (negative control on the TYPE, not the wrapper's own guards)", { skip }, async () => {
  // This cell's job is specifically the INSERT TRIGGER's own gate (a firm-level 'bank.agent_due'
  // registration would make client-scoped appends structurally impossible) — distinct from the
  // wrapper's OWN input-validation cell above. Run as root (superuser bypasses the EXECUTE grant
  // this ungranted function would otherwise refuse) since every OTHER _append_event caller in
  // this codebase is likewise a narrowly-scoped SECURITY DEFINER writer, never a bare grant.
  const w = await buildFirm("g1ba-clr10type");
  await assert.rejects(
    rootQuery(
      `select clara._append_event($1, $2, $3, null, null, null, null, null, null, '{}'::jsonb) as seq`,
      [w.firm, STUB_FIRM_LEVEL_TYPE, w.client],
    ),
    /CLR10|client_scoped|firm-level/i,
    "a client_id on a firm-level-registered event type must be refused",
  );
});

// =====================================================================================
// HIGH-3 — the DB-owned claim under REAL concurrency (two independent connections, barriered).
// =====================================================================================

test("HIGH-3: two independent runtime connections racing the SAME (client, account, due_key) — exactly one appended, one skipped", { skip }, async () => {
  const w = await buildFirm("g1ba-race");
  const acct = await buildActiveBankAccount(w, "race");
  const dueKey = `k-race-${randomUUID()}`;

  const pool = getPool();
  const c1 = await pool.connect();
  const c2 = await pool.connect();
  try {
    await c1.query("set role clara_runtime");
    await c2.query("set role clara_runtime");
    // A real barrier: both connections start their statement at (as close to) the same instant,
    // via Promise.all — Postgres's own row lock on the UNIQUE constraint is what actually
    // serializes them; this is not a simulated race, both calls are genuinely in flight together.
    const [r1, r2] = await Promise.all([
      c1.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, dueKey, "unmatched_lines"]),
      c2.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, dueKey, "unmatched_lines"]),
    ]);
    const results = [r1.rows[0].r, r2.rows[0].r];
    const appended = results.filter((r) => r.appended === true);
    const skipped = results.filter((r) => r.appended === false);
    assert.equal(appended.length, 1, `exactly one of the two concurrent calls must have appended, got ${JSON.stringify(results)}`);
    assert.equal(skipped.length, 1, `exactly one must have been skipped as already_claimed, got ${JSON.stringify(results)}`);
    assert.equal(skipped[0].reason, "already_claimed");
    assert.equal((await eventsFor(acct)).length, 1, "exactly one event survived the race");
  } finally {
    await c1.query("reset role").catch(() => {});
    await c2.query("reset role").catch(() => {});
    c1.release();
    c2.release();
  }

  // Terminalize and resubmit the SAME key — still one (the claim never expires for bank_agent;
  // a resolved occurrence stays resolved forever under its own due_key, by design).
  const resubmit = await asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, dueKey, "unmatched_lines"]));
  assert.equal(resubmit.rows[0].r.appended, false);
  assert.equal((await eventsFor(acct)).length, 1, "still exactly one event after a third call with the SAME key");

  // A DIFFERENT key creates the second item.
  const secondKey = `k-race-2-${randomUUID()}`;
  const fresh = await asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, secondKey, "reconcilable"]));
  assert.equal(fresh.rows[0].r.appended, true);
  assert.equal((await eventsFor(acct)).length, 2, "a genuinely different key creates a second event");
});
