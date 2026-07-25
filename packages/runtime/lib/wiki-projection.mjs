// The wiki-projection consumer (Wave B, migration 0017 W4/W5/W9/P17). A registered spine
// consumer beside router/matcher/sst_watch/facts_gate, reusing lib/relay.mjs primitives
// UNCHANGED (own name/advisory-lock/checkpoint/dead-letter/`/ready` WARN/dedicated LISTEN client).
// It maintains the Layer-1 client wiki index as an EVENT-SPINE PROJECTION (WB-R3): (a) DETERMINISTIC
// ingest (no model/consent, WB-R10) — entry.approved with a source doc → record_wiki_source_ingest;
// (b) MODEL synthesis (consent-gated, W9) — counterparty.created/merged → synthesize the counterparty
// page, content-address in Storage, verify by re-download, THEN publish_wiki_page_version;
// (c) DETERMINISTIC seeding fact (no model/consent/egress, R2 · F13) — a TICKED seeding.proposal_decided
// of kind 'wiki_fact' publishes its page from the seeding proposal's payload VERBATIM (synthesis
// 'deterministic', prior_gl_line citations, engine_id null); a declined or non-wiki_fact decision is a
// checkpoint-only skip. A fact with NO concrete line/region anchor is skipped_no_citation — provenance
// is NEVER fabricated (F-M12); (d) the STALE lane (WB-R21 / migration 0019 D3) — document.filing_retired
// marks the citing client's live wiki sources stale via mark_wiki_citations_stale. The authority domain
// no longer VETOES a retirement under a live citation, so the wiki converges by MARKING from the
// retirement EVENT; the lane is gated PER EVENT on the writer's presence so the runtime-image-first
// ceremony window is silent, and it emits NO event of its own (wiki.citations_staled was dropped).
// Terminal receipts (checkpoint-advancing, no retry):
// projected|already_projected|citations_staled|skipped_inactive_client|held_consent|
// skipped_kind|skipped_no_surface|skipped_unresolved_client|skipped_ambiguous_client|
// skipped_unclassified|
// skipped_declined|skipped_non_wiki_kind|skipped_bad_wiki_fact|skipped_no_citation + the ENUMERATED
// typed refusals of TERMINAL_STATUS (incl. CLR32/stale_projected_from_seq -> already_projected, the
// 0019 §5 monotonic guard). That table is CLOSED (ratchet R2 finding B2): a typed CLR that is NOT in
// it is NOT terminal, because the old catch-all mapped every unrecognised CLR32 reason to
// skipped_bad_state and CHECKPOINTED it — permanently losing an event that had not converged at all.
// Two non-terminal classes: a CONFIGURATION REFUSAL (CONFIGURATION_REFUSALS — the runtime is
// misconfigured, not the data) NEVER advances the checkpoint and is exempt from the attempt-exhaustion
// escape, so the firm's cursor waits for the fix and then replays; an UNRECOGNISED typed refusal takes
// the ordinary dead-letter + retry path. Only a genuine throw dead-letters (matcher idiom). op_keys: model/seeding-fact 'wikiproj:<client>:<seq>';
// ingest 'wikiingest:<client>:<document>' (the SAME shape the 0020 serialized verb derives
// server-side, so the two paths share one receipt per (client, document) and can never
// double-publish); held synthesis 'wikihold:<client>:<seq>'; stale
// 'wikistale:<client>:<seq>' (the ceremony catch-up uses 'wikistale-catchup:<run_key>:<client>:<document>'
// — a fixed per-pair key would replay the original receipt forever). P17: never
// subscribes to / re-synthesizes from wiki.*. Cold start (checkpoint seed + backfill + repair) is a
// CEREMONY item, never boot.
//
// MIGRATION 0020 (WB-R23) rewires two things and adds one:
//   (i)  MODEL SYNTHESIS IS TWO-PHASE. The single plan-time consent READ is gone. The lane now
//        PREPARES an authorization at plan time (clara.prepare_egress_dispatch → granted|unknown +
//        an OPAQUE authorization id, and nothing else) and CONSUMES it atomically immediately
//        before the model call, AFTER the wiki-context read (clara.consume_egress_dispatch). The
//        consume is the DISPATCH LINEARIZATION POINT: a revocation committed before it MUST refuse,
//        and does. A revocation committed after it may still dispatch — that residual is documented
//        (contract §3.6 / R-2), not claimed away. On either boundary refusing, the lane records
//        held_consent with the UNCHANGED reason token and op key and calls NO model, writes NO
//        Storage object and publishes NOTHING.
//   (ii) DOCUMENT→CLIENT RESOLUTION IS SERVER-SIDE AND SERIALIZED. document.classified no longer
//        asks an injected resolver for a client id; it calls clara.resolve_and_ingest_wiki_source
//        INSIDE the effect transaction, where uniqueness is re-decided under a filing-topology lock
//        pair and the ingest goes through the audited writer in the same transaction. Ambiguity
//        earns its own receipt (skipped_ambiguous_client) — the discriminant survives operationally
//        without a candidate identity or a count ever leaving the database.
//  (iii) TWO RE-DRIVE LANES. document.filing_retired (after its 0019 stale mark) and the NEW
//        document.filed subscription both attempt the same serialized resolve-and-ingest, so a
//        document that was ambiguous or unfiled when it was classified is published once the
//        topology collapses to exactly one client. The attempt is cheap and idempotent: a non-unique
//        topology is a no-op skip, and the derived op key makes a repeat a replay.
//        A never-classified document is never ingested (skipped_unclassified). On the
//        filing_retired lane the ATTEMPT is layered on top of a 0019 effect that must not be lost,
//        so it runs under its own SAVEPOINT (see planFilingRetiredStale).
//   Legacy null-purpose egress.consent_granted / egress.consent_revoked are now CHECKPOINT-ONLY for
//   wiki: an invoice-facts consent must never release a wiki control. The four typed
//   egress.purpose_* events are subscribed for observability and ordering only — the DB owns their
//   hold transitions inside the owner-floored RPCs.
//   Every new DB dependency is behind an EXACT-SIGNATURE surface guard, per LANE: absent synthesis
//   pair → the counterparty lane records held_consent exactly as before; absent resolver pair →
//   document.classified stays skipped_unresolved_client and the re-drive lanes are checkpoint-only.
//   Every other lane stays fully active.
//
// The injectable reads FAIL CLOSED under the 0008 grants (no runtime document→client link, no SELECT
// on counterparties / client_egress_consents / any 0020 consent relation — the DEFINER verbs are the
// entire surface).

import { createHash, randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverWork, writeCheckpoint } from "./relay.mjs";
import { isConnErr } from "./listen.mjs";
import { safeWikiKey, putWikiCanonical, verifyWikiCanonical } from "./storage.mjs";
import { GOVERNED_EGRESS_PURPOSES } from "./egress.mjs";

