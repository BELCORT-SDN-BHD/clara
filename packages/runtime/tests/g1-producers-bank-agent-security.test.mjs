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
  buildActiveBankAccount, buildReasonSubject, eventsFor, STUB_FIRM_LEVEL_TYPE,
} from "./g1-producers-bank-agent-fixtures.mjs";
import { waitBlockedByOrThrow, backendPid } from "./pg-lock-wait.mjs";
import { EMIT_REASONS } from "../lib/reconciler-bank-agent.mjs";

const HAS_EMIT_DOOR = await hasEmitDoor();
const skip = HAS_EMIT_DOOR ? false : "clara.emit_bank_agent_due(uuid,uuid,uuid,text) absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first";

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
       from pg_proc p where p.oid = 'clara.emit_bank_agent_due(uuid,uuid,uuid,text)'::regprocedure`,
  );
  assert.equal(r.rows[0].owner, "clara_fn_owner");
  assert.equal(r.rows[0].secdef, true);
  assert.equal(r.rows[0].path_pinned, true);
});

test("HIGH-2: the role matrix — ONLY clara_runtime may execute emit_bank_agent_due, and clara_runtime still cannot execute _append_event directly", { skip }, async () => {
  const sig = "clara.emit_bank_agent_due(uuid,uuid,uuid,text)";
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
  const valid = await buildReasonSubject(w1, "unmatched_lines", "neg1");
  const acct1 = valid.bankAccountId;

  // NULL client.
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [null, acct1, valid.subjectId, "unmatched_lines"])),
    /CLR10|unknown or inactive client/i,
  );
  // Unknown client (a fresh random uuid, never inserted).
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [randomUUID(), acct1, valid.subjectId, "unmatched_lines"])),
    /CLR10|unknown or inactive client/i,
  );
  // Inactive client — deactivate w1's client, then try its own (previously valid) account.
  await rootQuery("update clara.clients set status='archived' where id=$1", [w1.client]);
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w1.client, acct1, valid.subjectId, "unmatched_lines"])),
    /CLR10|unknown or inactive client/i,
  );
  await rootQuery("update clara.clients set status='active' where id=$1", [w1.client]);
  // Foreign client — w1's account, called with w2's (different, active) client id.
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w2.client, acct1, valid.subjectId, "unmatched_lines"])),
    /CLR10|not an active account/i,
  );
  // Inactive bank account — deactivate w1's own account, then call with its OWN client (correct
  // pairing, wrong account status).
  await rootQuery("update clara.bank_accounts set active=false, deactivated_at=now(), deactivated_by=$2, deactivated_reason='g1pr2b negative control' where id=$1", [acct1, w1.owner]);
  await assert.rejects(
    asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w1.client, acct1, valid.subjectId, "unmatched_lines"])),
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
// R2-1 (Codex r2 review of #449, HIGH) — the SQL door's OWN closed reason-set wall, driven AS
// clara_runtime (never merely the TypeScript classifier, which a direct SQL caller bypasses
// entirely). Every quiet/deferred/unknown/null/blank reason must refuse CLR10 and leave ZERO
// claims/events; each of the three allowed reasons must append exactly once.
// =====================================================================================

test("R2-1: every reason OUTSIDE the closed emit-worthy set (quiet/deferred/unknown/null/blank) refuses CLR10 through the SQL door itself, zero claims/events", { skip }, async () => {
  const w = await buildFirm("g1ba-r21");
  const acct = await buildActiveBankAccount(w, "r21");
  const refused = ["chase_statement", "purpose_unconsented", "held", "nothing_due", "some_new_reason_nobody_ruled", null, "", "   "];
  for (const reason of refused) {
    await assert.rejects(
      asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w.client, acct, randomUUID(), reason])),
      /CLR10|closed emit-worthy reason set/i,
      `reason ${JSON.stringify(reason)} must be refused`,
    );
  }
  assert.equal((await eventsFor(acct)).length, 0, "not one of the refused reasons may have left an event behind");
  const claims = await rootQuery("select count(*)::int as n from clara.bank_agent_due_claims where client_id=$1", [w.client]);
  assert.equal(claims.rows[0].n, 0, "not one of the refused reasons may have left a claim row behind either");
});

test("R2-1: each of the three closed emit-worthy reasons appends exactly once through the SQL door", { skip }, async () => {
  for (const reason of ["unmatched_lines", "reconcilable", "retry_later"]) {
    const w = await buildFirm(`g1ba-r21ok-${reason.slice(0, 4)}`);
    const subject = await buildReasonSubject(w, reason, `r21ok-${reason}`);
    const r = await asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, subject.bankAccountId, subject.subjectId, reason]));
    assert.equal(r.rows[0].r.appended, true, `${reason} must append`);
    assert.equal((await eventsFor(subject.bankAccountId)).length, 1, `${reason} must produce exactly one event`);
  }
});

test("R2-1: the installed SQL door and runtime classifier expose the SAME closed emit-reason set", { skip }, async () => {
  const r = await rootQuery(
    "select prosrc from pg_proc where oid='clara.emit_bank_agent_due(uuid,uuid,uuid,text)'::regprocedure",
  );
  const source = r.rows[0]?.prosrc ?? "";
  const clauses = [...source.matchAll(/p_reason\s+not\s+in\s*\(([^)]+)\)/gi)];
  assert.equal(clauses.length, 1, "the door must carry one explicit p_reason NOT IN (...) closed-set guard");
  const sqlReasons = [...clauses[0][1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  const expected = ["reconcilable", "retry_later", "unmatched_lines"];
  assert.deepEqual(sqlReasons, expected, "the installed door's source drifted from the ruled three-value set");

  assert.deepEqual([...EMIT_REASONS].sort(), sqlReasons,
    "runtime EMIT_REASONS and the installed SQL wall must expose exactly the same set");
});

// =====================================================================================
// R2-2 (Codex r3 review of #449) — the SQL door derives due_key from a DB-owned subject. Missing,
// foreign and wrong-kind ids refuse before claims/events; repeated subjects dedupe; distinct
// statement ids on one account derive distinct SHA-256 keys.
// =====================================================================================

test("R2-2: missing, foreign and wrong-kind subjects refuse CLR10 before any claim/event", { skip }, async () => {
  const w1 = await buildFirm("g1ba-r22a");
  const w2 = await buildFirm("g1ba-r22b");
  const own = await buildReasonSubject(w1, "unmatched_lines", "r22-own");
  const foreign = await buildReasonSubject(w2, "unmatched_lines", "r22-foreign");
  for (const [subject, reason] of [
    [null, "unmatched_lines"],
    [randomUUID(), "unmatched_lines"],
    [foreign.subjectId, "unmatched_lines"],
    [own.lineIds[0], "unmatched_lines"],
    [own.statementId, "retry_later"],
  ]) {
    await assert.rejects(
      asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4)", [w1.client, own.bankAccountId, subject, reason])),
      /CLR10|subject/i,
    );
  }
  const claims = await rootQuery("select count(*)::int as n from clara.bank_agent_due_claims where client_id=$1", [w1.client]);
  assert.equal(claims.rows[0].n, 0);
  assert.equal((await eventsFor(own.bankAccountId)).length, 0);
});

test("R2-2: the door derives the exact SHA-256 key and the same subject dedupes", { skip }, async () => {
  const w = await buildFirm("g1ba-r22-key");
  const subject = await buildReasonSubject(w, "unmatched_lines", "r22-key");
  const first = await asRuntime((c) => c.query(
    "select clara.emit_bank_agent_due($1,$2,$3,$4) as r",
    [w.client, subject.bankAccountId, subject.subjectId, "unmatched_lines"],
  ));
  const expected = (await rootQuery(
    "select encode(sha256(convert_to($1::text || $2::text || $3 || $4::text,'UTF8')),'hex') as key",
    [w.client, subject.bankAccountId, "unmatched_lines", subject.subjectId],
  )).rows[0].key;
  assert.equal(first.rows[0].r.due_key, expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
  const repeat = await asRuntime((c) => c.query(
    "select clara.emit_bank_agent_due($1,$2,$3,$4) as r",
    [w.client, subject.bankAccountId, subject.subjectId, "unmatched_lines"],
  ));
  assert.equal(repeat.rows[0].r.appended, false);
  assert.equal(repeat.rows[0].r.reason, "already_claimed");
  assert.equal((await eventsFor(subject.bankAccountId)).length, 1);
});

// =====================================================================================
// HIGH-3 — the DB-owned claim under REAL concurrency (two independent connections, barriered).
// =====================================================================================

test("R2-4: a GENUINE barrier — T1 holds the claim row uncommitted, T2 is PROVEN blocked on it (waitBlockedByOrThrow), then T1 releases — exactly one appended, one skipped", { skip }, async () => {
  const w = await buildFirm("g1ba-race");
  const subject = await buildReasonSubject(w, "unmatched_lines", "race");
  const acct = subject.bankAccountId;

  const pool = getPool();
  const c1 = await pool.connect();
  const c2 = await pool.connect();
  try {
    await c1.query("set role clara_runtime");
    await c2.query("set role clara_runtime");
    const c2Pid = await backendPid(c2); // taken BEFORE c2 is put in flight — a busy connection cannot answer its own pid query

    // T1 opens an EXPLICIT transaction and claims the row — this INSERT is now uncommitted and
    // holds the UNIQUE index entry's lock until T1 commits or rolls back.
    await c1.query("begin");
    const t1Pid = await backendPid(c1); // c1 is idle-in-transaction here, free to answer
    const r1 = await c1.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, subject.subjectId, "unmatched_lines"]);
    assert.equal(r1.rows[0].r.appended, true, "T1's own claim must succeed — nothing else holds this key yet");
    // T2 fires the SAME call on its OWN (autocommitting) connection — its own INSERT ... ON
    // CONFLICT must BLOCK on T1's uncommitted row, because Postgres cannot yet know whether T1
    // will commit (making T2's insert a genuine conflict) or roll back (freeing the key). Do NOT
    // await this yet — it will not resolve until T1 releases.
    const r2p = c2.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, subject.subjectId, "unmatched_lines"]);

    // THE POSITIVE PROOF (review law 2): read pg_stat_activity from a THIRD connection and
    // confirm T2 is observably waiting on a Lock held by T1's own backend pid — not inferred
    // from timing, not a bare Promise.all of two racing calls.
    await waitBlockedByOrThrow(c2Pid, t1Pid, { what: "the bank_agent_due_claims UNIQUE row T1 holds uncommitted" });

    // NOW release T1 — T2's blocked insert resolves.
    await c1.query("commit");
    const r2 = await r2p;

    const results = [r1.rows[0].r, r2.rows[0].r];
    const appended = results.filter((r) => r.appended === true);
    const skipped = results.filter((r) => r.appended === false);
    assert.equal(appended.length, 1, `exactly one of the two must have appended, got ${JSON.stringify(results)}`);
    assert.equal(skipped.length, 1, `exactly one must have been skipped as already_claimed, got ${JSON.stringify(results)}`);
    assert.equal(skipped[0].reason, "already_claimed");
    assert.equal((await eventsFor(acct)).length, 1, "exactly one event survived the race");
  } finally {
    await c1.query("rollback").catch(() => {});
    await c1.query("reset role").catch(() => {});
    await c2.query("reset role").catch(() => {});
    c1.release();
    c2.release();
  }

  // Resubmit the SAME subject — still one (the claim never expires for bank_agent).
  const resubmit = await asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, subject.subjectId, "unmatched_lines"]));
  assert.equal(resubmit.rows[0].r.appended, false);
  assert.equal((await eventsFor(acct)).length, 1, "still exactly one event after a third call with the SAME key");

  // A DIFFERENT statement subject on the SAME account creates the second item.
  const second = await buildReasonSubject(w, "reconcilable", "race-2", {
    bankAccountId: acct, periodStart: "2024-08-01", periodEnd: "2024-08-31", lineDate: "2024-08-15",
  });
  const fresh = await asRuntime((c) => c.query("select clara.emit_bank_agent_due($1,$2,$3,$4) as r", [w.client, acct, second.subjectId, "reconcilable"]));
  assert.equal(fresh.rows[0].r.appended, true);
  assert.equal((await eventsFor(acct)).length, 2, "a genuinely different key creates a second event");
});
