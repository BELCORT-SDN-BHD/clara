// Duplicate-safe semantic comparison for frozen-workflows.json.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

class DuplicateJsonKeyError extends SyntaxError {
  constructor(path, key) {
    super(`DUPLICATE-KEY at ${path}: ${JSON.stringify(key)}`);
  }
}

/** Validate JSON grammar while retaining each object's pre-parse key set. */
function rejectDuplicateJsonKeys(text) {
  let at = 0;
  const whitespace = () => {
    while (at < text.length && /\s/.test(text[at])) at++;
  };
  const fail = (message) => {
    throw new SyntaxError(`${message} at byte ${at}`);
  };
  const string = () => {
    if (text[at] !== '"') fail("expected JSON string");
    const start = at++;
    while (at < text.length) {
      if (text[at] === "\\") {
        at += 2;
        continue;
      }
      if (text[at++] === '"') return JSON.parse(text.slice(start, at));
    }
    fail("unterminated JSON string");
  };
  const scalar = () => {
    const start = at;
    while (at < text.length && !/[\s,}\]]/.test(text[at])) at++;
    if (start === at) fail("expected JSON value");
    JSON.parse(text.slice(start, at));
  };
  const value = (path) => {
    whitespace();
    if (text[at] === "{") return object(path);
    if (text[at] === "[") return array(path);
    if (text[at] === '"') {
      string();
      return;
    }
    scalar();
  };
  const object = (path) => {
    at++;
    whitespace();
    const keys = new Set();
    if (text[at] === "}") {
      at++;
      return;
    }
    while (at < text.length) {
      whitespace();
      const key = string();
      if (keys.has(key)) throw new DuplicateJsonKeyError(path, key);
      keys.add(key);
      whitespace();
      if (text[at++] !== ":") fail("expected ':' after JSON key");
      value(`${path}.${key}`);
      whitespace();
      const delimiter = text[at++];
      if (delimiter === "}") return;
      if (delimiter !== ",") fail("expected ',' or '}' in JSON object");
    }
    fail("unterminated JSON object");
  };
  const array = (path) => {
    at++;
    whitespace();
    if (text[at] === "]") {
      at++;
      return;
    }
    let index = 0;
    while (at < text.length) {
      value(`${path}[${index++}]`);
      whitespace();
      const delimiter = text[at++];
      if (delimiter === "]") return;
      if (delimiter !== ",") fail("expected ',' or ']' in JSON array");
    }
    fail("unterminated JSON array");
  };

  value("$");
  whitespace();
  if (at !== text.length) fail("unexpected trailing JSON input");
}

export function parseFrozenManifest(text, label) {
  try {
    rejectDuplicateJsonKeys(text);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("root must be an object");
    if (!parsed.workflows || typeof parsed.workflows !== "object" || Array.isArray(parsed.workflows)) {
      throw new SyntaxError("workflows must be an object");
    }
    return parsed;
  } catch (error) {
    const prefix = error instanceof DuplicateJsonKeyError ? "" : "MALFORMED-MANIFEST ";
    throw new Error(`${prefix}${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function deployedFlag(entry) {
  return {
    present: Object.hasOwn(entry, "deployed"),
    value: entry.deployed,
  };
}

export function compareFrozenManifestText(baseText, currentText, baseLabel = "base", currentLabel = "current") {
  const base = parseFrozenManifest(baseText, baseLabel);
  const current = parseFrozenManifest(currentText, currentLabel);
  const violations = [];
  for (const [path, prior] of Object.entries(base.workflows)) {
    if (!Object.hasOwn(current.workflows, path)) {
      violations.push(`REMOVED-ENTRY ${path}`);
      continue;
    }
    const next = current.workflows[path];
    if (!prior || typeof prior !== "object" || !next || typeof next !== "object") {
      violations.push(`MALFORMED-ENTRY ${path}`);
      continue;
    }
    if (next.sha256 !== prior.sha256) {
      violations.push(`CHANGED-HASH ${path} (${String(prior.sha256)} -> ${String(next.sha256)})`);
    }
    const beforeFlag = deployedFlag(prior);
    const afterFlag = deployedFlag(next);
    if (beforeFlag.present !== afterFlag.present || beforeFlag.value !== afterFlag.value) {
      violations.push(
        `CHANGED-FLAG ${path} (deployed ${beforeFlag.present ? String(beforeFlag.value) : "absent"} -> ` +
          `${afterFlag.present ? String(afterFlag.value) : "absent"})`,
      );
    }
  }
  const additions = Object.keys(current.workflows).filter((path) => !Object.hasOwn(base.workflows, path));
  return { violations, existing: Object.keys(base.workflows).length, additions };
}

export function runFrozenManifestCompareCli(args) {
  if (args.length !== 2 || args[0] !== "--compare-base") {
    console.error("freeze-lint compare-base: FAIL — usage: node scripts/check-frozen-workflows.mjs --compare-base <ref>");
    return 1;
  }
  const baseRef = args[1];
  if (!/^[A-Za-z0-9._/-]+$/.test(baseRef)) {
    console.error(`freeze-lint compare-base: FAIL — invalid base ref ${JSON.stringify(baseRef)}`);
    return 1;
  }
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`], { cwd: root, stdio: "ignore" });
    const baseText = execFileSync("git", ["show", `${baseRef}:frozen-workflows.json`], { cwd: root, encoding: "utf8" });
    const currentText = readFileSync(join(root, "frozen-workflows.json"), "utf8");
    const result = compareFrozenManifestText(baseText, currentText, baseRef, "working tree");
    if (result.violations.length > 0) {
      console.error("freeze-lint compare-base: FAIL — existing manifest entries are not semantically unchanged:\n");
      for (const violation of result.violations) console.error(`  - ${violation}`);
      return 1;
    }
    console.log(
      `freeze-lint compare-base: OK — ${result.existing} existing entr(ies) retain the same hash and deployed flag; ` +
        `${result.additions.length} addition(s).`,
    );
    return 0;
  } catch (error) {
    console.error(`freeze-lint compare-base: FAIL — ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
