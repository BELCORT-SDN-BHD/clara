// #949's mock lane — the Documents detail's FACTS view with a TENANCY's own panel, on the BUILT
// app.
//
// A FILE-DISJOINT SIBLING of `documents-viewer-mock.mjs`, with its OWN client and its OWN
// document-id prefix (`7e4a4c47-`), so neither lane can starve the other's fixtures in either
// direction. Every branch below is scoped to this lane's own ids and falls through otherwise,
// which is the rule `e2e-fixture-ownership.test.ts` exists to keep.
//
// WHAT IS REAL AND WHAT IS FAKE: the browser, the built Next bundle and every line of client code
// are REAL — the document detail's whole read set, the tab routing, the tenancy panel's two
// reads, the Confirm button, the door call and the refusal renderer. PostgREST is this mock. So
// this leg proves the JOURNEY — a person opens a tenancy, sees the terms with the regions they
// were read from, reads what the standard says, and confirms the plan — and nothing at all about
// whether Postgres would give those answers. The lessee branch, the append-only record, the plan
// the confirmation authorises and the bank-credit refusal are exercised for real against real
// Postgres in `packages/db/tests/tenancy-rent-plan.test.mjs`.

import { matchVerb, readCachedJson as readJson } from "./mock-dispatch.mjs";

export const P949 = {
  clientId: "7e4a4c47-0001-4001-8001-000000000001",
  // The TENANCY. Its own id prefix scopes every handler in this file.
  documentId: "7e4a4c47-d0c0-4d0c-8d0c-000000000010",
  filingId: "7e4a4c47-f111-4f11-8f11-000000000011",
  extractionId: "7e4a4c47-e0e0-4e0e-8e0e-000000000012",
  regionRent: "7e4a4c47-4e61-4e61-8e61-000000000020",
  regionDeposit: "7e4a4c47-4e61-4e61-8e61-000000000021",
  regionDate: "7e4a4c47-4e61-4e61-8e61-000000000022",
  regionMonths: "7e4a4c47-4e61-4e61-8e61-000000000023",
  planId: "7e4a4c47-b1a0-4b1a-8b1a-000000000030",
  confirmationId: "7e4a4c47-c0f1-4c0f-8c0f-000000000031",
  // A SECOND tenancy whose confirmation ALWAYS refuses — a payable that is really a bank account.
  // A fixed, stateless fixture rather than a mutable "already refused" flag (#947's discipline),
  // so both scenarios are order-independent inside one shared mock server.
  refusedDocumentId: "7e4a4c47-d0c0-4d0c-8d0c-000000000040",
  refusedFilingId: "7e4a4c47-f111-4f11-8f11-000000000041",
  refusalBankCredit:
    "a rent plan may not credit 1010 -- it is one of this client's own bank accounts, and a plan "
    + "that pays itself out of the bank double-counts the statement line that pays it",
};

const LANE_PREFIX = "7e4a4c47-";

export const P949_RPC_VERBS = new Set([
  "get_contract_terms",
  "get_tenancy_rent_plan_draft",
  "confirm_tenancy_rent_plan",
  // The document detail's OWN two reads, answered here because this lane owns these documents
  // and an unanswered read paints a standing failure banner over the panel under test. Both are
  // empty, honest shapes -- this walk is not about the revision lane.
  "list_source_revisions",
  "list_source_dependents",
]);

const state = { confirmCalls: [] };

export function resetP949() {
  state.confirmCalls = [];
}

export function p949ConfirmCalls() {
  return state.confirmCalls;
}

