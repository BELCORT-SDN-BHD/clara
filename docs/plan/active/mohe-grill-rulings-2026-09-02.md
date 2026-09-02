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

> **ERRATA (lead, 2026-09-03; owner confirmation put as B1 of the harness-sync scan).** The premise's example above names the wrong secret. `STRIPE_WEBHOOK_SECRET` is **runtime/Fly env**, not `apps/web`'s (`docs/plan/active/checkout-gate-design-part3.md`; 裁-126 routes the `whsec_` value to Fly secrets; every site of it in #511 sits under `packages/runtime/`), and 裁-93 had already ruled the webhook to `packages/runtime` BEFORE 裁-114 was written. `apps/web`'s real FS-4 credential is `STRIPE_SECRET_KEY`. **The RULING stands** — the wall it re-states (no service credential ever reaches a browser; no `NEXT_PUBLIC_` variable carries one; `apps/web`'s server-only Route Handlers are a second, browser-isolated holder) is unaffected by which credential illustrates it. `PRD.md` §6 and `ARCHITECTURE.md` inherited the same example and are NOT edited here: they are law documents and wait for the owner's answer to B1.

---

# The 2026-09-02 checkpoint sitting (morning, ~08:00–10:30 MYT) — 裁-115 … 裁-128

> **Context.** The pause window closed with the owner's "CONTINUE"; the truing PR #503 merged at
> 21:16:59Z (05:17 MYT) as `33e94855`, one merge behind `#484`/`0160` and therefore carrying four rows
> that call #484 an open red gate — trued by the checkpoint PR this sitting produced. The sitting
> opened on a 17-lane read-only scan (111 agents; every BLOCKER/MATERIAL finding refuted-first by an
> independent opus verifier; a completeness critic) whose owner-facing artifact is **the owner page
> "Clara beta runway 0902"** (a claude.ai artifact; its id changes on every terminal re-login — the
> current link is handed to the owner at each checkpoint, never recorded here). Every question below was
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
month, recurring); both carry the local key and the ruling numbers in metadata. **The ids are written into `clara.stripe_object_map` by an OPS ACT run as `clara_fn_owner` from merged `main` after C-5 deploys — NOT by C-5, which carries no migration and only READS the map** (trued 2026-09-03 from #511's own file set: 23 files, all under `packages/runtime/`, its only map writes being a test fixture). Stripe Tax stays off per 裁-54 until BELCORT's SST registration
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

---

**裁-132 onward live in [`mohe-grill-rulings-2026-09-02-pm.md`](mohe-grill-rulings-2026-09-02-pm.md)**
— the afternoon and night of the same day (裁-132…141: streaming text post-beta · native lanes only ·
the CI cap and the owner's public-repo override · the watermark in the sealed hash · the wordmark ·
P6-3's four look changes · the member refused at checkout · how a sprint ruling reaches the ADR
system · the ⌘K allowlist shape and its drift guard). This file was split there at the 09-02 pm/night
truing, at the repo's 500-line document ceiling; 裁-129…131 stay here because that is where they
landed (#506). **The `-pm` file is the NEWEST ledger — read it, not this one, for the day's close.**
