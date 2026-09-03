// `./next-runtime-globals` FIRST — see firm-scope-surfaces.test.ts's own header for
// why: this file also imports lib/require-firm-scope.ts for its registries.
import "./next-runtime-globals";

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  SCOPE_ENTRANCES,
  SCOPE_EXEMPT_SURFACES,
  SCOPE_UNSCOPED_SURFACES,
} from "../lib/require-firm-scope";
import {
  LEAF,
  moduleLevelDeclarations,
  reachableCallsFrom,
  stripComments,
  type SourceUnit,
} from "../test/sourceOracle";

/**
 * THE FOURTH-ENTRANCE GAP (PROGRESS.md Known issues; precondition for #455).
 *
 * `firm-scope-surfaces.test.ts`'s census enumerates every `page`/`route` LEAF the
 * App Router serves — that is the whole of its `LEAF` regex. Two classes of
 * firm-scoped surface sit entirely outside that enumeration:
 *
 *  (a) A layout-ADJACENT special file — `template.tsx`, `default.tsx`,
 *      `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, and
 *      `layout.tsx` itself — runs in the SAME request as a leaf but is not a leaf,
 *      so it is invisible to a walk that only matches `LEAF`. A root
 *      `template.tsx` calling `loadCallerContext()` directly proves the point: it
 *      renders on every navigation, in every route group, and nothing before this
 *      file's cells notices it exists.
 *  (b) A `"use server"` Server Action export is not a file the App Router ROUTES
 *      to at all — no leaf, no special file, just an exported async function a
 *      client component calls directly. Zero exist today (measured below), which
 *      is exactly why this is a GATE gap rather than a live hole: #455 (members)
 *      and FS-4 (checkout) are exactly the trains that add mutating surfaces.
 *
 * FIRST-REVIEW FOLD (fresh-context read on #477): WALL 1 gained the
 * complement-of-LEAF tripwire and three more Next.js special-file names
 * (`forbidden`/`unauthorized`/`global-not-found`); WALL 2 gained a scan of every
 * top-level source directory (not just `app`/`lib`) and a second, narrower
 * tripwire for the INLINE `"use server"` directive form, which the primary cell
 * does not and cannot model.
 *
 * SECOND-REVIEW FOLD (F-8..F-10): the inline tripwire's exemption moved from
 * byte offset 0 to SHAPE (`inlineOccurrences()`) — offset 0 false-flagged the
 * ordinary case of a header comment preceding a legitimate module directive,
 * because `stripComments` blanks comments IN PLACE rather than deleting them.
 * `COLOCATED_MODULE_ROSTER` is pre-written for `#461`'s
 * `app/(entry)/auth/confirm/verify/handler.ts` (not yet on disk on this
 * branch — see the roster's own comment), every roster reason must now carry
 * the literal token `NOT A ROUTER FILE`, and the WALL 2 scan now covers
 * top-level FILES (`proxy.ts`, `next.config.ts`, …) as well as directories.
 *
 * Kept in its OWN file, not appended to `firm-scope-surfaces.test.ts`, because it
 * is a genuinely separate enumeration (a different walk, a different directive
 * scan) and the census file was already at the repo's soft size guideline.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(WEB_ROOT, "app");

const SOURCE_EXT = /\.(ts|tsx)$/;

/** Directories under `apps/web` this file never treats as application source:
 *  the shared dependency store, Next's own build output, the two deploy-target
 *  build outputs, VCS metadata, and the browser e2e harness (#461 adds `e2e/`).
 *  Deliberately a SHORT denylist rather than an allowlist of source dirs — a new
 *  top-level directory is scanned by DEFAULT, so it cannot create a fresh blind
 *  spot the way a hard-coded `app`+`lib` pair already did once (F-2). */
const SOURCE_DIR_EXCLUDES = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".git", "e2e"]);

function webRelative(abs: string): string {
  return relative(WEB_ROOT, abs).split(sep).join("/");
}

function basename(webRelativePath: string): string {
  return webRelativePath.slice(webRelativePath.lastIndexOf("/") + 1);
}

function readSource(webRelativePath: string): string {
  return readFileSync(join(WEB_ROOT, webRelativePath), "utf8");
}

function readSourceUnit(webRelativePath: string): SourceUnit {
  return { path: webRelativePath, code: readSource(webRelativePath) };
}

function walkSources(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkSources(abs, out);
    else if (entry.isFile() && SOURCE_EXT.test(entry.name)) out.push(abs);
  }
  return out;
}

