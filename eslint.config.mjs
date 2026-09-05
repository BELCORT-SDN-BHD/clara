// Flat ESLint config for the Clara monorepo (ESLint 9 + typescript-eslint).
//
// Scope of enforcement, by file kind:
//   - ALL TypeScript      → typescript-eslint's non-type-checked `recommended`.
//   - packages/runtime .ts → ADDS the two TYPE-CHECKED promise-safety rules
//     (no-floating-promises + no-misused-promises). The runtime orchestrates
//     durable async work, so a dropped or mis-passed promise is a real
//     correctness risk — worth the cost of a typed lint pass here. Type
//     information comes from `projectService` (each file's nearest tsconfig).
//   - Plain-ESM JavaScript (packages/db scripts, worker.mjs, next.config.mjs,
//     this file) → @eslint/js `recommended` only. The typed promise rules are
//     N/A without a tsc program, so they simply aren't enabled for JS.
//   - Build output, deps, generated types, and the frozen spike/ are ignored.
//
// Each package exposes `"lint": "eslint ."`; the root `pnpm lint` fans out via
// `pnpm -r --if-present lint`, and ESLint walks up from each package to THIS
// config. Adding a rule here changes every package at once.

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// apps/web only — ban a 3-argument `window.open(...)` call outright (independent
// review 2026-08-27, R1/R5). WHATWG: a "noopener"/"noreferrer" features string
// makes `window.open` return `null` UNCONDITIONALLY, which R1 shipped as a
// regression and R5 found had reappeared, undetected, inside the very adapter
// meant to prevent it (lib/documents/open-in-new-tab.ts's own type-signature
// wall covers only THAT file — this rule is the wall that survives a future
// call site bypassing it entirely). The two-argument `(url, target)` form is
// never restricted.
//
// Hoisted to a const because flat config REPLACES a rule's options rather than
// merging them: the page-component block below re-declares `no-restricted-syntax`
// for a subset of the same files, so it has to carry this selector too or
// window.open would silently go unguarded on exactly the surfaces that call it.
// One const, two references — never two copies to drift.
const NO_THREE_ARG_WINDOW_OPEN = {
  selector: "CallExpression[callee.object.name='window'][callee.property.name='open'][arguments.length>2]",
  message:
    "window.open must be called with at most two arguments (url, target). A features string (\"noopener\"/\"noreferrer\"/even \"\") changes its return-value behaviour — WHATWG's noreferrer implies noopener, and noopener makes window.open return null unconditionally (2026-08-27 R1/R5). Use lib/documents/open-in-new-tab.ts's injectable windowOpen instead of calling window.open directly.",
};

// Owner ruling Q4, 2026-08-27 (docs/plan/active/mohe-grill-rulings-2026-08-27.md
// :41-42, ratifying the ClaraBook brand system): "raw color values in page
// components are lint-banned". These two selectors are that ban.
//
// WHAT THEY PROTECT, beyond the brand contract. apps/web's contrast gate
// (apps/web/scripts/check-token-contrast.mjs) is a CLOSED-WORLD check over the
// token pairs declared in globals.css — it never reads component code. A raw hex
// in a component therefore escapes not only the token vocabulary but the WCAG
// 2.1 AA contrast gate entirely. The tree is clean today (measured twice by the
// 08-29 alignment audit, and again when this rule landed); the point of a gate is
// to hold it clean through P6's polish wave, which re-touches every colour on
// every surface across several delegated lanes.
//
// SCOPE — `app/**` and `components/**` only, which is what "page components"
// means. `scripts/` owns the token maths and `tests/` unit-tests it; both hold
// legitimate hex constants (tests/token-contrast.test.ts alone has ~30) and
// neither renders anything.
//
// NOT BANNED, deliberately: `bg-black/10`, the modal scrim in
// components/ui/dialog.tsx and command-k-provider.tsx. It is a Tailwind default
// but a keyword, not a palette step, and tokenising it is a visual decision, not
// a lint fix — named here so it stays a known residual instead of an invisible
// carve-out.
const NO_RAW_COLOR_VALUES = {
  selector:
    ":matches(Literal[value=/(#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\\b|\\b(rgba?|hsla?|oklch|oklab|lch|lab)\\()/], TemplateElement[value.raw=/(#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\\b|\\b(rgba?|hsla?|oklch|oklab|lch|lab)\\()/])",
  message:
    "Raw colour value in a page component (owner ruling Q4, 2026-08-27: \"raw color values in page components are lint-banned\"). Every colour comes from a semantic token declared in app/globals.css — `text-foreground`, `bg-card`, `border-error/30` — never a hex, rgb(), hsl() or oklch() literal and never a `bg-[#…]` arbitrary value. A raw colour also escapes scripts/check-token-contrast.mjs, which only reads globals.css, so it is invisible to the WCAG contrast gate.",
};

