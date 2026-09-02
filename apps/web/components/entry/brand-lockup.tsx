import Image from "next/image";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** The one place the Ledger Fold file name is written. Exported so the census
 *  cell in `brand-identity.test.tsx` can walk every `next/image` src in the
 *  tree against a roster rather than against a re-typed string. */
export const LEDGER_FOLD_MARK_SRC = "/brand/logo/clarabook-ledger-fold-brand-ink-v1.0.png";

/**
 * The identity lockup above the entry card — 裁-2 4a's "white card on the
 * identity canvas", of which this is the identity half. R1 (2026-08-27
 * evening) adopted the **Ledger Fold** as the platform mark paired with the
 * ClaraBook wordmark; P6-6 (裁-14) ports it. Rendered on the five (entry)
 * faces only, by `app/(entry)/layout.tsx`.
 *
 * WHAT CHANGED HERE, AND WHY THE OLD REASON NO LONGER HOLDS. This file used to
 * say "NO IMAGE, ON PURPOSE … the product ships no logo asset in `public/`
 * (only the Source Sans/Serif faces), and inventing one here would be this
 * component asserting a brand mark nobody approved." That was true and is now
 * spent: `public/brand/logo/` holds the approved mark, ported byte-identical
 * (md5 `e1be5d73f60bf1f488537864bd65fb35`) from the design authority's own
 * shipped app asset, `clarabook-frontend@a770988`
 * `g5-design-system/clarabook-design-system/public/brand/logo/`. Nothing is
 * invented; the asset is the authority's, unmodified.
 *
 * THE WORDMARK IS NOW SANS, NOT SERIF. The serif setting was the same
 * stand-in: with no mark to pair with, the wordmark carried the identity
 * alone. The ratified contract §8 is explicit — "the wordmark is one
 * continuous lowercase word in Source Sans 3 Semibold" — so the finish moves
 * TOWARD it: `font-sans font-semibold` resolves to Source Sans 3 Semibold
 * (`app/layout.tsx` loads that exact face at weight 600).
 *
 * THE CASE QUESTION IS RULED — 裁-137 (owner, 2026-09-02). §8's "lowercase"
 * clause and R1's "ClaraBook" do NOT collide: **§8 governs the wordmark's
 * GLYPHS, R1 governs the product NAME**, and the design authority ships both
 * at once (its own prototype sets the lockup lowercase letter-by-letter in
 * `src/components/brand-lockup.jsx:15-32` while writing "ClaraBook" in prose
 * throughout, e.g. `src/screens/system-access.jsx:54`). So every prose
 * occurrence is "ClaraBook", and the shared `Brand.productName` string stays
 * consolidated — the ruling explicitly does not cost the one-string-two-
 * consumers arrangement.
 *
 * APPLIED — 裁-137's glyph clause binds THIS component, not only the design
 * authority's artwork (owner, confirmed 2026-09-02: 字标小写 for the product's
 * wordmark, which is the `<span>` below). The span carries `lowercase`.
 *
 * THE RECORD OF WHY IT IS A TRANSFORM AND NOT A SECOND STRING. Before the
 * ruling this span printed `Brand.productName` with no case transform, so its
 * glyphs were the string's own — "ClaraBook", title-case. The obvious fix
 * would have been a second, lowercase string; `lowercase` is better because
 * `text-transform` changes only the RENDERED glyphs. The DOM text and the
 * accessible name stay "ClaraBook", which is what lets ONE shared
 * `Brand.productName` serve both this lockup and the firm shell's prose —
 * exactly the consolidation 裁-137 said the ruling must not cost. It is also
 * why `getByText("ClaraBook", { exact: true })` in `e2e/identity-finish.spec.ts`
 * and the firm-shell prose assertion both keep matching unchanged.
 *
 * The class is PINNED by two cells, because a utility class is the easiest
 * thing in this file to drop by accident: `brand-identity.test.tsx` asserts it
 * is on the wordmark span, and the browser leg measures the COMPOSITED
 * `text-transform` on the live element plus the DOM text beside it — the
 * class-name cell would survive Tailwind failing to emit the rule, and the
 * computed-style cell would not.
 *
 * DELIBERATELY NOT A HEADING (unchanged). The same lockup renders on all six
 * entry faces, so making it the `<h1>` would give login, signup,
 * invite-accept, forgot-password, password-reset and the holding page one
 * identical page title and demote each face's real subject (`CardTitle`)
 * below it. A screen-reader user tabbing between these URLs would hear
 * "ClaraBook" six times and learn nothing. It is a `<p>`; the FACE owns its
 * `<h1>`.
 *
 * THE MARK IS DECORATIVE, and that is the accessible reading, not a shortcut:
 * the wordmark beside it is real text saying the same word, so an alt would
 * make a screen reader announce the product name twice. The design authority's
 * own lockup does exactly this (`alt=""` + `aria-hidden`). The state/
 * accessibility contract's rule — "the Ledger Fold and mascot are identity
 * images, not substitutes for state text" — is what makes an empty alt correct
 * here rather than lossy: the mark carries no state.
 *
 * `unoptimized`, DELIBERATELY. `wrangler.jsonc` declares no `IMAGES` binding,
 * so on the deploy target `/_next/image` returns the original bytes anyway
 * (the adapter's own documented fallback), and `next start` has no `sharp` in
 * this workspace to optimize with. The prop says at the call site what the
 * runtime would do silently, and keeps `next/image`'s real contribution here —
 * intrinsic width/height, so the lockup reserves its box and never shifts the
 * card below it.
 *
 * `loading="eager"` RATHER THAN `priority`, and the difference is named rather
 * than glossed. `priority` does two things: it sets `fetchpriority="high"` and
 * it emits a `<link rel="preload">` through `ReactDOM.preload()`. That second
 * half cannot run under the node:test harness — `preload` reaches for a real
 * document dispatcher and throws inside the render, which took this surface's
 * whole a11y scan down (bisected on this branch: the same component with
 * `priority` fails all four cells, with `loading="eager"` passes all four).
 * What is actually given up is small and measurable: a preload hint for a
 * 43KB same-origin PNG that is already in the initial HTML, where the
 * browser's own preload scanner finds it in the same pass. What is kept is the
 * part that matters — the mark is fetched EAGERLY, never lazily, so it is not
 * deferred below an entry card that is barely a viewport tall.
 *
 * `enter-welcome` is §7's "Rare first welcome only" tier (220ms, opacity +
 * 4px), on its ONE shared component rather than copied into six faces. It is a
 * `@starting-style` first-paint transition, so it cannot loop or replay, and
 * `globals.css` carries its `prefers-reduced-motion` arm beside the other two.
 *
 * `text-brand` on `--identity-canvas` is a gated pair:
 * `brand-on-identity-canvas` in `scripts/check-token-contrast.mjs`, measured
 * 11.010 against a 4.5 bar. The mark's own ink is inside the PNG and faces no
 * text-contrast bar.
 */
export function BrandLockup({ className }: { className?: string }) {
  const t = useTranslations("Brand");

  return (
    <p className={cn("enter-welcome inline-flex items-center gap-2.5", className)}>
      <Image
        alt=""
        aria-hidden="true"
        className="size-8 object-contain"
        height={32}
        loading="eager"
        src={LEDGER_FOLD_MARK_SRC}
        unoptimized
        width={32}
      />
      {/* `lowercase` is 裁-137's glyph half — see this file's header. It is a
          text-transform, so the DOM text and the accessible name stay
          "ClaraBook" while the wordmark SETS lowercase, which is what lets one
          shared string serve both the lockup and the firm shell's prose. */}
      <span className="font-sans text-2xl font-semibold tracking-tight text-brand lowercase">
        {t("productName")}
      </span>
    </p>
  );
}
