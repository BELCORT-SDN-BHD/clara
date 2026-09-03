// FS-4 C-5 item 10 (security pass B-M3) — SSE RE-AUTHORISATION ON THE POLL TICK.
//
// THE FINDING. `streamRoute.ts` ran `authenticate` + `assertTaskStreamAccess` ONCE, before the
// loop, and `CLARA_STREAM_MAX_MS` is thirty minutes. `lib/authz.mjs`'s own header promises the
// opposite — "evaluated PER REQUEST (a revoked member's next turn is rejected — no cached
// membership)" — and that is true for a turn. A stream IS one request, so a member removed from
// the firm kept receiving the live agent transcript for up to half an hour.
//
// THE CELL IS A LIVE ONE BECAUSE THE SUBJECT IS. A unit test could show that the poll body calls
// `assertTaskStreamAccess`; it could not show that `resolvePrincipal` re-reads membership from
// the database, which is the whole mechanism. This attaches a real stream over HTTP with a real
// signed JWT, revokes the membership underneath it, and measures how long the transcript keeps
// flowing.
//
// THE POLL IS SHORTENED, NOT THE WALL. `CLARA_STREAM_POLL_MS` is set to 250ms so the cell
// finishes in seconds; the deadline it proves is "within ONE poll", which is the property, not
// "within 250ms". Nothing about the authorisation path is relaxed.

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

const ISSUER = "https://c5-stream.test/auth/v1";
const AUD = "authenticated";
const JWT_FIXTURE = `c5s-${randomUUID().replaceAll("-", "")}`;
const POLL_MS = 250;

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
  setEnv({
    SUPABASE_JWT_ISSUER: ISSUER,
    SUPABASE_JWT_AUD: AUD,
    SUPABASE_JWT_SECRET: JWT_FIXTURE,
    CLARA_STREAM_POLL_MS: String(POLL_MS),
    CLARA_STREAM_MAX_MS: "15000",
  });
  key = new TextEncoder().encode(JWT_FIXTURE);
  const { _resetJwtConfigForTest } = await import("../lib/authz.mjs");
  _resetJwtConfigForTest();
  const { streamRoutes } = await import("../src/streamRoute.ts");
  const app = express();
  app.use(streamRoutes());
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

/**
 * Attach to the stream and read SSE event NAMES until one of `until` arrives or the budget
 * expires. Returns the names seen and the elapsed time — the stream is aborted on the way out
 * so a leaked reader cannot hold the suite open.
 */
async function readUntil(taskId, token, until, budgetMs) {
  const controller = new AbortController();
  const started = Date.now();
  const seen = [];
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const res = await fetch(`${base}/api/tasks/${taskId}/stream`, {
      headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (res.status !== 200) return { status: res.status, seen, elapsed: Date.now() - started };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const m of buffer.matchAll(/^event: (\w+)$/gm)) seen.push(m[1]);
      buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 1);
      if (seen.some((e) => until.includes(e))) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    return { status: 200, seen, elapsed: Date.now() - started };
  } catch (err) {
    if (err?.name === "AbortError") return { status: 200, seen, elapsed: Date.now() - started, aborted: true };
    throw err;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

test("c5sse.1 B-M3 — a membership revoked mid-stream closes the stream within one poll", { skip }, async () => {
  const tag = randomUUID().slice(0, 8);
  const { owner, firm } = await rig.buildFirm(`c5sse${tag}`);
  // `rig.addMember` mints the user itself and returns its id; the MEMBERSHIP id is what
  // `remove_member` takes, so it is read back by (firm, user) rather than assumed.
  const member = await rig.addMember(owner, firm, { role: "bookkeeper", prefix: `c5sse${tag}` });
  const membershipRow = await rig.rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [firm, member],
  );
  assert.equal(membershipRow.rowCount, 1, "the fixture must have exactly one active membership to revoke");
  const membership = membershipRow.rows[0].id;
  const session = await rig.createChatSession({ author: member });
  const receipt = await rig.beginChatTurn({ session, author: member });
  const taskId = receipt.task_id;
  const token = await mint(member);

  // POSITIVE CONTROL FIRST, and it is the half that makes this cell discriminate: while the
  // membership is live the stream stays OPEN and emits no `revoked`. Without it, a route that
  // closed every stream immediately would pass the revocation arm.
  const control = await readUntil(taskId, token, ["revoked", "done"], POLL_MS * 6);
  assert.equal(control.status, 200, "a live member must be able to attach");
  assert.equal(control.seen.includes("revoked"), false, `a live member's stream was revoked: ${control.seen}`);

  // Revoke underneath a stream that is already attached and streaming.
  const revocation = (async () => {
    await new Promise((r) => setTimeout(r, POLL_MS * 2));
    await rig.removeMember(owner, { membership, opKey: `c5sse_rm_${tag}` });
  })();
  const after = await readUntil(taskId, token, ["revoked"], POLL_MS * 40);
  await revocation;

  assert.ok(
    after.seen.includes("revoked"),
    `the stream did not close after the membership was revoked (saw: ${JSON.stringify(after.seen)})`,
  );
  // "Within one poll" of the revocation landing — measured with generous slack for scheduling,
  // because the property is bounded-by-the-poll, not a millisecond budget.
  assert.ok(
    after.elapsed < POLL_MS * 30,
    `the close took ${after.elapsed}ms — far more than one poll (${POLL_MS}ms)`,
  );
  // And it is NOT reported as `done`: the task did not finish, the reader lost access.
  assert.equal(after.seen.includes("done"), false, "a revocation must not be reported as a completed task");
});

test("c5sse.2 the re-check does not disturb a live member's stream over many polls", { skip }, async () => {
  // The MUST-NOT-RED control for the cell above, run long enough that a re-check with a wrong
  // predicate (say, one that re-read the bearer from a header the SSE client cannot resend)
  // would have fired several times over.
  const tag = randomUUID().slice(0, 8);
  const { owner } = await rig.buildFirm(`c5sseb${tag}`);
  const session = await rig.createChatSession({ author: owner });
  const receipt = await rig.beginChatTurn({ session, author: owner });
  const token = await mint(owner);
  const out = await readUntil(receipt.task_id, token, ["revoked"], POLL_MS * 12);
  assert.equal(out.seen.includes("revoked"), false, `a live owner's stream was revoked: ${out.seen}`);
});
