#!/usr/bin/env node
/**
 * apps/web/scripts/check-token-contrast.mjs — GATE (a) of the three a11y CI
 * gates (owner ruling Q7, `docs/plan/active/mohe-grill-rulings-2026-08-27.md`
 * — "constructive token-level contrast"). Riding `apps/web`'s `lint` script
 * (no pipeline edit — AGENTS.md constraint 3's uniform ladder still runs the
 * lint job on every PR).
 *
 * WHAT "CONSTRUCTIVE" MEANS HERE: this script does not eyeball swatches. It
 * PARSES the live `--name: value;` declarations out of the FIRST `:root {…}`
 * block in `app/globals.css` (never a hand-copied hex table — token drift is
 * caught automatically the next run), resolves `var(--x)` chains to a
 * terminal hex literal, alpha-composites any `/NN` opacity utility over its
 * true rendered backdrop exactly the way a browser would (sRGB gamma-space
 * linear interpolation — the same math `bg-destructive/10` undergoes on
 * screen), and only THEN computes WCAG 2.1 relative luminance and contrast
 * ratio (the standard sRGB-linearized formula, §1.4.3 note 1 / §1.4.11).
 *
 * THE CLOSED-WORLD PAIR LIST (`PAIR_SPECS` below): which foreground sits on
 * which background is NOT invented — every entry was derived from a census
 * of actual `text-*`/`bg-*` (and their `/opacity` variants) co-occurring in
 * `apps/web/components/**` and `apps/web/app/**` (run 2026-08-27, the
 * grep this file's own header would reproduce:
 *   rg -n '(text|bg)-(background|foreground|card|card-foreground|popover|
 *   popover-foreground|primary|primary-foreground|secondary|secondary-
 *   foreground|muted|muted-foreground|accent|accent-foreground|destructive|
 *   canvas|shell|surface|surface-subtle|ink|brand|brand-foreground|brand-
 *   accent|secondary-ink|clara|clara-foreground|clara-muted|focus|
 *   interaction|success|success-foreground|success-muted|warning|warning-
 *   foreground|warning-muted|error|error-foreground|error-muted|info|info-
 *   foreground|info-muted|sidebar|sidebar-foreground|sidebar-primary|
 *   sidebar-accent)' apps/web/components apps/web/app
 * ). Each `PAIR_SPECS` entry carries a `source` comment citing the file(s)
 * that literally render it. This is a CLOSED world by design (Q7 asks for
 * "constructive token-level contrast", not an exhaustive live-DOM crawl —
 * that job belongs to gate (b), the axe scans) — adding a genuinely new
 * foreground/background combination to a component should extend this list
 * in the same PR, not silently escape the gate. Decorative, non-text pairs
 * (hairline `border-*` dividers, chart swatches — WCAG 1.4.11's "pure
 * decoration" exemption) are deliberately OUT of scope; the one non-text
 * pair kept in is the `:focus-visible` ring itself (globals.css names it by
 * hand), because a ring nobody can see is a keyboard-walk failure (gate (c))
 * wearing a contrast-gate disguise.
 *
 * WARN vs STRICT: two real pairs in the current token set fail their
 * threshold (see `main()`'s report) — the `text-destructive/80` code/reason
 * line in `components/bank/action-refusal.tsx` computes to a hair under
 * 4.5:1 once its own translucent alert box is correctly composited. Per Q7
 * + the owner's "ship in WARN mode" instruction, this gate REPORTS every
 * failing pair with its measured ratio and exits 0 by default — it never
 * silently adjusts a token (that is the polish lane's call, not this
 * script's). Pass `--strict` (a human or a later, tokens-fixed CI step) to
 * make a real failure exit 1.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Pure colour math — WCAG 2.1 §1.4.3 note 1's own formulas, nothing borrowed.
// ---------------------------------------------------------------------------

/** @param {string} hex e.g. "#1d4ed8" or "#fff" */
export function hexToRgb(hex) {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`not a hex colour: ${JSON.stringify(hex)}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const c = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function srgbChannelToLinear(c8bit) {
  const c = c8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio, 1:1..21:1, order-independent. */
export function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Alpha-composites `fgHex` at `alpha` (0..1) over the OPAQUE `overHex` —
 * the same non-linear sRGB blend `background-color: color-mix()`-free CSS
 * opacity (a Tailwind `/NN` utility) performs on screen: browsers blend
 * `rgba()` in gamma (non-linear, 0-255) space, not linear light space, so
 * this deliberately does NOT route through `relativeLuminance`'s linearizer.
 */
export function alphaBlend(fgHex, alpha, overHex) {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(overHex);
  const mix = (a, b) => a * alpha + b * (1 - alpha);
  return rgbToHex({ r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) });
}

// ---------------------------------------------------------------------------
// Token parsing — the FIRST `:root { … }` block only (the reduced-motion
// media query later in the file re-opens `:root` for three `--motion-
// duration-*` overrides; none of those are colours, and re-parsing that
// block would just re-assign the same names to the same non-colour values —
// harmless either way, but the non-greedy match below already stops at the
// first `}`, which is the real token block's own close, so it never reaches
// the second `:root`).
// ---------------------------------------------------------------------------

/** @returns {Map<string, string>} CSS custom-property name (no `--`) -> raw declared value */
export function parseRootTokens(cssText) {
  const match = cssText.match(/:root\s*\{([^}]*)\}/);
  if (!match) throw new Error("no :root { … } block found in globals.css");
  const body = match[1];
  const tokens = new Map();
  const decl = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = decl.exec(body))) {
    tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

/**
 * Resolves a token name to a terminal hex literal, chasing `var(--x)`
 * references (the token contract's own indirection, e.g. `--background:
 * var(--canvas)`). Throws on a cycle, a missing name, or a non-colour value
 * (a radius/spacing/duration token has no business in a contrast pair —
 * that is a `PAIR_SPECS` authoring bug, and this fails loudly rather than
 * silently comparing garbage).
 */
export function resolveTokenHex(tokens, name, depth = 0) {
  if (depth > 10) throw new Error(`token var() cycle resolving --${name}`);
  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`unknown token: --${name}`);
  const varRef = raw.match(/^var\(--([\w-]+)\)$/);
  if (varRef) return resolveTokenHex(tokens, varRef[1], depth + 1);
  if (/^#[0-9a-fA-F]{3,6}$/.test(raw)) return raw.toLowerCase();
  throw new Error(`--${name} is not a hex colour or var() reference: ${JSON.stringify(raw)}`);
}

// ---------------------------------------------------------------------------
// The closed-world pair list.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   fg: (hex: (name: string) => string, composite: (fgToken: string, alpha: number, overHex: string) => string) => string,
 *   bg: (hex: (name: string) => string, composite: (fgToken: string, alpha: number, overHex: string) => string) => string,
 *   threshold: 4.5 | 3,
 *   source: string,
 * }} PairSpec
 */

