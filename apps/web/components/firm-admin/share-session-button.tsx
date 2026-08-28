"use client";

// share_chat_session attaches to the Clara thread surface (port-wave plan §4
// T10, §5's sharing row) — mounted in the full-screen thread's own header
// (components/clara/ClaraFullScreenThread.tsx), the escalated altitude where a
// firm-visibility decision belongs, never the compact docked rail. The
// trigger is NEVER pre-hidden on a client-side "am I the author" guess
// (lib/firm-admin/chat-sharing.ts's own header) — every viewer of a private
// session sees the control; a non-author who clicks it gets the DB's own
// CLR04, verbatim. Once shared, the DB's own idempotent contract means a
// second click accomplishes nothing new, so this renders a plain state badge
// instead of a repeatable dialog — an honest state, not a hidden door.
//
// N6 (independent review, fix-required, 2026-08-28): TWO fixes. (1) the
// initial-load failure branch used to render a generic `loadError` label
// instead of the read's own verbatim message — fixed by rendering `err`
// itself, same StateBanner shape every other T10 surface uses. (2) `err` is
// now rendered UNCONDITIONALLY, before the visibility branch — the prior
// code's early `return <Badge>` on `visibility === "firm"` sat AHEAD of the
// error check, so any standing refusal never rendered once the session read
// itself as shared. The banner and the visibility-dependent control below it
// are now independent: a standing error always shows, regardless of state.

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { loadChatSession, shareChatSession } from "@/lib/firm-admin/chat-sharing";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FirmAdminDoorDialog } from "./FirmAdminDoorDialog";

export function ShareSessionButton({ threadId }: { threadId: string }) {
  const t = useTranslations("FirmAdminCompliance.sharing");
  const { data: session, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (s) => loadChatSession(s, threadId));

  const errorBanner = err ? (
    <StateBanner tone="error" className="text-xs" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
      {err}
    </StateBanner>
  ) : null;

  if (!session) {
    // A load failure here is low-stakes (the trigger simply does not render
    // yet) and does not block the thread itself — the same "not this
    // surface's job to interrupt the conversation" reasoning as a missing
    // session id. The failure is not swallowed: it renders verbatim.
    return errorBanner;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {errorBanner}
      {session.visibility === "firm" ? (
        <Badge variant="secondary">{t("sharedBadge")}</Badge>
      ) : (
        <FirmAdminDoorDialog
          triggerLabel={t("shareTrigger")}
          title={t("shareTitle")}
          description={t("shareDescription")}
          confirmLabel={t("shareTrigger")}
          busy={busy}
          onConfirm={() => act(async () => { await shareChatSession(sessionTokenAccessor, threadId); })}
        />
      )}
    </div>
  );
}
