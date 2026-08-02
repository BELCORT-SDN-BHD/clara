// Wave D-a (0041) rig — root readbacks + the fixture world (NOT a test file: the
// name does not end in `.test.mjs`, so `node --test` ignores it). Re-exports
// x41-fa-fixtures so a test file imports ONE module.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header). Every object is built THROUGH the
// audited verbs — the x37 dog-fooding law. A raw INSERT appears ONLY where no audited
// verb can reach the shape under test, and each such site carries a comment saying why.

import assert from "node:assert/strict";
import {
  rootQuery, opk, idOf,
  createClient, upsertAccountClassed, grantConsent, freshResolution,
  draftEntryV3, approveEntry, reverseEntry,
  COST, ACCUM, EXPENSE, COST2, ACCUM2, EXPENSE2, LAND, BANK, GAIN, LOSS, OTHER, AR1, AP1, SHARE,
  upsertFaProfile, completeParticulars, proposeAuthority, signAuthority, runPeriod, runDue,
  disposeAsset,
  mon, uniqTag,
} from "./x41-fa-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

export * from "./x41-fa-fixtures.mjs";
export { wb };

// ---------------------------------------------------------------------------
// Root readbacks (superuser bypasses RLS — fixtures and assertions only, never
// the lane under test).
// ---------------------------------------------------------------------------

const rowsOf = async (sql, params) => (await rootQuery(sql, params)).rows.map((x) => x.row);

export const faRows = (client) =>
  rowsOf("select to_jsonb(f) as row from clara.fixed_assets f where f.client_id=$1 order by f.created_at, f.id", [client]);
export const faRow = async (id) =>
  (await rootQuery("select to_jsonb(f) as row from clara.fixed_assets f where f.id=$1", [id])).rows[0]?.row ?? null;
export const chargeRows = (asset) =>
  rowsOf("select to_jsonb(d) as row from clara.fa_depreciation d where d.asset_id=$1 order by d.period_start, d.created_at, d.id", [asset]);
export const clientCharges = (client) =>
  rowsOf("select to_jsonb(d) as row from clara.fa_depreciation d where d.client_id=$1 order by d.period_start, d.created_at, d.id", [client]);
export const runRowsCount = async (client) =>
  Number((await rootQuery("select count(*)::int as n from clara.fa_depreciation_runs where client_id=$1", [client])).rows[0].n);
export const runRows = (client) =>
  rowsOf("select to_jsonb(r) as row from clara.fa_depreciation_runs r where r.client_id=$1 order by r.created_at, r.id", [client]);
export const profileRows = (client) =>
  rowsOf("select to_jsonb(p) as row from clara.fa_account_profiles p where p.client_id=$1 order by p.created_at, p.id", [client]);
export const authorityRows = (client) =>
  rowsOf("select to_jsonb(a) as row from clara.fa_depreciation_authorities a where a.client_id=$1 order by a.created_at, a.id", [client]);
export const entryRowOf = async (entry) =>
  (await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry])).rows[0]?.row ?? null;
export const entryLinesOf = (entry) =>
  rowsOf("select to_jsonb(l) as row from clara.journal_lines l where l.entry_id=$1 order by l.line_no", [entry]);
export const openingItemRowsOf = (seed) =>
  rowsOf("select to_jsonb(i) as row from clara.opening_items i where i.seed_id=$1 order by i.created_at, i.id", [seed]);

export const eventCount = async (client, type) =>
  Number((await rootQuery("select count(*)::int as n from clara.domain_events where client_id=$1 and event_type=$2", [client, type])).rows[0].n);

export const tableExists = async (name) =>
  (await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'",
    [name])).rowCount > 0;
export const fnExists = async (name) =>
  (await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1",
    [name])).rowCount > 0;
export const columnExists = async (table, column) =>
  (await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
    [table, column])).rowCount > 0;

/** The SIGNED accumulated-depreciation read of design §1.3, rebuilt INDEPENDENTLY
 *  here: baseline + SUM over ALL rows effective <= as_of of (+amount when unwind_of
 *  is null, −amount otherwise). `is_live` NEVER appears — it exists solely for the
 *  uniqueness index (round-2 fold 2). */
