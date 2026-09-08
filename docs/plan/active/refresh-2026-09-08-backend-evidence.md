# Backend evidence for the 2026-09-08 refresh

Status: read-only repository investigation. This report records current implementation, documented intent, and known gaps. It does not approve architecture or change application behavior.

## Method and confidence

- Followed `AGENTS.md`: queried the `C-Users-zhant-Desktop-clara-rebuild` codebase-memory project first, inspected its architecture, and checked indexed coverage for every source cited here before reading source directly.
- The index reported 27,674 nodes and 163,261 edges. Cited paths were marked `metadata_changed`; this signal alone does not establish why metadata changed. Most runtime files had no recorded parse issue; `packages/runtime/workflows/chatTurn.v17.impl.ts` was `parse_partial` near line 99, and several large SQL migrations were partially parsed. Direct source reads are therefore the authority for the line evidence below.
- Read `docs/PRD.md` and `docs/ARCHITECTURE.md`. At investigation start no root `CONTEXT.md` or `docs/adr/` domain record was present; the parent session has since added the glossary for confirmed terminology.
- No tests were run because this was an evidence-only task with no code change. The existing-test inventory below identifies the main executable evidence.
- This report cannot establish hosted state: whether all migrations are deployed, whether disabled wake sources were enabled outside this repository, or whether Vercel/Supabase environment configuration matches the checkout.

## Accepted refresh targets, not current facts

1. A finalized upload is processed automatically and may be matched or posted when the client has granted the required authority and the evidence is sufficient.
2. New chat resets conversation history while preserving work, accounting state, and confirmed knowledge.
3. Firm chat may act across clients, but every unit of work must resolve to an explicit client and ambiguous references must trigger clarification.
4. A client with full automation enabled may let Clara finalize reconciliation and close or lock the period, subject to complete close checks.
5. An unexplained RM10,000 receipt remains an unresolved bank transaction and creates a question; it must not produce a default suspense entry.
6. Work uses a Linear-style list/detail view with the conversation in place.
7. Cancelling work stops remaining actions and retains completed results; reversal is a separate explicit operation.
8. Late evidence for a locked period requires the user's period-treatment decision before reopening or making an allowed later-period adjustment.

No examined backend field provides one `full-auto` switch matching target 4. Authority in the traced paths is split across purpose-specific consents, the unattended-post ladder, signed depreciation/adjustment authorities, holds, task credentials, and human capabilities.

## Strongest ten current facts

### 1. Chat is a custom durable loop built from Vercel Workflow and AI SDK

**Code fact.** The route commits a turn through `begin_chat_turn`, then starts `workflows.chatTurn`; a reconciler handles starts that fail after the database commit (`packages/runtime/src/chatRoutes.ts:213-258`). The live registry pins `chatTurn` to v17 (`packages/runtime/workflows/registry.ts:641-646`). V17 loads history and context, checkpoints each clarification segment, creates a durable Workflow hook, parks without compute, resumes from a human answer, and settles the turn (`packages/runtime/workflows/chatTurn.v17.ts:42-147`). Its implementation performs an eight-step `streamText` tool loop and records usage (`packages/runtime/workflows/chatTurn.v17.impl.ts:90-169`).

This is a repository-owned agent loop using `workflow` plus the Vercel AI SDK. It is not an implementation of a separate native Agents SDK loop.

**Current gap.** The conversation is durable, but interruption delivery is a firm-wide control listener. It leases answered, expired, or cancelled interruptions and resumes the stored hook token (`packages/runtime/lib/control.mjs:76-112`). The database answer door permits any write-capable member of the firm to answer a pending, nonexpired interruption and records the action (`packages/db/migrations/0006_runtime_core.sql:861-889`). The prompt also says answers are visible firm-wide (`packages/runtime/workflows/chatTurn.v10.prompt.ts:190-218`). This is broader than a session-author-only clarification model.

### 2. New session and archive exist; clear/delete do not exist in the bounded chat API

**Code fact.** A user can create a private chat session with an optional pinned `clientId` (`packages/runtime/src/chatRoutes.ts:137-152`). Session listing hides archived sessions by default, and archive is author-only and one-way (`packages/runtime/src/chatRoutes.ts:159-191`; `packages/db/migrations/0174_web_reads_and_small_doors.sql:650-682`). Archived messages remain readable by session id (`packages/runtime/src/chatRoutes.ts:194-211`). No clear or delete endpoint is present in the bounded `chatRoutes.ts` surface.

