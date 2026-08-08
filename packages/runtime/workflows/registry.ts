// Workflow registry — names the NEWEST version of each workflow class.
//
// Appendix A policy (b): enqueue sites import from HERE so they always target
// the newest version. When a behavioural change is needed, add
// closeExample.v2.ts and repoint the entry below; keep the old export until
// zero non-terminal runs reference it (never rename/delete an export with
// in-flight runs — a rename strands parked runs, policy (c)).

import { closeExampleV1 } from "./closeExample.v1.js";
import { chatTurn_v1 } from "./chatTurn.v1.js";
import { chatTurn_v2 } from "./chatTurn.v2.js";
import { chatTurn_v3 } from "./chatTurn.v3.js";
import { chatTurn_v4 } from "./chatTurn.v4.js";
import { chatTurn_v5 } from "./chatTurn.v5.js";
import { chatTurn_v6 } from "./chatTurn.v6.js";
import { chatTurn_v7 } from "./chatTurn.v7.js";
import { chatTurn_v8 } from "./chatTurn.v8.js";
import { chatTurn_v9 } from "./chatTurn.v9.js";
import { chatTurn_v10 } from "./chatTurn.v10.js";
import { documentIngest_v1 } from "./documentIngest.v1.js";
import { documentIngest_v2 } from "./documentIngest.v2.js";
import { invoiceFacts_v1 } from "./invoiceFacts.v1.js";
import { statementFacts_v1 } from "./statementFacts.v1.js";
import { autoDraft_v1 } from "./autoDraft.v1.js";
import { autoDraft_v2 } from "./autoDraft.v2.js";
import { autoDraft_v3 } from "./autoDraft.v3.js";
import { autoDraft_v4 } from "./autoDraft.v4.js";
import { autoDraft_v5 } from "./autoDraft.v5.js";
import { autoDraft_v6 } from "./autoDraft.v6.js";
import { autoDraft_v7 } from "./autoDraft.v7.js";
import { firmInterview_v1 } from "./firmInterview.v1.js";
import { firmInterview_v2 } from "./firmInterview.v2.js";
import { firmInterview_v3 } from "./firmInterview.v3.js";
import { clientOnboarding_v1 } from "./clientOnboarding.v1.js";
import { clientOnboarding_v2 } from "./clientOnboarding.v2.js";
import { clientOnboarding_v3 } from "./clientOnboarding.v3.js";

export const workflows = {
  closeExample: closeExampleV1,
  chatTurn: chatTurn_v10,
  documentIngest: documentIngest_v2,
  invoiceFacts: invoiceFacts_v1,
  statementFacts: statementFacts_v1,
  autoDraft: autoDraft_v7,
  firmInterview: firmInterview_v3,
  clientOnboarding: clientOnboarding_v3,
} as const;

