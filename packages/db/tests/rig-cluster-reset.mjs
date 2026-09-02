// Shared CLUSTER-shaped cleanup for the closed-wave upgrade drills — never a ceremony
// script (deliberately lives in tests/, not scripts/ or deploy/: nothing here is
// reachable from a real deploy/DR path).
//
// WHY THIS EXISTS (PR #518, review-518 D1/D2). The closed-wave-upgrade-drills CI
// action runs up to ten drill steps against ONE shared `postgres:17` service
// container, each creating its OWN `clara_*_ci` database but never dropping it.
// Postgres roles are CLUSTER-WIDE, not database-scoped: several migrations mint a
// `clara_*` role idempotently (`create role ... if not exists`), and once ANY step's
// full 0001->frontier replay has run, those roles exist on the cluster for every
// LATER step too. Migration 0154 hard-asserts an exact cluster-wide role census (14,
// errcode CLR10) at its own position in the chain — correct on a genuinely fresh
// cluster, wrong the moment a sibling database anywhere in the cluster already
// carries the later roles.
//
// A file-local role sweep is NOT enough on its own (this is D1's finding): `DROP
// ROLE` consults `pg_shdepend` ACROSS EVERY DATABASE in the cluster, so it fails
// closed (`2BP01`) as long as ANY OTHER database still holds objects owned by or
// granted to that role — exactly the state a sibling `clara_*_ci` database is in
// once its own drill step has run. The sweep here only ever succeeds once nothing
// else in the cluster references the role, which is why the CI action drops each
// step's OWN database (this module's `dropDatabase`) immediately before sweeping.
//
// Two capabilities, used two ways:
//   - `sweepChainMintedRoles()` — called BETWEEN a drill file's own reset()+migrate()
//     cycles (in-file use, e.g. rig-docs-upgrade.test.mjs's resetForFullReplay()) and
//     by the CI action's own between-step cleanup, via this file's CLI entry.
//   - `dropDatabase(name)` — used only by the CI action's between-step cleanup, to
//     clear a just-finished drill step's database so the sweep that follows has
//     nothing left to consult.
//
// GATING (review-518 D3). Both destructive operations go through the SAME
// `assertDestructiveAllowed()` every reset/restore script uses (CLARA_ALLOW_DESTRUCTIVE=1
// + a disposable target) — unchanged, not widened. The role sweep ADDITIONALLY
// requires an explicit `CLARA_RIG_ALLOW_ROLE_SWEEP=1`, because its blast radius is the
// WHOLE CLUSTER (every database), one level broader than what `CLARA_RIG_ALLOW_RESET`
// (a single database's schema) or `CLARA_ALLOW_DESTRUCTIVE` alone imply. Set by the CI
// action, and by a rig operator who means it.
//
// THE ROSTER IS LITERAL, NEVER `rolname like 'clara%'` (review-518 D3). `clara_storage_docs`
// also matches that pattern; it is minted only by `deploy/storage-provision.sql` /
// `deploy/roles-bootstrap.sql` (a DR/deploy ceremony this pipeline never runs) and NO
// migration ever recreates it — a wildcard sweep would delete it permanently on any
// cluster where storage was ever provisioned. The roster below is exactly the roles
// the CURRENT migration chain mints, verified by reading each file (never a bare
// `create role` grep on trust): 6 (0002) + 2 (0006) + 1 (0009) + 2 (0121) + 1 (0126) +
// 2 (0131) + 2 (0160) = 16, matching the live census `0154_binding_proposal_pr_1.sql`
// asserts (14, before 0160's two) and `deploy/roles-bootstrap.sql`'s own inventory.
// A migration that mints a NEW clara-role in the future must add it here in the same
// PR (roles-bootstrap.sql already carries this "same-commit twin" convention).

import { makeClient, targetLabel, isMain } from "../lib/pg.mjs";
import { assertDestructiveAllowed, EPHEMERAL_DB } from "../lib/guard.mjs";

