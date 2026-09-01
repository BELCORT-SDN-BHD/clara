# Mohe grill rulings — 2026-09-01, afternoon sitting

*Continues `mohe-grill-rulings-2026-09-01.md` (裁-95…100 there). Owner rulings and orchestrator
rulings recorded the day they were given; each entry names its context, what it overrode, and —
where the ruling exists BECAUSE a measurement corrected a belief — the measurement itself.*

## 裁-101 · The unwalled resend door — SEALED BY SEAM
FS-4 Lane A (#488) shipped an explicit "resend the code" control that called
`supabase.auth.resend` **directly from the browser**, reachable with NO session by crafting
`/auth/confirm?status=expired`. It bypassed the C1/C2 attempt wall entirely and consumed the
project-wide email budget shared with every real signup. **Ruled: the direct call is REMOVED**;
the button stays and calls a new Lane-B seam (`apps/web/lib/registration/confirmation-resend.ts`) that
refuses honestly today and gets walled when Lane B wires it. Rationale: it inverted this very
PR's own thesis — the walled path refused honestly while a second, unwalled door to the same
auth infrastructure stood open. Verification recorded at review: the card no longer imports the
Supabase client **at all** and the injection prop is deleted, so the hole is closed *by
construction*, not merely by a grep.

## 裁-102 · `/signup`'s indirect resend — PRE-EXISTING, lawfully deferred
The law-28 Codex leg found `supabase.auth.signUp` called directly from the public `/signup` page
(`signup-account-form.tsx:165`). Supabase's `signUp` **resends** the confirmation email when
called again for an existing unconfirmed address, so repeatedly POSTing a known applicant's email
is a real indirect resend that bypasses 裁-101's seal and the C1/C2 wall.
**Measured before ruling:** that call is on `main` from **#461** (the P4-3 entry group) — it is
**pre-existing, not introduced by #488**. Ruled: it does NOT block #488; it is deferred with all
four pieces — (1) the gap named, (2) C-3's `claim_confirmation_attempt`/`settle_confirmation_attempt`
named as its fix, (3) Lane B named as the wiring owner, (4) recorded in C-3's PR body where Lane B
will actually read it. **It must be closed before beta.**

## 裁-103 · The claim door must return `scope` and `retry_after_seconds`

**OWNER CONFIRMED, 2026-09-01 (the checkpoint-3 grill).** No longer orchestrator-only; the
owner-pending markers in code retire at the next touch of each file.
The seam↔door table (see 裁-107) found two gaps in the REVERSE direction — the seam was right and
the **door's design signature was short**. `claim_confirmation_attempt` (design part3:110) returns
`{attempt_id, allowed, remaining}`, but the UI needs two more facts:
- **`scope`** — WHICH wall refused (C1 this-address vs C2 this-location). The design already rules
  distinct refusal copy for the two, so with no scope field Lane B would have to **parse it out of
  an errcode or message string** — precisely the law-3 trap (reading a NAME as a projection of the
  thing). **Ruled: the door returns the scope explicitly.** It knows which wall fired.
- **`retry_after_seconds`** — the door returns no wait at all, so the UI would have to DERIVE it
  (oldest attempt + window), duplicating the wall's own window logic in the browser where it will
  drift. It is also a number derived from DB-owned state. **Ruled: the door returns it** (hard
  constraint 2 — the DB owns the number).
Cost decision delegated to the C-3 driver (fold in if cheap; otherwise a small follow-up PR) —
**a silent ship with the door short of its ruled contract is not lawful either way.**
Reconciliation owed: `page.tsx` clamps the displayed wait to ≤900s and renders anything outside as
the generic "invalid" card, so the door's real window and that clamp must be trued together, or the
first genuine lockout renders as "invalid".

## 裁-104 · `wake_mint_month_snapshot` returns to the BOOKKEEPER floor — reversing my own ruling
The PR-2c design's §1(3) asserted "mint_month_snapshot and the six reads have no gap", and on that
premise I ruled the verb into the viewer/no-capability bucket, calling the implementer's original
placement "a discipline breach". **The review measured what the design only asserted, and the
premise was false:** the human twin `clara.mint_month_snapshot` opens with
`_human_ctx(role_rank('bookkeeper'))` (`0120:1439`), and BOTH paths converge on the identical
writer `_mint_month_snapshot_core` (`0138:2451`). A viewer-ranked director would have obtained a
durable write the human door refuses. **Ruled: the verb moves back to bookkeeper/no-capability —
Codex had it right and my amendment was wrong.** Recorded in the design as a DATED reversal, not a
silent edit. **The standing lesson:** a design sentence claiming a measurement is not a
measurement; a mapping table row is only as good as the twin door someone actually read.

## 裁-105 · `on_behalf_of` binds to the task's own director
Rung A8 made `on_behalf_of` the sole authority input for the twelve close wrappers, but the minter
accepted ANY active bookkeeper+ as `p_on_behalf_of` — so the CALLER chose whose authority the verbs
ran under, with only a JSDoc convention holding the line. **Ruled: bind it —
`_assert_wake_task_congruent` gains `created_by` and requires `p_on_behalf_of = v_task.created_by`,
with `IS DISTINCT FROM` (never `<>`: `created_by` is nullable, and `<>` yields NULL, silently
passing the exact case the wall exists to catch).** Convention became wall with zero legitimate-use
loss, completing the capability-laundering closure 裁-100 exists for.

## 裁-106 · c1.10's fix shape — cohort-scoped, plus a trigger census
#478's `c1.10` reddened in CI on an **unscoped** `select count(*) from clara.firm_admissions`
(127 vs 125) while passing locally — db-estate runs workspace packages CONCURRENTLY against ONE
shared container, so two foreign `approve_firm_registration` calls moved the population mid-battery.
**Ruled: scope the proof to the file's OWN fixture cohort** — before() mints one uniquely-tagged
admission row and captures its full byte-shape; the cell re-reads by tag and asserts presence +
byte-identity + still-unconsumed. Scoping merely to "the row set before() observed" was rejected:
a foreign row's *lawful* mid-battery consumption would still redden it. **Plus a trigger census on
`firm_admissions`** — a pure catalog read closing the one path cohort-scoping opens.
**The class, stated for the next author:** *any* bare `count(*)` with no predicate is unsound under
the concurrent sweep, not just a schema-wide one — this is the #482 lesson's family, second member.
**The mirror-image hazard, checked and closed:** the fix makes before() WRITE to a shared table,
which could redden anyone else holding an unscoped count on it. Census found exactly one
(`hrd-b-upgrade-kit.mjs:155`) and it is reset-gated, so it never runs in the concurrent sweep.

## 裁-107 · STANDING REVIEW LAW — diff every seam against its door, BOTH directions
FS-4 handed four seams to Lane B. **All four had a parameter mismatch** against the design's door
signatures: the claim door's key was semantically wrong (the browser `Origin` header, identical for
every visitor, where C2 needs a per-address digest — a global-DoS contract); settle dropped
`attempt_id`; `sign_dpa` dropped `p_op_key`; and the DPA seam dropped `body_sha256`, the wall the
design itself calls "the one that matters". Then the reverse direction found two more (裁-103).
**Six instances of one shape is not six misses — it is a missing lens.** The reviewer who found the
fourth named the gap precisely: *"seam defaults to an honest refusal" and "the seam's SHAPE can
actually drive the door" are two different checks, and only the first was being run.*
**LAW: for any seam that fronts a design-specified door, produce a bidirectional parameter diff —
every door parameter ticked off against the seam's params, and every door return value ticked off
against the seam's return type — before judging the seam sound. A seam with no design door is named
as such explicitly, never omitted.** Reference instance: PR #488's completion table (7 doors × 4
seam functions in 3 modules).

