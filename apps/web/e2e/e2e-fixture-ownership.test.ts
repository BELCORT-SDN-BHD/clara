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
import { handleL7Supabase, L7_RPC_VERBS } from "./bank-close-registers-mock.mjs";
import { handleCheckoutMock } from "./fs4-checkout-mock.mjs";
import { JOURNAL_WORK, handleJournalWorkRuntime } from "./journal-work-mock.mjs";

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const SERVE_BUILT = join(E2E_DIR, "serve-built.mjs");
const DOCUMENTS_LANE_MOCK = join(E2E_DIR, "documents-viewer-mock.mjs");

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
  "activity-mock.mjs",
  "agentic-finish-mock.mjs",
  "bank-close-registers-mock.mjs",
  "chat-parity-mock.mjs",
  "documents-viewer-mock.mjs",
  "fs4-checkout-mock.mjs",
  "home-board-mock.mjs",
  "journal-work-mock.mjs",
  "journals-table-mock.mjs",
  "knowledge-mock.mjs",
  "operator-support-mock.mjs",
  "periodic-adjustment-mock.mjs",
  "plans-mock.mjs",
  "prepayments-mock.mjs",
  "tax-boundary-mock.mjs",
  "work-list-mock.mjs",
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

/**
 * EVERY WAY A HANDLER OPENS, as ONE expression — shared by the census and by its independent
 * positive control, so the two can never disagree about what a handler even is.
 *
 * #549 MAJOR 8: this recognised only `path === "/rest/…"`. `bank-close-registers-mock.mjs`
 * slices the `/rest/v1/rpc/` prefix once and then dispatches its RPC half on `verb === "…"`,
 * so FIVE of its ten handlers were invisible to a gate whose whole job is to see them — and an
 * unscoped one among them would have passed in silence. A census that cannot see a handler
 * cannot report it unscoped, which is this file's own failure mode, one level up.
 */
const HANDLER_OPENER = /(?:path === "(\/(?:rest|api)\/[^"]+)"|verb === "([a-z0-9_]+)")/;
const HANDLER_OPENER_G = new RegExp(HANDLER_OPENER.source, "g");

/** The label a census row carries, so a verb-dispatched handler reads like the route it answers. */
function openerLabel(m: RegExpExecArray): string {
  return m[1] ?? `/rest/v1/rpc/${m[2]}`;
}

/** An independent count of the handler openers in a file, used as the positive control on the
 *  scan below: a loop that walks the wrong lines, or stops early, disagrees with this. Written
 *  as a whole-source match rather than a per-line walk on purpose — two techniques, one fact. */
function openerCount(file: string): number {
  return (readFileSync(file, "utf8").match(HANDLER_OPENER_G) ?? []).length;
}

/** Every handler in ONE lane mock — `path === "…"` or `verb === "…"` — with whether its block
 *  contains a `return false`, the fall-through that makes it scoped. */