const DOC_ROWS = {
  [P949.documentId]: {
    id: P949.documentId, firm_id: "7e4a4c47-f14e-4f14-8f14-000000000002",
    original_filename: "tenancy-agreement-pju1-45.pdf", mime_type: "application/pdf",
    byte_size: 184_320, status: "stored", page_count: 6, extraction_status: "done",
    document_kind: "agreement_contract", financial_date: "2026-01-05",
    retention_state: "active", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null, created_at: "2026-01-06T02:00:00.000Z",
  },
  [P949.refusedDocumentId]: {
    id: P949.refusedDocumentId, firm_id: "7e4a4c47-f14e-4f14-8f14-000000000002",
    original_filename: "tenancy-agreement-second-shoplot.pdf", mime_type: "application/pdf",
    byte_size: 171_008, status: "stored", page_count: 5, extraction_status: "done",
    document_kind: "agreement_contract", financial_date: "2026-01-05",
    retention_state: "active", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null, created_at: "2026-01-06T02:05:00.000Z",
  },
};

const FILINGS = [
  {
    id: P949.filingId, document_id: P949.documentId, client_id: P949.clientId,
    filed_at: "2026-01-06T02:01:00.000Z", filed_by: "11111111-1111-1111-1111-111111111111",
    resolution_id: null, basis: "filed by the preparer", retired_at: null, retired_by: null,
    retirement_reason: null, correction_id: null,
  },
  {
    id: P949.refusedFilingId, document_id: P949.refusedDocumentId, client_id: P949.clientId,
    filed_at: "2026-01-06T02:06:00.000Z", filed_by: "11111111-1111-1111-1111-111111111111",
    resolution_id: null, basis: "filed by the preparer", retired_at: null, retired_by: null,
    retirement_reason: null, correction_id: null,
  },
];

/** The four typed-fact regions #948's lane banks for a tenancy, and the ONE the panel cites for
 *  the rent. They exist here so the FACTS table above the panel is not empty on the walk — a
 *  panel about provenance sitting over a table with no rows would be a face nobody ever sees. */
const REGIONS = [
  { id: P949.regionRent, extraction_id: P949.extractionId, field_path: "contract.agreement.instalment_amount",
    text_content: "3,600.00", engine_confidence: 0.98, monetary_raw: "3,600.00", monetary_cents: 360000 },
  { id: P949.regionDeposit, extraction_id: P949.extractionId, field_path: "contract.agreement.deposit",
    text_content: "7,200.00", engine_confidence: 0.97, monetary_raw: "7,200.00", monetary_cents: 720000 },
  { id: P949.regionDate, extraction_id: P949.extractionId, field_path: "contract.agreement.agreement_date",
    text_content: "2026-01-05", engine_confidence: 0.99, monetary_raw: null, monetary_cents: null },
  { id: P949.regionMonths, extraction_id: P949.extractionId, field_path: "contract.agreement.term_months",
    text_content: "24", engine_confidence: 0.99, monetary_raw: null, monetary_cents: null },
];

const TERMS = () => ({
  document_id: P949.documentId, client_id: P949.clientId, agreement_class: "tenancy",
  terms: [
    { id: "7e4a4c47-7e11-4711-8711-000000000050", term_key: "monthly_rent", amount_cents: 360000,
      term_date: null, escalation: null, printed_raw: "3,600.00",
      source_extraction_id: P949.extractionId, source_region_ids: [P949.regionRent],
      basis_kind: "document_region", basis: "the monthly rent this tenancy prints, read by the contract lane",
      superseded_at: null, supersede_reason: null },
    { id: "7e4a4c47-7e11-4711-8711-000000000051", term_key: "deposit", amount_cents: 720000,
      term_date: null, escalation: null, printed_raw: "7,200.00",
      source_extraction_id: P949.extractionId, source_region_ids: [P949.regionDeposit],
      basis_kind: "document_region", basis: "the deposit this tenancy states; signing does not say the money moved",
      superseded_at: null, supersede_reason: null },
    { id: "7e4a4c47-7e11-4711-8711-000000000052", term_key: "term_start", amount_cents: null,
      term_date: "2026-01-05", escalation: null, printed_raw: "2026-01-05",
      source_extraction_id: P949.extractionId, source_region_ids: [P949.regionDate],
      basis_kind: "derived_from_regions", basis: "the day the agreement was signed; correct it where the tenancy commences later",
      superseded_at: null, supersede_reason: null },
    { id: "7e4a4c47-7e11-4711-8711-000000000053", term_key: "term_end", amount_cents: null,
      term_date: "2028-01-04", escalation: null, printed_raw: "24",
      source_extraction_id: P949.extractionId, source_region_ids: [P949.regionDate, P949.regionMonths],
      basis_kind: "derived_from_regions", basis: "24 months from the first day, the last day included",
      superseded_at: null, supersede_reason: null },
  ],
  history: [],
});

