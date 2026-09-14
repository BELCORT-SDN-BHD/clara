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
//     --scope-run <run-id>       (repeatable)   only these workflow runs
//     --scope-name <substring>                  only runs whose WDK name contains this
//     --scope-work <work-id>     (repeatable)   only these accounting Works
//     --scope-task <task-id>     (repeatable)   only these clara.agent_tasks rows
//     --scope-document <task-id> (repeatable)   only these clara.document_processing_tasks rows
//   Output:
//     --json                                    the full verdict object, for a pipeline
//
// WHERE THE SUPPORTED SET COMES FROM — three doors, in descending order of how much they prove.
// The first two both need the target artifact or the target running, and at ROLLBACK time you
// usually have neither: you have an image REFERENCE. So the practical door is the third.
//
//   1. `--target-bundle <path>` scans a BUILT `.output/server/index.mjs` for the WDK body
//      directives it registers. Strongest: it reads the artifact you are about to ship.
//   2. `--target-build-info <file|->` reads a saved or piped `/api/build-info` payload from the
//      target image and takes its `bodies`. Needs the target RUNNING and a scoped session:
//        curl -sH "authorization: Bearer $JWT" "$BASE/api/build-info" \
//          | node packages/runtime/scripts/rollback-preflight.mjs --target-build-info -
//   3. EXTRACT THE BUNDLE FROM THE IMAGE REFERENCE — the door that is actually reachable when you
//      are deciding to roll back. The runtime Dockerfile's runner stage puts the bundle at
//      /app/.output/server/index.mjs (Dockerfile:52, `COPY --from=builder
//      /app/packages/runtime/.output ./.output` under `WORKDIR /app`), so:
//        ctr=$(docker create <previous-image-ref>)
//        docker cp "$ctr:/app/.output/server/index.mjs" ./target-bundle.mjs
//        docker rm "$ctr"
//        node packages/runtime/scripts/rollback-preflight.mjs --target-bundle ./target-bundle.mjs
//      `docker create` starts nothing; it only materialises the filesystem.
//   4. `--supported` is the escape hatch for a target you can only DESCRIBE. It is exactly as
//      trustworthy as the person typing it, it says so loudly in its own output line, and it is
//      listed last on purpose.
//
// AND THE DATABASE GETS A VOTE — THE FRONTIER RULE (wave-3, #815). Beside the two censuses this
// command reads the database's own migration frontier (`max(clara.schema_migrations.version)`) and
// refuses a target that does not carry a body the applied schema REQUIRES, whatever the censuses
// say. Today there is one such rule: from `0195_work_egress_purpose_and_execution_trace` on, the
// target must carry `claraWork_v3` — 0195's recut posting core requires a consumed
// `accounting_work` egress authorisation and no other body can obtain one, so a pre-v3 image would
// run the whole Work lane through 0195's grandfather arm with the wall in force and nothing
// subject to it. The refusal reason is `frontier_requires_body` and it is GLOBAL: no scope clears
// it, because it counts no rows.
//
// SCOPE IS EXPLICIT, OFF BY DEFAULT, AND NEVER THE EXIT CODE. Both censuses always run in FULL; a
// scope adds a second, narrowed verdict beside the global one. The exit code follows the GLOBAL
// verdict, because a scope answers "is MY lane clear" and can never answer "is it safe to release
// this image": a parked run of another class strands exactly as hard, and `--scope-name claraWork`
// with a parked chatTurn body the target lacks would otherwise exit 0 into a crash loop.
//
// EXIT CODES. 0 = allowed (globally). 1 = REFUSED (the offending names are printed). 2 = this
// command could not answer (bad usage, unreadable target, failed read). Two and one are
// deliberately distinct: "I refuse" and "I could not look" must never share an exit code, because a
// deploy script that treats them the same will eventually ship on the second one.
//
// The DATABASE target comes from the environment only (DATABASE_URL / WORKFLOW_POSTGRES_URL, else
// the libpq PG* vars) — never a DSN literal in this file, and lib/relay.mjs's own
// `assertNoTargetSplit` fails closed if two present sources disagree.

