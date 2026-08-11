// 0057 (Wave E lane gamma, the period registry + month snapshots) rig -- fixture
// helpers (NOT a test file: the name does not end in `.test.mjs`, so `node --test`
// ignores it). CONTRACT-BLIND: every claim in the test files this powers is proved
// against the LIVE CATALOG -- `docs/plan/wave-e-acceptance-matrix.md` Section E +
// `docs/plan/wave-e-design-skeleton-part3.md` SS2.11-2.12 state what must be true;
// this file discovers HOW to call it by reading pg_proc / pg_get_function_arguments
// / pg_get_functiondef against a live rig, never by reading
// `0057_wave_e_registry_snapshots.sql`, which this file (and every test file that
// imports it) never opens.
//
// Reuses ALREADY-SHIPPED fixtures for everything 0057 does not itself define:
// wave-a-fixtures' chain (via a21-helpers.mjs, the widest leaf) for
// draft_entry/approve_entry/reverse_entry/counterparties/documents/corrections,
// x56-fixtures.mjs (0056, close model) for a close-capable COA + a fresh client +
// a plain balanced entry, x38-match-fixtures.mjs (0038) for the bank account/
// statement/void verbs, x42-af2-helpers.mjs (0040/0042) for the exception doors.

import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, withActor, ROLES, opk, namedCall, idOf, firmOf,
  draftEntryV3, approveEntry, reverseEntry, freshResolution, counterpartyRows,
  buildWorld, printLaneNotes, noteLane, printSkipCount, markSkip, endPool,
  seedCitedDocument, proposeCorrection, approveCorrection, renameCounterparty,
  FIELD, ev,
} from "./a21-helpers.mjs";
import {
  has0056, freshActiveClient, setupCloseCoa, plainEntry, birthCounterparty,
  bookToday, AR1, REVN, EXPN, BANK1,
} from "./x56-fixtures.mjs";
import { addBankAccount, enterStatement, voidBankStatement } from "./x38-match-fixtures.mjs";
import { exceptLine, resolveException } from "./x42-af2-helpers.mjs";

export {
  rootQuery, humanQuery, withActor, ROLES, opk, namedCall, idOf, firmOf,
  draftEntryV3, approveEntry, reverseEntry, freshResolution, counterpartyRows,
  buildWorld, printLaneNotes, noteLane, printSkipCount, markSkip, endPool,
  seedCitedDocument, proposeCorrection, approveCorrection, renameCounterparty,
  FIELD, ev,
  has0056, freshActiveClient, setupCloseCoa, plainEntry, birthCounterparty,
  bookToday, AR1, REVN, EXPN, BANK1,
  addBankAccount, enterStatement, voidBankStatement,
  exceptLine, resolveException,
};

/** Run fn and return the raised error (or null) -- the x37/x38/x56 idiom. */
export async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

// ---------------------------------------------------------------------------
// Readiness -- LIVE CATALOG only, never the migration file (the has0056 idiom,
// x56-fixtures.mjs:18-27, applied to 0057's own surface).
// ---------------------------------------------------------------------------

export async function has0057() {
  const t = await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname='period_snapshots'",
  );
  if (t.rows.length === 0) return false;
  const g = await rootQuery(
    "select 1 from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='mint_month_snapshot'",
  );
  return g.rows.length > 0;
}

/** Every lane-delta (E-R12/metric-evaluator) function this battery's E1b consumer
 *  half would need to call. NONE exist yet on this rig (checked once, at readiness
 *  time, by name against pg_proc) -- delta has not built. E1b's "$P-1 resolves"
 *  half is therefore NOT REACHABLE from lane gamma alone; see that cell's own note. */
