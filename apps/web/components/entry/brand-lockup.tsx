import { cn } from "@/lib/utils";

/**
 * The identity mark above the entry card — 裁-2 4a's "white card on the
 * identity-canvas", of which this is the identity half.
 *
 * DELIBERATELY NOT A HEADING. It renders the same wordmark on all five entry
 * faces, so making it the `<h1>` would give login, signup, invite-accept and the
 * holding page one identical page title and leave each face's real subject
 * (`CardTitle`) demoted below it. A screen-reader user tabbing between these
 * five URLs would hear "ClaraBook" five times and learn nothing. It is a `<p>`
 * with the wordmark styled as display type; the FACE owns its own `<h1>`.
 *
 * NO IMAGE, ON PURPOSE. The product ships no logo asset in `public/` (only the
 * Source Sans/Serif faces under `public/brand/fonts/`), and inventing one here
 * would be this component asserting a brand mark nobody approved. The wordmark
 * is set in the serif display face the token contract already ratifies, which is
 * the identity treatment this repo actually owns today.
 *
 * `text-brand` on `--identity-canvas` is a gated pair: `brand-on-identity-canvas`
 * in `scripts/check-token-contrast.mjs`, measured 11.010 against a 4.5 bar.
 */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <p className={cn("font-serif text-2xl tracking-tight text-brand", className)}>
      ClaraBook
    </p>
  );
}
