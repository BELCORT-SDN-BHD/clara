// #651's own mock lane — the DEPRECIATION journey (C7/C8: the signed authority and its window, the
// preview the run is confirmed from, the locked period that is refused before anything is drafted,
// and the asset detail's revision timeline and charge ledger). A file-disjoint sibling of
// `fixed-asset-mock.mjs` and consulted by `serve-built.mjs` through the one PostgREST hook that
// module's header describes.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real same-origin runtime
// proxy and every line of client code under test are REAL — the preview-first dialog's state
// machine, the `?tab=` URL contract, the revision timeline, the charge ledger, the skip vocabulary
// in words, the decision key held across a retry, and the re-read that follows a governed write.
// What is faked is what sits behind them: PostgREST's reads and the three depreciation doors. So
// this walk proves the JOURNEY and the client's own wire shapes; it proves NOTHING about whether
// Postgres really refuses a run into a closed fiscal year, whether the oracle really skips it, or
// whether the authority window really floors the belt.
// `packages/db/tests/depreciation-history.test.mjs` owns those against a real Postgres.
//
// EVERY REFUSAL BODY BELOW IS THE REAL ONE, transcribed from migration 0227: PostgREST's error
// envelope with the CLR code in `code`, the database's message verbatim, and the typed reason AND
// AXIS inside `details`. A mock that invented a shape would let a broken refusal renderer pass a
// browser walk.
//
// EVERY HANDLER IS SCOPED TO THIS LANE'S OWN CLIENT and falls through otherwise. This lane claims
// no unfiltered `/clients` register, no shared session list and no firm-wide read. THREE of its
// verbs (`get_fixed_asset`, `get_depreciation_authority`, `list_depreciation_runs`) are also
// answered by `fixed-asset-mock.mjs` for ITS own ids — both are declared in `SHARED_RPC_VERBS`,
// and each falls through for the other's client, which is what makes the share a declared one
// rather than a collision.

import { readCachedJson } from "./mock-dispatch.mjs";

export const DEP = {
  clientId: "65165165-6516-4651-8651-651651651651",
  clientName: "TANJUNG MANUFACTURING",
  /** A SECOND client whose next period sits inside a CLOSED financial year. It is a separate
   *  client rather than a control-endpoint toggle on the first for the reason every cell in this
   *  suite shares one server: a toggle makes two cells order-dependent, and the thing this walk
   *  must prove is an ABSENCE (no run row was created), which a cell cannot assert if a sibling
   *  may have flipped the world underneath it. */
  lockedClientId: "65165166-6516-4651-8651-651651651652",
  lockedClientName: "TANJUNG MANUFACTURING (locked year)",
  /** #979 (0251) — A THIRD client whose ONLY depreciation authority has been WITHDRAWN. Before
   *  0251 `get_depreciation_authority` selected `where status in ('live','proposed')`, so this
   *  client read back `authority: null` and the surface rendered "none proposed" — the same
   *  state a client that never had one shows. 0251 falls back to the most recent RETIRED
   *  authority, and this fixture is what lets a browser walk see that. A separate client, for
   *  the reason the locked one is separate: the thing under test is what ONE authority state
   *  renders, and a toggle would make two cells order-dependent. */
  retiredClientId: "65165167-6516-4651-8651-651651651653",
  retiredClientName: "TANJUNG MANUFACTURING (authority withdrawn)",
  /** The asset the walk charges: in service, particulars complete, and REVISED once — so the
   *  revision timeline has two real generations and the charge ledger has real rows. */
  assetId: "65101001-6510-4651-8651-651065101001",
  assetName: "Injection moulder",
  /** Its predecessor generation — the estimate this asset's revision superseded. */
  predecessorId: "65101000-6510-4651-8651-651065101000",
  /** The asset whose particulars are still outstanding: the `incomplete` skip the preview names. */
  incompleteAssetId: "65101002-6510-4651-8651-651065101002",
  incompleteAssetName: "Pallet racking (particulars pending)",
  /** The asset frozen by an outstanding disposal draft: the FIFTH skip reason, the one the
   *  per-asset arithmetic can never return. */
  frozenAssetId: "65101003-6510-4651-8651-651065101003",
  frozenAssetName: "Forklift (disposal draft outstanding)",
  authorityId: "65106001-6510-4651-8651-651065106001",
  proposedAuthorityId: "65106002-6510-4651-8651-651065106002",
  /** #979 (0251) — the withdrawn authority and the three facts 0251 appends on its arm. */
  retiredAuthorityId: "65106003-6510-4651-8651-651065106003",
  retiredBy: "65100003-6510-4651-8651-651065100003",
  retiredReason: "Annual cadence was proposed by mistake; withdrawn before the first run",
  retiredAt: "2026-06-15T03:20:00.000Z",
  retiredAuthorityFrom: "2026-02-01",
  workId: "65103001-6510-4651-8651-651065103001",
  runEntryId: "65102001-6510-4651-8651-651065102001",
  chargeEntryId: "65102002-6510-4651-8651-651065102002",
  unwindEntryId: "65102003-6510-4651-8651-651065102003",
  costAccount: "1520",
  accumAccount: "1529",
  expenseAccount: "6520",
  /** The period the DATABASE chose. No caller ever names one — that is the whole point of the
   *  preview, and the walk asserts the dialog carries no date input at all. */
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  /** The authority window's floor: the first day of the month it was signed. */
  authorityFrom: "2026-03-01",
  /** A period the oracle SKIPPED because its financial year is closed. */
  closedPeriodStart: "2026-05-01",
  closedPeriodEnd: "2026-05-31",
  fiscalYearId: "65107001-6510-4651-8651-651065107001",
  fyLabel: "FY2026",
  /** The charge that was REVERSED and the append-only row that reversed it. The walk names both
   *  by id rather than by their labels, because the table's own caption says the word "unwinding"
   *  as well and a page-wide text match cannot tell a caption from a row. */
  unwoundChargeId: "65104003-6510-4651-8651-651065104003",
  unwindChargeId: "65104004-6510-4651-8651-651065104004",
};

