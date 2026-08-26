#!/usr/bin/env node
// THE EVALUATOR DEPLOY CEREMONY — the DB-side act, and the only thing that turns a registered
// closure from dark into reachable.
//
// WHY IT IS A SEPARATE SCRIPT AND NOT A MIGRATION STEP. clara._tf_evaluator_deploy_once (0060:93)
// refuses the undeployed->deployed transition unless `current_user = session_user` — i.e. unless
// the deploying session holds NO active SET ROLE. Migration bodies run most of their length under
// `set role clara_fn_owner`, so an in-migration flip would refuse by construction. The transition
// is also ONE-WAY and admitted exactly ONCE per row, forever: there is no undo, and a second run
// is a no-op rather than an error.
//
// WHAT IT IS NOT. `node scripts/check-frozen-evaluators.mjs --lock-deployed` is a DIFFERENT act on
// a DIFFERENT half: it stamps the REPO-SIDE manifest so a deployed body's hash becomes immutable
// versus origin/main. Both halves are needed and neither substitutes for the other — the manifest
// lock without this flip locks a body nothing can reach, and this flip without the manifest lock
// leaves a LIVE evaluator outside the append-only hash lock. Run this first, then the manifest.
//
// THE DSN COMES FROM THE ENVIRONMENT, NEVER FROM ARGV AND NEVER FROM CODE (hard constraint 4).
//
// Usage:
//   node packages/db/scripts/deploy-evaluator-version.mjs --name evaluate_metric --version 2
//   node packages/db/scripts/deploy-evaluator-version.mjs --name evaluate_metric --version 2 --dry-run

import { makeClient, targetLabel, assertNoTargetSplit } from "../lib/pg.mjs";

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1];
}

const name = arg("--name");
const version = Number(arg("--version"));
const dryRun = process.argv.includes("--dry-run");

// An allow-list on the NAME, not an escape: the value reaches the database only as a bound
// parameter, and this check exists so a typo names a refusal rather than a silent no-op.
if (!name || !/^[a-z][a-z0-9_]{0,62}$/.test(name) || !Number.isInteger(version) || version <= 0) {
  console.error("deploy-evaluator-version: --name <evaluator_name> --version <positive integer> are both required");
  process.exit(2);
}

// ONE canonical target: a DSN-URL-versus-PG* mismatch would let this ceremony report one database
// while flipping a row in another.
assertNoTargetSplit();
const client = makeClient();
await client.connect();
let exitCode = 0;
try {
  // THE PRINCIPAL, READ POSITIVELY AND BEFORE ANYTHING ELSE. The trigger enforces this too, but a
  // ceremony that discovers its own principal is wrong from a CLR08 halfway through is a worse
  // ceremony than one that says so first.
  const who = (await client.query("select current_user as cu, session_user as su")).rows[0];
  if (who.cu !== who.su) {
    console.error(`deploy-evaluator-version: REFUSED — this session holds an active SET ROLE (current_user=${who.cu}, session_user=${who.su}).`
      + " The deploy-once trigger requires the bare migration ceremony principal; RESET ROLE and run again.");
    process.exit(1);
  }
  const before = (await client.query(
    `select id, deployed, entrypoint_signature, migration_version,
            (select count(*)::int from clara.evaluator_version_members m where m.evaluator_version_id = e.id) as members
       from clara.evaluator_versions e
      where evaluator_name = $1 and version = $2 and firm_id is null`, [name, version])).rows[0];
  if (!before) {
    console.error(`deploy-evaluator-version: REFUSED — no registered closure ('${name}', ${version}) with firm_id is null.`);
    process.exit(1);
  }
  console.log(`deploy-evaluator-version: target ${targetLabel()} · ('${name}', ${version})`
    + ` · entrypoint ${before.entrypoint_signature} · ${before.members} member(s)`
    + ` · minted by ${before.migration_version} · currently ${before.deployed ? "DEPLOYED" : "DARK"}`);
  if (before.deployed) {
    console.log("deploy-evaluator-version: already deployed — the transition is one-way and admitted once, so this is a no-op, not an error.");
  } else if (dryRun) {
    console.log("deploy-evaluator-version: --dry-run — nothing was flipped.");
  } else {
    // The freeze is verified BEFORE the flip as well as by the trigger during it: a closure whose
    // live bodies no longer hash to what was registered must not become reachable.
    await client.query("select clara.verify_evaluator_freeze()");
    const r = await client.query(
      "update clara.evaluator_versions set deployed = true where id = $1 and not deployed", [before.id]);
    if (r.rowCount !== 1) {
      console.error(`deploy-evaluator-version: REFUSED — the update matched ${r.rowCount} row(s); nothing was flipped.`);
      process.exit(1);
    }
    console.log(`deploy-evaluator-version: FLIPPED ('${name}', ${version}) to deployed.`);
  }
  const verified = (await client.query("select clara.verify_evaluator_freeze() r")).rows[0].r;
  console.log(`deploy-evaluator-version: verify_evaluator_freeze — registered ${verified.verified_registered}, deployed ${verified.verified_deployed}.`);
  console.log("deploy-evaluator-version: NEXT — run `node scripts/check-frozen-evaluators.mjs --lock-deployed` locally and commit the manifest,"
    + " so the now-live body is inside the append-only hash lock.");
} catch (err) {
  console.error(`deploy-evaluator-version: FAILED — ${err?.message ?? err}`);
  exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
process.exit(exitCode);
