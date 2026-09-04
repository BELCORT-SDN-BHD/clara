import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { PAIR_SPECS, parseRootTokens, resolveTokenHex, alphaBlend, contrastRatio } from "../scripts/check-token-contrast.mjs";
import { buttonVariants } from "../components/ui/button";
import { cn } from "../lib/utils";

/**
 * R3 ARM (b) · 裁-1 — THE FOCUS-RING CONTRACT, HELD MECHANICALLY.
 *
 * `--focus-ring-alpha` in app/globals.css is the ONE declaration of the ring's
 * 70%. Twelve components spell that same number as Tailwind's `/70` opacity
 * modifier, and the contrast gate spells it a third time as the `0.70` argument
 * to `composite()`. Three spellings of one ruled value is exactly the shape
 * that drifts: before this train there were twelve independent `/50` literals
 * and nothing anywhere that would notice if one of them changed.
 *
 * This suite is what notices. It is deliberately a SOURCE read rather than a
 * render: the defect it guards against is somebody editing one class string,
 * which no rendered tree of one component can see.
 *
 * WHAT IT IS NOT. It does not claim the ring is perceivable — that is the
 * composited `focus-ring-70-on-*` rows in the contrast gate. It does not claim
 * every focusable control HAS an indicator — that is gate (c)'s keyboard walk.
 * It claims one thing: every carrier of the ring idiom draws it at the alpha
 * the token declares.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, "..");
const SCAN_DIRS = ["components", "app"];
const SOURCE_RE = /\.tsx?$/;

function readGlobals(): string {
  return readFileSync(join(WEB_ROOT, "app", "globals.css"), "utf8");
}

/** Every .ts/.tsx under components/ and app/, as apps/web-relative POSIX paths. */
function sourceFiles(): string[] {
  const out: string[] = [];
  for (const top of SCAN_DIRS) {
    (function walk(absDir: string) {
      for (const entry of readdirSync(absDir, { withFileTypes: true })) {
        const abs = join(absDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
          walk(abs);
        } else if (SOURCE_RE.test(entry.name)) {
          out.push(relative(WEB_ROOT, abs).split(sep).join("/"));
        }
      }
    })(join(WEB_ROOT, top));
  }
  return out.sort();
}

/** Declared ring alpha as a percentage integer, e.g. 70 for `--focus-ring-alpha: 0.7`. */
function declaredAlphaPct(): number {
  const raw = parseRootTokens(readGlobals()).get("focus-ring-alpha");
  assert.ok(raw !== undefined, "--focus-ring-alpha is not declared in app/globals.css :root");
  const n = Number(raw.trim());
  assert.ok(Number.isFinite(n) && n > 0 && n <= 1, `--focus-ring-alpha must be a 0..1 number, got ${raw}`);
  return Math.round(n * 100);
}

/**
 * Every `ring-ring/NN` occurrence in product source that is a REAL CLASS
 * STRING, with its file and alpha.
 *
 * FOLD (review N-5): comments are stripped first. The first cut counted a prose
 * mention inside `components/common/section-tabs.tsx`'s own explanatory comment
 * as a thirteenth "carrier" — so the completeness control below pinned a
 * SPELLING as though it were an identity (law 3), and deleting that sentence
 * would have reddened the gate while changing nothing that renders. A comment
 * is not a carrier, and it is not drift either: an author who writes `/50` in
 * prose has not changed the product.
 */
function ringCarrierHits(): { file: string; alpha: number; line: number }[] {
  const hits: { file: string; alpha: number; line: number }[] = [];
  for (const file of sourceFiles()) {
    const raw = readFileSync(join(WEB_ROOT, file), "utf8");
    // Blank comment payloads while preserving newlines, so reported line
    // numbers still point at the real line in the real file.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
    code.split(/\r?\n/).forEach((text, i) => {
      for (const m of text.matchAll(/ring-ring\/(\d+)/g)) {
        hits.push({ file, alpha: Number(m[1]), line: i + 1 });
      }
    });
  }
  return hits;
}

