// Readiness decision for the unique_violation constraint-name battery. NOT a test file.
//
// The only state that authorizes a pre-integration skip is a POSITIVE identity read of the
// exact body the migration's own prestate block was authored to replace. Every other body
// executes the behavioural assertions, including an absent signature or unknown future body.

import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROPOSE_VENDOR_IDENTITY_BINDING_SIG =
  "clara.propose_vendor_identity_binding(jsonb,text)";
export const KNOWN_NEW_PROSRC_SHA =
  "8c4000de1e85553ca833204eb9f552b098ef57839a461240c3af3e08e649713f";

const MIGRATION_SUFFIX = "_unique_violation_constraint_name.sql";
const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));
const PRESTATE_BLOCK = /^do \$pre\$\r?\n([\s\S]*?)^\$pre\$;[ \t]*\r?$/gm;
const PRESTATE_SHA_COMPARISON =
  /^[ \t]*if encode\(sha256\(convert_to\(v_src,'UTF8'\)\),'hex'\) <> '([0-9a-f]{64})' then[ \t]*\r?$/gm;

function invariant(condition, message) {
  if (!condition) throw new Error(`unique_violation constraint-name gate: ${message}`);
}

function resolveMigration(migrationsDir = process.env.CLARA_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR) {
  const directory = resolve(migrationsDir);
  const matches = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(MIGRATION_SUFFIX))
    .map((entry) => entry.name)
    .sort();
  invariant(
    matches.length === 1,
    `expected exactly one *${MIGRATION_SUFFIX} file in ${directory}, found ${matches.length}`,
  );
  const file = join(directory, matches[0]);
  return {
    file,
    displayPath: directory === resolve(DEFAULT_MIGRATIONS_DIR)
      ? `packages/db/migrations/${basename(file)}`
      : file,
  };
}

function readMigrationPreimage(migrationsDir) {
  const migration = resolveMigration(migrationsDir);
  const source = readFileSync(migration.file, "utf8");
  const blocks = [...source.matchAll(PRESTATE_BLOCK)];
  invariant(blocks.length === 1, `expected exactly one do $pre$ block in ${migration.file}`);
  const values = [...blocks[0][1].matchAll(PRESTATE_SHA_COMPARISON)].map((match) => match[1]);
  const distinct = [...new Set(values)];
  invariant(
    distinct.length === 1,
    `expected exactly one distinct anchored prestate prosrc SHA in ${migration.file}, found ${distinct.length}`,
  );
  invariant(
    distinct[0] !== KNOWN_NEW_PROSRC_SHA,
    `migration pre-image must differ from the gate's post-image frontier ${KNOWN_NEW_PROSRC_SHA}`,
  );
  return { ...migration, prosrcSha: distinct[0] };
}

export function readKnownOldProsrcSha(migrationsDir) {
  return readMigrationPreimage(migrationsDir).prosrcSha;
}

const defaultMigration = readMigrationPreimage(DEFAULT_MIGRATIONS_DIR);
export const UNIQUE_VIOLATION_CONSTRAINT_NAME_MIGRATION = defaultMigration.displayPath;
export const KNOWN_OLD_PROSRC_SHA = defaultMigration.prosrcSha;

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: Array<Record<string, unknown>>}>} query
 * @param {string | undefined} preload
 */
export async function readUniqueViolationConstraintNameGate(query, preload) {
  const migration = readMigrationPreimage();
  const knownOldProsrcSha = migration.prosrcSha;
  const catalog = await query(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha,
            exists (select 1 from clara.schema_migrations where version ~ '^0028_') as has_0028
       from pg_proc p
      where p.oid = to_regprocedure($1)`,
    [PROPOSE_VENDOR_IDENTITY_BINDING_SIG],
  );
  const prosrcSha = catalog.rows[0]?.prosrc_sha ?? null;
  const has28 = catalog.rows[0]?.has_0028 === true;
  const oldBody = prosrcSha === knownOldProsrcSha;
  const bodyState = prosrcSha === null
    ? "absent"
    : oldBody
      ? "old"
      : prosrcSha === KNOWN_NEW_PROSRC_SHA
        ? "new"
        : "unknown";
  const preintegration = preload === "1";
  const reason =
    `known old ${PROPOSE_VENDOR_IDENTITY_BINDING_SIG} body is still live ` +
    `(prosrc sha256 ${knownOldProsrcSha}); ${migration.displayPath} ` +
    "has not replaced it yet";
  const unknownBodyDiagnostic = bodyState === "unknown"
    ? `the vendor-binding body is at an unrecognised sha (${prosrcSha}); re-derive this battery's pins`
    : null;

  return {
    action: oldBody ? (preintegration ? "skip" : "fail") : "execute",
    reason,
    prosrcSha,
    has28,
    bodyState,
    unknownBodyDiagnostic,
  };
}
