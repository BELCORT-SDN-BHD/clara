// #986 — MAKE A RE-READ OPENING DOCUMENT RE-PARSABLE.
// Migration 0286_opening_source_reread.sql · gate tests/opening-source-reread-preintegration-gate.mjs
// · env var CLARA_ALLOW_MISSING_OPENING_SOURCE_REREAD.
//
// THE DEAD END THIS BATTERY CLOSES, measured rather than described. #656 built the
// opening-ledger-source flow: a tie document is read once and its `opening_tb.line` regions become
// document-primary targets through `clara.record_opening_targets_parsed`, under an op key that is
// stable per (seed, document) so a retried POST cannot double a basis. When the SAME document is
// genuinely read again — the ordinary production event — two walls close at once:
//
//   1. the re-parse refuses. The op key is unchanged while the payload is keyed by REGION ID, so
//      `clara._reserve_op` sees the same key with different args (CLR10; the runtime maps it to
//      the typed conflict `source_reread_since_parse`).
//   2. the APPROVAL refuses. `clara.approve_opening_seed` re-runs `clara._assert_opening_target_fact`
//      over every target, and `_assert_opening_extraction_ref` refuses a citation whose extraction
//      is superseded — CLR31 `extraction_not_accepted`.
//
// So the basis is bricked: nothing brings the targets onto the new reading, and the only escape is
// to cancel the basis and start another one. #656's own report files this as residual R4 / F4.
//
// THE REMEDY, AND WHAT IT DELIBERATELY DOES NOT TOUCH. 0286 adds ONE door,
// `clara.refresh_opening_targets_from_reread`, whose op key carries the NEW EXTRACTION, and which
// retires the targets standing on the superseded reading before recording the new ones, leaving a
// receipt on `clara.opening_target_refreshes` that the basis's own state reads back. The pinned
// (seed, document) shape is NOT weakened: `clara.record_opening_targets_parsed` is byte-identical
// after 0286 (its sha is pinned in 0286's prestate AND tail), the same-document replay still
// returns the original receipt, and the re-read conflict KEEPS FIRING on the parse door — it
// simply stops being a dead end.
//
// EVERY ASSERTION UNDER TEST DRIVES A REAL LEAST-PRIVILEGED PERSONA — `roleQuery(ROLES.runtime)`
// for the two runtime writers, `humanQuery` for the human doors and reads. `rootQuery` appears
// ONLY for arranging fixtures and for reading facts a masked door deliberately never returns
// (row counts, the raw registry table, the documents-table authority pointer); each such use is
// labelled where it happens.
//
// EVERY `opening_tb.line` REGION IS CREATED THROUGH `clara.persist_document_extraction`
// (wave-b/wb-opening-producer.mjs). A raw INSERT would let a cell prove the database accepts
// evidence the real producer could never have written.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CLR, PG, ROLES, assertRaises, opk, rootQuery, humanQuery, roleQuery, ensureReady, endPool,
} from "./rig-fixtures.mjs";
import {
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, planRevision,
  createOpeningSeed, recordOpeningTargetsParsed, getOpeningDryrun, draftOpeningItem,
  approveOpeningSeed, revMapOf, freshResolution, WB_COA, BEE,
} from "./wave-b/wb-fixtures.mjs";
import { produceTbRegions, withRefs } from "./wave-b/wb-opening-producer.mjs";

const MIGRATION = "0286_opening_source_reread.sql";
/** The variable the gate module sets, written out in full — the pairing between a gate and its
 *  battery in this estate is BY THIS STRING, never by a shared file-name stem. */
