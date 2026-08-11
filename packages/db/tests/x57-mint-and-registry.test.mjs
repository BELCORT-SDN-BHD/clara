// 0057 (Wave E lane gamma, the period registry + month snapshots) rig -- PART 1:
// minting, the period registry's calendar semantics (E1b), the two RECORD cells
// (E4/E5), and the reproducibility + honest-boundary right-answer cells (E6/E10).
// Matrix: docs/plan/wave-e-acceptance-matrix.md Section E (E1, E1b, E4, E5, E6,
// E10). Design contract: docs/plan/wave-e-design-skeleton-part3.md SS2.11-2.12.
//
// R1 FIX BATCH (2026-08-11): finding 3 -- E10 now asserts a POSITIVE
// drift=true on a mover that genuinely rides inside the payload
// (coa_accounts.name, part of trial_balance), keeping the counterparty-rename
// null observation as a recorded note only. Finding 4 -- E6 is re-labelled per
// E1b's own convention: verify_snapshot shares clara._snapshot_dataset with
// the mint BY DESIGN, so this cell proves the GAMMA half (deterministic,
// byte-identical re-execution against the pinned watermark) and records the
// INDEPENDENT-evaluator half as NOT REACHABLE until delta. Finding 5 -- E1b's
// hasDeltaEvaluator check is now a noteLane, not an assertion (it would arm a
// future false failure the day delta lands).
//
// CONTRACT-BLIND on 0057 itself: every claim is probed off the LIVE CATALOG
// (mint_month_snapshot / snapshot_state / verify_snapshot's live bodies ARE
// read via pg_get_functiondef for MY OWN authorial grounding -- the
// x56-rest-e precedent) -- `0057_wave_e_registry_snapshots.sql` itself is
// never opened.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, opk, buildWorld, printLaneNotes, printSkipCount, noteLane, markSkip, endPool,
  has0056, has0057, hasDeltaEvaluator, freshActiveClient, setupCloseCoa, bookToday,
  AR1, REVN, birthCounterparty, renameCounterparty,
  mintMonthSnapshot, verifySnapshot, snapshotState, reportingPeriodRows, periodSnapshotRow,
  openArItem57, caught,
} from "./x57-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = (await has0056()) && (await has0057());
  if (!ready) { noteLane("0056 or 0057 not applied -- x57 mint-and-registry suite skipped"); return; }
  world = await buildWorld();
});
after(async () => { printLaneNotes("x57-mint-and-registry"); printSkipCount("x57-mint-and-registry"); await endPool(); });

function skip57(t) {
  if (!ready) { markSkip(); t.skip("0056/0057 surface absent"); return true; }
  return false;
}

/** First-of-month, `n` whole months before the DB's own book-today -- always a
 *  COMPLETED month (mint_month_snapshot refuses a month that has not finished,
 *  its own period_not_complete guard, read live). Computed from the DB's clock,
 *  never a hardcoded literal, so this suite never rots against the wall clock. */
async function pastMonthStart(n) {
  const today = await bookToday(); // 'YYYY-MM-DD', Asia/Kuala_Lumpur
  const [y, m] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

// ===========================================================================
// E1 -- mint a month snapshot for a month with real approved invoices: a
// durable, timestamped, hashed artifact bound to a reporting_periods row; the
// books stay OPEN (a post AFTER the mint must succeed).
// ===========================================================================
test("E1: mint_month_snapshot mints a timestamped, hashed artifact bound to a reporting_periods row, and books stay OPEN after", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e1");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E1CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const { entry: inv } = await openArItem57(owner, { client, cp, cents: 250_000, postingDate: `${monthStart.slice(0, 8)}10` });
  assert.ok(inv, "mandatory setup: one approved invoice inside the target month");

  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  assert.ok(receipt.snapshot_id, `mint_month_snapshot names its snapshot (got ${JSON.stringify(receipt)})`);
  assert.ok(receipt.reporting_period_id, "the receipt names the bound reporting_period_id");
  assert.equal(receipt.kind, "management_accounts");
  assert.match(receipt.dataset_sha256, /^[0-9a-f]{64}$/, "a real sha256, not a placeholder");
  assert.equal(receipt.state, "current", "a freshly minted artifact reads current");

  const stored = await periodSnapshotRow(receipt.snapshot_id);
  assert.ok(stored, "the artifact is a durable row, not just a returned payload");
  assert.equal(stored.dataset_sha256, receipt.dataset_sha256);
  assert.ok(stored.minted_at, "timestamped");

  const periods = await reportingPeriodRows(client, "month");
  const boundPeriod = periods.find((p) => p.id === receipt.reporting_period_id);
  assert.ok(boundPeriod, "the snapshot's reporting_period_id resolves to a REAL registry row");
  assert.equal(boundPeriod.period_start, monthStart);

  const postMint = await caught(() => openArItem57(owner, { client, cp, cents: 10_000, postingDate: `${monthStart.slice(0, 8)}20` }));
  assert.equal(postMint, null, `a post into an already-snapshotted month must succeed (months never lock) -- got ${postMint?.message}`);
});

