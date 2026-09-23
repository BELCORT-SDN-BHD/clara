// #652's accrual lane mock — a file-disjoint sibling of `plans-mock.mjs` and
// `periodic-adjustment-mock.mjs`, consulted by `serve-built.mjs` through ONE hook, exactly as those
// modules' own headers describe for themselves. Every id below is distinct from theirs and EVERY
// handler is ID-SCOPED (each one falls through with `return false` for a subject that is not this
// lane's), so no walk can starve another's fixtures.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL — the list, the detail, the multi-section CREATE form, the derived disabled
// line preview, the focus manager, the draft in sessionStorage, the layout at 320 CSS px. What is
// faked is PostgREST: the three accrual doors plus the four reads the form makes (the chart, the
// authority candidates, and the evidence chooser's two). So this walk proves the JOURNEY and what
// the surface does with the database's answers; it proves NOTHING about whether Postgres really
// refuses a silent term, really keeps a configuration out of the ledger, or really binds a reversal
// to a posted entry. `packages/db/tests/accrual-adjustments.test.mjs` and
// `packages/runtime/tests/accrual-e2e.mjs` own those against a real Postgres.
//
// THE FIXTURE IS STATEFUL IN THREE WAYS, and each is a walk's own journey:
//
//   1. `create_accrual_adjustment` APPENDS to the list and REFUSES a set of particulars that names
//      no service period — so the walk's create cell is a real transition (submit → the surface
//      re-reads → the new row is there) rather than two canned lists.
//   2. It records every op key it was sent, so the walk can prove that a resubmit of the SAME
//      decision carries the SAME key. That is the whole of the lost-response story and no canned
//      answer can show it.
//   3. #936's `correct_accrual_adjustment` writes a SUCCESSOR row for the CORRECTABLE accrual and
//      stamps the original's `corrected_by_accrual_id` — the same real-transition and op-key-replay
//      proof, plus the ONE new refusal this door adds (`accrual_already_corrected`). A SEPARATE,
//      already-corrected pair (`correctedAccrualId`/`correctedSuccessorId`) proves the LINEAGE
//      READ without depending on this stateful journey.
import { readCachedJson } from "./mock-dispatch.mjs";


export const ACC = {
  firmId: "65065065-6500-4650-8650-650650650650",
  clientId: "65c0c0c0-6500-4650-8650-650650650650",
  // A SECOND client of the same firm, with a chart of its own and no accruals at all. It exists for
  // exactly one claim the draft cannot make otherwise: a scope change never TRANSFERS a draft — so
  // the walk needs a real `/accruals/new` of another client to open, not a 404.
  otherClientId: "65d0d0d0-6500-4650-8650-650650650650",
  accrualId: "65111111-6500-4650-8650-650650650650",
  unpostedAccrualId: "65222222-6500-4650-8650-650650650650",
  createdAccrualId: "65333333-6500-4650-8650-650650650650",
  planId: "65444444-6500-4650-8650-650650650650",
  workId: "65555555-6500-4650-8650-650650650650",
  reversalWorkId: "65666666-6500-4650-8650-650650650650",
  authorityWorkId: "65777777-6500-4650-8650-650650650650",
  entryId: "65888888-6500-4650-8650-650650650650",
  receiptId: "65999999-6500-4650-8650-650650650650",
  documentId: "65aaaaaa-6500-4650-8650-650650650650",
  purpose: "Monthly office rent accrual",
  unpostedPurpose: "Quarterly audit fee accrual",
  // #936 — the dedicated correction door's own subjects. A CORRECTABLE accrual (never yet
  // corrected, so the walk can DRIVE a real correction), and an ALREADY-corrected pair (so the
  // lineage read and the "already corrected" refusal face can each be proven without depending on
  // the stateful correction journey).
  correctableAccrualId: "65bbbbbb-6500-4650-8650-650650650650",
  correctablePurpose: "Monthly software subscription accrual",
  correctableSuccessorId: "65eeeeee-6500-4650-8650-650650650650",
  correctedAccrualId: "6500cccc-6500-4650-8650-650650650650",
  correctedSuccessorId: "6500dddd-6500-4650-8650-650650650650",
  correctedPurpose: "Monthly delivery contract accrual",
  // #938 — a document-sourced bill hitting POSTED's own expense account (6100), inside its own
  // period (2026-07-01 to 2026-07-31), while its reversal has not been admitted. Rides POSTED's
  // OWN plan (ACC.planId) rather than minting a third accrual: the ticket's row is the plan's own
  // id, and this is the same plan the walk already drives.
  billEntryId: "65ffffff-6500-4650-8650-650650650650",
  billDocumentId: "6500eeee-6500-4650-8650-650650650650",
};

