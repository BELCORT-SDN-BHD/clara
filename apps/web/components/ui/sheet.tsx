"use client";

// PROVENANCE — vendored, not hand-written.
//
//   cd apps/web && node node_modules/shadcn/dist/index.js add sheet
//
// (the receipted local route dropdown-menu.tsx:3-26 records; `pnpm dlx
// shadcn@latest add sheet` resolves the same registry item). style `base-nova`,
// `@base-ui/react` 1.7.0, ONE file, ZERO new npm dependencies — `git diff
// package.json pnpm-lock.yaml` was empty after the add, which is the check the
// house vendoring discipline actually asks for. The CLI offered to overwrite the
// existing `button.tsx` (sheet's registry dependency); that was DECLINED, so the
// house Button is untouched.
//
// HAND EDITS, all of them, in the same commit as the add:
//
//  1. i18n (apps/web/AGENTS.md: every string routes through next-intl). The
//     vendored dismiss control shipped a hardcoded English `<span className=
//     "sr-only">Close</span>` — the SAME defect dialog.tsx:51 already fixed by
//     reading `Common.close`. Same fix, same key, so the two primitives cannot
//     drift into two spellings of one word.
//  2. The focus idiom. The vendored close button is a house `<Button>`, which
//     already carries the 70% ring; nothing to recut here. Recorded so the next
//     reader knows it was checked rather than missed.
//  3. `dark:` census: ZERO occurrences in the emitted file (light-theme-only,
//     owner ruling Q4) — nothing to strip. Recorded as a measurement, not an
//     assumption.
//  4. The transition duration was the vendored literal `duration-200`. Replaced
//     with `motion-panel`, the token utility (`--motion-duration-panel`, token
//     contract §7's "Dialog, sheet, Clara dock reflow" tier — this primitive is
//     literally the "sheet" in that sentence). No ad-hoc durations
//     (apps/web/AGENTS.md motion law). The backdrop's `duration-150` became
//     `motion-fast` for the same reason.
//  5. REDUCED MOTION, and this one was MEASURED in the built stylesheet rather
//     than assumed. The vendored popup slides in and out on all four sides via
//     `data-[side=…]:data-starting-style:translate-…` / `…data-ending-style:…`,
//     and those compile UNCONDITIONALLY: in
//     `.next/static/chunks/*.css` the rule
//     `.data-\[side\=left\]\:data-ending-style\:translate-x-\[-2\.5rem\][data-side=left][data-ending-style]`
//     sits inside `@layer utilities` with NO enclosing at-rule at all, so it ran
//     for a user who had asked the system for less motion. `app/globals.css`'s
//     own PORT-DRIFT note is the law here — "each motion utility carries its own
//     `@media (prefers-reduced-motion: reduce)` arm that drops MOVEMENT and keeps
//     the fade" — and its enumeration of conforming families did not yet include
//     this one, because this file post-dates it. All eight side translates are
//     now `motion-safe:` (which compiles to
//     `@media (prefers-reduced-motion: no-preference)`), so under `reduce` the
//     panel keeps its opacity fade and simply does not travel. The enumeration in
//     globals.css is trued to five families in the same commit.
//
// WHY IT IS HERE: CB-AE2E-019's firm-rail drawer. Below `lg` the 224px sidebar
// stops being a row participant and becomes this sheet — and the focus trap, the
// Escape dismissal and the `finalFocus` return come from Base UI's Dialog rather
// than being hand-rolled a fourth time in this repo.

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "motion-fast fixed inset-0 z-50 bg-black/10 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  const t = useTranslations("Common");
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "motion-panel fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t motion-safe:data-[side=bottom]:data-ending-style:translate-y-[2.5rem] motion-safe:data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r motion-safe:data-[side=left]:data-ending-style:translate-x-[-2.5rem] motion-safe:data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l motion-safe:data-[side=right]:data-ending-style:translate-x-[2.5rem] motion-safe:data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b motion-safe:data-[side=top]:data-ending-style:translate-y-[-2.5rem] motion-safe:data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">{t("close")}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-header" className={cn("flex flex-col gap-0.5 p-4", className)} {...props} />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
