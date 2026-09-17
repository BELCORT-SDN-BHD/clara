// #615 — OPERATOR SUPPORT CONSOLE: the battery's frontier gate, vocabulary and door wrappers.
// NOT a test file (the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// THE FRONTIER GATE keys on 0188's STABLE STEM (`operator_support_console$`), never its number —
// numbers are claimed at MERGE (standing law), and the `db-slice-frontiers` matrix runs this
// package against databases pinned at EARLIER frontiers, where the two support reads do not exist
// and an unconditional assertion would red the leg while saying nothing about the thing under
// test. #628's `gateConvergence` idiom (itself #621's `gateLegal`), reused verbatim rather than
// re-invented.
//
// EVERYTHING CHECKOUT-SHAPED IS REUSED from checkout-convergence-fixtures.mjs — which in turn
// reuses #621's legal-acceptance fixtures. The support queue reads the SAME three arms #628 and
// 0160/0163 write (open registrations, unconsumed payments, open Stripe event problems), so a
// second world-builder for one estate would let this battery pass against a shape the real doors
// never see.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (0188 §1/§2):
//
//   clara.list_operator_support_queue(p_include_settled boolean default false)
//        -> setof (case_kind, case_id, occurred_at, registration_id, applicant, firm_name,
//                  request_status, firm_id, intent_status, intent_status_at, intent_status_reason,
//                  payment_recorded_at, payment_consumed_at, problem_kind, problem_noticed_at,
//                  problem_detail, decided_by, decided_at, decided_reason, settled)
//   clara.get_operator_support_case(p_kind text, p_id text)
//        -> jsonb — every queue field plus the arm's own detail; ONE CLR11
//           `support_case_not_found` for an unknown id, an unknown kind and a mismatched pair.

import { randomUUID } from "node:crypto";
import {
  CLR, EVENT, PG, PROBLEM, ROLES, applyEvents, assertPair, assertRaises, claimPaidFirm,
  clearOperator, deliver, detailOf, endPool, ensureOperatorOwner, getCapacity, getPool,
  forceStatus, humanQuery, insertRegistration, insertUser, intentState, intentsOf, liveCheckout,
  namedCall, openIntent, openedCheckout,
  opk, ordinaryFirm, paymentsFor, problemsFor, releaseCapacity, resolveProblem, roleQuery,
  rootQuery, setCapacity, sha256Hex, stampSession, stripeSessionId, userEmail, withActor,
} from "./checkout-convergence-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export {
  CLR, EVENT, PG, PROBLEM, ROLES, applyEvents, assertPair, assertRaises, claimPaidFirm,
  clearOperator, deliver, detailOf, endPool, ensureOperatorOwner, getCapacity, getPool,
  forceStatus, humanQuery, insertRegistration, insertUser, intentState, intentsOf, liveCheckout,
  namedCall, openIntent, openedCheckout,
  opk, ordinaryFirm, paymentsFor, problemsFor, releaseCapacity, resolveProblem, roleQuery,
  rootQuery, setCapacity, sha256Hex, stampSession, stripeSessionId, userEmail, withActor,
};

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** 0188's STABLE STEM. */
export const OPERATOR_SUPPORT_STEM = "operator_support_console$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function operatorSupportLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [OPERATOR_SUPPORT_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateOperatorSupport(t)) return;` — the house per-cell frontier gate, COUNTED skip. */
export async function gateOperatorSupport(t) {
  if (await operatorSupportLaneReady()) return false;
  markSkip();
  t.skip(`#615 operator-support lane absent (no ${OPERATOR_SUPPORT_STEM} migration applied)`);
  return true;
}

// #776 — the APPLICANT-NAME lane's own frontier gate. A SECOND stem rather than a widening of the
// one above, for the reason every cohort in rig-meta.mjs is frontier-tolerant: the
// `db-slice-frontiers` matrix runs this package against databases pinned between 0188 and this
// file's own migration, where the two support reads exist and the name door does not. Gating the
// new cells on 0188's stem would red every one of those legs while saying nothing about the thing
// under test.

/** The applicant-name migration's STABLE STEM — never its number (numbers are claimed at MERGE). */
export const APPLICANT_NAME_STEM = "operator_support_applicant_name$";

let _namesReady = null;
export async function applicantNameLaneReady() {
  if (_namesReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [APPLICANT_NAME_STEM]);
      _namesReady = r.rows[0].n > 0;
    } catch {
      _namesReady = false;
    }
  }
  return _namesReady;
}

/** BOTH lanes, because every #776 cell builds its world through the #615 fixtures above and then
 *  reads the new door: a database carrying one and not the other cannot run these cells at all. */
export async function gateApplicantNames(t) {
  if (await operatorSupportLaneReady() && await applicantNameLaneReady()) return false;
  markSkip();
  t.skip(`#776 applicant-name lane absent (no ${APPLICANT_NAME_STEM} migration applied)`);
  return true;
}

