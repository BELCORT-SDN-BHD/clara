# The dashboard → web capability diff (2026-09-02)

*Read-only scan, owner-ordered 裁-121 item 1. Answers a question the FS-10 cutover order
(`docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md` §P6-X) does not: that order classifies
`apps/dashboard`'s **61 TEST SUITES**, not its UI capability, so a capability the old app had could
be dropped silently even with a clean 61-suite classification table. This document classifies the
**capability surface** instead — every panel, button and door apps/dashboard exposes, matched to
its apps/web counterpart by door name and behavior. Pinned tree: `origin/main` at `96b2ef61`
(fetched this session; ≥ the ordered `944cb586` floor). Method: four parallel deep-reads of
apps/dashboard's 18 routes + their shared API modules, each door/read grepped live against
`apps/web` (excluding `node_modules` and `*.test.*`), cross-checked against
`docs/plan/active/verb-coverage-census-2026-08-31.md`'s dispositions, the P6 work orders, and the
mohe-grill-rulings ledgers. Every absence claim below names its instrument.*

## Summary

apps/dashboard has **18 routed pages** (`app/**/page.tsx`) plus a root nav index and a Cloudflare
Pages Functions proxy. Of the capability surface enumerated across all 18:

| Class | Count (approx., by capability item) | Meaning |
|---|---|---|
| **SAME** | ~85 doors/reads/panels | Wired in apps/web, same door name, same behavior (several *relocated* per Q3's two-level IA — firm-altitude vs. client-workspace — which is itself ruled, not a loss) |
| **SUPERSEDED-BY-RULING** | 3 (COA bulk-seed· onboarding wizard pages · batch-approve) | A named 裁/Q/R ruling records the replacement |
| **SUPERSEDED-BY-RULING-PENDING-BUILD** | 1 (`create_firm` → `claim_paid_firm`) | The replacement is ruled and designed but **not yet wired** in either app — end-to-end firm creation is currently unreachable in both |
| **HONEST-NOTE** | 2 (bank recon snapshot breakdown · open-item settlement leg of `resolve_and_book_bank_line`) | apps/web renders a `NotBuilt` naming the missing verb |
| **DASHBOARD-ONLY-BY-DESIGN** | 3 (dev JWT-paste auth · "banks" advisory text · the Pages Functions proxy) | Dev/ops tooling superseded by real mechanisms, no product home needed |
| **DROPPED-UNRECORDED** | **7** | No apps/web counterpart, no ruling, no note — the finding class this document exists to produce |
| **RECORDED-DEBT (cross-cutting, not fixed)** | 1 (five receipt-card kinds render as flat summaries, not rich cards) | Already named in a design doc, not silently lost, but still incomplete |

**One instruction-provenance discrepancy found and flagged below**: this scan's own task
briefing cited a ruling "裁-117" and a specific PROGRESS.md quote for the chat session-list
finding. Neither exists anywhere in the repo (verified by direct grep — see §"Citation
discrepancy"). The underlying capability gap is real and independently confirmed; the citation
is not. Treat that one item as unrecorded pending owner confirmation, not as cleanly ruled.

None of the 7 DROPPED-UNRECORDED items sit squarely on the 16-step happy path (signup → checkout
→ firm born → members invited → client onboarded via in-thread interview → documents posted
unattended → bank matched in chat → fiscal year opened → year-end closed with human keys →
management-accounts PDF downloaded → FY2 opened), but two (inline clarify answering, chat file
attachment) touch the "bank matched in chat" and "client onboarded" steps closely enough that a
beta user could plausibly notice the gap during the demo path itself.

---

## 1. Registers domain — accounts, aging, advances, assets

*(Scan: `apps/dashboard/app/accounts`, `/aging`, `/advances`, `/assets` + `assetsApi.ts`,
`advancesApi.ts`, `agingApi.ts`, `counterpartyApi.ts`, `coaTemplate.ts`.)*

| Dashboard surface | Door/relation | apps/web counterpart | Class |
|---|---|---|---|
| `/accounts` — CoA table, add-account form | `coa_accounts` read, `upsert_account` | `apps/web/lib/registers/accounts.ts`; `components/registers/chart-of-accounts-register.tsx:36`, `UpsertAccountDialog.tsx` | SAME |
| `/accounts` — "Apply the template" bulk COA seed (MPERS blocks, sequential `upsert_account`) | client-side `COA_TEMPLATE` → many `upsert_account` calls | none — `rg "COA_TEMPLATE\|coaTemplate\|coa-template" apps/web --type ts --type tsx` → 0 hits | **SUPERSEDED-BY-RULING** (not yet built) — 裁-21 / the "COA PR-d" backlog row (`PROGRESS.md`: "Annex G's admin editor over `0150`'s nine COA doors has no train"); the newer DB-side `fork_coa_template` family is itself on the census's 15-item paused-lane list |
| `/aging` — AR/AP toggle + buckets, statement drill-down | `ar_aging`/`ap_aging`, `customer_statement`/`supplier_statement` | `apps/web/lib/registers/aging.ts:75` (ternary dispatch — the census's own documented Direction-2 trap), `lib/registers/counterparty.ts:257,272` | SAME |
| `/advances` — register, statement, tie strip, particulars, enrol/retire, book application | `staff_advance_summary/_statement/_tie`, `complete_staff_advance_particulars`, `enrol/retire_staff_advance_account`, `book_staff_advance_application` | `apps/web/lib/registers/staff-advances-doors.ts` (all 7 names present), `components/registers/staff-advances-register.tsx` | SAME |
| `/assets` — register, detail, particulars, dispose, depreciation authority ceremony, runs | `list/get_fixed_asset`, `complete/revise_fixed_asset_particulars`, `dispose_fixed_asset`, `get/propose/sign/retire_depreciation_authority`, `set_client_fy_end`, `list_depreciation_runs`, `run_depreciation_manual` | `apps/web/lib/registers/fixed-assets.ts` + `depreciation.ts`, `components/registers/fa-authority-ceremony.tsx`, `fa-depreciation-runs-panel.tsx`, `fa-row-actions.tsx` | SAME |

No DROPPED-UNRECORDED items in this domain. The one real gap (COA bulk-seed) is already tracked
by name in two places (裁-21, COA PR-d) — restated here so the cutover doc doesn't have to
re-discover it, and flagged as **beta-relevant**: a firm's first client onboarding needs a chart
of accounts, and there is currently no apps/web path to seed one in bulk.

---

## 2. Bank and close domain

*(Scan: `apps/dashboard/app/bank`, `/close`, `/close/adjustments` + `bankApi.ts`, `reconApi.ts`,
`adjustmentApi.ts`. High-stakes: "bank matched in chat" and "year-end closed with human keys" are
both literally on the 16-step happy path.)*

| Dashboard surface | Door/relation | apps/web counterpart | Class |
|---|---|---|---|
| Accounts, proposals, statements, open-items-by-counterparty, match candidates, add/deactivate/reactivate account, enter/void statement, match/unmatch/complete-pending, settle-from-bank-line, agency proposals + holds + identifier confirm, counterparty terms | 21 doors/reads | `apps/web/lib/bank/{reads,doors,match-reads,match-doors,recon-reads,recon-doors,exception-doors,agency-doors,table-reads}.ts` → `components/bank/{accounts,statements,matching,agency,reconciliation,exceptions}-section.tsx` | SAME |
| `remap_bank_account_coa` | door exists, tested | `apps/web/lib/bank/doors.ts:62` implements it, but **no control calls it** — `accounts-section.tsx:8-10`'s own comment: "a real, tested door … not yet wired to a control here — scope trim, not a missing verb" | **DROPPED-UNRECORDED** — a code comment records the trim, but no `NotBuilt` renders and no ruling cites it. Not on the happy path (re-coding an existing bank account's GL mapping is a maintenance action, not a first-run one). *Disposition: honest note is cheap and correct here — the comment already exists, it just needs a user-visible twin.* |
| `get_bank_reconciliation`'s itemized snapshot breakdown | same door, fuller read | `apps/web/components/bank/reconciliation-section.tsx:214` renders `<NotBuilt missingVerb="get_bank_reconciliation's full snapshot (outstanding items/groups breakdown)"/>` | **HONEST-NOTE** |
| `resolve_and_book_bank_line`'s `matched_booking` (open-item settlement) disposition | same door, one of two dispositions | `exceptions-section.tsx:190` renders `<NotBuilt missingVerb="resolve_and_book_bank_line(disposition='matched_booking', …) — the open-item settlement leg"/>`; only `written_off_adjustment` is wired | **HONEST-NOTE** |
| "Banks" interview-answer advisory text (composed from plan/plan_items) | advisory only, no door | `rg "'banks'|\"banks\"" apps/web/lib/bank apps/web/components/bank` → 0 hits | **DASHBOARD-ONLY-BY-DESIGN** — trivial non-blocking advisory copy |
| `/close` — fiscal years, close plan, attest exception | `list_fiscal_years`, `get_close_plan`, `attest_close_exception` | `apps/web/lib/close/api.ts` → `ClosePage.tsx`/`ClosePlanPanel.tsx` | SAME |
| `/close/adjustments` — propose/sign/retire template, run manual, reverse/approve/cancel pair, run-due, list runs | 9 doors | `apps/web/lib/registers/adjustments.ts` → `adjustments-register.tsx`/`adjustment-pair-reversal-panel.tsx` | SAME |
| `propose_adjustment_template`'s `p_replaces` (supersede a live template) and `p_schedule` (variable amortisation schedule) parameters | same door, two parameters | `apps/web/lib/registers/adjustments.ts:273-274` hardcodes both to `null`; `:42-46` comments the trim as deliberate ("`p_replaces` is a template-lineage flow with its own ancestor-bridging rules and `p_schedule` is a whole second congruence-checked sub-language") but no `NotBuilt` renders and no ruling names it | **DROPPED-UNRECORDED** — not on the happy path, but correctness-adjacent (template-lineage exists specifically to prevent double-posting when a template is revised). *Disposition: honest note at minimum; an owner ruling is the safer bar given the estate's history with double-posting defects.* |

**Cross-cutting finding (spans bank/assets/advances/adjustments, RECORDED-DEBT not silently
lost):** the dashboard's chat-embedded receipt cards (`AdjustmentRunReceiptCard.tsx`,
`BankReconReceiptCard.tsx`, `FixedAssetCard.tsx`, `DepreciationRunReceiptCard.tsx`,
`StaffAdvanceCard.tsx`) render full inline actions. apps/web's `PartRenderer.tsx:92-100` routes
all five (`bank_recon_receipt`, `fixed_asset`, `depreciation_run_receipt`,
`adjustment_run_receipt`, `staff_advance`) into a generic id-only `PartSummaryCard` with no
actions — already named as debt in `docs/plan/active/fe-train-plan-2026-08-30.md` §1.2 ("ten
kinds … into `PartSummaryCard`"). **P6-2 (裁-20) only upgrades `sweep_receipt`**; the other five
stay flat past this train. Not a silent loss — restated here because it is easy to mistake for
one at cutover time.

---

## 3. Chat / documents / queue / reports domain

*(Scan: `apps/dashboard/app/chat`, `/documents`, `/queue`, `/reports` + `parts.ts`, `reviewApi.ts`,
`reviewTypes.ts`, `queueKindCatalog.ts`, `intake.ts`, and the review-card components.)*

**Context confirmed by this scan:** `apps/dashboard/app/chat/page.tsx` is explicitly a "Slice-4
plumbing" dev proof page (its own header comment says so — a dev-JWT-paste auth box, sessions
list/switcher, "New session" button, per-row "share to firm"). Its `share_chat_session` door IS
wired in apps/web (`apps/web/components/firm-admin/share-session-button.tsx:33`, mounted in
`apps/web/components/clara/ClaraFullScreenThread.tsx:61`) — confirmed **SAME**.

| Dashboard surface | Door/relation | apps/web counterpart | Class |
|---|---|---|---|
| Dev JWT-paste auth box | n/a | Supabase SSR cookie auth | DASHBOARD-ONLY-BY-DESIGN |
| Session list/switcher between named threads | `list_sessions` | none — `apps/web/lib/clara/useActiveThread.ts:23-27` finds-or-creates exactly one thread per client/firm altitude; no list UI anywhere | **DROPPED / citation not verified — see §"Citation discrepancy" below** |
| "New session" button | `create_session` | `createSession` is called only internally (`useActiveThread.ts:29`), never from a button | same as above |
| "Share to firm" per session | `share_chat_session` | `ShareSessionButton` in the full-screen thread header | **SAME** |
| Cancel a running task | `cancel_agent_task` | `apps/web/components/firm/agent-tasks-panel.tsx:36,104` (relocated to Firm Activity; port-wave plan T7's own row assigns it there) | SAME (relocated, ruled) |
| Inline clarify Q&A — answer a mid-turn interruption from the same message where Clara asked | `answer_interruption` | `PartRenderer.tsx:144-152` renders the `clarify` part **read-only**; the only answer control is `InterruptionsPanel`, mounted in the Journals workbench (`apps/web/components/journals/journals-workbench.tsx:121`) as a firm-wide "Clarifications" tab — verified: `interruptions-panel.tsx:4,103` confirms it is `answer_interruption`'s only caller | **DROPPED-UNRECORDED (allocation ruled, UX consequence not)** — port-wave plan's T6 row assigns `answer_interruption` to "drafts+docs" (`docs/plan/active/port-wave-plan-2026-08-28.md:300,432`), which IS a real ruling, but no ruling addresses that a user can no longer answer Clara's question inside the conversation where she asked it — they must navigate to a different client's Journals tab. *Disposition: owner ruling needed — either confirm this relocation as intended shape (worth a citation the way 裁-117-style rulings get one), or scope a P6-5/P6-X fix (a deep-link from the read-only clarify card into the Clarifications panel, or a lightweight inline-answer affordance).* |
| Chat-turn ad-hoc file attachment (drag/drop/paste/file-picker directly in a message) | `beginIntake`/`putIntakeBytes`/`finalizeIntake` with `origin:"chat"` | **none** — verified `grep "type=\"file\"\|onDrop\|onPaste" apps/web/components/clara` → 0 hits; `postTurn` hardcodes `parts: [{type:"text",text}]` (`apps/web/lib/clara/api.ts:140`); `apps/web/lib/documents/intake.ts:38-39`'s own comment: origin is "fixed to `documents_tab` … this workbench never begins a chat-origin intake." The `AttachmentPart` render branch survives (`PartRenderer.tsx:115-117`) — only the compose side was dropped | **DROPPED-UNRECORDED** — a beta user handing Clara a document mid-conversation ("here's this invoice, what should I do with it?") must break out to the Documents tab first. *Disposition: honest note or owner ruling; the plumbing (wire type, intake origin, runtime) already exists on both ends — only a composer affordance is missing.* |
| `je_review`/`je_settled` chat cards | `get_journal_entry` (single-arg) | superseded by the Journals workbench's own draft/entry review surface; `get_journal_entry` confirmed retired (verb-coverage-census: "sole consumer was superseded `chatTurn_v1`") | SUPERSEDED (architectural) — field-by-field parity **not fully verified** |
| Upload, classify, attribution confirm/dismiss, file-to-client, retire filing, legal hold, correction wizard, coding queue, lint findings | ~12 doors | `apps/web/lib/documents/doors.ts` + `components/documents/*` — **more granular than the dashboard's single-page layout**, not a loss | SAME (expanded) |
| Cross-client review queue (ready/needs_review/needs_you), counts tiles, sweep/compliance banners, batch-approve N routine entries in one confirm, open-question resolve/dismiss | `list_review_queue`, `approve_routine_entry` ×N, `resolve/dismiss_open_question` | `apps/web/components/firm/needs-you-inbox.tsx` + `needs-you-counts.tsx` (relocated to firm altitude, Q3 IA — ruled); batch-approve specifically **dropped by ruling**: `apps/web/components/journals/drafts-queue-panel.tsx:298-316`'s own comment cites "F5 (independent review, RATIFIED AS-CONDUCTED, 2026-08-28) … no composed batch" | SAME (relocated) / **SUPERSEDED-BY-RULING** (batch-approve, F5) |
| Month snapshots, sealed artifacts, issue-for-approval, archive/retrieve signed original, render-job requeue, sandbox exports, freeform-read audit, wiki curation, seeding batches, export recipients | ~10 doors | `apps/web/components/reports/*` — **strictly more surface than the dashboard ever built** (e.g. apps/web actually lists render jobs; the dashboard had a blind job-id text field) | SAME (expanded) |

---

## 4. Onboarding / opening / seeding domain

*(Scan: `apps/dashboard/app/onboarding/**`, `/opening`, `/seeding`, `/clients/plan` +
`onboardingApi.ts`, `openingApi.ts`, `seedingApi.ts`, `interviewApi.ts`. High-stakes: client
onboarding and firm-born are both literally on the 16-step happy path.)*

| Dashboard surface | Door/relation | apps/web counterpart | Class |
|---|---|---|---|
| `/onboarding` hub (link page, no doors) | — | R7 removes the wizard-page IA entirely | SUPERSEDED-BY-RULING (R7) |
| `/onboarding/firm` + `FirmCommitForm.tsx` — 11-Q interview → `create_firm` | `startFirmInterview` (`firmInterview_v1`), `create_firm` | **Zero callers of either in apps/web** (verified: `create_firm`/`firmInterview_v1`/`startFirmInterview` = 0 hits, non-test); `apps/web/lib/identity/doors.ts` names `create_firm` only in a header comment explaining the replacement. The intended terminal door `claim_paid_firm` (裁-89) is designed (`docs/plan/active/checkout-gate-design*.md`) but **also 0 hits as an actual call** — only in comments describing pending state (`apps/web/components/entry/holding-card.tsx:145`, `lib/registration/checkout-progress-reads.ts:65`, `lib/registration/holding-state.ts:82`) | **SUPERSEDED-BY-RULING-PENDING-BUILD** — the mechanism-level replacement (interview-driven bootstrap → signup/checkout/webhook chain) is a real, cited ruling (裁-73, amended 裁-89), but the chain's own last step is unbuilt at tip, matching `PROGRESS.md`'s billing row ("AT THE MERGE EDGE" — C-2/C-3 in the queue, C-5 unbuilt). **End-to-end firm creation is currently unreachable in either app.** Residual: `packages/runtime/workflows/firmInterview.v1.ts`/`v2.ts` remain registered with zero live caller — flagged for the harness-sync sweep, not a UI gap. |
| `/onboarding/client` — begin/resume | `begin_client_onboarding`, plan reads | `apps/web/components/clara/OnboardingChecklistCard.tsx` (`lib/onboarding/api.ts`); resume via `components/firm/client-register-list.tsx:64`'s onboarding badge | SAME (relocated) |
| Interview attachments (sample invoices side-channel) | shared upload queue | `apps/web/components/clara/InterviewRunCard.tsx` (confirmed: a real `type="file"` input exists, `:301`) + `lib/interview/api.ts` | SAME |
| Interview run — durable run, answer, two-step cancel | `answer_interruption`, `cancel_client_onboarding` | `apps/web/lib/interview/useInterviewRun.ts`, `InterviewRunCard.tsx` | SAME |
| `/clients/plan` — items grouped must_ask/capture/todo, resolve | `onboarding_plan_items`, `resolve_onboarding_plan_item` | `OnboardingChecklistCard.tsx` + `OnboardingItemRow.tsx` — flat list, not visually grouped (presentation simplification, not a capability loss) | SAME |
| `/clients/plan` — "Revisions · intended vs actual" append-only history | `onboarding_plan_revisions` (`listPlanRevisions`) | **0 hits anywhere** — `grep "onboarding_plan_revisions" apps/web --include="*.ts*"` (excl. node_modules/tests) → 0. Confirmed independently by this scan | **DROPPED-UNRECORDED** — not on the happy path (an audit artifact, not a blocking control), but the dashboard page's own header names this a first-class deliverable. *Disposition: honest note or a low-priority `PROGRESS.md` Known-issues row naming `onboarding_plan_revisions` explicitly, so it doesn't vanish silently at cutover.* |
| `/clients/plan` — commit gate (CLR06 stale-plan re-review, attestation) | `commit_client_onboarding` | `OnboardingChecklistCard.tsx`'s `commitBlockReason()` mirrors the DB's four-disjunct precedence order | SAME |
| `/clients/plan` — B-12 `bootstrap_client_plan` | same | `OnboardingChecklistCard.tsx`'s `no_plan` branch | SAME |
| `/opening` — create/cancel/reopen seed, draft items, fixed-asset seeding, approve/correct, dry-run, KEYED fallback (`record_opening_target`) | ~9 doors | `apps/web/components/registers/opening-*.tsx` + `lib/registers/opening-doors.ts` — **every RPC name has a live caller** | SAME (relocated to client-workspace Registers tab, Q3 IA) |
| `/opening` — document-tied deterministic parse path ("Parse tie document" button, parsed-lines table with debit/credit/provenance, unparseable→keyed-fallback guidance) + the tie-document picker at seed creation | `parseOpeningTargets` → `/api/opening/parse-targets`; `listOpeningTieDocuments`, `getActiveFilingResolution` against `document_filings`/`documents` | **All five names: 0 hits anywhere in apps/web.** Confirmed structurally: `apps/web/components/registers/opening-seed-lifecycle.tsx:61` **hardcodes** `tieDocumentId: null, tieSha256: null` on every `createOpeningSeed` call — no UI path exists to create a document-tied seed at all; `opening-seed-workbench.tsx:131-133` would render nothing for one if it existed | **DROPPED-UNRECORDED** — the surviving KEYED fallback fully covers a brand-new business with no prior books, so this does not block the demo happy path. But it is a real professional-capability loss for any client carrying forward an existing trial balance — the ordinary case for a Malaysian accounting firm's client base, not an edge case. *Disposition: owner ruling needed before cutover — either (a) build the tie-document picker + parse trigger + parsed-lines table as a P6-era ride-along (the doors are live and unchanged; this is UI-only), or (b) explicitly rule the path out of v1 with a `NotBuiltNote` on the create-seed dialog naming the missing verb, so a bookkeeper isn't silently funneled into hand-keying every opening line without being told a faster path exists.* |
| `/seeding` — prior-GL tick-list (batches, proposals, tick/decline, complete/cancel batch) | 6 doors | `apps/web/lib/reports/api.ts` (all present), `components/reports/SeedingBatchesPanel.tsx`, `components/firm/seeding-proposal-affordance.tsx` | SAME (relocated to Reports tab, Q3 IA) |
| COA seed decision (`coa_seed_decision`) consumed by nothing | interview prompt only | 0 hits in apps/web (re-confirms) | **Not a new finding** — already `PROGRESS.md` Known issues (裁-21, fix queue). Not counted in the DROPPED-UNRECORDED tally. |

---

## The 7 DROPPED-UNRECORDED items — consolidated, with dispositions

| # | Item | Beta happy-path relevance | Recommended disposition |
|---|---|---|---|
| 1 | `remap_bank_account_coa` — door built and tested, no control calls it | No (maintenance action) | Honest note (cheap — the code comment already exists) |
| 2 | `propose_adjustment_template`'s `p_replaces`/`p_schedule` params hardcoded null | No | Honest note minimum; owner ruling given the estate's double-posting history |
| 3 | Inline clarify-answer inside the chat thread (relocated to a separate Journals tab) | **Adjacent** — clarify interruptions are core chat behavior; "bank matched in chat" and "client onboarded" steps are exactly when Clara asks | Owner ruling — confirm relocation as intended, or scope a deep-link/inline-answer fix |
| 4 | Chat-turn ad-hoc file attachment (no composer file affordance) | **Adjacent** — a beta user handing Clara a document mid-chat has no path | Honest note or owner ruling; plumbing exists on both ends already |
| 5 | `onboarding_plan_revisions` audit-trail read | No (audit artifact) | Honest note or low-priority Known-issues row |
| 6 | Opening balances: document-tied deterministic parse path entirely unreachable | No for the demo path; **yes for real client onboarding** (most firm clients carry forward books) | Owner ruling before cutover — build as a ride-along, or explicit `NotBuiltNote` |
| 7 | Chat session list / switcher / explicit "New session" | Low — one-thread-per-altitude is a plausible deliberate shape | See discrepancy note below — needs owner confirmation, not currently backed by a locatable ruling |

---

## Citation discrepancy — RESOLVED at filing (2026-09-02)

This scan's briefing cited 裁-117 (one thread per altitude is the beta shape; the session
switcher is post-beta) for the chat session-list loss. The lane could not find that ruling on any
branch it could read and correctly reported the citation as unconfirmed (review laws 2 and 3).
The ruling exists: it was authored the same morning on `harness/checkpoint-truing-2026-09-02` —
`docs/plan/active/mohe-grill-rulings-2026-09-02.md` §"The 2026-09-02 checkpoint sitting", 裁-117 —
and lands in the SAME PR as this record, so the citation resolves and the item's disposition is
SUPERSEDED-BY-RULING (the gap itself stays real and has its Backlog row under "⌘K is NOT
rank-shaped … the firm-threads switcher"). The lane's refusal to launder an unverified citation is
recorded here as a positive control; nothing else in its text was changed.

The companion citation in the same briefing — `clara.create_firm`'s only caller is
`FirmCommitForm.tsx`, superseded by `claim_paid_firm` (裁-89) — **checks out**: 裁-89 is real
(`docs/plan/active/mohe-grill-rulings-2026-08-31.md:300`) and `claim_paid_firm` is a real,
designed door (`docs/plan/active/checkout-gate-design-part2.md:321`), though as detailed in §4
above it is not yet wired anywhere — refined to SUPERSEDED-BY-RULING-**PENDING-BUILD**, not a
clean SAME or SUPERSEDED.

---

## Could not verify

- Full field-by-field parity of `apps/dashboard/app/chat/JeReviewCard.tsx`/`JeSettledCard.tsx`
  against the Journals workbench's own draft/entry review card (confirmed only that the
  underlying single-arg `get_journal_entry` door is retired by design).
- Whether apps/web's needs-you queue mirrors selection state into the URL the way the dashboard's
  `/queue` page does (`sel`/`cursor`/`scope` params) — cursor-based pagination confirmed, URL
  round-tripping of selection not traced.
- Exact behavioral parity of `apps/dashboard/app/documents/CorrectionWizard.tsx` vs.
  `apps/web/components/documents/correction-wizard.tsx` beyond confirming both call the same
  doors.
- Whether apps/web's `needs-you-inbox` virtualizes long lists the way the dashboard's `/queue`
  `VirtualList` does — a performance characteristic, not a capability, left unverified.
- Whether `packages/runtime/workflows/firmInterview.v1.ts`/`v2.ts` remaining registered with zero
  live caller is a deliberate "keep for now" or an unnoticed orphan — outside this scan's
  read-only remit; flagged for the harness-sync sweep.
- Whether the dashboard's `OpeningTargets.tsx` "unparseable → recreate as keyed" guidance copy has
  any next-intl equivalent in apps/web (moot while the underlying mechanism is absent entirely).
- The two P4 `NotBuilt` sites cited above (`accounts-section.tsx`, `exceptions-section.tsx`,
  `reconciliation-section.tsx`) were read directly and confirmed to exist and name the correct
  verb; their exact line numbers may drift on the next commit — re-grep at merge time rather than
  trusting these line numbers verbatim.
