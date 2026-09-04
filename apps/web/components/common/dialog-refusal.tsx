"use client";

// CB-AE2E-004, second half: WHERE a refused door's message renders.
//
// Every governed door dialog in this app closed the moment its confirm click
// SETTLED, refusal included, and the refusal then painted in the caller's own
// persistent banner on the page behind it. Once the dialog correctly STAYS OPEN
// on a refusal (single-fire-guard.ts's widened outcome + hooks.ts's `act`
// boolean), that banner sits behind a modal backdrop and cannot be read — so the
// dialog has to carry the refusal itself, beside the fields the human is being
// asked to correct.
//
// It is the SAME paint as everywhere else (components/common/state.tsx's
// StateBanner, the code chip above the message) and the SAME law: the DB's own
// code + message VERBATIM, never re-worded, never retried. `clr` present means a
// real governed DoorRefusal; `err` alone is an operational failure (transport,
// auth, malformed) — the ladder firm/data-state.tsx and bank/action-refusal.tsx
// already use.
//
// FOCUS. A refusal that appears inside an open dialog is new, urgent content the
// human did not ask for; `role="alert"` (StateBanner's own, for the error tone)
// announces it, and moving focus to it puts a keyboard or screen-reader user AT
// the sentence rather than wherever the confirm button left them. The element is
// focusable only programmatically (`tabIndex={-1}`), so it never joins the tab
// order — WCAG 2.4.3's order is untouched.

import { useEffect, useRef } from "react";

import { StateBanner } from "@/components/common/state";
import { isDoorRefusal } from "@/lib/doors";

export type DialogRefusal = {
  /** The failure's own message text — the DB's or the wire's, verbatim. */
  err: string | null;
  /** A governed refusal's code + reason, or null for a non-governed failure. */
  clr: { code: string; reason: string | null } | null;
};

/** For the lanes whose hook keeps ONE `error: unknown` rather than the
 *  `err`/`clr` pair (lib/firm/use-async-read.ts — the opening and fixed-asset
 *  registers): classify by the typed predicate, never by message text ("spelling
 *  is not identity"). Returns `undefined` when there is nothing to show, which is
 *  exactly what the prop's absent case already renders. */
export function toDialogRefusal(error: unknown): DialogRefusal | undefined {
  if (error === null || error === undefined) return undefined;
  if (isDoorRefusal(error)) return { err: error.message, clr: { code: error.code, reason: error.reason } };
  return { err: error instanceof Error ? error.message : String(error), clr: null };
}

export function DoorDialogRefusal({
  refusal,
  attempt,
}: {
  refusal: DialogRefusal | undefined;
  /** Bumped by the wrapper on every settled confirm attempt, so a SECOND refusal
   *  carrying the identical code and message still re-announces and re-focuses —
   *  a human who corrected a field and was refused again must not be left
   *  wondering whether their click registered. */
  attempt: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const shown = refusal?.err ?? null;

  useEffect(() => {
    if (shown === null) return;
    ref.current?.focus();
  }, [shown, attempt]);

  if (shown === null) return null;
  const clr = refusal?.clr ?? null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      // Programmatically focusable only (never in the tab order), but a SIGHTED
      // keyboard user still needs to see where focus landed when the banner
      // takes it — the same ring token every focusable control here uses.
      className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
        {shown}
      </StateBanner>
    </div>
  );
}