### 裁-107(a) · The two directions are NOT symmetric — the rule that tells a defect from a decision

**OWNER CONFIRMED, 2026-09-01 (the checkpoint-3 grill), after a plain-language re-briefing**
(the bank-counter framing: materials handed in vs receipt fields read). The burden-of-proof
allocation is now owner law.
Added at the second review pass, because "is this a decision or a fifth defect wearing a decision's
clothes?" needed an answer that generalises. **A dropped PARAMETER is a defect by default:** the
door REFUSES without it (`sign_dpa` raises CLR10 "op_key is required"), the call simply cannot work,
nothing in the type system says so, and the failure is silent until someone runs it. **A dropped
RETURN FIELD is a decision by default:** the call still succeeds, a narrower outcome like
`{kind:"signed"}` **fabricates nothing** (it is true whether the door minted or replayed), and
widening the return later is additive and compile-checked at every consumer the moment one exists —
recoverable and non-silent. All four defects this train produced were param-direction.
**How to apply:** param-direction gaps get fixed; return-direction gaps get RECORDED in the
completion contract as known widenings, with the field that will matter first named. For `sign_dpa`
that field is **`replay`** — the moment a receipt surface exists, "you signed this on \<date\>" versus a
bare "signed" becomes a real distinction, and `signature_id`/`signed_at` are the evidence this
estate's receipt discipline will want.

