# Clara — frontend build handoff for the Codex session

*Finalized 2026-08-23 by the orchestrator lane. Every claim carries a `file:line` in this repo or is
marked **UNVERIFIED** in §10. Written to survive a `/clear`: it names files, docs and commands only —
no task number, agent name or transcript path is a resume step.*

**Your job:** build Clara's complete enterprise frontend — signup/invite, onboarding, the two-pane
Agentic OS shell, documents, drafts, bank, close, reports, receipts, admin — against the existing
backend, in this repo, on your own branch. **Read §0 first: those decisions are closed.**

## 0 · Settled — do not re-open these

Owner rulings (2026-08-23 grill, Q1-Q6) plus orchestrator engineering rulings (D6/D7/D12). **Final.**
If you think one is wrong, say so once, then build to it (`AGENTS.md` hard constraint 1 — a
design-vs-contract collision goes to the owner, Tao, tools@belcort.com; never a unilateral call).

1. **Location.** The frontend lives in **this repo** as a new app package — **apps/web** — on its own
   branch. It **replaces `apps/dashboard` at cutover**, not before.
2. **What is ported.** The wire layer is ported as **CONTRACTS**, not code you must keep:
   `apps/dashboard/app/shared/parts.ts` · `apps/dashboard/app/chat/partCatalog.ts` ·
   `apps/dashboard/app/shared/cards/cardHooks.ts` · `apps/dashboard/app/shared/wire.ts`.
   **Everything visual is greenfield** — there is no design system to preserve (§3 preamble).
3. **Host.** **Cloudflare Workers via `@opennextjs/cloudflare`**, Next 15/16 App Router. SSR,
   middleware, server actions, ISR, PPR, streaming and `'use cache'` are supported; **Node.js-style
   middleware (Next 15.2+) is NOT** — use standard middleware plus `@supabase/ssr`. The Worker must
   stay **≤ 10 MiB compressed** (paid plan) → **add a CI size gate**. **Build on WSL/Linux**, never on
   Windows. The Cloudflare **Pages static export retires at cutover**
   (`apps/dashboard/next.config.mjs:10-14` — `output: "export"` is gated on `STATIC_EXPORT=1`; a Pages
   Function catch-all proxies `/api/*`, `apps/dashboard/functions/api/[[path]].js:1-31`).
4. **Auth.** **Supabase Auth, cookie sessions, INVITE-ONLY first** — the operator creates the firm,
   users are invited. Self-serve signup comes later behind PRD §4.1's fail-closed admission gate
   (`docs/product/PRD.md:71`). One-firm-per-user is DB law (`:46`).
5. **Email.** **Resend**, and an email **NEVER carries client data** — notification + deep link only
   (PRD §6.16, `docs/product/PRD.md:171`; TA-P3, `docs/adr/0074-the-track-a-sitting.md:74-95`).
6. **Styling.** **Tailwind + shadcn/ui are adopted.** `docs/design/DESIGN_SYSTEM.md:6-8` claims the
   shipped surfaces "were built directly against shadcn/Tailwind primitives" — **false**:
   `apps/dashboard/package.json` deps are exactly `next`, `pdfjs-dist`, `react`, `react-dom`, and the
   styling is 16 plain CSS-Module files. **True that file in your first PR.**
7. **Data.** You build against the **LIVE project**. ADR-0075 / digest law 82: every client in the
   estate is resettable test data (`docs/adr/README.md:466`; `0075:46-54`). **Mechanisms never move**
   for testing convenience (`0075:66-73`) — RLS, the attribution walls, receipts, roles and grants are
   the product under test.
8. **Crude doors.** The Track-A backend lanes ship **crude human doors as reference implementations**
   (TA-P14 clause 2, `0074:311-313` — "the UI may be crude; it may not be absent"). **You replace them
   IN PLACE, reusing the same verb, never adding a gate** (TA-P11's one-architecture test,
   `0074:248-252`; digest law 81, `docs/adr/README.md:459-462`).
9. **Manual-JE compose UI is YOURS.** `clara.wake_draft_entry` exists
   (`packages/db/migrations/0004_governed_fns.sql:617`); no dashboard surface uses it. **Line reorder /
   re-date and an atomic bulk approve have NO backend verb** — the UI may not offer them until one
   exists.
10. **Raw-document access from any ledger figure is first-class.** Primitives are built:
    `apps/dashboard/app/shared/cards/DocViewer.tsx`, `apps/dashboard/app/shared/cards/RegionOverlay.tsx`,
    `apps/dashboard/app/shared/cards/regionGeometry.ts`,
    `fetchDocumentBytes` (`apps/dashboard/app/shared/reviewApi.ts:394`).
11. **Generative-UI principles are law** (§3, §5): cards are the agent's body language; fail-closed
    rendering (an unknown part kind renders a typed refusal, never a guess); hydrate-never-trust;
    clarification cards are a **primary** surface (TA-P7 "unsure → she asks", `0074:159-195`); receipts
    get a human-readable surface (TA-P4, `0074:96-113`); **AG-UI option B** — borrow the activity
    frame, the working-state panel and tool-evidence rows, take **no dependency**; **open register**
    (TA-P1, `0074:24-33`) — the UI shows what she did plus one-click reversal rather than collecting
    approvals, and the seven reserved human acts get real doors.

## 1 · What you are building (product brief, in the orchestrator's voice)

