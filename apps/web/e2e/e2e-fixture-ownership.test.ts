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

import { ACTIVITY, handleActivitySupabase, pageHasWork } from "./activity-mock.mjs";
import { P6_5_SESSIONS } from "./agentic-finish-mock.mjs";
import { handleL7Supabase, L7_RPC_VERBS } from "./bank-close-registers-mock.mjs";
import { handleCheckoutMock } from "./fs4-checkout-mock.mjs";
import {
  EMPTY_WORK_PACK, HOME_WORK_PACK_CLIENT, POPULATED_WORK_PACK, handleHomeBoardSupabase,
} from "./home-board-mock.mjs";
import { JOURNAL_WORK, handleJournalWorkRuntime } from "./journal-work-mock.mjs";
import { hydrateClientWorkPack } from "../lib/work/client-work-pack";

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
  "accrual-mock.mjs",
  "activity-mock.mjs",
  "adjustments-retired-mock.mjs",
  "agentic-finish-mock.mjs",
  "bank-close-registers-mock.mjs",
  "bank-match-mock.mjs",
  "chat-parity-mock.mjs",
  "client-create-mock.mjs",
  "counterparty-identity-mock.mjs",
  "depreciation-mock.mjs",
  "document-correction-mock.mjs",
  "documents-intake-mock.mjs",
  "documents-viewer-mock.mjs",
  "firm-setup-mock.mjs",
  "fixed-asset-mock.mjs",
  "fs4-checkout-mock.mjs",
  "home-board-mock.mjs",
  "intake-batch-mock.mjs",
  "journal-work-mock.mjs",
  "journals-table-mock.mjs",
  "knowledge-mock.mjs",
  "members-lifecycle-mock.mjs",
  "opening-ledger-source-mock.mjs",
  "operator-support-mock.mjs",
  "periodic-adjustment-mock.mjs",
  "plans-mock.mjs",
  "prepayments-mock.mjs",
  "staff-advances-register-mock.mjs",
  "staff-expense-claim-mock.mjs",
  "tax-boundary-mock.mjs",
  "trade-invoice-mock.mjs",
  "work-knowledge-mock.mjs",
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
  // THREE, not two, since #897 — client C's own thread (`P6_5.threadC`, the OPEN-park fixture
  // its #897 mock-lane walk arm needs) joined threadA's and threadB's.
  const own = P6_5_SESSIONS.filter((r) => r.client_id !== null && r.created_by === subject);
  assert.equal(own.length, 3, "the lane's three CLIENT threads are still the caller's own");
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
 *
 * SPEC-1022-1 (wave 3): the same failure mode, a second time, and this time it hid a real
 * unscoped handler. `members-lifecycle-mock.mjs` grew four handlers under `/auth/…` and
 * `/e2e-…` while the commit that added them stated every new handler was scoped — three were
 * invisible here, and the fourth (`/e2e-invite-mail-capture`) was genuinely unscoped on a path
 * `run.mjs` now sets for EVERY e2e run. Both prefixes are recognised from here on. The only
 * other handler this widening newly sees anywhere is `operator-support-mock.mjs`'s own control
 * endpoint, declared below with its reason rather than left silent.
 */