// ===========================================================================
// E4 -- RECORD CELL. The approved-invoice count is MEASURED on THIS run's OWN
// rig world, with its query stated here, never inherited from any document.
// ===========================================================================
test("E4 (RECORD): the approved-invoice count is measured on this run's own world, with its query", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e4");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E4CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(6);
  const postingDate = `${monthStart.slice(0, 8)}12`;
  await openArItem57(owner, { client, cp, cents: 100_000, postingDate });
  await openArItem57(owner, { client, cp, cents: 200_000, postingDate });
  await openArItem57(owner, { client, cp, cents: 300_000, postingDate });

  const QUERY = `select count(*)::int as n from clara.journal_entries e
    join clara.open_items i on i.entry_id = e.id
    where e.client_id = $1 and e.status = 'approved' and i.domain = 'ar'`;
  const measured = (await rootQuery(QUERY, [client])).rows[0].n;
  assert.equal(measured, 3, `E4 MEASURED (query: ${QUERY.replace(/\s+/g, " ").trim()}) approved-invoice count on this run's own world = ${measured}`);
  noteLane(`E4 RECORD: measured ${measured} approved AR-bound entries on client ${client} at ${new Date().toISOString()} via: ${QUERY.replace(/\s+/g, " ").trim()}`);
});

// ===========================================================================
// E5 -- the enrichment trap. RECORD CELL scoped to the LIVE ROME SECRETARY
// client on the live Supabase project. This rig NEVER touches the live
// database; recorded honestly as NOT-RIG-RUNNABLE / CEREMONY-TIME.
// ===========================================================================
test("E5 (RECORD): the RS enrichment trap is CEREMONY-TIME/not-rig-runnable -- recorded, not fabricated", (t) => {
  markSkip();
  t.skip("E5 reads LIVE ROME SECRETARY customer data on the live Supabase project; this lane is RIG-ONLY (local PG16:5544) and never touches live. NOT-RIG-RUNNABLE per the matrix's own vocabulary (S0.2) -- this is a ceremony-time cell for the h1/h2 grade, not a rig acceptance cell.");
  noteLane("E5 (RECORD): NOT-RIG-RUNNABLE -- the enrichment trap is scoped to the live RS client; no rig fixture exists (or should exist) for it. Ceremony-time only.");
});

