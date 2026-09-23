import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// #970 — REBASED ONTO SHADCN UPSTREAM (base-nova, pinned shadcn 4.19.0). Owner
// ruling 2026-09-20 ("以shadcn为准, 他们的ai native component比较高级且uiux更好"
// — shadcn upstream is the standard; its AI-native components are more
// advanced and better UX) decided the question the ticket's Option A left
// open: `attachment` and `message-scroller` each resolve a rewrite of this
// file, and the ruling has upstream's button.tsx win the overwrite outright,
// installed through the guard's own named override
// (`CLARA_UI_ADD_OVERWRITE=1`). Only the THREE owner-ruled behaviours below
// are re-applied on top of it, with their reasoning carried over — nothing
// else. In particular the former "P3 polish" motion treatment (an explicit
// `transition-[color,background-color,border-color,box-shadow,transform,
// opacity]` list plus the `motion-fast` token, instead of upstream's own
// `transition-all`) was never one of the three named fixes, so it is NOT
// carried back: upstream's `transition-all` is what ships. Upstream's added
// `dark:` variants ride along unchanged and stay dormant, exactly like every
// other vendored file's (app/globals.css's own header: "no `.dark` block ...
// primitives keep their dark variants dormant rather than absent"). All six
// variants and all eight sizes are byte-identical to what this file already
// had before the overwrite, so there was nothing to restore on that front —
// see `tests/focus-ring-contract.test.ts` for the mechanical proof this file
// still holds the ring contract, and this file stays on
// `scripts/protected-components.json` because it again carries hand-applied
// fixes a future `shadcn add` could revert.
//
// 裁-64③ · THE OFFSET RING (P6-3), RE-APPLIED. `--ring` and `--primary` are the
// SAME hex (#1d4ed8, both `var(--interaction)` / `var(--focus)` in
// globals.css), so on a default Button the `focus-visible:border-ring` swap
// draws a #1d4ed8 border against a #1d4ed8 fill — 1.000:1, an indicator that
// is literally invisible on the product's most-used control, and no halo
// alpha can fix it because the collision is INSIDE the button, not outside.
// `ring-offset-2` + `ring-offset-background` (absent from upstream's own
// file) inserts a 2px ground-coloured gap between the fill and the halo, so
// the halo always has a light neighbour on both sides: it measures 3.574:1
// against #ffffff on the outside AND against the offset gap on the inside.
// Ruled by the owner (mohe-grill-rulings-2026-08-30.md 裁-64③, "Button focus =
// an OFFSET ring"), not chosen here. Upstream also ships the ring at `/50`;
// this repo's declared `--focus-ring-alpha` (app/globals.css) is 70%, so the
// alpha is re-cut to `/70` in the same edit — the same discipline every other
// carrier in `tests/focus-ring-contract.test.ts`'s census already holds to,
// not a fourth named fix.
//
// WHY `ring-offset-background` AND NOT A PER-GROUND VALUE: the gap has to be
// OPAQUE (Tailwind paints the offset shadow ON TOP of the ring shadow, so a
// transparent offset colour yields a solid 5px ring with no gap at all — it
// does not fall through to the real backdrop). --background is #ffffff,
// which is byte-exact on the three grounds that carry the overwhelming
// majority of Buttons (--background, --card, --popover all resolve to
// #ffffff) and differs from the next two (--shell #f7f7f5, --muted #f5f6f4)
// by at most 3/255 per channel — a 1.03:1 difference across a 2px gap, below
// the perceptual floor.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // HOVER IS /90, NOT UPSTREAM'S OWN /80, AND THAT IS AN AA FIX RATHER
        // THAN A TASTE ONE — RE-APPLIED. `--primary` (#1d4ed8) at 80% over
        // the three grounds a Button actually sits on
        // (--background/--card/--popover, all #ffffff) composites to
        // #4a71e0, which measures 4.440:1 against #ffffff 14px text — under
        // WCAG 1.4.3's 4.5 floor, on the most-used control in the product.
        // Two browser walks were parking the pointer off-screen before their
        // axe scan to avoid measuring it (`e2e/checkout-gate-walk.spec.ts`'s
        // own note recorded the finding). At 90% the composite is #3460dc =
        // 5.451:1, still visibly lighter than the resting #1d4ed8 (6.702:1)
        // so the hover still reads as a hover. The RESTING pair is
        // untouched. Measured with `scripts/check-token-contrast.mjs`'s own
        // `alphaBlend`/`contrastRatio`, which pins this pair as
        // `primary-foreground-on-primary-hover`.
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // R3 + 裁-1 (P6-3), RE-APPLIED: upstream's own destructive variant
        // overrides the base focus treatment with `focus-visible:
        // border-destructive/40 focus-visible:ring-destructive/20`
        // (`dark:focus-visible:ring-destructive/40` too), and `cn`'s
        // tailwind-merge keeps the LAST ring-colour utility — so a
        // destructive Button's focus indicator would be #b42318 at 20%
        // alpha, which composites to #f0d3d1 and measures 1.405:1 on
        // #ffffff (1.192:1 against the button's own bg-destructive/10
        // fill). That is not a focus indicator; it is a tint. All three
        // overrides are removed rather than re-tuned, so this variant
        // inherits the base ring exactly like every other one — which is
        // what R3 ("ALL focus indicators unify on the shadcn ring") ruled in
        // the first place. The look change is deliberate: a destructive
        // Button's focus halo is the same blue as everything else's. The
        // dark-mode fill/hover tints (`dark:bg-destructive/20
        // dark:hover:bg-destructive/30`) are upstream's own colour
        // adjustments, not focus, and are kept.
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