const HANDLER_OPENER = /(?:path === "(\/(?:rest|api|auth)\/[^"]+|\/e2e-[^"]+)"|verb === "([a-z0-9_]+)")/;
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
 * and `open_client_onboarding` (#899; `begin_client_onboarding` before 0287_client_birth_wall.sql
 * re-pointed this lane's own two entrances) takes a free-text name rather than an id — keying on
 * this lane's own string would be scoping by a label, the "spelling is not identity" mistake
 * applied to a fixture. Both are measured to have no other caller in `apps/web/e2e`.
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
  // #656's own lane, the first fixture set for `?tab=opening`. Every handler is gated on this
  // lane's own client, seed or document id and falls through otherwise; its five rpc verbs
  // (`create_opening_seed`, `record_opening_target`, `get_opening_dryrun`, `approve_opening_seed`,
  // `cancel_opening_seed`) are carried by no other lane, measured across `apps/web/e2e`; and its
  // ONE runtime route (`POST /api/opening/parse-targets`) is likewise scoped to its own seed id.
  // It declares NEITHER list, which is the shape a new lane mock should aim for.
  "opening-ledger-source-mock.mjs": { unscopeable: [], debt: [] },
  // #658's own lane (the B3 Work-knowledge walk). `work_knowledge_drift` is a brand-new RPC no
  // other lane calls, and every branch — relation and verb alike — is scoped to this lane's own
  // client id or to one of the two work/task ids it minted, with its own `return false;`
  // fall-through otherwise. Its control endpoint takes its discriminant from the QUERY STRING, so
  // the fall-through happens before the body is drained. It declares NEITHER list, which is the
  // shape a new lane mock should aim for.
  "work-knowledge-mock.mjs": { unscopeable: [], debt: [] },
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
  //
  // A FOURTH joined them when `HANDLER_OPENER` learned `/e2e-…` openers (SPEC-1022-1): this
  // lane's own control endpoint, `POST /e2e-operator/reset`, which every cell in
  // `operator-support-walk.spec.ts` calls first because `workers: 1` gives the file one server and
  // three of its cells decide or resolve a case. It carries no request-borne subject to scope on
  // — its body is empty and its whole job is to put THIS lane's module state back to its
  // starting point — and the path names this lane, so no sibling walk can reach it by accident.
  // It was unscoped and unmeasured before this round; it is unscoped and NAMED now.
  "operator-support-mock.mjs": {
    unscopeable: [
      "/e2e-operator/reset",
      "/rest/v1/rpc/list_operator_support_queue",
      "/rest/v1/rpc/get_admission_capacity",
      "/rest/v1/rpc/set_admission_capacity",
    ],
    debt: [],
  },
  "agentic-finish-mock.mjs": {
    unscopeable: ["/rest/v1/rpc/list_coa_templates", "/rest/v1/rpc/open_client_onboarding"],
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
  // #633's documents-tab + firm-leaf lane. Four verbs are SHARED with chat-parity's lane
  // (which owns the chat composer's own upload): both answer the intake view and the two
  // attribution doors. This lane scopes every one of them — the intake view by id or by
  // the LIST form plus an armed-on-this-client latch, the two doors by the document id in
  // the body — and returns false otherwise, which is why chat-parity's single-row poll and
  // its own three runtime legs are untouched. Declared SHARED rather than owned: two lanes
  // answering one verb is a fact this census exists to record, not to hide.
  "documents-intake-mock.mjs": {
    unscopeable: [
      // The global 240-row capability catalogue and the caller's own context. NEITHER
      // TAKES A SUBJECT AT ALL: `clara.document_capabilities` has no tenant column (that
      // is exactly why the web reads it once per mount and never polls it), and
      // `clara.caller_context`'s predicate takes no argument — it is self-only by
      // construction (0141:541-543). A mock cannot scope a request that carries nothing
      // to scope by.
      "/rest/v1/document_capabilities",
      "/rest/v1/caller_context",
      // `clara.list_unassigned_documents(p_limit)` takes a LIMIT, not a subject: its
      // scope is RLS's, which a mock has no access to.
      "/rest/v1/rpc/list_unassigned_documents",
    ],
    debt: [],
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
  // #636's intake-batch lane. Its ONE PostgREST verb gates on `p_batch` being one of its own three
  // batch ids BEFORE it answers, so there is nothing to declare in either column.
  //
  // THE SAME COVERAGE LIMIT `journal-work-mock.mjs`'s row names, and it is recorded rather than
  // hidden: this lane's TWO runtime routes — `POST /api/intake/batches` and
  // `POST /api/intake/batches/:id/cancel` — are matched with a REGEX because the second carries an
  // id, so this census cannot see either of them at all. The cancel route returns false on a batch
  // id this lane did not mint; the open route is unconditional, because a batch it opens IS its own
  // by construction (it answers with this lane's id and nobody else's walk posts to that path). A
  // green on this row means "every handler the reader can see is scoped", not "this file is clean".
  "intake-batch-mock.mjs": { unscopeable: [], debt: [] },
  // #646's source-correction lane. Every literal-path handler names its own client or its own
  // `c0ee0c0c-` document prefix before it answers, and the RPC half guards on an exact-verb
  // allow-list BEFORE `readJson` and then on its own document/question/correction id — so there is
  // nothing to declare in either column.
  //
  // FIVE OF ITS VERBS ARE SHARED, all five declared in SHARED_RPC_VERBS below: `get_document_state`,
  // `get_document_extract`, `list_source_revisions` and `list_source_dependents` with
  // `documents-viewer-mock.mjs` (the document detail panel reads all four on mount in BOTH lanes),
  // and `record_client_resolution` with `chat-parity-mock.mjs`. This lane answers only for its own
  // document ids and falls through otherwise, which is what makes a shared verb safe here — the N5
  // scan below is what holds them to it, and the census below is what forced them to be NAMED.
  "document-correction-mock.mjs": { unscopeable: [], debt: [] },
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
  // #657 the /bank Matching lane. Its ONE literal-path handler, `/rest/v1/clients`, scopes by
  // `id=eq.<its own client>` and falls through for every other id; all SEVEN of its RPC verbs
  // check `p_client` (or, for the line read, that the line id is one of its own three) before
  // answering, and each returns false otherwise. Nothing here is unscopeable and nothing is debt.
  "bank-match-mock.mjs": { unscopeable: [], debt: [] },
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
  // #650 added the ONE handler in this file the reader can see: `/rest/v1/rpc/get_client_work_pack`,
  // the client home's Work attention band. #902 READS `p_client` now (it was carried and unread,
  // which is exactly why this row was already DEBT rather than "unscopeable" — writing "cannot be
  // scoped" would have been a false reason): ONE dedicated fixture client
  // (`HOME_WORK_PACK_CLIENT`) reads a distinct, POPULATED pack, and every other id — the unscoped
  // default included — keeps #650's honest-empty envelope. It STAYS in this DEBT row rather than
  // moving to "scoped" because the census's mechanical test for "scoped" is a `return false`
  // fall-through, and this door still never takes one: an unanswered id would grow the "could not
  // be read" tile #650's own comment names, on every walk that merely lands on `/clients/:id`. The
  // N4/N5 property still holds — the one id that gets data is a client no other lane mints or
  // navigates to, so nothing in either envelope can be resolved by a sibling walk as its own. A
  // walk that wants a DIFFERENT populated band still overlays its own `page.route`.
  // #659 added the SECOND handler this reader can see: `/rest/v1/rpc/get_firm_portfolio_pack`,
  // Firm Home's own portfolio table. It is UNSCOPEABLE rather than debt, and the distinction is the
  // same one #650's row draws from the other side: that door takes NO client argument at all. Its
  // subject is the caller's own firm, which arrives as a JWT claim rather than as a discriminant in
  // the request, so there is nothing in the body to gate on — unlike `get_client_work_pack`, whose
  // `p_client` is right there and simply not used. It holds no fixture either (zero rows), so the
  // N4/N5 property that makes the rest of this file safe holds for it too, and a walk that wants a
  // POPULATED portfolio overlays its own `page.route`.
  // #660 appends THREE more to the same lane, for the same reason and with the same property.
  // `get_client_financial_pack` and `propose_client_cash_accounts` both carry `p_client`, so both
  // COULD be scoped and are not: their job is to give EVERY client route an honest answer, and the
  // pack verb returns a scalar object, so an unanswered 404 would grow a "could not be read" money
  // band on every walk that merely lands on `/clients/:id`. Neither holds a fixture — the pack is
  // the UNPUBLISHED-cash-set face (`status:'unknown'`, a NULL value, reason
  // `cash_set_unpublished`; never a fabricated `RM 0.00`) and the proposal has no candidates — so
  // there is nothing in either for a sibling walk to resolve as its own.
  // `publish_client_cash_account_set` is a WRITE this lane has nothing to write to; it echoes the
  // receipt shape and changes no state, and a walk that wants the published board overlays its own
  // pack with `page.route`.
  // #1002 appends a FOURTH: `get_client_cash_account_set_members`, the second-pass editor's own
  // read. Same shape as its two `p_client`-carrying siblings above — it COULD be scoped and is
  // not, because its job is the same honest-default one: opening the dialog reads it
  // unconditionally, and an unanswered 404 would grow the editor's own failure banner on every
  // walk that merely opens it. It holds no fixture (a null version, zero members — the same
  // no-published-set face `EMPTY_FINANCIAL_PACK`'s own `cash.set: null` already states), so there
  // is nothing in it for a sibling walk to resolve as its own.
  "home-board-mock.mjs": {
    unscopeable: ["/rest/v1/rpc/get_firm_portfolio_pack"],
    debt: [
      "/rest/v1/rpc/get_client_financial_pack",
      "/rest/v1/rpc/get_client_work_pack",
      "/rest/v1/rpc/propose_client_cash_accounts",
      "/rest/v1/rpc/publish_client_cash_account_set",
      "/rest/v1/rpc/get_client_cash_account_set_members",
    ],
  },
  // #627's D4 lane. Every handler names its own client (six distinct ids as of #997: the
  // original five, one per read state, plus #997's own `clientReceipt`) before it answers, and
  // falls through otherwise — same shape as documents-viewer-mock.mjs above, which is the state
  // a lane mock should be in. #997's four new RPC handlers (the three governed writes plus
  // `get_compliance_watch_disposition`) scope by `p_watch` instead of a client id — the same
  // choice `get_document_state`'s row makes elsewhere in this file for a door whose own subject
  // is a different kind of id — and fall through the same way.
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
  // #644 + #654 — every handler checks an id this lane minted (a client id, a record id or the
  // one missing document id) before it answers, and falls through otherwise; its eight rpc verbs
  // read the body only inside their own verb match. #654's two writes/reads scope the same way:
  // `get_knowledge_applicability` on `p_client`, and `capture_knowledge` on BOTH `p_scope_kind`
  // (firm only — the client lane belongs to no walk here) and the two knowledge keys this lane
  // owns.
  //
  // THE ONE DECLARATION, and it is `list_coa_templates()`'s shape exactly: `clara.list_firm_
  // knowledge()` takes NO arguments at all. A firm register is a read of the SESSION's own firm,
  // so the request carries no subject to key on — keying on this lane's own literal instead would
  // be scoping by a label, the "spelling is not identity" mistake applied to a fixture. Measured:
  // no other lane mock in apps/web/e2e names this verb.
  "knowledge-mock.mjs": { unscopeable: ["/rest/v1/rpc/list_firm_knowledge"], debt: [] },
  // #647's C13 identity lane. Every handler names one of this lane's own four client ids or a
  // counterparty/alias/document id it minted before it answers, and falls through otherwise —
  // its four PostgREST GETs (clients, coa_accounts, client_identifiers, documents) and its seven
  // RPC verbs alike. Each of those seven reads the request body INSIDE its own verb match, never
  // once before the switch, so a POST this lane does not own reaches the next handler with its
  // stream intact. It answers no verb any other lane answers, so it appears in neither
  // SHARED_RPC_VERBS nor either list here.
  "counterparty-identity-mock.mjs": { unscopeable: [], debt: [] },
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
  // #639's C7 acquisition lane. Every handler names this lane's own client id or one of its four
  // asset ids before it answers and falls through otherwise, including all six RPC verbs and the
  // three table reads — the shape a new lane mock aims for, declaring neither list. It claims no
  // unfiltered `/clients` register (the walk navigates by URL) and it has no runtime half at all.
  "fixed-asset-mock.mjs": { unscopeable: [], debt: [] },
  // #651 — every handler is scoped to one of this lane's OWN two client ids (`OURS()`) or to one
  // of its own asset ids (`detailFor()` returns null otherwise), and falls through in every other
  // case, so nothing is declared here. FIVE of its verbs are also answered by
  // `fixed-asset-mock.mjs` — `get_fixed_asset`, `get_depreciation_authority`,
  // `list_depreciation_runs`, `list_fixed_assets` and `fa_register_tie` — and SHARED_RPC_VERBS
  // below is the source of truth for that set rather than this sentence. It reads the
  // POST body through the SHARED `readCachedJson` (`mock-dispatch.mjs`), so declining another
  // lane's client leaves that lane's body fully readable.
  "depreciation-mock.mjs": { unscopeable: [], debt: [] },
  // #648's A5 lane. Every one of its five verbs falls through unless the request carries this
  // lane's own cookie marker, and the three that name a plan check it as well — so it answers for
  // nobody else, and the firm-home tile's `get_firm_setup` on every OTHER walk is served by
  // `serve-built.mjs`'s own honest "nothing outstanding" default instead. The marker IS the
  // subject here rather than a convenience: `get_firm_setup` takes no argument at all (the firm
  // comes from the caller's JWT), so there is nothing else in the request to key on. Nothing to
  // declare.
  "firm-setup-mock.mjs": { unscopeable: [], debt: [] },
  // #649's client-creation lane. Its `/rest/v1/clients` handler is id-scoped, and for its two RPC
  // verbs the NAME is the request's own subject rather than a label for one:
  // `clara.client_identity_candidates(p_name, p_identifier)` and (#899, 0287_client_birth_wall.sql
  // renamed this from `clara.begin_client_onboarding`)
  // `clara.open_client_onboarding(p_name, p_op_key, p_identifier, p_acknowledged_candidate)` carry
  // no id at all. `open_client_onboarding` gates on this lane's three names and falls through for
  // every other, because a SECOND claimant (`agentic-finish-mock.mjs`) answers it for the rest —
  // that is the distinction that lane draws the other way, declaring the verb unscopeable because
  // its own walk does not care which name reached it. `client_identity_candidates` has NO second
  // claimant and the Add-client control asks it before every dispatch on every walk, so this lane
  // answers every
  // OTHER name with the honest arity-0 empty rather than falling through into a 501: an unanswered
  // verb is an outage, and an empty answer carries no fixture a sibling walk could resolve as its
  // own (`home-board-mock.mjs`'s row states the same posture for its own unscoped reads). That is
  // what the `unscopeable` entry below records — not "there is no discriminant in the request",
  // but "scoping this one is what BREAKS a sibling walk", with the reason written in the mock's
  // own source. It is not debt: a debt is a handler that could scope at no cost and does not.
  "client-create-mock.mjs": {
    unscopeable: ["/rest/v1/rpc/client_identity_candidates"],
    debt: [],
  },
  // #638 — every handler is scoped to this lane's own client id (`SEC.clientId`) and falls through
  // otherwise: the PostgREST reads (clients, coa_accounts and staff_advance_accounts by
  // `client_id`; list_staff_expense_claims by `p_client`; get_staff_expense_claim and
  // get_work_claim_origin by ids this module minted), the RUNTIME admission route by
  // `body.clientId`, and the CONTROL ENDPOINT by `body.client` — the guard
  // `periodic-adjustment-mock.mjs` had to be given after a standards review, written in from the
  // start here. The lane answers NEITHER `list_accounting_work` NOR `staff_advance_summary`: both
  // are read by surfaces other lanes drive, and a lane that claimed them would replace their
  // fixtures.
  // #879 — every handler is scoped to this lane's own client id (`SAR.clientId`): the PostgREST
  // reads (clients, coa_accounts, staff_advance_accounts, staff_advances by `client_id`), the
  // three read RPCs (staff_advance_summary/tie/statement by `p_client`), and the four write doors
  // (book/complete/enrol/retire, by `p_client`, with enrol and retire additionally naming the one
  // account code / enrolment id this module owns). It answers no verb any other lane answers —
  // `staff-expense-claim-mock.mjs`'s own header records that it deliberately declines
  // `staff_advance_summary`, leaving it (and its two siblings) to whichever lane owns the
  // register; this is that lane.
  "staff-advances-register-mock.mjs": { unscopeable: [], debt: [] },
  "staff-expense-claim-mock.mjs": { unscopeable: [], debt: [] },
  // #655's C1/C3/C6 trade-invoice lane, built to the same shape: every branch names this lane's
  // own client id or the Work id this module minted before it answers, and falls through
  // otherwise — the three PostgREST reads (clients by id; coa_accounts and counterparties by
  // client_id, the last also by kind, because a sales invoice is recorded against a customer and
  // a supplier bill against a vendor), the ONE RPC it owns exclusively (get_trade_invoice, by
  // p_work), the RUNTIME admission route by body.clientId, and the CONTROL ENDPOINT by
  // body.client. The lane answers NEITHER list_accounting_work NOR list_entry_links: both are
  // read by surfaces other lanes drive, and a lane that claimed them would replace their
  // fixtures. It reads every POST body through this file's cached reader, so declining another
  // lane's request leaves that lane's body fully readable.
  "trade-invoice-mock.mjs": { unscopeable: [], debt: [] },
  // #652's C8 accrual lane, built to that same shape: every branch names this lane's own client id
  // or accrual id before it answers. `list_spoken_for_documents` is SHARED with
  // `periodic-adjustment-mock.mjs` — both lanes mount the same `EvidenceChooser`, which makes the
  // same advisory read — and both scope it by their own `p_client`, so neither can answer for the
  // other. Declared here rather than left implicit, which is what this census is for.
  "accrual-mock.mjs": { unscopeable: [], debt: [] },
  // #653's C8/C9 lane. Every handler names this lane's own client id, schedule id or plan id
  // before it answers and falls through otherwise — the three PostgREST reads (`clients` by `id`,
  // `coa_accounts` and `accounting_work` by `client_id`) and all eight RPC verbs. The
  // `accounting_work` read is the Work DETAIL read's (`lib/work/reads.ts`'s `getAccountingWork`);
  // `journal-work-mock.mjs` and `work-list-mock.mjs` answer the same route for THEIR clients and
  // each falls through on a foreign one. The authority PICKER reads `clara.list_accounting_work`
  // since #809, which this lane answers through `prepaymentWorkListPage`, spliced into
  // `serve-built.mjs`'s single reader for that verb beside the two lanes already there. Four of those verbs are the PLAN
  // lifecycle doors this lane REUSES rather than re-cuts, so they are a declared share with
  // `plans-mock.mjs` below, each side gated on its own plan id.
  "prepayments-mock.mjs": { unscopeable: [], debt: [] },
  // #625's membership-lifecycle lane, declaring neither list. Its scope is the signed-in PERSONA
  // rather than a client id, because the three relations it answers carry no client at all — they
  // are firm-altitude reads keyed on the caller. `serve-built.mjs` passes the address it already
  // tracks and every handler returns false for anybody else's, including the control endpoint,
  // which is scoped on a persona named in its own body. Its RPC half additionally runs an
  // exact-verb allow-list before any branch (`plans-mock.mjs:286`'s shape), so a verb it does not
  // declare falls through with the request body never opened.
  //
  // ITS FOUR NON-`/rest/` HANDLERS ARE CENSUSED SINCE SPEC-1022-1, not merely described here: the
  // acceptance leg's `/auth/v1/verify` (only for `type: "invite"` AND this lane's own token_hash;
  // the CORE branch answers `signup` and 400s the rest), the two #1022 identity-provisioning
  // calls `admin()` makes (`/auth/v1/admin/users`, `/auth/v1/admin/generate_link`) and the #1022
  // mail capture (`/e2e-invite-mail-capture`). `HANDLER_OPENER` reads `/auth/…` and `/e2e-…`
  // openers from this round on, so all four are measured rather than taken on trust — which is
  // how the mail-capture handler's MISSING guard was found: the commit that added it said every
  // new handler was scoped by `ours`, and three of the four were invisible to the instrument that
  // would have contradicted it. The preview door has always been visible (`/rest/v1/rpc/…`).
  "members-lifecycle-mock.mjs": { unscopeable: [], debt: [] },
  // #927's own lane — the retired Adjustments register (`?tab=adjustments`). Every handler
  // (`clients` by `id`, `adjustment_templates`/`adjustment_runs`/`adjustment_pair_reversals` by
  // `client_id`, and the three RPC verbs by `p_client`) names this lane's own client id and falls
  // through otherwise. Declares neither list, the shape a new lane mock should aim for.
  "adjustments-retired-mock.mjs": { unscopeable: [], debt: [] },
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
// BODY-READER CENSUS (#862) — a private, per-file POST-body reader is the exact anti-pattern
// this file's N7 cells above exist to guard AROUND: `readCachedJson` (`mock-dispatch.mjs`)
// parses the body once and caches it on the request object, so any dispatch order across the
// shared `serve-built.mjs` server reads back the SAME value; a private reader that drains the
// raw stream (cached or not) is a second implementation of that contract, and #633/#647/#653
// each independently rediscovered the hazard before this census existed to catch the next one
// mechanically. This is a STRUCTURAL scan (source text), not a behavioural one — it does not
// run any mock, it only reads what each one imports and defines.
// ---------------------------------------------------------------------------

/** A mock defining its OWN async body-reading function instead of importing the shared one —
 *  either a `function readJson(...)` declaration, or the same name bound to an `async` arrow
 *  (the review-round L01-SPEC-03 gap: a mock that spells the identical private reader as
 *  `const readJson = async (request) => {...}` sailed through the declaration-only pattern). An
 *  alias of the shared reader itself (`const readJson = readCachedJson;`, `documents-intake-mock.mjs`'s
 *  own shape) does NOT match: there is no `async` and no `(` right after the `=`. */
const PRIVATE_BODY_READER_FUNCTION =
  /\b(?:export\s+)?(?:async\s+)?function\s+(readJson|readBody)\s*\(|\b(?:const|let)\s+(readJson|readBody)\s*=\s*async\s*\(/;
/**
 * A mock draining the request stream directly rather than through any named function at all —
 * either the raw `request.on("data"/"end")` event pair, or a bare `for await (const x of
 * request)` loop (the review-round L01-SPEC-03 gap: `readCachedJson` itself is written this way,
 * so a lane that copies the LOOP instead of the FUNCTION reads the same stream by hand and stays
 * invisible). The `(?<!`)` guard excludes the shape when it is quoted in backtick-fenced prose —
 * `periodic-adjustment-mock.mjs`, `staff-expense-claim-mock.mjs`, `trade-invoice-mock.mjs` and
 * `work-list-mock.mjs` all describe `readCachedJson`'s own mechanism this way in a header comment
 * (` `` `for await (const chunk of request)` `` `), and none of them defines a second reader —
 * flagging prose that merely NAMES the shared implementation would be a false positive, not a
 * private reader.
 */
const PRIVATE_BODY_READER_STREAM =
  /request\.on\(\s*["'](?:data|end)["']|(?<!`)\bfor\s+await\s*\(\s*const\s+\w+\s+of\s+request\s*\)/;

/**
 * `null` when `source` (the text of a `*-mock.mjs` file, real or synthetic) reads its POST body
 * only through the shared `readCachedJson`; otherwise a one-line reason naming `mock` and the
 * private shape found. Pure and synchronous so the real census below and its synthetic positive
 * controls share one implementation — the same split `verbCollisions` (above) uses.
 */
function bodyReaderViolation(mock: string, source: string): string | null {
  const fnMatch = PRIVATE_BODY_READER_FUNCTION.exec(source);
  if (fnMatch) {
    const name = fnMatch[1] ?? fnMatch[2];
    return `${mock} defines its own ${name}(...) instead of importing readCachedJson from mock-dispatch.mjs`;
  }
  if (PRIVATE_BODY_READER_STREAM.test(source)) {
    return `${mock} reads the request stream directly (request.on("data"/"end"), or a bare "for await" drain) instead of importing readCachedJson from mock-dispatch.mjs`;
  }
  return null;
}

function bodyReaderCensus(mocks: readonly string[] = LANE_MOCKS): string[] {
  const violations: string[] = [];
  for (const mock of mocks) {
    const source = readFileSync(join(E2E_DIR, mock), "utf8");
    const violation = bodyReaderViolation(mock, source);
    if (violation) violations.push(violation);
  }
  return violations;
}

test("body-reader census · no lane mock defines its own private request-body reader", () => {
  assert.deepEqual(bodyReaderCensus(), []);
});

test("body-reader census POSITIVE CONTROL · a synthetic private readJson(...) IS caught", () => {
  // SYNTHETIC source, not a real file — the exact shape #633/#647/#653 each fixed independently
  // and `fixed-asset-mock.mjs` carried until #651 repointed it incidentally (this ticket's own
  // history, told in the ticket comments rather than repeated here).
  const synthetic = [
    "async function readJson(request) {",
    "  const chunks = [];",
    "  for await (const chunk of request) chunks.push(chunk);",
    "  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};",
    "}",
  ].join("\n");
  const violation = bodyReaderViolation("fake-lane-mock.mjs", synthetic);
  assert.match(violation ?? "", /fake-lane-mock\.mjs/);
  assert.match(violation ?? "", /readJson/);
});

test("body-reader census POSITIVE CONTROL · a synthetic raw request.on(\"data\") reader IS caught", () => {
  const synthetic = [
    "function readBodyRaw(request) {",
    '  let data = "";',
    '  request.on("data", (chunk) => { data += chunk; });',
    '  request.on("end", () => {});',
    "}",
  ].join("\n");
  const violation = bodyReaderViolation("fake-lane-mock.mjs", synthetic);
  assert.match(violation ?? "", /fake-lane-mock\.mjs/);
});

test("body-reader census POSITIVE CONTROL · a synthetic arrow-assigned readJson IS caught (L01-SPEC-03)", () => {
  // The shape the review found genuinely invisible: the same private reader as the first
  // POSITIVE CONTROL above, spelled as an `async` arrow bound to `readJson` instead of a
  // `function readJson(...)` declaration. `documents-intake-mock.mjs`'s real
  // `const readJson = readCachedJson;` alias must NOT match this — see the third control below.
  const synthetic = [
    "const readJson = async (request) => {",
    "  const chunks = [];",
    "  for await (const chunk of request) chunks.push(chunk);",
    "  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};",
    "};",
  ].join("\n");
  const violation = bodyReaderViolation("fake-lane-mock.mjs", synthetic);
  assert.match(violation ?? "", /fake-lane-mock\.mjs/);
  assert.match(violation ?? "", /readJson/);
});

test("body-reader census POSITIVE CONTROL · a synthetic bare \"for await\" stream drain IS caught (L01-SPEC-03)", () => {
  // `readCachedJson` itself (`mock-dispatch.mjs`) is written as `for await (const chunk of
  // request)`, so a lane that copies the LOOP under any function name (not only `readJson`/
  // `readBody`) reads the same stream by hand and was invisible to the pre-fix census — the
  // exact shape `chat-parity-mock.mjs`'s and `documents-intake-mock.mjs`'s own `drain(request)`
  // used before this round repointed them onto the shared reader.
  const synthetic = [
    "async function drain(request) {",
    "  for await (const chunk of request) void chunk;",
    "}",
  ].join("\n");
  const violation = bodyReaderViolation("fake-lane-mock.mjs", synthetic);
  assert.match(violation ?? "", /fake-lane-mock\.mjs/);
  assert.match(violation ?? "", /for await/);
});

test("body-reader census NEGATIVE CONTROL · backtick-quoted PROSE naming \"for await\" does NOT trip the census", () => {
  // The real shape `periodic-adjustment-mock.mjs`, `staff-expense-claim-mock.mjs`,
  // `trade-invoice-mock.mjs` and `work-list-mock.mjs` all carry today: a header comment that
  // NAMES `readCachedJson`'s own mechanism in backtick-fenced prose. None of the four defines a
  // second reader, so this must read as clean.
  const synthetic = [
    "import { readCachedJson } from \"./mock-dispatch.mjs\";",
    "",
    "/** Whichever lane read the body first wins the parse: `for await (const chunk of request)`",
    " *  drains the stream exactly once, so an uncached second reader would see `{}`. */",
    "async function handle(request) {",
    "  return readCachedJson(request);",
    "}",
  ].join("\n");
  assert.equal(bodyReaderViolation("fake-lane-mock.mjs", synthetic), null);
});

test("body-reader census · importing the shared readCachedJson does NOT trip the census", () => {
  const synthetic = [
    'import { readCachedJson } from "./mock-dispatch.mjs";',
    "async function handle(request) {",
    "  const body = await readCachedJson(request);",
    "  return body;",
    "}",
  ].join("\n");
  assert.equal(bodyReaderViolation("fake-lane-mock.mjs", synthetic), null);
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
// `verb === "…"`, a literal `path === "/rest/v1/rpc/…"`, its guard-and-return mirror
// `path !== "/rest/v1/rpc/…"` (measured: `intake-batch-mock.mjs`'s single-verb early return was
// invisible to the three-shape opener until #863 widened it, closing a REAL, not hypothetical,
// blind spot), and the historical `rpc === "…"` spelling #646's fix round found in
// `document-correction-mock.mjs` and closed by RENAMING the file rather than widening this
// opener (so the opener itself stayed blind to that shape) — and fails when a verb has two or
// more claimants that are not a NAMED, declared share.

const RPC_VERB_OPENER =
  /(?:verb === "([a-z0-9_]+)"|fn === "([a-z0-9_]+)"|rpc === "([a-z0-9_]+)"|path (?:===|!==) "\/rest\/v1\/rpc\/([a-z0-9_]+)")/g;

/**
 * The SIXTH dispatch spelling (review-round L01-SPEC-02 fix): an ARRAY of `/rest/v1/rpc/<verb>`
 * strings consumed through `NAME.includes(path)` — `home-board-mock.mjs`'s own `EMPTY_RPCS`,
 * measured to carry SIX verbs, five of which are ALSO answered (under a spelling
 * `RPC_VERB_OPENER` already recognises) by another lane mock entirely — real multi-claimant
 * verbs the opener above reports as single-owner because it never looks inside an array
 * literal. Two passes, because the shape IS two things: a declaration (the array) and a
 * SEPARATE call-site (`.includes(path)`) — every other opener spelling above is one inline
 * conditional.
 */
const ARRAY_MEMBERSHIP_DISPATCH = /\b([A-Za-z_$][A-Za-z0-9_$]*)\.includes\(path\)/g;

function arrayMembershipVerbs(source: string): string[] {
  const verbs: string[] = [];
  for (const [, arrayName] of source.matchAll(ARRAY_MEMBERSHIP_DISPATCH)) {
    const decl = new RegExp(`\\bconst\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`).exec(source);
    if (!decl) continue;
    for (const [, verb] of decl[1]!.matchAll(/\/rest\/v1\/rpc\/([a-z0-9_]+)/g)) verbs.push(verb!);
  }
  return verbs;
}

/** Every RPC verb `source` (a lane mock's text, real or synthetic) declares an opener for, in the
 *  order matched. Pure and synchronous so the real census and its synthetic positive controls
 *  below share one implementation — the same split `verbCollisions` and `bodyReaderViolation`
 *  (above) use. */
function verbsInSource(source: string): string[] {
  return [
    ...[...source.matchAll(RPC_VERB_OPENER)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]!),
    ...arrayMembershipVerbs(source),
  ];
}

/** verb -> every lane mock (sorted) whose own dispatch recognises it. */
function rpcVerbCensus(mocks: readonly string[] = LANE_MOCKS): Map<string, string[]> {
  const owners = new Map<string, Set<string>>();
  for (const mock of mocks) {
    const source = readFileSync(join(E2E_DIR, mock), "utf8");
    for (const verb of verbsInSource(source)) {
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
  list_entry_links: ["journal-work-mock.mjs", "journals-table-mock.mjs", "work-knowledge-mock.mjs"],
  // #658 x #631 — the Work-knowledge lane renders the SAME Diagnostics section the journal-work
  // lane does, because B3's Work detail mounts it for every Work. Each lane answers only for the
  // work ids IT minted and falls through otherwise (journal-work-mock.mjs:1401-1405's
  // `state.works.get(workId) === undefined` guard; work-knowledge-mock.mjs's two explicit ids),
  // so the share is a declared one rather than a collision.
  get_work_execution_trace: ["journal-work-mock.mjs", "work-knowledge-mock.mjs"],
  // #658 x #629 — B3's Work detail mounts `WorkQuestionPanel` for every parked Work, so the three
  // question doors are read by any lane whose fixture Work is `awaiting_input`. The journal-work
  // lane answers for its own question id and this lane for its own single one
  // (work-knowledge-mock.mjs's `WK.questionId`), and both fall through otherwise. The WRITE is a
  // declared share for the same reason and with the same scoping: `answer_work_question` is
  // refused by each lane for a question it did not mint, so neither can accept the other's answer.
  get_work_pending_question: ["journal-work-mock.mjs", "work-knowledge-mock.mjs"],
  get_work_question: ["journal-work-mock.mjs", "work-knowledge-mock.mjs"],
  answer_work_question: ["journal-work-mock.mjs", "work-knowledge-mock.mjs"],
  list_review_queue: ["journal-work-mock.mjs", "journals-table-mock.mjs", "tax-boundary-mock.mjs"],
  // #624 AC4 — `clara.get_document_state` is read from TWO surfaces by design: the Documents
  // detail panel and the Work detail's Sources tab mount the SAME component over it, because the
  // criterion is "Documents AND Work show the four states". Each lane answers only for the
  // document ids IT minted and falls through otherwise, so the share is a declared one rather than
  // a collision — which is exactly the distinction this census exists to force someone to make.
  // #633 joins them as a THIRD, for the same reason and with the same scoping: its walk opens the
  // documents-tab detail to read the file -> Work boundary, and that panel's four verdicts come
  // from this RPC. It answers only for its own two documents, and it reads the POST body through
  // the SHARED `readCachedJson` (`mock-dispatch.mjs`), so declining another lane's document leaves
  // that lane's body fully readable.
  get_document_state: ["document-correction-mock.mjs", "documents-intake-mock.mjs", "documents-viewer-mock.mjs", "work-list-mock.mjs"],
  // #646 x #624 — the source-correction lane renders the SAME document detail panel as the
  // documents-viewer lane, so the four reads that panel issues on mount are answered by both.
  // `document-correction-mock.mjs` gates on its own `c0ee0c0c-` document ids
  // (document-correction-mock.mjs:329, :354, :365, :504) and `documents-viewer-mock.mjs` on its
  // own `DOCUMENT_STATES` map / `LANE_DOCUMENT_PREFIX` (documents-viewer-mock.mjs:513, :536, :551,
  // :561); neither can answer for the other's walk, which is what makes these declared shares
  // rather than collisions.
  // #651 x #639 — the depreciation lane renders the SAME asset detail and the SAME authority and
  // runs panels as the acquisition lane, so the three reads those surfaces issue on mount are
  // answered by both. `fixed-asset-mock.mjs` gates on its own `FA.clientId` / asset ids and
  // `depreciation-mock.mjs` on its own two client ids and its own asset id; neither can answer
  // for the other's walk, which is what makes these declared shares rather than collisions.
  get_fixed_asset: ["depreciation-mock.mjs", "fixed-asset-mock.mjs"],
  get_depreciation_authority: ["depreciation-mock.mjs", "fixed-asset-mock.mjs"],
  list_depreciation_runs: ["depreciation-mock.mjs", "fixed-asset-mock.mjs"],
  list_fixed_assets: ["depreciation-mock.mjs", "fixed-asset-mock.mjs"],
  fa_register_tie: ["depreciation-mock.mjs", "fixed-asset-mock.mjs"],
  get_document_extract: ["document-correction-mock.mjs", "documents-viewer-mock.mjs"],
  list_source_dependents: ["document-correction-mock.mjs", "documents-viewer-mock.mjs"],
  list_source_revisions: ["document-correction-mock.mjs", "documents-viewer-mock.mjs"],
  // #646 x the chat-parity lane — the wrong-client wizard's first step calls `record_client_resolution`
  // (correction-wizard.tsx:146), which the chat-parity lane already answered. THE TWO ARMS ARE NOT
  // SYMMETRIC and the asymmetry is declared, not glossed: #646's arm gates on its own
  // `p_subject` (document-correction-mock.mjs:479) and falls through otherwise, while
  // chat-parity's answers unconditionally — already recorded as DEBT in this file's own table
  // above ("/rest/v1/rpc/record_client_resolution"). chat-parity is dispatched FIRST
  // (serve-built.mjs:576 vs :580), so it is chat-parity's `resolution_id` that #646's walk
  // actually receives. Harmless today only because no cell asserts on that id — the wizard uses
  // it as an opaque handle. If chat-parity's debt is ever paid by scoping that handler, #646's
  // own arm takes over and the walk is unchanged; that is why the correct move here was to
  // declare the share rather than delete either arm.
  // WAVE INTEGRATION: #633 is the THIRD claimant of this same verb — its own comment block
  // below says why — so the three arms are declared here as ONE row rather than as two
  // rows one of which TypeScript would silently drop (TS1117).
  record_client_resolution: [
    "chat-parity-mock.mjs", "document-correction-mock.mjs", "documents-intake-mock.mjs",
  ],
  // #643 x #634/#728 — `clara.list_spoken_for_documents` is the EVIDENCE CHOOSER's advisory read,
  // and #643's whole AC3 is that the periodic-adjustment form mounts the composer's own chooser
  // component, so of course the two lanes both answer it. Declared at WAVE-2 INTEGRATION rather
  // than on #643's branch because this census did not exist there — SHARED_RPC_VERBS arrived with
  // wave 1, after #643 branched, so its worker had nothing to declare into.
  // Each lane gates on its OWN client before answering (journal-work-mock.mjs:1624,
  // periodic-adjustment-mock.mjs:320) and falls through otherwise, so neither can answer for the
  // other's walk — which is the distinction between a declared share and a collision.
  // #633 joins them: the document detail's file-to-Work panel reads the SAME advisory door
  // for the claimant half of an evidence link. It gates on its own client id before
  // answering and falls through otherwise, exactly as the other two do.
  // #652 joins the same share at WAVE-4 INTEGRATION and for the identical reason: the accrual form
  // mounts the SAME `EvidenceChooser` component (an accrual may cite the invoice its term was read
  // from), so it makes the same advisory read. `accrual-mock.mjs` gates on `ACC.clientId` before
  // answering and falls through otherwise, so it can answer for neither of the other two.
  list_spoken_for_documents: [
    "accrual-mock.mjs", "documents-intake-mock.mjs", "journal-work-mock.mjs",
    "periodic-adjustment-mock.mjs", "work-knowledge-mock.mjs",
  ],
  // #633 x the chat-parity train — THE ATTRIBUTION PAIR, answered by two lanes because two
  // surfaces perform the same act: the chat composer files what it just attached, and the
  // documents tab / firm leaf file what a person just chose. `chat-parity-mock.mjs` answers
  // both unconditionally (its own declared debt, above); `documents-intake-mock.mjs` gates on
  // the document id in the body — `p_subject` for the resolution, `p_document` for the filing
  // — and returns false for anything that is not one of its own two documents, so it cannot
  // answer for the composer's walk. Declared as a share rather than left to collide: two lanes
  // on one verb is a fact this census exists to record.
  // (declared once, above, with all three claimants.)
  // #633 x #646, FOUND AT WAVE INTEGRATION by this very census — neither branch could see it.
  // `clara.set_document_kind` is answered by two lanes because two surfaces perform the act: #646
  // moved the DETAIL surface's kind change into `document-kind-dialog.tsx`, and #633 mounts the
  // same door from the firm intake list and receipt rows (`document-kind-control.tsx`). Each lane
  // gates on document ids it minted before it answers — `document-correction-mock.mjs` on
  // `CORR.doc` / `CORR.docOrphan`, `documents-intake-mock.mjs` on its own unassigned document and
  // the ids its upload handler issued — and both fall through otherwise, so neither can answer
  // for the other's walk. A declared share, not a collision.
  set_document_kind: ["document-correction-mock.mjs", "documents-intake-mock.mjs"],
  file_document: ["chat-parity-mock.mjs", "documents-intake-mock.mjs"],
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
  get_work_plan_origin: ["journal-work-mock.mjs", "plans-mock.mjs", "work-knowledge-mock.mjs"],
  // #649 x P6-5 — `clara.open_client_onboarding` is the ONE door that creates a client (#899,
  // 0287_client_birth_wall.sql renamed it from `clara.begin_client_onboarding`, which both mocks
  // answered under the same shape before), so any lane whose walk creates one answers it. The two
  // answer for DIFFERENT names and the door's SUBJECT-carrying argument is the free-text name, not
  // an id: `client-create-mock.mjs` gates on its own three names and falls through for every
  // other, `agentic-finish-mock.mjs` answers whatever is left (it declares the verb unscopeable
  // above, because its own walk does not care which name reached it). ORDER IS LOAD-BEARING and is
  // stated at the hook in `serve-built.mjs`: the scoped lane runs FIRST, or a #649 name would be
  // born into the other lane's fixture.
  open_client_onboarding: ["agentic-finish-mock.mjs", "client-create-mock.mjs"],
  // #638 — `clara.get_work_claim_origin` is the Work detail identity block's "Staff expense claim"
  // row, and it is read on EVERY Work detail for the same structural reason the plan-origin row
  // above is: a claim is admitted with purpose `journal_entry` (migration 0221 states why a fourth
  // purpose cannot post through the estate's closed posting core), so the purpose alone cannot say
  // what a Work IS and the surface has to ask. The three lanes answer OPPOSITE facts and each gates
  // on its own Work ids first: `staff-expense-claim-mock.mjs` answers a real claim for its own
  // register rows, while `journal-work-mock.mjs` and `plans-mock.mjs` answer the door's own SQL
  // NULL for Works that are not claims. Neither can answer for another lane's walk.
  get_work_claim_origin: [
    "journal-work-mock.mjs", "plans-mock.mjs", "staff-expense-claim-mock.mjs", "work-knowledge-mock.mjs",
  ],
  // #930 — `clara.staff_advance_summary` used to be answered by ONE lane (`staff-advances-register
  // -mock.mjs`, for the register's own allocation editor) and deliberately declined by the other;
  // #930 gave the staff-expense-claim form's own advance-application arm a CHOOSER fed by that same
  // read, so a SECOND lane now answers it too. Each gates on `p_client` before answering —
  // `staff-advances-register-mock.mjs` on `SAR.clientId`, `staff-expense-claim-mock.mjs` on
  // `SEC.clientId` — and falls through otherwise, so neither can answer for the other's walk.
  staff_advance_summary: ["staff-advances-register-mock.mjs", "staff-expense-claim-mock.mjs"],
  // WAVE 2026-09-18, INTEGRATION — the two OTHER doors the Work detail now reads on EVERY mount,
  // for the same structural reason get_work_claim_origin above is read: a trade invoice and a
  // knowledge read-set are both invisible in accounting_work.purpose, so the surface has to ask.
  // The owning lane answers a real row for its own Work ids; journal-work-mock.mjs answers the
  // door's own honest-empty value (SQL NULL / the 0230:845-848 no-observation envelope) for its
  // two, and every arm falls through on a foreign id. clara.intake_batch_members is a RELATION
  // read, not an rpc, so the census below cannot see it and it carries no row here — its arm in
  // journal-work-mock.mjs states the same gate.
  get_trade_invoice: ["journal-work-mock.mjs", "trade-invoice-mock.mjs"],
  work_knowledge_drift: ["journal-work-mock.mjs", "work-knowledge-mock.mjs"],
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
  // REVIEW-ROUND L01-SPEC-02 — five of home-board-mock.mjs's own `EMPTY_RPCS` array-dispatched
  // verbs are ALSO answered by the lane that actually owns the fixture, a real share the
  // pre-#863-fix-round census could not see at all (an array literal consumed through
  // `.includes(path)`, not an inline `verb === "…"`/`fn === "…"`/`path === "…"` conditional).
  // `serve-built.mjs`'s own dispatch-order comment already named this exact hazard and pinned
  // `home-board-mock.mjs` LAST among these three lanes for it — DISPATCH ORDER IS LOAD-BEARING,
  // not this declaration: `bank-close-registers-mock.mjs`, `bank-match-mock.mjs` and
  // `documents-viewer-mock.mjs` each gate on their own client/subject before answering and fall
  // through otherwise; `home-board-mock.mjs` answers ALL FIVE unconditionally through
  // `EMPTY_RPCS`, which is safe ONLY because its hook runs after all three (see
  // `serve-built.mjs`'s own comment at the `handleP657Supabase`/`handleHomeBoardSupabase` calls,
  // now updated to say the census CAN see this share and requires the declaration below, not
  // that it cannot). `list_bank_account_proposals` — `EMPTY_RPCS`'s sixth verb — has no second
  // claimant today and stays undeclared, correctly a single-owner verb.
  list_fiscal_years: ["bank-close-registers-mock.mjs", "home-board-mock.mjs"],
  list_agent_act_receipts: ["bank-close-registers-mock.mjs", "home-board-mock.mjs"],
  list_bank_accounts: ["bank-match-mock.mjs", "home-board-mock.mjs"],
  list_bank_statements: ["bank-match-mock.mjs", "home-board-mock.mjs"],
  list_uncoded_filings: ["documents-viewer-mock.mjs", "home-board-mock.mjs"],
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

// --- RPC-OPENER SPELLING CENSUS (#863) -----------------------------------------
//
// The three shapes above (`verb ===`, `fn ===`, literal `path === "/rest/v1/rpc/…"`) are not
// the only ones a lane mock's dispatch has actually used. `document-correction-mock.mjs` once
// spelled it `rpc === "…"` (found and fixed by RENAMING the variable, #646's fix round — the
// opener itself stayed blind to that spelling); `intake-batch-mock.mjs` spells its ONE verb as a
// guard-and-return, `path !== "/rest/v1/rpc/get_intake_batch"`, which is the mirror image of the
// literal shape and was — before this ticket — genuinely invisible to `RPC_VERB_OPENER`, a REAL
// blind spot measured on today's tree, not a hypothetical one. These cells prove both spellings
// are now recognised, and that the real, previously-invisible verb is now counted.

test("RPC-opener census · the historical `rpc === \"…\"` spelling is recognised", () => {
  // SYNTHETIC source — the exact spelling #646's fix round found and closed by renaming the
  // variable rather than widening the opener, so the opener itself never had to prove it could
  // see this shape until now.
  const synthetic = 'if (request.method === "POST" && rpc === "duplicate_verb") { return true; }';
  assert.deepEqual(verbsInSource(synthetic), ["duplicate_verb"]);
});

test("RPC-opener census · the guard-and-return `path !== \"/rest/v1/rpc/…\"` spelling is recognised", () => {
  // SYNTHETIC source, modelled on intake-batch-mock.mjs's real one-liner (measured below against
  // the real file too, not only here).
  const synthetic = 'if (request.method !== "POST" || path !== "/rest/v1/rpc/get_intake_batch") return false;';
  assert.deepEqual(verbsInSource(synthetic), ["get_intake_batch"]);
});

test("RPC-opener census · a mock mixing every recognised spelling in one file loses none of them", () => {
  const synthetic = [
    'if (verb === "a_verb") {}',
    'if (fn === "b_verb") {}',
    'if (path === "/rest/v1/rpc/c_verb") {}',
    'if (path !== "/rest/v1/rpc/d_verb") return false;',
    'if (rpc === "e_verb") {}',
  ].join("\n");
  assert.deepEqual(verbsInSource(synthetic), ["a_verb", "b_verb", "c_verb", "d_verb", "e_verb"]);
});

test("RPC-opener census · intake-batch-mock.mjs's real get_intake_batch verb is no longer invisible", () => {
  // NOT synthetic: the real file, the real blind spot #863 closes. Before the widening this verb
  // was absent from rpcVerbCensus() entirely (zero openers matched anywhere in the file) — a
  // second, undeclared claimant using a RECOGNISED spelling would have censused as sole owner.
  const census = rpcVerbCensus();
  assert.deepEqual(census.get("get_intake_batch"), ["intake-batch-mock.mjs"]);
});

test("RPC-opener census · a synthetic rpc === \"…\" claimant and a synthetic path !== \"…\" claimant of the SAME undeclared verb are BOTH extracted AND flagged as a collision", () => {
  // Fix round (L01-S3): the four cells above stop at `verbsInSource()` extraction — none of them
  // is ever carried through to `verbCollisions`, so #863's own AC1 ("RED before / GREEN after,
  // feeding the CENSUS a synthetic source") was only half built. This cell walks the SAME two
  // spellings all the way to the collision gate, exactly as `rpcVerbCensus()` itself would: parse
  // each synthetic source with `verbsInSource`, invert into `verb -> files`, then run
  // `verbCollisions`. `list_entry_links` is deliberately the REAL declared share
  // (`SHARED_RPC_VERBS` above) — using it under two claimant NAMES that are not on that declared
  // list is exactly the shape a real regression would take: a widened opener finding a genuine
  // extra or differently-spelled claimant nobody declared, not a made-up verb no real collision
  // gate would ever see.
  const sources: Record<string, string> = {
    "synthetic-rpc-claimant-mock.mjs": 'if (request.method === "POST" && rpc === "list_entry_links") { return true; }',
    "synthetic-guard-claimant-mock.mjs": 'if (request.method !== "POST" || path !== "/rest/v1/rpc/list_entry_links") return false;',
  };
  const owners = new Map<string, Set<string>>();
  for (const [file, source] of Object.entries(sources)) {
    for (const verb of verbsInSource(source)) {
      const set = owners.get(verb) ?? new Set<string>();
      set.add(file);
      owners.set(verb, set);
    }
  }
  // BOTH spellings were actually extracted, before the collision is even checked.
  assert.deepEqual([...owners.keys()], ["list_entry_links"]);
  const synthetic = new Map([...owners].map(([verb, set]) => [verb, [...set].sort()]));

  const problems = verbCollisions(synthetic, SHARED_RPC_VERBS);
  assert.equal(problems.length, 1, `expected exactly one collision, saw: ${problems.join(" | ")}`);
  assert.match(problems[0]!, /list_entry_links/);
  assert.match(problems[0]!, /synthetic-guard-claimant-mock\.mjs/);
  assert.match(problems[0]!, /synthetic-rpc-claimant-mock\.mjs/);
});

test("RPC-opener census · the SAME synthetic pair, corrected, produces ZERO problems (L01-SPEC-04)", () => {
  // AC1's other, previously-missing half: the cell above is the RED side (a synthetic
  // undeclared collision IS flagged); this is the GREEN side (the synthetic source, corrected,
  // is NOT flagged) — without it, a `verbCollisions` that flagged EVERYTHING would still pass
  // the RED cell alone. Two real corrections, both checked: dropping to a single claimant, and
  // naming both claimants on a declared share.
  const soleSource: Record<string, string> = {
    "synthetic-rpc-claimant-mock.mjs": 'if (request.method === "POST" && rpc === "list_entry_links") { return true; }',
  };
  const soleOwners = new Map<string, Set<string>>();
  for (const [file, source] of Object.entries(soleSource)) {
    for (const verb of verbsInSource(source)) {
      const set = soleOwners.get(verb) ?? new Set<string>();
      set.add(file);
      soleOwners.set(verb, set);
    }
  }
  const soleCensus = new Map([...soleOwners].map(([verb, set]) => [verb, [...set].sort()]));
  assert.deepEqual(
    verbCollisions(soleCensus, SHARED_RPC_VERBS), [],
    "a single claimant must never be flagged as a collision",
  );

  const pairSources: Record<string, string> = {
    "synthetic-rpc-claimant-mock.mjs": 'if (request.method === "POST" && rpc === "list_entry_links") { return true; }',
    "synthetic-guard-claimant-mock.mjs": 'if (request.method !== "POST" || path !== "/rest/v1/rpc/list_entry_links") return false;',
  };
  const pairOwners = new Map<string, Set<string>>();
  for (const [file, source] of Object.entries(pairSources)) {
    for (const verb of verbsInSource(source)) {
      const set = pairOwners.get(verb) ?? new Set<string>();
      set.add(file);
      pairOwners.set(verb, set);
    }
  }
  const pairCensus = new Map([...pairOwners].map(([verb, set]) => [verb, [...set].sort()]));
  const declaredWithBothSynthetic = {
    ...SHARED_RPC_VERBS,
    list_entry_links: [...pairCensus.get("list_entry_links")!],
  };
  assert.deepEqual(
    verbCollisions(pairCensus, declaredWithBothSynthetic), [],
    "the same pair, named on a declared share, must pass",
  );
});

test("RPC-opener census · the array-membership `NAME.includes(path)` spelling is recognised (L01-SPEC-02)", () => {
  // SYNTHETIC source, modelled on home-board-mock.mjs's real EMPTY_RPCS array-dispatch shape.
  const synthetic = [
    "const EMPTY_RPCS = [",
    '  "/rest/v1/rpc/list_widgets",',
    '  "/rest/v1/rpc/list_gadgets",',
    "];",
    'if (request.method === "POST" && EMPTY_RPCS.includes(path)) { return true; }',
  ].join("\n");
  assert.deepEqual(verbsInSource(synthetic), ["list_widgets", "list_gadgets"]);
});

test("RPC-opener census · an array NOT consumed through .includes(path) contributes no verb", () => {
  // NEGATIVE CONTROL: an array of RPC-shaped strings that is never dispatched through
  // `.includes(path)` at all (home-board-mock.mjs's own `EMPTY_RELATIONS` is this shape, for
  // GET table/view reads rather than RPC verbs) must not be mistaken for a dispatch arm.
  const synthetic = [
    "const OTHER_LIST = [",
    '  "/rest/v1/rpc/list_widgets",',
    "];",
    "if (OTHER_LIST.includes(somethingElse)) {}",
  ].join("\n");
  assert.deepEqual(verbsInSource(synthetic), []);
});

test("RPC-opener census · home-board-mock.mjs's real EMPTY_RPCS verbs are no longer invisible (L01-SPEC-02)", () => {
  // NOT synthetic: the real file, the real blind spot L01-SPEC-02 closes. Five of EMPTY_RPCS's
  // six verbs have a real second claimant elsewhere, using a spelling the opener already
  // recognised — genuine multi-claimant verbs the pre-fix census reported as single-owner.
  const census = rpcVerbCensus();
  assert.deepEqual(census.get("list_fiscal_years"), ["bank-close-registers-mock.mjs", "home-board-mock.mjs"]);
  assert.deepEqual(census.get("list_agent_act_receipts"), ["bank-close-registers-mock.mjs", "home-board-mock.mjs"]);
  assert.deepEqual(census.get("list_bank_accounts"), ["bank-match-mock.mjs", "home-board-mock.mjs"]);
  assert.deepEqual(census.get("list_bank_statements"), ["bank-match-mock.mjs", "home-board-mock.mjs"]);
  assert.deepEqual(census.get("list_uncoded_filings"), ["documents-viewer-mock.mjs", "home-board-mock.mjs"]);
  // The sixth verb has no second claimant today and correctly stays single-owner.
  assert.deepEqual(census.get("list_bank_account_proposals"), ["home-board-mock.mjs"]);
});

// --- THE CORE HANDOVER CENSUS (#625) ------------------------------------------
//
// `SHARED_RPC_VERBS` above catches one lane answering an RPC verb ANOTHER LANE also answers. It
// cannot see the other half of the same class: a lane answering a RELATION that `serve-built.mjs`
// ITSELF answers, from a hook that runs first. That is a TAKEOVER, not a collision — the CORE's
// branch is still there and still correct for every other walk, and simply never reached for the
// lane's own scope — and it is how the three member reads changed hands for #625.
//
// A takeover is legitimate and sometimes necessary (fixed fixtures cannot walk a lifecycle), so
// this is a DECLARATION gate rather than a ban.
//
// ITS WATCH SET IS DELIBERATELY NARROW, and the reason is measured rather than tidy. Three CORE
// relations were ALREADY taken over before this gate existed — `/rest/v1/clients` by eleven lanes,
// `/rest/v1/chat_sessions` by two, `/rest/v1/onboarding_plans` by one — each id-scoped and
// falling through otherwise, each argued in its own module's header. Widening this gate to them
// would demand a retroactive declaration listing all eleven claimants of `clients`, which any
// sibling branch adding a client-scoped lane would then have to edit: a shared-file conflict for
// every one of them, in exchange for re-stating decisions their own headers already carry. So the
// watch set is the relations whose ownership THIS change moved, and the pre-existing three are
// named here as known-and-excluded rather than silently missed. Widening it is a repo-wide sweep
// of its own, not a side effect of one ticket.
const CORE_RELATION_HANDOVERS: Record<string, string[]> = {
  // #625 — the membership lifecycle. `serve-built.mjs` answers all three in its CORE with FIXED
  // fixtures (one roster row, an empty invite array, a caller context derived from the signed-in
  // address); a roster that cannot be revoked, re-roled or removed cannot walk AC1/AC3/AC5. The
  // lane answers them ONLY for its own persona and returns false for every other address, so the
  // CORE still answers every sibling walk exactly as it did.
  // WAVE 2026-09-15 INTEGRATION — `documents-intake-mock.mjs` (#633) also carries a
  // `/rest/v1/caller_context` branch, and it answers UNCONDITIONALLY (its own owner-rank fixture,
  // documents-intake-mock.mjs:469). MEASURED, it never runs: `serve-built.mjs` dispatches the
  // members-lifecycle lane at :424, its own CORE `caller_context` branch at :553, and the intake
  // lane only at :645 — so the CORE has already answered by the time that branch is reached, on
  // #633's own branch as much as here. It is declared rather than deleted because the intake
  // transport is #633's to own (DECISIONS §1.7) and a census that hides a claimant is worth less
  // than one that names a dead one; removing the dead branch is filed as a follow-up.
  caller_context: ["documents-intake-mock.mjs", "members-lifecycle-mock.mjs"],
  firm_members_visible: ["members-lifecycle-mock.mjs"],
  firm_invites_visible: ["members-lifecycle-mock.mjs"],
};

/** `path === "/rest/v1/<relation>"` openers, excluding `/rest/v1/rpc/…` (verbs are censused by
 *  `rpcVerbCensus` above). */
const RELATION_OPENER = /path === "\/rest\/v1\/(?!rpc\/)([a-z0-9_]+)"/g;

function relationsIn(file: string): Set<string> {
  const source = readFileSync(file, "utf8");
  return new Set([...source.matchAll(RELATION_OPENER)].map((m) => m[1]!));
}

test("CORE-handover census · the member reads taken over from serve-built.mjs stay DECLARED, with exactly their declared claimants", () => {
  const core = relationsIn(SERVE_BUILT);
  const claimants = new Map<string, string[]>();
  for (const mock of LANE_MOCKS) {
    for (const relation of relationsIn(join(E2E_DIR, mock))) {
      if (!core.has(relation)) continue;
      claimants.set(relation, [...(claimants.get(relation) ?? []), mock].sort());
    }
  }
  console.log(`  ${core.size} relation(s) answered in serve-built.mjs; ${claimants.size} also answered by a lane mock:`);
  for (const [relation, mocks] of claimants) console.log(`    ${relation}: ${mocks.join(", ")}`);

  for (const [relation, declared] of Object.entries(CORE_RELATION_HANDOVERS)) {
    assert.ok(
      core.has(relation),
      `${relation} is declared a CORE handover but serve-built.mjs no longer answers it — drop the declaration`,
    );
    assert.deepEqual(
      claimants.get(relation) ?? [],
      [...declared].sort(),
      `${relation}'s real claimants no longer match its declaration — a lane joined or left a read this gate watches`,
    );
  }

  // POSITIVE CONTROL on the reader itself: a relation the CORE answers and NO lane touches must
  // census as absent, or the regex is over-matching and every row above is noise.
  assert.ok(core.has("client_facts"), "serve-built.mjs must still answer /rest/v1/client_facts, or this control proves nothing");
  assert.equal(claimants.has("client_facts"), false, "no lane mock answers /rest/v1/client_facts today");
});

// --- THE CLIENT-ID SPACE CENSUS (#652 x #653, wave 2026-09-15) ----------------
//
// Every gate above measures what a lane ANSWERS. None of them could see the other half of the
// same rule: WHICH IDS a lane answers FOR. N5 passes a handler that guards
// `clientFilter !== eq.${OURS}` no matter what `OURS` is, and the verb census passes two lanes
// whose verb sets are disjoint — so two lanes that mint the SAME client id look perfectly scoped
// to both instruments while behaving, at runtime, exactly like the unscoped claim N4 bans: the
// hook that runs first wins every shared route, and the loser's walk reads the winner's fixtures.
//
// THIS IS NOT HYPOTHETICAL. `accrual-mock.mjs` (#652) and `prepayments-mock.mjs` (#653) were
// built on parallel branches, both derived their id space from `plans-mock.mjs`'s
// `64c0c0c0-…` by bumping the stem to `65…`, and both landed with
// `clientId: "65c0c0c0-6500-4650-8650-650650650650"`. Neither branch could see the other, and
// neither branch's own walk could fail: each was alone on its own tree. On the merged tree
// `handleAccrualSupabase` is consulted before `handlePrepaymentsSupabase`, so the prepayments
// walk's authority Select was filled with the ACCRUAL lane's `clara.accounting_work` rows and
// `prepayments.walk.refusal` timed out on an option that could not be there.
//
// A lane mock's client id is its ADDRESS. Two lanes at one address is the collision; this cell
// is the only thing in the suite that can see it before a walk does.
//
// IT READS SOURCE TEXT, like every other census in this file, so a COMMENT that spells the
// `<key>: "<uuid>"` shape is censused as a real declaration. That is the same property the verb
// census has and it is left alone for the same reason: the alternative is a comment stripper
// standing between every gate here and the file it measures. Name an id in prose bare, never as
// a quoted field.
const CLIENT_ID_KEY = /([A-Za-z0-9_]*[Cc]lient[A-Za-z0-9_]*)\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;

/** client id -> every lane mock (sorted, deduped) that names it as a client of its own. */
function clientIdCensus(mocks: readonly string[] = LANE_MOCKS): Map<string, string[]> {
  const owners = new Map<string, Set<string>>();
  for (const mock of mocks) {
    const source = readFileSync(join(E2E_DIR, mock), "utf8");
    for (const m of source.matchAll(CLIENT_ID_KEY)) {
      const id = m[2]!.toLowerCase();
      const set = owners.get(id) ?? new Set<string>();
      set.add(mock);
      owners.set(id, set);
    }
  }
  return new Map([...owners].map(([id, set]) => [id, [...set].sort()]));
}

function clientIdCollisions(census: ReadonlyMap<string, string[]>): string[] {
  const problems: string[] = [];
  for (const [id, files] of census) {
    if (files.length <= 1) continue;
    problems.push(`${id} is minted as a client by ${files.join(", ")} — one lane must re-mint its own space`);
  }
  return problems;
}

test("client-id census · no two lane mocks mint the SAME client id", () => {
  const census = clientIdCensus();
  console.log(`  ${census.size} client id(s) censused across ${LANE_MOCKS.length} lane mocks`);

  assert.deepEqual(clientIdCollisions(census), []);

  // POSITIVE CONTROL on the reader itself, over the REAL files: a lane whose whole walk turns on
  // SIX client ids — the original five, one per read outcome, plus #997's own `clientReceipt` —
  // must census as six — under-matching would make the assertion above vacuous, and there is no
  // count here that a passing regex could fake.
  const d4 = [...census].filter(([, files]) => files.length === 1 && files[0] === "tax-boundary-mock.mjs");
  assert.equal(d4.length, 6, `tax-boundary-mock.mjs names six client ids; the census found ${d4.length}`);
  assert.ok(census.size >= 30, `the census recognised only ${census.size} client ids — it is not reading the files`);
});

test("client-id census POSITIVE CONTROL · two lanes at one address ARE caught", () => {
  // SYNTHETIC, so the control keeps firing after the real collision is repaired: the gate must
  // fail on a shared address and stay silent on a private one.
  const synthetic = new Map<string, string[]>([
    ["65c0c0c0-6500-4650-8650-650650650650", ["fake-lane-a-mock.mjs", "fake-lane-b-mock.mjs"]],
    ["65d0d0d0-6500-4650-8650-650650650650", ["fake-lane-a-mock.mjs"]],
  ]);
  const problems = clientIdCollisions(synthetic);
  assert.equal(problems.length, 1, `expected exactly one collision, saw: ${problems.join(" | ")}`);
  assert.match(problems[0]!, /fake-lane-a-mock\.mjs, fake-lane-b-mock\.mjs/);
});

// ===============================================================================================
// #659 (fix round 1, finding A12) — A LANE THAT DEPENDS ON ANOTHER LANE'S VERB, DECLARED.
//
// Firm Home now renders a recent-activity band off `clara.list_activity` (D18.f's swap). #659
// added NO handler for that verb, because it could not usefully add one: `serve-built.mjs`
// dispatches `handleActivitySupabase` far ABOVE `handleHomeBoardSupabase`, so an arm in
// `home-board-mock.mjs` would never be reached, and moving either dispatch position is forbidden
// by the wave's §6.1 ruling (#657 dispatches between them).
//
// The consequence is real and belongs to the census rather than to a paragraph in a report: every
// OTHER lane's walk that merely lands on `/` now renders #632's activity fixtures inside Firm
// Home's band. The two columns above cannot express it — this lane declares no handler for the
// verb, so there is nothing for the reader to classify — which is exactly how a cross-lane
// dependency stays invisible until it breaks. These two cells make it a checked fact instead.
// ===============================================================================================

test("#659 · Firm Home's activity band is answered by #632's lane, and the dispatch order that makes that true is pinned", () => {
  const serveBuilt = readFileSync(SERVE_BUILT, "utf8");
  const activityAt = serveBuilt.indexOf("handleActivitySupabase(request");
  const homeBoardAt = serveBuilt.indexOf("handleHomeBoardSupabase(request");
  assert.ok(activityAt > 0, "the activity lane is still dispatched");
  assert.ok(homeBoardAt > 0, "the home-board lane is still dispatched");
  assert.ok(
    activityAt < homeBoardAt,
    "activity-mock.mjs MUST stay above home-board-mock.mjs: Firm Home's recent-activity band is "
    + "answered by #632's fixtures, and every walk that lands on `/` sees them. If this order is "
    + "ever inverted, home-board-mock.mjs must grow its own honest-empty `list_activity` arm in "
    + "the same change — otherwise the band silently changes what every other lane's walk renders.",
  );
});

test("#659 · home-board-mock.mjs answers NO list_activity verb — the dependency above is real, not a duplicate", () => {
  // A POSITIVE CONTROL on the claim: if this lane ever grows its own arm, the comment above stops
  // being true and this cell is where that is noticed.
  const homeBoard = readFileSync(join(E2E_DIR, "home-board-mock.mjs"), "utf8");
  assert.doesNotMatch(
    homeBoard, /rpc\/list_activity/,
    "home-board-mock.mjs answers no list_activity verb; if it grows one, update the dependency "
    + "note above and this lane's declaration, because the arm would be dead code under the "
    + "current dispatch order",
  );
});

// ---------------------------------------------------------------------------
// #902 · `get_client_work_pack` IS SCOPED BY `p_client` — one dedicated fixture client reads a
// populated pack; every other id (including the unscoped default) keeps #650's honest empty one.
// ---------------------------------------------------------------------------

/** A fake PostgREST POST request whose body is `body`, delivered exactly once (mirrors N7's own
 *  fake request above — this file's convention for driving a handler without a real socket). */
function fakeJsonPost(body: unknown): AsyncIterable<Buffer> & { method: string } {
  let delivered = false;
  return {
    method: "POST",
    [Symbol.asyncIterator](): AsyncIterator<Buffer> {
      return {
        async next() {
          if (delivered) return { value: undefined, done: true };
          delivered = true;
          return { value: Buffer.from(JSON.stringify(body), "utf8"), done: false };
        },
      };
    },
  };
}

async function readWorkPack(pClient: string | null): Promise<unknown> {
  let sent: unknown;
  const sendJson = (_response: unknown, _status: number, payload: unknown) => {
    sent = payload;
  };
  const request = fakeJsonPost({ p_client: pClient });
  const handled = await handleHomeBoardSupabase(
    request as never, {} as never, "/rest/v1/rpc/get_client_work_pack",
    new URL("https://example.test/rest/v1/rpc/get_client_work_pack") as never, sendJson as never, {} as never,
  );
  assert.equal(handled, true, "get_client_work_pack must always answer — an unanswered id grows the 'could not be read' tile #650's header names");
  return sent;
}

test("#902 · the dedicated fixture client reads the POPULATED pack, distinct from the honest-empty default", async () => {
  const populated = await readWorkPack(HOME_WORK_PACK_CLIENT.id);
  assert.deepEqual(populated, POPULATED_WORK_PACK);
  assert.notDeepEqual(populated, EMPTY_WORK_PACK, "the populated and empty packs must actually differ, or this proves nothing");
});

test("#902 · the POPULATED pack HYDRATES to real preview rows, not a count with an empty preview (L01-SPEC-01)", async () => {
  // The wire fixture asserted byte-for-byte above is necessary but not sufficient: a fixture
  // shaped `{id, label, state, updated_at}` instead of the door's own `{work_id, purpose,
  // status, memo, ...}` (0214_client_work_pack.sql) would pass that deepEqual and STILL
  // hydrate to a count of 1 with ZERO preview rows, because `hydrateRow`
  // (lib/work/client-work-pack.ts) drops any row with no `work_id`. This cell reads the pack
  // through the app's own hydrator — the same one `getClientWorkPack` calls — so the fixture
  // cannot drift back to a shape the real door cannot produce without this cell catching it.
  const populated = await readWorkPack(HOME_WORK_PACK_CLIENT.id);
  const hydrated = hydrateClientWorkPack(populated);

  assert.equal(hydrated.active.status, "ok");
  assert.equal(hydrated.active.count, 1);
  assert.equal(hydrated.active.rows.length, 1, "count:1 with an empty preview is the exact defect this cell exists to catch");
  assert.equal(hydrated.active.rows[0]?.work_id, "90290290-9029-4029-8029-902902902001");
  assert.equal(hydrated.active.rows[0]?.status, "running", "'in_progress' is not a member of accounting_work's status roster (0178)");

  assert.equal(hydrated.recentSuccess.status, "ok");
  assert.equal(hydrated.recentSuccess.count, 1);
  assert.equal(hydrated.recentSuccess.rows.length, 1, "count:1 with an empty preview is the exact defect this cell exists to catch");
  assert.equal(hydrated.recentSuccess.rows[0]?.receipt_id, "90290290-9029-4029-8029-902902902003");
  assert.equal(hydrated.recentSuccess.rows[0]?.committed_at, "2026-09-10T03:00:00.000Z");
});

test("#902 · every other client id — including the unscoped default and undefined — keeps the honest-empty pack", async () => {
  const forUnrelatedClient = await readWorkPack("11111111-1111-4111-8111-111111111111");
  const forNoClientAtAll = await readWorkPack(null);
  assert.deepEqual(forUnrelatedClient, EMPTY_WORK_PACK);
  assert.deepEqual(forNoClientAtAll, EMPTY_WORK_PACK);
});

test("#902 · HOME_WORK_PACK_CLIENT is not HOME_ONBOARDING_CLIENT and mints no id any other lane owns", () => {
  // A POSITIVE CONTROL on the fixture itself: the two client ids `home-board-mock.mjs` mints
  // must differ, or #902's own scoping would resolve to the SAME row #650's onboarding cell reads.
  const homeBoard = readFileSync(join(E2E_DIR, "home-board-mock.mjs"), "utf8");
  const onboardingMatch = /HOME_ONBOARDING_CLIENT = \{\s*id: "([0-9a-f-]+)"/.exec(homeBoard);
  assert.ok(onboardingMatch, "home-board-mock.mjs must still declare HOME_ONBOARDING_CLIENT's id in this shape");
  assert.notEqual(HOME_WORK_PACK_CLIENT.id, onboardingMatch![1]);

  // REVIEW-ROUND STD-3 fix — the title's own SECOND claim ("mints no id any other lane owns")
  // is a CROSS-LANE guarantee the assertion above never checked, and `clientIdCensus` (below)
  // cannot stand in for it: that census only matches property KEYS containing "client"
  // (`xxxClientId: "…"`), while this id lives under a plain `id:` key inside a `..._CLIENT`
  // object — measured invisible to it (a scratch run of `CLIENT_ID_KEY` against
  // `home-board-mock.mjs` matches neither `HOME_WORK_PACK_CLIENT.id` nor
  // `HOME_ONBOARDING_CLIENT.id` at all). Grepping every OTHER `LANE_MOCKS` file's own source
  // text for the literal id is the direct, correct way to check the claim the title actually
  // makes, the same "read every lane mock's own source" idiom `bodyReaderCensus`/`rpcVerbCensus`
  // above already use.
  for (const mock of LANE_MOCKS) {
    if (mock === "home-board-mock.mjs") continue;
    const source = readFileSync(join(E2E_DIR, mock), "utf8");
    assert.ok(
      !source.includes(HOME_WORK_PACK_CLIENT.id),
      `${mock} must not mint HOME_WORK_PACK_CLIENT's own id (${HOME_WORK_PACK_CLIENT.id})`,
    );
  }
});

// ---------------------------------------------------------------------------
// #853 · `list_activity` HONOURS `p_work`, mirroring migration 0202's own predicate
// (`p_work is null or work_id = p_work`) — the e2e mock ignored it entirely before this ticket.
// ---------------------------------------------------------------------------

type ActivityPage = {
  rows: Array<{ id: string; work_id: string | null }>;
  next_cursor: string | null;
  truncated: boolean;
};

async function listActivity(body: Record<string, unknown>): Promise<ActivityPage> {
  let sent: ActivityPage | undefined;
  const sendJson = (_response: unknown, _status: number, payload: unknown) => {
    sent = payload as never;
  };
  const request = fakeJsonPost(body);
  const handled = await handleActivitySupabase(
    request as never, {} as never, "/rest/v1/rpc/list_activity",
    new URL("https://example.test/rest/v1/rpc/list_activity") as never, sendJson as never, {} as never,
  );
  assert.equal(handled, true, "list_activity must answer this lane's own client");
  assert.ok(sent, "list_activity must have called sendJson");
  return sent!;
}

test("#853 · two different p_work values against the same client return different, correctly scoped pages", async () => {
  const firstWork = await listActivity({ p_client: ACTIVITY.clientId, p_work: ACTIVITY.workId });
  const secondWork = await listActivity({ p_client: ACTIVITY.clientId, p_work: ACTIVITY.secondWorkId });

  assert.deepEqual(firstWork.rows.map((r) => r.id), [ACTIVITY.workReceiptId]);
  assert.deepEqual(secondWork.rows.map((r) => r.id), [ACTIVITY.secondWorkReceiptId]);
  assert.notDeepEqual(firstWork.rows, secondWork.rows, "the two Work-scoped pages must actually differ, or this proves nothing");
  for (const row of firstWork.rows) assert.equal(row.work_id, ACTIVITY.workId);
  for (const row of secondWork.rows) assert.equal(row.work_id, ACTIVITY.secondWorkId);
});

test("#853 · every existing shape (no p_work at all) is UNCHANGED — activity-feed-walk.spec.ts sends none", async () => {
  const noWork = await listActivity({ p_client: ACTIVITY.clientId });
  const explicitlyUndefined = await listActivity({ p_client: ACTIVITY.clientId, p_work: undefined });
  assert.deepEqual(noWork, explicitlyUndefined);
  // Both Work rows are present when nothing filters by Work — the pre-#853 shape, preserved.
  const ids = noWork.rows.map((r) => r.id);
  assert.ok(ids.includes(ACTIVITY.workReceiptId));
  assert.ok(ids.includes(ACTIVITY.secondWorkReceiptId));
});

test("#853 · pageHasWork decides truncation from PAGE_2's real membership, not from whether p_work was merely present (L01-SPEC-06)", () => {
  // POSITIVE/NEGATIVE CONTROL on the exported pure decision, driven on a SYNTHETIC page-2
  // population — neither of today's two real fixture Works has a row on the real PAGE_2, so this
  // is the only way to prove the function is populated-driven rather than a relabelled "if work,
  // always false" flag.
  assert.equal(
    pageHasWork("some-work-id", [{ work_id: "some-work-id" }]), true,
    "a work WITH a matching row on page 2 must report more to page",
  );
  assert.equal(
    pageHasWork("some-work-id", [{ work_id: "a-different-work-id" }]), false,
    "a work with NO matching row on page 2 must report nothing more to page",
  );
});

test("#853 · a p_work-filtered read against the REAL fixture carries the SAME next_cursor/truncated 0202's own predicate would give it", async () => {
  // Neither ACTIVITY.workId nor ACTIVITY.secondWorkId has a row on the real PAGE_2
  // (`pageHasWork` against the real, un-overridden PAGE_2 — asserted directly, not inferred),
  // so a work-filtered page-1 read has truthfully nothing left to page to.
  assert.equal(pageHasWork(ACTIVITY.workId), false);
  assert.equal(pageHasWork(ACTIVITY.secondWorkId), false);

  const firstWork = await listActivity({ p_client: ACTIVITY.clientId, p_work: ACTIVITY.workId });
  const secondWork = await listActivity({ p_client: ACTIVITY.clientId, p_work: ACTIVITY.secondWorkId });
  assert.equal(firstWork.next_cursor, null);
  assert.equal(firstWork.truncated, false);
  assert.equal(secondWork.next_cursor, null);
  assert.equal(secondWork.truncated, false);
});
