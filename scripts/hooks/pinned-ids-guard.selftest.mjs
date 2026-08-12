#!/usr/bin/env node
// Self-test for the pinned-ids PreToolUse hook (owner-ruled Q4-A).
//
//   node scripts/hooks/pinned-ids-guard.selftest.mjs   # exit 0 green, 1 red
//
// Three layers; the first two follow check-wiki-dynamic-sql.selftest.mjs's split:
//   (1) IN-PROCESS — imports evaluateToolCall() from the pure module directly and drives it
//       through the decision matrix (both ids x both directions x the precision edge cases).
//       Fast, and this is where the bulk of the coverage lives.
//   (2) END-TO-END — actually spawns `node pinned-ids-guard.mjs` with real JSON piped to stdin
//       and asserts on the real exit code, so the stdin/JSON/exit-code WIRING is proven too, not
//       just the pure logic. Covers exactly the three shapes the dispatch brief named (blocked
//       write-shape, allowed read-shape, clean command) plus the malformed-stdin fallback.
//   (3) REGISTRATION — parses the tracked .claude/settings.json and proves a PreToolUse command
//       resolves to THIS file on disk. Layers 1-2 prove the guard decides correctly; a guard
//       nothing invokes still decides correctly and protects nothing. Verified to fail on both
//       a renamed target and a missing PreToolUse block before being accepted.
//
// This runs in `pnpm lint` and in ci.yml. CI cannot exercise a PreToolUse hook IN SITU — only a
// real Claude Code session can — so layer 3 is the closest automated proof available that the
// registration is live, and the in-situ confirmation is one deliberately-blocked probe on the
// owner's machine.
//
// No dependencies — Node built-ins only.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateToolCall, findPinnedId, isWriteShaped, blockMessage, isReadOnlyCommand } from "./pinned-ids-guard-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "pinned-ids-guard.mjs");

let failures = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}

function assertBlocked(result, why) {
  if (!result.block) throw new Error(`expected BLOCK (${why}), got PASS — shape=${result.shape}`);
}
function assertPassed(result, why) {
  if (result.block) throw new Error(`expected PASS (${why}), got BLOCK — shape=${result.shape}, pin=${result.pin?.id}`);
}

// ---------------------------------------------------------------------------
// (1) IN-PROCESS — the decision matrix.
// ---------------------------------------------------------------------------
console.log("in-process — evaluateToolCall():");

const CANARY = "daba7f2e";
const WITNESS = "d023b48c";

testCase("Bash + canary + rpc keyword -> BLOCKED (write-shaped)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `curl -X POST .../rpc/answer_canary?id=${CANARY}` } });
  assertBlocked(r, "curl+rpc+id");
  if (r.pin.id !== CANARY) throw new Error(`wrong pin: ${r.pin.id}`);
});

testCase("Bash + witness + approve keyword -> BLOCKED (write-shaped)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `psql -c "select approve_entry('${WITNESS}-94fa-43a5-a544-cc4fe3b1163d')"` } });
  assertBlocked(r, "approve+id");
  if (r.pin.id !== WITNESS) throw new Error(`wrong pin: ${r.pin.id}`);
});

testCase("PowerShell + canary + update keyword -> BLOCKED (write-shaped)", () => {
  const r = evaluateToolCall({ tool_name: "PowerShell", tool_input: { command: `Invoke-RestMethod -Method Post -Uri ".../update?id=${CANARY}"` } });
  assertBlocked(r, "PowerShell update+id");
});

testCase("Bash + witness, id only (no keyword) -> PASSES (read-shaped)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `python live_ro.py --id ${WITNESS}` } });
  assertPassed(r, "plain read script");
});

testCase("Bash + canary via psql SELECT -> PASSES (read-shaped)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `psql -c "select status from wiki_watch where id::text like '${CANARY}%'"` } });
  assertPassed(r, "SELECT read");
});

testCase("Bash + grep for the id -> PASSES (read-shaped)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `grep -rn "${CANARY}" docs/adr/` } });
  assertPassed(r, "grep read");
  if (r.shape !== "bash-read-only-command") throw new Error(`expected the read-only-command shape, got ${r.shape}`);
});

testCase("Bash + witness, command mentions posting_date -> PASSES (the false-positive this guard must avoid)", () => {
  // This is the exact shape the acceptance evidence repeats constantly: "status 'draft',
  // posting_date 2026-07-31". A bare substring match on "post" would wrongly block every one
  // of these reads; \bpost\b must not fire inside "posting_date".
  const r = evaluateToolCall({
    tool_name: "Bash",
    tool_input: { command: `psql -c "select status, posting_date from clara.journal_entries where id::text like '${WITNESS}%'"` },
  });
  assertPassed(r, "posting_date substring must not trip the post keyword");
});

