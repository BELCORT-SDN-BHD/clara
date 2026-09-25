// #1148 [0363_payroll_posting_state_read.sql] — A GRANTED, DOCUMENT-SCOPED READ OF THE PAYROLL
// POSTING VERDICT.
//
// Spec of record: issue #1148's body (Agent Brief, riders closing wave, 2026-09-26; the ticket
// carries ZERO comments, so the body is the whole contract and there is no owner ruling to
// override it). Source: candidate C15 of `reports/waveS-followup-candidates.md`, which is #1048's
// own report `waveS-lane04-ticket1048.md` §10 follow-up 1, with the routing it forces written out
// in that report's §9.2.
//
// WHAT #1048 LEFT. `clara._payroll_posting_verdict(p_document uuid)` holds the whole answer — the
// sentence naming what stopped the post, the verdict, the rung, the reason and the completeness
// state — and is UNGRANTED, reached from `clara._post_payroll_run`, `clara.list_review_queue` and
// `clara.answer_payroll_completeness` alone. The only way to SEE the verdict was a Needs-you queue
// row (firm-wide or client-scoped) or the entry's own receipt. A document page that wanted to say
// "this payslip did not post because …" had no read to call, which is why #1048's own tool contract
// (§9.2) had to route through `clara.list_review_queue` with a client scope and a row-kind filter
// rather than asking about the document it actually has.
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief's
// own "Key interfaces" names, and no cell sits anywhere else):
//   S1. `clara.get_payroll_posting_state(p_document uuid)` — the new door, driven through
//       `humanQuery` as a REAL signed-in VIEWER of the owning firm, never as `postgres` and never
//       by calling the ungranted internal directly. Everything a person is told comes through it.
//   S2. The SAME door from the wrong side — another firm's member, an id that is not a document at
//       all, a caller with no membership, a caller with no authenticated actor. The refusal is the
//       deliverable there, and the fact that two of them are INDISTINGUISHABLE is the acceptance
//       criterion.
//   S3. The LIVE CATALOG — `pg_proc.proacl` for the new door and for
//       `clara._payroll_posting_verdict(uuid)`, and the floor argument the door's own body names.
//       Three claims are about what a LATER file may not do (the internal stays ungranted, the door
//       reaches exactly one role, the floor is VIEWER and not something else). No behavioural cell
//       written today can drive those, and this repo's own documented shape for them is a catalog
//       census (`p1137.obo.plan_step_parity`, `p1147.read.acl`), which WORK-ORDER rule 4 names
//       explicitly as the case where a structural cell wins.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. What the verdict DECIDES — that is
// `payroll-summary-posting.test.mjs` (#946) and `payroll-completeness-witness.test.mjs` (#1048),
// both of which run unchanged. This file is about a READ: who may call it, what it projects, and
// what it refuses.
//
// FRONTIER-GATED on the `payroll_posting_state_read$` stable stem, never a number — numbers are
// claimed at merge (packages/db/README.md). A package-wide sweep preloads this file's
// pre-integration gate module and skips LOUDLY on a chain below 0363; a FOCUSED run sets nothing
// and FAILS, because a skip is not evidence.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, roleQuery, ensureReady, endPool, buildWorld, assertRaises, insertUser, ROLES,
} from "./rig-fixtures.mjs";
import {
  payrollDoc, readPayrollDoc, seedPayrollChart, verdictOf, value, notPrinted, RUN_FIELDS,
} from "./payroll-fact-revision-fixtures.mjs";
import { filedDocument } from "./a21-helpers.mjs";

const STEM = "payroll_posting_state_read$";

let ready = false;
let world = null;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  world = await buildWorld();
});

after(async () => {
  await endPool();
});

