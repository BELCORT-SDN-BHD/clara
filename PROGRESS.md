# Clara — progress
The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

**⇢ 2026-09-05 — THE REPAIR SESSION LANDED. NOTHING IS DEPLOYED YET.** The session the owner opened
at ≈09:00 MYT on 2026-09-04 ran to ≈17:00 MYT on 2026-09-05 and put **eighteen pull requests,
#543…#560**, through the ladder against issue **#541**'s authenticated e2e audit, the owner's own
UIUX flaws list and the beta handover's rows. **All eighteen are merged**, the last three on
2026-09-05 — #556 `autoDraft` v10 at 09:19Z, #557 firm and client home at 12:04Z, #559 the rulings
docs at 12:55Z. Read a PR's verdict from
`gh pr list --state merged --search "merged:>=2026-09-04"`, never from this paragraph.

**What landed, by area** (merge shas from `gh`, times converted from the UTC stamps at UTC+8):

| area | PR | merge | what it closed |
|---|---|---|---|
| entry / signup | #544 | `e9dbf094` | confirm-code link, honest pending copy, password policy, Stripe key-class gate, `customer_email` — H-35 · H-38 · CB-AE2E-003/006 |
| statement lane | #545 | `a2d098f2` | `statementFacts` **v3** — period from the statement date with a stated basis, witness→roster institution normalisation, task settlement on step failure — H-02 · H-03 · H-05 |
| journals | #548 | `144f0a8f` | entries data table, one Approve plus a Posted legend, clarification question text — CB-AE2E-021/022 · H-32 · H-33 · 裁-187 |
| onboarding | #546 | `aa5fef4a` | typed answers, settled receipt, scope invalidation, add-client, dialog scroll — H-26/27/28/29/30/50/51 · CB-AE2E-008/023/024 |
| chat rail | #547 | `d1b12f9b` | Enter-to-send, thread menu, typed bank act and pack cards, tool-call status — H-24 · 裁-117 · C6 |
| firm space | #550 | `c21f26c3` | needs-you what/why/next/when, agent task detail, capability-gated admin controls (**the high-stakes threshold control removed, 裁-187**) — CB-AE2E-014/018/025/026/033 · H-25 |
| bank / close / registers | #549 | `90b59cc1` | statement header pair, dialogs that stay open on refusal across 15 wrappers, four opening gates, restart close — H-06 · H-11 · H-16 · H-34 · H-54/56 · seven CB-AE2E rows |
| shell | #553 | `80e42bf7` | responsive firm shell (drawer, overflow nav, overlay rail), favicon, rank-shaped ⌘K — CB-AE2E-019 · H-31 · C-43 |
| documents | #555 | `6bad969b` | MIME-gated open-in-new-tab plus report-only CSP, page-overlay evidence viewer, tiered extraction — **C-07** · D1/D2/D3 · CB-AE2E-022 |
| documents e2e | #560 | `2f736758` | the overlay measurement reads the overlay layer, not the first hidden svg |
| runtime ops | #558 | `2060c762` | per-lane boot probe, the pool error contract (裁-149 · **ARCHITECTURE §4.3**), pooler CA in the image, `/build-info`, classifier recall harness — H-48 · C-04 · H-43 · CB-AE2E-035 · H-04 |
| DB — close and documents | #551 | `d28b6a75` | document-kind codeability table, honest close gates, classification resolved on `set_document_kind`, `apply_coa_template` refuses an open plan (**裁-193**) — H-12 · H-22 · H-29 · H-53 · H-55 |
| DB — reads and doors | #552 | `5007bbcc` | own DPA signature, client egress state, firm timeline, chat archive, counterparty identifiers, build frontier, DR canary registry — CB-AE2E-007/018/035 · H-09 · H-49 |
| docs | #543 · #554 | `dbaf9056` · `0f2f44de` | 裁-186…190 and ADR-0078; 裁-191 · 裁-192 |
| autoDraft v10 | #556 | `9ed75f49` | exact constraint-name error map (no masked CLR23), kind-scoped alias unique, owner-floored sales-lane activation — H-17 · H-19 · CB-AE2E-012 |
| firm + client home | #557 | `127c4513` | firm home dashboard and client workspace situation board, tax tab — E-1 · F-1 · CB-AE2E-032 |
| rulings docs | #559 | `f57f6af4` | 裁-193…197 and the 裁-149 clause-2 erratum |

**The database sets.** `packages/db/migrations` now carries **0165…0175** on `main` (eleven files,
counted by `ls`), with **0176** riding #556. **SIX bodies owe a D1 write-quiesce window** across five
of those files, named in their own headers: `clara.set_document_kind` (`0169`),
`clara._gate_outstanding_items` (`0172`), `clara.apply_coa_template` (`0173`),
`clara._tf_chat_session_update()` and `clara._tf_counterparty_update_0011()` (`0174`), and
`clara._persist_statement_core_v2` (`0175`, which asks for the `statement_facts` lane to be quiesced
specifically). `0166`, `0167`, `0168`, `0170` and `0171` state in their headers that no window is
owed.