/**
 * Every top-level entry under `webRoot` this file will scan for a Server
 * Action — every directory NOT in `SOURCE_DIR_EXCLUDES`, walked recursively,
 * AND every top-level `.ts`/`.tsx` FILE (F-10) — `proxy.ts` (the Routing
 * Middleware entry), `next.config.ts`, `open-next.config.ts`. A directory-only
 * walk left these invisible for a reason that has nothing to do with whether
 * one COULD carry a directive; chosen over a "deliberate, and here is why"
 * exemption because there is no such reason to write down.
 */
function topLevelSourceEntries(webRoot: string): string[] {
  const entries = readdirSync(webRoot, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !SOURCE_DIR_EXCLUDES.has(entry.name))
    .map((entry) => join(webRoot, entry.name));
  const files = entries
    .filter((entry) => entry.isFile() && SOURCE_EXT.test(entry.name))
    .map((entry) => join(webRoot, entry.name));
  return [...files, ...dirs.flatMap((dir) => walkSources(dir))];
}

/** Every `.ts`/`.tsx` file under `app/`, private (`_`-prefixed) folders excluded
 *  — those contribute no route and Next.js never treats a file inside one as a
 *  special file either, so a stray helper there is out of scope for both WALL 1
 *  cells below. */
function appSourceFiles(dir: string = APP_DIR, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue;
      appSourceFiles(abs, out);
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
      out.push(webRelative(abs));
    }
  }
  return out;
}

/** The registered entrance layouts, as the directories they cover — identical in
 *  shape to `firm-scope-surfaces.test.ts`'s own, kept separate rather than shared
 *  so importing this file can never re-register that suite (W-R-1's own reason for
 *  moving `LEAF` out of a test module in the first place). */
const ENTRANCE_LAYOUT_DIRS = SCOPE_ENTRANCES.filter((e) => e.path.endsWith("/layout.tsx")).map((e) =>
  e.path.slice(0, -"/layout.tsx".length),
);

function ancestorCovered(file: string): boolean {
  // No `isRouteLeaf` guard here, unlike the sibling census's own copy of this
  // function. There, the guard exists because `ancestorCovered` is called on
  // BOTH pages and route handlers, and a Route Handler renders no layout. Here,
  // `ancestorCovered` is only ever called on a SPECIAL_FILE — and LEAF (which is
  // where every route handler lives) and SPECIAL_FILE are regex-disjoint by
  // construction, pinned by the "MUST-NOT-RED CONTROL" cell below. A route
  // handler path can never reach this function in this file; do not "restore"
  // the guard, it would be dead code.
  const dir = file.slice(0, file.lastIndexOf("/"));
  return ENTRANCE_LAYOUT_DIRS.some((d) => dir === d || dir.startsWith(`${d}/`));
}

