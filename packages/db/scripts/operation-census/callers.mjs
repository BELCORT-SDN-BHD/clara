// OPERATION-CONTRACT CENSUS — THE CALLER SIDE.
//
// Who reaches the boundary, from where, and AS WHICH ROLE. Two scanners (apps/web through
// PostgREST, packages/runtime through SQL text), the lane resolution that decides which role
// a runtime call site checks out under, and the step that resolves a scanned name against the
// live catalog.
//
// THE LANE IS RESOLVED LEXICALLY, never from "which role happens to hold the grant" — that
// would make `called_ungranted` unable to fire at all. See `resolveLaneAliases` for why the
// workflow-local helpers have to be traced to a fixed point before any of this is trustworthy.
//
// Split out of scripts/operation-census.mjs at this repository's 500-line ceiling. Behaviour
// is byte-identical to the code it replaced.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LANE_WRAPPERS,
  OWNER_ROLE,
  RELATION_KEYWORDS,
  RUNTIME_DEFAULT_ROLE,
  RUNTIME_ROOTS,
  WEB_LANE_ROLE,
  WEB_ROOTS,
} from "./scope.mjs";
import {
  CODE,
  STRING,
  balancedParenSpan,
  enclosingCalls,
  expressionEnd,
  lexSource,
  lineOf,
  listSourceFiles,
  matchBracket,
  precedingWord,
  readObjectKeys,
  readStringLiteral,
  skipGenerics,
  skipTrivia,
  stringRunAround,
} from "./lexer.mjs";

/**
 * Web callers: `callDoor("fn", {…})`, `pgrestRpc("fn", {…})`, `.rpc("fn", {…})`.
 * @returns {{callers: object[], scanErrors: object[]}}
 */
