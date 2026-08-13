#!/usr/bin/env node
// Self-test for the dispatch-model PreToolUse hook (AGENTS.md hard constraint 5).
//
//   node scripts/hooks/dispatch-model-guard.selftest.mjs   # exit 0 green, 1 red
//
// Three layers, mirroring pinned-ids-guard.selftest.mjs:
//   (1) IN-PROCESS — imports evaluateToolCall() from the pure module and drives it through the
//       decision matrix (both dispatch tools x pinned/unpinned x the documented exemptions).
//       Fast, and where the bulk of the coverage lives. Several cells here assert an ALLOW that
//       is a deliberate CEILING (partial pinning, a capitalised agent call, a named workflow) —
//       those are pinned as tests so that a later "hardening" pass has to argue with a failing
//       case rather than quietly change the contract.
//   (2) END-TO-END — spawns `node dispatch-model-guard.mjs` with real JSON on stdin and asserts
//       on the real exit code, so the stdin/JSON/exit-code WIRING is proven too. Includes the
//       scriptPath branch against a REAL temp file (readable, and deliberately missing), which
//       is the one path the pure module cannot cover by construction.
//   (3) REGISTRATION — parses the tracked .claude/settings.json and proves a PreToolUse command
//       resolves to THIS file on disk, AND that the pinned-ids registration survived alongside
//       it. A guard nothing invokes still decides correctly and protects nothing; and this
//       lane's own edit to settings.json is exactly the act that could have displaced the
//       neighbouring hook, so the merge is asserted rather than assumed.
//
// This runs in `pnpm lint` and in ci.yml, beside the pinned-ids selftest. CI cannot exercise a
// PreToolUse hook IN SITU — only a real Claude Code session can — so layer 3 is the closest
// automated proof available that the registration is live.
//
// No dependencies — Node built-ins only.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateToolCall,
  blockMessage,
  hasExplicitModel,
  isAgentDispatch,
  isFork,
  scriptShape,
} from "./dispatch-model-guard-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "dispatch-model-guard.mjs");
const PINNED_IDS_CLI = join(HERE, "pinned-ids-guard.mjs");

let failures = 0;
let cases = 0;
function testCase(name, fn) {
  cases++;
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}

function assertBlocked(result, why, expectedShape) {
  if (!result.block) throw new Error(`expected BLOCK (${why}), got PASS — shape=${result.shape}`);
  if (expectedShape && result.shape !== expectedShape) {
    throw new Error(`blocked for the wrong reason: expected shape=${expectedShape}, got ${result.shape}`);
  }
}
function assertPassed(result, why, expectedShape) {
  if (result.block) throw new Error(`expected PASS (${why}), got BLOCK — shape=${result.shape}`);
  if (expectedShape && result.shape !== expectedShape) {
    throw new Error(`passed for the wrong reason: expected shape=${expectedShape}, got ${result.shape}`);
  }
}

// ---------------------------------------------------------------------------
// (1) IN-PROCESS — the decision matrix.
// ---------------------------------------------------------------------------
console.log("in-process — evaluateToolCall():");

// --- Agent dispatches: the core omission this guard exists for.

