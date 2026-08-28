// queueKindCatalog tests (wave-b dashboard-lanes-plan §3.6 / F2). Two layers:
//   1. DB-free completeness + degrade checks — always run.
//   2. A DB-backed parity probe: diffs pg_get_functiondef('clara.list_review_queue')
//      on a migrated rig against the catalog's keys. Self-skips (passes trivially)
//      without CLARA_RIG_DB=1 — the wave-b-interview-plan-db.test.mjs `if (skip)
//      return;` idiom, not the node:test `skip` option, so a missing rig reads as
//      "not run" rather than a reported pass/fail either way being ambiguous.
//
// The probe shells out to `psql` (no new npm dependency — apps/dashboard has no
// `pg` client and this lane may not touch package.json/pnpm install) rather than a
// driver import.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QUEUE_KIND_CATALOG, QUEUE_KIND_KEYS, catalogEntryFor, degradeTitle, FallbackDetail,
  UNKNOWN_KIND_FIXTURE, type QueueDetailProps,
} from "./queueKindCatalog";

// --- DB-free completeness --------------------------------------------------------

test("every catalog entry's own key matches its fixture's row_kind", () => {
  for (const key of QUEUE_KIND_KEYS) {
    const entry = QUEUE_KIND_CATALOG[key];
    assert.ok(entry, `catalog is missing an entry for ${key}`);
    assert.equal(entry!.row_kind, key);
    assert.equal(entry!.fixture.row_kind, key, `${key}'s fixture must carry its own row_kind`);
  }
});

test("every catalog entry's title is a non-empty string for its own fixture", () => {
  for (const key of QUEUE_KIND_KEYS) {
    const entry = QUEUE_KIND_CATALOG[key]!;
    const title = entry.title(entry.fixture);
    assert.equal(typeof title, "string");
    assert.ok(title.length > 0, `${key}'s title must be non-empty`);
  }
});

test("the known row_kind set matches 0011 + 0016 + 0017 + 0041 + 0042 + 裁-17 exactly", () => {
  assert.deepEqual([...QUEUE_KIND_KEYS].sort(), [
    "coding_task", "compliance_watch", "draft", "fixed_asset_incomplete", "lint_finding",
    "open_question", "seeding_proposal", "staff_advance_incomplete", "uncoded_filing",
  ]);
});

test("every catalog Detail renders without throwing, given its own fixture", () => {
  const props: Omit<QueueDetailProps, "row"> = { token: "jwt", compliance: null, onChanged: () => {} };
  for (const key of QUEUE_KIND_KEYS) {
    const entry = QUEUE_KIND_CATALOG[key]!;
    assert.doesNotThrow(
      () => renderToStaticMarkup(createElement(entry.Detail, { ...props, row: entry.fixture })),
      `${key}'s Detail must not throw on its own fixture`,
    );
  }
});

// --- the unknown-kind degrade path ------------------------------------------------

test("an unrecognised row_kind is NOT a catalog key", () => {
  assert.equal(UNKNOWN_KIND_FIXTURE.row_kind in QUEUE_KIND_CATALOG, false);
  assert.equal(catalogEntryFor(UNKNOWN_KIND_FIXTURE.row_kind), null);
});

test("degradeTitle gives an honest id-only label for the unknown-kind fixture", () => {
  assert.equal(degradeTitle(UNKNOWN_KIND_FIXTURE), `future_unknown_kind · ${UNKNOWN_KIND_FIXTURE.id.slice(0, 8)}`);
});

test("FallbackDetail renders the same honest panel for an unrecognised row_kind, never a crash", () => {
  const html = renderToStaticMarkup(createElement(FallbackDetail, {
    token: "jwt", row: UNKNOWN_KIND_FIXTURE, compliance: null, onChanged: () => {},
  }));
  assert.ok(html.includes("future unknown kind"));
  assert.ok(html.includes("no inline detail surface yet"));
});

test("catalogEntryFor degrades to null for any non-key string, including prototype-polluting keys", () => {
  assert.equal(catalogEntryFor(""), null);
  assert.equal(catalogEntryFor("__proto__"), null);
  assert.equal(catalogEntryFor("constructor"), null);
  assert.equal(catalogEntryFor("toString"), null);
  assert.equal(catalogEntryFor("hasOwnProperty"), null);
});