### 裁-107(b) · The seam↔door table is a DURABLE artifact in the PR body, and door claims CITE it

**Amends 裁-107.** Raised by `fs4-pr488-review` against a countermeasure the orchestrator had just
given it — a defect in the rule at mint, closed before it could fail.

**The failure it fixes is RETRIEVAL, not LENS**, and the two need different medicine. A LENS failure
is never having looked for a class at all; the fix is naming it in the brief. A RETRIEVAL failure is
having looked, having RECORDED the fact, and failing to connect it when a contradicting claim arrives
later. The day's sharpest instance: a lane's own seam↔door table carried the row
`return ← (not in door prose)` for `claim_confirmation_attempt`, and that same lane later passed a
code comment claiming "the real door C-3 ships returns `'email' | 'origin'` … the door wins" — for a
door that does not exist in `packages/db` at all. It held the contradicting fact, in its own artifact,
in its own scope, and the connection did not fire.

**The orchestrator's first countermeasure was itself defective:** "re-read your own table's row for
that door" bottoms out in remembering you once built a table and going to find it — a memory
dependency moved one level up, not removed. Worse, it fails ENTIRELY for anyone who is not its
author: 裁-107 tables have been living in SendMessage bodies, so a fresh lane reviewing a claim about
a door has no path to the row that contradicts it. Under 裁-111's two-leg gate that retrieval is
exactly what someone must be able to perform.

**LAW: the bidirectional seam↔door table lives in the PR BODY as the canonical artifact — never only
in a message — and any code comment that makes a claim about a door CITES its table row**, the way
comments now cite a 裁-NN ledger entry rather than a lane name. That converts "remember your own
artifact" into "follow the reference", which is the same upgrade the attribution rule made when it
moved authority from lane names to the ledger. A lookup any lane can perform from the code itself
beats a recall only a participant can have.

## 裁-108 · STANDING LAW — an UNNUMBERED migration merges silently and never applies
I armed auto-merge on #490 while its migration was still `UNNUMBERED_…sql`. `migrate.mjs` matches
only `/^\d+.*\.sql$/`, so the PR would have merged green with a migration that **never runs** — no
red anywhere. Disarmed before it fired; zero damage.
**The same day gave the positive proof:** #478's eleven C-1 battery cells only executed for real
**after** the rename — before it they loud-skipped, and the suite looked healthy the whole time.
**LAW: the number claim is not bookkeeping — it is what ARMS the migration and its tests. Merge
prep for any DB PR ends with (1) the rename, (2) a repo-wide citation true-up, (3) confirmation
that nothing mechanical keys on the FILENAME rather than the live catalog, and (4) a fresh-rig
re-verify proving the migration applies IN SEQUENCE and its cells run LIVE rather than skipping.**
No auto-merge on a DB PR before its claim.

