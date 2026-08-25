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
import { chatTurn_v11 } from "./chatTurn.v11.js";
import { chatTurn_v12 } from "./chatTurn.v12.js";
import { chatTurn_v13 } from "./chatTurn.v13.js";
import { chatTurn_v14 } from "./chatTurn.v14.js";
import { documentIngest_v1 } from "./documentIngest.v1.js";
import { documentIngest_v2 } from "./documentIngest.v2.js";
import { invoiceFacts_v1 } from "./invoiceFacts.v1.js";
import { statementFacts_v1 } from "./statementFacts.v1.js";
import { statementFacts_v2 } from "./statementFacts.v2.js";
import { witnessFacts_v1 } from "./witnessFacts.v1.js";
import { witnessFacts_v2 } from "./witnessFacts.v2.js";
import { witnessFacts_v3 } from "./witnessFacts.v3.js";
import { autoDraft_v1 } from "./autoDraft.v1.js";
import { autoDraft_v2 } from "./autoDraft.v2.js";
import { autoDraft_v3 } from "./autoDraft.v3.js";
import { autoDraft_v4 } from "./autoDraft.v4.js";
import { autoDraft_v5 } from "./autoDraft.v5.js";
import { autoDraft_v6 } from "./autoDraft.v6.js";
import { autoDraft_v7 } from "./autoDraft.v7.js";
import { autoDraft_v8 } from "./autoDraft.v8.js";
import { autoDraft_v9 } from "./autoDraft.v9.js";
import { firmInterview_v1 } from "./firmInterview.v1.js";
import { firmInterview_v2 } from "./firmInterview.v2.js";
import { firmInterview_v3 } from "./firmInterview.v3.js";
import { clientOnboarding_v1 } from "./clientOnboarding.v1.js";
import { clientOnboarding_v2 } from "./clientOnboarding.v2.js";
import { clientOnboarding_v3 } from "./clientOnboarding.v3.js";

