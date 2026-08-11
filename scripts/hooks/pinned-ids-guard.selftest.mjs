#!/usr/bin/env node
// Self-test for the pinned-ids PreToolUse hook (owner-ruled Q4-A).
//
//   node scripts/hooks/pinned-ids-guard.selftest.mjs   # exit 0 green, 1 red
//
// Two layers, same split as check-wiki-dynamic-sql.selftest.mjs:
//   (1) IN-PROCESS — imports evaluateToolCall() from the pure module directly and drives it
//       through the decision matrix (both ids x both directions x the precision edge cases).
//       Fast, and this is where the bulk of the coverage lives.
//   (2) END-TO-END — actually spawns `node pinned-ids-guard.mjs` with real JSON piped to stdin
//       and asserts on the real exit code, so the stdin/JSON/exit-code WIRING is proven too, not
//       just the pure logic. Covers exactly the three shapes the dispatch brief named (blocked
//       write-shape, allowed read-shape, clean command) plus the malformed-stdin fallback.
//
// No dependencies — Node built-ins only.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateToolCall, findPinnedId, isWriteShaped, blockMessage } from "./pinned-ids-guard-checks.mjs";

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
  const r = evaluateToolCall({ tool_name: "Bash", tool_input: { command: `git log -p -- migrations/0019_insert_wiki_seed.sql | grep ${CANARY}` } });
  assertPassed(r, "insert glued into a filename is not the whole word 'insert'");
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
console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
