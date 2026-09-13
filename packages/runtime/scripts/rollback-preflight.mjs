#!/usr/bin/env node
// #637 (C54.2 / AC4) — THE ROLLBACK PREFLIGHT, as a command an operator runs BEFORE
// `fly deploy --image <previous>`.
//
// WHY A SCRIPT AND NOT ONLY A TEST CELL. The same reason scripts/check-workflow-bundle.mjs gives
// for itself: a check that only ever runs inside a test suite is not running at the moment it
// exists for. "Before rollback, inventory non-terminal workflow runs and verify the target image
// contains every referenced workflow name/version" has been prose in packages/runtime/README.md
// since Wave B. This turns it into an exit code.
//
// USAGE
//   node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <path-to-index.mjs>
//   node packages/runtime/scripts/rollback-preflight.mjs --target-build-info <file|->
//   node packages/runtime/scripts/rollback-preflight.mjs --supported claraWork_v1,chatTurn_v17
//
//   Scope (optional, and OFF by default — see below):
//     --scope-run <run-id>      (repeatable)   only these workflow runs
//     --scope-name <substring>                 only runs whose WDK name contains this
//     --scope-work <work-id>    (repeatable)   only these accounting Works
//     --scope-task <task-id>    (repeatable)   only these agent tasks
//   Output:
//     --json                                   the full verdict object, for a pipeline
//
// WHERE THE SUPPORTED SET COMES FROM — pick the one you can actually get at the moment you need
// it, and prefer the artifact over the repo:
//   * `--target-bundle` scans the TARGET image's built `.output/server/index.mjs` for the WDK body
//     directives it registers. This is the strongest form: it reads the artifact you are about to
//     ship, not the source you think it was built from.
//   * `--target-build-info` reads a saved (or piped) `/api/build-info` payload from the target
//     image and takes its `bodies`. The route is session-gated, so the pipe form is the practical
//     one: `curl -sH "authorization: Bearer $JWT" .../api/runtime/build-info \
//        | node packages/runtime/scripts/rollback-preflight.mjs --target-build-info -`
//   * `--supported` is the escape hatch for a target you can only describe. It is exactly as
//     trustworthy as the person typing it, which is why it is listed last.
//
// SCOPE IS EXPLICIT AND OFF BY DEFAULT (#708). An unscoped preflight answers about the WHOLE
// database, which is the correct default for a production rollback and the wrong one for a shared
// rig carrying other suites' parked runs. Narrowing is a thing you ask for and the output says
// you asked.
//
// EXIT CODES. 0 = allowed. 1 = REFUSED (the offending names are printed). 2 = this command could
// not answer (bad usage, unreadable target, failed read). Two and one are deliberately distinct:
// "I refuse" and "I could not look" must never share an exit code, because a deploy script that
// treats them the same will eventually ship on the second one.
//
// The DATABASE target comes from the environment only (DATABASE_URL / WORKFLOW_POSTGRES_URL, else
// the libpq PG* vars) — never a DSN literal in this file, and lib/relay.mjs's own
// `assertNoTargetSplit` fails closed if two present sources disagree.

import { readFileSync } from "node:fs";
import { preflight, supportedBodiesFromBundle, withWorldClient } from "../lib/rollback-preflight.mjs";

const argv = process.argv.slice(2);

function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
function flags(name) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === name && i + 1 < argv.length) out.push(argv[i + 1]);
  return out;
}

const USAGE = `rollback-preflight: usage

  node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <path>
  node packages/runtime/scripts/rollback-preflight.mjs --target-build-info <file|->
  node packages/runtime/scripts/rollback-preflight.mjs --supported id1,id2

  optional scope:  --scope-run <id>  --scope-name <substr>  --scope-work <id>  --scope-task <id>
  optional output: --json

Exit 0 allowed, 1 REFUSED, 2 could not answer.`;

function die(message, code = 2) {
  console.error(`rollback-preflight: ${message}`);
  process.exit(code);
}

