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
// cluster where storage was ever provisioned.
//
// D6 CLASS (sweep run 33707608346, 2026-09-03): a HAND-COPIED roster is a closed
// enumeration that rots the moment a migration mints a new role. Migration
// 0163_checkout_gate_c3_folded_door.sql minted clara_auth_wall/_login and added them
// to `deploy/roles-bootstrap.sql`'s own inventory (the "same-commit twin" convention
// that file's header already names) — but CHAIN_MINTED_ROLES below went unedited. The
// sweep only WARNED about the two orphans instead of refusing, so they survived every
// between-step cleanup and poisoned the NEXT from-scratch migrate's 0154 role census
// (14 -> 16) one step later, far from the actual cause. Two fixes, both below: (1) the
// MEMBERSHIP of this roster is now cross-checked against `deploy/roles-bootstrap.sql`
// — the single source of truth for "which roles exist" — at MODULE LOAD, so a future
// same drift throws immediately and loudly instead of warning once and refusing at
// 0154; (2) `sweepChainMintedRoles()` now FAILS CLOSED on any clara%-prefixed role it
// finds on the live cluster that neither this roster nor roles-bootstrap.sql
// recognises (a role created by hand, or by a migration that skipped BOTH files).
//
// WHY THE ORDER STAYS A HAND-MAINTAINED LITERAL (not also derived from the migrations
// themselves). The prefix check below (`isValidPrefix`) needs a true MIGRATION-ORDER
// sequence, and the migrations mint these roles through TWO different idioms: six
// files (0009, 0121 x2, 0126, 0160 x2, 0163 x2) carry a literal
// `create role clara_x nologin [inherit];` DDL line naming the role directly, but
// three (0002, 0006, 0131) mint theirs through a `foreach r in array array[...] loop`
// whose `execute format('create role %I nologin', r)` never spells the name at the
// call site — the names live in a SEPARATE array literal a few lines above. A regex
// parser robust to both idioms (and to comments that use the phrase "create role"
// without meaning it — 0126 has three) is real parsing work for a property this file
// can verify structurally instead: see the drift guard immediately below, which
// proves this literal's MEMBERSHIP matches deploy/roles-bootstrap.sql exactly, and
// `tests/chain-minted-roles-drift-guard.test.mjs`, which independently re-derives the
// full role set from every migration file's own text (handling both idioms) and
// proves membership there too. A future stale ORDER (not membership) fails differently
// but no less loudly: `isValidPrefix` throws "NOT a migration-order prefix" rather than
// silently accepting an out-of-order cluster state.
//
// A migration that mints a NEW clara-role must add it to `deploy/roles-bootstrap.sql`'s
// `grp`/`logins` arrays AND to CHAIN_MINTED_ROLES below (in migration order) IN THE SAME
// COMMIT. The drift guard below enforces the first half of that; nothing enforces the
// commit-atomicity except review — the guard only fires once BOTH edits should already
// have landed and one didn't.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient, targetLabel, isMain } from "../lib/pg.mjs";
import { assertDestructiveAllowed, EPHEMERAL_DB } from "../lib/guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROLES_BOOTSTRAP_FILE = join(HERE, "..", "deploy", "roles-bootstrap.sql");

/**
 * Parse a `varName text[] := array[ 'a', 'b', ... ];` declaration out of
 * roles-bootstrap.sql's own text — never a live psql read (this module has no
 * connection yet), and never re-typed by hand: the FILE is the single source of
 * truth for "which roles a fresh-target DR restore recreates" (its own header),
 * so reading IT is what keeps this roster from being a second, silently-drifting
 * copy of that inventory.
 * @param {string} sql
 * @param {string} varName
 * @returns {string[]}
 */
