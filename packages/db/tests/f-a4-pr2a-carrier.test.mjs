// F-A4 PR-2a -- Annex A, the CARRIER + DOOR group (W17-W20, W33) and the evaluator's typed
// refusals (W6-W8). The carrier is where a professional's stated basis lives, so every wall here is
// about a fact that must not be quietly rewritten, quietly duplicated, or quietly read.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, evaluate, caught, periodRows,
} from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

const PERIOD = { start: "2025-02-01", end: "2025-04-30" };

/** An APPROVED entry on the scene's client that binds NO document -- the memo-basis shape
 *  ck_je_basis permits, built through the governed doors like every other fixture here. */
async function memoEntry(sc) {
  const { draftEntryV3, approveEntry } = await import("./wave-a-reads.mjs");
  const { freshResolution, opk } = await import("./wave-a-fixtures.mjs");
  const d = await draftEntryV3(sc.alice, {
    client: sc.client,
    resolution: await freshResolution(sc.alice, sc.client, { subjectKind: "manual", subjectId: null }),
    memo: "memo-basis, no document", postingDate: "2025-01-20",
    lines: [
      { account_code: sc.prepaid, debit_cents: 5000, credit_cents: 0, description: "dr" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: 5000, description: "cr" },
    ],
    opKey: opk("fa4p2a-memo"),
  });
  await approveEntry(sc.bob, { entry: d.entry_id, expectedRevision: d.revision_token,
    opKey: opk("fa4p2a-memoappr") });
  return d.entry_id;
}

// ---------------------------------------------------------------------------------------------
// W17-W19 -- the carrier's own discipline.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W17 the carrier is SUPERSEDE-ONLY: an ordinary UPDATE refuses, the supersede stamp is the one lawful change, DELETE refuses", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w17");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const [row] = await periodRows(sc.document);
  assert.ok(row, "the door wrote no row -- the cell would be vacuous");

  const upd = await caught(() => rootQuery(
    "update clara.document_service_periods set period_start = $1 where id = $2",
    ["2025-01-01", row.id]));
  assert.ok(upd, "an ordinary UPDATE rewrote a recorded fact");
  assert.match(String(upd.detail ?? upd.message), /service_period_immutable/);

  const del = await caught(() => rootQuery(
    "delete from clara.document_service_periods where id = $1", [row.id]));
  assert.ok(del, "a DELETE removed a recorded fact -- the carrier is append-only");

  // The ONE lawful update is the supersession stamp, and the DOOR performs it: a second call
  // stamps the predecessor and inserts a successor in one transaction.
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-03-01", end: "2025-05-31",
    basis: "the client sent a corrected invoice" });
  // Dates are formatted IN THE DATABASE. A JS Date for a DATE column shifts by the local offset,
  // which silently turns 2025-03-01 into 2025-02-28 for anyone east of UTC.
  const shaped = await rootQuery(
    `select id, to_char(period_start,'YYYY-MM-DD') as start, superseded_at, superseded_by
       from clara.document_service_periods where document_id = $1 order by recorded_at, id`,
    [sc.document]);
  assert.equal(shaped.rows.length, 2, "the correction must be a SUCCESSOR row, never an edit");
  const live = shaped.rows.filter((r) => r.superseded_at === null);
  assert.equal(live.length, 1, "exactly one live period survives a correction");
  assert.equal(live[0].start, "2025-03-01");
  const dead = shaped.rows.find((r) => r.superseded_at !== null);
  assert.equal(dead.superseded_by, live[0].id, "the predecessor points AT its successor");
});

