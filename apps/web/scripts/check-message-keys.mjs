#!/usr/bin/env node
/**
 * apps/web/scripts/check-message-keys.mjs — the MISSING-MESSAGE gate (E-4 /
 * H-25). Rides apps/web's `lint` script, the same house pattern
 * check-token-contrast.mjs and check-test-manifest.mjs use — no pipeline edit
 * needed, because the uniform ladder already runs the lint job on every PR.
 *
 * THE DEFECT THAT MINTED IT. `components/firm/agent-tasks-panel.tsx` scopes
 * `useTranslations("CodingQuestionsSignals.agentTasks")` and calls
 * `t("loading")` in its first-load branch. That key did not exist: the block in
 * messages/en.json carried heading/note/empty/kinds/statuses/cancel*, and the
 * nearest neighbour was `CodingQuestionsSignals.loading` one level UP. The panel
 * mounts first on /activity, so the branch fired on every load and the
 * authenticated production walk saw MISSING_MESSAGE in the console four times.
 * Nothing caught it: `t()` is typed by next-intl against the message shape, but
 * a scoped namespace plus a bare key defeats that in practice, and `pnpm lint`
 * ran eslint + token-contrast + the two manifest checks and nothing else.
 *
 * WHAT IT CHECKS. Every STATIC key literal reachable from a `useTranslations` /
 * `getTranslations` binding in apps/web resolves to a STRING in
 * messages/en.json. A key that resolves to an OBJECT is also a failure —
 * `t("kinds")` on a namespace throws at runtime exactly as a missing key does.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK, and why each is sound:
 *   · A TEMPLATE key with an interpolation — `t(\`rowKind.${row.row_kind}\`)`.
 *     Those are already gated by the checked-lookup discipline this codebase
 *     enforces by hand (isKnownReviewQueueRowKind and its siblings): the union
 *     reaching the template is closed and typed, so tsc proves the key exists.
 *     A gate that tried to enumerate them would either re-implement the type
 *     checker or guess.
 *   · A key held in a VARIABLE — `t(section.hubTitleKey)`,
 *     `t(INVITE_STATUS_KEY[row.status])`. Same reason: those are typed unions.
 *   · The reverse direction (a key in en.json nobody calls). An unused string is
 *     not a defect a user can see, and the honest-note strings are deliberately
 *     written before their surface exists.
 *
 * THE FALSE-POSITIVE IT REFUSES TO RAISE. A `t` PARAMETER — `statusLabel(status,
 * t)` — is not a `useTranslations` binding, and a helper that takes one would
 * otherwise inherit whichever namespace the enclosing file happened to bind. The
 * scan therefore attributes a call only to a name bound by an actual
 * `useTranslations`/`getTranslations` call IN THAT FILE, and skips a file's
 * shadowed name entirely (a name both bound at module/hook level AND accepted as
 * a parameter) rather than guessing which one a given call site meant. Fail
 * QUIET on ambiguity, loud on a real miss: this gate's job is to catch the
 * agent-tasks class, not to be a type checker.
 *
 * Positive control: scripts/check-message-keys.selftest.mjs plants a missing key
 * in a throwaway fixture and requires this checker to go RED on it — proven,
 * not asserted (the same law check-test-manifest.selftest.mjs answers).
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SOURCE_RE = /\.(ts|tsx)$/;
const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".git", "e2e"]);

/** Blank comments while preserving every offset and newline, so a key inside a
 *  commented-out block is never evidence. String literals are left intact —
 *  they are exactly what this gate reads. */
