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

const TOP_LEVEL_EXPORT_CONST_NAME_RE = /\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*/g;

/**
 * Every top-level `export const NAME[: TYPE] = <expr>;` in a fully-blanked
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

  const view = byName.get("workflowsByName");
  if (view) {
    const collapsed = view.exprText.replace(/\s+/g, "");
    if (collapsed !== "Object.freeze(workflows)") {
      violations.push(
        `REGISTRY-VIEW-INTEGRITY  ${label}: "workflowsByName" must be declared as EXACTLY \`Object.freeze(workflows)\` — found \`${view.exprText.trim().slice(0, 120)}\` instead. Anything else (a spread copy, a fresh literal, an unfrozen alias) is not provably the same object as \`workflows\`, so the enqueue-provenance check's trust in registry.ts exports would no longer be sound (Gate G1 MUST D, fail-closed).`,
      );
    }
  }

  for (const e of exportsFound) {
    if (e.name === "workflows" || e.name === "workflowsByName") continue;
    const collapsed = e.exprText.replace(/\s+/g, "");
    if (/\bworkflows\b/.test(e.exprText) && !SAFE_WORKFLOWS_DERIVATIONS.has(collapsed)) {
      violations.push(
        `REGISTRY-VIEW-INTEGRITY  ${label}: a second top-level export "${e.name}" references \`workflows\` via \`${e.exprText.trim().slice(0, 120)}\`, which is not one of the provably-safe derivations (a bare alias, Object.keys/values/entries, or exactly \`Object.freeze(workflows)\`). Only \`workflowsByName\` (declared as exactly \`Object.freeze(workflows)\`) may be trusted as a dynamic-dispatch view of the registry — any other shape is an ALTERNATE, unverified view that the enqueue-provenance check (e) would trust by import source alone; rename/remove it or fold it into \`workflowsByName\` (Gate G1 MUST D, fail-closed).`,
      );
    }
  }

  return violations;
}
