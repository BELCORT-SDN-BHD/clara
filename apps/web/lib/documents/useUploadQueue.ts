"use client";

// Bulk upload queue for the client Documents tab AND, since the chat-parity train
// (裁-130), the Clara composer's attach affordance — one queue, one transport, no second
// upload path anywhere in this app. The composer's only differences ride in `options`:
// `origin: "chat"` + the `sessionId` the runtime authorises against, and its own
// `filingSource` label on the attribution act. Ported MECHANISM (never look) from
// apps/dashboard/app/documents/useUploadQueue.ts. Files queue client-side and upload
// at most CONCURRENCY at a time; per-file honest failure + retry; the same
// begin→PUT→finalize→poll transport as the dashboard's /documents tab and the chat
// door. DEPARTURE from the dashboard shape (task-directed): this tab is
// CLIENT-scoped, so once an intake adopts a document this hook immediately files it
// to `clientId` (fileToClient) — the dashboard's firm-wide page instead leaves every
// adoption in the unassigned lane for a human to pick a client afterward.
//
// EVERY STRING THROUGH next-intl (STYLE law): unlike the dashboard's own
// useUploadQueue.ts, this hook holds NO pre-rendered English copy — it exposes only
// STRUCTURED state (QueueState, failureCode, recovery fields) plus the raw
// operational `error` message (rendered VERBATIM by the caller, the same precedent
// DoorFeedback uses for a DB/network failure — never chrome text, never translated).
// components/documents/upload-panel.tsx does every translation via copy.ts's
// `queueStateLabelKey`/`queueRecoveryLabelKey`.
//
// INDEPENDENT REVIEW 2026-08-27 additions:
//   N6 — filing is gated EXCLUSIVELY on a DB-CONFIRMED poll read
//        (`INTAKE_ADOPTED.has(row.status)`), never on `finalizeIntake`'s own
//        (advisory-only) receipt — see finalizeIntake's own doc in intake.ts.
//   N7/N8 — every leg carries an AbortController; unmount aborts every in-flight
//        item, and Remove aborts its item's controller too. A document may already
//        exist server-side once the finalize REQUEST has been SENT (not merely once
//        its response is back — R2, round 2: a `sentFinalize` flag is set before
//        that `await`, since an abort can land inside the round-trip after the
//        runtime already processed it) — Remove past that point does NOT delete
//        the row; it stops this queue's own tracking and moves it to the distinct
//        terminal state "stopped" (round 2, R3 — NOT "filing", which read as
//        still-in-progress forever and could never be cleared). A SECOND Remove
//        on an already-"stopped" row deletes it for real (nothing left to lose by
//        then), and `clearDone` sweeps "stopped" rows alongside "ready" ones.
//   N14 — a second `add()` of the same name+size+lastModified while a LIVE
//        (non-terminal) row for it already exists is refused locally, honestly.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginIntake, finalizeIntake, INTAKE_ADOPTED, listProcessingTasksForDocument, putIntakeBytes, readIntake,
  type IntakeRecoveryRefused,
} from "./intake";
import { isRuntimeError } from "./runtime-wire";
import { fileToClient } from "./doors";
import { MAX_FILE_BYTES, type IntakeFailureCode, type IntakeOrigin } from "./types";
import type { SessionTokenAccessor } from "@/lib/session";
import { kindForStatus, type WireErrorKind } from "@/lib/wire-error-kind";

const CONCURRENCY = 2;

export type QueueState = "queued" | "starting" | "uploading" | "verifying" | "filing" | "ready" | "failed" | "error" | "stopped";
export type QueueErrorPhase = "upload" | "filing" | "timeout";

/** WHY A `stopped` ROW STOPPED — #633 AC1(a)/AC7.
 *
 *  `stopped` was ONE terminal state wearing two completely different meanings, and a
 *  surface could not tell them apart. It still is one state string (a rename would
 *  break `ComposerAttachmentControl.tsx:58`'s Send gate and `chat-parity-walk.spec.ts:209`
 *  in the same move); the DISCRIMINANT rides beside it:
 *    * `"cancelled"` — the person stopped this transfer BEFORE the finalize request was
 *      sent. Nothing durable exists server-side; nothing was adopted; Retry is honest.
 *    * `"untracked"` — the queue stopped following a row where a document MAY already
 *      exist server-side (the finalize request had been sent, or custody was confirmed).
 *      The file is not lost — it resurfaces in this client's filed/candidate lanes, or
 *      as an unassigned source at firm altitude — but this queue no longer speaks for it.
 *  `null` on every non-`stopped` row, and cleared by `retry`. */
