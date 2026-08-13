#!/usr/bin/env node
// Dispatch-model PreToolUse hook — the filesystem/stdin wiring only. The rule (what counts as a
// dispatch, what counts as a pin, what is deliberately out of scope) lives in the pure module
// ./dispatch-model-guard-checks.mjs, which this file and the selftest
// (dispatch-model-guard.selftest.mjs) both import — the same split as pinned-ids-guard.mjs /
// pinned-ids-guard-checks.mjs, and as scripts/check-wiki-dynamic-sql.mjs / wiki-lint-checks.mjs.
//
// WHAT IT DEFENDS: AGENTS.md hard constraint 5 — every dispatch pins an explicit `model`;
// omission silently inherits the main model (Fable), which is forbidden (owner directive
// recorded at ADR-0069, docs/adr/README.md:276-278). Prompt-enforced only until this file, and
// violated once historically by a Workflow script with zero model pins.
//
// IT IS A MISTAKE-NET, NOT CONTAINMENT. The full threat model and the explicit out-of-scope
// list (forks, partial pinning, named workflows, unreadable script paths, case, unrecognised
// input shapes) are in the checks module's header. Read that before judging this guard.
//
// CONTRACT (Claude Code PreToolUse hook, the same shape pinned-ids-guard.mjs implements): reads
// one JSON object from stdin — {tool_name, tool_input, ...} — on the block path prints a message
// to stderr and exits 2; otherwise exits 0. No dependencies — Node built-ins only.
//
// REGISTRATION. The TRACKED project `.claude/settings.json` carries it, MERGED as a second
// hooks.PreToolUse entry beside the pinned-ids one (hook entries accumulate; a second entry does
// not displace the first). The full doctrine — why the registration ships tracked rather than
// per-checkout, and why `scripts/hooks/` rather than `.claude/hooks/` — is written out once in
// pinned-ids-guard.mjs's header and is not repeated here.
//
//   {
//     "matcher": "*",
//     "hooks": [
//       {
//         "type": "command",
//         "command": "node",
//         "args": ["${CLAUDE_PROJECT_DIR}/scripts/hooks/dispatch-model-guard.mjs"]
//       }
//     ]
//   }
//
// The EXEC form (`command` = the executable, `args` = the argv) is load-bearing, not style: with
// `args` present the entry is spawned with NO shell, so Claude Code substitutes the project-dir
// placeholder itself. A shell-form `node "$CLAUDE_PROJECT_DIR"/scripts/...` expands only under a
// POSIX shell; on a Windows box without Git Bash the hook runs under PowerShell, where bare
// `$CLAUDE_PROJECT_DIR` is not an environment reference, the path resolves to garbage, and the
// launch FAILS OPEN (only exit 2 blocks). Do not "simplify" this to a single command string.
//
// matcher IS "*" (every tool call), deliberately — the discrimination between Agent/Task/
// Workflow/everything-else happens INSIDE evaluateToolCall, not in the matcher string, so
// coverage never depends on this harness's matcher engine supporting multi-name or regex
// matchers. The cost is one extra process spawn per tool call; the script no-ops (exit 0)
// instantly for every tool that is not a dispatch.

import { readFileSync } from "node:fs";
import { evaluateToolCall, blockMessage } from "./dispatch-model-guard-checks.mjs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * The effective script text for a Workflow call: the inline script, else the contents of
 * scriptPath, else null.
 *
 * An unreadable path returns null, which ALLOWS. That is deliberate (out-of-scope note 4 in the
 * checks module): a mistake-net that blocks on its own I/O failure converts a missing file into
 * a broken harness.
 */
function resolveScript(tool_input) {
  if (typeof tool_input?.script === "string") return tool_input.script;
  if (typeof tool_input?.scriptPath === "string" && tool_input.scriptPath.trim()) {
    try {
      return readFileSync(tool_input.scriptPath, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

function main() {
  const raw = readStdin();

  let payload;
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    // Malformed/non-JSON stdin: FAIL OPEN, and note that this differs from pinned-ids-guard.mjs,
    // which falls back to a raw-text scan. The difference is in what each guard looks for.
    // Pinned-ids hunts for a PRESENT token (an id plus a write verb), which survives in
    // unparsed text. This guard's trigger is an ABSENCE — a missing `model` field — and an
    // absence in text we failed to parse is not evidence of anything (the house's second
    // review-and-evidence law, AGENTS.md: "Absence is not evidence"). A raw-text fallback here
    // could not tell "this dispatch pinned no model" from "we could not read the payload that
    // pinned one", so it would block correct dispatches on a parse hiccup. Allow, and let the
    // process law cover the case a broken payload would have.
    return 0;
  }

  const tool_input = payload.tool_input;
  const script = payload.tool_name === "Workflow" ? resolveScript(tool_input) : null;
  const result = evaluateToolCall({ tool_name: payload.tool_name, tool_input, script });
  if (result.block) {
    console.error(blockMessage({ shape: result.shape, tool_name: payload.tool_name }));
    return 2;
  }
  return 0;
}

process.exit(main());
