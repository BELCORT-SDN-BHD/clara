// #628 — CHECKOUT CONVERGENCE: the battery's frontier gate, vocabulary and verb wrappers.
// NOT a test file (the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// THE FRONTIER GATE keys on 0186's STABLE STEM (`checkout_convergence$`), never its number —
// numbers are claimed at MERGE (standing law), and the `db-slice-frontiers` matrix runs this
// package against databases pinned at EARLIER frontiers, where `clara.admission_capacity` does not
// exist and an unconditional assertion would red the leg while saying nothing about the thing
// under test. #621's `gateLegal` idiom, reused verbatim rather than re-invented.
//
// EVERYTHING LEGAL-SHAPED IS REUSED from legal-acceptance-fixtures.mjs — the same
// `ensureOperatorOwner` / `acceptBoth` / `insertRegistration` / `openIntent` / `ensurePriceMap`
// the #621 battery has driven since 0185. Two fixtures for one world would let this battery pass
// against a shape the real doors never see.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (0186 §C/§F/§I):
//
//   clara.cancel_checkout_intent(p_intent, p_op_key)
//        -> {status: 'cancelled', intent_id, session_id}
//         | {status: 'expired'|'cancelled', intent_id, session_id, replay: true}
//   clara.set_admission_capacity(p_max_firms, p_reason, p_op_key)
//        -> {status: 'set', max_firms, reason, firms_count, full, updated_at}
//   clara.get_admission_capacity()
//        -> {max_firms, firms_count, full}
//   clara.get_own_checkout_intent_session(p_registration)
//        -> setof (intent_id, session_id, status)        -- ZERO rows, never a refusal
//   clara.get_own_checkout_progress(p_registration)
//        -> (checkout_open, paid_unconsumed, intent_status, intent_status_at,
//            intent_status_reason, intent_session_id, capacity_full)

