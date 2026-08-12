// Wave-B rig — migration-0020 (typed egress consent + dispatch authorization)
// shared helper CORE (NOT a test file: the name does not end in `.test.mjs`, so
// `node --test` ignores it). Written by the CONTRACT-BLIND test lane straight
// from `docs/plan/completed/wave-b-migration-0020-design.md` v1.0 (RATIFIED) — the 0020 SQL
// and its runtime rewire are NEVER read (ADR-029/ADR-037 discipline). A divergence
// between an expectation here and observed 0020 behaviour is a FINDING for
// orchestrator adjudication, never a silent test edit.
//
// READINESS lives in wb-helpers.mjs (has0020 / wbEnsureReady20 / fail0020), beside
// has0019/fail0019, and reaches every test file through the wb-fixtures star. This
// battery must FAIL — not skip — against a 19-migration DB.
//
// PINNED NAMED-ARG SIGNATURES (§3.3/§3.4/§5.1/§5.3/§7.1). The contract gives arg
// NAMES for the four owner RPCs and an explicit signature only for the four runtime
// fns (§3.3/§3.4/§5.1/§5.3, re-stated as exact-signature guards in §10.2). The
// owner-RPC arg TYPES below are this lane's reading of §1.2/§2.2/§7.1 — a 42883 /
// param-name / arity divergence at build time is a FINDING, not a fix.
//
// AMBIGUITY LEDGER (each marked [A20-n] at its use site; the lane report lists all):
//   A20-1  Foreign-firm EVIDENCE document code. §9.1 "foreign-firm evidence
//          document -> CLR28" vs §7.1 "client/document-not-in-firm is CLR11".
//   A20-2  An OFF-ENUM purpose on grant_client_egress_purpose: §7.1 makes argument
//          validation CLR10; §9.1 says "the purpose CHECK rejects an off-enum
//          purpose string", which reads as a raw 23514.
//   A20-3  Does prepare_egress_dispatch VALIDATE (p_event_seq, p_event_type)
//          against clara.domain_events? §3.2 calls them "dispatch intent"; §8 pins
//          no FK. Encoded: pass a REAL (seq,type) pair so BOTH readings pass.
//   A20-4  §5.4's `skipped_unclassified` gate vs §5.3's zero/one/many outcomes —
//          the ORDER is unstated, so a never-classified document with ZERO filings
//          is contract-ambiguous. Only the unambiguous input is asserted strictly.
//   A20-5  §3.5 says deactivate invalidates "every authorization row for that
//          consent"; §7.1 says deactivate invalidates "unconsumed authorizations".
//          Consent-grain vs activation-grain — indistinguishable today (one live
//          activation per consent), separable only across a re-activation.
//   A20-6  §4.2 makes legacy egress.consent_* CHECKPOINT-ONLY for wiki but names
//          NO replacement receipt token (§9.6 lists none). DB-observable state
//          (no hold set, no hold cleared) is asserted instead of a token.
//   A20-7  §1.3 pins the evidence document's firm/kind/verified but is silent on
//          `status='ingested'` (the legacy writer, 0014, asserts it). Fixtures mint
//          documents that satisfy BOTH readings.

import {
  ROLES, rootQuery, roleQuery, humanQuery, opk, getPool,
  seedVerifiedDocument, waitBlockedByOrThrow,
} from "./wb-fixtures.mjs";

export * from "./wb-fixtures.mjs";

// ---------------------------------------------------------------------------
// Pinned vocabulary (design §0/§1/§3/§4/§5/§10). LAW — divergence = finding.
// ---------------------------------------------------------------------------

/** §0/§1.2 — the ONLY typed purpose the CHECK admits (single-valued). */
export const WIKI_PURPOSE = "wiki_synthesis";

/** §1.2/§2.2/§3.2 — the three new relations (separate from the legacy table). */
export const TYPED_CONSENT_TABLE = "client_egress_purpose_consents";
export const TYPED_ACTIVATION_TABLE = "client_egress_purpose_activations";
export const DISPATCH_AUTH_TABLE = "egress_dispatch_authorizations";
export const NEW_RELATIONS = [TYPED_CONSENT_TABLE, TYPED_ACTIVATION_TABLE, DISPATCH_AUTH_TABLE];

/** §6 — the LEGACY relation 0020 must leave byte-identical. */
export const LEGACY_CONSENT_TABLE = "client_egress_consents";

/** §4.1 — the four purpose-discriminated event types (all client-scoped). */
export const PURPOSE_EVENT_TYPES = [
  "egress.purpose_consent_granted", "egress.purpose_consent_revoked",
  "egress.purpose_activated", "egress.purpose_deactivated",
];
/** The LEGACY (null-purpose) consent events — §4.2 makes them checkpoint-only. */
export const LEGACY_EVENT_TYPES = ["egress.consent_granted", "egress.consent_revoked"];