**Implication for accepted target 2.** Creating a new session already yields an empty transcript while books, work, client facts, and wiki state remain in separate durable tables. A pinned-client chat then reloads current durable context. The missing part is an explicit product lifecycle for new/switch/archive and a stated retention contract; archive currently hides a session rather than clearing its messages.

### 3. Firm chat has a materially smaller tool surface than client-pinned chat

**Code fact.** A session may have no client. The base firm tool set can list unassigned documents, read a document, and clarify; trial balance, journal-entry reads, and journal drafting require a pinned client (`packages/runtime/workflows/chatTurn.v10.tools.ts:391-496`). Later authoring and post/question tools remain client-only (`packages/runtime/workflows/chatTurn.v11.tools.ts:152-290`; `packages/runtime/workflows/chatTurn.v13.tools.ts:363-477`). Bank tools can appear in the aggregate surface, but their executors refuse without a client and mint a client-pinned `interactive_client` credential on behalf of the human (`packages/runtime/workflows/chatTurn.v14.infra.ts:81-98`; `packages/runtime/workflows/chatTurn.v14.bankActs.ts:29-138`). V15 adds firm-wide free-form reads, and v17 adds reports whose descriptions still require a pinned client or exact UUID (`packages/runtime/workflows/chatTurn.v15.tools.ts:35-54`; `packages/runtime/workflows/chatTurn.v17.tools.ts:156-184`).

**Current gap against target 3.** The examined inherited v17 tool stack has no select-client or per-work client-routing tool. A firm session cannot turn an ambiguous client name into a resolved client scope and continue the same command. Its write actions still depend on the session-level client pin.

### 4. Upload ingestion is durable, but autonomous accounting is separated by document kind

**Code fact.** Finalizing an upload starts the durable `documentIngest` workflow (`packages/runtime/src/intakeRoutes.ts:126-144`). World startup registers recovery and separate invoice, statement, and autodraft consumers (`packages/runtime/plugins/startWorld.ts:180-245`). Statement facts persist through `persist_statement_facts_v2` (`packages/runtime/workflows/statementFacts.v3.behavior.mjs:418-455`; `packages/db/migrations/0098_f_a1_statements.sql:688`). The autodraft consumer listens to completed/failed invoice-fact events and entry withdrawals, not statement-fact completion (`packages/runtime/lib/autodraft.mjs:1-16,37-45`). Architecture likewise says bank statements feed bank lines and must not be treated as accounting coding (`docs/ARCHITECTURE.md:193-203`).

**Implication for target 1.** “Process an upload” needs at least two explicit consequences: invoices may enter the draft/post lane, while statements enter statement and bank-line ingestion. Statement ingestion does not currently imply a journal entry.

### 5. Autodraft can post through a client-pinned credential and a database admission ladder

**Code fact.** AutoDraft v10 first drafts an entry, remembers that exact entry id, and permits at most one post attempt for it (`packages/runtime/workflows/autoDraft.v10.toolset.ts:116-170`). A successful post settles as posted. A refusal normally leaves a draft; a tier-D or incomplete outcome fails; a question-shaped block can open a scoped question (`packages/runtime/workflows/autoDraft.v10.ts:85-190`). The unattended post uses a client-pinned `autodraft` credential and `clara.wake_post_entry` (`packages/runtime/workflows/autoDraft.v9.infra.ts:55-78`; `packages/db/migrations/0107_f_a2_posting_grants.sql:175-253`). The wrapper and core require the credential/client boundary, idempotency key, rationale, model snapshot, current books token, and the agent's own untouched draft; posting occurs only when every value in the closed thirteen-rung vector is `pass` (`packages/db/migrations/0106_f_a2_posting_core.sql:819-887,937-965,1268-1329`). The registry calls this ladder the sole posting authority (`packages/runtime/workflows/registry.ts:539-555`).

The older `coding_rules`/`rule_decisions` path is retained as history but is no longer the live unattended-post authority: migration 0106 removes the approval-time rule-breeding writes and the draft-time live-rule read/write limb (`packages/db/migrations/0106_f_a2_posting_core.sql:1531-1572,1625-1649`). The general journal lane only drafts from a voucher with stated debit/credit legs and refuses unsupported control-account or counterparty decisions (`packages/runtime/workflows/autoDraft.v9.prompt.ts:105-113`).

