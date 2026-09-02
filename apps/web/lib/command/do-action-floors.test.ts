// 裁-141 — THE DRIFT GUARD. Every transcribed floor in the ⌘K "Do" catalog, read back against the
// LIVE source it was transcribed from, printed, and red when they disagree.
//
// WHY THE RULING REQUIRED IT. 裁-141 upheld the shipped shape — the palette pre-filters on the
// DB-computed `role_rank` against each door's transcribed floor, the door remains the only
// authority, no new DB mechanism — and attached this guard, because the pre-filter is built
// entirely out of TRANSCRIPTIONS and a transcribed floor is a projection of the door, not the
// door (review law 3).
//
// WHAT DRIFT COSTS, so the bar is legible. Nothing here is a security wall: the door's own
// `_human_ctx` refuses regardless and the DB stays correct through every drift. What breaks is
// HONESTY. Raise `begin_client_onboarding` to owner and the palette keeps offering it to admins,
// who meet a CLR04 on a row that looked available — "never a fake control" broken by a migration
// in another package, with nothing in this repo going red. Lower a floor and the opposite: an act
// the caller may now perform stays invisible.
//
// ============================================================================================
// THE INSTRUMENT, AND WHY IT IS THE SHARED ONE
// ============================================================================================
// `semanticFunctionOperations` (`test/sqlFunctionCensus.ts`) walks every migration in order and
// returns each define/drop of a named function with its EVALUATED definition — dynamic `EXECUTE`
// splices rendered, not skipped. `lib/members/members-doors.test.ts:103-106` already uses it for
// exactly this question, so this file reuses it rather than hand-rolling a second regex census
// (the no-second-implementation law).
//
// THE PREFIX HAZARD THE REVIEW NAMED IS PROVEN ABSENT, NOT ASSUMED. A `create function
// clara.<name>(` regex without a word boundary reports a false CoR: 0156 defines
// `get_coa_template_adoption`, which a prefix match reads as a replacement of 0150's
// `get_coa_template`. `THE INSTRUMENT WORKS` below drives that exact pair through the census and
// asserts each resolves to its OWN single definer in its OWN migration. A guard is judgement
// logic and its own instrument — it gets a positive control before it is trusted.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DO_ACTIONS, type DoActionSpec, type FloorSource } from "./do-actions";
import { FIRM_ROLES, type FirmRole } from "@/lib/identity/caller-context";
import { semanticFunctionOperations } from "../../test/sqlFunctionCensus";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "packages", "db", "migrations");
/** A checked-in migration whose `begin_client_onboarding` floors somewhere else. It exists so a
 *  cell can prove this file reads THE BODY rather than a second copy of the catalog — see
 *  `THE GUARD READS THE SOURCE` below. */
const DRIFT_FIXTURE_DIR = join(WEB_ROOT, "test", "fixtures", "floor-drift");

type Creator = { file: string; definition: string; offset: number };

/** Every surviving DEFINE of `clara.<fn>`, in migration order. A later DROP clears the list, so
 *  "exactly one creator" is a claim about what is LIVE, not about how many times the name ever
 *  appeared. `offset` is carried because two doors in ONE migration can floor on byte-identical
 *  text — see `lineNumberOf`. */
function creators(fn: string, dir = MIGRATIONS_DIR): Creator[] {
  const out: Creator[] = [];
  for (const operation of semanticFunctionOperations(dir, fn)) {
    if (operation.kind === "drop") { out.length = 0; continue; }
    if (operation.definition !== null) {
      out.push({ file: operation.file, definition: operation.definition, offset: operation.offset });
    }
  }
  return out;
}

/** The `_human_ctx(role_rank('<role>'))` a `security definer` door floors its caller at, plus the
 *  LINE it was read from — printed, because an instrument that returns a verdict over something a
 *  human could read must show the thing it read (the PRINT-THE-THING law). */
