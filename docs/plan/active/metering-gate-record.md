# F-A9 (metering) — gate 1: the record

> **The gate ran 2026-08-22** against design **v1** (`metering-design.md` +
> `metering-survey.md` + `metering-annexes.md`). Two lenses: a **byte lens** that
> re-derived every citation, census and count against the live migration/runtime sources
> rather than against the documents' own cites (16 findings), and a **rulings lens**
> against TA-P1…TA-P14 and the seven charter-reserved human acts (2 findings). Every
> finding was adversarially verified by an independent verifier, and **the verifier's
> re-graded severity governs** — two findings the byte lens called "material" were
> raised to blocker, and six findings across both lenses were refuted.
>
> **Verdict: the ruled shape holds; four blockers and six materials bind the build;
> PR-1 is severed into five limbs with exactly one D1 window.** Every finding below names
> its fold; **the fold is v2's Annex E change log and this file is its spec.**
>
> Standing caveat unchanged: migration-source reads are predictions about the live
> catalog; PR-1B's rig replay confirms `admit_autodraft_task`'s tip before it CoRs
> anything (§8).

## 1 · What was attacked and HELD

Recorded because it is settled and should not be re-argued.

- **The corrected seven-generation lineage of `clara.admit_autodraft_task`.**
  `0011:2441` create → `0031` → `0034` → `0036 §D` (the last full CREATE) → `0046` S7.1 →
  `0048` S1 → `0053` — confirmed independently at `0053:299-306` and `0048:51`. No eighth
  generation exists (`0054` mentions the function only in a comment). v1's self-review
  correction was right.
- **D2's whole argument, at the bytes.** The
  `to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)')`
  probes really do sit inside two live frozen closures —
  `witnessFacts.v1.dispatch.mjs:86` and `statementFacts.v2.dispatch.mjs:68` — with the
  10-arg calls at `:339`/`:209` and the registry pointers at `registry.ts:46,57,69`.
  Widening the verb's signature really would cost two `_v3` bumps for zero behaviour
  change. **The sibling-verb decision ships as designed.**
- **The extraction-shape wall.** `0094`'s table shape, its append-only triggers, its
  grant, and the nit-3 comment at `0094:107-108` that the new CHECK replaces are all
  verbatim as cited; the wall genuinely closes the hole the NOT NULL relaxation opens,
  including for the untouched legacy verb.
- **The rename's surface and the law-6/law-22 posture** — extend-only, history rows keep
  `refused_budget`, read surfaces explain both spellings.
- **The law-1 posture of the price calculation.** Spend = tokens × a versioned
  effective-dated row, in one named SQL object, failing closed to NULL on a pricing gap
  rather than guessing. The rulings lens judged this exactly law 1's pattern; only its
  *mechanics* were defective (GB-4, GM-6).
- **Line-precise citations spot-checked and exact:** `0006:938-940`, `:963`, `:967-974`,
  `:976-985`, `:1025`, `:1029`, `:1048-1050`, `:1054-1057` · `0011:734-735`,
  `0011:630-635` · `0046:471-489` · `0048:172-192` · `0007:59` · `0009:809-810` ·
  `0003:67` · `rig-meta.mjs:57,247-249,934` · `0094:50-125`.
- **No third live reader of the three doomed `firm_limits` columns exists in the
  migration tree**, and the outcome-string rename is runtime-safe because
  `packages/runtime/lib/autodraft.mjs:60-64` is a positive allowlist, not a branch.
