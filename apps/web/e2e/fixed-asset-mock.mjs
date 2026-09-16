// #639's own mock lane — the fixed-asset ACQUISITION journey (C7: the register row, its detail,
// the acquisition apart from the pending depreciation particulars, and the answer that completes
// them). A file-disjoint sibling of `bank-close-registers-mock.mjs` and consulted by
// `serve-built.mjs` through the one PostgREST hook that module's header describes.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real same-origin runtime
// proxy and every line of client code under test are REAL — the register's link and badge, the
// detail route's four tabs, the acquisition/particulars split, the Complete-particulars dialog's
// own state machine, its focus return, and the re-read that follows a governed write. What is
// faked is what sits behind them: PostgREST's reads and the two FA doors. So this walk proves the
// JOURNEY and the client's own wire shapes; it proves NOTHING about whether Postgres births a
// register row on the Work lane, whether the deferred trigger really fires before the belt, or
// whether `clara.complete_fixed_asset_particulars` really refuses a second completion.
// `packages/db/tests/fixed-asset-acquisition.test.mjs` and
// `packages/runtime/tests/fixed-asset-acquisition-e2e.mjs` own those against a real Postgres.
//
// EVERY REFUSAL BODY BELOW IS THE REAL ONE, transcribed from the door: PostgREST's error envelope
// with the CLR code in `code`, the database's message verbatim, and the typed reason AND AXIS
// inside `details` — which is what `lib/doors.ts` classifies as a governed `DoorRefusal` and what
// the axis→control mapping reads. A mock that invented a shape would let a broken mapper pass a
// browser walk.
//
// EVERY HANDLER IS SCOPED TO THIS LANE'S OWN CLIENT and falls through otherwise
// (`e2e-fixture-ownership.test.ts` exists because three lanes learned the hard way that a handler
// claiming a SHARED endpoint replaces everyone else's fixture). This lane claims no unfiltered
// `/clients` register, no shared session list and no firm-wide read.

export const FA = {
  clientId: "63963963-6396-4639-8639-639639639639",
  clientName: "SERI MURNI ENGINEERING",
  /** The asset the whole walk is about: acquired, posted, and WAITING on its depreciation
   *  particulars. This is #639's product sentence as a fixture. */
  assetId: "63901001-6390-4639-8639-639063901001",
  assetName: "Fixed asset (particulars pending) - 1510 RM8500.00",
  /** A SECOND pending asset — the one the completion cell writes to. The first stays pending
   *  forever, which is what makes every read-only cell independent of execution order: one server
   *  serves the whole suite, and there is no un-complete door to reset with. */
  answerableAssetId: "63901004-6390-4639-8639-639063901004",
  answerableAssetName: "Fixed asset (particulars pending) - 1510 RM4200.00",
  /** The neighbour whose particulars ARE answered — so the register shows both states at once and
   *  the badge cannot pass by being the only row. */
  completeAssetId: "63901002-6390-4639-8639-639063901002",
  completeAssetName: "Bench lathe",
  /** The predecessor whose acquisition was REVERSED, so History has a real chain to render. */
  reversedAssetId: "63901003-6390-4639-8639-639063901003",
  reversedAssetName: "Air compressor (first booking)",
  entryId: "63902001-6390-4639-8639-639063902001",
  reversedEntryId: "63902002-6390-4639-8639-639063902002",
  reversalMirrorId: "63902003-6390-4639-8639-639063902003",
  workId: "63903001-6390-4639-8639-639063903001",
  receiptId: "63904001-6390-4639-8639-639064904001",
  costAccount: "1510",
  accumAccount: "1519",
  expenseAccount: "6510",
};

const RPC_VERBS = new Set([
  "list_fixed_assets",
  "get_fixed_asset",
  "fa_register_tie",
  "get_depreciation_authority",
  "list_depreciation_runs",
  "complete_fixed_asset_particulars",
]);

/** The walk's own mutable state. Per-SERVER, not per-test — one server serves every walk — so the
 *  cell that completes the particulars asserts its precondition rather than assuming it. */
const state = { completed: false };

