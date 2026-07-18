// Slice-4 rig — two-session forced-schedule drivers (NOT a test file). The X7
// law throughout: PROVE the block via pg_blocking_pids BEFORE releasing — a
// schedule that never blocked proves nothing. Mirrors rig-events-helpers /
// rig-txn.mjs client hygiene (rollback → reset role → reset all → release).

import {
  ROLES,
  getPool,
  rootQuery,
  opk,
  sleep,
  DEFAULT_MODEL,
} from "./rig-runtime-helpers.mjs";

async function cleanup(clients) {
  for (const c of clients) {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Poll until backend `pid` is WAITING on a Lock held by `blockerPid`. */
export async function waitBlockedBy(pid, blockerPid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(50);
  }
  return false;
}

const BEGIN_SQL =
  "select clara.begin_chat_turn(p_session => $1, p_author => $2, p_turn_key => $3, p_user_parts => $4::jsonb, p_model => $5) as result";

/**
 * §6 admission race: T1 admits and HOLDS its txn open (the §3.6 namespaced
 * advisory admission lock + its writes uncommitted); T2 fires the same
 * admission and must BLOCK (proven) until T1 commits, then resolve against
 * T1's COMMITTED state (the winner's slot/budget consumption must be visible
 * to the loser — the P5 over-admission hole). Returns { winner, loser,
 * provedBlocked }; each side = { ok, receipt? , code?, message? }.
 */
export async function admissionRace({ winner, loser, model = DEFAULT_MODEL }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { winner: null, loser: null, provedBlocked: false };
  const parts = JSON.stringify([{ type: "text", text: "race turn" }]);
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("begin");
    try {
      const r = await c1.query(BEGIN_SQL, [winner.session, winner.author, winner.turnKey, parts, model]);
      out.winner = { ok: true, receipt: r.rows[0].result };
    } catch (e) {
      out.winner = { ok: false, code: e.code, message: `${e.message} ${e.detail ?? ""} ${e.hint ?? ""}`.trim() };
    }

    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c2.query(`set role ${ROLES.runtime}`);
    await c2.query("begin");
    const p2 = c2
      .query(BEGIN_SQL, [loser.session, loser.author, loser.turnKey, parts, model])
      .then((r) => {
        out.loser = { ok: true, receipt: r.rows[0].result };
      })
      .catch((e) => {
        out.loser = { ok: false, code: e.code, message: `${e.message} ${e.detail ?? ""} ${e.hint ?? ""}`.trim() };
      });

    out.provedBlocked = await waitBlockedBy(pid2, pid1);
    await c1.query("commit").catch(() => c1.query("rollback").catch(() => {}));
    await p2;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    await cleanup([c1, c2]);
  }
  return out;
}

/**
 * FX4 — the concurrent CROSS-TASK hook-token race. Two RUNNING tasks open the
 * SAME hook_token: both pass the pending-exists check; T2 blocks on the unique
 * index behind T1's uncommitted insert (proven — X7); after T1 commits, T2's
 * unique-violation path must VERIFY task_id and refuse CLR13 with its whole
 * txn (including its awaiting_input transition) rolled back. The pre-fix bug:
 * the loser returned the WINNER's interruption id while its own transition
 * committed — a task stranded awaiting_input with no interruption.
 * Returns { first, second, provedBlocked }.
 */
export async function crossTaskTokenRace({ taskA, taskB, token }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { first: null, second: null, provedBlocked: false };
  const CALL =
    "select clara.open_interruption(p_task => $1, p_hook_token => $2, p_question => $3::jsonb) as result";
  const q = JSON.stringify({ type: "text", text: "fx4 race" });
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("begin");
    try {
      const r = await c1.query(CALL, [taskA, token, q]);
      out.first = { ok: true, id: r.rows[0].result };
    } catch (e) {
      out.first = { ok: false, code: e.code, message: e.message };
    }

    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c2.query(`set role ${ROLES.runtime}`);
    await c2.query("begin");
    const p2 = c2
      .query(CALL, [taskB, token, q])
      .then((r) => {
        out.second = { ok: true, id: r.rows[0].result };
      })
      .catch((e) => {
        out.second = { ok: false, code: e.code, message: e.message };
      });

    out.provedBlocked = await waitBlockedBy(pid2, pid1);
    await c1.query("commit").catch(() => c1.query("rollback").catch(() => {}));
    await p2;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    await cleanup([c1, c2]);
  }
  return out;
}

/**
 * §3.3 / S4-D5 `wait_across_deadline_answer_loses`: the answer txn STARTS
 * before the deadline (its now() freezes pre-deadline) but acquires the row
 * AFTER the deadline passes — with the contract's clock_timestamp() comparison
 * it must LOSE; with a now() comparison it would wrongly win (that is the bug
 * this schedule pins). T-block holds the interruption row lock; T-answer
 * (human lane) fires answer_interruption pre-deadline and blocks (proven); the
 * wall clock passes expires_at; T-block releases; the answer must FAIL.
 * Returns { answer, provedBlocked, txnStartedBeforeDeadline }.
 */
export async function answerAcrossDeadline({ interruption, sub, expiresAt }) {
  const cBlock = await getPool().connect();
  const cAns = await getPool().connect();
  const out = { answer: null, provedBlocked: false, txnStartedBeforeDeadline: null };
  try {
    const bpid = (await cBlock.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cBlock.query("begin");
    await cBlock.query("select id from clara.agent_interruptions where id = $1 for update", [interruption]);

    const apid = (await cAns.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cAns.query(`set role ${ROLES.authenticated}`);
    await cAns.query("begin");
    await cAns.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
    const pAns = cAns
      .query("select clara.answer_interruption(p_id => $1, p_answer => $2::jsonb, p_op_key => $3) as result", [
        interruption,
        JSON.stringify("late answer across deadline"),
        opk("d5"),
      ])
      .then((r) => {
        out.answer = { ok: true, receipt: r.rows[0].result };
      })
      .catch((e) => {
        out.answer = { ok: false, code: e.code, message: e.message };
      });

    out.provedBlocked = await waitBlockedBy(apid, bpid);
    const xs = await rootQuery("select xact_start from pg_stat_activity where pid = $1", [apid]);
    out.txnStartedBeforeDeadline =
      xs.rows[0]?.xact_start != null && new Date(xs.rows[0].xact_start).getTime() < new Date(expiresAt).getTime();

    // Hold the lock until the DB wall clock is safely PAST the deadline.
    for (;;) {
      const past = await rootQuery("select clock_timestamp() > $1::timestamptz + interval '150 milliseconds' as past", [expiresAt]);
      if (past.rows[0].past) break;
      await sleep(100);
    }
    await cBlock.query("commit");
    await pAns;
    await cAns.query("commit").catch(() => cAns.query("rollback").catch(() => {}));
  } finally {
    await cleanup([cBlock, cAns]);
  }
  return out;
}