export type QueueStopReason = "cancelled" | "untracked";

/** The real processing-task counts behind a row — #633 AC8's COUNT half, from the
 *  already-granted `document_processing_tasks_visible` read (`intake.ts`'s
 *  `listProcessingTasksForDocument`, already wired into the detail loader). `null`
 *  until a document id exists: there is nothing honest to count before custody. */
export type QueueTaskCounts = { done: number; total: number };

export type QueueItem = {
  localId: string;
  name: string;
  size: number;
  file: File;
  intakeId: string | null;
  documentId: string | null;
  /** THE CAPABILITY JOIN KEY (#633 AC3(b)). Seeded from the browser's own
   *  `file.type`, then OVERWRITTEN by the intake row's `declared_mime` as soon as the
   *  first poll read lands — that value is the CANONICAL spelling
   *  (`packages/runtime/lib/intake.mjs:88` canonicalises through MIME_ALIASES before
   *  anything is stored), which is the only spelling `clara.document_capabilities`
   *  indexes (0191:206). A browser-reported type this estate never admitted resolves
   *  to no format and the surface publishes nothing — the honest answer. */
  declaredMime: string | null;
  state: QueueState;
  /** MEASURED upload bytes from the XHR seam (`intake.ts`'s `putIntakeBytes`
   *  `onProgress`) — never a simulated ramp, never an indeterminate event dressed as
   *  a number. `null` until the browser reports its first computable event, which is
   *  why a surface must render an honest "no measurement yet" rather than 0 %. */
  bytesSent: number | null;
  bytesTotal: number | null;
  taskCounts: QueueTaskCounts | null;
  stopReason: QueueStopReason | null;
  failureCode: IntakeFailureCode | null;
  recoveryReason: IntakeRecoveryRefused["reason"] | null;
  /** The DB's own remedy text when the recovery door refused — AUTHORITATIVE
   *  wording, rendered verbatim (never translated, same as `error` below). */
  recoveryRemedy: string | null;
  recoveryDocumentMime: string | null;
  recoveryUploadMime: string | null;
  /** WHICH phase an "error" state failed in — the caller picks the translated
   *  chrome phrase; `error` itself stays untranslated operational text. */
  errorPhase: QueueErrorPhase | null;
  errorStatus: number | null;
  errorKind: WireErrorKind | null;
  error: string | null;
};

export type QueueRejection =
  | { reason: "too_large"; filename: string; limitBytes: number }
  | { reason: "duplicate"; filename: string };

export type UploadQueue = {
  items: QueueItem[];
  add: (files: File[]) => void;
  retry: (localId: string) => void;
  /** #633 AC1(a) — STOP THIS TRANSFER, KEEP THE ROW. Distinct from `remove`, which
   *  takes the row off the list. A cancelled row is terminal, carries its
   *  `stopReason`, and can be retried; the ONE thing it never does is cancel an
   *  accepted Work (that is `cancel_accounting_work`, a governed act on a different
   *  object, reached by a LINK from the document's own detail — AC7's "local cancel
   *  vs Work cancel"). */
  cancel: (localId: string) => void;
  remove: (localId: string) => void;
  clearDone: () => void;
};

