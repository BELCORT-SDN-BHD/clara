// #657's mock lane — the /bank Matching tab, on the BUILT app.
//
// A file-disjoint sibling of `bank-close-registers-mock.mjs`, consulted by `serve-built.mjs`
// through ONE hook. Every id below is distinct from every other lane's and every handler is
// ID-SCOPED, so no walk can starve another's fixtures.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client
// code under test are REAL — the URL-as-truth tab strip, the intent-hash op key, the residual,
// the refusal renderer, the persistent outcome. What is faked is PostgREST: its reads and its
// RPC answers, INCLUDING the governed refusals. So this walk proves the JOURNEY and what the
// surface does with an answer; it proves NOTHING about whether Postgres would actually give
// that answer. `clara.match_bank_line`'s own capacity and exception walls are exercised in
// `packages/db/tests/bank-line-existing-booking.test.mjs`, not here.
//
// ============================================================================================
// DISPATCH POSITION IS LOAD-BEARING, AND IT IS NOT ALPHABETICAL (DECISIONS §6.1, #657 row).
//
// `home-board-mock.mjs` answers `list_bank_statements` and `list_bank_accounts`
// UNCONDITIONALLY through its `EMPTY_RPCS` array (home-board-mock.mjs:107-108, dispatched at
// :139-142, returning `[]`), and it is wired into the chain at `serve-built.mjs:720`. A bank
// lane dispatched BELOW that arm therefore receives `[]` for both verbs and silently renders an
// empty account selector — no error anywhere. So this lane's hook is dispatched ABOVE
// `handleHomeBoardSupabase`, beside the sibling bank lane `handleL7Supabase`, and both sites
// carry a comment saying so. The orchestrator's ruling: "The integrator preserves dispatch order
// over sort order."
//
// AND THE SECOND CONSEQUENCE: those two verbs must NOT be declared in `SHARED_RPC_VERBS`. The
// ownership census reads only the three literal dispatch shapes this suite lanes use — a verb
// equality, an fn equality, or an equality against a full rpc path string
// (e2e-fixture-ownership.test.ts:1077) — so it cannot see an
// array-dispatched arm — the census will count exactly ONE claimant for each, while the reverse
// check at :1262-1265 requires every declared shared verb to have 2+ CENSUSED claimants. A
// declaration would red the census for a share it cannot measure.
// ============================================================================================
//
// THE SEVEN VERBS THIS LANE ANSWERS, by authority:
//   verified lane-exclusive (SYNTHESIS §3.3, SYNTHESIS.md:411-413) —
//     get_bank_line_matching_context, match_bank_line, unmatch_bank_match,
//     list_unmatched_lines, list_bank_match_candidates
//   lane-exclusive BY INFERENCE from DECISIONS §3's blanket ownership of /bank
//   ("nobody else touches /bank this wave", DECISIONS.md:113) —
//     list_bank_statements, list_bank_accounts

import { matchVerb, readCachedJson as readJson } from "./mock-dispatch.mjs";

export const P657 = {
  firmId: "65700000-6570-4657-8657-657000000000",
  clientId: "657c657c-6570-4657-8657-657000000001",
  accountId: "657a657a-6570-4657-8657-657000000002",
  statementId: "657b657b-6570-4657-8657-657000000003",
  // the clean line: one exact candidate, matches and reports no new cash
  cleanLine: "65701001-6570-4657-8657-657000000010",
  // the over-capacity line: the door refuses by name with its side
  overLine: "65701002-6570-4657-8657-657000000011",
  // the excepted line: still visible, with its recovery, and the door refuses
  exceptedLine: "65701003-6570-4657-8657-657000000012",
  exactEntry: "65702001-6570-4657-8657-657000000020",
  spentEntry: "65702002-6570-4657-8657-657000000021",
  matchId: "65703001-6570-4657-8657-657000000030",
  refusalOverCapacity: "journal entry 65702002 has no unmatched credit cents left on 170-657",
  refusalExcepted: "statement line 65701003 carries an open exception; resolve it first",
};

