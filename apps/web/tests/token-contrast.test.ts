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
 *     honest result (P3 finale: every pinned pair passes — the one former
 *     near-miss was RETIRED by the polish's rewrite onto the shared
 *     StateBanner, not nudged over the line) so a silent regression — or a
 *     silent "fix" that edits the ratio here instead of the token — is
 *     caught either direction.
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
    // The reduced-motion re-opening of :root is never reached (the match
    // stops at the first block's own closing brace).
    assert.equal(tokens.has("motion-duration-fast"), false);
  });

  it("does not truncate at a literal '}' character sitting inside a comment inside the block (the real app/globals.css has exactly this, in its FOCUS TREATMENT note)", () => {
    // Regression fixture for a real bug found running this suite against the
    // P3-polished app/globals.css: a documentation comment quoting CSS
    // (`outline-offset: 2px; }`) used to satisfy the old comment-blind
    // regex's `[^}]*` before the block's OWN closing brace, silently
    // truncating the parsed token set — every token declared after the
    // comment (including --foreground) came back "unknown".
    const css = `
      :root {
        --canvas: #ffffff;
        /* a note quoting CSS, e.g. "outline-offset: 2px; }" — must not end the block */
        --background: var(--canvas);
        --foreground: var(--background);
      }
    `;
    const tokens = parseRootTokens(css);
    assert.equal(tokens.get("background"), "var(--canvas)");
    assert.equal(tokens.get("foreground"), "var(--background)", "a brace inside a comment must never be mistaken for the block's own closing brace");
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

  it("RETIRED, honestly: the old destructive/80 door-refusal pairs no longer exist — action-refusal.tsx and reconciliation-section.tsx now render through the shared StateBanner", () => {
    // These two ids must never silently reappear in PAIR_SPECS unless a
    // bespoke bg-destructive/5-tinted box genuinely comes back into the
    // codebase (it does not, as of the P3 finale fold) — see
    // check-token-contrast.mjs's own header, "THE P3 FINALE RE-CENSUS".
    assert.equal(results.find((x) => x.id === "destructive-80pct-on-destructive-5-box"), undefined);
    assert.equal(results.find((x) => x.id === "destructive-full-on-destructive-5-box"), undefined);
    // Its replacement shapes are both present and both pass.
    for (const id of ["error-on-error-muted", "error-on-card"]) {
      const r = results.find((x) => x.id === id);
      assert.ok(r, `missing replacement pair ${id}`);
      assert.equal(r.pass, true, `${id} must pass — it is what the retired near-miss pair was replaced by`);
    }
  });

  it("every pinned pair passes today — the strict gate (apps/web's lint script) has no WARN carve-out left, so a single regression here fails the build", () => {
    const failing = results.filter((r) => !r.pass);
    assert.equal(
      failing.length,
      0,
      `expected zero failing pairs, got ${failing.length}: ${failing.map((r) => r.id).join(", ")}`,
    );
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
