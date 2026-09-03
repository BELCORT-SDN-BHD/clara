# The digest's re-truing log — dated minutes, append-only

**This file is NOT the law.** The standing laws live in `README.md` and govern; this file holds
the dated **re-truing minutes** that record *when* the digest was re-read against a new ADR and
*what* that reading found. They were split out of `README.md` on 2026-08-23 when that file hit
its 500-line ceiling — **every byte below is verbatim**, in the order it stood.

**The rule this file inherits:** a minute is a record of what was true on its date. It is
**append-only** — a later reading is a NEW dated entry, never an edit to an old one. When a
minute names a fact that has since changed (a law "enters the ratified set at the owner's next
sign-off" that has since been ratified), that is not rot: the current status lives in the law
entry itself, in `README.md`.

Read `README.md` first. Come here only to answer "when did this change, and what did the
re-reading find?"

---

## The sign-off anchor (kept in README.md, repeated here for reading order)

> **SIGNED OFF — Tao (BELCORT), 2026-08-12.** Laws 1-67 are ratified as the current standing set
> at the ADR-0069 harness refactor. Additions or supersessions land as new ADR entries; this
> digest is re-trued whenever one does.

## The dated minutes (moved verbatim from `README.md`, 2026-08-23)

> **RE-TRUED 2026-08-16 (the Wave-E clock-out):** laws 68-70 fold ADR-0070's wave-close
> supplement (rulings 10-13) into the digest; they carry the standing status of their
> source ADR and enter the ratified set at the owner's next digest sign-off.

> **RE-TRUED 2026-08-18 (ADR-0071, the Agentic Charter):** the owner's twelve-ruling
> grilling supersedes the clauses annotated below (nine annotations: laws 2, 3, 4, 5,
> 8, 12, 13, 14, 25) and folds laws 71-76 (§9). The supersessions were ruled in-session
> by the owner directly; the annotations here are the re-truing that ADR's own text
> mandates.

> **RE-TRUED 2026-08-20 (ADR-0072, the F-A2 rulings + the corpus sitting):** **no law
> changes, and that is the finding.** The night's five ruling blocks land entirely inside
> ADR-0071's existing scoping and re-confirm it at the two places it was most likely to be
> read wider than it was written: **law 71** binds at ANY amount with no threshold and no
> per-firm amount dial (0072 ②), and **law 4's human half is untouched** — the human lane
> keeps its distinct-checker gate on `is_year_end` and `tax_affecting` even though the agent
> lane is freed of it (0072 ③, supplementary). **Law 12** stays superseded-and-moot; 0072 ①
> fixes only WHEN the machinery it governed retires. Hard constraint 15's spike clause is
> superseded **prospectively** — at the Wave-G reset, after a cold archive — and is not
> lifted here; `AGENTS.md` stands unchanged until that ceremony.

> **RE-TRUED 2026-08-21 (ADR-0073, the CI economics overhaul):** law 77 folds below (§10). No existing law
> changes: law 26 (uniform review intensity) is expressly untouched — 0073 amends per-PR **CI scope**, not
> review scope — and law 39's named legs (deploy-onto-existing · freeze-lint · leak-scan · the DR round-trip)
> all stay per-PR. **Law 77 RATIFIED by the owner 2026-08-22 (digest sign-off).**

> **RE-TRUED 2026-08-22 (ADR-0074, the Track-A sitting):** laws 78-81 fold below (§11) and laws 2 (invariant
> (a)), 21, 71 and 76 are amended in place — **all eight RATIFIED 2026-08-22 (owner), with law 78 carrying the
> rider R-TA-P1-walls.** The three CONSTITUTIONAL ones are ratified as LAW here; the product-text homes
> (PRD §6.2(a) · ARCHITECTURE §0.1) were **amended to match in #287**, `AGENTS.md` stays FLAGGED — this
> digest governs. TA-P2 routes AROUND law 1; constraints 12/13 re-confirmed.

> **RE-TRUED 2026-08-23 (ADR-0075, the test-data authority):** law 82 folds as §12. **No existing law
> changes** — 0075 is an authority over DATA and over who WALKS a gate, never over a mechanism, and law 82
> says so in its own text. `AGENTS.md` hard constraints 12, 13 and 14 are re-scoped by that entry (12
> retired as a *named* constraint with the GENERIC name-only wall kept, 13 rewritten to
> operator-firm/resettable-fixture, 14 widened and still expiring at beta); the `0062`/`0063` migrations are
> untouched. Same session: this log was split out of `README.md` at its 500-line ceiling.

> **RE-TRUED 2026-08-23 (the harness-truing batch — no law changes, two records closed).** Law 79 gains a
> one-sentence **as-built caveat**: the live `assert_client_resolved` body still enforces
> `method in ('human','rule')` and `confidence >= 0.95` (`0018_gate_k_domain.sql:57,62`) until F-A7a recuts
> it, so the law and the shipped function are not read as agreeing before they do. And the **`AGENTS.md`
> home question for invariant (a) is DECIDED (b) by the owner: PRD §6 is the single home; `AGENTS.md`
> points at §6 and gains no duplicate clause.** That closes the last open item from the 2026-08-22
> ratification. The 2026-08-22 minute above still reads "`AGENTS.md` stays FLAGGED" — correct on its date,
> superseded here rather than rewritten.

## 2026-08-27 — the 磨合-window docs batch (ADR-0076 · law 83 · law 79's caveat trued)

> ADR-0076 mints the G1 universal wake-execution engine ruling (digest law 83, new §13), and
> §5/§10 gain the R4/R5/R7 addenda — all four owner-ruled 2026-08-26
> (`docs/plan/active/harness-audit-rulings-2026-08-26.md`). **Law 79's as-built caveat is
> TRUED**: the F-A7 α recut shipped at `0125` (`method in ('human','rule','judgement')`,
> `0125_f_a7_alpha2_judgement_recut.sql:184,209`), so the caveat no longer says "until F-A7a
> recuts it" — the `>= 0.95` conjunct stays as R1's harmless failsafe (judgement confidence
> mints pinned 1.0) until its Backlogged follow-up migration. The 2026-08-23 minute above
> quotes the pre-recut wording — correct on its date, superseded here rather than rewritten.