---

## 裁-109 · N1 + N3 are BETA-GATING — the owner chose the most conservative option

**Ruled by the OWNER, 2026-09-01, after a plain-language briefing.** Two pre-existing security
residuals on the confirm surface were surfaced with three options (defer both to public launch ·
fix N3 only · fix both before beta live). The owner ruled: **最保守 — 两个都修完再上线.** Both
fixes are now beta-gating work items.

- **N1 — the forgeable status card.** The confirm page paints its card from unauthenticated URL
  params; `?status=locked&wait=900` on the real domain renders a fully authoritative-looking
  lockout card. Touches no data and no money — it is a phishing prop. Fix: remove URL-borne
  authority (an unforgeable server-side signal; the mechanism is the fix lane's design proposal,
  reviewed before build). Pre-existing from the #461-era handler idiom; measured NOT worsened
  by #488.
- **N3 — the banned-account oracle.** A wrong-code attempt against a banned account is observably
  different from one against an unknown account (Supabase `verify.go` upstream behaviour;
  `user_banned` confirmed in the live error-code registry). Fix: flatten the classification so
  the three cases are indistinguishable — **accepting the loss of round 4's wrong/expired
  presentational split**, a cost stated to and accepted by the owner. Pre-existing;
  `isExpiredOtpError` byte-unchanged by #488.

**What this ruling does NOT do:** it does not reopen #488, which merges with both residuals
recorded OPEN in its body (they are pre-existing and un-worsened there — the four-piece deferral
shape held). The fixes ship as their own PR(s) from main with the full ladder: fresh-context opus
review + the law-28 Codex leg (a native lane building an auth surface). Provenance: found by the
law-28 Codex leg on #488; verified by the orchestrator's own read; ruled by the owner.

## 裁-111 · The cross-family Codex review leg is SUSPENDED until beta live

**Owner ruling, 2026-09-01 (late afternoon).** "异族审判review 取消掉" — from now until beta live
launch, no PR gets the cross-family Codex adversarial leg. **Law 28 is time-boxed, not repealed:**
the ONE fresh-context opus read-only review becomes the complete review gate for the remainder of
the sprint, and law 28 resumes at beta unless the owner rules otherwise. **Codex remains a BUILD
lane throughout** — only the review leg is suspended.

**Recorded honestly, because the ruling was made with it on the table:** the Codex leg found real
defects the same day — #489's silent 100× threshold parse (a DB-owned governance number set 100×
larger with no rejection), #488's governance defect (a review lane occupying the authority slot in
shipped code, which minted the attribution rule), and confirmed findings on #495. The countervailing
fact, also measured: the opus lane found the day's other blockers unaided — #493's permanent-lockout
off-by-one, #497's F1 (the second writer the carve-out missed), #498's three claim-accuracy defects,
#495's F1/F2. The gate is thinner, not toothless, and the owner owns the trade.