const DRAFT = (documentId) => ({
  document_id: documentId, client_id: P949.clientId, agreement_class: "tenancy",
  treatment: {
    treatment_version: "v1", drafts: true, framework_code: "MPERS",
    framework_in_force: "client_exception", framework_record_id: null,
    monthly_rent_cents: 360000, term_start: "2026-01-05", term_end: "2028-01-04",
    term_months: 24, escalation: null, missing_terms: [], standard: "MPERS Section 20",
    basis: "MPERS Section 20: a lessee expenses operating-lease payments on a straight-line basis "
      + "over the lease term, so with LEVEL rent the straight line is the monthly rent. MFRS 16: a "
      + "lessee recognises a right-of-use asset and a lease liability for a lease over 12 months.",
    reason: null, question: null,
  },
  plan: {
    kind: "recurring_journal", purpose: "Monthly rent -- Ground-floor shoplot, No 12 Jalan PJU 1/45",
    frequency: "monthly", day_rule: "day_of_month", day_of_month: 5,
    timezone: "Asia/Kuala_Lumpur", effective_from: "2026-01-05", effective_to: "2028-01-04",
    occurrences: 24,
    rent_account_code: "6100", rent_account_name: "Rental of Premises",
    payable_account_code: "2050", payable_account_name: "Rent Payable",
    monthly_rent_cents: 360000,
    basis: {
      posting_date: "2026-01-05", memo: "Monthly rent", currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 360000, credit_cents: 0, description: "Monthly rent" },
        { account_code: "2050", debit_cents: 0, credit_cents: 360000, description: "Monthly rent" },
      ],
    },
  },
  refusals: [], confirmed: false, plan_id: null, plan_status: null, inert: true,
});

function json(sendJson, response, body, cors) {
  sendJson(response, 200, body, cors);
  return true;
}

function eqParam(url, key) {
  const raw = url.searchParams.get(key);
  return raw?.startsWith("eq.") ? raw.slice(3) : null;
}

function inParam(url, key) {
  const raw = url.searchParams.get(key);
  if (!raw?.startsWith("in.(")) return null;
  return raw.slice(4, -1).split(",").map((v) => decodeURIComponent(v.trim()));
}

