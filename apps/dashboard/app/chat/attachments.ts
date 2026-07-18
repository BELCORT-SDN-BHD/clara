// Composer-attachment lifecycle hook (contract §4.5). Kept out of page.tsx so the
// chat page stays readable. One attachment is submittable ONLY once its DB intake
// row reaches adoption (state 'ready', document_id known) — no success state before
// the DB row exists. 'failed'/'error' block submit until removed (honest reason).

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentPart } from "./api";
import {
  beginIntake,
  CHAT_MAX_FILES,
  dedupeKey,
  finalizeIntake,
  intakeStatusCopy,
  INTAKE_ADOPTED,
  MAX_FILE_BYTES,
  putIntakeBytes,
  readIntake,
} from "../shared/intake";
import { supabaseBase } from "../shared/wire";

export type AttachmentState = "starting" | "uploading" | "polling" | "ready" | "failed" | "error";

export type Attachment = {
  localId: string;
  name: string;
  size: number;
  file: File;
  key: string;
  intakeId: string | null;
  documentId: string | null;
  state: AttachmentState;
  label: string;
  error: string | null;
};

export type ComposerAttachments = {
  items: Attachment[];
  ready: boolean; // every attachment adopted (empty ⇒ true)
  parts: AttachmentPart[]; // ready attachments as submit parts
  add: (files: File[], sessionId: string) => void;
  remove: (localId: string) => void;
  retry: (localId: string, sessionId: string) => void;
  clear: () => void;
};

export function useComposerAttachments(token: string, onNote: (msg: string) => void): ComposerAttachments {
  const [items, setItems] = useState<Attachment[]>([]);
  const ref = useRef<Attachment[]>([]);
  useEffect(() => {
    ref.current = items;
  }, [items]);

  const patch = useCallback((localId: string, p: Partial<Attachment>) => {
    setItems((prev) => prev.map((a) => (a.localId === localId ? { ...a, ...p } : a)));
  }, []);

  // begin → PUT bytes → finalize → poll the masked intake view until adoption or an
  // honest failure. The upload token authorizes PUT + finalize only; status polling
  // is the JWT lane (the §3.2 capability split).
  const run = useCallback(
    async (localId: string, file: File, sessionId: string) => {
      try {
        patch(localId, { state: "starting", label: "Starting…", error: null, intakeId: null, documentId: null });
        const begun = await beginIntake(token, {
          filename: file.name,
          mime: file.type || "application/octet-stream",
          declaredBytes: file.size,
          origin: "chat",
          sessionId,
        });
        patch(localId, { intakeId: begun.intake_id, state: "uploading", label: "Uploading…" });
        await putIntakeBytes(begun.upload_token, begun.intake_id, file);
        await finalizeIntake(begun.upload_token, begun.intake_id);
        patch(localId, { state: "polling", label: "Verifying…" });
        if (!supabaseBase()) {
          patch(localId, { state: "error", label: "Cannot confirm filing", error: "Set NEXT_PUBLIC_SUPABASE_URL to confirm the intake." });
          return;
        }
        for (let i = 0; i < 45; i++) {
          const row = await readIntake(token, begun.intake_id).catch(() => null);
          if (row) {
            const label = intakeStatusCopy(row.status, row.failure_code);
            if (row.status === "failed") return patch(localId, { state: "failed", label });
            if (INTAKE_ADOPTED.has(row.status) && row.document_id) {
              return patch(localId, { state: "ready", documentId: row.document_id, label });
            }
            patch(localId, { state: "polling", label });
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        patch(localId, { state: "error", label: "Timed out", error: "Timed out awaiting the intake row." });
      } catch (err) {
        patch(localId, { state: "error", label: "Upload error", error: (err as Error).message });
      }
    },
    [token, patch],
  );

  const add = useCallback(
    (files: File[], sessionId: string) => {
      void (async () => {
        for (const file of files) {
          if (ref.current.length >= CHAT_MAX_FILES) {
            onNote(`At most ${CHAT_MAX_FILES} attachments per turn.`);
            break;
          }
          if (file.size > MAX_FILE_BYTES) {
            onNote(`${file.name} exceeds the 20MB per-file limit.`);
            continue;
          }
          const key = await dedupeKey(file);
          if (ref.current.some((a) => a.key === key)) continue;
          const localId = crypto.randomUUID();
          const a: Attachment = {
            localId, name: file.name, size: file.size, file, key,
            intakeId: null, documentId: null, state: "starting", label: "Starting…", error: null,
          };
          ref.current = [...ref.current, a];
          setItems((prev) => [...prev, a]);
          void run(localId, file, sessionId);
        }
      })();
    },
    [run, onNote],
  );

  const remove = useCallback((localId: string) => {
    setItems((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  const retry = useCallback(
    (localId: string, sessionId: string) => {
      const a = ref.current.find((x) => x.localId === localId);
      if (a) void run(localId, a.file, sessionId);
    },
    [run],
  );

  const clear = useCallback(() => setItems([]), []);

  const ready = items.every((a) => a.state === "ready");
  const parts: AttachmentPart[] = items
    .filter((a) => a.state === "ready" && a.documentId && a.intakeId)
    .map((a) => ({ type: "attachment", document_id: a.documentId!, intake_id: a.intakeId! }));

  return { items, ready, parts, add, remove, retry, clear };
}