test("fa4p2a.W17-mutant with the supersede-only trigger disabled the UPDATE lands -- the trigger, not a coincidence, is the refusal", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w17m");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const [row] = await periodRows(sc.document);
  // withTxn HOLDS ONE CONNECTION for the whole block, and the first cut of this cell did not.
  // rootQuery is POOLED, so `rootQuery("begin")` opened a transaction on one connection while the
  // DISABLE TRIGGER and the ROLLBACK went to others -- the disable therefore AUTOCOMMITTED and
  // PERMANENTLY disarmed the wall on the rig, which is how W17 came to "pass" a run in which the
  // trigger was not even armed. `.claude/rules/db-tests.md` states this rule; I broke it and it
  // cost a false green, which is exactly the failure a mutant exists to prevent.
  await withTxn(async (c) => {
    await c.query("alter table clara.document_service_periods disable trigger t_dsp_supersede_only");
    await c.query("update clara.document_service_periods set period_start = $1 where id = $2",
      ["2025-01-01", row.id]);
    const r = await c.query(
      "select to_char(period_start,'YYYY-MM-DD') as d from clara.document_service_periods where id = $1",
      [row.id]);
    // Formatted IN THE DATABASE: a JS Date for a DATE column shifts by the local offset, and the
    // first cut of this assertion compared '2025-01-01' against a UTC-shifted '2024-12-31'.
    assert.equal(r.rows[0].d, "2025-01-01",
      "even with the trigger disabled the UPDATE did not land -- W17 may be passing for some other reason");
  }, { commit: false });

  // AND THE WALL IS BACK: proven by a read, not assumed from the rollback.
  const armed = await rootQuery(
    `select tgenabled::text as e from pg_trigger where tgrelid='clara.document_service_periods'::regclass
       and tgname='t_dsp_supersede_only'`);
  assert.equal(armed.rows[0].e, "O", "the mutant left the supersede-only trigger disabled on the rig");
});

test("fa4p2a.W18 ONE LIVE PERIOD PER DOCUMENT -- a second live insert meets the partial unique", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w18");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const [row] = await periodRows(sc.document);
  const e = await caught(() => rootQuery(
    `insert into clara.document_service_periods(firm_id, document_id, period_start, period_end,
       basis_kind, basis, recorded_by)
     values ($1,$2,'2025-06-01','2025-07-31','human_stated','a second live period',$3)`,
    [sc.firm, sc.document, row.recorded_by]));
  assert.ok(e, "a second LIVE period landed on one document");
  assert.equal(e.code, "23505", "the refusal must come from uq_document_service_period_live");

  // MUTANT (the positive control): the index is PARTIAL, so it constrains the LIVE population
  // only. Driven through the DOOR -- the lawful producer -- rather than by hand-superseding the
  // predecessor, which the supersede-only trigger rightly refuses (a row may not supersede itself).
  // A cell that never proved a successor CAN be inserted would not have shown the index is partial.
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-06-01", end: "2025-07-31",
    basis: "a successor period through the door" });
  const rows = await periodRows(sc.document);
  assert.equal(rows.filter((r) => r.superseded_at === null).length, 1,
    "after a lawful supersession exactly one live period remains");
  assert.ok(rows.length >= 2, "and the predecessor is still on the table -- reverse, never delete");
});

test("fa4p2a.W19 the carrier's BASIS DISCIPLINE: a blank basis, an 'extracted' row with no region, and a region on a human row are each refused", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w19");
  const who = (await rootQuery("select id from clara.users limit 1")).rows[0].id;
  const ins = (kind, basis, region) => rootQuery(
    `insert into clara.document_service_periods(firm_id, document_id, period_start, period_end,
       basis_kind, basis, evidence_region_id, recorded_by)
     values ($1,$2,'2025-02-01','2025-04-30',$3,$4,$5,$6)`,
    [sc.firm, sc.document, kind, basis, region, who]);

  const blank = await caught(() => ins("human_stated", "   ", null));
  assert.ok(blank, "a BLANK basis was recorded -- a fact without its justification is what ADR-062 forbids");

  const extractedNoRegion = await caught(() => ins("extracted", "read off the page", null));
  assert.ok(extractedNoRegion, "an 'extracted' row with NO evidence region was recorded -- a claim with no page");

  // The door itself refuses a blank basis BY NAME, before the constraint speaks -- the caller gets
  // a reason rather than a constraint violation.
  const doorBlank = await caught(() => recordPeriod(sc.alice, { document: sc.document, ...PERIOD, basis: "  " }));
  assert.ok(doorBlank, "the door accepted a blank basis");
  assert.match(String(doorBlank.detail ?? doorBlank.message), /service_period_basis_missing/);

  // MUTANT / positive control: the well-formed human_stated row inserts, so the walls above are
  // refusing a SHAPE and not refusing everything.
  const ok = await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  assert.ok(ok?.service_period_id, "a well-formed human_stated period was refused");
  assert.equal(ok.basis_kind, "human_stated", "the door writes the kind STRUCTURALLY, never from a caller");
});