**Executed the moment it was ruled:** two in-flight legs stood down mid-run (#499's auth surface,
#493's money-surface driver delta), each ordered to surrender any concrete finding Codex had already
produced so nothing measured was lost to the cancellation; `AGENTS.md`'s lean-ladder paragraph trued
in the same PR so no lane reads a stale instruction.

## 裁-112 · The OVERCLAIM class gets an explicit owner in both surviving briefs

**Orchestrator ruling, 2026-09-01, immediately after 裁-111.** Raised by `fs4-pr488-review`, which
censused what the cancelled cross-family leg had actually caught on the FS-4 train and found that all
four findings were ONE class: **the code, or its framing, CLAIMS more than it closes.** Not
correctness bugs — gaps between what something SAYS and what it DOES (the origin-digest name
collision, the account-status differential, the four authority-attribution sites, the N1/N3 wording
that overclaimed closure).

**Why it needed a ruling:** neither surviving leg is naturally aimed at that class. A conformance
pass asks "does the build match the checked design"; a fresh-context opus pass asks "is this code
correct". The overclaim class sat BETWEEN them, and the third leg was what covered it. The lane that
raised this also named it as its own weakest lens, with the receipts — which is the strongest reason
to instruct it rather than hope.

**RULED — both briefs, because option 1 alone leaves a hole:** a conformance leg exists only when
there was a design gate. Most PRs have none, so the opus lane is the only lane; a class living solely
in the conformance brief would be unowned on the majority of PRs.
1. **Conformance brief — named PRIMARY lens:** *verify that no comment, PR-body line, completion
   contract or test name claims more than the code actually closes; where a claim is conditional,
   check the condition is ASSERTED rather than described.*
2. **Opus brief — standing item, narrower and mechanical:** *does anything in this diff assert an
   absolute where the code delivers a conditional?* Demonstrably effective from a fresh lane: that is
   the shape which caught #499's FOLD-2 false premise the same hour.

**Also ruled: the review threshold moves.** With the second family gone, an unpinned delivery or a
claim-vs-behaviour gap is worth raising every time; the orchestrator says so plainly if it becomes
noise rather than letting it accumulate. FOLD 2 is the evidence: the lane would have accepted
pinned-values-only with a sweep behind it, did not without one, and the fresh lane then found half
the fold was a no-op duplicate AND the other half was clobbering a stricter upstream header.

### 裁-112(a) · The four transferable rules the FOLD-2 miss actually taught

The lane that made the miss re-verified the correction AT SOURCE rather than accepting it on report
("taking a correction unmeasured would be the same failure inverted"), and returned a sharper
diagnosis than the one recorded above. Its rules supersede the loose "grep wider" reading:

1. **The miss was SCOPE, not pattern.** A repo-wide search for the literal `cache-control` WOULD have
   found `response-state.ts:44`. The instrument was scoped to three files — `next.config.ts`,
   the middleware, `apps/web/proxy.ts` — chosen from a mental model of where a route's cache header *ought*
   to live. The mechanism lives two modules away in a shared applier the response passes through.
   **LAW: when the question is whether a PROPERTY holds on a response, the instrument must follow the
   response's CONSTRUCTION PATH, not the files you would have written it in.** Scoping the instrument
   to your hypothesis instead of to the question is the absence-from-the-wrong-instrument family,
   committed while holding the lantern.
2. **A COMPOUND claim is only as strong as its weakest conjunct.** "There is no Cache-Control and no
   Vary set on this route anywhere" bundled a TRUE, load-bearing conjunct (Vary) with a FALSE one
   (Cache-Control), both asserted at one confidence level after one too-narrow check — and the false
   half rode the true half's credibility all the way into an orchestrator's order.
3. **Hedging a CONCLUSION does not hedge the ORDER that follows from it.** The lane wrote "I am NOT
   claiming this leaks today — I did not measure it", which was honest, then built a firm
   recommendation on the unmeasured conjunct, and work was ordered from it. **If a premise is
   unmeasured, the recommendation carrying it needs the same hedge — or the measurement.**
4. **An assertion of ABSENCE must name its instrument and that instrument's SCOPE.** "No
   Cache-Control in next.config/middleware/proxy.ts" would have been caught before the order was
   given; "nowhere on this route" was not checkable by the reader. This is now part of the
   conformance brief's named lens.

**One more shape worth keeping:** the cheap close the fresh lane found (two assertions on the real
response the e2e already fetches, `signup-confirm-pending.spec.ts:74`) sat on a line the same lane had
personally read, flagged when a round deleted it, and confirmed when a round restored it. It cited
`referrerPolicyForPath` as the precedent for the pin in the same breath as arguing its function-only
test was insufficient — reasoning about the precedent's WEAKNESS so attentively that it did not see
the STRENGTH sitting beside it, then proposing the expensive path and pre-justifying its cost.

**The orchestrator's own error, recorded:** FOLD 2 was ORDERED by me on a design-pass premise
("nothing sets Cache-Control on this route") that was FALSE — `applyAuthState` sets the identical
`private, no-store` on every proxied response. The instrument that missed it was a grep for a literal
on the route, where the header is written by a shared applier the route passes through: absence from
the wrong instrument, the estate's own recurring class, this time costing a wrong order from the
orchestrator rather than a wrong verdict from a lane.

### 裁-112(b) · The MODEL-AS-ORACLE trap — a prescription's test rig is not the shipped body

Self-caught by `pr493-review` the moment it was told to treat prescriptions as claims rather than
instructions. Having built model functions to TEST two ordered fixes (a guarded and a naive limb
variant), it named the trap before walking into it: **diffing the next delta against its own model
and calling agreement a confirmation would be the c3.30a self-agreement failure one level up** —
the model would have become the oracle, and a shipped body that merely matched what the reviewer had
already convinced itself was correct would pass.

**LAW: when a reviewer builds a model to test a prescription, the model is evidence about the
PRESCRIPTION, never about the SHIPPED BODY.** On the verification pass, rebuild from the shipped
text and re-run the traced cases against THAT. **If the shipped body and the model disagree, the
MODEL is the suspect first** — it is the artifact with no review of its own.

The corollary that makes it operational: a pin or a census must be proved to name the RIGHT subject,
not merely to exist. The same lane's own check on the prosrc pin is the pattern — mutate the body by
one byte and require the pin to red, because a pin that names a neighbouring function is exactly the
law-3 shape (a guard reading a NAME rather than proving identity).

### 裁-112(c) · The DUPLICATED-PREDICATE trap — THREE instances in one day, all author-invisible

The estate already banked "a review's own instrument is not a shipped gate" (2026-08-31). What
2026-09-01 added is the recurrence count and the specific shape: **a guard that re-implements the
thing it guards, so mutating the real thing reds nothing.** Three instances, all shipped by careful
authors, all caught by a reviewer, all in one afternoon:

1. **#499 FOLD 2** — the cache-header test drove `confirmCacheHeadersForPath` (the predicate) and
   never a response. Delete the application block and every test stays green.
2. **#493 c3.53** — the census matched a literal in `prosrc`, and the migration's own explanatory
   COMMENT contained that literal. The evasion the census was widened to catch could be
   reintroduced in executable code with the comment left in place, and the guard stays green.
3. **#497 F4** — the negative control was asked to prove T1's predicate discriminates, and it
   executed a SECOND string literal of its own. Editing T1's WHERE clause leaves the control blind;
   it reds against exactly one mutation (emptying the constant) out of four plausible widenings.

**LAW: a cell that exists to prove a gate discriminates must EXECUTE THE GATE, not a copy of it.**
Hoist the gate's expression to one shared constant and have both the gate and its control run that
exact string; where the gate is a shipped mechanism rather than an expression (a header applier, a
migration body), drive the real thing — a real response, a real body — or pin its identity by hash.
**And choose the control's input so the PLAUSIBLE widenings swallow it**, not merely the absurd ones:
in #497 the control key contained no "test" and a hex slice could not produce one, so the exact
widening it was written to catch left it green. Work the mutation table before calling a control
discriminating — 裁-112(b)'s corollary, applied to controls rather than pins.

## 裁-113 · The C-2 wiki-gate question — owner rules REWRITE + CHECKED WAIVER

**Owner ruling, 2026-09-01 evening, decided by a measurement.** #484's retarget gave the
wiki-dynamic-sql gate its FIRST-EVER run on C-2 (the four review rounds never reached it — the
`&&`-joined lint chain died earlier on a stacked-base freeze-lint artifact every time), and it
refused `apply_stripe_events`'s `execute v_sql`. The lander EXECUTED the checker rather than reading
it: a waiver on the code AS-IS is **trusted** (a fabricated table name was excused identically to the
real one — kind `unprovable` short-circuits); a waiver after the literal-at-EXECUTE rewrite is
**verified** (the fabricated declaration was rejected — kind `dynamic` compares declared targets to
the reconstruction). The owner chose rewrite+waiver: the rewrite is what gives the checker something
to check. Execution orders included: prove the accepted waiver reds on a wrong declaration
(pin-must-red applied to waivers), fix the allowlist header's stale "TWO ENTRIES TODAY" count
(12 entries, 13 with this one), and a scoped re-review of the behaviour-identical rewrite since it
postdates the reviewed rounds.

**The class banked alongside:** an `&&`-joined gate chain means an early red MASKS every gate after
it — a stacked PR's "lint: FAILURE" can be one known artifact in front of gates that have never run.
A retarget's first green-through-the-early-gates is the first time the later gates VOTE.

## Evening state bridge — 2026-09-01 close (written before compaction)

**Merged this day (12 — trued 2026-09-02: the day CLOSED at 15, this list predates #455's count-in, #497 and #502):** #478(0158) · #482(0157) · #483 · #486 · #487 · #490(0159) · #491 · #492 ·
#494 · #496 · #488 (FS-4 Lane A) · #500 (裁-107(b)/111/112 family). Frontier: 0159 live.

**Queue and what each waits on:**
- **#484 (0160)** — EXECUTING 裁-113 (rewrite + checked waiver + stale-header fix + waiver-must-red
  proof) → scoped re-review by pr484-reviewer of the behaviour-identical rewrite → CI → auto-merge
  (armed). THE GATE for the rest of the C-chain.
- **#493 (C-3, claims 0161)** — review gate CLEARED at 82a95cee (four rounds; the retry MAX+guard,
  prosrc SHA12 pin 7de3df3152c7 by OID+signature, c3.30c/d kill DIFFERENT mutants — the pair covers,
  neither alone). Owes: skip→pass attribution line (95→94, calendar-suspect), lexStatements comment
  soften, then #484 merge → retarget → 0161 claim with the FULL 裁-108 four-step (60 cells LIVE by
  name). Driver standing by in its worktree.
