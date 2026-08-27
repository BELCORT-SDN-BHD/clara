import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  alphaBlend,
  parseRootTokens,
  resolveTokenHex,
  evaluatePairs,
  PAIR_SPECS,
} from "../scripts/check-token-contrast.mjs";

/**
 * Gate (a) — constructive token-level contrast (owner ruling Q7). This suite
 * proves the MECHANISM, not just today's token values:
 *   - the colour-math primitives against textbook WCAG numbers,
 *   - a synthetic PASSING arm (a clearly-AA pair must be reported as passing),
 *   - a synthetic RED-ON-MUTANT control (a clearly-failing pair must be
 *     reported as failing — a detector that can only ever say "PASS" is
 *     worthless; this is the deliberately-red arm review law 1 asks for), and
 *   - the REAL `app/globals.css` pairs end to end, pinned to today's known,
 *     honest result (25 passing + the one documented near-threshold
 *     violation) so a silent regression — or a silent "fix" that edits the
 *     ratio here instead of the token — is caught either direction.
 */

describe("colour-math primitives", () => {
  it("hexToRgb parses both 6-digit and 3-digit hex", () => {
    assert.deepEqual(hexToRgb("#1d4ed8"), { r: 29, g: 78, b: 216 });
    assert.deepEqual(hexToRgb("#fff"), { r: 255, g: 255, b: 255 });
  });

  it("relativeLuminance: white is 1, black is 0", () => {
    assert.equal(relativeLuminance("#ffffff"), 1);
    assert.equal(relativeLuminance("#000000"), 0);
  });

  it("contrastRatio: black on white is the textbook 21:1", () => {
    assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01);
  });

  it("contrastRatio: identical colours are 1:1, and it is order-independent", () => {
    assert.equal(contrastRatio("#336699", "#336699"), 1);
    assert.equal(contrastRatio("#000000", "#ffffff"), contrastRatio("#ffffff", "#000000"));
  });

  it("alphaBlend: 100% alpha is the foreground verbatim, 0% is the backdrop verbatim", () => {
    assert.equal(alphaBlend("#b42318", 1, "#ffffff"), "#b42318");
    assert.equal(alphaBlend("#b42318", 0, "#ffffff"), "#ffffff");
  });

  it("alphaBlend: 50% red over white is the sRGB-gamma-space midpoint, not linear-light", () => {
    // 0xb4=180 -> (180+255)/2=217.5 -> 218 (rounds up); 0x23=35 -> (35+255)/2=145;
    // 0x18=24 -> (24+255)/2=139.5 -> 140 (rounds up, banker's-adjacent .5 up).
    assert.equal(alphaBlend("#b42318", 0.5, "#ffffff"), "#da918c");
  });
});

describe("parseRootTokens + resolveTokenHex", () => {
  it("parses declarations out of the first :root block only", () => {
    const css = `
      :root {
        --canvas: #ffffff;
        --background: var(--canvas);
      }
      @media (prefers-reduced-motion: reduce) {
        :root { --motion-duration-fast: 0ms; }
      }
    `;
    const tokens = parseRootTokens(css);
    assert.equal(tokens.get("canvas"), "#ffffff");
    assert.equal(tokens.get("background"), "var(--canvas)");
    // The reduced-motion re-opening of :root is never reached (non-greedy
    // match stops at the first block's own closing brace).
    assert.equal(tokens.has("motion-duration-fast"), false);
  });

  it("resolves a var() chain to its terminal hex literal", () => {
    const tokens = parseRootTokens(`:root { --canvas: #ffffff; --background: var(--canvas); --foreground: var(--background); }`);
    assert.equal(resolveTokenHex(tokens, "background"), "#ffffff");
    assert.equal(resolveTokenHex(tokens, "foreground"), "#ffffff");
  });

  it("throws on an unknown token name (fail closed, never guess)", () => {
    const tokens = parseRootTokens(`:root { --canvas: #ffffff; }`);
    assert.throws(() => resolveTokenHex(tokens, "nope"));
  });

  it("throws on a non-colour value (a radius/spacing token has no business in a contrast pair)", () => {
    const tokens = parseRootTokens(`:root { --radius: 0.625rem; }`);
    assert.throws(() => resolveTokenHex(tokens, "radius"));
  });
});

