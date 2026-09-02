import Image from "next/image";
import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";

/** The one place the mascot file name is written. Exported so the census cell
 *  in `brand-identity.test.tsx` can walk every image reference in the tree
 *  against a roster instead of a re-typed string — "spelling is not identity"
 *  applies to an asset path too. */
export const CLARA_MASCOT_SRC = "/brand/clara/clara-quiet-clerk-neutral-v1.0.png";

/**
 * THE CLARA WELCOME MOMENT — the mascot's only home in this app (裁-14, token
 * contract §7).
 *
 * WHERE IT MAY APPEAR, AND WHY ONLY HERE. §7's mascot paragraph and the P6-6
 * order say the same thing twice: "empty states and rare welcome moments only,
 * NEVER a loader". The design authority's prototype places it in exactly one
 * product surface — the Clara panel's welcome state, above "Good morning —
 * I'm Clara" — and nowhere else in a work surface. This component is that
 * placement and the only one; `lib/clara/welcomeState.ts` owns the gate that
 * decides when it paints, and `brand-identity.test.tsx` holds the census cell
 * that reds if a second reference to the asset appears anywhere.
 *
 * IT DOES NOT APPEAR ON THE ENTRY FACES, and that is the prototype's own
 * reading, not an omission: the entry group's identity is the Ledger Fold
 * lockup (`components/entry/brand-lockup.tsx`, R1) — the PLATFORM's mark.
 * FD-036/FD-037 make the mascot the subordinate AGENT persona and say it "must
 * not replace or resemble the Ledger Fold platform logo", so putting Clara's
 * face on the platform's front door would invert exactly the hierarchy those
 * two decisions settled.
 *
 * THE ALT IS EMPTY, AND THAT IS THE HONEST READING. The heading directly below
 * the image is the literal word "Clara", so a described alt would announce the
 * agent's name twice in a row. The state/accessibility contract's own rule
 * governs: "the Ledger Fold and mascot are identity images, not substitutes
 * for state text", and "Clara expression assets always appear with a literal
 * `Clara` label and named UI state" — the label is the heading, the named
 * state is the welcome copy, and the image adds no fact either of them
 * withholds. The design authority's own avatar and identity uses spell it the
 * same way (`alt=""`).
 *
 * `unoptimized`, for the reason `brand-lockup.tsx` records in full: no
 * Cloudflare `IMAGES` binding is declared, so `/_next/image` returns the
 * original bytes on the deploy target anyway, and the prop says so at the call
 * site. The intrinsic 80x108 box is the source's own 1001x1357 aspect, so the
 * transcript never reflows around a late-arriving image.
 *
 * `enter-welcome` is §7's 220ms "rare first welcome" tier, the one motion the
 * mascot paragraph permits ("opacity plus translateY(4px) for 220ms; never
 * loop, float, pulse, bounce, auto-blink or track the pointer"). It is a
 * `@starting-style` first-paint transition on the BLOCK, not the image, so
 * nothing here can loop, and `globals.css` carries its reduced-motion arm.
 *
 * The heading is `SectionHeader level={2}` — the house's one heading scale
 * below a page title, not a new treatment. Both mount points give it a valid
 * parent: the rail sits inside a firm page whose `PageHeader` owns the `<h1>`,
 * and the escalated route owns its own `<h1>` in `ClaraFullScreenThread`.
 */
export function ClaraWelcome() {
  const t = useTranslations("Clara.thread.welcome");

  return (
    <div className="enter-welcome flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Image
        alt=""
        aria-hidden="true"
        className="object-contain"
        height={108}
        src={CLARA_MASCOT_SRC}
        unoptimized
        width={80}
      />
      <SectionHeader className="text-center" level={2}>
        {t("title")}
      </SectionHeader>
      <p className="max-w-prose text-sm text-balance text-muted-foreground">
        {t("description")}
      </p>
    </div>
  );
}
