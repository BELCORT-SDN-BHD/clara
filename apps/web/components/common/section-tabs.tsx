"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * CB-AE2E-019 — THE HALF THIS FILE USED TO DECLINE, NOW CLOSED BY THE PRIMITIVE.
 * The previous version of this header recorded the gap in its own words: it
 * declared `role="tablist"`/`role="tab"`/`aria-selected` and then said
 * "arrow-key roving focus is not implemented here… Each tab is a real tab stop,
 * which is a coherent (if plainer) keyboard model". It is not a coherent model —
 * it is the tablist ARIA contract half-kept. A screen reader that is told this is
 * a tablist announces "tab 3 of 5" and tells its user to use the arrow keys; on
 * this widget the arrow keys did nothing and Tab walked every tab instead, which
 * is exactly the mismatch WAI-ARIA's tabs pattern exists to prevent. Four
 * workbenches ship it (bank, documents, journals, registers), so the defect was
 * on four surfaces.
 *
 * The fix is `components/ui/tabs.tsx` — Base UI's Tabs, vendored through the
 * shadcn CLI at style base-nova with zero new dependencies (see that file's
 * provenance header). The primitive owns the roving tabindex, the
 * Arrow/Home/End key map, `aria-selected` and the tab/panel wiring. This file is
 * now a SKIN: the same public API (`label`/`items`/`value`/`onSelect`), the same
 * underline look, and no keyboard model of its own to get wrong. Nothing about
 * the four call sites changes.
 *
 * WHY `variant="line"` AND NOT the pill default: the `line` variant's active
 * indicator is an `::after` bar, which is the underline this widget resolved on.
 * It is repositioned onto the strip's own hairline (`after:bottom-[-1px]`
 * against the list's `border-b`) so the two read as ONE line rather than two
 * stacked ones — the job the old `-mb-px` did — and recoloured to `--primary`,
 * the token the old active state used.
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
    <Tabs
      value={value}
      // Base UI hands back the tab's own `value`, which is `T` by construction:
      // every `TabsTrigger` below is given one of `items`' values and nothing
      // else can be selected. The cast narrows the primitive's open `TabValue`
      // back to the caller's union rather than widening the caller's callback.
      onValueChange={(next) => onSelect(next as T)}
      className={cn("gap-0", className)}
    >
      <TabsList
        variant="line"
        aria-label={label}
        className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border p-0"
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="motion-fast h-auto flex-none rounded-t-md rounded-b-none px-2.5 pt-1 pb-2 after:bg-primary data-active:text-foreground group-data-horizontal/tabs:after:bottom-[-1px]"
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
