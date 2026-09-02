import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WAKE_OPEN_FIRM_QUESTION_SIGNATURE =
  "clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)";
export const WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA =
  "779ac164ae985e39ad0c8457be2e8b1768fb306888ed0bdec336924765078635";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const defaultMigrationsDir = resolve(here, "..", "migrations");
const migrationFilePattern = /^(?:UNNUMBERED|\d{4})_wake_open_firm_question_kind_wall\.sql$/;
const anchoredPreimagePattern =
  /if\s+encode\(\s*sha256\(\s*convert_to\(\s*v_src\s*,\s*'UTF8'\s*\)\s*\)\s*,\s*'hex'\s*\)\s*<>\s*'([0-9a-f]{64})'\s+then/giu;

/**
 * Resolve the migration and derive its authoritative pre-image SHA from the guarded comparison.
 * Injected readers keep the refusal matrix pin-able without writing filesystem fixtures.
 */
export function resolveWakeOpenFirmQuestionKindWallMigration({
  migrationsDir = process.env.CLARA_MIGRATIONS_DIR || defaultMigrationsDir,
  listFiles = (dir) => readdirSync(dir),
  readFile = (path) => readFileSync(path, "utf8"),
} = {}) {
  const matches = listFiles(migrationsDir)
    .map((entry) => (typeof entry === "string" ? entry : entry.name))
    .filter((name) => migrationFilePattern.test(name));
  if (matches.length !== 1) {
    throw new Error(
      `wake-open-firm-question-kind-wall gate: expected exactly one ` +
        `^(UNNUMBERED|\\d{4})_wake_open_firm_question_kind_wall\\.sql$ file in ` +
        `${migrationsDir}, found ${matches.length}`,
    );
  }

  const migrationFile = matches[0];
  const migrationPath = join(migrationsDir, migrationFile);
  const migrationText = readFile(migrationPath);
  const preimageShas = new Set(
    [...migrationText.matchAll(anchoredPreimagePattern)].map((match) => match[1].toLowerCase()),
  );
  if (preimageShas.size !== 1) {
    throw new Error(
      "wake-open-firm-question-kind-wall gate: expected exactly one DISTINCT pre-image sha " +
        "anchored on the v_src prosrc comparison, " +
        `found ${preimageShas.size} in ${migrationFile}`,
    );
  }

  const preimageSha = [...preimageShas][0];
  if (preimageSha === WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA) {
    throw new Error(
      `wake-open-firm-question-kind-wall gate: migration pre-image and post-image are both ${preimageSha}`,
    );
  }

  const migrationLabel = relative(repoRoot, migrationPath).replaceAll("\\", "/");
  return { migrationFile, migrationLabel, migrationPath, migrationText, preimageSha };
}

/** Read identity only. No preload policy is consulted here. */
export async function classifyWakeOpenFirmQuestionKindWall(query) {
  const migration = resolveWakeOpenFirmQuestionKindWallMigration();
  const catalog = await query(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as body_sha
       from pg_proc p
      where p.oid = to_regprocedure($1)`,
    [WAKE_OPEN_FIRM_QUESTION_SIGNATURE],
  );
  const bodySha = catalog.rows[0]?.body_sha ?? null;
  const classification = bodySha === null
    ? "absent"
    : bodySha === migration.preimageSha
      ? "preimage"
      : bodySha === WAKE_OPEN_FIRM_QUESTION_POSTIMAGE_SHA
        ? "postimage"
        : "unknown";
  const diagnostic = classification === "unknown"
    ? `the wake_open_firm_question body is at an unrecognised sha (${bodySha}); re-derive this battery's pins`
    : classification === "absent"
      ? `the exact ${WAKE_OPEN_FIRM_QUESTION_SIGNATURE} signature is absent; behavioural assertions must execute`
      : null;

  return {
    ...migration,
    bodySha,
    classification,
    diagnostic,
    oldBody: classification === "preimage",
  };
}

export function prefixWakeOpenFirmQuestionKindWallFailure(error, diagnostic) {
  if (diagnostic && error instanceof Error) {
    error.message = `${diagnostic}: ${error.message}`;
  }
  return error;
}

/** Apply only the kind-wall battery's pre-integration skip/fail policy. */
export async function readWakeOpenFirmQuestionKindWallState(
  query,
  allowMissing = process.env.CLARA_ALLOW_MISSING_WAKE_OPEN_FIRM_QUESTION_KIND_WALL,
) {
  const state = await classifyWakeOpenFirmQuestionKindWall(query);
  const skipReason = state.classification === "preimage"
    ? `exact known pre-image ${state.preimageSha} is live because ${state.migrationLabel} has not replaced it yet`
    : null;

  if (state.classification === "preimage" && allowMissing !== "1") {
    throw new Error(
      `${skipReason}. Focused/post-migration runs fail loudly; only the explicit ` +
        "package-wide preintegration sweep may admit this authoring state.",
    );
  }

  return {
    ...state,
    skipReason,
    action: state.classification === "preimage" ? "skip" : "execute",
  };
}