const GATE_ENV = "CLARA_ALLOW_MISSING_OPENING_SOURCE_REREAD";
/** The door 0286 installs, with its full argument list — a premise probe, never an assertion. */
const REFRESH_DOOR = "clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)";

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  // rootQuery: a catalog probe is a premise, not an assertion under test.
  const seen = (await rootQuery(
    "select to_regprocedure($1) is not null as door, to_regclass('clara.opening_target_refreshes') is not null as rel",
    [REFRESH_DOOR])).rows[0];
  if (!seen?.door || !seen?.rel) {
    if (process.env[GATE_ENV] !== "1") {
      throw new Error(
        `opening-source-reread premise ${MIGRATION} is not applied (${REFRESH_DOOR} resolves: ${seen?.door}, `
        + `clara.opening_target_refreshes exists: ${seen?.rel}) and ${GATE_ENV} is unset -- this is a FOCUSED `
        + "run and must fail loudly, not skip. Preload ./tests/opening-source-reread-preintegration-gate.mjs "
        + "for an estate sweep against a pre-0286 chain.",
      );
    }
    ready = false;
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------------------------

let W = null;
/** The wave-B world, built once: firm A carries alice (bookkeeper), grace (bookkeeper #2),
 *  hana (admin) and carol (viewer). */
async function world() {
  if (!W) W = await buildWaveBWorld();
  return W;
}

/** A fresh onboarding client with an opening-capable chart, a filed opening_balance_doc and an
 *  OPEN, TIED basis. Everything is built through audited writers. */
async function tiedScene(tag, { asOf = "2026-01-01" } = {}) {
  const w = await world();
  // #899 (0287): the client birth wall refuses a THIRD client whose name shares a family
  // token with two existing ones, and clara.name_family_token is the FIRST alphanumeric
  // token of the name -- so `p986_<tag>_<opk>` put every fixture client of this file in one
  // family, in the ONE firm this file shares, and the third onwards were refused. The unique
  // part leads now, exactly as wb-fixtures.mjs's own onboardingClient() default and
  // opening-ledger-source.test.mjs's own tiedScene were recut to do.
  const { client, plan } = await onboardingClient(w.users.alice, `p986${randomUUID().slice(0, 8)}_${tag}_${opk("c")}`);
  await seedOpeningCoa(w.users.alice, client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client });
  const receipt = await createOpeningSeed(w.users.alice, {
    client, plan, asOf, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  return { w, firm: w.firms.A, client, plan, doc, asOf, seed: receipt.seed_id ?? receipt.id };
}

/** The BEE trial balance, as the printed source states it: three lines that sum both ways. */
const BEE_LINES = [
  { line_key: "cash", account_code: WB_COA.cash, source_label: "Cash and bank", debit_cents: BEE.cashDr, credit_cents: 0 },
  { line_key: "re", account_code: WB_COA.re, source_label: "Retained earnings", debit_cents: BEE.reDr, credit_cents: 0 },
  { line_key: "sharecap", account_code: WB_COA.shareCap, source_label: "Share capital", debit_cents: 0, credit_cents: BEE.shareCr },
];

/** The op key the runtime mints for a refresh — `packages/runtime/lib/opening-parse.mjs`'s
 *  `openingRefreshOpKey`. Spelled out rather than imported (packages/db does not depend on
 *  packages/runtime); the runtime battery pins the same literal. */
const refreshKey = (seed, document, extraction) => `openingreread:${seed}:${document}:${extraction}`;

/** The refresh door, driven as the ONLY role that holds it. */
async function refreshOpeningTargets({ seed, lines, document, extraction, opKey = null }) {
  const r = await roleQuery(ROLES.runtime,
    `select clara.refresh_opening_targets_from_reread(
        p_seed => $1, p_lines => $2::jsonb, p_document => $3, p_extraction => $4, p_op_key => $5) as r`,
    [seed, JSON.stringify(lines), document, extraction, opKey ?? refreshKey(seed, document, extraction)]);
  return r.rows[0].r;
}

const claraReason = (err) => { try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; } };

const targetRows = (seed) => rootQuery(
  `select line_key, account_code, debit_cents, credit_cents, provenance_kind, document_id,
          source_sha256, extraction_ref, entered_by
     from clara.opening_tb_targets where seed_id=$1 order by line_key`, [seed]).then((r) => r.rows);

/** The three BEE drafts a tied basis needs to reach approval, all citing the tie document. */
async function stageBeeDrafts(sc) {
  const res = () => freshResolution(sc.w.users.alice, sc.client, { subjectKind: "document", subjectId: sc.doc.documentId });
  return [
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "gl_balance", item_key: "gl:cash" },
      lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }],
    }),
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "equity_net", item_key: "eq:net", amount_cents: -BEE.reDr },
    }),
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "gl_balance", item_key: "gl:sharecap" },
      lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: BEE.shareCr }],
    }),
  ];
}

// ---------------------------------------------------------------------------------------------
// 1 — THE REMEDY. AC1 and AC2: a named door brings the basis's targets onto the new reading, the
//     superseded ones are RETIRED rather than left beside them, and the basis's state says so.
// ---------------------------------------------------------------------------------------------