## 2026-09-02 — the pre-pause truing sweep (ADR-0077's missed minute · 裁-111 folded)

> Written at the owner-ordered quiet-window sweep (seven read-only drift-scan lanes over the
> whole harness). Two digest changes minuted: **(1) the ADR-0077 fold finally gets its
> minute** — 0077 (signed 2026-08-31 evening, 裁-93) folded laws 84-85 into §14 directly with
> no dated minute at the time; this entry records that fold retroactively, honestly late.
> **(2) Law 28's cross-family read-only leg is TIME-BOXED SUSPENDED until beta live**
> (裁-111, owner, 2026-09-01, `docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md`) — the
> digest's law-28 entry and §14's "Law 28 KEPT" clause both gain the suspension note; the
> opus lane is the complete review gate for the sprint, Codex stays a BUILD lane. ADR-0077's
> own title line and point 8 predate 裁-111 and now read stale on the review-leg clause —
> correct on their date, superseded by the ledger rather than rewritten (this file's own
> convention). The sweep found the digest otherwise current: the five newest ADR one-liners
> (0073…0077) match their ADRs; ADR-061's uniform intensity (law 26) is untouched by 裁-111.

## 2026-09-02 — the beta checkpoint sitting minted NO digest law (裁-115 … 裁-128)