> Clara is an **AI-native Agentic Accounting OS for Malaysian accounting firms** — she runs the whole
> lifecycle (onboarding → ongoing close → tax → reporting) under professional human control on an
> RLS-isolated Postgres (`docs/product/PRD.md:11`). She is **not accounting software with a chat panel
> bolted on**: she is a stateful conversational super-UI over the entire product, and **the dashboard
> is the agent's body language** (`:133`).
>
> **The DB owns every authoritative number; the agent orchestrates.** The model may propose or check a
> figure, but no model-generated numeral enters a durable artifact unless a versioned deterministic
> evaluator reproduces it from DB-owned inputs (`:156` — §6 is LAW). At the UI layer this is absolute:
> **the screen never sums, derives or computes a cent.**
>
> **Her judgement is real, and every act is receipted.** Since 2026-08-22 she posts, matches, adjusts,
> attributes documents and prepares closes on her own judgement (digest laws 78-81,
> `docs/adr/README.md:450-462`). Seven acts stay human by reservation — close keys ②③ ·
> `except_bank_line` · opening-seed approval · statutory wording · `canonical` definitions · capability
> grants · e-filing (`docs/adr/0074-the-track-a-sitting.md:28-30`) — **everything that list does not
> reserve is hers**, each act carrying model + version + rationale bound mechanically to its
> triggering turn or wake task (`0074:96-113`).
> **That inverts the UI's job.** The old job was collect approvals; the new job is: **(a)** show what
> Clara did, why, and on what evidence — without needing the chat; **(b)** put a reversal or
> correction within one click of any figure; **(c)** carry her questions well, because "unsure → she
> asks" is now the product's main safety valve.
> **Two panes, one workspace.** One client workspace — journals, documents, subledgers, registers,
> knowledge — with Clara docked as a rail, never a modal: the rail is where she speaks, the workbench
> is where the work lives, neither is a view of the other (`:137`). **The acceptance test, unchanged
> since Gate 2** (`docs/design/PRODUCT_DESIGN.md:60`; `:135`): *remove the chat rail — the workbench
> must still show what Clara did, why, with what evidence, and offer every Clara action as a verb.*
> Users: a Malaysian firm owner and his bookkeepers (`:35-36`); **clients never log in** (`:38`); RBAC
> `viewer < bookkeeper < admin < owner` **enforced in the DB, not the UI** (`:40-45`). Precedence:
> **accounting-correctness > backend contracts > design look/motion** (`:170`).

## 2 · Reading order — in this order, do not skip

1. `AGENTS.md` — the fifteen hard constraints and the harness menu. **Before your first write.**
2. `docs/product/PRD.md` §1-§6 — problem (`:21`), personas + RBAC (`:31-46`), capabilities
   (`:69-91`), journeys (`:120-129`), **§5a the OS surface contract (`:131-150`)**, **§6 invariants
   = LAW (`:152-172`)**.
3. `docs/ARCHITECTURE.md` §0 — the one invariant and its four structural mechanisms (`:7-18`); §1
   topology, three planes (`:20-40`).
4. `docs/adr/README.md` §9-§12 — Agentic Charter (`:407`), CI economics (`:468`), **§11 Track-A laws
   78-81 (`:448-462`)**, **§12 law 82 (`:465-466`)**.
5. `docs/adr/0074-the-track-a-sitting.md` (TA-P1 … TA-P14 — the rulings that reshape the surface) +
   `docs/adr/0074-annex-a-mechanisms.md`; then `docs/adr/0075-test-data-authority-widened.md` — what
   you may and may not do to live data.
6. `docs/design/PRODUCT_DESIGN.md` §1-§4 (`:56-100`) — the ratified seed direction. `FRONTEND.md` and
   `DESIGN_SYSTEM.md` in the same folder are **deliberate skeletons** (`FRONTEND.md:3-7`,
   `DESIGN_SYSTEM.md:3-5`) — Wave G populates them; you now own that.
7. The seven Track-A v2 designs, **surface sections only**: `docs/plan/active/close-key-1-design.md`
   §3.7/§3.8/§3.11 · `reporting-agency-design.md` §3.4/§3.6/§3.9 · `freeform-read-design.md` §3.6 ·
   `filing-and-interview-design.md` §3.2/§3.3/§3.4 · `bank-agency-design.md` §3.8 +
   `bank-agency-annexes-4-surfaces.md` Annex G (`:87`) · `metering-design.md` §3.7 ·
   `internet-lane-design.md`.
8. `docs/plan/active/wave-f-contract.md` (what each Wave-F lane hands you), then
   `wave-g-e2e-corpus-design.md` §5 — the end-to-end run script; **this is the journey your UI must
   walk from one end to the other.**
9. `PROGRESS.md` — the state authority. If it disagrees with anything above, it wins or it is stale.
10. **The code**, because `docs/design/` is empty on purpose: `apps/dashboard/app/shared/parts.ts`,
    `apps/dashboard/app/chat/partCatalog.ts`, `apps/dashboard/app/chat/parts.tsx`,
    `apps/dashboard/app/shared/cards/cardHooks.ts`, `apps/dashboard/app/shared/wire.ts`,
    `apps/dashboard/app/chat/api.ts`, `apps/dashboard/app/chat/review.ts`.

## 3 · The non-negotiable backend contracts

*Every route in `apps/dashboard` self-labels "plumbing-grade" or "no design system, no animation"
(`apps/dashboard/app/chat/page.tsx:8-9`, `apps/dashboard/app/reports/page.tsx:2-4`) — **there is no design system to preserve.**
What you preserve is everything in this section.*

**3.1 Typed `parts[]`, fail-closed rendering.** The transcript wire is a closed union of **21 part
types** (`apps/dashboard/app/shared/parts.ts:143-170`): `text · tool_call · tool_result · tool_error ·
clarify · clarify_closed · attachment · je_review · refusal · doc_review · diff · sweep_receipt ·
kb_rule_proposal · open_question · rule_post_receipt · bank_recon_receipt · bank_rule_proposal ·
fixed_asset · depreciation_run_receipt · adjustment_run_receipt · staff_advance`.
`tool_result`/`tool_error` are status-resolvers, rendering nothing standalone (`partCatalog.ts:16-17`).
- **Adding a part type without a catalog entry must fail `tsc`** — the `AllCovered`/`NoExtra`
  compile-time guard, `apps/dashboard/app/chat/partCatalog.ts:160-170`. **Reimplement the mechanism, not the look.**
