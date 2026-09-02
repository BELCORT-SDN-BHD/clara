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
 * `apps/web/components/**` and `apps/web/app/**` (re-run 2026-08-27 against
 * the POLISHED tree — the P3 finale fold-seam pass — the grep this file's
 * own header would reproduce:
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
 * THE P3 FINALE RE-CENSUS (fold-seam truing against the polished tree):
 *   RETIRED — `destructive-full-on-destructive-5-box` and
 *   `destructive-80pct-on-destructive-5-box`: their sole sources
 *   (`components/bank/action-refusal.tsx`'s message,
 *   `components/bank/reconciliation-section.tsx`'s stale-box) no longer
 *   render a bespoke `bg-destructive/5` tinted box at all — the P3 polish
 *   moved both onto the shared `<StateBanner tone="error">`
 *   (`components/common/state.tsx`), whose own `border-error/30
 *   bg-error-muted text-error` markup is the ALREADY-covered
 *   `error-on-error-muted` pair below. `RETIRED` — `info-on-background`:
 *   its sole source (`components/firm/data-state.tsx`'s bare `text-info`
 *   info variant) was likewise folded into `<StateBanner tone="info">`
 *   (`bg-info-muted text-info`) — the already-covered `info-on-info-muted`
 *   pair. Grepping the polished tree for a bare, unboxed `text-info` or
 *   `text-destructive/[0-9]+` confirms zero remaining consumers of either
 *   retired shape.
 *   ADDED — `destructive-on-destructive-10`: the shadcn `destructive`
 *   variant of `components/ui/button.tsx`/`components/ui/badge.tsx`
 *   (`bg-destructive/10 text-destructive`) is heavily consumed (void/legal-
 *   hold/uncertified/claim-removed badges, the reconciliation void action,
 *   the statements/posted-panel reversal buttons) and was never in the
 *   original 26-pair census — a genuine gap, not a polish-introduced shape.
 *   `error-on-card`: `StateBanner`'s own `code` chip
 *   (`border-current/25 bg-card`, inheriting the tone's `text-error`) is a
 *   real new co-occurrence — the pre-polish code line rendered dimmed text
 *   directly on the tinted alert box (the now-retired `destructive-80pct`
 *   pair); the polish moved the code onto its own `bg-card` chip instead
 *   (`components/common/state.tsx`'s own header explains why: "a tinted
 *   chip on a tinted banner has no visible edge"). `clara-on-background`:
 *   the P3 "canvas swap" (`app/(firm)/layout.tsx`'s content column moved off
 *   `--shell` onto `--background`, see that file's own TOKEN-ROLE FIX note)
 *   means `components/clara/ClaraFullScreenThread.tsx`'s `text-clara`
 *   heading now sits on `--background` rather than a `bg-card` chrome —
 *   kept as its own pair rather than folded into `clara-on-card` (which
 *   stays real via `components/clara/ClaraRail.tsx`'s `bg-card` panel) for
 *   the same token-drift reason `sidebar-accent-foreground-on-sidebar-accent`
 *   is kept separate from `accent-foreground-on-accent` below, even though
 *   both resolve to the same hex today.
 *   Several KEPT pairs had their `source` comments trued to the polished
 *   call sites (a stale citation — e.g. a file that moved onto SectionTabs
 *   or StateBanner — does not retire the PAIR when another real consumer
 *   still renders it; it just needed its citation corrected).
 *
 * Every pair below PASSES today — the P3 finale fold retired the one
 * pre-existing near-miss (see RETIRED, above) rather than nudging its
 * ratio, so the gate has no WARN carve-out left to keep: `main()` now fails
 * the build on ANY failing pair, unconditionally (no `--strict` flag to
 * pass or forget).
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
  // Comments are stripped FIRST, unconditionally. `app/globals.css`'s own
  // FOCUS TREATMENT note (the `:root` block's longest comment) quotes real
  // CSS containing a literal "}" — `outline: 2px solid var(--focus);
  // outline-offset: 2px; }` — and the match below, which stops at the FIRST
  // `}` it can reach, used to stop right there: every token declared after
  // that comment (`--foreground` included) silently never made it into the
  // returned Map, surfacing downstream as `unknown token: --foreground`
  // rather than as a parsing bug. A real CSS parser discards comments
  // before it ever looks at block structure; this now does too, so a
  // documentation comment can never again masquerade as the block's own
  // closing brace.
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const match = withoutComments.match(/:root\s*\{([^}]*)\}/);
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
    source: "globals.css @layer base — body { bg-background text-foreground }. Also the real, literal ambient for every P3 firm-shell page's content column since the P3 polish's canvas-swap TOKEN-ROLE FIX (app/(firm)/layout.tsx's content <div> moved off --shell onto --background) — previously this pair was true only of <body> itself; now every page's own content genuinely renders against it." },
  { id: "card-foreground-on-card", fg: (h) => h("card-foreground"), bg: (h) => h("card"), threshold: 4.5,
    source: "every bg-card panel's default text — components/ui/card.tsx, PartSummaryCard, GateCheckRow, needs-you-row, ArtifactRow, CloseReceiptPanel dt/dd" },
  { id: "popover-foreground-on-popover", fg: (h) => h("popover-foreground"), bg: (h) => h("popover"), threshold: 4.5,
    source: "components/ui/command.tsx, components/ui/dialog.tsx, components/ui/select.tsx (bg-popover text-popover-foreground)" },
  { id: "secondary-foreground-on-secondary", fg: (h) => h("secondary-foreground"), bg: (h) => h("secondary"), threshold: 4.5,
    source: "components/ui/button.tsx secondary variant, components/ui/badge.tsx secondary variant" },

  // --- Interactive-control pairs ---
  { id: "primary-foreground-on-primary", fg: (h) => h("primary-foreground"), bg: (h) => h("primary"), threshold: 4.5,
    source: "components/ui/button.tsx default variant (bg-primary text-primary-foreground), components/ui/badge.tsx default variant, components/firm/needs-you-row.tsx's approve/resolve <Button> (no variant prop — the default). components/bank/bank-workbench.tsx's active tab moved off this pattern onto the shared components/common/section-tabs.tsx underline in the P3 polish (that file's own header note: \"the filled-primary pill strip became the shared <SectionTabs> underline\")." },
  { id: "accent-foreground-on-accent", fg: (h) => h("accent-foreground"), bg: (h) => h("accent"), threshold: 4.5,
    source: "components/ui/select.tsx item focus:bg-accent focus:text-accent-foreground. components/ui/command.tsx's own selected item moved onto data-selected:bg-muted data-selected:text-foreground in the P3 polish (now a foreground-on-muted consumer, below) — select.tsx alone keeps this pair real." },
  { id: "sidebar-foreground-on-sidebar", fg: (h) => h("sidebar-foreground"), bg: (h) => h("sidebar"), threshold: 4.5,
    source: "app/(firm)/layout.tsx <aside> (bg-sidebar) + components/firm-nav.tsx base link state (text-sidebar-foreground) — the sidebar itself is the one chrome surface the P3 canvas-swap deliberately left on --shell (== --sidebar)" },
  { id: "sidebar-accent-foreground-on-sidebar-accent", fg: (h) => h("sidebar-accent-foreground"), bg: (h) => h("sidebar-accent"), threshold: 4.5,
    source: "components/firm-nav.tsx hover/active state (hover:bg-sidebar-accent hover:text-sidebar-accent-foreground). Resolves to the same hex as accent-foreground-on-accent today — kept as its own pair because the token contract keeps the roles separate on purpose (globals.css header)." },

  // --- Muted/caption text on its actually-consumed ambients ---
  { id: "muted-foreground-on-background", fg: (h) => h("muted-foreground"), bg: (h) => h("background"), threshold: 4.5,
    source: "the single most common caption/label pairing with no local bg — dozens of files, e.g. components/documents/document-evidence.tsx, components/close/FiscalYearPicker.tsx" },
  { id: "muted-foreground-on-card", fg: (h) => h("muted-foreground"), bg: (h) => h("card"), threshold: 4.5,
    source: "the same caption style inside a bg-card row — components/firm/needs-you-row.tsx dl, components/reports/ArtifactRow.tsx dt, components/close/CloseReceiptPanel.tsx dt" },
  { id: "muted-foreground-on-muted", fg: (h) => h("muted-foreground"), bg: (h) => h("muted"), threshold: 4.5,
    source: "text-muted-foreground inside an explicit muted box — components/bank/exceptions-section.tsx, components/bank/settle-line-form.tsx, components/bank/write-off-form.tsx (bg-muted/30) and components/ui/table.tsx header row (bg-muted/50); also components/parts/PartBadge.tsx's neutral chip variant (bg-muted text-muted-foreground)" },
  { id: "foreground-on-muted", fg: (h) => h("foreground"), bg: (h) => h("muted"), threshold: 4.5,
    source: "the active-tab state — components/client-workspace-nav.tsx (bg-muted text-foreground); the P3-polished components/ui/command.tsx CommandItem's own selected state (data-selected:bg-muted data-selected:text-foreground, moved off accent tokens). registers-workbench.tsx's former copy of the active-tab pattern moved onto the shared components/common/section-tabs.tsx (a border-primary indicator, not a muted fill), which does not render this pair." },
  { id: "foreground-on-clara-muted", fg: (h) => h("foreground"), bg: (h) => h("clara-muted"), threshold: 4.5,
    source: "components/clara/ClaraThreadView.tsx assistant chat bubble (bg-clara-muted, default/inherited text colour)" },
  { id: "secondary-ink-on-clara-muted", fg: (h) => h("secondary-ink"), bg: (h) => h("clara-muted"), threshold: 4.5,
    source: "components/clara/InterviewRunCard.tsx's per-turn thread role label (\"Clara · <seg>\") on the clara-role bubble — the live 裁-86 browser walk's axe scan caught the PRIOR text-muted-foreground choice at 4.49:1 on this ground (a blind spot: no PAIR_SPECS row had ever paired muted-foreground with clara-muted specifically), so this pairing is now pinned rather than left to a live-DOM-only gate." },

  // --- Brand/Clara accent text ---
  // The Clara transcript's OTHER bubble ground. Added by P6-3 after its axe leg
  // caught `text-muted-foreground` at 4.493:1 on bg-clara-muted in
  // ClaraThreadView — the identical defect the 裁-86 walk had already found and
  // fixed in InterviewRunCard one file away, which the row above pins. That the
  // same pairing could regress in a sibling component with no gate noticing is
  // why the user bubble's ground is pinned now too, not only the one that
  // actually failed.
  { id: "secondary-ink-on-muted", fg: (h) => h("secondary-ink"), bg: (h) => h("muted"), threshold: 4.5,
    source: "A DECLARED SENTINEL AS OF THE #508 MERGE, and it was a census row before it — the change is recorded rather than the row silently kept. P6-3 added this because it moved BOTH of ClaraThreadView's speaker labels to secondary-ink; #508 landed first with a CONDITIONAL (`text-muted-foreground` for the user role on bg-muted, `text-secondary-ink` for the Clara role on bg-clara-muted) and that merged decision was kept, so the user bubble is covered by muted-foreground-on-muted above and nothing renders secondary-ink on --muted today (re-censused at the merge: the only two secondary-ink call sites, here and InterviewRunCard, both sit on bg-clara-muted). Pinned anyway because these two labels have already drifted apart once and the day they unify this row is what measures the ground they unify onto" },
  { id: "clara-on-card", fg: (h) => h("clara"), bg: (h) => h("card"), threshold: 4.5,
    source: "components/clara/ClaraRail.tsx heading (text-clara) on the docked rail's own bg-card panel" },
  { id: "clara-on-background", fg: (h) => h("clara"), bg: (h) => h("background"), threshold: 4.5,
    source: "components/clara/ClaraFullScreenThread.tsx heading (text-clara), whose <header> carries no background of its own and inherits the full-screen container's bg-background — a distinct real pair from clara-on-card above since the P3 polish's canvas swap, even though both resolve to the same hex today (same token-drift rationale as sidebar-accent-foreground-on-sidebar-accent)." },
  { id: "primary-on-background", fg: (h) => h("primary"), bg: (h) => h("background"), threshold: 4.5,
    source: "inline text links — components/firm/client-register-list.tsx, components/firm/needs-you-row.tsx (text-primary underline)" },
  { id: "primary-on-card", fg: (h) => h("primary"), bg: (h) => h("card"), threshold: 4.5,
    source: "components/parts/PartSummaryCard.tsx's optional `link` (text-primary underline) — the SAME inline-link idiom as primary-on-background above, but drawn inside the receipt card's own bg-card panel, so it is its own pair for the same token-drift reason clara-on-card/clara-on-background are two entries. Consumed by the four chatTurn_v14 receipt cards (MBB-4): entry_posted's journals link and question_opened's Needs-you link." },

  // --- Semantic state colours: plain text AND their own -muted containers ---
  { id: "warning-on-background", fg: (h) => h("warning"), bg: (h) => h("background"), threshold: 4.5,
    source: "components/journals/drafts-queue-panel.tsx highStakes/linesTruncated, components/firm/client-register-list.tsx factsUnavailableNote, components/documents/upload-panel.tsx hint, components/registers/fixed-assets-register.tsx incompleteNote, components/journals/entry-lines-editor.tsx unbalanced cell" },
  { id: "warning-on-warning-muted", fg: (h) => h("warning"), bg: (h) => h("warning-muted"), threshold: 4.5,
    source: "components/parts/PartBadge.tsx warning chip (border-warning/40 bg-warning-muted text-warning), consumed by PartRenderer.tsx's status-pill fallback (<Badge tone=\"warning\">)" },
  { id: "error-on-background", fg: (h) => h("error"), bg: (h) => h("background"), threshold: 4.5,
    source: "the surviving BARE (unboxed) text-error usage — components/documents/upload-panel.tsx per-file error line, components/reports/ArtifactRow.tsx byteSizeInvalid note, components/reports/FreeformReadsPanel.tsx refusal_reason, components/reports/ReportAgentReceiptsPanel.tsx refusal_token. Every other former bare-text-error surface (FiscalYearPicker, journals-workbench, compose-dialog, posted-panel, login-form, invite-accept-form, matching-section, statements-section, settle-line-form, write-off-form, data-state.tsx, document-metadata.tsx, ExportRecipientsPanel, StatutoryReportsPanel) moved onto the shared StateBanner box in the P3 polish — already covered by error-on-error-muted and error-on-card below." },
  { id: "error-on-error-muted", fg: (h) => h("error"), bg: (h) => h("error-muted"), threshold: 4.5,
    source: "the canonical shape: components/common/state.tsx's TONE_CLASS.error (border-error/30 bg-error-muted text-error), rendered via <StateBanner tone=\"error\"> at every governed-door-refusal/read-error call site in the app (action-refusal.tsx, compose-dialog.tsx, PartRenderer.tsx, posted-panel.tsx, drafts-queue-panel.tsx, data-state.tsx's ErrorMessage, ExportRecipientsPanel.tsx, CloseReceiptPanel.tsx, ClosePlanPanel.tsx, StatutoryReportsPanel.tsx, door-feedback.tsx); also components/parts/PartBadge.tsx's own error chip." },
  { id: "error-on-muted-50", fg: (h) => h("error"), bg: (h, composite) => composite("muted", 0.50, h("background")), threshold: 4.5,
    source: "components/common/money-input.tsx's text-error refusal when shipped by components/bank/settle-line-form.tsx inside its explicit bg-muted/50 settlement panel." },
  { id: "error-on-card", fg: (h) => h("error"), bg: (h) => h("card"), threshold: 4.5,
    source: "components/common/state.tsx StateBanner's own `code` chip (border-current/25 bg-card, inheriting the banner's text-error) — every governed refusal's CLR code/reason line now renders here instead of dimmed prose on the tinted box (the retired destructive-80pct-on-destructive-5-box pattern). Real at every `code=` call site: action-refusal.tsx, compose-dialog.tsx, PartRenderer.tsx, posted-panel.tsx, drafts-queue-panel.tsx, data-state.tsx, ExportRecipientsPanel.tsx, CloseReceiptPanel.tsx, ClosePlanPanel.tsx, StatutoryReportsPanel.tsx, door-feedback.tsx — all tone=\"error\"." },
  { id: "error-on-popover", fg: (h) => h("error"), bg: (h) => h("popover"), threshold: 4.5,
    source: "components/common/money-input.tsx's text-error refusal inside the bg-popover dialog surfaces shipped by components/registers/ApplyOpenItemsDialog.tsx, components/registers/fa-row-actions.tsx, and components/journals/compose-dialog.tsx." },
  { id: "destructive-on-destructive-10", fg: (h) => h("destructive"), bg: (h, composite) => composite("destructive", 0.10, h("background")), threshold: 4.5,
    source: "the shadcn destructive variant (components/ui/button.tsx, components/ui/badge.tsx: bg-destructive/10 text-destructive, full-opacity text over a 10%-tint background composited on the page canvas) — components/bank/reconciliation-section.tsx void status/tie-variance badges and its own destructive void button, components/bank/agency-section.tsx hold badge/button, components/bank/statements-section.tsx void badge and reversal button, components/close/CloseReceiptPanel.tsx not-verified badge, components/documents/filed-document-list.tsx legal-hold badge, components/journals/posted-panel.tsx reversal button, components/reports/ArtifactRow.tsx claim-removed/uncertified badges, components/reports/FreeformReadsPanel.tsx and ReportAgentReceiptsPanel.tsx refused/non-done outcome badges." },
  { id: "success-on-background", fg: (h) => h("success"), bg: (h) => h("background"), threshold: 4.5,
    source: "components/documents/correction-wizard.tsx \"done\" message (text-success)" },
  { id: "info-on-info-muted", fg: (h) => h("info"), bg: (h) => h("info-muted"), threshold: 4.5,
    source: "components/parts/PartBadge.tsx info chip (bg-info-muted text-info); components/common/state.tsx TONE_CLASS.info (border-info/30 bg-info-muted text-info), rendered via <StateBanner tone=\"info\"> — e.g. data-state.tsx's ErrorMessage no_session state, which moved onto this boxed shape in the P3 polish (formerly a bare text-info line, now retired as its own pair — see the RETIRED note above)." },

  // --- Text on the R2 / 裁-2 identity canvas — the (entry) route group's own
  // ground. Ten pairs at 4.5:1, added by P4-3 when `--identity-canvas` was
  // bridged into @theme and `app/(entry)/layout.tsx` began rendering on it.
  // Before that bridge no utility could reach the token, so there was no
  // consumed pair to gate; now there is exactly one layout, and these are the
  // text roles the four entry faces draw on it.
  //
  // MEASURED, NOT TRANSCRIBED. Every ratio below was re-measured on this branch
  // with THIS file's own parseRootTokens/resolveTokenHex/contrastRatio, and each
  // agreed with annex 1 §C.2 to three decimals — foreground 14.355 · brand
  // 11.010 · secondary-ink 7.297 · clara 6.339 · warning 6.283 · primary 6.197 ·
  // error 6.079 · destructive 6.079 · success 5.703 · muted-foreground 4.636,
  // the last being the tightest and the reason this set is worth pinning at all.
  //
  // WHY TEN AND NOT ELEVEN — the one judgement call in this block, recorded
  // because §C.2 writes its list as nine `·`-separated entries, two of which
  // name two tokens ("primary/interaction", "error/destructive"). Expanding both
  // gives eleven; expanding neither gives nine. The rule applied here is the one
  // this file already uses elsewhere: **an alias chain is ONE role; two
  // independent literals are TWO.** `--primary: var(--interaction)` is an alias
  // — one role wearing two names, and a row for each would be the same
  // declaration measured twice. `--error: #b42318` and `--destructive: #b42318`
  // are two SEPARATE literals that merely coincide today, exactly like
  // clara-on-card/clara-on-background and sidebar-accent above, and either can
  // be retuned without the other. So: primary collapses, error/destructive does
  // not, and the count is ten. Reported to the lead as an open question rather
  // than settled unilaterally — if the intended ten differ, this block is one
  // edit and no ratio changes.
  //
  // NO COMPOSITED FOCUS ROW IS ADDED HERE, deliberately (plan §6 OQ-7, 裁-64 ④).
  // The halo is still `ring-ring/50` on this tip and §C.1 measured it failing
  // 3:1 against every ground it is drawn on — cream 2.317, and white 2.363, so
  // the failure is ground-INDEPENDENT and not something the cream ground
  // introduces. A cream focus row here would assert a composition that does not
  // ship. P6-3 lands the 70% recut and its six composited rows together.
  { id: "foreground-on-identity-canvas", fg: (h) => h("foreground"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "the default body text of every card and every prose line on the five (entry) faces, wherever it is drawn on the group's ground rather than inside the white card — app/(entry)/layout.tsx (bg-identity-canvas)" },
  { id: "brand-on-identity-canvas", fg: (h) => h("brand"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "components/entry/brand-lockup.tsx — the wordmark (font-serif text-brand) sitting directly on the canvas above the card, the ONE element on these pages drawn on the ground with no card between" },
  { id: "secondary-ink-on-identity-canvas", fg: (h) => h("secondary-ink"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "the secondary prose role on the same ground; kept as its own row for the token-drift reason this file applies throughout — --secondary-ink is an independent literal, not an alias of --ink" },
  { id: "clara-on-identity-canvas", fg: (h) => h("clara"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "the Clara accent role on the entry ground — pinned with the rest of §C.2's measured set so a --clara retune cannot silently fail on the one ground no other pair covers" },
  { id: "warning-on-identity-canvas", fg: (h) => h("warning"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "components/common/state.tsx's StateBanner tone=\"warning\" (text-warning) as the holding page renders it for a REJECTED registration — components/entry/holding-card.tsx" },
  { id: "primary-on-identity-canvas", fg: (h) => h("primary"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "the inline-link idiom on the entry faces (text-primary underline) — components/login-form.tsx's 裁-57 sign-up link and components/entry/signup-account-form.tsx's two sign-in links. --primary aliases --interaction, so this ONE row covers both names (see the note above)" },
  { id: "error-on-identity-canvas", fg: (h) => h("error"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "StateBanner tone=\"error\" (text-error) on the entry faces — signup's verbatim door refusals (components/entry/signup-firm-form.tsx) and the holding page's two fail-closed branches" },
  { id: "destructive-on-identity-canvas", fg: (h) => h("destructive"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "the shadcn destructive text role on the same ground. Resolves to the same hex as --error today and is kept separate for the same token-drift reason clara-on-card/clara-on-background are two entries — the two are independent literals in globals.css, not an alias pair" },
  { id: "success-on-identity-canvas", fg: (h) => h("success"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "the success text role on the entry ground, pinned with the rest of §C.2's set" },
  { id: "muted-foreground-on-identity-canvas", fg: (h) => h("muted-foreground"), bg: (h) => h("identity-canvas"), threshold: 4.5,
    source: "THE TIGHTEST PAIR IN THIS BLOCK (4.636 against a 4.5 bar — 0.136 of headroom). The caption/hint role, and the most-used text colour on these faces: NotBuiltNote's body, signup's note hint, the sign-in and sign-up link lines. A --muted-readable retune of even one step reds here first, which is exactly what this row is for" },

  // --- THE FOCUS INDICATORS (WCAG 1.4.11 / 2.4.7 UI-component threshold, 3:1).
  //
  // There are TWO of them in this product and this block gates both, which is
  // the P6-3 correction. Before that train these two rows were the whole story
  // and they measured only the SOLID `--focus` token — the flat `:focus-visible`
  // outline. Twelve components draw a TRANSLUCENT halo instead, and no pair saw
  // it: the gate was green on a treatment that was not there, while the halo it
  // could not see sat at 2.363:1 on white (50% alpha) and 2.245:1 on the worst
  // gated ground. 裁-1 recut the alpha to 70% and the nine composited rows below
  // are what make that recut MEASURED rather than asserted.
  //
  // (1) THE FALLBACK OUTLINE — solid --focus, `outline: 2px solid var(--focus)`
  // in globals.css's `@layer base`. It is the indicator for every focusable
  // element that does NOT carry the shadcn ring idiom, and it is kept
  // deliberately (see that file's FOCUS TREATMENT note). These two rows are
  // scoped to it and say so; they make no claim about the halo.
  { id: "focus-ring-on-background", fg: (h) => h("focus"), bg: (h) => h("background"), threshold: 3,
    source: "THE BASE OUTLINE ONLY, not the ring: globals.css @layer base `:focus-visible { outline: var(--focus-ring-width) solid var(--focus) }`, against the canvas/card/popover surfaces (all #ffffff in this token set). This is what a plain link, list row or `<summary>` draws — anything without the shadcn idiom. The halo those twelve components draw instead is the focus-ring-70-* block below." },
  { id: "focus-ring-on-shell", fg: (h) => h("focus"), bg: (h) => h("shell"), threshold: 3,
    source: "THE BASE OUTLINE ONLY: the same `:focus-visible` rule against app/(firm)/layout.tsx's <aside> (bg-sidebar) and components/firm-nav.tsx's links — both alias --shell, and firm-nav's links carry no ring utility, so this rule is genuinely their only indicator." },

  // (2) THE SHADCN HALO AT 70% — `focus-visible:ring-3 focus-visible:ring-ring/70`,
  // carried by twelve components (census re-run 2026-09-02, reported by file in
  // the P6-3 PR body). Tailwind v4 emits the `/70` as a colour at 0.7 alpha and
  // the browser composites it over the backdrop in sRGB gamma space, which is
  // exactly what `composite()` reproduces — the same helper and the same math
  // the destructive-on-destructive-10 row above already relies on.
  //
  // WHY NINE ROWS AND NOT THE SIX THE P6 ORDER ESTIMATED. The order's six were a
  // pre-census figure. Every row below names a construction path that was walked
  // on this branch; the extra three came from StateBanner's `action` slot, which
  // renders a real <Button> inside a TINTED banner at whichever of its four tones
  // the caller passes — journals-workbench.tsx:50-56 passes `failure.tone`, which
  // readFailure() returns as info / warning / neutral / error, with the Button
  // rendered unconditionally. Those are three grounds the ring is genuinely drawn
  // on that a six-row set would have left ungated. The one row that is NOT a
  // census row declares itself as such in its own source string.
  //
  // MEASURED, NOT TRANSCRIBED (this file's own alphaBlend/contrastRatio, run on
  // this branch): background/card/popover 3.574 · warning-muted 3.467 · muted
  // 3.435 · shell 3.433 · error-muted 3.405 · info-muted 3.360 · accent 3.270.
  // At 0.65 accent measures 2.970 and reds — which is why 裁-1's floor is 70%.
  { id: "focus-ring-70-on-background", fg: (h, composite) => composite("ring", 0.70, h("background")), bg: (h) => h("background"), threshold: 3,
    source: "the halo on the (firm) content column (app/(firm)/layout.tsx's bg-background column): components/admin/admin-hub.tsx:41's card Link, and every PageHeader `action` Button drawn straight on the page ground" },
  { id: "focus-ring-70-on-card", fg: (h, composite) => composite("ring", 0.70, h("card")), bg: (h) => h("card"), threshold: 3,
    source: "the halo inside a Card — the densest case by far (43 bg-card sites, re-censused at the P6-3 fold): components/journals/drafts-queue-panel.tsx:114's disclosure button (whose halo is its ENTIRE indicator — it sets outline-none with no border-ring companion, the DS-05 finding), the Clara rail composer textarea (ClaraRail.tsx:62 is bg-card, ClaraThreadView.tsx's textarea sits in it), and every part card's Buttons (PartSummaryCard.tsx:48 / PartRenderer.tsx:121 both wrap in bg-card)" },
  { id: "focus-ring-70-on-popover", fg: (h, composite) => composite("ring", 0.70, h("popover")), bg: (h) => h("popover"), threshold: 3,
    source: "the halo inside a Dialog — components/ui/dialog.tsx:69 is bg-popover, and every door dialog's Confirm/Cancel Button and every Input inside one is drawn on it. Kept as its own row rather than folded into card: --popover and --card are two independent declarations that both alias --surface today, and either can be re-pointed" },
  { id: "focus-ring-70-on-shell", fg: (h, composite) => composite("ring", 0.70, h("shell")), bg: (h) => h("shell"), threshold: 3,
    source: "the halo on the app chrome: components/common/section-tabs.tsx:77 in the client-workspace tab header (app/(firm)/clients/[clientId]/layout.tsx:42, bg-shell) and the LogoutButton in app/(firm)/layout.tsx:72's bg-sidebar aside (--sidebar aliases --shell)" },
  { id: "focus-ring-70-on-muted", fg: (h, composite) => composite("ring", 0.70, h("muted")), bg: (h) => h("muted"), threshold: 3,
    source: "the halo on StateBanner tone=\"neutral\" (components/common/state.tsx`s TONE_CLASS neutral row, bg-muted) carrying its `action` Retry Button — reached by components/journals/journals-workbench.tsx:50-56 whenever readFailure() returns the not_found kind, and by components/bank/read-state.tsx:66's KIND_TONE map" },
  { id: "focus-ring-70-on-info-muted", fg: (h, composite) => composite("ring", 0.70, h("info-muted")), bg: (h) => h("info-muted"), threshold: 3,
    source: "the same StateBanner `action` Button at tone=\"info\" (bg-info-muted) — journals-workbench.tsx:50-56 renders the Retry unconditionally beside a tone readFailure() returns as `info` for the no_session kind" },
  { id: "focus-ring-70-on-warning-muted", fg: (h, composite) => composite("ring", 0.70, h("warning-muted")), bg: (h) => h("warning-muted"), threshold: 3,
    source: "the same StateBanner `action` Button at tone=\"warning\" (bg-warning-muted) — readFailure()'s `forbidden` kind, journals-workbench.tsx:166" },
  { id: "focus-ring-70-on-error-muted", fg: (h, composite) => composite("ring", 0.70, h("error-muted")), bg: (h) => h("error-muted"), threshold: 3,
    source: "the same StateBanner `action` Button at tone=\"error\" (bg-error-muted) — components/common/route-error.tsx:24's reload control, and readFailure()'s `unauthenticated` / load-error kinds" },
  { id: "focus-ring-70-on-accent", fg: (h, composite) => composite("ring", 0.70, h("accent")), bg: (h) => h("accent"), threshold: 3,
    source: "A DECLARED FLOOR SENTINEL, NOT A CENSUS ROW — labelled so no reader mistakes it for a shipped composition. No ring carrier renders on --accent today (its live uses are dropdown-menu.tsx's DropdownMenuItem and select.tsx's SelectItem `focus:bg-accent` row highlight, which set outline-hidden and draw no ring, and firm-nav.tsx's active `bg-sidebar-accent` link, whose indicator is the base outline on --shell). It is pinned because --accent (#e8eef7) is the DARKEST ground token in this file and is therefore the binding constraint on 裁-1's alpha: it is the ground that measures 2.970 at 65% and 3.270 at 70%, i.e. the reason the ruled value is 70. A --accent retune, or any future alpha change, reds HERE first and nowhere else" },

  // --- The control boundary: --input (裁-2 4c, executed by 裁-64② in P6-3).
  // components/ui/input.tsx ships `bg-transparent`, so this border is the only
  // thing identifying the control and SC 1.4.11's 3:1 applies to it directly.
  // These rows land WITH the token's new value, never before it — the old
  // #c7c5bd would have red every one of them (1.728 / 1.728 / 1.611 / 1.598).
  { id: "input-on-background", fg: (h) => h("input"), bg: (h) => h("background"), threshold: 3,
    source: "the control edge on the (firm) content column: components/clara/ClaraThreadView.tsx's rail composer (`border-input bg-background`) and every Input/Select/Textarea a page renders straight on the canvas" },
  { id: "input-on-card", fg: (h) => h("input"), bg: (h) => h("card"), threshold: 3,
    source: "the densest case: every Input, Textarea, Select trigger, NativeSelect and InputGroup inside a Card — components/ui/input.tsx:12, textarea.tsx:10, select.tsx:44, common/native-select.tsx:30, ui/input-group.tsx:17, firm/compliance-watch-affordance.tsx:140's snooze date field" },
  { id: "input-on-popover", fg: (h) => h("input"), bg: (h) => h("popover"), threshold: 3,
    source: "the same control edge inside a Dialog (ui/dialog.tsx:69, bg-popover) — every door dialog's fields — and the ⌘K palette's search field (ui/command.tsx's CommandInput). THE CITATION IS EXACT AS OF THE P6-3 FOLD: that field used to override the edge to `border-input/30`, which composites to #dcdcd9 (1.374:1) while this row measures the token at full opacity, so the row passed and the site it named failed. The override was removed rather than the citation — the edge is now the full token this row measures. Its FILL is still `bg-input/30`; a fill is not the identifier once the edge clears 3:1, and no row claims otherwise" },
  { id: "input-on-shell", fg: (h) => h("input"), bg: (h) => h("shell"), threshold: 3,
    source: "A DECLARED SENTINEL for the two remaining product grounds, named by the P6-3 order. No control renders on --shell TODAY (the bg-shell header at app/(firm)/clients/[clientId]/layout.tsx:42 holds only the tab strip; the bg-sidebar aside holds nav links and the LogoutButton), so this pins the ground rather than a shipped composition — it costs nothing and it is the ground a filter or search field would land on first" },
  { id: "input-on-identity-canvas", fg: (h) => h("input"), bg: (h) => h("identity-canvas"), threshold: 3,
    source: "A DECLARED SENTINEL, likewise named by the P6-3 order. Every (entry) face renders its fields inside the 裁-2 4a white Card, so the shipped composition is input-on-card; this row pins the group's own ground against the day a face puts a control outside the card" },
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

/**
 * Unconditionally strict as of the P3 finale fold-seam pass: the one
 * pre-existing near-miss (destructive-80pct-on-destructive-5-box) was
 * RETIRED, not nudged over the line (see the header's P3 FINALE RE-CENSUS
 * note) — every pair below is a real, currently-passing pair, so there is
 * no WARN mode left to keep. A future genuine regression fails the build
 * the same PR it lands in; there is no flag to pass or forget.
 */
export function main() {
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
  console.log("[check-token-contrast] failing the build. Fix the token/opacity choice, never this script.");

  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
