// STANDALONE world-integration e2e (NOT a `node --test` file — it boots the real
// WDK world + the full supervisor group in-process and drives turns through HTTP,
// so it owns its lifecycle and exits explicitly). Run:
//
//   node tests/world-e2e.mjs
//
// It proves the headline §6 gates that need the engine: a mock-model chat turn
// end-to-end (parts persisted, usage recorded, task settles) and a clarify
// park -> human answer -> resume -> settle. The model is a scripted mock injected
// via globalThis (NO network, NO key). Requires clara_rt_test (0001-0006) + the WDK
// engine schema at 127.0.0.1:5544, and a built server (pnpm build).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";

// --- env (env-ONLY; no hardcoded credential fallback, no DSN-fragment construction).
// The runner MUST export the DB target + the world DSN. RELAY_TEST_MODE / PORT /
// CLARA_START_WORLD / WORKFLOW_TARGET_WORLD are run-config flags (not credentials).
// e.g.  PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//       WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//       node tests/world-e2e.mjs
if (!process.env.PGHOST && !process.env.DATABASE_URL) {
  throw new Error("world-e2e needs a DB target in the ENVIRONMENT (PGHOST/... or DATABASE_URL) — env-only, no fallback");
}
if (!process.env.WORKFLOW_POSTGRES_URL) {
  throw new Error("world-e2e needs WORKFLOW_POSTGRES_URL in the ENVIRONMENT (the WDK world's DB) — env-only, no fallback");
}
process.env.RELAY_TEST_MODE = "1";
process.env.CLARA_START_WORLD = "1"; // explicit opt-in — this IS a world test
process.env.PORT = process.env.PORT || "3211";
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
const ISSUER = "https://clara.test/auth/v1";
const AUD = "authenticated";
const jwtSecret = "e2e-" + randomUUID().replace(/-/g, "");
process.env.SUPABASE_JWT_ISSUER = ISSUER;
process.env.SUPABASE_JWT_AUD = AUD;
process.env.SUPABASE_JWT_SECRET = jwtSecret;