export function stripComments(source) {
  let out = "";
  for (let i = 0; i < source.length; ) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < source.length && source[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (two === "/*") {
      while (i < source.length && source.slice(i, i + 2) !== "*/") {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      out += quote;
      i += 1;
      while (i < source.length) {
        if (source[i] === "\\") { out += source.slice(i, i + 2); i += 2; continue; }
        if (source[i] === quote) { out += quote; i += 1; break; }
        out += source[i];
        i += 1;
      }
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

const BINDING_RE =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:"([^"]*)"|'([^']*)')?\s*[,)]/g;

/** The `(`-to-matching-`)` slice starting at `open`, or `null` if unbalanced.
 *  PARENTHESIS-BALANCED rather than `[^()]*`, which is the whole point: a
 *  translator parameter is normally typed `t: (key: string) => string`, and a
 *  non-nesting scan stops dead at that inner `(` and never sees the `t` at all.
 *  This gate's first run found exactly that — fourteen "missing" keys that were
 *  all reached through a `t` PARAMETER the scan had failed to recognise. */
function balancedSlice(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return { text: source.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** A name that is ALSO a function parameter somewhere in the file. Such a name
 *  is ambiguous and is skipped whole — see the header. */
function parameterNames(source) {
  const names = new Set();
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "(") continue;
    const slice = balancedSlice(source, i);
    if (slice === null) continue;
    const before = source.slice(Math.max(0, i - 80), i);
    const after = source.slice(slice.end + 1, slice.end + 200);
    const isFunctionDecl = /\bfunction\b\s*[A-Za-z_$][\w$]*\s*$/.test(before) || /\bfunction\b\s*$/.test(before);
    // An arrow's parameter list: `)` then an optional return-type annotation,
    // then `=>`. The annotation is bounded so a later unrelated `=>` on the
    // same line cannot make an ordinary call look like a parameter list.
    const isArrowParams = /^\s*(?::[^=;{()]{0,120})?=>/.test(after);
    if (isFunctionDecl || isArrowParams) collect(slice.text, names);
  }
  return names;
}

/** Top-level (depth-0) parameter names out of one parameter list. Commas inside
 *  a nested type, object pattern or generic are not separators. */
function collect(params, into) {
  const text = String(params ?? "");
  let depth = 0;
  let start = 0;
  const parts = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") depth -= 1;
    else if (ch === "," && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  for (const part of parts) {
    const name = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(part)?.[1];
    if (name) into.add(name);
  }
}

/** `{ name -> namespace }` for every unambiguous translator binding in a file. */
export function translatorBindings(source) {
  const params = parameterNames(source);
  const bindings = new Map();
  for (const m of source.matchAll(BINDING_RE)) {
    const name = m[1];
    if (params.has(name)) continue;
    const namespace = m[2] ?? m[3] ?? "";
    // A name bound twice to different namespaces in one file is ambiguous the
    // same way a parameter is: drop it rather than pick one.
    if (bindings.has(name) && bindings.get(name) !== namespace) bindings.set(name, null);
    else if (!bindings.has(name)) bindings.set(name, namespace);
  }
  for (const [name, ns] of [...bindings]) if (ns === null) bindings.delete(name);
  return bindings;
}

/** Every static key a bound translator is called with, as full dotted paths. */
export function staticKeyCalls(source, bindings) {
  const found = [];
  for (const [name, namespace] of bindings) {
    const callRe = new RegExp(
      `\\b${name}(?:\\.(?:rich|markup|raw|has))?\\s*\\(\\s*(?:"([^"\\\\]*)"|'([^'\\\\]*)'|\`([^\`$\\\\]*)\`)\\s*[,)]`,
      "g",
    );
    for (const m of source.matchAll(callRe)) {
      const key = m[1] ?? m[2] ?? m[3];
      if (key === undefined || key === "") continue;
      const line = source.slice(0, m.index).split("\n").length;
      found.push({ path: namespace === "" ? key : `${namespace}.${key}`, line });
    }
  }
  return found;
}

/** `"string"` when the dotted path resolves to a string, `"object"` when it
 *  resolves to a namespace (also a runtime failure), `"missing"` otherwise. */
export function resolveKey(messages, path) {
  let node = messages;
  for (const segment of path.split(".")) {
    if (node === null || typeof node !== "object" || !Object.prototype.hasOwnProperty.call(node, segment)) {
      return "missing";
    }
    node = node[segment];
  }
  return typeof node === "string" ? "string" : "object";
}

export function listSourceFiles(rootAbs) {
  const out = [];
  (function walk(dirAbs) {
    for (const ent of readdirSync(dirAbs, { withFileTypes: true })) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      const abs = join(dirAbs, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile() && SOURCE_RE.test(ent.name)) out.push(relative(rootAbs, abs).split(sep).join("/"));
    }
  })(rootAbs);
  return out.sort();
}

/**
 * @returns {{ problems: {file: string, line: number, path: string, reason: string}[], checked: number }}
 *   `checked` is the COUNT of static keys actually resolved. It is printed on a
 *   green run on purpose: a gate whose scan silently stops matching would
 *   otherwise pass by checking nothing, and that number is the one thing a
 *   reader can compare against the last run to notice.
 */
export function checkMessageKeys(rootAbs, messages, files = listSourceFiles(rootAbs)) {
  const problems = [];
  let checked = 0;
  for (const file of files) {
    const source = stripComments(readFileSync(join(rootAbs, ...file.split("/")), "utf8"));
    const bindings = translatorBindings(source);
    if (bindings.size === 0) continue;
    for (const { path, line } of staticKeyCalls(source, bindings)) {
      checked += 1;
      const resolution = resolveKey(messages, path);
      if (resolution === "string") continue;
      problems.push({
        file,
        line,
        path,
        reason: resolution === "object" ? "resolves to a namespace, not a message" : "is not in messages/en.json",
      });
    }
  }
  return { problems, checked };
}

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function main() {
  const messages = JSON.parse(readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf8"));
  const { problems, checked } = checkMessageKeys(WEB_ROOT, messages);
  // A FLOOR, not a pin. It is deliberately far below the real count so an
  // ordinary refactor never touches it, while a scan that stopped matching —
  // a renamed hook, a changed binding shape — cannot pass by checking nothing.
  const FLOOR = 400;
  if (checked < FLOOR) {
    console.log(`[check-message-keys] the scan resolved only ${checked} static key(s), below the ${FLOOR} floor — it has stopped seeing call sites it used to see, so a green result would mean nothing. Fix the scan.`);
    return 1;
  }
  if (problems.length === 0) {
    console.log(`[check-message-keys] ${checked} static t("…") key(s) in apps/web all resolve to a string in messages/en.json.`);
    return 0;
  }
  console.log(`[check-message-keys] ${problems.length} message key(s) a component asks for at runtime do not resolve:`);
  for (const p of problems) console.log(`  - ${p.file}:${p.line} — "${p.path}" ${p.reason}`);
  console.log("");
  console.log("[check-message-keys] failing the build. next-intl renders a MISSING_MESSAGE placeholder for each of these and logs to the console — add the key to apps/web/messages/en.json under the namespace the call site scopes.");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
