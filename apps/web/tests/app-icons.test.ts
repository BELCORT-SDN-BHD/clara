// H-31 — the favicon set, guarded at the two places it can silently disappear:
// the FILES (App Router file convention — no code declares them, so nothing else
// would go red if one were deleted) and the ABSENCE of a second authority for
// the same `<link>` tag.
//
// What this file does NOT claim: that the icon renders, that /favicon.ico
// returns 200, or that the mark is legible. A file-existence read cannot
// establish any of those — `e2e/responsive-shell-walk.spec.ts` fetches the real
// URLs off the built app for that half, and the 16px crop in the PR body is what
// the owner judges legibility from.

import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): Buffer => readFileSync(join(WEB_ROOT, path));

/** Big-endian PNG IHDR: width and height are bytes 16..23 of a valid PNG. */
function pngSize(buf: Buffer): { width: number; height: number } {
  assert.deepEqual(
    [...buf.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "not a PNG (magic bytes)",
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Decode an 8-bit truecolour (colour type 2, non-interlaced) PNG to RGB pixels,
 * with `node:zlib` and nothing else.
 *
 * WHY DECODE AT ALL. A file-existence check cannot tell a derived Ledger Fold
 * crop from a blank square, a screenshot, or a different company's logo — the
 * review's own point. Reading the PIXELS is what makes "derived from the
 * shipping mark, cropped tight" a claim the suite can falsify. The decoder is
 * about forty lines because the format PIL emits here is the simple case; it
 * asserts that case rather than pretending to be general.
 */
function decodeRgb(buf: Buffer): { width: number; height: number; px: Buffer } {
  const { width, height } = pngSize(buf);
  assert.equal(buf.readUInt8(24), 8, "expected 8-bit channels");
  assert.equal(buf.readUInt8(25), 2, "expected colour type 2 (truecolour, no alpha)");
  assert.equal(buf.readUInt8(28), 0, "expected a non-interlaced PNG");

  const idat: Buffer[] = [];
  let at = 8;
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") idat.push(buf.subarray(at + 8, at + 8 + len));
    if (type === "IEND") break;
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  // Undo the per-scanline filters (PNG spec §9). `bpp` is 3 for RGB8.
  const bpp = 3;
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp]! : 0;
      let value = line[x]!;
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      px[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, px };
}

const hexAt = (img: { width: number; px: Buffer }, x: number, y: number): string => {
  const i = (y * img.width + x) * 3;
  return [img.px[i]!, img.px[i + 1]!, img.px[i + 2]!]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
};

/** The Ledger Fold's ink, read out of the source art by scripts/derive-app-icons.py. */
const BRAND_INK = "243b3b";

describe("H-31 — the app icon set ships", () => {
  it("the App Router file-convention icons exist, at the sizes the convention expects", () => {
    // `app/icon.png` and `app/apple-icon.png` are the ZERO-CODE route: Next
    // generates the <link rel="icon"> / <link rel="apple-touch-icon"> tags and
    // content-hashes the files, so there is nothing in TypeScript to grep for
    // and nothing that reds if a file goes missing. That is exactly why this
    // cell exists.
    const icon = pngSize(read("app/icon.png"));
    assert.deepEqual(icon, { width: 512, height: 512 });
    const apple = pngSize(read("app/apple-icon.png"));
    // 180x180 is Apple's own touch-icon size; a smaller file is upscaled by iOS.
    assert.deepEqual(apple, { width: 180, height: 180 });
  });

  it("public/favicon.ico answers the browser's own root probe, as a real multi-size ICO", () => {
    const path = join(WEB_ROOT, "public/favicon.ico");
    assert.equal(existsSync(path), true, "public/favicon.ico is missing — /favicon.ico 404s");
    const buf = readFileSync(path);
    // ICONDIR: reserved(0) | type(1 = icon) | count
    assert.equal(buf.readUInt16LE(0), 0);
    assert.equal(buf.readUInt16LE(2), 1);
    const count = buf.readUInt16LE(4);
    // The sizes live in ICONDIRENTRY byte 0/1, where 0 means 256.
    const sizes = Array.from({ length: count }, (_, i) => buf.readUInt8(6 + i * 16) || 256).sort(
      (a, b) => a - b,
    );
    assert.deepEqual(
      sizes,
      [16, 32, 48],
      "the .ico must carry a real 16px frame — a single 48px frame is downscaled by the browser and reads as mush in a tab",
    );
    assert.ok(statSync(path).size < 100_000, "favicon.ico is implausibly large");
  });

  it("NOTHING hand-writes an `icons` metadata key — one authority for one tag", () => {
    // Shipping the file convention AND a `generateMetadata` `icons:` block puts
    // two authorities on the same <link>, and they drift silently because both
    // "work". The file convention is the one this app uses.
    const layout = readFileSync(join(WEB_ROOT, "app/layout.tsx"), "utf8");
    assert.doesNotMatch(layout, /\bicons\s*:/);
    assert.doesNotMatch(layout, /rel=["']icon["']/);
  });

  it("the icon is the LEDGER FOLD, on paper, cropped tight — read from the pixels", () => {
    // The three properties that distinguish the shipped artefact from a blank
    // square, a screenshot, or somebody else's mark. Existence checks cannot see
    // any of them.
    const icon = decodeRgb(read("app/icon.png"));

    // (1) THE GROUND is paper, not the ink tile that was built and not adopted.
    // All four corners, so a mark that merely happens to be pale top-left fails.
    for (const [x, y] of [
      [2, 2],
      [icon.width - 3, 2],
      [2, icon.height - 3],
      [icon.width - 3, icon.height - 3],
    ] as const) {
      assert.equal(hexAt(icon, x, y), "ffffff", `corner (${x},${y}) is not the paper ground`);
    }

    // (2) THE INK is the brand's, exactly — this is what makes it the Ledger Fold
    // rather than a differently-shaped dark glyph. Sampled across the canvas and
    // asserted on the DOMINANT non-paper colour, so anti-aliased edges do not
    // decide it.
    const counts = new Map<string, number>();
    for (let y = 0; y < icon.height; y += 3) {
      for (let x = 0; x < icon.width; x += 3) {
        const hex = hexAt(icon, x, y);
        if (hex === "ffffff") continue;
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
    }
    const [dominant, dominantCount] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    // WITHIN A TOLERANCE, not exactly — and the tolerance is a measurement, not a
    // hedge. The derivation Lanczos-resamples a 969px square down to 512, which
    // perturbs even a perfectly flat fill: the shipped icon's dominant ink reads
    // #253c3c against the source's #243b3b, one step per channel. An exact-match
    // assertion here reds on a resample that changed nothing anyone can see. Six
    // is tight enough that a different dark colour cannot pass.
    const delta = (a: string, b: string) =>
      Math.max(
        ...[0, 2, 4].map((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))),
      );
    assert.ok(
      delta(dominant, BRAND_INK) <= 6,
      `the icon's dominant ink is #${dominant}, not the Ledger Fold's #${BRAND_INK} (per-channel delta ${delta(dominant, BRAND_INK)})`,
    );

    // (3) THE CROP IS TIGHT. This is the property the whole derivation exists for:
    // the source art carries ~12% empty margin on every side, and a 16px render of
    // an UNCROPPED copy is mostly whitespace. The glyph's own ink covers ~38% of
    // the source's bounding box; scaled onto a square with an 8% margin it lands
    // near a quarter of the canvas. Bounded on BOTH sides — too little means an
    // uncropped or blank icon, too much means a solid tile (the ink-ground variant
    // the owner did not pick), so neither mistake can pass.
    const sampled = Math.ceil(icon.height / 3) * Math.ceil(icon.width / 3);
    const inkFraction = dominantCount / sampled;
    assert.ok(
      inkFraction > 0.15 && inkFraction < 0.45,
      `ink covers ${(inkFraction * 100).toFixed(1)}% of the icon — outside the 15–45% a tight crop of this mark produces`,
    );

    // …and the 180px Apple icon is the SAME artefact, not a separately-made one.
    const apple = decodeRgb(read("app/apple-icon.png"));
    assert.equal(hexAt(apple, 2, 2), "ffffff");
  });

  it("the icon is DERIVED from the shipping Ledger Fold mark, which is still there", () => {
    // The derivation's whole point is that the tab mark and the entry lockup
    // cannot drift, which only holds while the source is the same file the
    // lockup renders. If that asset is ever renamed, this reds and whoever
    // renames it re-derives rather than leaving a stale crop behind.
    const source = "public/brand/logo/clarabook-ledger-fold-brand-ink-v1.0.png";
    assert.equal(existsSync(join(WEB_ROOT, source)), true, `${source} is missing`);
    const lockup = readFileSync(join(WEB_ROOT, "components/entry/brand-lockup.tsx"), "utf8");
    assert.match(lockup, /clarabook-ledger-fold-brand-ink-v1\.0\.png/);

    // …and the DERIVATION is reproducible: the script that made the three
    // binaries is in the repo, and it names the same source. Without it the
    // committed files are unreproducible art and the "derived, never redrawn"
    // claim above cannot be checked by anyone.
    // Anchored on the script's CODE, not on its prose: the alpha threshold that
    // makes the crop tight, and the three ICO frames the .ico cell above reads
    // back out of the committed binary. Both would have to change for the
    // artefacts to change, so this is the seam between recipe and output.
    const script = readFileSync(join(WEB_ROOT, "scripts/derive-app-icons.py"), "utf8");
    assert.match(script, /alpha\.point\(lambda v: 255 if v > 8 else 0\)\.getbbox\(\)/);
    assert.match(script, /sizes=\[\(16, 16\), \(32, 32\), \(48, 48\)\]/);
  });
});