/** The ONLY RPC verbs this lane's dispatch chain recognises — the allow-list `readCachedJson`'s own
 *  call site guards on, so a verb this lane does not own never has its request stream drained (the
 *  #632 finding-10 root cause, stated in full in `bank-close-registers-mock.mjs`).
 *
 *  `list_spoken_for_documents` IS SHARED with `periodic-adjustment-mock.mjs` and is declared as
 *  such in `e2e-fixture-ownership.test.ts`: both lanes mount the SAME `EvidenceChooser`, which
 *  makes the same advisory read. Both scope it by their own `p_client` and fall through otherwise,
 *  so the two can never answer for each other. */
export const ACCRUAL_RPC_VERBS = new Set([
  "list_accrual_adjustments",
  "get_accrual_adjustment",
  "create_accrual_adjustment",
  "correct_accrual_adjustment",
  "list_spoken_for_documents",
  // #938 — the derived read the Accruals page now also renders (SHARED with three other lanes,
  // e2e-fixture-ownership.test.ts's own SHARED_RPC_VERBS declaration) and "reverse now" (SHARED
  // with plans-mock.mjs / prepayments-mock.mjs, same declaration).
  "list_review_queue",
  "request_plan_catch_up",
]);

const state = {
  created: false, opKeys: [], refusals: 0,
  // #936 — whether the CORRECTABLE accrual has been corrected during this walk, and the op keys
  // `correct_accrual_adjustment` was sent, for the identical lost-response proof CREATE already has.
  corrected: false, correctOpKeys: [],
  // #938 — whether "reverse now" has been driven this walk (clears the accrual_bill_conflict row
  // on the NEXT list_review_queue read — the derived-row, no-cleanup law CONTEXT.md's "Settlement
  // candidate row" entry states), and every op key request_plan_catch_up was sent for it.
  reversed: false, reverseOpKeys: [],
};

export function resetAccruals() {
  state.created = false;
  state.opKeys = [];
  state.refusals = 0;
  state.corrected = false;
  state.correctOpKeys = [];
  state.reversed = false;
  state.reverseOpKeys = [];
}

/** Every op key `request_plan_catch_up` was sent for "reverse now", oldest first. */
export function accrualReverseOpKeys() {
  return [...state.reverseOpKeys];
}

/** Every op key `create_accrual_adjustment` was sent, oldest first — the walk's lost-response cell
 *  asserts that a resubmit of the same decision repeats the key rather than minting a second. */
export function accrualOpKeys() {
  return [...state.opKeys];
}

/** The same proof, for `correct_accrual_adjustment` (#936). */
export function accrualCorrectOpKeys() {
  return [...state.correctOpKeys];
}

const CLIENT = () => ({
  id: ACC.clientId,
  name: "C8 ACCRUALS FIXTURE",
  status: "active",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-01T00:00:00.000Z",
});

/** The chart the form's two account pickers read. An expense, a plain liability, a PAYABLE CONTROL
 *  (which the door refuses for the liability leg) and a bank asset — so a walk can see the offered
 *  set is filtered by account type rather than by hope. */
