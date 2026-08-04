// 0042 Wave D-b — x42.s5c-awcc: THE FOURTH CLOCK, END TO END (round-6 fix lane,
// owner ruling 2026-08-03 WDB-R1).
//
// clara.approve_wrong_client_correction is the door the design NAMED and
// deliberately left: section S2's header says "Doors this migration does not own
// still exist (clara.approve_wrong_client_correction mints its reversal at the
// session `current_date`)". The ruling widened 0042's register to already-shipped
// code, so S5.21 recut it to the house legal date. This cell is the MEASUREMENT of
// that recut — on the stamped posting_date of the minted mirror, through the
// audited preview → propose → approve door, with the approving session's timezone
// forced to one that provably disagrees with Asia/Kuala_Lumpur at this instant.
//
// WHY IT IS ITS OWN FILE. This is the only cell in the class that needs the
// document / filing / correction world (0007 + S5-D3); x42-s5c-clock.test.mjs owns
// the rest and would otherwise carry two unrelated worlds past the 500-line ceiling.
//
// WHAT THIS CELL ASKS THAT THE FIX DID NOT (WDB-R4):
//   * the mirror is minted inside a DEFINER body under a maker/checker floor — the
//     date must come from the HOUSE, not from the CHECKER's connection, and the two
//     are different questions. Measured with the checker in Pacific/Midway.
//   * the recut must not have moved anything else the correction does: the entry is
//     still reversed, the source filing retired, the destination ensured. A clock fix
//     that quietly changed the correction's other consequences would be worse than
//     the defect.
//   * the reversal must not be dated into the PREVIOUS day, which is the whole harm:
//     a previous day can sit in a month already closed, reported and filed.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, ROUTINE_CENTS, balanced, opk, human, rootQuery, withActor,
  ensureReady, docsReady, buildWorld, endPool, printLaneNotes, noteLane,
  freshResolution, draftEntry, approveEntry, seedVerifiedDocument, fileDocument,
  previewCorrection, proposeCorrection, activeFilings, allFilings, idOf,
} from "./rig-docs-fixtures.mjs";

let ready = false;
let has42 = false;
let world = null;

const LINES = balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS);

function unready(t) {
  if (!ready || !has42) {
    t.skip("the Slice-5 document pipeline or 0042 is absent — the fourth-clock cell is dormant");
    return true;
  }
  return false;
}

const firmOf = async (client) =>
  (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;

const houseToday = async () =>
  (await rootQuery("select (now() at time zone 'Asia/Kuala_Lumpur')::date as d")).rows[0].d;

const iso = (d) => (d instanceof Date
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : String(d));

before(async () => {
  await ensureReady();
  ready = await docsReady();
  try {
    has42 = (await rootQuery("select version from clara.schema_migrations where version ~ '^0042_'")).rows.length > 0;
  } catch { has42 = false; }
  if (ready && has42) world = await buildWorld();
  else noteLane("x42.s5c-awcc dormant (document pipeline or 0042 absent)");
});

after(async () => {
  printLaneNotes("x42.s5c-awcc — the fourth clock");
  await endPool();
});

/** A document filed to `client` with one APPROVED entry citing it (rig-docs §3.5's
 *  fixture, re-derived here rather than imported: it lives inside a .test.mjs). */
async function docWithApprovedEntry(sub, client) {
  const firm = await firmOf(client);
  const { documentId, sha256 } = await seedVerifiedDocument({ firm });
  const filing = await fileDocument(sub, { document: documentId, client, resolution: await freshResolution(sub, client) });
  const active = (await activeFilings(documentId))[0];
  const res = await freshResolution(sub, client);
  const d = await draftEntry(human(sub), { client, resolution: res, document: documentId, sha256, lines: LINES, opKey: opk("k42d") });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("k42a") });
  return { documentId, sha256, filing: filing ?? active.id, filingRow: active, entry: d.entry_id };
}

