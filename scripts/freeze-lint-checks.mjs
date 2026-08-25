// Freeze-lint Slice-4 hardening checkers (contract §4.9; the deferred
// finding-11 half — see check-frozen-workflows.mjs header, capabilities (d)+(e)):
//
//   (d) REGISTRY-VERSION MONOTONICITY (this module) — the workflow registry is
//       parsed STRUCTURALLY at HEAD and at the base ref; a class may only keep
//       or INCREASE its version, and a class present on base may never
//       disappear.
//   (e) ENQUEUE-SITE PROVENANCE (freeze-lint-enqueue.mjs) — a WDK enqueue call
//       must receive a workflow reference whose import provenance traces to
//       workflows/registry.ts.
//   (f) REGISTRY-VIEW-INTEGRITY (this module, Gate G1 MUST D) — the
//       enqueue-provenance check in (e) accepts ANY identifier imported from
//       registry.ts as a proven-safe root, by name alone. That is only sound
//       because exactly one dynamic-dispatch view exists (`workflowsByName`)
//       and it is PROVABLY the same object as `workflows` (Object.freeze
//       returns its argument, so `workflowsByName === workflows`). This check
//       enforces both halves structurally at HEAD: `workflowsByName`, if
//       present, must be declared as EXACTLY `Object.freeze(workflows)` — no
//       spread copy, no fresh literal, no unfrozen alias — and no SECOND
//       top-level const export may exist whose initializer mentions
//       `workflows` (a second, unverified "view" would be silently trusted by
//       (e) merely for living in this file). Fail-closed: an unparseable
//       `workflowsByName` declaration is a violation, never a skip.
//
// Everything is PURE (source strings in, violation strings out — no git, no
// fs) so the self-test (check-frozen-workflows.selftest.mjs) can inject
// simulated base/head pairs and fixture files; check-frozen-workflows.mjs
// wires these to the real working tree + base ref. Both checks fail CLOSED:
// an unparseable registry or an untraceable enqueue argument is a violation,
// never a skip. No dependencies — Node built-ins only. This module is also
// the FACADE: consumers import every checker from here (the split across
// freeze-lint-lex.mjs / freeze-lint-enqueue.mjs honors the repo's 500-line
// file gate, not a public module boundary).

import { blankSource, parseImportBindings, REGISTRY_REL } from "./freeze-lint-lex.mjs";

export { blankSource, parseImportBindings, REGISTRY_REL };
export { checkEnqueueSites, isTestPath, ENQUEUE_MODULES, ENQUEUE_CALLABLES } from "./freeze-lint-enqueue.mjs";

// --- (d) registry-version monotonicity --------------------------------------

