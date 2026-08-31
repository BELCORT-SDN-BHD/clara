# Sprint session state — 2026-08-31 afternoon (the durable record before compaction)

*Written by the orchestrating session at ~19:15 MYT, per `.claude/rules/handoffs.md`: **for a reader
with no session, no transcript and no task board — only this repo.** Every resume path names a file,
a PR, or a command. `PROGRESS.md` stays the state authority; this file is the dated bridge for the
work that was IN FLIGHT when the session compacted, plus the review findings that exist nowhere
else.*

## 1 · Landed today (all merged to `main`, all through the lean ladder)

| PR | What | Evidence |
|---|---|---|
| #469 | FS-0 verb census at `0155`; 裁-72's P6-C programme discharged | `docs/plan/active/verb-coverage-census-2026-08-31.md` |
| #454 | `chatTurn_v16` — the four-card wire bump | opus review: AST-level transcription parity, 5-mutant panel |
| #470 | The v16 deploy ceremony record | runtime **v70** live, `chatTurn: chatTurn_v16` bundle-proven; manifest fully deploy-locked (healed v69's missed v15 lock) |
| #471 | The confirmation login-CSRF finding, deferred by ruling to FS-4 | R8 + ADR-0075 §6; two in-session review lanes (not recorded on the PR) |
| #472 | The scope-census fourth-entrance gap, as a hard precondition on #455 | widened to bind a SHAPE, not one PR |

## 2 · IN FLIGHT at compaction — three fix rounds and two standing reviewers

**All three lanes have their complete orders on disk.** A resuming session reads the order file, not
this summary.

| Lane | Order file (scratchpad) | State at compaction |
|---|---|---|
| **#451** P4-2 scope spine, round 3 | order-p42-round3.md | Codex running. Live tip `adff9066`. **`db-live-gates` PASSED** — the decisive behavioural leg for the changed router. `db-estate` was still running. |
| **#462** COA apply, round 2 → round 3 | order-coaprb-fold.md, then order-coaprb-round3.md | Codex running round 2. **Round 3 is written and NOT yet dispatched** — dispatch it when round 2 reports. |
| **FS-4** design gate | order-fs4-fold.md + a W-R addendum (recorded in §4 below) | native opus lane working the fold |

