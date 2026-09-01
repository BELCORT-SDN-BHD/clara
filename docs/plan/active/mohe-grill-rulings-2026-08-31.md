# 磨合 grill rulings — 2026-08-31 (the fourth ledger; continues `mohe-grill-rulings-2026-08-30.md`)

*Same shape as the first three ledgers: one question per turn, 大白话 each, the owner's words where
he gave them, the ruling, the consequences. The 08-28 ledger carries 裁-1…28, 08-29 裁-29…44, 08-30
裁-45…72; this one carries **the 2026-08-31 direction** and **裁-73…裁-93** — the morning sitting
(~09:30–12:30 MYT) that followed the paused sprint night (`PROGRESS.md` "2026-08-31 dawn").*

*Standing context at the sitting: main `652844d8`; repo frontier `0155`, live 148/`0153`; runtime
Fly `v69` serving `chatTurn_v15`; `app.clarabook.com` serving the OLD `apps/dashboard`; `apps/web`
merged on main and deployed nowhere; 13 open PRs mid-ladder with eight lanes' fold rounds
uncommitted in their worktrees; zero Stripe code in the repo. Instruments: a 167-agent
harness-drift scan over thirteen document families plus an opus happy-path trace, every non-low
finding adversarially verified (103 confirmed · 33 partly · 7 refuted · 23 low), then spot-verified
at the bytes by the orchestrator; the owner's briefing artifact "Clara Beta Runway".*

## THE 2026-08-31 DIRECTION (owner, ~09:30 MYT) — binding, un-numbered

"从现在开始所有未建的 backend like tax b or others and all 不重要的 backend residual like mini bugs
的先停止, 记录清楚 in our harness menu and harness system. 然后全心全意投入所有 frontend and 替换掉
我们的旧 frontend in deploy in our current 域名 app.clarabook.com and setup 好我们的 stripe and all
planned pay model. i want to see somethings and direct beta launch." And: unbuilt backend features
still appear in the UI as honest **not-built-yet** flows; the frontend, the backend and every planned
user flow (agentic included) stay aligned; every provided design resource is respected.

**How the sitting read it.** Stop = *record, do not build*: every paused item gets a
`PROGRESS.md` Backlog/Known-issues row with its resume path (ADR-0075 §6 — the only lawful home
for a deferral). The exceptions are the residuals the happy-path trace proved *blocking* — each
ruled below by name. The rulings that follow are the consequences the direction needed to become
executable; everything not re-ruled here stands as written (裁-1…裁-72).

## 裁-73 · How a beta firm is created and paid — "正规 SaaS：signup → 绑卡 → firm"

**What was asked (大白话).** No path exists today from a paid signup to a born firm:
`clara.create_firm` (live body `0147:497`) demands an admission token that only seed files mint
(`packages/db/seeds/0002_core_seed.sql:55-59`; inserts exist nowhere else but tests), the
operator-approval road needs `firms.is_operator`, which only a raw ops act sets
(`docs/ops/g1-operator-firm-ceremony.md`), and 裁-68's "Stripe checkout success IS the approval" has
no implementation. Recorded nowhere as a blocker before this sitting.