- **An unknown type renders visibly, never nothing** — `FALLBACK_UNSUPPORTED_PREFIX = "Unsupported
  part: "` (`apps/dashboard/app/chat/parts.tsx:134`).
- **Text-to-hydration, never text-to-code.** The model selects a registered card id and its
  identifiers; it never authors markup and never streams component props.

**3.2 Hydrate-never-trust.** Every identifier-only part carries **ids only** on the wire and re-derives
authoritative state from a pinned DB read function **on mount and after every action**
(`apps/dashboard/app/shared/parts.ts:34-36`; the generic hook is `apps/dashboard/app/shared/cards/cardHooks.ts` — `reload()` on
mount, `act()` re-reloads after every mutation, **no optimistic UI, ever**). **Refusal parts are the
deliberate exception**: they render verbatim, there being no draft left to hydrate (`parts.tsx:212-220`).

**3.3 The two-lane wire; governance never transits the runtime.**
- **HUMAN lane** — Supabase PostgREST as `clara_authenticated` with `Accept-Profile` /
  `Content-Profile: clara` (`apps/dashboard/app/shared/wire.ts:39-48`). Every governance verb (approve, sign,
  retire, void, attest, resolve, dismiss, share, cancel) goes here and **never through the runtime**
  (`apps/dashboard/app/chat/api.ts:1-8`).
- **AGENT lane** — the runtime HTTP surface; SSE over a streaming `fetch`, because `EventSource`
  cannot send an Authorization header (`apps/dashboard/app/chat/api.ts:176-181`).
- **Errors.** The governed **CLR code IS the SQLSTATE** (PostgREST `body.code`); the machine reason
  token rides the exception `DETAIL` as `{"reason": <token>}`; message-text regex is a defensive
  fallback only. **Branch on HTTP `status` BEFORE `clr`**, so an expired session can never masquerade
  as a governed refusal (`apps/dashboard/app/shared/wire.ts:50-70`). **Render the code and message verbatim; never
  re-word a refusal.**

**3.4 Money.** `bigint` cents, rendered to RM only in the view (`docs/product/PRD.md:161`). Every
figure comes from a DB read function; **the UI never sums a durable figure.** One as-built nuance to
carry deliberately: `apps/dashboard/app/chat/JeReviewCard.tsx:244-245` sums the *edit buffer's* debit/credit for a
draft balance indicator — an input-validation affordance on unsaved text, not a ledger figure; keep it
visually distinct from DB-projected totals.

**3.5 Receipts (TA-P4).** Every agent judgement act carries model + version + rationale bound
mechanically to the triggering chat turn or wake task; the model's sentence is an annotation, never the
only evidence; read and receipt commit in **one transaction — no receipt, no read**
(`docs/adr/0074-the-track-a-sitting.md:96-113`). Four human read surfaces are ruled into existence and
you build the real UI for them: `clara.list_agent_act_receipts` as a `/close` panel
(`docs/plan/active/close-key-1-design.md:319-321`) · `report_agent_receipts` on `/reports`
(`reporting-agency-design.md:245-247`) · the freeform-read page (`freeform-read-design.md:341-343`) ·
the union view `clara.agent_receipts_visible` (`filing-and-interview-design.md:249-252`).
**Never draw a receipt the DB did not return. Absence is not evidence.**

**3.6 Human-act doors — exactly one door per act.** Six controls on `/close`, crude but never absent:
**Finalize (key ②)** · **Abandon** · **the "Clara proposes close" review card** · **Reopen (key ③,
mandatory reason + correction target)** · **HOLD / release** · **the agent-act receipt panel**
(`close-key-1-design.md:393-399`). **`begin_close` deliberately has NO human door** (`:397-399`) — do
not add one. Never add a second approval gate for something the DB already gates, and never let a UI
affordance become a second authority path.

**3.7 Sandbox ≠ authoritative (TA-P10 C′).** A narrative or free-query figure must be visually and
verbally distinct from an evaluator-produced cell, and an export's **watermark is burned into the
BYTES, never a CSS layer** (`0074:229-233`; `reporting-agency-design.md:326-340` — the policy row lives
in `clara.watermark_policy_versions` and **a missing row for the locale REFUSES the render**).
**A frontend that draws a watermark div is a defect.**

## 4 · The API surface you build against today

**4.1 Runtime HTTP (AGENT lane).** In production a Pages Function proxies `/api/*` to
`CLARA_RUNTIME_ORIGIN` (`apps/dashboard/functions/api/[[path]].js:1-31`); locally Next rewrites do it
(`apps/dashboard/next.config.mjs:15-29`). **You replace that proxy with a Workers-side equivalent.**