testCase("Agent with no model -> BLOCKED", () => {
  const r = evaluateToolCall({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose", prompt: "do a thing" } });
  assertBlocked(r, "no model field at all", "agent-model-missing");
});

testCase("Agent with an explicit model -> PASSES", () => {
  const r = evaluateToolCall({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose", prompt: "x", model: "claude-sonnet-5" } });
  assertPassed(r, "model pinned", "agent-model-pinned");
});

testCase("Agent with an EMPTY model string -> BLOCKED (empty is not a pin)", () => {
  assertBlocked(evaluateToolCall({ tool_name: "Agent", tool_input: { prompt: "x", model: "" } }), "empty string", "agent-model-missing");
});

testCase("Agent with a WHITESPACE model string -> BLOCKED", () => {
  assertBlocked(evaluateToolCall({ tool_name: "Agent", tool_input: { prompt: "x", model: "   " } }), "whitespace only", "agent-model-missing");
});

testCase("Agent with a NON-STRING model -> BLOCKED (a model id is a string; fail closed)", () => {
  for (const bad of [5, null, {}, ["claude-sonnet-5"], true]) {
    assertBlocked(evaluateToolCall({ tool_name: "Agent", tool_input: { prompt: "x", model: bad } }), `model=${JSON.stringify(bad)}`, "agent-model-missing");
  }
});

testCase("Agent with NO tool_input at all -> BLOCKED (an in-scope dispatch fails closed)", () => {
  assertBlocked(evaluateToolCall({ tool_name: "Agent" }), "missing input object", "agent-model-missing");
});

testCase("Agent fork with no model -> PASSES (a fork inherits the parent model BY DESIGN)", () => {
  const r = evaluateToolCall({ tool_name: "Agent", tool_input: { subagent_type: "fork", prompt: "x" } });
  assertPassed(r, "forks are exempt, explicitly", "agent-fork-inherits-by-design");
});

testCase("Agent fork WITH a model -> PASSES via the fork branch (the override is ignored anyway)", () => {
  const r = evaluateToolCall({ tool_name: "Agent", tool_input: { subagent_type: "fork", prompt: "x", model: "claude-opus-5" } });
  assertPassed(r, "still a fork", "agent-fork-inherits-by-design");
});

testCase("a NON-fork subagent_type does not inherit the exemption", () => {
  for (const type of ["general-purpose", "Explore", "forked", "fork-worker", "codex:codex-rescue"]) {
    assertBlocked(evaluateToolCall({ tool_name: "Agent", tool_input: { subagent_type: type, prompt: "x" } }), `subagent_type=${type}`, "agent-model-missing");
  }
});

// --- The legacy tool name.

testCase("legacy Task carrying subagent_type, no model -> BLOCKED", () => {
  assertBlocked(evaluateToolCall({ tool_name: "Task", tool_input: { subagent_type: "general-purpose", prompt: "x" } }), "legacy Agent spelling", "agent-model-missing");
});

testCase("legacy Task carrying only a prompt, no model -> BLOCKED", () => {
  assertBlocked(evaluateToolCall({ tool_name: "Task", tool_input: { prompt: "x" } }), "prompt alone identifies the dispatch", "agent-model-missing");
});

testCase("legacy Task with a model -> PASSES", () => {
  assertPassed(evaluateToolCall({ tool_name: "Task", tool_input: { prompt: "x", model: "gpt-5.6-sol" } }), "pinned", "agent-model-pinned");
});

testCase("legacy Task fork -> PASSES", () => {
  assertPassed(evaluateToolCall({ tool_name: "Task", tool_input: { subagent_type: "fork" } }), "fork exemption applies to the legacy name too", "agent-fork-inherits-by-design");
});

testCase("a tool merely NAMED Task, carrying no dispatch field -> out of scope", () => {
  // Name is not identity (the house's third review law). "Task" is claimed only when the input
  // proves it is the dispatch tool; an unrelated tool of the same name must not be dragged in.
  assertPassed(evaluateToolCall({ tool_name: "Task", tool_input: { taskId: "7", status: "completed" } }), "not a dispatch payload", "out-of-scope-tool");
});

// --- Workflow scripts: the shape that was actually violated historically.

testCase("Workflow script with agent() calls and ZERO model pins -> BLOCKED", () => {
  const script = `const a = await agent({ prompt: "review the diff" });\nconst b = await agent({ prompt: "summarise" });\n`;
  assertBlocked(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script }), "the historical failure shape", "workflow-zero-model-pins");
});

testCase("Workflow script with agent() calls that ARE pinned -> PASSES", () => {
  const script = `await agent({ model: "claude-sonnet-5", prompt: "review the diff" });\n`;
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script }), "pinned", "workflow-model-pinned");
});

testCase("Workflow script with NO agent call -> PASSES (nothing is being dispatched)", () => {
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script: `const x = await bash("pnpm lint");\n` }), "no dispatch site", "workflow-no-agent-call");
});

testCase("Workflow with no script at all (a NAMED workflow) -> PASSES, uninspectable", () => {
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: { name: "code-review" }, script: null }), "body lives elsewhere", "workflow-script-not-inspectable");
});

testCase("Workflow with an empty/whitespace script -> PASSES, uninspectable", () => {
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script: "   \n\t " }), "nothing to inspect", "workflow-script-not-inspectable");
});

testCase("`subagent(` is not an agent call site (the \\b is load-bearing)", () => {
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script: `await subagent({ prompt: "x" });` }), "glued token, not the word 'agent'", "workflow-no-agent-call");
  if (scriptShape("myagent(").hasAgentCall) throw new Error("`myagent(` must not count as an agent call");
  if (!scriptShape("await agent(").hasAgentCall) throw new Error("`await agent(` MUST count");
});