function handlerCensus(file: string): { path: string; scoped: boolean }[] {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const out: { path: string; scoped: boolean }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const opened = HANDLER_OPENER.exec(lines[i]!);
    if (!opened) continue;
    // The block runs to the next handler opener, or to the end of the function.
    let scoped = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (HANDLER_OPENER.test(lines[j]!)) break;
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
    out.push({ path: openerLabel(opened), scoped });
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
  // #632's own lane. `list_activity`/`get_activity_event` are brand-new RPCs no other lane ever
  // calls, and each still carries its own `return false;` fall-through on an unmatched
  // `p_client`/`p_source`+`p_id` — the journals lane's shape, declaring neither list.
  "activity-mock.mjs": { unscopeable: [], debt: [] },
  // #615's own lane. Its five id-carrying verbs (`get_operator_support_case`,
  // approve/reject/resolve) each carry their own `return false;` fall-through on an id this lane
  // did not mint. THREE cannot be scoped and say so here rather than pretending:
  // `list_operator_support_queue` is ESTATE-WIDE by construction — its only argument is a boolean,
  // there is no subject in the request to key on, and "the whole estate's open cases" is what the
  // door means; `get_admission_capacity` takes no arguments at all and
  // `set_admission_capacity` writes the estate's ONE configuration row. All three are measured to
  // have no other caller anywhere in `apps/web/e2e`, and all three answer CLR04 to the bookkeeper
  // persona, so an unowned caller is REFUSED rather than served someone else's fixture.
  "operator-support-mock.mjs": {
    unscopeable: [
      "/rest/v1/rpc/list_operator_support_queue",
      "/rest/v1/rpc/get_admission_capacity",
      "/rest/v1/rpc/set_admission_capacity",
    ],
    debt: [],
  },
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
    // the signup identity the walk sends. Could scope; does not. The RESEND limb (#621) is the
    // same handler shape with the same property and the same reason — one act per endpoint,
    // both keyed on an address the mock does not check against its own fixture.
    debt: ["/api/auth-wall/confirm", "/api/auth-wall/resend"],
  },
  "journals-table-mock.mjs": { unscopeable: [], debt: [] },
  // #623's durable-Work lane. Nothing is declared: every literal-path handler in it
  // gates on `client_id`/`id` being its own before it answers, including the CONTROL
  // endpoint, whose body has to name this lane's client — a control surface that
  // answered for any body would be able to advance another lane's fixture.
  //
  // THE SAME COVERAGE LIMIT fs4's and home-board's rows name, in this file's third
  // shape, and it is recorded rather than hidden: that module's `GET /api/work/:id`
  // and `POST /api/work/:id/retry` are matched with a REGEX because their paths carry
  // an id, so this census cannot see them at all. Both resolve only ids that module
  // minted and return false otherwise. A green on this row means "every handler the
  // reader can see is scoped", not "this file is clean".
  "journal-work-mock.mjs": { unscopeable: [], debt: [] },
  // The documents-viewer lane. Every handler names its own client, document, extraction or
  // candidate before it answers, and the RPC block guards on `p_client`/`p_document`/
  // `p_candidate` before it dispatches at all — so there is nothing to declare in either
  // column, which is the state a lane mock should be in.
  "documents-viewer-mock.mjs": { unscopeable: [], debt: [] },
  "bank-close-registers-mock.mjs": {
    // The gate CATALOG is firm-wide and its read carries no filter AT ALL —
    // `lib/close/api.ts:320-322` sends only `select` and `order`. There is no discriminant in
    // the request to scope on, which is what makes this one genuinely unscopeable rather than
    // merely unscoped.
    unscopeable: ["/rest/v1/close_gate_checks"],
    // DEBT, and #549's own fold had it wrong: it was declared unscopeable, and it is not.
    // `lib/reports/api.ts:251-256` sends `client_id=eq.<id>` on the wire, so the discriminant
    // is right there in the request and this handler ignores it. Same shape as the chat-parity
    // rows above — it COULD scope, which is exactly why it is not called unscopeable.
    debt: ["/rest/v1/report_agent_receipts"],
  },
  // The Home boards' lane (#557). Its ONE literal-path handler, `/rest/v1/clients`, scopes by
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
  // #627's D4 lane. Every handler names its own client (five distinct ids, one per state)
  // before it answers, and falls through otherwise — same shape as documents-viewer-mock.mjs
  // above, which is the state a lane mock should be in.
  "tax-boundary-mock.mjs": { unscopeable: [], debt: [] },
  // #641's Work-list lane. `list_accounting_work`/`get_accounting_work_row` are brand-new RPCs no
  // other lane calls, and each carries its own `return false;` fall-through — the list handler on
  // an unmatched `p_client` (the firm-wide `null` read is deliberately answered, because this lane
  // owns the only fixture Work the suite has), the row handler on an id OUTSIDE this lane's own
  // `c641c641-2222-` Work-id space. That door takes no client at all, so the Work id IS the
  // request's own subject: an id in this lane's space that it did not mint gets this lane's CLR11
  // (0189's no-oracle not-found, which the addressed-row walk needs), and anything else falls
  // through to whichever lane minted it. Neither column has anything to declare, which is the
  // state a lane mock should be in.
  "work-list-mock.mjs": { unscopeable: [], debt: [] },
  // #644 — every handler checks a #644 id (a client id, a record id or the one missing document
  // id) before it answers, and falls through otherwise; its five rpc verbs read the body only
  // inside their own verb match. Nothing to declare.
  "knowledge-mock.mjs": { unscopeable: [], debt: [] },
  // #643 — every handler is scoped to this lane's own client id (`PA.clientId`) and falls through
  // otherwise: the PostgREST reads (clients, coa_accounts, document_filings, list_spoken_for_documents
  // by `p_client`; documents by ids this module minted), the RUNTIME admission route by `body.clientId`,
  // and the CONTROL ENDPOINT by `body.client` — that last one is a fix rather than a restatement. A
  // standards review measured this declaration ahead of the code: the control endpoint's five ops
  // (`refuse_next`, `seed_intent`, `received`, `empty_history`, `reset`) mutated shared fixture state
  // for ANY body at all, which is a lane claiming a shared endpoint — the exact shape this census
  // exists to prevent — while this comment said it did not. It now carries `journal-work-mock.mjs`'s
  // own guard (`if (body?.client !== PA.clientId) return false;`) and the walk's `control()` helper
  // names the lane on every call. The state a walk injects is this lane's alone.
  "periodic-adjustment-mock.mjs": { unscopeable: [], debt: [] },
  // #640's C9 lane. Every handler names this lane's own client id or plan id before it answers
  // and falls through otherwise, including all nine RPC verbs — the shape a new lane mock should
  // aim for, declaring neither list.
  "plans-mock.mjs": { unscopeable: [], debt: [] },
  // #653's C8/C9 lane. Every handler names this lane's own client id, schedule id or plan id
  // before it answers and falls through otherwise — the three PostgREST reads (`clients` by `id`,
  // `coa_accounts` and `accounting_work` by `client_id`) and all eight RPC verbs. The
  // `accounting_work` read is the authority picker's own (`lib/plans/api.ts`'s
  // `listAuthorityCandidates`); `journal-work-mock.mjs` and `work-list-mock.mjs` answer the same
  // route for THEIR clients and each falls through on a foreign one. Four of those verbs are the PLAN
  // lifecycle doors this lane REUSES rather than re-cuts, so they are a declared share with
  // `plans-mock.mjs` below, each side gated on its own plan id.
  "prepayments-mock.mjs": { unscopeable: [], debt: [] },
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