- **No charter-reserved human act is exceeded**, no TA-P1/TA-P7 pending-amendment
  exposure applies (F-A9 is in neither item's unlocked list), and no model-written
  numeral reaches a durable artifact outside a versioned deterministic evaluator.

## 2 · Blockers — the build may not start until each is folded

**GB-1 · TA-P12's brake census is not closed-world: three live usage gates are missing,
including a per-UTC-day budget its own author calls the firm's vendor spend.**
The census (`metering-survey.md:116-166` v1, `metering-design.md:170-176` v1) enumerated
five gates from `firm_limits` and stopped. It missed an entire second limits table,
`clara.firm_document_limits` (`0007:364-371`, plus `llm_witness_concurrency` added by
`0090`), and the three live refusals that read it:
`clara._reserve_document_ingest` (`0007:1632-1654` — the only `create function` for that
name in the tree, so `0007` IS the live tip) reads `docs_per_day`/`pages_per_day` at
`:1638-1640` and raises CLR18 at `:1645-1647` / `:1648-1650`;
`clara._reserve_processing_call`'s live tip (`0038:7050-7082`, a `create or replace` over
`0009:581`) reads `pages_per_day` at `:7063-7064` and raises CLR18 at `:7076-7078`, its
own comment at `:7056-7058` saying the budget exists so as not to *"misstate the firm's
vendor spend"*; and `clara.claim_document_processing_task` (`0090`, body from `:328`)
raises CLR18 on `ocr_concurrency` at `:421-428` and `llm_witness_concurrency` at
`:434-442`. Ten live call sites were verified across `0007`/`0009`/`0014`/`0015`/`0016`/
`0022`/`0025`/`0026`. A grep of all three F-A9 documents for any of those names returned
zero hits — nothing anywhere scoped TA-P12 to the token/draft lanes.
**Why it is a blocker:** the census is this item's FIRST contract deliverable
(`wave-f-contract.md:366`) and PR-3 would have recorded "every live usage gate
classified" while the largest surviving brake went unnamed.
**Fold:** survey §A.5 re-derived from refusal sites rather than from one table — **eight
gates, not three**; design §3.3 carries all eight. The concurrency pair is classified
**KEEP** here (the ruling's own engine-protection carve-out, decided by this lane). The
two day budgets were **NOT classified by this lane** — Annex A **D13**, design §4, with
**KEEP as the fail-closed default** and PR-3 reporting "six of eight classified" until
the owner ruled (§7). **RULED 2026-08-23 (owner): gate 6 KEEP as ENGINE PROTECTION (+ the
mandatory `refused_budget` rename), gate 7 REMOVE as a spend brake — eight of eight classified.**

**GB-2 · The sales-cap removal cites a byte range that CONTAINS the door it declares
untouched, and is not separable from the column drop.**
Measured directly on `0046_wave_7a_sales_lane.sql`: `:2223-2225` is ONE `select` loading
**both** `sales_admission_watermark` → `v_wm` and `coalesce(sales_admission_daily_cap,15)`
→ `v_cap_sales`; `:2226-2242` is the whole 7A-R5 backfill door (the
`sales_backfill_batches … for update` claim and the `sales_backlog_held` refusals at
`:2235`/`:2239`); `:2245-2259` is the cap count and its refusal. v1's design (`:176`) and
Annex B (`:36`) both instructed removing `0046:2223-2259` — the outer span — while the
design cell simultaneously declared the door inside it untouched.
**Two reachable failure paths.** (a) Follow the literal span: 7A-R5's human-recorded
backfill door is deleted — a governance door TA-P12 never reached. (b) Remove only the
cap branch: `v_cap_sales`'s read of `sales_admission_daily_cap` stays live at `:2223`
while §3.4 drops that column in the same migration; PL/pgSQL does not resolve embedded
SQL against the catalog until first execution, so the DROP succeeds and the FIRST
sales-direction admission after the window raises *column does not exist* — a silent lane
outage, discovered in production.
**Fold:** Annex A **D14** — rewrite `:2223-2225` to read the watermark alone, keep
`:2226-2242` byte-identical, remove only `:2245-2259`; the order dependency is written
into Annex B's DDL 2; C.22 proves the door still refuses `sales_backlog_held` and C.23
proves a sales admission succeeds with the column gone. The honest cost (an open backfill
batch is no longer per-day paced; only `batch_size`, `0046:502`, CHECK 1-500, bounds it)
is stated in survey §A.5(5) and belongs in PR-1B's summary.
**GB-2b, derived at fold time — the same shape at PR-0.** `begin_chat_turn`'s limits read
(`0006:963-965`) is also ONE select, loading `daily_token_limit` **and**
`max_concurrent_runs` into `v_run_cap`, which the KEPT concurrency check at `:981` uses;
PR-1B drops the former column. §3.3's PR-0 row now says **rewrite, not delete**, and names
the three declarations that die with the block — `v_token_limit`, `v_tokens_used` and
**`v_today` (`0006:930`, used only at `:970`/`:973`)**, whose removal has a roster
consequence (GM-3).

**GB-3 · The priced read path cannot return a row for the only role that would call it.**
v1 specified `llm_usage_events_priced` as a SECURITY INVOKER view (`:265-266`) and
`get_llm_usage_summary` as SECURITY INVOKER over it (`:281-286`), reasoning that "RLS
already confines a normal caller" — over a table v1 itself gave FORCE RLS with an
owner-only policy and no `clara_authenticated` grant (`:204-207`). A `security_invoker`
relation makes the **caller's** grants govern every joined relation, and the base-table
GRANT check runs **before** RLS is consulted, so a `clara_authenticated` session raises
`42501 permission denied for table llm_price_table` on every priced read.
`clara_authenticated` is the only role a human session ever holds
(`apps/dashboard/app/chat/api.ts:5`; PostgREST's single `authenticator` login SETs ROLE
from the JWT claim, `0006:72`, `deploy/storage-provision.sql:57-58`) and it does not
inherit `clara_fn_owner` (`0002:112`, `inherit false`). Battery cell C.19 could not have
passed: it raises rather than returning. Raised from material to **blocker** — a
100%-failure read path for its only caller plus an unrunnable acceptance cell.
**Fold:** Annex A **D16** — `get_llm_usage_summary` becomes SECURITY DEFINER owned by
`clara_fn_owner` (the estate's own typed-read idiom, `0016:1075`, and what D5 always
implied), the view is owner-executed, EXECUTE is granted to `clara_authenticated`, and
the body's FIRST statement refuses `p_firm is distinct from clara.jwt_firm()`. §3.7's
"`p_firm` is a filter convenience, not a privilege boundary" is **reversed** — under
DEFINER it IS the boundary — and C.19 is re-cut to prove that wall instead of an RLS
behaviour that no longer applies.

**GB-4 · The spend evaluator's join is session-`TimeZone` dependent — a "versioned
deterministic evaluator" whose money number moves with the caller's GUC (law 1).**
v1's join (`:269-271`) compared `u.created_at` (timestamptz, `0094:65`) against
`effective_from`/`effective_to` (date, `:211`). Postgres resolves that by casting the date
to timestamptz at midnight **in the session's `TimeZone`**, so a call recorded
2026-09-01 03:00 UTC prices against September's row for a UTC session and August's for an
Asia/Kuala_Lumpur session — two different money numbers, no error, precisely on the
boundary day where a price change lands. A repo-wide grep found nothing pinning a session
TimeZone (`SET TimeZone`, `ALTER DATABASE/ROLE … TimeZone`: zero hits), and the estate
treats this as a known hazard class — explicit UTC casts at `0006:930` and `0007:1644`,
with a five-zone hostile battery at `x42b0-s5c-clock.test.mjs:88-93` policing it. Raised
from material to **blocker**: §3.6 is the file's own law-1 deliverable.
**Fold:** both bounds anchored `(u.created_at at time zone 'utc')::date`, the upper bound
inclusive of `effective_to`; **C.21** adds the five-zone determinism cell.

## 3 · Materials — each folds into v2

**GM-1 · The price door's two mechanical checks collapse into one boolean, and the
"agreement" check compares two numerals from the same caller.** `plausibility_band_ok`
(`:229`) took a source disagreement, a band failure and a not-checkable new engine
(`:239-247`) — three distinguishable states in one nullable column, the identical defect
survey §A.6 raises against `refused_budget`, reproduced in the file that fixes it.
Separately, `p_source_a_value_cents`/`p_source_b_value_cents` (`:236-238`) both arrive in
one call from one model turn: nothing in the DB ever read either source, so a model that
misreads a page twice passes the "mechanical" wall (review law 2). **Fold:** D18's two
nullable columns plus `check_note`; §3.5 and the verb's own comment state that the checks
are hygiene, not corroboration, and that the owner's approval is the authority
(constraint 2 / TA-P2 pattern (2)). C.15/C.16 re-cut to assert the flags independently.

**GM-2 · The exhaustiveness claim for the disposed `firm_limits` columns was scoped to
the wrong universe.** `metering-survey.md:201-205` claimed the disposition table was
"exhaustive, not a sample" on a grep of `apps/dashboard` + `packages/runtime` only. That
half holds; `packages/db/tests` was never swept and contains eight readers:
`wave-a-shape.test.mjs:82-83,89-92` positively asserts `sweep_budget_share` EXISTS with
its 0.60 default (a hard failure the moment the column drops);
`wave-a-budget.test.mjs:34-45,210` writes all three columns and its two `refused_budget`
cells PROVE the removed gates; `x46-blind-contract.test.mjs:781,789`;
`wave-b/wb-r2.test.mjs:272,276`; `x47-settle-guard-identity.test.mjs:69-76`;
`x54-transient-attempt-residual.test.mjs:42-45`; plus the two outcome allowlists
`wave-a-helpers.mjs:213,217` asserted at `wave-a-admission.test.mjs:59,79` and
`wave-a-second-run.test.mjs:55`. `0048:188-190` names `wave-a-budget.test.mjs` as the
battery pinning the concurrency bound. **Fold:** survey §A.7's re-scoped table in four
classes, and **D20** puts the repair inside PR-1B — inverting a cell that proves a
refusal is a decision about what the estate still proves, not a roster edit.

**GM-3 · Survey §C mis-described the x42 clock census.** `S5_25_BARE_TOKEN_ROSTER` is not
a function-name registry: a regex (`x42-s5-helpers.mjs:146-147`) MEASURES the live catalog
and the array (`:161-177`) is compared as an **exact set equality both ways**
(`x42b2-s5c-clock.test.mjs:376-380`, `x42b2-r7-s5-clock.test.mjs:200-214`). So v1's
instruction — append the new F-A9 function names — would have reddened it with a one-name
diff (`record_agent_usage_event` has no clock read; `created_at` is a table default,
`0094:64`). v1's "a body edit does not perturb this census" is also false: PR-0 orphans
`begin_chat_turn`'s `v_today`, dropping it out of the measured set while the roster still
names it. And the helper's own comments (`:149-160`, `:401-434`) warn that additions must
be `appliedStem`-gated or every pinned frontier reddens — on the weekly sweep
(`ci.yml:360`), i.e. later, not on the PR. **Fold:** D21, the rewritten §C bullet, PR-0's
own roster removal, and C.20 re-specified as the equality plus the frontier gate.

**GM-4 · "§3.3's removed blocks are their only readers" is false, and PR-4's body list
omits the chat settle writer.** `clara.settle_chat_turn` READS `clara.task_usage` at
`0006:1025` (the terminal-replay receipt's token count) and writes both retiring tables at
`:1048-1050` and `:1054-1057`. Nothing in this item touches it: §3.8's retrofit adds a
call from the TypeScript layer, never edits the SQL body. The false claim was baked into
Annex A's D8 as well ("the write side has no reader after PR-1"). If PR-4 executed
against v1's list, every ordinary chat-turn settle would fail on a dropped table.
**Fold:** §3.9's sentence and D8's ground corrected; `settle_chat_turn` added to PR-4's
body list with its cites; `begin_chat_turn` deliberately NOT added (after PR-0 it
references neither table).

**GM-5 · The recommended price-approval door cannot be reached by any human session.**
v1 recommended EXECUTE on approve/reject granted to a named role `clara_price_approver`
filled by an ops ceremony (`:355-359`, Annex A D10). Every dashboard session
authenticates as `clara_authenticated`, and the JWT role-claim mechanism has no path to a
per-individual role — so the door would be a psql ceremony, the "NOT a PR" shape TA-P2
was chosen to avoid, one substitution removed; C.17 would have proved only that nobody
can approve. The estate's actual owner-door idiom is the opposite shape: coarse EXECUTE
to `clara_authenticated` with the owner floor enforced in the body —
`clara.grant_firm_capability` (`0056:1130-1176`, the `firm_memberships` owner read at
`:1137-1142`), the RS name-only lift (`0063:24-33`), and `rig-meta.mjs:63` stating the
rule. **Fold:** **D17** withdraws the role, adopts the estate idiom as the recommendation,
narrows the genuinely open question to WHICH firm's owner may approve a firm-agnostic
fact, severs **PR-1E** behind that ruling, and re-cuts C.17 onto the rank floor.

**GM-6 · No wall against overlapping or inverted effective ranges; a backdated approval
silently produces one.** v1's only key was `primary key (engine_id, effective_from)`
(`:210-218`) with no range guard, and approve (`:252-255`) supersedes only the currently
open row. Approve a corrective row dated before the open row and that row's `effective_to`
lands below its own `effective_from`; a date inside an already-closed range leaves one
usage row matching two price rows and the view's plain join (`:269-271`, no uniqueness
guard) DOUBLE-COUNTS its spend into `get_llm_usage_summary`'s sum. C.18 tested only the
forward case. **Fold:** **D19** — `ck_llm_price_range`, a partial unique index for the
one-open-row invariant, and approve REFUSING a non-forward `effective_from`. Deliberately
**not** the finding's proposed `EXCLUDE`/`btree_gist`: the extension is installed nowhere
in this estate and the estate says so in its own words (`0056:266-269`; `0057:305-313`
reaches the same conclusion) — contiguity by construction is the house idiom. C.18b added.

## 4 · The width ruling

**Two lenses disagreed, and the byte lens is adopted on buildability grounds.** The
rulings lens judged v1's six-PR shape adequate — each unit matching one D1 window, with
the `admit_autodraft_task` CoR's boundary the only precision problem. The byte lens
judged PR-1 "too wide for one D1 window and much too wide for one PR": four independent
limbs sharing one window, only one of which touches a live body or live tables under it.

**Adopted (Annex A D22).** PR-1 severs into:
**PR-1A** — ledger reshape + `record_agent_usage_event` + the extraction-shape wall.
*No D1*; the table's only writers are two frozen closures calling an untouched verb.
Ships first because every downstream lane's recording obligation waits on this door.
**PR-1B** — the brake census's DB half + the eight-file test repair + the roster edits.
***The one D1 window in this item.*** Judgement logic: independent review before merge.
**PR-1C** — the dashboard rename surface. *No D1.*
**PR-1D** — price table + proposals + propose/reject + the evaluator + the rollup.
*No D1*; all brand-new objects.
~~**PR-1E** — **the approval door alone**, gated on the owner's ruling (§7).~~ **DROPPED 2026-08-23 (owner,
R-L19): price rows are developer-seeded migration data — no proposal, no door. PR-1D's table ships with its
first effective-dated seed.**