/** The PostgREST half. Returns true when it answered, false to fall through. */
export async function handleP949Supabase(request, response, path, url, sendJson, cors) {
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (eqParam(url, "id") !== P949.clientId) return false;
    return json(sendJson, response, [{
      id: P949.clientId, name: "Tenancy Fixture Sdn Bhd", status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    const ids = inParam(url, "document_id");
    if (ids !== null) {
      const mine = ids.filter((id) => id.startsWith(LANE_PREFIX));
      if (mine.length === 0) return false;
      return json(sendJson, response, FILINGS.filter((f) => mine.includes(f.document_id)), cors);
    }
    const client = eqParam(url, "client_id");
    const document = eqParam(url, "document_id");
    if (client === P949.clientId) return json(sendJson, response, FILINGS, cors);
    if (document !== null && document.startsWith(LANE_PREFIX)) {
      return json(sendJson, response, FILINGS.filter((f) => f.document_id === document), cors);
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/documents") {
    const ids = inParam(url, "id");
    if (!ids || ids.length === 0) return false;
    if (!ids.every((id) => id.startsWith(LANE_PREFIX))) return false;
    return json(sendJson, response, ids.map((id) => DOC_ROWS[id]).filter(Boolean), cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_extractions") {
    const document = eqParam(url, "document_id");
    if (document === null || !document.startsWith(LANE_PREFIX)) return false;
    if (document !== P949.documentId) return json(sendJson, response, [], cors);
    return json(sendJson, response, [{
      id: P949.extractionId, document_id: P949.documentId,
      engine_id: "llm-openai:gpt-5.6-terra:agreement-witness-v1",
      engine_kind: "agreement_text_facts", version_n: 1, superseded_by: null,
      status: "done", page_count: 6, extracted_at: "2026-01-06T02:02:00.000Z",
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_regions") {
    const ids = inParam(url, "extraction_id");
    if (!ids?.includes(P949.extractionId)) return false;
    return json(sendJson, response, REGIONS, cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_processing_tasks_visible") {
    const document = eqParam(url, "document_id");
    if (document === null || !document.startsWith(LANE_PREFIX)) return false;
    return json(sendJson, response, [], cors);
  }

  for (const relation of ["journal_entries", "coding_tasks_visible", "lint_findings",
                          "attribution_candidates"]) {
    if (request.method === "GET" && path === `/rest/v1/${relation}`) {
      if (eqParam(url, "client_id") !== P949.clientId) return false;
      return json(sendJson, response, [], cors);
    }
  }

  if (request.method === "POST" && path.startsWith("/rest/v1/rpc/")) {
    const verb = path.slice("/rest/v1/rpc/".length);
    // THE BODY IS READ ONLY INSIDE A MATCHED VERB, never in this prelude: a stream this lane
    // drains for a verb it does not own resolves to `{}` for every later lane in the chain
    // (mock-dispatch.mjs's own header).
    if (!matchVerb(P949_RPC_VERBS, verb)) return false;
    const body = await readJson(request);

    if (verb === "list_source_revisions") {
      if (typeof body.p_document !== "string" || !body.p_document.startsWith(LANE_PREFIX)) return false;
      return json(sendJson, response, {
        document_id: body.p_document, document_kind: "agreement_contract",
        facts_version: 1, authoritative_extraction_id: null,
        current_facts_extraction_id: P949.extractionId, lineage: [],
      }, cors);
    }

    if (verb === "list_source_dependents") {
      if (typeof body.p_document !== "string" || !body.p_document.startsWith(LANE_PREFIX)) return false;
      return json(sendJson, response, {
        document_id: body.p_document, current_facts_extraction_id: P949.extractionId,
        facts_version: 1, knowledge_records: [], open_questions: [], work_questions: [],
      }, cors);
    }

    if (verb === "get_contract_terms") {
      if (typeof body.p_document !== "string" || !body.p_document.startsWith(LANE_PREFIX)) return false;
      return json(sendJson, response, TERMS(), cors);
    }

    if (verb === "get_tenancy_rent_plan_draft") {
      if (typeof body.p_document !== "string" || !body.p_document.startsWith(LANE_PREFIX)) return false;
      return json(sendJson, response, DRAFT(body.p_document), cors);
    }

    if (verb === "confirm_tenancy_rent_plan") {
      if (body.p_client !== P949.clientId) return false;
      state.confirmCalls.push(body);
      if (body.p_document === P949.refusedDocumentId) {
        sendJson(response, 400, {
          code: "CLR10",
          message: P949.refusalBankCredit,
          details: '{"reason":"plan_credits_bank_account","account_code":"1010","account_name":"Maybank current"}',
        }, cors);
        return true;
      }
      return json(sendJson, response, {
        document_id: body.p_document, client_id: P949.clientId,
        confirmation_id: P949.confirmationId, plan_id: P949.planId,
        revision_id: "7e4a4c47-4e71-4e71-8e71-000000000032", status: "active",
        occurrences: 24, next_occurrences: [], overlap_warning: null,
        treatment: DRAFT(P949.documentId).treatment, professional_judgement: null,
      }, cors);
    }
  }

  return false;
}