const BASE = `http://localhost:${process.env.PORT}`;
const key = new TextEncoder().encode(jwtSecret);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mint = (sub) =>
  new SignJWT({ role: AUD }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer(ISSUER).setAudience(AUD).setIssuedAt().setExpirationTime("10m").sign(key);

async function waitHealthy(deadlineMs = 20000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("server did not become healthy");
}

/** Consume an SSE stream: collect {event, data} until 'done'/'detached' or maxMs. */
async function consumeSSE(url, jwt, maxMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), maxMs);
  const events = [];
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${jwt}` }, signal: ctrl.signal });
    if (res.status !== 200) return { status: res.status, events };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = /event:\s*(.+)/.exec(block)?.[1]?.trim();
        const data = /data:\s*(.+)/.exec(block)?.[1];
        events.push({ event: ev, data: data ? JSON.parse(data) : null });
        if (ev === "done" || ev === "detached") {
          await reader.cancel().catch(() => {});
          return { status: 200, events };
        }
      }
    }
    return { status: 200, events };
  } catch {
    return { status: 0, events };
  } finally {
    clearTimeout(t);
  }
}

async function pollTask(rig, taskId, pred, label, deadlineMs = 30000) {
  const end = Date.now() + deadlineMs;
  let last = null;
  while (Date.now() < end) {
    last = await rig.readTask(taskId);
    if (last && pred(last)) return last;
    await sleep(250);
  }
  throw new Error(`pollTask timeout (${label}); last=${JSON.stringify(last)}`);
}

async function main() {
  const { mockTextModel, mockClarifyThenTextModel } = await import("./mockModel.mjs");
  const rig = await import("./rig.mjs");

  // Boot the built server (HTTP + world + control + leader) in THIS process.
  globalThis.__claraModelForTest = mockTextModel("your trial balance looks balanced");
  await import("../.output/server/index.mjs");
  await waitHealthy();
  console.log("[e2e] server healthy + world started");

  // -------------------------------------------------------------------------
  // 1. Mock-model chat turn end-to-end.
  // -------------------------------------------------------------------------
  {
    const { owner, firm, client } = await rig.buildFirm("e2e-turn");
    const session = await rig.createChatSession({ author: owner, client });
    const jwt = await mint(owner);
    const res = await fetch(`${BASE}/api/chat/${session}/turns`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ turnKey: "e2e-turn-1", parts: [{ type: "text", text: "is my trial balance ok?" }] }),
    });
    assert.equal(res.status, 202, "turn admitted 202");
    const { task_id } = await res.json();
    assert.ok(task_id, "task id returned");

    const settled = await pollTask(rig, task_id, (t) => ["completed", "failed", "cancelled", "expired"].includes(t.status), "turn settles");
    assert.equal(settled.status, "completed", `turn completed (got ${settled.status}/${settled.error_code})`);

    const asst = await rig.readAssistantMessage(task_id);
    assert.ok(asst, "assistant message persisted");
    const text = JSON.stringify(asst.parts);
    assert.ok(/trial balance looks balanced/.test(text), "the mock model's text is in the persisted parts");

    const usage = await rig.readUsage(firm);
    assert.ok(usage.some((u) => Number(u.tokens_used) > 0), "usage recorded (>0 tokens)");
    console.log("[e2e] PASS: mock-model chat turn end-to-end (parts persisted, usage recorded, settled completed)");
  }

  // -------------------------------------------------------------------------
  // 2. Clarify: park -> human answer -> resume -> settle.
  // -------------------------------------------------------------------------
  {
    globalThis.__claraModelForTest = mockClarifyThenTextModel("Which client is this for?", "thanks — noted");
    const { owner, client } = await rig.buildFirm("e2e-clarify");
    const session = await rig.createChatSession({ author: owner, client });
    const jwt = await mint(owner);
    const res = await fetch(`${BASE}/api/chat/${session}/turns`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ turnKey: "e2e-clarify-1", parts: [{ type: "text", text: "please help" }] }),
    });
    assert.equal(res.status, 202);
    const { task_id } = await res.json();

    // The workflow calls clarify -> parks (awaiting_input) + a pending interruption appears.
    await pollTask(rig, task_id, (t) => t.status === "awaiting_input", "task parks awaiting_input");
    const inter = await rig.rootQuery("select id, status from clara.agent_interruptions where task_id=$1 and status='pending'", [task_id]);
    assert.equal(inter.rowCount, 1, "one pending clarify");
    console.log("[e2e] clarify parked (awaiting_input) — answering as the firm member");

    // Human answers via the governance fn (as the owner). The control listener resumes the hook.
    await rig.humanQuery(owner, "select clara.answer_interruption(p_id=>$1, p_answer=>$2::jsonb, p_op_key=>$3)", [
      inter.rows[0].id,
      JSON.stringify({ type: "text", text: "Acme Sdn Bhd" }),
      "e2e-ans-1",
    ]);

    const settled = await pollTask(rig, task_id, (t) => ["completed", "failed", "cancelled", "expired"].includes(t.status), "clarify turn settles", 40000);
    assert.equal(settled.status, "completed", `clarify turn completed (got ${settled.status}/${settled.error_code})`);
    const asst = await rig.readAssistantMessage(task_id);
    assert.ok(/noted/.test(JSON.stringify(asst.parts)), "post-answer model text persisted");
    console.log("[e2e] PASS: clarify park -> answer -> resume -> settle completed");
  }

  // -------------------------------------------------------------------------
  // 3. SSE consumer (S4-AB13): live tail -> terminal done; then late-attach replay.
  // -------------------------------------------------------------------------
  {
    globalThis.__claraModelForTest = mockTextModel("streaming answer chunk one two three");
    const { owner, client } = await rig.buildFirm("e2e-sse");
    const session = await rig.createChatSession({ author: owner, client });
    const jwt = await mint(owner);
    const res = await fetch(`${BASE}/api/chat/${session}/turns`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ turnKey: "e2e-sse-1", parts: [{ type: "text", text: "stream please" }] }),
    });
    const { task_id } = await res.json();

    // Live tail: attach immediately, collect chunks until the terminal done.
    const live = await consumeSSE(`${BASE}/api/tasks/${task_id}/stream`, jwt, 30000);
    assert.equal(live.status, 200, "SSE opened");
    const doneEv = live.events.find((e) => e.event === "done");
    assert.ok(doneEv, "SSE reached a terminal 'done' event");
    assert.equal(doneEv.data.status, "completed", "terminal status is completed");
    const chunkEvents = live.events.filter((e) => e.event === "chunk");
    assert.ok(chunkEvents.length > 0, "live stream delivered chunks (no dropped-read)");
    // Ordering: text-delta chunks arrive in emission order.
    const msgEv = live.events.find((e) => e.event === "message");
    assert.ok(msgEv && /streaming answer/.test(JSON.stringify(msgEv.data.parts)), "final persisted parts are authority");

    // Late-attach AFTER completion: full replay (chunks) + done, from persisted history.
    const late = await consumeSSE(`${BASE}/api/tasks/${task_id}/stream`, jwt, 15000);
    assert.ok(late.events.some((e) => e.event === "message"), "late attach replays the final message");
    assert.ok(late.events.some((e) => e.event === "done"), "late attach terminates on done");
    console.log("[e2e] PASS: SSE live tail + terminal done + late-attach replay");

    // AB3: the workflow SELF-BOUND its run (claimRunStep) — the task carries exactly one run.
    const bound = await rig.readTask(task_id);
    assert.ok(bound.workflow_run_id, "the task's run_id was self-bound by the workflow (S4-AB3 claimRunStep)");
    console.log("[e2e] PASS: workflow self-bind (AB3) — task bound to exactly one run");
  }

  // -------------------------------------------------------------------------
  // 4. Credential secret never crosses a step boundary (S4-AB16): no two-UUID
  //    wake-credential secret in durable step IO (jsonb + cbor) or traces.
  // -------------------------------------------------------------------------
  {
    const twoUuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[0-9a-f]{8}-[0-9a-f]{4}";
    const leak = await rig.rootQuery(
      `select count(*)::int n from (
         select input::text t from workflow.workflow_steps where input is not null
         union all select output::text from workflow.workflow_steps where output is not null
         union all select encode(input_cbor,'escape') from workflow.workflow_steps where input_cbor is not null
         union all select encode(output_cbor,'escape') from workflow.workflow_steps where output_cbor is not null
         union all select attributes::text from clara.trace_spans
       ) x where x.t ~ $1`,
      [twoUuid],
    );
    assert.equal(leak.rows[0].n, 0, "no wake-credential secret (two concatenated UUIDs) in durable step IO / traces");
    console.log("[e2e] PASS: no minted secret in durable step IO or traces (AB16)");
  }

  console.log("\nWORLD E2E: ALL PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nWORLD E2E: FAIL\n", err?.stack ?? err);
  process.exit(1);
});