/** The armed skip: a package sweep on a pre-0363 chain skips LOUDLY; a focused run FAILS. */
async function gate(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry");
    return true;
  }
  const n = Number(
    (await rootQuery("select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]))
      .rows[0].n,
  );
  if (n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_POSTING_STATE_READ !== "1") {
      throw new Error(
        `#1148: no migration matching /${STEM}/ is applied to this database and `
        + "CLARA_ALLOW_MISSING_PAYROLL_POSTING_STATE_READ is unset -- this is a FOCUSED run and "
        + "must fail loudly rather than skip. Apply 0363_payroll_posting_state_read.sql, or "
        + "preload ./tests/payroll-posting-state-read-preintegration-gate.mjs for an estate sweep "
        + "against a pre-0363 chain.");
    }
    t.skip("#1148 (0363_payroll_posting_state_read) not applied -- probed at the live catalog");
    return true;
  }
  return false;
}

/** The door, through the governed human path as a real signed-in member. */
const readState = (sub, document) =>
  humanQuery(sub, "select clara.get_payroll_posting_state($1) as r", [document])
    .then((r) => r.rows[0].r);

// =================================================================================================
// S1 — THE READ ANSWERS A BLOCKED PAYROLL SUMMARY, FOR A VIEWER OF THE OWNING FIRM.
//
// THE EXPECTED SENTENCE IS TRANSCRIBED FROM THE SPEC, NOT RE-COMPUTED. `facts_read` is the second
// rung of 0297 §D's closed roster and its sentence is the literal
// `'This payroll summary has not been read yet.'` (0297:781, unchanged by 0343). A filed payroll
// summary that no worker has read yet is exactly that state, and it is the cheapest one to reach
// that is not an artefact of the fixture.
//
// THE FIRM WALL IS PART OF THIS ONE BEHAVIOUR, not a later refinement: the door answers about
// YOUR firm's payroll summary, and the same call from another firm's member is a refusal. Both
// observations are of the one thing the door is for, so they sit in one cell. WHETHER THAT
// REFUSAL IS AN EXISTENCE ORACLE is a different question and has its own cell below.
// =================================================================================================
test("p1148.read.blocked: a VIEWER of the owning firm is told, by the door, why the summary did not post", async (t) => {
  if (await gate(t)) return;

  const doc = await payrollDoc(world.users.alice, world.clients.A1);

  // carol is firm A's VIEWER (rig-fixtures.mjs buildWorld: addMember role 'viewer'), so this is the
  // least-privileged human connection that may hold this read at all.
  const r = await readState(world.users.carol, doc.documentId);

  assert.equal(r.verdict, "blocked", `the run cannot post and the door must say so (got ${JSON.stringify(r)})`);
  assert.equal(r.rung, "facts_read", "the FIRST failing rung is the reason a person is told");
  assert.equal(r.reason, "payroll_not_read", "0297 §D's own token for that rung");
  assert.equal(r.sentence, "This payroll summary has not been read yet.",
    "the sentence is the database's own, verbatim -- 0297 §D builds it and nothing above may reword it");
  assert.equal(r.document_id, doc.documentId, "the door echoes the document it was asked about");

  // dave is firm B's OWNER -- the highest rank there is, in the wrong firm. Rank buys nothing here.
  await assertRaises("CLR11", () => readState(world.users.dave, doc.documentId),
    "firm B's owner asking about firm A's payroll summary");
});

// =================================================================================================
// S2 — THE REFUSAL IS NO EXISTENCE ORACLE.
//
// The acceptance criterion is not "a foreign document is refused" (S1 saw that). It is that a
// caller CANNOT TELL THE TWO APART: a document that belongs to somebody else and an id that is no
// document at all must come back byte-identical — same SQLSTATE, same message, same DETAIL — or
// the refusal itself becomes a way to enumerate another firm's documents one uuid at a time.
//
// EVERY DISCRIMINANT A CALLER CAN SEE is compared, not just the code: pg carries `code`, `message`,
// `detail`, `hint`, `constraint`, `table` and `column` to the client, and a body that raised its
// two refusals in two places would differ on at least one of them.
// =================================================================================================