| Method + path | Caller |
|---|---|
| `GET`/`POST /api/chat/sessions` | `apps/dashboard/app/chat/api.ts:120` · `:129` |
| `GET /api/chat/sessions/:id/messages` | `apps/dashboard/app/chat/api.ts:138` |
| `POST /api/chat/:sessionId/turns` | `apps/dashboard/app/chat/api.ts:155` |
| `GET /api/tasks/:id/stream` (SSE) | `apps/dashboard/app/chat/api.ts:179`; server `packages/runtime/src/streamRoute.ts:28` |
| `POST /api/intake/documents` · `PUT …/:id/bytes` · `POST …/:id/finalize` | `apps/dashboard/app/shared/intake.ts:108,135,171` |
| `POST /api/interview/firm/start` · then client/start · answer · cancel | `apps/dashboard/app/shared/interviewApi.ts:313,322,348,486` |
| `GET /api/interview/state` | `apps/dashboard/app/shared/interviewApi.ts:340,441` |
| `POST /api/opening/parse-targets` | `apps/dashboard/app/shared/openingApi.ts:421` |
| `GET /api/documents/:id/bytes` | `apps/dashboard/app/shared/reviewApi.ts:396` |
| `POST /api/seeding/prepare` | `apps/dashboard/app/shared/seedingApi.ts:342` |

**SSE envelope** — four hand-written event names: `chunk` (`streamRoute.ts:117`), `message`
(terminal, `:75`), `done` (`:76`), `detached` (`:160`). **The terminal `message` re-sends the
DB-persisted `parts` and is the authority** (`:69-76`); a reattaching client replays from index 0
(`:84-91`). The live-chunk transcript is provisional.

**4.2 PostgREST governed RPCs (HUMAN lane)** — all via `rpc()` (`apps/dashboard/app/shared/wire.ts:122-133`) or the
sealed copy (`apps/dashboard/app/chat/api.ts:279-289`). Every name is a live verb; the numbers are its call sites.

- **Governance** — `answer_interruption`, `cancel_agent_task`, `share_chat_session` (`apps/dashboard/app/chat/api.ts:330,334`).
- **Drafts** — `get_draft_review`, `withdraw_draft`, `get_document_extract` (`apps/dashboard/app/chat/review.ts:266,327,355`);
  `approve_entry` (`:279-280`); `revise_entry` (`:307-316`).
- **Queue / review** — `list_review_queue`, `get_entry_diff`, `get_doc_entry_diff`, `get_sweep_run`,
  `get_open_question`, `get_coding_rule`, `get_lint_finding`, `coding_lane`, `get_rule_post_run`,
  `list_autopost_rules`, `preview_ocr_sales_evidence`, `list_notifications`, `approve_routine_entry`,
  `acknowledge_sweep_run`, `sign_coding_rule`, `decline_coding_rule`, `resolve_open_question`,
  `dismiss_open_question`, `acknowledge_rule_posts`, `ack_compliance_watch`, `snooze_compliance_watch`,
  `resolve_compliance_watch`, `sign_autopost_rule`, `retire_autopost_rule`, `propose_autopost_rule`,
  `list_vendor_bindings`, `get_vendor_binding`
  (`apps/dashboard/app/shared/reviewApi.ts:34,39,43,47,51,55,62,67,78,83,110,118,128,133,137,141,145,163,171,182,187,193,226,235,242,358,383`).
- **Documents** — `record_document_resolution` (`apps/dashboard/app/documents/api.ts:163`), `file_document` (`:189`),
  file-to-client (`:196`), retire-filing (`:202`), confirm-candidate with `p_file_document` (`:213`),
  `dismiss_attribution_candidate` (`:219`), `set_document_kind` (`:283`),
  `place_legal_hold`/`release_legal_hold` (`:287,291`), `list_uncoded_filings` (`:334`),
  `complete_coding_task`/`dismiss_coding_task` (`:364,368`), correction wizard (`:230,244,257`).
- **Close** — `list_fiscal_years`, `get_close_plan`, `attest_close_exception` (`apps/dashboard/app/close/closeApi.ts:28,138,151`).
- **Reports** — `snapshot_state` (`apps/dashboard/app/reports/reportsApi.ts:43`); artifact rows carry
  `storage_key`/`sha256`/`byte_size` but **this build ships no signed-download door — do not fabricate
  a link** (`:56-62`).
- **Bank** — `list_bank_accounts`, `list_bank_account_proposals`, `list_bank_statements`,
  `get_bank_statement`, `list_bank_match_candidates`, `add_bank_account`, `reactivate_bank_account`,
  `void_bank_statement`, `match_bank_line`, `unmatch_bank_match`, `settle_from_bank_line`
  (`apps/dashboard/app/shared/bankApi.ts:40,45,52,60,90,130,147,208,255,264,314`); reconciliation
  `get_bank_reconciliation`, `list_unmatched_lines`, `list_bank_line_suggestions`,
  `list_bank_rule_candidates`, `list_bank_rules`, `void_bank_reconciliation`,
  `resolve_bank_line_exception`, `sign_bank_rule`, `retire_bank_rule`
  (`apps/dashboard/app/shared/reconApi.ts:52,58,63,68,85,123,169,191,199`).
- **Subledgers / registers** — `ar_aging`, `ap_aging` (`apps/dashboard/app/shared/agingApi.ts:49,56`);
  `list_fixed_assets`, `get_fixed_asset`, `list_depreciation_runs`, `get_depreciation_run`,
  `get_depreciation_authority`, `fa_register_tie`, `retire_fa_account_profile`,
  `propose_depreciation_authority`, `sign_depreciation_authority`, `set_client_fy_end`
  (`assetsApi.ts:36,41,46,53,58,63,91,146,152,200`); `staff_advance_summary`, `staff_advance_tie`
  (`advancesApi.ts:47,63`); `list_adjustment_templates`, `adjustment_run_due`, `get_adjustment_run`,
  `list_adjustment_runs`, `sign_adjustment_template`, `retire_adjustment_template`
  (`adjustmentApi.ts:55,60,67,74,164,173`).
