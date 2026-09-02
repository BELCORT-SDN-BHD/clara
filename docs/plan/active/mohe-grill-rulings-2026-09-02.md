# The 2026-09-02 rulings — the pre-pause truing sitting

> The seventh ledger, continuing `mohe-grill-rulings-2026-09-01-pm.md`. Context: the owner
> ordered the COMBINED PAUSE WINDOW open at ~02:30 MYT (vhdx compaction + the owner's Claude
> Code update — the session and every lane terminate, so state must be 100% in-repo), preceded
> by a full harness truing sweep (seven read-only drift-scan lanes over PROGRESS, the product
> law, AGENTS, the ADR digest, the plan index, the deferral census, and the ops READMEs). The
> sweep's corrections ship as the docs/harness-truing-2026-09-02 branch's PR — zero code
> lines, but the CI classifier scores it CODE (three README paths sit outside the docs path
> set), so it does NOT ride ADR-0069's docs-only lane: it takes the standing code ladder,
> which under 裁-111 is ONE fresh-context opus read-only review (no frontend surface, so no
> browser leg is owed) — and has had it. Resume map for the next session: `PROGRESS.md`'s 2026-09-02 posture + the
> evening state bridge in the `-09-01-pm` ledger.

## 裁-110 · RESERVED (recorded 2026-09-02 to close a silent numbering gap)

**The number was reserved in-session on 2026-09-01 for the cross-package test-guard proposal
and never written into any ledger** — the `-pm` ledger jumps 裁-109 → 裁-111, and a repo-wide
`git grep 裁-110` returned zero files until this entry. The subject: a standing guard for the
cross-package shared-DB test class (committed estate-global writes vs unscoped roster/singleton
reads under `pnpm -r` concurrency), which was fixed piecewise across #482 / #485 / #497 / #498 /
#501 during 2026-08-31…09-01. **The full proposal (incident table + the guard's shape) must be
AUTHORED INTO this ledger before it is put to the owner** — an unwritten proposal would be
re-derived from scratch after any compaction. Until that authoring, this entry and the
`PROGRESS.md` Backlog row are the number's only records. Status: PENDING AUTHORING, then
PENDING OWNER.

## 裁-114 · PRD §6 truing — both credential-law and egress-law texts corrected (owner, 2026-09-02)

**Asked at the pre-pause sweep via the grill protocol; the owner chose "both as recommended."**
The drift-scan's product-law lane found two §6 texts contradicting ruled-and-shipped reality:

1. **The split-trust corollary** (`PRD.md` §6 + `ARCHITECTURE.md` §1) read "service
   credentials live only in the agent service." False since P4-4: `apps/web`'s server-only
   invite Route Handler lawfully holds `SUPABASE_SERVICE_ROLE_KEY` (the repo's own
   `.env.example` was trued 2026-08-30; the law documents were not), and the owner-ruled FS-4
   design (裁-81/89) puts the Stripe webhook signing secret in `apps/web` too. **The ruling:
   the invariant is re-stated as the wall that actually holds — no service credential ever
   reaches a browser; no `NEXT_PUBLIC_`-prefixed variable ever carries one; `apps/web`'s
   server-only Route Handlers are a second, browser-isolated holder alongside the agent
   service.** The alternative (demanding the code move) was declined: it would reject the
   ruled checkout design.

2. **Invariant 16** was titled "client data egress is governed" but described ONLY
   observability-trace export, while the shipped governor of client-DOCUMENT egress — the
   typed, purpose-scoped consent subsystem (`0020_typed_consent.sql`, ADR-0040/0041, digest
   law 58) that the beta DPA itself cites — appeared nowhere in either law document (the word
   "consent" had zero hits in both). **The ruling: split into 16(a) document/OCR egress
   (typed consent + separate owner activation, re-checked at dispatch) and 16(b) trace export
   (the existing ADR-011 text); ARCHITECTURE gains the matching subsection.**

Cost stated at the ask: zero code lines, riding the truing PR's one-opus-review ladder (the
classifier scores that PR CODE — see the header note; not ADR-0069's lane). Both texts are truings of
already-ruled decisions, not new policy — the DECISION here is that the law documents say so.

---

# The 2026-09-02 checkpoint sitting (morning, ~08:00–10:30 MYT) — 裁-115 … 裁-128

> **Context.** The pause window closed with the owner's "CONTINUE"; the truing PR #503 merged at
> 21:16:59Z (05:17 MYT) as `33e94855`, one merge behind `#484`/`0160` and therefore carrying four rows
> that call #484 an open red gate — trued by the checkpoint PR this sitting produced. The sitting
> opened on a 17-lane read-only scan (111 agents; every BLOCKER/MATERIAL finding refuted-first by an
> independent opus verifier; a completeness critic) whose owner-facing artifact is the "Clara Beta
> Runway" page (claude.ai artifact `62831308-47ad-4f29-b1c1-f8f446db762b` — re-published 23:25 after a
> terminal re-login orphaned the session's artifacts; the content is the same page, refreshed through the
> day, and the original `ff4b0d54…` link is dead). Every question below was
> put ONE AT A TIME with the recommendation first and the cost stated (the grill protocol). Each entry
> names whether the owner followed or overrode the recommendation. Landed the same day in
> `docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md` (FS-9, pre-run by the scan),
> `security-pass-2026-09-02.md` (裁-120) and `dashboard-web-capability-diff-2026-09-02.md` (裁-121①).

