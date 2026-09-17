// #615 — the operator support destination's READ SEAM, under test.
//
// THE ONE CLAIM THIS FILE EXISTS FOR (spec appendix C §3, the "Empty" row; #615 AC3): **a
// REFUSAL IS NEVER RENDERED AS AN EMPTY QUEUE.** "There is nothing for you to do" and "you were
// not allowed to ask" are the two answers an operator must never see conflated, and the naive
// shape that conflates them — a `catch` that falls through to `rows ?? []` — is the exact defect
// `operatorQueueOutcome` is a separately-tested pure judgement to prevent.
//
// RED BEFORE GREEN, recorded: with `operatorQueueOutcome`'s permission arm deleted (so a CLR04
// fell through to `rows === null` and then to the empty branch), "a CLR04 refusal is DENIED, never
// empty" and the two live-permission-loss cells went red with `denied` vs `empty`; restoring the
// arm turned them green. The other four states were red the same way against a one-line
// `rows?.length ? ready : empty` stub.
//
// EVERY REFUSAL FIXTURE IS A REAL `DoorRefusal`/`DoorError` — the runtime classes `lib/doors.ts`
// actually throws, never a look-alike object. `isDoorRefusal` is an `instanceof` check, so a
// structurally-similar literal would silently classify as "not a refusal" and every cell below
// would pass for the wrong reason (AGENTS.md's "spelling is not identity", applied to the test's
// own fixtures).

import assert from "node:assert/strict";
import { test } from "node:test";

import { DoorError, DoorRefusal } from "@/lib/doors";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";
import {
  SUPPORT_CASE_KINDS,
  applyOperatorUrlState,
  classifySupportFailure,
  formatCaseParam,
  isPermissionShaped,
  isSupportCaseKind,
  getOperatorSupportCase,
  listOperatorSupportQueue,
  operatorQueueOutcome,
  parseCaseParam,
  resolveOperatorSupportApplicants,
  parseOperatorUrlState,
  supportCaseState,
  supportedActionFor,
  type SupportQueueRow,
} from "./reads";

// ── fixtures ─────────────────────────────────────────────────────────────────

const CASE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const REGISTRATION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";

function row(overrides: Partial<SupportQueueRow> = {}): SupportQueueRow {
  return {
    case_kind: "registration",
    case_id: CASE_ID,
    occurred_at: "2026-09-12T04:00:00+00:00",
    registration_id: REGISTRATION_ID,
    applicant: "3f2504e0-4f89-41d3-9a0c-0305e82c3303",
    firm_name: "Rome Public Advisory",
    request_status: "open",
    firm_id: null,
    intent_status: null,
    intent_status_at: null,
    intent_status_reason: null,
    payment_recorded_at: null,
    payment_consumed_at: null,
    problem_kind: null,
    problem_noticed_at: null,
    problem_detail: null,
    decided_by: null,
    decided_at: null,
    decided_reason: null,
    settled: false,
    // #776 — this module's OWN field, merged onto the door's answer rather than returned by it.
    applicant_name: null,
    ...overrides,
  };
}

/** The class `callDoor` actually throws for a governed CLR refusal — constructed exactly as
 *  `lib/wire.ts`'s own `classifyPgrestFailure` constructs it, `codeSource: "sqlstate"` included,
 *  so these fixtures are the real thing rather than a structurally-similar stand-in. */
function refusal(code: string, message: string, reason: string | null = null): DoorRefusal {
  return new DoorRefusal(code, message, { reason, status: 400, pgCode: code, codeSource: "sqlstate" });
}

// ── THE FOUR (plus two) DISTINCT STATES ──────────────────────────────────────

test("#615 AC3 — a CLR04 refusal is DENIED, never an empty queue", () => {
  const denied = operatorQueueOutcome({
    rows: null, error: refusal("CLR04", "insufficient role", "not_operator_firm"), filtered: false,
  });
  assert.equal(denied.kind, "denied");
  // The discriminating half: the SAME input with no error is the empty state, so this cell cannot
  // pass by the function simply never answering "empty".
  assert.deepEqual(operatorQueueOutcome({ rows: [], error: null, filtered: false }),
    { kind: "empty", filtered: false });
});

