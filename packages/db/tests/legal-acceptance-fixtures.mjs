// #621 — VERSIONED LEGAL CONTENT AND ACCEPTANCE: the battery's frontier gate and verb wrappers
// (NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// THE FRONTIER GATE keys on 0185's STABLE STEM (`legal_acceptance$`), never its number — numbers
// are claimed at MERGE (standing law), and the `db-slice-frontiers` matrix runs this package
// against databases pinned at EARLIER frontiers, where `clara.legal_documents` does not exist and
// an unconditional assertion would red the leg while saying nothing about the thing under test.
// This is #630's `gateCancel` idiom; no `*-preintegration-gate.mjs` preload is added, for the same
// reason #630 added none: that mechanism exists for a cohort whose migration may be ABSENT from a
// focused run's chain, and 0185 sits AT the repository frontier.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (0185 §E):
//
//   clara.accept_legal_document(p_kind, p_version, p_body_sha256, p_op_key)
//        -> {status: accepted|already_accepted, kind, version, body_sha256, accepted_at,
//            acceptance_id}
//   clara.publish_legal_document(p_kind, p_title, p_body, p_source_path, p_effective_from, p_op_key)
//        -> {status: published, kind, version, body_sha256, published_at, superseded_version}
//   clara.get_current_legal_documents()
//        -> setof (kind, version, status, title, body, body_sha256, effective_from, published_at,
//                  accepted_at, accepted_version)

import { createHash, randomUUID } from "node:crypto";
import {
  CLR, PG, ROLES, assertRaises, endPool, humanQuery, insertUser, namedCall, opk, roleQuery,
  rootQuery, withActor,
} from "./rig-fixtures.mjs";
import { clearOperator, markOperator } from "./p4t2-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export {
  CLR, PG, ROLES, assertRaises, clearOperator, endPool, humanQuery, insertUser, markOperator,
  namedCall, opk, roleQuery, rootQuery, withActor,
};

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** 0185's STABLE STEM. */
export const LEGAL_STEM = "legal_acceptance$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function legalLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [LEGAL_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateLegal(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateLegal(t) {
  if (await legalLaneReady()) return false;
  markSkip();
  t.skip(`#621 legal-acceptance lane absent (no ${LEGAL_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on (0185 §E's roster).
// ===========================================================================================

export const LEGAL_REASON = {
  noActor: "no_actor",
  unknownActor: "unknown_actor",
  agentActor: "agent_actor",
  invalidOpKey: "invalid_op_key",
  invalidKind: "invalid_kind",
  opKeyConflict: "op_key_conflict",
  hashMismatch: "hash_mismatch",
  notPublished: "not_published",
  staleVersion: "stale_version",
  identicalBody: "identical_body",
  emptyBody: "empty_body",
  notOperatorFirm: "not_operator_firm",
  operationInFlight: "operation_in_flight",
  unknownVersion: "unknown_version",
  legalNotAccepted: "legal_not_accepted",
  immutable: "legal_document_immutable",
  transition: "legal_document_transition",
};

/** The parsed `detail` of a refusal. Every 0185 door carries one (post-0178 house convention). */
export function detailOf(error) {
  try {
    return JSON.parse(error.detail);
  } catch {
    return null;
  }
}

/** Assert (SQLSTATE, detail.reason) as ONE pair — a right code with the wrong reason is a defect. */
export async function assertPair(code, reason, fn, label = "operation") {
  const error = await assertRaises(code, fn, label);
  const detail = detailOf(error);
  if (detail?.reason !== reason) {
    throw new Error(
      `${label}: expected detail.reason ${reason}, got ${JSON.stringify(error.detail)} — ${error.message}`);
  }
  return { error, detail };
}

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES.
// ===========================================================================================

export const sha256Hex = (body) => createHash("sha256").update(body, "utf8").digest("hex");
export const sha256Bytes = (body) => createHash("sha256").update(body, "utf8").digest();
export const bodyText = (tag) => `#621 ${tag} body ${randomUUID()}`;

/** A human call that also carries an `email` claim (claim_paid_firm needs one). */
export async function asApplicant(sub, email, sql, params = []) {
  return withActor({ role: ROLES.authenticated, jwtSub: sub, transaction: true }, async (c) => {
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub, role: "authenticated", email }),
    ]);
    return c.query(sql, params);
  });
}

