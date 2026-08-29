// F-A6 PR-2 — THE FIX ROUND'S LIVE CELLS (cross-model review, 2026-08-29). Against a real
// migrated Postgres, because every claim here is about what the DATABASE does:
//
//   HIGH  f-a6.pr2.boot.eager            — the absent secret exits non-zero naming the var; with
//                                          it set, passes (both arms, both entry points)
//   MED   tier-d.zero-receipt            — the live measurement the honest prompt wording rests on
//   LOW   adversarial.arm-settle         — a payload calling the granted writers forges nothing
//   LOW   adversarial.session-state      — a payload's non-local GUC is gone after release, on
//                                          the SAME backend
//   LOW   adversarial.lock-and-stall     — the combined Tier-D path: lock + stall past the GUC
//   LOW   adversarial.wake-secret        — a payload reads the wake secret back as ""

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as rig from "./rig.mjs";
import { mintWakeCredentialObo, mintWakeCredentialClientObo, withRuntime, endPools } from "../lib/pools.mjs";
import * as ff from "../lib/freeform-read.mjs";

const run = promisify(execFile);
const { register } = await import("tsx/esm/api");
register();
const tool = await import("../workflows/chatTurn.v15.freeform.ts");

const READY = await rig
  .rootQuery("select to_regprocedure('clara.wake_freeform_read(text,text,uuid,text,int)') is not null as ok")
  .then((r) => r.rows[0]?.ok === true)
  .catch(() => false);
const skip = READY ? false : "F-A6 (0131) surface absent";

const priorPools = globalThis.__claraPools;
globalThis.__claraPools = { mintWakeCredentialObo, mintWakeCredentialClientObo, withFreeformRead: ff.withFreeformRead, withRuntime };

after(async () => {
  globalThis.__claraPools = priorPools;
  await endPools();
  await rig.endPool();
});

async function turnFixture(label, { home = false } = {}) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const session = await rig.createChatSession({ author: owner, client: home ? null : client });
  const receipt = await rig.beginChatTurn({ session, author: owner });
  return {
    owner,
    firm,
    client,
    taskId: receipt.task_id,
    ctx: { firmId: firm, clientId: home ? null : client, createdBy: owner, taskId: receipt.task_id },
  };
}

async function rawRead(ctx, sql, opKey, purpose = "fix-round probe") {
  const { secret } = ctx.clientId
    ? await mintWakeCredentialClientObo(ctx.firmId, ctx.createdBy, ctx.clientId)
    : await mintWakeCredentialObo(ctx.firmId, ctx.createdBy);
  return ff.withFreeformRead({ secret, sql, purpose, taskId: ctx.taskId, opKey, rowCap: null });
}

const receiptRows = (opKey) =>
  rig.rootQuery("select id, outcome, settled_at from clara.freeform_read_log where op_key = $1", [opKey]).then((r) => r.rows);

const usageRows = (taskId) =>
  rig
    .rootQuery("select outcome, engine_id from clara.llm_usage_events where agent_task_id = $1 and call_kind = 'freeform_read'", [taskId])
    .then((r) => r.rows);

// =============================================================================================
// HIGH · The eager boot assert, both arms and both entry points.
//
// `scripts/serve.mjs:22` and `scripts/worker.mjs:17` BOTH call assertProductionPoolConfig, and
// both do it before importing the built Nitro server — so a pre-ceremony deploy takes the server
// AND the worker down, not just the freeform read. That is the cost the README now states.
// =============================================================================================