// --- THE DOCUMENTS-VIEWER LANE (C-07 / D2 / D3) -------------------------------
//
// A SECOND lane, measured by the SAME instrument. The rule this file exists for
// is not about one mock — it is about every lane sharing one server, so a new
// lane that is not measured here is exactly the gap the rule was written after.

// THIS LANE'S SCOPING CELL IS GONE, and deleting it is the right outcome of the merge.
// It censused `documents-viewer-mock.mjs` on its own; the 裁-190 fold above generalised the
// SAME instrument to loop over every mock `serve-built.mjs` imports, with a declaration row
// per lane. Keeping mine would be a second, weaker copy of a gate that now covers this lane
// by construction — and a copy is exactly what both folds were written to remove. What
// survives below is the half their loop does NOT do.

test("N4 · the documents-viewer lane does NOT claim the shared client register", () => {
  // The sharpest failure this file records is a lane claiming
  // `/rest/v1/clients` outright, which took away another walk's navigation
  // link. This lane answers only the by-id form for its own client; the census
  // above proves the handler falls through, and this reads the guard itself so
  // the two cells cannot both be satisfied by a handler that returns early for
  // the wrong reason.
  const source = readFileSync(DOCUMENTS_LANE_MOCK, "utf8");
  const block = /path === "\/rest\/v1\/clients"\) \{([\s\S]*?)\n  \}/.exec(source);
  assert.ok(block, "the documents lane must still declare a /rest/v1/clients handler for this cell to measure");
  assert.match(
    block[1]!,
    /if \(eqParam\(url, "id"\) !== DOCS\.clientId\) return false;/,
    "the clients handler must fall through on any id but this lane's own",
  );
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

// ---------------------------------------------------------------------------
// #549's own fixture claim, in the same spirit as N4 above.
// ---------------------------------------------------------------------------
//
// The bank/close/registers walk asserts that a close-prep hold renders the MEMBER'S NAME
// rather than the raw `clara.users(id)` uuid it carries (CB-AE2E-028). That claim is only
// worth anything if the fixture's `held_by` is an id the roster can actually resolve —
// `serve-built.mjs`'s own `/rest/v1/firm_members_visible` publishes exactly the shared
// SUBJECT. A different id would resolve to null, the surface would render its shortened-id
// FALLBACK, and the walk would pass while proving the opposite of what it says.
test("N4 (L7) · the close-prep hold fixture's held_by IS the shared subject — otherwise the walk proves the fallback", () => {
  const subject = sharedSubject();
  const source = readFileSync(join(E2E_DIR, "bank-close-registers-mock.mjs"), "utf8");
  const match = /heldBy: "([0-9a-f-]+)"/.exec(source);
  assert.ok(match, "the L7 mock must declare heldBy");
  console.log(`  shared SUBJECT = ${subject}, L7 heldBy = ${match[1]}`);
  assert.equal(
    match[1],
    subject,
    "a held_by outside the published roster resolves to null, and the walk would then be asserting the shortened-id fallback while claiming to assert the name",
  );
});

// ---------------------------------------------------------------------------
// N7 — #632 review finding 10: the mock-lane BODY-DRAIN hazard, root-caused rather than
// papered over with a third ordering workaround.
// ---------------------------------------------------------------------------
//
// MEASURED: `bank-close-registers-mock.mjs`'s own RPC dispatch used to call `readJson(request)`
// (which DRAINS Node's request stream — it can only be iterated once) for EVERY
// `/rest/v1/rpc/` POST, before it even checked whether the verb was one of its own five. When
// `activity-mock.mjs`'s `list_activity`/`get_activity_event` verbs (which this lane does not
// recognise) reached this handler first, the body was drained and silently discarded, and the
// NEXT hook's own `readJson(request)` call saw an already-empty stream — `{}`, not an error —
// which satisfied every one of that lane's own permissive `undefined` equality checks. Every
// `list_activity` call therefore answered the SAME unfiltered page 1 regardless of what the
// browser actually asked for, with no error anywhere (`serve-built.mjs`'s own commit history
// papered over this by moving that lane's hook to run FIRST — a real fix for THAT ordering, but
// not a fix for the underlying hazard, which would recur the moment a SIXTH lane's verb landed
// ahead of this one in the chain).
//
// THE FIX, measured directly rather than trusted from a comment: an exact-verb allow-list check
// (`L7_RPC_VERBS`) guards `readJson` itself, so a verb this lane does not own returns `false`
// WITHOUT ever touching the stream — leaving it fully intact for whichever hook runs next, in
// ANY order, which is what actually closes the hazard rather than routing around today's one
// measured instance of it.

test("N7 (L7) · the exact-verb allow-list runs BEFORE readJson, in source", () => {
  const source = readFileSync(join(E2E_DIR, "bank-close-registers-mock.mjs"), "utf8");
  // #722 — the guard now reads through the shared `matchVerb` helper (mock-dispatch.mjs)
  // rather than a bare `L7_RPC_VERBS.has(verb)`; the SHAPE this cell protects (the guard runs
  // before the read) is unchanged.
  const guardAt = source.indexOf("if (!matchVerb(L7_RPC_VERBS, verb)) return false;");
  const readJsonCallAt = source.indexOf("const body = await readJson(request);");
  assert.ok(guardAt >= 0, "the allow-list guard must still exist in source");
  assert.ok(readJsonCallAt >= 0, "the readJson call it exists to protect must still exist");
  assert.ok(guardAt < readJsonCallAt, "the guard must run BEFORE readJson, or it protects nothing");
});

test("N7 (L7) · a verb this lane does not own leaves the request body COMPLETELY UNTOUCHED", async () => {
  // `list_activity` is #632's own lane's verb — never L7's — and is the EXACT verb the drain
  // hazard was measured against (see this block's own header).
  assert.equal(L7_RPC_VERBS.has("list_activity"), false, "list_activity must not be one of L7's own verbs, or this test proves nothing");

  let asyncIteratorCalls = 0;
  const request: AsyncIterable<Buffer> & { method: string } = {
    method: "POST",
    [Symbol.asyncIterator]: (): AsyncIterator<Buffer> => {
      asyncIteratorCalls += 1;
      let delivered = false;
      return {
        async next() {
          if (delivered) return { value: undefined, done: true };
          delivered = true;
          return { value: Buffer.from(JSON.stringify({ p_client: "c1", p_kinds: ["close"] }), "utf8"), done: false };
        },
      };
    },
  };
  const url = new URL("https://example.test/rest/v1/rpc/list_activity");
  let responded = false;
  const sendJson = () => { responded = true; };

  const handled = await handleL7Supabase(request as never, {} as never, "/rest/v1/rpc/list_activity", url as never, sendJson as never, {} as never);

  assert.equal(handled, false, "a verb L7 does not own must fall through unanswered");
  assert.equal(responded, false, "and must never have sent a response");
  assert.equal(
    asyncIteratorCalls,
    0,
    "the request's stream must never even be OPENED — a later hook's own readJson(request) must see the full, undrained body",
  );
});

// ---------------------------------------------------------------------------
// F-05 (#619) — `fs4-checkout-mock.mjs`'s door-call ledger records only a VERB IT ACTUALLY
// DISPATCHED, not every `/rest/v1/rpc/` POST that reaches it.
// ---------------------------------------------------------------------------
//
// MEASURED: `handleCheckoutMock` is hooked FIRST among every lane in `serve-built.mjs`'s
// dispatch chain (`serve-built.mjs:339`), so EVERY `/rest/v1/rpc/` POST across the WHOLE
// suite — not only FS-4 C-6's own nine doors — reaches `handleCheckoutDoors` before any other
// lane's hook gets a look. The old code pushed `fn` onto `state.doorCalls` unconditionally, at
// the top of that function, before any `fn === "…"` branch had run — so a verb this lane does
// not own (`get_my_preferences`, fired by `MotionPreferenceSync` on EVERY signed-in page,
// including every page the checkout walk visits) was recorded as a "door call" anyway. That
// pollutes the ONE assertion `checkout-gate-walk.spec.ts` makes about a refused request having
// reached NO door (`expect(after.doorCalls).toEqual([])`, `:561`) — the array could carry a
// verb the checkout journey never dispatched at all.
//
// THE FIX is the same allow-list-BEFORE-recording shape `bank-close-registers-mock.mjs`
// already uses for its own five verbs (N7 above): a verb this lane does not recognise returns
// `false` before `state.doorCalls` is ever touched.

test("F-05 · the checkout lane's door-call ledger records only a verb it actually DISPATCHED", async () => {
  const state: { doorCalls: string[] } = { doorCalls: [] };
  let responded = false;
  const sendJson = () => {
    responded = true;
  };
  // `get_my_preferences` — a REAL RPC verb, owned by `serve-built.mjs`'s own generic fixture
  // (`serve-built.mjs:649`), and NOT one of FS-4 C-6's nine checkout doors. Chosen because it is
  // the exact verb this ticket's brief measured firing on every signed-in page.
  const request = { method: "POST" } as unknown as Parameters<typeof handleCheckoutMock>[0]["request"];
  const handled = await handleCheckoutMock({
    request,
    response: {} as never,
    path: "/rest/v1/rpc/get_my_preferences",
    cors: {},
    state: state as never,
    sendJson: sendJson as never,
    readJson: (async () => ({})) as never,
    appOrigin: "https://127.0.0.1:3100",
    accessToken: () => "token",
    subject: "11111111-1111-1111-1111-111111111111",
    registrationId: "22222222-2222-2222-2222-222222222222",
    firmId: "33333333-3333-4333-8333-333333333333",
    signupCode: "654321",
  });

  assert.equal(handled, false, "a verb this lane does not own must fall through unanswered");
  assert.equal(responded, false, "and must never have sent a response");
  assert.deepEqual(
    state.doorCalls,
    [],
    "an unrecognised verb must never be recorded as a door call — it was never DISPATCHED to any door",
  );
});

test("F-05 · a verb the checkout lane DOES own is still recorded — the fix narrows, it does not silence, the ledger", async () => {
  const state = {
    doorCalls: [] as string[],
    legalAccepted: { terms: null, dpa: null },
    legalDraftTerms: false,
    email: "owner@example.test",
  };
  let sent: { status: number; body: unknown } | null = null;
  const sendJson = (_response: unknown, status: number, body: unknown) => {
    sent = { status, body };
  };
  const request = { method: "POST" } as unknown as Parameters<typeof handleCheckoutMock>[0]["request"];
  const handled = await handleCheckoutMock({
    request,
    response: {} as never,
    path: "/rest/v1/rpc/get_current_legal_documents",
    cors: {},
    state: state as never,
    sendJson: sendJson as never,
    readJson: (async () => ({})) as never,
    appOrigin: "https://127.0.0.1:3100",
    accessToken: () => "token",
    subject: "11111111-1111-1111-1111-111111111111",
    registrationId: "22222222-2222-2222-2222-222222222222",
    firmId: "33333333-3333-4333-8333-333333333333",
    signupCode: "654321",
  });

  assert.equal(handled, true, "a checkout door verb must still be handled");
  assert.ok(sent, "and must still have sent a response");
  assert.deepEqual(state.doorCalls, ["get_current_legal_documents"], "and IS still recorded on its own ledger");
});

// ---------------------------------------------------------------------------
// #740 — `journal-work-mock.mjs`'s control leg declines a FOREIGN client via the QUERY
// STRING, before it ever opens the request's own stream — the same N7 shape
// `bank-close-registers-mock.mjs`'s allow-list guard already proves for a verb, applied here to
// an id.
// ---------------------------------------------------------------------------
//
// MEASURED (pre-fix, `journal-work-mock.mjs:643-648`): the control leg read the JSON body via
// `readJson(request)` and THEN checked `body?.client !== JOURNAL_WORK.clientId`, falling
// through on a mismatch — the drain-then-fall-through shape #727's review flagged in
// `chat-parity-mock.mjs`, fixed there by moving the discriminant onto the query string
// (`?thread=`, forwarded verbatim by the app's own same-origin proxy,
// `app/api/runtime/[...path]/route.ts:53`). The same fix applies here: `?client=` is checked
// BEFORE the body is ever read, so a request for a client this lane does not own returns
// `false` with the stream fully intact for whichever hook `serve-built.mjs` calls next.

test("#740 · the journal-work control leg declines a FOREIGN client via the query string, and NEVER opens the request's own stream", async () => {
  let asyncIteratorCalls = 0;
  const request: AsyncIterable<Buffer> & { method: string } = {
    method: "POST",
    [Symbol.asyncIterator]: (): AsyncIterator<Buffer> => {
      asyncIteratorCalls += 1;
      let delivered = false;
      return {
        async next() {
          if (delivered) return { value: undefined, done: true };
          delivered = true;
          return { value: Buffer.from(JSON.stringify({ op: "reset" }), "utf8"), done: false };
        },
      };
    },
  };
  // A client id that is NOT JOURNAL_WORK.clientId — a foreign lane's own control call, or a
  // typo, must never be answered by this lane and must never touch this request's stream.
  const url = new URL("https://example.test/api/e2e-journal-work/control?client=not-this-lanes-client");
  let responded = false;
  const send = () => {
    responded = true;
  };

  const handled = await handleJournalWorkRuntime(
    request as never,
    { writeHead: send, end: send } as never,
    url as never,
  );

  assert.equal(handled, false, "a foreign client's control call must fall through unanswered");
  assert.equal(responded, false, "and must never have sent a response");
  assert.equal(
    asyncIteratorCalls,
    0,
    "the request's stream must never even be OPENED — control() must decide ownership from the query string alone",
  );
});

test("#740 · the journal-work control leg still answers ITS OWN client, by query string", async () => {
  const request: AsyncIterable<Buffer> & { method: string } = {
    method: "POST",
    [Symbol.asyncIterator]: (): AsyncIterator<Buffer> => {
      let delivered = false;
      return {
        async next() {
          if (delivered) return { value: undefined, done: true };
          delivered = true;
          return { value: Buffer.from(JSON.stringify({ op: "reset" }), "utf8"), done: false };
        },
      };
    },
  };
  const url = new URL(`https://example.test/api/e2e-journal-work/control?client=${JOURNAL_WORK.clientId}`);
  let sentBody: unknown = null;
  const response = {
    writeHead: () => undefined,
    end: (body: string) => {
      sentBody = JSON.parse(body);
    },
  };

  const handled = await handleJournalWorkRuntime(request as never, response as never, url as never);

  assert.equal(handled, true, "this lane's own client must still be answered");
  assert.ok(sentBody, "and must still have sent a body");
});

// ---------------------------------------------------------------------------
// #619 AC1 — THE CONCURRENCY COUNTER-EXAMPLE, the DETECTOR the brief asks for rather than a
// permanent `workers: 1` taken on faith.
// ---------------------------------------------------------------------------
//
// WHAT THIS IS NOT: a fix. AC1's binding scope for this ticket is the DETECTOR plus the two
// named fixes (F-05, #740) plus the shared dispatch helper — NOT a rearchitecture of all ten
// lanes for per-worker isolation, and NOT flipping `playwright.config.ts`'s `workers: 1`. This
// section proves WHY that config value is load-bearing today, mechanically, rather than by
// assertion — so a future change that lifts it inherits a measured reason to redesign the
// fixture first, not a guess.
//
// THE MECHANISM. `serve-built.mjs` runs ONE Node HTTPS process for the WHOLE suite, and its
// identity state — `state.email` (`serve-built.mjs:120-124`) — is ONE mutable field with no
// per-connection or per-caller key. `POST /auth/v1/token` (and `/auth/v1/signup`) write it
// UNCONDITIONALLY from the request body (`serve-built.mjs:339,354`:
// `if (typeof body.email === "string") state.email = body.email;`), and `confirmedUser()`
// (`serve-built.mjs:228-238`) reads it back with the same lack of scoping
// (`email: state.email`). Node is single-threaded, but an `async` handler YIELDS at every
// `await` — including the `await readJson(request)` both handlers open with — and it is
// EXACTLY at that yield point that a second, unrelated request's own handler can run to
// completion first. Two callers signing in as two different identities, interleaved across
// that yield, therefore do not get two answers — they get ONE shared slot, and whichever
// caller's write landed LAST is what EVERY caller's next read sees.
//
// THE REPRODUCTION BELOW is not a strawman: it is the same two operations
// (`write-after-await`, then `read`) against the same kind of plain mutable object, driven with
// a REAL microtask yield between the write and the read — not a hand-waved "and now assume a
// race". The structural assertions first pin that the real source still has the shape the
// reproduction models; the executable test after them is the counter-example itself.

test("concurrency counter-example structural pin · state.email is ONE unscoped mutable field, written and read with no per-caller key", () => {
  const source = readFileSync(SERVE_BUILT, "utf8");
  assert.match(
    source,
    /email: "holding@example\.test",/,
    "state.email must still be a single field on the ONE shared `state` object serve-built.mjs declares",
  );
  const tokenWrites = [...source.matchAll(/if \(typeof body\.email === "string"\) state\.email = body\.email;/g)];
  assert.ok(
    tokenWrites.length >= 2,
    "both /auth/v1/signup and /auth/v1/token must still write state.email UNCONDITIONALLY from the body — no per-connection key, which is the property this counter-example depends on",
  );
  assert.match(
    source,
    /function confirmedUser\(\) \{[\s\S]{0,200}email: state\.email,/,
    "confirmedUser() must still read the SAME shared field back, with no request-scoped identity threaded through it",
  );
});

test("concurrency counter-example · two identities racing the SAME shared mutable slot produce an ATTRIBUTABLE LEAK (worker B's email visible in A's read)", async () => {
  // A FAITHFUL, MINIMAL MODEL of `serve-built.mjs`'s own two operations — not the real module
  // (which cannot be imported here: importing it spawns openssl, an HTTPS server and a `next
  // start` child process as a SIDE EFFECT of the import itself). Same shape: one shared mutable
  // object, a write that happens AFTER an `await` (exactly where `await readJson(request)`
  // yields in the real handler), and a read with no per-caller key.
  const state = { email: "holding@example.test" };

  async function signIn(email: string): Promise<void> {
    await Promise.resolve(); // the SAME yield point `await readJson(request)` is in production
    state.email = email; // serve-built.mjs:339 / :354, verbatim shape
  }
  function whoAmI(): string {
    return state.email; // serve-built.mjs:228-238's confirmedUser(), verbatim shape
  }

  // Caller A starts signing in first…
  const a = signIn("alice@example.test");
  // …but caller B's OWN sign-in — a completely unrelated request, on the SAME shared server —
  // is issued before A's has resolved, exactly as two genuinely concurrent HTTP requests would
  // both be mid-flight on ONE Node process.
  const b = signIn("bob@example.test");
  await Promise.all([a, b]);

  // THE LEAK: caller A asked to become alice, and the NEXT read this shared server can give
  // anyone — including a handler still working on A's own original request — is bob's email.
  // There is no way, from this state object alone, for A to tell its own identity from B's.
  const observedByA = whoAmI();
  assert.equal(
    observedByA,
    "bob@example.test",
    "worker B's identity must be observable through the ONE shared slot — this IS the property " +
      "that makes concurrent, per-worker-isolated fixtures unsafe on today's architecture, and " +
      "why playwright.config.ts keeps workers: 1 rather than this PR lifting it on faith",
  );
  assert.notEqual(
    observedByA,
    "alice@example.test",
    "and it must NOT be attributable back to caller A's own request — the leak is the point",
  );
});

// ---------------------------------------------------------------------------
// #619 / #722 — THE RPC VERB-OWNERSHIP CENSUS, generalising N5's per-lane SCOPING rule (does a
// handler fall through on a foreign id?) with a cross-lane OWNERSHIP rule: does more than one
// lane mock answer the SAME RPC verb at all, and if so, is that INTENTIONAL?
// ---------------------------------------------------------------------------
//
// N5 already proves every RPC handler in this suite scopes by the request's own client/id and
// falls through otherwise — which is exactly what makes TWO lanes answering the same verb SAFE
// (whichever one's id matches answers; the other falls through). But "safe when intentional" is
// not "safe when accidental": a NEW lane that happens to pick a verb name another lane already
// answers is silently protected by the SAME discipline today, with nothing recording that the
// name is now shared. This census reads every lane mock's own RPC dispatch — `fn === "…"`,
// `verb === "…"`, or a literal `path === "/rest/v1/rpc/…"` (the three shapes this suite's lanes
// actually use, confirmed against real source below) — and fails when a verb has two or more
// claimants that are not a NAMED, declared share.

const RPC_VERB_OPENER = /(?:verb === "([a-z0-9_]+)"|fn === "([a-z0-9_]+)"|path === "\/rest\/v1\/rpc\/([a-z0-9_]+)")/g;

/** verb -> every lane mock (sorted) whose own dispatch recognises it. */
function rpcVerbCensus(mocks: readonly string[] = LANE_MOCKS): Map<string, string[]> {
  const owners = new Map<string, Set<string>>();
  for (const mock of mocks) {
    const source = readFileSync(join(E2E_DIR, mock), "utf8");
    for (const m of source.matchAll(RPC_VERB_OPENER)) {
      const verb = m[1] ?? m[2] ?? m[3]!;
      const set = owners.get(verb) ?? new Set<string>();
      set.add(mock);
      owners.set(verb, set);
    }
  }
  return new Map([...owners].map(([verb, set]) => [verb, [...set].sort()]));
}

/**
 * The ONLY verbs more than one lane mock may answer, and EXACTLY which lanes — checked
 * pairwise, so a THIRD, undeclared claimant of an already-shared verb still fails. Both entries
 * below are REAL, measured shares (not hypothetical): `journals-table-mock.mjs`'s own header
 * names `list_entry_links` as answered by it and `journal-work-mock.mjs`, one per fixture
 * client; `serve-built.mjs`'s import-block comments (and #627's own note in this file's history)
 * name `list_review_queue` as answered by three lanes, each gated on its own client/scope. Each
 * is safe for the SAME reason N5 proves generally: every handler that answers it falls through
 * on a foreign id, so there is no "winner" — only "whoever's id matched first, in whatever order
 * `serve-built.mjs`'s dispatch chain happens to run them", which the concurrency counter-example
 * above already establishes is not a property to lean on beyond what N5 already buys.
 */
const SHARED_RPC_VERBS: Record<string, string[]> = {
  list_entry_links: ["journal-work-mock.mjs", "journals-table-mock.mjs"],
  list_review_queue: ["journal-work-mock.mjs", "journals-table-mock.mjs", "tax-boundary-mock.mjs"],
  // #624 AC4 — `clara.get_document_state` is read from TWO surfaces by design: the Documents
  // detail panel and the Work detail's Sources tab mount the SAME component over it, because the
  // criterion is "Documents AND Work show the four states". Each lane answers only for the
  // document ids IT minted and falls through otherwise, so the share is a declared one rather than
  // a collision — which is exactly the distinction this census exists to force someone to make.
  get_document_state: ["documents-viewer-mock.mjs", "work-list-mock.mjs"],
  // #643 x #634/#728 — `clara.list_spoken_for_documents` is the EVIDENCE CHOOSER's advisory read,
  // and #643's whole AC3 is that the periodic-adjustment form mounts the composer's own chooser
  // component, so of course the two lanes both answer it. Declared at WAVE-2 INTEGRATION rather
  // than on #643's branch because this census did not exist there — SHARED_RPC_VERBS arrived with
  // wave 1, after #643 branched, so its worker had nothing to declare into.
  // Each lane gates on its OWN client before answering (journal-work-mock.mjs:1624,
  // periodic-adjustment-mock.mjs:320) and falls through otherwise, so neither can answer for the
  // other's walk — which is the distinction between a declared share and a collision.
  list_spoken_for_documents: ["journal-work-mock.mjs", "periodic-adjustment-mock.mjs"],
  // #640 x #631 — `clara.get_work_plan_origin` is read by `<WorkPlanOriginRow>`, which #640 mounts
  // on the SHARED Work detail page, so every lane whose walk opens a Work detail now issues it.
  // Declared at WAVE-3 INTEGRATION: #640's own walk had the only Work detail that reached this row
  // when that branch was cut, and #631's `journal-work` walk (whose #727 hydration cell counts
  // every 4xx among this route's own data reads) is what found the gap. The two lanes answer
  // OPPOSITE facts and each gates on its own Work id first: `plans-mock.mjs` answers a real origin
  // for its plan-admitted Work, `journal-work-mock.mjs` answers the door's own SQL NULL for a Work
  // a human composed by hand. Neither can answer for the other's walk.
  // #727 — `clara.get_work_plan_origin`, the Work detail identity block's "From plan <purpose>"
  // row. `plans-mock.mjs` answers it for its own C9 fixture Work (`PLANS.workId`);
  // `journal-work-mock.mjs` answers NULL for its own two Works (`seededWorkId`,
  // `parkedCardWorkId`), neither of which originated from a plan. Each lane gates on its own
  // work ids and falls through otherwise, so this is a declared share, not a collision.
  get_work_plan_origin: ["journal-work-mock.mjs", "plans-mock.mjs"],
  // #653 x #640 — the FOUR plan lifecycle doors. A prepayment schedule CONFIGURES an
  // `amortisation_schedule` accounting plan, so pause / resume / end / catch-up on it are
  // `clara.pause_accounting_plan` and its siblings called on that plan's id. The web surface
  // reuses #640's own dialogs rather than cutting a prepayment-shaped twin of each — a twin would
  // be two lanes disagreeing about what "paused" means — so of course both mocks answer them.
  // Each side gates on its OWN plan id first (`plans-mock.mjs` on `PLANS.planId`,
  // `prepayments-mock.mjs` on `PREPAY.planId`) and falls through otherwise, so neither can answer
  // for the other's walk — which is the distinction between a declared share and a collision.
  pause_accounting_plan: ["plans-mock.mjs", "prepayments-mock.mjs"],
  resume_accounting_plan: ["plans-mock.mjs", "prepayments-mock.mjs"],
  end_accounting_plan: ["plans-mock.mjs", "prepayments-mock.mjs"],
  request_plan_catch_up: ["plans-mock.mjs", "prepayments-mock.mjs"],
};

/** Every verb with 2+ claimants that is either UNDECLARED, or declared with a DIFFERENT set of
 *  claimants than reality — the two ways this gate can fail. Pure and synchronous so the real
 *  test and its positive control below share one implementation. */
function verbCollisions(census: ReadonlyMap<string, string[]>, declared: Record<string, string[]>): string[] {
  const problems: string[] = [];
  for (const [verb, files] of census) {
    if (files.length <= 1) continue;
    const expected = declared[verb] ? [...declared[verb]].sort() : undefined;
    if (!expected) {
      problems.push(`${verb} is answered by ${files.join(", ")} with no SHARED_RPC_VERBS declaration`);
      continue;
    }
    if (JSON.stringify(files) !== JSON.stringify(expected)) {
      problems.push(`${verb}'s actual claimants (${files.join(", ")}) do not match its declaration (${expected.join(", ")})`);
    }
  }
  return problems;
}

test("verb-ownership census · every RPC verb answered by two or more lane mocks is a NAMED, declared share", () => {
  const census = rpcVerbCensus();
  const shared = [...census].filter(([, files]) => files.length > 1);
  console.log(`  ${census.size} distinct RPC verb(s) censused; ${shared.length} answered by more than one lane mock:`);
  for (const [verb, files] of shared) console.log(`    ${verb}: ${files.join(", ")}`);

  assert.deepEqual(verbCollisions(census, SHARED_RPC_VERBS), []);

  // Neither declaration may rot into documentation of something no longer true: a verb that
  // stopped colliding (a lane dropped it, or renamed it) must leave SHARED_RPC_VERBS.
  for (const [verb, expected] of Object.entries(SHARED_RPC_VERBS)) {
    const actual = census.get(verb) ?? [];
    assert.ok(actual.length > 1, `${verb} is declared shared but only ${actual.length} lane(s) answer it now — drop the declaration`);
    assert.deepEqual(actual, [...expected].sort(), `${verb}'s declared claimants no longer match its real ones`);
  }

  // THE POSITIVE CONTROL ON THE READER ITSELF, over the REAL files: a verb this suite's fixture
  // headers say is genuinely single-owner must census as exactly one file, or the regex above is
  // over- or under-matching.
  assert.deepEqual(census.get("abandon_close"), ["bank-close-registers-mock.mjs"]);
  assert.ok(census.size >= 30, `the census recognised only ${census.size} distinct RPC verbs across ${LANE_MOCKS.length} lane mocks — it is not reading the files`);
});

test("verb-ownership census POSITIVE CONTROL · two undeclared claimants of list_entry_links ARE caught", () => {
  // SYNTHETIC lanes, not the real files: two names that never appear anywhere in
  // SHARED_RPC_VERBS's declared claimant list for `list_entry_links`, proving the gate actually
  // FIRES on a collision rather than only ever finding the two it already knows about.
  const synthetic = new Map<string, string[]>([
    ["list_entry_links", ["fake-lane-a-mock.mjs", "fake-lane-b-mock.mjs"]],
    // A genuinely single-owner verb must NOT be flagged — the control's other half.
    ["abandon_close", ["bank-close-registers-mock.mjs"]],
  ]);
  const problems = verbCollisions(synthetic, SHARED_RPC_VERBS);
  assert.equal(problems.length, 1, `expected exactly one collision, saw: ${problems.join(" | ")}`);
  assert.match(problems[0]!, /list_entry_links/);
  assert.match(problems[0]!, /fake-lane-a-mock\.mjs/);
});