const RPC_VERBS = new Set([
  "preview_depreciation_run",
  "run_depreciation_manual",
  "record_fa_arrears_resolution",
  "sign_depreciation_authority",
  "get_fixed_asset",
  "get_depreciation_authority",
  "list_depreciation_runs",
  "fa_register_tie",
  "list_fixed_assets",
]);

/** The walk's own mutable state. Per-SERVER, not per-test — one server serves every walk — so the
 *  cell that runs a period asserts its precondition rather than assuming it. The LOCKED client has
 *  no state at all: its door always refuses, so no ordering can make its "nothing was written"
 *  assertion pass for the wrong reason. */
const state = { runsPosted: 0, lastOpKeys: [], /** #975 — the closed year's arrears judgement, once a person has made it. */ arrearsChoice: null };

const CLIENTS = {
  [DEP.clientId]: { id: DEP.clientId, name: DEP.clientName, status: "active", created_at: "2026-01-01T00:00:00.000Z" },
  [DEP.lockedClientId]: { id: DEP.lockedClientId, name: DEP.lockedClientName, status: "active", created_at: "2026-01-01T00:00:00.000Z" },
  [DEP.retiredClientId]: { id: DEP.retiredClientId, name: DEP.retiredClientName, status: "active", created_at: "2026-01-01T00:00:00.000Z" },
};
const OURS = (id) => id === DEP.clientId || id === DEP.lockedClientId || id === DEP.retiredClientId;

const ACCOUNTS = (clientId) => [
  { client_id: clientId, account_code: DEP.costAccount, name: "Plant & machinery", account_type: "asset", is_active: true },
  { client_id: clientId, account_code: DEP.accumAccount, name: "Accumulated depreciation", account_type: "asset", is_active: true },
  { client_id: clientId, account_code: DEP.expenseAccount, name: "Depreciation expense", account_type: "expense", is_active: true },
];

const BASE_ROW = {
  status: "active",
  superseded_at: null,
  residual_cents: 0,
  rate_bps: null,
  asset_account: DEP.costAccount,
  accum_account: DEP.accumAccount,
  expense_account: DEP.expenseAccount,
  ca_class: null,
  is_commercial_vehicle: null,
  is_new: null,
  superseded_by_asset_id: null,
  disposed_at: null,
  disposal_entry_id: null,
  uncharged_due_count: 0,
  split_month_advisory_count: 0,
  disposal_draft_outstanding: false,
  disposal_draft_entry_id: null,
  acquisition_document_id: null,
  acquisition_line_id: null,
  change_class: null,
  change_reason: null,
};

/** The CURRENT generation: the successor an `estimate` revision minted. */
const currentRow = () => ({
  ...BASE_ROW,
  id: DEP.assetId,
  description: DEP.assetName,
  particulars_complete: true,
  acquired_date: "2026-03-01",
  effective_from: "2026-06-01",
  cost_cents: 3600000,
  accumulated_cents: 300000,
  nbv_cents: 3300000,
  method: "straight_line",
  useful_life_months: 48,
  start_date: "2026-03-01",
  acquisition_entry_id: DEP.chargeEntryId,
  change_class: "estimate",
  change_reason: "the plant survey revised the remaining life to 48 months",
});

