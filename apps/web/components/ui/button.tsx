import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// P3 polish, motion: `transition-all` became an explicit property list and
// picked up the --motion-duration-fast token (120ms — inside the 100-160ms
// press-feedback budget, and 0ms under prefers-reduced-motion via the token
// scale itself). `all` animates whatever a variant happens to change, layout
// properties included, which is both off-GPU and unpredictable across the six
// variants below. The press feedback itself (`translate-y-px`) is base-nova's
// own and is left exactly as the CLI shipped it.
//
// 裁-64③ · THE OFFSET RING (P6-3). `--ring` and `--primary` are the SAME hex
// (#1d4ed8, both `var(--interaction)` / `var(--focus)` in globals.css), so on a
// default Button the `focus-visible:border-ring` swap draws a #1d4ed8 border
// against a #1d4ed8 fill — 1.000:1, an indicator that is literally invisible on
// the product's most-used control, and no halo alpha can fix it because the
// collision is INSIDE the button, not outside. `ring-offset-2` +
// `ring-offset-background` inserts a 2px ground-coloured gap between the fill
// and the halo, so the halo always has a light neighbour on both sides: it
// measures 3.574:1 against #ffffff on the outside AND against the offset gap on
// the inside. Ruled by the owner (mohe-grill-rulings-2026-08-30.md 裁-64③,
// "Button focus = an OFFSET ring"), not chosen here.
//
// WHY `ring-offset-background` AND NOT A PER-GROUND VALUE: the gap has to be
// OPAQUE (Tailwind paints the offset shadow ON TOP of the ring shadow, so a
// transparent offset colour yields a solid 5px ring with no gap at all — it does
// not fall through to the real backdrop). --background is #ffffff, which is
// byte-exact on the three grounds that carry the overwhelming majority of
// Buttons (--background, --card, --popover all resolve to #ffffff) and differs
// from the next two (--shell #f7f7f5, --muted #f5f6f4) by at most 3/255 per
// channel — a 1.03:1 difference across a 2px gap, below the perceptual floor.
const buttonVariants = cva(
  "group/button motion-fast inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,opacity] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        // R3 + 裁-1 (P6-3): this variant used to override the base focus
        // treatment with `focus-visible:border-destructive/40 focus-visible:
        // ring-destructive/20`, and `cn`'s tailwind-merge keeps the LAST
        // ring-colour utility — so a destructive Button's focus indicator was
        // #b42318 at 20% alpha, which composites to #f0d3d1 on white and
        // measures 1.28:1. That is not a focus indicator; it is a tint. Both
        // overrides are removed rather than re-tuned, so this variant inherits
        // the base ring exactly like every other one — which is what R3 ("ALL
        // focus indicators unify on the shadcn ring") ruled in the first place.
        // The look change is deliberate: a destructive Button's focus halo is
        // now the same blue as everything else's.
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
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
