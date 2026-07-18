// Freeze-lint Slice-4 hardening checkers (contract §4.9; the deferred
// finding-11 half — see check-frozen-workflows.mjs header, capabilities (d)+(e)):
//
//   (d) REGISTRY-VERSION MONOTONICITY — the workflow registry is parsed
//       STRUCTURALLY at HEAD and at the base ref; a class may only keep or
//       INCREASE its version, and a class present on base may never disappear.
//   (e) ENQUEUE-SITE PROVENANCE — a WDK enqueue call must receive a workflow
//       reference whose import provenance traces to workflows/registry.ts.
//
// Everything here is PURE (source strings in, violation strings out — no git,
// no fs) so the self-test (check-frozen-workflows.selftest.mjs) can inject
// simulated base/head pairs and fixture files; check-frozen-workflows.mjs
// wires these to the real working tree + base ref. Both checks fail CLOSED:
// an unparseable registry or an untraceable enqueue argument is a violation,
// never a skip. No dependencies — Node built-ins only. (Split out of the CLI
// script to honor the repo's 500-line file gate.)

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

// --- (d) registry-version monotonicity --------------------------------------

export const REGISTRY_REL = "packages/runtime/workflows/registry.ts";

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

// --- (e) enqueue-site provenance --------------------------------------------

/**
 * The WDK enqueue surface of the PINNED workflow@4.6.0 (contract §4.10),
 * enumerated from the package's own type surface — not guessed:
 * workflow/dist/api.d.ts re-exports from @workflow/core/runtime exactly
 * { start, getRun, getHookByToken, resumeHook, resumeWebhook, runStep, Run }.
 * Of these, `start` is the ONLY callable that takes a workflow REFERENCE (the
 * rest take run IDs / hook tokens; so do cancelRun / reenqueueRun / wakeUpRun /
 * recreateRunFromExisting on the deep runtime path). `workflow` (root) and
 * `workflow/runtime` do NOT export start — so `getWorld().start?.()` in the
 * boot plugin is a world-lifecycle call, not an enqueue, and stays clean.
 */
export const ENQUEUE_MODULES = new Set(["workflow/api", "@workflow/core/runtime", "@workflow/core/runtime/start"]);
export const ENQUEUE_CALLABLES = new Set(["start"]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** fs-free resolve of a relative specifier against a repo-relative file, extensionless. */
function resolveRelPure(fromRel, spec) {
  const parts = fromRel.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/").replace(/\.(?:[cm]?[jt]sx?)$/, "");
}
const REGISTRY_KEY = REGISTRY_REL.replace(/\.(?:[cm]?[jt]sx?)$/, "");

/** First top-level argument of a call, given the index of its opening paren. */
function firstCallArg(blanked, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < blanked.length; i++) {
    const ch = blanked[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return blanked.slice(openParenIdx + 1, i);
    } else if (ch === "," && depth === 1) {
      return blanked.slice(openParenIdx + 1, i);
    }
  }
  return null; // unbalanced
}

/** Classify the workflow argument of an enqueue call by import provenance. */
function classifyWorkflowArg(argRaw, bindings, rel) {
  if (argRaw == null) {
    return { ok: false, code: "UNTRACEABLE", why: "unbalanced call — cannot read the workflow argument (fail-closed)." };
  }
  const arg = argRaw
    .trim()
    .replace(/\s+(?:as|satisfies)\s+[^,]+$/, "") // TS cast on the argument
    .replace(/!+$/, "")
    .trim();
  if (arg === "") return { ok: false, code: "UNTRACEABLE", why: "no workflow argument (fail-closed)." };
  const chain = /^([A-Za-z_$][\w$]*)\s*((?:\.\s*[A-Za-z_$][\w$]*\s*|\[[^[\]]*\]\s*)*)$/.exec(arg);
  if (!chain) {
    return {
      ok: false,
      code: "UNTRACEABLE",
      why: `argument "${arg.slice(0, 60)}" is not a plain registry reference — pass a workflows/registry.ts export directly (fail-closed).`,
    };
  }
  const root = chain[1];
  const b = bindings.get(root);
  if (!b) {
    return {
      ok: false,
      code: "UNTRACEABLE",
      why: `"${root}" is not an imported binding (a local variable or parameter) — its provenance is unknown; pass the registry export directly (fail-closed).`,
    };
  }
  if (b.source.startsWith(".") && resolveRelPure(rel, b.source) === REGISTRY_KEY) return { ok: true };
  return {
    ok: false,
    code: "BYPASS",
    why: `"${root}" is imported from "${b.source}", not from workflows/registry.ts — enqueue sites must go through the registry so they always target the NEWEST version (Appendix A policy (b)).`,
  };
}