const ACCOUNTS = [
  { client_id: ACC.clientId, account_code: "6100", name: "Office Rent", account_type: "expense", is_active: true },
  { client_id: ACC.clientId, account_code: "6200", name: "Audit Fees", account_type: "expense", is_active: true },
  { client_id: ACC.clientId, account_code: "2020", name: "Accruals", account_type: "liability", is_active: true },
  // A PAYABLE CONTROL ACCOUNT. The form OFFERS it — it is an active liability of this client, and
  // the account CLASS is a database fact the browser does not hold — and the door REFUSES it
  // (`non_control_liability`: a control account reconciles to identified open items and an accrual
  // has none). That gap is the honest way to reach the server-refusal path: a real disagreement
  // between what the form can know and what the database knows, rather than a contrived payload.
  { client_id: ACC.clientId, account_code: "2050", name: "Trade Creditors", account_type: "liability", is_active: true },
  { client_id: ACC.clientId, account_code: "1150", name: "Maybank current", account_type: "asset", is_active: true },
];

/** The authority picker's rows — `clara.accounting_work` of THIS client, which is what
 *  `clara.create_accrual_adjustment` resolves `p_authority_ref` against.
 *
 *  #809 MOVED THIS READ. The picker used to be a direct `/rest/v1/accounting_work` GET
 *  (`lib/plans/api.ts`'s deleted `listAuthorityCandidates`); migration 0203 widened
 *  `clara.list_accounting_work`'s projection with `intent_key`, the last field the direct read was
 *  kept for, and `listPlanAuthorityWork` now walks the DOOR. So this lane answers the door for its
 *  own client (`accrualWorkListPage` below, spliced into `serve-built.mjs`'s single
 *  `list_accounting_work` reader) and keeps the table handler for the DETAIL read
 *  (`lib/work/reads.ts`'s `getAccountingWork`), which has no door. */
const AUTHORITY_WORK = [
  {
    id: ACC.authorityWorkId,
    intent_key: "instruction-2026-06-30",
    created_at: "2026-06-30T02:00:00.000Z",
    basis: { memo: "Standing instruction: accrue the monthly office rent" },
  },
];

/** The SAME instruction, in the door's own row shape — one fixture fact, two projections, exactly
 *  as the database has it. `answerWorkListPage`'s contract: null means "not this lane's client",
 *  so the next lane (and finally the honest empty page) answers. */
export function accrualWorkListPage(body) {
  const client = body.p_client ?? null;
  if (client !== ACC.clientId) return null;
  return {
    status: 200,
    body: {
      rows: AUTHORITY_WORK.map((w) => ({
        id: w.id,
        client_id: ACC.clientId,
        client_name: "C8 ACCRUALS FIXTURE",
        purpose: "journal_entry",
        status: "completed",
        initiator: "11111111-1111-1111-1111-111111111111",
        initiated_by: "11111111-1111-1111-1111-111111111111",
        initiator_role: "bookkeeper",
        basis_origin: "user_direct",
        intent_key: w.intent_key,
        memo: w.basis.memo,
        posting_date: null,
        currency: "MYR",
        source_ref_count: 0,
        current_task_id: null,
        entry_id: null,
        receipt_id: null,
        error_code: null,
        error_reason: null,
        attempts: 1,
        current_run_status: null,
        pending_question_id: null,
        pending_question_version: null,
        created_at: w.created_at,
        updated_at: w.created_at,
      })),
      next_cursor: null,
      truncated: false,
    },
  };
}

const PLAN = () => ({
  plan_id: ACC.planId,
  kind: "reversing_journal",
  status: "active",
  purpose: ACC.purpose,
  authorised_by: "11111111-1111-1111-1111-111111111111",
  authorised_at: "2026-06-30T02:00:00.000Z",
  authority_from: "2026-06-30",
  current_revision: 1,
  frequency: "monthly",
  day_rule: "last_day_of_month",
  day_of_month: null,
  timezone: "Asia/Kuala_Lumpur",
  basis: {
    posting_date: "2026-06-30",
    memo: "Monthly office rent accrual",
    currency: "MYR",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "accrued 2026-07-01 to 2026-07-31" },
      { account_code: "2020", debit_cents: 0, credit_cents: 120000, description: "accrual" },
    ],
  },
  basis_digest: "a".repeat(64),
  auto_reverse: true,
  reversal_day_rule: "next_period_first_day",
});

