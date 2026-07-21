import { definePlugin } from "nitro";
import {
  mintWakeCredential,
  mintWakeCredentialObo,
  withReadWakeScoped,
  withWriteWakeScoped,
  withRuntime,
  withRead,
} from "../lib/pools.mjs";
import { startControlListener, productionControlDeps } from "../lib/control.mjs";
import { startLeaderLoop } from "../lib/leader.mjs";
import { startMatcherLoop } from "../lib/matcher.mjs";
import { startAutodraftLoop } from "../lib/autodraft.mjs";
import { heartbeat } from "../lib/reconciler.mjs";
import { start, getRun } from "workflow/api";
import { workflows } from "../workflows/registry.js";
import { makeDocumentServices, recoverPendingDocumentIntakes } from "../lib/intake.mjs";
import { makeInvoiceFactsServices } from "../workflows/invoiceFacts.v1.services.mjs";
import { stopIntakeIngress } from "../lib/spool.mjs";
import { startManagedScanner } from "../lib/scan.mjs";

type SupervisorState = { shuttingDown: boolean; stops: Array<() => Promise<unknown> | void> };

// Boots the WHOLE crash-only group (Slice 4, contract §4.1): the WDK Postgres
// world's embedded worker, the control listener, the single leader loop (routing +
// drain + reconcile), and the DEDICATED engine heartbeat. It injects the pool API
// for the FROZEN chatTurn steps (which never import pools.mjs).
//
// SUPERVISION (S4-AB7): every required component's promise is watched — if any
// settles UNEXPECTEDLY (not during shutdown) the whole process exits non-zero
// (crash-only; Fly restarts). A world-start failure exits non-zero. The 'world'
// heartbeat is written by a DEDICATED timer here — NEVER by the relay leader (ND5),
// so relay leadership never gates /ready. (The WDK active healthCheck is a
// Vercel-world feature; against the self-hosted Postgres world the beat reflects the
// world PROCESS's event-loop liveness — a crashed worker exits the process, a stuck
// worker stalls this timer → the beat goes stale → /ready fails.)
export default definePlugin(() => {
  if (process.env.CLARA_START_WORLD !== "1") {
    console.log("[clara-runtime] world NOT started (CLARA_START_WORLD != 1) — skeleton mode");
    return;
  }

  // Shared supervisor state (serve.mjs sets shuttingDown + calls stops on SIGTERM).
  const sup = ((globalThis as unknown as { __claraSupervisor?: SupervisorState }).__claraSupervisor ??= {
    shuttingDown: false,
    stops: [],
  });

  // Inject the pool API for the frozen chatTurn steps (globalThis contract §4.1).
  // v2 adds the write floor (withWriteWakeScoped) + OBO minting (mintWakeCredentialObo)
  // for the coding tools; v1's steps ignore the extra members.
  (globalThis as unknown as { __claraPools?: unknown }).__claraPools = {
    mintWakeCredential,
    mintWakeCredentialObo,
    withReadWakeScoped,
    withWriteWakeScoped,
    withRuntime,
    withRead,
  };
  (globalThis as unknown as { __claraDocumentServices?: unknown }).__claraDocumentServices = makeDocumentServices();
  (globalThis as unknown as { __claraInvoiceFactsServices?: unknown }).__claraInvoiceFactsServices = makeInvoiceFactsServices();

  // Register intake first. The HTTP shutdown gate rejects new requests immediately;
  // this stop waits for an already-streaming spool write to finish honestly.
  sup.stops.unshift(stopIntakeIngress);

  const fatal = (what: string, err?: unknown) => {
    if (sup.shuttingDown) return; // an expected settle during graceful shutdown
    console.error(`[clara-runtime] FATAL: ${what} exited unexpectedly:`, err instanceof Error ? err.stack : String(err ?? ""));
    process.exit(1);
  };

  void (async () => {
    try {
      const { getWorld } = await import("workflow/runtime");
      await getWorld().start?.();
      console.log(`[clara-runtime] durable world started pid=${process.pid}`);
    } catch (err) {
      console.error("[clara-runtime] durable world FAILED to start:", err instanceof Error ? err.message : String(err));
      process.exit(1); // crash-only: world-start failure is fatal (S4-D10)
    }

    // Image-local ClamAV (when enabled) is supervised as a SELF-HEALING child
    // (PIN-AB-2 / Slice-6 §13 amendment): a clamd exit is NO LONGER runtime-fatal —
    // startManagedScanner restarts it with bounded backoff, and intake scans fail
    // closed honestly (503 scanner_unavailable) while it is down, so nothing bypasses
    // scanning. `done` settles only on stop(); a supervisor-loop error is logged, never
    // fatal. /ready keeps scanner.ok:false as a WARNING (the world stays ready).
    const scanner = startManagedScanner({ log: (m: string) => console.log(m) });
    if (scanner) {
      scanner.done.then(
        () => {},
        (e: unknown) =>
          console.error(
            "[clara-runtime] clamd supervisor error (intake fails closed, NOT fatal):",
            e instanceof Error ? e.message : String(e),
          ),
      );
      sup.stops.push(scanner.stop);
    }

    const control = startControlListener(productionControlDeps({ log: (m: string) => console.log(m) }));
    control.done.then(() => fatal("control listener"), (e: unknown) => fatal("control listener", e));
    sup.stops.push(control.stop);

    // Leader loop — routing + drain + reconcile under the 'router' advisory lock.
    const leader = startLeaderLoop(
      {
        enqueueChatTurn: (taskId: string) => start(workflows.chatTurn, [{ taskId }]),
        enqueueDocumentIngest: (taskId: string) => start(workflows.documentIngest, [{ task_id: taskId }]),
        // The reconciler is lane-aware (L4's split): an invoice_facts document task routes
        // HERE (invoiceFacts_v1); every other lane routes to documentIngest above. Both
        // references resolve through the registry `workflows` object (freeze-lint
        // enqueue-provenance law — a direct workflow-file import handed to start() fails CI).
        enqueueInvoiceFacts: (taskId: string) => start(workflows.invoiceFacts, [{ task_id: taskId }]),
        // The reconciler re-enqueues an admitted-but-unstarted autodraft task (Wave A); the
        // reference resolves through the registry `workflows` object (freeze-lint provenance).
        enqueueAutoDraft: (taskId: string) => start(workflows.autoDraft, [{ taskId }]),
        recoverDocumentIntakes: () =>
          recoverPendingDocumentIntakes({
            withRuntime,
            enqueue: (taskId: string) => start(workflows.documentIngest, [{ task_id: taskId }]),
            log: (m: string) => console.log(m),
          }),
        getRun,
        log: (m: string) => console.log(m),
      } as Parameters<typeof startLeaderLoop>[0],
    );
    leader.done.then(() => fatal("leader loop"), (e: unknown) => fatal("leader loop", e));
    sup.stops.push(leader.stop);

    // Matcher consumer (§4.4) — an INDEPENDENT loop on its own dedicated
    // connection under the 'matcher' advisory lock, so router leadership and
    // the engine heartbeat are untouched. +1 persistent session (budget 18).
    const matcher = startMatcherLoop({ log: (m: string) => console.log(m) });
    matcher.done.then(() => fatal("matcher loop"), (e: unknown) => fatal("matcher loop", e));
    sup.stops.push(matcher.stop);

    // Autodraft consumer (Wave A §3) — an INDEPENDENT loop on its own dedicated connection
    // under the 'autodraft' advisory lock, so router/matcher leadership + the engine heartbeat
    // are untouched. +1 persistent session. It resolves invoice_facts events -> filings, admits
    // sweep tasks, and enqueues autoDraft_v1 (registry provenance) for each admitted task.
    const autodraft = startAutodraftLoop({
      enqueue: (taskId: string) => start(workflows.autoDraft, [{ taskId }]),
      log: (m: string) => console.log(m),
    });
    autodraft.done.then(() => fatal("autodraft loop"), (e: unknown) => fatal("autodraft loop", e));
    sup.stops.push(autodraft.stop);

    // DEDICATED engine heartbeat — the ONLY writer of the 'world' beat (S4-AB7b).
    const beatMs = Number(process.env.CLARA_WORLD_BEAT_MS || 10000);
    const timer = setInterval(() => {
      if (sup.shuttingDown) return;
      withRuntime((c) => heartbeat(c, "world")).catch((e) => console.error("[clara-runtime] world heartbeat error:", e?.message ?? e));
    }, beatMs);
    timer.unref?.();
    sup.stops.push(() => clearInterval(timer));

    console.log("[clara-runtime] control listener + leader loop + engine heartbeat started");
  })();
});