/** Version per the identifier suffix convention: closeExampleV2 / chatTurn_v1. */
export function identifierVersion(name) {
  const m = /_?[vV](\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}
/** Version per the module-file convention: "./closeExample.v1.js" / ".v2.ts". */
export function specVersion(spec) {
  const m = /\.v(\d+)(?:\.[cm]?[jt]sx?)?$/i.exec(spec);
  return m ? Number(m[1]) : null;
}

/**
 * STRUCTURAL parse of the workflow registry: blank comments/strings, resolve
 * the import bindings, then read the `export const workflows = { class:
 * identifier }` object literal entry by entry — never a regex over the whole
 * file. Fail-closed: an entry whose value is not a plain identifier IMPORTED
 * from a RELATIVE module, carrying a parseable _vN/VN version that agrees
 * with the module's .vN suffix (when present), is a problem, not a skip —
 * otherwise an inline `const chatTurnV2 = chatTurnV1;` alias could fake a
 * repoint. Returns { classes: Map<class,{identifier,version,source}>, problems }.
 */
export function parseRegistrySource(src, label) {
  const problems = [];
  const classes = new Map();
  const pass1 = blankSource(src, { comments: true, strings: false, templates: true });
  const { bindings } = parseImportBindings(pass1);
  const pass2 = blankSource(src, { comments: true, strings: true, templates: true });
  const declM = /\bexport\s+const\s+workflows\s*=\s*\{/.exec(pass2);
  if (!declM) {
    problems.push(
      `REGISTRY-UNPARSEABLE  ${label}: no \`export const workflows = { ... }\` object literal found — the monotonicity gate cannot run (fail-closed). Keep the registry in its canonical shape.`,
    );
    return { classes, problems };
  }
  const openIdx = declM.index + declM[0].length - 1;
  let depth = 0;
  let endIdx = -1;
  for (let i = openIdx; i < pass2.length; i++) {
    const ch = pass2[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) {
    problems.push(`REGISTRY-UNPARSEABLE  ${label}: unbalanced \`workflows\` object literal (fail-closed).`);
    return { classes, problems };
  }
  const body = pass2.slice(openIdx + 1, endIdx);
  const entries = [];
  {
    let d = 0;
    let cur = "";
    for (const ch of body) {
      if (ch === "{" || ch === "(" || ch === "[") d++;
      else if (ch === "}" || ch === ")" || ch === "]") d--;
      if (ch === "," && d === 0) {
        entries.push(cur);
        cur = "";
      } else cur += ch;
    }
    entries.push(cur);
  }
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue; // trailing comma
    let className;
    let ident;
    const pair = /^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*!*$/.exec(entry);
    if (pair) {
      className = pair[1];
      ident = pair[2];
    } else if (/^[A-Za-z_$][\w$]*$/.test(entry)) {
      className = entry; // shorthand — the class name IS the identifier
      ident = entry;
    } else {
      problems.push(
        `REGISTRY-UNPARSEABLE  ${label}: entry "${entry.slice(0, 60)}" is not \`class: importedIdentifierVN\` — its version cannot be proven (fail-closed).`,
      );
      continue;
    }
    const b = bindings.get(ident);
    if (!b || !b.source.startsWith(".")) {
      problems.push(
        `REGISTRY-UNPARSEABLE  ${label}: "${className}" points at "${ident}", which is not imported from a RELATIVE workflow module — an inline or laundered identifier cannot prove its version (fail-closed).`,
      );
      continue;
    }
    const iv = identifierVersion(ident);
    if (iv === null) {
      problems.push(
        `REGISTRY-UNPARSEABLE  ${label}: "${className}" identifier "${ident}" carries no _vN/VN version suffix — the monotonicity gate cannot read its version (fail-closed).`,
      );
      continue;
    }
    const sv = specVersion(b.source);
    if (sv !== null && sv !== iv) {
      problems.push(
        `REGISTRY-VERSION-MISMATCH  ${label}: "${className}" identifier "${ident}" says v${iv} but its module "${b.source}" says v${sv} — a mislabelled repoint (fail-closed).`,
      );
      continue;
    }
    classes.set(className, { identifier: ident, version: iv, source: b.source });
  }
  return { classes, problems };
}

/**
 * Monotonicity law (contract §4.9): for every workflow class present on the
 * base, the HEAD registry entry's version may only stay EQUAL or strictly
 * INCREASE; a class removed from the registry (or the whole registry deleted)
 * is a REJECT — its non-terminal runs would be stranded (policy (c)). New
 * classes are fine. Pure: takes the two sources (null = file absent there).
 */
export function checkRegistryMonotonicity(baseSrc, headSrc, baseLabel = "base") {
  const violations = [];
  if (baseSrc == null && headSrc == null) return violations;
  let head = { classes: new Map(), problems: [] };
  if (headSrc != null) {
    head = parseRegistrySource(headSrc, "registry@HEAD");
    violations.push(...head.problems);
  }
  if (baseSrc == null) return violations; // registry introduced in this change — every class is new
  const bse = parseRegistrySource(baseSrc, `registry@${baseLabel}`);
  violations.push(...bse.problems);
  for (const [className, b] of bse.classes) {
    const h = head.classes.get(className);
    if (!h) {
      violations.push(
        `REGISTRY-CLASS-REMOVED  workflow class "${className}" (v${b.version} on ${baseLabel}) is gone from ${REGISTRY_REL} — removing a class strands its non-terminal runs (policy (c)); keep the entry until zero runs reference it.`,
      );
      continue;
    }
    if (h.version < b.version) {
      violations.push(
        `REGISTRY-DOWNGRADE  workflow class "${className}" repointed v${b.version} -> v${h.version} (${h.identifier}) — a registry entry may only stay or INCREASE (Appendix A policy (b)); new runs must never target an older body.`,
      );
    }
  }
  return violations;
}

// --- (f) registry-view integrity (Gate G1 MUST D) ---------------------------

// SHOULD-2 (round-5, opus reviewer's own probes): widened to `let`/`var` too — `export let
// alternateView = {...}` was fully invisible to the const-only form (the review's own probe,
// confirmed against this exact checker before the fix).
const TOP_LEVEL_EXPORT_CONST_NAME_RE = /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*/g;

/**
 * Every top-level `export const|let|var NAME[: TYPE] = <expr>;` in a fully-blanked
 * source (comments/strings/templates blanked so bracket depth can't be
 * fooled by their content) — [{name, exprText, start}]. The optional TYPE
 * annotation is skipped by scanning for the real assignment `=` at
 * `(){}[]`-depth 0 that is NOT part of `=>`/`==`/`===`/`!=`/`!==`/`<=`/`>=`
 * (a naive "first bare `=`" scan misfires on a `Record<K, (x) => Y>`-shaped
 * annotation, whose `=>` contains a `=`). exprText then runs to the
 * statement's own top-level `;` using the same depth scan, never a naive
 * first-semicolon match.
 */
function extractTopLevelConstExports(blanked) {
  const out = [];
  TOP_LEVEL_EXPORT_CONST_NAME_RE.lastIndex = 0;
  let m;
  while ((m = TOP_LEVEL_EXPORT_CONST_NAME_RE.exec(blanked))) {
    const name = m[1];
    let depth = 0;
    let assignIdx = -1;
    for (let i = TOP_LEVEL_EXPORT_CONST_NAME_RE.lastIndex; i < blanked.length; i++) {
      const ch = blanked[i];
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
      else if (ch === "=" && depth === 0) {
        const prev = blanked[i - 1];
        const next = blanked[i + 1];
        if (prev === "=" || prev === "!" || prev === "<" || prev === ">" || next === "=" || next === ">") continue;
        assignIdx = i;
        break;
      }
    }
    if (assignIdx < 0) {
      TOP_LEVEL_EXPORT_CONST_NAME_RE.lastIndex = m.index + m[0].length;
      continue; // no assignment found (fail-closed elsewhere: callers only look up names they expect)
    }
    const exprStart = assignIdx + 1;
    depth = 0;
    let end = blanked.length;
    for (let i = exprStart; i < blanked.length; i++) {
      const ch = blanked[i];
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
      else if (ch === ";" && depth === 0) {
        end = i;
        break;
      }
    }
    out.push({ name, exprText: blanked.slice(exprStart, end), start: m.index });
    TOP_LEVEL_EXPORT_CONST_NAME_RE.lastIndex = end;
  }
  return out;
}

/** RHS forms that derive PURELY and ONLY from `workflows`, with nothing else
 * mixed in, so their values (if any) are provably the real frozen originals
 * — never an alternate/fake collection. Anything else that mentions
 * `workflows` (a spread copy, a fresh literal, a second `Object.freeze`
 * under a different name, ...) is an unverified alternate view. */
const SAFE_WORKFLOWS_DERIVATIONS = new Set([
  "workflows",
  "Object.keys(workflows)",
  "Object.values(workflows)",
  "Object.entries(workflows)",
]);

/**
 * Gate G1 MUST D — REGISTRY-VIEW-INTEGRITY. Structural, HEAD-only (a standing
 * shape policy, not a base-diff monotonicity check): the enqueue-provenance
 * check (e) trusts ANY identifier imported from registry.ts as a proven-safe
 * dispatch root, by IMPORT SOURCE alone — that trust is only sound because
 * exactly one dynamic-dispatch view exists (`workflowsByName`) and it is
 * PROVABLY `workflows` itself, not merely a same-shaped copy. Enforces:
 *
 *   1. If `workflowsByName` is exported, its initializer (whitespace-
 *      collapsed) must be EXACTLY `Object.freeze(workflows)` — a spread
 *      copy, a fresh object literal, or an unfrozen alias all LOOK like a
 *      view but prove nothing about reference identity or mutability.
 *   2. No OTHER top-level `export const` (besides `workflows` itself and a
 *      correctly-shaped `workflowsByName`) may have an initializer
 *      mentioning the `workflows` identifier — a second, differently-shaped
 *      "view" would be silently trusted by (e) merely for living in this
 *      file, without ever being proven to alias the real registry.
 *
 * Pure: registry.ts being entirely absent from a change is fine (no
 * violations); an unparseable/wrong-shaped `workflowsByName` when the name
 * IS present is fail-closed, never a skip.
 */
export function checkRegistryViewIntegrity(headSrc, label = "registry@HEAD") {
  const violations = [];
  if (headSrc == null) return violations;
  const blanked = blankSource(headSrc, { comments: true, strings: true, templates: true });
  const exportsFound = extractTopLevelConstExports(blanked);
  const byName = new Map(exportsFound.map((e) => [e.name, e]));

  // M8(b) (opus R2 + Codex review): the check below only recognizes `export const
  // workflowsByName = ...` — an ALIASED RE-EXPORT (`export { fake as workflowsByName }`) or
  // any other export syntax carrying the name is a COMPLETELY different shape that
  // extractTopLevelConstExports was never built to see, so `view` below would be undefined
  // and the whole check would silently return ZERO violations — a clean pass for a name that
  // is not provably anything. Fail CLOSED instead: any occurrence of the bare identifier
  // "workflowsByName" that is NOT explained by exactly one recognized declaration is a
  // violation, never a silent skip (absence of the recognized shape is not evidence of safety
  // — this codebase's own review law 2, now enforced in its own linter).
  const occurrences = blanked.match(/\bworkflowsByName\b/g) ?? [];
  const view = byName.get("workflowsByName");
  if (occurrences.length > 0 && !view) {
    violations.push(
      `REGISTRY-VIEW-INTEGRITY  ${label}: "workflowsByName" appears in this file (${occurrences.length} occurrence(s)) but NOT as a recognized \`export const workflowsByName = ...\` declaration — an aliased re-export (\`export { x as workflowsByName }\`) or any other export shape is REJECTED, never silently trusted (fail-closed).`,
    );
  } else if (occurrences.length > 1) {
    violations.push(
      `REGISTRY-VIEW-INTEGRITY  ${label}: "workflowsByName" appears ${occurrences.length} times — exactly ONE declaration is ever trusted; a second occurrence anywhere (a duplicate export, a re-export, a later reassignment) is REJECTED, never silently ignored.`,
    );
  }

  if (view) {
    const collapsed = view.exprText.replace(/\s+/g, "");
    if (collapsed !== "Object.freeze(workflows)") {
      violations.push(
        `REGISTRY-VIEW-INTEGRITY  ${label}: "workflowsByName" must be declared as EXACTLY \`Object.freeze(workflows)\` — found \`${view.exprText.trim().slice(0, 120)}\` instead. Anything else (a spread copy, a fresh literal, an unfrozen alias) is not provably the same object as \`workflows\`, so the enqueue-provenance check's trust in registry.ts exports would no longer be sound (Gate G1 MUST D, fail-closed).`,
      );
    }
  }

  // #11 (round-4 review, REOPENED) — this used to only flag a second const export whose
  // initializer TEXTUALLY MENTIONS `workflows` — `export const alternateView = {evil:fn};`
  // mentions nothing about `workflows` at all and sailed straight through. Unconditional now:
  // every OTHER top-level const export must collapse to a SAFE_WORKFLOWS_DERIVATIONS shape,
  // whether or not it references `workflows` in its own text.
  for (const e of exportsFound) {
    if (e.name === "workflows" || e.name === "workflowsByName") continue;
    const collapsed = e.exprText.replace(/\s+/g, "");
    if (!SAFE_WORKFLOWS_DERIVATIONS.has(collapsed)) {
      violations.push(
        `REGISTRY-VIEW-INTEGRITY  ${label}: a second top-level export "${e.name}" is declared as \`${e.exprText.trim().slice(0, 120)}\`, which is not one of the provably-safe derivations (a bare alias, Object.keys/values/entries, or exactly \`Object.freeze(workflows)\`). Only \`workflowsByName\` (declared as exactly \`Object.freeze(workflows)\`) may be trusted as a dynamic-dispatch view of the registry — any other shape is an ALTERNATE, unverified view that the enqueue-provenance check (e) would trust by import source alone; rename/remove it or fold it into \`workflowsByName\` (Gate G1 MUST D, fail-closed).`,
      );
    }
  }

  violations.push(...checkRegistryExportsClosedWorld(headSrc, label));

  return violations;
}

/** Every TOP-LEVEL (brace/paren/bracket depth 0) `export` keyword's own start index in a
 *  blanked source — SHOULD-2's own scanning primitive (round-5, opus reviewer's own probes).
 *  The prior version of this census used a FIXED SET of regexes (one per recognized shape) and
 *  reported only what matched one of them — reject-KNOWN, not reject-unknown: `export * from
 *  "..."`, `export * as ns from "..."`, `export {x} from "./rel"` (the reexportRe below
 *  required `}` immediately followed by `;`, which a trailing `from "..."` clause breaks), and
 *  `export let x = ...` (the const-only name regex) all silently matched NOTHING and were never
 *  reported at all — the docstring's own "closed world" claim was false, proven by the
 *  reviewer's own probes. This scanner is reject-UNKNOWN instead: it finds EVERY export
 *  keyword, classifies it, and anything that does not fit a recognized, explicitly-checked
 *  shape falls through to a catch-all violation — there is no shape this scanner can see and
 *  silently approve by construction. */
function findTopLevelExportPositions(blanked) {
  const positions = [];
  let depth = 0;
  const n = blanked.length;
  const isWordChar = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
  for (let i = 0; i < n; i++) {
    const ch = blanked[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if (depth === 0 && ch === "e" && blanked.slice(i, i + 6) === "export") {
      const before = i > 0 ? blanked[i - 1] : undefined;
      const after = blanked[i + 6];
      if (!isWordChar(before) && !isWordChar(after)) positions.push(i);
    }
  }
  return positions;
}

/** Balanced-scan the export list `{ a, b as c, ... }` starting at `openBraceIdx`, return
 *  { items:[{local,exported,aliased}], afterBrace: index just past the closing '}' }. */
function parseExportBraceList(blanked, openBraceIdx) {
  let depth = 0;
  let end = blanked.length;
  for (let i = openBraceIdx; i < blanked.length; i++) {
    const ch = blanked[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const inner = blanked.slice(openBraceIdx + 1, end);
  const items = [];
  for (const piece of inner.split(",")) {
    const p = piece.trim();
    if (!p) continue;
    const asM = p.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (asM) items.push({ local: asM[1], exported: asM[2], aliased: true });
    else if (/^[A-Za-z_$][\w$]*$/.test(p)) items.push({ local: p, exported: p, aliased: false });
    else items.push({ local: p, exported: p, aliased: false, unparsed: true });
  }
  return { items, afterBrace: end + 1 };
}

/** #11 (round-4 review, both legs, REOPENED) — a CLOSED-WORLD census of EVERY export shape
 *  registry.ts can carry, closing what the checks above (built to catch a suspicious REFERENCE
 *  to `workflows`, or a specific `workflowsByName` mis-declaration) were never built to see:
 *  `export { fake as alternateView }` — a bare re-export under an ARBITRARY exported name,
 *  naming a LOCAL binding (`fake`) that is not even an import at all. freeze-lint-enqueue.mjs's
 *  own provenance check (classifyWorkflowArg) used to trust ANY name imported FROM registry.ts,
 *  so `import { alternateView } from "./registry.ts"` then `start(alternateView.evilThing, ...)`
 *  traced clean purely on source-module provenance — see that file's own #11 fix (pinned to the
 *  canonical `workflows`/`workflowsByName` import names only). This census is the OTHER half: a
 *  re-export is legitimate ONLY if it is a BARE `export { x }` naming a binding this file
 *  ACTUALLY imported via a relative path — the real, individual frozen workflow exports every
 *  class needs for check-frozen-workflows.mjs's own golden-hash tracking (every historical
 *  `chatTurn_v1`..`chatTurn_v13`, not just whichever is CURRENTLY pointed to inside the
 *  `workflows` object — constraint 9 requires every one of them to stay exported), and it must
 *  be UNALIASED (the exported name equals the imported name). A DIRECT `export {x} from "..."`
 *  is rejected unconditionally, relative or not — `x` is never bound locally in that shape, so
 *  there is nothing to verify it against; registry.ts's own real pattern is always
 *  import-then-bare-re-export, never this one. A function/class/enum declared and exported
 *  directly in this file, a `export default`, and any WILDCARD re-export (`export * from`/
 *  `export * as ns from` — an unbounded, unverifiable surface by definition) are all rejected
 *  outright. SHOULD-2 (round-5): reject-UNKNOWN — see findTopLevelExportPositions' own header
 *  for why the prior reject-KNOWN version's docstring claim was false. */
function checkRegistryExportsClosedWorld(headSrc, label) {
  const violations = [];
  // strings:false (unlike checkRegistryViewIntegrity's own `blanked`) — parseImportBindings
  // reads the import specifier's own quoted string, which a strings:true blank would erase
  // entirely (checkEnqueueSites' own established idiom, freeze-lint-enqueue.mjs).
  const blanked = blankSource(headSrc, { comments: true, strings: false, templates: true });
  const { bindings } = parseImportBindings(blanked);

  for (const idx of findTopLevelExportPositions(blanked)) {
    const rest = blanked.slice(idx + 6);
    const trimmed = rest.replace(/^\s+/, "");
    const restStart = idx + 6 + (rest.length - trimmed.length);

    if (/^const\b/.test(trimmed) || /^let\b/.test(trimmed) || /^var\b/.test(trimmed)) continue; // extractTopLevelConstExports' own domain — validated by the caller's loop
    if (/^type\b/.test(trimmed) || /^interface\b/.test(trimmed)) continue; // erased at compile time — zero runtime existence, cannot be an enqueue-bypass vector
    if (/^default\b/.test(trimmed)) {
      violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export default\` — registry.ts's closed world has no legitimate use for a default export; REJECTED on sight.`);
      continue;
    }
    if (/^(?:async\s+)?function\b/.test(trimmed) || /^class\b/.test(trimmed) || /^enum\b/.test(trimmed)) {
      const kind = /^enum\b/.test(trimmed) ? "enum" : /^class\b/.test(trimmed) ? "class" : "function";
      const nameM = trimmed.match(/^(?:async\s+)?(?:function|class|enum)\s+([A-Za-z_$][\w$]*)/);
      violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export ${kind} ${nameM ? nameM[1] : "?"}\` — registry.ts's own closed world admits only \`workflows\`/\`workflowsByName\`, SAFE_WORKFLOWS_DERIVATIONS-shaped consts, and bare unaliased workflow re-exports; a ${kind} declared and exported directly in this file is none of those and is REJECTED on sight.`);
      continue;
    }
    if (/^\*\s*as\s+[A-Za-z_$][\w$]*\s+from\b/.test(trimmed)) {
      const nsM = trimmed.match(/^\*\s*as\s+([A-Za-z_$][\w$]*)/);
      violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export * as ${nsM ? nsM[1] : "?"} from ...\` — a namespace wildcard re-export carries an UNBOUNDED, unverifiable set of names; REJECTED unconditionally, never inspected shape-by-shape.`);
      continue;
    }
    if (/^\*\s*from\b/.test(trimmed)) {
      violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export * from ...\` — a wildcard re-export carries an UNBOUNDED, unverifiable set of names; REJECTED unconditionally.`);
      continue;
    }
    if (/^\{/.test(trimmed)) {
      const braceIdx = restStart;
      const { items, afterBrace } = parseExportBraceList(blanked, braceIdx);
      const fromM = blanked.slice(afterBrace).match(/^\s*from\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/);
      const fromSource = fromM ? fromM[2] : null;
      for (const item of items) {
        if (item.exported === "workflows" || item.exported === "workflowsByName") continue; // covered by checkRegistryViewIntegrity above
        if (item.unparsed) {
          violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: an export-list entry ("${item.local}") did not parse as a plain identifier or an \`a as b\` pair — REJECTED, fail-closed on the unparseable shape rather than guessed at.`);
          continue;
        }
        if (item.aliased) {
          violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export { ${item.local} as ${item.exported} }${fromSource ? ` from "${fromSource}"` : ""}\` is an ALIASED re-export — even if "${item.local}" is itself a legitimate workflow implementation, exporting it under a DIFFERENT name is indistinguishable from smuggling an unrelated binding out under a plausible-looking one. Re-export under its OWN name only.`);
          continue;
        }
        if (fromSource !== null) {
          // `export { x } from "somewhere"` (relative OR package) — REJECTED unconditionally,
          // both directions: `x` is never a local binding at all in THIS file (bindings only
          // tracks THIS file's own `import` statements — a direct re-export never creates one),
          // so there is nothing here to verify against `workflows`' own value identifiers even
          // when the source path IS relative and even when the name happens to match a real
          // workflow file. registry.ts's own real pattern is always import-THEN-bare-re-export
          // (`import {x} from "./x.js"; export {x};`), never a direct `from` re-export — this
          // shape has no legitimate use in this file at all, so it never earns a conditional
          // pass the way a bare re-export's relative-import check does.
          violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export { ${item.exported} } from "${fromSource}"\` is a DIRECT re-export from another module — "${item.local}" is never bound locally in this file at all, so there is nothing to verify it against; registry.ts's own real pattern is always import-then-bare-re-export, never this shape. REJECTED unconditionally, relative or not.`);
          continue;
        }
        const b = bindings.get(item.local);
        if (!b || !b.source.startsWith(".")) {
          violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: \`export { ${item.exported} }\` does not name a binding this file imported via a relative path — registry.ts's closed world admits only \`workflows\`/\`workflowsByName\`, a SAFE_WORKFLOWS_DERIVATIONS-shaped const, or a bare re-export of an actually-imported local workflow file; a freshly-declared local, or anything sourced from a non-relative (package) import, is REJECTED on sight (fail-closed).`);
        }
      }
      continue;
    }
    // Fail-closed catch-all (SHOULD-2's own point): any export shape not explicitly recognized
    // above is REJECTED, never silently passed — the census's own closed-world claim depends on
    // this branch existing, not on the enumerated shapes above being exhaustive by inspection.
    violations.push(`REGISTRY-EXPORTS-CLOSED-WORLD  ${label}: an \`export\` statement did not match any recognized shape (const/let/var, type/interface, default, function/class/enum, \`export {...}\` with or without \`from\`, or a wildcard re-export) — REJECTED, fail-closed on the unrecognized syntax rather than silently passed: \`${trimmed.slice(0, 60).trim()}\``);
  }

  return violations;
}