- **Onboarding / opening / seeding** — `begin_client_onboarding`, `bootstrap_client_plan`
  (`onboardingApi.ts:164,243`); `get_opening_dryrun`, `cancel_opening_seed`, `reopen_opening_seed`,
  `record_opening_target`, `seed_fixed_asset`, `supersede_opening_item`
  (`openingApi.ts:171,237,241,247,336,348`); `tick_seeding_proposal`, `decline_seeding_proposal`,
  `complete_seeding_batch`, `cancel_seeding_batch` (`seedingApi.ts:283,288,295,301`);
  `create_counterparty` (`counterpartyApi.ts:81`); `upsert_account` (`apps/dashboard/app/accounts/api.ts`).

**4.3 Direct RLS-scoped table/view reads** (`pgrestSelect`): `accounts` (`apps/dashboard/app/accounts/api.ts:18`) ·
`clients` (`apps/dashboard/app/documents/api.ts:126`) · `documents`/`filings` (`:101,109,117`) ·
`agent_tasks_visible`/`agent_interruptions` (`apps/dashboard/app/chat/api.ts:300,308,316`) · intake views
(`apps/dashboard/app/shared/intake.ts:219,231,242`) · onboarding plans (`onboardingApi.ts:89,96,109,116,129`) ·
opening-seed rows (`openingApi.ts:51,58,71,80,100,138,151,162,260`) · counterparties
(`counterpartyApi.ts:49`) · snapshots + report artifacts (`apps/dashboard/app/reports/reportsApi.ts:32,87`) · seeding
batches (`seedingApi.ts:217,222,236`). **Nothing connects to Postgres directly and no service-role key
ever reaches the browser.**

**4.4 What Wave F adds that you will carry** (designed, unbuilt — cite the design, presume no shape):

| Lane | New surface the frontend inherits | Design |
|---|---|---|
| **F-A2** posting | Unattended posts + receipts; the generic lane's downstream reversal path | `f-a2-agentic-posting-design.md:479-482` |
| **F-A3** bank | Thirteen wake siblings; **the bank-rules machine RETIRES whole — its four dashboard surfaces come down** | `0074:260-268`; `bank-agency-annexes-4-surfaces.md:87` |
| **F-A4** close key ① | The six `/close` doors, the "Clara proposes close" carrier, the product's first clock | `close-key-1-design.md:393-399`; `0074:119-131` |
| **F-A5** reporting | open→evaluate→seal→render (**issue stays human**), `report_agent_receipts` panel, watermark policy | `reporting-agency-design.md:245-247,326-340`; `0074:304-320` |
| **F-A6** freeform read | The audited free-read surface + its receipt page (who asked, client, purpose, SQL, outcome, rows) | `freeform-read-design.md:341-343` |
| **F-A7a** filing | `wake_file_document`; the **attribution clarification + re-attribution** surface; firm-scoped question carrier | `filing-and-interview-design.md:184-236` |
| **F-A9** metering | `clara.get_llm_usage_summary` exists; **"No dashboard page ships in this design"** — the screen is yours | `metering-design.md:303-308,339` |

## 5 · User-journey inventory

**BUILT** = a working (plumbing-grade) surface · **CRUDE-DOOR-COMING** = a Track-A lane ships a
minimal door you replace in place · **DESIGNED** = specified, unbuilt · **UNBUILT** = nothing.