testCase("Bash + canary, filename glued by underscores ('insert') -> PASSES (glued token, not a whole word)", () => {
  // Deliberately NOT a read-only-allowlisted command: `python` is not on the allowlist, so this
  // falls through to the keyword check and the ASYMMETRIC BOUNDARY is what decides. (The original
  // `git log … | grep` spelling now short-circuits on the read allowlist, which would leave this
  // cell green even if the boundary regressed — a test passing for the wrong reason.)
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `python apply.py migrations/0019_insert_wiki_seed.sql --id ${CANARY}` } });
  assertPassed(r, "insert glued into a filename is not the whole word 'insert'");
  if (r.shape !== "bash-read-shaped") throw new Error(`must pass via the BOUNDARY, not the read allowlist; got ${r.shape}`);
});

testCase("a read-only pipeline carrying the glued filename passes via the ALLOWLIST (both paths exist)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `git log -p -- migrations/0019_insert_wiki_seed.sql | grep ${CANARY}` } });
  assertPassed(r, "git log | grep is a pure read pipeline");
  if (r.shape !== "bash-read-only-command") throw new Error(`expected the allowlist path, got ${r.shape}`);
});

testCase("Bash + witness, real INSERT INTO as its own words -> BLOCKED (genuine write keyword)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `psql -c "insert into audit_note(entry_id) values ('${WITNESS}')"` } });
  assertBlocked(r, "real INSERT INTO");
});

testCase("Bash, no id at all -> PASSES (clean command)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: "pnpm typecheck" } });
  assertPassed(r, "unrelated clean command");
});

testCase("Bash + a write keyword but NO pinned id -> PASSES (keyword alone is not enough)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: "curl -X POST https://example.com/rpc/approve_entry?id=someone-else" } });
  assertPassed(r, "no pinned id present");
});

testCase("mcp__ tool naming the id, no keyword -> BLOCKED (mcp__ needs no keyword)", () => {
  const r = evaluateToolCall({ tool_name: "mcp__codebase-memory-mcp__search_graph", tool_input: { query: CANARY } });
  assertBlocked(r, "mcp__ tool, id present");
});

testCase("mcp__ tool, id nested deep in structured input -> BLOCKED", () => {
  const r = evaluateToolCall({
    tool_name: "mcp__github__create_issue",
    tool_input: { owner: "BELCORT-SDN-BHD", repo: "clara", body: { sections: [{ text: `re: witness ${WITNESS}` }] } },
  });
  assertBlocked(r, "mcp__ tool, nested id");
});

testCase("mcp__ tool, no pinned id anywhere -> PASSES", () => {
  const r = evaluateToolCall({ tool_name: "mcp__codebase-memory-mcp__get_architecture", tool_input: { project: "clara" } });
  assertPassed(r, "mcp__ call unrelated to either id");
});

testCase("Read tool carrying the id -> PASSES (out of scope entirely)", () => {
  const r = evaluateToolCall({ tool_name: "Read", tool_input: { file_path: `C:/tmp/${WITNESS}.json` } });
  assertPassed(r, "Read is out of scope by design");
});

testCase("Edit tool carrying the id -> PASSES (out of scope entirely)", () => {
  const r = evaluateToolCall({ tool_name: "Edit", tool_input: { file_path: "notes.md", new_string: `see ${CANARY}` } });
  assertPassed(r, "Edit is out of scope by design");
});

testCase("Grep tool carrying the id -> PASSES (out of scope entirely)", () => {
  const r = evaluateToolCall({ tool_name: "Grep", tool_input: { pattern: CANARY } });
  assertPassed(r, "Grep is out of scope by design");
});

testCase("case-insensitive id match (uppercase in a curl payload) -> BLOCKED", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `curl -X POST .../rpc/answer?id=${CANARY.toUpperCase()}` } });
  assertBlocked(r, "uppercase id still matches");
});

// --- The Codex round: the widened verb set (finding 4) and the read-tool allowlist (finding 7).

for (const verb of ["delete", "merge", "upsert", "execute", "put", "patch"]) {
  testCase(`Bash + witness + ${verb} -> BLOCKED (the widened write-verb set)`, () => {
    const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `psql -c "${verb} from clara.x where id='${WITNESS}'"` } });
    assertBlocked(r, `${verb} is a mutation verb`);
  });
}

testCase("the widened verbs keep the asymmetric boundary (inflections still pass)", () => {
  // "deleted"/"merged"/"executed" are how the evidence NARRATES history; they must not block.
  for (const inflected of ["deleted", "merged", "executed", "patched", "putting"]) {
    if (isWriteShaped(inflected)) throw new Error(`"${inflected}" must not match — trailing letters are excluded`);
  }
  // ...while the glued-underscore RPC spellings must.
  for (const glued of ["delete_entry(", "merge_rows_", "rpc/patch"]) {
    if (!isWriteShaped(glued)) throw new Error(`"${glued}" MUST match — a trailing underscore/slash is admitted`);
  }
});

