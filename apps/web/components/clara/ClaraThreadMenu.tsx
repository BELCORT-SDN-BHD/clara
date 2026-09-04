"use client";

// The rail's thread menu (裁-117, the owner's "没有 clear/add/delete thread").
//
// WHAT IT BUILDS, AND WHY EXACTLY THIS MUCH. The census behind this train found that
// NEW and SWITCH were pure UI gaps — both wires have been live since 0006 — while
// CLEAR is structurally out and ARCHIVE is a genuine backend gap:
//
//   NEW      `POST /api/chat/sessions` is live (packages/runtime/src/chatRoutes.ts:137-157)
//            and `createSession` is exported (lib/clara/api.ts:181-192). Its only caller
//            in the app was a MOUNT EFFECT — see lib/clara/useActiveThread.ts's header
//            for why that had to stop being one. This is the act that replaced it.
//   SWITCH   `GET /api/chat/sessions` already returns up to 200 visible sessions
//            (chatRoutes.ts:160-178) and the resolver threw all but the newest away.
//            The list below is that already-fetched result, filtered to the caller's
//            own threads at this altitude.
//   CLEAR    NOT BUILT, AND NEVER TO BE BUILT. `clara.chat_messages` is append-only and
//            `_tf_chat_session_update` (0006_runtime_core.sql:378) raises CLR08 'chat
//            sessions are not deleted' on DELETE. The transcript is the audit record;
//            reverse-not-delete is the law, and a "clear" control would be a control
//            for a door that must never exist. There is deliberately no affordance for
//            it here, not even a disabled one.
//   ARCHIVE  A REAL BACKEND GAP, named honestly. The table has no `archived_at` and the
//            only lawful mutation is `clara.share_chat_session` (0006:894), so there is
//            no door to call. It gets a NotBuiltNote — the product's one "named, not
//            delivered" signal — rather than a control that would refuse.
//
// 裁-117 rules one thread per altitude as the beta shape "with a small firm-threads
// list later", so this is a SWITCHER over the caller's own threads, not a sidebar and
// not a firm browser. A colleague's firm-shared thread is excluded by
// `ownSessionsForAltitude`, not by this component — see that function's own note.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { businessDateTime } from "@/lib/business-date";
import type { ThreadRow } from "@/lib/clara/useActiveThread";
import { cn } from "@/lib/utils";

export function ClaraThreadMenu({
  id,
  threads,
  activeThreadId,
  creating,
  resolving,
  onCreate,
  onSelect,
  onDismiss,
}: {
  id: string;
  threads: readonly ThreadRow[];
  activeThreadId: string | null;
  creating: boolean;
  /** TRUE while the session read is in flight. New is refused for the duration: a create
   *  that races the first read has no list to land in, and the row it mints can never be
   *  archived or deleted if it goes astray. */
  resolving: boolean;
  onCreate: () => void | Promise<void>;
  onSelect: (threadId: string) => void;
  /** Escape, and the panel's own request to close. The caller returns focus to the
   *  toggle — see `ClaraRail`'s handler for why the ref lives there. */
  onDismiss: () => void;
}) {
  const t = useTranslations("Clara.rail.menu");
  const panelRef = useRef<HTMLDivElement>(null);

  // ESCAPE CLOSES IT. A disclosure that traps a keyboard user with no way back is the
  // defect; the listener is on the panel rather than the document so it cannot swallow
  // an Escape meant for a dialog opened over it.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  const createDisabled = creating || resolving;
  return (
    <div ref={panelRef} id={id} className="enter-content flex flex-col gap-2 border-b border-border bg-card p-2">
      <Button type="button" size="xs" variant="outline" className="w-full" disabled={createDisabled} onClick={() => void onCreate()}>
        {creating ? t("creating") : t("newThread")}
      </Button>

      {threads.length > 0 ? (
        <>
          <p className="text-xs font-medium text-muted-foreground">{t("switchHeading")}</p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {threads.map((thread) => {
              const current = thread.id === activeThreadId;
              return (
                <li key={thread.id}>
                  <Button
                    type="button"
                    size="xs"
                    variant={current ? "secondary" : "ghost"}
                    // `aria-current="true"`, not a visual-only highlight: which thread
                    // the rail is showing is the one fact a screen-reader user cannot
                    // get from anywhere else in this panel.
                    aria-current={current ? "true" : undefined}
                    className={cn("w-full justify-start text-left", current && "font-medium")}
                    onClick={() => onSelect(thread.id)}
                  >
                    <span className="min-w-0 truncate">
                      {/* The DB's own title when it has one. `title` is nullable and
                          the runtime never writes one (chatRoutes.ts:145 inserts
                          `body.title ?? null` and nothing sends a title), so the
                          fallback is the row's own `created_at` — a fact, not a
                          label this UI invented for the conversation.
                          A NULL `created_at` is a row the hook is holding because the
                          read that would confirm it did not come back (`ThreadRow`'s own
                          note). There is no time to show and none is invented; the row
                          says what it is until the next read replaces it. */}
                      {thread.title ?? (thread.created_at === null
                        ? t("untitledNew")
                        : t("untitled", { started: businessDateTime(thread.created_at) }))}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("noThreads")}</p>
      )}

      <NotBuiltNote className="text-xs">
        <span className="font-medium">{t("archiveHeading")}</span>
        <span>{t("archiveNote")}</span>
      </NotBuiltNote>
    </div>
  );
}