/** The generation it superseded — a ROOT row, so it carries NO class. The timeline must read that
 *  as "not recorded" rather than inventing one. */
const predecessorRow = () => ({
  ...BASE_ROW,
  id: DEP.predecessorId,
  description: DEP.assetName,
  particulars_complete: true,
  status: "superseded",
  acquired_date: "2026-03-01",
  effective_from: null,
  cost_cents: 3600000,
  accumulated_cents: 300000,
  nbv_cents: 3300000,
  method: "straight_line",
  useful_life_months: 36,
  start_date: "2026-03-01",
  acquisition_entry_id: DEP.chargeEntryId,
  superseded_by_asset_id: DEP.assetId,
});

const incompleteRow = () => ({
  ...BASE_ROW,
  id: DEP.incompleteAssetId,
  description: DEP.incompleteAssetName,
  particulars_complete: false,
  acquired_date: "2026-04-01",
  effective_from: null,
  cost_cents: 480000,
  accumulated_cents: 0,
  nbv_cents: 480000,
  method: null,
  useful_life_months: null,
  start_date: null,
  acquisition_entry_id: null,
});

const frozenRow = () => ({
  ...BASE_ROW,
  id: DEP.frozenAssetId,
  description: DEP.frozenAssetName,
  particulars_complete: true,
  acquired_date: "2026-04-01",
  effective_from: null,
  cost_cents: 2400000,
  accumulated_cents: 100000,
  nbv_cents: 2300000,
  method: "straight_line",
  useful_life_months: 60,
  start_date: "2026-04-01",
  acquisition_entry_id: null,
  disposal_draft_outstanding: true,
  disposal_draft_entry_id: DEP.unwindEntryId,
});

/** The immutable charge ledger: three live rows, plus an unwinding pair — so the walk can see that
 *  a correction is a ROW beside the charge it reversed, never an erasure. */
const CHARGES = [
  { id: "65104001-6510-4651-8651-651065104001", period_start: "2026-03-01", period_end: "2026-03-31", amount_cents: 100000, effective_date: "2026-03-31", entry_id: DEP.chargeEntryId, run_id: "65105001-6510-4651-8651-651065105001", unwind_of: null },
  { id: "65104002-6510-4651-8651-651065104002", period_start: "2026-04-01", period_end: "2026-04-30", amount_cents: 100000, effective_date: "2026-04-30", entry_id: DEP.chargeEntryId, run_id: "65105002-6510-4651-8651-651065105002", unwind_of: null },
  { id: "65104003-6510-4651-8651-651065104003", period_start: "2026-06-01", period_end: "2026-06-30", amount_cents: 100000, effective_date: "2026-06-30", entry_id: DEP.runEntryId, run_id: "65105003-6510-4651-8651-651065105003", unwind_of: null },
  { id: "65104004-6510-4651-8651-651065104004", period_start: "2026-06-01", period_end: "2026-06-30", amount_cents: 100000, effective_date: "2026-06-30", entry_id: DEP.unwindEntryId, run_id: null, unwind_of: "65104003-6510-4651-8651-651065104003" },
];

/** #979 (0251) — THE WITHDRAWN AUTHORITY, in the shape the real read actually returns.
 *
 *  Transcribed from `clara.get_depreciation_authority`'s own live body: the base object is
 *  exactly {id, status, cadence, proposed_by, signed_by, retired_by, created_at} (0041), and
 *  0251 appends {retired_reason, retired_at, authority_from} — and ONLY those three, and ONLY on
 *  `au.status = 'retired'`. It carries no `authority_kind` and no `authority_ref`, because the
 *  door returns neither. (The LIVE arm below does return both, which the real read never has;
 *  that divergence is #651's, it predates this fixture, and it is filed as a follow-up rather
 *  than widened further here.) */
const RETIRED_AUTHORITY = (clientId) => ({
  client_id: clientId,
  authority: {
    id: DEP.retiredAuthorityId,
    status: "retired",
    cadence: "annual",
    proposed_by: "65100001-6510-4651-8651-651065100001",
    signed_by: "65100002-6510-4651-8651-651065100002",
    retired_by: DEP.retiredBy,
    created_at: "2026-02-10T00:00:00.000Z",
    retired_reason: DEP.retiredReason,
    retired_at: DEP.retiredAt,
    authority_from: DEP.retiredAuthorityFrom,
  },
  ramp_earned: false,
  fy_end: { month: 12, day: 31, fallback: false },
  high_stakes_threshold_cents: 1000000,
});

