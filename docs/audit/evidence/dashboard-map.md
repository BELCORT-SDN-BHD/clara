# Dashboard map — `dashboard/` (Next.js 15, Vercel `belcort-dashboard-v2`)

Evidence map for the Phase-1 audit. Repo frozen @ master `ac0a684f`. ~556 TS/TSX files (excl. node_modules/.next). All paths relative to `dashboard/`. Everything below verified by direct read unless marked *(unverified)*.

---

## 1. Route / surface inventory (`app/`)

Auth perimeter (public):

| Route | File | What it shows |
|---|---|---|
| `/login` | `app/login/page.tsx` + `LoginForm.tsx`, `actions.ts` | Sign-in |
| `/signup` | `app/signup/page.tsx` + `SignupForm.tsx` | Sign-up (pausable via `lib/signups.ts` + `components/onboarding/SignupsPausedNotice.tsx`) |
| `/auth/confirm` | `app/auth/confirm/route.ts` | Email-confirm code exchange (route handler) |
| `/auth/confirm-email`, `/auth/auth-code-error`, `/auth/forgot-password`, `/auth/set-password` | respective `page.tsx` | Confirm-email card / error / reset flows |
| `/welcome` | `app/welcome/page.tsx` + `WelcomeCeremony.tsx`, `FirmBootstrapFlow.tsx`, `actions.ts` | First-run ceremony: pending-invite accept (`accept_invite` rpc), signup admission check (`signup_admission_status`), firm bootstrap (`create_firm` via `components/onboarding/firm-setup/*`, GSAP "birth" beat) |

Authed shell (`app/(dash)/`): `(dash)/layout.tsx` = ShellOverlays (SessionGuard, SessionBanner, CommandPalette ⌘K) + `DesktopGate` (**hard desktop-only gate <1024px**; tree goes inert below it — `app/(dash)/layout.tsx:19-23`). `firms/[slug]/layout.tsx` = the persistent `FirmShell` (`components/shell-v2/FirmShell.tsx`): TopBarV2 + NavRailV2 (Home · Clients · Documents · Calendar · Activity · Members) + the **persistent docked Clara rail** + Background-work chip, surviving all intra-firm navigation.

| Route | File | Surface |
|---|---|---|
| `/` | `app/page.tsx` | Firm picker: 0 firms→empty state, 1→redirect, ≥2→card list (`lib/firmPicker.ts decidePicker`) |
| `/firms/[slug]` | `page.tsx` → `CommandCenterV2.tsx` | Firm home ("Command Center"): state-of-the-firm strip (next statutory deadline chip, clients, entries awaiting review, docs to code, docs unassigned, open questions), "since you were here" digest (`firm_digest`/`mark_digest_seen`), `InboxLanes` (proactive-notification lanes with Answer/Discuss/Dismiss — Answer only *seeds* the rail composer via `emitClaraAsk`, never auto-sends), FirmProfileSheet (`?profile=`/`?profile=edit`) |
| `/firms/[slug]/chat` | `chat/page.tsx` → `ChatCanvasClient.tsx` | Firm-scope full-page chat canvas (same `ClaraRail` machinery, `variant="canvas"`, 744px column) |
| `/firms/[slug]/clients` | `clients/page.tsx` → `ClientsList.tsx` | Client list + per-client needs-attention |
| `/firms/[slug]/clients/new` | `clients/new/page.tsx` → `ClientOnboardLive.tsx` | Full-bleed client-onboarding cinematic (admin+, `clients.create`); agent-run interview via `lib/useOnboardingRun.ts` on the v2 agent wire; atomic commit via `onboard_client` fn. Components: `components/onboarding/cinematic/*` (AnswerRail, DryRunReview, CarryDownReview, SpokenQuestion, ChapterProgress) + `onboarding/client/*` (+ non-cinematic `ClientOnboardFallback`) |
| `/firms/[slug]/clients/[clientSlug]` | `page.tsx` → `components/workbench/ClientWorkspace.tsx` | The per-client workspace — 17 tabs (see §5) via `?tab=`; deep-links `?entry=N`, `?focus=document:N`, `?focus=recon:N`, `?statuses=a,b`, `?fy=` |
| `/firms/[slug]/clients/[clientSlug]/chat` | `chat/page.tsx` | Client-scope full chat canvas |
| `/firms/[slug]/documents` | `documents/page.tsx` → `FirmDocumentsTriage.tsx` | Firm-altitude **unassigned-documents triage lane** (`status=unassigned_pending & client_id IS NULL`, oldest-first FIFO): Assign / Assign-all / onboard-client escape hatch; shows Clara's client-match confidence, human picks |
| `/firms/[slug]/activity` | `activity/page.tsx` → `ActivityFeedLive.tsx` | Firm-wide audit feed over `firm_activity_feed` (dml_audit spine); `ReverseDialog` → `reverse_entry` (reverse-not-delete); bookkeeper+ (`activity.view`) |
| `/firms/[slug]/calendar` | `calendar/page.tsx` → `ComplianceCalendarLive.tsx` | Compliance calendar (SST-02, CP204/CP500, Form C/PT/E, payroll) computed **client-side** from stored facts by pure `lib/complianceCalendar.ts` — the sanctioned "dates-not-money" carve-out |
| `/firms/[slug]/members` | `members/page.tsx` → `MembersLive.tsx`, `actions.ts` | Roster (`list_firm_members`), invites (admin+; `InviteDialog`, `RolePicker`, `RemoveMemberAlert`) |
| `/firms/[slug]/settings` | `settings/page.tsx` → `SettingsLive.tsx` | Account section + appearance (density/theme via `lib/uiPrefs.ts`) |