function scanWebCallers(repoRoot) {
  const callers = [];
  const scanErrors = [];
  const entryRe = /(?:\bcallDoor|\bpgrestRpc|\.rpc)(?=\s*[<(])/g;
  for (const root of WEB_ROOTS) {
    for (const file of listSourceFiles(repoRoot, root)) {
      const text = readFileSync(join(repoRoot, file), "utf8");
      const { mask, ok, endState } = lexSource(text);
      if (!ok) scanErrors.push({ file, reason: `lexer ended in state "${endState}"` });
      entryRe.lastIndex = 0;
      let m;
      while ((m = entryRe.exec(text)) !== null) {
        if (mask[m.index] !== CODE) continue; // a comment or a string — not a call
        let j = m.index + m[0].length;
        j = skipTrivia(text, mask, j);
        if (text[j] === "<") {
          const after = skipGenerics(text, j);
          if (after === -1) continue;
          j = skipTrivia(text, mask, after);
        }
        if (text[j] !== "(") continue;
        j = skipTrivia(text, mask, j + 1);
        const lit = readStringLiteral(text, j);
        if (!lit) continue; // a computed function name — nothing static to census
        j = skipTrivia(text, mask, lit.end);
        let args = null;
        let argsComplete = true;
        if (text[j] === ",") {
          j = skipTrivia(text, mask, j + 1);
          if (text[j] === "{") {
            const obj = readObjectKeys(text, mask, j);
            if (obj) { args = obj.keys.slice().sort(); argsComplete = obj.complete; }
            else argsComplete = false;
          } else {
            argsComplete = false; // a variable was passed — the keys are not statically known
          }
        }
        callers.push({
          lane: "web",
          file,
          line: lineOf(text, m.index),
          function: lit.value,
          via: m[0].startsWith(".") ? "rpc" : m[0].trim(),
          args,
          args_complete: argsComplete,
          lane_roles: [WEB_LANE_ROLE],
          lane_source: "web_postgrest",
        });
      }
    }
  }
  return { callers, scanErrors };
}

/** A SQL statement keyword must appear before the match, or this text is prose. */
const SQL_STATEMENT_WORD = /\b(select|insert|update|delete|with|call|do|perform|create|alter|grant|revoke|execute|from|join|returning)\b/i;

/**
 * Is `clara.<name>(` at `pos` really SQL sent to the server?
 *
 * TWO WAYS THE NAIVE ANSWER IS WRONG, both measured in this tree:
 *   * PROSE IN A STRING. `reconciler-render.mjs` logs "these need
 *     clara.requeue_render_job(<job id>, <why>) once the cause is fixed" — a sentence for a
 *     human, inside a template literal. It names a door it does not call.
 *   * A SIGNATURE, NOT A CALL. `stripe-applier.mjs` exports
 *     `APPLIER_SIGNATURE = "clara.apply_stripe_events(integer)"` and probes it with
 *     `to_regprocedure`. A catalog probe asks whether a door EXISTS; it never enters it.
 *
 * So a match counts only when a SQL statement keyword precedes it in the same string run AND
 * the match is not inside a SQL single-quoted literal (odd quote parity — which is what a
 * `to_regprocedure('clara.x(uuid)')` probe looks like from here).
 */
function looksLikeSqlCall(text, mask, pos) {
  const run = stringRunAround(text, mask, pos);
  const before = text.slice(run.start, pos);
  if (!SQL_STATEMENT_WORD.test(before)) return false;
  let quotes = 0;
  for (let i = 0; i < before.length; i += 1) if (before[i] === "'") quotes += 1;
  return quotes % 2 === 0;
}

/**
 * Top-level function declarations and their bodies, so a lane wrapper can be traced through
 * the workflow-local helper that wraps it (`readScoped` -> `withReadWakeScoped` ->
 * clara_agent_ro). Derived from the source, never a hand-kept list of helper names.
 * @returns {{name: string, start: number, end: number}[]}
 */
function functionBodies(text, mask) {
  const out = [];
  const declared = new Set();
  const declRe = /\b(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/g;
  let m;
  while ((m = declRe.exec(text)) !== null) {
    if (mask[m.index] !== CODE) continue;
    const name = m[1] || m[2];
    declared.add(name);
    // Walk to the body: skip the parameter list and any return-type annotation. A `{` inside
    // `Promise<{ error: string }>` sits at angle-depth 1 and is not the body. An arrow with an
    // EXPRESSION body (`const read = <T>(fn) => pools().withReadWakeScoped(secret, fn)`) has no
    // brace at all — and that exact one-liner is how every chatTurn read tool reaches the read
    // pool, so skipping it would strand four call sites on the wrong lane.
    let angle = 0;
    let start = -1;
    let end = -1;
    for (let j = m.index + m[0].length; j < text.length && j < m.index + 4000; j += 1) {
      if (mask[j] !== CODE) continue;
      const c = text[j];
      if (c === "(") { const close = matchBracket(text, mask, j, "(", ")"); if (close === -1) break; j = close; continue; }
      if (c === "<") { angle += 1; continue; }
      if (c === ">") { angle = Math.max(0, angle - 1); continue; }
      if (c === "=" && text[j + 1] === ">" && angle === 0) {
        const k = skipTrivia(text, mask, j + 2);
        if (text[k] === "{") { start = k; end = matchBracket(text, mask, k, "{", "}"); break; }
        end = expressionEnd(text, mask, k);
        start = k;
        break;
      }
      if (c === ";") break;
      if (c === "{" && angle === 0) { start = j; end = matchBracket(text, mask, j, "{", "}"); break; }
    }
    if (start === -1 || end === -1 || end <= start) continue;
    out.push({ name, start, end });
  }
  return { bodies: out, declared };
}

/**
 * Resolve every runtime helper that delegates to a pool wrapper, to a fixed point.
 *
 * The workflows never call `pools().withWriteWakeScoped` at the SQL site: they call their own
 * `writeScoped` / `bankScoped` / `callBank`, which call it for them. Without this pass the
 * census reads every one of those call sites as clara_runtime and reports ~47 imaginary
 * ungranted calls. `bankScoped` deliberately resolves to TWO roles (chatTurn.v14.infra.ts
 * writes through clara_wake_interactive, bankAgent.v1.infra.ts through clara_wake_bank);
 * a name with more than one role keeps both, which can only make a finding LESS likely —
 * never a false accusation.
 *
 * A name the file DECLARES itself never borrows the global map's answer: `read` is declared
 * in a dozen modules, and one of them calling `withRuntime` must not relabel another's lane.
 *
 * @returns {{global: Map<string, Set<string>>, byFile: Map<string, Map<string, Set<string>>>}}
 */
function resolveLaneAliases(sources) {
  const byFile = new Map();
  const global = new Map();
  const add = (map, name, role) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(role);
  };
  for (let round = 0; round < 4; round += 1) {
    let changed = false;
    for (const { file, text, mask, bodies } of sources) {
      if (!byFile.has(file)) byFile.set(file, new Map());
      const local = byFile.get(file);
      for (const body of bodies) {
        const inner = text.slice(body.start, body.end);
        const callRe = /\b([A-Za-z_$][\w$]*)\s*[(<]/g;
        let m;
        while ((m = callRe.exec(inner)) !== null) {
          if (mask[body.start + m.index] !== CODE) continue;
          const callee = m[1];
          if (callee === body.name) continue;
          const roles = LANE_WRAPPERS.has(callee)
            ? new Set([LANE_WRAPPERS.get(callee)])
            : (local.get(callee) || global.get(callee));
          if (!roles) continue;
          for (const role of roles) {
            const beforeLocal = local.get(body.name)?.size ?? 0;
            const beforeGlobal = global.get(body.name)?.size ?? 0;
            add(local, body.name, role);
            add(global, body.name, role);
            if ((local.get(body.name)?.size ?? 0) !== beforeLocal
              || (global.get(body.name)?.size ?? 0) !== beforeGlobal) changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  return { global, byFile };
}

/** clara_* role names named as string literals inside a module (its own lane declaration). */
function moduleRoleLiterals(text, mask, knownRoles) {
  const found = new Set();
  const re = /clara_[a-z0-9_]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (mask[m.index] !== STRING) continue;
    if (knownRoles.has(m[0])) found.add(m[0]);
  }
  return [...found].sort();
}

/**
 * Runtime callers: `clara.<fn>(` inside a string literal in packages/runtime.
 * @param {Set<string>} knownRoles every clara_* role on the live database
 */
function scanRuntimeCallers(repoRoot, knownRoles) {
  const callers = [];
  const scanErrors = [];
  const prose = [];
  const callRe = /clara\.([a-z_][a-z0-9_]*)\s*\(/g;
  const sources = [];
  for (const root of RUNTIME_ROOTS) {
    for (const file of listSourceFiles(repoRoot, root)) {
      const text = readFileSync(join(repoRoot, file), "utf8");
      const { mask, ok, endState } = lexSource(text);
      if (!ok) scanErrors.push({ file, reason: `lexer ended in state "${endState}"` });
      const { bodies, declared } = functionBodies(text, mask);
      sources.push({ file, text, mask, bodies, declared });
    }
  }
  const aliases = resolveLaneAliases(sources);
  for (const { file, text, mask, declared } of sources) {
    const moduleRoles = moduleRoleLiterals(text, mask, knownRoles);
    const localAliases = aliases.byFile.get(file) || new Map();
    callRe.lastIndex = 0;
    let m;
    while ((m = callRe.exec(text)) !== null) {
      if (mask[m.index] !== STRING) continue; // a comment or bare code — not SQL on the wire
      if (!looksLikeSqlCall(text, mask, m.index)) {
        prose.push({ file, line: lineOf(text, m.index), text: `clara.${m[1]}(` });
        continue;
      }
      const open = m.index + m[0].length - 1;
      const span = balancedParenSpan(text, open);
      const argText = span === -1 ? "" : text.slice(open + 1, span);
      const named = [...argText.matchAll(/\b([a-z_][a-z0-9_]*)\s*=>/g)]
        .filter((a) => mask[open + 1 + a.index] === STRING)
        .map((a) => a[1]);
      const preceding = precedingWord(text, m.index);
      const stack = enclosingCalls(text, mask, m.index);
      let laneRoles = null;
      let laneSource = "default";
      for (let k = stack.length - 1; k >= 0 && !laneRoles; k -= 1) {
        const callee = stack[k];
        if (LANE_WRAPPERS.has(callee)) { laneRoles = [LANE_WRAPPERS.get(callee)]; laneSource = `wrapper:${callee}`; break; }
        const local = localAliases.get(callee) || (declared.has(callee) ? null : aliases.global.get(callee));
        if (local && local.size) { laneRoles = [...local].sort(); laneSource = `alias:${callee}`; }
      }
      if (!laneRoles) {
        const inFile = new Set();
        for (const [name, role] of LANE_WRAPPERS) if (new RegExp(`\\b${name}\\b`).test(text)) inFile.add(role);
        for (const [name, roles] of localAliases) if (new RegExp(`\\b${name}\\b`).test(text)) for (const r of roles) inFile.add(r);
        if (inFile.size) {
          laneRoles = [...inFile].sort();
          laneSource = "module_wrappers";
        } else if (moduleRoles.length) {
          laneRoles = moduleRoles.filter((r) => r !== OWNER_ROLE);
          laneSource = "module_role_literals";
        }
      }
      if (!laneRoles || laneRoles.length === 0) { laneRoles = [RUNTIME_DEFAULT_ROLE]; laneSource = "default"; }
      callers.push({
        lane: "runtime",
        file,
        line: lineOf(text, m.index),
        function: m[1],
        via: "sql",
        args: named.length ? [...new Set(named)].sort() : null,
        args_complete: named.length > 0 && span !== -1,
        lane_roles: laneRoles,
        lane_source: laneSource,
        preceding_word: preceding,
      });
    }
  }
  prose.sort((a, b) => (`${a.file}${String(a.line).padStart(6, "0")}` < `${b.file}${String(b.line).padStart(6, "0")}` ? -1 : 1));
  return { callers, scanErrors, prose };
}

/**
 * Resolve every scanned call site against the catalog.
 *
 * A `clara.<name>(` that names no function may still be legitimate: `insert into clara.foo (`
 * is a RELATION, and treating it as a call would report a table as a missing door. So a name
 * the catalog knows as a relation is recorded as a relation reference and dropped from the
 * caller census; a name it knows as NEITHER is dropped only when the SQL keyword before it
 * says relation (`from`, `join`, `into`, …), which is what keeps a set-returning function in
 * FROM position a call.
 *
 * @param {object[]} rawCallers every scanned site, web and runtime, plus any injected control
 * @param {Map<string, object[]>} byName catalog overloads by bare function name
 * @param {Set<string>} relations every relation in schema clara
 * @returns {{callers: object[], relationRefs: object[]}} both sorted, both deterministic
 */
export function resolveCallers(rawCallers, byName, relations) {
  const relationRefs = [];
  const callers = [];
  for (const c of rawCallers) {
    const overloads = byName.get(c.function) || [];
    if (overloads.length === 0 && relations.has(c.function)) {
      relationRefs.push({ file: c.file, line: c.line, relation: `clara.${c.function}` });
      continue;
    }
    if (overloads.length === 0 && c.lane === "runtime" && RELATION_KEYWORDS.has(c.preceding_word || "")) {
      relationRefs.push({ file: c.file, line: c.line, relation: `clara.${c.function}`, unresolved: true });
      continue;
    }
    const rest = { ...c };
    delete rest.preceding_word; // a scanner-internal disambiguator, not part of the census record
    callers.push({ ...rest, resolved: overloads.length > 0, overloads: overloads.map((o) => o.identity) });
  }
  callers.sort((a, b) => {
    const k = (x) => `${x.lane} ${x.file} ${String(x.line).padStart(6, "0")} ${x.function}`;
    return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0;
  });
  relationRefs.sort((a, b) => (`${a.file}${a.line}` < `${b.file}${b.line}` ? -1 : 1));
  return { callers, relationRefs };
}

export { scanRuntimeCallers, scanWebCallers };