// --- DB-backed parity probe (self-skips without CLARA_RIG_DB=1) ------------------

const RIG = process.env.CLARA_RIG_DB === "1";

function psqlBin(): string {
  if (process.env.CLARA_PSQL_BIN) return process.env.CLARA_PSQL_BIN;
  if (process.platform === "win32") {
    const p = "C:/Users/zhant/pgsql-17/pgsql/bin/psql.exe";
    if (existsSync(p)) return p;
  }
  // F-H8(a): non-win32 (CI ubuntu, where CLARA_RIG_DB=1 is set) resolves `psql` from PATH.
  return "psql";
}

function pgEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGHOST: process.env.PGHOST || "localhost",
    PGPORT: process.env.PGPORT || "55443",
    PGUSER: process.env.PGUSER || "postgres",
    PGDATABASE: process.env.PGDATABASE || "clara_ci",
  };
}

function functionDef(signature: string): string {
  return execFileSync(
    psqlBin(),
    ["-X", "--no-psqlrc", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", `select pg_get_functiondef('${signature}'::regprocedure);`],
    { env: pgEnv(), encoding: "utf8" },
  );
}

/** Parse the row-CTE STRING-LITERAL projections. The idiom is `'<kind>'::text row_kind`;
 *  we also accept an optional `AS` and the `cast('<kind>' as text)` spelling so a literal
 *  written those ways is still READ (never vanishes). ALL matches are returned (dups kept)
 *  so the count can be compared against the total projection-site count below. */
function parseRowKindLiterals(def: string): string[] {
  const out: string[] = [];
  const reCast = /'([a-z_]+)'::text\s+(?:as\s+)?row_kind\b/gi;
  const reFn = /cast\(\s*'([a-z_]+)'\s+as\s+text\s*\)\s+(?:as\s+)?row_kind\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reCast.exec(def)) !== null) out.push(m[1]!);
  while ((m = reFn.exec(def)) !== null) out.push(m[1]!);
  return out;
}

/** Count EVERY place `row_kind` is used as an OUTPUT COLUMN ALIAS (a projection), excluding
 *  the reference forms (`p.row_kind` qualified, `'row_kind'` a jsonb key, `row_kind=` a
 *  filter). A projection alias is `row_kind` not preceded by `.`/`'`/word-char and not
 *  followed by `=`. Fail-closed: if this exceeds the parsed-literal count, some kind is
 *  emitted via a form the literal parser can't read (AS/CAST/computed expr) and would
 *  VANISH from the probe — the test must FAIL, not silently pass. */
function countRowKindProjections(def: string): number {
  return (def.match(/(?<![.'\w])row_kind\b(?!\s*=)/gi) ?? []).length;
}

test("[rig] every row_kind the DEPLOYED list_review_queue emits is a catalog key, and no projection is unparsed", () => {
  if (!RIG) return; // self-skip: no throwaway PG17 rig configured (CLARA_RIG_DB!=1)
  const def = functionDef("clara.list_review_queue(jsonb,jsonb,integer)");
  const parsed = parseRowKindLiterals(def);
  assert.ok(parsed.length > 0, "the extraction regex found nothing — the row-CTE idiom may have changed; this probe would silently pass empty otherwise");

  // Fail-closed: EVERY row_kind projection site must be a parsed string literal. A kind added
  // via `<expr> AS row_kind` / `cast(...) row_kind` / a computed expression would raise the
  // projection count above the parsed-literal count and trip this assertion instead of vanishing.
  const projections = countRowKindProjections(def);
  assert.equal(
    parsed.length,
    projections,
    `list_review_queue has ${projections} row_kind projection site(s) but only ${parsed.length} parsed as string literals — a kind expressed via AS/CAST/computed expr would vanish from this probe; tighten parseRowKindLiterals to cover the new form`,
  );

  for (const kind of new Set(parsed)) {
    assert.ok(catalogEntryFor(kind) !== null, `list_review_queue emits row_kind='${kind}' with no queueKindCatalog entry`);
  }
});