describe("focus-ring contract — 裁-1's 70% is declared once and obeyed everywhere", () => {
  it("globals.css declares --focus-ring-alpha, and it is the ruled 70%", () => {
    assert.equal(declaredAlphaPct(), 70);
  });

  it("every ring-ring/NN carrier in components/ and app/ matches the declared alpha", () => {
    const declared = declaredAlphaPct();
    const drifted = ringCarrierHits().filter((h) => h.alpha !== declared);
    assert.deepEqual(
      drifted,
      [],
      `these carriers disagree with --focus-ring-alpha (${declared}%): ${drifted
        .map((d) => `${d.file}:${d.line} at /${d.alpha}`)
        .join(", ")}`,
    );
  });

  it("VACUITY CONTROL: the scan actually finds the carriers — thirteen component files, thirteen class strings", () => {
    // Without this arm the assertion above passes trivially the day the scan
    // walks the wrong directory or the regex stops matching. The count is the
    // 2026-09-02 re-census (the P6-3 order's list of eleven was one file stale:
    // components/admin/admin-hub.tsx had joined it), plus ONE from the 裁-190
    // journals table: components/journals/journal-entries-table.tsx's sortable
    // column header is a raw <button>, the same shape as this list's other two
    // raw-button carriers (section-tabs and the drafts row disclosure), so it
    // takes the shadcn ring for the same reason they do.
    //
    // TWO NEW <details> DISCLOSURES FROM THAT SAME TRAIN ARE DELIBERATELY NOT
    // HERE (the status legend, and the revision-delta value formatter): a bare
    // <summary> takes the global :focus-visible outline, which is what the
    // product's existing disclosure at components/firm/firm-question-row.tsx:88
    // already does. Growing this list needs a reason each time; "a new file
    // appeared" is not one.
    //
    // Exactly one class string per file, now that comments are stripped — see
    // ringCarrierHits's header for why the thirteenth "occurrence" in the
    // earlier census was never a carrier.
    const hits = ringCarrierHits();
    const files = [...new Set(hits.map((h) => h.file))].sort();
    assert.equal(hits.length, 13, JSON.stringify(hits, null, 2));
    assert.deepEqual(files, [
      "components/admin/admin-hub.tsx",
      "components/clara/ClaraThreadView.tsx",
      "components/common/native-select.tsx",
      "components/common/section-tabs.tsx",
      "components/firm/compliance-watch-affordance.tsx",
      "components/journals/drafts-queue-panel.tsx",
      "components/journals/journal-entries-table.tsx",
      "components/ui/badge.tsx",
      "components/ui/button.tsx",
      "components/ui/input-group.tsx",
      "components/ui/input.tsx",
      "components/ui/select.tsx",
      "components/ui/textarea.tsx",
    ]);
  });

  it("the contrast gate composites at the SAME alpha the token declares — nine rows, and they are not a copy of it", () => {
    // The rows spell 0.70 as a literal argument. This re-derives each row's
    // measured ratio from the TOKEN and asserts the gate's own reported figure
    // matches — so a token change that the rows did not follow reds here rather
    // than leaving the gate measuring a composition nothing renders.
    const tokens = parseRootTokens(readGlobals());
    const alpha = declaredAlphaPct() / 100;
    const rows = PAIR_SPECS.filter((s) => s.id.startsWith("focus-ring-70-on-"));
    assert.equal(rows.length, 9, rows.map((r) => r.id).join(", "));
    for (const row of rows) {
      const ground = row.id.replace("focus-ring-70-on-", "");
      const bgHex = resolveTokenHex(tokens, ground);
      const expected = contrastRatio(alphaBlend(resolveTokenHex(tokens, "ring"), alpha, bgHex), bgHex);
      const actual = contrastRatio(
        row.fg((n) => resolveTokenHex(tokens, n), (t, a, over) => alphaBlend(resolveTokenHex(tokens, t), a, over)),
        row.bg((n) => resolveTokenHex(tokens, n), (t, a, over) => alphaBlend(resolveTokenHex(tokens, t), a, over)),
      );
      assert.ok(
        Math.abs(actual - expected) < 1e-9,
        `${row.id}: gate measures ${actual}, the token implies ${expected}`,
      );
      assert.ok(actual >= 3, `${row.id} is below the 3:1 non-text floor at ${actual}`);
    }
  });

  it("the BASE OUTLINE is still declared — deleting it would strip the fallback indicator", () => {
    // R3 read literally says "unify on the ring"; executing that literally would
    // leave every plain link and list row with no indicator at all. globals.css's
    // FOCUS TREATMENT note records the decision to keep this rule; this arm is
    // what stops the note from being the only thing holding it.
    const css = readGlobals();
    assert.match(css, /:focus-visible\s*\{\s*outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--focus\);/);
    assert.match(css, /outline-offset:\s*var\(--focus-ring-offset\);/);
  });

  it("裁-64③: the Button carries the OFFSET ring, because --ring and --primary are one hex", () => {
    const tokens = parseRootTokens(readGlobals());
    // The premise first — if these ever diverge, the offset ring stops being
    // required and this whole treatment should be re-argued, not silently kept.
    assert.equal(resolveTokenHex(tokens, "ring"), resolveTokenHex(tokens, "primary"));
    // Read the SHIPPED class string — `cn(buttonVariants({variant}))`, which is
    // exactly what the `Button` function in components/ui/button.tsx passes to
    // ButtonPrimitive's `className` — and never
    // the source text: this file's own comments name the removed
    // `focus-visible:ring-destructive/20` utility in prose, and a regex over
    // button.tsx would read that mention as the class still being there
    // (law 3 — spelling is not identity).
    //
    // FOLD (review M-1): the `cn()` here is load-bearing and its absence was a
    // real hole. `buttonVariants` is a BARE `cva()`; tailwind-merge runs only
    // inside `cn`. Reading the pre-merge concatenation meant the LAST-write-wins
    // behaviour this cell appeals to never ran in the instrument, so a
    // variant-level override of the ring-offset WIDTH, the ring-offset COLOUR or
    // the ring WIDTH was invisible to it. Measured on this branch: adding
    // `focus-visible:ring-offset-0` to the destructive variant leaves the raw
    // string carrying `ring-offset-2` and the merged string carrying only
    // `ring-offset-0` — 裁-64③'s 2px gap gone on the shipped control, whole
    // suite green. The ring-COLOUR axis was already safe (the doesNotMatch below
    // matches anywhere in the raw string); these three were not. Panel mutant
    // M18 is that exact override.
    for (const variant of ["default", "destructive", "ghost", "outline", "secondary", "link"] as const) {
      const cls = cn(buttonVariants({ variant }));
      assert.match(cls, /(?:^|\s)focus-visible:ring-offset-2(?:\s|$)/, variant);
      assert.match(cls, /(?:^|\s)focus-visible:ring-offset-background(?:\s|$)/, variant);
      assert.match(cls, /(?:^|\s)focus-visible:ring-3(?:\s|$)/, variant);
      assert.match(cls, /(?:^|\s)focus-visible:ring-ring\/70(?:\s|$)/, variant);
      // The destructive variant used to override the base ring colour at 20%
      // alpha — #f0d3d1, which measures 1.405:1 on #ffffff (and 1.192:1 against
      // the button's own bg-destructive/10 fill). tailwind-merge keeps the LAST
      // ring-colour utility, so that override WON; this is what proves it no
      // longer exists, on every variant including that one.
      assert.doesNotMatch(cls, /focus-visible:ring-destructive/, variant);
    }
  });

  it("M-1's premise, asserted rather than assumed: cn() is what applies tailwind-merge here", () => {
    // The cell above is only worth anything if `cn` really does collapse a
    // later same-axis utility while the bare cva output does not. If a future
    // `buttonVariants` gains its own merge, or `cn` loses it, this reds and the
    // cell above stops being a guard without anyone noticing.
    const withOverride = `${buttonVariants({ variant: "destructive" })} focus-visible:ring-offset-0`;
    assert.match(withOverride, /focus-visible:ring-offset-2/, "the RAW string keeps both — this is the blindness");
    assert.doesNotMatch(cn(withOverride), /focus-visible:ring-offset-2/, "cn must collapse it to the last one");
    assert.match(cn(withOverride), /focus-visible:ring-offset-0/);
  });
});