**Actor-floor nuance.** Migration 0106 preserves the human lane's high-stakes distinct-checker/self-attestation arms, but fences that branch with `not is_agent`; the unattended agent instead records `approval_arm='agent_unattended'` after the separate posting ladder passes (`packages/db/migrations/0106_f_a2_posting_core.sql:1393-1408,1496-1505,1304-1328`).

**Contradiction.** The v9 file header describes the workflow as draft-only and never posting, while its actual prompt says it may call POST once after drafting (`packages/runtime/workflows/autoDraft.v9.prompt.ts:37-55`). Runtime behavior follows the tool set and database checks, not that stale header.

### 6. Autonomous bank matching is deliberately weaker than interactive chat, despite an existing database completion door

**Code fact.** The unattended `bankAgent` receives only four acts: context, match, propose an exception, and propose an identifier (`packages/runtime/workflows/bankAgent.v1.tools.ts:5-12`). Its prompt says it cannot settle, unmatch, void, complete reconciliation, add an account, or book a journal entry (`packages/runtime/workflows/bankAgent.v1.prompt.ts:40-94`). Interactive client chat exposes the larger bank surface, including completion (`packages/runtime/workflows/chatTurn.v14.tools.ts:85-169`; `packages/runtime/workflows/chatTurn.v14.bankActs.ts:123-138`). The database already has an autonomous-agent completion wrapper: it checks bank-purpose consent and hold, verifies the expected digest, executes the core completion atomically, and writes a receipt (`packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:6309-6359`). Its Tier-A gate requires active `bank_matching` consent and no bank-agency hold (`packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:4928-4949`).

**Current gap against target 4.** The unattended runtime omits the completion act even though the database can authorize it. The dynamic wake engine exists, but both seeded bank-agent and close-prep sources are disabled (`packages/runtime/plugins/startWorld.ts:247-286`; `packages/db/migrations/0133_g1_wake_engine.sql:784-792,915-923`). Repository evidence cannot prove a hosted override.

### 7. The RM10,000 unknown-receipt target is partially represented but cannot currently open its required question

**Code fact.** BankAgent may propose a disputed exception for an unidentified payer and otherwise leave an ambiguous line alone (`packages/runtime/workflows/bankAgent.v1.prompt.ts:59-65,87-88`). Its bounded tool surface has no question-opening tool, and it cannot book any journal entry (`packages/runtime/workflows/bankAgent.v1.tools.ts:5-12`; `packages/runtime/workflows/bankAgent.v1.prompt.ts:72-75`).

**Current gap against target 5.** Keeping the receipt unmatched is compatible with current behavior, and this workflow cannot create a default suspense entry. The missing consequence is durable question creation and routing from the autonomous bank workflow.

### 8. Close preparation can run autonomously; close finalization is currently human-reserved

**Code fact.** The close-agent migration exposes agent acts for reading, opening/beginning/abandoning close work, proposing close actions, depreciation catch-up, and snapshots (`packages/db/migrations/0138_f_a4_pr_1c_close_agent_limb.sql:1987-2409`). Depreciation catch-up requires live human-signed depreciation authority and is capped at twelve ended periods (`packages/db/migrations/0138_f_a4_pr_1c_close_agent_limb.sql:2353-2409`). A later migration adds a task-bound client-pinned chat credential for close work and a twelve-function chat allowlist (`packages/db/migrations/0159_f_a4_pr_2c_close_chat_lane.sql:176-334`), but explicitly keeps finalize, reopen, attest, and settle unreachable from every wake role (`packages/db/migrations/0159_f_a4_pr_2c_close_chat_lane.sql:440-448`). The current v17 runtime does not expose this close chat lane.

Finalization itself starts in a human context and re-evaluates every close gate in the same transaction (`packages/db/migrations/0120_f_a4_pr_1b_close_lifecycle.sql:267-319`). Drawer-one failures or unknowns cannot be overridden; drawer-two issues require current item-level attestations tied to the measured digest (`packages/db/migrations/0120_f_a4_pr_1b_close_lifecycle.sql:321-372`). It enforces separation/solo-attestation rules, retained-earnings uniqueness, and prior-close continuity before creating and approving the closing entry (`packages/db/migrations/0120_f_a4_pr_1b_close_lifecycle.sql:374-497`).

**Current gap against accepted target 4.** There is no full-auto close-finalize path. Implementing the accepted behavior must preserve these same-transaction completeness checks and define how the present human actor floor is replaced by client-granted authority.

### 9. Journal entries are authoritative GL records, but they are not the whole accounting model