export type UploadQueueOptions = {
  origin?: IntakeOrigin;
  sessionId?: string;
  /** #636 — the durable batch every file in this queue joins, if the surface opened one. ADDITIVE
   *  and passed straight through to `beginIntake`; #642 OWNS this hook's signature and must not
   *  remove it. Nothing about the batch enters `documentIngest`'s step IO — the runtime commits the
   *  membership beside the intake and the batch is read back from the database. */
  batchId?: string;
  filingSource?: string;
  /** THE POLL BOUND, as data. Defaults are the shipped values (60 reads, 1 s apart);
   *  they are options ONLY so the exhausted-poll arm — C-73's "an exhausted poll
   *  settles as error/timeout and is never dressed as success" — can be driven at all.
   *  A 60-second wall-clock wait is not a unit test, and the alternative (asserting on
   *  the pure predicate alone, the way `pastFinalize`'s own cell has to) would leave
   *  the loop that produces the state unexercised. Production passes neither. */
  pollAttempts?: number;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_ATTEMPTS = 60;
const DEFAULT_POLL_INTERVAL_MS = 1000;

const BLANK: Pick<QueueItem, "failureCode" | "recoveryReason" | "recoveryRemedy" | "recoveryDocumentMime" | "recoveryUploadMime" | "errorPhase" | "errorStatus" | "errorKind" | "error" | "bytesSent" | "bytesTotal" | "taskCounts" | "stopReason"> = {
  failureCode: null, recoveryReason: null, recoveryRemedy: null,
  recoveryDocumentMime: null, recoveryUploadMime: null, errorPhase: null,
  errorStatus: null, errorKind: null, error: null,
  bytesSent: null, bytesTotal: null, taskCounts: null, stopReason: null,
};

/** A LIVE row still occupies its identity slot for dedupe purposes (N14); a
 *  terminally-failed one does not — a genuine retry-by-re-drop must not be
 *  refused forever just because the first attempt failed. */
const LIVE_STATES = new Set<QueueState>(["queued", "starting", "uploading", "verifying", "filing", "ready"]);

function fileIdentity(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** true once this item's `state`/`errorPhase` alone already proves a document
 *  may exist server-side — the CHEAPER half of the Remove guard (N7/N8). The
 *  other half (a finalize REQUEST already SENT, response not yet back) is
 *  tracked separately via `finalizeSent` below — round 2, R2: the response-
 *  received moment is too late a boundary, since the runtime can process a
 *  request the client later aborts waiting on.
 *
 *  `error`+`errorPhase:"timeout"` is included explicitly (round 3, R6): a
 *  timeout means finalize's RESPONSE came back (so `runOne`'s own `finally`
 *  clears `finalizeSent` for this item — the round-trip is genuinely over) but
 *  the poll loop gave up before ever seeing an adopted row. The finalize
 *  request itself still went through, so a document may exist server-side —
 *  `documentId` alone never catches this path (the loop exhausts BEFORE ever
 *  setting it), which is exactly why `finalizeSent` being cleared by then would
 *  otherwise make this row look falsely safe to delete outright. Exported for
 *  its own direct test (useUploadQueue.test.ts, R6) — driving the hook through
 *  a REAL 60-iteration/60-second timeout to prove this arm end-to-end would be
 *  an impractical integration test for what is, at its core, a pure-function
 *  defect; `remove()`'s call site (`finalizeSent.current.has(localId) ||
 *  pastFinalize(item)`) is a direct, unconditional call with no branching of
 *  its own, so this function's own correctness is the actual property to
 *  prove for R6. */
export function pastFinalize(item: Pick<QueueItem, "documentId" | "state" | "errorPhase">): boolean {
  return item.documentId !== null || item.state === "verifying" || item.state === "filing"
    || (item.state === "error" && item.errorPhase === "timeout");
}

/** An abortable sleep — `setTimeout(resolve, ms)` alone leaves the poll loop deaf
 *  to an abort until its NEXT iteration; this rejects immediately instead. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** The FILING leg's failure taxonomy, read off the thrown object's own typed fields
 *  — never parsed out of message text ("spelling is not identity", AGENTS.md). Both
 *  `DoorError` and `DoorRefusal` descend from `WireError` and carry `.status`; only
 *  `DoorError` carries a coarse `.kind`, so a CLR-shaped refusal (which is a REAL
 *  business answer, not a transport problem) is classified from its status instead,
 *  exactly the way `read.ts` folds one. */
function doorStatus(e: unknown): number | null {
  const status = (e as { status?: unknown })?.status;
  return typeof status === "number" ? status : null;
}

function doorKind(e: unknown): WireErrorKind | null {
  const kind = (e as { kind?: unknown })?.kind;
  if (typeof kind === "string") return kind as WireErrorKind;
  const status = doorStatus(e);
  return status === null ? null : kindForStatus(status);
}

/** `onFiled` fires once per file when its document is successfully filed to
 *  `clientId` — the caller uses it to re-hydrate the filed-documents list
 *  (hydrate-never-trust: this hook never asserts the row is filed itself).
 *  `onRejected` fires once per file `add()` refuses locally (too large, or a
 *  live duplicate) — STRUCTURED, never a rendered note. */
export function useUploadQueue(
  clientId: string,
  session: SessionTokenAccessor,
  onFiled: () => void,
  onRejected: (note: QueueRejection) => void,
  options: UploadQueueOptions = {},
): UploadQueue {
  const pollAttempts = options.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const ref = useRef<QueueItem[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const running = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());
  // The EARLIER half of the "a document may already exist" boundary (R2) — set
  // right before the finalize request is SENT, not once its response is back.
  const finalizeSent = useRef(new Set<string>());

  const sync = useCallback(() => setItems([...ref.current]), []);
  const patch = useCallback(
    (localId: string, p: Partial<QueueItem>) => {
      ref.current = ref.current.map((i) => (i.localId === localId ? { ...i, ...p } : i));
      sync();
    },
    [sync],
  );

  // Unmount: abort every in-flight leg (N7/N8) — nothing left running against an
  // unmounted queue's own state.
  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort();
  }, []);

  const runOne = useCallback(
    async (localId: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(localId, controller);
      const signal = controller.signal;
      try {
        patch(localId, { state: "starting", intakeId: null, documentId: null, ...BLANK });
        const begun = await beginIntake(
          { filename: file.name, mime: file.type || "application/octet-stream", declaredBytes: file.size },
          { session, signal, origin: options.origin, sessionId: options.sessionId, batchId: options.batchId }, // #636: additive
        );
        patch(localId, { intakeId: begun.intake_id });
        patch(localId, { state: "uploading" });
        await putIntakeBytes(begun.upload_token, begun.intake_id, file, {
          signal,
          // #633 AC8 — REAL bytes. The seam picks XHR when the platform has it and
          // falls back to `fetch` (which cannot measure an upload) otherwise, so this
          // callback may legitimately never fire; the row then keeps `bytesSent: null`
          // and the surface says "no measurement" instead of inventing one.
          onProgress: (sent, total) => { patch(localId, { bytesSent: sent, bytesTotal: total }); },
        });
        finalizeSent.current.add(localId); // BEFORE the await (R2) — the request may land server-side even if the client aborts waiting on its response
        const receipt = await finalizeIntake(begun.upload_token, begun.intake_id, signal);
        const refused = receipt.recovery_refused;
        patch(localId, { state: "verifying" });
        for (let i = 0; i < pollAttempts; i++) {
          const row = await readIntake(begun.intake_id, { session, signal }).catch((e: unknown) => {
            if (isAbort(e)) throw e; // a transient read failure retries next tick; an abort must not
            return null;
          });
          if (row) {
            // The canonical mime lands here (see `declaredMime`'s own note) — the
            // capability join key, from the DB rather than from the browser.
            if (row.declared_mime) patch(localId, { declaredMime: row.declared_mime });
            // N6: filing is gated EXCLUSIVELY on this DB-confirmed row — `receipt`
            // (finalizeIntake's own advisory return, above) never drives it.
            if (row.status === "failed") return patch(localId, { state: "failed", failureCode: row.failure_code });
            if (INTAKE_ADOPTED.has(row.status) && row.document_id) {
              patch(localId, { state: "filing", documentId: row.document_id });
              // #633 AC8, the COUNT half — the honest per-file lane/status counts the
              // detail loader already reads (`loaders.ts:123`), now on the queue row
              // too. BEST-EFFORT by construction: a failed count must never turn a
              // successful custody into a failed upload, so it is caught and dropped
              // (an abort still propagates, like every other read on this path).
              try {
                const tasks = await listProcessingTasksForDocument(row.document_id, { session, signal });
                patch(localId, {
                  taskCounts: { done: tasks.filter((t) => t.status === "done").length, total: tasks.length },
                });
              } catch (taskErr) {
                if (isAbort(taskErr)) throw taskErr;
              }
              try {
                await fileToClient(row.document_id, clientId, options.filingSource ?? "documents_tab_upload", { session, signal });
                patch(localId, {
                  state: "ready",
                  recoveryReason: refused?.reason ?? null,
                  recoveryRemedy: refused?.remedy ?? null,
                  recoveryDocumentMime: refused?.document_mime ?? null,
                  recoveryUploadMime: refused?.upload_mime ?? null,
                });
                onFiled();
              } catch (fileErr) {
                if (isAbort(fileErr)) throw fileErr;
                // p633.queue.authority_lost — THE DENIED FACE, NOT A BLIP. The filing
                // act is a governed door, so a membership revoked mid-batch answers
                // 403/CLR04 here and not on the upload leg. Carrying only
                // `(err as Error).message` (as this arm used to) left the surface with
                // operational prose and no way to tell a denial from a network wobble,
                // so it could neither name the constraint nor decide whether a Retry
                // was honest. `documentId` stays set on purpose: custody HAPPENED —
                // the row is "adopted, not filed", and its receipt is still readable.
                patch(localId, {
                  state: "error",
                  errorPhase: "filing",
                  errorStatus: doorStatus(fileErr),
                  errorKind: doorKind(fileErr),
                  error: (fileErr as Error).message,
                });
              }
              return;
            }
          }
          await sleep(pollIntervalMs, signal);
        }
        patch(localId, { state: "error", errorPhase: "timeout", error: null });
      } catch (err) {
        if (isAbort(err)) return; // Remove/unmount already decided this item's fate
        patch(localId, {
          state: "error",
          errorPhase: "upload",
          errorStatus: isRuntimeError(err) ? err.status : null,
          errorKind: isRuntimeError(err) ? err.kind : null,
          error: (err as Error).message,
        });
      } finally {
        controllers.current.delete(localId);
        finalizeSent.current.delete(localId);
      }
    },
    [session, clientId, patch, onFiled, options.origin, options.sessionId, options.filingSource, pollAttempts, pollIntervalMs],
  );

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY) {
      const next = ref.current.find((i) => i.state === "queued");
      if (!next) break;
      running.current += 1;
      patch(next.localId, { state: "starting" });
      void runOne(next.localId, next.file).finally(() => {
        running.current -= 1;
        pump();
      });
    }
  }, [patch, runOne]);

  const add = useCallback(
    (files: File[]) => {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          onRejected({ reason: "too_large", filename: file.name, limitBytes: MAX_FILE_BYTES });
          continue;
        }
        const identity = fileIdentity(file);
        const isDuplicate = ref.current.some((i) => LIVE_STATES.has(i.state) && fileIdentity(i.file) === identity);
        if (isDuplicate) {
          onRejected({ reason: "duplicate", filename: file.name });
          continue;
        }
        ref.current = [
          ...ref.current,
          { localId: crypto.randomUUID(), name: file.name, size: file.size, file, intakeId: null, documentId: null, declaredMime: file.type || null, state: "queued", ...BLANK },
        ];
      }
      sync();
      pump();
    },
    [onRejected, sync, pump],
  );

  const retry = useCallback(
    (localId: string) => {
      patch(localId, { state: "queued", intakeId: null, documentId: null, ...BLANK });
      pump();
    },
    [patch, pump],
  );

  /** #633 AC1(a) — CANCEL: stop the transfer, KEEP the row.
   *
   *  The shipped code had one function for two verbs (`remove`, :303-330): a
   *  pre-finalize row was deleted outright, so there was no way to stop an upload
   *  without also losing the only trace that it had ever been attempted, and nothing
   *  left to retry. Cancel now always leaves a terminal row carrying WHY it stopped;
   *  `remove` below keeps its original job (take it off my list) and its original
   *  two-press guard for a row whose document may already exist.
   *
   *  A cancel on an already-terminal row is a no-op, never a silent delete — the
   *  delete verb is `remove`, and the two must not be reachable from one control. */
  const cancel = useCallback(
    (localId: string) => {
      const item = ref.current.find((i) => i.localId === localId);
      if (!item) return;
      if (!LIVE_STATES.has(item.state)) return;
      const custodyMayExist = finalizeSent.current.has(localId) || pastFinalize(item);
      controllers.current.get(localId)?.abort();
      controllers.current.delete(localId);
      patch(localId, { state: "stopped", stopReason: custodyMayExist ? "untracked" : "cancelled" });
    },
    [patch],
  );

  const remove = useCallback(
    (localId: string) => {
      const item = ref.current.find((i) => i.localId === localId);
      // A SECOND Remove on an already-"stopped" row: nothing left to protect
      // (round 2, R3) — this really does delete it now.
      if (item?.state === "stopped") {
        ref.current = ref.current.filter((i) => i.localId !== localId);
        sync();
        return;
      }
      controllers.current.get(localId)?.abort();
      controllers.current.delete(localId);
      if (item && (finalizeSent.current.has(localId) || pastFinalize(item))) {
        // A document may already exist server-side, now untracked by this queue —
        // N7/N8: never let the row silently vanish while that is still true.
        // "stopped" (round 2, R3) is a DISTINCT terminal state from "filing" —
        // the previous cut reused "filing", which read as still-in-progress
        // forever and could never be cleared. The client's "Filed to this
        // client" / "Needs your confirmation" lanes are where it resurfaces if
        // a matcher or a human picks it up later.
        patch(localId, { state: "stopped", stopReason: "untracked" });
        return;
      }
      ref.current = ref.current.filter((i) => i.localId !== localId);
      sync();
    },
    [patch, sync],
  );

  const clearDone = useCallback(() => {
    ref.current = ref.current.filter((i) => i.state !== "ready" && i.state !== "stopped");
    sync();
  }, [sync]);

  return { items, add, retry, cancel, remove, clearDone };
}