## 裁-115 · The frontend-first order to beta live is RE-CONFIRMED (owner, per recommendation)
The 09-01 standing order stands: #493 → C-5 → Lane B → the P6 trains → FS-9 → FS-10 cutover →
FS-11 reduced Wave G → the launch sitting. The six parked backend PRs (#447 #448 #452 #456 #449
#460), the G1 clocks and Track B stay behind and do not gate beta. The alternative "drain the
small backend PRs in parallel" was declined for CI contention and the 3–4 heavy-lane host cap.

## 裁-116 · Gate bundle A — the three named tasks and the P6 trains GATE BETA (owner, per recommendation)
Beta-gating from this ruling: **task #14** the float-hook silent-zero across every money input,
widened to opening balances (`apps/web/components/journals/use-amount-input.ts:42-45`; folded
into P6-4) · **task #15** the Clara rail inset (the two-pane law; `ClaraRail.tsx:61` is a `fixed`
overlay open by default) · **task #16** P4-6 nav wiring + the reverse-direction nav gate
(/admin/members was an orphan route: no nav link, no ⌘K row) · **P6-3** the a11y + token finish,
widened to the a11y items this sitting's scan found (the skip link, `aria-busy` on loading
regions, the nested live regions in the Clara thread, the dropdown menu's reduced-motion arm,
the drafts-queue focus halo) · **P6-4** ONE shared signed money input · **P6-5** the agentic
finish · **P6-6** the identity finish. **P6-R** (the hygiene-panel ride-along) gates only if a
lane is idle. Cost stated: ≈4.5 lane-units. The three tasks had existed only as one sentence in
the 09-01 evening bridge; this entry is their ruling of record, and their construction paths are
now PROGRESS rows.

## 裁-117 · The four prototype-parity holes GATE BETA; one thread per altitude is the beta shape (owner, per recommendation)
(a) The Clara rail sits ABOVE the client-scope provider, so an unsent composer draft and the
previous client's transcript survive a client switch (cross-client, intra-firm), and the rail
silently adopts the NEWEST firm-shared thread — possibly a colleague's — into which the user
then posts (`apps/web/lib/clara/useActiveThread.ts:28`; `threadStore.ts:59`): fixed before beta.
(b) The client workspace never shows the client's name (only the UUID in the URL): the name
renders in the workspace header (accounting-correctness under constraint 1 — a wrong-client
post). (c) No route-level error boundary exists; `app/(firm)/error.tsx` + `app/(full)/error.tsx`
land before cutover. (d) Password recovery exists nowhere (no route, no `resetPasswordForEmail`,
no template, no allowlist entry): built before beta (one entry face + a Supabase template + one
redirect-allowlist entry — the owner supplies the console half). **Ruled beta shape:** ONE
thread per altitude — HANDOFF §2's "persistent, parallel threads" and the old dashboard's
session list are DIVERGED BY RULING; the thread switcher is post-beta. The rail's re-point to a
colleague's shared thread is fixed now as part of (a). Cost stated ≈0.6 units.

## 裁-118 · FS-7 echelon 2 — the PDF render worker + ONE generic download door GATES BETA (owner, per recommendation)
`PROGRESS.md` had twice called the download door "non-gating, sequenced after" with no 裁 behind
the words, while 裁-77 says the item "decides whether a beta client receives a management-accounts
PDF at all" and the sixteen-step definition of done names "management-accounts PDF downloaded" as
step 15. Ruled IN: the byte-burn render worker end to end (the substitution seam, the watermark
burned into the pixels, the byte-hash receipt) + the ONE generic server-side download door over
both artifact families (裁-96②), built by an opus lane, in parallel with the frontend lanes. Cost
stated: the order's 0.6 units is a pre-measure figure (the sibling close-chat slice re-measured at
≈4.5); the true cost is measured at rung 0.

## 裁-119 · Q-D6 — the close-seal wall while the deferred-opening banner is up is BUILT before beta (owner, per recommendation)
The owner's own 2026-08-27 ruling (`fa7b-gate-record.md:44-46`: a close may NOT seal while the
deferred-opening banner is up; drawer 1, absolute, no override door) was never assigned a build
home: `finalize_close`'s live body (`0128:128`) falls through on a null prior FY and stamps the
receipt `basis: wave_b_opening_machinery — the seed tie was asserted at approval`, an assertion
that never ran for a seed-less client; the close-gate catalog has no row; F-A7b Annex A's six PRs
name nobody. Ruled: one DB PR (a drawer-1 gate row + cells; a `finalize_close` recut only if the
gate framework cannot express it), ≈0.3 units, applying at the Wave-G reset. Constraint 1.

## 裁-120 · One extra opus security pass over #493's doors + the runtime chat authorisation (owner, per recommendation)
Beyond #493's own fresh-context review (which carries the security lens as standard), one
read-only opus pass over the nine new C-3 objects, `packages/runtime/lib/authz.mjs`,
`packages/runtime/src/chatRoutes.ts`, the session-continuation authority and the thread↔client identity shape
(IA-06/IA-10 of the scan), filed as `docs/plan/active/security-pass-2026-09-02.md` so the
evidence survives the session. Cost: one review lane beside the build lanes.