function extractRoleArray(sql, varName) {
  const re = new RegExp(`\\b${varName}\\s+text\\[\\]\\s*:=\\s*array\\s*\\[([\\s\\S]*?)\\]\\s*;`, "m");
  const m = re.exec(sql);
  if (!m) {
    throw new Error(
      `rig-cluster-reset: could not find "${varName} text[] := array[...]" in ${ROLES_BOOTSTRAP_FILE} — its shape changed; update this parser (or restore the file's shape).`,
    );
  }
  const names = [...m[1].matchAll(/'(clara_[a-z0-9_]+)'/g)].map((x) => x[1]);
  if (names.length === 0) {
    throw new Error(`rig-cluster-reset: the "${varName}" array in ${ROLES_BOOTSTRAP_FILE} parsed to zero role names`);
  }
  return names;
}

/**
 * The Storage JWT role (`deploy/storage-provision.sql` / this file's own storage
 * do-block) — created by roles-bootstrap.sql for a fresh-target DR restore, but
 * NEVER by a migration, and NEVER swept (see the header comment above). Parsed
 * from its own literal `create role clara_x nologin noinherit;` line — the ONLY
 * such line in the file (every grp/logins role is created via `execute
 * format(...)`, never a bare literal `create role`) — so it is RECOGNISED
 * (never flagged as drift) without joining the droppable roster.
 * @param {string} sql
 * @returns {string}
 */
function extractStorageRole(sql) {
  const m = /create role (clara_[a-z0-9_]+) nologin noinherit;/.exec(sql);
  if (!m) {
    throw new Error(
      `rig-cluster-reset: could not find the storage role's "create role ... noinherit" line in ${ROLES_BOOTSTRAP_FILE}`,
    );
  }
  return m[1];
}

const ROLES_BOOTSTRAP_SQL = readFileSync(ROLES_BOOTSTRAP_FILE, "utf8");
const BOOTSTRAP_GROUP_ROLES = extractRoleArray(ROLES_BOOTSTRAP_SQL, "grp");
const BOOTSTRAP_LOGIN_ROLES = extractRoleArray(ROLES_BOOTSTRAP_SQL, "logins");

/** The Storage JWT role — recognised, but never chain-minted and never swept (see above). */
export const STORAGE_ROLE = extractStorageRole(ROLES_BOOTSTRAP_SQL);

/**
 * The DERIVED set of chain-minted role names — read from `deploy/roles-bootstrap.sql`
 * at module load, never hand-copied. This is that file's own `grp` + `logins`
 * inventory (the storage role is excluded — see `extractStorageRole`'s docstring).
 * Exported so a test can re-derive it without re-implementing this parser.
 */
export const BOOTSTRAP_ROSTER = Object.freeze([...BOOTSTRAP_GROUP_ROLES, ...BOOTSTRAP_LOGIN_ROLES]);

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
  // 0163_checkout_gate_c3_folded_door.sql — the confirmation-attempt wall (the D6 fix)
  "clara_auth_wall",
  "clara_auth_wall_login",
]);

/** A defense-in-depth check on the literal roster's own shape (never trust a hand-typed list blindly). */
for (const name of CHAIN_MINTED_ROLES) {
  if (!/^clara_[a-z0-9_]+$/.test(name)) {
    throw new Error(`rig-cluster-reset: CHAIN_MINTED_ROLES contains a malformed entry: ${JSON.stringify(name)}`);
  }
}

/**
 * THE DRIFT GUARD (D6 class — see the header comment above): CHAIN_MINTED_ROLES'
 * MEMBERSHIP must exactly match deploy/roles-bootstrap.sql's own BOOTSTRAP_ROSTER, in
 * both directions, at MODULE LOAD — before any test, any drill, any CLI invocation
 * runs. This is what turns "a migration minted a role and roles-bootstrap.sql got it
 * but this file didn't" from a silent warning (the defect that just cost a cryptic
 * 0154 refusal one step removed from its cause) into an immediate, named, load-time
 * throw.
 */