const CLIENT = {
  id: FA.clientId,
  name: FA.clientName,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ACCOUNTS = [
  { client_id: FA.clientId, account_code: FA.costAccount, name: "Plant & machinery", account_type: "asset", is_active: true },
  { client_id: FA.clientId, account_code: FA.accumAccount, name: "Accumulated depreciation — P&M", account_type: "asset", is_active: true },
  { client_id: FA.clientId, account_code: FA.expenseAccount, name: "Depreciation expense", account_type: "expense", is_active: true },
  { client_id: FA.clientId, account_code: "1101", name: "Maybank current", account_type: "asset", is_active: true },
];

const BASE_ROW = {
  status: "active",
  effective_from: null,
  superseded_at: null,
  residual_cents: null,
  accumulated_cents: 0,
  rate_bps: null,
  accum_account: FA.accumAccount,
  expense_account: FA.expenseAccount,
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
  asset_account: FA.costAccount,
  acquisition_document_id: null,
};

/** THE ASSET THE TICKET IS ABOUT: acquired, posted, and WAITING. It is NEVER written by the walk,
 *  so every read-only cell sees the same world however the suite is ordered or sharded. */
const pendingRow = () => ({
  ...BASE_ROW,
  id: FA.assetId,
  description: FA.assetName,
  particulars_complete: false,
  acquired_date: "2026-08-15",
  cost_cents: 850000,
  nbv_cents: 850000,
  method: null,
  useful_life_months: null,
  start_date: null,
  acquisition_entry_id: FA.entryId,
  acquisition_line_id: "63902101-6390-4639-8639-639063902101",
});

/** THE ONE THE WALK ANSWERS. Its particulars flip the moment the walk completes them through the
 *  real door — the persistent outcome AC9 asks for, RE-READ rather than painted. */
const answerableRow = () =>
  state.completed
    ? {
        ...BASE_ROW,
        id: FA.answerableAssetId,
        description: "Pallet jack",
        particulars_complete: true,
        acquired_date: "2026-08-20",
        cost_cents: 420000,
        residual_cents: 0,
        nbv_cents: 420000,
        method: "straight_line",
        useful_life_months: 60,
        start_date: "2026-08-20",
        acquisition_entry_id: "63902005-6390-4639-8639-639063902005",
        acquisition_line_id: "63902105-6390-4639-8639-639063902105",
      }
    : {
        ...BASE_ROW,
        id: FA.answerableAssetId,
        description: FA.answerableAssetName,
        particulars_complete: false,
        acquired_date: "2026-08-20",
        cost_cents: 420000,
        nbv_cents: 420000,
        method: null,
        useful_life_months: null,
        start_date: null,
        acquisition_entry_id: "63902005-6390-4639-8639-639063902005",
        acquisition_line_id: "63902105-6390-4639-8639-639063902105",
      };

const completeRow = () => ({
  ...BASE_ROW,
  id: FA.completeAssetId,
  description: FA.completeAssetName,
  particulars_complete: true,
  acquired_date: "2026-07-02",
  cost_cents: 640000,
  residual_cents: 0,
  accumulated_cents: 32000,
  nbv_cents: 608000,
  method: "straight_line",
  useful_life_months: 60,
  start_date: "2026-07-02",
  acquisition_entry_id: "63902004-6390-4639-8639-639063902004",
  acquisition_line_id: "63902104-6390-4639-8639-639063902104",
});

const reversedRow = () => ({
  ...BASE_ROW,
  id: FA.reversedAssetId,
  description: FA.reversedAssetName,
  status: "unwound",
  particulars_complete: false,
  acquired_date: "2026-08-01",
  cost_cents: 900000,
  nbv_cents: 900000,
  method: null,
  useful_life_months: null,
  start_date: null,
  acquisition_entry_id: FA.reversedEntryId,
  acquisition_line_id: "63902102-6390-4639-8639-639063902102",
});

const register = () => ({
  client_id: FA.clientId,
  as_of: "2026-09-16",
  assets: [pendingRow(), answerableRow(), completeRow(), reversedRow()],
  incomplete_count: state.completed ? 1 : 2,
});

/** THE ACQUISITION BLOCK, exactly as `clara._fa_acquisition_json` shapes it — Work and receipt
 *  RESOLVED BY JOIN in the database, which is why they are present here beside a NULL document:
 *  a Work-lane acquisition carries no document, and 0195 refuses to fabricate one. */
const acquisitionFor = (assetId) => {
  if (assetId === FA.assetId) {
    return {
      entry_id: FA.entryId, line_id: "63902101-6390-4639-8639-639063902101",
      document_id: null, document_filename: null, document_mime: null, document_sha256: null,
      document_kind: null,
      posting_date: "2026-08-15", approved_at: "2026-08-15T02:00:00.000Z", entry_status: "approved",
      entry_origin: "agent", memo: "Compressor purchased, paid from Maybank",
      reversal_of: null, reversed_by: null,
      acquired_date: "2026-08-15", cost_cents: 850000, currency: "MYR",
      asset_account: FA.costAccount,
      work_id: FA.workId, receipt_id: FA.receiptId,
      receipt_logical_op_id: `work:${FA.workId}:journal_entry:1`,
      receipt_created_at: "2026-08-15T02:00:01.000Z",
      on_behalf_of: "11111111-1111-1111-1111-111111111111",
      work_status: "completed", work_purpose: "journal_entry",
      derived_from: "acquisition_entry",
    };
  }
  if (assetId === FA.reversedAssetId) {
    return {
      entry_id: FA.reversedEntryId, line_id: "63902102-6390-4639-8639-639063902102",
      document_id: null, document_filename: null, document_mime: null, document_sha256: null,
      document_kind: null,
      posting_date: "2026-08-01", approved_at: "2026-08-01T02:00:00.000Z", entry_status: "approved",
      entry_origin: "manual", memo: "Compressor purchased at the gross figure",
      reversal_of: null, reversed_by: FA.reversalMirrorId,
      acquired_date: "2026-08-01", cost_cents: 900000, currency: "MYR",
      asset_account: FA.costAccount,
      work_id: null, receipt_id: null, receipt_logical_op_id: null, receipt_created_at: null,
      on_behalf_of: null, work_status: null, work_purpose: null,
      derived_from: "acquisition_entry",
    };
  }
  return {
    entry_id: "63902004-6390-4639-8639-639063902004",
    line_id: "63902104-6390-4639-8639-639063902104",
    document_id: null, document_filename: null, document_mime: null, document_sha256: null,
    document_kind: null,
    posting_date: "2026-07-02", approved_at: "2026-07-02T02:00:00.000Z", entry_status: "approved",
    entry_origin: "manual", memo: "Bench lathe purchased",
    reversal_of: null, reversed_by: null,
    acquired_date: "2026-07-02", cost_cents: 640000, currency: "MYR",
    asset_account: FA.costAccount,
    work_id: null, receipt_id: null, receipt_logical_op_id: null, receipt_created_at: null,
    on_behalf_of: null, work_status: null, work_purpose: null,
    derived_from: "acquisition_entry",
  };
};

const particularsFor = (row) => ({
  complete: row.particulars_complete,
  method: row.method,
  useful_life_months: row.useful_life_months,
  rate_bps: row.rate_bps,
  residual_cents: row.residual_cents,
  start_date: row.start_date,
  description: row.description,
  ca_class: row.ca_class,
  is_commercial_vehicle: row.is_commercial_vehicle,
  is_new: row.is_new,
  non_depreciable: false,
});

/** The CORRECTION CHAIN. The pending asset is the re-booking; the unwound row is its predecessor,
 *  and the derivation is named on the row — a candidate match must never read as a stored link. */
const historyFor = (assetId) => {
  if (assetId === FA.assetId) {
    return {
      status: "active", acquisition_entry_id: FA.entryId,
      acquisition_reversed_by: null, acquisition_reversed_at: null, acquisition_reverses: null,
      supersedes_asset_id: null, superseded_by_asset_id: null, superseded_at: null,
      disposed_at: null, disposal_entry_id: null,
      related: [{
        asset_id: FA.reversedAssetId, description: FA.reversedAssetName, status: "unwound",
        cost_cents: 900000, acquired_date: "2026-08-01",
        acquisition_entry_id: FA.reversedEntryId, particulars_complete: false,
        relation: "predecessor", link: "reversed_acquisition_on_same_enrolment",
      }],
      chain_open: false,
    };
  }
  if (assetId === FA.reversedAssetId) {
    return {
      status: "unwound", acquisition_entry_id: FA.reversedEntryId,
      acquisition_reversed_by: FA.reversalMirrorId,
      acquisition_reversed_at: "2026-08-14T02:00:00.000Z", acquisition_reverses: null,
      supersedes_asset_id: null, superseded_by_asset_id: null, superseded_at: null,
      disposed_at: null, disposal_entry_id: null,
      related: [{
        asset_id: FA.assetId, description: FA.assetName, status: "active",
        cost_cents: 850000, acquired_date: "2026-08-15",
        acquisition_entry_id: FA.entryId, particulars_complete: false,
        relation: "successor", link: "reversed_acquisition_on_same_enrolment",
      }],
      chain_open: false,
    };
  }
  return {
    status: "active", acquisition_entry_id: "63902004-6390-4639-8639-639063902004",
    acquisition_reversed_by: null, acquisition_reversed_at: null, acquisition_reverses: null,
    supersedes_asset_id: null, superseded_by_asset_id: null, superseded_at: null,
    disposed_at: null, disposal_entry_id: null, related: [], chain_open: false,
  };
};

const rowFor = (assetId) =>
  [pendingRow(), answerableRow(), completeRow(), reversedRow()].find((r) => r.id === assetId) ?? null;

const detailFor = (assetId) => {
  const row = rowFor(assetId);
  if (row === null) return null;
  const schedule = row.particulars_complete && row.status === "active"
    ? [
        { period_start: "2026-08-01", period_end: "2026-08-31", projected_cents: 14167 },
        { period_start: "2026-09-01", period_end: "2026-09-30", projected_cents: 14167 },
      ]
    : [];
  return {
    asset: row,
    lineage: [],
    charges: [],
    schedule,
    uncharged_due: [],
    acquisition: acquisitionFor(assetId),
    particulars: particularsFor(row),
    history: historyFor(assetId),
  };
};

function readJson(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/** WHO IS ASKING. `serve-built.mjs` mints a real (unsigned) JWT whose payload carries the signed-in
 *  email, so this lane can answer the way the DOOR would for a persona without any shared mutable
 *  state: `clara.complete_fixed_asset_particulars` runs `clara._human_ctx(role_rank('bookkeeper'))`
 *  (0004:299-309), which raises a bare CLR04 "insufficient role" for a viewer. Reading the bearer
 *  is how this lane knows to give that answer; nothing else about the session is inspected. */
function callerEmail(request) {
  const header = request.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).email ?? null;
  } catch {
    return null;
  }
}

