"use client";

// The Clara composer's attach affordance (rail AND full screen — one component, one
// mount point, exactly like the composer it sits in).
//
// IT MINTS NO UPLOAD PATH. Every byte rides the SAME seam the Documents workbench
// uses: `lib/documents/useUploadQueue.ts` → `lib/documents/intake.ts`'s
// begin/PUT-bytes/finalize → the same-origin proxy `app/api/runtime/[...path]/route.ts`
// → the runtime's `/api/intake/documents` legs. The only per-caller difference is the
// two fields the runtime itself keys on: `origin: "chat"` plus the `session_id` it
// authorises against (packages/runtime/src/intakeRoutes.ts:94 —
// `if (req.body?.origin === "chat") await assertSessionAccess(...)`;
// packages/runtime/lib/intake.mjs:99-102 refuses any other pairing 400). The proxy
// forwards exactly three headers and chooses the credential BY LEG; nothing here
// touches that.
//
// THE CLIENT ID IS THE ACTIVATED CLIENT'S, never a body-supplied one. The intake body
// carries no client identity at all (see the `body` literal in intake.ts) — filing is a
// SEPARATE governed act, `fileToClient(document_id, clientId, source)`, and `clientId`
// comes from the workspace this thread is mounted under, as a prop. The DB agrees from
// the other side: `clara._tf_validate_chat_attachments`
// (packages/db/migrations/0007_document_pipeline.sql:601-633) admits an attachment part
// only when the intake is the TASK AUTHOR's own, in the task's own firm, adopted, and
// with a matching document_id — a client id in the request body would buy nothing and
// is not sent.
//
// FIVE PER TURN, refused locally and honestly. The same trigger raises CLR10 above five
// (`if v_count>5 …`), and `packages/runtime/src/chatRoutes.ts:186-206` maps CLR10 to
// NOTHING — it falls through to a bare 500. Refusing the sixth file here is the honest
// spelling of a wall that already exists, not a client-side re-derivation of it: the
// wall still stands, and this only stops us walking into it with a 500.

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import { queueStateLabelKey } from "@/lib/documents/copy";
import { useUploadQueue, type QueueRejection } from "@/lib/documents/useUploadQueue";
import type { AttachmentPart } from "@/lib/parts/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** `clara._tf_validate_chat_attachments`'s own bound (0007_document_pipeline.sql:617),
 *  and the number the old surface capped at too (apps/dashboard/app/shared/intake.ts:99
 *  `CHAT_MAX_FILES = 5`). */
export const CHAT_MAX_ATTACHMENTS = 5;

/** The queue states an item can still LEAVE on its own. Sending while one of these is in
 *  flight would silently drop a file that was about to become attachable, so they block.
 *  Every other state is terminal — `ready` contributes its part, and `error`/`failed`/
 *  `stopped` contribute nothing and never will without the human acting. Blocking on
 *  those too (fold round, review N4) bricked the composer: one failed upload left the
 *  human unable to send ANY message, plain text included, until they found the row's
 *  remove button — with a disabled Send that said nothing about why. The failed row stays
 *  visible with its typed refusal beside it, and `clearDone` does not sweep it, so the
 *  turn goes without it VISIBLY rather than silently. */
const IN_FLIGHT = new Set(["queued", "starting", "uploading", "verifying", "filing"]);

export type ComposerAttachmentState = {
  /** ONLY fully adopted-and-filed attachments — an item is a submittable part after the
   *  DB said `finalized`/`adopted` with a document_id, never after finalize's own
   *  (advisory) receipt. */
  parts: AttachmentPart[];
  /** True while any item can still become attachable — see `IN_FLIGHT`. */
  blocked: boolean;
};

type LocalNote = QueueRejection | { reason: "too_many" };