test("p986.reread.refresh: a genuinely re-read document is re-parsable -- the stale targets are retired, the new reading is recorded, and the basis carries the receipt", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("refresh");

  // READING ONE, through the real producer and the real parsed writer.
  const first = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  const parsed = await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, first.refs),
    opKey: `openingparse:${sc.seed}:${sc.doc.documentId}`,
  });
  assert.equal(Number(parsed.targets_recorded), 3);

  // READING TWO — the document is read again. This is the ordinary production event, and it is
  // what bricks the basis today.
  const second = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  assert.notEqual(second.extractionId, first.extractionId);
  // rootQuery: the authoritative pointer is documents-table plumbing no door returns.
  assert.equal(
    (await rootQuery("select authoritative_extraction_id from clara.documents where id=$1", [sc.doc.documentId]))
      .rows[0].authoritative_extraction_id,
    second.extractionId,
    "the newest done extraction is authoritative, kind-blind (0017 _tf_set_authoritative_extraction_0017)",
  );

  // THE PREMISE, DRIVEN AND NOT ASSUMED: the parse door still refuses the same key with different
  // args, which is the conflict the runtime maps to `source_reread_since_parse`.
  await assertRaises(CLR.badRequest, () => recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, second.refs),
    opKey: `openingparse:${sc.seed}:${sc.doc.documentId}`,
  }), "the re-parse under the pinned (seed, document) key");

  // THE REMEDY.
  const out = await refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withRefs(BEE_LINES, second.refs),
  });
  assert.equal(Number(out.targets_retired), 3, "every target standing on the superseded reading is retired");
  assert.equal(Number(out.targets_recorded), 3, "…and the new reading's three lines are recorded");
  assert.equal(out.from_extraction_id, first.extractionId);
  assert.equal(out.to_extraction_id, second.extractionId);

  // RETIRED AND REPLACED, NEVER BESIDE. The basis carries exactly three targets, every one of them
  // citing the reading the document now stands on.
  const rows = await targetRows(sc.seed);
  assert.equal(rows.length, 3, "the refresh replaced the target set; it did not double the basis");
  for (const r of rows) {
    assert.equal(r.provenance_kind, "document");
    assert.equal(r.extraction_ref.extraction_id, second.extractionId,
      "no target is left citing the reading nobody is acting on any more");
  }

  // THE BASIS'S STATE SHOWS WHICH — read by the least-privileged persona, through the same
  // firm-scoped SELECT policy the browser's own read rides.
  const receipt = (await humanQuery(sc.w.users.alice,
    `select seed_id, document_id, from_extraction_id, to_extraction_id, retired_count, recorded_count,
            jsonb_array_length(retired_targets) as snapshot_n
       from clara.opening_target_refreshes where seed_id=$1`, [sc.seed])).rows;
  assert.equal(receipt.length, 1, "one refresh, one receipt");
  assert.equal(receipt[0].from_extraction_id, first.extractionId);
  assert.equal(receipt[0].to_extraction_id, second.extractionId);
  assert.equal(receipt[0].retired_count, 3);
  assert.equal(receipt[0].recorded_count, 3);
  assert.equal(Number(receipt[0].snapshot_n), 3,
    "the retired targets are kept verbatim on the receipt — retired, not erased");
});

// ---------------------------------------------------------------------------------------------
// 2 — AC4. A basis that was STUCK reaches approval end to end, over the real parse-and-approve
//     doors. The drafted opening items are never abandoned: they are the same three entries the
//     first reading produced, and they are still there after the refresh.
// ---------------------------------------------------------------------------------------------

