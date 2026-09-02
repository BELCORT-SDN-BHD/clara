"use client";

import { useTranslations } from "next-intl";

/**
 * DS-02 (FS-9 §3, P6-3) — THE SKIP LINK, the missing half of a landmark set
 * that was otherwise already built.
 *
 * WHAT WAS ACTUALLY MISSING. The conformance pass found the landmark half
 * present (`<nav>`/`<aside>`/`<header>`/`<main>` all render) and the bypass
 * half absent: a keyboard user entering a firm page had to Tab through the
 * whole sidebar — the product name, five nav links, the admin sub-list and the
 * logout button — before reaching the page's first control, on EVERY
 * navigation. WCAG 2.4.1 (Bypass Blocks, level A) is exactly that complaint.
 *
 * WHERE IT IS MOUNTED, AND WHERE IT DELIBERATELY IS NOT. It is rendered once,
 * as the first focusable element of `app/(firm)/layout.tsx` — the only route
 * group with a repeated block of navigation to bypass. It is NOT rendered in:
 *   - `app/(entry)/layout.tsx`, whose only content above the card is
 *     `<BrandLockup />`, a non-focusable wordmark. A skip link there would add
 *     a focus stop that skips zero elements — noise, not a bypass.
 *   - `app/(full)/layout.tsx`, a bare passthrough whose pages own a single
 *     header with a back control; there is no repeated block to skip.
 * Both dispositions are recorded rather than left as an unexplained absence.
 *
 * WHY IT TARGETS THE CONTENT COLUMN AND NOT `PageShell`'s `<main>`. `PageShell`
 * is the one page frame by convention, but it is a convention: a page that
 * renders its own markup instead would leave `#main-content` undefined and the
 * link would silently do nothing — a bypass that fails open. The anchor is
 * therefore the (firm) shell's own content column, which exists for every route
 * in the group by construction, and which sits immediately outside the `<main>`
 * landmark the page renders inside it. `tabIndex={-1}` on that column is what
 * makes it a real focus target (a bare `id` moves the browser's scroll position
 * but not, in several engines, the focus — the next Tab would resume from the
 * skip link and land back in the sidebar).
 *
 * The visible treatment is the house focus idiom, not a bespoke one: hidden to
 * sighted users until focused (`sr-only` -> `focus:not-sr-only`), then a normal
 * focusable control on the shell ground. No `outline-none`, so it draws
 * globals.css's base `:focus-visible` outline at the solid --focus token.
 */
export function SkipLink() {
  const t = useTranslations("FirmShell");
  return (
    <a
      href="#main-content"
      className="sr-only rounded-lg bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-md focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
    >
      {t("skipToContent")}
    </a>
  );
}
