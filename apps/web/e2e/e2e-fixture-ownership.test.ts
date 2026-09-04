// THE E2E MOCK OWNERSHIP RULE, MADE MECHANICAL (#519 fold, notes N4 and N5).
//
// `serve-built.mjs` is ONE server for every walk in the suite. A lane that answers a SHARED
// endpoint does not add its own fixture — it REPLACES everyone else's, and the walk that loses
// is whichever one reads a list instead of navigating by id, so the failure surfaces as someone
// else's cell going red for a reason nowhere in their diff.
//
// THIS LANE BROKE THAT RULE THREE TIMES, which is why the rule now has a cell instead of a
// paragraph:
//   1. it claimed `/api/chat/sessions` outright — #507's walk lost its own thread;
//   2. it claimed the UNFILTERED `/rest/v1/clients` register — #507's navigation cell could not
//      find the link it clicks;
//   3. its firm-altitude SESSION ROW carried the shared subject — and this one is the sharpest,
//      because it is a FIXTURE, not a handler. `selectOwnSession` takes the first row matching
//      `created_by === callerSubject && client_id === null`. Before this PR the shared list held
//      ZERO such rows; with the shared subject it held exactly one, so EVERY walk opening the
//      rail at firm altitude resolved this lane's thread.
//
// A prose rule caught none of them. These cells do, and they read the fixtures themselves rather
// than trusting a comment above them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { P6_5_SESSIONS } from "./agentic-finish-mock.mjs";

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const SERVE_BUILT = join(E2E_DIR, "serve-built.mjs");

/**
 * EVERY LANE MOCK, not one (裁-190 fold).
 *
 * This gate shipped censusing a single hard-coded file, so the rule it enforces —
 * "a lane handler scopes by the request's own subject, or it is a named exception" —
 * applied to whichever lane happened to be named here and to nobody else. Two more
 * lane mocks were already sitting beside it, unmeasured, and a third arrived with the
 * journals table. A gate that watches one of four files is not a gate.
 *
 * THE EXPECTED LIST IS STILL WRITTEN OUT, but it is now checked against one DERIVED from
 * `serve-built.mjs` rather than standing alone. A hand-kept list beside a comment claiming
 * "forgetting a fourth is visible" was not true of itself: both the list and its guard lived
 * in this file, so a fourth mock could be imported by the server and never appear here. The
 * server's own import block is the fact — a lane mock IS a module `serve-built.mjs` consults —
 * so `derivedLaneMocks()` reads that, and the assertion below is what actually fires.
 */
const LANE_MOCKS = [
  "agentic-finish-mock.mjs",
  "chat-parity-mock.mjs",
  "fs4-checkout-mock.mjs",
  "home-board-mock.mjs",
  "journals-table-mock.mjs",
] as const;

/**
 * The lane mocks `serve-built.mjs` actually imports, read from its source the same way
 * `sharedSubject()` reads its `SUBJECT` — a re-typed constant is a second copy that drifts,
 * and this whole file exists because of drift.
 *
 * The pattern matches the module SPECIFIER, not an identifier or a comment: a mock is a
 * `./<name>-mock.mjs` sibling. `fs4-checkout-mock.mjs` matches too and that is correct — it is
 * a lane mock by the same definition, consulted through `handleCheckoutMock`; if it ever grows
 * a PostgREST handler of its own the census will start measuring it. `chat-parity-mock.mjs` is
 * imported once and named once, so the Set also collapses a duplicate import.
 */
function derivedLaneMocks(): string[] {
  const source = readFileSync(SERVE_BUILT, "utf8");
  return [...new Set([...source.matchAll(/from "\.\/([a-z0-9-]+-mock\.mjs)"/g)].map((m) => m[1]!))].sort();
}

/** The subject every walk signs in as, read from `serve-built.mjs` rather than re-typed here —
 *  a re-typed constant is a second copy that drifts, and this cell exists because of drift. */