import { readFileSync } from "node:fs";
import { preflight, refusalFooterLines, supportedBodiesFromBundle, taskIsStranded, withWorldClient } from "../lib/rollback-preflight.mjs";

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

  To get a bundle from an image REFERENCE (the door that works at rollback time):
    ctr=$(docker create <image-ref>); docker cp "$ctr:/app/.output/server/index.mjs" ./t.mjs; docker rm "$ctr"

  optional scope:  --scope-run <id>  --scope-name <substr>  --scope-work <id>  --scope-task <id>  --scope-document <id>
  optional output: --json

Exit 0 allowed (GLOBAL verdict), 1 REFUSED, 2 could not answer.`;

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
    return { bodies, source: `bundle ${bundlePath}`, verified: true };
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
          "about itself — extract its bundle instead (see --target-bundle and the docker create/cp recipe in this file's header).",
      );
    }
    return { bodies: parsed.bodies.map(String), source: `build-info ${buildInfoPath === "-" ? "(stdin)" : buildInfoPath}`, verified: true };
  }

  const bodies = explicit.split(",").map((s) => s.trim()).filter(Boolean);
  if (bodies.length === 0) die("--supported was given but named no bodies.");
  return { bodies, source: "--supported (operator-supplied)", verified: false };
}

function printCensus(label, view, supported) {
  const total = view.runs.reduce((n, row) => n + row.count, 0);
  console.log(`  ${label}`);
  console.log(`    non-terminal workflow runs: ${total} across ${view.runs.length} name(s)`);
  for (const row of view.runs) {
    console.log(`      ${supported.includes(row.body) ? "ok " : "!! "}${row.count}x ${row.body}  (${row.name})`);
  }
  // NEVER an unlooked-for zero: the count is printed only when the leg was actually measured.
  if (!view.unbound.measured) {
    console.log("    live tasks bound to NO run: NOT MEASURED (this command could not look — do not read this as zero)");
  } else {
    console.log(
      `    live tasks bound to NO run: ${view.unbound.count}`
        + (view.unbound.strandedCount > 0 ? `  <- ${view.unbound.strandedCount} strand: ${view.unbound.strandedClasses.join(", ") || "unknown kind/lane"}` : ""),
    );
    for (const t of view.unbound.tasks) {
      const needs = t.needsWorkflow ? (t.workflowClass ?? "UNKNOWN CLASS (fail-closed)") : "no workflow (consumer loop)";
      console.log(`      ${t.table} ${t.id} [${t.kind ?? t.lane} ${t.status}] -> ${needs}`);
    }
  }
  console.log(`    verdict: ${view.verdict.toUpperCase()}${view.reasons.length > 0 ? ` (${view.reasons.join(", ")})` : ""}`);
}

/** The frontier leg, printed like the other two: what the database says, and what the rule table
 *  checked against it. A measured pass prints the frontier rather than nothing — the same reason
 *  the unbound census refuses to print an unlooked-for zero. */
function printFrontier(frontier) {
  console.log("  THE DATABASE'S OWN RULE (frontier vs the target's bodies — global, no scope clears it)");
  console.log(`    clara.schema_migrations frontier: ${frontier.version ?? "NONE APPLIED"}`);
  console.log(`    rules checked: ${frontier.rules.join(", ") || "(none)"}`);
  for (const v of frontier.violations) {
    console.log(`      !! ${v.migration} requires ${v.body}, which the target does NOT carry`);
  }
  if (frontier.violations.length === 0) console.log("      ok  the target carries every body the applied schema requires");
}

async function main() {
  const { bodies, source, verified } = resolveSupported();
  const runIds = flags("--scope-run");
  const workIds = flags("--scope-work");
  const taskIds = flags("--scope-task");
  const documentTaskIds = flags("--scope-document");
  const nameLike = flag("--scope-name");
  const scope = {
    runIds: runIds.length > 0 ? runIds : null,
    workIds: workIds.length > 0 ? workIds : null,
    taskIds: taskIds.length > 0 ? taskIds : null,
    documentTaskIds: documentTaskIds.length > 0 ? documentTaskIds : null,
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
    console.log(`rollback-preflight: target supports ${bodies.length} body(ies) — from ${source}`);
    if (!verified) {
      console.log(
        "    *** UNVERIFIED SET *** this roster was TYPED, not read from the target artifact or the target's own\n"
          + "    /api/build-info. Nothing here checked that the image you are about to ship actually carries these\n"
          + "    bodies. Extract the bundle instead when you can: ctr=$(docker create <image-ref>);\n"
          + "    docker cp \"$ctr:/app/.output/server/index.mjs\" ./t.mjs; docker rm \"$ctr\"",
      );
    }
    printCensus("GLOBAL (the whole database — this is what the exit code follows)", result, bodies);
    printFrontier(result.frontier);
    if (result.scoped) {
      printCensus(
        `SCOPED (narrowed by the flags given${result.scope.derivedRunIds.length > 0 ? `; run ids derived from the named tasks: ${result.scope.derivedRunIds.join(", ")}` : ""})`,
        result.scoped,
        bodies,
      );
    }
  }

  if (result.verdict === "allowed") {
    console.log("rollback-preflight: ALLOWED — every in-flight body is carried by the target image.");
    process.exit(0);
  }
  console.error("\nrollback-preflight: REFUSED (global)");
  for (const v of result.frontier.violations) {
    // NAMED, not merely counted: the migration whose rule is in force and the body it needs, so an
    // operator can tell this apart from a parked-run refusal without reading the source.
    console.error(
      `  - frontier_requires_body: this database is at ${result.frontier.version}, and ${v.migration} `
        + `requires the image to carry ${v.body}, which the target does NOT.`
        + (v.why ? `\n      ${v.why}` : ""),
    );
  }
  for (const row of result.outside) {
    console.error(`  - ${row.count} non-terminal run(s) on ${row.body}, which the target image does NOT carry (${row.name}).`);
  }
  for (const t of result.unbound.tasks) {
    // THE SAME PREDICATE THE VERDICT USED, by import. A second inline copy of this rule (this loop
    // carried one) can drift from the verdict, and the failure mode is the worst one available:
    // exit 1 with an empty list of reasons, or a listed row that did not actually cause it.
    if (!taskIsStranded(bodies, t)) continue;
    console.error(
      `  - ${t.table} ${t.id} [${t.kind ?? t.lane}, ${t.status}] is bound to no run and needs `
        + `${t.known ? `a ${t.workflowClass} body` : "a body this command could not identify (fail-closed)"}, which the target does not carry.`,
    );
  }
  if (result.scoped && result.scoped.verdict === "allowed") {
    console.error(
      "\n  NOTE: the SCOPED verdict is allowed and the global one is not. The scope answered 'is my lane clear';\n"
        + "  it cannot answer 'is it safe to release this image'. Releasing on the scoped answer is how a parked run\n"
        + "  of another class becomes a ReplayDivergenceError and a crash loop.",
    );
  }
  if (result.frontier.violations.length > 0) {
    console.error(
      "\n  The frontier refusal is NOT drainable: it is a rule in the applied schema, not a row in a queue."
        + " Ship a target that carries the named body (or roll the SCHEMA back first, which is its own ceremony"
        + " — a migration is not a deploy).",
    );
  }
  for (const line of refusalFooterLines(bodies, result)) console.error(line);
  process.exit(1);
}

main().catch((err) => {
  console.error("rollback-preflight: FAILED\n", err?.stack ?? err);
  process.exit(2);
});