/** The ONLY seven RPC verbs this lane's own dispatch recognises — the allow-list `matchVerb`
 *  guards the `readJson` call site with, so a verb this lane does not own returns false WITHOUT
 *  the request stream ever being touched (mock-dispatch.mjs's own header carries the hazard).
 *  Exported so a unit can drive the handler with a foreign verb and assert the body is intact. */
export const P657_RPC_VERBS = new Set([
  "list_bank_accounts",
  "list_bank_statements",
  "list_unmatched_lines",
  "list_bank_match_candidates",
  "get_bank_line_matching_context",
  "match_bank_line",
  "unmatch_bank_match",
]);

/** THIS LANE IS DELIBERATELY STATELESS about what has been matched, and that is not laziness.
 *  `serve-built.mjs` is ONE process for the WHOLE browser suite, so a module-level "this line is
 *  gone now" would leak from whichever spec ran first into every later one — which it did: a
 *  first cut removed the clean line after the happy-path leg and the keyboard leg, running later
 *  in the same worker, could no longer find it. Every leg here is order-independent instead. The
 *  op keys ARE recorded, because a replay assertion is about what reached the door. */
const state = { matchCalls: [] };

export function resetP657() {
  state.matchCalls = [];
}

export function p657MatchCalls() {
  return state.matchCalls;
}

const CLIENT = () => ({
  id: P657.clientId,
  name: "P657 BANK MATCH FIXTURE",
  status: "active",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-01T00:00:00.000Z",
});

const ACCOUNTS = () => [{
  id: P657.accountId,
  bank_code: "MBB",
  bank_name: "Maybank",
  bank_name_display: "Maybank",
  account_number: "514420657001",
  account_number_normalized: "514420657001",
  coa_account_code: "170-657",
  coa_account_name: "Maybank current",
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  deactivated_at: null,
  deactivated_reason: null,
}];

const STATEMENTS = () => [{
  id: P657.statementId,
  bank_account_id: P657.accountId,
  document_id: "657d657d-6570-4657-8657-657000000004",
  period_start: "2026-04-01",
  period_end: "2026-04-30",
  statement_date: "2026-04-30",
  opening_cents: 0,
  closing_cents: -453_00,
  total_debit_cents: 45_300,
  total_credit_cents: 0,
  line_count: 3,
  status: "live",
  ingest_mode: "document",
  superseded_by: null,
  voided_by: null,
  voided_at: null,
  voided_reason: null,
  created_at: "2026-05-01T00:00:00.000Z",
  tie: { gl_balance_cents: -45_300, unmatched_cents: -45_300 },
}];

const LINE = (id, description, cents) => ({
  line_id: id,
  statement_id: P657.statementId,
  bank_account_id: P657.accountId,
  bank_account_display: "Maybank 514420657001",
  line_no: 1,
  entry_date: "2026-04-05",
  value_date: "2026-04-05",
  description,
  amount_cents: cents,
  class_hint: "bank_charges",
});

const UNMATCHED = () => [
  LINE(P657.cleanLine, "MBB SERVICE CHARGE APR", -15_000),
  LINE(P657.overLine, "MBB TRANSFER FEE APR", -15_300),
  // NOTE: the EXCEPTED line is deliberately ABSENT from this report — that is
  // `list_unmatched_lines`' own behaviour (0040:4117-4122 excludes an open-excepted line), and
  // the walk reaches it by URL to prove the context read is what keeps it on screen.
];