test("p986.reread.approve_end_to_end: a basis bricked by a re-read is approved after the refresh -- same drafts, real doors, no new basis", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("approve");
  const first = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, first.refs),
    opKey: `openingparse:${sc.seed}:${sc.doc.documentId}`,
  });
  const drafts = await stageBeeDrafts(sc);

  // THE BASIS IS BRICKED. The document is read again, and the approval — the real one, the
  // distinct-checker ceremony — refuses, because `clara.approve_opening_seed` re-runs the
  // field-level fact assertion over every target and `_assert_opening_extraction_ref` refuses a
  // citation whose extraction was superseded. This is the state #986 exists to unstick, and it is
  // DRIVEN here, never asserted from the ticket's prose.
  const second = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  const revBefore = await planRevision(sc.plan);
  const stuck = await assertRaises("CLR31", () => approveOpeningSeed(sc.w.users.hana, {
    seed: sc.seed, planRevision: revBefore, tieSha256: sc.doc.sha256,
    entryRevisions: revMapOf(drafts),
  }), "approve a basis whose targets cite the reading the document left behind");
  assert.equal(claraReason(stuck), "extraction_not_accepted",
    `the supersession wall refuses the approval too (0017 _assert_opening_extraction_ref), got ${claraReason(stuck)}`);

  // THE REMEDY, AND NOTHING ELSE: no new basis, no cancelled basis, the same three drafts.
  await refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withRefs(BEE_LINES, second.refs),
  });

  // The dry-run — the read a professional looks at before committing — ties on every account.
  const dryrun = await getOpeningDryrun(sc.w.users.alice, { seed: sc.seed });
  for (const d of dryrun.deltas ?? []) {
    assert.equal(Number(d.delta_debit), 0, `${d.account_code} differs from its refreshed target`);
    assert.equal(Number(d.delta_credit), 0, `${d.account_code} differs from its refreshed target`);
  }
  assert.equal(Number(dryrun.obe_net_cents), 0, "the refreshed basis nets opening-balance-equity to nil");

  // AND IT APPROVES. The SAME entry revisions the first reading drafted — the drafts were never
  // touched by the refresh, which is the half of AC4 that says "without abandoning the basis".
  const revAfter = await planRevision(sc.plan);
  const approved = await approveOpeningSeed(sc.w.users.hana, {
    seed: sc.seed, planRevision: revAfter, tieSha256: sc.doc.sha256,
    entryRevisions: revMapOf(drafts),
  });
  assert.ok(approved, "the approval returned a receipt");

  // rootQuery: the registry state and the approval count are facts no door returns to a caller.
  const state = (await rootQuery(
    `select (select state from clara.opening_seed_registry where id=$1) as state,
            (select count(*)::int from clara.opening_seed_approvals where seed_id=$1) as approvals,
            (select count(*)::int from clara.opening_seed_registry where client_id=$2 and state<>'cancelled') as live_bases,
            (select count(*)::int from clara.journal_entries where client_id=$2 and status='approved'
               and is_opening_balance) as approved_entries`,
    [sc.seed, sc.client])).rows[0];
  assert.equal(state.state, "finalized", "the basis this ticket unstuck reached the end of its own lifecycle");
  assert.equal(state.approvals, 3, "all three opening entries were approved");
  assert.equal(state.approved_entries, 3);
  assert.equal(state.live_bases, 1, "one basis, start to finish -- nothing was cancelled and restarted");
});

// ---------------------------------------------------------------------------------------------
// 3 — AC3. THE ANTI-DOUBLE-PARSE GUARANTEE DID NOT REGRESS, and the new door cannot be used as a
//     second road past it.
// ---------------------------------------------------------------------------------------------