**Ruling — option A.** "基本上就是正规的 Stripe setup, like 正规的 SaaS. signup first and pay for
register firm." Stripe Checkout in **subscription mode at a zero-amount price** (card collected,
nothing charged — 裁-58's RM0 trial) → a **signature-verified, idempotent webhook**
(`checkout.session.completed`) that mints exactly one `clara.firm_admissions` row → the existing
`create_firm` unchanged, called by the signup flow with that token. Option B (operator approval via
the `is_operator` ceremony + #453's queue) is NOT built as a product path; it stays the operator's
own tooling. *Cost:* ~0.4 backend (the webhook edge + `record_stripe_event` + the admission
minter) + ~0.5 frontend (the checkout step on `/signup` and the resume-checkout arm of the holding
page); no D1 window; **judgement logic → review law 1**. *Consequence:* billing PR-3's webhook door
and `stripe_events`/`stripe_object_map` land BEFORE PR-1/PR-2's plan/invoice tables — the beta
tranche is checkout + admission, not invoicing (nothing invoices at RM0, 裁-58).

## 裁-74 · An unpaid signup — "holding page 等你回来"

**What was asked.** "signup 后不给钱的话 userflow 会怎样?"

**Ruling.** An account (email verified) + a pending firm registration and nothing else: no firm,
no books, nothing charged. The scope spine (#451) routes the session to the holding page — "your
firm is not open yet — continue to checkout" with a **resume-checkout** control, and the
accept-an-invitation path stays reachable from the same page. **No reminder mail. The pending
registration is never deleted** (append-only estate); it counts against 裁-36's rate wall
(1 firm / 1 email / 1 IP per day) like any registration.

## 裁-75 · 裁-72 is re-measured before it is amended — "先量再改"

**What was asked.** 裁-72 ("110 个全接完再切") rests on the 2026-08-28 census, pinned at frontier
`0138` — before the eleven port-wave trains. Its own headline example ("nothing in the entire
product can open a fiscal year") has been false since T1 (#406): `apps/web/components/close/FiscalYearOpener.tsx`
is mounted on the Close page. Name-level, 64 of a 69-name sample of the "owed" verbs already have an
`apps/web` home (an upper bound — the plan's own exit gate, a **live-catalog census on a throwaway
rig**, is the instrument that decides).

**Ruling.** Run the live-catalog census first (~0.3, `fe-train-plan-2026-08-30.md` §5.2 proof 1),
then **amend 裁-72 to the measured residual**: every verb that has a home is done; every verb that
has none gets a dated `NotBuiltNote` naming its lane; **the cutover no longer waits for P6-C1…C7**.
No C-train order is written before the measurement. *Consequence:* 裁-60's trigger returns to
"cutover when the happy-path set + the honest notes are in place" (see 裁-78 for the one hard
criterion added).

## 裁-76 · The G1 clocks are post-beta — 裁-59 amended explicitly

**What was asked (大白话, after "agentic 体验都保留对吧?").** The document lane already reads,
attributes, files and posts unattended and raises needs-you questions — on the reconciler belts,
independent of the wake engine. Bank statements are extracted and stored on upload; matching,
settlement, exceptions and certification run when the human asks Clara in chat (the thirteen
`chatTurn.v14.bank` tools) or works the Bank tab. What is missing is only the **autonomous clock**
— "她自己每小时醒来去对账 / 每月自己去准备结账" — i.e. G1 PR-2a (#456, DB) + PR-2b (#449, the
producers), both heavy and mid-fold. Chat has **no close-prep tools today** (v14/v15 register none);
close preparation is the human Close tab. The `bank_agent_due_claims` retention debt is a table
that does not exist on main yet (it arrives with #456) and defers with the clock.

**Ruling.** The G1 producers and the three-switch ceremony are **post-beta**. **裁-59 is amended in
words**: Wave G's criterion is the *interactive* agentic product (needs-you · rail · unattended
posting · chat-driven bank and close acts); the clocks follow with real traffic. #456/#449 are
PARKED (PR open, marked paused; worktrees untouched — the uncommitted diff is the round; a
Known-issues row each with the resume path). The retention belt and the `call_kind`/`login_pool`
truings (裁-49) ride with them.

## 裁-77 · Reports — the chat opener + the PDF + close-prep chat tools

**What was asked.** The report chain (open → evaluate → seal → render) is live and its wake
wrappers are already allowlisted to the interactive credential, but **nothing in the product can
open a report run** — the only caller of `open_report_run` is a ceremony drill script; F-A5b PR-3
(the byte-burn PDF worker) is unbuilt.

**Ruling.** (1) A **chat tool set** over `wake_open_report_run` · `wake_assess_report_claim` ·
`wake_seal_report_dataset` (+ the render enqueue) so the human asks and Clara opens → evaluates →
seals → renders, with the human issuing (F-A5's own shape, ~0.4, rides the `chatTurn_v16` seam,
no migration); (2) **F-A5b PR-3**, the byte-burn PDF worker, so a management-accounts pack can be
downloaded (~0.6); (3) **the twelve `0138` close wrappers registered as chat tools too** (~0.2) —
`wake_begin_close` · `wake_abandon_close` · `wake_open_fiscal_year` · `wake_list_fiscal_years` ·
`wake_get_close_plan` · `wake_get_close_readiness` · `wake_dry_run_close_readiness` ·
`wake_verify_close` · `wake_propose_close` · `wake_run_depreciation_catchup` ·
`wake_mint_month_snapshot` · `wake_snapshot_state`. All three are judgement logic under review
law 1. **This is the only NEW backend the pivot admits**, because it decides whether a beta client
receives a management-accounts PDF at all.

## 裁-78 · The interview runner is ported before the cutover — a hard exit criterion

**What was asked.** F-A7b's in-thread interview (entity · FYE · MSIC · COA · opening basis) has a
live runtime (`/api/interview/*`) but its **frontend runner exists only in `apps/dashboard`**
(`apps/dashboard/app/shared/interviewApi.ts`); `apps/web` ported the onboarding *checklist card*
(T11), never the runner. Invisible to the verb census (HTTP, not `callDoor`); recorded nowhere.

**Ruling.** Port it **before the domain switch** as its own train (~0.7): the runner lives in the
escalated full-screen thread per R7/`fa7b-onboarding-design.md` §3.3, through the existing
same-origin runtime proxy (`apps/web/app/api/runtime/[...path]/route.ts`). **The cutover PR gains
one hard acceptance line: "the interview runner has an `apps/web` home."** No admin-flag survival
of the old app; no manual client-creation form.

## 裁-79 · The eight open backend PRs — finish two, park six

**Ruling.** **Finish #462** (COA template apply — closes the interview's shipped promise "apply
the standard MPERS COA seed?"; the interview copy is trued in the same pass) and **#454**
(`chatTurn_v16` — the declarer of the four card kinds whose readers merged in #459; then the Fly
deploy that makes v16 serve). **Park #447 · #448 · #452 (+ the `0154` D1 window) · #456 · #449 ·
#460**: PR left open and marked paused; worktree untouched; one Known-issues row each with tip,
the round that is uncommitted, the verify bar and the resume order. #460's HA question (one
non-HA Fly machine → "storage down = all of Clara down" under 裁-61) goes to a post-beta sitting.

## 裁-80 · Track B is paused; the Tax tab is an honest shell

**Ruling.** F-T2's rows, F-T3 PR-2…PR-9 and the `tax_prep` wake **pause** (the tables already
live — `0152`, `0153`, `0139` — stay). **P6-T ships the IA only**: the client-page Tax tab and the
firm-level statutory-deadline feed, each panel a `NotBuiltNote` naming its verb and lane (~0.3).
PRD §4 item 12 / §9.4's "F-T3 ALL-IN for Wave F" gains a dated pause note; 裁-57/58/62 and this
sitting's product-law rulings are minuted as **ADR-0077** (pending the owner's signature on the
digest). 裁-62 already made the module inert; this ruling stops the build, it does not change the
law.