function sharedSubject(): string {
  const match = /const SUBJECT = "([0-9a-f-]+)"/.exec(readFileSync(SERVE_BUILT, "utf8"));
  assert.ok(match, "serve-built.mjs must declare the shared SUBJECT this census reads");
  return match[1]!;
}

test("N4 · no lane fixture may claim the FIRM ALTITUDE for the shared subject", () => {
  const subject = sharedSubject();
  console.log(`  shared SUBJECT = ${subject}`);
  for (const row of P6_5_SESSIONS) {
    console.log(`  ${row.id} client_id=${row.client_id ?? "null"} created_by=${row.created_by}`);
  }

  // THE ASSERTION IS BY SUBJECT, not "two ids differ". `selectOwnSession` resolves on
  // (created_by === callerSubject && client_id === null), so the only thing that matters is
  // whether a firm-altitude row carries THE SHARED SUBJECT — a fixture could use two distinct
  // ids and still hand this lane's thread to every walk if the wrong one were the shared one.
  const claimed = P6_5_SESSIONS.filter((r) => r.client_id === null && r.created_by === subject);
  assert.deepEqual(
    claimed.map((r) => `${r.id} (${r.title})`),
    [],
    "a firm-altitude row with the shared subject is resolved by EVERY walk's rail, not just this lane's",
  );

  // The counter-half: this lane's client rows SHOULD carry the shared subject, or its own walk
  // resolves nothing. Without this, deleting every row would satisfy the assertion above.
  const own = P6_5_SESSIONS.filter((r) => r.client_id !== null && r.created_by === subject);
  assert.equal(own.length, 2, "the lane's two CLIENT threads are still the caller's own");
});

/** An independent count of the handler openers in a file, used as the positive control on the
 *  scan below: a loop that walks the wrong lines, or stops early, disagrees with this. Written
 *  as a whole-source match rather than a per-line walk on purpose — two techniques, one fact. */
function openerCount(file: string): number {
  return (readFileSync(file, "utf8").match(/path === "\/(?:rest|api)\/[^"]+"/g) ?? []).length;
}

/** Every `path === "/rest/v1/..."` or `path === "/api/..."` handler in ONE lane mock, with
 *  whether its block contains a `return false` — the fall-through that makes it scoped. */
function handlerCensus(file: string): { path: string; scoped: boolean }[] {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const out: { path: string; scoped: boolean }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const opened = /path === "(\/(?:rest|api)\/[^"]+)"/.exec(lines[i]!);
    if (!opened) continue;
    // The block runs to the next handler opener, or to the end of the function.
    let scoped = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/path === "(\/(?:rest|api)\/[^"]+)"/.test(lines[j]!)) break;
      // `return false;` ANYWHERE on the line, not only at its start: the scoping guard is
      // usually written as a one-line `if (…) return false;`. The first cut anchored at the
      // line start and reported thirteen scoped handlers as UNSCOPED — an instrument that
      // over-reports is still a broken instrument, and the positive control below is what
      // caught it.
      if (/\breturn false;/.test(lines[j]!)) { scoped = true; break; }
      // THE HANDLER'S OWN CLOSER, and it is the difference between a gate and a decoration.
      // Handlers are `if (…) { … }` blocks inside an exported function, so their closer is
      // indented — `  }` — while only the FUNCTION's closer sits at column 0. Breaking solely
      // on `/^\}/` therefore never stopped at the end of a handler: the scan ran on through
      // every following line to the function's own fall-through `return false;` and scored the
      // handler "scoped" on a statement that belongs to nobody.
      //
      // MEASURED, not reasoned: with only the column-0 test,
      // `chat-parity-mock.mjs`'s `/rest/v1/rpc/file_document` (:201) scored SCOPED on the tail
      // at :207, while its body (:202-204) is `readJson → sendJson → return true` with no
      // guard at all. It is the LAST handler in that file, which is the shape that makes this
      // dangerous rather than merely wrong: any unscoped handler APPENDED to the end of any
      // lane mock inherited the same free pass, so the gate was weakest exactly where new
      // handlers get written.
      if (/^\s{1,2}\}\s*$/.test(lines[j]!)) break;
      if (/^\}/.test(lines[j]!)) break;
    }
    out.push({ path: opened[1]!, scoped });
  }
  return out;
}