> Written at the checkpoint truing so a later reader does not hunt: the fourteen rulings of
> the 2026-09-02 morning sitting (`docs/plan/active/mohe-grill-rulings-2026-09-02.md`, §"The
> 2026-09-02 checkpoint sitting") are SPRINT rulings — scope, sequencing, the Stripe sandbox,
> the legal-template posture, the archive of the parked backend queue — and none of them
> amends a digest law or an ADR. Two touch standing text elsewhere and are recorded there:
> 裁-125 (agent-authored legal templates for beta, lawyer-refined at official launch — a
> posture under ADR-0077's "TEST-mode beta, KYB at launch", not a new law) lives in the
> ledger + `PROGRESS.md`'s posture; 裁-123's cleanup incident corrected a Known-issues LAW
> line in `PROGRESS.md` (`git worktree remove --force` follows junctions on this host). The
> digest's law-28 suspension note (裁-111) is unchanged and still time-boxed to beta live.

## 2026-09-02 — CI moves to GitHub-hosted runners (裁-135); ADR-0073's levers survive, its host does not

> Written at the hosted-runner migration. **No digest law changes, and that is the finding.**
> Law 77 (§10, source ADR-0073) governs per-PR CI *scope* — which gates run per-PR, which
> demote to the weekly sweep, and that the required check `ci` is a fail-closed meta-gate. The
> migration moves every job from the four self-hosted WSL2 runner instances to GitHub-hosted
> `ubuntu-latest` and changes **none** of that: the same nine jobs plus the meta-gate, the same
> docs-only classifier, the same sweep-only cadence, the same step bodies.
>
> **What the move DOES supersede is an economics premise, not a law.** ADR-0073's lever 3
> (caching) and the `docs/ops/ci-runner.md` line "hybrid GitHub-hosted runners were considered
> and DECLINED — the $0 preference stands" were both written for hardware we owned, where
> minutes were free and a local pnpm store could stay warm between jobs. The owner reversed
> that preference at 裁-135 (2026-09-02) — merge speed for the beta sprint, over the $0
> preference and over the 2026-08-11 "hard no" on a public repo. **ADR-0073's text is untouched
> and its three levers all survive the move**: the closed-wave sweep demotion, the parallel job
> split (now genuinely parallel — one fresh VM per job rather than 4-wide across a shared
> fleet), and the fail-closed meta-gate. Only lever 3's hosting assumption lapsed, and the
> local store was replaced by the `setup-node` action's own `cache: pnpm`.
>
> Two further records, so a later reader is not misled by documents that were true on their
> date: the **runner law in `AGENTS.md`** ("private-repo only; decommission the runner first")
> is amended by 裁-135 in substance rather than repealed — no event routes to those runners any
> more, so fork code cannot reach that hardware, and the residual rule (never re-point them at
> `pull_request` while the repo is public) is recorded in `docs/ops/ci-runner.md`. And the
> **裁-134 per-slot concurrency cap** (2026-09-02 17:50, PR #513) is **superseded and moot** —
> a slot cap rations a fixed fleet, and hosted runners have no fleet; its one genuinely
> load-bearing half, exempting `push`-to-main from cancellation, is carried forward in the
> re-cut workflow-level concurrency block.
>
> One clause is carried forward on a NEW basis rather than by inheritance, and the change of
> basis is the point. 裁-134's alignment clause (b) — *"pushes to main are never cancelled or
> capped"* — was ruled against a **zero-spend** fleet, where the cost of N concurrent main
> pipelines was runner contention. On hosted runners that cost becomes billed minutes while the
> repo is private, and nothing at all once it is public. The clause therefore does not survive
> automatically; it is **re-ruled on the bisect argument**: each merge's run verifies a
> DIFFERENT tree, and per-commit granularity is what lets a bisect say which merge broke main,
> so cancelling a superseded main run buys minutes and throws that away. Recorded in `ci.yml`
> and `docs/ops/ci-runner.md` rather than left implied — the #513 review's finding that the fix
> shipped there with its cost unstated.

## 2026-09-03 — how a sprint ruling enters the ADR system (裁-140): digest rows + "amended by" lines

> **The question the owner settled.** The 磨合 ledgers hold forty-odd rulings since 2026-08-31.
> An ADR records a decision that mints standing law; a sprint ruling usually AMENDS an ADR's law
> for a time box. Until now neither shape had a home: the 2026-09-02 minute above could honestly
> say "no digest law changes" only because the day's law-changing rulings were being carried by
> the ledger alone. **裁-140 rules the mechanism, not the rulings:** one row in `README.md`'s
> standing-laws section per law-changing ruling, one dated line here, an "amended by 裁-N" line
> on the ADR whose law is amended — and **no new ADR** unless a ruling contradicts an ADR's text
> outright AND permanently. The ledger stays the source of truth for each ruling's text; a row
> that disagrees with its ledger entry is the row that is wrong. A consolidating ADR was offered
> and DECLINED (one more file to maintain, and most of these expire at beta live).
>
> **What this reading changed in `README.md`.** A new **§15** carries eight rows, each with its
> time box and its ledger pointer: **裁-111** (09-01) law 28's cross-family Codex review leg
> suspended *until beta live* · **裁-125** (09-02) beta legal texts are agent templates, never
> darkened, *until official launch* · **裁-129** (09-02) the terms are a separate document kind,
> RM 5,000 floor, KL courts · **裁-131** (09-02) Email OTP expiry 60 minutes for both arms, C4
> amended · **裁-133** (09-02) no Codex lane of any kind, native only, *until beta live* ·
> **裁-135** (09-02) the repo is public and CI is hosted, the owner overriding the 裁-134
> recommendation · **裁-139** (09-02) a firm member is refused at checkout before Stripe is
> called. Two existing laws gained their "amended by" lines in place: **law 28** (裁-133 widens
> 裁-111's suspension from the review leg to the BUILD lane) and **law 38** (裁-135 — the
> private-repo-only runner law; the four instances stay registered but no event routes to them,
> and the residual rule is "never re-point them at `pull_request` while the repo is public").
> §14's ADR-0077 supplement carries the same pointer, so the amendment is visible from the ADR
> it amends rather than only from the ledger. **裁-135 already had its own full minute above**
> (2026-09-02) and is not re-minuted here — §15 gives it the row the ruling now requires.
>
> **What did NOT change.** No law text was rewritten and nothing was deleted: every amendment is
> additive and dated, which is what keeps a later reader able to see the law as it stood. The
> 2026-09-02 minute's sentence that "none of them amends a digest law" stands as a record of what
> was true on its date (this file is append-only); 裁-140 is the decision that gives the
> law-changing subset a home. And no new ADR was minted, which is the ruling's whole point.
>
> **First use of the new mechanism, the same night: 裁-141** *(2026-09-03 ~00:10; permanent)*
> **amends 裁-37** and therefore takes a §15 row rather than an ADR. 裁-37 put the ⌘K "Do" actions
> behind `clara.wake_fn_allowlist` and, in the same breath, forbade a new mechanism — but that table
> is invisible to application roles by `0002`'s design, so reading it from the web would need exactly
> the new SECURITY DEFINER door the ruling forbids. The owner resolved the two halves rather than
> picking one: the palette pre-filters on the caller's DB-computed role rank plus each door's floor
> transcribed into the web, **and a DRIFT GUARD is required** — a cell pinning every transcribed
> floor to the live door's, because a projection of a door is exactly law 27(3)'s "spelling is not
> identity". The door remains the only authority, so the residual risk of drift is cosmetic. This is
> the shape 裁-140 was ruled for: an amendment recorded where the amended law lives, at the cost of
> one row and one line.
>
> **Ledger housekeeping, recorded because the pointers moved.** The 2026-09-02 ledger passed the
> repo's 500-line document ceiling, so it was split at 裁-132 into
> `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md` — byte-for-byte, verified against the
> committed blob — following the `-09-01` → `-09-01-pm` precedent. 裁-129…131 stay in the `-09-02`
> file because that is where they landed (#506). §15's rows, law 28's and law 38's "amended by"
> lines and `AGENTS.md`'s ledger chain all name the file each ruling actually lives in.

## 2026-09-03 — 裁-114 gets the §15 row it was owed, carrying 裁-142's errata

> **裁-114** (2026-09-02 morning — PRD §6's split-trust corollary re-stated to "the wall that
> actually holds", and invariant 16 split into 16(a) document/OCR egress and 16(b) trace export)
> **was never given a §15 row**, unlike 裁-111/125/129/131/133/135/139/141: measured
> `git grep -c 裁-114 docs/adr/README.md docs/adr/README-log.md` = 0 in both, and neither
> "split-trust" nor "the wall that actually holds" appeared here under any other law name, so there
> was no existing row to amend — the ruling was executed in the law documents (§6's "Split-trust
> corollary" and ARCHITECTURE §1's runtime line both cite the number) while the digest that
> indexes it stayed silent.
> Added now per 裁-140, in §15's own row shape, with the ledger entry as the source of truth and
> **carrying 裁-142's amended-by note** (2026-09-03): the premise's example named
> `STRIPE_WEBHOOK_SECRET`, which is runtime/Fly env rather than `apps/web`'s — 裁-126 routes the
> `whsec_` value to Fly secrets and 裁-93 had already ruled the webhook to `packages/runtime`
> before 裁-114 was written; `apps/web`'s real FS-4 credential is `STRIPE_SECRET_KEY`. **The ruling
> stands**: a wrong illustration does not move the wall it illustrates. The two law documents
> inherited the same wrong example and were **corrected by #526 (裁-142, owner 2026-09-03; MERGED
> `5d70b8dd`)** — the owner's ruling, not a lead's errata, which is why they waited: PRD §6's
> Split-trust corollary now reads "example corrected by 裁-142" and names `STRIPE_SECRET_KEY`, and
> ARCHITECTURE §1 names `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` while marking
> `STRIPE_WEBHOOK_SECRET` as RUNTIME env. This minute records the missing row, not a new decision.

## 2026-09-03 — 裁-143: the OPERATOR tier and its hard cap enter the product law

> **裁-143** (owner, ~15:05 MYT, on B2 of the harness scan — *"照建議。"*): the **OPERATOR tier**
> — BELCORT, the one firm whose `clara.firms.is_operator` is true — is written into
> `docs/product/PRD.md` §2 and into §4 beside item 1 as a **separate tier beside the four
> permission levels, never a fifth level above the firm owner**, and as operational-support
> tooling rather than a product surface. Measured on the pre-ruling tree (`60f4eaf5`): zero hits
> for "operator firm" or `is_operator` in `PRD.md` and zero in `ARCHITECTURE.md`, so a shipped
> permission concept — live in the DB since `0133_g1_wake_engine.sql` — was readable only in SQL.
> **The hard cap**, as ruled: two read queues (registration applications · Stripe problem events)
> plus the single estate-wide wake-source control that reads no firm's data, and **never any
> figure of another firm's books**. **PRD §6 is untouched by design** — both queues are pre-firm
> admission-plane objects and no operator door reads a book table, so the cap points at invariant
> 2's existing tenancy wall rather than adding law text to §6; `docs/ARCHITECTURE.md` §3.3 names
> the same widening in one sentence beside the four structural invariants.
> The flag stays **default OFF and fail-closed**, carried by no firm today (裁-43), flipped only
> by the raw owner-run one-shot ceremony `docs/ops/g1-operator-firm-ceremony.md` — never an app
> screen or API — at FS-11's Wave-G reset (裁-121③).
> Recorded per 裁-140 (a digest row plus this dated line, no new ADR); the ledger entry in
> `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md` is the source of truth and governs on any
> divergence. **Anchor note:** the ruling's shorthand said "§4.1"; the PRD carries no such heading
> (§4 is a 21-item list whose only subsections are §4.94/§4.95/§4.96), so the tier landed as a
> named §4 subsection beside **item 1** — the self-serve-signup capability it belongs to — rather
> than as a newly minted section number.

## 2026-09-03 — 裁-144: billing's tier tranche goes to the backlog; beta live launches on the built half

> **裁-144** (owner, ≈15:18 MYT by the shell clock, on B3 of the same sitting — *"如果没有的话先放进
> backlog,把这个initial plan 记录清楚, 我们上市前在完备它, 我们betalivelaunch now. 至少现在有最基础的
> userflow now right?"*): billing's **TIER tranche is a BACKLOG item, completed before the official
> launch 上市 and NOT before beta live**. `docs/product/PRD.md` §8's billing cell is re-cut **in
> place, with the date** — the style §8's tax row already uses — into **BETA (built: Stripe Checkout
> + webhooks + the fail-closed admission gate + `clara.billing_plans`,
> `0163_checkout_gate_c3_folded_door.sql`, `amounts_ruled=false` → RM0/trial)** and **BEFORE 上市
> (backlog: paid seats, Active-Client slots, the shared firm-wide AI allowance in RM and its
> overage, invoicing — the tier tranche of `docs/plan/active/billing-design.md` §5, the rest of PR-1
> plus all of PR-2, and an AI usage ledger)**, with the unbuilt half stated in the future tense.
> **The census that prompted it:** zero files under `packages/db/migrations` carry
> `billing_usage_rates`, `firm_subscriptions`, `client_lifecycle_events`,
> `evaluate_firm_billing_v1`, `invoice_lines`, `get_firm_invoice` or `issue_invoice` — so §8's
> standing promise that "`issue_invoice` refuses" rested on a function that **does not exist** —
> that code census is the whole scope of the claim, and the name survives only in docs prose. It is
> re-worded to **"no invoice is issued in beta"**; the 裁-71④ scope note and every
> earlier citation (裁-42, 裁-50–56, 裁-57, 裁-58, 裁-68) are kept, and the ringgit amounts still
> defer to the pricing sitting (裁-58). The owner's closing question — 至少现在有最基础的 userflow now
> right? — is answered as a fact, not a ruling: yes, signup → the emailed confirmation code → the DPA
> signature → Stripe Checkout (sandbox, RM0) → a born firm, plus invites and /pending.
> Recorded per 裁-140 (a digest row plus this dated line, no new ADR); the ledger entry in
> `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md` governs on any divergence. The owner's own
> 2026-09-03 billing text is still OWED as a plan record beside the 08-30 design set — named in the
> ruling as docs/plan/active/billing-model-owner-spec-2026-09-03.md, measured **not on disk** at this
> commit, so it is written bare here and no citation to it was planted.

## 2026-09-03 — 裁-145: the signup gate names five items, and the email-bound token is retired

> **裁-145** (owner, ≈15:27 MYT by the shell clock, on B4 — *"照建议, btw: 第一步的Supabase 寄確認信使用
> 什么服务? supabase 有原生的? 还是也是resend?"*): `docs/product/PRD.md` §9 item 3 is **annotated in
> place, with the date** — the "原地加日期" style §8's tax row already uses. The tier-3 gate composition
> that 裁-57/58/68 fixed as *"DPA e-sign + rate wall + email-bound token + Stripe checkout success"*
> now names **FIVE** items: the fifth is the **Beta terms of service**
> (`docs/ops/legal/clara-beta-terms.md`), a separate document kind from the DPA and never one
> combined signature (裁-129), shipped as an agent template refined with a lawyer at official launch
> (裁-125). And one of the original four is **retired**: the **email-bound token** went with 裁-89's
> fold of claim → create-firm → close-registration into ONE transaction — *"no admission token
> survives"*, `docs/ARCHITECTURE.md` §1a — and was **never built**, measured 2026-09-03 as zero hits
> for `email_bound` / `email-bound` / `bound_token` across `apps/` and `packages/`. Four of the five
> are therefore live: DPA e-sign · Beta terms · rate wall · Stripe checkout success. The original
> sentence is kept for provenance, and 裁-58's open ringgit-amounts question is untouched, so item 3
> remains genuinely open rather than closed by an annotation.
> **The `btw` half, answered from the repo as a FACT (no ruling needed) — this is B5's subject:**
> step 1's confirmation mail is sent by **Supabase's own auth mailer**, triggered by
> **`supabase.auth.signUp`** (`apps/web/components/entry/signup-account-form.tsx`:167); the password
> reset rides the same mailer. The confirmation card's RESEND control is not the sender and sends
> nothing today — its seam always returns `{kind:"unavailable"}` pending a walled route handler.
> **Resend the vendor is wired for INVITATIONS only** — `RESEND_API_KEY` occurs in this repo solely
> on the invite path (`apps/web/lib/members/invite-mail.ts`, `apps/web/README.md`, `.env.example` and
> that path's tests), with zero occurrences in the registration/confirmation path. Whether that
> Supabase project has **custom SMTP** configured behind its mailer is a dashboard fact, not
> measurable from the repo, and is not asserted here.
> Recorded per 裁-140 (a digest row plus this dated line, no new ADR); the ledger entry in
> `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md` governs on any divergence.

## 2026-09-03 — 裁-146: Supabase Auth's SMTP is pointed at Resend, and "Mail" becomes a launch gate

> **裁-146** (owner, ≈15:51 MYT by the shell clock, on B5 of the same §9 sitting that produced
> 裁-143/144/145 — *"B5照建议"*): the harness now states **who sends what**. **Signup confirmation and
> password reset** are sent by **Supabase Auth's own mailer over CUSTOM SMTP pointed at Resend** —
> host smtp.resend.com, username the literal string `resend`, password a Resend API key the owner
> enters at Authentication → SMTP Settings or through the Management API,
> PATCH /v1/projects/{ref}/config/auth, with his personal access token at FS-11; never in the repo,
> never printed. **Invitations** are sent by the **Resend API from the server-only invite route**. The
> **sender** is a no-reply mailbox on **mail.clarabook.com** — read out of the owner's Resend
> dashboard on 2026-09-03, where it is the ONE entry and its status is Verified — which is also the
> domain `INVITE_MAIL_FROM` must carry, so the estate has ONE verified sending identity. The repo
> pins no domain (that variable ships blank in `apps/web/.env.example`), and the sending subdomain is
> deliberately not the app origin app.clarabook.com.
> **The premise, from the official auth-smtp guide (re-read 2026-09-03 via Context7):** the DEFAULT
> Supabase mailer refuses every address outside the project's organisation team (*Email address not
> authorized*), sends **2 messages per hour**, carries **no SLA**, and is documented as "not meant for
> production". The failure mode is silent from the app's side — `supabase.auth.signUp` resolves
> normally and the UI paints "check your email" — so it cannot be found by testing with the team's own
> mailboxes, which is exactly what a default-mailer project can deliver to.
> **The repo half, measured on `d4881052`:** the confirmation mail is triggered by
> `supabase.auth.signUp` at `apps/web/components/entry/signup-account-form.tsx:167`; password reset by
> `resetPasswordForEmail` at `apps/web/components/entry/password-recovery-form.tsx:41`; invitations by
> `apps/web/app/api/invite/route.ts` through `apps/web/lib/members/invite-mail.ts`. **This CORROBORATES a point of
> fact in the 裁-145 minute above** rather than correcting it: that minute first named
> `supabase.auth.resend` as the confirmation path, and #535's own review fold has since corrected it
> in all three of its carriers (measured on that PR's head `303f8586`), so in either merge order
> nothing is left to correct. No live code calls resend — `requestConfirmationResend`
> (`apps/web/lib/registration/confirmation-resend.ts:52`) returns `{kind:"unavailable"}`
> unconditionally; `git grep` finds the string in exactly three files under `apps/` (two modules plus
> a README line), and every other occurrence is document prose — the ADR digests and the ruling
> ledgers — none of it a send path. The repo-wide number is left unstated on purpose: it moves
> whenever a ruling writes about the defect. 裁-145's ruling and its conclusion were never in
> question.
> **The gate, which is the operative half:** Wave-G's "Mail" line certifies **only after a real signup
> confirmation is sent to and received at a NON-team address through the custom SMTP** — not on a
> settings screenshot, and not on a message delivered to a team address, which is what the default
> mailer would also have done. The owner act is placed BEFORE the walk in
> `docs/ops/wave-g-setup-checklist.md`, and it has two steps, not one: configure the SMTP, then raise
> the auth mail rate limit, which Supabase sets to **30 messages/hour** the moment custom SMTP is
> saved (the same guide). From there the delivery cap is the **Resend plan's**, never Supabase's
> 2/hour.
> Recorded per 裁-140 (a §15 row plus this dated line, no new ADR). The ledger entry in
> `docs/plan/active/mohe-grill-rulings-2026-09-03.md` — the NINTH ledger, opened at the `-09-02-pm`
> file's 500-line ceiling — is the source of truth and governs on any divergence. **裁-102 is NOT
> closed by this**: the server-side wall on the signup send path remains unbuilt, and
> `docs/plan/active/security-pass-2026-09-02.md` item 6 says so in its re-cut form.
> **The owner's acts of the same afternoon, at their true weight.** **MEASURED:** custom SMTP was
> configured ≈16:08 MYT (Enable custom SMTP ON, host smtp.resend.com, sender
> no-reply@mail.clarabook.com, sender name Clara; port, username and password below the fold and not
> read back), and at **≈16:55** a Supabase *Invite user* mail sent through it arrived at a private
> address OUTSIDE the project's Supabase team. That is the **Invite-user template arm, not the
> signup-code arm** — fired from the dashboard rather than the app's own courier path, a different
> template from *Confirm signup*, carrying a LINK where the confirmation arm must carry a CODE. The
> transport and the sender identity are therefore PROVEN and the *Email address not authorized* wall
> is retired as a measurement, while **the signup-confirmation arm is NOT certified and the gate
> stays open**: a working transport is a precondition of the gate, never the gate.
> **REPORTED, not measured (裁-112) — words only, no read-back, ≈17:00:** the test user deleted, the
> Rate Limits raise applied (**the raised value was not stated, so no number is recorded anywhere —
> unknown, not merely unverified**), and the *Confirm signup* template confirmed to carry
> `{{ .Token }}`. All three are read back at the Wave-G walk; the checklist's two proof-bearing boxes
> stay OPEN until then, because each names a Management API read as its proof.
