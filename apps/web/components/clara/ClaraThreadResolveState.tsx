"use client";

// THE FOUR STATES A THREAD-LESS RAIL CAN BE IN, in one place.
//
// Extracted from ClaraThreadView.tsx the way PartSummaryCard was extracted from
// PartRenderer: these arms are a cohesive unit — every one of them is a fork on
// `threadId === null`, and together they are the complete answer to "the rail has no
// conversation to show, why not". Keeping them inline pushed that component past the
// 500-line ceiling, and a state ladder is exactly the kind of thing worth reading on
// its own.
//
// THE LADDER, and why the order is the order:
//   1. NOT SIGNED IN — a STATE, not a fault (P3 polish: it reads `info` here exactly as
//      it does on every other surface, and boxing it separates a SYSTEM message from a
//      CONVERSATION message inside a log where both are otherwise just paragraphs).
//   2. A REAL RESOLVE FAILURE — the read was attempted and failed; `error` tone.
//   3. STILL READING — and ONLY while the read is genuinely in flight.
//   4. READ, AND THERE IS NO CONVERSATION HERE YET (裁-117) — a state that did not
//      exist until creation stopped being a mount side effect
//      (lib/clara/useActiveThread.ts's header: the old effect minted a permanent,
//      un-archivable `chat_sessions` row per client visited). It gets an OFFER. Under
//      the pre-fix condition it would have rendered the loader forever, which is the
//      never-settling shape 裁-132 and the P6-5 stranded-rail fix both exist to remove.
//
// State 4 needs a creator to offer. The full-screen mount point passes none — that
// route arrives with a concrete id from the URL and has nothing to create — so it
// falls to an honest error rather than to a control that could not do anything.

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { LoadingState, StateBanner } from "@/components/common/state";

export function ClaraThreadResolveState({
  resolveError,
  resolving,
  onCreateThread,
  creatingThread,
}: {
  resolveError: string | null;
  resolving: boolean;
  onCreateThread?: () => Promise<string | null>;
  creatingThread: boolean;
}) {
  const t = useTranslations("Clara.thread");

  if (resolveError === "not signed in") return <StateBanner tone="info">{t("signInRequired")}</StateBanner>;
  if (resolveError) return <StateBanner tone="error">{t("loadError", { message: resolveError })}</StateBanner>;
  if (resolving) return <LoadingState>{t("resolving")}</LoadingState>;
  if (!onCreateThread) return <StateBanner tone="error">{t("noThreadUnavailable")}</StateBanner>;

  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <p className="text-muted-foreground">{t("noThread")}</p>
      <Button type="button" size="sm" disabled={creatingThread} onClick={() => void onCreateThread()}>
        {creatingThread ? t("creatingThread") : t("newThread")}
      </Button>
    </div>
  );
}