| # | Journey | State | Evidence / verb |
|---|---|---|---|
| 1 | **Signup / signin / session** | **UNBUILT** — auth today is a pasted Supabase JWT in `sessionStorage` | `apps/dashboard/app/chat/page.tsx:5-6,34,63-67`; no `@supabase/*` package anywhere |
| 2 | **Invite a member / firm setup** | **UNBUILT** — no members UI, no invite call | PRD §4 item 21 (`docs/product/PRD.md:91`); RBAC `:40-45` |
| 3 | **Transactional email** | **UNBUILT** — no email code anywhere | greenfield; notification + deep link only (§0.5) |
| 4 | **Firm onboarding interview** | **BUILT** | `apps/dashboard/app/onboarding/firm/page.tsx`; `apps/dashboard/app/shared/interviewApi.ts:313,340,348` |
| 5 | **Client onboarding + purpose-list click-through** | Interview **BUILT** (`apps/dashboard/app/onboarding/client/`, `apps/dashboard/app/clients/plan/`); **the purpose-list consent step is UNBUILT** | The list is `docs/ops/legal/client-ai-authorization-letter-template.md` §2 (`:81-100`): keys `witness_extraction`, `wiki_synthesis`, `statement_extraction`, `bank_matching`, plus a not-yet-minted classification key. **Two acts by design** — the signed original is filed as `evidence_document_id`, then a **separate owner activation** switches each purpose on (`:104-107`) |
| 6 | **Carry-down / opening seed / TB tie-out** | **BUILT** | `apps/dashboard/app/opening/`, `apps/dashboard/app/seeding/`; `apps/dashboard/app/shared/openingApi.ts`, `seedingApi.ts` |
| 7 | **Home chat (firm altitude)** | **BUILT as `/chat`; the home page is a Slice-1 link list** | `apps/dashboard/app/chat/page.tsx`; `apps/dashboard/app/page.tsx:1-2` |
| 8 | **Client chat** | **BUILT** — same surface, `?client_id=` scoping | `apps/dashboard/app/chat/page.tsx` |
| 9 | **Documents: upload / OCR / evidence viewer / correction** | **BUILT** | `apps/dashboard/app/documents/` (`DocumentDetail.tsx`, `CorrectionWizard.tsx`, `CodingSections.tsx`), `apps/dashboard/app/shared/cards/DocViewer.tsx` |
| 10 | **Filing a document to a client** | **BUILT (human-only)**; the agent's `wake_file_document` is **DESIGNED** | `apps/dashboard/app/documents/api.ts:189,196,202,213`; `filing-and-interview-design.md:109-116` |
| 11 | **Attribution clarification / re-attribution** | **DESIGNED** — now a *primary* surface | `filing-and-interview-design.md:184-236`; wire parts `clarify` + `clarify_closed` |
| 12 | **Drafts + edit actions** | **BUILT (raw table)** — see the verb map below | `apps/dashboard/app/chat/JeReviewCard.tsx`, `apps/dashboard/app/chat/review.ts` |
| 13 | **Manual JE compose (new draft from the UI)** | **UNBUILT — YOURS** | `clara.wake_draft_entry` (`packages/db/migrations/0004_governed_fns.sql:617`); zero dashboard references |
| 14 | **Review queue + batch approve** | **BUILT** — routine-only, **N independent per-entry calls, not an atomic bulk verb** | `apps/dashboard/app/queue/BatchApprove.tsx:3-9`; `approve_routine_entry` (`apps/dashboard/app/shared/reviewApi.ts:128`) structurally refuses high-stakes in the DB (CLR05) |
| 15 | **AR/AP aging + subledgers** | **BUILT** | `apps/dashboard/app/aging/`; `apps/dashboard/app/shared/agingApi.ts:49,56` |
| 16 | **Bank ingest / matching / reconciliation** | **BUILT (human-driven)**; agency **DESIGNED**, and the rules surfaces **retire** | `apps/dashboard/app/bank/`; `0074:260-268` |
| 17 | **Fixed assets · adjustments · advances · accounts** | **BUILT** | `apps/dashboard/app/assets/`, `apps/dashboard/app/close/adjustments/` (relocated from the retired `/rules`, F-A2 PR-3), `apps/dashboard/app/advances/`, `apps/dashboard/app/accounts/` |
| 18 | **Close — the three keys** | Key ① agent (**DESIGNED**, F-A4); keys ②③ human forever; the page exists but `closeApi.ts` holds only `list_fiscal_years`/`get_close_plan`/`attest_close_exception` | `apps/dashboard/app/close/page.tsx`, `apps/dashboard/app/close/closeApi.ts:28,138,151`; doors **CRUDE-DOOR-COMING**, `close-key-1-design.md:393-399` |
| 19 | **Reports — statutory close reports** | **PART-BUILT (metadata only)**; no signed-download door | `apps/dashboard/app/reports/reportsApi.ts:32,56-62,87` |
| 20 | **Reports — flexible / generative** | **DESIGNED** | `reporting-agency-design.md` §3.5-§3.6; sandbox export severed to a later item |
| 21 | **Raw-document click-through from any figure** | **DESIGNED, UNBUILT — cheapest high-value win** (region geometry is done) | `docs/plan/active/roadmap.md:42-44`; `apps/dashboard/app/shared/cards/RegionOverlay.tsx`, `regionGeometry.ts` |
| 22 | **Receipts / audit read surfaces (four)** | **DESIGNED, CRUDE-DOOR-COMING** | §3.5 |
| 23 | **Freeform read ("ask the books") + its receipt page** | **DESIGNED** | `freeform-read-design.md:341-343` |
| 24 | **Proactive cross-client "Needs you" inbox** | **UNBUILT** at firm altitude (the queue has a `needs_you` section) | `apps/dashboard/app/shared/queueKindCatalog.ts:82`; PRD §5a (`docs/product/PRD.md:140`) |
| 25 | **⌘K Ask/Do/Go + object ActionPanels** | **UNBUILT** | `docs/design/PRODUCT_DESIGN.md:94` ("– not yet") |
| 26 | **Admin: users, capabilities, metering rollup** | **UNBUILT**. Capabilities are **default-on with no per-firm dial** (`0074:40-43`) — surface them, do not build a toggle. **Prices are developer-seeded: build NO approve UI.** The rollup read is `clara.get_llm_usage_summary` (`metering-design.md:303-308`) | PRD §4 item 21 |

**Draft edit-action → verb map.** The **only** draft mutator is `revise_entry`: it takes the *whole*
lines array plus counterparty and evidence, re-validates the line laws, and **rotates the revision
token** — `approve_entry` must then carry the NEW token (`apps/dashboard/app/chat/review.ts:307-321`).

| Human edit action | Verb | Note |
|---|---|---|
| Change account on a line | `revise_entry` → `lines[i].account_code` | `JeReviewCard.tsx:167` |
| Change total / amount | `revise_entry` → `lines[i].debit_cents`/`credit_cents` | `JeReviewCard.tsx:168-169`; a non-conforming total needs the governed `p_amount_override` (reason + machine-total region) — `review.ts:315`, **sets HIGH-STAKES** |
| Rename a line (narrative) | `revise_entry` → `lines[i].description` | `JeReviewCard.tsx:170` |
| Set / rename the counterparty | `revise_entry` → `p_proposed_counterparty` | `review.ts:311`. **A name-only client's counterparties are NEVER enriched by inference** — the generic wall survives ADR-0075 (`0075:79-84`) |
| **Split** a line into several | `revise_entry` with a longer `lines` array | Works today; **there is no split affordance** — the UI is a raw table. The UX is yours; the verb is unchanged |
| Merge lines | `revise_entry` with a shorter array | same |
| Attach / change evidence region | `revise_entry` → `p_evidence[]` (`region_id`, `field_path`, `quote`) | `review.ts:312`; `JeReviewCard.tsx:182` |
| Approve | `approve_entry(p_entry, p_expected_revision, p_attestation, p_op_key)` | `review.ts:279-280` |
| Discard draft | `withdraw_draft(p_entry, p_reason, p_expected_revision, p_op_key)` | `review.ts:327` |
| Override a duplicate-bill refusal | `revise_entry` → `p_duplicate_override` | `review.ts:316`; **sets HIGH-STAKES** |
| **Reverse a POSTED entry** | reverse-not-delete, required reason | `docs/product/PRD.md:163`. **Never share an "undo" verb between drafts and posted entries** (`docs/design/PRODUCT_DESIGN.md:71`) |
| **Reorder / re-date lines** | **NO VERB** | Do not offer it. Do not invent one |
| **Atomic bulk approve** | **NO VERB** | The lawful shape is N independent calls with per-row outcomes, routine-lane only (`BatchApprove.tsx:3-9`) |

