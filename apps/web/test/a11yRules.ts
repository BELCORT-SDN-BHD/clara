// test/a11yRules.ts — GATE (b) of the three a11y CI gates (owner ruling Q7,
// docs/plan/active/mohe-grill-rulings-2026-08-27.md). Read test/domInspect.ts's
// header FIRST — it records why this is a hand-written, WCAG-mapped rule
// engine rather than the real axe-core library: axe-core loads and runs
// against this repo's harness DOM, but produces a confirmed false positive
// (a correctly-labelled button flagged as unlabeled) because its own
// accessible-name/visibility algorithm needs real browser layout geometry no
// additive stub can honestly reproduce. This file checks the SAME class of
// problem axe-core's structural rules check, using ONLY the capabilities
// domInspect.ts adds correctly: attribute presence/values, tag names, text
// content, simple tree walking — no layout, no visibility computation, no
// false confidence.
//
// Rule ids below are named after axe-core's own rule ids on purpose (not to
// impersonate axe — to make it trivial to cross-reference which axe rule
// each one stands in for, and to retarget cleanly at real axe-core later if
// this repo ever gains a real DOM). Each rule's WCAG success criterion is
// the same one axe-core cites for that rule id.
//
// 裁-13 (2026-08-28) ADDED WCAG 2.2 SC 2.5.8 target-size ON TOP of Q7's 2.1 AA
// bar. Its rule lives at the bottom of this file; read that block's own header
// before changing what it measures, and read `TARGET_MIN_PX` below for the
// `--target-min` coupling.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRootTokens } from "../scripts/check-token-contrast.mjs";

export type A11yViolation = {
  rule: string;
  wcag: string;
  /** A short, human-locatable description of the element (tag + key attrs). */
  element: string;
  message: string;
};

/**
 * 裁-13 · THE TARGET-SIZE FLOOR, READ FROM THE TOKEN — NOT TRANSCRIBED.
 *
 * The token contract's §5.2 declares `--target-min`, and 裁-13 adopted SC 2.5.8
 * "honouring the token contract's own documented-exception mechanism
 * (`--target-min`)". A gate that hardcoded `24` would be asserting a NUMBER
 * that happens to match a token today — the drift class this repo keeps paying
 * for. This resolves the live declaration in `app/globals.css` through the
 * contrast gate's own parser, so retuning the token retunes the gate, and
 * deleting the token fails loudly here instead of silently relaxing the bar.
 */
export const TARGET_MIN_PX: number = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "..", "app", "globals.css"), "utf8");
  const raw = parseRootTokens(css).get("target-min");
  if (raw === undefined) {
    throw new Error(
      "--target-min is not declared in app/globals.css :root — 裁-13's target-size gate has no floor to enforce",
    );
  }
  const px = /^(\d+(?:\.\d+)?)px$/.exec(raw.trim());
  if (!px) throw new Error(`--target-min must be a px literal, got ${JSON.stringify(raw)}`);
  return Number(px[1]);
})();

type Stub = {
  nodeType?: number;
  tagName?: string;
  nodeValue?: string;
  childNodes?: Stub[];
  parentNode?: Stub | null;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
};

const FORM_CONTROL_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);
const NON_INTERACTIVE_INPUT_TYPES = new Set(["hidden"]);

const HEADING_LEVEL: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

// WAI-ARIA 1.2 global states/properties + the widget/role-specific ones this
// codebase's own census (grep for `aria-[a-z]+=` across components/) turned
// up, plus the rest of the stable spec list so a genuinely new, correct
// aria-* attribute never trips a false "unknown attribute" violation.
const KNOWN_ARIA_ATTRS = new Set([
  "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-busy", "aria-checked",
  "aria-colcount", "aria-colindex", "aria-colspan", "aria-controls", "aria-current",
  "aria-describedby", "aria-details", "aria-disabled", "aria-dropeffect", "aria-errormessage",
  "aria-expanded", "aria-flowto", "aria-grabbed", "aria-haspopup", "aria-hidden", "aria-invalid",
  "aria-keyshortcuts", "aria-label", "aria-labelledby", "aria-level", "aria-live", "aria-modal",
  "aria-multiline", "aria-multiselectable", "aria-orientation", "aria-owns", "aria-placeholder",
  "aria-posinset", "aria-pressed", "aria-readonly", "aria-relevant", "aria-required",
  "aria-roledescription", "aria-rowcount", "aria-rowindex", "aria-rowspan", "aria-selected",
  "aria-setsize", "aria-sort", "aria-valuemax", "aria-valuemin", "aria-valuenow", "aria-valuetext",
]);