testCase("git grep for the id WITH a write verb in the pattern -> PASSES (the audits' real workflow)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `git grep -n "approve.*${WITNESS}"` } });
  assertPassed(r, "a read-only command outranks a keyword inside its search pattern");
  if (r.shape !== "bash-read-only-command") throw new Error(`expected the read-only shape, got ${r.shape}`);
});

testCase("a read PIPELINE with a write verb in the pattern -> PASSES", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `git log -p | grep -i "approve ${CANARY}" | head -20` } });
  assertPassed(r, "every segment is read-only");
});

testCase("a read used as a PREFIX to smuggle a write -> STILL BLOCKED (per-segment, not first-token)", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `grep -rn x docs/ && curl -X POST .../rpc/approve?id=${WITNESS}` } });
  assertBlocked(r, "the curl segment is not read-only, so the allowlist must not apply");
});

testCase("a read piped into a writer -> STILL BLOCKED", () => {
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `cat ids.txt | xargs -I{} curl -X POST .../approve?id=${CANARY}` } });
  assertBlocked(r, "xargs is not on the read allowlist");
});

testCase("a command substitution defeats the read allowlist (fail-closed on what we cannot see)", () => {
  if (isReadOnlyCommand('grep "$(curl -X POST .../approve)" file')) {
    throw new Error("a $( ) payload is unreadable to the segment split — must not be treated as read-only");
  }
});

testCase("git WRITE subcommands are not on the allowlist", () => {
  for (const sub of ["push", "commit", "reset", "clean"]) {
    if (isReadOnlyCommand(`git ${sub} -f`)) throw new Error(`git ${sub} must not count as read-only`);
  }
  for (const sub of ["grep", "log", "show", "diff"]) {
    if (!isReadOnlyCommand(`git ${sub} x`)) throw new Error(`git ${sub} must count as read-only`);
  }
});

testCase("a leading env assignment does not hide the real command", () => {
  if (isReadOnlyCommand(`PGPASSWORD=x psql -c "select 1"`)) throw new Error("psql is not a read-only COMMAND (its SQL decides)");
  if (!isReadOnlyCommand("LC_ALL=C grep -rn x .")) throw new Error("an env prefix before grep must still read as read-only");
});

testCase("blockMessage() names the pin, the rule, and the provenance", () => {
  const pin = findPinnedId(CANARY);
  const msg = blockMessage({ pin, shape: "bash-write-shaped", tool_name: "Bash" });
  for (const must of [CANARY, "NEVER answer", "ADR-065", "AGENTS.md hard constraint 11"]) {
    if (!msg.includes(must)) throw new Error(`blockMessage() is missing "${must}":\n${msg}`);
  }
});

testCase("isWriteShaped() / findPinnedId() are independently sane (unit-level)", () => {
  if (!isWriteShaped("APPROVE this")) throw new Error("expected 'APPROVE' to match case-insensitively");
  if (isWriteShaped("posting_date")) throw new Error("'posting_date' must not match 'post' (natural-language inflection)");
  if (isWriteShaped("NEVER approved")) throw new Error("'approved' must not match 'approve' (natural-language inflection)");
  if (!isWriteShaped("approve_entry(")) throw new Error("'approve_entry(' MUST match — this is AGENTS.md's own cited write call");
  if (isWriteShaped("0019_insert_wiki_seed.sql")) throw new Error("'insert' glued by a LEADING underscore must not match (a filename fragment, not a verb)");
  if (findPinnedId(`prefix-${WITNESS}-suffix`)?.id !== WITNESS) throw new Error("id must match as a substring anywhere");
  if (findPinnedId("no ids here") !== null) throw new Error("expected no match");
});

// ---------------------------------------------------------------------------
// (2) END-TO-END — the real CLI, real stdin, real exit code.
// ---------------------------------------------------------------------------
console.log("\nend-to-end — node pinned-ids-guard.mjs (real stdin, real exit code):");

/** Runs the CLI with `input` piped to stdin; returns {code, stdout, stderr}. Never throws. */
function runCli(input) {
  try {
    const stdout = execFileSync(process.execPath, [CLI], { input, encoding: "utf8" });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

testCase("e2e: blocked write-shape (Bash + witness + approve) -> exit 2, stderr names the pin", () => {
  const { code, stderr } = runCli(JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: `curl -X POST .../rpc/approve_entry?id=${WITNESS}` },
  }));
  if (code !== 2) throw new Error(`expected exit 2, got ${code}; stderr=${stderr}`);
  if (!stderr.includes(WITNESS)) throw new Error(`stderr does not name the id:\n${stderr}`);
});

