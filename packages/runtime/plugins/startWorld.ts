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
import { startLocalFactsLoop, processLocalFactsTask } from "../lib/local-facts.mjs";
import { startRulePostLoop } from "../lib/rule-post.mjs";
import { startSstWatchLoop } from "../lib/sst-watch.mjs";
import { startFactsGateLoop } from "../lib/facts-gate.mjs";
import { startClassifyLoop } from "../lib/classify.mjs";
import { startWikiProjectionLoop } from "../lib/wiki-projection-ops.mjs";
import { heartbeat } from "../lib/reconciler.mjs";
import { start, getRun } from "workflow/api";
import { workflows } from "../workflows/registry.js";
import { makeDocumentServices, recoverPendingDocumentIntakes } from "../lib/intake.mjs";
import { makeInvoiceFactsServices } from "../workflows/invoiceFacts.v1.services.mjs";
import { makeStatementFactsServices } from "../workflows/statementFacts.v1.services.mjs";
import { makeWitnessFactsServices } from "../workflows/witnessFacts.v1.services.mjs";
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
  // Wave C-b: the statement lane's own bundle — reader-1 (the deterministic pass over the
  // STORED layout geometry, no egress), the reader-2 vendor adapter, the csv/ofx parsers,
  // and the corroborator/payload builder. Kept OUT of the frozen closure so parser and
  // vendor tuning against real Maybank output is never a workflow-version change (AB-16).
  (globalThis as unknown as { __claraStatementFactsServices?: unknown }).__claraStatementFactsServices = makeStatementFactsServices();
  // F-A1: the witness lane's own bundle — the canonical download plus the ONE model adapter both
  // channels call. Kept OUT of the frozen closure so a model id, a timeout or a provider content
  // shape is config rather than a workflow version (AB-16); the PROMPTS are the deliberate
  // exception and live inside the closure (design M8). Injected unconditionally even though
  // nothing mints `llm_witness` tasks yet: the image must be able to run the lane BEFORE PR-3's
  // router recut turns it on, which is the whole point of the deploy order (positive-read law).
  (globalThis as unknown as { __claraWitnessFactsServices?: unknown }).__claraWitnessFactsServices = makeWitnessFactsServices();
  // The MyInvois local_facts consumer reuses the document services (temp-file lifecycle +
  // canonical download); the UBL facts parse runs in its own worker thread.
  const localFactsServices = makeDocumentServices();

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
        // Wave C-b: BOTH statement lanes ('statement_facts' pdf/image, 'statement_parse'
        // csv/ofx) route to the ONE statementFacts_v1 workflow, which branches on the
        // claimed task's own lane. `enqueueForLane` is now an explicit allowlist, so if this
        // dep were ever missing a statement task would WAIT (warned once) rather than be
        // driven into documentIngest's consentless generic OCR pass. Resolved through the
        // registry `workflows` object (freeze-lint enqueue-provenance law — a direct
        // workflow-file import handed to start() fails CI).
        enqueueStatementFacts: (taskId: string) => start(workflows.statementFacts, [{ task_id: taskId }]),
        // F-A1 PR-3 cutover: the llm_witness lane rides its own workflow (witnessFacts_v1),
        // resolved through the registry `workflows` object exactly like the other facts lanes
        // (freeze-lint enqueue-provenance law — a direct workflow-file import handed to
        // start() fails CI). Without this dep, reconciler-documents.mjs's enqueueForLane
        // returns undefined for lane='llm_witness' and the reconciler warns-once + waits —
        // never falls through to documentIngest (the explicit-allowlist protection).
        enqueueWitnessFacts: (taskId: string) => start(workflows.witnessFacts, [{ task_id: taskId }]),
        // The MyInvois local_facts lane (Wave A2) has NO WDK workflow — a facts task is
        // driven by processLocalFactsTask directly (claim/parse/persist). The claim gate
        // makes this reconciler belt idempotent against the local_facts leader loop below.
        enqueueLocalFacts: (taskId: string) => processLocalFactsTask(withRuntime, taskId, localFactsServices),
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

    // local_facts consumer (Wave A2) — an INDEPENDENT loop on its own connection under the
    // 'local_facts' advisory lock. Claims MyInvois local_facts tasks, runs the UBL facts
    // parse in a worker, persists via persist_invoice_facts. +1 persistent session.
    const localFacts = startLocalFactsLoop({ withRuntime, services: localFactsServices, log: (m: string) => console.log(m) });
    localFacts.done.then(() => fatal("local_facts loop"), (e: unknown) => fatal("local_facts loop", e));
    sup.stops.push(localFacts.stop);

    // rule-post consumer (Wave A2) — an INDEPENDENT loop on its own connection under the
    // 'rule_post' advisory lock. Calls execute_rule_post login-direct on each entry.drafted.
    // +1 persistent session.
    const rulePost = startRulePostLoop({ log: (m: string) => console.log(m) });
    rulePost.done.then(() => fatal("rule_post loop"), (e: unknown) => fatal("rule_post loop", e));
    sup.stops.push(rulePost.stop);

    // === Wave A2.1 consumers (migration 0016) — three INDEPENDENT loops, each on its own
    // dedicated LISTEN connection under its own advisory lock, structurally isolated from the
    // other consumers' leadership / readiness / heartbeat. +3 persistent sessions.
    //
    // SUPAVISOR SESSION HEADROOM (walk the code): the process now holds TEN dedicated
    // LISTEN/persistent clients — control + leader + matcher + autodraft + local_facts +
    // rule_post + (A2.1) sst_watch + facts_gate + classify + (Wave B) wiki_projection — ON TOP
    // OF the pooled budgets in lib/pools.mjs (5 runtime + 5 read + 2 write + 5 engine = 17).
    // Grand total ≈ 27 sessions against the Supavisor session ceiling; the integrator MUST
    // confirm headroom before deploy (WB-R18: ~26/60 today + this +1 = 27). The Wave B lint
    // belt is a leader-phase sibling (ZERO new sessions); the interview workflows ride the WDK
    // world (ZERO new sessions) — only wiki_projection adds a dedicated session this wave.

    // sst_watch consumer — the STRUCTURAL SST compliance watch. Plain group-role
    // evaluate_sst_watch(client) on each entry.approved (never blocks/touches an approval).
    const sstWatch = startSstWatchLoop({ log: (m: string) => console.log(m) });
    sstWatch.done.then(() => fatal("sst_watch loop"), (e: unknown) => fatal("sst_watch loop", e));
    sup.stops.push(sstWatch.stop);

    // facts_gate consumer — re-fires clara.enqueue_invoice_facts(document) on each
    // document.classified (the classifier→facts gate; the existing reconciler belt dispatches
    // the re-fired task).
    const factsGate = startFactsGateLoop({ log: (m: string) => console.log(m) });
    factsGate.done.then(() => fatal("facts_gate loop"), (e: unknown) => fatal("facts_gate loop", e));
    sup.stops.push(factsGate.stop);

    // classify consumer — the doc-type classifier task lane: claims lane='classify' tasks,
    // reads OCR layout text, model-classifies, settles via clara.classify_document. Uses the
    // runtime pool for its DB writers (claim/classify_document are group-granted).
    const classify = startClassifyLoop({ withRuntime, log: (m: string) => console.log(m) });
    classify.done.then(() => fatal("classify loop"), (e: unknown) => fatal("classify loop", e));
    sup.stops.push(classify.stop);

    // wiki_projection consumer (Wave B, migration 0017 W4) — an INDEPENDENT loop on its own
    // dedicated LISTEN connection under the 'wiki_projection' advisory lock, structurally isolated
    // from the other consumers' leadership / readiness / heartbeat. +1 persistent session (the
    // TENTH dedicated client — see the Supavisor headroom walk above). It maintains the Layer-1
    // client wiki index from the books/counterparty/consent spine (deterministic ingest +
    // consent-gated model synthesis); a stall is a warn-only /ready signal, never chat-down, and
    // NEVER gates on wiki freshness (WB-R3). Cold-start checkpoint seeding + backfill + orphan
    // repair are CEREMONY items (scripts/relay.mjs wiki-backfill / wiki-repair), never boot.
    const wikiProjection = startWikiProjectionLoop({ log: (m: string) => console.log(m) });
    wikiProjection.done.then(() => fatal("wiki_projection loop"), (e: unknown) => fatal("wiki_projection loop", e));
    sup.stops.push(wikiProjection.stop);

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
