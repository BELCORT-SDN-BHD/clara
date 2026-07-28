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
// reachability. This scanner also cannot reconstruct the result of the repo's
// dynamic change-of-record pattern. It therefore FAILS CLOSED when any
// post-0029 migration dynamically targets execute_rule_post: a human must prove
// the gate survives or extend this checker before the migration may merge.
//
// SCOPE: every packages/db/migrations/*.sql file, in filename order.
// No dependencies — Node built-ins plus the repo's shared SQL lexer only.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  let current = null;
  let definitions = 0;
  const dynamicRecuts = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const functions = parseFunctions(sql);
    for (const fn of functions) {
      if (fn.identity !== EXECUTOR_IDENTITY) continue;
      current = { file, line: fn.line, body: fn.body };
      definitions += 1;
    }
    if (file > EXECUTOR_MIGRATION) {
      for (const patch of parseCoRPatches(sql, functions)) {
        if (!patch.targets.includes(EXECUTOR_IDENTITY)) continue;
        dynamicRecuts.push(`${file}:${patch.line}`);
      }
    }
  }

  if (dynamicRecuts.length > 0) {
    console.error(
      "binding-post-control: FAIL — post-0029 dynamic CoR patch(es) target "
        + `clara.${EXECUTOR_IDENTITY}: ${dynamicRecuts.join(", ")}.\n\n`
        + "Static function parsing cannot see the installed body. Prove Slot C "
        + "survives and update this checker before certifying the migration tree.",
    );
    return 1;
  }

  if (current === null) {
    console.error(
      "binding-post-control: FAIL — no static "
        + "clara.execute_rule_post(uuid,text) definition exists in the migration tree.",
    );
    return 1;
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
    console.error(
      "binding-post-control: FAIL — the current execute_rule_post(uuid,text) "
        + `definition (${current.file}:${current.line}) lacks migration 0029's `
        + "binding live/unexpired assignment -> refusal-use -> approve-call "
        + "source order.\n\n"
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
      + "binding live/unexpired assignment -> refusal-use -> approve-call order, "
      + "with no post-0029 dynamic executor recut.",
  );
  return 0;
}

process.exit(main());