const AUTHORITY = (clientId) => (clientId === DEP.retiredClientId ? RETIRED_AUTHORITY(clientId) : {
  client_id: clientId,
  authority: {
    id: DEP.authorityId,
    status: "live",
    cadence: "monthly",
    proposed_by: "65100001-6510-4651-8651-651065100001",
    signed_by: "65100002-6510-4651-8651-651065100002",
    retired_by: null,
    created_at: "2026-03-01T00:00:00.000Z",
    authority_kind: "explicit_instruction",
    authority_ref: { kind: "accounting_work", id: DEP.workId },
    authority_from: DEP.authorityFrom,
  },
  ramp_earned: true,
  fy_end: { month: 12, day: 31, fallback: false },
  high_stakes_threshold_cents: 1000000,
});

const RUNS = (clientId) => {
  // The LOCKED client has never had a lawful period, so its runs list is empty — and stays empty,
  // which is exactly what the refusal cell asserts. The WITHDRAWN-authority client has none
  // either: nothing ever ran under the authority that was retired before its first run.
  if (clientId === DEP.lockedClientId || clientId === DEP.retiredClientId) return { client_id: clientId, runs: [] };
  const rows = [
    {
      id: "65105003-6510-4651-8651-651065105003",
      authority_id: DEP.authorityId,
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      mode: "post",
      entries: 1,
      charged_cents: 100000,
      // Two skip reasons, one of which is work somebody still owes — so the disclosure must render
      // OPEN (appendix D row 17).
      skipped: [
        { asset_id: DEP.incompleteAssetId, reason: "incomplete" },
        { asset_id: DEP.frozenAssetId, reason: "disposal_draft_outstanding" },
      ],
      entry_id: DEP.runEntryId,
      created_at: "2026-07-01T01:00:00.000Z",
    },
  ];
  if (state.runsPosted > 0) {
    rows.unshift({
      id: "65105004-6510-4651-8651-651065105004",
      authority_id: DEP.authorityId,
      period_start: DEP.periodStart,
      period_end: DEP.periodEnd,
      mode: "draft",
      entries: 1,
      charged_cents: 75000,
      skipped: [
        { asset_id: DEP.incompleteAssetId, reason: "incomplete" },
        { asset_id: DEP.frozenAssetId, reason: "disposal_draft_outstanding" },
      ],
      entry_id: DEP.runEntryId,
      created_at: "2026-08-01T01:00:00.000Z",
    });
  }
  return { client_id: DEP.clientId, runs: rows };
};

const PREVIEW = (clientId) => ({
  client_id: clientId,
  due: true,
  reason: null,
  period_start: DEP.periodStart,
  period_end: DEP.periodEnd,
  cadence: "monthly",
  authority_from: DEP.authorityFrom,
  authority_ref: { kind: "accounting_work", id: DEP.workId },
  // A period the ORACLE skipped for a closed financial year: reported, never silent.
  skipped_closed: [{
    period_start: DEP.closedPeriodStart,
    period_end: DEP.closedPeriodEnd,
    fiscal_year_id: DEP.fiscalYearId,
    fy_label: DEP.fyLabel,
    fy_status: "closed",
  }],
  // #975 [0279] — and what those skipped months come to, which the next run may not fold forward
  // until a person has judged it material or not (IAS 8). Unanswered here, so the walk sees the
  // question rather than a ruling.
  closed_arrears: {
    arrears_cents: 25000,
    fiscal_years: [{
      fiscal_year_id: DEP.fiscalYearId,
      fy_label: DEP.fyLabel,
      fy_status: "closed",
      fy_starts_on: DEP.closedPeriodStart,
      fy_ends_on: DEP.closedPeriodEnd,
      arrears_cents: 25000,
      resolution: state.arrearsChoice === null ? null : {
        id: "97597597-9759-4975-8975-975097597597",
        choice: state.arrearsChoice,
        arrears_cents: 25000,
        decided_by: "97500000-9750-4975-8975-975097500000",
        decided_at: "2026-08-01T02:00:00.000Z",
        reason: null,
      },
    }],
  },
  charges: [{
    asset_id: DEP.assetId,
    description: DEP.assetName,
    period_start: DEP.periodStart,
    period_end: DEP.periodEnd,
    amount_cents: 75000,
  }],
  skipped: [
    { asset_id: DEP.incompleteAssetId, reason: "incomplete" },
    { asset_id: DEP.frozenAssetId, reason: "disposal_draft_outstanding" },
  ],
  legs: [
    { account_code: DEP.expenseAccount, debit_cents: 75000, credit_cents: 0 },
    { account_code: DEP.accumAccount, debit_cents: 0, credit_cents: 75000 },
  ],
  charged_cents: 75000,
  entries: 1,
  mode_would_be: "draft",
  ramp_earned: true,
});