const POSTED = {
  accrual_id: ACC.accrualId,
  plan_id: ACC.planId,
  revision: 1,
  purpose: ACC.purpose,
  expense_account_code: "6100",
  liability_account_code: "2020",
  amount_cents: 120000,
  currency: "MYR",
  effective_from: "2026-07-01",
  effective_to: "2026-07-31",
  service_period_start: "2026-07-01",
  service_period_end: "2026-07-31",
  term_source: "human_stated",
  method: { rule: "stated_amount" },
  document_service_period_id: null,
  source_document_id: null,
  plan_status: "active",
  plan_kind: "reversing_journal",
  recorded_by: "11111111-1111-1111-1111-111111111111",
  created_at: "2026-06-30T02:05:00.000Z",
  occurrence_count: 2,
  posted: true,
};

/** A SECOND accrual that is CONFIGURED but has posted nothing — the boundary this whole journey
 *  exists to keep, as a row a walk can point at. */
const UNPOSTED = {
  ...POSTED,
  accrual_id: ACC.unpostedAccrualId,
  purpose: ACC.unpostedPurpose,
  expense_account_code: "6200",
  amount_cents: 450000,
  effective_to: "2026-09-30",
  service_period_start: "2026-07-01",
  service_period_end: "2026-09-30",
  created_at: "2026-07-01T02:00:00.000Z",
  occurrence_count: 1,
  posted: false,
};

const CREATED = {
  ...POSTED,
  accrual_id: ACC.createdAccrualId,
  purpose: "Monthly cleaning contract accrual",
  amount_cents: 88000,
  created_at: "2026-07-02T02:00:00.000Z",
  occurrence_count: 1,
  posted: false,
};

// #936 — A CORRECTABLE accrual: configured, never yet corrected, so the walk can DRIVE a real
// correction and watch the list/detail RE-READ afterwards.
const CORRECTABLE = {
  ...UNPOSTED,
  accrual_id: ACC.correctableAccrualId,
  purpose: ACC.correctablePurpose,
  expense_account_code: "6100",
  amount_cents: 250000,
  effective_from: "2026-07-01",
  effective_to: "2026-07-31",
  service_period_start: "2026-07-01",
  service_period_end: "2026-07-31",
  created_at: "2026-07-03T02:00:00.000Z",
  occurrence_count: 0,
};

// #936 — AN ALREADY-corrected pair, present from the walk's first read: the ORIGINAL names its
// successor and the SUCCESSOR names the row it corrects, in both directions — proving the lineage
// READ without depending on the stateful correction journey above.
const CORRECTED_ORIGINAL = {
  ...UNPOSTED,
  accrual_id: ACC.correctedAccrualId,
  purpose: ACC.correctedPurpose,
  amount_cents: 300000,
  created_at: "2026-06-15T02:00:00.000Z",
  occurrence_count: 0,
};
const CORRECTED_SUCCESSOR = {
  ...CORRECTED_ORIGINAL,
  accrual_id: ACC.correctedSuccessorId,
  amount_cents: 360000,
  created_at: "2026-07-04T02:00:00.000Z",
};

/** The row `correct_accrual_adjustment` writes DURING the walk, once `state.corrected` flips —
 *  the SAME shape `create_accrual_adjustment`'s own `CREATED` is for the create journey. */
const CORRECTABLE_SUCCESSOR = {
  ...CORRECTABLE,
  accrual_id: ACC.correctableSuccessorId,
  amount_cents: 275000,
  created_at: "2026-07-05T02:00:00.000Z",
};

const LIST = () => [
  ...(state.created ? [CREATED] : []),
  UNPOSTED, POSTED, CORRECTABLE, CORRECTED_ORIGINAL,
  ...(state.corrected ? [CORRECTABLE_SUCCESSOR] : []),
  CORRECTED_SUCCESSOR,
];