Middleware (`middleware.ts` → `lib/supabase/middleware.ts`): Supabase session refresh only; per-route auth is RSC-side (`requireVerifiedUser` + `loadMemberships` in every page — defense-in-depth, no central route guard).

RBAC (`lib/rbac.ts`): roles `viewer < bookkeeper < admin < owner`; caps e.g. `chat.use`/`je.approve`/`kb.propose`/`activity.view` = bookkeeper, `kb.approve`/`members.invite`/`firm.settings`/`clients.create` = admin. Client-side gate only — fns/RLS re-enforce.

---

## 2. The chat panel (Clara)

**Component stack** (`components/clara/`): `ClaraRail.tsx` (docked aside, 400px default, drag/keyboard resizable 360–min(480,⅓vw), collapsible to a 44px presence edge, overlay <1280px; also `variant="canvas"` for the /chat routes) → `ClaraThread.tsx` (agent FSM, clarify derivation, optimistic Plan ledger, approve wiring, error banner) → `ClaraTranscript.tsx` (role="log" StickToBottom column; assistant = full-width prose via `ClaraMarkdown`/`StreamdownView`, user = right-aligned tinted block; pin-newest-user-turn-to-top) + `ClaraComposer.tsx` + `ClaraClarify.tsx` + `SessionMenu.tsx` (new session / archive list / view archived read-only) + `MessageScroller.tsx`.

**Wire** (`lib/chat/makeHermesRunner.ts`): browser → v2 agent service **directly** at `NEXT_PUBLIC_AGENT_URL` (fails loud if unset — WIRE-04), numeric firmId in path, fresh Supabase JWT per call:
- `POST /firms/:id/chat` body `{message, clientSlug?, documents?}` (camelCase; omission discipline in `lib/attachments.ts buildClaraChatBody`) → `{run_id, session_id}`
- `GET /firms/:id/chat/events?run=` → SSE bytes (headers deadline 150s for cold container; body read unbounded)
- `POST /firms/:id/chat/clarify` body `{run, clarifyId, response}` (resumes the parked run over the SAME open SSE)
- `GET /firms/:id/chat/run?run=` → status poll (8s deadline), accepts camelCase AND snake_case clarify shapes
- 401 anywhere → `notifySessionExpired()` global re-auth banner (client-side only; server-side raise guarded — `lib/chat/hydrateTranscript.ts:78-85` documents the module-singleton cross-user leak hazard).

**SSE consumption** (`lib/chat/hermesChatTransport.ts` — an AI SDK 6 `ChatTransport`): line-buffered byte loop → `lib/relayStream.parseRunEvents` → `RunEventTranslator` (`lib/chat/runEventChunks.ts`) → UIMessageChunks for `useChat` (`lib/chat/useHermesChat.ts`). Event kinds: `delta` (text), `tool` (transient `data-tool` breadcrumb verb → presence orb), `clarify` (`data-clarify` part), `clarify_responded`, `done` (authoritative output), `error`. **Fence-flash suppression**: deltas held back at a fence opener / trailing backtick line (`safeEmit`). Terminal `done` closes the UI stream immediately (the "frozen mid-word" fix, `hermesChatTransport.ts:197-208`).

