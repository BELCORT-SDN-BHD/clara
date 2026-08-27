import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A native `<select>` wearing the same clothes as `components/ui/input.tsx`.
 *
 * Seven call sites across Bank and Journals had each hand-copied a partial
 * subset of Input's class string — `h-8 rounded-lg border border-input
 * bg-transparent px-2.5 text-sm` here, the same thing with `px-2` there —
 * and NONE of them carried Input's focus ring, so a select tabbed to with
 * the keyboard fell through to the browser/global outline while the text
 * field beside it drew the product's 3px halo. Two focus looks, one form.
 *
 * It stays a real `<select>` deliberately: the shadcn Select primitive
 * renders a button plus a portalled listbox, which is a different keyboard
 * and mobile experience, and this build's component tests reach for
 * `tagName === "SELECT"`. Width is NOT defaulted — every call site already
 * carries its own (`w-full`, `flex-1`, or intrinsic), and stamping one here
 * would silently re-lay-out the flex rows they sit in.
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "motion-fast h-8 min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
