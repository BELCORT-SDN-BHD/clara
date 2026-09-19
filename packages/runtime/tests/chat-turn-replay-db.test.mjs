// #642 AC3 — THE 202 NOW CARRIES `replayed`, AND THAT IS THE WHOLE RUNTIME HALF.
//
// THE DEFECT. `clara.begin_chat_turn` has answered `{task_id, status, replayed}` since
// 0006 (:954-960 is the replay branch, :999 the fresh one), but `chatRoutes.ts` read
// ONLY `task_id` off the receipt and answered `202 {task_id}` — so a REPLAY and a FRESH
// ADMISSION were byte-identical on the wire. A client could not tell "we already have
// this turn" from "we just admitted this turn", which is why the browser drew a second
// user bubble for a re-pressed Send and why nothing above the database could ever say
// "already accepted" honestly.
//
// WHY IT NEEDS A LIVE CELL rather than a unit test on the handler. The property is about
// what the DOOR returns through the ROUTE: the replay lookup runs inside
// `begin_chat_turn` under the per-firm advisory lock (0006:952, :955-956), and the
// second cell's decisive case — a replay AFTER the first turn reached a terminal — is
// precisely the case `uq_agent_task_one_live_turn` (0006:165-166, PARTIAL on the four
// non-terminal statuses) stops covering. Stubbing the door would prove nothing about
// either.
//
// BOOT SHAPE: `c5-stream-reauth-db.test.mjs`'s, line for line — express + `register`
// from `tsx/esm/api` + a real signed JWT + `server.listen(0, "127.0.0.1")` — because
// `chatRoutes` authenticates through `lib/authz.mjs` against live membership and there
// is no honest way to fake that.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import { SignJWT } from "jose";
import { register } from "tsx/esm/api";

import * as rig from "./rig.mjs";
import { cohortGate } from "./c5-cohort-gate.mjs";
import { endPools } from "../lib/pools.mjs";

register();

const ISSUER = "https://p642-replay.test/auth/v1";
const AUD = "authenticated";
const JWT_FIXTURE = `p642-${randomUUID().replaceAll("-", "")}`;

const skip = await cohortGate(
  "the Slice-4 runtime core (0006)",
  `select to_regclass('clara.agent_tasks') is not null
      and to_regprocedure('clara.begin_chat_turn(uuid,uuid,text,jsonb,text)') is not null as ok`,
);
const READY = skip === false;

let server = null;
let base = "";
let key = null;
const priorEnv = {};
function setEnv(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in priorEnv)) priorEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

before(async () => {
  if (!READY) return;
  setEnv({ SUPABASE_JWT_ISSUER: ISSUER, SUPABASE_JWT_AUD: AUD, SUPABASE_JWT_SECRET: JWT_FIXTURE });
  key = new TextEncoder().encode(JWT_FIXTURE);
  const { _resetJwtConfigForTest } = await import("../lib/authz.mjs");
  _resetJwtConfigForTest();
  const { chatRoutes } = await import("../src/chatRoutes.ts");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(chatRoutes());
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  const { _resetJwtConfigForTest } = await import("../lib/authz.mjs");
  _resetJwtConfigForTest();
  setEnv(priorEnv);
  await endPools();
  await rig.endPool();
});

const mint = (sub) =>
  new SignJWT({ role: AUD })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);

async function postTurn(session, token, turnKey, text) {
  const res = await fetch(`${base}/api/chat/${session}/turns`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ turnKey, parts: [{ type: "text", text }] }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const userRows = (session) =>
  rig
    .rootQuery("select id, turn_key, parts from clara.chat_messages where session_id=$1 and role='user' order by seq", [session])
    .then((r) => r.rows);

test("p642.runtime.turn_replay_202 — a second POST with the SAME turnKey answers 202 {task_id: <same>, replayed:true} and adds no second user row", { skip }, async () => {
  const tag = randomUUID().slice(0, 8);
  const { owner } = await rig.buildFirm(`p642r${tag}`);
  const session = await rig.createChatSession({ author: owner });
  const token = await mint(owner);
  const turnKey = `p642-turn-${tag}`;

  const first = await postTurn(session, token, turnKey, "book the invoice");
  assert.equal(first.status, 202, `the first POST was admitted: ${JSON.stringify(first.body)}`);
  assert.ok(first.body.task_id, "the first 202 carries a task id");
  assert.equal(first.body.replayed, false, "a FRESH admission reports replayed:false");

  const second = await postTurn(session, token, turnKey, "book the invoice");
  assert.equal(second.status, 202, `the replay is a 202, not a 409: ${JSON.stringify(second.body)}`);
  assert.equal(second.body.task_id, first.body.task_id, "the replay answers with the ORIGINAL task id");
  assert.equal(second.body.replayed, true, "the replay says so on the wire — the field this ticket adds");

  const rows = await userRows(session);
  assert.equal(rows.length, 1, `two POSTs, ONE user row (saw ${rows.length})`);
});

test("p642.runtime.turn_replay_after_terminal — the same key replays AFTER the first turn settled, and no second task or Work is admitted", { skip }, async () => {
  const tag = randomUUID().slice(0, 8);
  const { owner, firm } = await rig.buildFirm(`p642t${tag}`);
  const session = await rig.createChatSession({ author: owner });
  const token = await mint(owner);
  const turnKey = `p642-terminal-${tag}`;

  const first = await postTurn(session, token, turnKey, "close the month");
  assert.equal(first.status, 202, `admitted: ${JSON.stringify(first.body)}`);
  const taskId = first.body.task_id;

  // Settle it. THIS is the case `uq_agent_task_one_live_turn` stops covering: the index
  // is partial on queued/running/awaiting_input/cancel_requested, so once the task is
  // terminal a second POST would be admitted as a brand-new turn were it not for the
  // turn_key replay lookup.
  await rig.driveTask(taskId, ["running"]);
  await rig.settleChatTurn({ task: taskId, tokens: 1, outcome: "completed" });

  const workBefore = await rig.rootQuery("select count(*)::int as n from clara.accounting_work where firm_id=$1", [firm]);

  const again = await postTurn(session, token, turnKey, "close the month");
  assert.equal(again.status, 202, `the post-terminal replay is a 202: ${JSON.stringify(again.body)}`);
  assert.equal(again.body.task_id, taskId, "…answering with the ORIGINAL, now-terminal task");
  assert.equal(again.body.replayed, true, "…and reporting replayed:true");

  const tasks = await rig.rootQuery("select count(*)::int as n from clara.agent_tasks where session_id=$1", [session]);
  assert.equal(tasks.rows[0].n, 1, "no second task was admitted after the terminal");
  const rows = await userRows(session);
  assert.equal(rows.length, 1, "no second user row after the terminal");
  const workAfter = await rig.rootQuery("select count(*)::int as n from clara.accounting_work where firm_id=$1", [firm]);
  assert.equal(workAfter.rows[0].n, workBefore.rows[0].n, "clara.accounting_work gained no second row");
});
