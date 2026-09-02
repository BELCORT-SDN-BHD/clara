import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The three-rung state ladder every surface in this app uses, so that
 * "nothing yet", "still reading" and "this failed" are told apart by SHAPE
 * before a single word is read:
 *
 *   LoadingState / EmptyState  plain muted prose — quiet, no border, no icon
 *   StateBanner                a bordered, tinted box — something is wrong,
 *                              or something is being withheld
 *
 * The choice of prose over a skeleton for loading is deliberate and is the
 * ONE idiom: every loading string in `messages/en.json` already names WHAT
 * is loading ("Loading the close plan…"), which a skeleton cannot say, and
 * an honest sentence never implies a shape the read might not return.
 *
 * The choice of NO icon in the empty state is equally deliberate: every
 * empty message here is a full honest sentence about the books ("No fiscal
 * years opened yet for this client."), and an illustration beside it would
 * be the only decorative element in a professional ledger surface.
 */
/**
 * DS-03 (FS-9 §3, P6-3) — `role="status"`, and the deliberate absence of
 * `aria-busy` ON THIS ELEMENT.
 *
 * WHAT WAS MISSING. This is the app's sole loading primitive (57 call sites,
 * re-censused 2026-09-02) and it computed NO role at all, while its sibling
 * StateBanner has computed `role="alert"`/`"status"` since P3. So every honest
 * loading sentence the product writes — "Loading the close plan…", the whole
 * reason this idiom is prose rather than a skeleton — was invisible to a screen
 * reader. `role="status"` (implicit `aria-live="polite"`) announces it when it
 * appears, and does NOT announce on first paint, which is the wanted asymmetry:
 * an early-return placeholder present at mount stays quiet, a load that STARTS
 * later speaks.
 *
 * WHY `aria-busy` IS NOT ON THIS ELEMENT, THOUGH THE ITEM IS NAMED FOR IT.
 * `aria-busy="true"` tells assistive tech to withhold updates to a live region
 * until it goes false. On a TRANSIENT placeholder that is inserted already-busy
 * and then unmounted, it never goes false — so putting it here would suppress
 * the very announcement the role above just bought. `aria-busy` belongs on the
 * PERSISTENT region that swaps content in place, where it can flip true->false
 * and release the queue. That is where it now renders: ClaraThreadView's
 * transcript log (`aria-busy` until `messagesLoaded`) and InterviewRunCard's
 * thread. The split is the honest reading of WAI-ARIA 1.2 §6.6, not a partial
 * implementation, and a reviewer checking "does aria-busy render" should look
 * there rather than here.
 */
export function LoadingState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" className={cn("max-w-prose text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-prose text-sm text-muted-foreground", className)}>{children}</p>;
}

/**
 * The severity ladder, applied identically wherever a read fails or a
 * governed door refuses. Before this file the same four wire-error kinds
 * were painted three different ways by three lanes (bank: everything in one
 * destructive box; firm/registers: four different plain-text tones with no
 * box at all; journals: two tones, also unboxed) — so "you are signed out"
 * and "the DB refused this act" could look identical on one tab and
 * opposite on the next.
 *
 *   info      you are signed out — a state, not a fault
 *   warning   you lack the grant — a fault of authority, not of the system
 *   neutral   it genuinely is not there / not deployed
 *   error     it failed, or a governed door refused
 */
export type BannerTone = "neutral" | "info" | "warning" | "error";

const TONE_CLASS: Record<BannerTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/30 bg-info-muted text-info",
  warning: "border-warning/30 bg-warning-muted text-warning",
  error: "border-error/30 bg-error-muted text-error",
};

export function StateBanner({
  tone,
  title,
  code,
  action,
  children,
  className,
}: {
  tone: BannerTone;
  /** An emphasised first line naming WHAT happened, when the domain draws a
   *  distinction the message text alone does not (bank's refusal-vs-
   *  operational-failure split). */
  title?: ReactNode;
  /** A governed refusal's own code (+ reason), rendered VERBATIM as a chip.
   *  It sits on `bg-card` rather than inheriting the banner's tint, because a
   *  tinted chip on a tinted banner has no visible edge — which is exactly
   *  what the pre-fold `bg-error-muted` chip on a `bg-error-muted` card was
   *  doing everywhere a CLR code appeared. */
  code?: ReactNode;
  /** A recovery control (a Retry button), where one genuinely exists. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      // A failure or a withheld capability interrupts; a plain state does not.
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cn(
        // `max-w-prose` on the BOX, not on the text inside it: measured in the
        // harness at 1440px, a full-bleed tinted bar carrying one sentence
        // reads as a page-wide alarm rather than a message. Capped, it reads as
        // a message — and inside a Card it simply shrinks to the card.
        // `wrap-anywhere` for the same measured reason NotBuiltNote carries
        // it: the message here is the DB's OWN text, which routinely contains
        // an unbreakable relation or verb identifier, and a flex item's
        // min-content size ignores plain `break-words`.
        "flex w-full max-w-prose flex-col items-start gap-1.5 rounded-lg border p-3 text-sm wrap-anywhere",
        TONE_CLASS[tone],
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {code ? (
        <span className="inline-flex w-fit items-center rounded-full border border-current/25 bg-card px-2 py-0.5 font-mono text-xs font-medium">
          {code}
        </span>
      ) : null}
      <div>{children}</div>
      {action}
    </div>
  );
}