const OCCURRENCES = (accrualId) => {
  if (accrualId === ACC.unpostedAccrualId) {
    // THE ORPHAN WALL AS HISTORY: a reversal due event that was REACHED and REFUSED because its
    // own accrual has posted nothing. `primary_state` says WHICH of the three ways it fails to
    // stand behind it, which is the fact a reader of an accrual most needs.
    return [
      {
        occurrence_id: "65c1c1c1-6500-4650-8650-650650650650",
        leg: "primary",
        due_date: "2026-09-30",
        period_key: "2026-07-01",
        attempt: 1,
        revision: 1,
        work_id: ACC.workId,
        work_status: "queued",
        work_error: null,
        admitted_at: "2026-09-30T00:00:11.000Z",
        outcome: { state: "admitted", logical_op_id: `work:${ACC.workId}:journal_entry:1`, replayed: false },
        reverses_entry_id: null,
        receipt_id: null,
        entry_id: null,
      },
      {
        occurrence_id: "65c2c2c2-6500-4650-8650-650650650650",
        leg: "reversal",
        due_date: "2026-10-01",
        period_key: "2026-07-01",
        attempt: 1,
        revision: 1,
        work_id: null,
        work_status: null,
        work_error: null,
        admitted_at: null,
        outcome: {
          state: "refused",
          code: "CLR13",
          reason: "reversal_before_primary",
          message: "this reversal has no posted accrual behind it to reverse",
          primary_state: "not_posted",
          primary_due_date: "2026-09-30",
        },
        reverses_entry_id: null,
        receipt_id: null,
        entry_id: null,
      },
    ];
  }
  if (accrualId === ACC.accrualId) {
    return [
      {
        occurrence_id: "65b1b1b1-6500-4650-8650-650650650650",
        leg: "primary",
        due_date: "2026-07-31",
        period_key: "2026-07-01",
        attempt: 1,
        revision: 1,
        work_id: ACC.workId,
        work_status: "completed",
        work_error: null,
        admitted_at: "2026-07-31T00:00:12.000Z",
        outcome: { state: "admitted", logical_op_id: `work:${ACC.workId}:journal_entry:1`, replayed: false },
        reverses_entry_id: null,
        receipt_id: ACC.receiptId,
        entry_id: ACC.entryId,
      },
      {
        occurrence_id: "65b2b2b2-6500-4650-8650-650650650650",
        leg: "reversal",
        due_date: "2026-08-01",
        period_key: "2026-07-01",
        attempt: 1,
        revision: 1,
        work_id: ACC.reversalWorkId,
        work_status: "queued",
        work_error: null,
        admitted_at: "2026-08-01T00:00:09.000Z",
        outcome: { state: "admitted", logical_op_id: `work:${ACC.reversalWorkId}:journal_entry:1`, replayed: false },
        reverses_entry_id: ACC.entryId,
        receipt_id: null,
        entry_id: null,
      },
    ];
  }
  // EVERY OTHER ACCRUAL (CREATED, and #936's own correctable/corrected fixtures) has reached no
  // due date at all — a plain empty schedule, never a canned reversal refusal that was never this
  // row's own fact.
  return [];
};

/** Every row this fixture can answer `get_accrual_adjustment` for, by id — `LIST()`'s own
 *  membership plus the row `correct_accrual_adjustment` writes once `state.corrected` is set,
 *  which `LIST()` already folds in. */
function rowById(accrualId) {
  return LIST().find((r) => r.accrual_id === accrualId) ?? null;
}

/** The correction lineage `clara.get_accrual_adjustment` derives — 0222's own columns, first
 *  WRITTEN by `clara.correct_accrual_adjustment` (0284). Dynamic for the CORRECTABLE pair, since
 *  the walk creates that pointer during the journey; static for the pre-existing pair. */
