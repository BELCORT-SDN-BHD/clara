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

  it("the icon is DERIVED from the shipping Ledger Fold mark, which is still there", () => {
    // The derivation's whole point is that the tab mark and the entry lockup
    // cannot drift, which only holds while the source is the same file the
    // lockup renders. If that asset is ever renamed, this reds and whoever
    // renames it re-derives rather than leaving a stale crop behind.
    const source = "public/brand/logo/clarabook-ledger-fold-brand-ink-v1.0.png";
    assert.equal(existsSync(join(WEB_ROOT, source)), true, `${source} is missing`);
    const lockup = readFileSync(join(WEB_ROOT, "components/entry/brand-lockup.tsx"), "utf8");
    assert.match(lockup, /clarabook-ledger-fold-brand-ink-v1\.0\.png/);
  });
});