Scratchpad root: `C:\Users\zhant\.claude\jobs\eeca8047\tmp\` (machine-local; the orders are the
only session-local artefacts that matter, and §4 below carries what is not in a PR body).

Two reviewers stand by to re-verify: the #451 reviewer (with a precise seven-point plan, including
mutating the new predicate to prove all three call sites move together) and the #462 reviewer.

## 3 · The three defect classes found today, and what each cost

1. **Truncated verdicts.** `| tail` on a gate and `tail -5` on a merge conflict list produced (a) a
   swallowed red and (b) **36 committed conflict markers plus a resurrected duplicate route**. Both
   were the orchestrator's, both caught by review, both repaired. **Read exit codes, never a piped
   tail.**
2. **A one-time verification read as a standing gate.** #454's PR body said "Field transcription:
   MATCH" — that was the *reviewer's own* comparator, not a shipped instrument. A Backlog row was
   closed on it wrongly and has been restored with the measurement (`check-parts-parity.mjs:366`
   takes only `.keys()`; the field arrays are discarded).
3. **Instruments that measure the wrong thing.** Three separate cases: W-L's mutant is
   non-discriminating (proved on a rig — shipping and mutant bodies both refuse); W-R asserts a
   global repo shape rather than the train-scoped property it exists for; and C1–C4 were one mutant
   reported four times.

## 4 · FS-4 design review — the findings that exist in no PR body yet

**Verdict: FIX REQUIRED — 3 BLOCKER, 14 MATERIAL, 9 NIT.** The survey was re-derived on the
reviewer's own rig (20+ measurements, all held) and called *"the strongest document in this gate"*.
The failures are in the door's specification and its acceptance battery. Line numbers are at tip
`b1dad0fb` (part2.md reflowed after the first report).

**BLOCKER-1 — the door as specified strands the paying customer, three ways.** W9 (part2.md:208)
requires an *unconsumed* payment row, but the body consumes it on the first call (`:224`) — so the
rotation at `:216` that design.md:340 promises as the recovery is **unreachable on exactly that
state**. What is specified is G1 option (a) wearing option (c)'s label. Second: the FK at `:168`
(`consumed_admission → firm_admissions(id)`, no ON DELETE) raises `23503` if W9 is relaxed naively —
probed. Third: `:173`'s CHECK forbids re-pointing. **And the stated safety argument at `:247` is
wrong** — W7 does not refuse in the `create_firm` → `close_paid_registration` window; W9 does.
*Fix:* consume the payment when the firm exists, restate W9 as "a payment exists AND this
registration has no firm", supersede by marking not DELETE (裁-74). **The owner's G1 ruling now has a
different question in front of it: a repaired rotation vs the fold.**

**BLOCKER-2 — W-L's mutant is non-discriminating; the two-firms invariant is unproven.** `_create_firm_core`
has TWO guards (an `exists()` pre-check AND a `unique_violation` catch on `uq_membership_active_user`).
The stated mutant deletes only the first; both bodies raise the identical refusal with zero firms
leaked — **the cell stays green under its own mutant.** *Fix:* a two-mutant panel — (m1) delete the
check AND drop the index → must RED; (m2) delete the check alone → a **MUST-NOT-RED control**.

**BLOCKER-3 — PKCE silently breaks cross-device confirmation, and §3.4 forbids the escape.** The
binding is genuinely sound (verified in `auth-js` source, not docs). But the mail must be opened on
the device that signed up, and design.md:230-231 states *"no `token_hash` arm, not even a
fallback"*. A mis-configured template, a wrong device and a stale verifier all render the identical
`?status=invalid`. A second variant: with no explicit `flowId` the verifier resolves to the legacy
fixed key, so a second pending PKCE flow in the same browser breaks the earlier link. *Fix:*
distinguish the refusal with a re-send control; specify flow-id handling; **and put the cross-device
cost to the owner — 裁-68③ asked for a binding, not for losing cross-device signup.**

**The six on W-R** (the cell meant to hold the no-Server-Actions rule): it asserts a **global repo
shape**, not §1.1's train-scoped property, and the two come apart in both directions · it **rots** —
`template.tsx` is Next's standard remount file and the three cheapest greens (bump the count,
allowlist, narrow the glob) each silently retire a security wall · **the family it counts is smaller
than the blind spot and the rest is not zero** (6 non-LEAF special files on main, 7 on the entry
branch) · a **string count is not a parse fact** (misses single-quoted `'use server'`, matches
comments) · it has **no home** (name the file, require its `apps/web/test/manifest.txt` row, forbid `.skip`) ·
and **§1.1 leads with its weaker argument** (none of this train's surfaces are firm-scoped, so the
census is not what guards them; the sound argument is that a route leaf MUST classify into
`SCOPE_UNSCOPED_SURFACES` with a reason, which a Server Action escapes entirely).
*The rule itself was verified incidental, not a contortion:* step ③ is a client component, ② is
already a route handler, ⑤ and ⑧ must be routes — a Server Action was never a candidate. **But step
④ (the DPA step) is the one server-side entry with no transport named** — the seam where a build lane
would reach for one.

**The MATERIALs worth carrying** (full list in order-fs4-fold.md): a **second** unreported
contradiction with 裁-73 (the `create_firm` D1 recut, which 裁-73 priced as "no D1 window") ·
`stripe_event_problems` has no resolution column, no reader, and permanently excludes the event ·
the stated sweep recovery cannot be executed by any principal (grant mismatch) · four acceptance
mutants land on the wrong limb · nothing prevents two paid Checkout Sessions for one registration ·
a DPA version bump strands every mid-flow paying customer · the checkout success route is reached by GET and
the design never says so · **and the biggest missing owner question: PDPA retention and erasure for
`stripe_events`**, which stores Stripe's full `customer_details` in a table whose UPDATE, DELETE and
TRUNCATE all raise — **no erasure path exists by construction**.

## 5 · What the owner owes (unchanged in substance, sharpened by FS-4)

1. **Stripe KYB submission — the only item with external latency.** Days on Stripe's side; beta
   cannot charge without it. Test mode does not wait for it.
2. **G5 — the DPA text does not exist.** All three files in `docs/ops/legal/` are something else (an
   OpenAI DPA brief, a letter a firm sends its clients, a PDPA memo). Fail-closed by construction:
   `dpa_documents` empty + `sign_dpa` refusing means **no self-serve firm can be created**. The train
   builds and reviews fine; it cannot be switched on for a real customer.
3. **The item-85 amendment, BEFORE the Supabase setup act** — the mail template moves to the PKCE
   `code` form; the prefetch reason behind the old token-hash instruction is still correct and is
   answered by the landing page P4-3 already built.
4. **New, from the review:** the cross-device signup cost (BLOCKER-3) · the `stripe_events` PDPA
   retention question · the double-payment residual · G1's real choice (repaired rotation vs fold).
5. Standing: sign ADR-0077 · Supabase auth settings (blocks FS-11) · Cloudflare access (blocks
   FS-10) · the pricing sitting.

## 6 · Resume in one paragraph

Read `PROGRESS.md`, then this file, then the three order files named in §2. The immediate moves are:
dispatch **#462 round 3** when round 2 reports (order-coaprb-round3.md, already written); re-verify
**#451** through its standing reviewer once round 3 pushes, then **merge it — that unblocks
retargeting #461, #455 and #453 to `main`**, which is also the first time gitleaks will ever scan
those branches; and carry FS-4's fold back to its reviewer. **#455 additionally waits on the census
fix** (`PROGRESS.md` Known issues + FS-3's hard precondition). Beta remains ≈7.5 lane-units plus the
PRs in flight and two ceremonies; the bilingual state-of-build picture is the artifact published
this afternoon.