/**
 * Enqueue-site provenance over injected {rel, src} entries (pure; the CLI
 * feeds it the real packages/runtime files, the self-test feeds fixtures).
 * Per-identifier resolution: a file that imports the registry AND a workflow
 * module directly, then enqueues the direct import, is still a REJECT — the
 * exact bypass a "file imports the registry" grep would false-green.
 */
export function checkEnqueueSites(entries) {
  const violations = [];
  for (const { rel, src } of entries) {
    const pass1 = blankSource(src, { comments: true, strings: false, templates: true });
    const { bindings, reexports, dynamics } = parseImportBindings(pass1);
    for (const d of dynamics) {
      if (ENQUEUE_MODULES.has(d)) {
        violations.push(
          `ENQUEUE-DYNAMIC  ${rel}  dynamically imports "${d}" — the provenance of a dynamically obtained enqueue API is untraceable; import { start } statically (fail-closed).`,
        );
      }
    }
    for (const r of reexports) {
      if (ENQUEUE_MODULES.has(r)) {
        violations.push(
          `ENQUEUE-REEXPORT  ${rel}  re-exports the enqueue API from "${r}" — that launders \`start\` past this lint; import and call it directly instead (fail-closed).`,
        );
      }
    }
    const startNames = [];
    const nsNames = [];
    for (const [local, b] of bindings) {
      if (!ENQUEUE_MODULES.has(b.source)) continue;
      if (b.imported === "*") nsNames.push(local);
      else if (ENQUEUE_CALLABLES.has(b.imported)) startNames.push(local);
    }
    if (startNames.length === 0 && nsNames.length === 0) continue;
    const pass2 = blankSource(src, { comments: true, strings: true, templates: true });
    const sites = [];
    for (const name of startNames) {
      const re = new RegExp(`(?<![.\\w$])${escapeRe(name)}\\s*(?:\\?\\.)?\\s*\\(`, "g");
      let m;
      while ((m = re.exec(pass2))) sites.push({ open: m.index + m[0].length - 1, callee: name });
    }
    for (const ns of nsNames) {
      const callables = [...ENQUEUE_CALLABLES].map(escapeRe).join("|");
      const re = new RegExp(`(?<![.\\w$])${escapeRe(ns)}\\s*(?:\\?\\.|\\.)\\s*(${callables})\\s*(?:\\?\\.)?\\s*\\(`, "g");
      let m;
      while ((m = re.exec(pass2))) sites.push({ open: m.index + m[0].length - 1, callee: `${ns}.${m[1]}` });
    }
    for (const site of sites) {
      const arg = firstCallArg(pass2, site.open);
      const verdict = classifyWorkflowArg(arg, bindings, rel);
      if (verdict.ok) continue;
      violations.push(`ENQUEUE-${verdict.code}  ${rel}  \`${site.callee}(...)\`: ${verdict.why}`);
    }
  }
  return violations;
}

/** Test-ish paths excluded from the enqueue-site scan (a test may exercise internals). */
export function isTestPath(rel) {
  return /(^|\/)(tests?|__tests__)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
}
