"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "motion-panel fixed inset-0 isolate z-50 bg-black/10 ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  scrollBody = false,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  /** H-30 — lay the popup out as header / scrolling body / pinned footer. Set it only
   *  together with a single `DialogBody` wrapping the body; see the class comment below. */
  scrollBody?: boolean;
}) {
  // P3 polish, i18n law (apps/web/AGENTS.md): the dismiss control's screen-
  // reader name was a hardcoded English "Close" in the vendored primitive —
  // the one string in this app that never went through next-intl.
  const t = useTranslations("Common");
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Contract §7 names this tier literally — "Dialog, sheet" is
          // `--duration-panel` (200ms) on the `--ease-out` entrance curve. A
          // modal is a centred, trigger-less surface, so `zoom-in-95` from
          // centre is correct here and is NOT the origin-aware treatment a
          // popover needs; it starts at 95%, never scale(0).
          //
          // Reduced motion follows §7 exactly: the SCALE is gated behind
          // `motion-safe:`, so it disappears, while `fade-in-0`/`fade-out-0`
          // stay unconditional and the opacity remains. The blanket
          // animation-killing variant this used to carry removed the fade too,
          // which the contract forbids.
          //
          // H-30 — THE HEIGHT CEILING, and why it lives HERE rather than on one call site.
          // This class string is the ONLY definition of the modal popup box in the product,
          // and it capped WIDTH twice while leaving height unconstrained. Because the popup is
          // `fixed top-1/2 … -translate-y-1/2` (a CENTRED box) a body taller than the viewport
          // overflows SYMMETRICALLY — the header runs off the top and the footer off the
          // bottom at the same time — and no ancestor scrolls (the backdrop is `fixed inset-0`
          // with no overflow of its own), so NEITHER edge is reachable. The apply-chart dialog
          // is the one that grows, because its family fieldset is DB-driven, but the class is
          // product-wide and so is the fix.
          //
          // `dvh`, not `vh`: mobile browser chrome makes `vh` the wrong unit for a footer that
          // has to stay pinned. The rows are `auto / minmax(0,1fr) / auto` so the HEADER stays
          // readable and the FOOTER stays pinned while the middle scrolls — a blanket
          // `overflow-y-auto` on the popup would scroll the footer away with its own
          // `-mx-4 -mb-4` bleed, which is the thing this exists to prevent. The middle slot
          // carries `min-h-0 overflow-y-auto` and is `DialogBody`, below. The repo already
          // applies this shape elsewhere (`ui/command.tsx`'s `max-h-72 … overflow-y-auto`,
          // `ui/dropdown-menu.tsx` and `ui/select.tsx`'s `max-h-(--available-height)`); only
          // the dialog was left out.
          "motion-panel fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 ease-out outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 motion-safe:data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95",
          // THE OPT-IN SHAPE. Three rows — header / body / footer — so the header stays
          // readable and the footer stays pinned while ONLY the middle scrolls. It is opt-in
          // and NOT the default because `{children}` is a bare grid child in every door
          // dialog in this repo and several pass SEVERAL nodes: making these rows
          // unconditional would hand row 2's `minmax(0,1fr)` to whatever the second node
          // happened to be and push the rest into implicit rows. A caller opts in by wrapping
          // its body in `DialogBody` (which carries the matching `min-h-0 overflow-y-auto`)
          // and setting this flag — the two go together, and the ceiling above protects every
          // dialog that has not adopted them yet.
          scrollBody ? "grid-rows-[auto_minmax(0,1fr)_auto]" : null,
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />
            }
          >
            <XIcon />
            <span className="sr-only">{t("close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

/** H-30 — the scrolling middle of a `scrollBody` dialog. `min-h-0` is load-bearing: a grid
 *  item's default `min-height: auto` refuses to shrink below its content, so without it the
 *  `minmax(0,1fr)` row would grow past the popup's ceiling and nothing would scroll at all. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const t = useTranslations("Common");
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {t("close")}
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