export const WIKI_PROJECTION_CONSUMER = "wiki_projection";

// The subscription SET (the sanctioned deviation from the single-type template, W4), bound from the
// live event_types registry (0005/0009/0011/0016/0017/0020). All other types (incl. wiki.* — P17) are
// checkpoint-only advances. document.classified = SERIALIZED resolve-and-ingest (0020 §5.4 — the
// event carries no client, and the resolution is re-decided at effect time); entry.approved = ingest
// of the source doc (carries the client, UNCHANGED); counterparty.* = two-phase model synthesis;
// egress.consent_* = legacy, null-purpose, now CHECKPOINT-ONLY for wiki (0020 §4.2);
// egress.purpose_* = the four typed 0020 events, subscribed for observability and ordering only;
// seeding.proposal_decided = the deterministic wiki_fact lane (F13);
// document.filing_retired = the WB-R21 STALE lane (0019 D3) PLUS the 0020 re-drive — the authority
// domain no longer vetoes a retirement under a live wiki citation, so the wiki converges by MARKING
// its sources from the retirement EVENT, and 0020 then re-resolves the document for a surviving
// single client. Note this is a document.* type, NOT a wiki.* one: P17 (never re-synthesize from
// wiki.*) is untouched, and with wiki.citations_staled dropped the lane emits no event to loop on.
// document.filed = the NEW 0020 re-drive subscription (0007:2687, emitted by file_document, the
// intake finalizer, the rule-filed path and approve_wrong_client_correction) — the other half of the
// topology-change surface. Adding it changes no existing lane's behaviour.
export const WIKI_PROJECTION_EVENT_TYPES = Object.freeze([
  "document.classified", "entry.approved", "counterparty.created",
  "counterparty.merged", "egress.consent_granted", "egress.consent_revoked",
  "egress.purpose_consent_granted", "egress.purpose_consent_revoked",
  "egress.purpose_activated", "egress.purpose_deactivated",
  "seeding.proposal_decided", "document.filing_retired", "document.filed",
]);
const SUBSCRIBED = new Set(WIKI_PROJECTION_EVENT_TYPES);

/** The reason token a non-granted synthesis verdict parks the client with. It is UNCHANGED from
 *  as-built (where the 42501 on client_egress_consents made every verdict 'unknown'), and that is
 *  precisely what makes the 0020 DARK claim true: with zero typed consents and zero activations the
 *  model-egress path is externally byte-equivalent to today. */
export const HELD_CONSENT_REASON = "wiki synthesis consent unknown";
/** The only typed egress purpose 0020 ships (contract §0: a second purpose needs a follow-on ruling). */
export const WIKI_SYNTHESIS_PURPOSE = "wiki_synthesis";

/** The wiki page_kinds a deterministic seeding fact may claim — 'counterparty' is
 *  excluded (it structurally requires a counterparty_id the fact never carries). */
const WIKI_FACT_PAGE_KINDS = new Set([
  "profile", "treatment", "recurring_pattern", "open_question", "period_context",
]);
/** Cap on prior_gl_line citations emitted per fact page (≥1 required by the DB). */
const MAX_FACT_CITATIONS = 50;

const WIKI_MODEL = process.env.CLARA_WIKI_MODEL || process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
const WIKI_ENGINE_ID = `clara-wiki-synth:${WIKI_MODEL}`;
const MAX_ATTEMPTS = Number(process.env.CLARA_WIKI_PROJECTION_MAX_ATTEMPTS || 5);
const skip = (status) => ({ status, mutate: null });

export function contentSha256(content) {
  return createHash("sha256").update(Buffer.from(String(content), "utf8")).digest("hex");
}
export function wikiStorageKey(firmId, clientId, sha) {
  return `firms/${firmId}/wiki/${clientId}/${sha}.md`;
}
export function claraReason(err) {
  try { return JSON.parse(err?.detail || "{}").reason ?? null; } catch { return null; }
}
const isClaraCode = (err) => typeof err?.code === "string" && /^CLR\d{2}$/.test(err.code);

/**
 * The CLOSED terminal table: every typed refusal this consumer's call surface can raise that
 * is a genuine DOMAIN outcome — a convergence or a malformed write. A terminal refusal earns a
 * receipt and ADVANCES the checkpoint, which is only ever safe when reprocessing the event
 * could not produce a different result.
 *
 * It is closed BY CONSTRUCTION (ratchet R2 finding B2, hardened R3 finding F2). The predecessor
 * fell through to `skipped_bad_state` for any unrecognised CLR32 reason and to `skipped_invalid`
 * for any unrecognised CLR code — so 0019's brand-new CLR32/isolation_unsupported, a CONFIGURATION
 * failure and not a convergence at all, silently checkpointed past the event and lost its
 * projection forever. Enumerating the terminal set instead of the exceptions makes the DEFAULT
 * non-terminal. R3 finished the job: an unrecognised typed refusal no longer EXHAUSTS into a
 * checkpoint after MAX_ATTEMPTS either — it BLOCKS the firm cursor (like a configuration refusal)
 * until a human classifies it deliberately, into this table or into CONFIGURATION_REFUSALS. So a
 * reason a future migration adds genuinely cannot be checkpointed away by default.
 *
 * The keys are the reasons the wiki writers actually raise (0017:1999-2153 for the CLR32 family,
 * plus 0019 §1b/§5); the CLR-code table covers the non-CLR32 refusals of the same surface.
 * (CLR32/budget_unknown is DELIBERATELY absent — it is a CONFIGURATION_REFUSAL, not terminal.)
 */
const CLR32_TERMINAL = Object.freeze({
  consent_held: "held_consent",
  cap_exceeded: "skipped_cap",
  // The 0019 §5 DB-side monotonic guard: a BENIGN convergence (a newer seq is already published
  // for this slug), not a malformed write — it must not report itself as one.
  stale_projected_from_seq: "already_projected",
  bad_state: "skipped_bad_state",
  sha_mismatch: "skipped_bad_state",
  citation_required: "skipped_bad_state",
});
const CLR_TERMINAL = Object.freeze({
  CLR28: "skipped_consent_evidence",
  CLR02: "skipped_unfiled",
  CLR11: "skipped_client_mismatch",
  CLR10: "skipped_invalid",
});

/** The stable reason PREFIX a CONFIGURATION-blocked dead-letter carries, so /ready's
 *  wikiProjectionHealth can count them into an explicit `configurationBlocked` signal (F3)
 *  without a schema change to relay_dead_letters. */
export const CONFIG_DEAD_LETTER_PREFIX = "runtime misconfiguration ";

