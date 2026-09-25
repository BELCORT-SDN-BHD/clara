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
import { rootQuery, humanQuery, ensureReady, endPool, buildWorld, assertRaises } from "./rig-fixtures.mjs";
import { payrollDoc } from "./payroll-fact-revision-fixtures.mjs";

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