**Why PR-1E was its own limb rather than a note inside PR-1D** *(kept as the record; R-L19 has since dropped
the limb entirely)***:** it is the one part of this design that was *not yet designed to a buildable point* —
GM-5 showed the recommended grant unreachable and the open question ("which firm's owner") unanswered. The
severance is what made dropping it cheap when the owner dissolved the question. Bundled, it
would have let an unresolved owner question and a defective grant hold a write-quiesce
window hostage. Severed, PR-1D ships a price table with no rows: the evaluator returns
`spend_cents IS NULL` and the rollup publishes an *unpriced* count — the correct visible
state under TA-P2's missing-day discipline, not a gap.

**Unchanged from v1:** PR-0's severance (TA-P12's own two-batch instruction), PR-2's
severance (it edits a different live frozen closure and must not cross-contaminate F-A2's
version claim), and PR-4's deferral (TA-P13's own wording). Those three were correct.

## 5 · Nits, folded without argument

`runChatTurnModel` removed from the two occurrences v1's self-review missed
(`metering-survey.md:108`, `metering-design.md:401` — the build step a PR-2 author reads
first); the function is `runModelSegmentStepV12` (`chatTurn.v12.impl.ts:95`, sole caller
`chatTurn.v12.ts:88`) · `task` is loaded at `chatTurn.v12.ts:80`, not `:81` (`:81` is
`ctx`) · `usageTokens` re-cited `:146-149` · the retrofit records **one row per segment**
(the call sits inside the `MAX_SEGMENTS` loop at `chatTurn.v12.ts:87`), which is what
"per-call usage" means · §3.4 says the two single-column CHECKs
(`0011:633-634`, `0046:488-489`) fall with their columns — a literal
`drop constraint` after `drop column` raises *constraint does not exist* and aborts the
migration (reproduced on a scratch Postgres), and `ck_firm_limits_max_concurrent_sweeps`
(`0011:635`) is explicitly untouched · the FORCE-RLS sentence is written per-table for
both new tables rather than inherited from §3.5's heading · C.9 gains an explicit
retirement clause and a successor cell (C.9b) for the post-DDL-2 world · the live `0036`
line numbers (`:1397-1407` concurrency, `:1408-1417` token budget) are recorded beside
the `0011` cites both lenses quote.