// ===========================================================================
// E1b -- $P-1 RESOLVES BY CALENDAR, AND A MISSING PRIOR IS `absent`. The
// PRODUCER half (SS2.12): a registry with January and March but no February is
// a LEGAL state -- minting is not continuity-gated. The CONSUMER half (the
// evaluator resolving a comparative metric to 'absent' for the gap) is lane
// delta's; delta has not built on this rig -- NOT REACHABLE from lane gamma
// alone.
//
// FIX (finding 5): the delta-absence check is a noteLane, not an assertion --
// asserting hasDeltaEvaluator()===false would flip this cell RED the day delta
// actually lands, for no reason connected to gamma's own correctness.
// ===========================================================================
test("E1b: the registry legally admits January+March with NO February row (producer half); delta's $P-1 consumer half is NOT REACHABLE here", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e1b");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E1BCO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const jan = await pastMonthStart(8);
  const [jy, jm] = jan.split("-").map(Number);
  const marTotal = jy * 12 + (jm - 1) + 2;
  const mar = `${Math.floor(marTotal / 12)}-${String((marTotal % 12) + 1).padStart(2, "0")}-01`;
  const febTotal = jy * 12 + (jm - 1) + 1;
  const feb = `${Math.floor(febTotal / 12)}-${String((febTotal % 12) + 1).padStart(2, "0")}-01`;

  await openArItem57(owner, { client, cp, cents: 50_000, postingDate: `${jan.slice(0, 8)}05` });
  await mintMonthSnapshot(owner, { client, monthStart: jan });
  await openArItem57(owner, { client, cp, cents: 60_000, postingDate: `${mar.slice(0, 8)}05` });
  await mintMonthSnapshot(owner, { client, monthStart: mar });

  const periodsBefore = await reportingPeriodRows(client, "month");
  const starts = periodsBefore.map((p) => p.period_start);
  assert.ok(starts.includes(jan), "January's registry row exists");
  assert.ok(starts.includes(mar), "March's registry row exists");
  assert.ok(!starts.includes(feb), "PRODUCER HALF: February's registry row does NOT exist -- a gap is a legal registry state, minting is not continuity-gated");

  await openArItem57(owner, { client, cp, cents: 10_000, postingDate: `${feb.slice(0, 8)}05` });
  const febReceipt = await mintMonthSnapshot(owner, { client, monthStart: feb });
  assert.ok(febReceipt.snapshot_id, "February mints lawfully once asked");
  const periodsAfter = await reportingPeriodRows(client, "month");
  assert.ok(periodsAfter.map((p) => p.period_start).includes(feb), "February's registry row now exists");

  const hasDelta = await hasDeltaEvaluator();
  noteLane(`E1b GROUNDING (recorded, not asserted -- finding 5): lane-delta evaluator present on this rig = ${hasDelta}. E1b's CONSUMER HALF ($P-1 resolving a comparative metric to 'absent' for a registry gap) is NOT REACHABLE from lane gamma while this reads false: no honest path exists on this rig to 'evaluate a comparative metric bound to the March period' without delta's metric catalog/evaluator. This is a structural NOT REACHABLE per the matrix's S0.2 vocabulary, not a defect of 0057 -- the producer half (registry gap legality + on-demand February mint) above is fully SEEN and PASSES.`);
});

// ===========================================================================
// E6 -- RIGHT ANSWER, the gamma HALF. verify_snapshot recomputes via the SAME
// clara._snapshot_dataset function the mint itself calls (0057 states this
// sharing explicitly) -- so this cell proves DETERMINISTIC REPRODUCIBILITY
// (byte-identical output against the pinned watermark), not independent
// evaluation. The INDEPENDENT-EVALUATOR half (a genuinely separate computation
// path, delta's to build) is NOT REACHABLE from lane gamma alone -- the same
// class of gap E1b's consumer half already names (finding 4).
// ===========================================================================
test("E6 (RIGHT ANSWER, gamma half): a fresh snapshot's figures reproduce byte-for-byte on deterministic re-execution against the pinned watermark; the independent-evaluator half is NOT REACHABLE until delta", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e6");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E6CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(7);
  await openArItem57(owner, { client, cp, cents: 175_000, postingDate: `${monthStart.slice(0, 8)}08` });

  const receipt = await mintMonthSnapshot(owner, { client, monthStart });
  const verified = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(verified.drift, false, `E6: deterministic RE-EXECUTION of _snapshot_dataset against the SAME pinned watermark reproduces ZERO drift (got ${JSON.stringify(verified)})`);
  assert.equal(verified.recomputed_dataset_sha256, receipt.dataset_sha256, "the re-execution matches the stored hash byte-for-byte");
  assert.equal(verified.stored_dataset_sha256, receipt.dataset_sha256, "verify_snapshot's own stored-hash read agrees with the mint receipt");
  assert.equal(verified.state, "current");
  assert.deepEqual(verified.drifted_keys, [], "no key drifted");

  noteLane("E6 SCOPE NOTE (finding 4): verify_snapshot shares clara._snapshot_dataset with mint_month_snapshot BY DESIGN (0057's own stated sharing) -- this cell therefore proves the GAMMA half only (deterministic, byte-identical re-execution against the pinned watermark). An INDEPENDENT evaluator (a genuinely separate computation path re-deriving the same figures) is delta's to build and does not exist on this rig -- NOT REACHABLE from lane gamma alone, the same structural gap E1b's consumer half already names.");
});

