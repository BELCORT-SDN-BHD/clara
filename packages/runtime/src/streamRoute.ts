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

    const fetchTask = () =>
      withRuntime(async (c) => {
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

    // Already terminal -> full replay from persisted parts, then done.
    if (TERMINAL.has(access.status)) {
      await terminate(access.status);
      res.end();
      return;
    }

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

    const deadline = Date.now() + STREAM_MAX_MS;
    while (!closed && Date.now() < deadline) {
      if (reader) {
        const next = await Promise.race([reader.read(), sleep(POLL_MS).then(() => "timeout" as const)]);
        if (next !== "timeout") {
          if (next.done) {
            reader = null; // workflow closed the writable — confirm terminal via poll
          } else {
            send("chunk", next.value);
            continue;
          }
        }
      } else {
        await sleep(POLL_MS);
      }
      const t = await fetchTask();
      if (!t) break; // vanished — treat as gone
      if (!reader) reader = openReader(t.workflow_run_id);
      if (TERMINAL.has(t.status)) {
        await terminate(t.status);
        break;
      }
    }

    if (reader) await reader.cancel().catch(() => {});
    if (!closed) res.end();
  });

  return router;
}