function sqlFloor(definition: string): { role: FirmRole | null; line: string | null } {
  const match = /^.*_human_ctx\s*\(\s*(?:clara\.)?role_rank\s*\(\s*'([a-z_]+)'\s*\).*$/im.exec(definition);
  if (match === null) return { role: null, line: null };
  const role = match[1];
  const admitted = role !== undefined && (FIRM_ROLES as readonly string[]).includes(role);
  return { role: admitted ? (role as FirmRole) : null, line: match[0].trim() };
}

/**
 * The 1-based line of `needle` in `file`, searched FROM the body's own offset.
 *
 * THE SEARCH START IS LOAD-BEARING, and its absence was a defect in this very file's first cut —
 * the same citation-drift class the review raised against the PR body. `begin_client_onboarding`
 * and `bootstrap_client_plan` both live in `0017_wave_b.sql` and both floor with the
 * byte-identical line `c:=clara._human_ctx(clara.role_rank('admin'));`, so a whole-file
 * `indexOf` printed 0017:2497 for BOTH — a citation pointing at the other door's body. Starting
 * at the definition's own offset makes the printed line the one actually read.
 *
 * Null when the text is not present verbatim at all: a dynamically spliced body is evaluated SQL
 * with no line of its own, and that is reported rather than guessed at.
 */
function lineNumberOf(file: string, needle: string, from: number, dir = MIGRATIONS_DIR): number | null {
  const source = readFileSync(join(dir, file), "utf8");
  const index = source.indexOf(needle, from);
  if (index < 0) return null;
  return source.slice(0, index).split("\n").length;
}

/**
 * The role a runtime route floors its caller at.
 *
 * TWO HOPS, both read, because either alone is a projection. First: the NAMED route's own handler
 * must actually call the guard — a file that merely defines `isBookkeeperPlus` proves nothing
 * about the route that matters, and this file registers it on two different routes. Second: the
 * guard's own body must compare against a rank constant, and that constant's VALUE decides the
 * role — so renaming the helper without moving its threshold, or moving the threshold without
 * renaming it, both surface.
 */
function routeFloor(source: string, route: string, guard: string): { role: FirmRole | null; line: string | null } {
  const handlerStart = source.indexOf(`"${route}"`);
  if (handlerStart < 0) return { role: null, line: null };
  const nextRoute = source.indexOf("router.", handlerStart + route.length);
  const handler = source.slice(handlerStart, nextRoute < 0 ? source.length : nextRoute);
  const call = new RegExp(`^.*\\b${guard}\\s*\\(.*$`, "m").exec(handler);
  if (call === null) return { role: null, line: null };

  const rankConst = new RegExp(`const\\s+${guard}\\s*=\\s*\\([^)]*\\)\\s*:\\s*boolean\\s*=>[^;]*>=\\s*([A-Z_][A-Z0-9_]*)`).exec(source);
  const constName = rankConst?.[1];
  if (constName === undefined) return { role: null, line: call[0].trim() };
  const rankValue = new RegExp(`const\\s+${constName}\\s*=\\s*(\\d+)`).exec(source);
  if (!rankValue) return { role: null, line: call[0].trim() };
  // The ladder the route mirrors is `clara.role_rank`'s, which is FIRM_ROLES' own index order.
  return { role: FIRM_ROLES[Number(rankValue[1])] ?? null, line: call[0].trim() };
}

type Resolved = { floor: FirmRole | null; where: string; line: string | null };

function resolveLiveFloor(source: FloorSource, dir = MIGRATIONS_DIR): Resolved {
  if (source.kind === "sql") {
    const found = creators(source.fn, dir);
    if (found.length !== 1) {
      return { floor: null, where: `clara.${source.fn} — ${found.length} live creators (expected exactly 1)`, line: null };
    }
    const { file, definition, offset } = found[0]!;
    const { role, line } = sqlFloor(definition);
    const at = line === null ? null : lineNumberOf(file, line, offset, dir);
    return { floor: role, where: `${file}${at === null ? "" : `:${at}`} · clara.${source.fn}`, line };
  }
  const text = readFileSync(join(REPO_ROOT, source.file), "utf8");
  const { role, line } = routeFloor(text, source.route, source.guard);
  const at = line === null ? null : text.slice(0, text.indexOf(line)).split("\n").length;
  return { floor: role, where: `${source.file}${at === null ? "" : `:${at}`} · ${source.route}`, line };
}

test("裁-141 · every transcribed Do floor still matches the LIVE door it was read from", () => {
  const rows = (DO_ACTIONS as readonly DoActionSpec[]).map((spec) => ({
    id: spec.id,
    transcribed: spec.floor,
    ...resolveLiveFloor(spec.floorSource),
  }));

  // PRINT THE THING: the door, the transcribed value, the resolved value AND the line read. A
  // reader of a failure must not have to re-run this to learn what the source said.
  for (const row of rows) {
    console.log(`  ${row.id}: transcribed=${row.transcribed} live=${row.floor ?? "NONE"}  <- ${row.where}`);
    console.log(`      read: ${row.line ?? "(no floor line found)"}`);
  }

  // A null live floor is a FINDING, asserted BEFORE the comparison — otherwise a broken extractor
  // returning null everywhere would fail for the wrong reason, or (if a transcription were ever
  // null) pass vacuously.
  assert.deepEqual(
    rows.filter((r) => r.floor === null).map((r) => `${r.id} <- ${r.where}`),
    [],
    "every action's live floor must be POSITIVELY read; a source that yields none is drift too",
  );

  assert.deepEqual(
    rows.filter((r) => r.floor !== r.transcribed).map((r) => `${r.id}: catalog says ${r.transcribed}, ${r.where} says ${r.floor} — read: ${r.line}`),
    [],
    "a transcribed floor is a projection of the door — when they disagree, the palette is offering the wrong rows",
  );
});

test("裁-141 · exactly ONE live creator per SQL door, with exact names (no false CoR)", () => {
  const sqlDoors = (DO_ACTIONS as readonly DoActionSpec[])
    .map((s) => s.floorSource)
    .filter((s): s is Extract<FloorSource, { kind: "sql" }> => s.kind === "sql");
  assert.ok(sqlDoors.length > 0, "at least one action floors on a SQL door");

  for (const source of sqlDoors) {
    const found = creators(source.fn);
    console.log(`  clara.${source.fn}: ${found.length} live creator(s) — ${found.map((c) => c.file).join(", ") || "(none)"}`);
    assert.equal(
      found.length,
      1,
      `clara.${source.fn} must have exactly one LIVE creator; ${found.length} means a CREATE OR REPLACE this catalog has not read`,
    );
  }
});

test("裁-141 · the runtime route's floor is read from the ROUTE that carries it, not the file", () => {
  // `interviewRoutes.ts` registers `isBookkeeperPlus` on TWO routes (client/start and answer), so
  // "the file mentions the guard" is not evidence about the route this catalog dispatches. The
  // resolver slices the named handler; this drives that directly.
  const text = readFileSync(join(REPO_ROOT, "packages", "runtime", "src", "interviewRoutes.ts"), "utf8");
  const start = routeFloor(text, "/api/interview/client/start", "isBookkeeperPlus");
  console.log(`  /api/interview/client/start -> ${start.role}  read: ${start.line}`);
  assert.equal(start.role, "bookkeeper");
  assert.match(start.line ?? "", /isBookkeeperPlus\(p\.role\)/);

  // A route that does NOT carry the guard resolves to nothing rather than borrowing the file's.
  assert.deepEqual(
    routeFloor(text, "/api/interview/state", "isBookkeeperPlus"),
    { role: null, line: null },
    "a route with no floor call must not inherit one from elsewhere in the file",
  );
});

test("THE GUARD READS THE SOURCE — a fixture whose floor differs resolves to the FIXTURE's floor", () => {
  // THE CONTROL THAT SEPARATES A DRIFT GUARD FROM A SELF-CONSISTENCY CHECK. Everything above
  // compares the catalog to the real migrations, and would look identical if this file secretly
  // read the catalog twice. Pointing the SAME resolver at a checked-in migration whose
  // `begin_client_onboarding` floors at `owner` must yield `owner` — which only a resolver that
  // actually parses the body can do.
  const resolved = resolveLiveFloor({ kind: "sql", fn: "begin_client_onboarding" }, DRIFT_FIXTURE_DIR);
  console.log(`  fixture -> ${resolved.floor}  <- ${resolved.where}`);
  console.log(`      read: ${resolved.line}`);
  assert.equal(resolved.floor, "owner", "the fixture's own floor, not the catalog's `admin`");
  assert.match(resolved.line ?? "", /role_rank\('owner'\)/);
  assert.notEqual(
    resolved.floor,
    (DO_ACTIONS as readonly DoActionSpec[]).find((s) => s.id === "beginClientOnboarding")?.floor,
    "and it differs from the transcription, so a catalog-reading impostor could not produce it",
  );
});

test("裁-141 · the guard is TOTAL over the catalog — no action can ship without a source", () => {
  // The type already requires `floorSource`, but a type is not a cell: this asserts a fourth
  // action added tomorrow is checked by somebody, and pins the two source kinds so a third
  // arrives with its own resolver rather than falling silently through one of these.
  assert.ok(DO_ACTIONS.length > 0);
  for (const spec of DO_ACTIONS as readonly DoActionSpec[]) {
    assert.ok(spec.floorSource, `${spec.id} declares where its floor came from`);
    assert.ok(
      spec.floorSource.kind === "sql" || spec.floorSource.kind === "runtimeRoute",
      `${spec.id}'s source kind has a resolver in this file`,
    );
  }
});

test("THE INSTRUMENT WORKS — positive controls, including the prefix hazard the review named", () => {
  // THE FALSE-CoR HAZARD, driven rather than asserted. A `create function clara.get_coa_template(`
  // match without a word boundary reads 0156's `get_coa_template_adoption` as a replacement of
  // 0150's `get_coa_template`, and this guard's "exactly one creator" claim would then be a lie
  // about a pair that genuinely has one each.
  const base = creators("get_coa_template");
  const adoption = creators("get_coa_template_adoption");
  console.log(`  get_coa_template: ${base.map((c) => c.file).join(", ")}`);
  console.log(`  get_coa_template_adoption: ${adoption.map((c) => c.file).join(", ")}`);
  assert.equal(base.length, 1, "get_coa_template has ONE creator — the adoption reader is not a replacement of it");
  assert.equal(adoption.length, 1);
  assert.notEqual(base[0]!.file, adoption[0]!.file, "and they are defined in different migrations");

  // The floor extractor, both directions.
  assert.equal(sqlFloor("begin\n  c:=clara._human_ctx(clara.role_rank('admin'));\n").role, "admin");
  assert.equal(sqlFloor("c := clara._human_ctx(clara.role_rank('bookkeeper'));").role, "bookkeeper");
  assert.equal(sqlFloor("begin\n  -- no floor at all\nend").role, null, "a body with no floor yields NONE, never a default");
  assert.equal(sqlFloor("c := clara._human_ctx(clara.role_rank('sorcerer'));").role, null, "a role outside the closed ladder is not admitted");
  assert.match(sqlFloor("  c:=clara._human_ctx(clara.role_rank('admin'));").line ?? "", /role_rank\('admin'\)/);
});