testCase("whitespace between `agent` and `(` still counts as a call site", () => {
  assertBlocked(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script: `await agent ({ prompt: "x" });` }), "agent (…) is the same call", "workflow-zero-model-pins");
});

testCase("whitespace in `model :` still counts as a pin", () => {
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script: `await agent({ model : "claude-opus-5" });` }), "model : is the same pin", "workflow-model-pinned");
});

// --- The documented ceilings, pinned as tests so a later change has to argue with a red case.

testCase("CEILING: partial pinning inside one script PASSES (documented out of scope)", () => {
  const script = `await agent({ model: "claude-sonnet-5", prompt: "a" });\nawait agent({ prompt: "b" });\n`;
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script }), "one pin anywhere satisfies the zero-pin check", "workflow-model-pinned");
});

testCase("CEILING: a capitalised `Agent(` is not classified (the probe is case-sensitive)", () => {
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script: `new Agent({ prompt: "x" });` }), "case-sensitive by design", "workflow-no-agent-call");
});

testCase("CEILING: a `model:` in a comment satisfies the check (regex, not a parser)", () => {
  const script = `// remember to set model: on these\nawait agent({ prompt: "a" });\n`;
  assertPassed(evaluateToolCall({ tool_name: "Workflow", tool_input: {}, script }), "lexical check, stated ceiling", "workflow-model-pinned");
});

// --- Everything else.

testCase("every non-dispatch tool is out of scope and passes", () => {
  const others = [
    { tool_name: "Bash", tool_input: { command: "pnpm lint" } },
    { tool_name: "Read", tool_input: { file_path: "/x" } },
    { tool_name: "Write", tool_input: { file_path: "/x", content: "y" } },
    { tool_name: "Edit", tool_input: { file_path: "/x" } },
    { tool_name: "Grep", tool_input: { pattern: "model" } },
    { tool_name: "PowerShell", tool_input: { command: "Get-ChildItem" } },
    { tool_name: "mcp__github__create_issue", tool_input: { title: "no model here" } },
    { tool_name: "SendMessage", tool_input: { to: "team-lead", message: "hi" } },
  ];
  for (const call of others) assertPassed(evaluateToolCall(call), `${call.tool_name} is not a dispatch`, "out-of-scope-tool");
});

testCase("an empty call object passes (no tool_name -> not a dispatch)", () => {
  assertPassed(evaluateToolCall({}), "nothing to classify", "out-of-scope-tool");
  assertPassed(evaluateToolCall(), "no argument at all", "out-of-scope-tool");
});

// --- Unit-level sanity on the exported predicates.

testCase("isAgentDispatch() / hasExplicitModel() / isFork() are independently sane", () => {
  if (!isAgentDispatch("Agent", {})) throw new Error("Agent is always a dispatch, input or not");
  if (isAgentDispatch("Workflow", { prompt: "x" })) throw new Error("Workflow is not an Agent dispatch");
  if (isAgentDispatch("Task", {})) throw new Error("a bare Task with no dispatch field must not be claimed");
  if (!isAgentDispatch("Task", { subagent_type: "x" })) throw new Error("legacy Task + subagent_type IS a dispatch");
  if (!hasExplicitModel({ model: "claude-sonnet-5" })) throw new Error("a real model id is a pin");
  if (hasExplicitModel({})) throw new Error("absent model is not a pin");
  if (hasExplicitModel(undefined)) throw new Error("undefined input must not read as pinned");
  if (!isFork({ subagent_type: "fork" })) throw new Error("fork must be recognised");
  if (isFork({ subagent_type: "Fork" })) throw new Error("only the exact fork type is exempt");
});

testCase("blockMessage() names the constraint, the ADR, and the fix — for BOTH block shapes", () => {
  const agentMsg = blockMessage({ shape: "agent-model-missing", tool_name: "Agent" });
  for (const must of ["AGENTS.md hard constraint 5", "ADR-0069", "claude-sonnet-5", "fork"]) {
    if (!agentMsg.includes(must)) throw new Error(`agent blockMessage is missing "${must}":\n${agentMsg}`);
  }
  const wfMsg = blockMessage({ shape: "workflow-zero-model-pins", tool_name: "Workflow" });
  for (const must of ["AGENTS.md hard constraint 5", "ADR-0069", "agent()", "NOT ONE model pin"]) {
    if (!wfMsg.includes(must)) throw new Error(`workflow blockMessage is missing "${must}":\n${wfMsg}`);
  }
});

