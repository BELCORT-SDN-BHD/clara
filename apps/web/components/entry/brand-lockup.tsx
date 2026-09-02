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
 * ONE RESIDUAL, SURFACED RATHER THAN ABSORBED: §8 says *lowercase*; owner
 * ruling R1 says the user-facing name is "**ClaraBook**". Case is a naming
 * decision the owner already made, and a lane does not re-decide it against a
 * typographic spec — so the ruling's capitalisation ships and the divergence
 * is named in the PR body for the owner, per constraint 1.
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
      <span className="font-sans text-2xl font-semibold tracking-tight text-brand">
        {t("productName")}
      </span>
    </p>
  );
}