test("f-a6.pr2.boot.eager: an absent CLARA_FREEFORM_DATABASE_URL exits non-zero naming the var; with it set, it passes", { skip: false }, async () => {
  // The POSITIONAL half, read from the sources: the assert must precede the Nitro import in BOTH
  // entry points, or a world-off skeleton boot would reach Nitro with an unconfigured pool.
  for (const name of ["serve.mjs", "worker.mjs"]) {
    const src = await readFile(fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), "utf8");
    const assertAt = src.indexOf("assertProductionPoolConfig()");
    const nitroAt = src.indexOf(".output/server/index.mjs");
    assert.ok(assertAt > 0, `positive control: ${name} calls the assert`);
    if (nitroAt > 0) assert.ok(assertAt < nitroAt, `${name} must assert BEFORE importing the built server`);
  }

  // The BEHAVIOURAL half, in a real subprocess with RELAY_TEST_MODE UNSET (production posture).
  const base = { ...process.env };
  delete base.RELAY_TEST_MODE;
  const withDsns = {
    ...base,
    CLARA_RUNTIME_DATABASE_URL: "postgres://x/y",
    CLARA_READ_DATABASE_URL: "postgres://x/y",
    CLARA_WRITE_DATABASE_URL: "postgres://x/y",
    CLARA_START_WORLD: "0",
  };
  const child = "import('../lib/pools.mjs').then(m => m.assertProductionPoolConfig());";
  const cwd = fileURLToPath(new URL("./", import.meta.url));

  const absent = await run(process.execPath, ["--input-type=module", "-e", child], { cwd, env: withDsns }).then(
    () => ({ code: 0, stderr: "" }),
    (e) => ({ code: e.code ?? 1, stderr: String(e.stderr ?? "") }),
  );
  assert.notEqual(absent.code, 0, "a world booted without the freeform DSN must REFUSE to start");
  assert.match(absent.stderr, /CLARA_FREEFORM_DATABASE_URL is REQUIRED in production/, "and must say which secret, by name");
  assert.match(absent.stderr, /clara_freeform_login/, "...and which login it belongs to, so the ceremony is obvious");

  const present = await run(process.execPath, ["--input-type=module", "-e", child], {
    cwd,
    env: { ...withDsns, CLARA_FREEFORM_DATABASE_URL: "postgres://x/y" },
  }).then(() => ({ code: 0, stderr: "" }), (e) => ({ code: e.code ?? 1, stderr: String(e.stderr ?? "") }));
  assert.equal(present.code, 0, `with every DSN present the assert passes: ${present.stderr}`);
});

// =============================================================================================
// MED · The live half of the honest prompt wording: a read that dies before the database reaches
// a verdict leaves NO receipt. The prompt no longer claims otherwise.
// =============================================================================================

test("f-a6.pr2.fix.tier-d.zero-receipt: a top-level timeout leaves NO freeform receipt, and the turn's own record carries it", { skip }, async () => {
  const f = await turnFixture("fa6tierd", { home: true });
  const prior = process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
  process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = "6000"; // above the verb's 5s deadline; the payload outlives both
  let out;
  try {
    out = await tool.runFreeformRead(f.ctx, { sql: "select pg_sleep(30)::text as x", purpose: "tier-d probe" }, "gpt-test", 0, 1);
  } finally {
    if (prior === undefined) delete process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
    else process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = prior;
  }
  assert.equal(out.ok, false, "the read was killed");
  assert.equal(out.refusal.reason, tool.FREEFORM_ORACLE_REASON, "and the model gets the oracle-safe string, not the SQLSTATE");
  assert.equal((await receiptRows(`freeform:${f.taskId}:0:1`)).length, 0, "NO receipt — the transaction died with the statement, which is EXACTLY what the prompt now says");
  // The refusal the human sees is a typed part on the turn's own durable record; the metering
  // row is the ledger's half. Both are best-effort by inherited design (law 76) — the prompt
  // claims a durable RECORD, not an exactly-once ledger, and that is the claim this measures.
  assert.equal((await usageRows(f.taskId)).length, 1, "the usage row for the killed read");
  assert.equal((await usageRows(f.taskId))[0].outcome, "error");
});

// =============================================================================================
// LOW (a) · A payload calling the granted writers forges nothing. 0131's S-1 note in words,
// measured — and the two shapes differ, which the note predicts and this cell pins.
// =============================================================================================

test("f-a6.pr2.fix.adversarial.arm-settle: a payload naming _freeform_arm/_freeform_settle forges NOTHING, and the next read is clean", { skip }, async () => {
  const f = await turnFixture("fa6adv", { home: true });
  const before = (await rig.rootQuery("select count(*)::int as n from clara.freeform_read_log where firm_id = $1", [f.firm])).rows[0].n;

  // SHAPE 1 — the ARM. MEASURED (this cell's first cut expected an abort and the rig said
  // otherwise): the RAISE happens at FETCH, inside the verb's own fetch loop, whose scoped
  // `exception when others` converts it to a Tier-B refusal. The transaction SURVIVES, the read
  // is refused `runtime_error`, and exactly ONE receipt commits — the honest one, for the real
  // read. Nothing is forged, which is the property that matters.
  const armOut = await rawRead(f.ctx, "select clara._freeform_arm('select 1','forge',null,'k')::text as x", `freeform:${f.taskId}:9:arm`);
  assert.equal(armOut.ok, false, "a payload that calls the arm cannot produce an admitted read");
  assert.equal(armOut.refusal_reason, "runtime_error", "the fetch loop's own scoped handler names it");
  const armReceipts = await receiptRows(`freeform:${f.taskId}:9:arm`);
  assert.equal(armReceipts.length, 1, "ONE receipt — the real read's own, committed with its refusal");
  assert.equal(armReceipts[0].outcome, "refused");

  // SHAPE 2 — the SETTLE. This one DOES destroy the transaction: it settles the row this call
  // already armed, so the verb's own settle collides with D-20's one-settle-per-transaction wall
  // and the whole transaction aborts. Net effect is DENIAL of the payload's own read (Tier-D
  // family), never a forged receipt.
  let thrown = null;
  try {
    await rawRead(f.ctx, "select clara._freeform_settle('ok',0,0,null,0,'{}'::jsonb)::text as x", `freeform:${f.taskId}:9:settle`);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, "the settle-from-inside payload aborts its own transaction");
  assert.equal(thrown.code, "CLR10");
  assert.match(String(thrown.message), /double_settle/, "D-20's wall, by name");
  assert.equal((await receiptRows(`freeform:${f.taskId}:9:settle`)).length, 0, "an aborted transaction commits NO receipt at all");

  // NOTHING FORGED, counted.
  const afterN = (await rig.rootQuery("select count(*)::int as n from clara.freeform_read_log where firm_id = $1", [f.firm])).rows[0].n;
  assert.equal(afterN, before + 1, "one attempt left one honest refusal receipt; the other left none; zero forged rows");

  // ...and the next lawful read is clean — no session or pool residue from either attempt.
  const ok = await rawRead(f.ctx, "select count(*) as n from clara.journal_entries", `freeform:${f.taskId}:9:ok`);
  assert.equal(ok.ok, true, `the very next lawful read still succeeds: ${JSON.stringify(ok?.refusal_reason)}`);
});