/** §3.3/§3.4/§5.1/§5.3 + §10.2 — the four runtime-only DEFINER fns, EXACT sigs. */
export const RUNTIME_FNS = {
  prepare_egress_dispatch: "clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)",
  // RATIFIED §3.4 AMENDMENT (2026-07-25, ratchet R1-F1): SIX arguments. v1.0 pinned
  // (p_firm, p_authorization) and validated only firm + liveness, which made §3.2's
  // client/purpose/event binding AUDIT DATA — an authorization minted for client A was
  // consumable during a client-B dispatch and the DB could not tell. Consumption now
  // re-verifies the dispatch it is being used for.
  consume_egress_dispatch: "clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)",
  resolve_document_client: "clara.resolve_document_client(uuid,uuid)",
  resolve_and_ingest_wiki_source: "clara.resolve_and_ingest_wiki_source(uuid,uuid)",
};
/** §7.1 — the owner-floored RPCs (clara_authenticated ONLY) + read sigs. FIVE after the
 *  2026-07-25 ratified amendment: classify_consent_evidence_document (ratchet R1-F3) is the
 *  owner path that stamps document_kind='consent_evidence' and grants NO egress. Without it
 *  the only live writer of that stamp was the LEGACY grant_client_egress, which in the same
 *  call authorizes purpose-blind invoice-facts egress — so a client who consented ONLY to wiki
 *  synthesis could not be onboarded without being granted egress they never agreed to. */
export const OWNER_FNS = {
  classify_consent_evidence_document: "clara.classify_consent_evidence_document(uuid,text,text)",
  grant_client_egress_purpose: "clara.grant_client_egress_purpose(uuid,text,uuid,text,text)",
  activate_client_egress_purpose: "clara.activate_client_egress_purpose(uuid,text,uuid,text)",
  deactivate_client_egress_purpose: "clara.deactivate_client_egress_purpose(uuid,text,text,text)",
  revoke_client_egress_purpose: "clara.revoke_client_egress_purpose(uuid,text,text,text)",
};
export const ALL_0020_FN_NAMES = [...Object.keys(RUNTIME_FNS), ...Object.keys(OWNER_FNS)];
export const ALL_0020_FN_SIGS = [...Object.values(RUNTIME_FNS), ...Object.values(OWNER_FNS)];

/** §3.7/§10.1 — the UNCHANGED hold reason token every non-granted verdict records
 *  (the load-bearing DARK equality: byte-identical to as-built, which today is
 *  `wiki synthesis consent ` + resolveConsentDefault's 42501 verdict 'unknown'). */
export const HELD_REASON = "wiki synthesis consent unknown";

/** §3.2 — the single named TTL constant (asserted present in source by §8). */
export const TTL_SECONDS = 120;

/** §3.3 — the exact NON-GRANTED verdict payload (two keys, always). */
export const UNKNOWN_VERDICT = { verdict: "unknown", authorization_id: null };
/** §3.4 — consume returns ONE key. */
export const CONSUME_GRANTED = { verdict: "granted" };
export const CONSUME_UNKNOWN = { verdict: "unknown" };

/** §5.1 — the uniform not-found the resolver returns for EVERY unresolved input. */
export const UNRESOLVED = { status: "unresolved" };
export const AMBIGUOUS = { status: "ambiguous" };

/** §5.3/§5.4/§9.6 — the resolve-and-ingest receipt vocabulary. */
export const INGEST_STATUS = {
  projected: "projected",
  unresolved: "skipped_unresolved_client",
  ambiguous: "skipped_ambiguous_client",
  unclassified: "skipped_unclassified",
};

/** §3.3 — the STRUCTURAL return-key allowlist. Anything here appearing in a
 *  prepare/consume/resolve return is existence leakage (§3.3, asserted by §8/§9). */
export const FORBIDDEN_RETURN_KEYS = [
  "granted_at", "consent_id", "activation_id", "evidence_document_id", "scope_note",
  "granted_by", "revoke_reason", "revoked_at", "expires_at", "issued_at",
  "candidates", "candidates_n", "count", "n", "history", "purpose",
];
/** §3.3 — the deleted token. It must appear in NO 0020 function source. */
export const DELETED_VERDICT_TOKEN = "denied";

/** §1.3 — the document kind a typed grant's evidence MUST already carry. */
export const CONSENT_EVIDENCE_KIND = "consent_evidence";

/** 0017 — the slug record_wiki_source_ingest publishes a source page under. */
export const sourceSlug = (document) => `sources/${document}`;

// ---------------------------------------------------------------------------
// Owner RPC wrappers (§7.1) — human lane, owner floor. Distinct names from the
// design's planned wave-a-fixtures helpers (grantClientEgressPurpose, …) so this
// blind module never collides with the SQL lane's parallel additions.
// ---------------------------------------------------------------------------

/** The OWNER evidence-classification verb (§7.1, 2026-07-25 amendment). Stamps
 *  document_kind='consent_evidence' on a verified in-firm document and grants NOTHING. */