describe("evaluatePairs — the detector can say both PASS and FAIL", () => {
  it("PASSING ARM: a textbook-AA synthetic pair is reported as passing", () => {
    const tokens = parseRootTokens(`:root { --good-fg: #000000; --good-bg: #ffffff; }`);
    const [result] = evaluatePairs(tokens, [
      { id: "synthetic-good", fg: (h) => h("good-fg"), bg: (h) => h("good-bg"), threshold: 4.5, source: "test fixture" },
    ]);
    assert.equal(result!.pass, true);
    assert.ok(result!.ratio >= 4.5);
  });

  it("RED-ON-MUTANT CONTROL: a deliberately sub-AA synthetic pair is reported as failing", () => {
    // #999999 on #ffffff is well documented as ~2.85:1 — under both the
    // 4.5:1 text floor and the 3:1 UI floor. If this ever reports `pass:
    // true`, the detector itself is broken, not the fixture.
    const tokens = parseRootTokens(`:root { --bad-fg: #999999; --bad-bg: #ffffff; }`);
    const [result] = evaluatePairs(tokens, [
      { id: "synthetic-bad", fg: (h) => h("bad-fg"), bg: (h) => h("bad-bg"), threshold: 4.5, source: "test fixture" },
    ]);
    assert.equal(result!.pass, false);
    assert.ok(result!.ratio < 4.5);
    assert.ok(result!.ratio > 2.5 && result!.ratio < 3.2, `expected ~2.85:1, got ${result!.ratio}`);
  });

  it("a mutant fixture below the 3:1 UI floor also fails a threshold: 3 pair", () => {
    const tokens = parseRootTokens(`:root { --bad-fg: #eeeeee; --bad-bg: #ffffff; }`);
    const [result] = evaluatePairs(tokens, [
      { id: "synthetic-ui-bad", fg: (h) => h("bad-fg"), bg: (h) => h("bad-bg"), threshold: 3, source: "test fixture" },
    ]);
    assert.equal(result!.pass, false);
  });

  it("honours an alpha-composited spec (opacity utilities are part of the real pair, not ignored)", () => {
    const tokens = parseRootTokens(`:root { --fg: #b42318; --bg: #ffffff; }`);
    const [full, translucent] = evaluatePairs(tokens, [
      { id: "full", fg: (h) => h("fg"), bg: (h) => h("bg"), threshold: 4.5, source: "test fixture" },
      { id: "translucent", fg: (h, composite) => composite("fg", 0.1, h("bg")), bg: (h) => h("bg"), threshold: 4.5, source: "test fixture" },
    ]);
    // A lightened (translucent) foreground over the same background must
    // never score a HIGHER contrast ratio than the same colour at full
    // opacity — the composite genuinely has to move the effective colour
    // toward the backdrop, not be a no-op.
    assert.ok(translucent!.ratio < full!.ratio);
  });
});

describe("the REAL app/globals.css pairs, end to end", () => {
  const cssText = readGlobalsCss();
  const tokens = parseRootTokens(cssText);
  const results = evaluatePairs(tokens);

  it("evaluates every pinned pair with no thrown error (every token in PAIR_SPECS resolves)", () => {
    assert.equal(results.length, PAIR_SPECS.length);
  });

  it("the base surface pairs (body text, cards, popovers) pass with wide margin", () => {
    for (const id of ["foreground-on-background", "card-foreground-on-card", "popover-foreground-on-popover"]) {
      const r = results.find((x) => x.id === id);
      assert.ok(r, `missing pair ${id}`);
      assert.equal(r.pass, true, `${id} regressed to failing (${r.ratio}:1)`);
      assert.ok(r.ratio >= 10, `${id} margin shrank below 10:1 (now ${r.ratio}:1) — re-check the token change that did this`);
    }
  });

  it("KNOWN VIOLATION, pinned honestly: the destructive/80 door-refusal line stays a documented near-miss", () => {
    const r = results.find((x) => x.id === "destructive-80pct-on-destructive-5-box");
    assert.ok(r, "the known-violation pair must still be evaluated, not silently dropped");
    assert.equal(r.pass, false, "if this now passes, the token/opacity choice was fixed — update this test AND report it, do not just delete the assertion");
    assert.ok(r.ratio > 4.0 && r.ratio < 4.5, `expected a near-miss around 4.36:1, got ${r.ratio}:1`);
  });

  it("exactly one pair fails today — a second regression would mean a NEW violation slipped in unreported", () => {
    const failing = results.filter((r) => !r.pass);
    assert.equal(
      failing.length,
      1,
      `expected exactly 1 known failing pair, got ${failing.length}: ${failing.map((r) => r.id).join(", ")}`,
    );
    assert.equal(failing[0]!.id, "destructive-80pct-on-destructive-5-box");
  });
});

function readGlobalsCss(): string {
  // Resolved relative to this test file so it works under both `node --test`
  // (cwd = apps/web, per package.json) and any future runner with a
  // different cwd — matches this suite's own `type: module` / ESM-everywhere
  // contract (apps/web/README.md "Dependency notes").
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "app", "globals.css"), "utf8");
}