## 裁-121 · Three cutover items (owner, all three per recommendation)
① A read-only capability diff `apps/dashboard` → `apps/web`, route by route and door by door,
before FS-10's order is written (the cutover's acceptance classifies 61 TEST SUITES, not UI
capability; two losses were already known: the chat session list / new-session / share controls,
and `create_firm`'s only caller). Filed as `dashboard-web-capability-diff-2026-09-02.md`.
② **OPS.x becomes an FS-10 acceptance line**, not a CI PR: the Workers deploy of `apps/web`
carries a parts union ⊇ the serving runtime's emittable kinds, re-checked at every future `_vN`
bump. ③ **BELCORT's `is_operator` flag is set at the Wave-G reset as its own ceremony step**
(runbook `docs/ops/g1-operator-firm-ceremony.md`), reconciling 裁-43/裁-59 (which put it inside the
G1 three-switch ceremony) with 裁-76 (which moved that ceremony post-beta) — the operator-walled
surfaces (`approve_firm_registration`, the Stripe problem verbs, `set_wake_source_enabled`) are
beta surfaces. *Owner clarification recorded:* the operator MECHANISM is built (`firms.is_operator`
+ `uq_firms_one_operator`, 0133; the walled verbs in 0133/0141/0145/0160; /admin/registrations
in `apps/web`); only the one-time flagging act is outstanding, and nothing about it is handled
"from coding" — after the flag, BELCORT's owner account operates through the product's audited
doors. Under 裁-68 self-serve paid signups need no operator approval; the queue is the fallback
path.

## 裁-122 · The Wave-G setup checklist is TRUED NOW and RE-WALKED WITH PROOFS at FS-11 (owner, per recommendation)
The 09-01-pm verbal "all four ops cards done" stood against a checklist with 0/31 boxes ticked, no
retained proof, no Cloudflare item at all (that act lives in the handoff §7), and a Supabase
confirm-signup line still describing the `token_hash` link form that 裁-92 retired for the 6-digit
code. Ruled: true the checklist this session (add the Cloudflare section, the 裁-92 template line,
the is_operator step per 裁-121③, the OPS.x line, "every proof lands in the Wave-G as-run"); at
FS-11 each box is ticked with its proof artifact — by the owner, or by the agent as delegate
through the real consoles where the checklist allows. The alternative "accept the verbal DONE"
was declined because the ambiguity sits on the auth surface.

## 裁-123 · The disk plan (owner; three tiers per recommendation, two owner amendments)
Done before the sitting: 33.8 GB of dead rig volumes pruned inside WSL; 17 ancestry-proven
redundant worktrees removed — with one INCIDENT: `git worktree remove --force` deleted THROUGH a
lane's `node_modules` junction and gutted the main checkout's `apps/web` install (tracked files
untouched; repaired by a link-aware clean-remove + `pnpm install --frozen-lockfile`; the 09-01
lesson that called the command junction-safe is CORRECTED — the only safe primitive is "unlink
every reparse point first, then delete"; scratchpad/wt-clean.mjs is the pattern, and the
post-flight is a node_modules PROBE, never `git status` alone). Ruled: (a) the WSL disk-file
compaction (66 GB file, 16 GB used inside) is scheduled in the first idle window after the
cascade lands — the owner's elevated `diskpart`, runners stopped for the minutes it takes;
(b) the five ASK worktrees are removed, the #482 round-2 correction kept as a patch IF it is
right (owner: "如果確定是錯的也删了吧" — measured before deciding); (c) the dead owner-preview stand
(`main@13bc5c03`, no listener on 3100) is dropped and re-stood after #493 lands; (d) — **owner
amendment, overriding the recommendation to keep it** — the old sprint scratchpad is deleted,
and **the six parked backend PRs are ARCHIVED and CLOSED** for post-beta re-integration
("擇日重新完美 integrate"): each worktree's uncommitted round is WIP-committed and pushed to its
branch (or a `-parked-round-2026-09-02` sibling ref where the local branch was behind origin),
the verify-bar notes are posted as PR comments, the PR is closed with the resume recipe
(branch + `PROGRESS.md` row), and only then is the worktree removed. Zero loss by construction:
git + GitHub are the record, per constraint 8.

## 裁-124 · Credentials and the two untracked directories (owner; one amendment)
The scan found plaintext credentials in machine-local agent configs (a GitHub OAuth token in
`~/.codex/config.toml`; another plus a classic personal access token in `~/.claude.json`; a
21st.dev key stored twice and already reported reset). **Owner amendment: the tokens still in
use are NOT rotated** ("有效的 token 不用 rotate") — recorded as an accepted residual in Known
issues, outside every repo gate's scope. Per recommendation: `.codex/config.toml` (two MCP mounts,
no secret; Codex CLI reads the project-local file) is TRACKED; .agents/ (the generated Codex
skills mirror) is gitignored, and its five corrupted skill bodies — rewritten to name models that
do not exist ("Codex-sonnet-5", "Codex-opus-5", a `Codex --bg` command) — were restored from the
tracked `.claude/skills` sources the same morning.