## 裁-81 · Stripe — all of it by Codex, TEST mode first, keys never in the repo

**What was asked.** The orchestrator proposed a split (Codex builds the code; the claude.ai Stripe
connector configures account-level objects in a sitting). The owner corrected it: "都 codex 处理,
你是要 handoff 的" — and rightly noted Codex can run the official Stripe MCP itself.

**Ruling.** Codex owns the whole Stripe surface: it mounts the official Stripe MCP server in its
own ~/.codex/config.toml (none is mounted today; the machine's environment holds no `STRIPE*`
key), the owner supplies a **TEST-mode restricted key** into that config's env, and every Stripe
object is created **from DB rows** (Product/Price from `billing_plans`, the webhook endpoint,
Stripe Tax per 裁-54) — never authored by hand in the Stripe dashboard (裁-42's law, billing
design §3.11). Keys live only in that config's env and the servers' secrets; **never in the
repo**. TEST mode until the launch sitting; Wave G walks a non-zero test price with test cards to
prove the charge → webhook → invoice path (the 裁-58 mitigation), then LIVE + the RM0 price.
The owner's own acts: open the Stripe account, submit the Malaysian-entity KYB today, hand over
the TEST key, later the LIVE key.

## 裁-82 · Development leadership passes to Codex — this is a handoff