/**
 * TWO DECLARATIONS PER LANE MOCK, and they are deliberately different KINDS.
 *
 * `unscopeable` — a handler that CANNOT be scoped, with the reason recorded in source beside
 * it. An allowlist is only honest when it is short, named and argued. The two on the P6-5 lane
 * are RPCs whose request carries no SUBJECT: `list_coa_templates()` takes no arguments at all,
 * and `begin_client_onboarding` takes a free-text name rather than an id — keying on this lane's
 * own string would be scoping by a label, the "spelling is not identity" mistake applied to a
 * fixture. Both are measured to have no other caller in `apps/web/e2e`.
 *
 * `debt` — a handler that COULD be scoped and simply is not. Recording those as "unscopeable"
 * would be writing a false reason into a gate, so they get their own name. All three sit on the
 * chat-parity lane and each carries a discriminant its handler ignores: `answer_interruption`
 * and `record_client_resolution` are POSTs whose body has an id, and
 * `document_intakes_visible` is a GET that can filter. They predate this gate's widening
 * (裁-190), they are recorded rather than fixed because that file belongs to another lane's
 * scope, and the assertions below hold the count EXACTLY — so this list can shrink but a fourth
 * entry cannot appear quietly.
 *
 * The journals lane declares NEITHER, which is the shape a new lane mock should aim for.
 */
const LANE_DECLARATIONS: Record<string, { unscopeable: string[]; debt: string[] }> = {
  "agentic-finish-mock.mjs": {
    unscopeable: ["/rest/v1/rpc/list_coa_templates", "/rest/v1/rpc/begin_client_onboarding"],
    debt: [],
  },
  "chat-parity-mock.mjs": {
    unscopeable: [],
    // FOUR, not three. `file_document` joined the list the moment the census learned to stop
    // at a handler's own closer — it had been scoring "scoped" on the function's tail. Its
    // body stores the whole request and answers unconditionally, while the caller sends
    // `p_document` (lib/documents/doors.ts:54), so the discriminant is right there in the body
    // it already parses. Same for its neighbours: `answer_interruption` sends `p_id`,
    // `record_client_resolution` a client id, and `document_intakes_visible` is a filterable
    // GET. Every one of these COULD scope, which is why none is called unscopeable.
    debt: [
      "/rest/v1/rpc/answer_interruption",
      "/rest/v1/document_intakes_visible",
      "/rest/v1/rpc/record_client_resolution",
      "/rest/v1/rpc/file_document",
    ],
  },
  // FS-4's lane, pulled in by DERIVING the list from `serve-built.mjs` rather than typing it —
  // it was a lane mock all along and nobody had noticed it was unmeasured.
  //
  // A COVERAGE LIMIT, NAMED RATHER THAN HIDDEN: this census reads ONE handler shape,
  // `path === "<literal>"`, and this file uses three. Its `/rest/v1/rpc/` PREFIX handler
  // (fs4-checkout-mock.mjs:100) and its CONTROL_PATH const handler (:64) are invisible here, so
  // a green on this row means "the one shape we can read is declared", not "this file is
  // clean". Widening the reader to those shapes is its own change; recording the gap is what
  // stops the green from being read as more than it is.
  "fs4-checkout-mock.mjs": {
    unscopeable: [],
    // Stores the request and answers unconditionally, while the body it already parses carries
    // the signup identity the walk sends. Could scope; does not.
    debt: ["/api/auth-wall/confirm"],
  },
  "journals-table-mock.mjs": { unscopeable: [], debt: [] },
  // The Home boards' lane (裁-190). Its ONE literal-path handler, `/rest/v1/clients`, scopes by
  // id and falls through, so nothing is declared here.
  //
  // THE SAME COVERAGE LIMIT fs4's row names, in a different shape, and it is recorded rather
  // than hidden: this census reads `path === "<literal>"`, and that file's other handlers
  // dispatch through two ARRAY membership tests (`EMPTY_RELATIONS.includes(path)` /
  // `EMPTY_RPCS.includes(path)`), which this reader cannot see. Those handlers are
  // deliberately unscoped and answer for every subject — but every one of them returns `[]`,
  // the honest empty, so there is no fixture in them for a sibling walk to resolve as its own.
  // That is the property the N4/N5 pair exists to protect, and it is why "unscoped" is the
  // right shape here rather than a debt to repay. A green on this row means "the one shape the
  // reader can see is clean", not "this file is clean".
  "home-board-mock.mjs": { unscopeable: [], debt: [] },
};

