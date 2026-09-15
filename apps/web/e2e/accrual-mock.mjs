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
// THE FIXTURE IS STATEFUL IN EXACTLY TWO WAYS, and both are the walk's own journeys:
//
//   1. `create_accrual_adjustment` APPENDS to the list and REFUSES a set of particulars that names
//      no service period — so the walk's create cell is a real transition (submit → the surface
//      re-reads → the new row is there) rather than two canned lists.
//   2. It records every op key it was sent, so the walk can prove that a resubmit of the SAME
//      decision carries the SAME key. That is the whole of the lost-response story and no canned
//      answer can show it.

export const ACC = {
  firmId: "65065065-6500-4650-8650-650650650650",
  clientId: "65c0c0c0-6500-4650-8650-650650650650",
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
};

/** The ONLY RPC verbs this lane's dispatch chain recognises — the allow-list `readJson`'s own call
 *  site guards on, so a verb this lane does not own never has its request stream drained (the #632
 *  finding-10 root cause, stated in full in `bank-close-registers-mock.mjs`).
 *
 *  `list_spoken_for_documents` IS SHARED with `periodic-adjustment-mock.mjs` and is declared as
 *  such in `e2e-fixture-ownership.test.ts`: both lanes mount the SAME `EvidenceChooser`, which
 *  makes the same advisory read. Both scope it by their own `p_client` and fall through otherwise,
 *  so the two can never answer for each other. */
export const ACCRUAL_RPC_VERBS = new Set([
  "list_accrual_adjustments",
  "get_accrual_adjustment",
  "create_accrual_adjustment",
  "list_spoken_for_documents",
]);

const state = { created: false, opKeys: [], refusals: 0 };

export function resetAccruals() {
  state.created = false;
  state.opKeys = [];
  state.refusals = 0;
}

/** Every op key `create_accrual_adjustment` was sent, oldest first — the walk's lost-response cell
 *  asserts that a resubmit of the same decision repeats the key rather than minting a second. */
export function accrualOpKeys() {
  return [...state.opKeys];
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
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
  { client_id: ACC.clientId, account_code: "1150", name: "Maybank current", account_type: "asset", is_active: true },
];

/** The authority picker's rows — `clara.accounting_work` of THIS client, which is what
 *  `listAuthorityCandidates` reads and what `clara.create_accrual_adjustment` resolves. */
const AUTHORITY_WORK = [
  {
    id: ACC.authorityWorkId,
    intent_key: "instruction-2026-06-30",
    created_at: "2026-06-30T02:00:00.000Z",
    basis: { memo: "Standing instruction: accrue the monthly office rent" },
  },
];

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
  effective_from: "2026-06-30",
  effective_to: null,
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
  service_period_start: "2026-07-01",
  service_period_end: "2026-09-30",
  method: { rule: "stated_period_amount" },
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

const LIST = () => (state.created ? [CREATED, UNPOSTED, POSTED] : [UNPOSTED, POSTED]);

const OCCURRENCES = (accrualId) => {
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
  // THE ORPHAN WALL AS HISTORY: a reversal due event that was REACHED and REFUSED because its own
  // accrual has posted nothing. `primary_state` says WHICH of the three ways it fails to stand
  // behind it, which is the fact a reader of an accrual most needs.
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
};

const DETAIL = (accrualId) => {
  const row = accrualId === ACC.accrualId ? POSTED : accrualId === ACC.unpostedAccrualId ? UNPOSTED : CREATED;
  const occurrences = OCCURRENCES(accrualId);
  return {
    ...row,
    client_id: ACC.clientId,
    authority_kind: "explicit_instruction",
    authority_ref: { kind: "accounting_work", id: ACC.authorityWorkId },
    instruction: "The client's standing instruction of 2026-06-30, minuted by the engagement partner.",
    corrects_accrual_id: null,
    corrected_by_accrual_id: null,
    plan: { ...PLAN(), purpose: row.purpose },
    occurrences,
    reversal: occurrences.find((o) => o.leg === "reversal") ?? null,
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
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    if (clientFilter !== `eq.${ACC.clientId}`) return false;
    sendJson(response, 200, ACCOUNTS, cors);
    return true;
  }

  // The authority picker's own read — `clara.accounting_work` of this client. Scoped by
  // `client_id` and falls through otherwise, so the Work-list lane's own rows are untouched.
  if (request.method === "GET" && path === "/rest/v1/accounting_work") {
    if (clientFilter !== `eq.${ACC.clientId}`) return false;
    sendJson(response, 200, AUTHORITY_WORK, cors);
    return true;
  }

  // The evidence chooser's filings read. This fixture files NO document, which is the honest state
  // of a client whose accrual rests on a standing instruction rather than an invoice — and it is
  // the state the walk's create cell runs in.
  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    if (clientFilter !== `eq.${ACC.clientId}`) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!ACCRUAL_RPC_VERBS.has(verb)) return false;
  const body = await readJson(request);

  if (verb === "list_spoken_for_documents") {
    if (body.p_client !== ACC.clientId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (verb === "list_accrual_adjustments") {
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
    const known = [ACC.accrualId, ACC.unpostedAccrualId]
      .concat(state.created ? [ACC.createdAccrualId] : []);
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
    if (accrual.liability_account_code === "1150") {
      state.refusals += 1;
      sendJson(response, 400, {
        code: "CLR10",
        message: "accrual.liability_account_code must name a liability account; 1150 is a asset",
        details: '{"reason":"accrual_account_relationship","field":"accrual.liability_account_code","constraint":"liability_account","account_code":"1150"}',
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

  return false;
}
