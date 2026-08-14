#!/usr/bin/env node
// Self-test for the evaluator freeze-lint (the house pattern: every gate carries one, because a
// gate nobody exercises is a gate nobody knows is still wired).
//
// The pure halves — body delimitation and the evaluator scan — are exercised against IN-MEMORY
// fixtures, so this runs anywhere with no git state, no database and no migrations on disk.
// The git-dependent halves (append-only vs base, the new-migration scan) are exercised by CI
// against real refs; what they share with this file is the scanner, and the scanner is where a
// silent miss would live.

import { strictEqual, ok } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractBody, hashText, scanEvaluators } from "./check-frozen-evaluators.mjs";

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), "check-frozen-evaluators.mjs");

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name}: ${err?.message ?? err}`);
  }
}

const files = {
  "m/a.sql": [
    "set local statement_timeout = '5min';",
    "create function clara.evaluate_metric_v1(p uuid) returns jsonb language plpgsql as $$begin return '1'; end$$;",
    "revoke all on function clara.evaluate_metric_v1(uuid) from public;",
    "insert into clara.evaluator_versions(evaluator_name,version) values ('evaluate_metric',1);",
  ].join("\n"),
  "m/b.sql": "create or replace function clara.evaluate_metric_v1(p uuid) returns jsonb language plpgsql as $body$begin return '2'; end$body$;",
  "m/c.sql": "create function clara.settle_something(p uuid) returns void language sql as $$select 1$$;",
  "m/d.sql": "create function clara.evaluate_broken_v1(p uuid) returns jsonb language plpgsql;",
};
const read = (rel) => (Object.prototype.hasOwnProperty.call(files, rel) ? files[rel] : null);

console.log("check-frozen-evaluators self-test");

check("a dollar-quoted body is delimited from `create` to the closing tag", () => {
  const src = files["m/a.sql"];
  const at = src.indexOf("create function");
  const body = extractBody(src, at);
  ok(body, "expected a delimited body");
  ok(body.startsWith("create function clara.evaluate_metric_v1"));
  ok(body.endsWith("$$"), `body should end at the closing tag, got …${body.slice(-12)}`);
  ok(!body.includes("revoke all"), "the body must stop at its own close, not run into the next statement");
});

check("a NAMED dollar tag ($body$) is delimited correctly", () => {
  const src = files["m/b.sql"];
  const body = extractBody(src, src.indexOf("create or replace"));
  ok(body.endsWith("$body$"), `expected the named tag to close the body, got …${body.slice(-12)}`);
});

check("the scan finds only clara.evaluate_* functions", () => {
  const { found } = scanEvaluators(["m/a.sql", "m/c.sql"], read);
  strictEqual([...found.keys()].join(","), "clara.evaluate_metric_v1");
});

check("a body this lint cannot delimit is REPORTED, never silently skipped", () => {
  const { found, undelimited } = scanEvaluators(["m/d.sql"], read);
  strictEqual(found.size, 0);
  strictEqual(undelimited.length, 1);
  ok(undelimited[0].includes("clara.evaluate_broken_v1"));
});

check("a duplicate definition across two files is recorded on the first entry", () => {
  const { found } = scanEvaluators(["m/a.sql", "m/b.sql"], read);
  const e = found.get("clara.evaluate_metric_v1");
  strictEqual(e.duplicates.length, 1);
  strictEqual(e.duplicates[0], "m/b.sql");
});

check("a changed body changes the hash — the whole point of the manifest", () => {
  const a = scanEvaluators(["m/a.sql"], read).found.get("clara.evaluate_metric_v1").sha256;
  const b = scanEvaluators(["m/b.sql"], read).found.get("clara.evaluate_metric_v1").sha256;
  ok(a !== b, "two different bodies must not hash the same");
});

check("hashing is line-ending independent (a CRLF checkout must not look like an edit)", () => {
  strictEqual(hashText("a\nb\n"), hashText("a\r\nb\r\n"));
});

check("PER-EVALUATOR version rows: two evaluators, one registered, is a violation", () => {
  // The defect this replaced: a single file-wide `insert into clara.evaluator_versions` satisfied
  // the rule however many evaluators the file defined, so the second one silently escaped the DB
  // checksum closure.
  const two = [
    "create function clara.evaluate_alpha_v1(p uuid) returns jsonb language plpgsql as $$begin return '1'; end$$;",
    "create function clara.evaluate_beta_v1(p uuid) returns jsonb language plpgsql as $$begin return '2'; end$$;",
    "insert into clara.evaluator_versions(evaluator_name,version) values ('evaluate_alpha',1);",
  ].join("\n");
  const names = [...new Set([...two.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(clara\.evaluate_[a-z0-9_]+)\s*\(/gi)]
    .map((m) => m[1].toLowerCase()))];
  strictEqual(names.length, 2);
  const registered = names.filter((n) => {
    const stem = n.replace(/^clara\./, "").replace(/_v\d+$/, "");
    return two.includes(`'${stem}'`);
  });
  strictEqual(registered.length, 1, "exactly one of the two is registered — the other must be reported");
});

check("`create or replace` is distinguished from `create` — the recut arm depends on it", () => {
  strictEqual(scanEvaluators(["m/a.sql"], read).found.get("clara.evaluate_metric_v1").replaced, false);
  strictEqual(scanEvaluators(["m/b.sql"], read).found.get("clara.evaluate_metric_v1").replaced, true);
});

check("an unreadable file is skipped without throwing (the reader returns null)", () => {
  const { found } = scanEvaluators(["m/does-not-exist.sql"], read);
  strictEqual(found.size, 0);
});

// ===========================================================================================
// THE ENFORCEMENT PROOF (codex M8). Everything above tests the checker's PURE halves — which is
// necessary and was not sufficient: none of it would have gone red if the checker's mismatch
// branch were deleted outright. A gate whose self-test cannot fail when enforcement is removed
// proves the arithmetic and nothing about the gate.
//
// So this runs the REAL checker, as a process, against a throwaway git repo: baseline it, mutate
// a frozen evaluator body, run it again, and require a NONZERO exit naming BODY CHANGED.
// ===========================================================================================
function runChecker(cwd, args = []) {
  return spawnSync(process.execPath, [CHECKER, ...args], {
    cwd, encoding: "utf8", env: { ...process.env, CI: "", GITHUB_ACTIONS: "", FREEZE_BASE_REF: "refs/heads/no-such-base" },
  });
}

check("END-TO-END: the checker REFUSES a mutated frozen evaluator body", () => {
  const repo = mkdtempSync(join(tmpdir(), "clara-evalfreeze-"));
  try {
    for (const a of [["init", "-q"], ["config", "user.email", "t@example.invalid"], ["config", "user.name", "t"]]) {
      const r = spawnSync("git", a, { cwd: repo, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${a[0]} failed: ${r.stderr}`);
    }
    const migDir = join(repo, "packages", "db", "migrations");
    mkdirSync(migDir, { recursive: true });
    const mig = join(migDir, "0001_seed.sql");
    const body = (n) => `create function clara.evaluate_seed_v1(p uuid) returns jsonb\n`
      + `  language plpgsql as $$begin return '${n}'; end$$;\n`
      + `insert into clara.evaluator_versions(evaluator_name,version) values ('evaluate_seed',1);\n`;
    writeFileSync(mig, body("1"), "utf8");

    const baseline = runChecker(repo, ["--update"]);
    strictEqual(baseline.status, 0, `--update should baseline cleanly: ${baseline.stderr}`);
    const verify = runChecker(repo);
    strictEqual(verify.status, 0, `a clean tree should verify: ${verify.stderr}`);

    // THE MUTATION — the body changes, the manifest does not.
    writeFileSync(mig, body("2"), "utf8");
    const mutated = runChecker(repo);
    ok(mutated.status !== 0, "a mutated frozen evaluator body MUST fail the checker");
    ok(/BODY CHANGED/.test(mutated.stderr), `the refusal must name the defect; got: ${mutated.stderr.slice(0, 300)}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

check("END-TO-END: a migration defining an evaluator with NO version row is refused", () => {
  const repo = mkdtempSync(join(tmpdir(), "clara-evalfreeze-nv-"));
  try {
    for (const a of [["init", "-q"], ["config", "user.email", "t@example.invalid"], ["config", "user.name", "t"]]) {
      spawnSync("git", a, { cwd: repo, encoding: "utf8" });
    }
    const migDir = join(repo, "packages", "db", "migrations");
    mkdirSync(migDir, { recursive: true });
    writeFileSync(join(migDir, "0001_nv.sql"),
      "create function clara.evaluate_orphan_v1(p uuid) returns jsonb language plpgsql as $$begin return '1'; end$$;\n",
      "utf8");
    runChecker(repo, ["--update"]);
    const r = runChecker(repo);
    ok(r.status !== 0, "an evaluator with no version row must fail");
    ok(/NO VERSION ROW/.test(r.stderr), `got: ${r.stderr.slice(0, 300)}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

if (failures > 0) {
  console.error(`\ncheck-frozen-evaluators self-test: ${failures} failure(s)`);
  process.exit(1);
}
console.log("check-frozen-evaluators self-test: OK");