export function ComposerAttachmentControl({
  clientId,
  threadId,
  session,
  clearToken,
  disabled,
  onStateChange,
}: {
  clientId: string;
  threadId: string;
  session: SessionTokenAccessor;
  /** Bumped by the composer once a turn has been admitted — sweeps the rows that rode
   *  it. A token rather than a callback ref so the composer never has to reach into
   *  this component's queue. */
  clearToken: number;
  disabled: boolean;
  onStateChange: (state: ComposerAttachmentState) => void;
}) {
  const t = useTranslations("Clara.thread.attachments");
  const tDocuments = useTranslations("ClientDocuments");
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<LocalNote | null>(null);
  const onFiled = useCallback(() => {}, []);
  const onRejected = useCallback((rejection: QueueRejection) => setNote(rejection), []);
  const queue = useUploadQueue(clientId, session, onFiled, onRejected, {
    origin: "chat",
    sessionId: threadId,
    filingSource: "chat_attachment",
  });

  useEffect(() => {
    const parts = queue.items.flatMap<AttachmentPart>((item) => (
      item.state === "ready" && item.intakeId && item.documentId
        ? [{ type: "attachment", intake_id: item.intakeId, document_id: item.documentId }]
        : []
    ));
    onStateChange({
      parts,
      blocked: queue.items.some((item) => IN_FLIGHT.has(item.state)),
    });
  }, [queue.items, onStateChange]);

  useEffect(() => {
    if (clearToken > 0) queue.clearDone();
  }, [clearToken, queue.clearDone]);

  const atCapacity = queue.items.length >= CHAT_MAX_ATTACHMENTS;

  return (
    <div className="contents">
      {note || queue.items.length > 0 ? (
        <div className="col-span-full flex flex-col gap-1.5">
          {note ? (
            <StateBanner tone="warning" title={t("localRefusalTitle")}>
              {note.reason === "too_large"
                ? t("tooLargeLocal", { filename: note.filename, limitMb: Math.round(note.limitBytes / (1024 * 1024)) })
                : note.reason === "duplicate"
                  ? t("duplicate", { filename: note.filename })
                  : t("tooMany", { limit: CHAT_MAX_ATTACHMENTS })}
            </StateBanner>
          ) : null}
          {queue.items.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label={t("trayLabel")}>
              {queue.items.map((item) => (
                <li key={item.localId} className="enter-panel flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
                  <Paperclip aria-hidden className="size-3.5 text-muted-foreground" />
                  <span className="max-w-48 truncate font-medium text-card-foreground" title={item.name}>{item.name}</span>
                  <span className="min-w-24 flex-1 text-muted-foreground">{tDocuments(queueStateLabelKey(item))}</span>
                  {item.state === "error" || item.state === "failed" ? (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="outline"
                      aria-label={t("retry", { filename: item.name })}
                      disabled={disabled}
                      onClick={() => queue.retry(item.localId)}
                    >
                      <RotateCcw aria-hidden />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("remove", { filename: item.name })}
                    disabled={disabled}
                    onClick={() => queue.remove(item.localId)}
                  >
                    <X aria-hidden />
                  </Button>
                  {/* The intake's OWN refusal, by the status it actually sent — the three
                      the runtime can produce on the begin leg (intake.mjs:92-102 →
                      400 bad_request / 413 too_large / 415 bad_type). Anything else falls
                      through to the operational message VERBATIM, never a guessed cause. */}
                  {item.state === "error" ? (
                    <StateBanner
                      tone="error"
                      title={t("runtimeRefusalTitle")}
                      code={item.errorStatus !== null ? String(item.errorStatus) : undefined}
                      className="w-full"
                    >
                      {item.errorStatus === 413
                        ? t("runtimeTooLarge")
                        : item.errorStatus === 415
                          ? t("runtimeBadType")
                          : item.errorStatus === 400
                            ? t("runtimeBadRequest")
                            : item.error ?? t("runtimeUnknown")}
                    </StateBanner>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label={t("fileInputLabel")}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            const room = Math.max(0, CHAT_MAX_ATTACHMENTS - queue.items.length);
            setNote(files.length > room ? { reason: "too_many" } : null);
            if (room > 0) queue.add(files.slice(0, room));
          }
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("attach")}
        title={atCapacity ? t("tooMany", { limit: CHAT_MAX_ATTACHMENTS }) : t("attachHint")}
        disabled={disabled || atCapacity}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden />
        <span className="sr-only">{t("attach")}</span>
      </Button>
    </div>
  );
}