/** `clara.resolve_operator_support_applicants`, as a named-argument call — the census asserts the
 *  web call site names `p_applicants` exactly as declared, and this wrapper holds the same shape so
 *  the battery and the app cannot drift apart. Returns `{ applicant -> display_name }`. */
export async function resolveApplicantNames(sub, applicants) {
  const r = await humanQuery(
    sub,
    "select * from clara.resolve_operator_support_applicants(p_applicants => $1::uuid[])",
    [applicants]);
  return r.rows;
}

// ===========================================================================================
// 2 · The closed vocabulary 0188 mints.
// ===========================================================================================

/** Every value `case_kind` may hold — one per arm. */
export const CASE_KIND = {
  registration: "registration",
  payment: "payment",
  problem: "problem",
};

/** The ONE refusal both doors' not-found path carries. */
export const SUPPORT_NOT_FOUND = "support_case_not_found";

// ===========================================================================================
// 3 · Door wrappers. Named arguments only — the contract states parameter NAMES.
// ===========================================================================================

export async function supportQueue(sub, { includeSettled = false } = {}) {
  const r = await humanQuery(
    sub, "select * from clara.list_operator_support_queue(p_include_settled => $1)",
    [includeSettled]);
  return r.rows;
}

export async function supportCase(sub, kind, id) {
  const r = await humanQuery(
    sub, "select clara.get_operator_support_case(p_kind => $1, p_id => $2) as result", [kind, id]);
  return r.rows[0].result;
}

/** The queue rows this battery's own world contributed, keyed by `kind:id` — every cell asserts
 *  against ITS OWN ids rather than the whole estate, because the door is estate-wide by design
 *  and sibling cells (and sibling batteries in the same sweep) legitimately add rows. */
export function caseOf(rows, kind, id) {
  return rows.find((r) => r.case_kind === kind && r.case_id === id) ?? null;
}

// ===========================================================================================
// 4 · World builders the support arms need.
// ===========================================================================================

/** A bookkeeper of the OPERATOR firm — the sharpest negative persona there is: the right firm,
 *  the wrong rank. `_human_ctx(role_rank('owner'))` is what refuses them, not the operator
 *  predicate, and the two walls answer the same CLR04 on purpose. */
export async function operatorFirmBookkeeper(operator, tag = "os") {
  const sub = await insertUser("w615", `${tag}-bk`);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'bookkeeper')",
    [operator.firm, sub]);
  return sub;
}

/** An applicant who has PAID and not yet claimed: one registration, one settled Stripe event,
 *  one unconsumed `clara.firm_registration_payments` row, the intent at `paid`. */
