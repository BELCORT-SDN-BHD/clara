*Part 3 of 6 of the FS-11 Wave-G factory-reset as-run (2026-09-04) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `fs11-wave-g-asrun-2026-09-03-part2.md` · Next: `fs11-wave-g-asrun-2026-09-03-part4.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*


`[ ]` pre-first-render `report_artifacts` count = **0**.  as run: ____________
`[ ]` first manifest `extraction_tool` names `-raw`.  as run: ____________

**15.5 · [O eyes] THE ELEVEN NAMED MILESTONES** (裁-164 part 1).

**The denominator is the ELEVEN enumerated milestones plus step 16's product walk. Nothing is
invented to reach sixteen.** The "sixteen-step" label appears in six places and **the list never
reaches sixteen**; the only enumerations are the two identical eleven-arrow chains at
`docs/plan/active/frontend-sprint-handoff-2026-08-31.md:287-291` and
`docs/plan/active/dashboard-web-capability-diff-2026-09-02.md:36-40`. **NOT IN REPO: the remaining
five are not enumerated anywhere.** Record the honest count.

| # | milestone (verbatim from the repo) | where it is walked | `[ ]` | as run |
|---|---|---|---|---|
| 1 | signup | step 13 | `[ ]` | |
| 2 | checkout (test price, test card) | step 13 — **MYR 0, sandbox, per 裁-148** | `[ ]` | |
| 3 | firm born | step 13 | `[ ]` | |
| 4 | members invited | `/admin/members` + the Resend invite courier (`apps/web/lib/members/invite-mail.ts`) | `[ ]` | |
| 5 | client onboarded through the in-thread interview | step 16 line 1 | `[ ]` | |
| 6 | documents posted unattended | step 16 line 2 | `[ ]` | |
| 7 | bank matched in chat | step 16 lines 3–5 | `[ ]` | |
| 8 | fiscal year opened | step 16 line 5's neighbourhood — **surface not separately measured in the prep** | `[ ]` | |
| 9 | year-end closed with human keys | step 16 line 5 (law 71's human-only four) | `[ ]` | |
| 10 | management-accounts PDF downloaded | step 16 line 6 | `[ ]` | |
| 11 | FY2 opened | **not separately measured in the prep** | `[ ]` | |

`[ ]` **The honest count is recorded**: ____ of 11 milestones walked, plus the product walk. **Not
"16 of 16".**
as run: ___________________________________________________________________

---

### Step 16 · **[O] eyes, [L] instrument** — THE PRODUCT WALK **including the AGENTIC section**

*Why this step exists:* every line above it proves the **admission** path (mail → signup → pay →
firm → invite → secrets) and **none** proves the **product**. It is now a checklist section
(`docs/ops/wave-g-setup-checklist.md`, "Product walk"), added at the owner's ask.

**Rules, from the owner's own framing.** A failure becomes a `PROGRESS.md` **Known-issues row** for
the launch sitting with what was seen and where it stopped — it does **not** silently block the
cutover, and **no mechanism is touched to get past it** (constraint 14's operative clause). Where no
surface exists, write **"not shipped → Known issues"** rather than improvising one, and **name the
census that establishes the absence** (law 2).

#### 16A · The seven core lines

| # | the owner sees | the lead's instrument | `[ ]` | as run |
|---|---|---|---|---|
| 1 | **A client company is onboarded** | `/clients` (`apps/web/app/(firm)/clients/page.tsx`), the durable `clientOnboarding_v4` (registry pin `packages/runtime/workflows/registry.ts:129`, serving on v71), the chat lane's `OnboardingChecklistCard.tsx` and `InterviewRunCard.tsx`, reached by the ⌘K **Do** action `begin_client_onboarding`. **Known honest gap: there is no "add a client" control on `/clients`** — onboarding starts in the chat lane. Record it as **a discoverability finding for the launch sitting, not a build failure** | `[ ]` | |
| 2 | **A document is uploaded and its extraction is visible** | the Documents tab or the composer, over the Slice-5 intake pair `POST /api/intake/documents` then `PUT /api/intake/documents/:id/bytes` (`packages/runtime/src/intakeRoutes.ts`); the extraction rendered in `apps/web/components/documents/document-extract-panel.tsx`. **A document that uploads but shows no extraction is the finding worth having** | `[ ]` | |
| 3 | **A bank statement is read and its lines appear** | same intake path → `packages/runtime/lib/statement-parse.mjs` → the Bank tab (`bank-workbench.tsx`, `statements-section.tsx`). **Read the figures off the tab, never off a chat reply** (constraint 2) | `[ ]` | |
| 4 | **The agent proposes and a human disposes** | matcher + auto-draft (`packages/runtime/lib/matcher.mjs`, `autodraft.mjs`) propose; the human POSTS **and** REFUSES in the Journals tab (`drafts-queue-panel.tsx` → `JournalsDoorDialog.tsx`, `posted-panel.tsx`). **Both arms — the refusal is the wall.** PRD §6 invariant 1; the agent roles hold **zero DML on the books** | `[ ]` | |
| 5 | **A chat-to-close proposal is adopted or withdrawn** | a close-prep turn on `chatTurn_v17` producing a proposal/receipt the human adopts or withdraws; the Close tab (`CloseProposalPanel.tsx`, `AgentActReceiptsPanel.tsx`, `CloseDoorDialog.tsx`). **Law 71 binds the walk: preparation is agent-lawful; finalize, reopen, attest and settle are HUMAN-ONLY. If any of those four can be walked by the agent, STOP — that is a security finding, not a walk item** | `[ ]` | |
| 6 | **A report renders and downloads** | `renderEnqueueDue` (`packages/runtime/lib/leader.mjs`) → `RenderJobQueuePanel.tsx`, `ArtifactRow.tsx`, `DownloadArtifactButton.tsx`. The download door is `0162` and **only applies at this reset**, so this runs after the migration span. **Blocked if step 8 was skipped** — a dark evaluator refuses the figure (constraint 2) | `[ ]` | |
| 7 | **The fixture estate re-runs through the REAL doors** | constraint 13: `reset.mjs` → `seed.mjs` → `onboard-rpr.mjs`, each printing its own counts; the applied frontier read back (**`0164`, 159 files**); **the RS trial balance re-read as the standing pin — `trial_balance_as_of`, 3,396,500 = 3,396,500** (compare against 3b.5). **A fixture firm that does not come back is stop-the-line; a figure that comes back DIFFERENT is stop-the-line** | `[ ]` | |

The fixture roster (constraint 13): ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE SOLUTION (whose
sole proprietor is **not** an employee — his account is EQUITY) · the synthetic ROME PUBLIC ADVISORY
· the slice-era RLS fixtures **Alara** and **Borneo**.

#### 16B · **THE AGENTIC SECTION** (裁-164 part 2 — the owner's own addition)

> The owner's words on the record: 「agentic 能auto 的東西like autopost and bank reconcialition due
> uplaod bankstatembt and using chat for all accoubting execution 也是要test，確保其我們的backend 沒有
> 大問題in product vision/objectives and agentic ambitious」.
>
> **Verdict weight:** a backend defect found here is a **launch blocker** if it breaks (a) or (b).
> Gaps in (c) or (d) are **Backlog rows**.

**(a) Bank statement upload → intake → reconciliation → the belt's drafts → the human disposes.**

| | act | expected observation | `[ ]` | as run |
|---|---|---|---|---|
| a1 | Upload a **real-shaped** bank statement for a seeded client | the document pipeline's parts render; the statement and its lines appear in the Bank tab | `[ ]` | |
| a2 | Wait for the **leader's cadence** | the matcher + auto-draft belt produce **drafts in the Journals drafts queue** — this is autonomy **layer 1**, which beta ships LIVE | `[ ]` | |
| a3 | **Adopt one** draft | posted, with its receipt visible afterwards | `[ ]` | |
| a4 | **REFUSE one** draft | refused, with its receipt visible afterwards. **The refusal half is the one that proves the human control — do not skip it** | `[ ]` | |
| a5 | The reconciliation proposals reach the **chat / workbench** and the human disposes on a card or in the workbench | the DB owns the numbers; the agent proposes, the human disposes | `[ ]` | |

**(b) Chat as the accounting execution surface** — through `chatTurn_v17` on the deployed runtime,
**each proposal disposed by the human**:

| | turn | expected observation | `[ ]` | as run |
|---|---|---|---|---|
| b1 | An **onboarding "Do"** | `begin_client_onboarding` drives `clientOnboarding_v4`; the checklist/interview cards render | `[ ]` | |
| b2 | A **coding / journal proposal** | the proposal lands where a human can post or refuse it | `[ ]` | |
| b3 | A **close-prep turn** (the F-A4 close-prep lane, rung A8) | a close proposal or an agent-act receipt the human adopts or withdraws | `[ ]` | |
| b4 | A **report render** | the render enqueues and the artifact downloads | `[ ]` | |

**(c) Autonomy LAYER 2 — RECORDED "OFF by 裁-165". Not a failure.**

The G1 cadence wake sources (`bank_agent`, `close_prep`) ship **DISABLED**, and the walk **does not
flip them on**. Measured ground (`PROGRESS.md`, the G1 row; the v71 deploy record confirms both
`wake_engine_sources` disabled by design): the G1 engine (`0133`, #349) and both wake bodies
(`bankAgent_v1` + `closePrep_v1`, #437) are **MERGED but not deployed, both switches OFF** — the
裁-40 flip is inert until **G1 PR-2** builds the two PRODUCERS (`bank_agent_run_due` + the
`bank.agent_due` event/taxonomy row + a `leader.mjs` cadence gate; the `close_prep` task producer),
the eight deferred DB items and the three Codex-r6 LOWs; and `bank_agent_due_claims` has **no
retention path**, owed before F-A3 enables the source.

`[ ]` Recorded verbatim: **"autonomy layer 2 (the G1 cadence wake sources `bank_agent` and
`close_prep`) is OFF by ruling 裁-165 — not a walk failure. G1 PR-2 is a Backlog row, built before
上市."**
as run: ___________________________________________________________________

**(d) Witness activation and the FA / adjustment authorities — RECORDED, not walked through SQL.**

`[ ]` Recorded verbatim: **"witness activation and the FA/adjustment authorities have NO web surface
at this tip — dark in the UI, the doors exist in the DB. Recorded as such; not walked through SQL,
and constraint 11's witness is never approved."**
as run: ___________________________________________________________________

**Proof line for the whole of step 16:** every line above carries a **screenshot or a receipt id**
in the as-run, and each "not shipped" verdict **names the census** that establishes the absence.

---

### Step 17 · **[O]** THE MAIL SECTION'S REMAINDER + THE THREE RESEND CONSOLE ACTS

> **The certification itself happened at step 13** (裁-159 folds it there). This step records it and
> closes the rest of the section.

**Already proven, and exactly how far each gets you (裁-146, measured 09-03):**
- **≈16:08 MYT — custom SMTP CONFIGURED**: Enable custom SMTP ON, host `smtp.resend.com`, sender
  `no-reply@mail.clarabook.com`, sender name `Clara` — **read back**. Port, username and password
  sat below the fold and were **NOT** read back (P-16).
- **≈16:55 MYT — delivery to a NON-team address PROVEN**, via the dashboard's *Invite user* arm.
  That retires the default mailer's *Email address not authorized* wall **as a measured fact** but
  does **not** certify the section: different template, a **LINK** not a **CODE**, fired from the
  dashboard rather than the app's own courier path.
- **Owed, and discharged at step 13**: the `/signup` six-digit-code arm.

**Read back at the walk, all three REPORTED-not-measured (裁-112), checklist `:64-71`:**

| item | instrument | `[ ]` | as run |
|---|---|---|---|
| the test user deleted | a read, not a memory — and after 4b, `auth.users` is empty anyway | `[ ]` | |
| **the auth mail rate-limit raise, WITH ITS NUMBER** — the value was never stated, so no document records it | **裁-169: read it back by Management API** (see step 18) | `[ ]` | |
| the *Confirm signup* template still `{{ .Token }}` | a **Management API read, not a screenshot of the editor** (security-pass item 8) | `[ ]` | |

**The three Resend console acts (`[O]`), each with its proof:**

| act | checklist | proof | `[ ]` | as run |
|---|---|---|---|---|
| The API key scope is **`sending_access` ONLY**, domain-restricted to the one verified domain | `:19` | a screenshot/export of the key's scope + domain restriction. Measured 09-03: exactly **ONE** domain, `mail.clarabook.com`, status **Verified** | `[ ]` | |
| **Message storage OFF** | `:20-21` | the storage setting. *"The invite link's `?ct=` bearer token sits in the request body; do not let Resend retain it."* | `[ ]` | |
| **Team log access RESTRICTED** | `:22-23` | the log-access setting — the same body-and-ingress exposure named at P4-4 round 3 (H1) | `[ ]` | |

**Proof line for the whole section** (`:85-87`): the key's scope + domain restriction, the
storage/log settings, **a Management API read of the SMTP configuration and the rate limit (values
redacted)**, and the **received non-team confirmation message with its timestamp** — all attached to
this as-run.

`[ ]` Section proof line assembled.  as run: ____________

---

### Step 18 · **[O]** OTP EXPIRY → 60 MINUTES, THE AUTH RECEIPTS, THE TWO RATE LIMITS, AND THE SECOND 裁-147 READ

**Only now**, because 裁-131's box is ticked **only after C-5's attempt wall is LIVE** (checklist
`:163-174`): on an unwalled seam a 60-minute code would be 3,600 s of unwalled guessing.

`PATCH /v1/projects/{ref}/config/auth` with the owner's PAT. Project ref **`bzecqklouchkmdmdxlln`**
(`docs/ops/DR.md:48`). Then a **READ** — a Management API read, never a screenshot.

**The receipt reads, by field name as the repo names them:**

| field | expected | `[ ]` | as run |
|---|---|---|---|
| `mailer_otp_exp` | **`3600`** (60 minutes; checklist `:174`) | `[ ]` | |
| `jwt_exp` | **`900`** | `[ ]` | |
| `disable_signup` | **`false`** — i.e. **"Allow new users to sign up" is ON** (checklist `:149-150`; without it every gate below passes and no applicant can start) | `[ ]` | |
| `mailer_autoconfirm` | **`false`** (confirmation ON, autoconfirm OFF) | `[ ]` | |
| `password_min_length` / `password_required_characters` / `password_hibp_enabled` | **12** + HIBP on | `[ ]` | |
| the **redirect allowlist** | **exactly two entries, no wildcard**: `<origin>/auth/confirm` and `<origin>/auth/recover`. **NOT IN REPO — the FIELD NAME in this JSON is not recorded anywhere in the repo** (the checklist says "Management API reads for the redirect allowlist" without naming it). Read the field on screen in the response JSON and record the name you found | `[ ]` | |

**裁-169 — THE TWO RATE-LIMIT NUMBERS, READ BACK AND ACCEPTED AS READ.**
裁-102 (no server-side wall of ours on `/signup`'s send path) **closes as SUBSTITUTED by 裁-169, not
repealed**. Security-pass line **6** is ticked against these two **read** values, never against a
number that does not exist (the false-measurement class).

| | number | how it is read | value as read | `[ ]` |
|---|---|---|---|---|
| 1 | **the Resend plan's daily/monthly cap** | the Resend account API/dashboard **at the walk**, quoted **with the plan name**. **NOT IN REPO — no number exists in the repo.** Owner looks: Resend dashboard → the account's plan/usage page | plan `________` · cap `________` | `[ ]` |
| 2 | **the Supabase Auth email rate limit as raised by the owner on 2026-09-03** | the Management API read above. **NOT IN REPO — the FIELD NAME is not recorded anywhere in the repo, and the raised VALUE was never stated.** Owner looks: Supabase Dashboard → **Authentication → Rate Limits** ("emails sent per hour"), or the raw JSON of the `config/auth` GET. **The default mailer's 2/hour does NOT apply once custom SMTP is on**; saving custom SMTP starts the auth cap at **30/hour**, which this raise moved | field `________` · value `________` | `[ ]` |

> **Tripwire, stated to the owner at the ruling:** if the read-back value is **disproportionate**
> (hundreds per hour), **the walk stops and asks** whether to lower it before accepting.

`[ ]` The owner **accepts both numbers as read**, in writing, in this as-run.
as run: ___________________________________________________________________

**And the second 裁-147 read — at CUTOVER.** The same select as 15.0, run **again**: the Stripe
problem list must be **EMPTY of unresolved rows** before the cutover proceeds.
`[ ]` as run: ____________

**裁-170 — the SST fact, recorded here so the launch sitting inherits a fact rather than a question.**
`[ ]` Recorded verbatim: **"BELCORT is NOT SST-registered (owner's statement on the record,
2026-09-03). Beta is sandbox at MYR 0, so no tax amount exists to compute. **Stripe Tax is OFF for
the whole beta** as a consequence of that fact, not of an omission (checklist `:181-183`)."**
as run: ___________________________________________________________________

---

### Step 19 · **[L]** CLOSE — and the handover 裁-150 asks for

**Teardown, each an explicit act with its own receipt, never an assumption:**

| | act | `[ ]` | as run |
|---|---|---|---|
| 1 | `fly machine destroy <sleeper-id> --app clara-backup --force` — **every** sleeper | `[ ]` | |
| 2 | If `clara-backup`'s scheduled machine was **started** rather than spawned, stop it | `[ ]` | |
| 3 | Drop the step-2b throwaway PG17 and its container, **by exact name** | `[ ]` | |
| 4 | Re-read `fly status -a clara-runtime` and `/ready` | `[ ]` | |
| 5 | The step-2a dump artifact's final resting place recorded (it was kept outside the run's tree until now) | `[ ]` | |

**The as-run is filed at `docs/plan/completed/wave-g-reduced-asrun-2026-09-XX.md`** (the FS-11
order's own filename), carrying **every** proof artifact (裁-122), the two 裁-136 lines **as captured
at 15.4** (never reconstructed), every ruling folded above, and the truing lines this ceremony owes.

#### 19.1 · THE CLOSING BLOCK — the numbers this ceremony must be able to state

| fact | value | `[ ]` |
|---|---|---|
| **Applied frontier** | `select count(*), max(version) from clara.schema_migrations;` → **159 / `0164_checkout_gate_c6_web_reads`**; the repo directory counted → **159 files** | `[ ]` |
| **Evaluators** | the step-8 act list, each `deployed = true`, `verify_evaluator_freeze()` clean — **the count is 3b.2's, not "nine"** | `[ ]` |
| **BELCORT** | firm id `____________________` · `is_operator = true` · `count(*) where is_operator` = **1** · `uq_firms_one_operator` indexdef still partial | `[ ]` |
| **The walk's honest count** | ____ of the **eleven** enumerated milestones + the product walk (裁-164). **Never "16 of 16".** The remaining five are **not enumerated in the repo** | `[ ]` |
| **Mail certification** | the non-team address, the send and receive timestamps, the code verified on the page, nothing to click | `[ ]` |
| **The two rate limits** | accepted as read (裁-169): Resend plan `______` cap `______`; Supabase field `______` value `______` | `[ ]` |
| **Stripe posture** | **sandbox, MYR 0, the whole beta** (裁-126/148); `CLARA_STRIPE_LIVEMODE = test`; **Stripe Tax OFF** on the 裁-170 fact | `[ ]` |
| **The purges (裁-161)** | `auth.users` before `______` → **0**; Storage objects per bucket before `______` → **0**; buckets and policies untouched | `[ ]` |
| **The window (裁-157)** | open `______` close `______`; every route errored during it, expected | `[ ]` |

#### 19.2 · THE DR `4.9` REPLACEMENT SUBJECT (裁-172) — candidates only, named here, settled at the final truing

The parked canary's clara-side rows died at step 4, so the STRICT `4.9` cross-schema parity probe
lost its subject. **Candidates from the post-reset estate** — any durable run with **both** a
`workflow.workflow_runs` row **and** its clara-side projection:

| candidate | source | run id / task id | `[ ]` |
|---|---|---|---|
| a `clientOnboarding_v4` run | product-walk item 1 | `____________________` | `[ ]` |
| a `chatTurn_v17` run | product-walk item 5 / 16B(b) | `____________________` | `[ ]` |
| a render job | product-walk item 6 | `____________________` | `[ ]` |

**Never the pinned ids.** If none qualifies, `4.9` is recorded **UNPROVEN IN THE FIELD** with a
Known-issues row — **never a silent skip**.

**And the code constraint:** `packages/db/scripts/dr-verify-checks.mjs` **hard-codes** the canary ids
at **`:398-399`** (the interruption) and **`:414-415`** (the task). Changing them is a **code
change** → a **Backlog row naming the file**, not a hand edit on launch night (裁-172).

`[ ]` Candidate ids captured (or UNPROVEN IN THE FIELD recorded).  as run: ____________

#### 19.3 · THE `PROGRESS.md` ROWS THIS CEREMONY MINTS (裁-150: owner · next step · ruling number)

> **ONE AUTHOR.** `PROGRESS.md` has a single author at any moment. Hand these rows to that author;
> do not write them from two lanes.

| # | row | kind | owner | next step | ruling | `[ ]` |
|---|---|---|---|---|---|---|
| 1 | The monthly-light restore drill is **overdue since 2026-07-22** and the latest R2 bundle's **decryptability is unproven** since then | Known issues | **owner** | run `DR.md:376-381` / `:431-436` with the `age` identity (custody: owner, off-repo AND off-R2) on a date the owner picks | **裁-163** | `[ ]` |
| 2 | **G1 PR-2** — the two producers + the eight deferred DB items + the retention path for `bank_agent_due_claims`; a DB+runtime train under the full ladder with a D1 window and a ceremony; then the 裁-40 flip through the G1 operator door | Backlog | owner | before 上市 | **裁-165** | `[ ]` |
| 3 | The **beta terms of service** — the `kind` discriminator + a per-kind unique index + `sign_dpa`'s carrier gaining `kind`, riding the next DB PR touching the store; 裁-90's byte-identity law extended to the terms; the lawyer pass | Backlog | owner | before 上市 | **裁-166** | `[ ]` |
| 4 | The two **`clarabook-frontend` recut PRs** — 裁-64② (`--input`) and R3 §9 (focus ring) — on a date the owner picks; until then the design law drifts from the shipped app and any future port re-imports the drift | Backlog | **owner** | open the two PRs | **裁-168** (rider: 裁-167 — if the design repo later implements token contract §5.2, `apps/web` follows) | `[ ]` |
| 5 | The **DR `4.9` subject** — 19.2's outcome | Known issues | lead → owner | name the subject at the final truing, or a code Backlog row for `dr-verify-checks.mjs` | **裁-172** | `[ ]` |
| 6 | The **orphaned durable run** — the canary's `workflow.workflow_runs` row survived the drop under constraint 15 with no clara-side projection | Known issues | lead | record only; constraint 15 forbids touching it | **裁-160** | `[ ]` |
| 7 | **The `?ct=` edge-log redaction** — carry the row **only if FS-10's S16 look deferred it** (裁-155). If FS-10 configured and proved it, there is no row | Known issues | owner | per 裁-155's dated deferral | **裁-155** | `[ ]` |
| 8 | Every **"not shipped"** verdict from step 16, each naming its census | Known issues | lead | per finding | **裁-164** | `[ ]` |
| 9 | The **unenumerated five** of the "sixteen" | Known issues | lead | enumerate or re-cut the label | **裁-164** | `[ ]` |
| 10 | **裁-147**'s operator problem-event screen (post-beta) and **裁-149**'s pool `'error'` contract (post-beta) | Backlog | owner | after beta live | 裁-147 · 裁-149 | `[ ]` |

#### 19.4 · TRUING LINES THIS CEREMONY OWES THE REPO

| line | what | `[ ]` |
|---|---|---|
| **T-A** | Three texts still contradict 裁-126/裁-148 after truing-4: `frontend-sprint-handoff-2026-08-31-orders.md:438` and `:440`; `checkout-gate-gate-record.md:372`; `checkout-gate-design-part3.md:180` | `[ ]` |
| **T-B** | `security-pass-2026-09-02.md` items 4 and 5 cite `0161`; the auth-wall pair is minted by `0163`. Same defect at `packages/runtime/lib/checkout-pools.mjs:45` (a code comment — it rides the next code PR touching that file, decided at arming; **never a separate code PR for a comment**) | `[ ]` |
| **T-C** | The apply span: `PROGRESS.md`'s banner and `orders:434` say `0154`…`0164`; the reset tooling produces **all 159, `0001`→`0164`** | `[ ]` |
| **T-D** | `docs/ops/DR.md:397-402`'s owner-run classifier — file the **裁-162** supersession sentence there, scoped to test data and to the pre-beta ceremonies, **expiring at beta live**, leaving the crown-jewel items owner-run | `[ ]` |
| **T-E** | The *Reset password* template box is parked in *"the pending FS-10 notes"*, **a document that does not exist** (checklist `:52-53`, `:155-156`). Give it a permanent home | `[ ]` |
| **T-F** | **The evaluator re-deploy obligation is in no checklist.** Add it beside the reset lines — and add the **step-3b pre-read**, because the act list cannot be derived after the drop. **T-F's own text needs re-cutting**: it currently says *"nine `deploy-evaluator-version.mjs` runs after a full re-migration"*, and that number is a manifest-entry count, not a registry-row count (step 3b.2) | `[ ]` |
| **T-G** | The FS-10↔FS-11 maintenance posture exists nowhere in the repo; **裁-157** supplies it. *(Recorded as ANSWERED by 裁-156/157 in the truing-4 opening list.)* | `[ ]` |
| **T-H** | Doc lines stale after **#539**: `wave-g-setup-checklist.md:137-138` (*"declares no `vars` block"* — now false), `:134-136`, `:95`, `:114-116`; `frontend-sprint-handoff-2026-08-31-orders.md:418-419`; `incident-2026-07-26-intake-storage.md:55`; the two research files at `slice5/asbuilt-native-wire.md:53` and `wave-a2/E-runtime-registry-dashboard.md:172` (historical — **date-stamp, never rewrite**) | `[ ]` |
| **T-I** | The rulings 裁-151…174 into the `-09-03` ledger + the rulings digest (**dissent lines for 156, 158, 161, 163**); DR.md's T-D sentence **with its beta-live expiry**; **the Wave-G checklist's new step 4b** (裁-161); the no-soak / no-maintenance-page posture (裁-156/157); the "sixteen steps" re-cut (裁-164); the DS-07 row's owner and next step (裁-167); the two rate-limit read-back lines (裁-169); the SST fact on the checklist line (裁-170); the agentic Product-walk items (裁-164); every Known-issues row this ceremony minted | `[ ]` |

**裁-150's requirement, which is what makes this a handover rather than a close:** every unresolved
item goes into `PROGRESS.md` carrying **owner · next step · ruling number**. The repo is the system
of record; `PROGRESS.md` is the state authority (constraint 8). **After the beta-live e2e this
session closes and no next lanes are dispatched.**

`[ ]` The as-run is written and filed.  as run: path ____________
`[ ]` Every row in 19.3 handed to `PROGRESS.md`'s single author.  as run: ____________
`[ ]` The clock: window open `______` · close `______` · as-run filed `______` (all from `date`).

---

## 5 · ROLLBACK

**Trigger:** any step 4–8 failure that leaves the catalog unusable, or a post-reset read that
contradicts its expected value and cannot be explained.

**Preconditions before a rollback opens — both, positively read:**
1. **Which bundle.** A locally-held step-2a bundle needs no `age` identity. An **R2**-sourced bundle
   does, and it is **owner custody, off-repo AND off-R2** (`DR.md:376-381`) — so an R2 rollback is an
   `[O]` act. **Say which one is being restored.**
2. **Step 2b passed.** A rollback is not the moment to discover the bundle cannot be restored.

**The path is the FULL-profile restore, not a re-run** — `docs/ops/DR-full-drill.md` §3, whose
POST-RESTORE CEREMONIES checklist (`:128-146`) is the one enumerated at step 2b. **All of it applies
again**, including the two that step 2b marked N/A on a throwaway but are **REAL here**: the Storage
recovery (`storage-provision.sql` → re-provision the bucket → re-upload the byte mirror →
sha256-verify against `clara.documents.sha256`) and the **engine-sanity check**, which the runbook
marks *"world-on: REAL RECOVERY only — NEVER in a drill"*.

Three things a hurried rollback would skip:
1. **Only the full profile restores.** A default-profile dump restores postgres-owned,
   PUBLIC-EXECUTABLE functions — the write wall **OPEN** — and its `schema_migrations` makes a
   re-migrate a no-op that never rebuilds the wall.
2. **Roles are cluster-level and are NOT in any dump.** `packages/db/deploy/roles-bootstrap.sql` is
   the restorable recreation — **19 roles at `9d5d844e`, counted at the file**. It is
   FRESH-TARGET-ONLY.
3. **The ACL baseline is carried by no dump.** Re-applying `acl-baseline.sql` is **mandatory**
   post-restore — a restore recreates `public` with its default PUBLIC USAGE, re-opening the confined
   lanes' reach. Same act as step 6; the rollback needs it again.

**Costs to state plainly before choosing:** the managed floor is daily physical backups, 7-day
retention, **PITR NOT enabled** — the finest granularity is the last daily backup; and a restore
**into the same project** is a different act from the drilled one (the proven drill restored into a
**fresh** project in a separate Free org). **A rollback decision goes to the owner.**

**Cheaper partial undoes, where they exist:** step 14's flag has a documented mechanical undo
(`g1-operator-firm-ceremony.md`, "Re-pointing the operator firm"); step 10's two rows can be deleted
as `clara_fn_owner`; step 11's flips reverse with `alter role … nologin`; step 6's baseline is
idempotent and re-runnable. **Step 8's evaluator flips have NO undo** — one-way, admitted exactly
once per row, ever. **4b's purges have no undo at all** — that is the accepted cost of 裁-161.

---

## 6 · RISKS TO WATCH DURING THE RUN

- **R-1 · A no-op reset would be SILENT.** A stale target string or a DSN resolving elsewhere makes
  `reset.mjs:63-68` short-circuit and exit **0**. Step 4's pre-read is the only thing that tells a
  successful reset from a wrong-target no-op.
- **R-2 · The evaluator count is not nine** (step 3b.2). Building step 8 from the manifest would
  attempt three acts against rows that do not exist and skip two rows the manifest does not carry.
- **R-3 · The pepper and the token couple two apps deployed at different times.** A mismatched
  pepper splits one rate wall into two that never see each other's counts; a mismatched token **401s
  every confirmation**. The hash proof cannot run at FS-10 — it runs here (裁-152).
- **R-4 · `CLARA_TRUSTED_CLIENT_IP_HEADER`** — one name, two correct values. A wrong runtime value
  **503s every applicant** with nothing looking wrong anywhere.
- **R-5 · The operator door is not callable before step 14.** `list_stripe_event_problems` needs an
  owner-rank JWT on an `is_operator` firm. 15.0 uses the raw select. **Do not read `CLR04` as "no
  problems."**
- **R-6 · Supavisor headroom is an open item, not a settled number** — measure at P-9; the two new
  pools add ≈4.
- **R-7 · Stale pooler sessions do not heal themselves.** An `idle` (not `idle in transaction`)
  session is reaped by no timeout — LOOK before the DROP or the DROP waits on a corpse's locks.
- **R-8 · Windows is not the ceremony surface** — WSL2 is. Do not adapt the pipes to PowerShell
  without re-proving the argv and disk cells.
- **R-9 · DF-5 across the whole walk.** The corpus is a happy path; most refusal walls will count
  zero. Every one of them is recorded **UNPROVEN IN THE FIELD** with **which** it was — never
  triggered, or never asked — never silently credited.
- **R-10 · The repo is PUBLIC (裁-135).** No secret, DSN, `whsec_`, healthchecks ping URL or PAT
  value in this as-run or anything it feeds. **Hashes and redactions only.**

---

## 7 · NOT IN REPO — asked for, and not there; never invented

1. **No FS-11 runbook exists.** There is no `docs/ops/wave-g-*-ceremony-runbook.md`; the checklist is
   a proof tick-list, not a sequence with commands.
2. **The runtime quiesce is not in the checklist** — no machine-stop, session-reap or restart line
   anywhere. The obligation comes from `packages/db/README.md`'s D1 section and
   `wave-c-c-0040-ceremony-checklist.md`.
3. **No data-only reset mechanism** — the repo has exactly one reset: `DROP SCHEMA clara CASCADE`.
4. **No documented BELCORT re-creation path for a post-reset estate.** `onboard-rpr.mjs:295-298`
   assumes BELCORT already exists on live and refuses to create one; the create path needs a
   `clara.users` owner row plus an unconsumed admission token, and the auth-user provisioning behind
   it is called *"a manual dashboard step"*. Route (a) walks the product's own door instead — a
   **choice** (裁-159), not a documented path.
5. **The evaluator re-deploy obligation is in no checklist** (T-F).
6. **No `auth.users` purge step and no Storage object purge step** anywhere — the 4b method is read
   on screen; the checklist gains the 4b line at the final truing (T-I).
7. **The Storage bucket list** beyond `firm-docs` is not in the repo — read it on screen.
8. **The Supabase auth mail rate-limit FIELD NAME and its VALUE** — neither is in the repo. Owner
   looks: Supabase Dashboard → Authentication → Rate Limits, or the raw `config/auth` JSON.
9. **The redirect-allowlist FIELD NAME** in `GET /v1/projects/{ref}/config/auth` — not in the repo.
   Read it on screen in the response JSON.
10. **The Resend plan's cap** — no number in the repo. Owner looks: the Resend dashboard's plan/usage
    page.
11. **No documented TLS posture for the two checkout DSNs** — read the app's existing `DATABASE_URL`
    shape env-to-env and match it. Never `no-verify`.
12. **No repo-held value for `CLARA_RATE_WALL_PEPPER` / `CLARA_AUTH_WALL_SERVICE_TOKEN`** — by
    design; minted once at FS-10 (裁-152), never printed.
13. **The "sixteen-step walk" is never enumerated to sixteen** — only two identical **eleven**-arrow
    chains exist. Walk the eleven plus the product walk and record the count honestly.
14. **The desktop corpus is not inventoried** — the as-run should carry an inventory.
15. **No remote-origin walk instrument** — `apps/web/e2e/run.mjs:14-28` serves a LOCAL build and
    mocks Supabase. The walk is manual-from-a-script by necessity; the as-run says which instrument
    was used.
16. **No FS-10↔FS-11 maintenance-posture line** — 裁-157 supplies it (T-G).

---

*Prepared read-only at `origin/main` `9d5d844e`. No live command was run, no DSN piped, no secret
read or printed, no migration applied, no rig started. Every claim above is anchored to a file that
was actually read at that sha, to a ruling record named by path, or is marked **NOT IN REPO**.*