- **#499 (N1/N3, 裁-109)** — both legs CONFIRMED at caea16c1; finisher pushed 86760779 (5 items) and
  the Playwright leg FOUND A REAL DEFECT: Next 16.3.3 App Router REPLACES middleware's `Vary` (curl
  cross-checked). Finisher is on a TIME-BOXED route-level fix (next.config headers()); if undeliverable,
  pin observed reality + honest residual (primary control Cache-Control: private, no-store IS delivered
  and e2e-pinned). Then CI → merge.
- **#497** — CONFIRMED, auto armed, lands on green; #501's retarget precondition.
- **#501** — round pushed at 981cc4c9 (shared claimOperatorFirm helper for ALL FOUR takers,
  err.constraint match probed live, rowCount check, line ranges). Awaiting pr501-review's verdict.
- **#498** — CONFIRMED at b1e61577, auto armed.
- **#485 / #489 / #495** — ladders complete, auto armed, riding the cascade (update serially, senior
  first, per the strict-protection lesson).

**Standing owner items:** Stripe TEST key at C-5 (env-to-env) · vhdx compaction quiet window
(~20-40 GB back to C:) after the cascade drains · beta-gating tasks #14 (float-hook silent-zero,
widened to opening balances) / #15 (Clara rail inset) / #16 (P4-6 nav + reverse gate) unstarted.