**Drop recovery — LOSSY by owner decision** (`hermesChatTransport.ts:8-17`): the agent SSE is single-consumer + non-replaying; a dropped stream → poll loop (backoff 500ms→5s, 8-strike budget) → settle the same turn on the partial + honest note `PARTIAL_RECOVERY_NOTE` ("⚠ Clara was interrupted mid-reply; this may be partial"), or surface a poll-found clarify. Content accumulated service-side but undelivered is **lost**. `reconnectToStream()` returns null (no resumable stream).

**Artifact/card pipeline** — two paths, one gate:
1. **Live**: fenced ```` ```<tag>\n{json}\n``` ```` in the streamed content; `lib/chat/artifactFence.ts extractFencedArtifact` lifts it on `done` → `parseArtifact`. Live `FENCE_TAGS` allowlist = **only** `export_result | je_review | suggestion | client_row` (`artifactFence.ts:24`), pinned "byte-identical" to the agent's regex by a parity test (comments still cite `relay/src/transcript.ts` — retired unit).
2. **Hydrate**: `GET /firms/:id/chat/messages?client_slug=&session=&before=&limit=` → `ShapedMsg{seq, role, content, created_at, artifact?, tool_calls?}` (`lib/chat/hydrateTranscript.ts`); the opaque `artifact` field re-runs `parseArtifact`. `tool_calls` are **dropped** (no landing slot — prose fallback). Pagination = "Show earlier messages" keyset on `seq` (50/page), earlier pages render inert.

**The gate** (`lib/artifacts.ts parseArtifact` — Zod-free, pure, total, fail-closed): allowlist `ARTIFACT_TYPES = sst_summary · journal_table · kv_summary · export_result · je_review · suggestion · client_row · review_summary` (`artifacts.ts:45`; review_summary parsed in `lib/artifactReviewSummary.ts`). Caps: title 200, text 500, rows 12, statuses 12, files 24, chips 6. `clientId` must be a safe positive int **for every card** (`parseScope`, `artifacts.ts:298-302`); `clientSlug` validated against `/^[a-z0-9-]{1,64}$/` (route-confusion defence — invalid slug ⇒ card renders non-navigable, not rejected). Money = safe-integer cents only. `confidence` ∈[0,1] else dropped; `estimatedRisk` enum auto/review/high-stakes else dropped (renderer fails safe to review-tier). Malformed leg/row poisons the whole card; unknown type → null → renderer shows an honest note, never injected markup. An **unbalanced je_review still parses** (card shows "Out of balance" + disables Approve — the gate checks shape, not balance).

**Rendering** (`ClaraTranscript.tsx:116-163`): `data-artifact` → `components/rail/AgentCard.tsx` (dispatcher: je_review→`PlanCard`, review_summary→`ReviewSummaryCard`, suggestion/sst_summary/kv_summary/journal_table/client_row/export_result→`ReadOnlyCards`/inline). Per-card verbs wired only when a real route resolves: journal_table→promote to workbench (`lib/artifactPromote.ts buildPromotePlan` carries the status slice into `?statuses=`), client_row→navigate, je_review→open source doc / open posted entry row. `data-clarify` → `ClaraClarify` (choice buttons resume the run).