export async function hasDeltaEvaluator() {
  const r = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname in ('evaluate_metric', 'metric_cell', 'prior_period')`,
  );
  return r.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Verb wrappers -- NAMED args, pinned off the LIVE pg_get_function_arguments
// read taken against this rig (never the migration file):
//   mint_month_snapshot(p_client uuid, p_month_start date, p_op_key text)
//   snapshot_state(p_snapshot uuid) / verify_snapshot(p_snapshot uuid)
//   days_in_period(p_period uuid)
//   unallocate_group(p_client uuid, p_group uuid, p_reason text, p_op_key text)
//   apply_open_items(p_client uuid, p_applications jsonb, p_reason text, p_op_key text)
// A 42883 / param-name divergence at a future re-run is a FINDING, never a
// silent test edit.
// ---------------------------------------------------------------------------

export async function mintMonthSnapshot(sub, { client, monthStart, opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.mint_month_snapshot(p_client => $1, p_month_start => $2::date, p_op_key => $3) as r",
    [client, monthStart, opKey ?? opk("x57-mint")],
  );
  return r.rows[0].r;
}

export async function snapshotState(sub, { snapshot }) {
  const r = await humanQuery(sub, "select clara.snapshot_state(p_snapshot => $1) as r", [snapshot]);
  return r.rows[0].r;
}

export async function verifySnapshot(sub, { snapshot }) {
  const r = await humanQuery(sub, "select clara.verify_snapshot(p_snapshot => $1) as r", [snapshot]);
  return r.rows[0].r;
}

export async function daysInPeriod(sub, { period }) {
  const r = await humanQuery(sub, "select clara.days_in_period(p_period => $1) as r", [period]);
  return r.rows[0].r;
}

export async function unallocateGroup(sub, { client, group, reason = "x57 unallocate", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.unallocate_group(p_client => $1, p_group => $2, p_reason => $3, p_op_key => $4) as r",
    [client, group, reason, opKey ?? opk("x57-unalloc")],
  );
  return r.rows[0].r;
}

export async function applyOpenItems57(sub, { client, applications, reason = "x57 apply", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.apply_open_items(p_client => $1, p_applications => $2::jsonb, p_reason => $3, p_op_key => $4) as r",
    [client, JSON.stringify(applications), reason, opKey ?? opk("x57-apply")],
  );
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Readers -- root readbacks (RLS bypass), for asserting stored state directly.
// ---------------------------------------------------------------------------

export async function reportingPeriodRows(client, grain = "month") {
  const r = await rootQuery(
    "select to_jsonb(p) as row from clara.reporting_periods p where p.client_id=$1 and p.grain=$2 order by p.period_start",
    [client, grain],
  );
  return r.rows.map((x) => x.row);
}

export async function periodSnapshotRow(snapshot) {
  const r = await rootQuery("select to_jsonb(s) as row from clara.period_snapshots s where s.id=$1", [snapshot]);
  return r.rows[0]?.row ?? null;
}

export async function assessmentRows(snapshot) {
  const r = await rootQuery(
    "select to_jsonb(a) as row from clara.snapshot_assessments a where a.snapshot_id=$1 order by a.seq",
    [snapshot],
  );
  return r.rows.map((x) => x.row);
}

export async function openItemsOf(entry) {
  const r = await rootQuery(
    "select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1 order by i.id",
    [entry],
  );
  return r.rows.map((x) => x.row);
}

// ---------------------------------------------------------------------------
// The transactional-identity proof (E2's load-bearing instrument, reused by
// E2b/E7/E8/E9/E11): run the mutating call(s) AND the snapshot_state read
// inside ONE open transaction, never committing until the caller has captured
// the in-flight read. If staleness were marked asynchronously (a queued job,
// a NOTIFY listener), the read taken here -- still inside the same uncommitted
// transaction as the write -- would see the PRE-mutation state, because the
// async path cannot have run yet. Built on withActor's transaction:true lane
// (rig-helpers.mjs), not the per-call-autocommit humanQuery/namedCall wrappers.
// ---------------------------------------------------------------------------

export async function inHumanTxn(sub, fn) {
  return withActor({ role: ROLES.authenticated, jwtSub: sub, transaction: true }, fn);
}

/** Read snapshot_state for `snapshot` on the SAME pooled client mid-transaction
 *  (bypasses the wrapper's own connect/release so the read shares the caller's
 *  open txn). */
export async function txnSnapshotState(client, snapshot) {
  const r = await client.query("select clara.snapshot_state(p_snapshot => $1) as r", [snapshot]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Open-item recipe (E7/E8) -- re-derived from the x37 openArItem/approvedGeneric
// idiom (x37-wave-c-a-subledger.test.mjs:443-476), NOT imported from that 2900-
// line suite (its module state -- COA codes, `world`, local skip gates -- is
// scoped to its own file). apply_open_items/unallocate_group are 0037 writers,
// already shipped; this rig calls them through their pinned live signature.
// ---------------------------------------------------------------------------

const manualRes57 = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** An approved control-account entry binding `cp`: Dr `debit` / Cr `credit`,
 *  both = cents. Returns the entry id. */
export async function approvedControlEntry(sub, {
  client, cp, cpKind = "customer", debit, credit, cents, memo = "x57 control entry", postingDate,
}) {
  const proposal = { existing_id: cp };
  if (cpKind !== "vendor") proposal.kind = cpKind;
  const d = await draftEntryV3(sub, {
    client, resolution: manualRes57(sub, client), memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: proposal, opKey: opk("x57-ctl"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x57-ctla") });
  return d.entry_id;
}

/** An open AR item for `cp` (Dr AR1 / Cr REVN) -- an "invoice". Returns
 *  { entry, item }. */
export async function openArItem57(sub, { client, cp, cents, memo = "x57 invoice", postingDate }) {
  const entry = await approvedControlEntry(sub, { client, cp, cpKind: "customer", debit: AR1, credit: REVN, cents, memo, postingDate });
  const items = await openItemsOf(entry);
  assert.equal(items.length, 1, `an AR control entry mints exactly ONE item (got ${items.length})`);
  return { entry, item: items[0].id };
}

/** A negative AR item for `cp` (Dr REVN / Cr AR1) -- a "credit note". Returns
 *  { entry, item }. */
export async function creditNote57(sub, { client, cp, cents, memo = "x57 credit note", postingDate }) {
  const entry = await approvedControlEntry(sub, { client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents, memo, postingDate });
  const items = await openItemsOf(entry);
  assert.equal(items.length, 1, `a credit-note entry mints exactly ONE item (got ${items.length})`);
  return { entry, item: items[0].id };
}