/**
 * CONFIGURATION REFUSALS — the runtime/deployment is misconfigured; the EVENT is fine. Retrying
 * the same event on a correctly configured connection (or after the config row is repaired)
 * succeeds, so the checkpoint must stay BEHIND it, and these are exempt from the attempt-
 * exhaustion escape in processFirm (which exists for poison-pill DATA, not a broken deployment).
 * A configuration refusal ADDITIONALLY makes the leader RELEASE its advisory lock and reconnect
 * on a long backoff (ratchet R3 finding F3), so a corrected standby can take over leadership
 * instead of the broken leader pinning it forever.
 *   CLR32/isolation_unsupported — 0019 §1b refuses publication under REPEATABLE READ. The pool
 *     opens READ COMMITTED today, so this fires only from a role-level default, a pooler setting
 *     or a future config change — instance-local, so a corrected standby heals it.
 *   CLR32/budget_unknown        — the clara.wiki_budgets config rows are missing (0017:2016-2022,
 *     "wiki budget configuration is incomplete"). CONFIGURATION drift, not a convergence:
 *     repairing the row and replaying SUCCEEDS, so checkpointing past it would permanently lose
 *     the projection (ratchet R3 finding F2 — it used to sit in the terminal table).
 *   CLR03 (any reason)          — get_wiki_page's authority gate (0017:2380-2384): no human
 *     claims AND not the trusted v25 runtime marker. The lane sets that marker itself, so a
 *     CLR03 means the role or the marker is wrong, never that the event is bad.
 *   SQLSTATE 42501              — a missing EXECUTE privilege on an audited wiki writer: a grant
 *     gap in the deployment, never bad data (ratchet R3 finding F2).
 */
export function isConfigurationRefusal(err) {
  if (err?.code === "42501") return true;
  if (!isClaraCode(err)) return false;
  if (err.code === "CLR03") return true;
  if (err.code !== "CLR32") return false;
  const reason = claraReason(err);
  return reason === "isolation_unsupported" || reason === "budget_unknown";
}

/** EXPORTED for unit test only: the 0019 §4 contract requires the CLR32/
 *  stale_projected_from_seq -> already_projected mapping to be PROVEN, and the mapping is a
 *  pure function of the error. Driving it through the DB would need a real serialized
 *  supersede race; exporting the pure mapping proves it directly. No caller outside this
 *  module uses it. Returns NULL when the refusal is not terminal — the caller must then take
 *  a path that does NOT advance the checkpoint. */
export function terminalStatusFor(err) {
  if (!isClaraCode(err) || isConfigurationRefusal(err)) return null;
  if (err.code === "CLR32") return CLR32_TERMINAL[claraReason(err)] ?? null;
  return CLR_TERMINAL[err.code] ?? null;
}

/** A typed clara refusal that is TERMINAL: receipt + checkpoint, never a dead-letter loop.
 *  A CLR code alone is no longer sufficient — it must be IN the closed table above. */
export function isClaraTerminal(err) {
  return terminalStatusFor(err) !== null;
}

// --- injectable authorization + resolution steps (0020) ----------------------------------------
//
// resolveConsentDefault is RETIRED. Its raw `select 1 from clara.client_egress_consents ...` against
// a relation clara_runtime cannot read (42501 → 'unknown') was never an authorization: it read a
// PURPOSE-BLIND relation, it could not be invalidated by a revoker, and the model call happened after
// it returned. It is replaced by the two-phase pair below. resolveDocumentClientDefault is likewise
// retired: the document→client decision now belongs to a serialized DB verb, not to a plan-time read.

/** PLAN-TIME verdict. Returns the DB's two-key payload verbatim: {verdict, authorization_id}. A
 *  42501 here is a GRANT GAP in the deployment, never bad data — it propagates and takes the
 *  configuration-refusal path (checkpoint stays behind, leadership released), which is strictly
 *  safer than swallowing it into a silent hold. */
export async function prepareEgressDispatchDefault(
  client, { firmId, clientId, purpose, eventSeq, eventType }) {
  const r = await client.query(
    "select clara.prepare_egress_dispatch($1,$2,$3,$4,$5) as v",
    [firmId, clientId, purpose, eventSeq, eventType]);
  return r.rows[0]?.v ?? { verdict: "unknown", authorization_id: null };
}

/** THE DISPATCH LINEARIZATION POINT. Single-use and terminal: a second consume of the same id, an
 *  expired id, a foreign-firm id, or an id whose consent/activation stopped being live all return
 *  {verdict:'unknown'} and the lane abandons the dispatch. */
export async function consumeEgressDispatchDefault(client, { firmId, authorizationId }) {
  const r = await client.query(
    "select clara.consume_egress_dispatch($1,$2) as v", [firmId, authorizationId]);
  return r.rows[0]?.v ?? { verdict: "unknown" };
}

/** The SERIALIZED resolve-and-ingest. It MUST run inside the caller's effect transaction: the whole
 *  point is that the uniqueness decision and the ingest share one transaction and one lock set. */
export async function resolveAndIngestWikiSourceDefault(client, { firmId, documentId }) {
  const r = await client.query(
    "select clara.resolve_and_ingest_wiki_source($1,$2) as r", [firmId, documentId]);
  return r.rows[0]?.r ?? { status: "skipped_unresolved_client" };
}

/** PER-EVENT, PER-LANE surface guards (contract §10.2). EXACT SIGNATURE, never an overloaded-name
 *  to_regproc check — that cannot distinguish signatures, and an overload of a granted name is a
 *  different function. to_regprocedure is a plain catalog read: no EXECUTE needed, so a guard never
 *  fails for a privilege reason. The 0020 ceremony is DB-FIRST, so these are normally true by the
 *  time this image runs; they exist so a rollback or a reversed order degrades to today's behaviour
 *  lane-locally instead of dead-lettering the whole projection. */
export async function hasSynthesisAuthorizationSurfaceDefault(client) {
  const r = await client.query(
    "select to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)') is not null"
    + " and to_regprocedure('clara.consume_egress_dispatch(uuid,uuid)') is not null as surface");
  return r.rows[0]?.surface === true;
}
export async function hasResolverSurfaceDefault(client) {
  const r = await client.query(
    "select to_regprocedure('clara.resolve_document_client(uuid,uuid)') is not null"
    + " and to_regprocedure('clara.resolve_and_ingest_wiki_source(uuid,uuid)') is not null as surface");
  return r.rows[0]?.surface === true;
}
/** Default model synthesis — the governed-egress envelope (W9, GOVERNED_EGRESS_PURPOSES). Lazy
 *  AI-SDK import (tests inject deps.synthesize). Returns {title, content}. */