// ===========================================================================
// E10 -- the honest boundary. verify_snapshot is a REAL, CALLABLE backstop, it
// RECOMPUTES and REPORTS drift as a positive read, and its OWN returned
// payload names the class it cannot catch by trigger.
//
// FIX (finding 3): the PRIMARY assertion is now a POSITIVE drift=true --
// coa_accounts.name rides INSIDE the trial_balance payload
// (_snapshot_dataset's own jsonb_build_object carries 'name' per row), so a
// relabel is a movement the recompute CAN see even though no staleness
// trigger sits on clara.coa_accounts. The counterparty-rename case is kept as
// a recorded null observation only (it carries no counterparty names in the
// payload at all, so it is a weaker, non-asserted boundary).
// ===========================================================================
test("E10: verify_snapshot is a real callable backstop, self-documents its honest boundary, and POSITIVELY catches drift when a covered figure's LABEL moves (coa_accounts.name rides inside trial_balance)", async (t) => {
  if (skip57(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "e10");
  await setupCloseCoa(owner, client);
  const cp = await birthCounterparty(owner, { client, name: `X57 E10CO ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const monthStart = await pastMonthStart(5);
  await openArItem57(owner, { client, cp, cents: 90_000, postingDate: `${monthStart.slice(0, 8)}11` });
  const receipt = await mintMonthSnapshot(owner, { client, monthStart });

  const before = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(before.drift, false, "before the relabel: no drift");

  await rootQuery("update clara.coa_accounts set name = name || ' RELABELLED' where client_id=$1 and account_code=$2", [client, AR1]);

  const stateAfter = await snapshotState(owner, { snapshot: receipt.snapshot_id });
  assert.equal(stateAfter, "current", "GROUNDING: no trigger sits on clara.coa_accounts -- snapshot_state stays 'current' even though the underlying label changed (the honest boundary, confirmed structurally)");

  const after = await verifySnapshot(owner, { snapshot: receipt.snapshot_id });
  assert.equal(after.drift, true, `E10: verify_snapshot POSITIVELY catches the drift a relabel causes (got ${JSON.stringify(after)})`);
  assert.deepEqual(after.drifted_keys, ["trial_balance"], "the drifted key is named exactly");
  assert.equal(after.state, "current", "the STORED state stays 'current' (no trigger fired) even while the RECOMPUTE reports drift -- that gap is exactly what the backstop exists to close");

  assert.ok(Array.isArray(after.cannot_detect_by_trigger) && after.cannot_detect_by_trigger.length > 0,
    `verify_snapshot's own payload names its honest-boundary classes (got ${JSON.stringify(after.cannot_detect_by_trigger)})`);
  assert.deepEqual(
    [...after.covered_tables].sort(),
    ["bank_line_exceptions", "bank_reconciliations", "bank_statements", "fixed_assets", "journal_entries", "open_item_allocations"],
    "verify_snapshot's own payload names exactly the six covered tables the design contract states",
  );

  // The null-observation kept as a recorded note, not an assertion -- a
  // counterparty rename does NOT ride inside the management-accounts payload
  // (it carries no customer/vendor names), so it shows zero drift; a weaker,
  // different boundary than the coa_accounts case above.
  const receipt2 = await mintMonthSnapshot(owner, { client, monthStart: await pastMonthStart(4), opKey: opk("x57-e10-mint2") });
  await renameCounterparty(owner, { client, counterparty: cp, newName: `X57 E10CO RENAMED ${randomUUID().slice(0, 6)}` });
  const afterRename = await verifySnapshot(owner, { snapshot: receipt2.snapshot_id });
  noteLane(`E10 counterparty-rename null observation: drift=${afterRename.drift} -- the management-accounts payload carries no counterparty names, so this boundary case shows no NUMERIC drift (a weaker, non-asserted observation, kept for the record only).`);
});