**Code fact.** Journal entries and lines hold the balanced, integer-cent general ledger with maker/checker identity, provenance, status, reversal lineage, and one-sided line/account references (`packages/db/migrations/0003_books_core.sql:97-150`). The architecture names the database as accounting authority and requires exact balance, atomic consequences, and reversal rather than mutation (`docs/ARCHITECTURE.md:91-123`).

Typed accounting state adds consequences a bare journal entry cannot express:

- Approved AR/AP control legs create counterparty open items and settlement events atomically (`packages/db/migrations/0037_wave_c_a_subledger.sql:726-781,1050-1115`). Applying one open item to another can change outstanding balances without new GL movement (`packages/db/migrations/0037_wave_c_a_subledger.sql:3212-3225`).
- Fixed assets carry acquisition/disposal entry links and typed account profiles; depreciation records link the asset, period, and journal entry and keep an immutable run receipt (`packages/db/migrations/0041_wave_d_a_fa_register.sql:318-357,519-536,699-724`).
- Recurring adjustments carry cadence, signed template lines, auto-reversal configuration, execution lineage, and post/draft results. Their generated and reversal entries are linked back to immutable runs (`packages/db/migrations/0045_wave_d_b2_recurring_adjustments.sql:1139-1246,1459-1507,5806-5881`).
- Bank reconciliation separately records imported lines, matches, exceptions, and reconciliation state (`packages/db/migrations/0038_wave_c_b_bank.sql:369,537,605`; `packages/db/migrations/0040_wave_c_c_tieout.sql:262`).

**Correction loop.** Approved accounting history is corrected through linked reversal/supersession and a new consequence, rather than editing the approved record. Before approval, posting refusal leaves the proposed entry in draft or opens a question. Asset, depreciation, adjustment, subledger, and reconciliation records preserve the typed linkage needed to re-evaluate the corrected books. Chat obtains a fresh context pack on a later turn, so correction state is re-read rather than copied from the old transcript.

### 10. “Knowledge” is split between client facts, a projected wiki, and the assembled context pack

**Code fact.** The web Knowledge register reads `client_facts` and displays live and superseded provenanced facts (`apps/web/lib/registers/knowledge.ts:1-59`). Chat independently asks the database for `get_context_pack(clientId, 'wiki_coding')`; failure currently degrades to no pack (`packages/runtime/workflows/chatTurn.v10.impl.ts:112-140`). V17 injects that JSON into the system context (`packages/runtime/workflows/chatTurn.v17.ts:90-96`). Later migrations splice client-fact and entity-type material into the evolving pack (`packages/db/migrations/0055_client_facts_trio.sql:122-147,751-810`).

The wiki portion is advisory. Its pack block includes held status, budgets, prioritized active pages, current content and citations, and the explicit rule `inform_never_decide` (`packages/db/migrations/0017_wave_b.sql:5003-5070`). Stale citations are marked, but not removed or demoted (`packages/db/migrations/0019_wiki_boundary.sql:40-43,111-146`). Wiki versions store content, hash, and a content-addressed storage key (`packages/db/migrations/0017_wave_b.sql:822-891`). The model-generated counterparty lane uploads and verifies the Storage object before database publication, while the deterministic source-ingest and seeding lanes publish database content without that upload (`packages/runtime/lib/wiki-projection.mjs:443-450,465-525,553-598`). The database therefore retains page content, and Storage is not a uniform content authority across all projection lanes.

**Implication for target 2.** Confirmed facts and projected wiki pages already outlive chat sessions and can be loaded into a new client-pinned session. **Product gap:** the visible Knowledge register and chat’s “KB” do not expose one unified object/lifecycle, and a context-pack failure silently removes that knowledge from the turn.

## Main contradictions and design gaps