export async function synthesizeWikiPageDefault({ kind, counterpartyId, existing, event, modelId }) {
  const { generateText } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");
  const model = globalThis.__claraModelForTest ?? openai(modelId);
  const p = GOVERNED_EGRESS_PURPOSES.wiki_synthesis;
  const system = `You maintain a Malaysian accounting firm's CLARA-maintained advisory wiki page about ONE `
    + `counterparty of ONE client. The page INFORMS professional judgement; it never decides. Write concise `
    + `Markdown and cite the concrete facts your claims rest on. Governed-egress purpose: ${p.purpose} (${p.dataClass}).`;
  const prompt = `Page kind: ${kind}. Counterparty id: ${counterpartyId}. Trigger: ${event?.eventType}.\n\n`
    + (existing?.version?.content ? `Existing content:\n${existing.version.content}` : "No existing page.")
    + `\n\nProduce the updated advisory note as Markdown, starting with a single '# ' title line.`;
  const { text } = await generateText({ model, system, prompt });
  const heading = String(text).split("\n").find((l) => l.trim().startsWith("# "));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : `Counterparty ${counterpartyId}`;
  return { title, content: String(text) };
}

// --- granted DB reads (clients + wiki tables; firm-scoped in SQL) ------------------------------
async function isClientActive(client, { clientId, firmId }) {
  const r = await client.query("select status from clara.clients where id=$1 and firm_id=$2", [clientId, firmId]);
  return r.rowCount > 0 && r.rows[0].status === "active";
}
/** Publishable = active OR onboarding (publish_wiki_page_version's own floor). Seeding
 *  facts land DURING onboarding, so this lane accepts both — unlike the operational lanes. */
async function isClientPublishable(client, { clientId, firmId }) {
  const r = await client.query("select status from clara.clients where id=$1 and firm_id=$2", [clientId, firmId]);
  return r.rowCount > 0 && (r.rows[0].status === "active" || r.rows[0].status === "onboarding");
}
/** Read a ticked seeding proposal's kind/state/payload/evidence (clara_runtime SELECT + RLS true). */
async function readSeedingProposal(client, { proposalId, firmId }) {
  const r = await client.query(
    "select proposal_kind, state, payload, evidence, client_id from clara.seeding_proposals where id=$1 and firm_id=$2",
    [proposalId, firmId]);
  return r.rows[0] ?? null;
}
/** A line cite carries a CONCRETE anchor iff it is an object with an integer physical xlsx
 *  `row` or a nonempty `region_id` (the F-M14 citation union). A cite without one is not
 *  provenance and can never justify a fabricated citation (F-M12). */
export function hasConcreteAnchor(lc) {
  return !!lc && typeof lc === "object"
    && ((typeof lc.region_id === "string" && lc.region_id !== "") || Number.isInteger(lc.row));
}
/** Build prior_gl_line citations from a proposal's evidence, keeping ONLY concrete-anchor
 *  cites (F-M12: NEVER synthesize provenance). Every citation binds the source prior-GL
 *  document; the concrete line cite rides `detail`. An EMPTY result means the fact has no
 *  anchor — the caller turns that into a terminal skipped_no_citation (never a bare publish). */
export function buildPriorGlCitations({ evidence, sourceDocumentId, proposalId }) {
  const lineCites = Array.isArray(evidence?.line_cites) ? evidence.line_cites : [];
  return lineCites.filter(hasConcreteAnchor).slice(0, MAX_FACT_CITATIONS).map((lc) => ({
    source_kind: "prior_gl_line",
    document_id: sourceDocumentId,
    detail: { proposal_id: proposalId, ...lc },
  }));
}
/** projected_from_seq of a page's CURRENT version (null if absent) — the already_projected guard. */
async function currentProjectedSeq(client, { firmId, clientId, slug }) {
  const r = await client.query(
    `select v.projected_from_seq as seq from clara.wiki_pages p
       join clara.wiki_page_versions v on v.id=p.current_version_id
      where p.firm_id=$1 and p.client_id=$2 and p.slug=$3`, [firmId, clientId, slug]);
  return r.rowCount > 0 && r.rows[0].seq != null ? Number(r.rows[0].seq) : null;
}
/** Synthesis-context read via the DEFINER get_wiki_page — REFUSES (CLR03) unless
 *  clara.pack_consumer='v25' is set txn-locally AND the role is clara_runtime (0017 R1-F4). */
async function readWikiContext(client, { clientId, slug }) {
  await client.query("begin");
  try {
    await client.query("select set_config('clara.pack_consumer','v25',true)");
    const r = await client.query("select clara.get_wiki_page($1,$2) as page", [clientId, slug]);
    return r.rows[0]?.page ?? null;
  } finally {
    await client.query("rollback").catch(() => {});
  }
}