const CANDIDATES = () => [
  {
    entry_id: P657.exactEntry,
    posting_date: "2026-04-05",
    memo: "Bank charges — April",
    coding_kind: "bank_charge",
    counterparty_id: "65704001-6570-4657-8657-657000000040",
    counterparty_name: "Malayan Banking Berhad",
    high_stakes: false,
    debit_remaining_cents: 0,
    credit_remaining_cents: 15_000,
    match_history: [],
  },
  {
    entry_id: P657.spentEntry,
    posting_date: "2026-04-03",
    memo: "Transfer fee — already cleared",
    coding_kind: "bank_charge",
    counterparty_id: null,
    counterparty_name: null,
    high_stakes: true,
    debit_remaining_cents: 0,
    credit_remaining_cents: 0,
    match_history: [
      { match_id: "65703002-6570-4657-8657-657000000031", status: "live", matched_cents: -15_300, acted_at: "2026-04-10T00:00:00.000Z" },
    ],
  },
];

const BASIS = (lineId) => {
  const exact = lineId === P657.cleanLine;
  return [
    {
      entry_id: P657.exactEntry,
      amount_exact: exact,
      date_delta_days: 0,
      counterparty_match: "name",
      class_hint: "bank_charges",
    },
    {
      entry_id: P657.spentEntry,
      amount_exact: !exact,
      date_delta_days: 2,
      counterparty_match: "none",
      class_hint: "bank_charges",
    },
  ];
};

const CONTEXT = (lineId) => {
  const excepted = lineId === P657.exceptedLine;
  const line = excepted
    ? LINE(P657.exceptedLine, "MBB UNKNOWN CREDIT APR", 20_000)
    : lineId === P657.overLine
      ? LINE(P657.overLine, "MBB TRANSFER FEE APR", -15_300)
      : LINE(P657.cleanLine, "MBB SERVICE CHARGE APR", -15_000);
  return {
    schema: "clara.bank-line-matching-context/v1",
    line: { ...line, client_id: P657.clientId, coa_account_code: "170-657", running_balance_cents: -15_000, group_status: null, match_id: null },
    statement: {
      id: P657.statementId,
      status: "live",
      superseded_by: null,
      voided_by: null,
      voided_at: null,
      voided_reason: null,
      ingest_mode: "document",
      period_start: "2026-04-01",
      period_end: "2026-04-30",
      statement_date: "2026-04-30",
      opening_cents: 0,
      closing_cents: -45_300,
      source_doc_sha256: "6570000000000000000000000000000000000000000000000000000000000657",
      document_id: "657d657d-6570-4657-8657-657000000004",
      original_filename: "maybank-514420657001-2026-04.pdf",
    },
    coverage: {
      line_count: 3,
      total_debit_cents: 45_300,
      total_credit_cents: 0,
      tie: { gl_balance_cents: -45_300, unmatched_cents: -45_300 },
    },
    exception: excepted
      ? {
          id: "65705001-6570-4657-8657-657000000050",
          kind: "disputed",
          reason: "the client says this credit is not theirs",
          status: "open",
          created_at: "2026-04-12T00:00:00.000Z",
          resolved_at: null,
          resolution_disposition: null,
          resolution_note: null,
          evidence_document_id: null,
          counterpart_line_id: null,
        }
      : null,
    booking_block: excepted
      ? {
          reason: "exception_booking_outstanding",
          blocking: true,
          line_id: P657.exceptedLine,
          exception_id: "65705001-6570-4657-8657-657000000050",
          remedy: "reverse the booking this line caused, then resolve the exception",
          bookings: [
            {
              entry_id: "65702003-6570-4657-8657-657000000022",
              match_id: null,
              match_status: null,
              orphaned: true,
              caused_by: "born_in_booking_act",
              reverse_blocked_by: null,
              remedy_calls: ["clara.reverse_entry", { call: "clara.resolve_bank_line_exception" }],
              advance_reversal: null,
              advance_release: null,
            },
          ],
        }
      : null,
    candidate_basis: BASIS(lineId),
  };
};