export const workflows = {
  closeExample: closeExampleV1,
  // F-A3 PR-3 (OQ-6, BANK CHAT PARITY, owner ruling 2026-08-25): REPOINTED v13 -> v14. See the
  // note near the bottom of this file for what v14 is and the ORDER its deploy must take against
  // this PR's migrations (the SS4 allowlist widening AND the sibling grant migration this
  // runtime half ships, `0130_chatturn_v14_bank_interactive_grants.sql`).
  chatTurn: chatTurn_v14,
  documentIngest: documentIngest_v2,
  invoiceFacts: invoiceFacts_v1,
  // F-A2 WINDOW B (the statement ACTIVATION): REPOINTED. PR-4 shipped statementFacts_v2 built,
  // frozen and deliberately UNPOINTED because `statement_facts` is a LIVE lane — the registry
  // key IS the routing, so a repoint takes live traffic the moment the image deploys. The three
  // conditions that note named are now met: the persist verb (0098), PR-3's merge, and the
  // router/consent arm (the F-A2 Window-B migration, 0102). THIS LINE IS THE LAST STEP, and it
  // lands inside the SAME quiesce window as that migration, with the machine held stopped
  // between them — a witness-stamped task claimed by the OLD v1 image has NO DB-side guard (the
  // mirror gap does: v2 WAITS on an Azure-stamped task rather than egressing).
  statementFacts: statementFacts_v2,
  // F-A2 openers ①②: REPOINTED v1 -> v2. Unlike PR-4's statementFacts hold-back, this repoint is
  // the intended act — `llm_witness` tasks are minted by a router literal this window's DB
  // migration moves to `:v2` in the same ceremony, and the frozen behaviour WAITS (never
  // egresses) while the two halves disagree. witnessFacts_v1 stays exported and frozen.
  //
  // THE TWO REPOINTS ABOVE ARE INDEPENDENT, and the pairing is worth stating because they look
  // alike: each lane's frozen body compares the TASK's own engine stamp against ITS OWN image
  // snapshot before any egress and WAITS on disagreement. `llm_witness` pairs witnessFacts_v2
  // with the `:v2` invoice literal (0099); `statement_facts` pairs statementFacts_v2 with the
  // `:stmt-witness-v1` statement literal (0102). Neither guard can see the other's lane, so a
  // half-deployed window stalls the affected lane only — it never crosses.
  // debt/prompts-v3: REPOINTED v2 -> v3, the NEXT-ROUND QUEUE fold (five fixes banked out of the
  // 2026-08-21 F-A2 openers re-measure + the owner's 2026-08-24 discount-no-net ruling; full fold
  // in witnessFacts.v3.prompts.mjs's header). UNLIKE the v1->v2 repoint above, this one adds NO
  // answer key and widens NO wire schema, so it carries NO coupled DB migration and NO
  // deploy-order obligation — witnessFacts.v3.impl.ts reuses v2's own injected engine snapshot
  // unchanged (still `:v2`), so a v3 task's DB-stamped engine_id matches this image's snapshot
  // the moment this registry entry deploys. witnessFacts_v2 stays exported and frozen (policy
  // (c)) — the `llm_witness` lane's parks are the deployment-window kind, so a run still resuming
  // into the frozen v2 body at cutover time is the expected case, not a corner one.
  witnessFacts: witnessFacts_v3,
  // F-A2 (the agentic posting lane): REPOINTED v8 -> v9. Same note, same deploy order.
  autoDraft: autoDraft_v9,
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
// (F-A1 PR-2 ADDS a second brand-new class, `witnessFacts: witnessFacts_v1`, on the same terms:
// nothing repointed, no existing body touched. It serves the new `llm_witness` lane — two model
// channels over ONE document, each its own memoized step, one atomic persist. Its tasks are NOT
// minted yet: `_enqueue_invoice_facts_core`'s llm_witness gate is deliberately inert at this
// frontier and `enqueueForLane` does not name the lane, so this image lands and is verified live
// BEFORE PR-3's router recut flips it on — the positive-read law, design §6. Its PROMPTS are
// inside the frozen closure by decision M8, so a prompt tweak is a witnessFacts.v2.)
//
// (F-A1 PR-4 ADDS `statementFacts_v2` — the bank-statement witness pair — AND DELIBERATELY DOES
// NOT POINT `statementFacts:` AT IT. This is the one place PR-4 differs from PR-2's posture, and
// the difference is forced: `llm_witness` was an INERT lane nothing minted, but `statement_facts`
// is minted TODAY, so the registry key IS the routing and a repoint takes live traffic the moment
// the image deploys. Until the (deferred) router arm re-aims the statement engine literal from
// `azure-di:prebuilt-bankStatement.us:2024-11-30` to the witness snapshot
// `llm-openai:{model}:stmt-witness-v1`, every live statement task would reach v2 stamped with the
// AZURE literal — and v2's pre-egress provenance guard (assertStatementEngineStamp) correctly
// WAITS on that mismatch rather than egressing under a false receipt. Those waits would sit in
// the SHARED ocr concurrency window (statement_facts is not M10-windowed), so they would starve
// intake OCR as well as themselves until the per-document attempt cap ended them. So the repoint
// is the LAST step of the cutover: DB persist verb -> PR-3 merge -> the router/consent arm ->
// THEN this key moves to statementFacts_v2. The engine literal in that router arm and the
// snapshot in statementFacts.v2.services.mjs must STRING-EQUAL each other; that pairing carries
// its own battery cell in the follow-up piece.)
//
// (F-A2 WINDOW B — THE ACTIVATION — IS THAT FOLLOW-UP, AND IT HAS NOW LANDED: the ordered
// preconditions above are all met, so `statementFacts:` above is repointed to statementFacts_v2.
// The router arm re-aims the statement engine literal to `llm-openai:{model}:stmt-witness-v1`
// and re-keys the statement typed-consent lookup to `witness_extraction`; the lane stays
// `statement_facts` (0098's own LANE DECISION). The migration and this repoint land inside ONE
// D1 quiesce window with the runtime machine held STOPPED between them: v2 guards the
// router-arm-AFTER-repoint direction by WAITING on an Azure-stamped task, but nothing guards the
// reverse — a witness-stamped task claimed by the still-Azure-shaped v1 body — so that gap is
// closed procedurally, by never letting a claim happen in between. The engine-literal pairing
// carries its battery cell, f-a2.activation-engine-literal, which reads BOTH sides independently
// and compares.)
//
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
//
// WAVE E LANE eta (E-c, THE AD-HOC AUTHORING LANE; design part2 section 11) repointed chatTurn
// v10->v11. v11 is ADDITIVE: five authoring tools (list_metric_catalog, compose_metric_preview,
// save_metric_definition_draft, draft_report_spec, request_report_preview) and one appended prompt
// paragraph. The coding lane is untouched — the draft tool, the evidence-index snapshot binding,
// the clarify park ordering and the C-19 terminal invariant are v10's bodies, reached by IMPORT
// rather than by copy, so they cannot drift; the authoring tools neither stop the model loop nor
// set coding intent. Each WRITING tool reaches the database through exactly one clara.wake_*
// wrapper granted EXECUTE to clara_wake_interactive alone, with an interactive-only
// clara.wake_fn_allowlist row; the evaluator, the catalog writers and epsilon's report verbs stay
// ungranted to every wake role (the eta wake-wrappers migration pair proves the posture in its
// own tail). list_metric_catalog needs no wrapper and gets none — it is an
// RLS-scoped SELECT. Nothing in this lane can approve, issue or sign: saving a composition mints a
// DRAFT definition version (ruled — E-R5), and the render request is pinned to a watermarked draft
// kind. THE DEPLOY ORDER IS BINDING: the eta migration must be applied BEFORE this image goes
// live, or every authoring tool refuses on a missing wrapper (fail-closed, but a full stop on
// authoring). The v10 body stays frozen, built and EXPORTED so no parked run is stranded (policy
// (c)) — chatTurn parks are the human-answer kind, so a live run on v10 is the expected case.
//
// F-A1 PR-3a repointed `chatTurn:` v11->v12 and `autoDraft:` v7->v8 (the consumer
// re-versioning design §3.8 / Annex B row M7 requires: F-A1 PR-1's witness-pair regime,
// `llm_text_facts`/`llm_vision_facts` beside legacy `invoice_facts`, was invisible to both
// coding-lane toolfaces — a witness-only document's facts were dropped outright by the old
// `engine_kind === 'invoice_facts'` filter, and a cross-regime `Math.max(version_n)` could
// silently prefer a stale legacy generation over a fresher witness pair, since version_n is a
// PER-LANE counter). v8/v12 widen the fact-selection to both regimes, resolve the cross-regime
// winner by `extracted_at` alone (a clock tie prefers witness, design §3.3), and correct the
// stale `engine_confidence >= 0.95` mirror the real DB gate excluded structurally since 0023 —
// scoped to the legacy regime alone, so a legacy document's friendly read stays byte-identical
// and a witness document (whose fact regions carry engine_confidence NULL by design, §3.4)
// is no longer silently zeroed out. See autoDraft.v8.tools.ts / chatTurn.v12.tools.ts for the
// full statement. The v7/v11 bodies stay frozen, built and EXPORTED so no parked run is
// stranded (policy (c)).
//
// F-A1 PR-4 (design §3.7) ADDS `statementFacts_v2` — the bank-statement TEXT+VISION WITNESS
// PAIR, replacing v1's single Azure prebuilt-bankStatement read on the `statement_facts` lane;
// `statement_parse` (csv/ofx) is carried over BEHAVIOURALLY UNCHANGED, reached by IMPORTING v1's
// own claim+process steps rather than copying them (statementFacts.v2.impl.ts). It does NOT
// repoint `statementFacts:` — see the deferred-repoint note above, near the `workflows` object,
// for why `statement_facts` being a LIVE (not inert) lane forces that repoint to wait on the DB
// persist verb, PR-3's merge and the router/consent arm, in that order.
// F-A2 WINDOW B: `statementFacts:` now points at statementFacts_v2 (see the entry in the
// `workflows` object). statementFacts_v1 stays frozen, built and EXPORTED so no parked run is
// stranded (policy (c)) — and it is not merely a legacy pointer here: statementFacts_v2 REACHES
// v1's own claim+process steps by IMPORT for the `statement_parse` (csv/ofx) lane, which is
// carried over behaviourally unchanged. Only the `statement_facts` pdf/image lane moves onto the
// witness pair. Drop this re-export only once zero non-terminal statementFacts_v1 runs remain.
//
// F-A2 OPENERS ①② repointed `witnessFacts:` v1->v2 — the first repoint this class has taken, and
// it is a PROMPT-CLOSURE change, which for this class is a body change by decision M8. Two
// payloads ride one version: (②) the type_code question stops asking for a PRINTED MyInvois code
// — which real Malaysian paper invoices never carry, so both channels honestly answered
// `not_printed` and the evaluator's M12 conjunct could never pass, measured 0/33 on the live
// corpus — and asks the model to CLASSIFY the document instead, with the carve-out from the
// verbatim rule named and confined to that one field; (①) the nil-tax arm's evidence: a new
// asked-and-answered `invoice.sst_registration` (party-blind, never belt-required, never CITED —
// the writer's citation allowlist is deliberately unwidened) plus the `witness.coverage` receipt
// carrying the OCR generation the text channel actually read, whether its region block was
// truncated, and which fields the read DOWNGRADED. v2 also mints its own services bundle
// (`llm-openai:{model}:v2`) under its OWN global slot, injected additively in startWorld.ts, so a
// straggler v1 run cannot stamp `:v2` provenance onto a v1-prompt read. THE DEPLOY ORDER IS
// DB-FIRST, RUNTIME-SECOND — the opposite of PR-3's cutover rule: this image sends an answer key
// a pre-widened `clara._witness_answers_ok` refuses with CLR10, which would wedge the invoice
// lane. Rollback is fail-closed for free (a v1 envelope simply carries no SST answer and no
// receipt, so the arm never fires). The v1 body stays frozen, built and EXPORTED (policy (c)).
export { statementFacts_v1 };
export { statementFacts_v2 };
// F-A2 openers ①②: witnessFacts_v1 stops being the `witnessFacts:` pointer and must stay
// EXPORTED — policy (c). The `llm_witness` lane's parks are the deployment-window kind (the
// behaviour WAITS on an engine-stamp mismatch rather than failing), so a run still resuming into
// the frozen v1 body at cutover time is the expected case, not a corner one; the engine resumes
// it by run id and it must find its own body and its own `:v1` services bundle.
export { witnessFacts_v1 };
// debt/prompts-v3: witnessFacts_v2 stops being the `witnessFacts:` pointer and must stay EXPORTED
// — policy (c). It reads its own dedicated `:v2` services bundle (`__claraWitnessFactsServicesV2`)
// unchanged, and v3 reuses that SAME bundle (witnessFacts.v3.impl.ts's header) rather than
// replacing it, so v2's own straggler runs and v3's fresh ones are served correctly side by side.
export { witnessFacts_v2 };
export { firmInterview_v1 };
export { firmInterview_v2 };
export { clientOnboarding_v1 };
export { clientOnboarding_v2 };
// F-A2 — THE AGENTIC POSTING LANE (PR-2, the runtime half) repointed `chatTurn:` v12->v13 and
// `autoDraft:` v8->v9. Design: docs/plan/active/f-a2-agentic-posting-design.md §3/§5, its four
// annexes, and the PR-0 gate record. Owner rulings OQ-1/OQ-4/OQ-6 and D34-D37; orchestrator
// rulings D38-D43.
//
// WHAT CHANGES, IN ONE PARAGRAPH. v8 drafted and stopped; a human approved every entry. v9 keeps
// that first act byte-for-byte and adds a second: after a successful draft the agent may POST
// the entry under her own identity through `clara.wake_post_entry` — a granted wake wrapper over
// an ungranted core whose thirteen-rung ladder, four tiers and posting receipt are the SOLE
// authority on whether the post is lawful. v9 also opens the unattended lane to the GENERIC
// document class (`journal_entry`, superseding 7A-R7 / ADR-063's "no journal_entry in the
// unattended lane" scoping stated further down this file — said in those words because a live
// ruling is being overturned, not drifted past; D18 widens DOCUMENT CLASS and nothing else).
// v13 is the same post verb on the attended lane (chat parity, D34), plus the fail-closed half
// the contract requires: a typed OPEN QUESTION, reached through the new `interactive_client`
// wake kind that PR-1 adds as an EXTENSION of the kind enumeration — never the client-CHECK
// weakening C-3 reversed — and minted for the `wake_open_question` call ALONE (R-1).
//
// THE DEPLOY ORDER, AND IT IS THE OPPOSITE OF THE STATEMENT-ACTIVATION ONE ABOVE. Those two
// repoints had to be the LAST step of their ceremony because the lane's ROUTER moved with them.
// These two are the reverse: PR-1's migration must be applied FIRST, and the image may deploy
// only after. The reason is asymmetric failure, not preference — a v9/v13 image against a
// pre-PR-1 database calls a `clara.wake_post_entry` that does not exist and every post attempt
// fails loudly with 42883, while a post-PR-1 database under the old v8/v12 image simply never
// posts (the verb sits there uncalled, and the whole `posted` chain is behaviourally inert until
// something emits the outcome). One of those is a visibly broken lane; the other is the status
// quo. So: PR-1's D1 window closes, THEN this image ships.
//
// v8 AND v12 STAY FROZEN, BUILT AND EXPORTED so no parked run is stranded (policy (c)) — both
// gained an explicit `export` below, which they had not needed while they were the pinned
// versions. v13 joins them here for the same reason at F-A3 PR-3's own repoint (v13 -> v14,
// OQ-6 bank chat parity, owner ruling 2026-08-25): it is no longer the pinned version, so it
// needs the explicit export a directly-importing consumer (and the rollback preflight,
// packages/runtime/README.md) relies on.
export { chatTurn_v1 };
export { chatTurn_v2 };
export { chatTurn_v3 };
export { chatTurn_v4 };
export { chatTurn_v5 };
export { chatTurn_v6 };
export { chatTurn_v7 };
export { chatTurn_v8 };
export { chatTurn_v9 };
export { chatTurn_v10 };
export { chatTurn_v11 };
export { chatTurn_v12 };
export { chatTurn_v13 };
export { chatTurn_v14 };
export { documentIngest_v1 };
export { autoDraft_v1 };
export { autoDraft_v2 };
export { autoDraft_v3 };
export { autoDraft_v4 };
export { autoDraft_v5 };
export { autoDraft_v6 };
export { autoDraft_v7 };
export { autoDraft_v8 };
export { autoDraft_v9 };

export const workflowNames: string[] = Object.keys(workflows);
