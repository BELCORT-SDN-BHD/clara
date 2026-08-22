// Wave-A rig — writer wrappers + wake-credential + higher-level fixtures (NOT a
// test file). Re-exports wave-a-reads (→ wave-a-helpers → s6-fixtures) so a test
// file imports ONE leaf. Contract-blind: every 0011 writer is called by its PINNED
// name + params (INTERFACE-PINS §2). A 42883 / param-name divergence at 0011 is a
// FINDING surfaced by the calling test. All new-fn calls are gated behind
// skipUnready() in the test bodies, so they never fire when 0011 is absent.

import { randomUUID } from "node:crypto";
import {
  ROLES, humanQuery, roleQuery, rootQuery, wakeQuery, opk, WA_DEFAULTS, ORIGIN,
  seedCitedDocument, filedDocument, freshResolution, billLines, ev,
  wakeDraftEntry, invoiceFactsTask, mintLegacyInvoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, statedIdentityFields, agreedEnvelope, firmOf, FIELD, CODING_KIND,
} from "./wave-a-reads.mjs";
export * from "./wave-a-reads.mjs";

const j = (v) => (v == null ? null : JSON.stringify(v));

// ---------------------------------------------------------------------------
// Wake credential — the 5-arg mint (PINS §1: mint_wake_credential gains p_client).
// ---------------------------------------------------------------------------

/** mint_wake_credential(p_wake_kind, p_firm, p_on_behalf_of, p_ttl, p_client). */
export async function mintWake5({ kind, firm, onBehalfOf = null, ttl = "15 minutes", client = null }) {
  const r = await roleQuery(
    ROLES.runtime,
    "select * from clara.mint_wake_credential(p_wake_kind => $1, p_firm => $2, p_on_behalf_of => $3, p_ttl => $4::interval, p_client => $5)",
    [kind, firm, onBehalfOf, ttl, client],
  );
  const row = r.rows[0] ?? {};
  return { credentialId: row.credential_id ?? null, secret: row.secret };
}

/** An autodraft wake credential pinned to a client (system-origin, OBO nobody). */
export async function mintAutodraftCred(firm, client) {
  return mintWake5({ kind: "autodraft", firm, onBehalfOf: null, client });
}

/** wake_client() under a wake secret (txn-local). Returns the pinned client uuid. */
export async function wakeClientOf(role, secret) {
  const r = await wakeQuery(role, secret, "select clara.wake_client() as c", []);
  return r.rows[0]?.c ?? null;
}

// ---------------------------------------------------------------------------
// Counterparty writers (human, bookkeeper+) — companion §2.
// ---------------------------------------------------------------------------