## 裁-125 · Legal documents for beta (owner ruling, in the owner's words)
"所有的文件 like KYB（我 live official launch 換去真正收錢的時候再處理）or user term and condition 都是用
agent 的模板，不可以 dark or 閹割任何功能，也是 official live launch 的時候精進 or refine agent 做出來的模板
with 律師." Recorded as: KYB is handled at the switch to real money (consistent with 裁-88); the
DPA (裁-90), the user terms and every user-facing legal text are the agent's templates for beta,
refined with the lawyer at the official live launch; **no feature is dark-launched or cut for
beta** on legal grounds. Measured the same sitting: `docs/ops/legal/` holds no user-terms
template — an opus drafting lane produces `clara-beta-terms.md` (a template marked `[LAWYER]`
per clause), and the question of whether the terms ride the DPA's versioned store as a second
document kind or a combined "Beta Agreement" body is decided at Lane B with 裁-90's byte-identity
law in view.

## 裁-126 · Stripe for beta: the sandbox account, the key today (owner, per recommendation, after a plain-language walkthrough)
The whole beta checkout journey runs in Stripe TEST mode on the separate sandbox account
"BELCORT 沙盒" (`acct_1UAOhtHD90w0k86X`; isolated from the real account by construction); the
launch sitting re-creates the objects in BELCORT live mode with the ruled price. The owner set
the TEST restricted key in the machine's USER environment as `STRIPE_SECRET_KEY` the same
morning (name only; the value is never seen or printed by any agent). The webhook signing secret
is the owner's dashboard act once C-5's route is deployed (`whsec_` → Fly secrets, env-to-env).
**Receipt — objects created through the session's Stripe connector from the `billing_plans` seed
row (`local_key='clara-beta-2026'`, MYR 0, `amounts_ruled=false`), never hand-authored:**
Product `prod_VBS7ZUaIFPedCs` ("Clara Beta"), Price `price_1UB5DZHD90w0k86XNfkgYPWq` (MYR 0 /
month, recurring); both carry the local key and the ruling numbers in metadata; C-5 seeds them
into `clara.stripe_object_map`. Stripe Tax stays off per 裁-54 until BELCORT's SST registration
status says otherwise.

## 裁-127 · The five open owner-batch items are POST-BETA, each with a Backlog row (owner: "这些会影响 beta 吗? 没有的话就跟 recommendation")
Measured: none affects beta. 91b (the compat-door drain horizon) and 94 (the bank-agent cadence)
attach to code that is not on `main` (#456/#449, parked); 96 is a docs pointer in a frozen
contract; 97 (section-only COA families) stays fail-closed and no beta UI can author such a
family; 84 (actor-scoped op_key hashing on governed doors) is low-risk because a differing
reason text already refuses. Each gets its own row so none silently ages.

## 裁-128 · The onboarding checklist's "apply the standard chart of accounts" button GATES BETA (owner, per recommendation)
Surfaced while answering the owner's item-97 clarification: the interview mints the checklist
row `coa_chart_apply`, the door `clara.apply_coa_template` (0156) exists, and the row renders
with NO control (`OnboardingItemRow` offers only `resolve_onboarding_plan_item`, disabled for a
non-pending item) — a shipped promise on happy-path step 5. Ruled IN: one dialog on the row
calling `apply_coa_template` with the keep/drop family fieldset the door already takes, refusals
verbatim, a receipt on the row; folds into P6-5 (≈0.2 units).


### 裁-129 — the beta terms of service: a separate document kind, a fixed RM 5,000 liability floor, the courts of Kuala Lumpur (owner, 2026-09-02 ~12:10 MYT)

**Context.** 裁-125 made every user-facing legal text an agent template for beta. The terms
template lane (opus) delivered `docs/ops/legal/clara-beta-terms.md` (844 lines, 27 `[LAWYER]`
markers, 35 `[verify]` occurrences of which three are meta-references) and surfaced three positions
only the owner can take.

**Recommendation put (followed):** adopt all three as drafted — (1) the terms are a SEPARATE
document kind from the DPA, never a combined body: combining would bundle a withdrawable PDPA
s.129(3)(a) consent with a non-withdrawable contract under one signature and would break the
byte-identity law's meaning (one digest over a mixture means a commercial edit invalidates every
firm's data-protection signature); cost = one additive migration (a `kind` column on the DPA
document store, the partial unique index becoming `(kind) where effective_to is null`) plus one
Lane-B surface line; (2) the liability cap is a fixed RM floor, not "fees paid" — beta fees are
RM0, so a fees-paid cap is a total exclusion in substance, void under s.29 Contracts Act 1950
(*CIMB Bank Bhd v Anthony Lawrence Bourke*, Federal Court); (3) disputes go to the courts of Kuala
Lumpur, not arbitration (both parties Malaysian, small disputes, arbitration cost > amount at stake).

**Ruling:** *"Adopt all three, floor RM 5,000 (Recommended)"* — separate kind + the additive
migration; **RM 5,000** as the liability floor placeholder for the lawyer; KL courts. Nothing is
darkened; the lawyer refines figure and wording at official launch (裁-125).

**Alignment:** the migration rides the next DB train that touches the DPA store (Lane B's own PR or
C-5's, whichever opens first — it is additive, UNNUMBERED until merge prep per 裁-108, and carries
its own RED-before cell: a terms row and the current DPA row must coexist under the per-kind index);
`sign_dpa`'s signature carrier gains the `kind` discriminator; the signup step presents BOTH
documents, each with its own byte-identity hash (裁-90 extends to the terms verbatim). The
`[LAWYER]`/`[verify]` markers stay in the template until the launch sitting; the RM 5,000 figure is
written into §10.3 as the placeholder value.


### 裁-130 — chat parity for beta: inline clarify answering + composer attachment are IN (owner, 2026-09-02 ~12:15 MYT)

