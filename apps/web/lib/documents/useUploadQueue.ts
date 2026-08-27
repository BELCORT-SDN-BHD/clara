"use client";

// Bulk upload queue for the client Documents tab, ported MECHANISM (never look) from
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

import { useCallback, useRef, useState } from "react";
import {
  beginIntake, finalizeIntake, INTAKE_ADOPTED, putIntakeBytes, readIntake,
  type IntakeRecoveryRefused,
} from "./intake";
import { fileToClient } from "./doors";
import { MAX_FILE_BYTES, type IntakeFailureCode } from "./types";
import type { SessionTokenAccessor } from "@/lib/session";

const CONCURRENCY = 2;

export type QueueState = "queued" | "starting" | "uploading" | "verifying" | "filing" | "ready" | "failed" | "error";
export type QueueErrorPhase = "upload" | "filing" | "timeout";

export type QueueItem = {
  localId: string;
  name: string;
  size: number;
  file: File;
  documentId: string | null;
  state: QueueState;
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
  error: string | null;
};

export type QueueTooLargeNote = { filename: string; limitBytes: number };

export type UploadQueue = {
  items: QueueItem[];
  add: (files: File[]) => void;
  retry: (localId: string) => void;
  remove: (localId: string) => void;
  clearDone: () => void;
};

const BLANK: Pick<QueueItem, "failureCode" | "recoveryReason" | "recoveryRemedy" | "recoveryDocumentMime" | "recoveryUploadMime" | "errorPhase" | "error"> = {
  failureCode: null, recoveryReason: null, recoveryRemedy: null,
  recoveryDocumentMime: null, recoveryUploadMime: null, errorPhase: null, error: null,
};

/** `onFiled` fires once per file when its document is successfully filed to
 *  `clientId` — the caller uses it to re-hydrate the filed-documents list
 *  (hydrate-never-trust: this hook never asserts the row is filed itself).
 *  `onTooLarge` fires once per rejected file — STRUCTURED, never a rendered note. */
export function useUploadQueue(
  clientId: string,
  session: SessionTokenAccessor,
  onFiled: () => void,
  onTooLarge: (note: QueueTooLargeNote) => void,
): UploadQueue {
  const ref = useRef<QueueItem[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const running = useRef(0);

  const sync = useCallback(() => setItems([...ref.current]), []);
  const patch = useCallback(
    (localId: string, p: Partial<QueueItem>) => {
      ref.current = ref.current.map((i) => (i.localId === localId ? { ...i, ...p } : i));
      sync();
    },
    [sync],
  );

  const runOne = useCallback(
    async (localId: string, file: File) => {
      try {
        patch(localId, { state: "starting", documentId: null, ...BLANK });
        const begun = await beginIntake({ filename: file.name, mime: file.type || "application/octet-stream", declaredBytes: file.size }, { session });
        patch(localId, { state: "uploading" });
        await putIntakeBytes(begun.upload_token, begun.intake_id, file);
        const receipt = await finalizeIntake(begun.upload_token, begun.intake_id);
        const refused = receipt.recovery_refused;
        patch(localId, { state: "verifying" });
        for (let i = 0; i < 60; i++) {
          const row = await readIntake(begun.intake_id, { session }).catch(() => null);
          if (row) {
            if (row.status === "failed") return patch(localId, { state: "failed", failureCode: row.failure_code });
            if (INTAKE_ADOPTED.has(row.status) && row.document_id) {
              patch(localId, { state: "filing", documentId: row.document_id });
              try {
                await fileToClient(row.document_id, clientId, "documents_tab_upload", { session });
                patch(localId, {
                  state: "ready",
                  recoveryReason: refused?.reason ?? null,
                  recoveryRemedy: refused?.remedy ?? null,
                  recoveryDocumentMime: refused?.document_mime ?? null,
                  recoveryUploadMime: refused?.upload_mime ?? null,
                });
                onFiled();
              } catch (fileErr) {
                patch(localId, { state: "error", errorPhase: "filing", error: (fileErr as Error).message });
              }
              return;
            }
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        patch(localId, { state: "error", errorPhase: "timeout", error: null });
      } catch (err) {
        patch(localId, { state: "error", errorPhase: "upload", error: (err as Error).message });
      }
    },
    [session, clientId, patch, onFiled],
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
          onTooLarge({ filename: file.name, limitBytes: MAX_FILE_BYTES });
          continue;
        }
        ref.current = [
          ...ref.current,
          { localId: crypto.randomUUID(), name: file.name, size: file.size, file, documentId: null, state: "queued", ...BLANK },
        ];
      }
      sync();
      pump();
    },
    [onTooLarge, sync, pump],
  );

  const retry = useCallback(
    (localId: string) => {
      patch(localId, { state: "queued", ...BLANK });
      pump();
    },
    [patch, pump],
  );

  const remove = useCallback((localId: string) => {
    ref.current = ref.current.filter((i) => i.localId !== localId);
    sync();
  }, [sync]);

  const clearDone = useCallback(() => {
    ref.current = ref.current.filter((i) => i.state !== "ready");
    sync();
  }, [sync]);

  return { items, add, retry, remove, clearDone };
}