const KNOWN_ROLES = new Set([
  "alert", "alertdialog", "application", "article", "banner", "button", "cell", "checkbox",
  "columnheader", "combobox", "complementary", "contentinfo", "definition", "dialog",
  "directory", "document", "feed", "figure", "form", "grid", "gridcell", "group", "heading",
  "img", "link", "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu",
  "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "navigation", "none", "note",
  "option", "presentation", "progressbar", "radio", "radiogroup", "region", "row",
  "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator", "slider",
  "spinbutton", "status", "switch", "tab", "table", "tablist", "tabpanel", "term",
  "textbox", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem",
]);

const BOOLEAN_ARIA_ATTRS: Record<string, string[]> = {
  "aria-hidden": ["true", "false"],
  "aria-disabled": ["true", "false"],
  "aria-expanded": ["true", "false"],
  "aria-selected": ["true", "false"],
  "aria-pressed": ["true", "false", "mixed"],
  "aria-checked": ["true", "false", "mixed"],
  "aria-required": ["true", "false"],
  "aria-readonly": ["true", "false"],
  "aria-modal": ["true", "false"],
  "aria-multiline": ["true", "false"],
  "aria-multiselectable": ["true", "false"],
  "aria-busy": ["true", "false"],
  "aria-atomic": ["true", "false"],
};

function attr(node: Stub, name: string): string | null {
  return typeof node.getAttribute === "function" ? node.getAttribute(name) : null;
}

function has(node: Stub, name: string): boolean {
  return typeof node.hasAttribute === "function" && node.hasAttribute(name);
}

function textOf(node: Stub): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  return (node.childNodes ?? []).map(textOf).join("");
}

function isElement(node: Stub): boolean {
  return node.nodeType === 1;
}

function walk(node: Stub, visit: (n: Stub) => void): void {
  if (isElement(node)) visit(node);
  for (const c of node.childNodes ?? []) walk(c, visit);
}

function describe(node: Stub): string {
  const tag = (node.tagName ?? "?").toLowerCase();
  const id = attr(node, "id");
  const role = attr(node, "role");
  const bits = [tag];
  if (id) bits.push(`#${id}`);
  if (role) bits.push(`[role=${role}]`);
  return bits.join("");
}

/** True if any of aria-label/aria-labelledby(-resolved-elsewhere)/text
 *  content/title gives this element a non-empty accessible name. Label
 *  resolution for aria-labelledby is intentionally NOT cross-referenced
 *  against other ids here (that needs a whole-tree id index — `label`'s own
 *  rule below does that for form controls specifically); a non-empty
 *  aria-labelledby value is accepted as "a name was declared" for the
 *  button/link rules, matching how axe's own `aria-labelledby` check works
 *  (existence + non-empty, not full up-front resolution, in that check). */
function hasAccessibleName(node: Stub): boolean {
  const ariaLabel = attr(node, "aria-label");
  if (ariaLabel && ariaLabel.trim() !== "") return true;
  const labelledBy = attr(node, "aria-labelledby");
  if (labelledBy && labelledBy.trim() !== "") return true;
  if (textOf(node).trim() !== "") return true;
  const title = attr(node, "title");
  if (title && title.trim() !== "") return true;
  return false;
}

/** `aria-hidden="true"` removes an element (and its whole subtree) from the
 *  accessibility tree by definition (WAI-ARIA 1.2 §6.8) — real axe-core
 *  excludes such elements from every rule for the same reason. The
 *  canonical example this codebase actually ships: @base-ui/react's Select
 *  renders a native shadow `<input aria-hidden="true" tabIndex={-1}>` purely
 *  for form/autofill semantics — it is deliberately invisible to assistive
 *  tech and correctly carries no accessible name of its own. */
