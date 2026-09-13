// #615 — THE OPERATOR SUPPORT DESTINATION, ISOLATED FROM CLIENT BOOKS (parent spec #612 §8;
// journey D3).
//
// The one claim this battery exists to prove: **THE OPERATOR'S SUPPORT SURFACE IS EXACTLY THE
// ADMISSION ESTATE — REGISTRATIONS, PAYMENTS AND PROVIDER PROBLEMS — AND NOTHING IN IT REACHES A
// FIRM'S BOOKS.** Everything else here (the three arms, the settled filter, the no-oracle detail
// door, the replay receipts) hangs off that.
//
// CONTRACT-BLIND against 0188's own tail census, frontier-gated on the `operator_support_console$`
// stem. Nothing below reads the migration's success text: 0188's `raise notice ... OK` describes
// one attempt, and these cells describe the live catalog (packages/db/README.md, "Migration and
// deployment behavior").
//
// LEAST-PRIVILEGED EXECUTION, AND WHERE IT IS STRUCTURALLY IMPOSSIBLE. Every DOOR is driven
// through `clara_authenticated` with real jwt claims, and every webhook verb through
// `clara_stripe_webhook` — never root. Root appears in exactly two places, both by construction
// rather than convenience: building the fixture rows in relations that carry ZERO application-role
// DML grant (`clara.checkout_intents`, `clara.stripe_event_problems`,
// `clara.firm_registration_payments`, and the four books relations os.11 reads), and reading those
// same relations back as the INSTRUMENT a door's answer is checked against — a cell that verified
// the door with the door would be measuring nothing.
//
// THE QUEUE IS ESTATE-WIDE BY DESIGN, so every cell asserts against ITS OWN ids (`caseOf`) rather
// than the whole answer. The ONE whole-answer assertion is the sort order, which is a statement
// about the door and not about which rows the estate happens to hold.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CASE_KIND, CLR, PG, ROLES, SUPPORT_NOT_FOUND, applyEvents, approveRegistration, assertRaises,
  caseOf, claimPaidFirm, clearOperator, detailOf, endPool, ensureOperatorOwner, firmWithBooks,
  gateOperatorSupport, getCapacity, humanQuery, normalizedBody, openProblem,
  operatorFirmBookkeeper, operatorSupportLaneReady, opk, ordinaryFirm, paidUnclaimed, paymentRow,
  problemRow, registrationRow, rejectRegistration, releaseCapacity, resolveProblemWithKey,
  roleQuery, rootQuery, setCapacity, supportCase, supportQueue, undecidedRegistration, insertUser,
} from "./operator-support-fixtures.mjs";

const QUEUE_SIG = "clara.list_operator_support_queue(boolean)";
const CASE_SIG = "clara.get_operator_support_case(text,text)";
/** The ONE query both doors delegate to (0188 §1) — granted to nobody, so it is asserted about
 *  rather than called. */
const SHARED_SIG = "clara._operator_support_cases(boolean,text,uuid)";

let operator = null;
let executed = 0;
const EXPECTED_CELLS = 13;

