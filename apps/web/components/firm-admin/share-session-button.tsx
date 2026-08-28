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

  if (!session) {
    // A load failure here is low-stakes (the button simply does not render)
    // and does not block the thread itself — the same "not this surface's
    // job to interrupt the conversation" reasoning as a missing session id.
    // The failure is not swallowed: it renders as a quiet inline note.
    return err ? <span className="text-xs text-muted-foreground">{t("loadError")}</span> : null;
  }

  if (session.visibility === "firm") {
    return <Badge variant="secondary">{t("sharedBadge")}</Badge>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {err ? (
        <StateBanner tone="error" className="text-xs" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      ) : null}
      <FirmAdminDoorDialog
        triggerLabel={t("shareTrigger")}
        title={t("shareTitle")}
        description={t("shareDescription")}
        confirmLabel={t("shareTrigger")}
        busy={busy}
        onConfirm={() => act(async () => { await shareChatSession(sessionTokenAccessor, threadId); })}
      />
    </div>
  );
}