test("N5 · every lane handler either scopes by the request's own subject, or is a NAMED exception", () => {
  // THE LIST IS CHECKED AGAINST THE SERVER, not against itself. A hand-kept list guarded by a
  // hand-kept assertion in the same file cannot see a mock the server imports and this file
  // never heard of — which is exactly how `fs4-checkout-mock.mjs` sat unmeasured. The server's
  // import block is the fact; this is the assertion that actually fires on a fifth.
  const derived = derivedLaneMocks();
  console.log(`  serve-built.mjs imports: ${derived.join(", ")}`);
  assert.deepEqual(
    derived,
    [...LANE_MOCKS].sort(),
    "serve-built.mjs consults a lane mock this gate does not census — add it to LANE_MOCKS and give it a declaration",
  );
  assert.deepEqual(
    Object.keys(LANE_DECLARATIONS).sort(),
    [...LANE_MOCKS].sort(),
    "every lane mock needs a declaration row, and every row needs a lane mock",
  );

  let totalScoped = 0;

  for (const mock of LANE_MOCKS) {
    const { unscopeable, debt } = LANE_DECLARATIONS[mock]!;
    const declared = new Set([...unscopeable, ...debt]);
    const file = join(E2E_DIR, mock);
    const census = handlerCensus(file);

    console.log(`\n  ${mock}`);
    // THE PER-FILE POSITIVE CONTROL ON THE SCAN, replacing a magic `>= 5` floor that a
    // one-handler file could never satisfy and that proved nothing about a fifteen-handler
    // one. Two independent techniques must agree on how many handlers exist: the line walk
    // above, and a whole-source match. A scan that starts in the wrong place, or stops early,
    // disagrees here.
    assert.equal(
      census.length,
      openerCount(file),
      `${mock}: the line walk found ${census.length} handlers, the source match ${openerCount(file)} — the scan is not reading the file`,
    );
    for (const row of census) {
      console.log(`    ${row.scoped ? "scoped  " : "UNSCOPED"} ${row.path}`);
    }

    const unscoped = census.filter((r) => !r.scoped).map((r) => r.path);
    const scoped = census.filter((r) => r.scoped).map((r) => r.path);
    totalScoped += scoped.length;

    assert.deepEqual(
      unscoped.filter((p) => !declared.has(p)),
      [],
      `${mock}: an unscoped handler answers for subjects this lane does not own — scope it, or declare it (unscopeable, with its reason in source) or record it as debt`,
    );

    // Neither list may rot into a place things are parked: every entry has to still BE a
    // handler in this file, and still be unscoped. One that quietly became scoped, or
    // disappeared, should leave the list.
    for (const allowed of declared) {
      const row = census.find((r) => r.path === allowed);
      assert.ok(row, `${mock}: ${allowed} is declared but is no longer a handler — drop it`);
      assert.equal(row.scoped, false, `${mock}: ${allowed} is declared but now SCOPES — drop it`);
    }

    // The per-file tail, replacing the single global count. EXACT, not `>=`: a new unscoped
    // handler has to be argued for in source before this goes green again.
    assert.equal(
      unscoped.length,
      declared.size,
      `${mock}: expected exactly ${declared.size} undeclared-free unscoped handlers, saw ${unscoped.length} (${unscoped.join(", ")})`,
    );
    assert.equal(scoped.filter((p) => declared.has(p)).length, 0, `${mock}: no handler is counted both ways`);
  }

  // THE POSITIVE CONTROL ON THE SCOPED CLASS. An empty `unscoped` list proves nothing unless
  // the instrument can still SEE a guard — and it could not on its first cut, which anchored
  // `return false;` at the line start and reported every one-line guard as UNSCOPED. Measured
  // across the four files today: 24 (13 + 3 + 0 + 8). The floor is deliberately below that so
  // this is a "the reader still works" check, not a second census to keep in step.
  console.log(`\n  scoped handlers across ${LANE_MOCKS.length} lane mocks: ${totalScoped}`);
  assert.ok(totalScoped >= 20, `the census recognised only ${totalScoped} scoped handlers across ${LANE_MOCKS.length} files — it is not reading the guards`);
});