**Context.** The dashboard→web capability diff (裁-121①, `docs/plan/active/dashboard-web-capability-diff-2026-09-02.md`)
found seven DROPPED-UNRECORDED capabilities. Five are post-beta with Backlog rows (the
`remap_bank_account_coa` control · adjustment templates' `p_replaces`/`p_schedule` hardcoded null ·
the onboarding plan's revision-history read · the document-tied deterministic opening-balance
parse path, every seed hardcoded to skip it — manual opening balances still work · the chat
session list, which 裁-117 already disposes of). Two sit beside the 16-step demo path: (a) answering
Clara's mid-turn `clarify` question INLINE — `PartRenderer.tsx` renders the part read-only and the
only answer control is the Journals tab's `InterruptionsPane`, so the conversation breaks in two;
(b) attaching a document from the chat composer — no affordance at all, though the wire type and
the runtime plumbing survive and the Documents upload works.

**Recommendation put (followed):** BOTH IN as one small Codex lane (≈1 unit, folded into P6-6):
inline answering is the agent's body language (PRD §5a); "这是发票" dropped into the composer is
the first thing every accountant will try.

**Ruling:** *"Both IN (Recommended)."* One Codex lane: the inline answer control on the clarify
card calling `answer_interruption` (the Journals-tab pane stays as the second door), the composer
attach control through the surviving runtime plumbing (same intake wall, same typed refusals as the
Documents upload — no new mechanism), a Playwright leg on both. The five post-beta items get their
Backlog row in this PR.


### 裁-131 — Email OTP expiry is 60 minutes for both arms; C4 amended (owner, 2026-09-02 ~13:20 MYT)

**Context.** The harness PR's fresh-context review (#506, M4) measured a collision the Wave-G
checklist had papered over: Supabase's *Email OTP expiry* is ONE project setting and governs BOTH the
six-digit confirmation code (`docs/plan/active/checkout-gate-design.md` §3.4 C4 shortened it from the
24-hour default to 10 minutes as a brute-force wall) AND the staff-invite token the Resend courier
delivers (`apps/web/lib/members/invite-mail.ts` mints it with `generateLink`; Supabase sends nothing
on that arm). `apps/web/README.md` §3 asks only "≤ 24h" for invites; at 10 minutes an invitee who
opens the mail later finds a dead link and no re-send door exists.

**Recommendation put (followed):** 60 minutes for both, C4 amended. The rate wall (five attempts per
fifteen minutes per address, 裁-107) is the real defence: a 60-minute window is 20 guesses in a
million-code space — negligible — and invite links become usable. Alternatives priced: keep 10
minutes + build a "resend invite" door (≈0.3 unit); keep 10 minutes and accept expired invites.

**Ruling:** *"60 minutes for both, C4 amended (Recommended)."*