/** The PostgREST half. Returns true when it answered, false to fall through. */
export async function handleP657Supabase(request, response, path, url, sendJson, cors) {
  const idFilter = url.searchParams.get("id");

  // ID-SCOPED ONLY (the sibling lanes' rule): the UNFILTERED /clients read is the client
  // register every walk shares, and claiming it would replace another walk's fixture. This walk
  // navigates by URL and never reads the register.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (idFilter === `eq.${P657.clientId}`) {
      sendJson(response, 200, [CLIENT()], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  // The allow-list guard BEFORE the body read — see mock-dispatch.mjs's header for the hazard
  // (a drained stream resolves to `{}` for every later lane, whose fields are all `undefined`,
  // which permissive guards accept).
  if (!matchVerb(P657_RPC_VERBS, verb)) return false;
  const body = await readJson(request);

  if (verb === "list_bank_accounts") {
    if (body.p_client !== P657.clientId) return false;
    sendJson(response, 200, ACCOUNTS(), cors);
    return true;
  }

  if (verb === "list_bank_statements") {
    if (body.p_client !== P657.clientId) return false;
    sendJson(response, 200, STATEMENTS(), cors);
    return true;
  }

  if (verb === "list_unmatched_lines") {
    if (body.p_client !== P657.clientId) return false;
    sendJson(response, 200, UNMATCHED(), cors);
    return true;
  }

  if (verb === "list_bank_match_candidates") {
    if (body.p_client !== P657.clientId) return false;
    sendJson(response, 200, CANDIDATES(), cors);
    return true;
  }

  if (verb === "get_bank_line_matching_context") {
    const known = [P657.cleanLine, P657.overLine, P657.exceptedLine];
    if (!known.includes(body.p_line)) return false;
    sendJson(response, 200, CONTEXT(body.p_line), cors);
    return true;
  }

  if (verb === "match_bank_line") {
    if (body.p_client !== P657.clientId) return false;
    state.matchCalls.push(body.p_op_key);
    const lines = Array.isArray(body.p_lines) ? body.p_lines : [];
    const entries = Array.isArray(body.p_entries) ? body.p_entries : [];

    // THE EXCEPTED LINE — refused by name, and the line stays on screen with its recovery.
    if (lines.includes(P657.exceptedLine)) {
      sendJson(response, 400, {
        code: "CLR10",
        message: P657.refusalExcepted,
        details: `{"reason":"line_excepted","line_id":"${P657.exceptedLine}"}`,
      }, cors);
      return true;
    }

    // THE OVER-CAPACITY PICK — the exact shape `_match_bank_line_core` raises: CLR10, the DB's
    // own sentence, and `detail.reason` = already_matched carrying its SIDE.
    if (entries.some((e) => e?.entry_id === P657.spentEntry)) {
      sendJson(response, 400, {
        code: "CLR10",
        message: P657.refusalOverCapacity,
        details: `{"reason":"already_matched","side":"credit","entry_id":"${P657.spentEntry}","account_code":"170-657"}`,
      }, cors);
      return true;
    }

    // THE HAPPY PATH — idempotent under a replayed op key, exactly as `_reserve_op` is: the
    // SAME receipt every time, whatever the key, and no state change at all (see the state
    // comment above for why this lane remembers nothing).
    sendJson(response, 200, {
      match_id: P657.matchId,
      status: "live",
      line_cents: -15_000,
      entry_cents: -15_000,
      adjustment_cents: 0,
      adjustment_entry_ids: [],
      period_exceptions: 0,
      entry_ids: [P657.exactEntry],
      line_ids: [P657.cleanLine],
      bank_account_id: P657.accountId,
      account_code: "170-657",
      new_journal_entries: 0,
      settlement_objects: 0,
    }, cors);
    return true;
  }

  if (verb === "unmatch_bank_match") {
    if (body.p_client !== P657.clientId) return false;
    sendJson(response, 400, {
      code: "CLR11",
      message: "no such match for this client",
      details: '{"reason":"match_not_found"}',
    }, cors);
    return true;
  }

  return false;
}
