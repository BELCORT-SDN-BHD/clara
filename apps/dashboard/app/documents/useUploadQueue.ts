// Bulk upload queue for the /documents tab (contract §4.5 / S5-R8). Files queue
// client-side (batch design target 100) and upload at most CONCURRENCY at a time
// to respect the runtime's ingress caps (global 2, browser 2). Per-file honest
// failure + retry; the same begin→PUT→finalize→poll transport as the chat door.

import { useCallback, useRef, useState } from "react";
import {
  beginIntake,
  dedupeKey,
  finalizeIntake,
  intakeStatusCopy,
  INTAKE_ADOPTED,
  MAX_FILE_BYTES,
  putIntakeBytes,
  readIntake,
  recoveryCopy,
} from "../shared/intake";
import { supabaseBase } from "../shared/wire";

const CONCURRENCY = 2;

export type QueueState = "queued" | "starting" | "uploading" | "verifying" | "ready" | "failed" | "error";

export type QueueItem = {
  localId: string;
  name: string;
  size: number;
  file: File;
  key: string;
  intakeId: string | null;
  documentId: string | null;
  state: QueueState;
  label: string;
  error: string | null;
};

export type UploadQueue = {
  items: QueueItem[];
  add: (files: File[]) => void;
  retry: (localId: string) => void;
  remove: (localId: string) => void;
  clearDone: () => void;
};

/** onAdopted fires once per file when its intake reaches finalized/adopted — the
 *  page uses it to refresh the unassigned lane. */
export function useUploadQueue(token: string, onAdopted: () => void, onNote: (m: string) => void): UploadQueue {
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
        patch(localId, { state: "starting", label: "Starting…", error: null, intakeId: null, documentId: null });
        const begun = await beginIntake(token, {
          filename: file.name,
          mime: file.type || "application/octet-stream",
          declaredBytes: file.size,
          origin: "documents_tab",
        });
        patch(localId, { intakeId: begun.intake_id, state: "uploading", label: "Uploading…" });
        await putIntakeBytes(begun.upload_token, begun.intake_id, file);
        // 0051 §2 — the finalize receipt is the ONLY place the recovery door's answer appears.
        // A refusal still returns 202 with status 'adopted', so without this the person who
        // re-uploaded a document to fix it was told "Stored — matched an existing document"
        // and nothing else, whether it was retried or refused.
        const receipt = await finalizeIntake(begun.upload_token, begun.intake_id);
        const recovery = recoveryCopy(receipt);
        patch(localId, { state: "verifying", label: "Verifying…" });
        if (!supabaseBase()) {
          patch(localId, { state: "error", label: "Cannot confirm filing", error: "Set NEXT_PUBLIC_SUPABASE_URL to confirm the intake." });
          return;
        }
        for (let i = 0; i < 60; i++) {
          const row = await readIntake(token, begun.intake_id).catch(() => null);
          if (row) {
            const label = intakeStatusCopy(row.status, row.failure_code);
            if (row.status === "failed") return patch(localId, { state: "failed", label });
            if (INTAKE_ADOPTED.has(row.status) && row.document_id) {
              // The document really was stored, so the row stays 'ready' — but when the
              // recovery door said something, IT is the answer the person needs, not the
              // generic adoption copy.
              patch(localId, {
                state: "ready",
                documentId: row.document_id,
                label: recovery?.label ?? label,
                error: recovery?.detail ?? null,
              });
              onAdopted();
              return;
            }
            patch(localId, { state: "verifying", label });
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        patch(localId, { state: "error", label: "Timed out", error: "Timed out awaiting the intake row." });
      } catch (err) {
        patch(localId, { state: "error", label: "Upload error", error: (err as Error).message });
      }
    },
    [token, patch, onAdopted],
  );

  const pump = useCallback(() => {
    while (running.current < CONCURRENCY) {
      const next = ref.current.find((i) => i.state === "queued");
      if (!next) break;
      running.current += 1;
      patch(next.localId, { state: "starting", label: "Starting…" });
      void runOne(next.localId, next.file).finally(() => {
        running.current -= 1;
        pump();
      });
    }
  }, [patch, runOne]);

  const add = useCallback(
    (files: File[]) => {
      void (async () => {
        for (const file of files) {
          if (file.size > MAX_FILE_BYTES) {
            onNote(`${file.name} exceeds the 20MB per-file limit.`);
            continue;
          }
          const key = await dedupeKey(file);
          if (ref.current.some((i) => i.key === key && i.state !== "failed" && i.state !== "error")) continue;
          ref.current = [
            ...ref.current,
            { localId: crypto.randomUUID(), name: file.name, size: file.size, file, key,
              intakeId: null, documentId: null, state: "queued", label: "Queued", error: null },
          ];
        }
        sync();
        pump();
      })();
    },
    [onNote, sync, pump],
  );

  const retry = useCallback(
    (localId: string) => {
      patch(localId, { state: "queued", label: "Queued", error: null });
      pump();
    },
    [patch, pump],
  );

  const remove = useCallback(
    (localId: string) => {
      ref.current = ref.current.filter((i) => i.localId !== localId);
      sync();
    },
    [sync],
  );

  const clearDone = useCallback(() => {
    ref.current = ref.current.filter((i) => i.state !== "ready");
    sync();
  }, [sync]);

  return { items, add, retry, remove, clearDone };
}