// --- Storage put→verify (W5 lockstep); put-409 (existed:true) = idempotent success -------------
async function putAndVerifyContent(key, content, sha, deps) {
  safeWikiKey(key);
  const put = deps.putWiki ?? putWikiCanonical;
  const verify = deps.verifyWiki ?? verifyWikiCanonical;
  const tmp = join(tmpdir(), `clara-wiki-${randomUUID()}.md`);
  await writeFile(tmp, content, "utf8");
  try {
    await put(tmp, key, "text/markdown");
    await verify(key, sha);
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}

// --- event planning: reads + (model) egress + Storage → {status, mutate}. mutate(txnClient) runs
// the audited DB write INSIDE the caller's final effect txn (atomic with the checkpoint). --------
async function planDeterministicIngest(client, { firmId, clientId, documentId }) {
  if (!clientId) return skip("skipped_unresolved_client");
  if (!documentId) return skip("skipped_kind");
  if (!(await isClientActive(client, { clientId, firmId }))) return skip("skipped_inactive_client");
  const opKey = `wikiingest:${clientId}:${documentId}`;
  return {
    status: "projected", lane: "deterministic",
    mutate: (c) => c.query("select clara.record_wiki_source_ingest($1,$2,$3,$4) as r", [clientId, documentId, null, opKey]),
  };
}

/** The held-consent terminal, identical at BOTH authorization boundaries: the same reason token and
 *  the same op key the lane has always used, so a non-granted verdict is externally indistinguishable
 *  from today's dark behaviour. */
function heldConsent({ clientId, ev }) {
  return {
    status: "held_consent",
    mutate: (c) => c.query("select clara.set_wiki_synthesis_hold($1,$2,$3) as r",
      [clientId, HELD_CONSENT_REASON, `wikihold:${clientId}:${ev.seq}`]),
  };
}

async function planCounterpartySynthesis(client, { firmId, ev, clientId, counterpartyId, deps }) {
  if (!clientId || !counterpartyId) return skip("skipped_kind");
  if (!(await isClientActive(client, { clientId, firmId }))) return skip("skipped_inactive_client");
  const slug = `counterparty/${counterpartyId}`;
  const projected = await currentProjectedSeq(client, { firmId, clientId, slug });
  if (projected != null && projected >= ev.seq) return skip("already_projected");

  // LANE-LOCAL fallback: without the exact 0020 pair the lane parks the client exactly as today.
  const hasAuthz = await (deps.hasSynthesisAuthorizationSurface
    ?? hasSynthesisAuthorizationSurfaceDefault)(client);
  if (!hasAuthz) return heldConsent({ clientId, ev });

  // PHASE 1 — prepare. `unknown` covers every non-granted state without distinction; the lane must
  // not try to tell them apart, and there is nothing in the payload that would let it.
  const verdict = await (deps.prepareEgressDispatch ?? prepareEgressDispatchDefault)(
    client, { firmId, clientId, purpose: WIKI_SYNTHESIS_PURPOSE, eventSeq: ev.seq, eventType: ev.eventType });
  const authorizationId = verdict?.authorization_id ?? null;
  if (verdict?.verdict !== "granted" || !authorizationId) return heldConsent({ clientId, ev });

  const existing = await readWikiContext(client, { clientId, slug });

  // PHASE 2 — consume, AFTER the context read and IMMEDIATELY before the model call. This is the
  // dispatch linearization point: a revocation that committed since phase 1 refuses here, and the
  // model is never called. Abandoning is a TYPED TERMINAL (checkpoint-advancing), never a crash and
  // never a dead-letter loop.
  const consumed = await (deps.consumeEgressDispatch ?? consumeEgressDispatchDefault)(
    client, { firmId, authorizationId });
  if (consumed?.verdict !== "granted") return heldConsent({ clientId, ev });

  const out = await (deps.synthesize ?? synthesizeWikiPageDefault)(
    { kind: "counterparty", counterpartyId, clientId, existing, event: ev, modelId: deps.model ?? WIKI_MODEL });
  const content = String(out?.content ?? "");
  if (!content) return skip("skipped_kind");
  const title = String(out?.title || `Counterparty ${counterpartyId}`).trim() || `Counterparty ${counterpartyId}`;
  const sha = contentSha256(content);
  const key = wikiStorageKey(firmId, clientId, sha);
  await putAndVerifyContent(key, content, sha, deps);
  const engineId = deps.engineId ?? WIKI_ENGINE_ID;
  const citations = [{ source_kind: "counterparty", counterparty_id: counterpartyId, detail: { trigger: ev.eventType } }];
  return {
    status: "projected", lane: "model",
    // The recency guard re-runs INSIDE the effect txn (codex finding 9): a concurrent
    // live pass / manual redrive that published a NEWER seq between planning and commit
    // must never be superseded by this older event — converge as a checkpoint-only no-op.
    // (Residual: two writers inside the same txn window; the DB-side monotonic
    // projected_from_seq guard is a 0018-candidate — see the v25 memo.)
    mutate: async (c) => {
      const now = await currentProjectedSeq(c, { firmId, clientId, slug });
      if (now != null && now >= ev.seq) return;
      await c.query(
        "select clara.publish_wiki_page_version($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14) as r",
        [clientId, slug, "counterparty", title, counterpartyId, content, sha, key,
          JSON.stringify(citations), "[]", "model", engineId, ev.seq, `wikiproj:${clientId}:${ev.seq}`]);
    },
  };
}

/** LEGACY, NULL-PURPOSE consent events are CHECKPOINT-ONLY for wiki after 0020 (§4.2). They used to
 *  clear the wiki hold on egress.consent_granted — an invoice-facts consent silently releasing a wiki
 *  authorization control. That ends: the legacy relation governs the invoice-facts lane and nothing
 *  else, and typed wiki authorization state is written only by the owner-floored typed RPCs.
 *  The four typed egress.purpose_* events are ALSO checkpoint-only here: the DB owns their hold
 *  transitions (§4.3), so the consumer has nothing to do but advance. They are subscribed for
 *  observability and ordering, not for effect.
 *  The receipt is the EXISTING generic no-op token: the contract requires "checkpoint-only" and
 *  enumerates no new token for these lanes, so none is invented. */
function planConsentCheckpointOnly() {
  return skip("skipped_kind");
}

/** The DETERMINISTIC seeding wiki_fact lane (F13): a TICKED seeding.proposal_decided of kind
 *  'wiki_fact' publishes its page from the proposal payload VERBATIM. A declined or non-wiki_fact
 *  decision is a checkpoint-only skip. No model, no consent, no Storage egress — the content lives in
 *  the DB version column (the record_wiki_source_ingest deterministic precedent). Reads the ticked
 *  proposal (the event payload carries no wiki body) and cites the source prior-GL document. */
async function planSeedingWikiFact(client, { firmId, ev }) {
  const payload = ev.payload || {};
  if (payload.decision !== "ticked") return skip("skipped_declined");
  if (payload.proposal_kind !== "wiki_fact") return skip("skipped_non_wiki_kind");
  const clientId = ev.clientId;
  const proposalId = payload.proposal_id;
  const sourceDoc = ev.documentId; // the batch's source_document_id (event column)
  if (!clientId || !proposalId || !sourceDoc) return skip("skipped_kind");
  if (!(await isClientPublishable(client, { clientId, firmId }))) return skip("skipped_inactive_client");
  const sp = await readSeedingProposal(client, { proposalId, firmId });
  if (!sp || sp.proposal_kind !== "wiki_fact" || sp.state !== "ticked") return skip("skipped_kind");
  const wiki = (sp.payload && sp.payload.wiki) || {};
  const slug = typeof wiki.slug === "string" ? wiki.slug : "";
  const title = typeof wiki.title === "string" ? wiki.title.trim() : "";
  const pageKind = typeof wiki.page_kind === "string" ? wiki.page_kind : "";
  const content = typeof wiki.content === "string" ? wiki.content : "";
  // Malformed payload is a TERMINAL skip (never a poison-pill dead-letter loop). The DB
  // re-validates every field, but we refuse early so a bad payload advances the checkpoint.
  if (!content || !slug || !title || !WIKI_FACT_PAGE_KINDS.has(pageKind)) return skip("skipped_bad_wiki_fact");
  const projected = await currentProjectedSeq(client, { firmId, clientId, slug });
  if (projected != null && projected >= ev.seq) return skip("already_projected");
  const cites = buildPriorGlCitations({ evidence: sp.evidence, sourceDocumentId: sourceDoc, proposalId });
  // F-M12: a fact with no concrete line/region anchor is a TERMINAL skip — never publish
  // with fabricated provenance (the DB floor is ≥1 citation; we refuse rather than invent).
  if (cites.length === 0) return skip("skipped_no_citation");
  const sha = contentSha256(content);
  const key = wikiStorageKey(firmId, clientId, sha);
  return {
    status: "projected", lane: "deterministic",
    // Re-check recency IN-TXN (codex F9 parity with the model lane): a newer published seq
    // for this slug between planning and commit makes this a checkpoint-only no-op.
    mutate: async (c) => {
      const now = await currentProjectedSeq(c, { firmId, clientId, slug });
      if (now != null && now >= ev.seq) return;
      await c.query(
        "select clara.publish_wiki_page_version($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14) as r",
        [clientId, slug, pageKind, title, null, content, sha, key,
          JSON.stringify(cites), "[]", "deterministic", null, ev.seq, `wikiproj:${clientId}:${ev.seq}`]);
    },
  };
}

/** PER-EVENT surface gate for the stale lane (0019 §4). The ratified ceremony is RUNTIME-IMAGE-
 *  FIRST (§11): this binary leads the projection BEFORE migration 0019 applies, so the writer may
 *  not exist yet. to_regprocedure is a plain catalog read — no EXECUTE needed — and pins the exact
 *  signature; a missing surface makes the lane a checkpoint-only skip instead of a dead-letter.
 *  This is the load-bearing safety of window A, so it is evaluated per event, not once at cold
 *  start (contrast wikiColdStartReady, wiki-projection-ops.mjs:100-108). */
export async function hasStaleWriterDefault(client) {
  const r = await client.query(
    "select to_regprocedure('clara.mark_wiki_citations_stale(uuid,uuid,text,text)') is not null as surface");
  return r.rows[0]?.surface === true;
}

/** The FILING-RETIRED → STALE lane (WB-R21 / 0019 D3). Both keys ride the event today, so no
 *  document→client resolver is needed: retire_document_filing emits client_id=f.client_id +
 *  document_id=f.document_id (0007:1462), and approve_wrong_client_correction emits
 *  client_id=x.from_client — the SOURCE / citing client whose provenance goes stale — with the same
 *  document (0009:2561-2563). One stale_reason covers both paths: the marker describes what
 *  invalidated the provenance, not which verb caused it.
 *  At-least-once safety: op-key dedupe (case a) plus the writer's own `stale_at is null` filter mean
 *  a re-delivery or a rewound-checkpoint redrive never double-marks. */
async function planFilingRetiredStale(client, { firmId, ev, clientId, documentId, deps }) {
  // A null key is a checkpoint-only SKIP — never a dead-letter, never a call with nulls.
  if (!clientId || !documentId) return skip("skipped_kind");
  if (!(await (deps.hasStaleWriter ?? hasStaleWriterDefault)(client))) return skip("skipped_no_surface");
  // 0020 §5.4: AFTER the 0019 effect, attempt the re-drive. 0019 marks a retired filing's citations
  // stale; it does NOT re-resolve the document for a surviving client, and the document.classified
  // event is checkpointed permanently — so the re-drive is 0020's, and this is the single genuine
  // coupling between the two migrations. Both effects share ONE transaction with the checkpoint: a
  // 40P01 against a concurrent authority function aborts both and the event re-drives (residual R-1).
  const canRedrive = await (deps.hasResolverSurface ?? hasResolverSurfaceDefault)(client);
  return {
    status: "citations_staled", lane: "filing_retired",
    mutate: async (c) => {
      await c.query("select clara.mark_wiki_citations_stale($1,$2,$3,$4) as r",
        [clientId, documentId, "source_filing_retired", `wikistale:${clientId}:${ev.seq}`]);
      if (!canRedrive) return null;
      // The re-drive is an ATTEMPT layered on top of an effect the 0019 contract requires, so it
      // runs under its OWN SAVEPOINT. Without one, an ENUMERATED terminal refusal from the
      // serialized verb — CLR32/cap_exceeded when the client is at its wiki page cap, CLR28 on a
      // consent_evidence document, CLR10 on a non-publishable client — would abort the WHOLE
      // effect transaction, rolling back mark_wiki_citations_stale, and runTargetEvent would then
      // CHECKPOINT the event as a terminal convergence: the 0019 §4 stale mark would be lost
      // permanently and the citation would never converge. The savepoint contains a terminal
      // refusal and surfaces it on the receipt instead. Anything NOT in the closed terminal table
      // (a configuration refusal, an unrecognised typed refusal, a 40P01 deadlock, a connection
      // error) still PROPAGATES, so the whole event rolls back and re-drives exactly as before —
      // residual R-1 is unchanged.
      await c.query("savepoint wiki_redrive");
      try {
        const r = await (deps.resolveAndIngestWikiSource ?? resolveAndIngestWikiSourceDefault)(
          c, { firmId, documentId });
        await c.query("release savepoint wiki_redrive");
        return { redrive: r?.status ?? null };
      } catch (err) {
        await c.query("rollback to savepoint wiki_redrive").catch(() => {});
        if (isConnErr(err) || terminalStatusFor(err) === null) throw err;
        await c.query("release savepoint wiki_redrive").catch(() => {});
        return { redrive: `refused:${err.code}/${claraReason(err) ?? ""}` };
      }
    },
  };
}

/** The SERIALIZED resolve-and-ingest lane (0020 §5.3/§5.4) — document.classified and the
 *  document.filed re-drive. The resolution is NOT taken here: it is re-decided inside the effect
 *  transaction under the filing-topology lock pair, so the receipt is whatever that verb returns
 *  (projected · skipped_ambiguous_client · skipped_unresolved_client · skipped_unclassified).
 *  Without the exact resolver pair the lane degrades to today's behaviour: skipped_unresolved_client
 *  for document.classified, and checkpoint-only for the re-drive. */
async function planResolvedIngest(client, { firmId, documentId, lane, deps }) {
  if (!documentId) return skip("skipped_kind");
  if (!(await (deps.hasResolverSurface ?? hasResolverSurfaceDefault)(client))) {
    return skip(lane === "redrive" ? "skipped_no_surface" : "skipped_unresolved_client");
  }
  return {
    status: "projected", lane: lane === "redrive" ? "filed_redrive" : "resolved_ingest",
    mutate: async (c) => {
      const r = await (deps.resolveAndIngestWikiSource ?? resolveAndIngestWikiSourceDefault)(
        c, { firmId, documentId });
      return { status: r?.status ?? "skipped_unresolved_client" };
    },
  };
}

/** Dispatch one subscribed event to its lane plan (reads + any network egress happen here). */
export async function planEvent(client, { firmId, ev, deps }) {
  const payload = ev.payload || {};
  switch (ev.eventType) {
    case "entry.approved":
      // UNCHANGED: the event carries an authoritative client_id, so it keeps calling the audited
      // writer directly. Requiring uniqueness here would break a document legitimately filed to more
      // than one client — which is exactly why 0020 put the uniqueness rule in a NEW entry point.
      return planDeterministicIngest(client, { firmId, clientId: ev.clientId, documentId: ev.documentId });
    case "document.classified":
      return planResolvedIngest(client, { firmId, documentId: ev.documentId, lane: "classified", deps });
    case "document.filed":
      return planResolvedIngest(client, { firmId, documentId: ev.documentId, lane: "redrive", deps });
    case "counterparty.created":
      return planCounterpartySynthesis(client, { firmId, ev, clientId: ev.clientId, counterpartyId: payload.counterparty_id, deps });
    case "counterparty.merged":
      return planCounterpartySynthesis(client, { firmId, ev, clientId: ev.clientId, counterpartyId: payload.survivor_id, deps });
    case "egress.consent_granted":
    case "egress.consent_revoked":
    case "egress.purpose_consent_granted":
    case "egress.purpose_consent_revoked":
    case "egress.purpose_activated":
    case "egress.purpose_deactivated":
      return planConsentCheckpointOnly();
    case "seeding.proposal_decided":
      return planSeedingWikiFact(client, { firmId, ev });
    case "document.filing_retired":
      return planFilingRetiredStale(client, { firmId, ev, clientId: ev.clientId, documentId: ev.documentId, deps });
    default:
      return skip("skipped_kind");
  }
}

// --- dead-letter (own txn, matcher idiom) + checkpoint-only ------------------------------------
// F6: a re-failure must REFRESH the row, not merely bump its counter — otherwise `/ready` can warn
// with a stale reason forever after a repair, or stay silent when it should warn (a row that was
// resolved before a rewind must flip back to 'pending' when the event stalls again).
async function recordDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
          set attempt_count = clara.relay_dead_letters.attempt_count + 1,
              reason        = excluded.reason,
              status        = 'pending',
              resolved_at   = null
       returning attempt_count`, [WIKI_PROJECTION_CONSUMER, eventId, String(reason).slice(0, 500)]);
    await client.query("commit");
    return Number(r.rows[0].attempt_count);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}
/** Resolve this event's dead-letter (if any) — runs INSIDE the caller's effect/checkpoint txn so
 *  the recovery is ATOMIC with the projection that earned it (F6). A no-op when no row exists. */
async function resolveDeadLetter(client, eventId) {
  await client.query(
    "update clara.relay_dead_letters set status='resolved', resolved_at=now()"
    + " where consumer=$1 and event_id=$2 and status <> 'resolved'",
    [WIKI_PROJECTION_CONSUMER, eventId]);
}
async function checkpointOnly(client, { firmId, seq, resolveEventId = null }) {
  await client.query("begin");
  try {
    await writeCheckpoint(client, { consumer: WIKI_PROJECTION_CONSUMER, firmId, seq });
    if (resolveEventId) await resolveDeadLetter(client, resolveEventId);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

// One target event: plan (reads + egress) → atomic effect txn { mutate ; checkpoint }. An ENUMERATED
// typed CLR refusal (either phase) is a TERMINAL receipt (checkpoint advances); a connection error
// PROPAGATES (reconnect); a CONFIGURATION refusal and every other throw dead-letter WITHOUT advancing
// the checkpoint — the configuration case additionally flags itself so the firm's cursor blocks
// instead of being swept past by the attempt-exhaustion escape.
async function runTargetEvent(client, { firmId, ev, deps }) {
  const log = deps.log ?? (() => {});
  let plan;
  try {
    plan = await planEvent(client, { firmId, ev, deps });
    // 0020: a lane whose OUTCOME is only decided inside the effect transaction (the serialized
    // resolve-and-ingest, and the filing-retired re-drive) refines its own receipt by returning
    // {status?, redrive?} from mutate. Every other lane returns whatever it returned before and its
    // receipt is unchanged.
    let effect = null;
    await client.query("begin");
    try {
      if (plan.mutate) effect = await plan.mutate(client);
      await writeCheckpoint(client, { consumer: WIKI_PROJECTION_CONSUMER, firmId, seq: ev.seq });
      // F6: a successful (re)projection RESOLVES any dead-letter for this event ATOMICALLY with the
      // effect + checkpoint — so an automatic replay after a repair clears the /ready warning in the
      // same transaction that makes it true, never leaving a stale 'pending' row behind.
      await resolveDeadLetter(client, ev.id);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    }
    const refined = (effect && typeof effect === "object" && typeof effect.status === "string")
      ? effect.status : plan.status;
    const receipt = { status: refined, lane: plan.lane ?? null, event: ev.eventType };
    if (effect && typeof effect === "object" && effect.redrive !== undefined) {
      receipt.redrive = effect.redrive;
    }
    return { ok: true, receipt };
  } catch (err) {
    if (isConnErr(err)) throw err;
    const status = terminalStatusFor(err);
    if (status !== null) {
      log(`[wiki_projection] event=${ev.id} ${ev.eventType} terminal ${err.code}/${claraReason(err) ?? ""} → ${status}`);
      // A terminal refusal converges: advance the checkpoint AND resolve any dead-letter for the
      // event, atomically (F6 — a converged event must not keep warning on /ready).
      await checkpointOnly(client, { firmId, seq: ev.seq, resolveEventId: ev.id });
      return { ok: true, receipt: { status, event: ev.eventType } };
    }
    if (isConfigurationRefusal(err)) {
      log(`[wiki_projection] event=${ev.id} ${ev.eventType} REFUSED ${err.code}/${claraReason(err) ?? ""}`
        + " — this is a RUNTIME MISCONFIGURATION, not a convergence. The checkpoint is NOT advanced"
        + " and nothing is skipped: fix the deployment and this event projects on the next cycle."
        + " (isolation_unsupported = the connection is at REPEATABLE READ, which 0019 §1b refuses;"
        + " budget_unknown = the wiki_budgets config rows are missing; CLR03 = the wiki read runs"
        + " without the v25 runtime marker/role; 42501 = a missing EXECUTE grant.) The leader also"
        + " releases leadership so a corrected standby can take over (F3).");
      const attempts = await recordDeadLetter(client, {
        eventId: ev.id,
        reason: `${CONFIG_DEAD_LETTER_PREFIX}${err.code}/${claraReason(err) ?? ""}: ${err?.message ?? String(err)}`,
      });
      return { ok: false, err, attempts, configuration: true };
    }
    if (isClaraCode(err)) {
      log(`[wiki_projection] event=${ev.id} ${ev.eventType} UNRECOGNISED typed refusal`
        + ` ${err.code}/${claraReason(err) ?? ""} — it is not in the closed terminal table and not a`
        + " configuration refusal, so it is NON-EXHAUSTING (ratchet R3 finding F2): it dead-letters"
        + " and BLOCKS the firm cursor — it is NEVER checkpointed away until a human classifies it.");
      const attempts = await recordDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
      return { ok: false, err, attempts, unclassified: true };
    }
    const attempts = await recordDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
    return { ok: false, err, attempts };
  }
}

// --- per-firm walk (sst-watch/facts-gate shape) ------------------------------------------------
function mapEventRow(row) {
  return {
    seq: Number(row.seq), id: row.id, firmId: row.firm_id, eventType: row.event_type,
    clientId: row.client_id, entryId: row.entry_id, documentId: row.document_id, payload: row.payload || {},
  };
}
async function readEvents(client, firmId, lastSeq, batchSize) {
  const r = await client.query(
    `select id, firm_id, seq, event_type, client_id, entry_id, document_id, payload
       from clara.domain_events where firm_id = $1 and seq > $2 order by seq limit $3`, [firmId, lastSeq, batchSize]);
  return r.rows.map(mapEventRow);
}

async function processFirm(client, { firmId, lastSeq, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const evs = await readEvents(client, firmId, lastSeq, batchSize);
  if (evs.length === 0) return { readCount: 0, maxSeq: lastSeq, effects: 0, blocked: false, configurationBlocked: false };
  let cursor = lastSeq;
  let effects = 0;
  for (const ev of evs) {
    if (!SUBSCRIBED.has(ev.eventType)) continue; // checkpoint-only; coalesced below
    const res = await runTargetEvent(client, { firmId, ev, deps });
    if (res.ok) { cursor = ev.seq; effects += 1; continue; }
    // A runtime MISCONFIGURATION blocks the firm's cursor unconditionally — it is exempt from
    // the exhaustion escape below, which exists to step past poison-pill DATA. Skipping here
    // would checkpoint past an event that never got its chance to project (ratchet R2 B2). It
    // ALSO tells the leader to RELEASE its advisory lock so a corrected standby can take over (F3).
    if (res.configuration) {
      log(`[wiki_projection] event=${ev.id} BLOCKED on a runtime misconfiguration (${res.err?.code}/${claraReason(res.err) ?? ""}) after attempt=${res.attempts} — the checkpoint stays BEHIND this event until the configuration is fixed; NO event is skipped, and this leader will RELEASE leadership so a corrected standby can take over`);
      return { readCount: evs.length, maxSeq: cursor, effects, blocked: true, configurationBlocked: true };
    }
    // An UNRECOGNISED typed refusal is likewise NON-EXHAUSTING (ratchet R3 finding F2): it blocks
    // the cursor until a human classifies it. It is NOT a deployment misconfiguration, so leadership
    // is held in place — a failover would only meet the same unknown refusal.
    if (res.unclassified) {
      log(`[wiki_projection] event=${ev.id} BLOCKED on an UNRECOGNISED typed refusal (${res.err?.code}/${claraReason(res.err) ?? ""}) after attempt=${res.attempts} — the checkpoint stays BEHIND it until it is classified into the terminal or configuration set; NO event is skipped`);
      return { readCount: evs.length, maxSeq: cursor, effects, blocked: true, configurationBlocked: false };
    }
    if (res.attempts >= MAX_ATTEMPTS) {
      log(`[wiki_projection] event=${ev.id} exhausted ${MAX_ATTEMPTS} attempts → dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await checkpointOnly(client, { firmId, seq: ev.seq });
      cursor = ev.seq;
      continue;
    }
    log(`[wiki_projection] effect-error event=${ev.id} attempt=${res.attempts}/${MAX_ATTEMPTS}: ${res.err?.message ?? res.err}`);
    return { readCount: evs.length, maxSeq: cursor, effects, blocked: true, configurationBlocked: false };
  }
  const batchMax = evs[evs.length - 1].seq; // trailing/interior non-target (incl. wiki.*): one coalesced advance
  if (batchMax > cursor) { await checkpointOnly(client, { firmId, seq: batchMax }); cursor = batchMax; }
  return { readCount: evs.length, maxSeq: cursor, effects, blocked: false, configurationBlocked: false };
}

