// The SSE stream route (Slice 4, contract §4.2 stream-close law). A late or
// re-attaching reader gets the FULL history for free (the engine persists every
// chunk — S4-P2) via getReadable({startIndex:0}); the persisted parts are the
// authority on the final transcript. The endpoint TERMINATES on a task-terminal
// status regardless of the engine readable (belt: an unclosed engine stream never
// signals done). It survives client detach — a disconnect only ends the response;
// the durable run continues untouched.

import express from "express";
import { setTimeout as sleep } from "node:timers/promises";
import { getRun } from "workflow/api";
import { authenticate, assertTaskStreamAccess, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";

const TERMINAL = new Set(["completed", "failed", "cancelled", "expired"]);
const POLL_MS = Number(process.env.CLARA_STREAM_POLL_MS || 1000);
const STREAM_MAX_MS = Number(process.env.CLARA_STREAM_MAX_MS || 30 * 60 * 1000);
const TAIL_DRAIN_MS = Number(process.env.CLARA_STREAM_TAIL_DRAIN_MS || 3000); // bounded tail drain on terminal (FX3)

/** Is the supervisor draining? (S4-FX2 — SSE streams close promptly on shutdown.) */
function shuttingDown(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

export function streamRoutes(): express.Router {
  const router = express.Router();

  router.get("/api/tasks/:id/stream", async (req, res) => {
    const taskId = req.params.id;

    // Authz (indistinguishable 404 for missing / forbidden / other-firm).
    let access: { status: string; workflow_run_id: string | null };
    try {
      access = (await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        return await assertTaskStreamAccess(c, taskId, p);
      })) as { status: string; workflow_run_id: string | null };
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
        return;
      }
      res.status(500).json({ error: "internal" });
      return;
    }

    // SSE headers.
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    // B-M3 (security pass, 2026-09-02) — RE-AUTHORISATION ON THE EXISTING POLL TICK.
    //
    // THE FINDING. `authenticate` + `assertTaskStreamAccess` ran ONCE, above, inside a single
    // `withRuntime` before the loop, and `STREAM_MAX_MS` is thirty minutes. `lib/authz.mjs`'s own
    // header promises the opposite: "Principal resolution … evaluated PER REQUEST (a revoked
    // member's next turn is rejected — no cached membership)". That is true for a turn. A stream
    // IS one request, so a member removed from the firm kept receiving the live agent transcript
    // until the stream ended or the deadline expired. Not a way IN — a way to STAY in.
    //
    // THE FIX RIDES A QUERY THAT ALREADY EXISTS. This poll hit the database every `POLL_MS`
    // anyway; it now does the access check in the SAME checkout, so the cost is one extra
    // statement per tick and no extra connection. On `AuthError` the stream closes with an
    // explicit `revoked` event — never a silent hang and never `done`, which would tell the
    // client the task finished.
    //
    // THE BEARER IS RE-READ FROM THE ORIGINAL REQUEST, WHICH IS THE HONEST BOUND. An SSE client
    // cannot re-present a header mid-stream, so the token cannot be refreshed here; what this
    // re-check catches is the MEMBERSHIP going away (`resolvePrincipal` re-reads live membership
    // per call) and the session's visibility changing. A token that EXPIRES mid-stream also
    // closes the stream, which is correct and is why the client reconnects.
    const fetchTask = () =>
      withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        await assertTaskStreamAccess(c, taskId, p);
        const r = await c.query("select status, workflow_run_id from clara.agent_tasks where id = $1", [taskId]);
        return r.rows[0] as { status: string; workflow_run_id: string | null } | undefined;
      });
    const fetchParts = () =>
      withRuntime(async (c) => {
        const r = await c.query("select parts from clara.chat_messages where task_id = $1 and role = 'assistant' limit 1", [taskId]);
        return r.rows[0]?.parts ?? null;
      });
    const terminate = async (status: string) => {
      send("message", { taskId, status, parts: await fetchParts() });
      send("done", { taskId, status });
    };

    // NB: we do NOT special-case a terminal-at-attach status here. Even for a task
    // that is already terminal, we attach the engine readable and REPLAY its persisted
    // chunks from index 0 (free full history — S4-P2 / §4.2), then the poll below sees
    // the terminal status and sends the authoritative persisted parts + done.

    // Live: attach to the run's readable (full replay from index 0), stream chunks,
    // and poll the task status as the terminal belt. openReader RETURNS the reader
    // (rather than assigning a closed-over variable) so control-flow narrowing works.
    type StreamReader = { read(): Promise<{ done: boolean; value: unknown }>; cancel(): Promise<unknown> };
    const openReader = (runId: string | null): StreamReader | null => {
      if (!runId) return null;
      try {
        return getRun(runId).getReadable({ startIndex: 0 }).getReader() as unknown as StreamReader;
      } catch {
        return null; // run not materialised yet — retry after a poll
      }
    };
    let reader: StreamReader | null = openReader(access.workflow_run_id);
    // Keep EXACTLY ONE pending read (S4-AB13): racing read() against a fresh timeout
    // each loop would ABANDON the pending read and drop the chunk it later resolves.
    // Instead we hold a single readPromise and race it against an independent poll
    // timer; a poll win NEVER discards the pending read.
    const POLL = Symbol("poll");
    let readPromise: Promise<{ done: boolean; value: unknown }> | null = reader ? reader.read() : null;
    let exhausted = false; // once the readable signals done it is spent — never re-open it

    const deadline = Date.now() + STREAM_MAX_MS;
    let hitDeadline = true;
    while (!closed && !shuttingDown() && Date.now() < deadline) {
      const pollP: Promise<symbol> = sleep(POLL_MS).then(() => POLL);
      const winner = await Promise.race(readPromise ? [readPromise, pollP] : [pollP]);
      if (typeof winner !== "symbol") {
        // The single pending read resolved.
        if (winner.done) {
          reader = null;
          readPromise = null;
          exhausted = true; // writable closed — confirm terminal via the poll below
        } else {
          send("chunk", winner.value);
          readPromise = reader ? reader.read() : null; // create the NEXT read; one at a time
          continue;
        }
      }
      // Poll won (or the stream closed) — re-authorise, then check task status; attach ONCE if a
      // run appeared (never re-attach a spent readable — that would re-replay forever).
      let t: { status: string; workflow_run_id: string | null } | undefined;
      try {
        t = await fetchTask();
      } catch (err) {
        // B-M3. An AuthError here means the caller LOST access mid-stream — a revoked
        // membership, a session that went private, an expired token. Close explicitly and
        // distinguishably: `revoked` is neither `done` (the task did not finish) nor `detached`
        // (this is not a window expiry the client should immediately retry into). Any OTHER
        // throw is a transient database problem, and dropping the stream for it would be worse
        // than waiting one more tick.
        if (err instanceof AuthError) {
          send("revoked", { taskId, reason: err.status === 404 ? "not_found" : err.code });
          hitDeadline = false;
          break;
        }
        continue;
      }
      if (!t) {
        hitDeadline = false;
        break;
      }
      if (!reader && !exhausted) {
        reader = openReader(t.workflow_run_id);
        if (reader && !readPromise) readPromise = reader.read();
      }
      // On a terminal status: BOUNDED-drain the persisted tail (short window), then
      // terminate — never hold to STREAM_MAX_MS and lie 'detached' on an unclosed /
      // engine-lost readable (S4-FX3). A terminal task always ends with the terminal
      // message + done.
      if (TERMINAL.has(t.status)) {
        const tailEnd = Date.now() + TAIL_DRAIN_MS;
        while (reader && Date.now() < tailEnd) {
          if (!readPromise) readPromise = reader.read();
          const next = await Promise.race([readPromise, sleep(Math.max(50, tailEnd - Date.now())).then(() => POLL)]);
          if (typeof next === "symbol") break; // window elapsed with no further chunk
          readPromise = null;
          if (next.done) {
            reader = null;
            break;
          }
          send("chunk", next.value);
        }
        await terminate(t.status);
        hitDeadline = false;
        break;
      }
    }

    // Not terminal: tell the client EXPLICITLY this is a DETACH (never 'done'), so it
    // reconnects — either the supervisor is draining (S4-FX2) or the read-window cap
    // expired (S4-AB13 / spec(b)3).
    if (!closed && hitDeadline) {
      send("detached", { taskId, reason: shuttingDown() ? "shutting_down" : "stream_window_expired" });
    }

    if (reader) await reader.cancel().catch(() => {});
    if (!closed) res.end();
  });

  return router;
}
