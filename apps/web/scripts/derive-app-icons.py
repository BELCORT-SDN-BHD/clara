"""H-31 — derive the app icons from the Ledger Fold mark that already ships.

RUN IT (from apps/web/, needs Pillow — `pip install pillow`):

    python scripts/derive-app-icons.py \\
        public/brand/logo/clarabook-ledger-fold-brand-ink-v1.0.png paper \\
        app/icon.png app/apple-icon.png public/favicon.ico

The second argument is the GROUND: `paper` ships (the mark as it ships, ink on
white); `ink` renders the alternative that was built, shown to the owner at 16px
and NOT adopted — the glyph knocked out of a solid brand-ink tile. Keeping both
paths here is the point: the choice is the owner's, and re-taking it should be a
one-word change rather than a redrawing.

WHY A SCRIPT IN THE REPO AT ALL. Without it the three committed binaries are
unreproducible — nobody can re-derive them after a brand refresh, check what
crop was taken, or re-render at a new size, and the "derived, never redrawn"
claim in tests/app-icons.test.ts is unfalsifiable. It is deliberately NOT wired
into `pnpm lint` or CI: Pillow is not a workspace dependency and the icons change
about once a brand. `tests/app-icons.test.ts` is what holds the OUTPUT honest
between runs — it decodes the committed PNG and checks the ink, the ground and
the crop tightness, so a hand-edited or re-drawn icon reds without this script
ever running.


Not a new drawing: the source is the SAME file the entry lockup renders
(`components/entry/brand-lockup.tsx`, proven in the browser by
`e2e/identity-finish.spec.ts`), so the tab mark and the wordmark cannot drift.

The source is a TRANSPARENT-backed PNG whose ink is a single flat colour, so the
alpha channel is the glyph and the bounding box comes from it directly.

The crop is the point: 1024px of art with ~12% empty margin on every side becomes
an illegible smudge at 16px. Measure the ink's real box, crop to it, re-pad to a
square with a small deliberate margin, resize from there.
"""

import sys
from PIL import Image

SRC, GROUND, OUT_ICON, OUT_APPLE, OUT_ICO = sys.argv[1:6]

src = Image.open(SRC).convert("RGBA")
alpha = src.getchannel("A")
# THRESHOLD, not a bare getbbox(). The exported PNG carries an invisible
# alpha=1 fringe out to the canvas edge (measured: 11 pixels in column 1023 at
# alpha 1). A bare getbbox() reads that as ink and returns 1018x900 — nearly the
# whole 1024 canvas — which would have reinstated exactly the empty margin this
# crop exists to remove. At alpha>8 the real glyph is 782x835.
box = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
print(f"source {src.size}; ink bbox {box} -> {box[2]-box[0]}x{box[3]-box[1]}")

# The ink's own colour, read from the most opaque pixel rather than assumed.
opaque = [
    src.getpixel((x, y))
    for y in range(box[1], box[3], 17)
    for x in range(box[0], box[2], 17)
    if src.getpixel((x, y))[3] > 250
]
ink = max(set((p[0], p[1], p[2]) for p in opaque), key=lambda c: sum(
    1 for p in opaque if (p[0], p[1], p[2]) == c))
print(f"ink colour: #{ink[0]:02x}{ink[1]:02x}{ink[2]:02x}  ({len(opaque)} opaque samples)")

glyph = src.crop(box)

if GROUND == "paper":
    bg = (255, 255, 255)
    art = glyph
else:  # "ink" — a solid brand tile with the glyph knocked out in paper
    bg = ink
    knock = Image.new("RGBA", glyph.size, (255, 255, 255, 0))
    knock.putalpha(glyph.getchannel("A"))
    art = Image.new("RGBA", glyph.size, (255, 255, 255, 255))
    art.putalpha(glyph.getchannel("A"))

side = max(glyph.width, glyph.height)
# 8% margin on the long side for the paper ground; the ink tile wants a little
# more so the glyph does not touch the tile's own edge.
scale = 1.16 if GROUND == "paper" else 1.30
canvas_side = int(round(side * scale))
canvas = Image.new("RGBA", (canvas_side, canvas_side), bg + (255,))
canvas.alpha_composite(art, ((canvas_side - art.width) // 2, (canvas_side - art.height) // 2))
print(f"square canvas {canvas.size} on {GROUND} ground")

flat = canvas.convert("RGB")
flat.resize((512, 512), Image.LANCZOS).save(OUT_ICON, "PNG", optimize=True)
flat.resize((180, 180), Image.LANCZOS).save(OUT_APPLE, "PNG", optimize=True)
# A real multi-size .ico: 16/32/48, each resampled from the FULL-resolution
# square rather than from one another, so the 16px is not a blur of a blur.
flat.save(OUT_ICO, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])

for path in (OUT_ICON, OUT_APPLE, OUT_ICO):
    im = Image.open(path)
    print(f"  verify {path}: format={im.format} size={im.size}")
