"use client";

// The escalated Clara thread (P2-RAIL, build order item 4) — the SAME conversation the
// rail shows, enlarged (Q2: "full-screen is the rail conversation enlarged, never a
// separate universe"). `threadId` comes straight from the URL (Q2: "URL-addressable");
// the collapse control returns to `returnHref`, the URL the rail escalated FROM,
// captured as the `?from=` query param at the moment of escalation.
//
// `auth` defaults to the blessed `sessionTokenAccessor` singleton (P2 FOLD SEAM G —
// never accepted as a REQUIRED prop from a Server Component page: a real
// `SessionTokenAccessor` is a function-bearing object and cannot cross the RSC
// boundary, so the default has to be constructed here, client-side, same as
// `ClaraRail`'s own default).

import Link from "next/link";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { ClaraThreadView } from "@/components/clara/ClaraThreadView";
import { ShareSessionButton } from "@/components/firm-admin/share-session-button";
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";

export function ClaraFullScreenThread({
  threadId,
  returnHref,
  auth = sessionTokenAccessor,
  clientId,
}: {
  threadId: string;
  returnHref: string;
  auth?: SessionTokenAccessor;
  /** T11 (port-wave plan §4 T11): threaded straight to ClaraThreadView's own
   *  `OnboardingChecklistCard` mount — set by the client-scoped escalation
   *  route (`/clients/[clientId]/clara/[threadId]`), absent from the
   *  firm-altitude one (`/clara/[threadId]`). */
  clientId?: string;
}) {
  const t = useTranslations("Clara.fullScreen");

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border p-3">
        <Link href={returnHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("collapse")}
        </Link>
        {/* F4 fix (rev-t11): this route (app/(full)/…) has NO other heading
            anywhere — "no firm sidebar/rail chrome" (this file's own
            header) — so a bare `<span>` here left the document with zero
            `<h1>`s, and T11's card `<h2>` (SectionHeader level={2}) then
            jumped straight from h0. A real `<h1>`, same visual weight
            (same classes) — no new heading primitive introduced. */}
        <h1 className="text-sm font-semibold text-clara">{t("title")}</h1>
        {/* T10 (port-wave plan §4 T10, §5's sharing row): share_chat_session
            attaches here, the escalated altitude a firm-visibility decision
            belongs at — replaces the prior bare `w-16` spacer (whose only
            job was balancing the Collapse link for visual centering; a real
            control's width varies by state, so exact centering is a polish-
            pass concern, not a correctness one). */}
        <div className="flex min-w-16 shrink-0 justify-end">
          <ShareSessionButton threadId={threadId} />
        </div>
      </header>
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1">
        <ClaraThreadView auth={auth} threadId={threadId} variant="full" clientId={clientId} />
      </div>
    </div>
  );
}
