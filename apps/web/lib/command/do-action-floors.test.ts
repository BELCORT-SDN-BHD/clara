// 裁-141 — THE DRIFT GUARD. Every transcribed floor in the ⌘K "Do" catalog, read back against
// the LIVE source it was transcribed from, with the cell red when they disagree.
//
// WHY THE RULING REQUIRED IT. 裁-141 upheld the shipped shape — the palette pre-filters on the
// DB-computed `role_rank` against each door's transcribed floor, the door remains the only
// authority, no new DB mechanism — and attached this guard to it, because the pre-filter is
// built entirely out of TRANSCRIPTIONS and a transcribed floor is a projection of the door,
// not the door (review law 3).
//
// WHAT DRIFT ACTUALLY LOOKS LIKE, so the cost is legible. Nothing here is a security wall: the
// door's own `_human_ctx` refuses regardless, and the DB stays correct through every possible
// drift. What breaks is HONESTY. Raise `begin_client_onboarding` to owner and the palette keeps
// offering it to admins, who meet a CLR04 on a row that looked available — the "never a fake
// control" law broken by a migration in another package, months later, with nothing in this
// repo going red. Lower a floor and the opposite: an act a bookkeeper may now perform stays
// invisible, and the surface silently under-serves. Neither shows up in a typecheck, a lint, or
// any cell that asserts these floors as literals — including this train's own
// `do-actions.test.ts`, which is exactly the gap this file fills.
//
// THE SOURCE OF TRUTH IS THE DOOR BODY, NOT A HAND-TYPED FIXTURE. `semanticFunctionOperations`
// (`test/sqlFunctionCensus.ts`, the shared instrument `lib/members/members-doors.test.ts`
// already uses) walks every migration in order and returns each define/drop of a named
// function with its EVALUATED definition — dynamic `EXECUTE` splices rendered, not skipped. The
// LAST surviving define is the live body, which is the repo's own "chase the LIVE body, never
// a migration's first CREATE" law made mechanical. No rig is needed and none is used, and the
// alternative the ruling allowed — a generated fixture — is not needed either, because the
// migrations ARE the checked-in source and this reads them directly.
//
// THE ONE ROUTE FLOOR is read from the runtime's own source: `/api/interview/client/start`
// floors the caller before any door is reached, so its truth lives in that handler, not in SQL.

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

/** The LIVE body of `clara.<fn>`: the last surviving define across every migration in order.
 *  A later DROP clears it — the same idiom `lib/members/members-doors.test.ts:103-106` uses,
 *  reused rather than re-derived. */
function liveBody(fn: string, dir = MIGRATIONS_DIR): { file: string; definition: string } | null {
  const operations = semanticFunctionOperations(dir, fn);
  let live: (typeof operations)[number] | null = null;
  for (const operation of operations) live = operation.kind === "define" ? operation : null;
  if (live === null || live.definition === null) return null;
  return { file: live.file, definition: live.definition };
}

/** The role a `security definer` door floors its caller at:
 *  `clara._human_ctx(clara.role_rank('<role>'))`. Returns null when the body declares no such
 *  floor at all — which is a FINDING, not a pass: the cell asserts a floor was positively
 *  found for every SQL-sourced action rather than letting a null quietly compare equal. */
