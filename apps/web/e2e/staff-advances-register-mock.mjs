// #879's own mock lane — the staff-advances REGISTER (`/clients/:id/registers?tab=staffAdvances`),
// a file-disjoint sibling of `staff-expense-claim-mock.mjs`, consulted by `serve-built.mjs`
// through the ONE PostgREST hook this lane needs. There is no runtime hook: every write here is a
// plain governed `POST /rest/v1/rpc/<fn>` call, same as every other door in this app — unlike the
// staff-expense-claim journey, this register mints no Work and calls no `/api/work/...` route.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real same-origin
// PostgREST proxy and every line of client code under test are REAL. PostgREST behind it is
// FAKED. So this walk proves the register's JOURNEY — the tab renders, the four dialogs submit
// through `components/registers/staff-advances-register.tsx`'s hydrate-never-trust `act()`, the
// summary/tie/statement reads reflect a write after it settles — and it proves NOTHING about
// whether Postgres would accept an application, an enrolment or a retirement, or about
// `clara._adv_enrolment_admission`'s other three gates (bank binding / shared reservation / clean
// balance). `packages/db/tests/staff-advances*.test.mjs` (migration 0043) owns those.
//
// SCOPE. Every handler below names this lane's OWN client id (or an id/enrolment this module
// itself minted) and falls through otherwise. `staff-expense-claim-mock.mjs`'s own header records
// that it deliberately answers NEITHER `list_accounting_work` NOR `staff_advance_summary` — both
// are read by surfaces other lanes drive, leaving them for whichever lane owns the register they
// belong to. This is that lane: it owns `staff_advance_summary`, `staff_advance_tie`,
// `staff_advance_statement` and the `staff_advances`/`staff_advance_accounts` table reads,
// exclusively for its own `client_id`/`p_client`.

import { readCachedJson, matchVerb } from "./mock-dispatch.mjs";

export const SAR = {
  clientId: "87987987-8798-4879-8798-879879879879",
  clientName: "GEMILANG HARDWARE SDN BHD",
  // Already enrolled, with one outstanding advance the book/complete cells act on.
  enrolledAccount: "1190",
  enrolledPerson: "Aini binti Rahman",
  enrolmentId: "87987e01-8798-4879-8798-87987987e01a",
  advanceId: "87987a01-8798-4879-8798-87987987a01a",
  // NOT yet enrolled — the enrol dialog's one candidate. Zero advances ever issued on it, so it
  // is also safe to retire immediately after enrolling (no CLR10 advance_outstanding_on_retire).
  freshAccount: "1191",
  freshPerson: "Halim bin Yaacob",
  // A control-flavoured liability leg for the book-application entry's other line.
  wagesPayable: "2020",
  // fix-round SPEC-879-1 — a SECOND, distinct client with no enrolments and no advances at all,
  // for the empty first-use state the brief's "Desired behavior" names alongside enrolling,
  // booking, completing particulars and the statement panel: `staff-expense-claim-walk.spec.ts`'s
  // own "an EMPTY register is its own state, not a failure" cell is the house precedent. The mock
  // is already client-scoped (every handler falls through on any id it does not recognise), so a
  // second client id is the cheap way to get a genuinely empty read rather than mutating the
  // first client's own seeded state.
  emptyClientId: "87987987-8798-4879-8798-8798798700e0",
  emptyClientName: "SUNRISE CONSULTING SDN BHD",
};