export async function paidUnclaimed(operator, tag = "os") {
  const world = await liveCheckout(operator.owner, { tag });
  const { event } = await deliver({
    type: EVENT.completed, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  const payments = await paymentsFor(world.registration);
  if (payments.length !== 1) {
    throw new Error(`paidUnclaimed(${tag}): expected exactly one payment row, got ${payments.length}`);
  }
  return { ...world, event, payment: payments[0].id };
}

/** An estate with ONE open Stripe event problem: a second settled event against a registration
 *  that already holds a payment row is `duplicate_payment` (0160 §4's own subtransaction arm). */
export async function openProblem(operator, tag = "os") {
  const world = await paidUnclaimed(operator, tag);
  const second = await deliver({
    type: EVENT.asyncSucceeded, intent: world.intent, registration: world.registration,
    applicant: world.sub, session: world.session,
    projection: { payment_status: "paid", mode: "subscription", session_status: "complete" },
  });
  const filed = await problemsFor(second.event);
  if (filed.length !== 1) {
    throw new Error(
      `openProblem(${tag}): expected exactly one problem on the second event, got ${filed.length}`);
  }
  return { ...world, problemEvent: second.event, problem: filed[0].id, problemKind: filed[0].problem };
}

/** An ordinary firm carrying REAL books — a client, a document, a posted-shaped journal entry and
 *  an accounting Work row — so "the operator reads zero rows of another firm's books" is a
 *  statement about rows that exist rather than about an empty table. Every insert is root, by
 *  construction: all four relations are firm-scoped RLS with SELECT-only application grants. */
export async function firmWithBooks(tag = "os") {
  const owner = await insertUser("w615", `${tag}-other`);
  const firm = await ordinaryFirm(owner, "owner");
  const client = await rootQuery(
    "insert into clara.clients(firm_id,name) values ($1,$2) returning id",
    [firm, `w615_${tag}_client_${randomUUID().slice(0, 8)}`]);
  const sha = sha256Hex(`w615-${tag}-${randomUUID()}`);
  // `clara.documents` is FIRM-scoped, never client-scoped: a document's client attribution lives
  // on its filing row (0011's own shape), which this fixture does not need — the boundary under
  // test is the FIRM one.
  const document = await rootQuery(
    `insert into clara.documents(firm_id,sha256,storage_path,status,uploaded_by)
     values ($1,$2,$3,'ingested',$4) returning id`,
    [firm, sha, `firms/${firm}/docs/${sha}.pdf`, owner]);
  // A LEDGER ROW WITHOUT A CHART OF ACCOUNTS. `t_je_balance`/`t_je_provenance` are deferred
  // CONSTRAINT triggers that fire on EVERY entry regardless of status, so a bare entry row needs
  // balanced `clara.journal_lines` — which need an `account_code` that resolves in this brand-new
  // firm's COA, i.e. a whole onboarding. This cell is about the FIRM boundary and not about
  // posting, so the two belts are disarmed for the width of ONE root-owned insert and re-armed in
  // a `finally` — 0186 §A's own measured idiom, the same one
  // checkout-convergence-fixtures.mjs's `backdateStatus` uses to age a clock the estate writes
  // itself. Safe here because the package runs files sequentially (`--test-concurrency=1`).
  await rootQuery("alter table clara.journal_entries disable trigger t_je_balance");
  await rootQuery("alter table clara.journal_entries disable trigger t_je_provenance");
  let entry;
  try {
    entry = await rootQuery(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,origin,maker_actor,memo)
       values ($1,$2,'draft',current_date,'manual',$3,$4) returning id`,
      [firm, client.rows[0].id, owner, `w615 ${tag} other firm's ledger`]);
  } finally {
    await rootQuery("alter table clara.journal_entries enable trigger t_je_provenance");
    await rootQuery("alter table clara.journal_entries enable trigger t_je_balance");
  }
  const digest = sha256Hex(`w615-${tag}-basis-${randomUUID()}`);
  const work = await rootQuery(
    `insert into clara.accounting_work(
       firm_id,client_id,purpose,status,initiator,initiator_role,initiated_by,intent_key,
       logical_op_id,basis,basis_digest,basis_origin)
     values ($1,$2,'journal_entry','queued',$3,'owner',$3,$4,$5,'{}'::jsonb,$6,'user_direct')
     returning id`,
    [firm, client.rows[0].id, owner, `w615-${tag}-${randomUUID()}`,
      `w615-${tag}-${randomUUID()}`, digest]);
  return {
    owner, firm, client: client.rows[0].id, document: document.rows[0].id,
    entry: entry.rows[0].id, work: work.rows[0].id,
  };
}

/** A registration nobody has decided and nobody has paid for — the approval arm's own case. */
export async function undecidedRegistration(tag = "os") {
  const sub = await insertUser("w615", `${tag}-appl`);
  const registration = await insertRegistration(sub, `w615${tag}`);
  return { sub, registration: registration.id, firmName: registration.firm_name };
}

/** `clara.approve_firm_registration`, as the operator-firm owner. */
export async function approveRegistration(owner, request, opKey = null) {
  const r = await humanQuery(owner, namedCall("approve_firm_registration", [
    { name: "p_request", cast: "uuid" }, { name: "p_op_key", cast: "text" },
  ]), [request, opKey ?? opk("os-approve")]);
  return r.rows[0].result;
}

/** `clara.reject_firm_registration`, as the operator-firm owner. */
export async function rejectRegistration(owner, request, reason, opKey = null) {
  const r = await humanQuery(owner, namedCall("reject_firm_registration", [
    { name: "p_request", cast: "uuid" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [request, reason, opKey ?? opk("os-reject")]);
  return r.rows[0].result;
}

/** `clara.resolve_stripe_event_problem` with a CALLER-CHOSEN op_key — #628's own wrapper mints a
 *  fresh one every call, which is exactly what a replay cell must not do. */
export async function resolveProblemWithKey(owner, problem, resolution, opKey) {
  const r = await humanQuery(owner, namedCall("resolve_stripe_event_problem", [
    { name: "p_problem", cast: "uuid" }, { name: "p_resolution", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [problem, resolution, opKey]);
  return r.rows[0].result;
}

/** The registration row, read as root — the instrument every arm's field fidelity is checked
 *  against, so no cell trusts the door it is about to exercise. */
export async function registrationRow(id) {
  const r = await rootQuery(
    `select id, applicant, firm_name, note, status, decided_by, decided_at, reason, firm_id,
            created_at
       from clara.firm_registration_requests where id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function problemRow(id) {
  const r = await rootQuery(
    `select id, event_id, problem, detail, noticed_at, resolved_at, resolved_by, resolution
       from clara.stripe_event_problems where id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function paymentRow(id) {
  const r = await rootQuery(
    `select id, registration_id, applicant, stripe_event_id, stripe_session_id, recorded_at,
            consumed_at, consumed_firm_id
       from clara.firm_registration_payments where id = $1`, [id]);
  return r.rows[0] ?? null;
}

/** The normalized prosrc of one function — the same comment-stripped, whitespace-collapsed
 *  instrument 0145 §K (8b) uses, so a census cell here compares like with like. */
export async function normalizedBody(signature) {
  const r = await rootQuery(
    `select regexp_replace(
              regexp_replace(
                regexp_replace(lower(p.prosrc), '/\\*.*?\\*/', '', 'gs'),
                '--[^\\n]*', '', 'g'),
              '\\s+', '', 'g') as body
       from pg_proc p where p.oid = $1::regprocedure`, [signature]);
  return r.rows[0]?.body ?? null;
}
