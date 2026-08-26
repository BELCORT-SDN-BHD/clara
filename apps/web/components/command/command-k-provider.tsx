"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { CommandPalette } from "./command-palette";

interface CommandKContextValue {
  open: boolean;
  setOpen: (value: React.SetStateAction<boolean>) => void;
}

const CommandKContext = React.createContext<CommandKContextValue | null>(null);

/**
 * Opens/closes ⌘K imperatively from anywhere under `<CommandKProvider>`
 * (e.g. an empty-state's "Press ⌘K, or click here" button). Throws outside
 * the provider — a missing mount should fail loudly at dev time, not
 * silently no-op a button that looks like it does something.
 */
export function useCommandK(): CommandKContextValue {
  const ctx = React.useContext(CommandKContext);
  if (!ctx) {
    throw new Error("useCommandK must be used within <CommandKProvider>");
  }
  return ctx;
}

/**
 * Mounts the ⌘K / Ctrl+K global command palette app-wide.
 *
 * INTEGRATION NOTE for whichever lane wires the shell layouts (this file
 * deliberately does not self-mount into `app/layout.tsx` or any
 * `app/(firm)/**‍/layout.tsx` — that edit belongs to the lane that owns the
 * shell): wrap the layout's children once, anywhere above where ⌘K should
 * be reachable —
 *
 *   import { CommandKProvider } from "@/components/command";
 *   // ...
 *   <NextIntlClientProvider>
 *     <CommandKProvider>{children}</CommandKProvider>
 *   </NextIntlClientProvider>
 *
 * One mount covers the whole app: the dialog portals to `document.body`, so
 * it does not need to sit near any particular route, and it must be inside
 * `NextIntlClientProvider` because it calls `useTranslations`.
 *
 * KEY MAP (the palette is fully keyboard-drivable end to end; no step here
 * has a mouse-only path):
 *   ⌘K / Ctrl+K   toggle open/closed, from anywhere — even while focus is
 *                 inside a text input elsewhere on the page (captured on a
 *                 window `keydown` listener with `preventDefault`, so the
 *                 browser/OS binding never fires instead).
 *   Esc           close (Base UI Dialog's built-in dismiss-on-escape).
 *   Click outside close (Base UI Dialog's built-in dismiss-on-outside-press).
 *   ↑ / ↓         move the highlighted row (native cmdk roving highlight).
 *   Enter         activate the highlighted row.
 *   Tab / Shift+Tab  Base UI's focus trap keeps focus inside the popup
 *                 while it is open; there is exactly one tab stop (the
 *                 search input) — the rows are reached by arrow keys, not
 *                 Tab, matching the native listbox pattern cmdk implements.
 *   Typing        filters Go, never hides Ask or Do (see command-palette.tsx).
 *
 * FOCUS MANAGEMENT: whatever element had focus at the moment ⌘K opened is
 * captured (`invokerRef`) and handed to the popup's `finalFocus` prop, so
 * closing — by Esc, by selecting a row, or by clicking outside — always
 * returns focus to what the user was doing before, never to `<body>`. This
 * holds however the dialog was opened (the global hotkey, or a future
 * `useCommandK().setOpen(true)` caller), because the capture lives inside
 * `setOpen` itself rather than in the hotkey handler alone.
 *
 * MOTION: deliberately NONE — open/close is instant, no fade or scale. Per
 * the vendored `animate` skill's own gate table, a keyboard-shortcut toggle
 * fired 100+ times a day is a named disqualifier ("Raycast has no open/close
 * animation — that is correct for something opened hundreds of times a
 * day"), so this composes `Dialog.Backdrop`/`Dialog.Popup` directly instead
 * of reusing `DialogContent` (which carries the fade/zoom `animate-in` classes
 * that are the right DEFAULT for occasional, non-keyboard-triggered modals —
 * kept as-is in `components/ui/dialog.tsx` for that general case). The one
 * motion decision left standing here is the row highlight inside the list,
 * which is cmdk's own instant background-color swap, not a timed transition.
 */
export function CommandKProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("CommandPalette");
  const [open, setOpenState] = React.useState(false);
  const invokerRef = React.useRef<HTMLElement | null>(null);

  const setOpen = React.useCallback((value: React.SetStateAction<boolean>) => {
    setOpenState((was) => {
      const next = typeof value === "function" ? value(was) : value;
      if (next && !was && typeof document !== "undefined") {
        invokerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isTogglePalette =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isTogglePalette) {
        return;
      }
      event.preventDefault();
      setOpen((was) => !was);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setOpen]);

  const contextValue = React.useMemo<CommandKContextValue>(
    () => ({ open, setOpen }),
    [open, setOpen],
  );

  return (
    <CommandKContext.Provider value={contextValue}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogPortal>
          <DialogPrimitive.Backdrop
            data-slot="dialog-overlay"
            className="fixed inset-0 isolate z-50 bg-black/10"
          />
          <DialogPrimitive.Popup
            data-slot="dialog-content"
            finalFocus={invokerRef}
            className={cn(
              "fixed top-[20%] left-1/2 z-50 grid w-full max-w-xl -translate-x-1/2 gap-0",
              "overflow-hidden rounded-xl bg-popover p-0 text-sm text-popover-foreground",
              "ring-1 ring-foreground/10 outline-none",
            )}
          >
            <CommandPalette onNavigate={() => setOpen(false)} />
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
    </CommandKContext.Provider>
  );
}