test("empty, failed-first-read, stale-after-reload and denied are four DISTINCT answers", () => {
  const transport = new DoorError("fetch failed", { status: null, kind: "transport" });
  const answers = [
    operatorQueueOutcome({ rows: [], error: null, filtered: false }),
    operatorQueueOutcome({ rows: null, error: transport, filtered: false }),
    operatorQueueOutcome({ rows: [row()], error: transport, filtered: false }),
    operatorQueueOutcome({ rows: [row()], error: refusal("CLR04", "insufficient role"), filtered: false }),
  ];
  assert.deepEqual(answers.map((a) => a.kind), ["empty", "failedFirstRead", "stale", "denied"]);
  assert.equal(new Set(answers.map((a) => a.kind)).size, 4, "all four are distinct");
});

test("a DENIED refresh clears the prior rows — a denied target never keeps support data on screen", () => {
  const outcome = operatorQueueOutcome({
    rows: [row(), row({ case_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3304" })],
    error: refusal("CLR04", "insufficient role", "not_operator_firm"),
    filtered: true,
  });
  assert.equal(outcome.kind, "denied");
  assert.ok(!("rows" in outcome), "the denied state carries no rows at all");
});

test("a STALE refresh KEEPS the prior rows — an ordinary failure is not a reason to blank the queue", () => {
  const rows = [row()];
  const outcome = operatorQueueOutcome({
    rows, error: new DoorError("bad gateway", { status: 502, kind: "server_error" }), filtered: false,
  });
  assert.equal(outcome.kind, "stale");
  assert.deepEqual(outcome.kind === "stale" ? outcome.rows : null, rows);
});

test("empty distinguishes first use from no-results-under-these-filters", () => {
  assert.deepEqual(operatorQueueOutcome({ rows: [], error: null, filtered: false }),
    { kind: "empty", filtered: false });
  assert.deepEqual(operatorQueueOutcome({ rows: [], error: null, filtered: true }),
    { kind: "empty", filtered: true });
});

test("no read yet, no error yet is LOADING — and an empty successful read is not", () => {
  assert.deepEqual(operatorQueueOutcome({ rows: null, error: null, filtered: false }), { kind: "loading" });
  assert.equal(operatorQueueOutcome({ rows: [], error: null, filtered: false }).kind, "empty");
});

test("isPermissionShaped recognises all four spellings of a permission loss, and nothing else", () => {
  assert.equal(isPermissionShaped(refusal("CLR04", "insufficient role")), true);
  for (const kind of ["forbidden", "unauthenticated", "no_session"] as const) {
    assert.equal(isPermissionShaped(new DoorError("x", { status: 403, kind })), true, kind);
  }
  assert.equal(isPermissionShaped(refusal("CLR09", "no longer open")), false);
  assert.equal(isPermissionShaped(new DoorError("x", { status: 502, kind: "server_error" })), false);
  assert.equal(isPermissionShaped(new Error("plain")), false);
  assert.equal(isPermissionShaped(null), false);
});

// ── #776 · THE APPLICANT'S NAME ──────────────────────────────────────────────
//
// THE ONE CLAIM THESE CELLS EXIST FOR: **a name that did not resolve is an ABSENCE, and a name
// read that did not answer is not a failure of the queue.** `clara.list_operator_support_queue` is
// the authority on what the operator may see; `clara.resolve_operator_support_applicants` is a
// label on top of it, and letting the label's failure turn a good queue into "denied" or "failed
// read" would be this seam inventing a state the database never reported.
//
// The fetch is mocked at the WIRE, not at `callDoor`, so the argument names these cells assert
// (`p_applicants`) are the ones that would really reach PostgREST — the same names
// `packages/db/tests/operation-census.test.mjs` checks against the function's declaration.

const APPLICANT_A = "3f2504e0-4f89-41d3-9a0c-0305e82c33a1";
const APPLICANT_B = "3f2504e0-4f89-41d3-9a0c-0305e82c33b2";

type Call = { fn: string; body: Record<string, unknown> };

async function withWire(
  handler: (fn: string, body: Record<string, unknown>) => unknown,
  run: (calls: Call[]) => Promise<void>,
): Promise<void> {
  const calls: Call[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  configureSessionTokenSource(async () => "tok");
  globalThis.fetch = (async (u: unknown, init?: { body?: string }) => {
    const url = String(u);
    const fn = url.slice(url.lastIndexOf("/rpc/") + 5);
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    calls.push({ fn, body });
    const answer = handler(fn, body);
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

test("#776 — the queue's rows carry the resolved applicant name, and an unresolved one is null", async () => {
  await withWire(
    (fn) => {
      if (fn === "list_operator_support_queue") {
        return [
          { ...row({ applicant: APPLICANT_A }), applicant_name: undefined },
          { ...row({ case_id: REGISTRATION_ID, applicant: APPLICANT_B }), applicant_name: undefined },
          { ...row({ case_id: CASE_ID, case_kind: "problem", applicant: null }), applicant_name: undefined },
        ];
      }
      // The door answers ONLY what it resolved — B is nobody it can name, so B is simply absent.
      if (fn === "resolve_operator_support_applicants") {
        return [{ applicant: APPLICANT_A, display_name: "Farid bin Ismail" }];
      }
      return new Error(`unexpected door ${fn}`);
    },
    async (calls) => {
      const rows = await listOperatorSupportQueue();
      assert.deepEqual(rows.map((r) => r.applicant_name),
        ["Farid bin Ismail", null, null],
        "resolved, unresolved and null-applicant rows, in that order");
      // THE ARGUMENT IS DEDUPED AND NULL-FREE, and it is named `p_applicants` exactly as the
      // function declares it — a mismatch here is a `named_arg_mismatch` in the DB census.
      const nameCall = calls.find((c) => c.fn === "resolve_operator_support_applicants");
      assert.ok(nameCall, "the name door was called");
      assert.deepEqual(nameCall.body, { p_applicants: [APPLICANT_A, APPLICANT_B] });
    },
  );
});

test("#776 — a page whose applicants are all null costs NO name call at all", async () => {
  await withWire(
    (fn) => {
      if (fn === "list_operator_support_queue") return [row({ applicant: null })];
      return new Error(`unexpected door ${fn}`);
    },
    async (calls) => {
      const rows = await listOperatorSupportQueue();
      assert.deepEqual(rows.map((r) => r.applicant_name), [null]);
      assert.equal(calls.filter((c) => c.fn === "resolve_operator_support_applicants").length, 0,
        "no ids, no question");
    },
  );
  // …and the resolver says the same thing when called directly with nothing to resolve.
  assert.deepEqual([...(await resolveOperatorSupportApplicants([null, undefined, ""]))], []);
});

test("#776 — a name read that FAILS leaves the queue intact, with every name absent", async () => {
  await withWire(
    (fn) => {
      if (fn === "list_operator_support_queue") return [row({ applicant: APPLICANT_A })];
      return new Error("the name door is unavailable");
    },
    async () => {
      const rows = await listOperatorSupportQueue();
      assert.equal(rows.length, 1, "the queue the operator asked for is still the answer");
      assert.equal(rows[0]!.applicant_name, null, "…with the name absent rather than invented");
    },
  );
});

test("#776 — the case detail carries the same resolved name", async () => {
  await withWire(
    (fn) => {
      if (fn === "get_operator_support_case") {
        return { ...row({ applicant: APPLICANT_A }), note: null, intent_id: null,
          stripe_session_id: null, stripe_event_id: null, event_type: null };
      }
      if (fn === "resolve_operator_support_applicants") {
        return [{ applicant: APPLICANT_A, display_name: "Farid bin Ismail" }];
      }
      return new Error(`unexpected door ${fn}`);
    },
    async (calls) => {
      const detail = await getOperatorSupportCase("registration", CASE_ID);
      assert.equal(detail.applicant_name, "Farid bin Ismail");
      assert.deepEqual(calls.find((c) => c.fn === "resolve_operator_support_applicants")?.body,
        { p_applicants: [APPLICANT_A] });
    },
  );
});

// ── AN ACT'S FAILURE, TOLD APART BY CODE (#615 AC3/AC4) ──────────────────────

test("#615 AC3 — provider-unavailable, duplicate-operation, stale and denied are distinct act failures", () => {
  const cases: [unknown, string][] = [
    [refusal("CLR04", "insufficient role", "not_operator_firm"), "denied"],
    [refusal("CLR13", "already being recorded", "operation_in_flight"), "duplicate"],
    [refusal("CLR10", "this op key was already used", "op_key_conflict"), "duplicate"],
    [refusal("CLR10", "op_key was reused with different arguments"), "duplicate"],
    [refusal("CLR09", "this request is no longer open (status: approved)"), "stale"],
    [refusal("CLR11", "support case not found", "support_case_not_found"), "notFound"],
    [refusal("CLR10", "a rejection reason is required", "reason_required"), "refused"],
    [new DoorError("fetch failed", { status: null, kind: "transport" }), "providerUnavailable"],
    [new DoorError("bad gateway", { status: 502, kind: "server_error" }), "providerUnavailable"],
    [new Error("something else entirely"), "providerUnavailable"],
  ];
  for (const [error, expected] of cases) {
    assert.equal(classifySupportFailure(error).kind, expected,
      `${error instanceof Error ? error.message : String(error)} classifies as ${expected}`);
  }
  // …and the DB's own code travels with every one of them, so a banner can show it verbatim.
  assert.equal(classifySupportFailure(refusal("CLR09", "no longer open")).code, "CLR09");
  assert.equal(
    classifySupportFailure(refusal("CLR13", "in flight", "operation_in_flight")).reason,
    "operation_in_flight");
});

// ── THE PERMITTED NEXT STEP (#615 scope decision: existing writers only) ─────

test("supportedActionFor offers a decision only on an OPEN registration and a resolution only on an OPEN problem", () => {
  assert.equal(supportedActionFor(row({ case_kind: "registration", request_status: "open" })), "decide");
  assert.equal(supportedActionFor(row({ case_kind: "problem", request_status: "open" })), "resolve");
  // An unconsumed payment has NO operator-side writer at all: `clara.claim_paid_firm` is the
  // applicant's own door. The console must say so rather than offer a control the DB would refuse.
  assert.equal(supportedActionFor(row({ case_kind: "payment", request_status: "open" })), "none");
  // …and nothing settled is actionable, on any arm.
  for (const kind of SUPPORT_CASE_KINDS) {
    assert.equal(supportedActionFor(row({ case_kind: kind, settled: true, request_status: "approved" })),
      "none", `a settled ${kind} offers nothing`);
  }
  // A registration that is no longer open is not decidable even before `settled` is consulted.
  assert.equal(supportedActionFor(row({ case_kind: "registration", request_status: "rejected", settled: false })),
    "none");
});

test("supportCaseState names six distinct states across the three arms", () => {
  const states = [
    supportCaseState(row({ case_kind: "registration", settled: false })),
    supportCaseState(row({ case_kind: "registration", settled: true })),
    supportCaseState(row({ case_kind: "payment", settled: false })),
    supportCaseState(row({ case_kind: "payment", settled: true })),
    supportCaseState(row({ case_kind: "problem", settled: false })),
    supportCaseState(row({ case_kind: "problem", settled: true })),
  ];
  assert.deepEqual(states, [
    "awaitingDecision", "decided", "awaitingClaim", "claimed", "providerProblem", "problemResolved",
  ]);
  assert.equal(new Set(states).size, 6, "all six are distinct");
});

// ── THE URL MODEL: a stable address, and a hand-edited one that cannot crash ──

test("the case param round-trips, and every malformed spelling degrades to NO case open", () => {
  assert.equal(formatCaseParam("problem", CASE_ID), `problem:${CASE_ID}`);
  assert.deepEqual(parseCaseParam(`problem:${CASE_ID}`), { kind: "problem", id: CASE_ID });
  for (const raw of [null, undefined, "", ":", "problem:", `:${CASE_ID}`, `client:${CASE_ID}`,
    `Registration:${CASE_ID}`, CASE_ID]) {
    assert.equal(parseCaseParam(raw), null, `"${String(raw)}" opens no case`);
  }
});

test("#615 — a case param whose ID IS NOT A UUID opens no case, so the malformed value never reaches the door", () => {
  // DEFENCE IN DEPTH, not the wall. `clara.get_operator_support_case` takes `p_id text` and answers
  // the SAME `support_case_not_found` for a non-uuid (0188 §3; the DB battery's os.06 drives it), so
  // nothing breaks if one of these reaches it. What this check buys is that a hand-edited
  // `?case=problem:xyz` costs no round trip and, crucially, cannot be the thing that renders a
  // database error code in a banner — the same posture `parseActivityUrlState` takes for `?client=`
  // via `isClientIdShape`.
  for (const id of ["xyz", "not-a-uuid", CASE_ID.slice(0, 20), `${CASE_ID}x`,
    "' or 1=1 --", "00000000-0000-0000-0000-00000000000", "   "]) {
    assert.equal(parseCaseParam(`problem:${id}`), null, `id ${JSON.stringify(id)} opens no case`);
  }
  // The nil uuid is SYNTACTICALLY a uuid and is admitted — it simply names no case, which the door
  // answers honestly. A shape check that rejected it would be inventing a rule the database has not.
  assert.deepEqual(parseCaseParam("problem:00000000-0000-0000-0000-000000000000"),
    { kind: "problem", id: "00000000-0000-0000-0000-000000000000" });
  // …and every kind still round-trips with a real uuid, so the guard cannot have closed the door.
  for (const kind of SUPPORT_CASE_KINDS) {
    assert.deepEqual(parseCaseParam(`${kind}:${CASE_ID}`), { kind, id: CASE_ID });
  }
});

test("the URL state parses the three params, drops a stale kind, and folds a patch without touching the rest", () => {
  const params = new URLSearchParams(`kind=problem&settled=1&case=payment:${CASE_ID}&other=keep`);
  assert.deepEqual(parseOperatorUrlState(params), {
    kind: "problem", settled: true, caseRef: { kind: "payment", id: CASE_ID },
  });
  // A retired or hand-edited kind is DROPPED rather than sent to the door, where it would be a
  // refusal the operator never asked for.
  assert.deepEqual(parseOperatorUrlState(new URLSearchParams("kind=ledger&settled=maybe")), {
    kind: null, settled: false, caseRef: null,
  });

  const opened = applyOperatorUrlState(params, { caseRef: { kind: "problem", id: CASE_ID } });
  assert.equal(opened.get("case"), `problem:${CASE_ID}`);
  assert.equal(opened.get("kind"), "problem", "an unrelated param is untouched");
  assert.equal(opened.get("other"), "keep");
  assert.equal(params.get("case"), `payment:${CASE_ID}`, "the input is not mutated");

  // An empty field DELETES its key rather than writing "", so Back never lands on ?settled=.
  const closed = applyOperatorUrlState(opened, { caseRef: null, settled: false, kind: null });
  assert.equal(closed.has("case"), false);
  assert.equal(closed.has("settled"), false);
  assert.equal(closed.has("kind"), false);
  assert.equal(closed.get("other"), "keep", "closing the Sheet preserves the rest of the URL");
});

test("isSupportCaseKind is the closed three and nothing else", () => {
  assert.deepEqual([...SUPPORT_CASE_KINDS], ["registration", "payment", "problem"]);
  for (const kind of SUPPORT_CASE_KINDS) assert.equal(isSupportCaseKind(kind), true);
  for (const other of ["client", "document", "ledger", "REGISTRATION", ""]) {
    assert.equal(isSupportCaseKind(other), false, other);
  }
});