**Alignment (all in #506):** the Wave-G checklist's Email-OTP line reads 60 minutes and names the
collision; `apps/web/README.md` §4's "10 minutes" becomes 60 (and §3's "≤ 24h" cites this ruling);
`checkout-gate-design.md` C4 gains a dated amendment (the 10-minute figure stands as the design's
genesis, superseded here); the FS-11 Management-API receipt reads `mailer_otp_exp = 3600`. No code,
no migration. **Sequencing clause (from the #506 review's note):** the wall this ruling leans on is
C-5's attempt wall — on the 2026-09-02 tip the confirmation seam is still the honest-refusing stub —
so the 60-minute value is set only after C-5 is live; the checklist line says so.


### 裁-132 — streaming reply text is POST-BETA; beta ships the settled-only thread with an honest progress indicator (owner, 2026-09-02 ~15:40 MYT)

**Context.** The chat-parity lane (PR #508, 裁-130) found that `apps/web`'s thread renders Clara's
reply only at settle (parts-first, hydrate-never-trust): a long turn shows "Responding…" until the
turn settles, then the reply and its cards appear. The old dashboard streamed provisional text
token by token (`applyChunk`). Porting that is a separate design decision — a provisional transcript
that can differ from the settled one — at ≈1 lane-unit plus a design pass; #508 deliberately did
not make it, adding only the narrow live fold for a parked clarify question.

**Recommendation put (followed):** post-beta — keep the settled-only thread for beta with an honest
progress indicator (elapsed time + the live clarify fold), and a Backlog row for streaming text.

**Ruling:** *"Post-beta, settled-only + progress indicator (Recommended)."*

**Alignment:** a Backlog row (streaming provisional text — the provisional-vs-settled rule is the
design question); the progress indicator (elapsed time while a turn runs) folds into P6-5's agentic
finish if #508 does not already carry it; the capability diff's row for the dashboard's streamed
transcript is disposed SUPERSEDED-BY-RULING. Also from the same lane, rowed not ruled: a parked
clarify does not survive a page reload (`activeTaskId` is in-memory) — a read-path decision for the
P6-5 train (mirror the dashboard's task-list poll or read `agent_interruptions` on mount); and the
runtime's bare-500 on CLR10 from the chat-turn route folds into C-5's order (item 12).


### 裁-133 — NO Codex lane until beta live launch; native lanes only, and faster (owner, 2026-09-02 ~15:50 MYT)

**Context.** On 2026-09-02 afternoon the Codex `gpt-5.6-sol` build lane failed three times in ninety
minutes — twice "Selected model is at capacity" mid-round (the chat-parity and #507 fold lanes,
562k and 610k tokens in), once killed by a sibling lane's name-based process kill (the #493 fold-3
and #505 fold-2 lanes, both at 06:53Z) — each time leaving its round uncommitted and resumed
natively under 裁-85's substitution rule. The owner's words: *"加快速度，在beta live launch 之前不用
任何的codex lane，用native lane 就好."*

**Ruling (owner, unprompted):** until beta live launch, NO Codex lane of any kind — builds
included; every lane is native: `claude-sonnet-5` xhigh for bounded, mechanical, objectively
testable work; `claude-opus-5` xhigh for builds where judgement, security or ambiguity dominate,
and for every review. Fable stays the orchestrator. Speed is the point: no capacity outages, no
resume rounds.

**Alignment.** 裁-85's "lanes by fit" is amended for the sprint: the Codex BUILD lane joins the
already-suspended Codex REVIEW leg (裁-111) — both resume at beta live unless the owner rules
otherwise; AGENTS.md's working-protocol paragraph and the lane preamble/brief are trued in the
next truing PR; the heavy-lane host cap (3–4, staggered full-suite gates) still binds native lanes
— they run the same suites; the PROCESS LAW (kill only your own PID) stands for every lane.


### 裁-134 — CI: a concurrency cap on the self-hosted fleet, no spend, repo stays private (owner, 2026-09-02 ~17:50 MYT)

**Context.** Two contention-class false reds in one afternoon with 5–6 PR pipelines on the four WSL runners
(which share this host with the lanes): a DB-session loss in two unrelated jobs 4 ms apart (07:00:25Z) and a
wall-clock-ordered assertion (`intake-e2e.mjs:254`) flipping under load (09:03:48Z). Both rerun green; each cost a
diagnosis lane. The owner first asked whether GitHub-hosted CI could share the load by making the repo PUBLIC
temporarily ("ci 不用钱"). **Recommendation put: do not go public** — AGENTS.md's runner law (self-hosted is
private-repo-only: a public repo lets any fork PR execute on this machine, so the four runners would have to be
decommissioned first), the exposure of the PRD / every business ruling / the legal templates / fixtures named
after real firms / rewritten-away secrets still reachable through PR refs (the tokens 裁-124 chose not to rotate
would have to be rotated and the history scrubbed first), and 1–2 days of that security work — slower, not
faster. Alternative priced: stay private + buy hosted minutes (≈US$0.008/min Linux, ≈US$10–20/day at today's
pace) and move the five host-independent jobs to `ubuntu-latest`; or the cap alone.

**Ruling:** *"只加并发上限，不花钱"* — the concurrency cap only; the repo stays private; no hosted-runner spend.

**Alignment.** A sonnet CI lane: (a) per-branch concurrency group with `cancel-in-progress` so a superseded push
never queues behind itself; (b) a cap of three concurrent PR runs, implemented in the only zero-cost shape GitHub
offers (slot groups) WITH its hazard named in the PR body and in `docs/ops/ci-runner.md` — a run pending in a slot
is replaced by a newer pending run in the same slot, so a PR whose run was displaced must be re-triggered
(`gh pr update-branch` or a rerun); pushes to `main` are never cancelled or capped; (c) AGENTS.md's CI section and
ADR-0073's digest note gain the sentence; (d) after merge the lead dispatches the weekly sweep by hand
(`gh workflow run ci.yml`) per the standing rule; (e) the "same-second red on two branches → rerun once, never
diagnose twice" practice stands as a Known-issues row. The public-repo path is closed for the sprint; if it is ever
re-opened it starts with the runner decommission and the secret rotation, never the visibility toggle.


### 裁-135 — the repo goes PUBLIC for GitHub-hosted CI; the owner OVERRIDES the 裁-134 recommendation (owner, 2026-09-02 ~18:55 MYT)

**Owner's words:** *"我决定不理会所有 [the runner law · the exposure of rulings/legal/fixtures · the rewritten-away
secrets] 这些东西 or 隐私, 我要不影响品质的情况下加速 CI 这种死工作, 我要冲刺 beta live launch, 所以如果我 public
repo and use github 的资源能换来更快的开发速度 (like CI merge 速度, 我就去做 NOW)."*

**Recorded as an override.** The orchestrator's recommendation (裁-134, 17:50) was to stay private with a
concurrency cap; the owner reaffirmed the public path after the concerns were stated, which under the
grill protocol is their decision. The runner law in AGENTS.md ("private-repo only; decommission the runner
first") is the owner's own law and is amended by this ruling as below; the exposure of the PRD, the rulings,
the legal templates and the real-firm-named fixtures is accepted by the owner as the price of speed.

**Execution order (the orchestrator's, non-negotiable on the two items that are not privacy but product
compromise):**
1. **CI migrates to GitHub-hosted runners FIRST** (a native opus lane: every job to `ubuntu-latest`, the
   `postgres:17` service containers, the pg17 client via apt, docker for the DR round-trip, the render drill's
   fonts; the self-hosted label retired from the workflow; proven green on the PR itself before merge). Flipping
   visibility before this gains nothing — the four self-hosted runners stay the bottleneck.
2. **A full-history secret scan across every ref including PR refs BEFORE the flip.** A live credential in history
   is not "privacy": public = the world holds the product's live keys the second the switch turns. Any hit is
   rotated by the owner before the flip; a clean scan → flip.
3. **The fork-PR execution wall**: GitHub's "require approval for all outside collaborators" (fork pull-request
   workflows) is set BEFORE the flip; the self-hosted runners are then decommissioned or left registered only for
   the manual/scheduled sweep, never for PR events — the RCE class the runner law names is closed by the setting
   plus the hosted migration, not by keeping the repo private.
4. **The flip**: `gh repo edit --visibility public`. Then: the weekly sweep dispatched by hand, `docs/ops/ci-runner.md`
   + AGENTS.md's CI/CD section re-cut to the hosted fleet, 裁-134's cap PR (#513) superseded (closed or re-based
   onto the hosted workflow — hosted runners make the per-slot cap moot), the archive-of-record line in PROGRESS.
   **Step 2 MEASURED (2026-09-02 10:44Z):** gitleaks over the whole local history — 2,434 commits, 1,455 refs
   including every fetched PR head, 156.6 MB, the repo's own `.gitleaks.toml` — reported 5 findings, all
   `generic-api-key` false positives on idempotency-key plumbing (`consumed_op_key=p_op_key,consumed_result=…` in
   `0017_wave_b.sql` and the unnumbered hardening file; the fixture strings `pr3-archive-happy-key` /
   `-no-presign-key` in `f-a5-reporting-agency-pr3.test.mjs`). ZERO credentials in history by this scan. The
   fork-PR approval setting cannot be set while private (GitHub 422) — it is set in the same minute as the flip.
   **EXECUTED 2026-09-02 ~22:00 MYT (merge 13:57:37Z, flip within the following minutes):** #516 merged on its green hosted run (`ci` SUCCESS at 7bd57fdd, run 33636322348, 24m49s wall clock; the
   fresh-context review CLEAR-WITH-NOTES, its three documentation truings folded before the merge) → visibility
   PUBLIC → the fork-PR approval policy set to `all_external_contributors` in the same minute → seven queued or
   in-flight self-hosted runs cancelled → every open PR re-triggered onto the hosted workflow with
   `gh pr update-branch` (#493 #498 #501 #509 #511 #512 #514 #515 #518 updated; #510 and #517 DIRTY → their lanes
   merge forward) → the weekly sweep dispatched by hand (run 33639097306, the two sweep-only legs' first hosted
   proof) → the four WSL runner services stopped and disabled at 21:48 MYT (GitHub shows all four offline; the
   decommission procedure in `docs/ops/ci-runner.md` completes the un-registration later). Docker volumes pruned
   (42.69 GB) the same evening; WSL stays for the lanes' rigs.