/** Everything about a refusal that reaches a caller. */
async function refusalOf(fn) {
  try {
    await fn();
  } catch (e) {
    return {
      code: e.code ?? null, message: e.message ?? null, detail: e.detail ?? null,
      hint: e.hint ?? null, constraint: e.constraint ?? null,
      table: e.table ?? null, column: e.column ?? null,
    };
  }
  return null;
}

test("p1148.read.no_oracle: another firm's document and an id that is no document are the SAME refusal", async (t) => {
  if (await gate(t)) return;

  const mine = await payrollDoc(world.users.alice, world.clients.A1);
  const theirs = await payrollDoc(world.users.dave, world.clients.B1);
  // A uuid this world has never minted. `gen_random_uuid()` from the database itself, so nothing
  // about it is a literal a future fixture could accidentally create.
  const nowhere = (await rootQuery("select gen_random_uuid() as id")).rows[0].id;

  const foreign = await refusalOf(() => readState(world.users.carol, theirs.documentId));
  const unknown = await refusalOf(() => readState(world.users.carol, nowhere));

  assert.ok(foreign, "firm B's document must not answer firm A's viewer");
  assert.ok(unknown, "an id that is no document must not answer");
  assert.equal(foreign.code, "CLR11", "0002's own not-found-in-your-firm code");
  assert.deepEqual(unknown, foreign,
    "a caller can tell 'somebody else has it' from 'nobody has it' -- that IS an existence oracle, "
    + `one uuid at a time (foreign ${JSON.stringify(foreign)} vs unknown ${JSON.stringify(unknown)})`);

  // AND THE CLAIM IS NOT "IT ALWAYS REFUSES": the same viewer, in the same cell, still reads her
  // own firm's document.
  const ok = await readState(world.users.carol, mine.documentId);
  assert.equal(ok.document_id, mine.documentId, "firm A's viewer still reads firm A's document");
});

// =================================================================================================
// S3 — THE PROJECTION. WHAT IT CARRIES, AND WHAT IT LEAVES BEHIND.
//
// The brief's list is `sentence`, `verdict`, `rung`, `reason` and `completeness`, "and NOT the whole
// `rung_vector`, which is the evaluator's internal ladder and not a person's business". The cell
// therefore reads BOTH sides: the internal, as root, to establish what was available to project
// (seventeen keys, `rung_vector` among them), and the door, as a viewer, to establish what a person
// is actually handed (six). A cell that only looked at the door would green just as happily against
// a verdict that never carried a ladder in the first place.
//
// THE STATE IS THE ONE #1048 EXISTS FOR: a payslip that prints no run totals at all and witnesses
// nothing about its own completeness, so the gate parks the question rather than refusing. Its
// sentence, the figures in it and the line count are 0343's own format string
// (0343:1804) applied to #945's worked example, transcribed by hand:
//
//   row 1   gross 3,000.00 … net 2,529.35
//   row 2   gross 2,000.00 … net 1,726.35
//   sums    gross 5,000.00              net 4,255.70          2 employee line(s)
//
// The month is MARCH 2026 and every cell below that reads a posting state names its own month:
// 0297 §D's `no_duplicate_entry` rung has a `same_month_payroll_run` scope, so two cells sharing a
// month on one client would measure each other rather than the door.
// =================================================================================================
test("p1148.read.projection: five verdict keys and the caller's own id -- and NOT the rung ladder", async (t) => {
  if (await gate(t)) return;

  await seedPayrollChart(world.users.alice, world.clients.A1);
  const doc = await readPayrollDoc(world.users.alice, world.clients.A1, {
    answers: Object.fromEntries(RUN_FIELDS.map((f) =>
      [f, f === "payroll.run.period" ? value("2026-03") : notPrinted()])),
    month: "2026-03",
  });

  // WHAT WAS AVAILABLE TO PROJECT, read off the ungranted internal as root. This is the source the
  // door narrows, not an expected value re-computed from the door.
  const internal = await verdictOf(doc.documentId);
  assert.ok("rung_vector" in internal, "premise: 0297 §D's answer carries the whole ladder");
  assert.ok(Object.keys(internal).length > 6,
    `premise: the internal carries more than the door projects (got ${Object.keys(internal).length} keys)`);

  const r = await readState(world.users.carol, doc.documentId);

  assert.deepEqual(Object.keys(r).sort(),
    ["completeness", "document_id", "reason", "rung", "sentence", "verdict"],
    `the door projects exactly six keys (got ${JSON.stringify(r)})`);
  assert.equal("rung_vector" in r, false,
    "the rung ladder is the evaluator's internal working and is not a person's business");

  // AND THE FIVE IT DOES CARRY ARE THE VERDICT'S OWN, for the state #1048 exists for.
  assert.equal(r.verdict, "blocked");
  assert.equal(r.rung, "completeness_witness", "0343 §H's own rung, between run_totals_printed and accounts_resolve");
  assert.equal(r.reason, "completeness_unwitnessed", "the page witnessed nothing and nobody has answered");
  assert.ok(
    r.sentence.startsWith(
      "This payroll summary for March 2026 prints no total; is this every employee for the month? "
      + "Clara read 2 employee line(s), totalling RM 5,000.00 gross and RM 4,255.70 net. "
      + "Answer yes and the run posts from those lines; answer no and it stays unposted."),
    `the parked question, in 0343's own words with #945's worked example in it (got ${JSON.stringify(r.sentence)})`);
  assert.equal(r.completeness.parked, true,
    "`completeness` is projected because it is what the page must show beside the question");
  assert.equal(Number(r.completeness.rows_read), 2, "the two employee lines the person is being asked about");
});