// --- N6 -----------------------------------------------------------------------------
//
// THE SAME RULE, OVER THE SHARED SERVER ITSELF. N4 and N5 read the P6-5 lane's fixtures
// and its mock; neither reaches `serve-built.mjs`, which owns the ONE session list every
// walk's rail resolves against. 裁-117 gave that file a CREATE handler, and with it the
// ability to grow the list at runtime — so the ownership rule now has a second place it
// can be broken, and it gets its own cell rather than a paragraph, exactly as N4 and N5
// did.
//
// TWO HALVES, because either alone is satisfiable by doing nothing:
//   (a) no STATIC row in that file claims the firm altitude for the shared subject;
//   (b) the create handler REFUSES the no-clientId case — the only shape that could add
//       such a row at runtime.
//
// (b) is a deliberate divergence from the real ingress, which DOES accept a firm-altitude
// create (`packages/runtime/src/chatRoutes.ts` inserts `body.clientId ?? null`). That is
// the point of pinning it: a reader who finds the mock stricter than the server should
// find the reason next to the assertion, not have to reconstruct it.

/** The session rows `serve-built.mjs` declares statically, parsed out of its own source
 *  rather than imported — the module starts an HTTPS server and a `next start` child on
 *  import, which a unit cell must not do. Each row is read as a field map, so a row that
 *  grows a field this cell does not know about is still censused.
 *
 *  `source` IS A PARAMETER so the positive control below can run this PARSER over a
 *  doctored file rather than re-applying the caller's filter to a hand-built array. The
 *  first cut did the latter, which only ever proved that a `.filter(...)` written twice
 *  behaves the same way twice — it could not have caught a parser that silently stopped
 *  matching rows, which is the failure this census actually has. */