5. **After official live launch** the owner intends to return the repo to private; the ledger notes that history
   published in the interval stays public in forks and caches regardless.


### 裁-136 — the sealed text hash must cover the burned watermark; change the extraction NOW, while nothing is sealed (owner, 2026-09-02 ~19:40 MYT)

**Context.** The FS-7 echelon-2 lane (PR #512, the PDF render worker + download door) measured that the gate-3
claim scan extracts text with `pdftotext -layout`, which drops rotated text — so a sandbox export's diagonal
watermark burn is invisible to `extracted_text_sha256` (the watermark keeps its own byte-level verification, but
the text-hash layer cannot see it). Changing the extraction changes every FUTURE sealed artifact's hash.

**Recommendation put (followed):** change it now — the live reporting registry is EMPTY (zero `reporting_periods`
/ `period_snapshots` / sealed artifacts), so this is the only moment the change costs no hash migration; after
beta it means a recompute or a dual-track. Cost: the same lane, about half a day (the reporting-render extraction
+ the seal byte-reproduction drill re-run).

**Ruling:** *"现在就改，让文字哈希覆盖水印 (Recommended)."*

**Alignment.** Folded into #512: the extraction mode that keeps rotated text (measured, with a cell proving the
watermark string is inside the extracted text of a sandbox export and absent from a sealed non-sandbox artifact),
determinism (the same artifact hashes identically across runs and hosts — the seal drill's byte-reproduction
proof re-run), the frozen-evaluator/freeze-manifest consequences named honestly (if the extractor is inside a
frozen closure, it ships as a new version per constraint 9), the PR body recording that no live artifact is sealed
so no hash migration is owed; the Wave-G checklist's first-real-seal line re-cites this ruling.


### 裁-137 — the wordmark renders lowercase glyphs (contract §8); the name in prose is ClaraBook (R1) (owner, 2026-09-02 ~20:35 MYT)