function lineageFor(accrualId) {
  if (accrualId === ACC.correctableAccrualId) {
    return { corrects_accrual_id: null, corrected_by_accrual_id: state.corrected ? ACC.correctableSuccessorId : null };
  }
  if (accrualId === ACC.correctableSuccessorId) {
    return { corrects_accrual_id: ACC.correctableAccrualId, corrected_by_accrual_id: null };
  }
  if (accrualId === ACC.correctedAccrualId) {
    return { corrects_accrual_id: null, corrected_by_accrual_id: ACC.correctedSuccessorId };
  }
  if (accrualId === ACC.correctedSuccessorId) {
    return { corrects_accrual_id: ACC.correctedAccrualId, corrected_by_accrual_id: null };
  }
  return { corrects_accrual_id: null, corrected_by_accrual_id: null };
}

const DETAIL = (accrualId) => {
  const row = rowById(accrualId) ?? CREATED;
  const occurrences = OCCURRENCES(accrualId);
  return {
    ...row,
    client_id: ACC.clientId,
    authority_kind: "explicit_instruction",
    authority_ref: { kind: "accounting_work", id: ACC.authorityWorkId },
    instruction: "The client's standing instruction of 2026-06-30, minuted by the engagement partner.",
    ...lineageFor(accrualId),
    plan: { ...PLAN(), purpose: row.purpose },
    occurrences,
    reversal: occurrences.find((o) => o.leg === "reversal") ?? null,
    // #937 — the door always answers with the key; [] under the stated_amount rule every accrual
    // in this mock uses, so the correction form's per-period block stays unrendered here.
    period_amounts: [],
  };
};

/** The accrual lane's PostgREST half. Returns true when it answered, so the server's delegate chain
 *  falls through to every other lane for anything that is not this fixture's. */