before(async () => {
  if (!(await operatorSupportLaneReady())) return;
  operator = await ensureOperatorOwner();
});
after(async () => {
  if (operator) await releaseCapacity(operator.owner);
  await clearOperator();
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (await gateOperatorSupport(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ===========================================================================================
// 1 · AUTHORITY. Who may ask the question at all.
// ===========================================================================================

cell("os.01 authority -- the operator firm's OWNER reads both doors; the operator firm's "
  + "BOOKKEEPER, an ordinary firm's OWNER and a person with no membership each get CLR04", async () => {
  const world = await openProblem(operator, "os01");

  // The positive control FIRST: a wall nobody can pass is not a wall, it is a broken door.
  const rows = await supportQueue(operator.owner);
  assert.ok(caseOf(rows, CASE_KIND.problem, world.problem), "the operator's own queue carries the problem");
  const detail = await supportCase(operator.owner, CASE_KIND.problem, world.problem);
  assert.equal(detail.case_id, world.problem);

  const bookkeeper = await operatorFirmBookkeeper(operator, "os01");
  const outsiderOwner = await insertUser("w615", "os01-outside");
  await ordinaryFirm(outsiderOwner, "owner");
  const stranger = await insertUser("w615", "os01-stranger"); // no membership anywhere

  for (const [label, sub] of [["operator-firm bookkeeper", bookkeeper],
    ["ordinary-firm owner", outsiderOwner], ["no-membership caller", stranger]]) {
    await assertRaises(CLR.authz, () => supportQueue(sub), `${label} at the queue`);
    await assertRaises(CLR.authz, () => supportCase(sub, CASE_KIND.problem, world.problem),
      `${label} at the case door`);
    // …and the refusal is IDENTICAL for an id that does not exist, so a refused caller cannot
    // use the two answers as an existence oracle for the estate's case ids.
    await assertRaises(CLR.authz, () => supportCase(sub, CASE_KIND.problem, randomUUID()),
      `${label} at the case door, unknown id`);
  }
});

cell("os.02 grants -- PUBLIC is revoked, clara_authenticated alone holds EXECUTE, and every "
  + "other application role is refused 42501 at both doors", async () => {
  const acl = await rootQuery(
    `select p.oid::regprocedure::text as sig,
            coalesce(array_to_string(p.proacl, ' | '), '(null)') as acl
       from pg_proc p
      where p.oid in ($1::regprocedure, $2::regprocedure) order by sig`, [QUEUE_SIG, CASE_SIG]);
  assert.equal(acl.rowCount, 2, "both doors resolve at their exact signatures");
  for (const row of acl.rows) {
    assert.ok(!/(^|\s|\|)=X\//.test(row.acl), `${row.sig}: PUBLIC holds no EXECUTE (${row.acl})`);
    assert.ok(row.acl.includes("clara_authenticated=X/clara_fn_owner"),
      `${row.sig}: clara_authenticated holds EXECUTE (${row.acl})`);
  }

  const holders = await rootQuery(
    `select r.rolname, has_function_privilege(r.rolname, $1::regprocedure, 'execute') as q,
            has_function_privilege(r.rolname, $2::regprocedure, 'execute') as c
       from pg_roles r where r.rolname like 'clara\\_%' order by r.rolname`, [QUEUE_SIG, CASE_SIG]);
  const canQueue = holders.rows.filter((r) => r.q).map((r) => r.rolname);
  const canCase = holders.rows.filter((r) => r.c).map((r) => r.rolname);
  assert.deepEqual(canQueue, ["clara_authenticated", "clara_fn_owner"], "queue EXECUTE holders");
  assert.deepEqual(canCase, ["clara_authenticated", "clara_fn_owner"], "case EXECUTE holders");

  for (const role of [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive,
    "clara_stripe_webhook"]) {
    await assertRaises(PG.insufficientPrivilege,
      () => roleQuery(role, "select * from clara.list_operator_support_queue()"),
      `${role} at the queue`);
    await assertRaises(PG.insufficientPrivilege,
      () => roleQuery(role, "select clara.get_operator_support_case($1,$2)",
        [CASE_KIND.problem, randomUUID()]),
      `${role} at the case door`);
  }
});

cell("os.03 posture -- both doors are clara_fn_owner-owned SECURITY DEFINERs with search_path "
  + "and plan_cache_mode pinned, and both carry the byte-copied operator-authority fragment", async () => {
  const posture = await rootQuery(
    `select p.oid::regprocedure::text as sig, p.prosecdef, p.provolatile,
            pg_get_userbyid(p.proowner) as owner,
            coalesce(array_to_string(p.proconfig, ' | '), '(null)') as config
       from pg_proc p where p.oid in ($1::regprocedure, $2::regprocedure) order by sig`,
    [QUEUE_SIG, CASE_SIG]);
  assert.equal(posture.rowCount, 2);
  for (const row of posture.rows) {
    // Whitespace-stripped: PostgreSQL normalizes a GUC list when it stores it, so `search_path =
    // clara, pg_temp` comes back as `search_path=clara, pg_temp` however it was authored — a
    // literal comparison would be asserting the catalog's formatting rather than the pin.
    const config = row.config.replace(/\s+/g, "");
    assert.equal(row.prosecdef, true, `${row.sig} is SECURITY DEFINER`);
    assert.equal(row.owner, "clara_fn_owner", `${row.sig} is owned by clara_fn_owner`);
    assert.ok(config.includes("search_path=clara,pg_temp"), `${row.sig} pins search_path (${row.config})`);
    // 0183's own measured rule: a body that binds the session firm into a cached statement flips
    // to a generic plan from the sixth call of a pooled connection without this pin.
    assert.ok(config.includes("plan_cache_mode=force_custom_plan"),
      `${row.sig} pins plan_cache_mode (${row.config})`);
  }

  // 0145 §K (8b)'s own instrument, applied to the two NEW bodies: the operator-existence fragment
  // is a BYTE-COPY of approve_firm_registration's, and the owner-rank floor occurs EXACTLY once
  // (a presence-only check stays green on a second, decorative occurrence masking a downgrade).
  const fragment = "exists(select1fromclara.firmsfwheref.id=clara.jwt_firm()andf.is_operator)";
  const rankFragment = "clara.role_rank('owner'";
  const reference = await normalizedBody("clara.approve_firm_registration(uuid,text)");
  assert.ok(reference.includes(fragment),
    "the reference body (approve_firm_registration) still carries the shared fragment");
  for (const sig of [QUEUE_SIG, CASE_SIG]) {
    const body = await normalizedBody(sig);
    assert.ok(body.includes(fragment), `${sig} carries the byte-copied operator fragment`);
    const occurrences = body.split(rankFragment).length - 1;
    assert.equal(occurrences, 1, `${sig} states the owner-rank floor exactly once`);
  }
});

// ===========================================================================================
// 2 · THE THREE ARMS.
// ===========================================================================================

cell("os.04 the queue carries one case per arm -- an undecided registration, an unconsumed "
  + "payment and an open provider problem -- each with its own entity and current state", async () => {
  const reg = await undecidedRegistration("os04");
  const paid = await paidUnclaimed(operator, "os04");
  const problem = await openProblem(operator, "os04");

  const rows = await supportQueue(operator.owner);

  const regRow = caseOf(rows, CASE_KIND.registration, reg.registration);
  assert.ok(regRow, "the undecided registration is a registration case");
  const regTruth = await registrationRow(reg.registration);
  assert.deepEqual({
    registration_id: regRow.registration_id, applicant: regRow.applicant,
    firm_name: regRow.firm_name, request_status: regRow.request_status,
    occurred_at: regRow.occurred_at, decided_by: regRow.decided_by, decided_at: regRow.decided_at,
    settled: regRow.settled, problem_kind: regRow.problem_kind,
    payment_recorded_at: regRow.payment_recorded_at,
  }, {
    registration_id: regTruth.id, applicant: regTruth.applicant, firm_name: regTruth.firm_name,
    request_status: "open", occurred_at: regTruth.created_at, decided_by: null, decided_at: null,
    settled: false, problem_kind: null, payment_recorded_at: null,
  }, "the registration case is the registration row, field for field");

  // A PAID registration is NOT also an approval case: nobody may approve it, the applicant claims
  // it. One support case per real support question — this file's own §1 claim.
  assert.equal(caseOf(rows, CASE_KIND.registration, paid.registration), null,
    "a paid registration is not offered as an approve/reject case");
  const payRow = caseOf(rows, CASE_KIND.payment, paid.payment);
  assert.ok(payRow, "the unconsumed payment is a payment case");
  const payTruth = await paymentRow(paid.payment);
  assert.deepEqual({
    registration_id: payRow.registration_id, applicant: payRow.applicant,
    payment_recorded_at: payRow.payment_recorded_at, payment_consumed_at: payRow.payment_consumed_at,
    occurred_at: payRow.occurred_at, intent_status: payRow.intent_status, settled: payRow.settled,
  }, {
    registration_id: payTruth.registration_id, applicant: payTruth.applicant,
    payment_recorded_at: payTruth.recorded_at, payment_consumed_at: null,
    occurred_at: payTruth.recorded_at, intent_status: "paid", settled: false,
  }, "the payment case carries the payment row AND the intent's current state");
  assert.equal(payRow.firm_name, (await registrationRow(paid.registration)).firm_name);

  const probRow = caseOf(rows, CASE_KIND.problem, problem.problem);
  assert.ok(probRow, "the open problem is a problem case");
  const probTruth = await problemRow(problem.problem);
  assert.deepEqual({
    problem_kind: probRow.problem_kind, problem_noticed_at: probRow.problem_noticed_at,
    occurred_at: probRow.occurred_at, problem_detail: probRow.problem_detail,
    registration_id: probRow.registration_id, settled: probRow.settled,
    decided_by: probRow.decided_by, decided_at: probRow.decided_at,
  }, {
    problem_kind: probTruth.problem, problem_noticed_at: probTruth.noticed_at,
    occurred_at: probTruth.noticed_at, problem_detail: probTruth.detail,
    registration_id: problem.registration, settled: false, decided_by: null, decided_at: null,
  }, "the problem case carries the problem row and the registration the event named");

  // THE ONE WHOLE-ANSWER ASSERTION: the door's own order, `occurred_at desc, case_id desc`.
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const here = rows[i];
    const ordered = prev.occurred_at > here.occurred_at
      || (prev.occurred_at.getTime() === here.occurred_at.getTime() && prev.case_id >= here.case_id);
    assert.ok(ordered,
      `row ${i} breaks (occurred_at desc, case_id desc): ${prev.occurred_at.toISOString()}/${prev.case_id}`
      + ` then ${here.occurred_at.toISOString()}/${here.case_id}`);
  }
});

cell("os.05 the settled filter -- a decided registration, a consumed payment and a resolved "
  + "problem leave the default queue and come back WITH their receipts under p_include_settled", async () => {
  const rejected = await undecidedRegistration("os05r");
  const approved = await undecidedRegistration("os05a");
  const claimed = await paidUnclaimed(operator, "os05c");
  const solved = await openProblem(operator, "os05p");

  const rejectReceipt = await rejectRegistration(operator.owner, rejected.registration,
    "#615 os.05 the applicant already has a firm");
  assert.equal(rejectReceipt.status, "rejected");
  const approveReceipt = await approveRegistration(operator.owner, approved.registration);
  assert.ok(approveReceipt.firm_id, "the approval minted a firm");
  await claimPaidFirm(claimed.sub, claimed.email, claimed.registration);
  await resolveProblemWithKey(operator.owner, solved.problem, "#615 os.05 admitted by hand",
    opk("os05-resolve"));

  const open = await supportQueue(operator.owner);
  for (const [label, kind, id] of [
    ["a rejected registration", CASE_KIND.registration, rejected.registration],
    ["an approved registration", CASE_KIND.registration, approved.registration],
    ["a consumed payment", CASE_KIND.payment, claimed.payment],
    ["a resolved problem", CASE_KIND.problem, solved.problem],
  ]) {
    assert.equal(caseOf(open, kind, id), null, `${label} is NOT in the default queue`);
  }

  const all = await supportQueue(operator.owner, { includeSettled: true });
  const rejectedRow = caseOf(all, CASE_KIND.registration, rejected.registration);
  const rejectedTruth = await registrationRow(rejected.registration);
  assert.deepEqual({
    request_status: rejectedRow.request_status, decided_by: rejectedRow.decided_by,
    decided_at: rejectedRow.decided_at, decided_reason: rejectedRow.decided_reason,
    settled: rejectedRow.settled,
  }, {
    request_status: "rejected", decided_by: operator.owner, decided_at: rejectedTruth.decided_at,
    decided_reason: "#615 os.05 the applicant already has a firm", settled: true,
  }, "the rejection receipt is attributable through the queue");

  const approvedRow = caseOf(all, CASE_KIND.registration, approved.registration);
  assert.equal(approvedRow.request_status, "approved");
  assert.equal(approvedRow.firm_id, approveReceipt.firm_id, "the approval's own firm is named");
  assert.equal(approvedRow.decided_by, operator.owner);

  const claimedRow = caseOf(all, CASE_KIND.payment, claimed.payment);
  const claimedTruth = await paymentRow(claimed.payment);
  assert.equal(claimedRow.payment_consumed_at.getTime(), claimedTruth.consumed_at.getTime());
  assert.equal(claimedRow.intent_status, "consumed", "the claim moved the intent to consumed");
  assert.equal(claimedRow.settled, true);

  const solvedRow = caseOf(all, CASE_KIND.problem, solved.problem);
  const solvedTruth = await problemRow(solved.problem);
  assert.deepEqual({
    decided_by: solvedRow.decided_by, decided_at: solvedRow.decided_at,
    decided_reason: solvedRow.decided_reason, settled: solvedRow.settled,
  }, {
    decided_by: operator.owner, decided_at: solvedTruth.resolved_at,
    decided_reason: "#615 os.05 admitted by hand", settled: true,
  }, "the resolution receipt is attributable through the queue");
});

// ===========================================================================================
// 3 · THE DETAIL DOOR.
// ===========================================================================================

cell("os.06 the case door answers ONE refusal for an unknown id, an unknown kind and a "
  + "mismatched (kind, id) pair -- no existence oracle over the admission estate", async () => {
  const world = await openProblem(operator, "os06");
  const known = await supportCase(operator.owner, CASE_KIND.problem, world.problem);
  assert.equal(known.case_kind, CASE_KIND.problem, "the positive control resolves");

  const probes = [
    ["an id that names nothing", CASE_KIND.problem, randomUUID()],
    ["a kind outside the closed three", "client", world.problem],
    ["another closed kind entirely", "document", world.problem],
    ["a real problem id under the registration kind", CASE_KIND.registration, world.problem],
    ["a real registration id under the payment kind", CASE_KIND.payment, world.registration],
    ["a real payment id under the problem kind", CASE_KIND.problem, world.payment],
  ];
  const answers = [];
  for (const [label, kind, id] of probes) {
    const error = await assertRaises(CLR.notFound, () => supportCase(operator.owner, kind, id), label);
    answers.push({ label, message: error.message, reason: detailOf(error)?.reason });
  }
  for (const answer of answers) {
    assert.equal(answer.reason, SUPPORT_NOT_FOUND, `${answer.label} carries the one reason`);
    assert.equal(answer.message, answers[0].message,
      `${answer.label} is byte-identical to "${answers[0].label}"`);
  }
  // …and a NULL kind or id is the same answer: a malformed deep link is a missing case, never a
  // different, more informative refusal.
  for (const [kind, id] of [[null, world.problem], [CASE_KIND.problem, null], [null, null]]) {
    const error = await assertRaises(CLR.notFound, () => supportCase(operator.owner, kind, id),
      `kind=${kind} id=${id}`);
    assert.equal(detailOf(error)?.reason, SUPPORT_NOT_FOUND);
  }

  // AN ID THAT IS NOT A UUID AT ALL takes the SAME path, and this is why `p_id` is declared `text`
  // rather than `uuid` (0181's `get_activity_event` took the same decision, 0181:468-474). Declared
  // `uuid`, PostgREST answers a hand-edited `?case=problem:xyz` with a raw HTTP 400 `22P02` BEFORE
  // this body runs at all, and the console renders a banner carrying a database error code instead
  // of the one not-found face. Every spelling below — a bare word, a truncated uuid, a uuid with a
  // trailing character, SQL-looking text, an empty string — is ONE `support_case_not_found`.
  for (const id of ["xyz", "not-a-uuid", world.problem.slice(0, 20),
    `${world.problem}x`, "' or 1=1 --", "", "   "]) {
    const error = await assertRaises(CLR.notFound,
      () => supportCase(operator.owner, CASE_KIND.problem, id), `a non-uuid id ${JSON.stringify(id)}`);
    assert.equal(detailOf(error)?.reason, SUPPORT_NOT_FOUND);
    assert.equal(error.message, answers[0].message,
      `a non-uuid id answers byte-identically to "${answers[0].label}"`);
  }
  // …and the two spellings PostgreSQL's OWN uuid parser accepts beyond the canonical one resolve
  // the row rather than reading as malformed — the door delegates the grammar question to the
  // database instead of to a second, stricter regex of its own.
  for (const id of [world.problem.replaceAll("-", ""), `{${world.problem}}`]) {
    const resolved = await supportCase(operator.owner, CASE_KIND.problem, id);
    assert.equal(resolved.case_id, world.problem, `${id} is the same uuid to PostgreSQL`);
  }

  // THE POSITIVE CONTROL FOR THE SIGNATURE ITSELF, in two facts rather than one claim.
  //
  // (a) A `uuid`-typed parameter REFUSES this value, in PostgreSQL, before any function body runs —
  //     which is precisely what PostgREST binds a `p_id uuid` argument as, and precisely why a
  //     hand-edited `?case=problem:xyz` used to come back as a 400 the console could only render as
  //     a banner carrying a database error code.
  await assertRaises(PG.invalidText,
    () => humanQuery(operator.owner, "select $1::uuid as forced", ["xyz"]),
    "a uuid-typed parameter binding a non-uuid");
  // (b) …and the signature this door actually carries answers the same value with the ONE
  //     not-found face, asserted in the loop above. The door does not resolve at all under the
  //     retired spelling, which is the other half of the same fact.
  const retired = await rootQuery(
    "select to_regprocedure('clara.get_operator_support_case(text,uuid)') is null as gone");
  assert.equal(retired.rows[0].gone, true, "no uuid-typed overload of this door exists");
});

cell("os.07 the case door returns every queue field for its arm, plus that arm's own detail",
  async () => {
    const reg = await undecidedRegistration("os07");
    const paid = await paidUnclaimed(operator, "os07");
    const problem = await openProblem(operator, "os07");
    const rows = await supportQueue(operator.owner);

    for (const [kind, id] of [[CASE_KIND.registration, reg.registration],
      [CASE_KIND.payment, paid.payment], [CASE_KIND.problem, problem.problem]]) {
      const row = caseOf(rows, kind, id);
      assert.ok(row, `${kind}:${id} is in the queue`);
      const detail = await supportCase(operator.owner, kind, id);
      for (const [field, value] of Object.entries(row)) {
        const asJson = value instanceof Date ? value.toISOString() : value;
        const fromDoor = detail[field] === undefined ? undefined
          : (field.endsWith("_at") && typeof detail[field] === "string"
            ? new Date(detail[field]).toISOString() : detail[field]);
        assert.deepEqual(fromDoor, asJson,
          `${kind} detail.${field} matches the queue row (${JSON.stringify(detail[field])})`);
      }
    }

    // The arm-specific half — the facts a queue row has no column for and a detail pane needs.
    const regDetail = await supportCase(operator.owner, CASE_KIND.registration, reg.registration);
    assert.equal(regDetail.note, (await registrationRow(reg.registration)).note);
    const payDetail = await supportCase(operator.owner, CASE_KIND.payment, paid.payment);
    const payTruth = await paymentRow(paid.payment);
    assert.equal(payDetail.stripe_session_id, payTruth.stripe_session_id);
    assert.equal(payDetail.stripe_event_id, payTruth.stripe_event_id);
    const probDetail = await supportCase(operator.owner, CASE_KIND.problem, problem.problem);
    assert.equal(probDetail.stripe_event_id, (await problemRow(problem.problem)).event_id);
    assert.equal(probDetail.event_type, "checkout.session.async_payment_succeeded");
  });

// ===========================================================================================
// 4 · THE PERMITTED ACTS, AND WHAT A LOST RESPONSE READS.
// ===========================================================================================

cell("os.08 resolve replay -- the SAME op_key replays the first receipt over exactly ONE "
  + "resolution stamp; a DIFFERENT resolution under that key is CLR10 and changes nothing", async () => {
  const world = await openProblem(operator, "os08");
  const key = opk("os08-resolve");
  const first = await resolveProblemWithKey(operator.owner, world.problem,
    "#615 os.08 the duplicate was refunded", key);
  const stamped = await problemRow(world.problem);

  const replay = await resolveProblemWithKey(operator.owner, world.problem,
    "#615 os.08 the duplicate was refunded", key);
  assert.deepEqual(replay, first, "the replay is the ORIGINAL receipt, byte-identical");
  const afterReplay = await problemRow(world.problem);
  assert.deepEqual({
    resolved_at: afterReplay.resolved_at, resolved_by: afterReplay.resolved_by,
    resolution: afterReplay.resolution,
  }, {
    resolved_at: stamped.resolved_at, resolved_by: stamped.resolved_by, resolution: stamped.resolution,
  }, "exactly one resolution stamp survives the replay");

  await assertRaises(CLR.badRequest, () => resolveProblemWithKey(operator.owner, world.problem,
    "#615 os.08 a DIFFERENT story entirely", key), "the same key with a different resolution");
  const afterConflict = await problemRow(world.problem);
  assert.equal(afterConflict.resolution, stamped.resolution, "a refused replay wrote nothing");

  // A FRESH key over an already-resolved problem is the honest lifecycle refusal, not a replay.
  await assertRaises(CLR.lastOwner, () => resolveProblemWithKey(operator.owner, world.problem,
    "#615 os.08 a second resolution", opk("os08-again")), "a second resolution under a new key");

  const all = await supportQueue(operator.owner, { includeSettled: true });
  const row = caseOf(all, CASE_KIND.problem, world.problem);
  assert.equal(row.decided_reason, "#615 os.08 the duplicate was refunded",
    "the FIRST resolution is what the queue reports");
});

cell("os.09 a second decision on an already-decided registration is CLR09, and the FIRST "
  + "decision's receipt is still what the queue reports", async () => {
  const world = await undecidedRegistration("os09");
  const receipt = await approveRegistration(operator.owner, world.registration, opk("os09-first"));
  const decided = await registrationRow(world.registration);

  await assertRaises(CLR.lastOwner,
    () => approveRegistration(operator.owner, world.registration, opk("os09-second")),
    "a second approval under a fresh key");
  await assertRaises(CLR.lastOwner,
    () => rejectRegistration(operator.owner, world.registration, "#615 os.09 too late",
      opk("os09-reject")), "a rejection after the approval");

  const after = await registrationRow(world.registration);
  assert.deepEqual({
    status: after.status, decided_by: after.decided_by, decided_at: after.decided_at,
    firm_id: after.firm_id,
  }, {
    status: "approved", decided_by: decided.decided_by, decided_at: decided.decided_at,
    firm_id: decided.firm_id,
  }, "two refused decisions moved nothing");

  const all = await supportQueue(operator.owner, { includeSettled: true });
  const row = caseOf(all, CASE_KIND.registration, world.registration);
  assert.deepEqual({
    request_status: row.request_status, decided_by: row.decided_by, firm_id: row.firm_id,
    settled: row.settled,
  }, {
    request_status: "approved", decided_by: operator.owner, firm_id: receipt.firm_id, settled: true,
  }, "the first decision's receipt is readable through the queue");
});

cell("os.10 admission capacity -- the console's own panel rides the SAME wall as the support "
  + "reads, and a lost response replays the receipt without a second effect", async () => {
  const bookkeeper = await operatorFirmBookkeeper(operator, "os10");
  const outsider = await insertUser("w615", "os10-outside");
  await ordinaryFirm(outsider, "owner");
  for (const [label, sub] of [["operator-firm bookkeeper", bookkeeper], ["ordinary-firm owner", outsider]]) {
    await assertRaises(CLR.authz, () => getCapacity(sub), `${label} reading capacity`);
    await assertRaises(CLR.authz,
      () => setCapacity(sub, { maxFirms: 1, reason: "#615 os.10" }), `${label} writing capacity`);
  }

  const key = opk("os10-cap");
  const first = await setCapacity(operator.owner, { maxFirms: 4242, reason: "#615 os.10", opKey: key });
  const stamped = await rootQuery("select max_firms, reason, updated_by, updated_at from clara.admission_capacity where id");
  const replay = await setCapacity(operator.owner, { maxFirms: 4242, reason: "#615 os.10", opKey: key });
  assert.deepEqual(replay, first, "the lost-response retry replays the ORIGINAL receipt");
  const after = await rootQuery("select max_firms, reason, updated_by, updated_at from clara.admission_capacity where id");
  assert.deepEqual(after.rows[0], stamped.rows[0], "the replay wrote nothing a second time");

  const read = await getCapacity(operator.owner);
  assert.equal(read.max_firms, 4242);
  assert.equal(typeof read.firms_count, "number");
  await setCapacity(operator.owner, { maxFirms: null, reason: "#615 os.10 release" });
});

// ===========================================================================================
// 5 · THE BOUNDARY. The claim this whole file exists for.
// ===========================================================================================

cell("os.11 isolation -- an operator's support reads never carry another firm's client, "
  + "document, ledger or Work row, and the operator's own scope reads ZERO of them", async () => {
  const other = await firmWithBooks("os11");
  // The instrument: those four rows genuinely exist, read as root.
  for (const [relation, id] of [["clients", other.client], ["documents", other.document],
    ["journal_entries", other.entry], ["accounting_work", other.work]]) {
    const present = await rootQuery(
      `select count(*)::int as n from clara.${relation} where id = $1 and firm_id = $2`,
      [id, other.firm]);
    assert.equal(present.rows[0].n, 1, `the fixture ${relation} row exists`);
  }

  // (a) STRUCTURAL, via jwt_firm(): the operator, at their own altitude and under the real
  //     least-privileged role, reads NONE of the other firm's books.
  for (const relation of ["clients", "documents", "journal_entries", "accounting_work"]) {
    const seen = await humanQuery(operator.owner,
      `select count(*)::int as n from clara.${relation} where firm_id = $1`, [other.firm]);
    assert.equal(seen.rows[0].n, 0,
      `the operator reads zero clara.${relation} rows of another firm`);
  }

  // (b) …and no support answer smuggles one of those ids through instead.
  const forbidden = new Set([other.firm, other.client, other.document, other.entry, other.work]);
  const rows = await supportQueue(operator.owner, { includeSettled: true });
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      const text = value === null || value === undefined ? "" : JSON.stringify(value);
      for (const id of forbidden) {
        assert.ok(!text.includes(id),
          `queue ${row.case_kind}:${row.case_id} field ${field} names another firm's ${id}`);
      }
    }
  }
  const sample = rows.slice(0, 12);
  for (const row of sample) {
    const detail = await supportCase(operator.owner, row.case_kind, row.case_id);
    const text = JSON.stringify(detail);
    for (const id of forbidden) {
      assert.ok(!text.includes(id), `case ${row.case_kind}:${row.case_id} names ${id}`);
    }
  }

  // (c) CENSUS, so the boundary survives a future edit rather than only today's fixtures: neither
  //     body names a books relation at all. A text census over the normalized prosrc, the same
  //     instrument 0145 §K uses — it cannot prove absence of a dynamic reference, and neither
  //     body contains EXECUTE at all (asserted here too), which is what closes that gap.
  const books = ["clara.clients", "clara.documents", "clara.journal_entries",
    "clara.accounting_work", "clara.journal_lines", "clara.wiki_pages", "clara.client_facts",
    "clara.agent_receipts", "clara.operation_receipts", "clara.domain_events"];
  // The SHARED body is censused too, and that is the whole point: the two doors delegate their
  // query to it, so a census of the doors alone would be vacuous.
  for (const sig of [QUEUE_SIG, CASE_SIG, SHARED_SIG]) {
    const body = await normalizedBody(sig);
    for (const relation of books) {
      assert.ok(!body.includes(relation.replace(/\s+/g, "")),
        `${sig} names ${relation} — the operator surface must not reach a firm's books`);
    }
    assert.ok(!body.includes("execute"), `${sig} builds no dynamic SQL`);
  }
});

cell("os.12 the arms are exactly three, and a foreign relation cannot enter through the "
  + "queue: every row the door returns resolves to a live admission row", async () => {
  await applyEvents(500);
  const rows = await supportQueue(operator.owner, { includeSettled: true });
  assert.ok(rows.length > 0, "the estate this battery built is not empty");

  // ONE ROW PER CASE, and it is a join question rather than a vocabulary one. Every outward join in
  // the three arms is to a relation with a UNIQUE index on the joined column
  // (`uq_checkout_intents_session_id`, `uq_frp_registration`, the registration primary key) or is a
  // `limit 1` lateral, so a fan-out is structurally impossible today — asserted anyway, because the
  // day one of those joins gains a second matching row the duplicate would reach an operator as two
  // identical cases with one decision between them.
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.case_kind}:${row.case_id}`;
    assert.equal(seen.get(key), undefined, `${key} appears more than once — a join fanned out`);
    seen.set(key, true);
  }

  const kinds = [...new Set(rows.map((r) => r.case_kind))].sort();
  for (const kind of kinds) {
    assert.ok(Object.values(CASE_KIND).includes(kind), `case_kind ${kind} is one of the closed three`);
  }
  for (const row of rows) {
    const relation = {
      registration: "firm_registration_requests",
      payment: "firm_registration_payments",
      problem: "stripe_event_problems",
    }[row.case_kind];
    const present = await rootQuery(
      `select count(*)::int as n from clara.${relation} where id = $1`, [row.case_id]);
    assert.equal(present.rows[0].n, 1,
      `${row.case_kind}:${row.case_id} resolves to a live clara.${relation} row`);
  }
});

cell("os.13 audit trace -- every support act the console offers is attributably stamped in "
  + "clara.audit_log under the OPERATOR's own firm, and the queue is not the audit read", async () => {
  const reg = await undecidedRegistration("os13");
  const world = await openProblem(operator, "os13");
  const before = await rootQuery(
    "select count(*)::int as n from clara.audit_log where firm_id = $1", [operator.firm]);

  await rejectRegistration(operator.owner, reg.registration, "#615 os.13 out of scope");
  await resolveProblemWithKey(operator.owner, world.problem, "#615 os.13 refunded", opk("os13-r"));
  await setCapacity(operator.owner, { maxFirms: 99, reason: "#615 os.13", opKey: opk("os13-cap") });

  const rows = await rootQuery(
    `select fn, actor from clara.audit_log where firm_id = $1 order by at desc limit 30`,
    [operator.firm]);
  const stamped = rows.rows.map((r) => r.fn);
  // `resolve_stripe_event_problem` writes NO clara._audit row today (0160 §5 stops at its
  // op_receipts receipt) — stated here rather than asserted, so this cell does not claim an audit
  // line that does not exist. The two that DO write one are asserted.
  for (const fn of ["reject_firm_registration", "set_admission_capacity"]) {
    assert.ok(stamped.includes(fn), `clara.audit_log carries ${fn} (saw ${stamped.join(", ")})`);
  }
  for (const row of rows.rows.filter((r) => ["reject_firm_registration", "set_admission_capacity"].includes(r.fn))) {
    assert.equal(row.actor, operator.owner, `${row.fn} is attributed to the deciding operator`);
  }
  const after = await rootQuery(
    "select count(*)::int as n from clara.audit_log where firm_id = $1", [operator.firm]);
  assert.ok(after.rows[0].n > before.rows[0].n, "the support acts left audit rows behind");

  // …and the audit trail itself is FIRM-SCOPED even for the operator: `clara.audit_log` carries a
  // SELECT grant to clara_authenticated behind forced RLS, so an operator reading it directly sees
  // their OWN firm's acts and no other firm's — the same boundary the support reads carry. Pinned
  // here rather than assumed, because "the operator can read the audit log" would otherwise be an
  // estate-wide read nobody declared.
  const visible = await humanQuery(operator.owner,
    "select count(*)::int as n, count(*) filter (where firm_id <> $1)::int as foreign_rows from clara.audit_log",
    [operator.firm]);
  assert.equal(visible.rows[0].foreign_rows, 0,
    "the operator's own clara.audit_log read carries no other firm's row");
  assert.ok(visible.rows[0].n > 0, "…and it does carry this firm's own acts");
  await setCapacity(operator.owner, { maxFirms: null, reason: "#615 os.13 release" });
});

test("os.VACUITY CONTROL -- every declared #615 cell executed", async (t) => {
  if (await gateOperatorSupport(t)) return;
  assert.equal(executed, EXPECTED_CELLS, `${EXPECTED_CELLS} #615 cells executed before the control`);
});