// ---------------------------------------------------------------------------
// (2) END-TO-END — the real CLI, real stdin, real exit code.
// ---------------------------------------------------------------------------
console.log("\nend-to-end — node dispatch-model-guard.mjs (real stdin, real exit code):");

/** Runs the CLI with `input` piped to stdin; returns {code, stdout, stderr}. Never throws. */
function runCli(input) {
  try {
    const stdout = execFileSync(process.execPath, [CLI], { input, encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

testCase("e2e: Agent with no model -> exit 2, stderr cites the constraint", () => {
  const { code, stderr } = runCli(JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose", prompt: "go" } }));
  if (code !== 2) throw new Error(`expected exit 2, got ${code}; stderr=${stderr}`);
  if (!stderr.includes("AGENTS.md hard constraint 5")) throw new Error(`stderr does not cite the constraint:\n${stderr}`);
});

testCase("e2e: Agent with a model -> exit 0, silent", () => {
  const { code, stderr } = runCli(JSON.stringify({ tool_name: "Agent", tool_input: { prompt: "go", model: "claude-sonnet-5" } }));
  if (code !== 0) throw new Error(`expected exit 0, got ${code}; stderr=${stderr}`);
});

testCase("e2e: Agent fork with no model -> exit 0", () => {
  const { code } = runCli(JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "fork", prompt: "go" } }));
  if (code !== 0) throw new Error(`expected exit 0, got ${code}`);
});

testCase("e2e: Workflow with an inline zero-pin script -> exit 2", () => {
  const { code, stderr } = runCli(JSON.stringify({ tool_name: "Workflow", tool_input: { script: `await agent({ prompt: "review" });` } }));
  if (code !== 2) throw new Error(`expected exit 2, got ${code}; stderr=${stderr}`);
});

testCase("e2e: Workflow with an inline pinned script -> exit 0", () => {
  const { code } = runCli(JSON.stringify({ tool_name: "Workflow", tool_input: { script: `await agent({ model: "claude-opus-5", prompt: "review" });` } }));
  if (code !== 0) throw new Error(`expected exit 0, got ${code}`);
});

// The scriptPath branch is the ONE path the pure module cannot cover — it is file I/O by
// definition — so it gets a real file on disk, both readable and missing.
{
  const dir = mkdtempSync(join(tmpdir(), "dispatch-model-guard-"));
  const unpinned = join(dir, "unpinned.mjs");
  const pinned = join(dir, "pinned.mjs");
  try {
    writeFileSync(unpinned, `await agent({ prompt: "review the diff" });\n`, "utf8");
    writeFileSync(pinned, `await agent({ model: "claude-sonnet-5", prompt: "review the diff" });\n`, "utf8");

    testCase("e2e: Workflow scriptPath -> a REAL zero-pin file on disk -> exit 2", () => {
      const { code, stderr } = runCli(JSON.stringify({ tool_name: "Workflow", tool_input: { scriptPath: unpinned } }));
      if (code !== 2) throw new Error(`expected exit 2, got ${code}; stderr=${stderr}`);
    });

    testCase("e2e: Workflow scriptPath -> a REAL pinned file on disk -> exit 0", () => {
      const { code } = runCli(JSON.stringify({ tool_name: "Workflow", tool_input: { scriptPath: pinned } }));
      if (code !== 0) throw new Error(`expected exit 0, got ${code}`);
    });

    testCase("e2e: Workflow scriptPath pointing at NOTHING -> exit 0 (fail-open on our own I/O)", () => {
      const { code } = runCli(JSON.stringify({ tool_name: "Workflow", tool_input: { scriptPath: join(dir, "does-not-exist.mjs") } }));
      if (code !== 0) throw new Error(`expected exit 0 (unreadable script is not evidence of an omission), got ${code}`);
    });

    testCase("e2e: an inline script OUTRANKS scriptPath (the effective text is the inline one)", () => {
      const { code } = runCli(JSON.stringify({ tool_name: "Workflow", tool_input: { script: `await agent({ model: "claude-sonnet-5" });`, scriptPath: unpinned } }));
      if (code !== 0) throw new Error(`expected exit 0 — the inline script is what runs, got ${code}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

testCase("e2e: a non-dispatch tool -> exit 0", () => {
  const { code } = runCli(JSON.stringify({ tool_name: "Bash", tool_input: { command: "pnpm lint" } }));
  if (code !== 0) throw new Error(`expected exit 0, got ${code}`);
});

testCase("e2e: malformed (non-JSON) stdin -> exit 0 (an ABSENCE cannot be read out of unparsed text)", () => {
  const { code } = runCli("not json at all {{{ model");
  if (code !== 0) throw new Error(`expected exit 0 (fail-open; see the CLI header), got ${code}`);
});

testCase("e2e: empty stdin -> exit 0", () => {
  const { code } = runCli("");
  if (code !== 0) throw new Error(`expected exit 0 on empty stdin, got ${code}`);
});

// ---------------------------------------------------------------------------
// (3) REGISTRATION — a guard nothing invokes is not a guard.
// ---------------------------------------------------------------------------
console.log("\nregistration — .claude/settings.json:");

const SETTINGS_PATH = join(HERE, "..", "..", ".claude", "settings.json");
const PROJECT_DIR_RE = /(?:\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR|%CLAUDE_PROJECT_DIR%|\$env:CLAUDE_PROJECT_DIR)["']?[/\\]?/;

/** Every project-dir-relative path referenced by any PreToolUse hook, resolved against the repo. */
function registeredTargets() {
  if (!existsSync(SETTINGS_PATH)) throw new Error(`no ${SETTINGS_PATH} — the registration must ship tracked`);
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  const entries = settings?.hooks?.PreToolUse;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("hooks.PreToolUse is missing or empty");
  const repoRoot = resolve(HERE, "..", "..");
  const out = [];
  for (const entry of entries) {
    for (const h of entry.hooks ?? []) {
      const parts = Array.isArray(h.args) ? h.args : String(h.command ?? "").split(/\s+/);
      for (const part of parts) {
        const raw = String(part).replace(/^["']|["']$/g, "");
        if (!PROJECT_DIR_RE.test(raw)) continue;
        out.push({ raw, abs: resolve(repoRoot, raw.replace(PROJECT_DIR_RE, "")) });
      }
    }
  }
  return out;
}

testCase("tracked settings.json registers a PreToolUse command resolving to THIS guard", () => {
  const candidates = registeredTargets();
  const hit = candidates.find((c) => existsSync(c.abs) && resolve(c.abs) === resolve(CLI));
  if (!hit) {
    throw new Error(
      `no PreToolUse hook resolves to ${CLI}. Candidates: ${JSON.stringify(candidates)}. `
      + `A hook whose command cannot launch fails OPEN — the tool call proceeds — so a stale `
      + `registration here means the guard is silently absent.`,
    );
  }
});

testCase("the pinned-ids registration SURVIVED alongside it (merge, never overwrite)", () => {
  // This lane added a second PreToolUse entry to a file that already carried one. Overwriting
  // rather than merging would leave AGENTS.md hard constraint 11 unguarded while this selftest
  // and pinned-ids-guard.selftest.mjs both still... well, the pinned-ids selftest would catch
  // it too. Asserted from BOTH sides deliberately: whichever guard is edited next, the other
  // one's disappearance is a red test, not a silent regression.
  const candidates = registeredTargets();
  const hit = candidates.find((c) => existsSync(c.abs) && resolve(c.abs) === resolve(PINNED_IDS_CLI));
  if (!hit) {
    throw new Error(
      `the pinned-ids guard is no longer registered in .claude/settings.json (expected a hook `
      + `resolving to ${PINNED_IDS_CLI}). Candidates: ${JSON.stringify(candidates)}.`,
    );
  }
});

testCase("no PreToolUse entry uses a shell-form project-dir reference (PowerShell fails open)", () => {
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  for (const entry of settings.hooks.PreToolUse) {
    for (const h of entry.hooks ?? []) {
      if (Array.isArray(h.args)) continue; // exec form — no shell, nothing to expand
      if (/CLAUDE_PROJECT_DIR/.test(String(h.command ?? ""))) {
        throw new Error(
          "shell-form command references CLAUDE_PROJECT_DIR: bare `$CLAUDE_PROJECT_DIR` is not a "
          + "PowerShell env reference, so on a Windows box without Git Bash the launch fails — and a "
          + "hook that fails to launch fails OPEN. Use exec form (command + args).",
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
console.log(`\n${cases} cases · ${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