const detailFor = (assetId) => {
  if (assetId === DEP.assetId) {
    return {
      asset: currentRow(),
      lineage: [predecessorRow()],
      charges: CHARGES,
      schedule: [
        { period_start: "2026-08-01", period_end: "2026-08-31", projected_cents: 75000 },
        { period_start: "2026-09-01", period_end: "2026-09-30", projected_cents: 75000 },
      ],
      uncharged_due: [],
      acquisition: {
        entry_id: DEP.chargeEntryId, line_id: null, document_id: null, document_filename: null,
        document_mime: null, document_sha256: null, document_kind: null,
        posting_date: "2026-03-01", approved_at: "2026-03-01T02:00:00.000Z", entry_status: "approved",
        entry_origin: "human", memo: "Injection moulder purchased", reversal_of: null, reversed_by: null,
        acquired_date: "2026-03-01", cost_cents: 3600000, currency: "MYR", asset_account: DEP.costAccount,
        work_id: null, receipt_id: null, receipt_logical_op_id: null, receipt_created_at: null,
        on_behalf_of: null, work_status: null, work_purpose: null, derived_from: "acquisition_entry",
      },
      particulars: {
        complete: true, method: "straight_line", useful_life_months: 48, rate_bps: null,
        residual_cents: 0, start_date: "2026-03-01", description: DEP.assetName, ca_class: null,
        is_commercial_vehicle: null, is_new: null, non_depreciable: false,
      },
      history: {
        status: "active", acquisition_entry_id: DEP.chargeEntryId, acquisition_reversed_by: null,
        acquisition_reversed_at: null, acquisition_reverses: null,
        supersedes_asset_id: DEP.predecessorId, superseded_by_asset_id: null, superseded_at: null,
        disposed_at: null, disposal_entry_id: null, related: [], chain_open: false,
      },
    };
  }
  return null;
};

/** The C7/C8 depreciation lane's PostgREST half. Returns true when it answered, so the server's
 *  delegate chain falls through to every other lane for anything that is not this fixture's. */
