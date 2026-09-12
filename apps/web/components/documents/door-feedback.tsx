import type { ReactNode } from "react";

import type { PartClr } from "@/lib/parts/hooks";

import { StateBanner } from "@/components/common/state";

/**
 * Renders a `useHydratedPart` cell's standing `err`/`clr` — the SAME idiom
 * PartRenderer.tsx uses for a `refusal` part (contract §3.2/§10): a governed CLR
 * refusal's code + message render VERBATIM, never re-worded, never hidden behind a
 * generic "something went wrong". An ordinary operational failure (no `clr`) still
 * shows its own message, just without the code chip.
 *
 * P3 polish: the shell is now components/common/state.tsx's <StateBanner>, which
 * both makes this identical to every other refusal in the product AND fixes the
 * chip — it was `bg-error-muted` text sitting on an `bg-error-muted` card, i.e. a
 * chip with no visible edge at all, everywhere a CLR code appeared here.
 */
export function DoorFeedback({ err, clr, action }: {
  err: string | null;
  clr: PartClr;
  /** A RECOVERY CONTROL, where one genuinely exists — the StateBanner slot this component had
   *  never populated, which is why nothing anywhere in the documents surface offered a Retry on a
   *  failed read while `useHydratedPart` had exposed `reload` all along. Deliberately a NODE rather
   *  than an `onRetry` callback: whether retrying can honestly answer differently depends on the
   *  failure's KIND, and this component is handed a finished sentence with the kind already gone.
   *  The caller holds the kind (`useReadErrKind`) and decides; see document-detail.tsx. A caller
   *  that passes nothing renders exactly what it rendered before. */
  action?: ReactNode;
}) {
  if (!err) return null;
  return (
    <StateBanner
      tone="error"
      code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}
      action={action}
    >
      {err}
    </StateBanner>
  );
}
