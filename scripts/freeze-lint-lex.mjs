// Freeze-lint shared lexical base (used by freeze-lint-checks.mjs — registry
// monotonicity — and freeze-lint-enqueue.mjs — enqueue provenance; see
// check-frozen-workflows.mjs header, capabilities (d)+(e)). Pure string
// functions, no git/fs, no dependencies. (Split across small modules to honor
// the repo's 500-line file gate; freeze-lint-checks.mjs re-exports the public
// surface so consumers import from one place.)

/** The one registry every enqueue site must draw workflow references from. */
export const REGISTRY_REL = "packages/runtime/workflows/registry.ts";

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Length-preserving lexical blanking. Walks the source ONCE tracking real
 * state (line/block comments; ' " ` strings) and overwrites the selected
 * region kinds with spaces (newlines kept), so later structural regexes and
 * balanced scans run at unchanged offsets and can't be fooled by a `start(`
 * inside a comment or a quote inside a string. Template literals are blanked
 * whole, interpolation included — fail-closed: code hidden in `${...}` is
 * unanalyzable, and blanking it can only lose a *registry-OK* pattern, never
 * green a bypass (a bypass needs a real, visible call). Known limit (shared
 * with the CLI script's stripComments): regex literals containing quote or
 * slash characters can confuse the scan; none exist in the lint scope.
 */
export function blankSource(src, { comments = true, strings = false, templates = strings } = {}) {
  const out = src.split("");
  const blank = (j) => {
    if (out[j] !== "\n" && out[j] !== "\r") out[j] = " ";
  };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      const from = i;
      while (i < n && src[i] !== "\n") i++;
      if (comments) for (let j = from; j < i; j++) blank(j);
      continue;
    }
    if (ch === "/" && next === "*") {
      const from = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(n, i + 2);
      if (comments) for (let j = from; j < i; j++) blank(j);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const from = i;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        if (quote !== "`" && src[i] === "\n") break; // unterminated — bail at EOL
        i++;
      }
      const doBlank = quote === "`" ? templates : strings;
      if (doBlank) for (let j = from + 1; j < i - 1; j++) blank(j); // keep the quotes
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * Identifier -> import-source resolver (the provenance map). Input must be
 * comment-blanked (blankSource) so a commented-out import is never parsed.
 * Returns:
 *   bindings:  Map<localName, { source, imported }> — imported is the exported
 *              name ("start"), "default", or "*" for a namespace import;
 *   reexports: sources of `export ... from "..."` statements;
 *   dynamics:  sources of import("...") / require("...") calls.
 */
export function parseImportBindings(src) {
  const bindings = new Map();
  const reexports = [];
  const dynamics = [];
  const IDENT = /^[A-Za-z_$][\w$]*$/;
  const importRe = /\bimport\s+([^'";]+?)\s*from\s*["']([^"'\n]+)["']/g;
  let m;
  while ((m = importRe.exec(src))) {
    const clause = m[1].trim();
    const source = m[2];
    if (/^type\b/.test(clause)) continue; // TS type-only import — no runtime binding
    let rest = clause;
    const named = rest.match(/\{([\s\S]*)\}/);
    if (named) {
      for (const piece of named[1].split(",")) {
        const p = piece.trim();
        if (!p || /^type\b/.test(p)) continue;
        const asM = p.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        if (asM) bindings.set(asM[2], { source, imported: asM[1] });
        else if (IDENT.test(p)) bindings.set(p, { source, imported: p });
      }
      rest = rest.replace(/\{[\s\S]*\}/, "");
    }
    const ns = rest.match(/\*\s*as\s+([A-Za-z_$][\w$]*)/);
    if (ns) bindings.set(ns[1], { source, imported: "*" });
    const def = rest
      .replace(/\*\s*as\s+[A-Za-z_$][\w$]*/, "")
      .replace(/,/g, " ")
      .trim();
    if (IDENT.test(def)) bindings.set(def, { source, imported: "default" });
  }
  const reexportRe = /\bexport\s+(?:\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[^}]*\})\s*from\s*["']([^"'\n]+)["']/g;
  while ((m = reexportRe.exec(src))) reexports.push(m[1]);
  const dynRe = /\b(?:import|require)\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
  while ((m = dynRe.exec(src))) dynamics.push(m[1]);
  return { bindings, reexports, dynamics };
}