import { randomUUID } from "node:crypto";
import {
  CLR, PG, ROLES, assertPair, assertRaises, clearOperator, detailOf, endPool, getPool, humanQuery,
  insertUser, markOperator, namedCall, opk, roleQuery, rootQuery, withActor,
  acceptBoth, acceptLegal, asApplicant, bodyText, claimPaidFirm, ensureOperatorOwner,
  ensurePriceMap, insertRegistration, openIntent, ordinaryFirm, originDigest, publishLegal,
  rootIntent, sha256Hex, userEmail,
} from "./legal-acceptance-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export {
  CLR, PG, ROLES, assertPair, assertRaises, clearOperator, detailOf, endPool, getPool, humanQuery,
  insertUser, markOperator, namedCall, opk, roleQuery, rootQuery, withActor,
  acceptBoth, acceptLegal, asApplicant, bodyText, claimPaidFirm, ensureOperatorOwner,
  ensurePriceMap, insertRegistration, openIntent, ordinaryFirm, originDigest, publishLegal,
  rootIntent, sha256Hex, userEmail,
};

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** 0186's STABLE STEM. */
export const CONVERGENCE_STEM = "checkout_convergence$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function convergenceLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [CONVERGENCE_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateConvergence(t)) return;` — the house per-cell frontier gate, COUNTED skip. */
export async function gateConvergence(t) {
  if (await convergenceLaneReady()) return false;
  markSkip();
  t.skip(`#628 checkout-convergence lane absent (no ${CONVERGENCE_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on (0186's own roster).
// ===========================================================================================

/** Every value `clara.checkout_intents.status` may hold. */
export const STATUS = ["open", "session_created", "processing", "paid", "consumed",
  "expired", "payment_failed", "cancelled"];

/** Every move `clara._tf_checkout_intents_session_stamp` admits, as `from -> to`.
 *  `open -> session_created` is in the table but is NOT reachable by a bare status write: it is
 *  executed by the trigger as part of the first `session_id` stamp, which is the whole point of
 *  0186 §B. It is therefore listed separately below. */
export const ADMITTED_STATUS_WRITES = [
  ["open", "cancelled"],
  ["session_created", "processing"], ["session_created", "paid"],
  ["session_created", "expired"], ["session_created", "cancelled"],
  ["processing", "paid"], ["processing", "payment_failed"], ["processing", "expired"],
  ["payment_failed", "expired"], ["payment_failed", "cancelled"], ["payment_failed", "paid"],
  ["paid", "consumed"],
  ["expired", "paid"], ["cancelled", "paid"],
];

export const CONVERGENCE_REASON = {
  invalidTransition: "invalid_transition",
  checkoutInProgress: "checkout_in_progress",
  capacityReached: "capacity_reached",
  paymentInFlight: "payment_in_flight",
  alreadyPaid: "already_paid",
  notYourIntent: "not_your_intent",
  intentNotFound: "intent_not_found",
  invalidIntent: "invalid_intent",
  invalidOpKey: "invalid_op_key",
  invalidCapacity: "invalid_capacity",
  reasonRequired: "reason_required",
  reasonTooLong: "reason_too_long",
  opKeyConflict: "op_key_conflict",
  operationInFlight: "operation_in_flight",
  notOperatorFirm: "not_operator_firm",
  noActor: "no_actor",
  unknownActor: "unknown_actor",
  agentActor: "agent_actor",
};

export const PROBLEM = {
  expiredAfterPaid: "expired_after_paid",
  paidAfterTerminal: "paid_after_terminal",
  duplicatePayment: "duplicate_payment",
  intentNotFound: "intent_not_found",
  intentMismatch: "intent_mismatch",
  metadataMissing: "metadata_missing",
  paymentNotSettled: "payment_not_settled",
};

export const EVENT = {
  completed: "checkout.session.completed",
  asyncSucceeded: "checkout.session.async_payment_succeeded",
  asyncFailed: "checkout.session.async_payment_failed",
  expired: "checkout.session.expired",
};

// ===========================================================================================
// 3 · Stripe-lane wrappers. The webhook role, never root — this lane's whole point is that it
//     reaches exactly two verbs and no relation.
// ===========================================================================================

export function stripeEventId(tag = "cc") {
  const suffix = `${tag}${randomUUID().replaceAll("-", "")}`.replaceAll(/[^A-Za-z0-9]/g, "");
  return `evt_${suffix}`;
}

export function stripeSessionId(tag = "cc") {
  return `cs_${tag}_${randomUUID().replaceAll("-", "")}`;
}

export async function recordEvent(eventId, type, projection) {
  const r = await roleQuery(
    "clara_stripe_webhook",
    "select clara.record_stripe_event(p_event_id=>$1,p_type=>$2,p_projection=>$3::jsonb) as result",
    [eventId, type, JSON.stringify(projection)]);
  return r.rows[0].result;
}

export async function applyEvents(limit = 100) {
  const r = await roleQuery(
    "clara_stripe_webhook", "select clara.apply_stripe_events(p_limit=>$1) as result", [limit]);
  return r.rows[0].result;
}

/** Record one event for `intent` and sweep it, returning the applier's own counters.
 *
 *  IT DRAINS FIRST, AND THAT IS LOAD-BEARING. `clara.apply_stripe_events` sweeps the WHOLE estate,
 *  so a cell that asserts `{examined: 1, …}` is really asserting "nothing else in this database is
 *  pending" — which is true in a focused run and false the moment `checkout-gate-c2`'s battery has
 *  run before this one in the same package sweep. The pre-drain makes every counter below a
 *  statement about THIS event, which is the only statement these cells mean to make. It is safe
 *  because the package runs files sequentially (`--test-concurrency=1`): a prior file's events are
 *  already settled, and settled events are excluded from the window anyway. */
export async function deliver({ type, intent, registration, applicant, session, event = null,
  projection = {} } = {}) {
  await applyEvents(500);
  const id = event ?? stripeEventId("cc");
  await recordEvent(id, type, {
    livemode: false, session_id: session, intent_id: intent, registration_id: registration,
    applicant, currency: "myr", amount_total: 0, ...projection,
  });
  return { event: id, result: await applyEvents() };
}

export async function problemsFor(event) {
  const r = await rootQuery(
    `select problem, detail, resolved_at from clara.stripe_event_problems
      where event_id=$1 order by problem`, [event]);
  return r.rows;
}

export async function applicationFor(event) {
  const r = await rootQuery(
    "select outcome, intent_id from clara.stripe_event_applications where event_id=$1", [event]);
  return r.rows[0] ?? null;
}

export async function paymentsFor(registration) {
  const r = await rootQuery(
    `select id, stripe_event_id, stripe_session_id, consumed_at
       from clara.firm_registration_payments where registration_id=$1
      order by recorded_at, id`, [registration]);
  return r.rows;
}

// ===========================================================================================
// 4 · Intent state helpers. `clara.checkout_intents` grants every application role NOTHING,
//     permanently (checkout-gate design part 2 §1), so a state READ or a raw transition is a
//     root act by construction — exactly as checkout-gate-c1's own c1.8 drives the 0158 wall.
// ===========================================================================================

export async function intentState(id) {
  const r = await rootQuery(
    `select status, status_at, status_reason, session_id, registration_id, applicant
       from clara.checkout_intents where id=$1`, [id]);
  return r.rows[0] ?? null;
}

export async function intentsOf(registration) {
  const r = await rootQuery(
    `select id, status, session_id from clara.checkout_intents
      where registration_id=$1 order by opened_at, id`, [registration]);
  return r.rows;
}

/** The first session stamp, driven exactly as `clara.record_checkout_session` drives it: one
 *  UPDATE that names `session_id` and NOTHING else. The transition is the trigger's. */
export async function stampSession(intent, session = null) {
  const value = session ?? stripeSessionId("stamp");
  await rootQuery("update clara.checkout_intents set session_id=$2 where id=$1", [intent, value]);
  return value;
}

/** Move `intent` to `status` by a bare status write (root). Every caller below walks only
 *  ADMITTED moves, so a raise here is a real finding rather than the fixture's own fault. */
export async function forceStatus(intent, status, reason = null) {
  await rootQuery(
    "update clara.checkout_intents set status=$2, status_reason=$3 where id=$1",
    [intent, status, reason]);
}

// ===========================================================================================
// 5 · Capacity wrappers.
// ===========================================================================================

export async function setCapacity(owner, { maxFirms, reason = "#628 rig", opKey = null } = {}) {
  const r = await humanQuery(owner, namedCall("set_admission_capacity", [
    { name: "p_max_firms", cast: "integer" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [maxFirms, reason, opKey ?? opk("cc-cap")]);
  return r.rows[0].result;
}

export async function getCapacity(sub) {
  const r = await humanQuery(sub, "select clara.get_admission_capacity() as result");
  return r.rows[0].result;
}

/** The capacity state read straight from the relation + firms, so a cell can pin the boundary
 *  WITHOUT trusting the door it is about to exercise. */
export async function rawCapacity() {
  const r = await rootQuery(
    `select (select max_firms from clara.admission_capacity where id) as max_firms,
            (select count(*)::int from clara.firms where not is_operator) as firms_count`);
  return r.rows[0];
}

/** Release the estate: capacity back to unlimited. Call from after(), always. */
export async function releaseCapacity(owner) {
  try {
    await setCapacity(owner, { maxFirms: null, reason: "#628 rig release", opKey: opk("cc-release") });
  } catch {
    // A failed release is reported by the next cell's own read rather than swallowed silently
    // here; this path exists so an after() hook cannot mask the real failure with a second one.
    await rootQuery("update clara.admission_capacity set max_firms=null where id");
  }
}

// ===========================================================================================
// 6 · Door wrappers.
// ===========================================================================================

export async function cancelIntent(sub, intent, opKey = null) {
  const r = await humanQuery(sub, namedCall("cancel_checkout_intent", [
    { name: "p_intent", cast: "uuid" }, { name: "p_op_key", cast: "text" },
  ]), [intent, opKey ?? opk("cc-cancel")]);
  return r.rows[0].result;
}

export async function ownIntentSession(sub, registration) {
  const r = await humanQuery(sub,
    "select * from clara.get_own_checkout_intent_session($1)", [registration]);
  return r.rows;
}

export async function ownProgress(sub, registration) {
  const r = await humanQuery(sub,
    "select * from clara.get_own_checkout_progress($1)", [registration]);
  return r.rows[0] ?? null;
}

// ===========================================================================================
// 7 · Whole-world builders.
// ===========================================================================================

/** An applicant who has accepted BOTH current legal kinds and holds one open registration and
 *  one OPEN checkout intent through the real `clara.open_checkout_intent` door. */
export async function openedCheckout(owner, { tag = "cc" } = {}) {
  const sub = await insertUser("cc", tag);
  const email = await userEmail(sub);
  await acceptBoth(owner, sub, { tag: `${tag}-${randomUUID().slice(0, 8)}` });
  const registration = await insertRegistration(sub, tag);
  const opened = await openIntent(sub, email, registration.id);
  return { sub, email, registration: registration.id, firmName: registration.firm_name,
    intent: opened.intent_id };
}

/** …and its session stamped, i.e. an intent in `session_created` with a live Stripe session. */
export async function liveCheckout(owner, { tag = "cc" } = {}) {
  const world = await openedCheckout(owner, { tag });
  const session = await stampSession(world.intent, stripeSessionId(tag));
  return { ...world, session };
}

/** The applicant's own backend pid on a dedicated client, inside an open transaction. */
export async function beginApplicantTxn(client, sub, email) {
  await client.query(`set role ${ROLES.authenticated}`);
  await client.query("begin");
  await client.query("select set_config('request.jwt.claims',$1,true)",
    [JSON.stringify({ sub, role: "authenticated", email })]);
  return Number((await client.query("select pg_backend_pid() as pid")).rows[0].pid);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll (bounded) until backend `pid` is observably WAITING on a lock held by `blockerPid`, and
 *  return the wait_event that proves WHICH lock. The house idiom (legal-acceptance.test.mjs,
 *  binding-proposal-pr-1-helpers.mjs) — never a sleep, which proves nothing about whether the
 *  block actually happened. */
export async function waitBlockedByOrThrow(pid, blockerPid, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      `select wait_event_type as wet, wait_event as we, pg_blocking_pids(pid) as blockers
         from pg_stat_activity where pid = $1`, [pid]);
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) {
      return row.we;
    }
    await sleep(25);
  }
  throw new Error(
    `waitBlockedByOrThrow: backend ${pid} never observably blocked on ${blockerPid} within ${timeoutMs}ms`);
}
