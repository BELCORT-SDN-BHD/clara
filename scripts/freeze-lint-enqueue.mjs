// Freeze-lint capability (e): ENQUEUE-SITE PROVENANCE (contract §4.9; see
// check-frozen-workflows.mjs header). Pure — {rel, src} entries in, violation
// strings out; the CLI feeds it the real packages/runtime files, the self-test
// feeds fixtures. Fail-closed throughout: what cannot be traced is refused.

import { blankSource, parseImportBindings, escapeRe, REGISTRY_REL } from "./freeze-lint-lex.mjs";

/**
 * The WDK enqueue surface of the PINNED workflow@4.8.4 (contract §4.10),
 * enumerated from the package's own type surface — not guessed:
 * workflow/dist/api.d.ts re-exports from @workflow/core/runtime exactly the
 * callables { start, getRun, getHookByToken, resumeHook, resumeWebhook, runStep,
 * Run } (4.8.4 widened the re-export with TYPES only — Event, StartOptions,
 * StopSleepOptions, StopSleepResult, WorkflowReadableStream(Options), WorkflowRun
 * — which carry no call site).
 * Of these, `start` is the ONLY callable that takes a workflow REFERENCE (the
 * rest take run IDs / hook tokens; so do cancelRun / reenqueueRun / wakeUpRun /
 * recreateRunFromExisting AND 4.8.x's new readStream / listStreams on the deep
 * runtime path — every one of them is `(world, runId|streamId, …)`). `workflow`
 * (root) and `workflow/runtime` do NOT export start — so `getWorld().start?.()`
 * in the boot plugin is a world-lifecycle call, not an enqueue, and stays clean.
 */
export const ENQUEUE_MODULES = new Set(["workflow/api", "@workflow/core/runtime", "@workflow/core/runtime/start"]);
export const ENQUEUE_CALLABLES = new Set(["start"]);

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
  const fromRegistry = b.source.startsWith(".") && resolveRelPure(rel, b.source) === REGISTRY_KEY;
  if (fromRegistry) {
    // #11 (round-4 review, REOPENED) — this used to trust ANY binding whose SOURCE MODULE
    // resolved to workflows/registry.ts, regardless of which export it actually names.
    // checkRegistryViewIntegrity's own closed-world exports census (freeze-lint-checks.mjs) now
    // guarantees registry.ts exports NOTHING besides `workflows`, the canonical
    // `workflowsByName`, and allowlisted types — but a bypass through THIS check never needed
    // registry.ts to actually export anything unverified; it only needed this check to not look
    // at WHICH name was imported. `import { fake as alternateView } from "./registry.ts"` (a
    // binding whose local name is arbitrary, but whose ORIGINAL exported name — `b.imported`,
    // tracked separately by parseImportBindings — was never checked at all) sailed through
    // purely on source-module provenance. Pin to the two canonical exported names only.
    if (b.imported === "workflows" || b.imported === "workflowsByName") return { ok: true };
    if (b.imported === "*") {
      // A namespace import (`import * as reg from "./registry.ts"`) — the FIRST property
      // accessed off it must itself be one of the two canonical names; anything else (a
      // namespace access into some other, unverified export) is the exact same bypass shape.
      const firstProp = /^\s*\.\s*([A-Za-z_$][\w$]*)/.exec(chain[2] ?? "");
      if (firstProp && (firstProp[1] === "workflows" || firstProp[1] === "workflowsByName")) return { ok: true };
      return {
        ok: false,
        code: "BYPASS",
        why: `"${root}" is a namespace import of workflows/registry.ts, but the property accessed ("${firstProp ? firstProp[1] : arg}") is not \`workflows\` or \`workflowsByName\` — only those two exports are trusted (fail-closed).`,
      };
    }
    return {
      ok: false,
      code: "BYPASS",
      why: `"${root}" is imported from workflows/registry.ts, but as \`${b.imported}\` — only the canonical \`workflows\`/\`workflowsByName\` exports are ever trusted as an enqueue-provenance root, never an arbitrary re-exported or aliased binding, even one sourced from the registry module itself (fail-closed).`,
    };
  }
  return {
    ok: false,
    code: "BYPASS",
    why: `"${root}" is imported from "${b.source}", not from workflows/registry.ts — enqueue sites must go through the registry so they always target the NEWEST version (Appendix A policy (b)).`,
  };
}

