# The 2026-09-02 rulings — the afternoon and night sitting (裁-132 … )

> The eighth ledger, continuing [`mohe-grill-rulings-2026-09-02.md`](mohe-grill-rulings-2026-09-02.md)
> (裁-110 · 114 · 115…131) exactly as `-09-01-pm` continued `-09-01`. **The chain to date:**
> `-08-29` → `-08-30` → `-08-31` → `-09-01` → `-09-01-pm` → `-09-02` → **this file, the newest**.
> The split happened at the 09-02 pm/night truing, when the `-09-02` file passed the repo's
> 500-line document ceiling; 裁-129…131 stay there because that is where they landed (#506), and
> everything from 裁-132 is here, moved byte-for-byte.
>
> **Context.** The afternoon and night of 2026-09-02: thirteen PRs merged, the CI pipeline moved
> onto GitHub-hosted runners and the repository was made PUBLIC (裁-135, an owner OVERRIDE of the
> orchestrator's 裁-134 recommendation, executed in the ruled order), every lane became native
> (裁-133), and 裁-140 settled how a sprint ruling enters the ADR system at all. Every question was
> put ONE AT A TIME with the recommendation first and the cost stated (the grill protocol); each
> entry names whether the owner followed or overrode the recommendation. Resume map for the next
> session: `PROGRESS.md`'s posture plus this file.

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


### 裁-140 — how sprint rulings reach the ADR system: digest rows + "amended by" lines, no new ADRs (owner, 2026-09-02 ~23:40 MYT — time re-derived from the record's write time; the lead's note clock had drifted)

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


### 裁-141 — ⌘K "Do" behind the allowlist (裁-37): the palette pre-filters on DB-computed role rank + transcribed door floors, guarded against drift; the door stays the only authority (owner, 2026-09-03 ~00:10 MYT — time re-derived from the record's write time; the lead's note clock had drifted)

**The collision (constraint 1, surfaced by the P6-5 lane, PR #519 §9).** 裁-37 says the ⌘K Do actions sit BEHIND the
allowlist and, in its last sentence, forbids a new mechanism. `clara.wake_fn_allowlist` is by 0002's design invisible to
application roles (0002:247, :482-493, :522-525 — no policy, no grant), so reading it from the web needs a new
SECURITY DEFINER read door — which the same ruling forbids. The two halves cannot both be met literally.

**大白话 given to the owner:** the palette only decides what to SHOW; the database door still refuses on click no matter
what the palette showed. The lane's shape reads the caller's DB-computed role rank against each door's floor (a copy
transcribed in the web) plus each action's own precondition, re-read on every palette open. The risk is the copy
drifting when a door's floor changes — cosmetic, never a security hole, because the door refuses regardless.

**Ruling: "接受 lane 的形状 + 加漂移守卫".** The shipped shape stands. A DRIFT GUARD is required: a cell that reads every
transcribed floor against the live door's floor (from the door body / the rig) and reds when they diverge — a projection
of a door is law 3's class ("spelling is not identity") and must be pinned to its source. No new DB mechanism; the
allowlist table stays invisible to application roles. 裁-37 is amended by this ruling, recorded in the ledger and the
ADR digest per 裁-140.

**Declined:** a new read-only door over the allowlist — literal on 裁-37's first half, a breach of its second, exposes a
deliberately hidden security table to application roles, and costs a migration plus a DB review round (one to two days).