/** The target image's body roster, from exactly ONE of the three doors. */
function resolveSupported() {
  const bundlePath = flag("--target-bundle");
  const buildInfoPath = flag("--target-build-info");
  const explicit = flag("--supported");
  const chosen = [bundlePath, buildInfoPath, explicit].filter((v) => v !== null);
  if (chosen.length === 0) die(`no target given.\n\n${USAGE}`);
  if (chosen.length > 1) die("give exactly ONE of --target-bundle / --target-build-info / --supported — two targets is two answers.");

  if (bundlePath !== null) {
    let text;
    try {
      text = readFileSync(bundlePath, "utf8");
    } catch (err) {
      die(`could not read the target bundle at ${bundlePath}: ${err?.message ?? err}`);
    }
    const bodies = supportedBodiesFromBundle(text);
    if (bodies.length === 0) {
      die(
        `the target bundle at ${bundlePath} registers ZERO workflow bodies. That is not a clean answer — ` +
          "it is a bundle this command could not read, and refusing is the only safe reading.",
      );
    }
    return { bodies, source: `bundle ${bundlePath}` };
  }

  if (buildInfoPath !== null) {
    let raw;
    try {
      raw = readFileSync(buildInfoPath === "-" ? 0 : buildInfoPath, "utf8");
    } catch (err) {
      die(`could not read the target build-info from ${buildInfoPath}: ${err?.message ?? err}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      die(`the target build-info is not JSON: ${err?.message ?? err}`);
    }
    if (!Array.isArray(parsed?.bodies) || parsed.bodies.length === 0) {
      die(
        "the target build-info carries no `bodies` array. An image that predates #637 cannot answer this question " +
          "about itself — use --target-bundle against its built artifact instead.",
      );
    }
    return { bodies: parsed.bodies.map(String), source: `build-info ${buildInfoPath === "-" ? "(stdin)" : buildInfoPath}` };
  }

  const bodies = explicit.split(",").map((s) => s.trim()).filter(Boolean);
  if (bodies.length === 0) die("--supported was given but named no bodies.");
  return { bodies, source: "--supported (operator-supplied)" };
}

async function main() {
  const { bodies, source } = resolveSupported();
  const runIds = flags("--scope-run");
  const workIds = flags("--scope-work");
  const taskIds = flags("--scope-task");
  const nameLike = flag("--scope-name");
  const scope = {
    runIds: runIds.length > 0 ? runIds : null,
    workIds: workIds.length > 0 ? workIds : null,
    taskIds: taskIds.length > 0 ? taskIds : null,
    nameLike,
  };

  let result;
  try {
    result = await withWorldClient((query) => preflight({ query, supported: bodies, scope }));
  } catch (err) {
    // EXIT 2, NOT 1. A read that failed is not a refusal and must not be retried past.
    die(`the inventory read FAILED, so this command has no verdict: ${err?.message ?? err}`);
    return;
  }

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const total = result.runs.reduce((n, row) => n + row.count, 0);
    console.log(`rollback-preflight: target supports ${bodies.length} body(ies) — from ${source}`);
    console.log(`  scope: ${result.scoped ? "NARROWED by the flags above" : "the WHOLE database"}`);
    console.log(`  non-terminal workflow runs in scope: ${total} across ${result.runs.length} name(s)`);
    for (const row of result.runs) {
      console.log(`    ${supportedMark(result.supported, row.body)} ${row.count}x ${row.body}  (${row.name})`);
    }
    console.log(`  live accounting_work tasks bound to NO run: ${result.unbound.count}${result.unbound.strands ? "  <- the target carries no claraWork body" : ""}`);
    for (const t of result.unbound.tasks) console.log(`    task ${t.id} (work ${t.workId}, ${t.status})`);
  }

  if (result.verdict === "allowed") {
    console.log("rollback-preflight: ALLOWED — every in-flight body is carried by the target image.");
    process.exit(0);
  }
  console.error("\nrollback-preflight: REFUSED");
  for (const row of result.outside) {
    console.error(`  - ${row.count} non-terminal run(s) on ${row.body}, which the target image does NOT carry (${row.name}).`);
  }
  if (result.unbound.strands) {
    console.error(
      `  - ${result.unbound.count} admitted accounting_work task(s) are bound to no run yet, and the target image carries no claraWork body: ` +
        "rolling back PARKS that lane rather than losing it, but nothing will run those Works until a claraWork-carrying image returns.",
    );
  }
  console.error(
    "\nThe two admissible ways forward are the ones the runbook names: RETAIN every non-terminal bundle in the target " +
      "(ship a compatibility build that still exports these bodies while new admission points at the previous version), " +
      "or DRAIN first and re-run this command until it allows. Elapsed time is not a drain.",
  );
  process.exit(1);
}

function supportedMark(supported, body) {
  return supported.includes(body) ? "ok " : "!! ";
}

main().catch((err) => {
  console.error("rollback-preflight: FAILED\n", err?.stack ?? err);
  process.exit(2);
});