describe("WALL 1 — every layout-adjacent special file classifies, or this suite reds", () => {
  /** Every App-Router special file EXCEPT `page`/`route` (the census's own `LEAF`).
   *  `layout` is included: it is exactly as invisible to the LEAF walk as
   *  `template` is, and the estate's own measured roster today is five layouts
   *  plus the root `not-found.tsx` (see the VACUITY CONTROL below).
   *  `forbidden`/`unauthorized` (Next 15+'s `forbidden()`/`unauthorized()`
   *  file conventions, docs/01-app/03-api-reference/03-file-conventions) and
   *  `global-not-found` (root-only, replaces `app/global-error.tsx`'s sibling for
   *  the 404 case — it returns its own `<html>`/`<body>` and so, like
   *  `global-error`, can never be ancestor-covered) are folded in on the same
   *  review pass that added this comment — confirmed against the Next.js docs
   *  (Context7 `/vercel/next.js/v16.2.9`), not assumed from memory. */
  const SPECIAL_FILE =
    /^(layout|template|default|loading|error|global-error|not-found|forbidden|unauthorized|global-not-found)\.(ts|tsx|js|jsx)$/;

  /**
   * Non-route, non-special-file `.ts`/`.tsx` modules legitimately colocated under
   * `app/` (a helper, a local type file, a constants module) — the escape valve
   * the complement-of-LEAF tripwire below needs so ordinary code organization
   * does not have to fight it. Measured against `appSourceFiles()` today (before
   * #461 lands): contains only LEAF and SPECIAL_FILE members, so this roster is
   * still exercised at zero live entries by the cell below.
   *
   * PRE-WRITTEN AHEAD OF #461 (F-1b): #461's tree adds
   * `app/(entry)/auth/confirm/verify/handler.ts` — measured directly from that
   * PR's diff, not assumed — which is neither LEAF nor SPECIAL_FILE and will red
   * the tripwire below the moment this branch rebases onto post-#461 main. Every
   * reason here must contain the literal token `NOT A ROUTER FILE` (F-9): a
   * disguised real routing file rostered here to dodge the tripwire would have
   * to make that exact false claim rather than hide behind plausible prose.
   */
  const COLOCATED_MODULE_ROSTER: ReadonlyArray<{ readonly path: string; readonly reason: string }> = [
    {
      path: "app/(entry)/auth/recover/handler.ts",
      reason:
        "NOT A ROUTER FILE. This is the independently-testable PKCE exchange body " +
        "called by the sibling app/(entry)/auth/recover/route.ts GET export. It " +
        "exports no page, route, or HTTP-method surface; Next.js never routes to " +
        "it or auto-imports it. The route.ts leaf remains the real entrance governed " +
        "by the leaf census.",
    },
    {
      path: "app/(entry)/auth/confirm/verify/handler.ts",
      reason:
        "NOT A ROUTER FILE. This is the extracted POST-handler body for the sibling " +
        "app/(entry)/auth/confirm/verify/route.ts (#461, P4-3) — that route.ts is a " +
        "five-line file whose only export, POST, does nothing but call " +
        "handleEmailConfirmationPost from this module. handler.ts itself exports no " +
        "page/route/HTTP-method surface, its basename matches no LEAF or SPECIAL_FILE " +
        "pattern, and Next.js never routes to it, auto-imports it, or treats it as any " +
        "kind of special file — it exists purely so route.ts's own body stays small " +
        "and independently testable. `firm-scope-surfaces.test.ts`'s own census still " +
        "governs the real entrance: route.ts's POST export, not this helper.",
    },
    {
      path: "app/(entry)/auth/confirm/verify/confirmation-wall.ts",
      reason:
        "NOT A ROUTER FILE. This is the FS-4 C-6 seam for the C1/C2 " +
        "confirmation-attempt wall (checkout-gate-design-part3.md §2.1) — ONE typed " +
        "function export (`confirmEmailCode`) that `handler.ts` calls, and which " +
        "reaches C-5's single `POST /api/auth-wall/confirm` endpoint server-to-server. " +
        "Lane B collapsed the earlier claim/settle PAIR into this one call because a " +
        "caller that can settle an attempt can zero out the rate wall (A-M3). It " +
        "exports no page/route/HTTP-method surface, its basename matches no LEAF or " +
        "SPECIAL_FILE pattern, and Next.js never routes to it, auto-imports it, or " +
        "treats it as any kind of special file. Colocated with handler.ts for the " +
        "same reason handler.ts is colocated with route.ts: the real entrance " +
        "`firm-scope-surfaces.test.ts` governs is route.ts's POST export, which this " +
        "seam sits two calls behind.",
    },
    {
      path: "app/(entry)/auth/confirm/confirm-flash.ts",
      reason:
        "NOT A ROUTER FILE. This is the N1 fix's (裁-109) shared flash-cookie " +
        "module — typed exports (`confirmFlashCookie`, `confirmFlashMaxAgeSeconds`, " +
        "`parseConfirmFlash`) that both `verify/handler.ts` (the writer, on the POST " +
        "redirect) and the sibling `page.tsx` (the reader, on the GET) import. It " +
        "exports no page/route/HTTP-method surface, its basename matches no LEAF or " +
        "SPECIAL_FILE pattern, and Next.js never routes to it, auto-imports it, or " +
        "treats it as any kind of special file. Colocated one level above `verify/` " +
        "specifically so neither the POST writer nor the GET reader imports \"down\" " +
        "into the other's own directory — the real entrance `firm-scope-surfaces." +
        "test.ts` governs is `page.tsx`'s default export and route.ts's POST export, " +
        "neither of which this module is.",
    },
    {
      path: "app/(entry)/checkout/handler.ts",
      reason:
        "NOT A ROUTER FILE. FS-4 C-6 Lane B: the extracted body of `POST /checkout` " +
        "(checkout-gate-design part 1 §1.1's server entry 2 of 3), called by the " +
        "sibling app/(entry)/checkout/route.ts, whose only export is a POST that " +
        "forwards to `handleCheckoutPost`. It exports no page/route/HTTP-method " +
        "surface, its basename matches no LEAF or SPECIAL_FILE pattern, and Next.js " +
        "never routes to it, auto-imports it, or treats it as any kind of special " +
        "file — it exists so every refusal branch (cross-origin, no session, no open " +
        "registration, no origin digest, a door refusal, a plan rotation, Stripe " +
        "unavailable) is driven directly by a cell instead of only through a live " +
        "request scope. The real entrance `firm-scope-surfaces.test.ts` governs is " +
        "route.ts's POST export, and it is registered in `SCOPE_EXEMPT_SURFACES`.",
    },
    {
      path: "app/(entry)/checkout/success/claim/handler.ts",
      reason:
        "NOT A ROUTER FILE. FS-4 C-6 Lane B: the extracted body of " +
        "`POST /checkout/success/claim` (server entry 3 of 3 — the door that creates " +
        "the firm, 裁-89's folded `claim_paid_firm`), called by the sibling " +
        "route.ts, whose only export is a POST that forwards to " +
        "`handleClaimPaidFirmPost`. It exports no page/route/HTTP-method surface, " +
        "its basename matches no LEAF or SPECIAL_FILE pattern, and Next.js never " +
        "routes to it, auto-imports it, or treats it as any kind of special file. " +
        "Extracted for the same reason as its sibling above, and with more at stake: " +
        "this is the most consequential POST in the product, so every branch of it " +
        "is a cell. The real entrance is route.ts's POST export, registered in " +
        "`SCOPE_EXEMPT_SURFACES`.",
    },
  ];

  function classifyAppFile(file: string): "LEAF" | "SPECIAL_FILE" | "rostered colocated module" | "UNCLASSIFIED" {
    const name = basename(file);
    if (LEAF.test(name)) return "LEAF";
    if (SPECIAL_FILE.test(name)) return "SPECIAL_FILE";
    if (COLOCATED_MODULE_ROSTER.some((r) => r.path === file)) return "rostered colocated module";
    return "UNCLASSIFIED";
  }

  function specialFiles(): string[] {
    return appSourceFiles().filter((f) => SPECIAL_FILE.test(basename(f)));
  }

  /**
   * Special files that classify for a reason none of the three scope registries
   * (`require-firm-scope.ts`) or ancestor-coverage can express — kept HERE, in the
   * census, rather than in the product module, because these are facts about the
   * ROUTER TREE (e.g. a root boundary that by Next.js's own contract sits ABOVE
   * every layout and so can never be ancestor-covered), not about whether the
   * spine was called.
   *
   * Empty today: every existing special file classifies through an existing
   * registry or ancestor coverage (measured below). This exists for the day one
   * does not.
   */
  const SPECIAL_FILE_ROSTER: ReadonlyArray<{ readonly path: string; readonly reason: string }> = [];

  const OK_CLASSES = ["direct entrance", "proven exemption", "registered unscoped", "ancestor-covered", "rostered"];

  function classifySpecial(file: string): string {
    if (SCOPE_ENTRANCES.some((e) => e.path === file)) return "direct entrance";
    const exempt = SCOPE_EXEMPT_SURFACES.find((e) => e.path === file);
    if (exempt) return exempt.pending ? "PENDING exemption on a file that EXISTS" : "proven exemption";
    if (SCOPE_UNSCOPED_SURFACES.some((s) => s.path === file)) return "registered unscoped";
    if (ancestorCovered(file)) return "ancestor-covered";
    if (SPECIAL_FILE_ROSTER.some((s) => s.path === file)) return "rostered";
    return "UNCLASSIFIED";
  }

  const files = specialFiles();

  it("VACUITY CONTROL: the walk found the real special files", () => {
    assert.ok(files.length >= 6, `only ${files.length} special files found under ${APP_DIR}`);
    for (const expected of [
      "app/layout.tsx",
      "app/not-found.tsx",
      "app/(firm)/layout.tsx",
      "app/(full)/layout.tsx",
      "app/(firm)/clients/[clientId]/layout.tsx",
      "app/(full)/clients/[clientId]/layout.tsx",
    ]) {
      assert.ok(files.includes(expected), `the walk missed ${expected}`);
    }
  });

  it("MUST-NOT-RED CONTROL: the special-file walk never picks up a LEAF file", () => {
    // Proves the two walks are disjoint — an ordinary new registered page.tsx or
    // route.ts (the OTHER census's job) can never appear here, and so can never
    // redden this wall. Uses the imported LEAF itself, not a re-typed copy of the
    // regex, so the two can never drift apart silently.
    assert.ok(
      !files.some((f) => LEAF.test(basename(f))),
      "the special-file walk matched a page/route LEAF — SPECIAL_FILE has drifted onto LEAF's territory",
    );
  });

  it("EVERY special file classifies — an unclassified one is a fourth-entrance hole", () => {
    const unclassified = files.map((f) => ({ file: f, klass: classifySpecial(f) })).filter((f) => !OK_CLASSES.includes(f.klass));
    assert.deepEqual(
      unclassified.map((f) => `${f.file} → ${f.klass}`),
      [],
      "a layout-adjacent special file (layout/template/default/loading/error/global-error/not-found/" +
      "forbidden/unauthorized/global-not-found) is registered nowhere. Register it in " +
      "SCOPE_UNSCOPED_SURFACES or SCOPE_EXEMPT_SURFACES (apps/web/lib/require-firm-scope.ts) if it " +
      "legitimately does or does not call the spine, or in SCOPE_ENTRANCES if it IS a fourth entrance " +
      "calling requireFirmScope()/firmScopeGuard(); if none of those registries can express why, add a " +
      "reasoned entry to SPECIAL_FILE_ROSTER in THIS file. Do NOT: bump a count, allowlist the bare path " +
      "with no reason, or narrow the SPECIAL_FILE regex above — each of those retires this wall while " +
      "looking like housekeeping.",
    );
  });

  it("VACUITY CONTROL: an unregistered plant is caught", () => {
    // The demonstrated attack (a): a root `template.tsx` wrapping every route
    // group. Its directory is `app`, which is not under either entrance layout's
    // directory, so it cannot be ancestor-covered — exactly the gap this wall
    // closes. classifySpecial() needs no file on disk: it is a pure registry
    // lookup, so this cell is a permanent, always-on rerun of the RED this file's
    // PR body records having produced with the file actually planted.
    assert.equal(classifySpecial("app/template.tsx"), "UNCLASSIFIED");
    assert.equal(classifySpecial("app/(firm)/error.tsx"), "ancestor-covered");
    // A root boundary can never be ancestor-covered — it sits ABOVE every layout,
    // entrance layouts included — so a legitimate `global-not-found.tsx` would
    // have to be registered or rostered, not "found" by directory containment.
    assert.equal(classifySpecial("app/global-not-found.tsx"), "UNCLASSIFIED");
  });

  it("every SPECIAL_FILE_ROSTER entry carries a substantial reason and exists on disk", () => {
    for (const entry of SPECIAL_FILE_ROSTER) {
      assert.ok(existsSync(join(WEB_ROOT, entry.path)), `${entry.path} is rostered but does not exist`);
      assert.ok(entry.reason.length >= 80, `${entry.path}'s reason is too thin`);
    }
  });

  it("TRIPWIRE — every app/** source file is a LEAF, a special file, or a rostered colocated module", () => {
    // The derived COMPLEMENT of LEAF: every `.ts`/`.tsx` under `app/**` that is
    // not a route leaf. Widening SPECIAL_FILE (a NEW Next.js special-file name)
    // and adding a legitimate colocated helper (an ordinary module, never
    // routed) are the only two ways to grow this set without reddening it —
    // both require a deliberate, reviewed edit to THIS file.
    const unclassified = appSourceFiles().filter((f) => classifyAppFile(f) === "UNCLASSIFIED");
    assert.deepEqual(
      unclassified,
      [],
      "a file under app/** matches neither LEAF nor a known special-file name and is not a rostered " +
      "colocated module — it may be a Next.js special file this census does not yet recognize (widen " +
      "SPECIAL_FILE above, citing the Next.js docs) or a legitimate helper (add a reasoned " +
      "COLOCATED_MODULE_ROSTER entry in THIS file). Do NOT delete or skip this tripwire to clear it.",
    );
  });

  it("VACUITY CONTROL: the tripwire's classifier would catch an unrostered colocated file", () => {
    assert.equal(classifyAppFile("app/(firm)/clients/[clientId]/random-helper.ts"), "UNCLASSIFIED");
  });

  it("every COLOCATED_MODULE_ROSTER entry carries a substantial reason and exists on disk", () => {
    for (const entry of COLOCATED_MODULE_ROSTER) {
      assert.ok(existsSync(join(WEB_ROOT, entry.path)), `${entry.path} is rostered but does not exist`);
      assert.ok(entry.reason.length >= 80, `${entry.path}'s reason is too thin`);
      assert.match(
        entry.reason,
        /NOT A ROUTER FILE/,
        `${entry.path}'s reason must state NOT A ROUTER FILE verbatim (F-9) — an explicit, falsifiable ` +
        "claim a disguised real routing file would have to make outright, not plausible prose it could hide behind.",
      );
    }
  });
});

