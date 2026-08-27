"use client";

import { cn } from "@/lib/utils";

/**
 * The ONE in-page section switcher.
 *
 * Three lanes shipped three of these for the same job: Journals an underline
 * bar with `aria-current`, Bank a filled-primary pill row inside a `<nav>`
 * landmark, Registers a muted pill row with `role="tablist"`. Same widget,
 * three looks and three accessibility trees.
 *
 * UNDERLINE, not pills, is the resolved look — the client workspace's own
 * tab nav (`components/client-workspace-nav.tsx`) already owns the muted
 * pill, and a SECOND rung of pills directly beneath it flattens the
 * hierarchy. The filled-primary variant is worse still: `--primary` is the
 * interaction colour, and spending it on "which section am I reading" leaves
 * a page's actual primary action with nothing louder to say.
 *
 * `role="tablist"`/`role="tab"`/`aria-selected` is the resolved semantic —
 * the strongest of the three already in the tree (Registers'), and the only
 * one that is literally true: these buttons select among panels, they do not
 * navigate. Note what this does NOT claim: arrow-key roving focus is not
 * implemented here, exactly as it was not implemented in any of the three
 * originals. Each tab is a real tab stop, which is a coherent (if plainer)
 * keyboard model, not a regression against any lane's prior behaviour.
 */
export function SectionTabs<T extends string>({
  label,
  items,
  value,
  onSelect,
  className,
}: {
  /** The accessible name for the strip itself — never the active tab's own
   *  name (the N17 defect Bank's review caught: a nav landmark labelled
   *  "Accounts" whichever tab was live). */
  label: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex flex-wrap gap-1 border-b border-border", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.value)}
            className={cn(
              // -mb-px lifts the active underline over the strip's own hairline
              // so the two read as one line, not two stacked ones.
              //
              // The focus treatment is the SHADCN RING, not the global
              // `:focus-visible` outline in globals.css: every Button, Input,
              // Textarea and Badge in this product focuses with a 3px
              // `ring-ring/50` halo, and a raw <button> falling through to a
              // hard 2px outline put two different focus looks on one page.
              // The global outline stays as the net for anything not yet a
              // primitive; it is not the idiom. This is a RECORDED
              // divergence from the token contract's own §9, not pure
              // internal consistency — see the FOCUS TREATMENT note beside
              // the identity-canvas citation in app/globals.css.
              // `focus-visible:border-ring` alongside the ring (the same
              // Input/NativeSelect idiom) lifts the indicator's own contrast
              // above WCAG 2.2 SC 1.4.11's 3:1 floor — the translucent ring
              // alone measured under it.
              "motion-fast -mb-px rounded-t-md border-b-2 px-2.5 pt-1 pb-2 text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