**Ruling.** "你是要 handoff 的, 忘记了吗?" From this sitting, **Codex is the development lead** for
the frontend sprint and everything the runway names; the Claude session's job is to leave the
harness true and write the handoff. The handoff of record is
`docs/plan/active/frontend-sprint-handoff-2026-08-31.md` (+ its orders annex), written per
`.claude/rules/handoffs.md` for a reader with no session — Codex opens the repo and starts there.

## 裁-83 · A reduced Wave G stays in front of beta

**Ruling.** After the domain switch and before any real user: **factory reset** (ADR-0075 —
every firm and client in the estate is test data), **apply `0155`** (裁-67), walk the sixteen
happy-path steps end to end on the desktop corpus (signup → checkout → firm → members →
onboarding interview → documents → bank → open FY → year-end close → report PDF → the FY rolls
forward), write the as-run. Missing evidence is marked 资料缺失 and never awaited (裁-63).

## 裁-84 · The review ladder under Codex — a second Codex read is the independent leg

**What was asked.** ADR-061 requires an independent review pass on every code PR; law 28 requires a
cross-model pass on money-touching code. Every port-wave car's independent review found real
defects.

**Ruling.** "全 Codex：另一个 Codex 只读 review 就算独立，不再用 Claude." A **fresh, separate
`codex exec` read-only review** (a different session that cannot see the author's reasoning) is
the independent leg; the owner reads the PR before merge. Claude is not in the ladder.
*Consequence:* law 28's "cross-model" clause is amended in substance to "cross-session" — recorded
in ADR-0077 for the owner's signature; ADR-061's uniformity (every code PR gets the pass) is
unchanged.

**Orchestrator's dissent, recorded then executed.** The two model families have caught different
defect classes this fortnight (Codex: the `Origin: null` 403 and the response-argument bypass;
native: the RM50→RM5 input, the phantom-success spinner, the deleted-component-stays-green cells).
For the four money/auth surfaces of this sprint — the checkout webhook that mints firms, the Stripe
mirror, the `create_firm` path and the cutover — a single family is a real loss of coverage. The
recommendation was a Claude leg on those four only; it was declined. Executed as ruled.

---

## INFORM — recorded at the sitting, no ruling needed unless the owner objects

- **裁-69 was already executed** before it was ruled: `0143` (裁-22, #409, live 2026-08-29) recut
  both proposal doors with `_resolve_proposal_basis` over `clara.document_regions`; the ledger's
  `witness_citation_regions` is not the relation. Only the card's rendering half remains.
- **Native review capacity is back** (this morning's probe and the 167-agent scan ran normally on
  the re-logged-in account) — the dawn entry's "wait until Sep 5" question is dissolved; moot
  under 裁-84 anyway.
- **Honest notes for paused lanes are a lawful permanent state** (fail-closed default under the
  direction): a `NotBuiltNote` whose lane is paused is swept at the exit gate against its Backlog
  row, not against a merge that will not come. Overrule if wanted.
- **The mobile decision corridor (Q6) is owned by no train** — a Backlog row; not on the beta path.
- **~/.codex/config.toml mounts github · playwright · context7 · vercel · openaiDeveloperDocs and
  the zoom family — no Stripe MCP yet** (裁-81's first act).
- **Item 93 stands unanswered**: the uncommitted `.claude/skills/orchestrator-fable/SKILL.md` edit that vanished
  ~02:50 MYT — the owner did not say whether it was his; a Known-issues row carries it.
- **#448's pushed head is CI-red** (db-estate) as parked — the row says so, so nobody reads the
  red as the branch's verdict.
- **ADR-0077 is owed** for the product-law rulings of 08-30/08-31 (裁-57 paid beta · 裁-58 RM0
  trial · 裁-62 tax inert at launch · 裁-75/76/84's amendments of 裁-72/59/law 28) — drafted this
  session, pending the owner's signature on the digest.

---

## The second sitting (2026-08-31, ~13:00 MYT) — 裁-85 … 裁-87: the seat stays here

*After the handoff was written for Codex as lead, the owner reversed: "i decide not to 转去 codex,
stay here and finish … 我也直接在我这里连所有 mcp including stripe. review ladder 保持精简, 用 opus
就好 … 用回我们的 orchestrator-fable 原本的 philosophy: 在不牺牲品质的原则下用最 effective, 适合, 经济
的 agent model … 可以加入 e2e, since it's mostly frontend."*

### 裁-85 · The operating model is the orchestrator-fable philosophy — the Claude Code session leads; every lane picked by fit

**Ruling (amends 裁-82).** The development seat stays in the Claude Code session — the orchestrator
plans, dispatches, synthesises, verifies and owns the state; the handoff of record is that session's
opening document, not a transfer. Lanes are chosen per task by the skill's own philosophy — **the
most effective, suitable and economical model that does not sacrifice quality**: Codex
`gpt-5.6-sol` xhigh for execution-heavy implementation, debugging and test-fixing (its own
worktree, direct `codex exec`); native sonnet-5 xhigh for bounded work; opus-5 xhigh where
ambiguity, architecture, security or judgement dominate. The 08-30 "every build → Codex" rule becomes
the DEFAULT for heavy builds, not a wall: **when one family is out (Claude's weekly limit, Codex
capacity) the other substitutes for that leg — builds included** — with the substitution recorded
in the PR body. Every dispatch still pins model + effort (constraint 5); heavy lanes cap at 3–4.

### 裁-86 · The lean review ladder — one fresh-context opus leg, plus a real-browser e2e leg on frontend trains

**Ruling (amends 裁-84).** build → the four verify commands + RED-before proofs → **ONE fresh-context
opus-5 xhigh review** (read-only, its own context, refute-first) → fold → the same reviewer
re-verifies → the owner may read → merge on green CI; docs-only PRs stay single-lane (ADR-0069).
**Law 28 is KEPT**, satisfied by the Codex-build / opus-review split; when a NATIVE lane built a
money, auth, webhook or tenant-creation surface, a Codex read-only leg is added — otherwise no second
leg. **E2E:** every frontend train's acceptance includes a real-browser **Playwright** walk of its
journey on the BUILT app (`next build` → `next start`, never `next dev`) against a throwaway test
firm (ADR-0075) — Q9's DONE rung 5 made mechanical — and the axe accessibility scan rides it
(closing Q7's never-built gate (b)); a checked-in suite under apps/web/e2e/ is owed by the first
train that walks (FS-2), and the reduced Wave G (裁-83) is browser-driven end to end. Instruments:
the Playwright MCP and Claude-in-Chrome in this session.

### 裁-87 · Stripe — this session's connector does the account-level work; lanes build the code

**Ruling (amends 裁-81).** The owner connects every MCP in the Claude Code session — Mobbin, shadcn,
codebase-memory (already in `.mcp.json`), Playwright, and the claude.ai **Stripe connector**
(authenticated by the owner in-session on the TEST-mode account). The orchestrator creates and
mirrors the account-level Stripe objects FROM DB rows through that connector (TEST first; LIVE at
the launch sitting) and records the result in the checkout train's design record; build lanes
write the code (the Checkout session, the signed idempotent webhook, `stripe_events` /
`stripe_object_map`, the mirror script) with keys env-to-env only. A Codex lane needs no Stripe
MCP of its own; the orders' §B stays as an optional recipe.

**INFORM (fail-closed defaults under this sitting, overrule if wanted):** the native-built
money-surface cross-model rule above; the handoff's reader is now "the next Claude Code session";
the orchestrator-fable skill is the first act of every session on this repo.

## The evening sitting (2026-08-31, ~19:50–20:40 MYT, in-terminal) — 裁-88…裁-93: the checkout gate is fully ruled

### 裁-88 · G13 — beta runs the whole checkout journey on Stripe TEST mode; KYB moves to the launch sitting

*(G13 is minted at this sitting — the merged gate record runs G1…G12; the record gains its own
`G13 · NEW` row at the G1(B) redesign round, under the record's existing `· NEW` convention.)*

**Ruling (two acts in one sitting; the second supersedes the first's KYB timing).** First act: at RM0
the signup journey still runs through Stripe rather than a bypass (option A of the G13 grill — no
"free-plan skips checkout" wall is ever built; a bypass is a hole's shape). Second act, superseding
the KYB timing: **beta serves that journey on the TEST-mode account** — "太麻烦了; pricing 定好并
official launch 我再做这个" — so **KYB/live activation is NOT a beta precondition**; it becomes a
**hard precondition of the pricing + official-launch sitting**, submitted early enough to absorb
Stripe's external review days (consistent with 裁-87's "TEST first; LIVE at the launch sitting").
Two costs recorded, both accepted: at RM0 a real customer must never be asked to type a test card —
payment-method collection is **config-driven** (`if_required` while the plan amount is 0, `always`
once priced; the billing brief's configurability law, not a hard-code — **this supersedes the
merged design part3's NIT-1 pin of `'always'`**, whose reason, 裁-58's "card collected, nothing
charged", applies once priced, not at RM0-on-TEST-mode) — and **every beta firm re-establishes
payment on live mode at the launch sitting** (a standing row on that sitting's checklist, minted
here).

### 裁-89 · G1 = (B) — the admission door folds into ONE transaction; 裁-73's wording amended

**Ruling.** claim → create-firm → close-registration is **one database transaction behind one
door**; the two-step mint-then-spend shape (and with it the repaired rotation) is retired before it
is ever built. 裁-73 is **amended in place**: the journey stays Checkout → signed idempotent
webhook → firm — only the admission-token seam between webhook and firm collapses. Grounds, from
the gate's three review rounds: the stranding class and M5's unreachable closer lived in the seam;
the fold **deletes `reconcile_paid_registrations` unbuilt** ("firm exists but registration open"
becomes unreachable, so the recovery door has no subject); a live bearer credential never enters
the application tier — the app↔DB hop is the wire with observability attached, the estate having
already been billed once for `token_hash` reaching ingress logs — continuing 裁-16b's direction
(at rest → in flight). Honestly scoped: the fold does **NOT** remove M7/G12's double payment
(settled at ⑦ before ⑧ runs; `uq_frp_registration` + the applier's duplicate-payment problem row
handle it under either shape). Consequence: a redesign round on the merged #473 documents (the
door, the battery cells W-D/W-K/W-P/W-P2 and W-E2's affected part, the gate record's G1/G13 rows,
part3's checkout-session row whose NIT-1 `'always'` pin 裁-88 supersedes, and the 裁-91/裁-92
reshapes below) with a **fresh** independent review, then the build.

### 裁-90 · G5 — the beta DPA text is delegated: the agent drafts, the owner pre-approves, the lawyer swaps at launch

**Ruling (against G5's recommendation (i); takes option (ii), the interim text — with the owner's
words kept, which is exactly the "ruling in writing" the gate record asked for before it would
carry (ii)).** The record's named cost is accepted: *a real agreement with real legal effect,
drafted by an AI, signed by real customers* — mitigated by the three constraints below and by the
lawyer's swap at the launch sitting. The DPA is the onboarding consent text a customer confirms at
signup — "like terms and conditions". The agent **drafts the bilingual (en/ms) beta text** from the
existing legal pack (`docs/ops/legal/`: the PDPA s.129 cross-border memo and the client
authorization letter as inputs) and the owner pre-approves it sight-unseen for beta — "你起草然后
不用再问我了, 我都通过" — under three binding constraints: it is a **plain, visible consent step**
(no dark patterns), it may not gate or alter any product or agentic functionality beyond the ruled
signup gate itself, and it is a **placeholder**: at the official-launch sitting the owner and his
lawyer finalise the real text and the agent swaps the template — mechanically a `dpa_documents`
version bump (the design's mid-flow pin already handles in-flight signups), never a schema change.

### 裁-91 · G11 — `stripe_events` stores a redacted projection; no customer PII lands in the database

**Ruling (per recommendation).** The webhook verifier checks the signature on the raw body, then
**projects and discards**: only reconciliation fields (event id, type, session/intent ids, amount,
currency, status, timestamps) are stored; `customer_details` and every other personal field stay
Stripe-side, where Stripe's own retention applies. PDPA's erasure right becomes structurally moot
for this table — the append-only, no-UPDATE/DELETE shape is kept AND nothing personal is inside it.
Cost accepted: dispute investigation reads the raw event in the Stripe dashboard, not the DB.

### 裁-92 · G10 — the signup confirmation is a 6-digit email code, not the device-bound link

**Ruling (against the recommendation — the owner weighs cross-device signup above the
cryptographic binding).** The confirmation mail carries a **6-digit one-time code** typed into the
originating browser (the `verifyOtp` API is already in use in the estate — but on the built
invite-accept's **`token_hash` link arm**, the very shape this ruling replaces; the
`{email, token}` 6-digit arm is NEW, and a build lane must not copy the link arm), so
laptop-signup + phone-mail works by transcription. Costs recorded and accepted: the binding is
weaker (a guessable code space, not a cryptographic verifier), so the **rate wall is mandatory**
(裁-36/裁-68) — the redesign must specify attempts-per-code, single-use, expiry, lockout, **and
G10(ii)'s own load-bearing clause: the email the code verifies against comes from the browser's
own signup state, never from a URL parameter** (sourced from a URL, the binding is to nothing and
the CSRF vector returns through a crafted URL), all as walls with RED-before cells; and B3's PKCE
failure-card work is superseded for signup (wrong-code / expired / too-many-attempts cards replace
it). The login-CSRF hole's link-click vector disappears with the link itself.

### 裁-93 · The package — every remaining gate question per its recommendation; ADR-0077 signed; the CSRF deferral endorsed

**Ruling.** Every remaining decision-sheet question and both declarations are ruled **per the
recommendation written on the sheet**; **ADR-0077 is SIGNED** (the lean ladder, already operating);
the R8 login-CSRF **deferral is ENDORSED** (its four fence pieces stand; 裁-92 changes the door the
fix lands in). One guard on the wholesale: the redesign round re-reads each recommendation and
**flags any invalidated by the fold or the OTP switch** rather than applying it stale.

## The 2026-09-01 morning ruling — 裁-94: the member-door rank walls (G14)

### 裁-94 · G14 — keep the wall: a subordinate never acts on a strict superior

**The finding (#455's fresh review, DB PR db/member-door-rank-walls).** `set_member_role`
(0145:592-620) compared only the ASSIGNED role to the caller, never the TARGET's current rank —
the existing F2 ceiling only stops an admin ASSIGNING 'owner', it says nothing about the rank of
who is being acted on; `remove_member` (0005:732-751) carried no rank comparison at all, never
re-cut since 0005; `revoke_invite` (0141:466-484) carried the identical two defects
(no rank wall, and reserved the op before its walls) one door over. Net (M1): an admin could
demote or remove any owner but the last in two clicks on #455's new surface, or revoke an
owner-issued invite an admin has no business touching. M2 sat alongside it: neither door refused
an actor acting on their own membership, a self-demotion/self-removal lockout foot-gun with no
recovery path but another owner.

**Ruling (per the recommendation — KEEP THE WALL).** A subordinate never acts on a strict
superior: all three doors now refuse when the target's CURRENT rank (the invite's own `role`
column, for `revoke_invite`, since there is no membership yet) is STRICTLY greater than the
caller's — equal rank stays allowed (owner-on-owner, admin-on-admin), mirroring the existing
assigned-role ceiling's own `>`. No self-demotion or self-removal on `set_member_role`/
`remove_member` (invites have no self case — there is no actor-in-place to self-act on). This is
the FAIL-CLOSED shape the DB PR shipped as its own default pending this ruling; it is now the
RULED shape, not a default awaiting confirmation, and the migration/battery are worded
accordingly. Cost accepted: an admin who genuinely needs to act on an owner — demote them,
remove them, or revoke that owner's pending invite — must ask another owner to do it; there is
no admin-side override, and the last-owner trigger (untouched by this PR) remains the separate,
final backstop underneath.