test("p986.reread.no_regression: with NO re-read between attempts the parse still replays byte-identically, and the refresh door refuses to stand in for it", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("noregress");
  const only = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  const lines = withRefs(BEE_LINES, only.refs);
  // The STABLE key the route mints: `openingparse:<seed>:<document>` (opening-parse.mjs's
  // `openingOpKey`). A retried POST must not double the basis — 0286 did not move this.
  const key = `openingparse:${sc.seed}:${sc.doc.documentId}`;
  const first = await recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines, opKey: key });
  const second = await recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines, opKey: key });
  assert.deepEqual(second, first, "a replay returns the ORIGINAL receipt, byte-identically");
  assert.equal((await targetRows(sc.seed)).length, 3, "…and writes no second set of targets");

  // THE NEW DOOR IS THE RE-READ REMEDY AND NOTHING ELSE. On a basis nobody has re-read, it
  // refuses BY NAME — so it can never be the way somebody gets a second parse of one reading
  // past the (seed, document) key.
  const err = await assertRaises("CLR31", () => refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: only.extractionId, lines,
  }), "refresh a basis that was never re-read");
  assert.equal(claraReason(err), "no_reread_to_refresh",
    `the door names the missing precondition, got ${claraReason(err)}`);
  assert.equal((await targetRows(sc.seed)).length, 3, "a refused refresh moved nothing");
  // rootQuery: a receipt row count is a fact no door returns.
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.opening_target_refreshes where seed_id=$1", [sc.seed]))
      .rows[0].n, 0, "…and wrote no receipt");

  // THE STRUCTURAL HALF, which is this estate's own documented standard for a pinned body: the
  // parse door's source is byte-identical to the sha 0286's prestate AND tail both assert. A cell
  // that only drove the behaviour above could not tell "unchanged" from "changed compatibly".
  // rootQuery: a catalog hash is a fact no door returns.
  const sha = (await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p
      where p.oid = 'clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)'::regprocedure`)).rows[0].sha;
  assert.equal(sha, "f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1",
    "0286 recut the parse door -- the pinned idempotency shape moved, which is the one thing this ticket may not do");
});

// ---------------------------------------------------------------------------------------------
// 4 — THE REFRESH DOOR'S OWN WALLS, each with its own token, and its own replay.
// ---------------------------------------------------------------------------------------------

test("p986.reread.refresh_walls: a refresh onto a reading the document left, a payload mixing readings, and a retried refresh are three different answers", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("walls");
  const first = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, first.refs),
    opKey: `openingparse:${sc.seed}:${sc.doc.documentId}`,
  });
  const second = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });

  // ONTO A READING THE DOCUMENT HAS LEFT. Refreshing back onto the FIRST run would replace one
  // stale set with another, so the door refuses before a row moves and names WHICH reading was
  // wrong -- not which row.
  const stale = await assertRaises("CLR31", () => refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: first.extractionId,
    lines: withRefs(BEE_LINES, first.refs),
  }), "refresh onto the superseded run");
  assert.equal(claraReason(stale), "stale_extraction_version",
    `the door names the reading, got ${claraReason(stale)}`);

  // A PAYLOAD MIXING READINGS. One line still cites the run the document left; the receipt's own
  // from/to pair would be a fiction, so the whole refresh is refused.
  const mixed = withRefs(BEE_LINES, second.refs)
    .map((l) => (l.line_key === "cash" ? { ...l, extraction_ref: first.refs.cash } : l));
  const err = await assertRaises("CLR31", () => refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId, lines: mixed,
    opKey: opk("p986-mixed"),
  }), "a refresh payload citing two readings");
  assert.equal(claraReason(err), "refresh_extraction_mixed",
    `a mixed payload is its own fault, got ${claraReason(err)}`);

  // NOTHING MOVED. Both refusals are before the reservation, so the basis still stands exactly
  // where it did — on the first reading — and no receipt exists.
  const before = await targetRows(sc.seed);
  assert.equal(before.length, 3);
  for (const r of before) assert.equal(r.extraction_ref.extraction_id, first.extractionId);
  // rootQuery: a receipt row count is a fact no door returns.
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.opening_target_refreshes where seed_id=$1", [sc.seed]))
      .rows[0].n, 0, "a refused refresh wrote no receipt");

  // THE REFRESH'S OWN REPLAY. The key carries the new reading, so a retried POST of the SAME
  // refresh returns the original receipt byte-identically and retires nothing a second time —
  // the same guarantee the parse door has, one reading along.
  const key = refreshKey(sc.seed, sc.doc.documentId, second.extractionId);
  const done = await refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withRefs(BEE_LINES, second.refs), opKey: key,
  });
  const again = await refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withRefs(BEE_LINES, second.refs), opKey: key,
  });
  assert.deepEqual(again, done, "a retried refresh returns the ORIGINAL receipt, byte-identically");
  assert.equal((await targetRows(sc.seed)).length, 3, "…and writes no second set of targets");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.opening_target_refreshes where seed_id=$1", [sc.seed]))
      .rows[0].n, 1, "…and no second receipt");

  // A THIRD READING IS A NEW ACT, not a replay: a new key, a new receipt, and the chain of
  // receipts says which reading each one left.
  const third = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  const out3 = await refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: third.extractionId,
    lines: withRefs(BEE_LINES, third.refs),
  });
  assert.equal(out3.from_extraction_id, second.extractionId, "the second reading is the one now left behind");
  assert.equal(out3.to_extraction_id, third.extractionId);
  const chain = (await humanQuery(sc.w.users.alice,
    `select from_extraction_id, to_extraction_id from clara.opening_target_refreshes
      where seed_id=$1 order by refreshed_at`, [sc.seed])).rows;
  assert.deepEqual(chain, [
    { from_extraction_id: first.extractionId, to_extraction_id: second.extractionId },
    { from_extraction_id: second.extractionId, to_extraction_id: third.extractionId },
  ], "the basis's state reads back as the chain of readings it has stood on");
});

// ---------------------------------------------------------------------------------------------
// 4b — THE CALLER'S ECHO. `clara.record_opening_targets_parsed` admits an OPTIONAL `opening_fact`
//      on a line and accepts it only when it is EXACTLY the triple the database proved from the
//      cited region ([R3-F1]). The refresh door is the same lane writing the same rows, so it must
//      not accept a claim the parse door refuses (ADV-07).
// ---------------------------------------------------------------------------------------------

test("p986.reread.fact_echo: the refresh door runs the parse door's OWN caller-echo wall -- a contradicting opening_fact is refused by name, a malformed one too, and a matching echo passes", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("echo");
  const first = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, first.refs),
    opKey: `openingparse:${sc.seed}:${sc.doc.documentId}`,
  });
  const second = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  const fresh = () => withRefs(BEE_LINES, second.refs);

  /** The same payload with ONE line carrying a caller-asserted fact. */
  const withEcho = (echo) => fresh().map((l) => (l.line_key === "cash" ? { ...l, opening_fact: echo } : l));

  // THE PREMISE, DRIVEN: the parse door refuses exactly this echo, so "the two doors agree" is a
  // claim about a refusal that exists rather than one this cell invented. The key is a fresh one,
  // because the pinned (seed, document) key would answer the re-read conflict first.
  const parseSaid = await assertRaises("CLR31", () => recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId,
    lines: withEcho({ account_code: WB_COA.cash, amount_cents: BEE.cashDr + 100, side: "debit" }),
    opKey: opk("p986-echo-parse"),
  }), "the PARSE door on a contradicting echo");
  assert.equal(claraReason(parseSaid), "opening_extraction_fact_mismatch");

  // …AND SO DOES THE REFRESH DOOR, with the same token.
  const mismatch = await assertRaises("CLR31", () => refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withEcho({ account_code: WB_COA.cash, amount_cents: BEE.cashDr + 100, side: "debit" }),
    opKey: opk("p986-echo-mismatch"),
  }), "a refresh whose echoed fact contradicts the stored evidence");
  assert.equal(claraReason(mismatch), "opening_extraction_fact_mismatch",
    `the refresh door must refuse what the parse door refuses, got ${claraReason(mismatch)}`);

  // A SIDE THAT DISAGREES IS THE SAME FAULT — the echo is compared field by field, not by amount.
  const sided = await assertRaises("CLR31", () => refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withEcho({ account_code: WB_COA.cash, amount_cents: BEE.cashDr, side: "credit" }),
    opKey: opk("p986-echo-side"),
  }), "a refresh whose echoed side contradicts the stored evidence");
  assert.equal(claraReason(sided), "opening_extraction_fact_mismatch");

  // A MALFORMED ECHO IS ITS OWN TOKEN, never "mismatch": nothing was compared.
  const malformed = await assertRaises("CLR31", () => refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withEcho("not an object"),
    opKey: opk("p986-echo-malformed"),
  }), "a refresh whose echoed fact is not an object");
  assert.equal(claraReason(malformed), "opening_extraction_fact_malformed",
    `a malformed echo is its own fault, got ${claraReason(malformed)}`);

  // NOTHING MOVED. All three refusals happen inside the replace loop, after the retire — so the
  // transaction rolling back is what leaves the basis exactly where it stood, on the first
  // reading, with no receipt.
  const stood = await targetRows(sc.seed);
  assert.equal(stood.length, 3, "a refused refresh left the target set where it was");
  for (const r of stood) assert.equal(r.extraction_ref.extraction_id, first.extractionId);
  // rootQuery: a receipt row count is a fact no door returns.
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.opening_target_refreshes where seed_id=$1", [sc.seed]))
      .rows[0].n, 0, "…and wrote no receipt");

  // AND A MATCHING ECHO PASSES. The wall admits the claim it can verify; the figures stored are
  // still the database's own, never the caller's.
  const out = await refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withEcho({ account_code: WB_COA.cash, amount_cents: BEE.cashDr, side: "debit" }),
  });
  assert.equal(Number(out.targets_recorded), 3, "a truthful echo is accepted");
  const rows = await targetRows(sc.seed);
  assert.equal(rows.length, 3);
  const cash = rows.find((r) => r.account_code === WB_COA.cash);
  assert.equal(Number(cash.debit_cents), BEE.cashDr, "…and the stored figure is the evidence's, not the echo's");
  assert.equal(cash.extraction_ref.extraction_id, second.extractionId);
});

// ---------------------------------------------------------------------------------------------
// 5 — THE FLOORS AND THE RECEIPT'S OWN POSTURE. A document-primary opening target is written by
//     the lane that re-derived it from stored evidence, never by a browser that typed it — and
//     the record of a refresh is read by a professional, written by nobody.
// ---------------------------------------------------------------------------------------------

test("p986.roles.runtime_only: the refresh door is clara_runtime's alone, and its receipt is readable, firm-scoped and append-only", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("roles");
  const first = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, first.refs),
    opKey: `openingparse:${sc.seed}:${sc.doc.documentId}`,
  });
  const second = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });

  // NO HUMAN LANE, at any rank. `clara.record_opening_target` already refuses a tied basis with
  // CLR31 `parsed_target_writer_required`; the REFRESH is the same lane, so the human role must
  // not hold EXECUTE at all — a floor inside the body would be a second, weaker answer.
  const call = `select clara.refresh_opening_targets_from_reread($1,$2::jsonb,$3,$4,$5)`;
  const args = [sc.seed, JSON.stringify(withRefs(BEE_LINES, second.refs)),
    sc.doc.documentId, second.extractionId, opk("p986-floor")];
  for (const who of [sc.w.users.hana, sc.w.users.alice, sc.w.users.carol]) {
    await assertRaises(PG.insufficientPrivilege, () => humanQuery(who, call, args),
      "a human lane executing the refresh door");
  }
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, call, args),
    "the agent read lane executing the refresh door");

  // The runtime lane holds it, and that is the only road.
  await refreshOpeningTargets({
    seed: sc.seed, document: sc.doc.documentId, extraction: second.extractionId,
    lines: withRefs(BEE_LINES, second.refs),
  });

  // THE RECEIPT IS READ, NOT WRITTEN. A bookkeeper of the firm sees it; firm B's dave sees
  // nothing at all (the firm-scoped SELECT policy, not a masked door); neither may write it.
  assert.equal((await humanQuery(sc.w.users.alice,
    "select count(*)::int as n from clara.opening_target_refreshes where seed_id=$1", [sc.seed])).rows[0].n, 1);
  assert.equal((await humanQuery(sc.w.users.dave,
    "select count(*)::int as n from clara.opening_target_refreshes where seed_id=$1", [sc.seed])).rows[0].n, 0,
    "a foreign firm reads no refresh of a basis it cannot see");
  for (const [label, sql] of [
    ["UPDATE", "update clara.opening_target_refreshes set retired_count=9"],
    ["DELETE", "delete from clara.opening_target_refreshes"],
    ["INSERT", "insert into clara.opening_target_refreshes(firm_id,client_id,seed_id,document_id,from_extraction_id,to_extraction_id,retired_count,recorded_count,retired_targets,op_key) values (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,1,'[{}]'::jsonb,'probe')"],
  ]) {
    await assertRaises(PG.insufficientPrivilege, () => humanQuery(sc.w.users.hana, sql),
      `clara_authenticated must hold no ${label} on the refresh receipt`);
  }

  // APPEND-ONLY AT THE STORAGE LAYER, not only by grant: even the role that owns the table is
  // refused, so a future definer door cannot quietly rewrite what a refresh recorded.
  // rootQuery: only a superuser can reach past the grants to exercise the trigger itself.
  const err = await assertRaises("CLR08",
    () => rootQuery("update clara.opening_target_refreshes set retired_count=9 where seed_id=$1", [sc.seed]),
    "rewriting a refresh receipt");
  assert.match(err.message, /append-only/);
  await assertRaises("CLR08",
    () => rootQuery("delete from clara.opening_target_refreshes where seed_id=$1", [sc.seed]),
    "erasing a refresh receipt");
});