// =================================================================================================
// S4 — THE FLOOR, AND WHAT "BELOW THE VIEWER FLOOR" ACTUALLY MEANS HERE.
//
// The brief asks that "a caller below the viewer floor is refused at the floor". VIEWER IS RANK 0
// AND THE LADDER HAS NO RUNG UNDER IT: `clara.role_rank` (0002:326) maps viewer→0, bookkeeper→1,
// admin→2, owner→3 and everything else→NULL, and `clara.firm_memberships_role_check` admits those
// four strings and nothing else. So there is no ROLE below this floor to drive, and a cell that
// claimed to have driven one would be a fiction. What IS below it, and what the floor body raises
// its CLR04 for, is a caller with no rank at all:
//
//   · nobody signed in                — `clara.jwt_sub()` is null          → 'no authenticated actor'
//   · signed in, no active membership — `clara.jwt_firm()` is null         → 'actor has no active membership'
//
// Both come out of `clara._human_ctx`, the estate's ONE floor body, which this door enters at and
// adds nothing to. The third arm it raises ('insufficient role', rank strictly below the argument)
// is UNREACHABLE for a viewer floor and is named here so the next reader does not go looking for a
// cell that cannot exist. The rank ladder itself is read off the catalog rather than recited.
// =================================================================================================
test("p1148.read.floor: the floor is VIEWER, it is the bottom of the ladder, and a caller with no rank is refused there", async (t) => {
  if (await gate(t)) return;

  const doc = await payrollDoc(world.users.alice, world.clients.A1);

  // (a) THE LADDER, off the live catalog: VIEWER is its floor, so "below the viewer floor" is
  //     "not a member of this firm at all" and nothing else.
  const ranks = (await rootQuery(
    "select r as role, clara.role_rank(r) as rank from unnest($1::text[]) r",
    [["viewer", "bookkeeper", "admin", "owner"]],
  )).rows;
  assert.deepEqual(ranks.map((x) => [x.role, x.rank]),
    [["viewer", 0], ["bookkeeper", 1], ["admin", 2], ["owner", 3]],
    "0002's rank ladder -- viewer is 0, and clara.firm_memberships_role_check admits no fifth string");

  // (b) NOBODY SIGNED IN. A `clara_authenticated` connection with no JWT at all: the shape a
  //     surface would present if it dropped the session on the way to the door.
  const anon = await refusalOf(() =>
    roleQuery(ROLES.authenticated, "select clara.get_payroll_posting_state($1) as r", [doc.documentId]));
  assert.ok(anon, "a connection with no authenticated actor must not read a posting verdict");
  assert.equal(anon.code, "CLR04", "the floor body's own code");
  assert.equal(anon.message, "no authenticated actor", "clara._human_ctx's own words, unreworded");

  // (c) SIGNED IN, MEMBER OF NOTHING. A real user row with no firm membership: rank null, and the
  //     floor refuses before the document is looked at.
  const stranger = await insertUser(world.prefix, "p1148stranger");
  const noFirm = await refusalOf(() => readState(stranger, doc.documentId));
  assert.ok(noFirm, "a signed-in person who is nobody's member must not read a posting verdict");
  assert.equal(noFirm.code, "CLR04");
  assert.equal(noFirm.message, "actor has no active membership");

  // (d) AND THE DOOR ADDS NO FLOOR OF ITS OWN -- it enters at `role_rank('viewer')` and never
  //     mentions a rank again. Read off the installed body, because this is a claim about what a
  //     LATER edit may not quietly do.
  const body = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.get_payroll_posting_state(uuid)'::regprocedure",
  )).rows[0].prosrc;
  assert.equal((body.match(/clara\._human_ctx\(/g) ?? []).length, 1,
    "exactly one floor call, and it is the estate's own body");
  assert.match(body, /clara\._human_ctx\(clara\.role_rank\('viewer'\)\)/,
    "the floor argument is VIEWER, spelled through the rank table rather than as a number");
  assert.equal((body.match(/role_rank\(/g) ?? []).length, 1,
    "no second rank test hiding under the first");
});

