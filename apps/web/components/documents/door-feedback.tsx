import type { ReactNode } from "react";

import type { PartClr } from "@/lib/parts/hooks";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Renders a `useHydratedPart` cell's standing `err`/`clr` — the SAME idiom
 * PartRenderer.tsx uses for a `refusal` part (contract §3.2/§10): a governed CLR
 * refusal's code + message render VERBATIM, never re-worded, never hidden behind a
 * generic "something went wrong". An ordinary operational failure (no `clr`) still
 * shows its own message, just without the code chip.
 *
 * #646 — THE SHELL IS NOW `components/ui/alert.tsx`, AND THE SCOPE OF THAT IS THE POINT.
 *
 * The 64-component disposition's row 2 says an Alert is for a "persistent inline warning, read
 * error, stale data, or recovery guidance. A transient Toast cannot replace it." Until this ticket
 * the primitive had ZERO importers in `apps/web` — its only appearance anywhere was a comment in
 * `tests/focus-ring-contract.test.ts`. #646's AC6 asks for exactly that behaviour on THIS surface
 * ("inline Alert retains refusals and persistent results"), so this component — whose every
 * importer is under `components/documents/` — is where it lands.
 *
 * `components/common/state.tsx`'s `StateBanner` IS NOT REBUILT ON IT, and that is a wave ruling
 * rather than a preference: 138 files under `apps/web` reference StateBanner, across the members
 * panel, the accounting forms, the onboarding cards, close and bank. Re-basing it would be an
 * estate-wide render change riding a document ticket, and it would move
 * `tests/focus-ring-contract.test.ts:207`'s counted roster. The adoption is deliberately narrow,
 * and that test's count staying put is the proof it stayed narrow.
 *
 * THE TONE CLASSES ARE StateBanner's OWN, by value. Two boxes that mean the same thing on two tabs
 * of one product must not look different; this is the same four-role severity ladder, painted with
 * the same tokens, inside the primitive that owns `role="alert"` and the title/description/action
 * slots.
 */
export type DoorFeedbackTone = "neutral" | "info" | "warning" | "error";

const TONE_CLASS: Record<DoorFeedbackTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/30 bg-info-muted text-info",
  warning: "border-warning/30 bg-warning-muted text-warning",
  error: "border-error/30 bg-error-muted text-error",
};

export function DoorFeedback({ err, clr, action, tone = "error", title }: {
  err: ReactNode;
  clr: PartClr;
  /** A RECOVERY CONTROL, where one genuinely exists — deliberately a NODE rather than an
   *  `onRetry` callback: whether retrying can honestly answer differently depends on the failure's
   *  KIND, and this component is handed a finished sentence with the kind already gone. The caller
   *  holds the kind (`useReadErrKind`) and decides; see document-detail.tsx. */
  action?: ReactNode;
  /** #646: a PERSISTENT RESULT is the other half of the disposition's Alert row, and it is not an
   *  error. The correction band states "source revision accepted" as a standing `info` Alert on
   *  every tab, which is the same component and the same reading order as a refusal. */
  tone?: DoorFeedbackTone;
  /** An emphasised first line naming WHAT happened, when the domain draws a distinction the
   *  message text alone does not. */
  title?: ReactNode;
}) {
  if (!err) return null;
  return (
    <Alert
      // The ladder's own announcement rule, carried over from StateBanner verbatim: a failure or a
      // withheld capability INTERRUPTS; a plain state does not. `ui/alert.tsx` hardcodes
      // `role="alert"`, so the quieter tones override it back to `status` rather than announcing a
      // standing result as an interruption every time this panel re-renders.
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cn("border", TONE_CLASS[tone])}
      data-testid="door-feedback"
      data-tone={tone}
    >
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription className="text-current">{err}</AlertDescription>
      {clr ? (
        // The code sits on `bg-card` rather than inheriting the box's tint, because a tinted chip
        // on a tinted banner has no visible edge — the exact defect StateBanner's own `code` slot
        // was introduced to fix.
        <AlertDescription className="text-current">
          <span className="inline-block rounded border border-current/30 bg-card px-1.5 py-0.5 font-mono text-xs">
            {clr.code}
            {clr.reason ? ` · ${clr.reason}` : ""}
          </span>
        </AlertDescription>
      ) : null}
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}