// =============================================================================================
// LOW (b) · H-5's GUC half. The pool is pinned to ONE connection so "the same backend" is a
// measured fact rather than a hope.
// =============================================================================================

test("f-a6.pr2.fix.adversarial.session-state: a payload's NON-LOCAL GUC is gone at the next checkout of the SAME backend", { skip }, async () => {
  const priorMax = process.env.CLARA_FREEFORM_POOL_MAX;
  process.env.CLARA_FREEFORM_POOL_MAX = "1";
  await ff.endFreeformPool();
  assert.equal(ff.freeformPoolMax(), 1, "the pool size is read when the pool is CREATED, so this pin actually binds");
  try {
    const f = await turnFixture("fa6state", { home: true });
    const one = await rawRead(
      f.ctx,
      "select set_config('clara.freeform_probe','poisoned',false) || ':' || pg_backend_pid()::text as x",
      `freeform:${f.taskId}:8:1`,
    );
    assert.equal(one.ok, true, `the payload itself is lawful — that is the point (${JSON.stringify(one?.refusal_reason)})`);
    const [poisonSeen, firstPid] = String(one.rows[0].x).split(":");
    assert.equal(poisonSeen, "poisoned", "POSITIVE CONTROL: the payload really did set it, so read 2's absence means something");

    // Read 2 deliberately does NOT count `pg_cursors`: MEASURED, that view is over the
    // set-returning `pg_cursor()`, so it plans as a Function Scan and 0131's node-type census
    // refuses the whole read. The wall working, not a defect — and the reason no payload can
    // inspect this backend's cursors at all.
    const two = await rawRead(
      f.ctx,
      "select coalesce(current_setting('clara.freeform_probe', true), '<unset>') || ':' || pg_backend_pid()::text as x",
      `freeform:${f.taskId}:8:2`,
    );
    assert.equal(two.ok, true, `read 2 must be admitted (${JSON.stringify(two?.refusal_reason)})`);
    const [gucSeen, secondPid] = String(two.rows[0].x).split(":");
    assert.equal(secondPid, firstPid, "THE SAME BACKEND — otherwise this cell proves nothing about the release");
    // MEASURED (the first cut expected NULL): once a CUSTOM GUC has been set in a session,
    // PostgreSQL keeps its placeholder and DISCARD ALL resets it to the EMPTY STRING rather than
    // removing it. What matters is the VALUE, asserted against the exact string read 1 proved
    // was there — so this cannot pass by reading a name instead of a thing.
    assert.notEqual(gucSeen, "poisoned", "the payload's non-local GUC did not survive the release — R-9's whole failure mode");
    assert.ok(gucSeen === "" || gucSeen === "<unset>", `expected the GUC cleared, saw ${JSON.stringify(gucSeen)}`);
  } finally {
    if (priorMax === undefined) delete process.env.CLARA_FREEFORM_POOL_MAX;
    else process.env.CLARA_FREEFORM_POOL_MAX = priorMax;
    await ff.endFreeformPool();
  }
});