const NO_TAILWIND_DEFAULT_PALETTE = {
  selector:
    ":matches(Literal[value=/\\b(bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|accent|caret|shadow|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\\b/], TemplateElement[value.raw=/\\b(bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|accent|caret|shadow|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\\b/])",
  message:
    "Tailwind default-palette class in a page component (owner ruling Q4, 2026-08-27). `bg-red-500`/`text-slate-700` and friends bypass the token map entirely — this product's palette is the semantic set in app/globals.css (`error`, `warning`, `success`, `info`, `muted`, `card`, `clara`, …). Reach for the token whose MEANING matches, not the hue that looks right.",
};

export default tseslint.config(
  // Global ignores — an object with ONLY `ignores` applies to the whole run.
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "**/.nitro/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      // The Slice-0 runtime spike is a frozen throwaway with its own toolchain.
      "spike/**",
      // Generated by `next` — not hand-edited, carries its own triple-slash refs.
      "apps/web/next-env.d.ts",
      // apps/web's Cloudflare build output/local dev state (never linted or committed).
      "apps/web/.open-next/**",
      "apps/web/.wrangler/**",
      // VENDORED, NOT AUTHORED (D2). `public/pdf.worker.min.mjs` is a
      // byte-identical copy of pdfjs-dist's own minified worker build, served
      // same-origin so the pdf.js page renderer never fetches a third-party
      // script over a client's documents. It is 1.2MB of minified vendor code:
      // linting it produces hundreds of no-unused-vars/no-undef errors about
      // pdf.js's own internals, none of which anyone here can or should fix.
      // `apps/web/lib/documents/pdf-worker-asset.test.ts` is what keeps it
      // honest instead — it hashes this file against the installed package, so
      // a drift between the served worker and the library goes RED there rather
      // than failing silently in a browser.
      "apps/web/public/pdf.worker.min.mjs",
    ],
  },

  // Plain-ESM JavaScript (Node data-plane scripts, worker, next config).
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // All TypeScript — non-type-checked recommended baseline.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.recommended],
  },

  // SPLIT-WAVE FORKS — `no-unused-vars` off, and ONLY that rule.
  //
  // A fork (`x<NN>b<S>-*.test.mjs`) is a slice's share of a test file whose cells span more
  // than one migration slice. It is produced MECHANICALLY (`slices/forks/work/forktool.py`),
  // and the tool's whole safety argument is that it MOVES cells and never EDITS them: a
  // fork's prologue is byte-identical to its parent's, so every fork of a file imports the
  // same fixtures, in the same order, with the same names — and the tool asserts that
  // invariant (plus cell conservation: 418 cells, no cell assigned twice) as its own
  // correctness check. A fork therefore carries bindings only the SIBLING slice's cells use.
  // They are the declared, measured cost of the idiom, not oversights.
  //
  // Trimming them by hand would break the property the split is verified on and make the
  // forks non-regenerable — the byte-identical prologue is the evidence, so the lint yields
  // here rather than the evidence. Scoped to the fork filename pattern, and to this one rule,
  // so the wave's OWN new files (`x42-*`, `x42x-*`) stay fully linted: the two genuine
  // findings in those were fixed at source, not silenced.
  {
    files: ["packages/db/tests/x4[0-9]b[0-9]-*.test.mjs"],
    rules: { "no-unused-vars": "off" },
  },

  // Runtime TypeScript only — layer the two TYPE-CHECKED promise-safety rules.
  {
    files: ["packages/runtime/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // apps/web's ROUTE TREE — the same two type-checked promise rules the runtime
  // block above carries, for a reason P4-2's independent review made concrete
  // (#451, FIND-1). A dropped `await` on `requireFirmScope()` in a layout does not
  // fail to compile and does not fail the suite: `redirect()` throws NEXT_REDIRECT
  // *inside the floating promise*, so the layout returns its markup and renders
  // firm-scoped chrome for a caller with no firm, while the rejection surfaces
  // later as an unhandled rejection nobody reads. One missing keyword silently
  // disarms two of the three entrances. The suite asserts the `await` textually as
  // well; this rule is the belt to that braces, and it generalises to every future
  // guard in `app/**` rather than only the three the suite knows about.
  {
    files: ["apps/web/app/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // apps/web, whole package — the window.open wall (see the const's own header).
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", NO_THREE_ARG_WINDOW_OPEN],
    },
  },

  // apps/web page components — the same wall PLUS the Q4 colour ban. This block
  // matches a SUBSET of the one above and re-declares the same rule, so it
  // deliberately repeats NO_THREE_ARG_WINDOW_OPEN by reference: flat config
  // replaces a rule's options, it does not merge them.
  {
    files: ["apps/web/app/**/*.{ts,tsx}", "apps/web/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", NO_THREE_ARG_WINDOW_OPEN, NO_RAW_COLOR_VALUES, NO_TAILWIND_DEFAULT_PALETTE],
    },
  },
);