export const CHAIN_MINTED_ROLES = Object.freeze([
  // 0002_foundation.sql — the six group roles
  "clara_fn_owner",
  "clara_authenticated",
  "clara_agent_ro",
  "clara_wake_interactive",
  "clara_wake_proactive",
  "clara_runtime",
  // 0006_runtime_core.sql — the two login shells
  "clara_runtime_login",
  "clara_agent_read_login",
  // 0009_coding_floor.sql
  "clara_wake_write_login",
  // 0121_f_a3_pr1b_agent_limb.sql — the bank wake lane
  "clara_wake_bank",
  "clara_wake_bank_login",
  // 0126_f_a7_beta_filing_verb.sql — the filing wake kind (group only)
  "clara_wake_filing",
  // 0131_f_a6_freeform_read.sql
  "clara_freeform_ro",
  "clara_freeform_login",
  // 0160_checkout_gate_c2_stripe_events.sql — the Stripe webhook sweep lane
  "clara_stripe_webhook",
  "clara_stripe_webhook_login",
]);

/** A defense-in-depth check on the literal roster's own shape (never trust a hand-typed list blindly). */
for (const name of CHAIN_MINTED_ROLES) {
  if (!/^clara_[a-z0-9_]+$/.test(name)) {
    throw new Error(`rig-cluster-reset: CHAIN_MINTED_ROLES contains a malformed entry: ${JSON.stringify(name)}`);
  }
}

export class RoleSweepRefused extends Error {}

/**
 * CHAIN_MINTED_ROLES is written in MIGRATION ORDER (see its own comments). A cluster
 * that is mid-replay — including deliberately, mid-file: a drill cell whose own point
 * is proving a migration ABORTS partway through the chain (found live: this file's own
 * §3.0.2 ambiguous-citation cell bails after applying only 0001–0006, leaving exactly
 * the first 8 of 16 roles minted) — legitimately holds a PREFIX of this list: every
 * role up to some migration, and NONE after it. That is not the same thing as an
 * ARBITRARY subset (e.g. role #3 present without #1–#2, or #9 present without #3) —
 * an out-of-order hole means a role was created outside the migration chain, or an
 * earlier sweep half-completed, and IS refused.
 * @param {Set<string>} foundNames
 * @returns {boolean}
 */
function isValidPrefix(foundNames) {
  let i = 0;
  while (i < CHAIN_MINTED_ROLES.length && foundNames.has(CHAIN_MINTED_ROLES[i])) i++;
  for (let j = i; j < CHAIN_MINTED_ROLES.length; j++) {
    if (foundNames.has(CHAIN_MINTED_ROLES[j])) return false;
  }
  return true;
}

/**
 * Drop every role in CHAIN_MINTED_ROLES that currently exists — but ONLY when the
 * present set is a legitimate migration-order PREFIX of the roster (see
 * isValidPrefix). An out-of-order hole is refused rather than acted on: it means the
 * cluster is in a state this literal roster does not recognize, and guessing which
 * subset is "safe" to drop is exactly the kind of derived judgement review law 2
 * refuses.
 * @param {{ log?: (msg: string) => void }} [opts]
 */
export async function sweepChainMintedRoles({ log = () => {} } = {}) {
  if (process.env.CLARA_RIG_ALLOW_ROLE_SWEEP !== "1") {
    throw new RoleSweepRefused(
      "sweepChainMintedRoles refused: CLARA_RIG_ALLOW_ROLE_SWEEP=1 is required. This drops roles CLUSTER-WIDE (every database sees the change), one level broader than CLARA_RIG_ALLOW_RESET or CLARA_ALLOW_DESTRUCTIVE alone authorize. Set it only in the closed-wave-drills and frontier-leg CI actions, or as a rig operator who means it.",
    );
  }
  assertDestructiveAllowed({ action: "sweep the chain-minted clara roles (cluster-wide)" });

  const client = makeClient();
  await client.connect();
  try {
    // Purely informational (review-518-r2, §2c's cosmetic note): every `clara`-prefixed
    // role NOT in the literal roster — e.g. `clara_storage_docs` — is never selected,
    // never dropped, and previously never mentioned either. Name it in the log so an
    // operator reading the cleanup output sees it was deliberately left alone, not
    // silently missed. This query's result plays NO part in what gets dropped below.
    const allClaraPrefixed = await client.query("select rolname from pg_roles where rolname like 'clara%'");
    const unrecognized = allClaraPrefixed.rows.map((r) => r.rolname).filter((n) => !CHAIN_MINTED_ROLES.includes(n));
    if (unrecognized.length) {
      log(
        `role sweep: leaving ${unrecognized.length} unrecognized clara%-prefixed role(s) untouched (not in CHAIN_MINTED_ROLES): ${unrecognized
          .sort()
          .join(", ")}`,
      );
    }

    const present = await client.query("select rolname from pg_roles where rolname = any($1::text[])", [
      CHAIN_MINTED_ROLES,
    ]);
    const foundCount = present.rowCount;
    const expected = CHAIN_MINTED_ROLES.length;
    if (foundCount === 0) {
      log(`role sweep: 0 of ${expected} chain-minted roles present — nothing to sweep · target ${targetLabel()}`);
      return { ok: true, swept: 0 };
    }
    const foundNames = new Set(present.rows.map((r) => r.rolname));
    if (!isValidPrefix(foundNames)) {
      throw new RoleSweepRefused(
        `role sweep refused: found ${foundCount} of ${expected} expected chain-minted roles (${[...foundNames]
          .sort()
          .join(
            ", ",
          )}) on ${targetLabel()}, and they are NOT a migration-order prefix of the roster — a role created outside the migration chain, or an earlier sweep half-completed. Investigate before retrying; the literal roster is CHAIN_MINTED_ROLES in this file.`,
      );
    }
    for (const role of CHAIN_MINTED_ROLES) {
      if (foundNames.has(role)) await client.query(`drop role if exists ${role}`);
    }
    log(`role sweep: dropped ${foundCount} of ${expected} chain-minted role(s) (a migration-order prefix) · target ${targetLabel()}`);
    return { ok: true, swept: foundCount };
  } finally {
    await client.end();
  }
}