export async function runWikiProjectionCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const work = await discoverWork(client, { consumer: WIKI_PROJECTION_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let effects = 0;
  let configurationBlocked = false;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, deps });
      if (res.configurationBlocked) configurationBlocked = true;
      if (res.blocked || res.maxSeq <= cur.lastSeq) { cur.active = false; continue; }
      cur.lastSeq = res.maxSeq;
      effects += res.effects;
      anyActive = true;
      if (res.readCount < batchSize) cur.active = false;
    }
    if (!anyActive) break;
  }
  return { firms: work.length, effects, capped: cursors.some((c) => c.active), configurationBlocked };
}

// --- redrive (runtime-role, sst-watch pattern); idempotent via op_key + already_projected + put-409
async function readEventById(client, eventId) {
  const r = await client.query(
    "select id, firm_id, seq, event_type, client_id, entry_id, document_id, payload from clara.domain_events where id = $1",
    [eventId]);
  return r.rowCount === 0 ? null : mapEventRow(r.rows[0]);
}

export async function wikiProjectionRedrive(client, eventId, deps = {}) {
  const dl = await client.query("select status from clara.relay_dead_letters where consumer = $1 and event_id = $2",
    [WIKI_PROJECTION_CONSUMER, eventId]);
  if (dl.rowCount === 0) throw new Error(`wiki_projection redrive: no dead-letter for consumer='wiki_projection' event=${eventId}`);
  const ev = await readEventById(client, eventId);
  if (!ev) throw new Error(`wiki_projection redrive: event ${eventId} not found`);
  if (!SUBSCRIBED.has(ev.eventType)) throw new Error(`wiki_projection redrive: event ${eventId} is '${ev.eventType}', not subscribed`);
  const plan = await planEvent(client, { firmId: ev.firmId, ev, deps });
  let effect = null;
  await client.query("begin");
  try {
    if (plan.mutate) effect = await plan.mutate(client);
    await client.query("update clara.relay_dead_letters set status='resolved', resolved_at=now() where consumer=$1 and event_id=$2",
      [WIKI_PROJECTION_CONSUMER, eventId]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
  const status = (effect && typeof effect === "object" && typeof effect.status === "string")
    ? effect.status : plan.status;
  return { resolved: true, consumer: WIKI_PROJECTION_CONSUMER, status, eventId };
}

export const CONSUMERS = Object.freeze({
  wiki_projection: Object.freeze({ name: WIKI_PROJECTION_CONSUMER, identity: "runtime-role", redrive: (c, id, o) => wikiProjectionRedrive(c, id, o) }),
});