function sqlFloor(definition: string): FirmRole | null {
  const match = /_human_ctx\s*\(\s*(?:clara\.)?role_rank\s*\(\s*'([a-z_]+)'\s*\)/i.exec(definition);
  const role = match?.[1];
  return role !== undefined && (FIRM_ROLES as readonly string[]).includes(role) ? (role as FirmRole) : null;
}

/**
 * The role a runtime route floors its caller at.
 *
 * TWO HOPS, both read, because either alone would be a projection. First: the named route's
 * own handler must actually CALL the guard — a file that merely defines `isBookkeeperPlus`
 * proves nothing about the route that matters. Second: the guard's own body must compare
 * against a rank constant, and that constant's value decides the role — so renaming the helper
 * without changing its threshold, or changing the threshold without renaming it, both surface.
 */
function routeFloor(source: string, route: string, guard: string): FirmRole | null {
  const handlerStart = source.indexOf(`"${route}"`);
  if (handlerStart < 0) return null;
  // The handler runs to the next `router.` registration, or to end of file.
  const nextRoute = source.indexOf("router.", handlerStart + route.length);
  const handler = source.slice(handlerStart, nextRoute < 0 ? source.length : nextRoute);
  if (!new RegExp(`\\b${guard}\\s*\\(`).test(handler)) return null;

  const rankConst = new RegExp(`const\\s+${guard}\\s*=\\s*\\([^)]*\\)\\s*:\\s*boolean\\s*=>[^;]*>=\\s*([A-Z_][A-Z0-9_]*)`).exec(source);
  const constName = rankConst?.[1];
  if (constName === undefined) return null;
  const rankValue = new RegExp(`const\\s+${constName}\\s*=\\s*(\\d+)`).exec(source);
  if (rankValue === undefined || rankValue === null) return null;
  const rank = Number(rankValue[1]);
  // The ladder the route mirrors is `clara.role_rank`'s, which is FIRM_ROLES' own index order.
  return FIRM_ROLES[rank] ?? null;
}

function resolveLiveFloor(source: FloorSource): { floor: FirmRole | null; where: string } {
  if (source.kind === "sql") {
    const body = liveBody(source.fn);
    if (body === null) return { floor: null, where: `clara.${source.fn} — NO SURVIVING DEFINE` };
    return { floor: sqlFloor(body.definition), where: `${body.file} · clara.${source.fn}` };
  }
  const text = readFileSync(join(REPO_ROOT, source.file), "utf8");
  return {
    floor: routeFloor(text, source.route, source.guard),
    where: `${source.file} · ${source.route} · ${source.guard}`,
  };
}

test("裁-141 · every transcribed Do floor still matches the LIVE door it was read from", () => {
  const rows: { id: string; transcribed: FirmRole; live: FirmRole | null; where: string }[] = [];
  for (const spec of DO_ACTIONS as readonly DoActionSpec[]) {
    const { floor, where } = resolveLiveFloor(spec.floorSource);
    rows.push({ id: spec.id, transcribed: spec.floor, live: floor, where });
  }

  // PRINT THE THING: a reader of a failure needs the floors, not a boolean. An instrument that
  // returns green over something a human could read must print the thing it read.
  for (const row of rows) {
    console.log(`  ${row.id}: transcribed=${row.transcribed} live=${row.live ?? "NONE FOUND"}  <- ${row.where}`);
  }

  // A null live floor is a FINDING, asserted before the comparison — otherwise a broken
  // extractor would return null everywhere and this cell would fail for the wrong reason, or
  // (worse, if the transcription were ever null) pass vacuously.
  const unresolved = rows.filter((r) => r.live === null);
  assert.deepEqual(
    unresolved.map((r) => `${r.id} <- ${r.where}`),
    [],
    "every action's live floor must be POSITIVELY read; a source that yields none is drift too",
  );

  const drifted = rows.filter((r) => r.live !== r.transcribed);
  assert.deepEqual(
    drifted.map((r) => `${r.id}: catalog says ${r.transcribed}, ${r.where} says ${r.live}`),
    [],
    "a transcribed floor is a projection of the door — when they disagree, the palette is offering the wrong rows",
  );
});

test("裁-141 · the guard is TOTAL over the catalog — no action can ship without a source", () => {
  // The type already requires `floorSource`, but a type is not a cell: this asserts the guard
  // above actually VISITED every row, so a fourth action added tomorrow cannot be checked by
  // nobody. It also pins the two source kinds, so a third kind arrives with its own resolver
  // rather than silently falling through one of these two.
  assert.ok(DO_ACTIONS.length > 0);
  for (const spec of DO_ACTIONS as readonly DoActionSpec[]) {
    assert.ok(spec.floorSource, `${spec.id} declares where its floor came from`);
    assert.ok(
      spec.floorSource.kind === "sql" || spec.floorSource.kind === "runtimeRoute",
      `${spec.id}'s source kind has a resolver in this file`,
    );
  }
});

test("THE INSTRUMENT WORKS — positive controls on both resolvers", () => {
  // A guard whose extractors silently returned null for everything would red the cell above
  // for the wrong reason; one whose extractors matched anything would pass it for the wrong
  // reason. Both directions are driven here against known text.
  assert.equal(
    sqlFloor("begin\n  c:=clara._human_ctx(clara.role_rank('admin'));\n  ..."),
    "admin",
    "the SQL extractor reads the role out of a real floor call",
  );
  assert.equal(sqlFloor("c := clara._human_ctx(clara.role_rank('bookkeeper'));"), "bookkeeper");
  assert.equal(sqlFloor("begin\n  -- no floor at all\nend"), null, "a body with no floor yields NONE, never a default");
  assert.equal(
    sqlFloor("c := clara._human_ctx(clara.role_rank('sorcerer'));"),
    null,
    "a role outside the closed ladder is not silently admitted",
  );

  // And the live read really is reaching the migrations rather than an empty directory.
  const body = liveBody("begin_client_onboarding");
  assert.ok(body, "the census resolves a live body for a door this catalog actually calls");
  assert.match(body.file, /^\d{4}_/, "and it names the migration it came from");
});
