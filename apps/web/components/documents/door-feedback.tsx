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
export function DoorFeedback({ err, clr }: { err: string | null; clr: PartClr }) {
  if (!err) return null;
  return (
    <StateBanner
      tone="error"
      code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}
    >
      {err}
    </StateBanner>
  );
}
