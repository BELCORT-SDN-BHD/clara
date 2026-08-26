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
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";

export function ClaraFullScreenThread({
  threadId,
  returnHref,
  auth = sessionTokenAccessor,
}: {
  threadId: string;
  returnHref: string;
  auth?: SessionTokenAccessor;
}) {
  const t = useTranslations("Clara.fullScreen");

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border p-3">
        <Link href={returnHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("collapse")}
        </Link>
        <span className="text-sm font-semibold text-clara">{t("title")}</span>
        <span className="w-16" aria-hidden />
      </header>
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1">
        <ClaraThreadView auth={auth} threadId={threadId} variant="full" />
      </div>
    </div>
  );
}
