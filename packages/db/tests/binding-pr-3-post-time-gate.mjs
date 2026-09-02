// Positive-identity readiness gate for the PR-3 post-time battery. NOT a test file.
//
// The only state that authorizes a package-wide pre-integration skip is a catalog read that
// positively identifies the exact `_approve_entry_core` body this migration was authored to
// replace. Absence, the reviewed post-image, and every unknown future body execute the battery.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BINDING_PR3_STEM = "binding_pr_3_post_time_recheck";
export const BINDING_PR3_APPROVE_SIG =
  "clara._approve_entry_core(jsonb,uuid,uuid,text,text)";
export const BINDING_PR3_ALLOW_MISSING =
  "CLARA_ALLOW_MISSING_BINDING_PR3_POST_TIME";

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export function bindingPr3MigrationsDir(env = process.env) {
  return env.CLARA_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR;
}

export function readBindingPr3Migration(env = process.env) {
  const dir = bindingPr3MigrationsDir(env);
  const matches = readdirSync(dir).filter((name) =>
    new RegExp(`^(?:UNNUMBERED|[0-9]+)_${BINDING_PR3_STEM}\\.sql$`).test(name));
  if (matches.length !== 1) {
    throw new Error(
      `binding PR-3 gate: expected exactly one numbered-or-UNNUMBERED ${BINDING_PR3_STEM} `
      + `migration in ${dir}, found ${matches.length}: ${matches.join(", ") || "<none>"}`,
    );
  }
  const path = join(dir, matches[0]);
  return { basename: matches[0], path, source: readFileSync(path, "utf8") };
}

function oneCapture(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`binding PR-3 gate: expected exactly one ${label}, found ${matches.length}`);
  }
  return matches[0][1];
}

/** Read the ONE pre-image literal, anchored on the prestate comparison that consumes it. */
export function readBindingPr3PrePin(env = process.env) {
  const { source } = readBindingPr3Migration(env);
  const prestate = source.match(/do \$bp3_pre\$([\s\S]*?)\$bp3_pre\$;/)?.[1] ?? "";
  return oneCapture(
    prestate,
    /v_pin constant text := '([0-9a-f]{64})';[\s\S]*?if v_sha is distinct from v_pin then/g,
    "pre-image pin anchored on `v_sha is distinct from v_pin`",
  );
}

/** Read the ONE post-image literal, anchored on the tail's two independent comparisons. */
export function readBindingPr3PostPin(env = process.env) {
  const { source } = readBindingPr3Migration(env);
  const tail = source.match(/do \$bp3_tail\$([\s\S]*?)\$bp3_tail\$;/)?.[1] ?? "";
  return oneCapture(
    tail,
    /v_post_pin constant text := '([0-9a-f]{64})';[\s\S]*?v_sha is distinct from v_post_pin[\s\S]*?v_wit\.prosrc_sha is distinct from v_post_pin/g,
    "post-image pin anchored on the live-and-witness tail comparison",
  );
}

export function decideBindingPr3Gate({ prosrcSha, prePin, preload }) {
  if (prosrcSha === prePin) return preload === "1" ? "skip" : "fail";
  return "execute";
}

export const BINDING_PR3_GATE_QUERY =
  `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha
     from pg_proc p
    where p.oid = to_regprocedure($1)`;

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: Array<Record<string, unknown>>}>} query
 * @param {string | undefined} preload
 */
export async function readBindingPr3Gate(query, preload) {
  const prePin = readBindingPr3PrePin();
  const catalog = await query(BINDING_PR3_GATE_QUERY, [BINDING_PR3_APPROVE_SIG]);
  const prosrcSha = catalog.rows[0]?.prosrc_sha ?? null;
  const { basename } = readBindingPr3Migration();
  const reason =
    `positive catalog identity read: ${BINDING_PR3_APPROVE_SIG} is still the reviewed pre-image `
    + `(prosrc sha256 ${prePin}); ${basename} has not replaced it yet`;
  return {
    action: decideBindingPr3Gate({ prosrcSha, prePin, preload }),
    reason,
    prosrcSha,
    prePin,
  };
}