**What it proved.** The three sources reconciled into one register and every item was anchored to
code before a lane opened, so the fixes landed against measured coordinates rather than descriptions.
**裁-187's abolition is now visible in the product** — the Admin high-stakes threshold control is
gone (#550) and the journals surface shows one Approve (#548). **The statement lane, the coder and
the close gates — three of the four failures the 裁-184 walk found — have code on `main`.**

**What it did NOT do. NOTHING IS DEPLOYED.** No as-run record under `docs/plan/completed/` carries a
2026-09-05 date, and the deploy ceremonies of **裁-189** have not run — **裁-198 opens them the
evening of 2026-09-05**, once the chain has landed (it has) and a hand-dispatched sweep on the FINAL
`main` is green on all 13 jobs, read from `gh run view --json jobs`. The order is fixed and it is
not optional:

1. **The DB ceremony for `0165`…`0176`** from merged `main`, with the six D1 write-quiesce bodies
   above. **裁-198's shape: backup first and verified · ONE write-quiesce window with the runtime
   STOPPED, not six narrow ones · per-step rollback recorded step by step.** Stopping the runtime is
   what makes `0175`'s "quiesce the `statement_facts` lane" unconditional. **`0174` adds
   `clara.chat_sessions.archived_at` and widens the chat-session update trigger, and `apps/web`
   already ships code that reads it**
   (`apps/web/components/clara/ClaraThreadMenu.tsx`, `apps/web/lib/clara/useActiveThread.ts`) —
   **so the Worker must not be promoted before this ceremony, or
   every session list 500s.**
2. **Runtime v75** from merged `main`. It clears H-01, the v71↔schema skew that logs every ~2 s.
   **Gated by 裁-199's floor:** per-KIND recall with the new prompt ≥ the live prompt's, kind by kind,
   **and zero new rows the new prompt gets wrong at confidence ≥ 0.8 — one blocks the image.**
3. **The web Worker**, last. There is no repoint rollback (裁-156); a broken Worker is fixed forward
   by re-promoting a walked version.

**Nine tickets are queued and not started**, in the order the orchestrator will open them: **(1)**
DB-D, H-21 the onboarding interview's captures projection · **(2)** the consent lane (裁-186, the
firm-level DPA-stage declaration) · **(3)** DB-C, the wall-removal lane (裁-188) · **(4)** L10
`chatTurn` v18 (H-07 · H-08) · **(5)** the web copy sweep, which runs last among the web lanes ·
**(6)** reporting H-15 · **(7)** the required browser-smoke CI job (裁-192, CB-AE2E-036) · **(8)**
H-47, the re-migration preflight and runbooks · **(9)** CB-001, the Terms document kind, which needs
an owner sitting. **Then the three chat tickets of 裁-197, in the ruled order (iii) → (ii) → (i):**
chatTurn tools and cards for the five gaps ≈1.5 units → real readers for the nine ids-only part kinds
≈1 unit → provisional streaming text in the rail ≈0.7 unit.

**The owner's own list, unchanged and still owed:** the favicon assets · the Stripe dashboard edits
(H-37 the product description, H-39 the duplicate webhook endpoint) · the two Supabase auth decisions
(H-40) · the Resend cap read (H-45) · the two role-password rotations (H-42, 裁-178 accepted) ·
**DPA v2 and the lawyer's pass** (H-36, 裁-125/166).

**⇢ 2026-09-04 ≈09:00 MYT — THE REPAIR SESSION IS OPEN on the owner's ask.** Three sources — the
owner's UIUX flaws file, issue **#541** (the authenticated e2e audit, 36 defects) and the handover's
own rows — are being unified into one register, each item anchored to code by a mapping workflow
before any lane opens. Five rulings opened it, 裁-186…190 in
[`mohe-grill-rulings-2026-09-04-pm.md`](docs/plan/active/mohe-grill-rulings-2026-09-04-pm.md),
minuted as [ADR-0078](docs/adr/0078-consent-declaration-attestations-abolished-rbac.md): consent is a
firm-level declaration made once at the DPA stage; every attestation ceremony and maker-checker wall
is abolished with basic RBAC as the only human gate and automatic receipts kept; the wall-removal DB
lane runs this session after the P0 block; the two production deploys (runtime v75, the web Worker)
are the lead's as the owner's delegate; native lanes only. The posture below is the beta's and still
holds.

