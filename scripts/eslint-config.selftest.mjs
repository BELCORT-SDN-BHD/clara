#!/usr/bin/env node
// #994 — self-test for the root eslint.config.mjs's NO_RAW_COLOR_VALUES message.
//
// The rule's SELECTOR bans any string/template literal containing `#` immediately followed
// by 3, 4, 6 or 8 hex-looking characters, or an rgb()/hsl()/oklch()-family call — it cannot
// tell a real colour literal from any other short hex-looking token after `#`, including a
// plain ticket reference. Confirmed on `main`: `"#658"` inside a linted literal made root
// `pnpm lint` red at commit `b85ce24e` (fixed by rewording the string at `33b99b83`), and the
// rule's own MESSAGE said only "Raw colour value in a page component" — true of neither the
// cause nor the fix for that case, costing a diagnosis round-trip (#658's own report, follow-up
// #6: "one sentence in the rule's own message would have saved this round-trip").
//
// This selftest runs the REAL eslint.config.mjs's REAL selector through ESLint's own `Linter`
// (no eslint CLI, no filesystem walk) so it exercises exactly what `pnpm lint` runs:
//   - the message text: names the ticket-reference case and the recommended fix (reword);
//   - the selector: UNCHANGED — every real colour shape it bans today it still bans, and
//     every non-colour token it lets through today (including a spelled-out ticket number)
//     it still lets through.
//
//   node scripts/eslint-config.selftest.mjs   # exit 0 green, 1 red
//
// Depends only on already-installed root deps (eslint, the config itself) — nothing new added.

import { Linter } from "eslint";
import config from "../eslint.config.mjs";

let failures = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// Locate the page-components block's `no-restricted-syntax` options, then NO_RAW_COLOR_VALUES
// within it — by SHAPE (a selector matching hex-digit runs), never by array position, so a
// reordering of the three `no-restricted-syntax` entries cannot silently point this test at the
// wrong rule.
const pageBlock = config.find(
  (entry) =>
    Array.isArray(entry.files) &&
    entry.files.includes("apps/web/components/**/*.{ts,tsx}") &&
    entry.rules?.["no-restricted-syntax"],
);
assert(pageBlock, "eslint.config.mjs must still carry a no-restricted-syntax block scoped to apps/web/components/**");
const restrictions = pageBlock.rules["no-restricted-syntax"].slice(1); // drop the "error" severity
const rawColorRule = restrictions.find((r) => /0-9a-fA-F/.test(r.selector));
assert(rawColorRule, "NO_RAW_COLOR_VALUES (a selector matching hex-digit runs) must still be one of the page-component restrictions");

console.log("NO_RAW_COLOR_VALUES message (#994):");

testCase("the message names the ticket-reference case (# followed by digits) as a known trigger", () => {
  assert(/#\d/.test(rawColorRule.message) || /ticket[- ]?reference/i.test(rawColorRule.message),
    `expected the message to name a ticket-reference example or say "ticket reference"; got:\n${rawColorRule.message}`);
  assert(/ticket/i.test(rawColorRule.message), `expected the word "ticket" in the message; got:\n${rawColorRule.message}`);
});

testCase("the message states the recommended fix for that case: reword the string", () => {
  assert(/reword/i.test(rawColorRule.message), `expected the message to say "reword"; got:\n${rawColorRule.message}`);
});

testCase("the message still carries the original Q4 ruling citation and token-map guidance (nothing removed, only added to)", () => {
  assert(rawColorRule.message.includes("owner ruling Q4, 2026-08-27"), "the ruling citation must survive");
  assert(rawColorRule.message.includes("app/globals.css"), "the semantic-token-map guidance must survive");
});

console.log("selector regression — behaviour is BYTE-IDENTICAL to before this ticket:");

// A minimal flat config carrying ONLY the extracted rule, verified with ESLint's own Linter —
// this is what `no-restricted-syntax`'s selector actually matches against, not a re-implemented
// regex of our own.
const linter = new Linter();
const flat = {
  languageOptions: { ecmaVersion: 2023, sourceType: "module" },
  rules: { "no-restricted-syntax": ["error", rawColorRule] },
};
// filename is plain .js — the selector matches Literal/TemplateElement nodes that exist
// identically whether parsed as JS or TSX, and a bare Linter without the typescript-eslint
// parser wired in cannot resolve a .tsx language at all ("No matching configuration").
const fires = (code) => linter.verify(code, flat, { filename: "probe.js" }).some((m) => m.ruleId === "no-restricted-syntax");

testCase("STILL BANNED — every real colour shape the rule names in its own message", () => {
  for (const code of [
    'const c = "#fff";',
    'const c = "#ffffff";',
    'const c = "#ffffffff";',
    'const c = "rgba(0,0,0,0.1)";',
    'const c = "hsl(0, 0%, 0%)";',
    'const c = "oklch(0.5 0.1 200)";',
    "const c = `bg-[#abc123]`;",
  ]) {
    assert(fires(code), `expected a finding for ${code}`);
  }
});

testCase("STILL ALLOWED — a plain ticket reference, spelled out per the rule's own recommended fix, and ordinary non-colour text", () => {
  for (const code of [
    'const label = "ticket 658";', // the recommended reword
    'const label = "bg-card";',
    'const label = "text-foreground";',
    'const label = "#" + ticketNumber;', // not a literal hex run at all — a concatenation
  ]) {
    assert(!fires(code), `expected NO finding for ${code}`);
  }
});

testCase("the case the rule is HONEST about being unable to distinguish — a bare ticket number literal — still fires (this is why the message must explain, not the selector change)", () => {
  assert(fires('const label = "#658";'), 'expected "#658" to still trip the selector — the fix is the message, not a carve-out');
});

console.log(
  failures === 0
    ? "\neslint-config selftest: OK — all cases passed."
    : `\neslint-config selftest: FAIL — ${failures} case(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