export async function classifyConsentEvidence(sub, { document, reason = "rig signed consent letter", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.classify_consent_evidence_document(p_document => $1, p_reason => $2,
       p_op_key => $3) as r`,
    [document, reason, opKey ?? opk("cce")]);
  return r.rows[0].r;
}

export async function grantPurpose(sub, {
  client, purpose = WIKI_PURPOSE, evidenceDocument, scopeNote = "rig typed consent", opKey = null,
}) {
  const r = await humanQuery(sub,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_evidence_document => $3, p_scope_note => $4, p_op_key => $5) as r`,
    [client, purpose, evidenceDocument, scopeNote, opKey ?? opk("gpc")]);
  return r.rows[0].r;
}

export async function activatePurpose(sub, { client, purpose = WIKI_PURPOSE, consent, opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_consent => $3, p_op_key => $4) as r`,
    [client, purpose, consent, opKey ?? opk("apa")]);
  return r.rows[0].r;
}

export async function deactivatePurpose(sub, { client, purpose = WIKI_PURPOSE, reason = "rig pause", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.deactivate_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_reason => $3, p_op_key => $4) as r`,
    [client, purpose, reason, opKey ?? opk("dpa")]);
  return r.rows[0].r;
}

export async function revokePurpose(sub, { client, purpose = WIKI_PURPOSE, reason = "rig withdrawal", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.revoke_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_reason => $3, p_op_key => $4) as r`,
    [client, purpose, reason, opKey ?? opk("rpc")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Runtime DEFINER wrappers (§3.3/§3.4/§5.1/§5.3) — `role` overridable so the ACL
// cells can drive the refused lanes (clara_authenticated, clara_agent_ro, wakes).
// ---------------------------------------------------------------------------

/** [A20-3] `eventSeq`/`eventType` default to a REAL pair when `firm` is passed
 *  through eventOf(); callers that need a synthetic pair pass it explicitly. */
export async function prepareDispatch({
  firm, client, purpose = WIKI_PURPOSE, eventSeq = 1, eventType = "entry.approved", role = ROLES.runtime,
}) {
  const r = await roleQuery(role,
    `select clara.prepare_egress_dispatch(p_firm => $1, p_client => $2, p_purpose => $3,
       p_event_seq => $4::bigint, p_event_type => $5) as r`,
    [firm, client, purpose, eventSeq, eventType]);
  return r.rows[0].r;
}

/** §3.4 (2026-07-25 amendment). Consumption re-presents the FULL dispatch intent, so the DB can
 *  re-verify that this authorization was minted for exactly this (firm, client, purpose, event).
 *  Pass `intent` (what `prepareBound` returns) for the ordinary case; pass individual fields to
 *  drive a deliberate MISMATCH — those cells are the ones that prove the binding is enforced and
 *  not merely recorded. Every field defaults from `intent` when present. */
export async function consumeDispatch({
  firm, authorization, intent = null, client, purpose, eventSeq, eventType, role = ROLES.runtime,
}) {
  const i = intent ?? {};
  const r = await roleQuery(role,
    `select clara.consume_egress_dispatch(p_firm => $1, p_authorization => $2, p_client => $3,
       p_purpose => $4, p_event_seq => $5::bigint, p_event_type => $6) as r`,
    [firm ?? i.firm ?? null, authorization,
      client ?? i.client ?? null,
      purpose ?? i.purpose ?? WIKI_PURPOSE,
      eventSeq ?? i.eventSeq ?? null,
      eventType ?? i.eventType ?? null]);
  return r.rows[0].r;
}

export async function resolveDocClient({ firm, document, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    "select clara.resolve_document_client(p_firm => $1, p_document => $2) as r",
    [firm, document]);
  return r.rows[0].r;
}

export async function resolveIngest({ firm, document, role = ROLES.runtime }) {
  const r = await roleQuery(role,
    "select clara.resolve_and_ingest_wiki_source(p_firm => $1, p_document => $2) as r",
    [firm, document]);
  return r.rows[0].r;
}

/** prepare with a REAL dispatch-intent pair drawn from the firm's event head. Returns the DB
 *  payload VERBATIM — the leakage cells compare it byte-for-byte, so nothing may be added. */
export async function prepareForLatestEvent({ firm, client, purpose = WIKI_PURPOSE, role = ROLES.runtime }) {
  const ev = await latestEventOf(firm);
  return prepareDispatch({ firm, client, purpose, eventSeq: ev.seq, eventType: ev.eventType, role });
}

/** prepare, PLUS the exact intent it was prepared for, so the caller can present the SAME intent
 *  at consume (§3.4, 2026-07-25 amendment). Returns { verdict, intent } — a LOCAL test-lane shape;
 *  `verdict` is the untouched DB payload. Prefer this wherever a cell goes on to consume: reading
 *  the intent back off the authorization row would make every cell agree with the row by
 *  construction, which is exactly the check that must not be vacuous. */
export async function prepareBound({
  firm, client, purpose = WIKI_PURPOSE, eventSeq = null, eventType = null, role = ROLES.runtime,
}) {
  const ev = (eventSeq == null || eventType == null)
    ? await latestEventOf(firm)
    : { seq: eventSeq, eventType };
  const verdict = await prepareDispatch({
    firm, client, purpose, eventSeq: ev.seq, eventType: ev.eventType, role });
  return { verdict, intent: { firm, client, purpose, eventSeq: ev.seq, eventType: ev.eventType } };
}

// ---------------------------------------------------------------------------
// Root readbacks (superuser bypasses RLS — fixtures/asserts only, never a lane).
// ---------------------------------------------------------------------------

const rowsOf = async (sql, params) => (await rootQuery(sql, params)).rows.map((x) => x.row);
const row1 = async (sql, params) => (await rootQuery(sql, params)).rows[0]?.row ?? null;

export const purposeConsentRows = (client, purpose = WIKI_PURPOSE) =>
  rowsOf(`select to_jsonb(c) as row from clara.${TYPED_CONSENT_TABLE} c
            where c.client_id=$1 and c.purpose=$2 order by c.granted_at, c.id`, [client, purpose]);
export const livePurposeConsent = (client, purpose = WIKI_PURPOSE) =>
  row1(`select to_jsonb(c) as row from clara.${TYPED_CONSENT_TABLE} c
          where c.client_id=$1 and c.purpose=$2 and c.revoked_at is null
          order by c.granted_at desc limit 1`, [client, purpose]);
export const purposeActivationRows = (client, purpose = WIKI_PURPOSE) =>
  rowsOf(`select to_jsonb(a) as row from clara.${TYPED_ACTIVATION_TABLE} a
            where a.client_id=$1 and a.purpose=$2 order by a.activated_at, a.id`, [client, purpose]);
export const livePurposeActivation = (client, purpose = WIKI_PURPOSE) =>
  row1(`select to_jsonb(a) as row from clara.${TYPED_ACTIVATION_TABLE} a
          where a.client_id=$1 and a.purpose=$2 and a.deactivated_at is null
          order by a.activated_at desc limit 1`, [client, purpose]);
export const authorizationRow = (id) =>
  row1(`select to_jsonb(a) as row from clara.${DISPATCH_AUTH_TABLE} a where a.id=$1`, [id]);
export const authorizationsForConsent = (consentId) =>
  rowsOf(`select to_jsonb(a) as row from clara.${DISPATCH_AUTH_TABLE} a
            where a.consent_id=$1 order by a.issued_at, a.id`, [consentId]);
export const authorizationsForClient = (client) =>
  rowsOf(`select to_jsonb(a) as row from clara.${DISPATCH_AUTH_TABLE} a
            where a.client_id=$1 order by a.issued_at, a.id`, [client]);
export const countRows = async (table, whereSql = "", params = []) => {
  const r = await rootQuery(`select count(*)::int n from clara.${table} ${whereSql}`, params);
  return r.rows[0].n;
};
/** LIVE legacy (null-purpose) consent rows for a client — the §6 invariant. */
export const liveLegacyConsentCount = (client) =>
  countRows(LEGACY_CONSENT_TABLE, "where client_id=$1 and revoked_at is null", [client]);

/** ACTIVE filings of a document, distinct clients (the resolver's own universe). */
export const activeFilingClients = async (document) => (await rootQuery(
  `select distinct client_id from clara.document_filings
     where document_id=$1 and retired_at is null order by client_id`, [document]
)).rows.map((x) => x.client_id);

/** The one filing row of (document, client) — retire needs its revision_token. */
export const filingRowOf = (document, client) =>
  row1(`select to_jsonb(f) as row from clara.document_filings f
          where f.document_id=$1 and f.client_id=$2 and f.retired_at is null
          order by f.filed_at desc limit 1`, [document, client]);

/** Every wiki page version of the deterministic source page for a document. */
export async function sourcePageVersions(client, document) {
  const { pageRow, versionRows } = await import("./wb-calls.mjs");
  const p = await pageRow(client, sourceSlug(document));
  return p ? { page: p, versions: await versionRows(p.id) } : { page: null, versions: [] };
}

/** Model-lane publications for a client (the DARK claim's zero-count surface). */
export const modelVersionCount = async (client) => (await rootQuery(
  `select count(*)::int n from clara.wiki_page_versions v
     join clara.wiki_pages p on p.id=v.page_id
    where p.client_id=$1 and v.synthesis='model'`, [client])).rows[0].n;

// ---------------------------------------------------------------------------
// Catalog / ACL probes (§8 tail mirrors, §9.5 closed set).
// ---------------------------------------------------------------------------

/** to_regprocedure of an EXACT signature — §10.2's guard shape (NOT to_regproc,
 *  which takes a bare name and cannot distinguish overloads). */
export async function regProcedure(sig) {
  const r = await rootQuery("select to_regprocedure($1)::text as reg", [sig]);
  return r.rows[0].reg ?? null;
}

/** Every property §8 pins per function, by EXACT signature. */
export async function fnFacts(sig) {
  const r = await rootQuery(
    `select p.prosecdef as secdef, pg_get_userbyid(p.proowner) as owner,
            p.proconfig::text as config, p.prosrc as src,
            pg_get_function_identity_arguments(p.oid) as args,
            pg_get_function_arguments(p.oid) as full_args,
            pg_catalog.pg_get_function_result(p.oid) as result,
            has_function_privilege('public', p.oid, 'execute') as public_exec
       from pg_proc p where p.oid = to_regprocedure($1)`, [sig]);
  return r.rows[0] ?? null;
}

/** Overload count for a bare clara function name (the §8 "exactly one" pins). */
export const overloadCount = async (name) => (await rootQuery(
  `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='clara' and p.proname=$1`, [name])).rows[0].n;

/** Does `role` hold ANY table privilege on clara.<table>? */
export async function anyTableGrant(role, table) {
  const r = await rootQuery(
    `select bool_or(has_table_privilege($1, $2, priv)) as ok
       from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv`,
    [role, `clara.${table}`]);
  return r.rows[0].ok === true;
}

/** The single-audience policy assertion §1.2/§2.2 pin on all three relations. */
export async function policyRoles(table) {
  const r = await rootQuery(
    "select distinct pg_get_userbyid(unnest(polroles)) as role from pg_policy where polrelid=($1::regclass) order by 1",
    [`clara.${table}`]);
  return r.rows.map((x) => x.role);
}

/** Trigger names on a clara relation (immutability + no-truncate pins). */
export const triggerNames = async (table) => (await rootQuery(
  `select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname=$1 and not t.tgisinternal order by 1`, [table]
)).rows.map((x) => x.tgname);

/** Normalized prosrc (comments + whitespace stripped) — the §6 exact-diff pins.
 *  The SAME normalization shape 0019's drift guards use. */
export function normSrc(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Fixtures for the typed lane.
// ---------------------------------------------------------------------------

/** [A20-7] A verified, in-firm consent_evidence document (§1.3): document_kind =
 *  'consent_evidence' AND bytes_verified_at NOT NULL. `_seed_verified_document`
 *  also lands status='ingested', so the fixture satisfies the §1.3 reading AND the
 *  legacy 0014 reading. No filing is required — §1.3 pins only firm + kind +
 *  verified. Returns { documentId, sha256, ... }.
 *
 *  RATCHET R1-F3 (2026-07-25). The document is seeded UNCLASSIFIED and stamped through the
 *  OWNER verb clara.classify_consent_evidence_document — not by handing `kind` to the
 *  superuser seed helper. A fixture that applies the stamp itself proves the typed lane works
 *  only in a world where something else already did the one step the product could not do:
 *  before this amendment the ONLY live writer of document_kind='consent_evidence' was the
 *  legacy grant_client_egress, which in the same call mints a purpose-blind consent
 *  authorizing invoice-facts egress, and set_document_kind refuses the kind outright. So this
 *  fixture is now also the standing proof that lighting wiki synthesis requires NO legacy
 *  consent. `sub` must be an OWNER of `firm`. */
export async function consentEvidenceDoc(sub, { firm }) {
  const seed = await seedVerifiedDocument({ firm });
  await classifyConsentEvidence(sub, { document: seed.documentId });
  return seed;
}

/** Light synthesis for a client the §7.2 runbook way: classify the evidence letter, grant a
 *  typed consent citing it, read the live consent id back, activate it. Returns
 *  { consent, activation, evidence }. Owner-lane throughout (`sub` must be owner). */
export async function lightSynthesis(sub, { firm, client, purpose = WIKI_PURPOSE }) {
  const evidence = await consentEvidenceDoc(sub, { firm });
  await grantPurpose(sub, { client, purpose, evidenceDocument: evidence.documentId });
  const consent = await livePurposeConsent(client, purpose);
  await activatePurpose(sub, { client, purpose, consent: consent.id });
  const activation = await livePurposeActivation(client, purpose);
  return { consent, activation, evidence };
}

/** The latest domain event of a firm (seq + type) — a REAL dispatch-intent pair
 *  for prepare_egress_dispatch, robust whether or not prepare validates it [A20-3]. */
export async function latestEventOf(firm) {
  const r = await rootQuery(
    "select seq::bigint as seq, event_type from clara.domain_events where firm_id=$1 order by seq desc limit 1",
    [firm]);
  return r.rows[0]
    ? { seq: Number(r.rows[0].seq), eventType: r.rows[0].event_type }
    : { seq: 1, eventType: "entry.approved" };
}

/** Domain events of a type for a CLIENT (the §4 purpose-event payload asserts). */
export const clientEventsOf = (client, type) =>
  rowsOf(`select to_jsonb(d) as row from clara.domain_events d
            where d.client_id=$1 and d.event_type=$2 order by d.seq`, [client, type]);

/** Backdate a dispatch authorization's expires_at PAST now, as superuser, with the
 *  immutability trigger disabled for this one session-local fixture write
 *  (session_replication_role='replica' silences user triggers; RLS is already
 *  bypassed for superuser). The ONLY way to exercise consume-after-TTL without a
 *  120-second wall-clock wait. Never used on a lane path — a fixture surgery only. */
export async function backdateAuthExpiry(authId, { seconds = 5 } = {}) {
  const c = await getPool().connect();
  try {
    await c.query("set session_replication_role = replica");
    await c.query(
      `update clara.${DISPATCH_AUTH_TABLE} set expires_at = now() - ($2 || ' seconds')::interval where id=$1`,
      [authId, String(seconds)]);
  } finally {
    await c.query("set session_replication_role = origin").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Set a dispatch authorization's `expires_at` to an EXPLICIT instant (the backdateAuthExpiry
 *  idiom: superuser + session_replication_role='replica' to silence the immutability trigger).
 *  Needed by the stale-transaction cell, which must place expiry BETWEEN a transaction's frozen
 *  now() and the advancing wall clock. Fixture surgery only — never on a lane path. */
export async function setAuthExpiry(authId, expiresAtIso) {
  const c = await getPool().connect();
  try {
    await c.query("set session_replication_role = replica");
    await c.query(
      `update clara.${DISPATCH_AUTH_TABLE} set expires_at = $2::timestamptz where id=$1`,
      [authId, expiresAtIso]);
  } finally {
    await c.query("set session_replication_role = origin").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Clear a document's `bytes_verified_at` — the ONLY way to stage the §1.3 /
 *  §5.1 "bytes-unverified" input, because no writer produces such a document
 *  post-0007 and the documents bytes/storage-bond trigger refuses the update
 *  outright (CLR15, "document bytes/storage bond may change only through legacy
 *  upgrade"). Run as superuser with `session_replication_role='replica'`, which
 *  silences user triggers for this one session-local fixture write. A fixture
 *  surgery only — never on a lane path. */
export async function unverifyDocumentBytes(documentId) {
  const c = await getPool().connect();
  try {
    await c.query("set session_replication_role = replica");
    await c.query("update clara.documents set bytes_verified_at = null where id = $1", [documentId]);
  } finally {
    await c.query("set session_replication_role = origin").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Retire a document's ACTIVE filing to `client` through the audited verb (CAS on
 *  the filing's revision_token). NOTE the as-built param is `p_filing_id`. */
export async function retireFilingFor(sub, { document, client, reason = "rig topology change" }) {
  const f = await filingRowOf(document, client);
  if (!f) throw new Error(`retireFilingFor: no active filing of ${document} to ${client}`);
  const r = await humanQuery(sub,
    `select clara.retire_document_filing(p_filing_id => $1, p_reason => $2,
       p_expected_revision => $3, p_op_key => $4) as r`,
    [f.id, reason, f.revision_token, opk("ret20")]);
  return r.rows[0].r;
}

/** A CLASSIFIED (document.classified event present), verified, UNFILED document —
 *  the resolver's raw material. `kind` must not be consent_evidence (0016 refuses). */
export async function classifiedDocument({ firm, kind = "invoice", confidence = 0.95 }) {
  const { classifyDocument } = await import("../a21-helpers.mjs");
  const seed = await seedVerifiedDocument({ firm }); // kind NULL so the classifier may set it
  await classifyDocument({ document: seed.documentId, kind, confidence, opKey: opk("clsf20") });
  return seed;
}

/** File an already-minted document to a client through the audited human verb. */
export async function fileTo(sub, { document, client }) {
  const { fileDocument, freshResolution } = await import("../rig-docs-fixtures.mjs");
  return fileDocument(sub, {
    document, client,
    resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: document }),
  });
}

// ---------------------------------------------------------------------------
// Payload canonicalisation — the "byte-identical across all N inputs" cells.
// ---------------------------------------------------------------------------

/** DEEP canonical JSON: object keys sorted at every depth, arrays order-preserved.
 *  A shallow `JSON.stringify(v, keys.sort())` replacer silently DROPS nested keys,
 *  which would make two different payloads compare equal — the exact failure a
 *  byte-identity cell must not have. */
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
/** The exact top-level key set of a returned payload, sorted. */
export const keysOf = (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort() : []);

// ---------------------------------------------------------------------------
// Two-session drivers (§9.3 / §9.4). Both sessions PLAIN `begin` (READ COMMITTED):
// nothing 0020 pins is SSI-dependent, and the contract's guarantees are stated as
// row-lock linearization, not as serializable conflicts. Every driver PROVES the
// interleaving with waitBlockedByOrThrow rather than assuming a sleep worked.
// ---------------------------------------------------------------------------

const CONSUME_SQL =
  `select clara.consume_egress_dispatch(p_firm => $1, p_authorization => $2, p_client => $3,
     p_purpose => $4, p_event_seq => $5::bigint, p_event_type => $6) as r`;
const REVOKE_PURPOSE_SQL =
  `select clara.revoke_client_egress_purpose(p_client => $1, p_purpose => $2,
     p_reason => $3, p_op_key => $4) as r`;
const RESOLVE_INGEST_SQL =
  "select clara.resolve_and_ingest_wiki_source(p_firm => $1, p_document => $2) as r";
const FILE_DOC_SQL =
  "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4) as r";
const RETIRE_SQL =
  `select clara.retire_document_filing(p_filing_id => $1, p_reason => $2,
     p_expected_revision => $3, p_op_key => $4) as r`;

async function openRuntime(c) {
  const pid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
  await c.query(`set role ${ROLES.runtime}`);
  await c.query("set statement_timeout = '20s'"); // hang bound only
  await c.query("begin");
  return pid;
}
async function openHuman(c, sub) {
  const pid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
  await c.query(`set role ${ROLES.authenticated}`);
  await c.query("set statement_timeout = '20s'");
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub, role: "authenticated" })]);
  return pid;
}
async function closeAll(...cs) {
  for (const c of cs) {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** §3.5/§3.6 — the WITHDRAWAL-IN-FLIGHT boundary. The owner's revoke runs FIRST
 *  and stays UNCOMMITTED (holding its §3.5 invalidation write on the authorization
 *  row); the runtime's consume then fires and must PARK on that row lock; the
 *  revoke commits; the parked consume re-reads under READ COMMITTED and must
 *  refuse. Returns { blocked, consume, revoke }. `blocked` is OBSERVED, not
 *  assumed — a false means the consume never touched the invalidated row, which is
 *  itself reportable. */
export async function raceRevokeThenConsume({
  firm, client, authorization, ownerSub, purpose = WIKI_PURPOSE, intent = null,
}) {
  const i = intent ?? {};
  const cR = await getPool().connect(); // owner revoke
  const cC = await getPool().connect(); // runtime consume
  const out = { blocked: false, consume: null, revoke: null };
  try {
    const pidR = await openHuman(cR, ownerSub);
    await cR.query(REVOKE_PURPOSE_SQL, [client, purpose, "rig in-flight withdrawal", opk("racerev")]);

    const pidC = await openRuntime(cC);
    const pC = cC.query(CONSUME_SQL,
      [firm, authorization, i.client ?? client, i.purpose ?? purpose,
        i.eventSeq ?? null, i.eventType ?? null])
      .then((r) => { out.consume = r.rows[0].r; })
      .catch((e) => { out.consume = { error: e.code ?? e.message }; });
    out.blocked = await waitBlockedByOrThrow(pidC, pidR, { what: "the dispatch-authorization row lock held by the revoke" })
      .catch(() => false);

    await cR.query("commit");
    out.revoke = { ok: true };
    await pC;
    await cC.query("commit").catch(() => {});
  } finally {
    await closeAll(cR, cC);
  }
  return out;
}

/** §3.2/§3.4 (RATCHET R1-F2) — THE STALE-TRANSACTION cell.
 *
 *  `now()` is TRANSACTION-STABLE: it returns the transaction's start time for the whole
 *  transaction, however long that runs. A consume that compared `expires_at <= now()` therefore
 *  could not see an authorization that expired AFTER its caller's transaction began — the caller
 *  simply had to be inside a long-open transaction (a pooled connection with an open txn, a
 *  batch, a session left mid-work) and the TTL stopped meaning anything.
 *
 *  Staged deterministically rather than by waiting 120 seconds: the transaction opens and freezes
 *  its now() at T; expiry is then placed at T + `graceMs` — a hair AFTER the frozen now(), so a
 *  now()-based test can NEVER see it as expired — and the transaction then sleeps past it in wall
 *  time (pg_sleep advances clock_timestamp() and does not advance now()).
 *
 *  Returns { consume, txnNow, wallAtConsume, expiresAt }: `txnNow < expiresAt` is the proof that
 *  the OLD semantics would have granted, and `wallAtConsume > expiresAt` that the new one must
 *  refuse. */
export async function consumeInsideStaleTransaction({
  firm, authorization, intent = null, graceMs = 300, sleepSeconds = 0.9,
}) {
  const i = intent ?? {};
  const c = await getPool().connect();
  try {
    await c.query(`set role ${ROLES.runtime}`);
    await c.query("set statement_timeout = '20s'");
    await c.query("begin");
    const txnNow = (await c.query("select now() as t")).rows[0].t;
    const expiresAt = new Date(new Date(txnNow).getTime() + graceMs).toISOString();
    await setAuthExpiry(authorization, expiresAt);
    await c.query("select pg_sleep($1::float8)", [sleepSeconds]);
    const clocks = (await c.query("select now() as frozen, clock_timestamp() as wall")).rows[0];
    const r = await c.query(CONSUME_SQL,
      [firm, authorization, i.client ?? null, i.purpose ?? WIKI_PURPOSE,
        i.eventSeq ?? null, i.eventType ?? null]);
    await c.query("commit");
    return {
      consume: r.rows[0].r,
      txnNow: new Date(clocks.frozen).toISOString(),
      wallAtConsume: new Date(clocks.wall).toISOString(),
      expiresAt,
    };
  } finally {
    await closeAll(c);
  }
}

/** §3.6 (RATCHET R1-F2) — THE ROLLBACK cell. A PostgreSQL function CANNOT commit its caller's
 *  transaction: `granted` from inside an open transaction is a promise the caller can still take
 *  back. This driver proves the DB-side limit exactly — consume returns `granted`, the caller
 *  rolls back, and the authorization is left UNCONSUMED and spendable. That is why the runtime's
 *  default consume helper owns its own begin/commit (asserted in the runtime suite): the DB half
 *  alone cannot make §3.6's linearization claim true for an arbitrary caller.
 *  Returns { consume, consumedAfterRollback }. */
export async function consumeThenRollback({ firm, authorization, intent = null }) {
  const i = intent ?? {};
  const c = await getPool().connect();
  try {
    await c.query(`set role ${ROLES.runtime}`);
    await c.query("set statement_timeout = '20s'");
    await c.query("begin");
    const r = await c.query(CONSUME_SQL,
      [firm, authorization, i.client ?? null, i.purpose ?? WIKI_PURPOSE,
        i.eventSeq ?? null, i.eventType ?? null]);
    await c.query("rollback");
    return { consume: r.rows[0].r };
  } finally {
    await closeAll(c);
  }
}

/** §5.2/§5.3/§9.4 — `unique(A)` with a CONCURRENT file-to-B. The resolve+ingest
 *  runs FIRST inside an open transaction (so it holds document_filings FOR SHARE +
 *  the clara.documents row FOR UPDATE); the filing to B then fires and must PARK on
 *  the phantom guard; the ingest commits; the filing proceeds. The publication is
 *  lawful ONLY because it serialized BEFORE B's filing was visible.
 *  Returns { ingest, blocked, fileOk, fileCode }. */
export async function raceIngestThenFileB({ firm, document, clientB, sub }) {
  const { freshResolution } = await import("../rig-docs-fixtures.mjs");
  const resolution = await freshResolution(sub, clientB, { subjectKind: "document", subjectId: document });
  const cI = await getPool().connect(); // runtime resolve+ingest
  const cF = await getPool().connect(); // human file-to-B
  const out = { ingest: null, blocked: false, fileOk: null, fileCode: null };
  try {
    const pidI = await openRuntime(cI);
    out.ingest = (await cI.query(RESOLVE_INGEST_SQL, [firm, document])).rows[0].r;

    const pidF = await openHuman(cF, sub);
    const pF = cF.query(FILE_DOC_SQL, [document, clientB, resolution, opk("racefile")])
      .then(() => { out.fileOk = true; })
      .catch((e) => { out.fileOk = false; out.fileCode = e.code; });
    out.blocked = await waitBlockedByOrThrow(pidF, pidI, { what: "the clara.documents row lock held by resolve_and_ingest_wiki_source" })
      .catch(() => false);

    await cI.query("commit");
    await pF;
    if (out.fileOk) await cF.query("commit").catch((e) => { out.fileOk = false; out.fileCode = e.code; });
    else await cF.query("rollback").catch(() => {});
  } finally {
    await closeAll(cI, cF);
  }
  return out;
}

/** §9.4 (R-1) — resolve+ingest against a CONCURRENT retire_document_filing. 0027
 *  (task #29 P-round) made BOTH sides documents-first: the ingest now locks
 *  clara.documents FOR UPDATE before document_filings FOR SHARE (0020's original order
 *  was the opposite — see 0027_filings_lock_order.sql §D), and retire_document_filing
 *  peeks + locks documents before its own filing-row FOR UPDATE. So post-0027 the park
 *  is on the clara.documents row, not the filing row, and R-1's "or aborts 40P01" arm is
 *  no longer reachable between these two specifically — the assertion below still
 *  accepts it (a strict subset of "serializes or 40P01" always holds), so this driver
 *  and its caller are unchanged; only the blocking LOCK moved.
 *  Returns { ingest, blocked, retireOk, retireCode }. */
export async function raceIngestThenRetire({ firm, document, clientToRetire, sub }) {
  const f = await filingRowOf(document, clientToRetire);
  if (!f) throw new Error("raceIngestThenRetire: no active filing to retire");
  const cI = await getPool().connect();
  const cR = await getPool().connect();
  const out = { ingest: null, blocked: false, retireOk: null, retireCode: null };
  try {
    const pidI = await openRuntime(cI);
    out.ingest = (await cI.query(RESOLVE_INGEST_SQL, [firm, document])).rows[0].r;

    const pidR = await openHuman(cR, sub);
    const pR = cR.query(RETIRE_SQL, [f.id, "rig concurrent retirement", f.revision_token, opk("raceret")])
      .then(() => { out.retireOk = true; })
      .catch((e) => { out.retireOk = false; out.retireCode = e.code; });
    out.blocked = await waitBlockedByOrThrow(pidR, pidI, { what: "the clara.documents row lock held by resolve_and_ingest_wiki_source (post-0027: documents-first, was document_filings-first)" })
      .catch(() => false);

    await cI.query("commit");
    await pR;
    if (out.retireOk) await cR.query("commit").catch((e) => { out.retireOk = false; out.retireCode = e.code; });
    else await cR.query("rollback").catch(() => {});
  } finally {
    await closeAll(cI, cR);
  }
  return out;
}