for (const name of BOOTSTRAP_ROSTER) {
  if (!CHAIN_MINTED_ROLES.includes(name)) {
    throw new Error(
      `rig-cluster-reset: deploy/roles-bootstrap.sql mints "${name}" but CHAIN_MINTED_ROLES in this file (packages/db/tests/rig-cluster-reset.mjs) does not list it. Add it there, in migration order, in the SAME commit that added it to roles-bootstrap.sql.`,
    );
  }
}
for (const name of CHAIN_MINTED_ROLES) {
  if (!BOOTSTRAP_ROSTER.includes(name)) {
    throw new Error(
      `rig-cluster-reset: CHAIN_MINTED_ROLES lists "${name}" but deploy/roles-bootstrap.sql's grp/logins arrays do not. Either roles-bootstrap.sql is missing its own "same-commit twin" entry, or this literal has a stale or typo'd entry — fix whichever is wrong.`,
    );
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
      "sweepChainMintedRoles refused: CLARA_RIG_ALLOW_ROLE_SWEEP=1 is required. Roles are CLUSTER-GLOBAL (every database sees the same role), but the GRANTS a migration issues land in whichever database ran it — so this drops roles CLUSTER-WIDE, one level broader than CLARA_RIG_ALLOW_RESET or CLARA_ALLOW_DESTRUCTIVE alone authorize. Set it only in the CI drill actions that run this sweep between from-scratch migrates on a shared cluster (closed-wave-upgrade-drills, wave-e-contract-drills, frontier-leg), or as a rig operator who means it.",
    );
  }
  assertDestructiveAllowed({ action: "sweep the chain-minted clara roles (cluster-wide)" });

  const client = makeClient();
  await client.connect();
  try {
    // Every `clara`-prefixed role NOT in the literal roster is examined against
    // STORAGE_ROLE (the one deliberate, recognised exclusion — see its own docstring
    // above) before deciding what to do with it. `clara_storage_docs` is never
    // selected, never dropped, and its presence is purely informational: name it in
    // the log so an operator reading the cleanup output sees it was deliberately left
    // alone, not silently missed.
    //
    // ANYTHING ELSE unrecognised FAILS CLOSED (D6 class, sweep run 33707608346): this
    // clause used to log-and-continue for every non-roster role, which is exactly how
    // clara_auth_wall/_login survived every cleanup after 0163 minted them without a
    // CHAIN_MINTED_ROLES update — the failure then surfaced one step later, at 0154's
    // absolute role census, far from its actual cause. The module-load drift guard
    // above already makes "roles-bootstrap.sql and this roster disagree" impossible to
    // reach this far — so a role that reaches this branch and is NOT the storage role
    // exists on the LIVE CLUSTER without being declared in either file: hand-created,
    // or minted by a migration that skipped BOTH same-commit twins. That is the one
    // case this sweep must never silently paper over.
    const allClaraPrefixed = await client.query("select rolname from pg_roles where rolname like 'clara%'");
    const unrecognized = allClaraPrefixed.rows.map((r) => r.rolname).filter((n) => !CHAIN_MINTED_ROLES.includes(n));
    if (unrecognized.includes(STORAGE_ROLE)) {
      log(
        `role sweep: leaving the storage role (${STORAGE_ROLE}) untouched — minted only by deploy/storage-provision.sql / this file's storage do-block, never by a migration, never swept.`,
      );
    }
    const trulyUnrecognized = unrecognized.filter((n) => n !== STORAGE_ROLE);
    if (trulyUnrecognized.length) {
      throw new RoleSweepRefused(
        `sweepChainMintedRoles refused: found ${trulyUnrecognized.length} clara%-prefixed role(s) on ${targetLabel()} that neither CHAIN_MINTED_ROLES nor deploy/roles-bootstrap.sql recognises: ${trulyUnrecognized
          .sort()
          .join(", ")}. A role minted by a migration must join deploy/roles-bootstrap.sql's grp/logins arrays AND CHAIN_MINTED_ROLES in packages/db/tests/rig-cluster-reset.mjs in the SAME commit. Update both files (or drop this role by hand if it should not exist), then retry.`,
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