**Context.** P6-6 (#514) surfaced an R1-vs-§8 collision on the product name's case. The #514 review narrowed
it: the design authority's own lockup renders lowercase glyphs ("clarabook") while its prose says "ClaraBook",
so the token contract §8 governs the WORDMARK (the glyphs) and R1 (the ClaraBook brand adoption, 2026-08-27)
governs the NAME (text). Cost stated: ruling "text lowercase too" would re-split the shared string #514 had
just consolidated; ruling "wordmark cased" would re-set the lockup and owe a recut PR to the authority repo.

**Recommendation put (followed):** both — the wordmark lowercase per §8, every prose occurrence ClaraBook per R1.

**Ruling:** *"字标小写、文字 ClaraBook (Recommended)."* Zero code change; recorded in #514's PR body and the FS-9
ledger as diverged-by-ruling-resolved; the ClaraBook copy pass's rule from here: glyph lockup lowercase, text
ClaraBook, never mixed.


### 裁-138 — P6-3's four owner-visible look changes are all ACCEPTED, ruled on measured before/after screenshots (owner, 2026-09-02 ~21:00 MYT)

**Context.** P6-3 (#515, the a11y + token finish) changed four things a person can see; the fresh-context review
measured each (the lane's first numbers were corrected in the fold), the owner asked to SEE them before ruling
("我要先看截图再裁"), and the lane produced a before/after set from three throwaway builds (main `60ffbfb0`,
the branch pre-fold `1e3e3838`, the branch tip `354d0ffb`) with every ratio composited from the browser's own
computed values through the contrast gate's algorithm — embedded in the owner page §8 with the manifest.

**The four, measured:** ① disabled input border 1.131:1 → 1.297:1 (WCAG-exempt control; purely aesthetic, a
by-product of the `--input` recut); ② the destructive Button's keyboard focus ring: its own red at 1.405:1 —
barely distinguishable from the button's pink fill — → the site-wide blue ring with the 2 px white gap; ③ the
default focus halo 2.363:1 (below the 3:1 floor) → 3.574:1; ④ the ⌘K search field's edge 1.162:1 → 1.374:1 after
the token recut alone (the honest cost of the recut — the state #515 first shipped) → 3.504:1 after the M-2 fix.

**Recommendation put (followed):** accept all four — ②③④ move from failing to passing the 3:1 floor, ① is the
token unification's by-product.

**Ruling:** *"四个全部接受 (Recommended)."* #515 merges as folded (after #514 lands and the `skipToContent` key
moves into `Brand`); the two design-authority recut PRs (裁-64② / R3 §9) stay the owner's; the screenshot
instrument (a settle-before-measure spec, ratios from computed values) is kept in the session's scratch as the
pattern for any future look-change ruling.


### 裁-139 — a firm member is REFUSED at checkout before Stripe is called (owner, 2026-09-02 ~22:35 MYT)

**The collision.** #517's fresh-context review (M6): nothing between the browser and the payment checks whether the
caller already belongs to a firm — `POST /checkout` never reads `result.context`, and 0161's `open_checkout_intent` has
no membership check; the only membership wall is `_create_firm_core`, reached from `claim_paid_firm` AFTER the Stripe
Session is paid (the security pass's A-M4 state, now with the route that takes the money built). Reachable by a
same-origin POST from a stale tab in a member's own browser. At RM0 with `payment_method_collection = 'if_required'`
nothing is charged today; it becomes a real charge the moment 裁-28's amounts are ruled.

**The question put to the owner** (大白话): refuse such a caller BEFORE Stripe is called, with a clear message — the
lead's default under design §5 ("no path may strand a paying customer without a firm"), already dispatched to Lane B's
fold — or defer to the beta gate beside A-M4 with a PR-body note only.

**Ruling: 付款前拒绝 — refuse before payment.** The fact is already loaded in the same request
(`loadOwnRegistrationRequests()` returns `context`; `holding-state.ts` derives `member` from it): the route refuses at
step ⑤ with its own typed flash kind, a unit cell (member context → refusal, zero Stripe calls, zero door calls) and a
RED-before by `&& false`. A-M4's filed operator-read fix in 0161 is untouched. Ships in #517's fold round 1.

**Companion default, unopposed (NIT 6 of the same review):** the plan's derived collection mode stays
`amounts_ruled AND amount_cents > 0` — a ruled-at-zero plan keeps `if_required` (G13's RM0 test-card reason survives
ruled-at-zero), a refinement of design part 3 §2's literal "always once amounts are ruled". Recorded as the lead's
reading; the owner did not object when it was stated beside 裁-139.


### 裁-140 — how sprint rulings reach the ADR system: digest rows + "amended by" lines, no new ADRs (owner, 2026-09-03 ~00:50 MYT)

**The question** (大白话): the ledgers hold forty-odd rulings since 08-31; ADRs record decisions that mint standing
law; the ones in between are rulings that AMEND an ADR's law for the sprint (裁-111 suspends ADR-0077's cross-family
leg until beta live; 裁-133 native lanes only until beta live; 裁-135 the repo public + hosted CI, reversing the
runner law; 裁-139 a firm member refused at checkout under design §5; 裁-131 amending design C4; 裁-129 the terms as a
separate document kind; 裁-125 no darkening). How do they enter the ADR system?

**Ruling: "Digest 行 + 'amended by' 注".** No new ADR for a sprint ruling. In `docs/adr/README.md`: one row per
law-changing ruling in the standing-laws section and one dated line in `README-log.md`, each pointing at the ledger
entry and stating the time box ("until beta live"; "resumes unless the owner rules otherwise"). On the ADR whose law
is amended (e.g. ADR-0077 for 裁-111/133; the runner law's home for 裁-135), one line at the top: "amended by 裁-N
(time-boxed / permanent) — see the 2026-09-02 ledger". The ledger stays the source of truth for the ruling's text.
A new ADR is minted only when a ruling contradicts an ADR's text outright and permanently; the harness-sync scan
lists any such case for a separate decision.

**Why this option:** the sprint's rulings are mostly time-boxed; writing each as a permanent ADR would manufacture
the next stale record; a consolidating ADR was offered and declined as one more file to maintain. Cost: one docs-only
PR, single-lane review (ADR-0069).
