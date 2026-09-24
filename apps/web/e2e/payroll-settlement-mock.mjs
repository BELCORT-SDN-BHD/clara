// #947's mock lane — the /bank Matching tab's PayrollSettlementsSection, on the BUILT app.
//
// Reuses #657's own client (`P657.clientId`, `bank-match-mock.mjs`) rather than minting a second
// full bank fixture (accounts, statements, unmatched lines): the payroll panel mounts on the SAME
// page as the ordinary matcher, and a real client would see both on one screen. This lane answers
// only the TWO verbs #657's own allow-list does not know — `get_payroll_settlement_candidates`
// and `settle_payroll_net_pay` — so it is dispatched beside `handleP657Supabase` and never
// collides with it (mock-dispatch.mjs's `matchVerb` guard on THAT lane's own five-verb list
// already falls through for these two, body intact).
//
// WHAT IS REAL AND WHAT IS FAKE: the browser, the built Next bundle and every line of client code
// are REAL — the read, the Accept button, the door call, the refusal renderer, the unconditional
// reload after every act. PostgREST is this mock. `clara._payroll_net_pay_unsettled`'s FIFO
// arithmetic and `clara.settle_payroll_net_pay`'s reuse of `clara._match_bank_line_core` are
// exercised for real in `packages/db/tests/payroll-settlement.test.mjs`, not here.

import { P657 } from "./bank-match-mock.mjs";
import { matchVerb, readCachedJson as readJson } from "./mock-dispatch.mjs";

export const P947 = {
  clientId: P657.clientId,
  // RUN A — the happy path: one exact candidate, and accepting it succeeds.
  entryId: "94701001-9470-4947-8947-947000000010",
  documentId: "94701002-9470-4947-8947-947000000011",
  filingId: "94701003-9470-4947-8947-947000000012",
  lineId: "94702001-9470-4947-8947-947000000020",
  matchId: "94703001-9470-4947-8947-947000000030",
  // RUN B — a SECOND run whose one candidate ALWAYS refuses (amount_mismatch): another accept
  // claimed the line a moment before this one reached the door. A fixed, stateless fixture
  // (the #657 discipline this file's header names) rather than a mutable "already spent" flag,
  // so both scenarios are order-independent within one shared mock server.
  refusedEntryId: "94706001-9470-4947-8947-947000000060",
  refusedLineId: "94706002-9470-4947-8947-947000000061",
  refusalAmountMismatch: "statement line 94706002 (100 cents) does not match this run's unsettled net pay (300000 cents)",
};

export const P947_RPC_VERBS = new Set([
  "get_payroll_settlement_candidates",
  "settle_payroll_net_pay",
]);

/** STATELESS about what has been settled, same discipline and the same reason as #657's own
 *  neighbour lane (this file's header): one shared server answers the WHOLE suite, so a
 *  module-level "already settled" flag would leak from whichever spec ran first into every
 *  later one, and Playwright's own worker/ordering guarantees do not rule that out. The read
 *  always offers the SAME run; the derived-row disappearance once a settlement really lands is
 *  proved where the derivation lives, against real Postgres
 *  (`packages/db/tests/payroll-settlement.test.mjs` S4) — this lane proves the JOURNEY: the
 *  candidate is found and the door is called with the right ids. The op keys ARE recorded,
 *  because a replay/identity assertion is about what reached the door. */
const state = { settleCalls: [] };

export function resetP947() {
  state.settleCalls = [];
}

export function p947SettleCalls() {
  return state.settleCalls;
}

const RUNS = () => [
  {
    entry_id: P947.entryId,
    document_id: P947.documentId,
    filing_id: P947.filingId,
    posting_date: "2026-08-31",
    period_month: "2026-08-01",
    net_pay_cents: 425_570,
    unsettled_cents: 425_570,
    candidates: [
      {
        line_id: P947.lineId,
        statement_id: "94704001-9470-4947-8947-947000000040",
        bank_account_id: "94705001-9470-4947-8947-947000000050",
        bank_account_display: "Maybank 514420657001",
        entry_date: "2026-09-02",
        value_date: "2026-09-02",
        description: "SALARY GIRO AUG26",
        amount_cents: -425_570,
        date_delta_days: 2,
        class_hint: "payroll",
      },
    ],
  },
  {
    entry_id: P947.refusedEntryId,
    document_id: "94706003-9470-4947-8947-947000000062",
    filing_id: "94706004-9470-4947-8947-947000000063",
    posting_date: "2026-07-31",
    period_month: "2026-07-01",
    net_pay_cents: 300_000,
    unsettled_cents: 300_000,
    candidates: [
      {
        line_id: P947.refusedLineId,
        statement_id: "94706005-9470-4947-8947-947000000064",
        bank_account_id: "94705001-9470-4947-8947-947000000050",
        bank_account_display: "Maybank 514420657001",
        entry_date: "2026-08-05",
        value_date: "2026-08-05",
        description: "PAYROLL JUL26",
        amount_cents: -300_000,
        date_delta_days: 5,
        class_hint: "payroll",
      },
    ],
  },
];

/** The PostgREST half. Returns true when it answered, false to fall through. */
export async function handleP947Supabase(request, response, path, url, sendJson, cors) {
  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!matchVerb(P947_RPC_VERBS, verb)) return false;
  const body = await readJson(request);

  if (verb === "get_payroll_settlement_candidates") {
    if (body.p_client !== P947.clientId) return false;
    sendJson(response, 200, RUNS(), cors);
    return true;
  }

  if (verb === "settle_payroll_net_pay") {
    if (body.p_client !== P947.clientId) return false;
    state.settleCalls.push(body.p_op_key);

    // RUN B's candidate — always refused, the exact shape `_settle_payroll_net_pay_core` raises.
    if (body.p_entry === P947.refusedEntryId || body.p_line === P947.refusedLineId) {
      sendJson(response, 400, {
        code: "CLR10",
        message: P947.refusalAmountMismatch,
        details: '{"reason":"amount_mismatch","line_cents":-100,"unsettled_cents":300000}',
      }, cors);
      return true;
    }

    sendJson(response, 200, {
      entry_id: "94701004-9470-4947-8947-947000000013",
      match_id: P947.matchId,
      unsettled_cents: 425_570,
      posting_date: "2026-09-02",
    }, cors);
    return true;
  }

  return false;
}