1. **One automation setting versus fragmented grants.** No examined backend field expresses the accepted client-level full-auto mode. Invoice posting, bank completion, depreciation, and close each use different posting-ladder/credential, consent, signed-authority, and capability mechanisms.
2. **Database doors exceed runtime agency.** The database can authorize autonomous reconciliation completion and task-bound close chat acts, while the unattended bank agent and live v17 chat do not expose those paths.
3. **Close target exceeds the current actor floor.** Finalize remains human-context-only, and wake roles are explicitly excluded. The accepted target requires a new authority path without weakening the complete in-transaction gate evaluation.
4. **Firm chat lacks per-work scoping.** Firm sessions exist, but client-writing tools require the session pin. There is no examined resolve/select/clarify client command loop.
5. **Question routing is uneven.** Autodraft can open a scoped question; BankAgent cannot. The accepted unknown-receipt behavior therefore has no autonomous durable-question path today.
6. **Chat lifecycle is incomplete.** New session and archive exist, but archive is hide-only and one-way. No clear/delete API is present in the bounded chat route.
7. **“KB” has multiple current representations.** The web register surfaces `client_facts`; chat consumes a larger migration-assembled pack with client facts and advisory wiki pages. Their confirmation, supersession, staleness, and failure states need one product contract.
8. **Statements and invoices cannot share one posting promise.** Both are uploads, but current workflows deliberately route statements to bank-line state and invoices to autodraft.
9. **Some source comments are stale.** AutoDraft’s draft-only header contradicts its posting prompt. V16 close prose describing an allowlist-only future predates the v15.9 database lane, although the live runtime still lacks that integration (`packages/runtime/workflows/chatTurn.v16.prompt.ts:47-54`).
10. **Durable wakeup is present but inactive by repository default.** The engine is implemented, yet bank and close sources are seeded disabled. Hosted activation and production retention are unknown; `docs/ARCHITECTURE.md:172-176` also describes producer/activation/retention work as unfinished.

## Existing test evidence

These are the main suites already covering the relevant boundaries; none was executed for this report.

- **Chat loop and credentials:** `packages/runtime/tests/fs7-v17-chatturn.test.mjs`, `packages/runtime/tests/fs7-v17-chatturn-db.test.mjs`, `packages/runtime/tests/ai-sdk-request-shape.test.mjs`, `apps/web/lib/clara/liveClarify.test.ts`, and `apps/web/lib/clara/turnRun.test.ts`. The database chat-turn test specifically checks that the normal live-chat credential is task-unbound (`packages/runtime/tests/fs7-v17-chatturn-db.test.mjs:334-386`); it does not prove that the later special close credential is wired into runtime.
- **Upload, extraction, statement, and posting:** `packages/runtime/tests/intake-unit.test.mjs`, `packages/runtime/tests/intake-db.test.mjs`, `packages/runtime/tests/wave-a-autodraft-consumer.test.mjs`, `packages/runtime/tests/h17-autodraft-v10-constraint-map.test.mjs`, `packages/runtime/tests/f-a2-statement-persist-settle.test.mjs`, and `packages/runtime/tests/f-a2-statement-activation.test.mjs`.
- **Bank authority and chat parity:** `packages/runtime/tests/g1-wake-bank-*`, `packages/db/tests/f-a3-pr1c-egress-bank-matching.test.mjs`, `packages/db/tests/f-a3-pr3-chatturn-v14-bank-parity.test.mjs`, plus the tests under `apps/web/lib/bank/`.
- **Close lifecycle and lane:** `packages/db/tests/f-a4-pr1c-close-agent-limb.test.mjs`, `packages/db/tests/f-a4-pr2c-close-chat-preintegration-gate.mjs`, `packages/db/tests/dba-close-gate-codeability.test.mjs`, `packages/db/tests/er9-close-lifecycle.test.mjs`, and `apps/web/lib/close/api.test.ts`.
- **Accounting consequences and correction:** `packages/db/tests/x41-depreciation.test.mjs`, `packages/db/tests/x42-adjustments.test.mjs`, `packages/db/tests/x42-adjustments-stale.test.mjs`, `packages/runtime/tests/reconcile-fa.test.mjs`, `packages/runtime/tests/reconcile-fa-unit.test.mjs`, and `packages/runtime/tests/reconcile-adjustments-unit.test.mjs`.
- **Wiki/knowledge projection:** `packages/runtime/tests/wave-b-wiki-projection-unit.test.mjs`, the adjacent wiki consumer tests, `packages/db/tests/wave-b/wb-w-wiki.test.mjs`, and the web Knowledge-register tests.

## Installed versions relevant to the refresh

The checked manifests and lockfile resolve the backend agent stack to `ai@7.0.77`, `workflow@4.8.4`, `@workflow/world-postgres@4.3.4`, `@ai-sdk/openai@4.0.46`, `zod@4.4.3`, and `express@5.2.1`. The web app resolves Next `16.3.3`, React `19.2.8`, `@supabase/ssr@0.12.5`, and `@supabase/supabase-js@2.112.4`.

These installed versions, rather than generic SDK documentation, describe the APIs the present source is using.