/**
 * Drop one throwaway `*_ci` database by name (the CI action's own between-step
 * cleanup only — never called by an in-file drill cycle, which must not drop the
 * database it is itself connected through). Connects via whatever target the
 * caller's ambient env already resolves (the action sets PGDATABASE=postgres
 * before invoking this, the same convention its own `create database` steps use).
 * @param {string} name
 * @param {{ log?: (msg: string) => void }} [opts]
 */
export async function dropDatabase(name, { log = () => {} } = {}) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`dropDatabase: refusing a non-conforming database name ${JSON.stringify(name)}`);
  }
  assertDestructiveAllowed({ action: `drop database "${name}"` });
  // review-518-r2 F3: assertDestructiveAllowed only reasons about the CONNECTION target
  // (e.g. PGDATABASE=postgres, already disposable via the localhost check), not the
  // NAMED database this call is about to drop — so on any localhost cluster it would
  // otherwise authorize dropping an arbitrary conforming name, `clara_test` (the estate
  // suite's own) included. Hold the DROP TARGET to the same disposable-name shape the
  // guard already reasons about elsewhere (`lib/guard.mjs`'s EPHEMERAL_DB — every drill
  // database already ends in `_ci`).
  if (!EPHEMERAL_DB.test(name)) {
    throw new Error(
      `dropDatabase: refusing "${name}" — its name does not look disposable (no ci/test/tmp/temp/scratch/ephemeral suffix). This call only drops throwaway drill databases; rename the target or use a *_ci-shaped name.`,
    );
  }
  const client = makeClient();
  await client.connect();
  try {
    await client.query(`drop database if exists ${name} with (force)`);
    log(`dropped database "${name}" (if it existed) · via ${targetLabel()}`);
  } finally {
    await client.end();
  }
}

function parseArgs(argv) {
  const out = { sweepRoles: false, dropDatabaseName: null };
  for (const arg of argv) {
    if (arg === "--sweep-roles") out.sweepRoles = true;
    else if (arg.startsWith("--drop-database=")) out.dropDatabaseName = arg.slice("--drop-database=".length);
    else throw new Error(`rig-cluster-reset: unknown argument ${JSON.stringify(arg)}`);
  }
  return out;
}

async function main() {
  const { sweepRoles, dropDatabaseName } = parseArgs(process.argv.slice(2));
  if (!sweepRoles && !dropDatabaseName) {
    throw new Error("rig-cluster-reset: nothing to do — pass --drop-database=<name> and/or --sweep-roles");
  }
  if (dropDatabaseName) await dropDatabase(dropDatabaseName, { log: console.log });
  if (sweepRoles) await sweepChainMintedRoles({ log: console.log });
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error("rig-cluster-reset: FAIL —", err.message);
    process.exit(1);
  });
}