export async function handleDepreciationSupabase(request, response, path, url, sendJson, cors) {
  const eq = (v) => (v && v.startsWith("eq.") ? v.slice(3) : null);
  const idFilter = eq(url.searchParams.get("id"));
  const clientFilter = eq(url.searchParams.get("client_id"));

  // ID-SCOPED ONLY: the UNFILTERED /clients read is the client register every walk shares, and
  // claiming it would replace another walk's fixture. This walk navigates by URL.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter !== null && OURS(idFilter)) {
      sendJson(response, 200, [CLIENTS[idFilter]], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (clientFilter !== null && OURS(clientFilter)) {
      sendJson(response, 200, ACCOUNTS(clientFilter), cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/fa_account_profiles") {
    if (clientFilter !== null && OURS(clientFilter)) {
      sendJson(response, 200, [{
        id: "65108001-6510-4651-8651-651065108001",
        asset_account_code: DEP.costAccount,
        accum_depr_account_code: DEP.accumAccount,
        depr_expense_account_code: DEP.expenseAccount,
        active: true,
        enrolled_at: "2026-01-01T00:00:00.000Z",
        retired_at: null,
      }], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!RPC_VERBS.has(verb)) return false;

  // THE SHARED READER, never a private one. `readCachedJson` parses the body ONCE and hands the
  // identical object to every lane, so declining another lane's client leaves that lane's body
  // fully readable (`mock-dispatch.mjs`).
  const body = (await readCachedJson(request)) ?? {};

  if (verb === "list_fixed_assets") {
    if (!OURS(body.p_client)) return false;
    sendJson(response, 200, {
      client_id: body.p_client,
      as_of: "2026-08-01",
      assets: [currentRow(), incompleteRow(), frozenRow()],
      incomplete_count: 1,
    }, cors);
    return true;
  }

  if (verb === "fa_register_tie") {
    if (!OURS(body.p_client)) return false;
    sendJson(response, 200, { client_id: body.p_client, as_of: "2026-08-01", tie: true, accounts: [] }, cors);
    return true;
  }

  if (verb === "get_fixed_asset") {
    const detail = detailFor(body.p_asset);
    if (detail === null) return false; // …so `fixed-asset-mock.mjs` still answers for ITS assets.
    sendJson(response, 200, detail, cors);
    return true;
  }

  if (verb === "get_depreciation_authority") {
    if (!OURS(body.p_client)) return false;
    sendJson(response, 200, AUTHORITY(body.p_client), cors);
    return true;
  }

  if (verb === "list_depreciation_runs") {
    if (!OURS(body.p_client)) return false;
    sendJson(response, 200, RUNS(body.p_client), cors);
    return true;
  }

  if (verb === "preview_depreciation_run") {
    if (!OURS(body.p_client)) return false;
    sendJson(response, 200, PREVIEW(body.p_client), cors);
    return true;
  }

  if (verb === "sign_depreciation_authority") {
    if (!OURS(body.p_client)) return false;
    // 0227's resolution ladder, transcribed. A reference that names no row in this firm AND client
    // is refused BY NAME — that sentence is AC5's "explicit instruction" made executable.
    const ref = body.p_authority_ref;
    if (!ref || typeof ref !== "object") {
      sendJson(response, 400, {
        code: "CLR38",
        message: "a depreciation authority names the instruction that carries it",
        details: JSON.stringify({ reason: "authority_ref_invalid", constraint: "object" }),
      }, cors);
      return true;
    }
    if (ref.id !== DEP.workId) {
      sendJson(response, 400, {
        code: "CLR38",
        message: "the instruction this depreciation authority cites does not exist for this client",
        details: JSON.stringify({ reason: "authority_ref_unresolved", kind: ref.kind, id: ref.id }),
      }, cors);
      return true;
    }
    sendJson(response, 200, {
      authority_id: body.p_authority, client_id: body.p_client, status: "live", cadence: "monthly",
      authority_ref: ref, authority_from: DEP.authorityFrom,
    }, cors);
    return true;
  }

  // #975 [0279] — the accountant's own answer to the closed-year arrears question. The real door
  // re-measures the figure and refuses when it has moved; this mock keeps the figure fixed and
  // records the choice, which is what the walk drives.
  if (verb === "record_fa_arrears_resolution") {
    if (!OURS(body.p_client)) return false;
    state.arrearsChoice = String(body.p_choice ?? "");
    sendJson(response, 200, {
      status: "recorded",
      resolution_id: "97597597-9759-4975-8975-975097597597",
      client_id: body.p_client,
      fiscal_year_id: body.p_fiscal_year,
      fy_label: DEP.fyLabel,
      choice: state.arrearsChoice,
      arrears_cents: 25000,
      supersedes: null,
      remedy: state.arrearsChoice === "reopen_prior" ? "reopen_fiscal_year" : null,
    }, cors);
    return true;
  }

  if (verb === "run_depreciation_manual") {
    if (!OURS(body.p_client)) return false;
    state.lastOpKeys.push(String(body.p_op_key ?? ""));

    // THE LOCKED-PERIOD WALL, transcribed from `clara._fa_assert_period_open`. It is raised BEFORE
    // the first write, which is what the walk asserts: the runs table must not gain a row.
    if (body.p_client === DEP.lockedClientId) {
      sendJson(response, 400, {
        code: "CLR38",
        message: `fiscal year ${DEP.fyLabel} (2026-01-01 to 2026-12-31) is closed; a depreciation charge dated ${DEP.periodEnd} may not be run into it -- the formal reopen path (clara.reopen_fiscal_year) is the one way back in`,
        details: JSON.stringify({
          reason: "period_request_invalid",
          axis: "period_closed",
          fiscal_year_id: DEP.fiscalYearId,
          fy_label: DEP.fyLabel,
          fy_status: "closed",
          period_end: DEP.periodEnd,
          remedy: "reopen_fiscal_year",
        }),
      }, cors);
      return true;
    }

    state.runsPosted += 1;
    sendJson(response, 200, {
      status: "drafted",
      entry_id: DEP.runEntryId,
      charged_cents: 75000,
      entries: 1,
      skipped: [
        { asset_id: DEP.incompleteAssetId, reason: "incomplete" },
        { asset_id: DEP.frozenAssetId, reason: "disposal_draft_outstanding" },
      ],
    }, cors);
    return true;
  }

  return false;
}
