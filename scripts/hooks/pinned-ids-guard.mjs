#!/usr/bin/env node
// Pinned-ids PreToolUse hook — the filesystem/stdin wiring only. The rule (what counts as
// write-shaped, which two ids are pinned, the exact citations) lives in the pure module
// ./pinned-ids-guard-checks.mjs, which this file and the selftest (pinned-ids-guard.selftest.mjs)
// both import — same split as scripts/check-wiki-dynamic-sql.mjs / wiki-lint-checks.mjs.
//
// CONTRACT (Claude Code PreToolUse hook, matching .claude/skills/git-guardrails-claude-code's
// documented shape): reads one JSON object from stdin — {tool_name, tool_input, ...} — on the
// block path prints a message to stderr and exits 2; otherwise exits 0. No dependencies —
// Node built-ins only.
//
// REGISTRATION. The guard is registered repo-wide in TRACKED `.claude/settings.json` — the
// assembly pass added `!.claude/settings.json` to the `.claude/*` ignore block alongside
// `!.claude/skills/`, `!.claude/rules/` and `!.claude/hooks/`, so every checkout inherits the
// registration from git rather than each one having to wire it by hand. The script itself lives
// under scripts/hooks/ (an explicitly sanctioned home per the dispatch brief), which is tracked
// regardless of the `.claude/hooks/` ignore state. Per-checkout overrides still belong in the
// untracked `.claude/settings.local.json`. The tracked registration is exactly this — merge
// (never overwrite) if you are reconstructing it into some other settings file:
//
//   {
//     "hooks": {
//       "PreToolUse": [
//         {
//           "matcher": "*",
//           "hooks": [
//             { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR\"/scripts/hooks/pinned-ids-guard.mjs" }
//           ]
//         }
//       ]
//     }
//   }
//
// matcher IS "*" (every tool call), deliberately — the discrimination between Bash/PowerShell/
// mcp__*/out-of-scope happens INSIDE evaluateToolCall, not in the matcher string, so coverage
// never depends on this harness's matcher engine supporting multi-name or regex matchers. The
// cost is one extra process spawn per tool call; the script no-ops (exit 0) instantly for every
// tool outside {Bash, PowerShell, mcp__*}.

import { readFileSync } from "node:fs";
import { evaluateToolCall, findPinnedId, isWriteShaped, blockMessage } from "./pinned-ids-guard-checks.mjs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const raw = readStdin();

  let payload;
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    // Malformed/non-JSON stdin. Two wrong answers here: block EVERY call (a parse hiccup would
    // then break the whole harness, not just protect two ids), or silently allow a payload we
    // failed to even look at. So: fall back to a raw-text scan of the unparsed input and apply
    // the SAME write-shaped rule (id + keyword) a Bash/PowerShell call would get — the one case
    // this can't do is the mcp__-any-mention rule, since that needs a real tool_name to detect
    // an mcp__ call in the first place, and an unparsed payload has none.
    const pin = findPinnedId(raw);
    if (pin && isWriteShaped(raw)) {
      console.error(blockMessage({ pin, shape: "unparsed-stdin-write-shaped-fallback" }));
      return 2;
    }
    return 0;
  }

  const result = evaluateToolCall({ tool_name: payload.tool_name, tool_input: payload.tool_input });
  if (result.block) {
    console.error(blockMessage({ pin: result.pin, shape: result.shape, tool_name: payload.tool_name }));
    return 2;
  }
  return 0;
}

process.exit(main());