export async function publishLegal(owner, { kind, title = null, body, sourcePath = null,
  effectiveFrom = null, opKey = null } = {}) {
  const r = await humanQuery(owner, namedCall("publish_legal_document", [
    { name: "p_kind", cast: "text" }, { name: "p_title", cast: "text" },
    { name: "p_body", cast: "text" }, { name: "p_source_path", cast: "text" },
    { name: "p_effective_from", cast: "timestamptz" }, { name: "p_op_key", cast: "text" },
  ]), [kind, title ?? `#621 ${kind}`, body, sourcePath ?? `docs/ops/legal/${kind}.md`,
    effectiveFrom, opKey ?? opk("w621-publish")]);
  return r.rows[0].result;
}

export async function acceptLegal(sub, { kind, version, sha = null, body = null, opKey = null } = {}) {
  const r = await humanQuery(sub, namedCall("accept_legal_document", [
    { name: "p_kind", cast: "text" }, { name: "p_version", cast: "integer" },
    { name: "p_body_sha256", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [kind, version, sha ?? sha256Hex(body ?? ""), opKey ?? opk("w621-accept")]);
  return r.rows[0].result;
}

/** The caller's own view of the current legal state, keyed by kind. */
export async function currentLegal(sub) {
  const r = await humanQuery(sub, "select * from clara.get_current_legal_documents()");
  return new Map(r.rows.map((row) => [row.kind, row]));
}

/** Publish BOTH kinds and accept BOTH as `sub` — the state every checkout cell needs. */
export async function acceptBoth(owner, sub, { tag = "both" } = {}) {
  const docs = {};
  for (const kind of ["terms", "dpa"]) {
    const body = bodyText(`${tag}-${kind}`);
    const published = await publishLegal(owner, { kind, body, opKey: opk(`w621-${tag}-${kind}`) });
    docs[kind] = { ...published, body, sha: sha256Hex(body) };
    await acceptLegal(sub, { kind, version: published.version, sha: docs[kind].sha });
  }
  return docs;
}

// ===========================================================================================
// 4 · The world the checkout cells need. Each verb is a REAL door where the estate has one.
// ===========================================================================================

let _operator = null;
/** The operator firm's OWNER — the only identity `publish_legal_document` admits. Cached: the
 *  estate allows ONE operator firm at a time and `markOperator` serialises on it. */
export async function ensureOperatorOwner() {
  if (_operator) return _operator;
  const owner = await insertUser("w621", "operator");
  const firm = await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`w621_operator_${randomUUID()}`]);
  await rootQuery("insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'owner')",
    [firm.rows[0].id, owner]);
  await markOperator(firm.rows[0].id);
  _operator = { owner, firm: firm.rows[0].id };
  return _operator;
}

/** An ordinary (non-operator) firm with `user` in `role` — the publish door's negative fixtures. */
export async function ordinaryFirm(user, role = "owner") {
  const firm = await rootQuery("insert into clara.firms(name) values ($1) returning id",
    [`w621_plain_${randomUUID()}`]);
  await rootQuery("insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,$3)",
    [firm.rows[0].id, user, role]);
  return firm.rows[0].id;
}

export async function userEmail(user) {
  const r = await rootQuery("select lower(email) as email from clara.users where id=$1", [user]);
  return r.rows[0].email;
}

export async function insertRegistration(applicant, tag = "w621") {
  const r = await rootQuery(
    `insert into clara.firm_registration_requests(applicant,firm_name,note,op_key)
     values ($1,$2,'#621 legal-acceptance rig',$3) returning id,firm_name`,
    [applicant, `${tag}_${randomUUID().slice(0, 8)}`, opk(tag)]);
  return r.rows[0];
}

/** The current billing plan mapped to a Stripe price — `open_checkout_intent`'s two lookups. */
export async function ensurePriceMap() {
  const plan = await rootQuery("select local_key from clara.billing_plans where is_current");
  const localKey = plan.rows[0].local_key;
  await rootQuery(
    `insert into clara.stripe_object_map(object_kind,local_key,stripe_id)
     values ('price',$1,$2) on conflict (object_kind,local_key) do nothing`,
    [localKey, `price_${randomUUID().replaceAll("-", "")}`]);
  return localKey;
}

export const originDigest = (label) =>
  createHash("sha256").update(`${label}:${randomUUID()}`, "utf8").digest();

export async function openIntent(sub, email, registration, origin = null) {
  await ensurePriceMap();
  const r = await asApplicant(sub, email,
    "select clara.open_checkout_intent(p_registration=>$1,p_origin_digest=>$2,p_op_key=>$3) as result",
    [registration, origin ?? originDigest("w621"), opk("w621-open")]);
  return r.rows[0].result;
}

export async function intentRow(id) {
  const r = await rootQuery(
    "select dpa_version,terms_version,dpa_kind,terms_kind,session_id from clara.checkout_intents where id=$1",
    [id]);
  return r.rows[0];
}

/** A paid registration: a recorded Stripe event and a firm_registration_payments row against an
 *  intent the caller supplies (so a cell can pin an intent's versions deliberately, including a
 *  pre-0185 shape with a NULL terms_version inserted as root). */
export async function payFor({ registration, applicant, intent }) {
  const session = (await rootQuery("select session_id from clara.checkout_intents where id=$1",
    [intent])).rows[0].session_id
    ?? await (async () => {
      const s = `cs_w621_${randomUUID().replaceAll("-", "")}`;
      await rootQuery("update clara.checkout_intents set session_id=$2 where id=$1", [intent, s]);
      return s;
    })();
  const event = `evt_w621_${randomUUID().replaceAll("-", "")}`;
  await roleQuery("clara_stripe_webhook",
    "select clara.record_stripe_event(p_event_id=>$1,p_type=>$2,p_projection=>$3::jsonb) as result",
    [event, "checkout.session.completed", JSON.stringify({
      livemode: false, session_id: session, intent_id: intent, registration_id: registration,
      applicant, amount_total: 0, currency: "myr", payment_status: "paid", mode: "payment",
      session_status: "complete",
    })]);
  const payment = await rootQuery(
    `insert into clara.firm_registration_payments(
       registration_id,applicant,stripe_event_id,stripe_session_id,stripe_customer_id)
     values ($1,$2,$3,$4,$5) returning id`,
    [registration, applicant, event, session, `cus_${randomUUID().replaceAll("-", "")}`]);
  return { session, event, payment: payment.rows[0].id };
}

/** Insert a checkout intent directly as root — the ONLY way to build a PRE-0185 shape (a NULL
 *  terms pin), which `open_checkout_intent` can no longer produce. */
export async function rootIntent({ registration, applicant, dpaVersion, termsVersion = null }) {
  const localKey = await ensurePriceMap();
  const r = await rootQuery(
    `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version,terms_version)
     values ($1,$2,$3,$4,$5) returning id`,
    [registration, applicant, localKey, dpaVersion, termsVersion]);
  return r.rows[0].id;
}

export async function claimPaidFirm(sub, email, registration, opKey = null) {
  const r = await asApplicant(sub, email,
    "select clara.claim_paid_firm(p_registration=>$1,p_op_key=>$2) as result",
    [registration, opKey ?? opk("w621-claim")]);
  return r.rows[0].result;
}