**⇢ The beta-live posture block that stood here — the 裁-185 GO paragraph and the whole "What ran,
and what it proved" bullet list — moved BYTE-FOR-BYTE to
[`progress-archive-2026-09-part1.md`](docs/plan/completed/progress-archive-2026-09-part1.md)** at
this truing (md5 `50f77696976ce97534407334231a8206`, 80 lines, 7294 bytes, computed on both sides of
the move and verified present there before this file lost it). It is still exactly right about
2026-09-04 ≈06:15 MYT; it is no longer a statement of today's posture. **Beta remains LIVE and
CLOSED** at `https://app.clarabook.com` for BELCORT and owner-invited testers — 裁-185 is not
reversed, and the closure is still an OPERATING posture, not a technical wall.

## Lanes

| lane | state |
|---|---|
| every build lane of the repair session | **closed** — all eighteen PRs (#543…#560) are merged; the per-lane table is in the session log below, not here |
| the DB ceremony for `0165`…`0176` (裁-189) | **queued, and it blocks both deploys** — six D1 write-quiesce bodies |
| runtime v75 (裁-189) | queued behind the ceremony, gated on the classify recall run (#558 MAJOR-3) |
| the web Worker promotion (裁-189) | queued last; no repoint rollback (裁-156) |
| the nine queued tickets, then 裁-197's three chat tickets | not started; the order is in the posture block above |

The sprint's build closed on 2026-09-03,
the beta-live e2e ran on 09-03/09-04, and every lane in the old table was `merged` or `ceremonied` —
**that table was moved verbatim to
[`docs/plan/completed/progress-archive-2026-08-part7.md`](docs/plan/completed/progress-archive-2026-08-part7.md)**
(md5 `20a52f66ade141634b0fe9441d75e675`), which is the only place the per-lane build history of Wave F
and the beta sprint is written down. That table is the beta sprint's closed lanes; the live lanes are in the table above.

## Next

**The owner reads the handover's Backlog and Known issues and picks.** The recommended order is
[`beta-handover-2026-09-04.md`](docs/plan/active/beta-handover-2026-09-04.md) §E, and its first block
is the only one that gates anything:

1. **The P0 block — MOSTLY CODED, NONE OF IT SERVING.** The repair session wrote code for H-02 ·
   H-03 · H-05 (#545) · H-06 (#549) · H-35 · H-38 (#544) · H-43 · H-48 · H-04's harness (#558) ·
   C-07 (#555) · H-17 · H-19 (#556). **Every one of them reaches a user only after the
   three deploy steps in the posture block**, so the P0 block is now a DEPLOY problem, not a build
   problem. **Still unbuilt in P0:** H-18 the client-consent surface, which 裁-186 re-shaped into
   the firm-level DPA-stage declaration · **DPA v2** (H-36) and the Stripe product-description edit
   (H-37), both owner acts · the two password rotations (H-42, 裁-178 accepted) · H-47 the
   re-migration preflight and runbooks. **H-01 is closed by the v75 deploy itself.**
2. **The walk's P1 product rows**, starting with **H-21** — projecting the onboarding interview's
   captures, which alone unblocks four separate symptoms.
3. **The pre-上市 roadmap in its ruled order** (裁-148 · 裁-150): the pricing sitting (裁-58, which
   everything downstream waits on) → the billing TIER tranche + the AI usage ledger (裁-144) → the
   lawyer's pass over the DPA, the beta terms and the consent text (裁-125) → the real-money switch
   with Stripe live mode, KYB and the NON-ZERO checkout walk (裁-126/148) = **上市**.
4. **Hygiene** — handover [part 2](docs/plan/active/beta-handover-2026-09-04-part2.md) §C.3 and §C.5.

**One process item owed:** 裁-171 ordered the twenty knowingly-open items read aloud item by item at
the launch sitting. The 裁-184 walk consumed the sitting and **the reading did not happen**. The list
is ENUMERATED at
[`launch-sitting-record-2026-09-04-part1.md`](docs/plan/completed/launch-sitting-record-2026-09-04-part1.md)
§3, and every item is also a row in the handover's parts 1–3 — by NAME, not by line. The reading
itself is a next-session item.

## Backlog

**Every row lives in [`beta-handover-2026-09-04.md`](docs/plan/active/beta-handover-2026-09-04.md)
and its [part 2](docs/plan/active/beta-handover-2026-09-04-part2.md) and
[part 3](docs/plan/active/beta-handover-2026-09-04-part3.md), each with what was measured,
why it matters, the fix shape, a size guess, an owner, a ruling number and a tier.** The rows below
are the index. The pre-truing text of both sections is archived verbatim in
[`progress-archive-2026-08-part8.md`](docs/plan/completed/progress-archive-2026-08-part8.md).

- **H-43 and H-48 — THE CODE SHIPPED IN #558 (`2060c762`, merged 2026-09-04). What is left is an
  OPERATOR CEREMONY, not a build.** On `main` today: the per-lane boot probe
  (`packages/runtime/lib/lane-probe.mjs`, whose own line 128 calls it "the full seven-lane roster",
  surfaced on `/ready` under `checks.pools` at `packages/runtime/lib/health.mjs:361-372`) · the TLS
  boot assert (`packages/runtime/lib/tls-ca.mjs`) · the build-info route
  `apps/web/app/api/build-info/route.ts` · the
  classify recall harness (`packages/runtime/scripts/measure-classify-recall.mjs`). **H-48 is closed
  by code and opens for real at the v75 deploy.** **H-43's remainder is the ceremony in
  [`runtime-tls-verify-full-ceremony.md`](docs/ops/runtime-tls-verify-full-ceremony.md): flip the
  FIVE runtime DSN secrets that take the pin in that ceremony to `verify-full`** — three more take
  it whenever their own operator ceremonies run, and `DATABASE_URL` is checked by the code but is
  not a deployed secret. The 2026-09-04 posture block keeps its historical wording; these rows are
  the current state.
- **NEW, from the 2026-09-04→05 repair session — the queue, in order:** **Q-01** DB-D, H-21 the
  onboarding interview's captures projection · **Q-02** the consent lane (裁-186, the firm-level
  DPA-stage declaration; re-shapes H-18) · **Q-03** DB-C, the wall-removal lane (裁-188 — every
  attestation ceremony and maker-checker wall out of the door bodies, receipts in) · **Q-04** L10
  `chatTurn` v18 (H-07 · H-08) · **Q-05** the web copy sweep, last among the web lanes · **Q-06**
  reporting H-15 · **Q-07** the required browser-smoke CI job (裁-192 · CB-AE2E-036) · **Q-08** H-47
  the re-migration preflight and runbooks · **Q-09** CB-001 the Terms document kind (owner sitting).
  **Then 裁-197's three, ruled order:** **Q-10** chatTurn tools and cards for the five gaps (≈1.5) ·
  **Q-11** real readers for the nine ids-only part kinds (≈1) · **Q-12** provisional streaming text in
  the rail (≈0.7).
- **NEW — follow-ups the lanes and reviews surfaced, each needing an owner and a next step:**
  **F-01** `clara.sst_threshold_schedule` has no `clara_authenticated` grant, so the Tax tab's
  turnover-classification control cannot offer the statutory thresholds (裁-196 d; a SELECT grant or
  a definer read, DB-D) · **F-02** the requeue-once lane (裁-195; copy
  `readmit_autodraft_after_withdrawal`, ≈0.5) · **F-03** the 裁-196 (a)+(b) runtime follow-up —
  refuse to boot on `sslmode=no-verify`, and fail `/ready` for a CONFIGURED-but-unreachable
  non-runtime lane only (≈0.5, L9) · **F-04** the classifier engine-id `:v2` bump, which needs a DB
  lane and an in-flight transition posture because `enqueue_document_processing` hard-codes `:v1`
  (#558) · **F-05** the whole-prefix claim on the PostgREST rpc route in
  `apps/web/e2e/fs4-checkout-mock.mjs`, held closed today only by `workers: 1` · **F-06**
  `apps/web/app/globals.css` is above the 500-line write hook and the next writer must split it
  first.
- **P0 — before the first EXTERNAL applicant (15 rows), handover §C.1:** H-01 the v71↔DB skew
  (`reconcile_autopost_rules`; a new image, v75 or later) · **C-07 the XML `blob:` open with no MIME
  gate and no CSP (裁-175)** · H-02 Maybank headers state no period bounds · H-03 the
  witness→`bank_institutions` code normalisation · H-05 the stranded `statement_facts` task ·
  H-06 the "Enter a statement" form omits the institution/account PAIR · H-17 `autoDraft_v9`'s masked
  CLR23 · H-18 the client-consent grant has no web surface · H-35 no link to /auth/confirm ·
  H-36 the DPA v1 placeholder · H-37 ruling numbers on the Stripe checkout page · H-42 the two
  unrotated role passwords (裁-178, accepted risk) · H-43 verify-full TLS on the six lane DSNs
  (裁-179) · H-47 a live re-migration flips ceremonied roles to NOLOGIN and `0154`'s absolute role
  census blocks it · H-48 no per-lane DSN probe at boot.
- **P1 — before 上市, the walk's own rows, handover §C.2:** H-04 the classifier does not recognise
  bank statements · H-07/H-08 the close-prep chat lane cannot read a close run, and says the wrong
  reason · H-09 the payer-identifier refusal has no UI to satisfy it · H-11 no "Begin close" after an
  abandon · H-12 `uncoded_documents` false-fails on a filed statement · H-15/H-16 zero report
  templates and a chat export tool that does not exist · H-19/H-20 `set_sales_lane_activation` and
  `add_client_identifier` have no surface · H-21 **the interview's captures are never projected** ·
  H-26/H-27 `[object Object]` and raw capture JSON on screen · H-30 the apply-chart dialog cannot be
  scrolled to its button · H-38 checkout does not carry the applicant's email · H-39 a duplicate
  Stripe webhook endpoint · H-40 two undecided Supabase auth settings ·
  H-45 the Resend cap was never read · H-46 the Mail gate is not formally certified · H-49 DR probe
  `4.9` is UNPROVEN IN THE FIELD (裁-172).
- **P1 — already ruled before the launch night, handover §C.1's second table:** C-01 the pre-上市
  roadmap · C-02 the billing tier tranche + the AI usage ledger (AI is UNMETERED in beta) ·
  C-03 the C-2 operator screen (裁-147) · C-04 the pool error contract (裁-149) · C-05 G1 PR-2
  (裁-165) · C-06 the beta Terms of Service (裁-129/166) · C-08 the ten 裁-176 ports and fixes · C-09 the checkout/webhook follow-ups ·
  C-10 `livemode` stored-never-read and the stranded-payment path · C-11 SSE re-authorisation ·
  C-12 `/ready`'s hard storage gate (裁-61) · C-13 the archived backend queue (裁-123) · C-14 the
  overdue R2 restore drill (裁-163) · C-15 the bigint wire boundary (裁-71⑨) · C-16 single-machine Fly
  with no HA and no external alerting.
- **P2 — hygiene, handover part 2 §C.3 · §C.4 and part 3:** **22** web/product nits from the walk
  (H-10 · H-13 · H-14 · H-22 … H-34 · **H-44, the `held_outbox` 6 now read and explained as 裁-165's
  disabled-source counter** · H-50 … H-56) · the full CARRIED registry **C-17 … C-88**
  (database, runtime, frontend, reporting/close/tax, ops/DR/security, harness/CI — **C-77 … C-88 are
  twelve rows in part 3 that carry the fourteen a fresh-context review found missing from the first
  cut — ten as rows, four as named dispositions**) ·
  and **§C.5, the seventeen documentation truings the rulings ordered that this truing did NOT
  execute** — the Wave-G checklist and `docs/ops/DR.md` lines from 裁-161/162/169/170/177, the T-K
  wrangler comment, the `0161`→`0163` citations, and the rest, each naming its file.
- **The owner's own acts:** the two `clarabook-frontend` recut PRs (裁-168) · the Stripe dashboard
  edits (H-37, H-39) · the two Supabase auth decisions (H-40) · the Resend cap read (H-45) · the Mail
  certification call (H-46) · the elevated-shell worktree removal and the WSL `.vhdx` compaction
  (裁-173) · destroying his own `codex-e2e-rate-wall-sleeper` machine on `clara-backup`.

## Known issues

Same index rule: the detail is in the handover. What a reader most needs to know today:

**New this session (2026-09-04→05), each measured on `main` at `5007bbcc`:**

- **NOTHING THE SESSION BUILT IS SERVING.** Fifteen PRs are on `main` and the deploy ceremonies have
  not run. The single ordering hazard that can break production: **`0174` adds
  `clara.chat_sessions.archived_at`, and `apps/web` already ships readers for it** — promote the
  Worker before the DB ceremony and every chat session list returns 500.
- **No door can close an open question whose document filing was RETIRED** (review-551 on #551).
  `retire_document_filing` never touches `open_questions`, and both `resolve` and
  `dismiss_open_question` are walled by `_active_document_filing`; `0169` now makes the same orphan
  block `set_document_kind` too — a correct refusal that widens a pre-existing dead end by one door.
  Needs a small door (`dismiss_orphaned_question`, or a lift inside `retire_document_filing`).
- **A chart planted mid-interview survived a cancelled client and blocked every later apply forever**
  (`0173`'s own header, lines 98–115). Until that rung the door consulted the onboarding plan
  nowhere, so a chart could be applied mid-interview and, if the client was then CANCELLED, archived
  holding it, with `chart_not_empty` refusing afterwards. 裁-193's rung closes the path forward;
  **any client already in that state predates the fix and is not repaired by it.**
- **`clara.sst_threshold_schedule` has no firm-user read** (裁-196 d) — the Tax tab's classification
  control can only offer the client's own watch groups.
- **The classifier engine id cannot be bumped to `:v2` without a DB lane** (#558) —
  `enqueue_document_processing` hard-codes `:v1` at `0123:1128`, `classify_document` matches it
  exactly at `0016:3225-3228`, and `0102:447` byte-pins it. A bump today strands every classify task.
- **Three e2e-harness rules the CI-E2E lane (裁-192) must carry, or the browser gate ships blind:**
  **(i)** the table primitive has **no browser coverage** — no walk face renders a read-only table
  that scrolls, and axe applies `scrollable-region-focusable` only to a region that actually scrolls,
  so `apps/web/components/ui/table.tsx`'s `tabIndex` is unproven in a browser · **(ii)** the mock
  **body-consumption** order hazard — `bank-close-registers-mock.mjs:206` reads the request body
  unconditionally on every PostgREST rpc POST, and only hook ORDER keeps the later lanes alive; the
  fix is one memoising `readJson` plus a parse-after-match cell · **(iii)** the **selector-luck**
  class, found 2026-09-05 on `documents-viewer-walk.spec.ts:198` — a generic `svg[aria-hidden='true']`
  picked a breakpoint-hidden icon on one tree and the overlay on another with identical code, so the
  cell passed by luck; every smoke spec must use a subject-scoped locator and assert it resolved
  before measuring.
- **`packages/runtime/README.md` is stale against #558.** Grepped on `main` at `5007bbcc`, it names
  `packages/runtime/lib/tls-ca.mjs` exactly once — line 398, about the in-image CA path and its
  drift cell — and names **none** of the per-lane boot probe, the build-info route, the recall
  harness, or the
  new `/ready` shape that reports `checks.pools`. A reader following that README today will not
  learn the runtime grew a boot probe. **Owner: the 裁-196 runtime follow-up lane**, which is
  already touching the same files.
- **The H-04 classify gate's floor is NON-REGRESSION, not a number** (**裁-199**, which closed this
  the same day it was filed). Runtime v75 ships when per-KIND recall with the new prompt is ≥ the
  live prompt's, **kind by kind and never as an aggregate** — an aggregate can rise while bank
  statements collapse, the exact H-04 failure the walk found — **and when no row the new prompt gets
  wrong at confidence ≥ 0.8 was right under the live one; ONE such case blocks the image.** Do not
  mistake `packages/runtime/scripts/measure-classify-recall.mjs`'s `CONFIDENCE_GATE` of `0.8` for a
  pass mark: it is the per-row bar `clara.classify_document` itself applies, at the script's own
  line 63. **No absolute floor exists yet, by ruling** — the first run against the real corpus mints
  the baseline and the owner sets a number then.
- **`apps/web/README.md` has no routine Worker redeploy or version-promote runbook.** It documents
  the `wrangler.jsonc` bindings and the secrets posture, and it carries no deploy or release
  section at all — the only walked procedure anywhere is the FS-10 first-deploy as-run, which is a
  one-time cutover record, not a repeatable runbook. **The v75 and Worker ceremony as-run creates
  it**; until then a promote is done from memory, and there is no repoint rollback (裁-156).
- **Two stale in-code claims, both measured:** `apps/web/components/firm/identifier-promotion-row.tsx:7`
  still cites the pre-numbering name UNNUMBERED_proposal_basis_resolved.sql, which has since been
  numbered `packages/db/migrations/0143_proposal_basis_resolved.sql` ·
  `apps/web/app/(firm)/clients/[clientId]/layout.tsx:65-66` says "22 call sites in 20 files on this
  tree, **7** of them client-altitude" — the 22 and the 20 still measure true, but the
  client-altitude count is **9**: four `<PageHeader>` call sites in pages under the client route plus
  five in workbench components that render only there (close, documents, journals, reports, tax).
  The comment undercounts because it filtered by route path and the five workbenches live under the
  components tree.

- **The serving image and the schema disagree** (H-01) — `reconcile_autopost_rules` is called by v71
  and defined nowhere; the autopost reconcile belt is dead and the log storms every ~2 s. **A new
  image, v75 or later — v72–v74 are the night's secrets-import releases on the v71 image.**
- **Bank statements cannot be ingested by either AI path** (H-02 · H-03 · H-04 · H-05), and **the
  human "Enter a statement" form has never been reachable** (H-06). A firm can get a statement in
  only through the DB door today.
- **The unattended coder refuses every sales invoice** with a masked CLR23 and opens a human question
  no answer can satisfy (H-17). The CHAT path codes the same document correctly.
- **A firm cannot enable AI processing for a client through the product** (H-18) — the grant and the
  per-purpose activation are dark doors.
- **The onboarding interview's captures never reach the database** (H-21) — no `client_identifiers`,
  no `client_facts`, no `clients.fy_end_month`, no `bank_accounts`. Four separate symptoms, one cause.
- **Two role passwords sit unrotated in this session's transcript** by ruling (H-42, 裁-178), and
  **all six runtime lane DSNs run TLS with the certificate unverified** (H-43, 裁-179).
- **The DPA in force is the v1 placeholder** (H-36), and **the Stripe checkout page shows internal
  ruling numbers** (H-37).
- **DR probe `4.9` is UNPROVEN IN THE FIELD** (H-49) — its subject died with the schema by ruling and
  the verify script hard-codes the ids.
- **The 500-line ceiling is a WRITE-BLOCKING PreToolUse hook, and FOUR documents this session will
  touch again are at or near it — measured on this branch at the final truing, 2026-09-04:**
  [`docs/adr/README.md`](docs/adr/README.md) **499** (its ruling rows now live in
  [`README-rulings-2026-09.md`](docs/adr/README-rulings-2026-09.md), which has room),
  [`docs/adr/README-log.md`](docs/adr/README-log.md) **499** (445 before the launch night's five
  dated minutes), `docs/plan/active/checkout-gate-design-part2.md` **500**, and the newest ruling
  ledger [`mohe-grill-rulings-2026-09-04.md`](docs/plan/active/mohe-grill-rulings-2026-09-04.md)
  **480**. **That is a SCOPED list, not a repo census** — measured the same way, the repo holds
  **20** tracked `.md` files at exactly 500, **8** at 499 and **31** already ABOVE 500 (historical
  records the hook grandfathers because nothing rewrites them). **A 501st line is refused AT THE
  WRITE, so the next writer of ANY file archives or splits before it adds; check the count first.**
- **Host and worktree hygiene — the census is a WALK, never a list (裁-173).** Measured at 06:20 on
  2026-09-04: **12 worktrees under the .claude/worktrees directory remain from merged lanes, three of them
  LOCKED**; the WSL `.vhdx` compaction is owed again (~50 GB reclaimable at the last measure).
  **Re-walk with `git worktree list` before touching anything** — the count and the names move every
  session. **Removal is junction-UNSAFE by default:** never `robocopy /mir` a worktree without
  `/XJ`, and `git worktree remove --force` and `Remove-Item -Recurse` are not junction-safe on this
  host either (2026-09-01: 2000 tracked files deleted under the main checkout; 2026-09-02: the main
  checkout's `apps/web/node_modules` emptied). Unlink every reparse point FIRST, re-walk to prove none
  remain, THEN remove; post-flight `git status` on main plus `ls apps/web/node_modules/next`. The
  locked ones need an elevated shell after a Claude Code restart, then `git worktree prune`. Two
  standing host facts: the OpenNext/Workers artifact must be BUILT ON LINUX, and **WSL idle-terminates
  without a Windows-side holder** — plant a detached keeper before any port-dependent WSL work.
- **`0154`'s cluster-wide role census, the CI half — CLOSED BY MEASUREMENT.** #525 derived the roster
  from `packages/db/deploy/roles-bootstrap.sql` and pinned it, and four hosted sweeps since
  (33712469717 · 33723755257 · 33757365379 · 33781966143) came back 13/13 green including
  `closed-wave-drills`. **The LIVE-cluster half is open as H-47.**
- **RISK 50, the Mail gate — TRUED.** Transport, sender identity and **delivery of a real six-digit
  signup code to a NON-team address** are all proven (FS-10 S21, after an OTP-length fix: the project
  carried `mailer_otp_length` = **8** against the app's six-digit form). Time-to-arrive and the From
  header were asked and **are not recorded**, and FS-11's own code went to a TEAM address — so the
  ceremony's certification line is the owner's call, carried as H-46.
- **The confirmation login-CSRF finding — TRUED.** The always-refusing stub is gone; the wall is wired
  for real by FS-4 C-6 Lane B (#517) and answered in the field (one attempt, accepted, 167 ms). What
  is carried is a **re-measurement** of the browser-identity half plus the `token_hash`-in-logs and
  replay siblings (handover part 2, C-63). **Closed in the same breath: the `__Host-clara-auth`
  HTTPS deployed-origin acceptance line** — the origin serves HTTPS on the Worker and the cookie
  landed in the field.

## Session log

*(Entries through 2026-08-21 are verbatim in `docs/plan/completed/progress-archive-2026-08.md` +
`-part2.md`; 2026-08-22…08-30-noon in `-part4.md` + `-part5.md`; the 2026-08-30-evening through
2026-09-03-small-hours entries in
[`-part7.md`](docs/plan/completed/progress-archive-2026-08-part7.md), moved across four earlier
truings to keep this file inside its cap. **At the FINAL clock-out truing on 2026-09-04 the
2026-09-03 entry and the whole `Lanes` table moved to `-part7.md`, and the whole `Backlog` and
`Known issues` sections moved to
[`-part8.md`](docs/plan/completed/progress-archive-2026-08-part8.md)** — all four byte-for-byte, each
md5 computed on both sides of the move and each verified present in its archive before this file lost
it. **At the 2026-09-05 repair-session clock-out the beta-live posture block moved to the first
2026-09 part,
[`progress-archive-2026-09-part1.md`](docs/plan/completed/progress-archive-2026-09-part1.md)** — 80
lines, 7294 bytes, md5 `50f77696976ce97534407334231a8206` on both sides.)*

- **2026-09-04→05 — THE REPAIR SESSION: EIGHTEEN PRs, TWELVE RULINGS, NOTHING DEPLOYED.** The owner
  opened it at ≈09:00 MYT on 2026-09-04 with three sources and one instruction — his own UIUX flaws
  file, issue **#541** (the authenticated production e2e audit, 36 defects, NO-GO) and the beta
  handover — and it ran into the evening of 2026-09-05. **Fourteen rulings, 裁-186…199**, opened and
  steered it: 186 consent becomes a firm-level declaration at the DPA stage and 187 abolishes every
  attestation ceremony and maker-checker wall in favour of basic RBAC (both **against the
  recommendation**, both minuted as **ADR-0078**, both dissents on file) · 188 the wall-removal DB
  lane · 189 the two deploys as the lead's delegate · 190 native lanes only · 191 two arguable
  document kinds are codeable · 192 the browser smoke becomes a required CI gate (amends 裁-86) ·
  193 the chart applies only after commit (against the recommendation) · 194 the 裁-149 clause-2
  premise correction, the first premise erratum this register has carried · 195 requeue-once · 196
  four readiness and grant items, (b) against the recommendation · 197 three chat tickets queued.
  **Every item in the register was anchored to code before a lane opened**, which is why the fixes
  landed against measured coordinates. All eighteen PRs are merged. **The evening added two more
  rulings:** **198** opens the DB ceremony for `0165`…`0176` that night, gated on the chain landing
  and a 13-job green sweep on the final `main`, in ONE write-quiesce window with the runtime
  stopped · **199** sets the classify gate's floor at NON-REGRESSION per KIND plus zero new
  confident-and-wrong rows, with no absolute number until the first real-corpus run mints a
  baseline. **Two session-limit cuts** (≈11:20 and ≈12:58 MYT on 09-04) stopped every running agent
  mid-flight; all were resumed from their transcripts with an explicit instruction to re-read their
  worktree before trusting their last command, and no lane lost work. **The lesson that cost the most:
  merging a docs PR in the middle of a code PR's CI cycle forces that PR to re-update and re-run** —
  under the "head must be up to date with base" rule, docs merge between code cycles or you pay a
  cycle. **The session ended with nothing deployed**, which is the state the next session opens on:
  the DB ceremony first, then v75, then the Worker.

- **2026-09-04 — BETA WENT LIVE, AND THE SPRINT SESSION CLOSED.** In one continuous sitting from
  22:10 MYT on 2026-09-03: **FS-10** built the OpenNext/Workers artifact in WSL, created the Worker
  `clara-web`, walked it on its preview through eight versions (catching that version H carried FIVE
  of six secrets — read, not assumed — and promoting **I** instead), proved the SSE body genuinely
  streams through the Worker (TTFB 1.83 s of a 6.05 s total, so 裁-151's fallback was never needed),
  and moved `app.clarabook.com` off Pages at **≈00:31**; the real-origin re-walk was clean, so the
  Pages project was deleted in the same sitting per **裁-156** and #540 merged as **`ba8e7d35`** with a
  13/13 sweep behind it. **FS-11** then dropped and rebuilt the whole `clara` schema — a staged drop
  after a single transaction ran out of lock slots, 159 migrations re-applied (through a `0154`
  role-census wall that a live cluster cannot pass without renaming a deploy-minted role), a
  circuit-breaker outage traced to the re-migration silently flipping every ceremonied role to
  NOLOGIN, and a TLS probe that found **four production lane DSNs running in PLAINTEXT** — and BELCORT
  was re-minted through the product's own signup → code → DPA → MYR 0 checkout door, with every
  Stripe event answering 200. The **裁-184 product walk** then ran the real thing on real Malaysian
  documents: a client onboarded through the in-thread interview, a chart planted, invoices OCR'd, the
  agent's witness reads matching the PDF exactly, a journal proposed by Clara and approved by the
  human, a bank line matched and settled, fifteen close gates evaluated live. **Six of eleven
  milestones passed; the statement lane, the unattended coder and the report path failed, and every
  failure was fail-closed with a receipt.** The owner ruled **裁-185** at ≈06:15: **GO, closed beta**,
  and asked for one complete list of everything to repair. Thirty-five rulings 裁-151…185 are in
  [`mohe-grill-rulings-2026-09-04.md`](docs/plan/active/mohe-grill-rulings-2026-09-04.md); the list is
  the handover. **Nine of the fifteen P0 rows were found only because the walk used the real product
  against real documents on the live estate — a mocked e2e would have found none of them.**

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then lanes,
then anything that moved into or out of the backlog. It is cheap to update and expensive to
distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever after, which costs
far more than the updates ever did.