testCase("e2e: allowed read-shape (Bash + canary via live_ro.py) -> exit 0, silent", () => {
  const { code, stderr } = runCli(JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: `python live_ro.py --id ${CANARY}` },
  }));
  if (code !== 0) throw new Error(`expected exit 0, got ${code}; stderr=${stderr}`);
});

testCase("e2e: clean command (no id at all) -> exit 0", () => {
  const { code } = runCli(JSON.stringify({ tool_name: "Bash", tool_input: { command: "pnpm lint" } }));
  if (code !== 0) throw new Error(`expected exit 0, got ${code}`);
});

testCase("e2e: mcp__ tool naming the canary, no keyword -> exit 2", () => {
  const { code, stderr } = runCli(JSON.stringify({
    tool_name: "mcp__codebase-memory-mcp__query_graph",
    tool_input: { cypher: `MATCH (n) WHERE n.note CONTAINS '${CANARY}' RETURN n` },
  }));
  if (code !== 2) throw new Error(`expected exit 2, got ${code}; stderr=${stderr}`);
});

testCase("e2e: malformed (non-JSON) stdin, clean text -> exit 0, does not crash the harness", () => {
  const { code } = runCli("not json at all {{{");
  if (code !== 0) throw new Error(`expected exit 0 (fail-open on unparseable-but-clean input), got ${code}`);
});

testCase("e2e: malformed (non-JSON) stdin, but carries id+keyword -> exit 2 (fallback fail-closed)", () => {
  const { code, stderr } = runCli(`garbled payload but it says curl POST approve ${WITNESS} somewhere`);
  if (code !== 2) throw new Error(`expected exit 2 (raw-text fallback), got ${code}; stderr=${stderr}`);
});

testCase("e2e: empty stdin -> exit 0", () => {
  const { code } = runCli("");
  if (code !== 0) throw new Error(`expected exit 0 on empty stdin, got ${code}`);
});

// ---------------------------------------------------------------------------
// (3) REGISTRATION — a guard nothing invokes is not a guard. The layers above prove the
// script decides correctly; this proves the tracked project settings actually POINT at it.
// Resolving the command's path to a real file on disk is the part that rots silently: a
// rename or a move leaves the JSON syntactically perfect and the hook dead.
// ---------------------------------------------------------------------------
console.log("\nregistration — .claude/settings.json:");

testCase("tracked settings.json registers a PreToolUse command resolving to this guard", () => {
  const settingsPath = join(HERE, "..", "..", ".claude", "settings.json");
  if (!existsSync(settingsPath)) throw new Error(`no ${settingsPath} — the registration must ship tracked`);
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  const entries = settings?.hooks?.PreToolUse;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("hooks.PreToolUse is missing or empty");

  // Two documented shapes: EXEC form (`command` is the executable, `args` is the argv — no shell
  // involved) and SHELL form (one string). This repo ships exec form deliberately: a shell-form
  // `$CLAUDE_PROJECT_DIR` does not expand under PowerShell, and a hook that fails to launch fails
  // OPEN. Both are accepted here so the assertion tests the registration, not the style.
  const repoRoot = resolve(HERE, "..", "..");
  const PROJECT_DIR_RE = /(?:\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR|%CLAUDE_PROJECT_DIR%|\$env:CLAUDE_PROJECT_DIR)["']?[/\\]?/;
  const candidates = [];
  for (const entry of entries) {
    for (const h of entry.hooks ?? []) {
      const parts = Array.isArray(h.args) ? h.args : String(h.command ?? "").split(/\s+/);
      for (const part of parts) {
        const raw = String(part).replace(/^["']|["']$/g, "");
        if (!PROJECT_DIR_RE.test(raw)) continue;
        candidates.push({ raw, abs: resolve(repoRoot, raw.replace(PROJECT_DIR_RE, "")) });
      }
    }
  }
  const hit = candidates.find((c) => existsSync(c.abs) && resolve(c.abs) === resolve(CLI));
  if (!hit) {
    throw new Error(
      `no PreToolUse hook resolves to ${CLI}. Candidates: ${JSON.stringify(candidates)}. `
      + `A hook whose command cannot launch fails OPEN — the tool call proceeds — so a stale `
      + `registration here means the guard is silently absent.`,
    );
  }
});

testCase("the registration avoids a shell-form project-dir reference (PowerShell fails open)", () => {
  const settings = JSON.parse(readFileSync(join(HERE, "..", "..", ".claude", "settings.json"), "utf8"));
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
console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