test("x42.s5c-awcc the wrong-client correction mirror is dated from the HOUSE legal date, not the checker's session", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const s = await docWithApprovedEntry(users.alice, clients.A1);

  // The destination attribution must exist BEFORE propose — the plan binds
  // books_version and the resolution's own event would otherwise stale it.
  await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: s.documentId });
  await previewCorrection(users.alice, { document: s.documentId, fromClient: clients.A1, toClient: clients.A2 });
  const proposal = await proposeCorrection(users.alice, {
    document: s.documentId, fromClient: clients.A1, toClient: clients.A2, reason: "x42 clock correction",
  });
  const correctionId = idOf(proposal, "correction_id", "correction");
  assert.ok(correctionId, `propose returned a correction id (got ${JSON.stringify(proposal)})`);
  const planHash = proposal.plan_hash
    ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  assert.ok(planHash, "the proposal is hash-bound");

  // APPROVE as a DISTINCT checker, in a session whose date disagrees with the
  // house's. Pacific/Midway is UTC-11: its local date is the previous day for
  // nineteen hours of every twenty-four, which is the harm this fix removes.
  const before_ = await houseToday();
  const sessionDate = await withActor(
    { role: ROLES.authenticated, jwtSub: users.bob },
    async (c) => {
      await c.query("set time zone 'Pacific/Midway'");
      const d = (await c.query("select current_date as d")).rows[0].d;
      await c.query(
        "select clara.approve_wrong_client_correction(p_correction => $1, p_plan_hash => $2,"
        + " p_attestation => null, p_op_key => $3) as result",
        [correctionId, planHash, opk("k42corr")]);
      return d;
    },
  );
  const after_ = await houseToday();

  // THE MIRROR. Its posting_date is the subject of S5.21.
  const mirror = (await rootQuery(
    "select id, posting_date, status, reversal_of from clara.journal_entries where reversal_of=$1", [s.entry])).rows;
  assert.equal(mirror.length, 1, "the correction minted exactly ONE reversal mirror");
  const got = iso(mirror[0].posting_date);
  assert.ok(
    got === iso(before_) || got === iso(after_),
    `the mirror is dated ${got}; the house legal date was ${iso(before_)} … ${iso(after_)} (the checker's session said ${iso(sessionDate)})`,
  );
  if (iso(sessionDate) !== got) {
    noteLane(`s5c-awcc: checker session date ${iso(sessionDate)} (Pacific/Midway) vs mirror ${got} — the pre-0042 body would have written the session's, one day into a month that may already be closed`);
  }

  // THE CORRECTION'S OTHER CONSEQUENCES ARE UNTOUCHED. A clock fix that quietly
  // changed what a correction DOES would be worse than the defect it removed.
  const src = (await rootQuery("select status, reversed_by from clara.journal_entries where id=$1", [s.entry])).rows[0];
  assert.ok(src.reversed_by, "the cited entry is still reversed (whole-consequence mirror, F3)");
  const filings = await allFilings(s.documentId);
  const a1 = filings.find((f) => f.client_id === clients.A1);
  const a2 = filings.find((f) => f.client_id === clients.A2);
  assert.ok(a1 && a1.retired_at != null, "A1's filing is still retired");
  assert.ok(a2 && a2.retired_at == null, "A2's filing is still ensured active");

  // ...and the shipped body really reads the authority — comment-stripped, so the
  // splice comment that NAMES it in prose cannot satisfy this on its own.
  const n = (await rootQuery(
    "select (length(s) - length(replace(s, 'clara._book_today()', ''))) / length('clara._book_today()') as n"
    + " from (select lower(regexp_replace(regexp_replace(regexp_replace(prosrc,'/\\*[\\s\\S]*?\\*/','','g'),"
    + " '--[^\\n]*','','g'),'\\s+',' ','g')) as s from pg_proc"
    + " where pronamespace='clara'::regnamespace and proname='approve_wrong_client_correction') q")).rows[0].n;
  assert.equal(Number(n), 1, "approve_wrong_client_correction must call the house legal date exactly once in CODE");
});