/** @type {PairSpec[]} */
export const PAIR_SPECS = [
  // --- Base surface pairs: the foundation almost every screen rests on ---
  { id: "foreground-on-background", fg: (h) => h("foreground"), bg: (h) => h("background"), threshold: 4.5,
    source: "globals.css @layer base — body { bg-background text-foreground }" },
  { id: "card-foreground-on-card", fg: (h) => h("card-foreground"), bg: (h) => h("card"), threshold: 4.5,
    source: "every bg-card panel's default text — components/ui/card.tsx, PartSummaryCard, GateCheckRow, needs-you-row, ArtifactRow, CloseReceiptPanel dt/dd" },
  { id: "popover-foreground-on-popover", fg: (h) => h("popover-foreground"), bg: (h) => h("popover"), threshold: 4.5,
    source: "components/ui/command.tsx, components/ui/dialog.tsx, components/ui/select.tsx (bg-popover text-popover-foreground)" },
  { id: "secondary-foreground-on-secondary", fg: (h) => h("secondary-foreground"), bg: (h) => h("secondary"), threshold: 4.5,
    source: "components/ui/button.tsx secondary variant, components/ui/badge.tsx secondary variant" },

  // --- Interactive-control pairs ---
  { id: "primary-foreground-on-primary", fg: (h) => h("primary-foreground"), bg: (h) => h("primary"), threshold: 4.5,
    source: "components/ui/button.tsx default variant, components/bank/bank-workbench.tsx active tab, components/firm/needs-you-row.tsx approve button" },
  { id: "accent-foreground-on-accent", fg: (h) => h("accent-foreground"), bg: (h) => h("accent"), threshold: 4.5,
    source: "components/ui/select.tsx item focus:bg-accent focus:text-accent-foreground; components/ui/command.tsx selected item" },
  { id: "sidebar-foreground-on-sidebar", fg: (h) => h("sidebar-foreground"), bg: (h) => h("sidebar"), threshold: 4.5,
    source: "app/(firm)/layout.tsx aside (bg-sidebar) + components/firm-nav.tsx base link state (text-sidebar-foreground)" },
  { id: "sidebar-accent-foreground-on-sidebar-accent", fg: (h) => h("sidebar-accent-foreground"), bg: (h) => h("sidebar-accent"), threshold: 4.5,
    source: "components/firm-nav.tsx hover/active state (hover:bg-sidebar-accent hover:text-sidebar-accent-foreground). Resolves to the same hex as accent-foreground-on-accent today — kept as its own pair because the token contract keeps the roles separate on purpose (globals.css header)." },

  // --- Muted/caption text on its actually-consumed ambients ---
  { id: "muted-foreground-on-background", fg: (h) => h("muted-foreground"), bg: (h) => h("background"), threshold: 4.5,
    source: "the single most common caption/label pairing with no local bg — dozens of files, e.g. components/documents/document-evidence.tsx, components/close/FiscalYearPicker.tsx" },
  { id: "muted-foreground-on-card", fg: (h) => h("muted-foreground"), bg: (h) => h("card"), threshold: 4.5,
    source: "the same caption style inside a bg-card row — components/firm/needs-you-row.tsx dl, components/reports/ArtifactRow.tsx dt, components/close/CloseReceiptPanel.tsx dt" },
  { id: "muted-foreground-on-muted", fg: (h) => h("muted-foreground"), bg: (h) => h("muted"), threshold: 4.5,
    source: "text-muted-foreground inside an explicit muted box — components/bank/exceptions-section.tsx, components/bank/settle-line-form.tsx, components/bank/write-off-form.tsx (bg-muted/30) and components/ui/table.tsx header row (bg-muted/50)" },
  { id: "foreground-on-muted", fg: (h) => h("foreground"), bg: (h) => h("muted"), threshold: 4.5,
    source: "the active-tab state — components/client-workspace-nav.tsx and components/registers/registers-workbench.tsx (bg-muted text-foreground)" },
  { id: "foreground-on-clara-muted", fg: (h) => h("foreground"), bg: (h) => h("clara-muted"), threshold: 4.5,
    source: "components/clara/ClaraThreadView.tsx assistant chat bubble (bg-clara-muted, default/inherited text colour)" },

  // --- Brand/Clara accent text ---
  { id: "clara-on-card", fg: (h) => h("clara"), bg: (h) => h("card"), threshold: 4.5,
    source: "components/clara/ClaraRail.tsx and ClaraFullScreenThread.tsx heading (text-clara) on the rail/full-screen chrome" },
  { id: "primary-on-background", fg: (h) => h("primary"), bg: (h) => h("background"), threshold: 4.5,
    source: "inline text links — components/firm/client-register-list.tsx, components/firm/needs-you-row.tsx, components/journals/journals-workbench.tsx retry, components/registers/knowledge-panel.tsx (text-primary underline)" },

  // --- Semantic state colours: plain text AND their own -muted containers ---
  { id: "warning-on-background", fg: (h) => h("warning"), bg: (h) => h("background"), threshold: 4.5,
    source: "components/journals/drafts-queue-panel.tsx highStakes/linesTruncated, components/firm/client-register-list.tsx factsUnavailableNote, components/documents/upload-panel.tsx hint, components/registers/fixed-assets-register.tsx incompleteNote, components/journals/entry-lines-editor.tsx unbalanced cell" },
  { id: "warning-on-warning-muted", fg: (h) => h("warning"), bg: (h) => h("warning-muted"), threshold: 4.5,
    source: "components/parts/PartRenderer.tsx status-pill chip (border-warning/40 bg-warning-muted text-warning)" },
  { id: "error-on-background", fg: (h) => h("error"), bg: (h) => h("background"), threshold: 4.5,
    source: "the dominant plain text-destructive/text-error usage — components/close/FiscalYearPicker.tsx, components/journals/journals-workbench.tsx, components/journals/compose-dialog.tsx, components/journals/posted-panel.tsx, components/login-form.tsx, components/invite-accept-form.tsx, components/reports/ExportRecipientsPanel.tsx, components/reports/ArtifactRow.tsx, components/reports/ReportAgentReceiptsPanel.tsx, components/reports/StatutoryReportsPanel.tsx, components/bank/matching-section.tsx, components/bank/statements-section.tsx, components/bank/settle-line-form.tsx, components/bank/write-off-form.tsx, components/firm/data-state.tsx, components/documents/document-metadata.tsx" },
  { id: "error-on-error-muted", fg: (h) => h("error"), bg: (h) => h("error-muted"), threshold: 4.5,
    source: "components/parts/PartRenderer.tsx error box, components/documents/door-feedback.tsx, components/close/ClosePlanPanel.tsx mismatch box, components/reports/StatutoryReportsPanel.tsx notice, components/firm/data-state.tsx error variant, components/parts/PartBadge.tsx error chip" },
  { id: "destructive-full-on-destructive-5-box", fg: (h) => h("destructive"),
    bg: (h, composite) => composite("destructive", 0.05, h("background")),
    threshold: 4.5,
    source: "components/bank/action-refusal.tsx main message <p>{err}</p> and components/bank/reconciliation-section.tsx stale-box — both `border-destructive/30 bg-destructive/5 ... text-destructive` (full-opacity text over the alert box's own 5%-tint background, composited over the page's white canvas)" },
  { id: "destructive-80pct-on-destructive-5-box", fg: (h, composite) => composite("destructive", 0.8, composite("destructive", 0.05, h("background"))),
    bg: (h, composite) => composite("destructive", 0.05, h("background")),
    threshold: 4.5,
    source: "components/bank/action-refusal.tsx `<p className=\"text-xs text-destructive/80\">{clr.code}…</p>` — the door-refusal code/reason line, at 80% text opacity over the SAME 5%-tint alert box. KNOWN VIOLATION as of 2026-08-27 (see main()'s WARN-mode report) — do not silently fix the ratio here; flip via the token/opacity choice in that component (polish lane), then this pair should start passing on its own." },
  { id: "success-on-background", fg: (h) => h("success"), bg: (h) => h("background"), threshold: 4.5,
    source: "components/documents/correction-wizard.tsx \"done\" message (text-success)" },
  { id: "info-on-background", fg: (h) => h("info"), bg: (h) => h("background"), threshold: 4.5,
    source: "components/firm/data-state.tsx info variant (text-info)" },
  { id: "info-on-info-muted", fg: (h) => h("info"), bg: (h) => h("info-muted"), threshold: 4.5,
    source: "components/parts/PartBadge.tsx info chip (bg-info-muted text-info)" },

  // --- The one non-text pair: the visible focus ring itself (WCAG 1.4.11 /
  // 2.4.7 UI-component threshold, 3:1). Named by hand because gate (c)'s
  // keyboard walks assert this ring is VISIBLE — a ring that fails contrast
  // against its own surface is a keyboard-walk failure wearing this gate's
  // clothing, so it is checked here where the token declares it.
  { id: "focus-ring-on-background", fg: (h) => h("focus"), bg: (h) => h("background"), threshold: 3,
    source: "globals.css :focus-visible { outline: … solid var(--focus); } against the canvas/card/popover surfaces (all #ffffff in this token set) it is drawn on" },
  { id: "focus-ring-on-shell", fg: (h) => h("focus"), bg: (h) => h("shell"), threshold: 3,
    source: "the same :focus-visible ring against app/(firm)/layout.tsx's bg-shell chrome and components/firm-nav.tsx's bg-sidebar (== shell)" },
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** @typedef {{ id: string, fgHex: string, bgHex: string, ratio: number, threshold: 4.5 | 3, pass: boolean, source: string }} PairResult */

/**
 * @param {Map<string, string>} tokens
 * @param {PairSpec[]} [specs]
 * @returns {PairResult[]}
 */
export function evaluatePairs(tokens, specs = PAIR_SPECS) {
  const hex = (name) => resolveTokenHex(tokens, name);
  const composite = (fgToken, alpha, overHex) => alphaBlend(hex(fgToken), alpha, overHex);

  return specs.map((spec) => {
    const fgHex = spec.fg(hex, composite);
    const bgHex = spec.bg(hex, composite);
    const ratio = contrastRatio(fgHex, bgHex);
    return {
      id: spec.id,
      fgHex,
      bgHex,
      ratio: Math.round(ratio * 100) / 100,
      threshold: spec.threshold,
      pass: ratio >= spec.threshold - 1e-9,
      source: spec.source,
    };
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const GLOBALS_CSS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "globals.css",
);

export function main(argv = process.argv.slice(2)) {
  const strict = argv.includes("--strict");
  const cssText = readFileSync(GLOBALS_CSS_PATH, "utf8");
  const tokens = parseRootTokens(cssText);
  const results = evaluatePairs(tokens);
  const failing = results.filter((r) => !r.pass);

  console.log(`[check-token-contrast] evaluated ${results.length} declared foreground/background pairs from app/globals.css`);
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`  [${status}] ${r.id} — ${r.ratio}:1 (needs ${r.threshold}:1) — ${r.fgHex} on ${r.bgHex}`);
  }

  if (failing.length === 0) {
    console.log(`[check-token-contrast] all pairs meet WCAG 2.1 AA.`);
    return 0;
  }

  console.log("");
  console.log(`[check-token-contrast] ${failing.length} pair(s) below their WCAG 2.1 AA threshold:`);
  for (const r of failing) {
    console.log(`  - ${r.id} (${r.source}): measured ${r.ratio}:1, needs ${r.threshold}:1 — ${r.fgHex} on ${r.bgHex}`);
  }
  console.log("");
  console.log(
    strict
      ? "[check-token-contrast] --strict set: failing the build. Fix the token/opacity choice, never this script."
      : "[check-token-contrast] WARN mode (default): not failing the build. Pass --strict once the polish lane retires the pairs above. This script never adjusts a token itself.",
  );

  return strict ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