const CLIENT = {
  id: SAR.clientId,
  name: SAR.clientName,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const EMPTY_CLIENT = {
  id: SAR.emptyClientId,
  name: SAR.emptyClientName,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
};

const ACCOUNTS = [
  { client_id: SAR.clientId, account_code: SAR.enrolledAccount, name: `Staff advance — ${SAR.enrolledPerson}`, account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { client_id: SAR.clientId, account_code: SAR.freshAccount, name: "Staff advance — unallocated", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { client_id: SAR.clientId, account_code: SAR.wagesPayable, name: "Wages Payable", account_type: "liability", account_class: null, special_acc_type: null, is_active: true },
];

const ISSUE_DATE = "2026-02-01";
const ADVANCE_AMOUNT_CENTS = 100_000; // RM 1,000.00

/** The lane's own mutable model — mutated only by this lane's own governed writes, read back by
 *  this lane's own reads. `enrolments` starts with the one pre-seeded row; enrol/retire push and
 *  patch it. `appliedCents`/`purpose`/`reference` model the one advance's own progress. */
const state = {
  enrolments: [
    {
      id: SAR.enrolmentId,
      client_id: SAR.clientId,
      account_code: SAR.enrolledAccount,
      person_label: SAR.enrolledPerson,
      enrolment_attestation: "Sole account holder; not a related-party balance.",
      active: true,
      enrolled_at: "2026-01-15T00:00:00.000Z",
      retired_by: null,
      retired_at: null,
      retired_reason: null,
    },
  ],
  appliedCents: 0,
  purpose: null,
  reference: null,
  applications: [], // { postingDate, kind, reason, entryId, allocatedCents }
  nextMintedId: 1,
};

function mint(prefix) {
  const n = state.nextMintedId;
  state.nextMintedId += 1;
  return `87987${prefix}-8798-4879-8798-${String(n).padStart(12, "0")}`;
}

function outstandingCents() {
  return ADVANCE_AMOUNT_CENTS - state.appliedCents;
}

// fix-round STD-879-2 — this lane's own owned RPC verbs, checked BEFORE the body is ever read
// (`matchVerb`/`readCachedJson`'s own house pattern, mock-dispatch.mjs's header: "call this
// BEFORE readCachedJson, so a verb this lane does not own returns false without the stream ever
// being touched"). A per-client `p_client` check still has to read the body first — the client
// id IS a field of the body — but a verb this lane does not own at all is now rejected before
// any read is attempted, not merely before this lane ACTS on what it read.
const OWNED_RPC_VERBS = new Set([
  "staff_advance_summary",
  "staff_advance_tie",
  "staff_advance_statement",
  "book_staff_advance_application",
  "complete_staff_advance_particulars",
  "enrol_staff_advance_account",
  "retire_staff_advance_account",
]);

export async function handleStaffAdvancesRegisterSupabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");
  const clientFilter = url.searchParams.get("client_id");

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const id = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    if (id === SAR.emptyClientId) { sendJson(response, 200, [EMPTY_CLIENT], cors); return true; }
    if (id !== SAR.clientId) return false;
    sendJson(response, 200, [CLIENT], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/coa_accounts") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    // The empty client has a chart too (an enrol dialog with nothing to offer would be its own,
    // different defect) — it simply has never enrolled or advanced against any of it.
    if (client === SAR.emptyClientId) { sendJson(response, 200, [], cors); return true; }
    if (client !== SAR.clientId) return false;
    sendJson(response, 200, ACCOUNTS, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/staff_advance_accounts") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client === SAR.emptyClientId) { sendJson(response, 200, [], cors); return true; }
    if (client !== SAR.clientId) return false;
    sendJson(response, 200, state.enrolments, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/staff_advances") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client === SAR.emptyClientId) { sendJson(response, 200, [], cors); return true; }
    if (client !== SAR.clientId) return false;
    sendJson(response, 200, [
      {
        id: SAR.advanceId,
        client_id: SAR.clientId,
        enrolment_id: SAR.enrolmentId,
        account_code: SAR.enrolledAccount,
        issue_date: ISSUE_DATE,
        amount_cents: ADVANCE_AMOUNT_CENTS,
        purpose: state.purpose,
        reference: state.reference,
        voided_by_entry_id: null,
        void_effective_date: null,
      },
    ], cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!matchVerb(OWNED_RPC_VERBS, verb)) return false;

  if (verb === "staff_advance_summary") {
    const body = await readCachedJson(request);
    if (body?.p_client === SAR.emptyClientId) {
      sendJson(response, 200, {
        client_id: SAR.emptyClientId,
        as_of: typeof body?.p_as_of === "string" ? body.p_as_of : ISSUE_DATE,
        advances: [],
        outstanding_cents: 0,
        incomplete_count: 0,
        policy_notes: [],
      }, cors);
      return true;
    }
    if (body?.p_client !== SAR.clientId) return false;
    const particularsComplete = state.purpose !== null && state.reference !== null;
    sendJson(response, 200, {
      client_id: SAR.clientId,
      as_of: typeof body?.p_as_of === "string" ? body.p_as_of : ISSUE_DATE,
      advances: [
        {
          enrolment_id: SAR.enrolmentId,
          account_code: SAR.enrolledAccount,
          person_label: SAR.enrolledPerson,
          advance_id: SAR.advanceId,
          issue_date: ISSUE_DATE,
          amount_cents: ADVANCE_AMOUNT_CENTS,
          outstanding_cents: outstandingCents(),
          days_outstanding: 30,
          purpose: state.purpose,
          reference: state.reference,
          voided: false,
          particulars_complete: particularsComplete,
          enrolment_active: true,
        },
      ],
      outstanding_cents: outstandingCents(),
      incomplete_count: particularsComplete ? 0 : 1,
      policy_notes: [],
    }, cors);
    return true;
  }

  if (verb === "staff_advance_tie") {
    const body = await readCachedJson(request);
    if (body?.p_client === SAR.emptyClientId) {
      sendJson(response, 200, {
        client_id: SAR.emptyClientId,
        as_of: typeof body?.p_as_of === "string" ? body.p_as_of : ISSUE_DATE,
        tie: true,
        accounts: [],
      }, cors);
      return true;
    }
    if (body?.p_client !== SAR.clientId) return false;
    sendJson(response, 200, {
      client_id: SAR.clientId,
      as_of: typeof body?.p_as_of === "string" ? body.p_as_of : ISSUE_DATE,
      tie: true,
      accounts: [
        {
          account_code: SAR.enrolledAccount,
          register_cents: outstandingCents(),
          gl_cents: outstandingCents(),
          difference_cents: 0,
          out_of_window_cents: 0,
          explained: true,
          advance_count: 1,
          incomplete_count: state.purpose === null ? 1 : 0,
          active_enrolment_id: SAR.enrolmentId,
        },
      ],
    }, cors);
    return true;
  }

  if (verb === "staff_advance_statement") {
    const body = await readCachedJson(request);
    if (body?.p_client !== SAR.clientId) return false;
    const accountCode = body?.p_account_code;

    if (accountCode === SAR.enrolledAccount) {
      const rows = [
        {
          date: ISSUE_DATE,
          kind: "disbursement",
          entry_id: null,
          advance_id: SAR.advanceId,
          amount_cents: ADVANCE_AMOUNT_CENTS,
          running_cents: ADVANCE_AMOUNT_CENTS,
          application_kind: null,
          reason: null,
        },
        ...state.applications.map((a) => ({
          date: a.postingDate,
          kind: "application",
          entry_id: a.entryId,
          advance_id: SAR.advanceId,
          amount_cents: -a.allocatedCents,
          running_cents: ADVANCE_AMOUNT_CENTS - a.allocatedCents,
          application_kind: a.kind,
          reason: a.reason,
        })),
      ];
      sendJson(response, 200, {
        client_id: SAR.clientId,
        account_code: accountCode,
        from: null,
        to: typeof body?.p_to === "string" ? body.p_to : ISSUE_DATE,
        opening_cents: 0,
        closing_cents: outstandingCents(),
        rows,
        generations: [
          {
            enrolment_id: SAR.enrolmentId,
            person_label: SAR.enrolledPerson,
            enrolled_at: "2026-01-15T00:00:00.000Z",
            retired_at: null,
            active: true,
            attestation: "Sole account holder; not a related-party balance.",
          },
        ],
      }, cors);
      return true;
    }

    if (accountCode === SAR.freshAccount) {
      const fresh = state.enrolments.find((e) => e.account_code === SAR.freshAccount) ?? null;
      sendJson(response, 200, {
        client_id: SAR.clientId,
        account_code: accountCode,
        from: null,
        to: typeof body?.p_to === "string" ? body.p_to : ISSUE_DATE,
        opening_cents: 0,
        closing_cents: 0,
        rows: [],
        generations: fresh
          ? [{
              enrolment_id: fresh.id,
              person_label: fresh.person_label,
              enrolled_at: fresh.enrolled_at,
              retired_at: fresh.retired_at,
              active: fresh.active,
              attestation: fresh.enrolment_attestation,
            }]
          : [],
      }, cors);
      return true;
    }
    return false;
  }

  if (verb === "book_staff_advance_application") {
    const body = await readCachedJson(request);
    if (body?.p_client !== SAR.clientId) return false;
    const allocations = Array.isArray(body?.p_allocations) ? body.p_allocations : [];
    const allocatedCents = allocations
      .filter((a) => a?.advance_id === SAR.advanceId)
      .reduce((sum, a) => sum + (Number(a?.amount_cents) || 0), 0);
    const entryId = mint("e");
    state.appliedCents += allocatedCents;
    state.applications.push({
      postingDate: typeof body?.p_posting_date === "string" ? body.p_posting_date : ISSUE_DATE,
      kind: typeof body?.p_kind === "string" ? body.p_kind : "payroll_deduction",
      reason: typeof body?.p_reason === "string" ? body.p_reason : null,
      entryId,
      allocatedCents,
    });
    sendJson(response, 200, {
      status: "posted",
      entry_id: entryId,
      application_ids: [mint("a")],
      allocated_cents: allocatedCents,
    }, cors);
    return true;
  }

  if (verb === "complete_staff_advance_particulars") {
    const body = await readCachedJson(request);
    if (body?.p_client !== SAR.clientId) return false;
    if (body?.p_advance !== SAR.advanceId) return false;
    state.purpose = typeof body?.p_purpose === "string" ? body.p_purpose : "";
    state.reference = typeof body?.p_reference === "string" ? body.p_reference : "";
    sendJson(response, 200, { advance_id: SAR.advanceId, purpose: state.purpose, reference: state.reference }, cors);
    return true;
  }

  if (verb === "enrol_staff_advance_account") {
    const body = await readCachedJson(request);
    if (body?.p_client !== SAR.clientId) return false;
    if (body?.p_account_code !== SAR.freshAccount) return false;
    // fix-round ADV-10 — IDEMPOTENT PER ACCOUNT CODE: `playwright.config.ts`'s `retries: 0` means
    // this is not reachable today, but the enrol handler pushed a NEW row unconditionally, so a
    // retried cell 2 (under a config this file does not own) would enrol 1191 a second time —
    // two active rows the row-filter locator in the walk spec would then match, a strict-mode
    // violation masking whatever the retry was actually diagnosing. A second call with the same
    // account code, still active, now returns the EXISTING enrolment rather than minting another.
    const existing = state.enrolments.find((e) => e.account_code === SAR.freshAccount && e.active);
    if (existing) {
      sendJson(response, 200, {
        enrolment_id: existing.id,
        status: "active",
        client_id: SAR.clientId,
        account_code: existing.account_code,
        person_label: existing.person_label,
      }, cors);
      return true;
    }
    const enrolmentId = mint("n");
    state.enrolments.push({
      id: enrolmentId,
      client_id: SAR.clientId,
      account_code: SAR.freshAccount,
      person_label: typeof body?.p_person_label === "string" ? body.p_person_label : SAR.freshPerson,
      enrolment_attestation: typeof body?.p_attestation === "string" ? body.p_attestation : "",
      active: true,
      enrolled_at: "2026-03-01T00:00:00.000Z",
      retired_by: null,
      retired_at: null,
      retired_reason: null,
    });
    sendJson(response, 200, {
      enrolment_id: enrolmentId,
      status: "active",
      client_id: SAR.clientId,
      account_code: SAR.freshAccount,
      person_label: typeof body?.p_person_label === "string" ? body.p_person_label : SAR.freshPerson,
    }, cors);
    return true;
  }

  if (verb === "retire_staff_advance_account") {
    const body = await readCachedJson(request);
    if (body?.p_client !== SAR.clientId) return false;
    const row = state.enrolments.find((e) => e.id === body?.p_enrolment) ?? null;
    if (row === null) return false;
    row.active = false;
    row.retired_at = "2026-03-01T01:00:00.000Z";
    row.retired_reason = typeof body?.p_reason === "string" ? body.p_reason : null;
    sendJson(response, 200, {
      enrolment_id: row.id,
      status: "retired",
      client_id: SAR.clientId,
      account_code: row.account_code,
    }, cors);
    return true;
  }

  return false;
}
