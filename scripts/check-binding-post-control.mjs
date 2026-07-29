#!/usr/bin/env node
// Vendor-binding post-control gate — the persistent CI layer for migration
// 0029's Slot C interlock (task #36).
//
// Migration postverify proves the committed catalog immediately after deploy.
// This checker proves the migration TREE on every later change: SQL migrations
// apply in filename order and CREATE OR REPLACE uses "last definition wins", so
// the last static execute_rule_post(uuid,text) body must still carry 0029's
// binding live/unexpired gate before the approval call, and must consume that
// value in the intervening refusal control flow.
//
// STATIC LIMIT, INTENTIONAL STOP-GAP. Source position plus a downstream use is
// stronger than bare string containment, but it cannot prove PL/pgSQL runtime
// reachability. The scanner therefore FAILS CLOSED on every post-0029 dynamic
// CoR target it cannot attribute and on every attributed execute_rule_post recut:
// a human must prove the gate survives or extend this checker before merge.
//
// SCOPE: every packages/db/migrations/*.sql file, in filename order.
// No dependencies — Node built-ins plus the repo's shared SQL lexer only.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  maskComments,
  parseCoRPatches,
  parseFunctions,
} from "./wiki-lint-checks.mjs";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "db",
  "migrations",
);

const EXECUTOR_IDENTITY = "execute_rule_post(uuid,text)";
const EXECUTOR_MIGRATION = "0029_vendor_binding_executor.sql";

// MUST match packages/db/deploy/vendor-binding-executor-0029-postverify.sql's
// own gate string after comment stripping, lower-casing, and whitespace folding.
const BINDING_GATE =
  "v_binding_live:=b.status='live' and b.expires_at>now();";
const BINDING_GATE_USE = "not v_binding_live";
const APPROVE_CALL = "_approve_entry_core(";

function normalizeBody(body) {
  return maskComments(body).replace(/\s+/g, " ").toLowerCase();
}

/** Check an ordered migration source set. Exported so the self-test exercises
 * the exact certification logic without writing a fake migration into the tree. */
export function checkBindingPostControlSources(sources) {
  let current = null;
  let definitions = 0;
  const dynamicRecuts = [];
  const unresolvedRecuts = [];

  for (const { file, sql } of [...sources].sort((a, b) =>
    a.file.localeCompare(b.file))) {
    const functions = parseFunctions(sql);
    for (const fn of functions) {
      if (fn.identity !== EXECUTOR_IDENTITY) continue;
      current = { file, line: fn.line, body: fn.body };
      definitions += 1;
    }
    if (file > EXECUTOR_MIGRATION) {
      for (const patch of parseCoRPatches(sql, functions)) {
        if (patch.targets.includes(null)) {
          unresolvedRecuts.push(`${file}:${patch.line}`);
        }
        if (patch.targets.includes(EXECUTOR_IDENTITY)) {
          dynamicRecuts.push(`${file}:${patch.line}`);
        }
      }
    }
  }

  if (unresolvedRecuts.length > 0) {
    return {
      ok: false,
      message:
        "binding-post-control: FAIL — post-0029 dynamic CoR patch(es) have "
        + `unresolved target identity: ${unresolvedRecuts.join(", ")}.\n\n`
        + "An unparseable target is not evidence that execute_rule_post is "
        + "untouched. Use a statically attributable regprocedure literal (directly "
        + "or through one literal-valued signature variable), or extend this "
        + "checker before certifying the migration tree.",
    };
  }

  if (dynamicRecuts.length > 0) {
    return {
      ok: false,
      message:
        "binding-post-control: FAIL — post-0029 dynamic CoR patch(es) target "
        + `clara.${EXECUTOR_IDENTITY}: ${dynamicRecuts.join(", ")}.\n\n`
        + "Static function parsing cannot see the installed body. Prove Slot C "
        + "survives and update this checker before certifying the migration tree.",
    };
  }

  if (current === null) {
    return {
      ok: false,
      message:
        "binding-post-control: FAIL — no static "
        + "clara.execute_rule_post(uuid,text) definition exists in the migration tree.",
    };
  }

  const body = normalizeBody(current.body);
  const gatePos = body.indexOf(BINDING_GATE);
  const usePos = body.indexOf(BINDING_GATE_USE, gatePos + BINDING_GATE.length);
  const approvePos = body.indexOf(APPROVE_CALL);
  if (
    gatePos < 0
    || usePos < 0
    || approvePos < 0
    || gatePos >= usePos
    || usePos >= approvePos
  ) {
    return {
      ok: false,
      message:
        "binding-post-control: FAIL — the current execute_rule_post(uuid,text) "
        + `definition (${current.file}:${current.line}) lacks migration 0029's `
        + "binding live/unexpired assignment -> refusal-use -> approve-call "
        + "source order.\n\n"
        + "A later CREATE OR REPLACE has dropped the post-time authority check "
        + "while the 0029 schema_migrations interlock would remain open. Carry "
        + "Slot C forward verbatim before merging the recut.",
    };
  }

  return {
    ok: true,
    message:
      "binding-post-control: OK — "
      + `${definitions} execute_rule_post(uuid,text) definition(s) scanned; `
      + `current body ${current.file}:${current.line} retains the 0029 `
      + "binding live/unexpired assignment -> refusal-use -> approve-call order, "
      + "with no post-0029 dynamic executor recut.",
  };
}

export function main({ migrationsDir = MIGRATIONS_DIR } = {}) {
  const sources = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      sql: readFileSync(join(migrationsDir, file), "utf8"),
    }));
  const result = checkBindingPostControlSources(sources);
  (result.ok ? console.log : console.error)(result.message);
  return result.ok ? 0 : 1;
}

const invoked = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) process.exit(main());