**Rule: if an action has no named backend verb, the UI does not offer it.** Never simulate an action
client-side, and never compose two verbs into one button that implies atomicity the DB does not give.

## 6 · Setup

```sh
git clone <repo> && cd clara                # main; the tree is complete — nothing is withheld
pnpm install                                # Node >= 20.19, pnpm 10
pnpm typecheck && pnpm lint && pnpm build   # prove the baseline before you touch anything
```

**The five tracked `.env.example` files** — copy each to a real env file, filled **in your own
environment only**: `apps/dashboard/.env.example` · `packages/runtime/.env.example` ·
`packages/db/.env.example` · `packages/backup/.env.example` · `spike/.env.example`.
**Never commit a credential** (`AGENTS.md` constraint 4) — DSNs come from the environment only, never
code, never argv; leak-scan and gitleaks enforce it, and a leaked key in git history is irreversible
even in a private repo.

**You set up Supabase and Resend yourself** — your own Supabase project for local/preview work, your
own Resend account and sending domain. Secrets live in the environment and the Worker secret store,
never in the repo, a PR body or an issue. **Cloudflare:** add `@opennextjs/cloudflare` + `wrangler` to
apps/web; build on **WSL/Linux**; **verify §0.3's capability list against current
OpenNext/Cloudflare docs before designing around it** (context7 — `AGENTS.md` requires the newest
official docs). **DB work** runs on a **throwaway** Postgres, never hand-applied to a live project
(constraint 10; `packages/db/README.md`): `pnpm db:migrate`, `pnpm db:seed`,
`pnpm --filter @clara/db test`.

**CI** (`.github/workflows/ci.yml`): the required check is **`ci`**, a fail-closed **meta-gate over
every job** (`:436-450`) — a red lint blocks merge on every PR, docs-only included. The **path
classifier** (`:72-116`) marks a diff docs-only when every file matches `docs/*`, `AGENTS.md`,
`CLAUDE.md` or `PROGRESS.md`; **anything else — `.claude/*` included — is code** and pulls in
typecheck/build, the DB estate suite, live e2es, the DR round-trip and the render drill. Runners are
**four** self-hosted WSL2 instances (`clara-wsl` … `-4`, expanded from two on 2026-08-23; `docs/ops/ci-runner.md`)
labelled `self-hosted, linux, clara`; an offline runner makes jobs queue visibly, never silently pass.
**You add the Worker size gate (≤ 10 MiB compressed).**

## 7 · Skills and MCPs — what each is for

**Confirmed present in the Claude session that wrote this handoff** (set up your own in Codex):
- **`frontend-design`** (anthropics/skills) — aesthetic direction, typography, avoiding templated
  defaults. Use at the **start** of the visual system, once.
- **`impeccable`** — UX review: hierarchy, cognitive load, a11y, motion, empty and error states. The
  standing critique pass on **every** screen.
- **`shadcn` skill** — CLI, component installation, composition, theming, custom registries.
- **`supabase`** — the auth work: `@supabase/ssr`, cookie sessions, `getUser` vs `getSession`, RLS
  interactions. **Mandatory** for signin/invite. Its Postgres-best-practices companion is read-only
  reference — **the frontend never writes DDL.**
- **`dataviz`** — before any chart, meter, KPI tile or dashboard layout.
- **MCPs:** **`context7`** (current Next / OpenNext / Cloudflare / Supabase / shadcn docs — mandatory
  per `AGENTS.md`) · **`playwright`** (e2e + visual verification) · **`codebase-memory-mcp`**
  (`search_graph` / `query_graph` — **query the graph before you grep**, constraint 7) · **`github`**.

**Named by the owner, to install in your session** — **UNVERIFIED** under these exact names; confirm
before depending on any, and substitute if not: **nextlevelbuilder `ui-ux-pro-max`** (the UX-pro role;
substitute `impeccable`) · **a shadcn MCP server** (registry access at tool level; substitute the
shadcn skill + context7) · **bergside `awesome-design-skills`** — **browse the collection and pick**
what fits; it is a set, not one skill · **greensock `gsap-skills`** for motion, remembering that motion
serves legibility here, never spectacle (honest state first; compact mode still meets the a11y floor,
`docs/product/PRD.md:145`) · **Mobbin MCP** for real-product UI reference patterns — already in the
owner's Claude config; **set up your own** (substitute: manual reference gathering).

## 8 · GRILL FIRST — align with the owner before you write product code

`AGENTS.md` constraint 6: **grill until crystal-clear before a non-trivial build.** Run §2's reading
order, produce a one-page *as-understood* summary (what exists, what you replace, what you leave
alone), then take the list below to the owner — **one question per turn, each with its cost stated and
a fail-closed default** — and record the rulings before planning the build.

**The open items. Nothing in §0 is on this list.**

1. **Visual direction and brand** — what Clara *looks* like: tone, density, colour, typography, the
   agent's visual voice. There is no prior art to inherit (§3 preamble); this is a blank page.
2. **Information architecture of the two panes** — what the workbench holds at firm altitude versus
   client altitude, how the rail docks, what the URL addresses (`docs/product/PRD.md:137,144`), and
   whether today's per-surface routes (`/bank`, `/aging`, `/assets`, …) become tabs of one workspace.