describe("WALL 2 — every \"use server\" MODULE calls the spine or is registered; an inline directive is refused, not missed", () => {
  // Duplicated locally rather than imported from firm-scope-surfaces.test.ts,
  // which is not designed to be imported — importing a test module re-registers
  // its `describe`/`it` blocks as a side effect (the exact reason W-R-1 moved
  // `LEAF` OUT of that file rather than exporting it in place).
  const SPINE_IMPORT = "@/lib/require-firm-scope";
  const SPINE_NAMES = new Set(["requireFirmScope", "firmScopeGuard", "resolveFirmScope"]);
  const isSpineCall = (call: ReturnType<typeof reachableCallsFrom>[number]): boolean =>
    call.importedFrom === SPINE_IMPORT && SPINE_NAMES.has(call.importedName ?? "");

  /**
   * A directive is a PARSE FACT, not a string (review law 3 — spelling is not
   * identity). `stripComments(src)` — the oracle's own, PLAIN, `{blankStrings:
   * true}` NOT passed — blanks real comments while leaving every string literal
   * (the directive included) intact. Measured on this machine against the
   * shipping `stripComments`: passing `{blankStrings: true}` blanks the directive
   * ITSELF, because a directive prologue IS a string literal, and every plant
   * below comes back not-red under it. The regex then requires the directive to be
   * the module's FIRST statement — anchored at the start of the (comment-blanked)
   * source, immediately followed by only whitespace and a statement terminator (a
   * `;`, a newline, or end of file) — so a same-spelled string sitting anywhere
   * else in the file, in directive POSITION or not, cannot match.
   */
  const USE_SERVER_DIRECTIVE = /^\s*(["'])use server\1(?=\s*[;\r\n]|\s*$)/;

  function hasUseServerDirective(rawCode: string, path = "plant.ts"): boolean {
    return USE_SERVER_DIRECTIVE.test(stripComments({ path, code: rawCode }).code);
  }

  function isUseServerModule(webRelativePath: string): boolean {
    return hasUseServerDirective(readSource(webRelativePath), webRelativePath);
  }

  function exportedNames(unit: SourceUnit): string[] {
    return moduleLevelDeclarations(unit).filter((d) => d.exported).map((d) => d.name);
  }

  /** Unlike a page/route root (always `default`, or the fixed HTTP-method names),
   *  a Server Action file's exports are arbitrary named functions — so every
   *  exported name is its own execution root, checked independently, exactly the
   *  surface-aware discipline `executionRoots()` already applies to route
   *  handlers in the sibling census. */
  function actionCallsSpine(webRelativePath: string): boolean {
    const unit = stripComments(readSourceUnit(webRelativePath));
    return exportedNames(unit).some((name) => reachableCallsFrom(unit, name).some(isSpineCall));
  }

  /**
   * Registered "use server" files that legitimately do NOT call the spine, each
   * with the reason — the census's own escape valve, exactly like
   * SPECIAL_FILE_ROSTER above. Empty today: zero "use server" files exist
   * (measured below).
   */
  const USE_SERVER_ACTION_ROSTER: ReadonlyArray<{ readonly path: string; readonly reason: string }> = [];

  /** F-2/F-10: every top-level source directory AND top-level source FILE under
   *  apps/web, not just app/+lib/ — the sibling census's own defect report named
   *  app/lib/COMPONENTS, and a hard-coded pair is exactly the kind of blind spot
   *  a NEW directory (or one this file's author simply forgot) reopens.
   *  `components/` alone holds four `*-actions.tsx` files this scan was blind to
   *  before this fold. */
  const scannedFiles = (): string[] => topLevelSourceEntries(WEB_ROOT).map(webRelative);

  const actionFiles = scannedFiles().filter(isUseServerModule);

  it("VACUITY CONTROL: zero \"use server\" files exist today (measured, not assumed)", () => {
    // grep -rn '"use server"' apps/web (excluding this file itself, which plants
    // the string deliberately, never at its own module's first statement — the
    // next describe block's positive controls prove this scan does not trip on
    // itself) returns nothing else. This is a GATE gap, not a live hole — #455
    // (members) and FS-4 (checkout) are exactly the trains that add the first one.
    assert.deepEqual(actionFiles, [], "a \"use server\" action now exists — the next cell governs it from here");
  });

  it("MUST-NOT-RED CONTROL: no registered surface is a \"use server\" module or carries an inline directive", () => {
    // DERIVED, not spelled — the exact defect class this PR exists to kill.
    // This control used to hard-code "app/login/page.tsx"; #461 moved that
    // file to app/(entry)/login/page.tsx and the spelled path went ENOENT on
    // the merged base. Every registered surface in the two registries is
    // checked instead: the registry moves with the tree (a path edit there IS
    // the fix for a file move), and each registry's own "exists on disk"
    // VACUITY CONTROL in the sibling census already guards against a stale
    // entry silently doing nothing here.
    let checked = 0;
    for (const path of [...SCOPE_UNSCOPED_SURFACES.map((s) => s.path), ...SCOPE_EXEMPT_SURFACES.map((s) => s.path)]) {
      if (!existsSync(join(WEB_ROOT, path))) continue;
      checked += 1;
      assert.equal(isUseServerModule(path), false, `${path} is registered but carries a "use server" directive`);
      const stripped = stripComments(readSourceUnit(path)).code;
      assert.deepEqual(inlineOccurrences(stripped), [], `${path} is registered but carries an inline "use server" directive`);
    }
    // Guards against the control going vacuously green if either registry
    // were ever emptied out from under it.
    assert.ok(checked > 0, "this control checked zero registered surfaces — it would be vacuously green");
  });

  it("every \"use server\" action calls the spine, or is registered with a written reason", () => {
    const unregistered = actionFiles
      .filter((f) => !actionCallsSpine(f))
      .filter((f) => !USE_SERVER_ACTION_ROSTER.some((r) => r.path === f));
    assert.deepEqual(
      unregistered,
      [],
      "a \"use server\" export reads or writes firm-scoped state with no reachable call to " +
      "requireFirmScope()/firmScopeGuard()/resolveFirmScope() and no registered reason — call the spine, or " +
      "add a reasoned USE_SERVER_ACTION_ROSTER entry in THIS file explaining why not. Do NOT: bump a count, " +
      "allowlist the bare path with no reason, or narrow the USE_SERVER_DIRECTIVE regex or the scanned " +
      "top-level-directory list above — each of those retires this wall while looking like housekeeping.",
    );
  });

  it("every USE_SERVER_ACTION_ROSTER entry carries a substantial reason and exists on disk", () => {
    for (const entry of USE_SERVER_ACTION_ROSTER) {
      assert.ok(existsSync(join(WEB_ROOT, entry.path)), `${entry.path} is rostered but does not exist`);
      assert.ok(entry.reason.length >= 80, `${entry.path}'s reason is too thin`);
    }
  });

  /**
   * F-3 — THE INLINE-DIRECTIVE TRIPWIRE. Next.js also accepts `"use server"` as
   * the first statement of a FUNCTION BODY (docs' own example: an inner
   * `saveAction` with "verify auth before saving" as its caption), marking just
   * that one closure as a Server Action — not the module's first statement at
   * all, so `hasUseServerDirective()`/`actionCallsSpine()` above never see it.
   * This wall does not attempt to prove such a closure calls the spine (that
   * would need a full statement-level parse of every function body in the
   * scanned tree); it refuses to let one exist unexamined instead.
   */
  const USE_SERVER_TEXT = /(["'])use server\1/g;

  /** Every position of a bare `"use server"`/`'use server'` string-literal
   *  STATEMENT in DIRECTIVE POSITION — the start of the file, or immediately
   *  (whitespace only) after a `{`, `}`, or `;`, which is what a function body's
   *  own first statement looks like once comments are blanked. */
  function directiveShapedOccurrences(strippedCode: string): number[] {
    const positions: number[] = [];
    let match: RegExpExecArray | null;
    USE_SERVER_TEXT.lastIndex = 0;
    while ((match = USE_SERVER_TEXT.exec(strippedCode)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const followedByTerminator = /^\s*(?:[;\r\n]|$)/.test(strippedCode.slice(end));
      const precededByBoundary = /(?:^|[{};])\s*$/.test(strippedCode.slice(0, start));
      if (followedByTerminator && precededByBoundary) positions.push(start);
    }
    return positions;
  }

  /**
   * F-8 FIX — exempt the module's OWN directive by SHAPE, not by byte offset 0.
   * `stripComments` blanks a real header comment IN PLACE (offsets preserved,
   * not deleted), so a file that opens with the header comment every file in
   * this repo carries lands its own legitimate directive at some position > 0,
   * not 0. Filtering `pos !== 0` (the FIRST cut of this wall) therefore flagged
   * the ordinary, house-style case as "inline" — measured: three false
   * positives, and the remedy text ("hoist it to a module") is not satisfiable
   * because it ALREADY IS one. The correct exemption is SHAPE: an occurrence is
   * the module's own leading directive, wherever it sits, exactly when nothing
   * but blanked comments and/or whitespace precedes it — `.trim() === ""` on
   * the prefix. Anything else preceding it (real code) means this occurrence is
   * genuinely nested inside some other statement, i.e. inline.
   */
  function inlineOccurrences(strippedCode: string): number[] {
    return directiveShapedOccurrences(strippedCode).filter((pos) => strippedCode.slice(0, pos).trim() !== "");
  }

  it("TRIPWIRE — an inline Server Action directive is not modelled by this wall, and reds", () => {
    const offenders = scannedFiles().filter((f) => {
      const stripped = stripComments(readSourceUnit(f)).code;
      return inlineOccurrences(stripped).length > 0;
    });
    assert.deepEqual(
      offenders,
      [],
      "an inline Server Action directive is not modelled by this wall; hoist it to a \"use server\" module, " +
      "or roster it.",
    );
  });

  describe("THE POSITIVE CONTROL — four plants, so this wall cannot be vacuously green forever", () => {
    it("a double-quoted directive IS caught", () => {
      assert.equal(hasUseServerDirective('"use server";\nexport async function act() { return null; }'), true);
    });

    it("a single-quoted directive IS caught", () => {
      assert.equal(hasUseServerDirective("'use server';\nexport async function act() { return null; }"), true);
    });

    it("the directive text inside a COMMENT is NOT caught", () => {
      assert.equal(hasUseServerDirective('// "use server"\nexport async function act() { return null; }'), false);
    });

    it("the directive text inside a STRING CONSTANT, not in directive position, is NOT caught", () => {
      assert.equal(hasUseServerDirective('export async function act() { return null; }\nconst x = "use server";'), false);
    });

    it("the full pipeline catches an unregistered planted action, and clears a genuinely guarded one", () => {
      const plantedNoSpine: SourceUnit = {
        path: "planted-action.ts",
        code: '"use server";\nexport async function readFirmData() { return {}; }',
      };
      assert.equal(hasUseServerDirective(plantedNoSpine.code, plantedNoSpine.path), true, "the plant's directive went undetected");
      const strippedPlant = stripComments(plantedNoSpine);
      assert.equal(
        exportedNames(strippedPlant).some((name) => reachableCallsFrom(strippedPlant, name).some(isSpineCall)),
        false,
        "the plant does not call the spine, and the scanner must say so",
      );

      const plantedGuarded: SourceUnit = {
        path: "planted-action-guarded.ts",
        code: [
          '"use server";',
          'import { requireFirmScope } from "@/lib/require-firm-scope";',
          "export async function readFirmData() {",
          "  await requireFirmScope();",
          "  return {};",
          "}",
        ].join("\n"),
      };
      const strippedGuarded = stripComments(plantedGuarded);
      assert.equal(
        exportedNames(strippedGuarded).some((name) => reachableCallsFrom(strippedGuarded, name).some(isSpineCall)),
        true,
        "a genuinely guarded action must pass",
      );
    });
  });

  describe("THE INLINE-DIRECTIVE POSITIVE CONTROL (F-3, F-8)", () => {
    it("an inline directive nested inside a function body IS caught by the tripwire", () => {
      // Next's own documented shape: a component whose closure carries its own
      // directive, captioned "verify auth before saving" in the docs.
      const plant = [
        "export default function Form() {",
        "  async function saveAction(formData) {",
        '    "use server";',
        "    // verify auth before saving",
        "    return formData;",
        "  }",
        "  return saveAction;",
        "}",
      ].join("\n");
      const stripped = stripComments({ path: "inline-plant.ts", code: plant }).code;
      assert.ok(inlineOccurrences(stripped).length > 0, "the inline directive went undetected");
    });

    it("DISCRIMINATING CONTROL (F-8): a header comment before a module's own directive is NOT flagged as inline", () => {
      // The house style EVERY file in this repo opens with (a header comment)
      // shifts the module's own legitimate directive to byte offset > 0, since
      // stripComments blanks comments IN PLACE rather than deleting them. The
      // buggy `pos !== 0` exemption reds THIS exact, ordinary shape; the
      // shape-based `inlineOccurrences()` fix does not. This cell is written to
      // discriminate: run it against `directiveShapedOccurrences(...).filter(pos
      // => pos !== 0)` (the pre-F-8 code) and it reds; run it against
      // `inlineOccurrences()` (the shipped code) and it is green.
      const plant = [
        "// header comment, exactly what every real file in this repo opens with",
        '"use server";',
        "export async function act() { return null; }",
      ].join("\n");
      const stripped = stripComments({ path: "header-comment-plant.ts", code: plant }).code;
      assert.notEqual(stripped.indexOf('"use server"'), 0, "the fixture stopped exercising a non-zero offset");
      assert.deepEqual(
        inlineOccurrences(stripped),
        [],
        "a header comment before the module's own directive must not make it count as inline",
      );
    });

    it("MUST-NOT-RED CONTROL: this file's own plant literals do not trip the tripwire on themselves", () => {
      // scannedFiles() includes tests/ (F-2's whole-tree walk) — this file IS in
      // its own input. Every plant above sits inside a string-literal ARGUMENT,
      // never in bare directive position, so this must stay green; if it ever
      // reds, a plant was rewritten into real directive position by mistake.
      const stripped = stripComments(readSourceUnit("tests/firm-scope-fourth-entrance.test.ts")).code;
      assert.deepEqual(inlineOccurrences(stripped), [], "this file's own plants are now sitting in real directive position");
    });
  });
});