**In-chat writes**: PlanCard Approve → `guardedApprove` (`ClaraThread.tsx:203-218`): double-click guard + **active-scope write-gate** (`lib/activeScope.ts scopeBlockCode` — the card's clientId must equal the resolved route client; firm scope has no approve handler at all) → `approve_entry` fn → optimistic planState pending→posting→posted with revert on failure. review_summary "Post all N" → `lib/bulkApprove.ts approveBandEntries` → **POST to the agent service** (durable job; progress via job SSE + Background-work tray). Expired-session mutations blocked pre-flight by `lib/chat/useBlockExpiredMutations.ts`.

**Attachments UX** (`ClaraComposer.tsx` + `lib/attachments.ts`): three ingress paths — paperclip file picker (hidden input `data-testid="clara-file-input"`), **drag-drop** onto the composer (dashed overlay), **paste** from clipboard — all through one cumulative pipeline: dedupe by name → `validateFiles` on the *merged* set (caps can't be evaded batch-wise) → `readFilesB64` → removable chips (name + human size). Caps: **5 files/turn, 20MB/file, message 32,768 chars** (mirrors agent `server.ts` cap; over-long blocks Send inline). MIME allowlist mirrors agent `MIME_ALLOWLIST`: PDF · PNG/JPEG/JPG/WebP/TIFF/HEIC · XML (MyInvois UBL); **no CSV/XLSX/DOCX**. `.xml` filename bypasses an empty/unknown MIME (`isAllowedDoc`, `attachments.ts:32-36`) and is normalized to `application/xml` on the wire. Bytes ride as **base64 in the JSON POST body** (`WireDoc{filename, contentType, b64}`); b64 dropped from client state after send; transcript keeps display-meta chips only. Attachments do NOT ride a clarify answer (held, not dropped — `ClaraComposer.tsx:151-153`). Drafts persist per-scope in a module-level Map. Esc ladder: streaming→Stop; answer-mode→cancel; else bubble→collapse rail.

**Composer seeding buses**: `lib/claraAsk.ts` (window event `belcort:clara-ask`; Inbox Answer/Discuss, seeds + expands a collapsed rail, never auto-sends) and `lib/railChips.ts` (row-reference chips "Re JE-123 —" from the journals grid; expands the rail).

**State/presence**: `lib/chat/useAgentState.ts` + `lib/agentState.ts` (FSM: idle/thinking/working(toolVerb)/parked/clarify/urgent/offline) → `PresenceDot` in header, shell top bar, collapsed edge; `lib/connectivity.ts` relay-offline latch (offline banner: "Clara is offline — your books are safe and editable"; composer disabled). Sessions: reset/archive via `lib/chat/sessionsApi.ts` (agent-service session endpoints), archived sessions render fully inert.

---

## 3. The data plane (`lib/booksApi.ts` + callers)

`booksApi.ts` (89 lines) — the whole dashboard-direct seam, browser → Supabase with the session JWT as bearer (no relay, no service role):
- `rpcBooks(f, fn, args, token)` → `POST {SUPABASE_URL}/rest/v1/rpc/<fn>` (audited SECURITY DEFINER fns; `cache:'no-store'`; errors → `lib/booksErrors.ts` `${status}: ${body}` vocabulary)
- `selectBooks(f, pathAndQuery, token)` → `GET /rest/v1/<query>` (RLS-direct PostgREST table reads for list surfaces with no read fn)
- `signBooksUrl(f, objectKey, expiresIn, token)` → `POST /storage/v1/object/sign/firm-docs/<key>` (short-TTL signed URLs; storage RLS scopes to own firm prefix)
- `actorFromToken(token)` — client-side unverified JWT decode → `p_actor` display hint (server re-constrains via `app.audit_actor`; a caller may label self or 'agent', never another human — `booksApi.ts:71-88`)

**rpcBooks fn → lib → surface matrix** (verified by grep over non-test call sites):

| lib file | fns | consumed by |
|---|---|---|
| `lib/workbenchActions.ts` | `approve_entry` `edit_entry` `reject_entry` | JournalsGrid/EntryReview/EditEntrySheet + chat PlanCard |
| `lib/firmBooks.ts` | `journal_entries_page` `journal_entries_band_counts` `firm_needs_attention` `update_client_profile` (+ selectBooks: clients, kb rules/proposals, coa, compliance facts) | Journals tab, InboxLanes, ClientsList, profile sheets |
| `lib/activity.ts` | `firm_activity_feed` `reverse_entry` | Activity feed + ReverseDialog |
| `lib/journalEntryDetail.ts` | `journal_entry_detail` | EntryDrawer |
| `lib/trialBalance.ts` | `client_trial_balance_comparative` | TrialBalance tab |
| `lib/generalLedger.ts` | `client_general_ledger` | GeneralLedger tab (keyset-paged per-account segments) |
| `lib/financialStatements.ts` | `client_financial_statements` | FinancialStatements tab (SoCI+SoFP, MPERS) |
| `lib/fa.ts` | `fa_register` `fa_control_tie_out` `fa_depreciation_schedule` | FaRegister tab; `dispose_fixed_asset` called from `FaRegister.tsx` (admin fallback; agent-routed default) |
| `lib/recon.ts` + `ReconWorkbench.tsx` | `add_bank_account` `open_reconciliation` `match_bank_line` `close_reconciliation` (+ selectBooks over 3 recon tables) | Recon tab |
| `lib/arap.ts` | ar/ap aging + statements read fns *(file read: fns `ar_aging`/`ap_aging`/statement per header)* | ArApSubledger tab |
| `lib/periodClose.ts` | `client_overview` `client_financial_statements` `ar/ap/fa_control_tie_out` `adjustments_status` (+ selectBooks journal_entries flagged count, bank_reconciliations open, client_fy_close) | PeriodClose readiness checklist |
| `lib/sstReturn.ts` | `get_sst_return` `compute_sst_return` | SstReturn tab (SST-02 draft) |
| `lib/taxComp.ts` | `get_tax_computation` `compute_tax_draft` | TaxComputation tab (Form C/PT + CP204/CP500 draft) |
| `lib/kbActions.ts` | `create_kb_rule` `edit_kb_rule` `confirm_kb_rule` `retire_kb_rule` `promote_proposal` `reject_proposal` | KbWorkbench |
| `lib/documentActions.ts` | `assign_document` `reassign_document` `mark_document_sample` `request_document_coding` (+ selectBooks documents with `journal_entries` FK embed; `signBooksUrl` view-on-click 600s) | DocumentsTable, FirmDocumentsTriage |
| `lib/notifications.ts` | `mark_notifications_read` `resolve_notification` (+ selectBooks notifications) | Inbox, nav badge |
| `lib/digest.ts` | `firm_digest` `mark_digest_seen` | Command Center digest |
| `lib/jobs.ts` | `list_jobs` `request_pause` `request_resume` `request_cancel` | FirmJobsLane / Background-work tray |
| `lib/clientOverview.ts` | `client_overview` | Overview tab (MoneySnapshot, AttentionCard) |
| `lib/auth.ts`, `app/welcome/*` | `my_firm` `my_pending_invite` `signup_admission_status` `accept_invite` `create_firm` | picker/welcome |
| `members/page.tsx`+`actions.ts` | `list_firm_members` + invite fns | Members |
| `lib/firmProfileIo.ts` | `update_firm_profile` (+ selectBooks firms) | FirmProfileSheet |
| `records/CoaBrowser.tsx` | `add_coa_account` `set_coa_account_active` `set_coa_account_type` | COA tab |
| `records/ContactsRegister.tsx` + `lib/contactsRegister.ts` | `add_counterparty_alias` (+ selectBooks over `client_counterparty_aliases`, `client_kb_rules(+history)`, `ar_invoices`, `ap_bills` — all `<any[]>`) | Contacts tab |
| `lib/exportArtifacts.ts` | selectBooks `export_artifacts` + `signBooksUrl` download | FilesShelf, export cards |
| `lib/clientOnboardingRun.ts`/`onboard_client` (via `ClientOnboardLive`) | `onboard_client` | client onboarding commit |

Other wires bypassing booksApi: `lib/notifications.ts subscribeNotifications` — **notifications SSE** on the agent service (`NEXT_PUBLIC_AGENT_URL`, **fallback `NEXT_PUBLIC_RELAY_URL`** at `notifications.ts:130`); fetch-based (bearer header, not EventSource). `lib/bulkApprove.ts:13` same AGENT/RELAY fallback for the durable bulk-approve job POST. `lib/booksSync.ts` — `belcort:books-changed` window event (debounced, dirty-editor-suppressed) refetching every books table off chat/SSE nudges.

---

## 4. Document surfaces

- **Upload is chat-turn-only — the ONLY ingest path** (`DocumentsTable.tsx` header, ~line 8): the client Documents tab owns a dashed drop-zone + "Choose files" picker; upload = `validateFiles → readFilesB64 → buildClaraChatBody(uploadTurnMessage, clientSlug, docs)` → `POST {AGENT_URL}/firms/:id/chat` — a deterministic templated chat turn ("Uploaded N documents: … File them for this client." — `lib/attachments.ts:145-148`); Clara owns the bytes (`upload_document → ingest_document → set_document_storage_path` agent-side). Uploading/failed states live in component state only, never a doc status. **No direct-to-storage upload path anywhere; no resumable upload.** `chat_messages` persists no attachment metadata — the templated text is the durable trace.
- **Per-client Documents tab** (`components/documents/DocumentsTable.tsx` + `DocumentRow/DocumentsGridCells/DocumentExpand/ReassignDialog/docStatus.ts`): role="grid" keyboard model (`lib/useGridKeys.ts` — ↑/↓/j/k, Enter preview, `o` open source); rows DESC by uploaded_at with doc_type + confidence + sourced-entry deep-link (FK embed `journal_entries(id,status,description)`); triage verbs reassign/mark-sample/request-coding (audited fns; the durable `document_triaged` wake fires atomically in-DB — no dispatch flag); view = `signBooksUrl` mint-on-click 600s; `?focus=document:N` scroll+flash.
- **Firm unassigned lane** (`FirmDocumentsTriage.tsx`, route §1): the funnel for docs that arrived without a client; assign/assign-all (bookkeeper+); shows `client_match_conf` verbatim ("never guess the client" — human picks); zero-client escape hatch to `/clients/new`.
- **Files shelf** (`components/files/FilesShelf.tsx` + `lib/filesShelf.ts`, workspace "Files" tab): export artifacts list (RLS-direct `export_artifacts`) + signed-URL download-on-click; live-refreshes on books SSE.
- OCR: `ocr_cache` is carried opaque on the row and rendered as inert data (`lib/documents.ts ocrParts`); no OCR call happens dashboard-side (agent-side Azure DI).

## 5. Books / accounting surfaces — exists vs missing

Client workspace tabs (`components/workbench/workspaceTabs.ts` — 17 tabs in 5 groups; bodies in `components/workbench/WorkspaceIslands.tsx:13-28`):

| Group | Tab | Component | Notes |
|---|---|---|---|
| Overview | overview | `overview/ClientOverview` (+MoneySnapshot, AttentionCard, RecentActivity, ProfilePanel/EditProfileSheet) | `client_overview` fn |
| Books | journals | `workbench/JournalsGrid` (+FilterBar, EntryReview, EntryDrawer, EditEntrySheet, ApproveGate/RejectGate, StatusPill, EvidenceGlyph, AuthorshipBadge, MoneyCell) | react-query, SSR-seeded, keyset "Load more", SSE-nudged; statuses drafting/auto_draft/needs_review/needs_decision/approved/rejected; bulk band approve; ≤5¢ residual auto-post contract in `lib/balance.ts`/`balanceCue.ts` (UI gate) |
| Books | gl | `reports/GeneralLedger(+View,GlSegment,AccountPicker)` | per-account segments, comparative |
| Books | recon | `books/ReconWorkbench` + `ReconForms` | two-plane statement⇄ledger matching; open/match/close audited fns; agent-routed default + admin deterministic fallback; **statement lines must be uploaded through Clara first; the open-recon form takes a raw "Statement document #" numeric input (placeholder "e.g. 412") — `ReconForms.tsx:191-194`** |
| Books | arap | `books/ArApSubledger` | AR⇄AP aging by counterparty + statements + control tie-outs, all fn-owned; "Send statement" = agent export intent |
| Books | fa | `books/FaRegister` | register + depreciation schedule + disposal (agent-routed, admin fallback `dispose_fixed_asset`) |
| Books | close | `books/PeriodClose` | FY-close readiness checklist; **the close itself is AGENT-ONLY** (`record_year_end_close`/`reverse_year_end_close` via Clara; no direct button) |
| Reports | tb | `reports/TrialBalance` | comparative Dr/Cr, footer Σ only when fn returns it |
| Reports | fs | `reports/FinancialStatements` (+FsStatement) | MPERS SoCI+SoFP, current vs prior; `presentation_complete=false` banner |
| Reports | picker | `reports/ReportsPicker` | deterministic export menu → templated agent intent → artifact on Files shelf; export kinds: trial_balance, journals, documents, management_accounts, full, general_ledger, opening_balances, aging, sst_return, analysis (`lib/artifacts.ts:188-195`) |
| Tax | sst | `tax/SstReturn` | SST-02 draft per bi-monthly period; present-never-hidden (non-SST → profile deep-link empty state) |
| Tax | comp | `tax/TaxComputation` | PBT→add-backs→capital allowances→Form C/PT + CP204/CP500; recompute with 2 human inputs (MSME, donations) |
| Records | documents / files / kb / coa / contacts | §4 + `kb/KbWorkbench` (proposal lane, Confirmed/Candidate/Retired rulebook, RuleDialog/RetireConfirm) + `records/CoaBrowser` (add account, toggle active, set type) + `records/ContactsRegister` (aliases + AR/AP by counterparty) | |

Firm-altitude accounting surfaces: activity feed, compliance calendar, unassigned docs, inbox. **No firm-level TB/GL/FS** (all books surfaces are per-client — correct for a firm-of-clients model but nothing aggregates a client portfolio's workload beyond the inbox strip).

**Missing / not present anywhere in the dashboard** (grep-verified absences):
- **Manual journal-entry creation** — no create-JE form/fn call (`create_journal|new_entry|draft_entry` → zero hits). Entries are born agent-side only; humans can approve/edit/reject/reverse.
- **AR invoice / AP bill creation or payment recording UI** — `ar_invoices`/`ap_bills` are read-only (aging/statements/contacts).
- **Bank feeds / statement CSV import** — statements enter only as OCR'd docs through chat; MIME allowlist excludes CSV/XLSX.
- **Onboarding of opening balances as a surface** — opening_balances exists only as an export kind; carry-forward/opening-balance entry UI absent (close is agent-verb-only).
- Payroll (calendar deadlines only), multi-currency, budgeting/forecasting, consolidation, an audit-pack builder, MyInvois outbound — absent (some deliberately out of scope per PRD; listed for completeness).
- **Mobile**: hard-blocked <1024px (DesktopGate).

## 6. Design system / tokens

- `app/tokens-v2.css` (402 lines, ~273 custom props) — the "precision instrument" v2 system, **promoted to global `:root`/`.dark`** at slice 10·D; L0 oklch primitives (paper/ink ramps, hue 90) → L1 semantic (`--card --well --line --fg-* --agent-* --status-*-spine/-text/-surface --shadow-overlay`); WCAG-AA contrast pairs pinned by `lib/__tests__/tokens-v2.test.ts` in both themes ("change a value ⇒ change the test in the same commit").
- `app/tokens.css` (99 lines) — legacy palette, retired but the file ships; legacy-only names re-homed as aliases in tokens-v2. ~60 leftover `data-ui="v2"` scope attributes remain, now inert (header comment `tokens-v2.css:1-18`).
- `app/glass.css` (256 lines) + `components/glass/GlassSurface.tsx` (the ONLY glass-CSS home) + `LiquidGlassEngine.tsx` (SDF refraction lens) — **still mounted in the root `app/layout.tsx:46`** even though the (dash) shell went opaque-first at slice 9; live consumers: CommandPalette + ReverseDialog overlays via `useOverlayPane`.
- Patterns: Tailwind utility classes referencing the semantic tokens; shadcn-lite `components/ui/*` (9 primitives: alert badge button command dialog dropdown-menu scroll-area separator tooltip); `MoneyCell` for all money (tabular-nums, parens); `useGridKeys` roving-tabindex grids; `components/a11y/useFocusTrap`; density via `DensityBoot` + `lib/uiPrefs.ts`; motion via GSAP in ceremonies only (`lib/useCeremonyMotion.ts`), `motion-reduce:` respected in skeletons.

## 7. NOTES — suspicious / audit-relevant observations

1. **"Hermes" naming saturates the live chat stack** (`lib/chat/hermesChatTransport.ts`, `useHermesChat`, `makeHermesRunner`, `hermesUIMessage`, `HermesRunner`, comments "Hermes emits…") though doctrine says Hermes names only the retired v1 framework. Cognitive-drift hazard; comments also still cite `relay/src/transcript.ts` and "the relay" as if live (e.g. `artifactFence.ts:16-19`, `hermesChatTransport.ts` PARTIAL note) — the parity contract's other half now lives in the agent service, so the pinned citations are stale.
2. **Retired-relay env fallbacks survive**: `lib/notifications.ts:130` and `lib/bulkApprove.ts:13` fall back to `NEXT_PUBLIC_RELAY_URL` while `makeHermesRunner.ts:44-45` deliberately refuses any fallback. Inconsistent decommission.
3. **Every artifact requires a positive `clientId`** (`artifacts.ts parseScope:298-302`) — there is no genuinely firm-scoped card; a firm-level kv_summary/export_result must carry some client's id or be rejected. Constrains firm-altitude chat answers.
4. **Live fence allowlist ⊂ catalog** (`artifactFence.ts:24`): `sst_summary/journal_table/kv_summary/review_summary` have no live fence tag — `hasFenceOpener` won't suppress them, so if the agent ever emits one live it would flash raw JSON in the bubble and land as an inert code block (hydrate-only cards today). How `review_summary` reaches the live thread is *(unverified — agent-side)*.
5. **Attachment `.xml` extension bypass** (`attachments.ts:32-36`): any file renamed `.xml` passes the picker regardless of MIME (agent's UBL root-element check is the real gate — defense depends on the service).
6. **b64-in-JSON upload**: 5×20MB files → ~135MB JSON POST body worst-case per chat turn; no chunking/resumability; a cold agent container takes 60–150s to first SSE event (`makeHermesRunner.ts:17-18`).
7. **Lossy stream recovery by design** — mid-turn content undelivered at drop is unrecoverable (`hermesChatTransport.ts:8-17`); accepted owner decision but a durable-runs target requirement.
8. **Recon opens on a hand-typed document id** (`ReconForms.tsx:191-194`, placeholder "e.g. 412") — the human must know the numeric documents.id; no picker. Trust/usability gap on a control-critical flow.
9. **Untyped seams in the money path's neighborhood**: `ClientWorkspace.documents?: any[]` (`ClientWorkspace.tsx:87`), `DocumentsTable.documents: any[]`, `lib/contactsRegister.ts` five `selectBooks<any[]>` reads, `rowKey(doc:any)`.
10. **`actorFromToken`** is an unverified client-side JWT decode passed as `p_actor` on every dashboard write (`booksApi.ts:71-88`) — documented as display-hint with server re-constraint; audit must confirm the DB actually re-constrains on every fn.
11. **Session-expiry singleton hazard** on the server: `notifySessionExpired()` mutates a Node module-level flag shared across all users of the RSC process; a guard exists in `hydrateTranscript.ts:78-85` but the primitive remains globally importable — any future server-side call re-opens the cross-user leak.
12. **Two shells coexist** (`components/shell/` v1 + `components/shell-v2/`) and the glass engine is dead-ish weight mounted at root (`app/layout.tsx:46`) post-opaque-first; `tokens.css` legacy file still shipped.
13. **RSC pages catch data-fetch errors to sentinels** widely (`.catch(() => null)` in pages) — good honesty pattern (fetch-error vs empty distinguished in DocumentsTable/FirmDocumentsTriage/KbWorkbench), but coverage is per-surface convention, not enforced.
14. **`master`-doc claim vs code**: CLAUDE.md calls the dashboard "go-live-ready"; the file-level evidence shows load-bearing capabilities absent (manual JE, AR/AP writes, statement import, opening balances) — the workbench is a review/read instrument around an agent-writes-everything model. That architecture is coherent, but chat is then a single point of failure for *all* data entry (upload + JE creation + close + disposal + recon all route through one lossy SSE chat wire).
15. Keyboard/a11y floors are genuinely implemented in the surfaces read (roving grids, sr-only speaker attribution `ClaraTranscript.tsx:101`, SC 2.5.8 resize-handle grab zone `ClaraRail.tsx:298-300`, focus rings everywhere) — a11y regression risk on rebuild is losing this, not adding it.
16. Client-side **compliance calendar** (`lib/complianceCalendar.ts`, 18.9KB of Malaysian statutory deadline rules in the frontend) — the sanctioned dates-not-money carve-out, but the ruleset (SST bi-monthly, CP204, Form C/PT/E/BE…) is duplicated knowledge the DB/agent can't audit; drift risk with agent-side rules.
17. Digest watermark burns on render (`CommandCenterV2.tsx:86-89`) — guarded against null fetch; correct, noted as a fragile-idiom precedent.