/**
 * Enqueue-site provenance over injected {rel, src} entries. Per-identifier
 * resolution: a file that imports the registry AND a workflow module directly,
 * then enqueues the direct import, is still a REJECT — the exact bypass a
 * "file imports the registry" grep would false-green. Namespace imports of an
 * enqueue module get a full access scan (dot, computed, and bare use — S4-AB9
 * + S4-FX6): only property accesses are analyzable, so any OTHER use of the
 * namespace (destructuring, re-alias, spread, argument, export) is refused.
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
    // After a namespace property access, skip whitespace + one optional `?.`;
    // returns the index of the call's `(` or -1 if the access is not a call.
    const callParenAfter = (idx) => {
      let j = idx;
      while (j < pass2.length && /\s/.test(pass2[j])) j++;
      if (pass2[j] === "?" && pass2[j + 1] === ".") {
        j += 2;
        while (j < pass2.length && /\s/.test(pass2[j])) j++;
      }
      return pass2[j] === "(" ? j : -1;
    };
    for (const name of startNames) {
      const re = new RegExp(`(?<![.\\w$])${escapeRe(name)}\\s*(?:\\?\\.)?\\s*\\(`, "g");
      let m;
      while ((m = re.exec(pass2))) sites.push({ open: m.index + m[0].length - 1, callee: name });
    }
    const callables = [...ENQUEUE_CALLABLES].map(escapeRe).join("|");
    for (const ns of nsNames) {
      // Dot access: ns.start / ns?.start — a call is a site to classify; an
      // uncalled access extracts the enqueue callable into untracked space
      // (const go = api.start) and is refused (fail-closed).
      const dotRe = new RegExp(`(?<![.\\w$])${escapeRe(ns)}\\s*(?:\\?\\.|\\.)\\s*(${callables})\\b`, "g");
      let m;
      while ((m = dotRe.exec(pass2))) {
        const paren = callParenAfter(m.index + m[0].length);
        if (paren >= 0) sites.push({ open: paren, callee: `${ns}.${m[1]}` });
        else {
          violations.push(
            `ENQUEUE-UNTRACEABLE  ${rel}  \`${ns}.${m[1]}\` is accessed without being called — extracting the enqueue callable launders it past this lint; call it directly (fail-closed).`,
          );
        }
      }
      // Computed access: ns["start"] / ns?.["..."] (S4-AB9). Structure is
      // scanned on pass2 (strings blanked -> bracket depth is safe); the
      // bracket INTERIOR is read from pass1 at the same offsets (blanking is
      // length-preserving) so the literal is recoverable. A literal naming an
      // enqueue callable is treated exactly like the dot form; any interior
      // that is NOT a plain string literal (identifier, template, expression)
      // is refused — provenance of the callable is unknowable (fail-closed).
      const brRe = new RegExp(`(?<![.\\w$])${escapeRe(ns)}\\s*(?:\\?\\.)?\\s*\\[`, "g");
      while ((m = brRe.exec(pass2))) {
        const openBr = m.index + m[0].length - 1;
        let d = 0;
        let closeBr = -1;
        for (let i = openBr; i < pass2.length; i++) {
          const ch = pass2[i];
          if (ch === "[" || ch === "(" || ch === "{") d++;
          else if (ch === "]" || ch === ")" || ch === "}") {
            d--;
            if (d === 0) {
              closeBr = i;
              break;
            }
          }
        }
        if (closeBr < 0) {
          violations.push(
            `ENQUEUE-UNTRACEABLE  ${rel}  \`${ns}[...\`: unbalanced computed access on the enqueue namespace (fail-closed).`,
          );
          continue;
        }
        const interior = pass1.slice(openBr + 1, closeBr).trim();
        const lit = /^(["'])([A-Za-z_$][\w$]*)\1$/.exec(interior);
        if (!lit) {
          violations.push(
            `ENQUEUE-UNTRACEABLE  ${rel}  \`${ns}[${interior.slice(0, 40)}]\`: computed access on the enqueue namespace does not resolve to a string literal — the callable's identity is unknowable (fail-closed).`,
          );
          continue;
        }
        const prop = lit[2];
        if (!ENQUEUE_CALLABLES.has(prop)) continue; // e.g. api["getRun"] — not an enqueue callable
        const paren = callParenAfter(closeBr + 1);
        if (paren >= 0) sites.push({ open: paren, callee: `${ns}["${prop}"]` });
        else {
          violations.push(
            `ENQUEUE-UNTRACEABLE  ${rel}  \`${ns}["${prop}"]\` is accessed without being called — extracting the enqueue callable launders it past this lint; call it directly (fail-closed).`,
          );
        }
      }
      // Bare use (S4-FX6): ANY other occurrence of the enqueue namespace —
      // destructuring (const { start: launch } = ns), re-aliasing (const x =
      // ns), passing it as an argument, exporting it — extracts callables past
      // per-identifier provenance and is refused wholesale. Only property
      // accesses (owned by the two scans above) and the import's own `* as ns`
      // are legitimate. Spread (`...ns`) is caught separately below because
      // the lookbehind excludes occurrences preceded by a dot.
      const occRe = new RegExp(`(?<![.\\w$])${escapeRe(ns)}\\b`, "g");
      while ((m = occRe.exec(pass2))) {
        if (/\bas\s+$/.test(pass2.slice(Math.max(0, m.index - 40), m.index))) continue; // `* as ns` (import) / TS `as` type position
        let j = m.index + ns.length;
        while (j < pass2.length && /\s/.test(pass2[j])) j++;
        let k = j;
        if (pass2[k] === "?" && pass2[k + 1] === ".") {
          k += 2;
          while (k < pass2.length && /\s/.test(pass2[k])) k++;
        }
        const ch = pass2[k];
        if (ch === "." || ch === "[" || (k > j && /[A-Za-z_$]/.test(ch))) continue; // property access — the scans above own it
        violations.push(
          `ENQUEUE-UNTRACEABLE  ${rel}  bare use of the enqueue namespace "${ns}" (destructuring, re-alias, argument, or export) — callables extracted this way escape provenance; access \`${ns}.start(...)\` directly (fail-closed).`,
        );
      }
      const spreadRe = new RegExp(`\\.\\.\\.\\s*${escapeRe(ns)}\\b`, "g");
      while ((m = spreadRe.exec(pass2))) {
        violations.push(
          `ENQUEUE-UNTRACEABLE  ${rel}  spread of the enqueue namespace "...${ns}" — it copies the enqueue callable past provenance (fail-closed).`,
        );
      }
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