**Live infra:** owner preview at https://localhost:3100 (main@13bc5c03, supervisor attached) ·
disk-cleaner done (C: 13.8→18.6 GB; 52.9 GB inside the vhdx awaiting compaction) · a corrupted
worktree dir `agent-a13c9c7d877268370` needs manual removal · CI runners under heavy load all day.

## Session state bridge — 2026-09-01 afternoon
*(PROGRESS.md truing rides the next clock-out PR. Where this disagrees with the repo, the repo wins.)*

**Merged this session (10):** #481 · #463 · #479 · #480 · #453 · #483 (FS-5 closes) · #482 (0157) ·
#486 (the 裁-95…100 ledger) · #455 (**FS-1…3 closes** — all four P4 PRs in) · #487 (**FS-8 PR-1
closes** — Tax shell) · #491 (the settle-loop timing fix).

**The migration frontier and its queue — order matters, numbers claim at merge:**
`0157` is live (#482). **#478 claims 0158** (renamed, rig-proven, CI running, auto-merge armed).
**#484** (C-2 stripe events, ladder complete after 4 rounds) retargets to main and claims next.
**#490** claims after that — **its file is still UNNUMBERED and its auto-merge is deliberately
disarmed** (裁-108); its driver has the citation census done and is holding for the number.
**C-3** opens stacked on C-2 and claims at its own merge.

**Open PRs and what each is waiting on:**
- **#478** (C-1 DPA store, 0158) — db-estate running; review CLEAR incl. the c1.10 reshape; auto-merge armed.
- **#488** (FS-4 Lane A web) — contract round at `35c222a5`; second opus pass + a self-relaunched
  second Codex pass both in flight; CI running. Its db-estate green at `ac6184ca` is the **efficacy
  proof for #491** (before: 2/2 red with a drifting failure set; after: green).
- **#489** (FS-8 PR-2, the 裁-97 threshold UI) — CI green at `074c2ded`, opus leg CLEAR (10/10
  findings closed); **only the law-28 Codex leg outstanding**.