test("f-a6.pr2.fix.adversarial.discard-vs-reset: on THIS server, `reset all` leaves an advisory lock held and `discard all` releases it", { skip }, async () => {
  // The instrument, mutated rather than trusted: if `reset all` had sufficed, H-5 would be a
  // preference. This is what makes it a wall.
  const c = new pg.Client({});
  await c.connect();
  const held = async () => Number((await rig.rootQuery("select count(*)::int as n from pg_locks where locktype='advisory' and classid=$1 and objid=$2", [918273, 645])).rows[0].n);
  try {
    await c.query("select pg_advisory_lock($1,$2)", [918273, 645]);
    assert.equal(await held(), 1, "the lock is held");
    await c.query("reset all");
    assert.equal(await held(), 1, "RESET ALL restores GUCs and NOTHING else");
    await c.query("discard all");
    assert.equal(await held(), 0, "DISCARD ALL runs pg_advisory_unlock_all() — which is why H-5 names that verb");
  } finally {
    await c.query("select pg_advisory_unlock_all()").catch(() => {});
    await c.end();
  }
});

// =============================================================================================
// LOW (c) · THE COMBINED TIER-D PATH. A payload that takes a session advisory lock AND then
// stalls past the pool's own GUC is the worst case for both H-4 and H-5 at once: the statement
// is killed mid-fetch, the transaction dies, and the connection goes back to the pool holding a
// lock nothing in the transaction released. Only the release verb can clean that up.
// =============================================================================================

test("f-a6.pr2.fix.adversarial.lock-and-stall: a killed read leaves 0 locks and 0 receipts, and the same pooled connection then serves a clean read", { skip }, async () => {
  const KEY_A = 918273;
  const KEY_B = 991;
  const locks = async () =>
    Number((await rig.rootQuery("select count(*)::int as n from pg_locks where locktype='advisory' and classid=$1 and objid=$2", [KEY_A, KEY_B])).rows[0].n);

  const priorMax = process.env.CLARA_FREEFORM_POOL_MAX;
  const priorMs = process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
  process.env.CLARA_FREEFORM_POOL_MAX = "1";
  process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = "6000";
  await ff.endFreeformPool();
  try {
    const f = await turnFixture("fa6lockstall", { home: true });
    assert.equal(await locks(), 0, "clean before");

    const t0 = Date.now();
    let thrown = null;
    try {
      await rawRead(f.ctx, `select pg_advisory_lock(${KEY_A},${KEY_B})::text || pg_sleep(30)::text as x`, `freeform:${f.taskId}:6:1`);
    } catch (e) {
      thrown = e;
    }
    const elapsed = Date.now() - t0;
    assert.ok(thrown, "the stalled fetch is killed, not returned");
    assert.equal(thrown.code, "57014", `H-4's wall fired: ${thrown.code} ${thrown.message}`);
    assert.ok(elapsed < 25000, `killed at the GUC, not at the payload's own 30s — took ${elapsed}ms`);
    assert.equal(await locks(), 0, "H-5's wall fired: the lock the payload took did NOT survive the release");
    assert.equal((await receiptRows(`freeform:${f.taskId}:6:1`)).length, 0, "Tier D — the transaction died, so there is no receipt (the prompt says so)");

    // ...and the SAME pooled connection is usable immediately afterwards.
    const ok = await rawRead(f.ctx, "select pg_backend_pid()::text as x", `freeform:${f.taskId}:6:2`);
    assert.equal(ok.ok, true, `the next read on the same pool succeeds: ${JSON.stringify(ok?.refusal_reason)}`);
  } finally {
    if (priorMax === undefined) delete process.env.CLARA_FREEFORM_POOL_MAX;
    else process.env.CLARA_FREEFORM_POOL_MAX = priorMax;
    if (priorMs === undefined) delete process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
    else process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = priorMs;
    await ff.endFreeformPool();
  }
});

// =============================================================================================
// LOW (d) · The wake secret is not readable by the payload. 0131's MF-1 clears it txn-locally
// inside `_freeform_arm`, BEFORE the cursor opens — so by the time any payload expression runs,
// the credential that authorised the read is already gone from the session.
// =============================================================================================

test("f-a6.pr2.fix.adversarial.wake-secret: a payload reads clara.wake_secret back as the empty string, never the credential", { skip }, async () => {
  const f = await turnFixture("fa6secret", { home: true });
  const out = await rawRead(
    f.ctx,
    "select coalesce(current_setting('clara.wake_secret', true), '<null>') as x",
    `freeform:${f.taskId}:5:1`,
  );
  assert.equal(out.ok, true, `the payload is lawful — reading a GUC is not refused, which is why the CLEAR is the wall (${JSON.stringify(out?.refusal_reason)})`);
  const seen = String(out.rows[0].x);
  assert.equal(seen, "", "MF-1: the secret is cleared before the cursor opens, so the payload sees an empty string");
  assert.ok(seen.length < 8, "positive control on the assertion itself — a live secret is long, and this is not one");
});