// =================================================================================================
// S5 — THE CATALOG CENSUS: the internal is still nobody's, the door is exactly one role's, and the
// set of bodies that can reach the verdict grew by ONE.
//
// THREE CLAIMS NO BEHAVIOURAL CELL CAN DRIVE, because each is about what a LATER file may not do.
// This repo's own documented shape for exactly that is a census read off the LIVE catalog
// (`p1137.obo.plan_step_parity`, `p1147.read.acl`), which WORK-ORDER rule 4 names as the case where
// a structural cell wins over a behavioural one:
//
//   (a) `clara._payroll_posting_verdict(uuid)` is UNGRANTED — 0297:841 revokes it from public and
//       nothing has ever granted it. The whole point of a wrapper is that the body under it stays
//       out of reach; a grant appearing there would make this door decoration.
//   (b) The wrapper reaches EXACTLY ONE role, `clara_authenticated`. A model-lane twin is a
//       successor contract for a cut after this wave's, not something a later file may add by
//       widening this grant.
//   (c) The bodies that name the internal grew by EXACTLY ONE — this door. "Nothing else about the
//       three existing callers moves" is the brief's own sentence, and this is it in catalog form.
//
// The vacuity control for this cell is recorded in the ticket report: the grant in (a) was planted
// for real, the cell was seen to bite by name, and the ACL was restored and re-measured.
// =================================================================================================
test("p1148.acl.census: the internal stays nobody's, the door is the human lane's alone, and one body more can reach the verdict", async (t) => {
  if (await gate(t)) return;

  // (a) THE INTERNAL. Its raw ACL, and then every application role asked one at a time, because an
  //     ACL string can be read and a privilege can still arrive through PUBLIC.
  const internalAcl = (await rootQuery(
    "select coalesce(proacl::text,'') as acl from pg_proc where oid = 'clara._payroll_posting_verdict(uuid)'::regprocedure",
  )).rows[0].acl;
  assert.equal(internalAcl, "{clara_fn_owner=X/clara_fn_owner}",
    "clara._payroll_posting_verdict holds its owner's EXECUTE and nothing else");

  const appRoles = (await rootQuery(
    "select rolname from pg_roles where rolname like 'clara\_%' and rolname <> 'clara_fn_owner' order by rolname",
  )).rows.map((r) => r.rolname);
  assert.ok(appRoles.length >= 4, `premise: this cluster carries the application roles (got ${appRoles.join(", ")})`);
  const reachInternal = (await rootQuery(
    `select r as role from unnest($1::text[]) r
      where has_function_privilege(r, 'clara._payroll_posting_verdict(uuid)'::regprocedure, 'EXECUTE')`,
    [[...appRoles, "public"]],
  )).rows.map((r) => r.role);
  assert.deepEqual(reachInternal, [],
    `a role reaches the ungranted verdict body directly: ${reachInternal.join(", ")} -- the wrapper exists BECAUSE nothing does`);

  // (b) THE DOOR. One role, and it is the human lane's.
  const reachDoor = (await rootQuery(
    `select r as role from unnest($1::text[]) r
      where has_function_privilege(r, 'clara.get_payroll_posting_state(uuid)'::regprocedure, 'EXECUTE')
      order by 1`,
    [[...appRoles, "public"]],
  )).rows.map((r) => r.role);
  assert.deepEqual(reachDoor, ["clara_authenticated"],
    `the read door is the document page's, and only the document page's (reached by ${reachDoor.join(", ") || "nobody"})`);

  // (c) THE CALL SITES. Three before this file, four after, and the fourth is this door. Read off
  //     prosrc across the whole schema, so a body added anywhere shows up here.
  const callers = (await rootQuery(
    `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.prosrc like '%_payroll_posting_verdict(%' order by 1`,
  )).rows.map((r) => r.sig);
  assert.deepEqual(callers, [
    "clara._list_review_queue_core(uuid,jsonb,jsonb,integer)",
    "clara._post_payroll_run(uuid)",
    "clara.answer_payroll_completeness(uuid,text,text,text)",
    "clara.get_payroll_posting_state(uuid)",
  ], "the three callers #1048's report names (the queue's core, the poster, the answer door) plus this one");
});