/** The C7 acquisition lane's PostgREST half. Returns true when it answered, so the server's
 *  delegate chain falls through to every other lane for anything that is not this fixture's. */
export async function handleFixedAssetSupabase(request, response, path, url, sendJson, cors) {
  const eq = (v) => (v && v.startsWith("eq.") ? v.slice(3) : null);
  const idFilter = eq(url.searchParams.get("id"));
  const clientFilter = eq(url.searchParams.get("client_id"));

  // ID-SCOPED ONLY: the UNFILTERED /clients read is the client register every walk shares, and
  // claiming it would replace another walk's fixture. This walk navigates by URL.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter === FA.clientId) {
      sendJson(response, 200, [CLIENT], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (clientFilter === FA.clientId) {
      sendJson(response, 200, ACCOUNTS, cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/fa_account_profiles") {
    if (clientFilter === FA.clientId) {
      sendJson(response, 200, [{
        id: "63905001-6390-4639-8639-639063905001",
        asset_account_code: FA.costAccount,
        accum_depr_account_code: FA.accumAccount,
        depr_expense_account_code: FA.expenseAccount,
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
  const body = await readJson(request);

  if (verb === "list_fixed_assets") {
    if (body.p_client !== FA.clientId) return false;
    sendJson(response, 200, register(), cors);
    return true;
  }

  if (verb === "get_fixed_asset") {
    const detail = detailFor(body.p_asset);
    if (detail === null) return false;
    sendJson(response, 200, detail, cors);
    return true;
  }

  if (verb === "fa_register_tie") {
    if (body.p_client !== FA.clientId) return false;
    sendJson(response, 200, {
      client_id: FA.clientId, as_of: "2026-09-16", tie: true, accounts: [],
      incomplete_count: state.completed ? 0 : 1, pending_draft_count: 0,
    }, cors);
    return true;
  }

  if (verb === "get_depreciation_authority") {
    if (body.p_client !== FA.clientId) return false;
    sendJson(response, 200, {
      client_id: FA.clientId, authority: null, ramp_earned: false,
      fy_end: { month: 12, day: 31, fallback: true }, high_stakes_threshold_cents: 1000000,
    }, cors);
    return true;
  }

  if (verb === "list_depreciation_runs") {
    if (body.p_client !== FA.clientId) return false;
    sendJson(response, 200, { client_id: FA.clientId, runs: [] }, cors);
    return true;
  }

  // THE GOVERNED WRITE. Four refusal arms and one success, each the DOOR'S own shape.
  if (verb === "complete_fixed_asset_particulars") {
    if (body.p_client !== FA.clientId) return false;
    const p = body.p_particulars ?? {};

    // DENIED — the role floor, and it is the FIRST thing the door checks (`clara._human_ctx`
    // runs before the op key, before the client lookup, before anything else). A viewer may READ
    // this register all day; what they may not do is write the particulars. The message is the
    // estate's own, verbatim (0004:307), and it carries no `details` because the floor raises
    // none — which is exactly why the surface must render it at FORM level and move no focus.
    if ((callerEmail(request) ?? "").startsWith("viewer@")) {
      sendJson(response, 400, {
        code: "CLR04", message: "insufficient role", details: null,
      }, cors);
      return true;
    }

    // COMPLETE-ONCE. The door's own law (0041:3066-3071), and the arm a second submit must hit.
    if (state.completed && body.p_asset === FA.answerableAssetId) {
      sendJson(response, 400, {
        code: "CLR37",
        message: "this asset's particulars are already complete; use revise_fixed_asset_particulars for a prospective change",
        details: JSON.stringify({ reason: "fa_particulars_already_complete", asset_id: body.p_asset }),
      }, cors);
      return true;
    }

    // THE AXIS-TYPED REFUSAL a surface maps onto a CONTROL. Straight line with no useful life is
    // `axis: "drivers"`, verbatim from `clara._fa_validate_particulars`.
    if (p.method === "straight_line" && !p.useful_life_months) {
      sendJson(response, 400, {
        code: "CLR37",
        message: "straight_line needs a positive useful life in months and no rate",
        details: JSON.stringify({ reason: "fa_particulars_invalid", axis: "drivers" }),
      }, cors);
      return true;
    }
    if (!p.start_date) {
      sendJson(response, 400, {
        code: "CLR37",
        message: "an in-service (depreciation start) date is required for every method, including none",
        details: JSON.stringify({ reason: "fa_particulars_invalid", axis: "start_date" }),
      }, cors);
      return true;
    }

    // THE REACHABLE INVALID ANSWER, and the reason this arm exists. `particularsReadyToSubmit`
    // (fa-particulars-fields.tsx) gates method/date/life, so a browser cannot reach the two arms
    // above through the form at all — but it checks residual against NOTHING, and `MoneyInput`
    // clamps nothing, so a human CAN submit a residual above cost and the door refuses it with
    // `axis: "residual"` (0201 §D, "a residual value cannot exceed cost"). That is the invalid
    // path the walk drives, and the axis it maps onto a control.
    const costOf = { [FA.assetId]: 850000, [FA.answerableAssetId]: 420000, [FA.completeAssetId]: 1200000 };
    const cost = costOf[body.p_asset] ?? null;
    if (p.method !== "none" && cost !== null && Number(p.residual_cents ?? 0) > cost) {
      sendJson(response, 400, {
        code: "CLR37",
        message: "a residual value cannot exceed cost",
        details: JSON.stringify({ reason: "fa_particulars_invalid", axis: "residual" }),
      }, cors);
      return true;
    }

    if (body.p_asset === FA.answerableAssetId) state.completed = true;
    sendJson(response, 200, {
      asset_id: body.p_asset, client_id: FA.clientId, particulars_complete: true,
    }, cors);
    return true;
  }

  return false;
}