- **#490** (F-A4 PR-2c close-chat lane) — ladder complete (3 MATERIAL + 9 NIT closed, delta CLEAR);
  waiting on its number.
- **#484** (C-2) — ladder complete; needs retarget + number.

**Lanes in flight:** `fs4-c3-driver` (C-3 folded checkout door — THE beta-critical backend; final
verification, holds 裁-102 and 裁-103) · `pr488-contract-fixer` · `fs4-pr488-review` (second pass) ·
`pr488-codex-leg` (second pass) · `pr489-codex-leg` · `fa4-pr2c-driver` (holding for its number) ·
`pr490-review` (closed) · `fs8-pr489-review` (closed).

**Standing follow-up ledger (none blocks beta):** the 756-site / 88-file `settleUntil` sweep with
the helper hoisted to a shared test/hookHarness.ts (future file) first (#491's corrected census — the original estimate
was 20× low) · freeze-lint drift guard refusing tests/-path registrations · p4t2's actor-scoped
audit count · a gate binding a11y shadows to their real pages + a tree→registry ⌘K cell ·
`components/reports/DoorDialog.tsx:90`'s identical close-polarity bypass · C-5's order items (the
projector's nested-PII wall, loud webhook rejects, C-2's `constraint_name` re-raise hazard) ·
`coa_chart_apply`'s checklist row · the wave-g checklist's confirm-template line ·
`_close_wake_ctx`'s CLR11 rung (structurally unreachable via the credential-pin path — a dedicated
pass, hypothesis not measurement) · #488's `page.tsx` 900s clamp to be trued to C-3's real window.

**Owner items:** all four ops cards done (Resend verified · Supabase fully set incl. password policy
and autoconfirm · Cloudflare confirmed). **The only one still owed: the Stripe TEST key**, handed
env-to-env from the owner's password manager when C-5 wires the webhook — never pasted into chat.
