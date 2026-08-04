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
// THE ONE EXEMPTION — A CENSUS READ IS NOT A PATCH SITE (0042 `$s5_24$`). The gate
// exists to keep PATCH targets attributable, and a patch site is a function body
// that is read, rewritten and `execute`d back. The same builtin is also used as a
// pure catalog PREDICATE — `select count(*) into v_n from pg_proc p where
// (coalesce(p.prosrc,'')||coalesce(pg_get_functiondef(p.oid),'')) like '%…%'`, the
// consumer census every 0042 splice runs on itself. That value is consumed by an
// aggregate and lands in an int; no DDL can be built from it, and demanding a
// signature binding for it is demanding attribution for a read that patches nothing.
// `parseCoRPatches` marks a `pg_get_functiondef` call `censusOnly` when, and ONLY
// when, its enclosing statement matches that STRICT GRAMMAR exactly — see the
// "CENSUS READS" header in wiki-lint-checks.mjs for the whole rule and for the five
// evasion shapes that retired the earlier value-flow analysis. Every other shape
// fails closed, exactly as before the exemption existed.
//
// AND THE EXEMPTION SET IS ALLOWLISTED, TREE-WIDE. A grammar that is right is still
// not a licence to grow the hole: this checker refuses unless the exemptions the
// tree produces are EXACTLY the ones named in CENSUS_EXEMPTION_ALLOWLIST below —
// no extra, none missing. EVERY GRANTED EXEMPTION IS PRINTED on success; a silent
// exemption is invisible policy, and the merge gate reads this output.
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

// ---------------------------------------------------------------------------
// THE CENSUS-EXEMPTION ALLOWLIST — the complete, named list of every place in the
// migration tree where an unattributed pg_get_functiondef call is tolerated.
//
// ADDING AN ENTRY HERE IS A REVIEW EVENT. It widens the only hole in a fail-closed
// security gate, and the diff must say why in the PR that adds it. Removing the
// census the entry names is equally a diff here: the match is EXACT in both
// directions, so a stale entry fails the gate rather than silently permitting a
// future exemption to take its place.
// ---------------------------------------------------------------------------
const CENSUS_EXEMPTION_ALLOWLIST = [
  { migration: "0042_wave_d_b0_shared_authorities", block: "$s5_24$", variable: "v_n" },
];

const exemptionKey = (e) => `${e.migration}/${e.block}/${e.variable}`;

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
 * the exact certification logic without writing a fake migration into the tree.
 * `allowlist` defaults to the tree's own; the self-test injects its own so its
 * synthetic fixtures never widen the real one. */
export function checkBindingPostControlSources(
  sources,
  { allowlist = CENSUS_EXEMPTION_ALLOWLIST } = {},
) {
  let current = null;
  let definitions = 0;
  const dynamicRecuts = [];
  const unresolvedRecuts = [];
  const exemptions = [];

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
        // A `null` target is unattributed UNLESS it is a proven census read (see the header).
        const unattributed = patch.targets
          .some((t, i) => t === null && !(patch.censusOnly ?? [])[i]);
        if (unattributed) {
          unresolvedRecuts.push(`${file}:${patch.line}`);
        }
        if (patch.targets.includes(EXECUTOR_IDENTITY)) {
          dynamicRecuts.push(`${file}:${patch.line}`);
        }
        for (const read of patch.censusReads ?? []) {
          const block = patch.tag ?? "do $$";
          exemptions.push({
            migration: file.replace(/\.sql$/, ""),
            block,
            variable: read.variable,
            text:
              `  EXEMPT  ${file}:${read.line}  block ${block} `
              + `(opens ${file}:${patch.line})  pg_get_functiondef bound to `
              + `${read.variable}  — census grammar (catalog count, not a patch site)`,
          });
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

  // THE TREE-WIDE EXEMPTION INVARIANT. The grammar decides what CAN be exempt; this
  // decides what IS. Multiset equality against the allowlist, so an added census, a
  // moved one, and a removed one are all diffs a human has to make deliberately.
  const granted = exemptions.map(exemptionKey).sort();
  const expected = allowlist.map(exemptionKey).sort();
  if (granted.length !== expected.length
    || granted.some((k, i) => k !== expected[i])) {
    const count = (list, k) => list.filter((x) => x === k).length;
    const unexpected = [...new Set(granted)]
      .filter((k) => count(granted, k) > count(expected, k));
    const missing = [...new Set(expected)]
      .filter((k) => count(expected, k) > count(granted, k));
    return {
      ok: false,
      exemptions,
      message:
        "binding-post-control: FAIL — the census-read exemption set does not match "
        + "the allowlist.\n\n"
        + (unexpected.length > 0
          ? `UNEXPECTED exemption(s) — ${unexpected.length}:\n`
            + exemptions.filter((e) => unexpected.includes(exemptionKey(e)))
              .map((e) => e.text).join("\n") + "\n\n"
          : "")
        + (missing.length > 0
          ? `ALLOWLISTED but NOT GRANTED — ${missing.length}: ${missing.join(", ")}\n`
            + "(the census this entry names is gone, or no longer matches the grammar; "
            + "remove the entry in the same PR)\n\n"
          : "")
        + "Every unattributed pg_get_functiondef call is a potential patch site. A NEW "
        + "one is a review event: prove it is a catalog census, then name it in "
        + "CENSUS_EXEMPTION_ALLOWLIST in this file.",
    };
  }

  return {
    ok: true,
    exemptions,
    message:
      "binding-post-control: OK — "
      + `${definitions} execute_rule_post(uuid,text) definition(s) scanned; `
      + `current body ${current.file}:${current.line} retains the 0029 `
      + "binding live/unexpired assignment -> refusal-use -> approve-call order, "
      + "with no post-0029 dynamic executor recut."
      + (exemptions.length === 0
        ? "\n  0 census-read exemption(s) granted (the allowlist is empty too)."
        : `\n  ${exemptions.length} census-read exemption(s) granted — every one allowlisted, `
          + "every one printed:\n"
          + exemptions.map((e) => e.text).join("\n")),
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