export async function addAlias(sub, { client, counterparty, alias, origin = "human", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.add_counterparty_alias(p_client => $1, p_counterparty => $2, p_alias => $3, p_origin => $4, p_op_key => $5) as r",
    [client, counterparty, alias, origin, opKey ?? opk("alias")]);
  return r.rows[0].r;
}
export async function retireAlias(sub, { client, alias, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.retire_counterparty_alias(p_client => $1, p_alias => $2, p_op_key => $3) as r",
    [client, alias, opKey ?? opk("unalias")]);
  return r.rows[0].r;
}
export async function renameCounterparty(sub, { client, counterparty, newName, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.rename_counterparty(p_client => $1, p_counterparty => $2, p_new_name => $3, p_op_key => $4) as r",
    [client, counterparty, newName, opKey ?? opk("rename")]);
  return r.rows[0].r;
}
export async function mergeCounterparties(sub, { client, survivor, merged, reason = "rig merge", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.merge_counterparties(p_client => $1, p_survivor => $2, p_merged => $3, p_reason => $4, p_op_key => $5) as r",
    [client, survivor, merged, reason, opKey ?? opk("merge")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Autodraft admission + sweep lifecycle (companion §4/§5).
// ---------------------------------------------------------------------------

/** admit_autodraft_task(p_filing, p_origin, p_run_id, p_model, p_reserve_tokens) — runtime.
 *  SWEEP admissions are RUN-BOUND (as-built + Lane C + PIN-ANSWERS §5b A): when
 *  origin='sweep' and no runId is supplied, open a real sweep_run for the filing's firm
 *  and thread its uuid as p_run_id (the as-built refuses a null-run sweep as CLR10
 *  malformed). one_click keeps run_id NULL. A caller may pass an explicit runId to
 *  control the run (e.g. the concurrent-sweep-cap test). */
export async function admitAutodraft({ filing, origin = ORIGIN.sweep, runId = null, model = "gpt-5.6-terra", reserveTokens = WA_DEFAULTS.reserveTokens }) {
  let rid = runId;
  if (origin === ORIGIN.sweep && rid == null) {
    const firm = (await rootQuery("select c.firm_id from clara.document_filings f join clara.clients c on c.id=f.client_id where f.id=$1", [filing])).rows[0]?.firm_id;
    if (firm) rid = await openSweepRun({ firm, expected: 1 });
  }
  const r = await roleQuery(ROLES.runtime,
    "select clara.admit_autodraft_task(p_filing => $1, p_origin => $2, p_run_id => $3, p_model => $4, p_reserve_tokens => $5::bigint) as r",
    [filing, origin, rid, model, reserveTokens]);
  return r.rows[0].r;
}
/** request_autodraft(p_filing) — human one-click wrapper (bookkeeper+). */
export async function requestAutodraft(sub, { filing }) {
  const r = await humanQuery(sub, "select clara.request_autodraft(p_filing => $1) as r", [filing]);
  return r.rows[0].r;
}
/** begin_autodraft_task(p_task, p_workflow_run_id) — runtime CAS+context. */
export async function beginAutodraft({ task, workflowRunId = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.begin_autodraft_task(p_task => $1, p_workflow_run_id => $2) as r",
    [task, workflowRunId ?? `wf-${randomUUID()}`]);
  return r.rows[0].r;
}
/** settle_autodraft_task(p_task, p_outcome, p_tokens, p_entry, p_refusal) — runtime. */
export async function settleAutodraft({ task, outcome, tokens, entry = null, refusal = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.settle_autodraft_task(p_task => $1, p_outcome => $2, p_tokens => $3::bigint, p_entry => $4, p_refusal => $5::jsonb) as r",
    [task, outcome, tokens, entry, j(refusal)]);
  return r.rows[0].r;
}
/** settle_autodraft_task's SIX-arity overload (…, p_workflow_run_id text) — the one the
 *  producer actually calls. It carries its OWN copy of every guard, so a widening proven only
 *  against the 5-arity form is proven on the wrong body. */
export async function settleAutodraft6({ task, outcome, tokens, entry = null, refusal = null, workflowRunId = null }) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.settle_autodraft_task(p_task => $1, p_outcome => $2, p_tokens => $3::bigint, "
    + "p_entry => $4, p_refusal => $5::jsonb, p_workflow_run_id => $6) as r",
    [task, outcome, tokens, entry, j(refusal), workflowRunId ?? `rig-settle6-${randomUUID().slice(0, 8)}`],
  );
  return r.rows[0].r;
}

export async function openSweepRun({ firm, expected }) {
  const r = await roleQuery(ROLES.runtime, "select clara.open_sweep_run(p_firm => $1, p_expected => $2) as r", [firm, expected]);
  return r.rows[0].r;
}
export async function reconcileSweepRuns() {
  const r = await roleQuery(ROLES.runtime, "select clara.reconcile_sweep_runs() as r", []);
  return r.rows[0].r;
}
export async function listAutodraftCandidates() {
  const r = await roleQuery(ROLES.runtime, "select firm_id, filing_id from clara.list_autodraft_candidates()", []);
  return r.rows;
}
/** list_document_autodraft_candidates(p_document) — PIN-ADD-1 event-path resolver;
 *  runtime-only DEFINER; the document's ACTIVE (retired_at is null) filings, firm-scoped. */
export async function listDocumentAutodraftCandidates({ document }) {
  const r = await roleQuery(ROLES.runtime, "select firm_id, filing_id from clara.list_document_autodraft_candidates(p_document => $1)", [document]);
  return r.rows;
}
export async function acknowledgeSweepRun(sub, { run, opKey = null }) {
  const r = await humanQuery(sub, "select clara.acknowledge_sweep_run(p_run => $1, p_op_key => $2) as r", [run, opKey ?? opk("ack")]);
  return r.rows[0].r;
}

/** Under an admitted autodraft task, run the REAL sweep draft path: begin the task,
 *  mint the autodraft wake credential, draft the AP entry via wake_draft_entry, and
 *  return its entry_id — so a settle can record outcome 'drafted' with a genuine
 *  drafted entry (a null entry is refused as 'draft settlement entry not found'). */
export async function autodraftDraftEntry(sub, { task, rf, firm, client, vendorName = "READYCO SDN BHD", amount = 500000 }) {
  await beginAutodraft({ task, workflowRunId: `wf-${randomUUID()}` }).catch(() => {});
  const cred = await mintAutodraftCred(firm, client);
  const draft = await wakeBillDraft(sub, cred, { client, cited: rf, vendorName, amount, opKey: `code-doc:${rf.filingId}:${rf.documentId}` });
  return draft.entry_id ?? draft.entryId ?? null;
}

// ---------------------------------------------------------------------------
// Coding rules (human, bookkeeper+) — companion §7.
// ---------------------------------------------------------------------------

export async function proposeCodingRule(sub, { client, counterparty, accountCode, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.propose_coding_rule(p_client => $1, p_counterparty => $2, p_account_code => $3, p_op_key => $4) as r",
    [client, counterparty, accountCode, opKey ?? opk("proprule")]);
  return r.rows[0].r;
}
export async function signCodingRule(sub, { rule, opKey = null }) {
  const r = await humanQuery(sub, "select clara.sign_coding_rule(p_rule => $1, p_op_key => $2) as r", [rule, opKey ?? opk("signrule")]);
  return r.rows[0].r;
}
export async function declineCodingRule(sub, { rule, reason = "rig decline", opKey = null }) {
  const r = await humanQuery(sub, "select clara.decline_coding_rule(p_rule => $1, p_reason => $2, p_op_key => $3) as r", [rule, reason, opKey ?? opk("declrule")]);
  return r.rows[0].r;
}
export async function retireCodingRule(sub, { rule, reason = "rig retire", conflictQuestion = null, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.retire_coding_rule(p_rule => $1, p_reason => $2, p_conflict_question => $3, p_op_key => $4) as r",
    [rule, reason, conflictQuestion, opKey ?? opk("retrule")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Open questions — split lanes (companion §8).
// ---------------------------------------------------------------------------

export async function openQuestion(sub, { client, scopeKind, scopeId, question = "rig question", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.open_question(p_client => $1, p_scope_kind => $2, p_scope_id => $3, p_question => $4, p_op_key => $5) as r",
    [client, scopeKind, scopeId, question, opKey ?? opk("openq")]);
  return r.rows[0].r;
}
/** wake_open_question — agent lane over the ungranted core (autodraft/interactive). */
export async function wakeOpenQuestion(role, secret, { client, scopeKind, scopeId, question = "rig wake question", opKey = null }) {
  const r = await wakeQuery(role, secret,
    "select clara.wake_open_question(p_client => $1, p_scope_kind => $2, p_scope_id => $3, p_question => $4, p_op_key => $5) as r",
    [client, scopeKind, scopeId, question, opKey ?? opk("wopenq")]);
  return r.rows[0].r;
}
export async function resolveOpenQuestion(sub, { question, resolution = "rig resolved", opKey = null }) {
  const r = await humanQuery(sub, "select clara.resolve_open_question(p_question => $1, p_resolution => $2, p_op_key => $3) as r", [question, resolution, opKey ?? opk("resq")]);
  return r.rows[0].r;
}
export async function dismissOpenQuestion(sub, { question, reason = "rig dismiss", opKey = null }) {
  const r = await humanQuery(sub, "select clara.dismiss_open_question(p_question => $1, p_reason => $2, p_op_key => $3) as r", [question, reason, opKey ?? opk("disq")]);
  return r.rows[0].r;
}
export async function promoteClarify(sub, { interruption, scopeKind, scopeId, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.promote_clarify_to_question(p_interruption => $1, p_scope_kind => $2, p_scope_id => $3, p_op_key => $4) as r",
    [interruption, scopeKind, scopeId, opKey ?? opk("promoteq")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Egress registry (human, OWNER floor) — companion §10.
// ---------------------------------------------------------------------------

export async function grantClientEgress(sub, { client, evidenceDocument, scopeNote = "rig consent", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.grant_client_egress(p_client => $1, p_evidence_document => $2, p_scope_note => $3, p_op_key => $4) as r",
    [client, evidenceDocument, scopeNote, opKey ?? opk("grantegr")]);
  return r.rows[0].r;
}
export async function revokeClientEgress(sub, { client, reason = "rig revoke", opKey = null }) {
  const r = await humanQuery(sub, "select clara.revoke_client_egress(p_client => $1, p_reason => $2, p_op_key => $3) as r", [client, reason, opKey ?? opk("revokeegr")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// 0020 §9.7 — the TYPED egress helpers, ADDED beside the legacy pair, never
// repurposing it.
//
// The two surfaces are deliberately different relations. The legacy pair above governs the
// PURPOSE-BLIND invoice-facts gate: any live clara.client_egress_consents row for the client
// satisfies it. The typed pair below governs one named purpose and, on its own, authorizes
// NOTHING — an owner ACTIVATION is a separate record (§2), and dispatch additionally goes
// through prepare/consume (§3). A test that reaches for the wrong helper is therefore testing a
// different gate, which is exactly why the names stay distinct and the legacy signatures are
// untouched (§6's byte-identity closed set).
//
// The wave-b battery has its own contract-blind wrappers (wb-0020-helpers.mjs) with distinct
// names; these are the §9.7-promised aliases for wave-a-lane tests that need the typed surface.
// ---------------------------------------------------------------------------

/** Stamp document_kind='consent_evidence' on a verified in-firm document. Owner-floored; grants
 *  NO egress (the 2026-07-25 §7.1 amendment — before it, only the legacy grant could stamp the
 *  kind, and it granted invoice-facts egress in the same call). */
export async function classifyConsentEvidenceDocument(sub, { document, reason = "rig signed consent letter", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.classify_consent_evidence_document(p_document => $1, p_reason => $2, p_op_key => $3) as r",
    [document, reason, opKey ?? opk("classifyce")]);
  return r.rows[0].r;
}
/** Mint a typed consent. Does NOT activate — a grant alone never authorizes dispatch. */
export async function grantClientEgressPurpose(sub, {
  client, purpose = "wiki_synthesis", evidenceDocument, scopeNote = "rig typed consent", opKey = null,
}) {
  const r = await humanQuery(sub,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_evidence_document => $3, p_scope_note => $4, p_op_key => $5) as r`,
    [client, purpose, evidenceDocument, scopeNote, opKey ?? opk("grantpurp")]);
  return r.rows[0].r;
}
/** The positive owner act. `consent` must BE the live typed consent for (client, purpose). */
export async function activateClientEgressPurpose(sub, { client, purpose = "wiki_synthesis", consent, opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_consent => $3, p_op_key => $4) as r`,
    [client, purpose, consent, opKey ?? opk("actpurp")]);
  return r.rows[0].r;
}
/** A PAUSE: the consent record survives, dispatch does not. */
export async function deactivateClientEgressPurpose(sub, { client, purpose = "wiki_synthesis", reason = "rig pause", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.deactivate_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_reason => $3, p_op_key => $4) as r`,
    [client, purpose, reason, opKey ?? opk("deactpurp")]);
  return r.rows[0].r;
}
/** WITHDRAWAL: revokes the consent, deactivates its activation, invalidates every unconsumed
 *  authorization and sets the wiki hold — one transaction. */
export async function revokeClientEgressPurpose(sub, { client, purpose = "wiki_synthesis", reason = "rig withdrawal", opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.revoke_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_reason => $3, p_op_key => $4) as r`,
    [client, purpose, reason, opKey ?? opk("revpurp")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Approve — the routine (batch) entry point (PINS §1; refuses is_high_stakes).
// ---------------------------------------------------------------------------

export async function approveRoutineEntry(sub, { entry, expectedRevision, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.approve_routine_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r",
    [entry, expectedRevision, opKey ?? opk("aproutine")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Higher-level fixtures — a real AP supplier-bill filing whose lane the DB
// computes. Every object built THROUGH audited writers (dog-fooding). Consent is
// granted by default so the invoice_facts / egress path is not fail-closed.
// ---------------------------------------------------------------------------

const AP = "400-000"; // payable control (built by the caller's before())
const EXP = "500-A01"; // expense

/** Grant live consent for a client citing a REAL ingested evidence document. */
export async function grantConsent(sub, { firm, client }) {
  const evidence = await filedDocument(sub, { firm, client });
  return grantClientEgress(sub, { client, evidenceDocument: evidence.documentId, scopeNote: "rig standing consent" });
}

/** A filed, cited, facts-complete AP supplier bill for `client` with NO open draft
 *  yet — the raw material a sweep admits. Returns { documentId, filingId, sha256,
 *  regionId, quote, task }. Facts are persisted (Tier-A corroboration present). */
export async function readyFiling(sub, { client, amount = 500000, vendorName = "READYCO SDN BHD", registration = "201801000900" }) {
  const firm = await firmOf(client);
  // A live client_egress_consents row is REQUIRED before the invoice_facts claim
  // (WA-D1 lane-carve: zero rows ⇒ the claim fail-closes to held_egress/CLR28, then
  // persist raises CLR16). Tolerant of a pre-existing live consent (one-live-per-client).
  await grantConsent(sub, { firm, client }).catch(() => {});
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00", kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture's whole point is to exercise the
  // invoice_facts LANE's downstream machinery (persist/claim/draft/sweep), so it mints
  // the legacy task directly rather than through the now-witness-routed enqueue RPC.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, `RM ${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, vendorName),
    factField(FIELD.invoiceId, `INV-${randomUUID().slice(0, 8)}`),
    // 0023 (X5): a corroborated OCR total must STATE its arithmetic. This shared AP fixture
    // models a supplier bill that charges no SST, so it states a zero tax and a net equal to
    // its total — which is what such a document actually prints.
    ...statedIdentityFields(amount),
  ], { envelope: agreedEnvelope() });
  return { ...cited, task, firm, amount, vendorName, registration };
}

/** Draft an AP supplier bill on a cited doc via the wake ceiling (agent-made draft:
 *  last_human_editor NULL). `sub` (the firm owner) authors the resolution the wake
 *  draft binds to. Returns the draft receipt {entry_id, revision_token}.
 *
 *  TWO KNOWN DIVERGENCES FROM PRODUCTION, both deliberate defaults, both documented here
 *  because a fixture that quietly differs from the real caller can make a cell prove the
 *  opposite of what it claims:
 *
 *  1. `coding` DEFAULTS TO NULL, so NO clara.coding_attempts row is written. Production's
 *     autodraft lane DOES pass one -- autoDraft.v6.tools.ts:193 builds
 *     `{ task_id: ctx.taskId, part_payload }` and hands it to wake_draft_entry -- and the
 *     live clara._draft_entry_core admits it for kind='autodraft' as well as 'chat_turn'.
 *     A caller that opts in is ENVELOPE-IDENTICAL WHERE LOAD-BEARING ({ task_id, part_payload }
 *     through the same p_coding parameter); the inner part_payload keys differ inertly, and
 *     that is safe precisely because the 0053 arm never reads them -- it reads only the
 *     coding_attempts row's task_id -> entry_id mapping.
 *     coding_attempts is the ONLY task->entry identity link in the schema
 *     (uq_coding_attempts_task / uq_coding_attempts_entry), so a cell that needs to reason
 *     about "the entry THIS task produced" must pass `coding` or it is testing a shape
 *     production never emits. Opt in rather than changed by default: every pre-existing
 *     caller keeps its current behaviour.
 *  2. `opKey` DEFAULTS TO A FILING-KEYED value (`code-doc:<filing>:<document>`), whereas
 *     production's key is task-keyed. The consequence is real: two drafts on the SAME filing
 *     through this fixture replay the first op receipt and hand back the OLD entry id unless
 *     the caller passes its own key. Documented, not changed -- existing cells depend on the
 *     current default. (Reported by the §7-A F8 review.) */
export async function wakeBillDraft(sub, cred, { client, cited, amount = 500000, vendorName = "DRAFTCO SDN BHD", registration = "201801001000", opKey = null, coding = null }) {
  const res = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  return wakeDraftEntry(cred, {
    client, resolution: res, lines: billLines(EXP, AP, amount),
    document: cited.documentId, sha256: cited.sha256,
    vendor: { new: { name: vendorName, registration_no: registration } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], codingKind: CODING_KIND,
    coding,
    opKey: opKey ?? `code-doc:${cited.filingId}:${cited.documentId}`,
  });
}

/** Prime a counterparty so a later filing resolves to an EXISTING vendor (not a
 *  birth — the READY predicate forbids birth). Drafts + approves a FIRST human AP
 *  bill for the vendor, then builds a fresh cited+facts filing citing the SAME
 *  vendor. Returns { ...readyFiling, counterpartyId }. Best-effort: if the counter-
 *  party cannot be located the field is null (the calling test records a finding).
 *  Consent is granted for the client so the egress lane is not fail-closed. */
export async function primeReadyFiling(sub, { client, amount = 500000, vendorName = "PRIMEDCO SDN BHD", registration = "201801001100" }) {
  const { draftEntryV3, approveEntry, counterpartyRows } = await import("./wave-a-reads.mjs");
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  // FIRST bill (human) — creates the counterparty via _resolve_counterparty. The vendor
  // is NAME-ONLY (no registration): invoice_facts capture only a vendor NAME (no
  // registration field), so a later name-only facts match against a REGISTERED vendor is
  // `registered_name_ambiguous` (→ vendor_ambiguous, not READY). A name-only counterparty
  // gives a clean `name_match_unregistered` → non-ambiguous, which the READY lane needs.
  const first = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00" });
  const d1 = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: first.documentId }),
    document: first.documentId, sha256: first.sha256, lines: billLines(EXP, AP, amount),
    vendor: { new: { name: vendorName } },
    evidence: [ev(first.regionId, first.quote, FIELD.total)], opKey: opk("primecite"),
  });
  await approveEntry(sub, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("primeap") });
  const wantNorm = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cps = await counterpartyRows(client);
  const cp = cps.find((c) => (c.name_normalized ?? c.name_display ?? c.name ?? "").toString().toLowerCase().replace(/[^a-z0-9]/g, "") === wantNorm) ?? cps[cps.length - 1] ?? null;
  // TARGET filing — a fresh cited doc + facts citing the SAME vendor NAME (existing → not birth).
  const rf = await readyFiling(sub, { client, amount, vendorName, registration });
  return { ...rf, counterpartyId: cp?.id ?? null, firstEntry: d1.entry_id };
}

/**
 * F-A2 PR-1 (D39, the claim split) — RESTATE the `rule_sightings` rows the retired breeding
 * block used to write, for ONE already-approved entry.
 *
 * WHY THIS EXISTS. The eighth `clara._approve_entry_core` body excises `0037:2046-2100` whole,
 * so approving a bill no longer accrues a sighting. Dozens of cells across this rig depend on a
 * sighting POOL as a *precondition* — their claim is about the autopost floors, the executor,
 * the sales lift or the preview, never about breeding — and with the pool empty those cells
 * either refuse CLR27 or take an `if (!rule) return;` exit and pass VACUOUSLY, which is worse
 * than failing. Per the claim-split ruling their fixtures change and their assertions do not;
 * the breeding CLAIM itself moved to C.8's inverted twins, which assert the opposite.
 *
 * IT IS A RESTATEMENT, NOT AN INVENTION. The two inserts below are `0037:2049-2061` verbatim in
 * shape — same columns, same `distinct`, same `is_active` join, same income-only credit arm,
 * same `on conflict on constraint uq_rule_sightings_mapping do nothing` — and the writer's own
 * gate is re-checked here (approved, not a reversal, no `checked_via_rule_id`, not a settlement
 * kind) so this helper can never manufacture a row the retired writer would have withheld. The
 * `rule_sightings` table survives KEEP-AS-HISTORY, and the entries these rows cite are the real
 * approved entries, so the pool stays honest evidence — it is simply no longer a side effect.
 *
 * Returns the number of rows written (0 when the writer's own gate would have withheld them).
 */
export async function restateSightings(entry, { counterparty = null } = {}) {
  const e = (await rootQuery(
    `select id, firm_id, client_id, coding_kind, status, reversal_of, checked_via_rule_id
       from clara.journal_entries where id=$1`, [entry])).rows[0];
  if (!e) return 0;
  // The retired writer's own conjunction (0037:2046-2048), re-checked rather than assumed.
  if (e.status !== "approved" || e.reversal_of !== null || e.checked_via_rule_id !== null) return 0;
  if (e.coding_kind === "customer_receipt" || e.coding_kind === "supplier_payment") return 0;
  let cp = counterparty;
  if (!cp) {
    const legs = await rootQuery(
      "select distinct counterparty_id from clara.journal_lines where entry_id=$1 and counterparty_id is not null",
      [entry]);
    if (legs.rows.length !== 1) return 0;   // no counterparty => v_counterparty is null => no breeding
    cp = legs.rows[0].counterparty_id;
  }
  const canon = (await rootQuery(
    "select clara._canonical_counterparty($1,$2) as c", [e.client_id, cp])).rows[0].c ?? cp;
  const debit = await rootQuery(
    `insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
       select distinct $1::uuid,$2::uuid,$3::uuid,l.account_code,$4::uuid,'debit'
       from clara.journal_lines l join clara.coa_accounts a
         on a.client_id=l.client_id and a.account_code=l.account_code
       where l.entry_id=$4::uuid and l.debit_cents>0 and a.is_active
       on conflict on constraint uq_rule_sightings_mapping do nothing`,
    [e.firm_id, e.client_id, canon, entry]);
  const credit = await rootQuery(
    `insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
       select distinct $1::uuid,$2::uuid,$3::uuid,l.account_code,$4::uuid,'credit'
       from clara.journal_lines l join clara.coa_accounts a
         on a.client_id=l.client_id and a.account_code=l.account_code
       where l.entry_id=$4::uuid and l.credit_cents>0 and a.is_active and a.account_type='income'
       on conflict on constraint uq_rule_sightings_mapping do nothing`,
    [e.firm_id, e.client_id, canon, entry]);
  return (debit.rowCount ?? 0) + (credit.rowCount ?? 0);
}

export { AP, EXP };