test("fa4p2a.W20 the carrier's TENANCY and FLOOR: a below-floor viewer reads zero, a bookkeeper reads its own firm", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w20");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const planted = await rootQuery(
    "select count(*)::int as n from clara.document_service_periods where document_id=$1", [sc.document]);
  assert.ok(planted.rows[0].n >= 1, "there is a real row to read (the cell is not vacuous)");

  const viewer = await rootQuery(
    `select u.id from clara.users u join clara.firm_memberships m on m.user_id = u.id
      where m.firm_id = $1 and m.status='active'
        and clara.role_rank(m.role) < clara.role_rank('bookkeeper') limit 1`, [sc.firm]);
  assert.ok(viewer.rows.length > 0,
    "a below-floor viewer is REQUIRED for this control: without one the cell cannot tell a working floor from an absent one, so it FAILS rather than notes (Codex C6). buildWorld mints one; if it stopped, fix the fixture, not this assertion.");
  const asViewer = await humanQuery(viewer.rows[0].id,
    "select count(*)::int as n from clara.document_service_periods where document_id=$1", [sc.document]);
  assert.equal(asViewer.rows[0].n, 0, "a below-floor viewer read a professional's stated basis");
  const asBookkeeper = await humanQuery(sc.alice,
    "select count(*)::int as n from clara.document_service_periods where document_id=$1", [sc.document]);
  assert.ok(asBookkeeper.rows[0].n >= 1, "the bookkeeper+ read must still work -- a floor that locks out its own consumers is not a fix");

  // THE FLOOR IS IN THE POLICY, not merely in a reader: read the live policy expression, which is
  // what binds every reader rather than only the polite one.
  const pol = await rootQuery(
    `select pg_get_expr(p.polqual, p.polrelid) as q from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname='document_service_periods' and p.polname='p_dsp_human'`);
  assert.match(pol.rows[0].q, /actor_role_rank/);
  assert.match(pol.rows[0].q, /jwt_firm/);
});

test("fa4p2a.W33 (F6) a period citing a region extracted from ANOTHER document refuses -- the composite FK never saw it", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The FK proves the FIRM and nothing else: document_regions hangs off extraction_id, not off a
  // document. Without the congruence trigger a period on document A could cite a region read off
  // document B and every DECLARED constraint would pass.
  const sc = await prepaidScene("w33");
  const other = await prepaidScene("w33b");
  // The extraction's shape was READ off pg_attribute and its CHECKs, not guessed: engine_kind and
  // envelope are NOT NULL and `status` admits only done/failed. The first cut of this staging used
  // 'succeeded' and omitted both columns, and the cell SKIPPED rather than failing -- which is
  // precisely the vacuity Annex A's armed-skip statement exists to catch, so the staging was fixed
  // rather than the skip tolerated.
  const x = await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n,
       status, envelope, extracted_at)
     values ($1,$2,'rig-fa4p2a','ocr',1,'done','{}'::jsonb, now()) returning id`,
    [sc.firm, other.document]);
  const region = await rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path)
       values ($1,$2,'page_polygon','{"page":1}'::jsonb,'invoice.total') returning id`,
    [sc.firm, x.rows[0].id]);
  const who = (await rootQuery("select id from clara.users limit 1")).rows[0].id;
  const e = await caught(() => rootQuery(
    `insert into clara.document_service_periods(firm_id, document_id, period_start, period_end,
       basis_kind, basis, evidence_region_id, recorded_by)
     values ($1,$2,'2025-02-01','2025-04-30','extracted','read off the page',$3,$4)`,
    [sc.firm, sc.document, region.rows[0].id, who]));
  assert.ok(e, "a period cited a region extracted from a DIFFERENT document -- provenance theatre");
  assert.match(String(e.detail ?? e.message), /service_period_evidence_foreign_document/);
});