export async function accumulatedAt(asset, asOf) {
  const r = await rootQuery(
    `select coalesce((select coalesce(f.accumulated_depreciation_cents,0) from clara.fixed_assets f where f.id=$1),0)
       + coalesce((select sum(case when d.unwind_of is null then d.amount_cents else -d.amount_cents end)
            from clara.fa_depreciation d where d.asset_id=$1 and d.effective_date <= $2::date),0) as n`,
    [asset, asOf],
  );
  return Number(r.rows[0].n);
}

/** The REGISTER'S OWN accumulated read at an as-of — the lineage read of fix-ledger F1.
 *  `accumulatedAt` above stays an INDEPENDENT rig-side recomputation and is correct for a
 *  ROOT row (a root's bake carries no ledger content and it has no ancestor to inherit
 *  from); this one is what a row born of a split or a revision must be asked, because F1
 *  moved the pro-rated ledger share OUT of the baked column and INTO the read. */
export async function registerAccumulatedAt(asset, asOf) {
  const r = await rootQuery("select clara._fa_accumulated($1::uuid, $2::date) as n", [asset, asOf]);
  return Number(r.rows[0].n);
}

/** The net-debit GL balance of one account over APPROVED entries only. */
export async function glNet(client, code, asOf = null) {
  const r = await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n
       from clara.journal_lines l join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'
        and ($3::date is null or e.posting_date <= $3::date)`,
    [client, code, asOf],
  );
  return Number(r.rows[0].n);
}

/** Every LIVE charge range for an asset, as sorted [start,end] pairs — the overlap
 *  and no-double-charge assertions read this, never `is_live`. */
export async function liveRanges(asset) {
  const rows = await chargeRows(asset);
  const unwound = new Set(rows.filter((r) => r.unwind_of).map((r) => r.unwind_of));
  return rows
    .filter((r) => !r.unwind_of && !unwound.has(r.id))
    .map((r) => ({ start: r.period_start, end: r.period_end, amount: Number(r.amount_cents), entry: r.entry_id }));
}

export function assertNoOverlaps(ranges, label) {
  const sorted = [...ranges].sort((a, b) => (a.start < b.start ? -1 : 1));
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].end < sorted[i].start,
      `${label}: live charge ranges must never overlap (${sorted[i - 1].start}..${sorted[i - 1].end} vs ${sorted[i].start}..${sorted[i].end})`);
  }
}

// ---------------------------------------------------------------------------
// The fixture world.
// ---------------------------------------------------------------------------

let _w = null;
/** The Wave-B multi-user world: firm A carries alice (owner), bob + grace
 *  (bookkeepers), hana (admin) — so eligible_checker_count(firm A) >= 2 and the
 *  high-stakes DISTINCT-CHECKER arm can actually bind. Cached per process. */
export async function faWorld() {
  if (!_w) _w = await wb.buildWaveBWorld();
  return _w;
}

export const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

export async function buildFaChart(sub, client) {
  for (const [code, name, type, klass] of [
    [COST, "Plant & Machinery (x41)", "asset", null],
    [ACCUM, "Accum Depreciation P&M (x41)", "asset", null],
    [EXPENSE, "Depreciation Expense (x41)", "expense", null],
    [COST2, "Motor Vehicles (x41)", "asset", null],
    [ACCUM2, "Accum Depreciation MV (x41)", "asset", null],
    [EXPENSE2, "Depreciation Expense MV (x41)", "expense", null],
    [LAND, "Freehold Land (x41)", "asset", null],
    [BANK, "Maybank current (x41)", "asset", null],
    [GAIN, "Gain on Disposal (x41)", "income", null],
    [LOSS, "Loss on Disposal (x41)", "expense", null],
    [OTHER, "Sundry Expense (x41)", "expense", null],
    [SHARE, "Share Capital (x41)", "equity", null],
    [AR1, "Trade Debtors (x41)", "asset", "receivable"],
    [AP1, "Trade Creditors (x41)", "liability", "payable"],
  ]) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: klass, opKey: opk("x41coa") });
  }
}

/** A fresh firm-A client with the x41 chart and (by default) the COST profile
 *  enrolled. `enrol:false` leaves the account un-enrolled (the watermark cells). */
export async function freshFaClient(label, { enrol = true } = {}) {
  const w = await faWorld();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `x41_${label}_${uniqTag()}`, opKey: opk("x41cli") });
  await buildFaChart(sub, client);
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  if (enrol) await upsertFaProfile(sub, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  return client;
}

/** Draft+approve a plain entry as `maker`, checked by `checker`.
 *
 *  [ASSEMBLY] The default checker is a DISTINCT firm-A human, not the maker. A fixture
 *  acquisition above the firm's RM10,000 high-stakes threshold (the RB/annual/high-stakes
 *  cells all buy above it) hits the pre-existing CLR05 distinct-checker floor, which has
 *  nothing to do with D-a — the world's own docstring says firm A carries two eligible
 *  checkers precisely so this arm can bind. Cells that want the SAME-actor arm call
 *  approveEntry directly (x41.d7). */
export async function approvedEntry(maker, {
  client, lines, memo = "x41 entry", postingDate, checker = null, attestation = null, flags = null,
}) {
  const w = await faWorld();
  const d = await draftEntryV3(maker, {
    client, resolution: await manualRes(maker, client), lines, memo, postingDate, flags,
    opKey: opk("x41draft"),
  });
  const args = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x41approve") };
  if (attestation) args.attestation = attestation;
  await approveEntry(checker ?? (maker === w.users.alice ? w.users.bob : w.users.alice), args);
  return d.entry_id;
}

/** Draft an entry, stamp `counterparty` on its CONTROL-class lines (root; no audited verb
 *  reaches this shape — `draft_entry` attaches a counterparty only through the vendor-binding
 *  document lane, and CLR23 refuses an un-attributed control line at approve), then approve
 *  it with a distinct checker. The x37 precedent for a root line write. */
export async function approvedControlEntry(maker, { client, lines, memo, postingDate, counterparty }) {
  const w = await faWorld();
  const d = await draftEntryV3(maker, {
    client, resolution: await manualRes(maker, client), lines, memo, postingDate,
    opKey: opk("x41cdraft"),
  });
  await rootQuery(
    `update clara.journal_lines l set counterparty_id = $2
       where l.entry_id = $1
         and exists (select 1 from clara.coa_accounts a
                     where a.client_id = l.client_id and a.account_code = l.account_code
                       and a.account_class is not null)`,
    [d.entry_id, counterparty],
  );
  const fresh = await entryRowOf(d.entry_id); // a root line write may bump the revision token
  await approveEntry(maker === w.users.alice ? w.users.bob : w.users.alice,
    { entry: d.entry_id, expectedRevision: fresh.revision_token, opKey: opk("x41capr") });
  return d.entry_id;
}

/** Buy an asset: Dr <cost account> / Cr bank, approved → the hook soft-births. */
export async function buyAsset({
  client, cents, postingDate, account = COST, memo = "x41 acquisition", maker = null, checker = null,
}) {
  const w = await faWorld();
  const sub = maker ?? w.users.alice;
  const before = (await faRows(client)).length;
  const entry = await approvedEntry(sub, {
    client, memo, postingDate, checker,
    lines: [
      { account_code: account, debit_cents: cents, credit_cents: 0, description: "asset cost" },
      { account_code: BANK, debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
  });
  const rows = await faRows(client);
  assert.equal(rows.length, before + 1,
    `the acquisition soft-birthed exactly ONE register row (had ${before}, now ${rows.length})`);
  return { entry, asset: rows[rows.length - 1] };
}

export async function completeSL(client, asset, { life, residual = 0, start, description = "x41 sl asset" }) {
  const w = await faWorld();
  return completeParticulars(w.users.alice, {
    client, asset,
    particulars: { method: "straight_line", useful_life_months: life, residual_cents: residual, start_date: start, description },
  });
}

export async function completeRB(client, asset, { life, rateBps, residual = 0, start, description = "x41 rb asset" }) {
  const w = await faWorld();
  return completeParticulars(w.users.alice, {
    client, asset,
    particulars: {
      method: "reducing_balance", useful_life_months: life, rate_bps: rateBps,
      residual_cents: residual, start_date: start, description,
    },
  });
}

/** Propose + sign a live authority (signing is admin+, WD-R9 → hana). */
export async function liveAuthority(client, cadence = "monthly") {
  const w = await faWorld();
  const proposed = await proposeAuthority(w.users.bob, { client, cadence });
  const id = idOf(proposed, "authority_id", "id");
  assert.ok(id, `propose_depreciation_authority names the authority (got ${JSON.stringify(proposed)})`);
  await signAuthority(w.users.hana, { client, authority: id });
  const liveRows = (await authorityRows(client)).filter((a) => a.status === "live");
  assert.equal(liveRows.length, 1, "exactly ONE live authority per client (the partial unique)");
  return { id, signedBy: w.users.hana, cadence };
}

/** Run a period; when it DRAFTED, approve the draft with `approveAs` so the ramp
 *  advances. Returns {receipt, entryId, mode}. */
export async function runAndSettle(client, period, { approveAs = null } = {}) {
  const w = await faWorld();
  const receipt = await runPeriod({ client, periodStart: period.start, periodEnd: period.end });
  if (receipt?.status === "noop") return { receipt, entryId: null, mode: "noop" };
  const entryId = receipt.entry_id;
  assert.ok(entryId, `a non-noop run names its entry (got ${JSON.stringify(receipt)})`);
  if (receipt.status === "drafted") {
    const e = await entryRowOf(entryId);
    await approveEntry(approveAs ?? w.users.alice, {
      entry: entryId, expectedRevision: e.revision_token, opKey: opk("x41runapr"),
    });
  }
  return { receipt, entryId, mode: receipt.status };
}

/** Reverse, and — when the MIRROR drafted because it is high-stakes — approve the mirror
 *  with a distinct checker so the register act (unwind / restore) actually runs: every FA
 *  reversal consequence lives in the approve hook, never in reverse_entry itself. Cells whose
 *  subject IS the maker-checker gap (x41.i1's approve-time twin) drive the draft by hand. */
export async function reverseAndSettle(sub, { entry, reason, opKey }) {
  const w = await faWorld();
  const receipt = await reverseEntry(sub, { entry, reason, opKey });
  const mirrorId = idOf(receipt, "reversal_id", "reversal_entry_id", "entry_id", "id")
    ?? (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [entry])).rows[0]?.id;
  assert.ok(mirrorId, `reverse_entry minted a mirror (got ${JSON.stringify(receipt)})`);
  const m = await entryRowOf(mirrorId);
  if (m.status === "draft") {
    await approveEntry(sub === w.users.alice ? w.users.hana : w.users.alice,
      { entry: mirrorId, expectedRevision: m.revision_token, opKey: opk("x41revapr") });
  }
  return { receipt, mirrorId, mode: m.status };
}

/** Dispose, and — when the proposal DRAFTED because the entry is high-stakes — approve it
 *  with a DISTINCT checker so the register act actually materialises. The dispose verb stamps
 *  `last_human_editor` = the MAKER, so the maker can never be that checker. Cells whose
 *  subject is the maker-checker window itself (x41.g5/g6) drive the draft by hand. */
export async function disposeAndSettle(sub, opts) {
  const w = await faWorld();
  const receipt = await disposeAsset(sub, opts);
  const entryId = idOf(receipt, "entry_id", "id");
  assert.ok(entryId, `dispose_fixed_asset names its entry (got ${JSON.stringify(receipt)})`);
  const e = await entryRowOf(entryId);
  if (e.status === "draft") {
    await approveEntry(sub === w.users.alice ? w.users.hana : w.users.alice,
      { entry: entryId, expectedRevision: e.revision_token, opKey: opk("x41dispapr") });
  }
  return { receipt, entryId, mode: e.status };
}

/** Run the OLDEST unmet period repeatedly until nothing is due — the sweep's own ladder
 *  (design §3.4). A late completion re-opens an EARLIER period, and the §3.2 sequencing law
 *  refuses a later call while it is unmet, so "catch up" is reached by draining the ladder,
 *  never by one forward call. Returns the receipts in the order they ran. */
export async function drainDue(client, opts = {}) {
  const out = [];
  for (let i = 0; i < 24; i++) {
    const due = await runDue(client);
    if (!due?.due) return out;
    out.push(await runAndSettle(client, { start: due.period_start, end: due.period_end }, opts));
  }
  assert.fail("drainDue exceeded 24 periods — the due ladder is not converging");
  return out;
}

/** Drive the one-time ramp (WD-R5): the FIRST run under a fresh authority DRAFTS. */
export async function earnRamp(client, period, opts = {}) {
  const out = await runAndSettle(client, period, opts);
  assert.equal(out.mode, "drafted", "WD-R5: the FIRST run under a fresh authority DRAFTS (the one-time ramp)");
  return out;
}

// ---------------------------------------------------------------------------
// A K-seeded (carry-down) FA client — the ONLY pre-D-a writer of the register.
// Built entirely through the audited K-family verbs, with the FA account ENROLLED
// FIRST so the belt's door (e) is genuinely exercised at K5 approve.
// ---------------------------------------------------------------------------

export async function kSeededFaClient(label, {
  cost = 500_000, accum = 100_000, method = "straight_line", rateBps = null, life = 60,
  // [ROUND-3] `approveSeed:false` stops BEFORE approve_opening_seed (K5), leaving the
  // carry-down register row in status 'pending' behind a still-DRAFT opening entry —
  // the shape fa_register_tie must report as a pending ADVISORY rather than as a
  // register-vs-GL difference (fix ledger F9). The default is unchanged, so every
  // pre-existing caller keeps the approved-seed behaviour byte for byte.
  approveSeed = true,
} = {}) {
  const w = await faWorld();
  const o = await wb.onboardingClient(w.users.hana, `x41k_${label}_${uniqTag()}`);
  await wb.seedOpeningCoa(w.users.alice, o.client);
  await buildFaChart(w.users.alice, o.client);
  await upsertFaProfile(w.users.alice, { client: o.client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });

  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const asOf = mon(-6).end; // the carry-down baseline — DB-clock derived, never a literal
  const sr = await wb.createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, asOf, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  const seed = sr.seed_id ?? sr.id;

  const payload = {
    description: "Delivery van (x41 carry-down)", acquired_date: mon(-24).start, cost_cents: cost,
    useful_life_months: life, depreciation_method: method,
    asset_account_code: COST, accum_depr_account_code: ACCUM, depr_expense_account_code: EXPENSE,
    accumulated_depreciation_cents: accum, depreciation_start_date: mon(-24).start,
    residual_cents: 0, item_key: "fa:x41van",
  };
  // [ASSEMBLY · adjudication A5] The carry-down's RB rate key is the SHIPPED spelling
  // `depreciation_rate_bps` — the same envelope key the seed payload already uses for
  // method/life. The lane's original dual-try collapses to this single positive pin.
  // (The dual-try also swallowed the receipt: `caught()` returns null on SUCCESS, so the
  // green path read `.fixed_asset_id` off null. The call is made directly now.)
  if (rateBps != null) payload.depreciation_rate_bps = rateBps;
  const receipt = await wb.seedFixedAsset(w.users.bob, { client: o.client, seed, asset: payload });
  const assetId = receipt.fixed_asset_id ?? receipt.asset_id ?? receipt.id;
  assert.ok(assetId, `seed_fixed_asset names the register row (got ${JSON.stringify(receipt)})`);

  const nbv = cost - accum;
  await wb.recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "fa", account_code: COST, source_label: "fa cost", debit_cents: cost, credit_cents: 0 },
    ...(accum > 0 ? [{ line_key: "faacc", account_code: ACCUM, source_label: "fa accum", debit_cents: 0, credit_cents: accum }] : []),
    { line_key: "cap", account_code: SHARE, source_label: "share capital", debit_cents: 0, credit_cents: nbv },
  ] });
  const cap = await wb.draftOpeningItem(w.users.bob, {
    client: o.client, seed,
    resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cap" },
    lines: [{ account_code: SHARE, debit_cents: 0, credit_cents: nbv }],
  });
  const faEntry = await entryRowOf((await faRow(assetId)).acquisition_entry_id);
  if (approveSeed) {
    await wb.approveOpeningSeed(w.users.hana, {
      seed, planRevision: await wb.planRevision(o.plan), tieSha256: doc.sha256,
      entryRevisions: wb.revMapOf([cap, { entry_id: faEntry.id, revision_token: faEntry.revision_token }]),
      opKey: opk("x41kapr"),
    });
  }
  return {
    client: o.client, plan: o.plan, seed, doc, assetId, baselineAsOf: asOf, cost, accum,
    faEntryId: faEntry.id, capItem: cap, approved: approveSeed,
  };
}