3. **Card-catalog extensions you want** — the wire carries 21 types (§3.1); adding one is a *wire*
   change with a backend dependency. Name the ones you need (activity frame, working-state, evidence
   rows, close-proposal, receipt kinds) and get them scheduled, not assumed.
4. **Mobile scope** — responsive-only, a real tablet layout for review-on-the-go, or desktop-first
   with a hard minimum width.
5. **i18n (EN / BM / 中文)** — shapes the type system and every string from day one, and it is not
   cosmetic: PDPA s.7(3) makes **BM + English the statutory pair** for a data-protection notice
   (`docs/ops/legal/client-ai-authorization-letter-template.md:63`), and the watermark policy is keyed
   by locale with **a missing locale REFUSING the render** (`reporting-agency-design.md:326-333`).
6. **Accessibility bar** — the floor is already law (contrast, keyboard operability, focus management,
   **confidence as shape + label, never hue alone and never a bare number**,
   `docs/design/PRODUCT_DESIGN.md:83`). Rule how far **above** the floor to aim, and which become CI
   gates.
7. **What "done" looks like per journey** — the acceptance bar for each §5 row, in the owner's words,
   before you build it.

**Standing rules that bind you regardless of any ruling:** `main` is PR-only (constraint 3) · never
commit a credential (4) · every dispatch pins an explicit `model`, omission silently inherits Fable
(5) · the four firms are not interchangeable and BELCORT is the operator firm (13, as rewritten by
ADR-0075) · never weaken a security mechanism for testing convenience (14) · never touch the frozen
`workflow` / `graphile_worker` / `spike` schemas (15) · workflow bodies are immutable once deployed
(9). **And the one that governs every screen: the UI never invents a number, a verb, a receipt or a
link. If the DB did not return it, the screen says so honestly.**

## 9 · Merging back into this repo

1. **Branch **frontend/web**.** All work lands there; `main` is PR-only (`AGENTS.md` constraint 3).
2. **Docs-only plan PRs first.** Land the as-understood summary, the recorded grill rulings and the
   build plan under `docs/plan/active/` — these take the **single-lane docs review** (ADR-0069, fenced
   by the CI path classifier, never by your say-so) and give the next reader a resume path that does
   not depend on your session. Also in your **first PR**: true `docs/design/DESIGN_SYSTEM.md:6-8`'s
   false shadcn/Tailwind claim.
3. **Code PRs take the full ADR-061 ladder — uniformly**; intensity does not tier by blast radius.
   **A PR that changes judgement logic gets an independent review pass before merge** — a guard, a
   disambiguation, a refusal branch. Your fail-closed renderer and your CLR/status error
   classification are judgement logic.
4. **Land small and continuously**, inside the repo's CI gates from day one — a large out-of-tree
   branch collides with the parity, a11y and honest-state gates all at once. **Replace crude doors in
   place** as each Track-A lane lands (§0.8): same verb, no new gate.
5. **The cutover PR** retires `apps/dashboard` and the Cloudflare **Pages** deployment, repoints the
   proxy to the Workers build, and moves the dashboard suite's coverage onto apps/web equivalents.
   Ceremony-grade: run it from merged `main`, never from a branch, and write the as-run record.
6. **After any PR touching the pipeline or a closed drill, run `gh workflow run ci.yml` by hand** —
   the closed-wave drills and the frontier matrix are weekly-sweep + manual-dispatch only (ADR-0073;
   digest law 77, `docs/adr/README.md:470`). **Update `PROGRESS.md`** — it is the state authority; no
   handoff or plan doc substitutes for it.

## 10 · Claims marked UNVERIFIED

1. **The Cloudflare Workers / OpenNext capability list in §0.3** — **VERIFIED by the orchestrator on
   2026-08-23** against <https://opennext.js.org/cloudflare> and
   <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>: "All minor and patch
   versions of Next.js 16 and the latest minors of Next.js 14 and 15"; App Router, SSR, SSG, ISR,
   Middleware, Server Actions, Response streaming, Image optimization, PPR, `'use cache'` listed as
   supported; "Node Middleware introduced in 15.2 are not yet supported"; Node.js runtime only (no Edge
   runtime); Worker size 3 MiB free / 10 MiB paid, compressed; "Windows full support is not guaranteed"
   — build in WSL/Linux CI. **Re-verify via context7 on the day you pin versions** (pages change).
2. **Whether the owner holds a Resend account or a verified sending domain** — not established. §0.5
   settles the policy, not the provisioning.
3. **`ui-ux-pro-max`, `awesome-design-skills`, `gsap-skills`, a shadcn MCP server, a Mobbin MCP** —
   absent from the roster of the session that wrote this; existence under those exact names and
   installability in a Codex session are unverified.
4. **Whether a DB verb exists for line reorder / re-date, or for an atomic bulk approve** — no caller
   exists in the dashboard and no design names one. Treated as NO VERB (§5): an absence-of-caller
   inference, not proof of absence in the DB.
5. **Whether the runtime can accept a new `activity` SSE frame without a frozen-workflow change** —
   the AG-UI research places the translation in `packages/runtime/src/streamRoute.ts`; this lane did
   not read that file's frame-emission path to confirm it.
6. **Post-cutover ownership of `apps/dashboard`'s 60+ test files** — §9.5 states the intent; no repo
   text ratifies the disposition of each suite.
7. **`docs/design/DESIGN_SYSTEM.md:6-8` vs `apps/dashboard/package.json`** — the two contradict. The
   package.json is treated as truth (it is the machine-checked artifact) and §0.6 rules the forward
   direction; the doc is still uncorrected in the tree as of 2026-08-23.