## 6 · Refuted register — recorded so nobody re-raises them

- **"Both removal targets are cited against a body superseded three generations ago."**
  True at the bytes (`0034` moved the `_finish_op` wrapper, so `0036`'s text differs from
  `0011`'s) but **already carried**: every one of the three cites is labelled a prediction
  at the point of citation, Annex D names the risk in so many words, and the binding build
  step is rig replay, not the cited numbers. The refusal STRINGS are byte-identical across
  both generations, so no disposition changes. *Folded anyway as a courtesy (§5).*
- **"`llm_price_proposals` has no RLS posture."** Postgres grants nothing to a non-owner
  on `CREATE TABLE`, and `ALTER DEFAULT PRIVILEGES` is used in this estate for FUNCTIONS
  only (`0037:3985`, `0038:5274`, `0040:2737`, `0044:5029`) — never for tables. The claimed
  exposure is structurally unreachable, and `rig-meta.mjs:1077-1112`'s T18 branch derives
  every `clara` base table and fails an unlisted one that forgets FORCE RLS, on every
  code-touching PR. *A doc-completeness nit; the sentence was added anyway (§5).*
- **"Three battery cells are unrunnable."** The attack's premise (the rig cannot stage a
  pre-migration world) is contradicted by its own cited byte: `db-slice-frontiers`
  (`ci.yml:360`) already stages Postgres pinned at named pre-migration frontiers. C.9 is
  mis-scoped by the attack — it tests the post-PR-0, pre-DDL-2 state, which is a real
  window. *What survived, at nit level: C.9 needed an explicit retirement clause, folded
  as C.9b; `db-slice-frontiers` is not per-PR, recorded in Annex D.*
