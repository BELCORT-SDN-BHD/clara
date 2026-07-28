#!/usr/bin/env node
// Vendor-binding post-control gate — the persistent CI layer for migration
// 0029's Slot C interlock (task #36).
//
// Migration postverify proves the committed catalog immediately after deploy.
// This checker proves the migration TREE on every later change: SQL migrations
// apply in filename order and CREATE OR REPLACE uses "last definition wins", so
// the last static execute_rule_post(uuid,text) body must still carry 0029's
// binding live/unexpired gate.
//
// SCOPE: every packages/db/migrations/*.sql file, in filename order.
// No dependencies — Node built-ins plus the repo's shared SQL lexer only.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments, parseFunctions } from "./wiki-lint-checks.mjs";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "db",
  "migrations",
);

const EXECUTOR_IDENTITY = "execute_rule_post(uuid,text)";

// MUST match packages/db/deploy/vendor-binding-executor-0029-postverify.sql's
// own gate string after comment stripping, lower-casing, and whitespace folding.
const BINDING_GATE =
  "v_binding_live:=b.status='live' and b.expires_at>now();";

function normalizeBody(body) {
  return maskComments(body).replace(/\s+/g, " ").toLowerCase();
}

function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  let current = null;
  let definitions = 0;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const fn of parseFunctions(sql)) {
      if (fn.identity !== EXECUTOR_IDENTITY) continue;
      current = { file, line: fn.line, body: fn.body };
      definitions += 1;
    }
  }

  if (current === null) {
    console.error(
      "binding-post-control: FAIL — no static "
        + "clara.execute_rule_post(uuid,text) definition exists in the migration tree.",
    );
    return 1;
  }

  if (!normalizeBody(current.body).includes(BINDING_GATE)) {
    console.error(
      "binding-post-control: FAIL — the current execute_rule_post(uuid,text) "
        + `definition (${current.file}:${current.line}) lacks migration 0029's `
        + "binding live/unexpired gate.\n\n"
        + "A later CREATE OR REPLACE has dropped the post-time authority check "
        + "while the 0029 schema_migrations interlock would remain open. Carry "
        + "Slot C forward verbatim before merging the recut.",
    );
    return 1;
  }

  console.log(
    "binding-post-control: OK — "
      + `${definitions} execute_rule_post(uuid,text) definition(s) scanned; `
      + `current body ${current.file}:${current.line} retains the 0029 `
      + "binding live/unexpired gate.",
  );
  return 0;
}

process.exit(main());