function serveBuiltSessions(source: string = readFileSync(SERVE_BUILT, "utf8")): { clientId: string | null; createdBy: string | null }[] {
  const start = source.indexOf("const sessions = [");
  assert.ok(start >= 0, "serve-built.mjs must still declare the shared `sessions` array this cell censuses");
  const end = source.indexOf("\n];", start);
  assert.ok(end > start, "the `sessions` array must be terminated — the census cannot read a truncated literal");
  const block = source.slice(start, end);

  const rows: { clientId: string | null; createdBy: string | null }[] = [];
  for (const line of block.split("\n")) {
    if (!line.includes("client_id:")) continue;
    const clientMatch = /client_id:\s*([A-Za-z0-9_]+|null)/.exec(line);
    const createdMatch = /created_by:\s*("[0-9a-f-]+"|[A-Za-z0-9_]+)/.exec(line);
    if (!clientMatch || !createdMatch) continue;
    rows.push({
      clientId: clientMatch[1] === "null" ? null : clientMatch[1]!,
      // A literal id is compared as itself; a CONSTANT is compared by name, and `SUBJECT`
      // is the one name that matters — the shared subject every walk signs in as.
      createdBy: createdMatch[1]!.replace(/"/g, ""),
    });
  }
  assert.ok(rows.length >= 3, `the census parsed ${rows.length} static rows — it is not reading the array`);
  return rows;
}

test("N6 · serve-built's shared session list claims no firm altitude, and its CREATE cannot mint one", () => {
  const subject = sharedSubject();
  const rows = serveBuiltSessions();
  for (const row of rows) {
    console.log(`  client_id=${row.clientId ?? "null"} created_by=${row.createdBy}`);
  }

  // (a) THE STATIC HALF. `SUBJECT` appears as a bare identifier in that file, so a row
  // written as `created_by: SUBJECT` matches by name and one written with the literal
  // matches by value — both are the shared subject and both are forbidden at the firm
  // altitude.
  const claimsFirm = rows.filter((r) => r.clientId === null && (r.createdBy === "SUBJECT" || r.createdBy === subject));
  assert.deepEqual(claimsFirm, [], "a firm-altitude row with the shared subject is resolved by EVERY walk's rail");

  // The counter-half, so deleting every row would not satisfy the assertion above.
  const ownClientRows = rows.filter((r) => r.clientId !== null && r.createdBy === "SUBJECT");
  assert.ok(ownClientRows.length >= 2, "the shared list must still carry the caller's own CLIENT threads");

  // (b) THE RUNTIME HALF. The handler exists, and it refuses exactly the shape that would
  // add a firm-altitude row — asserted against the guard's own source, not against a
  // comment claiming it.
  const source = readFileSync(SERVE_BUILT, "utf8");
  const createAt = source.indexOf('request.method === "POST" && url.pathname === "/api/chat/sessions"');
  assert.ok(createAt >= 0, "serve-built.mjs must still own the CREATE beside the ONE session list");
  const handler = source.slice(createAt, createAt + 900);
  assert.match(handler, /if\s*\(!body\.clientId\)/, "the create must refuse a session with no client pin");
  assert.match(handler, /sendJson\(response,\s*400/, "and refuse it as a 400, not by silently minting something else");
  // The refusal must be the FIRST thing that happens to a clientId-less body: a guard
  // that ran after the row was pushed would fence nothing.
  const refusalAt = handler.indexOf("if (!body.clientId)");
  const pushAt = handler.indexOf("sessions.unshift(");
  assert.ok(pushAt > refusalAt, "the guard must precede the push, or it fences nothing");

  // POSITIVE CONTROL ON THE INSTRUMENT — through the PARSER, not around it. A cell that
  // only ever looks for absence proves nothing unless it can also SEE a violation, and
  // the thing that has to see it is `serveBuiltSessions` itself: if that function stopped
  // matching rows (a reformat, a renamed field, a changed quote style) the real assertion
  // above would go quietly green on an empty census. So the row is spliced into the
  // ARRAY LITERAL of a copy of the file, and the parser is run over that.
  const doctored = source.replace(
    "const sessions = [",
    'const sessions = [\n  { id: FAKE, firm_id: FIRM_ID, client_id: null, created_by: SUBJECT, visibility: "private", title: "planted", created_at: "2026-01-01T00:00:00.000Z" },',
  );
  assert.notEqual(doctored, source, "the control must actually have planted its row");
  const censusOfDoctored = serveBuiltSessions(doctored);
  assert.equal(
    censusOfDoctored.length,
    rows.length + 1,
    "the parser must see the planted row at all — a census that shrank is not reading the file",
  );
  const seen = censusOfDoctored.filter((r) => r.clientId === null && (r.createdBy === "SUBJECT" || r.createdBy === subject));
  assert.equal(seen.length, 1, "the census must REPORT a firm-altitude claim, or its empty result above means nothing");
});