export async function handleAccrualSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  // ID-SCOPED ONLY: the UNFILTERED /clients read is the client register every walk shares, and
  // claiming it would replace another walk's fixture. This walk navigates by URL.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter === `eq.${ACC.clientId}`) {
      sendJson(response, 200, [CLIENT()], cors);
      return true;
    }
    if (idFilter === `eq.${ACC.otherClientId}`) {
      sendJson(response, 200, [{ ...CLIENT(), id: ACC.otherClientId, name: "C8 ACCRUALS SIBLING" }], cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (clientFilter === `eq.${ACC.otherClientId}`) {
      sendJson(response, 200, [], cors);
      return true;
    }
    if (clientFilter !== `eq.${ACC.clientId}`) return false;
    sendJson(response, 200, ACCOUNTS, cors);
    return true;
  }

  // The DETAIL read's own route — `clara.accounting_work` of this client. Scoped by `client_id`
  // and falls through otherwise, so the Work-list lane's own rows are untouched. The authority
  // PICKER no longer arrives here (#809, see AUTHORITY_WORK's header); this stays for
  // `getAccountingWork`, which has no door.
  if (request.method === "GET" && path === "/rest/v1/accounting_work") {
    if (clientFilter === `eq.${ACC.otherClientId}`) {
      sendJson(response, 200, [], cors);
      return true;
    }
    if (clientFilter !== `eq.${ACC.clientId}`) return false;
    sendJson(response, 200, AUTHORITY_WORK, cors);
    return true;
  }

  // The evidence chooser's filings read. This fixture files NO document, which is the honest state
  // of a client whose accrual rests on a standing instruction rather than an invoice — and it is
  // the state the walk's create cell runs in.
  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    if (clientFilter !== `eq.${ACC.clientId}` && clientFilter !== `eq.${ACC.otherClientId}`) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!ACCRUAL_RPC_VERBS.has(verb)) return false;
  const body = await readCachedJson(request);

  if (verb === "list_spoken_for_documents") {
    if (body.p_client !== ACC.clientId && body.p_client !== ACC.otherClientId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  // #938 — THE DERIVED READ. clara.list_review_queue, SCOPED the same defensive way
  // journal-work-mock.mjs's own list_review_queue handler is: this lane answers ONLY while it has
  // something to say (a live accrual_bill_conflict row for THIS client), and falls through to
  // serve-built.mjs's generic empty envelope otherwise — so a walk that never touches accruals
  // never sees this lane's row. `state.reversed` is the whole derived-row law: once "reverse now"
  // has been driven, the row is simply not produced any more — no dismissal, no cleanup.
  if (verb === "list_review_queue") {
    const scope = body.p_scope ?? {};
    if (scope.client_id !== undefined && scope.client_id !== ACC.clientId) return false;
    if (state.reversed) return false;
    const row = {
      row_kind: "accrual_bill_conflict", section: "needs_you", sort: "1",
      client_id: ACC.clientId, counterparty_id: null, filing_id: null, entry_id: ACC.billEntryId,
      question_id: null, task_id: null, document_id: ACC.billDocumentId, lane: "needs_you",
      auto: false, rule_backed: false, high_stakes: false, aged_since: "2026-07-31T02:05:00.000Z",
      amount_cents: 120000, period: "2026-07-31",
      question_text: `A document-sourced entry posted inside the accrued period 2026-07-01 to 2026-07-31 for "${ACC.purpose}"`,
      created_at: "2026-07-31T02:05:00.000Z", id: ACC.planId,
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null,
      advance_id: null, autodraft: null, client_name: null, batch_ids: null,
      open_proposal_count: null,
    };
    sendJson(response, 200, {
      counts: {
        ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0,
        open_tasks: 0, compliance_watches: 0, lint_findings: 0,
      },
      sweep: null,
      compliance: { stale_evaluator: false, clients: [] },
      lint: null,
      rows: [row],
      next_cursor: null,
    }, cors);
    return true;
  }

  // #938 — "REVERSE NOW", the plan lane's own request_plan_catch_up door (SHARED with
  // plans-mock.mjs / prepayments-mock.mjs, e2e-fixture-ownership.test.ts's own declaration).
  // Scoped to ACC.planId and falls through otherwise. Admits the reversal on the FIRST call —
  // there is no refusal cell in this walk, which lives entirely in packages/db/tests/
  // accrual-bill-conflict.test.mjs's real catch_up_in_future cell.
  if (verb === "request_plan_catch_up") {
    if (body.p_plan !== ACC.planId) return false;
    state.reversed = true;
    state.reverseOpKeys.push(body.p_op_key);
    sendJson(response, 200, {
      plan_id: ACC.planId, from: body.p_from, to: body.p_to, admitted: 1, cap: 12,
      events: [{
        admitted: true, plan_id: ACC.planId, occurrence_id: ACC.reversalWorkId,
        work_id: ACC.reversalWorkId, due_date: body.p_to, leg: "reversal", revision: 1,
        attempt: 1, period_key: "2026-07-01", reverses_entry_id: ACC.entryId,
        intent_key: `plan:${ACC.planId}:r1:${body.p_to}`,
      }],
    }, cors);
    return true;
  }

  if (verb === "list_accrual_adjustments") {
    if (body.p_client === ACC.otherClientId) {
      sendJson(response, 200, { client_id: ACC.otherClientId, from: null, to: null, accruals: [] }, cors);
      return true;
    }
    if (body.p_client !== ACC.clientId) return false;
    // THE WINDOW IS THE DATABASE'S FILTER, and the mock applies it for the same reason it models
    // the refusal: the surface's behaviour is written against a filtered answer.
    const from = typeof body.p_from === "string" ? body.p_from : null;
    const to = typeof body.p_to === "string" ? body.p_to : null;
    const rows = LIST().filter(
      (r) => (from === null || r.effective_from >= from) && (to === null || r.effective_from <= to));
    sendJson(response, 200, { client_id: ACC.clientId, from, to, accruals: rows }, cors);
    return true;
  }

  if (verb === "get_accrual_adjustment") {
    const known = [
      ACC.accrualId, ACC.unpostedAccrualId, ACC.correctableAccrualId,
      ACC.correctedAccrualId, ACC.correctedSuccessorId,
    ]
      .concat(state.created ? [ACC.createdAccrualId] : [])
      .concat(state.corrected ? [ACC.correctableSuccessorId] : []);
    if (!known.includes(body.p_accrual)) return false;
    sendJson(response, 200, DETAIL(body.p_accrual), cors);
    return true;
  }

  if (verb === "create_accrual_adjustment") {
    if (body.p_client !== ACC.clientId) return false;
    state.opKeys.push(String(body.p_op_key ?? ""));
    const accrual = body.p_accrual ?? {};

    // THE DOOR'S OWN REFUSAL, in PostgREST's error envelope and in the exact shape `lib/doors.ts`
    // classifies as a governed `DoorRefusal`: a CLR code in `code`, the database's message
    // verbatim, and the typed detail — reason AND field — inside `details`. The walk drives a
    // liability leg the FORM admits (it is a real, active liability account) and the DOOR refuses,
    // which is the only way to exercise the server-refusal path at all.
    if (accrual.liability_account_code === "2050") {
      state.refusals += 1;
      sendJson(response, 400, {
        code: "CLR10",
        message: "accrual.liability_account_code names the payable control account; an accrual carries no identified open item",
        details: '{"reason":"accrual_account_relationship","field":"accrual.liability_account_code","constraint":"non_control_liability","account_code":"2050","account_class":"payable"}',
      }, cors);
      return true;
    }

    state.created = true;
    sendJson(response, 200, {
      accrual_id: ACC.createdAccrualId,
      plan_id: ACC.planId,
      revision_id: "65d1d1d1-6500-4650-8650-650650650650",
      revision: 1,
      kind: "reversing_journal",
      status: "active",
      // ALWAYS FALSE from this door, because accepting a configuration posts nothing.
      posted: false,
      configuration_receipt: { fn: "create_accrual_adjustment", op_key: body.p_op_key },
      occurrence: {
        admitted: true,
        occurrence_id: "65e1e1e1-6500-4650-8650-650650650650",
        work_id: ACC.workId,
        due_date: "2026-07-31",
        leg: "primary",
      },
      next_occurrences: [{ due_date: "2026-08-31", leg: "primary" }],
      overlap_warning: null,
    }, cors);
    return true;
  }

  // #936 — THE DEDICATED CORRECTION DOOR. Two stateful facts, mirroring create's own two: it
  // records every op key it was sent (the lost-response proof), and an already-corrected target
  // is refused BY NAME rather than silently accepted twice.
  if (verb === "correct_accrual_adjustment") {
    state.correctOpKeys.push(String(body.p_op_key ?? ""));
    const target = body.p_accrual_id;
    if (target === ACC.correctedAccrualId
        || (target === ACC.correctableAccrualId && state.corrected)) {
      sendJson(response, 400, {
        code: "CLR10",
        message: "this accrual has already been corrected; correct its successor instead",
        details: `{"reason":"accrual_already_corrected","corrected_by_accrual_id":"${
          target === ACC.correctedAccrualId ? ACC.correctedSuccessorId : ACC.correctableSuccessorId}"}`,
      }, cors);
      return true;
    }
    if (target !== ACC.correctableAccrualId) return false;
    // THE SAME server-refusal shape CREATE exercises, on the SAME liability leg — reached the
    // identical way: a leg the FORM admits and the DOOR refuses.
    const accrual = body.p_accrual ?? {};
    if (accrual.liability_account_code === "2050") {
      sendJson(response, 400, {
        code: "CLR10",
        message: "accrual.liability_account_code names the payable control account; an accrual carries no identified open item",
        details: '{"reason":"accrual_account_relationship","field":"accrual.liability_account_code","constraint":"non_control_liability","account_code":"2050","account_class":"payable"}',
      }, cors);
      return true;
    }
    state.corrected = true;
    sendJson(response, 200, {
      accrual_id: ACC.correctableSuccessorId,
      corrects_accrual_id: ACC.correctableAccrualId,
      plan_id: ACC.planId,
      revision_id: "65f1f1f1-6500-4650-8650-650650650650",
      revision: 2,
      superseded_revision: 1,
      status: "active",
      overlap_warning: null,
    }, cors);
    return true;
  }

  return false;
}