// =================================================================================================
// S6 — THE DOOR'S OWN SCOPE: it answers about A PAYROLL SUMMARY.
//
// The brief's Desired behaviour is "a granted `security definer` wrapper answers the posting state
// of ONE PAYROLL SUMMARY DOCUMENT". `clara._payroll_posting_verdict` under it takes any uuid and is
// right to — every body that calls it has already established what it is looking at. A GRANTED door
// has not: handed an invoice, the verdict would answer `facts_read / payroll_not_read` with the
// sentence "This payroll summary has not been read yet.", which is a sentence about a payslip said
// over a supplier bill. This estate refuses BY NAME instead of saying something untrue.
//
// AND THE REFUSAL IS CLR10, NOT CLR11, which is not a leak: the caller is looking at a document of
// their own firm, whose `document_kind` they can already read, so "not found" would be the lie
// here. The CLR11 wall above it has already decided the only question a stranger may ask.
// =================================================================================================
test("p1148.read.kind: a document of this firm that is NOT a payroll summary is refused by name, not answered about", async (t) => {
  if (await gate(t)) return;

  const invoice = await filedDocument(world.users.alice, {
    firm: world.firms.A, client: world.clients.A1, kind: "invoice",
  });

  const r = await refusalOf(() => readState(world.users.carol, invoice.documentId));
  assert.ok(r, "an invoice must not be told what a payroll run's posting gate thinks of it");
  assert.equal(r.code, "CLR10", "a bad request about a document that IS this firm's -- never the not-found wall");
  assert.deepEqual(JSON.parse(r.detail ?? "{}"), { reason: "not_a_payroll_summary" },
    "the refusal names its own reason, so a surface can decide to render nothing rather than a banner");

  // AND THE WALL ABOVE IT STILL COMES FIRST: another firm's invoice is CLR11, not CLR10 -- learning
  // the KIND of a document you may not see would be an oracle of its own.
  const theirInvoice = await filedDocument(world.users.dave, {
    firm: world.firms.B, client: world.clients.B1, kind: "invoice",
  });
  const foreign = await refusalOf(() => readState(world.users.carol, theirInvoice.documentId));
  assert.equal(foreign.code, "CLR11",
    "the firm wall is asked BEFORE the kind, or the kind refusal would confirm the document exists");
});