// ---------------------------------------------------------------------------------------------
// W6-W8 -- the evaluator's typed refusals. Every one is RETURNED, never raised, so the caller can
// turn it into a rung; a raise inside an agent core would abort the transaction and take the
// receipt with it.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W6 with no live service period the evaluator refuses and NAMES the missing fact and its document", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w6");
  const before = await evaluate(sc.client, sc.entry);
  assert.equal(before.refusal, "prepayment_term_underivable");
  assert.equal(before.missing, "document_service_periods",
    "the refusal must say WHICH fact to record");
  assert.equal(before.document_id, sc.document, "and ON WHICH document -- the human's next act is one call");
  const written = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client]);
  assert.equal(written.rows[0].n, 0, "a refusal wrote a template row");

  // MUTANT: record the period through the door and the SAME call now derives a schedule.
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const after = await evaluate(sc.client, sc.entry);
  assert.equal(after.refusal ?? null, null, "with the fact recorded the evaluator must derive");
  assert.equal(after.period_count, 3);
  assert.equal(Number(after.total_cents), sc.cents);
});

test("fa4p2a.W7 a MEMO-BASED entry that binds no document is its own refusal", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w7");
  // A MEMO-BASIS entry is BUILT here rather than hunted for: ck_je_basis permits an entry with no
  // document, so the absence of one is a first-class refusal, and a cell that only ran when some
  // other fixture happened to leave a suitable row behind would be a skip waiting to happen.
  const memo = await memoEntry(sc);
  const a = await evaluate(sc.client, memo);
  assert.equal(a.refusal, "prepayment_term_underivable");
  assert.equal(a.missing, "journal_entries.document_id",
    "the refusal must name the document binding as the missing thing, not the service period");
  // MUTANT / positive control: the SAME client's document-bound entry, with its period recorded,
  // derives -- so this refusal is about the missing document and not about the client.
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const ok = await evaluate(sc.client, sc.entry);
  assert.equal(ok.refusal ?? null, null);
});

test("fa4p2a.W8 prepayment_source_unfit: an unapproved entry and a foreign client each refuse", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w8");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });

  const draft = await rootQuery(
    `select id from clara.journal_entries where client_id=$1 and status='draft' limit 1`, [sc.client]);
  if (draft.rows.length > 0) {
    const a = await evaluate(sc.client, draft.rows[0].id);
    assert.equal(a.refusal, "prepayment_source_unfit", "an UNAPPROVED entry is not amortisable");
    assert.equal(a.status, "draft");
  } else {
    noteLane("fa4p2a.W8: no draft entry on this client -- the unapproved arm is not driven, PRINTED");
  }

  // FOREIGN CLIENT: the entry is real, the client is not its owner. Absent and foreign must answer
  // with ONE refusal -- this evaluator is not an existence oracle for another client's books.
  const other = await prepaidScene("w8b");
  const foreign = await evaluate(other.client, sc.entry);
  assert.equal(foreign.refusal, "prepayment_source_unfit");

  // MUTANT / positive control: the fit case ACTS, so the refusals above are conditional.
  const ok = await evaluate(sc.client, sc.entry);
  assert.equal(ok.refusal ?? null, null, "the fit case must derive -- otherwise W8 is refusing everything");
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0,
    `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip (Annex A's armed-skip statement)`);
});