// Slice 6 repointed `chatTurn:` v1→v2, then v2→v3 (the GATE-3 live find: v2's
// park-resume re-sent collected stream output as an assistant INPUT message,
// which fails model-input validation after a WDK replay — v3 sanitizes the park
// message to text + the clarify tool-call only). Wave A2 repointed v3→v4 (the §9
// live find: v3's frozen draft tool was supplier-bill-only — it hardcoded
// coding_kind 'supplier_bill' — while the 0015 DB floor already enforced the
// sales/CN shapes; v4 passes the model's coding_kind through). The v1/v2/v3
// bodies stay frozen + built and their exports reachable so no parked run is
// ever stranded (policy (c)); new admissions target v4; the engine resumes old
// runs by run id. Wave A2 then repointed v4→v5 (the §9 Gate-B live find: no chat
// version could send a NULL coding_kind, so the generic voucher lane the DB has
// always accepted was undraftable via chat; v5 adds "journal_entry"->NULL). Wave A2.1
// repointed v5→v6 (PROMPT-only: the SST registration-watch surfacing framing + the
// purchase 3-leg visibility-split guidance + direction-first vocabulary; the draft
// schema/steps are byte-identical to v5) and autoDraft v1→v2 (the same purchase 3-leg
// guidance + an sst_registration_watch awareness note for the unattended sweep). Wave B
// (v25, WB-R18 ceremony) repointed v6→v7 and autoDraft v2→v3: v7/v3 fetch the pack with
// the 'wiki_coding' purpose + the txn-local clara.pack_consumer='v25' GUC (FORK-6/AMB-1/
// AMB-2 — the 0017 pack v4 wiki block renders ONLY under both), pin the tool's purpose to
// a z.literal, and carry the WB-R6(4) wiki framing + citation-visible-reasoning prompt
// law; the frozen v1–v6/v1–v2 closures stay wiki-dark by construction. Wave B also added
// the two durable interview classes (FORK-8): firmInterview_v1 + clientOnboarding_v1
// (hook-per-question parks, P19 plan-checkpoint persistence). Post-Wave-B repointed BOTH
// interview classes v1→v2 (interview_v2, F1+F2): v1's registration validator anchored on a
// leading digit and refused a state-prefixed ROB number outright — a sole-proprietor client
// could not be onboarded at all — and its framework question offered only MPERS/MFRS, which is
// a Sdn Bhd's choice presented as everyone's (no approved standard is imposed on an LLP or a
// ROBA-registered business). v2 accepts every printed registration form and asks two
// entity-type-aware axes (framework + accounting basis) over a config table. The v1 bodies stay
// frozen, built and EXPORTED so no parked run is stranded (policy (c)) — this class's parks are
// the ≥48h kind, so a live run on v1 is the expected case, not a corner one; the engine resumes
// them by run id. Post-Wave-B also repointed documentIngest v1→v2 (ledger task #28): v1's
// behavior closure destroyed its local task sidecar (spool.mjs's task-<id>.json — the ONLY
// place carrying storageKey/sha256/mime/format for a retry, plus the failure code for
// diagnosis) on EVERY failed attempt, before the step-retry it invites by throwing ever runs —
// the retry then finds nothing and fails with a generic "no durable runtime metadata" error,
// burying the real diagnosis. v2 never removes the sidecar on failure; it records the failure
// code onto it instead (full rationale in documentIngest.behavior_v2.mjs). Post-Wave-B also
// repointed autoDraft v3→v4 (ledger #44 / GH #42): the first production one-click autodraft
// run died in its model step — a bad admission-time model-id default (config, migration
// 0033_autodraft_model_default) COMPOUNDED by a real swallow: v3's model step piped every
// fullStream part through uninspected, so a genuine vendor rejection could surface only as
// ai@7's generic NoOutputGeneratedError, and its own top-level catch settled every failure
// with a fixed "sweep draft failed" regardless of cause. v4 captures the stream's own error
// part and forwards the real caught error into the settle record (full rationale in
// autoDraft.v4.impl.ts / autoDraft.v4.ts). Post-Wave-B ALSO repointed autoDraft v4->v5
// (ledger #46, owner ruling 2026-07-29 — THE SST-ZERO PRECEDENT): task
// 7b389b4f-86af-4c72-ac17-07f1084eccb9 (IV-00743) settled CLR21 coding_incomplete on its
// second attempt — the model correctly read the bill's stated-but-ZERO "SST Amt @ 6%: 0.00"
// line and correctly refused to draft, because no chart-of-accounts account carried the
// sst_purchase_cost special type this pre-v5 rule required for ANY stated tax figure,
// zero or not. The owner ruled on the client's OWN precedent: the client's four
// previously-approved EZSEC entries (all printing the identical "SST Amt @ 6%: 0.00" line)
// are ALL two-leg — a stated-but-zero tax documents "no tax charged", not a visibility
// split. v5 narrows the three-leg sst_purchase_cost split to a STATED NONZERO tax; a
// stated ZERO or absent tax takes the two-leg shape (full finding + ruling in
// autoDraft.v5.prompt.ts's own header). IV-00743 stays parked — its two real, distinct
// failures predate this rule and remain the control's honest record; this fix targets
// FRESH filings under the same recurring-vendor family. The SAME ceremony ALSO repointed
// chatTurn v7->v8 (the owner-approved closing batch, 2026-07-29) — THREE functional
// changes: (#46a, the diagnostic twin) chatTurn.v8.impl.ts's consumeChatTurnModelResult
// ports the ledger #44 stream-error-capture pattern (duplicated, cross-referenced — a
// versioned workflow must never couple its shape to another workflow FAMILY's frozen
// file), tagging a genuine caught stream error onto the thrown message so it survives
// into the run's own workflow_stream_chunks / the WDK step-failure record instead of
// being swallowed into ai@7's generic NoOutputGeneratedError. clara.agent_tasks.
// error_code carries a CHECK constraint (0006_runtime_core.sql:153) that does NOT admit
// the tag's own code — a Codex confirmation pass on this PR caught a first draft
// forwarding it verbatim, which would have violated the CHECK and left the task stuck
// non-terminal. error_code therefore settles 'model_error' in EVERY case, tagged or
// not — the SAME value v7 always wrote; it does not differentiate a stream error from
// any other failure. The diagnostic value #46a adds lives entirely in the tagged
// MESSAGE, never this column; (#46b, RULED: propagate) chatTurn adopts the SAME SST-zero precedent
// as autoDraft_v5 — a STATED NONZERO tax keeps the three-leg sst_purchase_cost split, a
// STATED ZERO or absent tax takes the two-leg shape — with the human-in-loop context
// noted (chatTurn is attended; the fix removes friction at the source rather than
// relying on review alone); (#35, bind-existing counterparty) the draft tool's prompt +
// schema guidance now prefers an existing counterparty_id (discoverable via
// list_journal_entries/get_journal_entry) over proposing a new name when the vendor is
// already established — the DB write floor already accepted `{existing_id}`
// unconditionally (Slot B consumes it; the four EZSEC approvals used it via the
// runway's driver), so this is prompt/schema-describe() guidance only; the wrapper
// (runDraftJournalEntry) is byte-unchanged and the DB-side reconciliation walls stay
// the enforcement. Drop a re-export only once zero non-terminal runs of that version
// remain. Wave C-b ADDS a brand-new class, `statementFacts: statementFacts_v1` — nothing is
// repointed and no existing body is touched. One workflow serves BOTH statement lanes
// (`statement_facts` pdf/image, two independent readers behind a typed governed-egress
// dispatch; `statement_parse` csv/ofx, one deterministic in-process parse where THE CHAIN
// IS THE SECOND READER, WC-R7), branching on the claimed task's own lane — the
// documentIngest ocr/structured_parse precedent. It opens the `bank_statement` ->
// `skipped_kind` dead end 0026 left behind. DEPLOY ORDER IS BINDING (design part2 §5): this
// runtime image ships FIRST, then migration 0038, then the consent ceremony — which is also
// why `enqueueForLane` (lib/reconciler-documents.mjs) became an explicit allowlist in the
// same change, so a migration-before-runtime window can never route a bank statement into a
// consentless generic OCR run. GH #152 repointed BOTH interview classes v2->v3 (the park/hook
// INVERSION): v1 and v2 announced a park via streamPromptStep BEFORE arming its hook with
// createHook. WDK registers a hook only at suspension, so those two lines landed in two
// DIFFERENT suspensions and every park was briefly VISIBLE-BUT-UNARMED; an answer POSTed in that
// window raised HookNotFoundError, which the answer route maps to 409 not_pending — a status
// documented as "already delivered" — so a real answer was silently DROPPED (the dashboard's
// useInterviewRun follows that contract; the human just retyped, which is why it went unnoticed
// in production and surfaced first as a CI flake). Measured on the durable record: 44/44 parks
// armed 1.4–55.6ms AFTER they were announced. v3 swaps the two lines to the chatTurn.v8 shape
// (arm, then announce) — within a suspension the engine creates hooks before it dispatches any
// step, so the window is closed by construction. The v1 AND v2 bodies stay frozen, built and
// EXPORTED so no parked run is stranded (policy (c)) — this class's parks are the ≥48h kind, so
// a live run on an older body is the expected case, not a corner one.
//
// §7-A THE UNATTENDED SALES DRAFTER (wave-7a-contract.md, ADR-063) repointed autoDraft v5->v6
// and chatTurn v8->v9 (PR-RUNTIME, one of four review/merge units; ships alongside PR-DB's
// `_coding_lane_core` direction-contract recut + floor drop/recreate + the 6-arity
// settle_autodraft_task overload, applied under the 7A-R1 continuous quiesce ceremony — v6/v9
// must be DEPLOYED and VERIFIED LIVE before the DB migration's activation flag ever flips, so
// the sales draft path is never open against a registry pin that still hardcodes
// "supplier_bill"). autoDraft v6 stops being purchase-only: the draft schema gains coding_kind
// (menu EXACTLY supplier_bill | sales_invoice | sales_credit_note — 7A-R7, no journal_entry in
// the unattended lane), `vendor` generalises to `counterparty` (the SAME match-before-create
// union, widened to name either party), and the runtime tool — never the model — derives the
// authoritative counterparty kind from coding_kind (the DB draft writer stays the one authority
// layer; the model's own optional kind is never trusted, even when it agrees). The
// DB-authoritative TRI-STATE direction contract (7A-R2: sales | purchase | unresolved, bound at
// admission, revalidated in the writer) makes the model's coding_kind a checked PROPOSAL, never
// routing authority. Three new refusal tokens join autoDraft.v6.errors.ts
// (tax_leg_missing/type_polarity_mismatch as CLR21, sst_account_missing as CLR10 —
// 0036:828/1642-1659, 0016:1986-2013), and the generic messages become direction-neutral. The
// settle call moves to the 6-arity settle_autodraft_task overload, carrying the workflow's own
// engine run id (getWorkflowMetadata().workflowRunId) as the required 6th argument — skeleton
// §2d's corrected identity: autodraft_attempts.run_id is the admission-time SWEEP uuid, not the
// engine run id the 0036 caller-run-identity check actually needs. chatTurn v9 carries ONE
// prompt-only reinforcement (severable per skeleton §2f, riding this wave): a sentence appended
// to the supplier-bill paragraph makes explicit that a client-issued document is never coded
// there even if it superficially resembles a bill — it is sales_invoice, crediting income —
// complementing 7A-R4's DB-layer floor-purity fix (`_ocr_sales_floor`'s authority terms now
// require coding_kind='sales_invoice', closing the generic-JE provenance hole). The v5/v8
// bodies stay frozen, built and EXPORTED so no parked run is stranded (policy (c)).
//
// WAVE E / THE F6–F9 FIX BATCH repointed autoDraft v6->v7 and chatTurn v9->v10 (H1
// ACCEPTANCE FINDING F9, ADR-064 §3). §7-A's H1 run measured the drafting model
// mis-transcribing ONE hex group of a 36-character region UUID (…-4c6d-… for the true
// …-4fce-…) on row 19 / filing e1034202, recurring across INDEPENDENT attempts — a fresh
// autodraft supersede AND a separate chat-lane attempt on the same document, which is why
// BOTH families bump. Every other cited region matched exactly, and the same document
// drafted cleanly first try through the hand door with the corrected id
// (wave-7a-acceptance-h1.md:773-790). The DB evidence wall
// (clara._write_entry_evidence) refused CLR21 evidence_invalid every time and was RIGHT
// each time: provenance binding held, and its plain id-equality contract is UNTOUCHED by
// this wave. The defect was upstream — asking a model to reproduce an opaque 36-char
// identifier it was shown once inside a large JSON array. v7/v10 stop asking: the draft
// tool's `evidence[]` element becomes `{ region_idx, quote, field_path? }` (region_id is
// GONE from the toolface — a field the model cannot supply is a field it cannot
// mis-transcribe), and each wrapper's `resolveEvidenceRegions` maps that index back to a
// region_id BY THE `idx` FIELD — never by array position — off the regions it already
// fetches server-side. The `idx` itself is the DB's own per-region ordinal, added
// additively by migration 0054_region_ordinal to clara.get_document_extract — WHICH MUST BE
// APPLIED BEFORE THIS IMAGE GOES LIVE: with no idx published, v7/v10 resolve nothing and
// every document-bound draft refuses (fail-closed, but a full stop on drafting; 0054's own
// header states the order as binding).
//
// THE FIX ROUND (the cross-model review's CRITICAL — Codex #1 + the native reviewer's
// Finding 1, both CONFIRMED, the second MEASURED on a rig). Resolving an index against the
// wrapper's OWN fresh fetch is not enough: an index is RELATIVE. An extraction landing
// between the model's read_document call and its draft call renumbers every ordinal
// ('invoice_facts' sorts before 'ocr', so a facts pass completing renumbers everything), and
// the measured consequence was idx 2 resolving to a DIFFERENT extraction's region carrying
// the same text — which the untouched wall ACCEPTED, recording field_path 'invoice.total',
// the very label the corroboration bound and the supplier-bill shape check select on. A
// stale UUID always named the region it was read from; a stale INDEX can name another. So
// v7/v10 bind resolution to the SNAPSHOT: read_document records a rev of the (idx -> region
// id) mapping it showed, per document, in the tool-set closure; the draft wrapper refuses
// unless the fresh fetch still carries that rev, and refuses outright if this run never read
// THAT document (reading A never licenses citing B — the property the DB wall's document
// join gave v9 for free and an index does not). `field_path` also becomes REQUIRED and is
// cross-checked against the resolved region, so the recorded label is DB-sourced end to end.
// STALENESS IS CLASSIFIED AS A SYSTEM CONDITION, never `evidence_invalid` and never
// question-shaped — a durable human question reading "the extraction moved" is noise, and an
// evidence-blame receipt for a race is a false receipt; each is retryable in-run. A genuine
// mislabel inside a snapshot the model DID read keeps `evidence_invalid`. A duplicate idx
// refuses rather than taking the first (array order must never regain authority).
//
// ROUND 3 (the cross-model re-verify DISCHARGED the snapshot binding by execution, and found
// the RETRY LEG broken — the mechanism the classification above invites). autoDraft's outcome
// reducer returned on the FIRST draft_journal_entry result, but the AI SDK flattens every
// step of the model loop into one `content` array — so `[transient refusal, successful
// draft]` reduced to `refused` and the run settled FAILED while the successful DB write
// already stood. The reducer now takes precedence-then-recency (drafted > noop_existing >
// refused > none), which is what aligning with `stoppedOnSuccessfulDraft`'s own stop
// condition actually means, since two draft calls can land in ONE step. THE DEFECT IS
// PRE-EXISTING: autoDraft.v6.prompt.ts carries the same body byte-identically. What v7
// changed is its REACHABILITY, by inviting the retry — so the correction ships in the v7/v10
// closures and the frozen v6/v9 bodies are not touched. chatTurn was checked and has no
// mirror: toTypedParts_v10 is a MAP, not a reducer, so a retry sequence keeps both parts.
// ONE RESIDUAL IS ACCEPTED AND NAMED, not silently absorbed: a transient the model does NOT
// recover from in-run still settles failed, consumes a durable attempt, and parks the filing
// at the cap — and NO path unparks one (measured across the whole live catalog;
// autoDraft.v7.errors.ts carries the four writers and why each excludes 'parked'). The chat
// and hand doors do not consult that registry, so a parked filing stays codable by a human.
//
// The v6/v9 bodies stay frozen, built and EXPORTED so no parked run is stranded (policy (c)).
export { firmInterview_v1 };
export { firmInterview_v2 };
export { clientOnboarding_v1 };
export { clientOnboarding_v2 };
export { chatTurn_v1 };
export { chatTurn_v2 };
export { chatTurn_v3 };
export { chatTurn_v4 };
export { chatTurn_v5 };
export { chatTurn_v6 };
export { chatTurn_v7 };
export { chatTurn_v8 };
export { chatTurn_v9 };
export { documentIngest_v1 };
export { autoDraft_v1 };
export { autoDraft_v2 };
export { autoDraft_v3 };
export { autoDraft_v4 };
export { autoDraft_v5 };
export { autoDraft_v6 };

export const workflowNames: string[] = Object.keys(workflows);
