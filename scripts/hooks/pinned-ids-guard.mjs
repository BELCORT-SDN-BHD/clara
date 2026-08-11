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
// REGISTRATION. The TRACKED project `.claude/settings.json` carries the registration; personal
// overrides live in the untracked `.claude/settings.local.json`. That split IS the official
// convention — settings.json is project-shared and checked in, settings.local.json is personal
// and ignored — and this repo's blanket `.claude/*` ignore simply predates having any shared
// setting worth committing. The assembly pass added `!.claude/settings.json` beside
// `!.claude/skills/` and `!.claude/rules/`, so every checkout now inherits the registration from
// git. The script itself lives under scripts/hooks/, which is tracked normally — there is no
// `.claude/hooks/` directory in this repo.
//
// This REVERSES this lane's own earlier recommendation, deliberately and on the record: the
// header used to argue the registration "stays necessarily local", because merging a
// hooks.PreToolUse entry is a per-checkout act that a git commit cannot perform. The orchestrator
// overruled it. The owner's Q4 ruling requires the pins MECHANICALLY enforced on every checkout,
// and a manual per-checkout wiring step is captured-once-enforced-maybe — the one shape the
// ruling exists to forbid. Keep this file MINIMAL: the hooks block only, nothing else migrates in.
//
// The tracked registration is exactly this — merge (never overwrite) if you are reconstructing it
// into some other settings file. It is the EXEC form (`command` = the executable, `args` = the
// argv) and that is load-bearing, not style: with `args` present the entry is spawned directly
// with NO shell, so the project-dir placeholder is substituted by Claude Code itself. The earlier
// shell form — `node "$CLAUDE_PROJECT_DIR"/scripts/hooks/pinned-ids-guard.mjs` — expands only
// under a POSIX shell; on a Windows box without Git Bash the hook runs under PowerShell, where
// bare `$CLAUDE_PROJECT_DIR` is not an environment reference, the path resolves to garbage, and
// the launch FAILS OPEN (only exit 2 blocks — see the threat model in the checks module). Do not
// "simplify" this back to a single command string.
//
//   {
//     "hooks": {
//       "PreToolUse": [
//         {
//           "matcher": "*",
//           "hooks": [
//             {
//               "type": "command",
//               "command": "node",
//               "args": ["${CLAUDE_PROJECT_DIR}/scripts/hooks/pinned-ids-guard.mjs"]
//             }
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
