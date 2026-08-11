#!/usr/bin/env node
// Self-test for the harness-links gate (owner-ruled Q9-A).
//
//   node scripts/check-harness-links.selftest.mjs   # exit 0 green, 1 red
//
// Builds a throwaway fixture tree under the OS temp dir (never the real repo) and drives
// checkHarnessLinks() against it directly — same "pure function in, findings out" shape as
// check-binding-post-control.selftest.mjs, but exercised through a real filesystem fixture
// (the dispatch brief's own ask) rather than in-memory source strings, since this gate's whole
// job is filesystem resolution. Every fixture is cleaned up on exit, pass or fail.
//
// No dependencies — Node built-ins only.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  checkHarnessLinks, extractPathReferences, resolveReference, looksLikePath, NON_PATH_ALLOWLIST,
} from "./check-harness-links.mjs";

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

function write(root, relPath, content) {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

/** A fresh throwaway fixture directory; caller must rm() it when done. */
function freshFixture() {
  return mkdtempSync(join(tmpdir(), "harness-links-selftest-"));
}
function rm(root) {
  rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// (1) One fixture tree carrying BOTH a good and a broken link (the dispatch brief's own ask),
//     plus the fenced-code-block and external-URL exclusions.
// ---------------------------------------------------------------------------
console.log("temp-dir fixture — one good link, one broken link:");

{
  const root = freshFixture();
  write(root, "docs/target.md", "# a real target\n");
  write(
    root,
    "AGENTS.md",
    [
      "# entry",
      "A good markdown link: [target](docs/target.md).",
      "A good backtick path: `docs/target.md`.",
      "A broken markdown link: [missing](docs/nope.md).",
      "A broken backtick path: `docs/also-missing.md`.",
      "```",
      "a fenced code block mentioning `docs/inside-a-fence-does-not-exist.md` must be ignored",
      "```",
      "An external link is ignored: [anthropic](https://www.anthropic.com).",
      "An in-page anchor is ignored: [see below](#a-heading).",
    ].join("\n"),
  );

  const result = checkHarnessLinks({ repoRoot: root, entryList: ["AGENTS.md"], strict: true });

  testCase("the good markdown link and the good backtick path both resolve (no finding for either)", () => {
    if (result.findings.some((f) => f.includes("docs/target.md"))) {
      throw new Error(`the GOOD reference must not appear in findings:\n${result.findings.join("\n")}`);
    }
  });
  testCase("the broken markdown link is reported, naming the file, line, and target", () => {
    const hit = result.findings.find((f) => f.includes("docs/nope.md"));
    if (!hit) throw new Error(`expected a finding for docs/nope.md, got:\n${result.findings.join("\n")}`);
    if (!hit.startsWith("AGENTS.md:4")) throw new Error(`expected line 4, got: ${hit}`);
    if (!hit.includes("BROKEN-MD-LINK")) throw new Error(`expected BROKEN-MD-LINK kind: ${hit}`);
  });
  testCase("the broken backtick path is reported, naming the file, line, and target", () => {
    const hit = result.findings.find((f) => f.includes("docs/also-missing.md"));
    if (!hit) throw new Error(`expected a finding for docs/also-missing.md, got:\n${result.findings.join("\n")}`);
    if (!hit.startsWith("AGENTS.md:5")) throw new Error(`expected line 5, got: ${hit}`);
    if (!hit.includes("BROKEN-BACKTICK-PATH")) throw new Error(`expected BROKEN-BACKTICK-PATH kind: ${hit}`);
  });
  testCase("every finding carries a remediation hint (the NON_PATH_ALLOWLIST pointer)", () => {
    for (const f of result.findings) {
      if (!f.includes("NON_PATH_ALLOWLIST")) throw new Error(`finding has no remediation hint:\n${f}`);
    }
  });
  testCase("a backtick inside a fenced code block is never scanned", () => {
    if (result.findings.some((f) => f.includes("inside-a-fence"))) {
      throw new Error(`a fenced-block mention must never be scanned:\n${result.findings.join("\n")}`);
    }
  });
  testCase("exactly 2 findings — no more, no fewer (the external URL and anchor are correctly ignored)", () => {
    if (result.findings.length !== 2) throw new Error(`expected exactly 2 findings, got ${result.findings.length}:\n${result.findings.join("\n")}`);
  });
  testCase("ok is false when any finding exists", () => {
    if (result.ok) throw new Error("expected ok=false");
  });

  rm(root);
}

// ---------------------------------------------------------------------------
// (2) A directory reference (trailing slash) resolves — not just files.
// ---------------------------------------------------------------------------
{
  const root = freshFixture();
  mkdirSync(join(root, "docs", "architecture"), { recursive: true });
  write(root, "AGENTS.md", "the technical realisation is `docs/architecture/`.\n");
  const result = checkHarnessLinks({ repoRoot: root, entryList: ["AGENTS.md"], strict: true });
  testCase("a trailing-slash directory reference resolves (not just files)", () => {
    if (!result.ok) throw new Error(`expected ok=true, got findings:\n${result.findings.join("\n")}`);
  });
  rm(root);
}

// ---------------------------------------------------------------------------
// (3) ONE-HOP recursion: an entry's referenced .md-under-docs/ file gets its OWN references
//     checked, but files THAT file references do not get a second hop.
// ---------------------------------------------------------------------------
{
  const root = freshFixture();
  write(root, "AGENTS.md", "see [the index](docs/plan/hop1.md) for more.\n");
  write(root, "docs/plan/hop1.md", "a broken ref one hop deep: `docs/plan/hop1-broken.md`.\nand a further link: [deeper](docs/plan/hop2.md).\n");
  write(root, "docs/plan/hop2.md", "this is TWO hops from the entry: `docs/plan/hop2-broken-should-never-be-seen.md`.\n");

  const result = checkHarnessLinks({ repoRoot: root, entryList: ["AGENTS.md"], strict: true });
  testCase("a broken reference ONE hop deep (inside hop1.md) IS reported", () => {
    const hit = result.findings.find((f) => f.startsWith("docs/plan/hop1.md:"));
    if (!hit) throw new Error(`expected a finding inside hop1.md, got:\n${result.findings.join("\n")}`);
  });
  testCase("hop2.md's own broken reference (TWO hops from the entry) is NEVER reported", () => {
    if (result.findings.some((f) => f.includes("hop2-broken"))) {
      throw new Error(`recursion must stop at one hop:\n${result.findings.join("\n")}`);
    }
  });
  rm(root);
}

// ---------------------------------------------------------------------------
// (4) docs/adr/ bidirectional check.
// ---------------------------------------------------------------------------
{
  const root = freshFixture();
  write(root, "docs/adr/README.md", "index: [ADR-001](0001-first.md).\n");
  write(root, "docs/adr/0001-first.md", "# adr 1\n");
  write(root, "docs/adr/0002-orphan.md", "# adr 2, never linked from the index\n");

  const result = checkHarnessLinks({ repoRoot: root, entryList: ["docs/adr/README.md"], strict: true });
  testCase("a file on disk under docs/adr/ that the index never references is ORPHANED-ADR-FILE", () => {
    const hit = result.findings.find((f) => f.includes("0002-orphan.md") && f.includes("ORPHANED-ADR-FILE"));
    if (!hit) throw new Error(`expected an ORPHANED-ADR-FILE finding for 0002-orphan.md, got:\n${result.findings.join("\n")}`);
  });
  testCase("the referenced file (0001-first.md) is NOT reported as orphaned", () => {
    if (result.findings.some((f) => f.includes("0001-first.md"))) {
      throw new Error(`0001-first.md IS referenced by the index and must not be flagged:\n${result.findings.join("\n")}`);
    }
  });
  rm(root);
}

// ---------------------------------------------------------------------------
// (5) STRICT on/off — missing entry file.
// ---------------------------------------------------------------------------
{
  const root = freshFixture();
  write(root, "AGENTS.md", "nothing broken here.\n");

  testCase("STRICT=false: a missing entry file WARNS, does not fail", () => {
    const result = checkHarnessLinks({ repoRoot: root, entryList: ["AGENTS.md", "NOT-AUTHORED-YET.md"], strict: false });
    if (!result.ok) throw new Error(`expected ok=true (warn, not fail), got:\n${result.findings.join("\n")}`);
    if (!result.warnings.some((w) => w.includes("NOT-AUTHORED-YET.md"))) {
      throw new Error(`expected a warning naming the absent entry, got:\n${result.warnings.join("\n")}`);
    }
  });
  testCase("STRICT=true: the SAME missing entry file is a hard failure", () => {
    const result = checkHarnessLinks({ repoRoot: root, entryList: ["AGENTS.md", "NOT-AUTHORED-YET.md"], strict: true });
    if (result.ok) throw new Error("expected ok=false under STRICT=true");
    if (!result.findings.some((f) => f.includes("MISSING-ENTRY-FILE"))) {
      throw new Error(`expected a MISSING-ENTRY-FILE finding, got:\n${result.findings.join("\n")}`);
    }
  });
  rm(root);
}

// ---------------------------------------------------------------------------
// (6) The bare-filename-anywhere fallback, against a REAL (throwaway) git repo — this is the
//     one behaviour that genuinely needs `git ls-files`, so it gets its own tiny git fixture.
// ---------------------------------------------------------------------------
{
  const root = freshFixture();
  write(root, "scripts/deep/tool.mjs", "// a real tracked file, not adjacent to AGENTS.md or the repo root\n");
  write(root, "AGENTS.md", "the tool lives at `tool.mjs` (named by basename only, elsewhere in the tree).\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "fixture"], { cwd: root });

  testCase("a bare, unambiguous basename resolves via the repo-wide tracked-file fallback", () => {
    const result = checkHarnessLinks({ repoRoot: root, entryList: ["AGENTS.md"], strict: true });
    if (!result.ok) throw new Error(`expected ok=true via the basename fallback, got:\n${result.findings.join("\n")}`);
  });
  rm(root);
}

// ---------------------------------------------------------------------------
// (7) Unit-level: looksLikePath / resolveReference / extractPathReferences / the allowlist.
// ---------------------------------------------------------------------------
console.log("\nunit-level:");

testCase("a function-name-shaped backtick span is not a path candidate", () => {
  if (looksLikePath("approve_entry(...)")) throw new Error("must not treat a function call as a path");
});
testCase("a bare id-shaped backtick span is not a path candidate", () => {
  if (looksLikePath("daba7f2e")) throw new Error("must not treat a bare id as a path");
});
testCase("a bare filename WITH a recognised extension IS a path candidate", () => {
  if (!looksLikePath("CLAUDE.md")) throw new Error("a bare .md filename must be a candidate even without a slash");
});
testCase("a path with a slash but no extension IS a path candidate", () => {
  if (!looksLikePath("packages/db")) throw new Error("a slash alone must be enough to be a candidate");
});
testCase("a suffix-shorthand continuation ('-part2.md') is excluded", () => {
  if (looksLikePath("-part2.md")) throw new Error("a bare dash-prefixed suffix must not be a standalone path candidate");
});
testCase("NON_PATH_ALLOWLIST entries are excluded even though they match the heuristic", () => {
  if (!NON_PATH_ALLOWLIST.has("origin/main")) throw new Error("fixture assumption changed — update this test");
  if (looksLikePath("origin/main")) throw new Error("an allowlisted git ref must not be treated as a path");
});
testCase("extractPathReferences() reports 1-based line numbers", () => {
  const refs = extractPathReferences("line one\n[a](b.md)\n`c.md`");
  const lines = refs.map((r) => r.line).sort();
  if (lines.join(",") !== "2,3") throw new Error(`expected lines [2,3], got [${lines.join(",")}]`);
});
testCase("resolveReference() skips a pure in-page anchor", () => {
  const r = resolveReference(process.cwd(), process.cwd(), "#some-heading");
  if (!r.skip) throw new Error("an in-page anchor must be skipped, not resolved or reported broken");
});
testCase("resolveReference() skips an external URL", () => {
  const r = resolveReference(process.cwd(), process.cwd(), "https://example.com/x");
  if (!r.skip) throw new Error("an external URL must be skipped");
});
testCase("resolveReference() strips a trailing anchor before resolving (docs/target.md#section)", () => {
  const root = freshFixture();
  write(root, "docs/target.md", "# t\n");
  const r = resolveReference(root, root, "docs/target.md#a-section");
  rm(root);
  if (r.skip || !r.resolved) throw new Error(`expected the anchor to be stripped and the file to resolve, got: ${JSON.stringify(r)}`);
});

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