function isAriaHidden(node: Stub): boolean {
  return attr(node, "aria-hidden") === "true";
}

function isRealButton(node: Stub): boolean {
  return node.tagName === "BUTTON" || attr(node, "role") === "button";
}

function isRealLink(node: Stub): boolean {
  return (node.tagName === "A" && has(node, "href")) || attr(node, "role") === "link";
}

function isFormControl(node: Stub): boolean {
  if (!node.tagName || !FORM_CONTROL_TAGS.has(node.tagName)) return false;
  if (node.tagName === "INPUT" && NON_INTERACTIVE_INPUT_TYPES.has((attr(node, "type") ?? "").toLowerCase())) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 裁-13 · WCAG 2.2 SC 2.5.8 Target Size (Minimum) — the CI gate.
//
// WHAT THIS MEASURES, AND WHAT IT HONESTLY CANNOT. There is no layout engine
// here (test/domInspect.ts's header: the axe-core spike hit the same wall), so
// this does NOT measure a rendered box. It measures the ONE thing that is
// unambiguous without layout: a class string that PINS a dimension to a fixed
// pixel value below the floor. `h-5` on a button is a 20px-tall control no
// matter what the content or the viewport does — that is a decision written
// into the source, and it is exactly the decision SC 2.5.8 is about.
//
// Everything it cannot see falls through SILENTLY BY DESIGN, and that is the
// point rather than a shortfall:
//   - A control with no pinned dimension (the overwhelming majority — padding
//     and content decide its box) makes NO claim here. That also disposes of
//     SC 2.5.8's own "Inline" exception for free: a link inside a sentence
//     carries no size utility, so it is never flagged.
//   - The criterion's SPACING exception (an undersized target with 24px of
//     clear space around it passes) needs real geometry. It is not implemented
//     here and MUST NOT be faked; the browser leg runs axe-core's real
//     `target-size` rule on the built app, which implements it properly.
// So: green here is "no source-level shortfall", never "SC 2.5.8 holds". The
// two instruments are complementary and the PR body says which proved what.
//
// THE DOCUMENTED-EXCEPTION MECHANISM (裁-13, verbatim: "every dense-table
// shortfall becomes a visible, reasoned exception, never a silent downgrade").
// `data-target-size-exception="<reason>"` on the control. There is deliberately
// NO allowlist file and NO known-violation pinning: an exception must be
// written on the element a reader is looking at, in the same diff as the
// shortfall, and an exception with an EMPTY reason is itself a violation — so
// the mechanism cannot be used to make a shortfall quiet.
// ---------------------------------------------------------------------------

const INTERACTIVE_ROLES = new Set([
  "button", "link", "checkbox", "radio", "switch", "tab", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "treeitem", "slider", "spinbutton",
]);

/** Tailwind's spacing scale is 0.25rem per step at the default 16px root. */
const TW_STEP_PX = 4;

/**
 * Resolves ONE Tailwind size value to CSS px, or null when it is not a fixed
 * pixel quantity this engine may reason about (`full`, `auto`, `dvh`, a
 * percentage, a `var()`, a `calc()`, an unknown keyword). Returning null is the
 * fail-OPEN branch on purpose: an unmeasurable value is not evidence of a
 * shortfall, and inventing one would manufacture false violations.
 */
export function twSizeToPx(value: string): number | null {
  if (value === "px") return 1;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * TW_STEP_PX;
  const arbitrary = /^\[(.+)]$/.exec(value);
  if (arbitrary) {
    const inner = arbitrary[1]!;
    const px = /^(\d+(?:\.\d+)?)px$/.exec(inner);
    if (px) return Number(px[1]);
    const rem = /^(\d+(?:\.\d+)?)rem$/.exec(inner);
    if (rem) return Number(rem[1]) * 16;
  }
  return null;
}

/**
 * The pinned width/height a class string commits to, in CSS px — `null` on an
 * axis nothing pins. Only utilities that FIX a dimension count: `size-*`,
 * `h-*`, `w-*`. `min-h-*`/`min-w-*` are deliberately excluded — a minimum with
 * no maximum leaves the rendered box content-driven, so a small `min-h` is not
 * a shortfall, and treating it as one is the false-positive this rule must not
 * produce. A variant-prefixed utility (`sm:h-4`, `hover:size-3`) is also
 * excluded: it applies conditionally, and this engine cannot say when.
 */
export function pinnedBoxPx(className: string): { w: number | null; h: number | null } {
  let w: number | null = null;
  let h: number | null = null;
  for (const token of className.split(/\s+/)) {
    if (token === "" || token.includes(":")) continue;
    const m = /^(size|h|w)-(.+)$/.exec(token);
    if (!m) continue;
    const px = twSizeToPx(m[2]!);
    if (px === null) continue;
    if (m[1] === "size") {
      w = px;
      h = px;
    } else if (m[1] === "h") h = px;
    else w = px;
  }
  return { w, h };
}

// ---------------------------------------------------------------------------
// DS-04 · NESTED LIVE REGIONS (WAI-ARIA 1.2 §5.2.7 / WCAG 4.1.3 Status
// Messages). Added by P6-3 as a RULE rather than a one-off cell, because the
// conformance pass found the defect twice in one component tree and the second
// instance was the one nobody had looked for: InterviewRunCard's `role="log"`
// thread sitting inside ClaraThreadView's `role="log"` scroll region, reached
// through OnboardingChecklistCard — two files apart, invisible to either
// component's own suite. A rule here means every a11y test in the estate is
// the instrument, not just the one someone thought to write.
//
// A live region inside a live region has no defined announcement order: the
// same change can be announced twice, once, or attributed to the wrong region,
// depending on the screen reader. Note that dropping `aria-live` from the outer
// element does NOT fix it — `role="log"`/`"status"`/`"alert"` each carry an
// implicit `aria-live`, which is exactly the correction the conformance pass
// had to make to the original finding's suggested fix.
// ---------------------------------------------------------------------------

/** Roles whose ARIA definition carries an implicit non-off `aria-live`. */
const IMPLICIT_LIVE_ROLES = new Set(["alert", "log", "status", "marquee", "timer"]);

function isLiveRegion(node: Stub): boolean {
  const declared = attr(node, "aria-live");
  if (declared !== null) return declared.toLowerCase() !== "off";
  const role = attr(node, "role");
  return role !== null && IMPLICIT_LIVE_ROLES.has(role);
}

/** Interactive for SC 2.5.8's purposes: something a pointer must be able to hit. */
function isPointerTarget(node: Stub): boolean {
  if (isAriaHidden(node)) return false;
  if (has(node, "disabled")) return false;
  if (attr(node, "aria-disabled") === "true") return false;
  if (isRealButton(node) || isRealLink(node) || isFormControl(node)) return true;
  const role = attr(node, "role");
  return role !== null && INTERACTIVE_ROLES.has(role);
}

/**
 * Runs the full rule set over a mounted tree (the `container` a
 * `renderComponent` harness result exposes, or any element within it).
 * Deterministic, synchronous, no async layout pass — every rule here reads
 * only attributes/tag names/text already present in the tree.
 */
export function checkAccessibility(root: Stub): A11yViolation[] {
  const violations: A11yViolation[] = [];
  const ids = new Map<string, number>();
  const headings: { level: number; el: Stub }[] = [];

  // Pre-pass: every id a real <label for="..."> targets — an explicit
  // label association this codebase uses constantly (components/bank/
  // matching-section.tsx's unmatch form, reconciliation-section.tsx's void
  // reason field, …). Found chasing a real false positive: the `label`
  // rule's own message names "an associated <label>" as accepted, but the
  // first cut of this function never actually checked for one.
  const labelledIds = new Set<string>();
  walk(root, (node) => {
    if (node.tagName === "LABEL") {
      const forId = attr(node, "for");
      if (forId) labelledIds.add(forId);
    }
  });

  // An implicit (wrapping) <label> also counts.
  function hasWrappingLabel(node: Stub): boolean {
    let n = node.parentNode ?? null;
    while (n) {
      if (n.tagName === "LABEL") return true;
      n = n.parentNode ?? null;
    }
    return false;
  }

  walk(root, (node) => {
    // button-name
    if (isRealButton(node) && !isAriaHidden(node) && !hasAccessibleName(node)) {
      violations.push({
        rule: "button-name",
        wcag: "4.1.2 Name, Role, Value",
        element: describe(node),
        message: "Buttons must have discernible text (visible text, aria-label, aria-labelledby, or title).",
      });
    }

    // link-name
    if (isRealLink(node) && !isAriaHidden(node) && !hasAccessibleName(node)) {
      violations.push({
        rule: "link-name",
        wcag: "4.1.2 Name, Role, Value / 2.4.4 Link Purpose",
        element: describe(node),
        message: "Links must have discernible text (visible text, aria-label, aria-labelledby, or title).",
      });
    }

    // label (form controls)
    if (isFormControl(node) && !isAriaHidden(node)) {
      const ariaLabel = attr(node, "aria-label");
      const labelledBy = attr(node, "aria-labelledby");
      const id = attr(node, "id");
      const hasName =
        (ariaLabel && ariaLabel.trim() !== "") ||
        (labelledBy && labelledBy.trim() !== "") ||
        (id !== null && labelledIds.has(id)) ||
        hasWrappingLabel(node);
      if (!hasName) {
        violations.push({
          rule: "label",
          wcag: "1.3.1 Info and Relationships / 4.1.2 Name, Role, Value",
          element: describe(node),
          message: "Form elements must have an accessible name (aria-label, aria-labelledby, or an associated <label>).",
        });
      }
    }

    // image-alt
    if (node.tagName === "IMG" && !has(node, "alt")) {
      violations.push({
        rule: "image-alt",
        wcag: "1.1.1 Non-text Content",
        element: describe(node),
        message: "Images must have an alt attribute (use alt=\"\" for purely decorative images).",
      });
    }

    // aria-valid-attr / aria-valid-attr-value — walk this node's known
    // attribute names via a fixed probe list (the stub has no generic
    // "list all attribute names" API cheaply usable here, so this checks
    // every KNOWN aria-* name for PRESENCE, plus flags an aria-* name that
    // is not in the allowlist by re-deriving from getAttribute's own
    // Map-backed store where available).
    const rawAttrs = (node as unknown as { getAttributeNames?: () => string[] }).getAttributeNames?.() ?? [];
    for (const name of rawAttrs) {
      if (!name.startsWith("aria-")) continue;
      if (!KNOWN_ARIA_ATTRS.has(name)) {
        violations.push({
          rule: "aria-valid-attr",
          wcag: "4.1.2 Name, Role, Value",
          element: describe(node),
          message: `"${name}" is not a recognised ARIA state or property.`,
        });
        continue;
      }
      const allowed = BOOLEAN_ARIA_ATTRS[name];
      if (allowed) {
        const value = (attr(node, name) ?? "").toLowerCase();
        if (!allowed.includes(value)) {
          violations.push({
            rule: "aria-valid-attr-value",
            wcag: "4.1.2 Name, Role, Value",
            element: describe(node),
            message: `"${name}" must be one of ${allowed.join("/")}, got "${value}".`,
          });
        }
      }
    }
    const role = attr(node, "role");
    if (role && !KNOWN_ROLES.has(role)) {
      violations.push({
        rule: "aria-valid-attr-value",
        wcag: "4.1.2 Name, Role, Value",
        element: describe(node),
        message: `"role=${role}" is not a recognised WAI-ARIA role.`,
      });
    }

    // aria-required-attr — only for the roles this codebase actually uses.
    if (role === "tab" && !has(node, "aria-selected")) {
      violations.push({
        rule: "aria-required-attr",
        wcag: "4.1.2 Name, Role, Value",
        element: describe(node),
        message: 'role="tab" requires aria-selected.',
      });
    }
    if (role === "radio" && !has(node, "aria-checked")) {
      violations.push({
        rule: "aria-required-attr",
        wcag: "4.1.2 Name, Role, Value",
        element: describe(node),
        message: 'role="radio" requires aria-checked.',
      });
    }

    // dialog-name
    if ((role === "dialog" || role === "alertdialog") && !isAriaHidden(node) && !hasAccessibleName(node)) {
      violations.push({
        rule: "aria-dialog-name",
        wcag: "4.1.2 Name, Role, Value / 2.4.6 Headings and Labels",
        element: describe(node),
        message: "A dialog must have an accessible name (aria-label or aria-labelledby).",
      });
    }

    // nested-live-region (DS-04) — see the block above this function.
    if (isLiveRegion(node)) {
      let ancestor = node.parentNode ?? null;
      while (ancestor) {
        if (isElement(ancestor) && isLiveRegion(ancestor)) {
          violations.push({
            rule: "nested-live-region",
            wcag: "4.1.3 Status Messages (WAI-ARIA 1.2 §5.2.7)",
            element: describe(node),
            message: `This live region is nested inside another one (${describe(ancestor)}); announcement order is undefined and a change can be read twice or attributed to the wrong region. Note that role="log"/"status"/"alert" each carry an implicit aria-live, so removing aria-live from the outer element does not resolve it — the containment does.`,
          });
          break;
        }
        ancestor = ancestor.parentNode ?? null;
      }
    }

    // target-size (裁-13, WCAG 2.2 SC 2.5.8) — read the block above this
    // function for exactly what this claims and what it deliberately does not.
    if (isPointerTarget(node)) {
      const exception = attr(node, "data-target-size-exception");
      const { w, h } = pinnedBoxPx(attr(node, "class") ?? "");
      const short: string[] = [];
      if (h !== null && h < TARGET_MIN_PX) short.push(`height ${h}px`);
      if (w !== null && w < TARGET_MIN_PX) short.push(`width ${w}px`);
      if (exception !== null && exception.trim() === "") {
        violations.push({
          rule: "target-size-exception-unreasoned",
          wcag: "2.5.8 Target Size (Minimum)",
          element: describe(node),
          message:
            'data-target-size-exception is present but empty — 裁-13 requires every shortfall to be a VISIBLE, reasoned exception. Write the reason (which SC 2.5.8 exception applies, and why) or fix the size.',
        });
      } else if (short.length > 0 && exception === null) {
        violations.push({
          rule: "target-size",
          wcag: "2.5.8 Target Size (Minimum)",
          element: describe(node),
          message: `Pointer target pins ${short.join(" and ")}, below the --target-min floor of ${TARGET_MIN_PX}px. Fix the size, or carry data-target-size-exception="<reason>" naming the SC 2.5.8 exception that applies.`,
        });
      }
    }

    // duplicate-id
    const id = attr(node, "id");
    if (id && id.trim() !== "") {
      ids.set(id, (ids.get(id) ?? 0) + 1);
    }

    // heading-order (collected here, checked once after the walk)
    if (node.tagName && HEADING_LEVEL[node.tagName]) {
      headings.push({ level: HEADING_LEVEL[node.tagName]!, el: node });
    }
  });

  for (const [id, count] of ids) {
    if (count > 1) {
      violations.push({
        rule: "duplicate-id",
        wcag: "4.1.2 Name, Role, Value (id-referencing attributes silently break)",
        element: `#${id}`,
        message: `id="${id}" is used on ${count} elements — aria-labelledby/aria-describedby/<label for> referencing it resolve unpredictably.`,
      });
    }
  }

  let runningMax = 0;
  for (const h of headings) {
    if (h.level > runningMax + 1) {
      violations.push({
        rule: "heading-order",
        wcag: "1.3.1 Info and Relationships / 2.4.6 Headings and Labels",
        element: describe(h.el),
        message: `Heading level jumps from h${runningMax} to h${h.level} without an intervening h${runningMax + 1}.`,
      });
    }
    runningMax = Math.max(runningMax, h.level);
  }

  return violations;
}