- **"Cross-item sequencing with F-A2 on `admit_autodraft_task` is unstated."**
  `admit_autodraft_task` appears NOWHERE in F-A2's design set (grep, zero hits across all
  five files); F-A2's retirement inventory (`f-a2-annexes-1-estate.md:76-97`, 31 named
  artifacts) is the bank-rules machine, and its PR-1 D1 list (`:416-420`) is
  `settle_autodraft_task` ×2, `mint_wake_credential`, `wake_open_question`. **The two
  lanes' PR-1 windows share no live body.** Recorded as a checked fact in Annex B.3.3, so
  a future change to F-A2's scope is visibly a change to this.
- **"The sales-cap instruction is self-contradictory AND the 0046 tail arity census
  blocks the CoR" (rulings lens, blocker).** The overlap half is real and was confirmed
  through the byte lens (GB-2). The rest is refuted: the `0046:2804` tail is an
  **IN-TRANSACTION self-verification** that ran once at `0046`'s own application — a later
  migration cannot fail it, and writes its own tail instead, exactly as `0048` and `0053`
  did. The attack's worked example also invents a 200-document ceiling; the CHECK's real
  bound is **500** (`0046:502`, re-asserted `:1887`, named in prose at `:482`). And the
  backfill-pacing consequence is the direct, in-scope effect of TA-P12's own REMOVE, not
  an over-reach — recorded as an honest cost (GB-2's fold), not as an unauthorized act.
- **"TA-P14 clause 2's 'minimal door, never absent' is silently unmet — the price door
  has no UI and no pending-proposals reader" (rulings lens, material).** Refuted:
  "one-click" is this codebase's term for the audited verb call itself
  (`track-a-sitting-agenda.md:100`), the same sitting's TA-P8 ships an identical shape
  with no list-reader (`pr1-ledger.md:96-98`), and law 61's audited ceremony — which the
  design explicitly cites — is screen-less by ratified design (ADR-0037/WB-R22, digest
  `README.md:391`). `propose_llm_price` returns the proposal uuid for conversational
  relay. There is no deferred screen to record, because none was ever the plan. *Annex D
  now says this positively rather than leaving it to inference.*

## 7 · Owner items — what this lane did not decide

1. **Do TA-P12's REMOVE classes reach the document/processing lane's per-UTC-day doc and
   page budgets?** (GB-1; Annex A D13; design §4.) **RULED 2026-08-23 (owner) — and the
   answer is SPLIT, which is why the question was worth putting.** **Gate 6** (document
   ingest, `0007:1638-1650`) **= KEEP, re-classified ENGINE PROTECTION** — it bounds engine
   work, not spend, so it sits with gates 2, 4 and 8 under law 76's own carve-out, and it
   carries the **mandatory `refused_budget` rename** alongside gate 4's `refused_concurrency`.
   **Gate 7** (processing call, `0038:7063-7078`) **= REMOVE** — its own author calls the
   budget the firm's vendor spend, so G8's meter-never-cap reaches it.
   **Consequences: only ONE extra body joins PR-1B's D1 window (`_reserve_processing_call`),
   not two; and the census is CLOSED-WORLD — PR-3's acceptance now says "EIGHT of eight
   classified", four REMOVE (1·3·5·7) and four KEEP (2·4·6·8).**
2. ~~**WHICH human may approve a firm-agnostic price row?**~~ (GM-5; D17; §4.)
   **RULED 2026-08-23 (owner, R-L19) — DISSOLVED, not answered: price rows are DEVELOPER-SEEDED
   platform data**, a versioned effective-dated migration seed through the full PR ladder; **a
   price change is a ticket and a PR.** So **PR-1E (`approve_llm_price_proposal` + D17's owner
   floor) is DROPPED, not deferred**, the **"Clara drafts a price proposal" limb is dropped with
   it**, the **evaluator prices from the seeded rows**, and the **unpriced-count rollup STAYS as
   the tripwire**. There is no approver, so there is no "whose ownership counts" question left.
3. **Notice, not a ruling request — the backfill pacing cost.** Removing the 15/day sales
   cap also removes the only per-day pacing on an already-open backfill batch
   (`0046:472-482`); an open batch is then bounded only by `batch_size` (1-500). This is
   the direct consequence of TA-P12's own REMOVE and needs no new ruling, but the sentence
   belongs in PR-1B's summary so the owner meets it before the behaviour, not after.

## 8 · What PR-1's rig replay must confirm (this gate's own predictions)

- **`clara.admit_autodraft_task`'s live tip** at PR-1B time, by rig replay and
  `pg_get_functiondef` — never by name-grep against migration source. Specifically: that
  the token-budget block, the concurrency block and the `0046` sales splice are present in
  the predicted shapes; that `0053`'s re-admit-after-withdrawal arm and `0046:2226-2242`'s
  backfill door **survive the recut** (positively read, not assumed); and that the
  anchor the patch replaces occurs exactly once.
- **The shared-SELECT rewrites** in both `begin_chat_turn` (PR-0) and
  `admit_autodraft_task` (PR-1B) leave no read of a dropped column anywhere in either
  body — measured after the recut, before the column drop in the same file.
- **The `S5_25_BARE_TOKEN_ROSTER` equality in both directions** after PR-0 and after
  PR-1B, and again under a pinned frontier for any cohort this item adds.
- **`firm_document_limits`' four columns and their three refusal sites are unchanged** by
  every F-A9 migration — the fail-closed default of owner item 1, proven rather than
  intended.
- **The two `to_regprocedure` probe strings still resolve** after DDL 3 (C.2).
- **`get_llm_usage_summary` is callable by `clara_authenticated` and refuses a foreign
  `p_firm`** — the GB-3 fold proven from a real PostgREST-shaped session, not from an
  owner session that would pass either way.
- **The priced view's `spend_cents` is identical under five hostile session TimeZones**
  (C.21) — the GB-4 fold proven with the instrument the estate already uses.
