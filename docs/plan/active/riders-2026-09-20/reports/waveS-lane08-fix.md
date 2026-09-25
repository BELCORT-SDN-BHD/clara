# riders sweep wave — lane 08 (#1136, #1137) — FIX ROUND

- **Worktree** `C:\Users\zhant\Desktop\clara-wt\635` · **branch** `riders/wS-lane08` · **base** `061a6992b`
- **Head before this round** `e890a56c6` (14 commits) · **head after** **`0bbf3addb8988521fac2d5b2faf5d67a78e654c3`** (20 commits)
- **Database** `127.0.0.1:55741 / clara_l01`, ledger **314 files**, max `0353_tenancy_agent_twins_obo_confirmations`
- **0353 ledger checksum after this round** `18fd1d8b27d37de6572bf57e9a1967cb2f929a18c06ec04703ce3c8e5865c0d8` (was `bb70ac8c…`)
- **0352 is byte-untouched by this round.** Worktree clean; no push, no PR, no GitHub write.
- **No mid-task status request reached this worker.**

> **FOR THE CUT AND THE INTEGRATOR — READ §7 OF THIS FILE.** The successor contracts in
> `waveS-lane08-ticket1136.md` and `waveS-lane08-ticket1137.md` are **amended** here: one refusal
> row was missing and is now wrong where it stands, and the one contract question those reports
> handed on undecided is settled with its measurement. This file's §7 supersedes them on those
> points. (The work order lets a fix worker write exactly one file in the main checkout, this one,
> so the amendments are here rather than edited into the ticket reports.)

---

## 1 · Commits added by this round

| commit | what |
|---|---|
| `3d4d5fe22` | `fix(db)` — **ADV-L08-01**: the OBO confirmation refuses an inactive client, as the human door does |
| `8ee019551` | `test(db)` — **ADV-L08-02**: the next divergence between the two plan steps is a red, not a review finding |
| `377190ab9` | `test(db)` — **ADV-L08-01 (second half, REFUTED)**: the revision twin does NOT grow a wall its human door lacks |
| `984b7e9cd` | `test(db)` — **SPEC-L08-1137-E**: the estate's fourth plan writer joins the (T.4) roster |
| `db8780701` | `docs(db)` — **ADV-L08-04** + the two false header sentences + `README.md` § 0353 |
| `0bbf3addb` | `chore(db)` — drops `zz-gates.txt`, a scratch file this round committed by mistake in `8ee019551` |

Three files changed by this round: `migrations/0353_…sql`, `tests/tenancy-agent-twins.test.mjs`,
`tests/plan-overlap-template-arm-retired.test.mjs`, plus `README.md`. **No file under
`packages/runtime`, `apps/web` or any frozen closure was touched** (`git diff 061a6992b...HEAD
--name-only -- packages/runtime` is empty; the whole branch diff is fifteen files, all under
`packages/db`).

---

## 2 · Findings, one by one

### ADV-L08-01 — blocker — `clara.confirm_tenancy_rent_plan_for` confirmed a rent plan for a NON-ACTIVE client — **REPRODUCED, then FIXED** (and its second half **REFUTED**)

**Reproduced first, as a red cell rather than a probe.** An eighth case was added to
`p1137.obo.refusals_match` driving `archived` and `onboarding` through **both** entrances on one
tenancy. It failed for exactly the right reason:

```
not ok 1 - p1137.obo.refusals_match …
  error: 'client_inactive (archived): the OBO twin did NOT refuse'
```

— the human door refused, the OBO twin succeeded. The review's diagnosis is confirmed on the live
catalog: `prosrc ~ 'client_inactive'` is TRUE for `clara.create_accounting_plan` and FALSE for
`clara._tenancy_plan_core`, `clara._confirm_tenancy_rent_plan_core` and
`clara.confirm_tenancy_rent_plan_for`.

**Fixed — and NOT where the review asked, on purpose.** The wall is
`clara.create_accounting_plan`'s own, verbatim (sqlstate `CLR10`, sentence
`client is not active -- no new accounting plan`, detail `{"reason":"client_inactive"}`), placed at
the **top of `clara._tenancy_plan_core`**, which is that door's own position in the ladder. The
review's required fix put it in `clara.confirm_tenancy_rent_plan_for`, in 0307's shape. That
placement is right for 0307 and wrong here, and the difference is which body is **shared**:

| | 0307 (`create_prepayment_schedule_for`) | 0353 (`confirm_tenancy_rent_plan_for`) |
|---|---|---|
| plan/schedule step | `clara._prepayment_schedule_core` — **SHARED** by both entrances | `clara.create_accounting_plan` (human) **vs** `clara._tenancy_plan_core` (OBO) — the OBO step is **private** |
| so the wall goes | in the twin, the only place left | in the OBO step, mirroring the human step exactly |

Two consequences of the entrance-level placement, both **driven** rather than argued
(`p1137.obo.plan_step_parity` arms 3 and 4):

1. **Order.** An entrance-level wall fires above every draft wall, so an archived client with no
   terms recorded would answer `client_inactive` where the human door answers `terms_incomplete`.
   Driven: both entrances now answer `terms_incomplete`, same sqlstate, same sentence, same detail.
2. **Replay.** An entrance-level wall fires above `clara._reserve_op`, so replaying a confirmation
   the person already made would be refused once the client was archived. Driven on both entrances:
   the stored receipt comes back `deepEqual`-identical.

**The second half of the required fix is REFUTED, with a measurement.** The review also asked for
the wall on `clara.confirm_tenancy_rent_plan_revision_for` "for symmetry with the precedent". That
would be a defect: `clara.revise_accounting_plan` carries **no** client-status wall (measured:
`prosrc ~ 'client_inactive'` is FALSE), and the revision lane has **no lane branch at all** — both
entrances go through `clara._revise_accounting_plan_core`, one body. A wall on the OBO entrance
alone would create the divergence this finding exists to close, in the opposite direction.
`p1137.revision.client_status_parity` drives it: two identical escalating tenancies, both clients
archived, one entrance each — **both admitted**, identically (observed: both plans at revision 2
for an `archived` client). The cell asserts **parity**, not the branch, so it stays green if 0193
later grows the wall (both entrances would get it) and red the moment the two diverge; and it pins
its own premise (the revision core still calls the shared body, still carries no `p_lane = 'obo'`).

*Whether the plan lane should refuse a revision for an archived client at all is 0193's question and
a person's judgement — carried as follow-up 3 below, not answered by a twin.*

**Blast radius, re-checked and unchanged from the review's account:** nothing posted either way
(`clara._plan_admit_occurrence` re-reads the status and `clara.wake_due_plan_occurrences` filters
`cl.status = 'active'`); the harm was the rows written and the
`rent_plan_already_confirmed` / `payable_account_in_use` walls they would then hold against the
person's own legitimate confirmation once the client was activated.

### ADV-L08-02 — minor — `clara._tenancy_plan_core` is a third snapshot and already behind — **GUARDED** (the duplication itself is follow-up 1)

The duplication cannot be removed inside this lane: `clara._obo_plan_core` is lane L1's this wave
(#1051, then #1080), and the sweep's grouping rule forbids two lanes writing one body. The review's
own standing remedy is taken instead — *"the standing guard is a CELL rather than a comment"*:

**`p1137.obo.plan_step_parity`**, four arms:

1. **The census.** Every `reason` token `clara.create_accounting_plan` raises must be either raised
   by `clara._tenancy_plan_core` or on `PLAN_STEP_NOT_REACHED`, a named roster whose every entry
   says which wall **above both lanes** makes it unreachable and which cell drives that wall
   (`client_not_found`, `invalid_op_key`, `operation_in_flight`, `plan_kind_unsupported`). A
   **stale** entry — a token the human door no longer raises — is a red too, so the roster cannot
   outlive its reason. Structural by necessity: a wall a later lane adds cannot be driven by a cell
   written today (WORK-ORDER rule 4's own carve-out for a catalog census).
2. Both bodies still resolve the cited instruction through `clara._authority_ref_refusal` — that
   refusal's token is a **variable**, so arm 1 cannot see it.
3. The position (above).
4. The replay (above).

**Vacuity control** (WORK-ORDER rule 4). The **subject** was broken once, not the test: §F's own
body re-installed with the four wall lines removed (`sha 3065a41f… → 22522c74…`), and arm 1 went
red naming exactly `client_inactive`, with `p1137.obo.refusals_match` red beside it. Restored by
`CLARA_MIGRATION_REDO=0353_…`; sha back to `3065a41f…` **byte for byte**, both cells green again.

**Forward-compatibility checked, not assumed.** #1051 folds the authority-ref wall out of
`clara.create_accounting_plan` into one shared predicate. That **shrinks** the human token set, so
arm 1 stays green; the four excluded tokens are not authority tokens, so the "stale entry" arm stays
green too. The guard fails only on the shape it exists for: a **new** wall on the human plan step.

### ADV-L08-03 — note — the confirmation op-key hash omits the named author — **ACCEPTED, and written where the cut will read it**

No code change (the review agrees none is needed if the ruling stands). The contract line the review
asked for is in **§7.3** below.

### ADV-L08-04 — note — the `authority_lost` arm distinguishes another firm's client for a caller holding a DEACTIVATED member's id — **HEADER NARROWED**

§I wall 3 claimed the pair "cannot enumerate another firm's clients". True of the **non-member** arm
it is written about; not true of the deactivated arm. The sentence is narrowed to the arm it
describes and the asymmetry is written down with its reason (0307's own ruling; the caller is
`clara_runtime`, which reaches the row anyway). No behaviour change.

### ADV-L08-05 — note — `p_lane` is unvalidated in both confirmation cores — **DECLINED, with the reason**

The review calls it optional and cheap. It is not cheap **here**, and the reason is the thing that
makes this split safe. Both confirmation cores are **derived bodies**: §0 applies a closed roster of
anchored substitutions to the live pre-image and refuses unless the result hashes to the body
embedded in the file, and §TAIL reverses the surgery and hashes back to the pre-image. The law those
two blocks enforce is *"every line below is the human door's own, byte for byte"*. A hand-added
`p_lane` validation is a line the human door does not have, so it would have to become another
anchored insertion **and** its own reversal — new machinery in the one place in this file whose
whole value is that it has none. Against that: the branch is unreachable today (both cores are
ungranted — measured `proacl = clara_fn_owner=X/clara_fn_owner` — and both callers pass a literal),
and it already **fails closed** (an unknown lane takes the JWT path and raises CLR04 `no
authenticated actor` on a runtime connection). `p1137.revision.client_status_parity` now also pins
that the revision core carries **no** `p_lane = 'obo'` branch, so a lane that grows one is a red.
**If the integrator wants it anyway, it belongs in the follow-up that collapses
`clara._tenancy_plan_core` (follow-up 1), where the core is being rewritten regardless.**

### SPEC-L08-1136-A and SPEC-L08-1137-A — major — the chat tools are a successor contract, not a cut — **CARRIED, not a lane defect; one half of -1137-A is now SETTLED**

Neither is fixable in this lane and neither is a defect in it: the lane's ruled scope is *"the
DATABASE HALF ONLY … the CHAT TOOLS THEMSELVES are NOT built in this lane"*. Re-measured on the
final head, so the claim rests on this round's bytes and not the review's:

- `git diff 061a6992b...HEAD --name-only -- packages/runtime` → **empty**
- `FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` → **OK 347 / 60 / 3**
- `git diff 061a6992b...HEAD -- frozen-workflows.json` → **empty**

**What the orchestrator must carry:** #1136 AC2 and #1137 AC2's second half are **not delivered by
this lane**. Neither ticket can be closed on this merge. The seven successor contracts (three in
`waveS-lane08-ticket1136.md`, four in `waveS-lane08-ticket1137.md`) are re-parented to the
mainline's next `chatTurn` cut, **as amended by §7 below**.

**The one contract question those reports handed on undecided is settled in §7.2**, with the
measurement that settles it.

### SPEC-L08-BOTH-B — minor — "from-scratch chain green" was unmeasured — **NOW MEASURED, GREEN**

The review assigned this to the integrator because a second chain on a lane cluster is forbidden
(0154 pins a cluster-wide role count). A **disposable cluster** was used instead, which is the rig's
own sanctioned pattern for fix workers (RIG.md, sweep-wave section: "the fix workers' disposable
clusters 55704, 55705, 55707"):

```
pg_createcluster 17 rigl08fix -p 55707 --start …   →  17.11
pnpm --filter @clara/db migrate                    →  314 new migration(s) applied · 314 total
  [notice] #1136 §0 prestate OK -- mode FRESH …
  [notice] #1136 tail: OK …
  applied 0352_agent_read_twins_payroll_agreement
  [notice] #1137 prestate: OK … (modes: FRESH ×9); 15 neighbour(s) unmoved.
  [notice] #1137 tail: OK …
  applied 0353_tenancy_agent_twins_obo_confirmations
pg_dropcluster 17 rigl08fix --stop                 →  dropped
```

**`0001 → 0353` is green from scratch on a cluster that had never seen this estate**, against the
file text as it stands at `0bbf3addb`. The cluster was dropped; no cluster, database or role was
left behind, and no second chain was run on any lane cluster. **#1136 AC3 and #1137 AC3's first
half are now satisfied by measurement**, not deferral.

### SPEC-L08-1137-C — minor — six read twins and a ninth split where the plan scoped two reads — **FOR THE ORCHESTRATOR TO RATIFY (nothing to fix)**

Re-checked rather than taken on trust. The widening is forced by the ticket's own key interface:
#949's `read_tenancy_terms` calls three doors and `read_rent_settlement_candidates` two, and the
revision confirmation ends in `clara.revise_accounting_plan`, so the four tools genuinely cannot run
on two reads. Measured harmlessness holds at this head: all six read cores contain zero write
statements, the six wake doors are `clara_agent_ro` only, the allowlist gains exactly six
`interactive` rows and nothing for an act (0353 §TAIL re-reads all of it).
**Action: a line on #1137 or in SWEEP-PLAN.md recording the widening as a decision.** This worker
writes nothing to GitHub.

### SPEC-L08-1137-D — minor — a THIRD copy of the OBO plan-creation body — **FOLLOW-UP 1 BELOW, and now guarded**

The collapse cannot happen in this lane (see ADV-L08-02). Ready-to-file text is in §6 follow-up 1.
Until it lands the duplication is watched by two cells rather than by a comment:
`p1137.obo.plan_step_parity` (refusal vocabulary) and the (T.4) roster (the #929 rung and the
self-excluding advisory).

### SPEC-L08-1137-E — minor — the new plan body is outside the (T.4) roster — **FIXED**

`clara._tenancy_plan_core` is added to `plan-overlap-template-arm-retired.test.mjs`'s (T.4) roster,
sha-pinned at `3065a41f862a419fe25cfa1c9d665e2b57578a54a6c4bfc489f5c13f4887d37b` and gated on 0353's
own stem, so it is inert on any chain below this migration. There was no live defect — the body
carries `pg_advisory_xact_lock(203005004, hashtext(p_client::text))`, calls
`clara._plan_overlap_warning(p_client, p_basis, v_plan)` with its own plan id and holds no row lock
— the estate simply had an unwatched fourth plan writer, which is how ADV-L08-01 happened one
section above. **Vacuity control:** the subject was broken once (§F re-installed without its wall,
`3065a41f… → 22522c74…`) and `p929.tail` went red; restored by redo, byte for byte, battery 6/6.

The entry drops off when follow-up 1 turns the body into a two-line delegate, exactly as the thin
revision delegate did; that is recorded in the file so the future removal is a choice.

### SPEC-L08-1137-F, -G, -H, -I, -J — notes — **no action, and here is why each stays**

- **F** (the (T.4) row-lock probe narrowed in the commit that needs it): re-measured at this head —
  only `clara._revise_accounting_plan_core` carries `for update` at all, and the three other roster
  bodies contain the old substring zero times, so the old probe was already inert for them. The
  reviewer confirmed it; nothing to change.
- **G** (a stable op key where #949 wrote "a FRESH `p_op_key` per act"): deliberate and driven
  (`p1137.obo.one_op_key_namespace`). §7.3 states the departure in the contract so a later reader
  does not "restore" #949's wording and break idempotency.
- **H** (three tools, two doors): correct as built; recorded so the cut does not read two doors as a
  missing twin.
- **I** (`read_agreement_terms` gained a `client_id` input): a cut-time decision, restated in §7.4.
- **J** (eight of nine seams not driven red-first): a process finding about commits that already
  landed; history is not rewritten for it. **This round's own work was driven red-first**: every
  behavioural change here was a failing cell before it was a fix, and the two structural cells each
  carry a vacuity control against a broken **subject**. See §5.

### SPEC-L08-BOTH-K — note — an untracked adversarial probe in the worktree — **ALREADY GONE**

`git status --short` in `clara-wt/635` is **empty** at `0bbf3addb`. `zz-adv-1137-probe.test.mjs` is
not present. (This round also removed `zz-gates.txt`, a scratch file it had committed by mistake —
commit `0bbf3addb`.)

### F1 — minor — TDD vertical slicing — **RECORDED; and the standards report is MISSING**

The prompt names three review files. **`waveS-lane08-codereview-standards.json` does not exist in
`docs/plan/active/riders-2026-09-20/reports/`** — only `-codereview-spec.json` and
`-review-adversarial.json` do. F1 was worked from the prompt's own summary line ("the first commit
per ticket lands the whole migration body against only the first 1–2 test cells"), which matches
SPEC-L08-1137-J's self-declared account. **The orchestrator should confirm whether the standards
axis ran at all**; if it did and its file was lost, any finding in it other than F1 has not reached
a fix worker.

F1 itself is about commits `a1e7e4341` and `3c9c4d622`, which are landed history; it is not
rewritten. It is answered forward, in §5.

---

## 3 · Pins, and what moved

| object | sha at this head | moved by this round? |
|---|---|---|
| `clara._tenancy_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `3065a41f862a419fe25cfa1c9d665e2b57578a54a6c4bfc489f5c13f4887d37b` | **YES** — the wall. It was on **no** pre-existing pin, and is now pinned in (T.4). |
| `clara.confirm_tenancy_rent_plan_for(uuid,uuid,uuid,text,text,text,text)` | `10a5f4b3d48020d98842c261c0cb231fc8f6b7f4ce753ad0ffa07a23f07ebe60` | no (only its §I **header comments** changed) |
| `clara.confirm_tenancy_rent_plan_revision_for(uuid,uuid,uuid,text,text)` | `1e7a87b2105f6add9561d04abf2f02ee8726f47f339239b811fda190012f0681` | no |
| the NINE derived bodies of §0/§TAIL (six read cores, two confirmation cores, `clara._revise_accounting_plan_core`) | unchanged — every pre-image and derived sha in §0 is byte-identical to `e890a56c6` | no |
| the FIFTEEN pinned neighbours of §0 | unchanged (`15 neighbour(s) unmoved`, both branches) | no |
| `0353` ledger checksum | `18fd1d8b27d37de6572bf57e9a1967cb2f929a18c06ec04703ce3c8e5865c0d8` | **YES** (three redos this round) |
| `0352` | untouched, file and ledger | no |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | byte-identical to base | no — and **no entry is owed**: 0353 still contains no dynamic `execute` at all (the 34 matches are `grant execute` and prose), so the reviewed-barrier map is untouched. Re-verified at this head. |

**Both branches of the bimodal prestate were re-driven against the final file text** (WORK-ORDER,
wave-3 addendum — `CLARA_MIGRATION_REDO` only ever takes the redo branch):

- **REDO** — `CLARA_MIGRATION_REDO=0353_… pnpm --filter @clara/db migrate` → `modes: REDO ×9`, green
  tail, new checksum `18fd1d8b…`.
- **FIRST APPLY (FRESH)** — twice. Once inside **one transaction that was rolled back**: every human
  door restored by **REVERSING** its committed core (never typed by hand — each restored body
  asserted byte-equal to §0's own pinned pre-image sha), all nine cores plus the nine new objects
  dropped and the six allowlist rows deleted, then the file run **verbatim** →
  `modes: FRESH ×9`, green tail. Afterwards the catalog reads **zero** `clara.__t1137*` leftovers,
  six allowlist rows, ledger 314 / `0353`, and a plain migrate reports `0 new applied`. And once
  **for real, on a disposable cluster**, as part of the from-scratch chain in SPEC-L08-BOTH-B.

---

## 4 · Gates, with counts (all at `0bbf3addb`, `PGPORT=55741 / clara_l01`, full 130-flag gate chain, `--test-concurrency=1`)

| gate | result |
|---|---|
| the two lane batteries + every neighbour that reads a recut body or a moved guard, in ONE run: `tenancy-agent-twins`, `agent-read-twins-payroll-agreement`, `tenancy-rent-plan`, `accounting-plans`, `accrual-correction`, `accounting-plan-occurrences`, `plan-overlap-sibling-arm`, `plan-overlap-template-arm-retired`, `plan-schedule-yield-wall`, `accrual-bill-conflict`, `authority-ref-human-instruction`, `x42b2-r7-s5-clock`, `x42b2-s5c-clock`, `x42b0-r7-s5-clock`, `x42b0-s5c-clock`, `firm-portfolio-pack`, `wave-b/wb-g-tail`, **`operation-census`**, **`rig-isolation`** (never with the reset flags) | **243 tests · 242 pass · 0 fail · 1 skipped** — the skip is `T19 poison-role`, which needs `CLARA_RIG_ALLOW_RESET`. (Was 241/240/0/1 before this round; the two new cells are the difference.) |
| **from-scratch chain `0001 → 0353`** on a disposable cluster (`rigl08fix`, port 55707), then dropped | **314 new migration(s) applied · 314 total**, both new migrations' FRESH branches and tails green |
| `pnpm --filter @clara/db migrate` on the lane database | **0 new applied · 314 total** — no drift |
| `apps/web/tests/firm-scope-db-pins.test.ts` (sweep rule (c): a migration file changed) | **22/22 pass**; corpus byte-identical, no barrier entry owed |
| `pnpm typecheck` | **Done** (`apps/web`, `packages/runtime`, no errors) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=061a6992b pnpm lint` | **exit 0** |
| `FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` | **OK — 347 / 60 / 3**, unchanged |
| `node scripts/check-wiki-dynamic-sql.mjs` | **OK — 1588 clara function definition(s) and 248 change-of-record patch(es) scanned**; 0353 needs no waiver |
| `node packages/runtime/scripts/check-parts-parity.mjs` (not owed — `packages/runtime` untouched — run to **settle** §7.2) | **OK**, `emittable={freeform_result, work_accepted, work_status, work_result, work_question, knowledge_receipt}`; **every one of `work_result`'s six construction sites is a `claraWork.v*.impl.ts`** |
| `apps/web` unit suite / browser walks | **not owed and not run** — the branch diff touches no file under `apps/web` |

---

## 5 · How this round was driven (WORK-ORDER rule 4)

Five slices, each red before it was green, or carrying a vacuity control against a **broken
subject** where the subject is a catalog body no behavioural cell can reach.

1. `p1137.obo.refusals_match` case 8 → **red** (`the OBO twin did NOT refuse`) → the wall in §F →
   **green**. One test, then the minimal code.
2. `p1137.obo.plan_step_parity` → green on the fixed subject → **subject broken** (§F re-installed
   without the wall, `3065a41f… → 22522c74…`) → **red**, naming exactly `client_inactive` → subject
   restored by redo, **byte for byte** → green.
3. `p1137.revision.client_status_parity` → green, and what it observed (both entrances admitted) is
   reported as an observation, not as a design claim.
4. (T.4) roster entry → green → **subject broken** the same way → `p929.tail` **red** → restored →
   6/6.
5. Prose only; both prestate branches re-driven against the edited text.

No cell was written against a seam the tickets do not name. No expected value was computed from the
code under test: the refusal sentence, sqlstate and detail are `clara.create_accounting_plan`'s own
text, read off the live catalog of the body that is **not** under test.

---

## 6 · Follow-ups the orchestrator files (this worker writes nothing to GitHub)

1. **Collapse the third plan-creation body.** *After #1051 and #1080 land*: widen
   `clara._obo_plan_core`'s closed kind set to admit `recurring_journal` with
   `via = 'confirm_tenancy_rent_plan_for'` (two lines), and reduce `clara._tenancy_plan_core` to a
   caller of it. Then drop its (T.4) roster entry and `p1137.obo.plan_step_parity` becomes
   unnecessary. **If ADV-L08-05's `p_lane` closed-set check is wanted, take it in this ticket** —
   the core is being rewritten anyway. Sequencing matters: the estate currently carries **three**
   OBO plan-creation steps (`_accrual_plan_core`, `_obo_plan_core`, `_tenancy_plan_core`).
2. **Ratify the widened tenancy scope** (SPEC-L08-1137-C) on #1137 or in SWEEP-PLAN.md, so the model
   lane's reach into the tenancy family is a recorded decision.
3. **Should the plan lane refuse a REVISION for a non-active client?** `clara.create_accounting_plan`
   refuses; `clara.revise_accounting_plan` does not, so today an archived client's rent plan can
   still be revised through either entrance. That asymmetry predates this lane and is 0193's, and it
   is an accounting judgement (is a revision to a dormant client's standing arrangement a new
   commitment, or bookkeeping on an existing one?) — **Clara asks, she does not decide**.
4. **Confirm the standards review ran** (F1): `waveS-lane08-codereview-standards.json` is absent from
   the reports directory.
5. **Neither #1136 nor #1137 closes on this merge** — see SPEC-L08-1136-A / -1137-A.

---

## 7 · AMENDMENTS to the successor contracts (this section supersedes the ticket reports)

### 7.1 · `confirm_tenancy_rent_plan` — the refusal mapping gains a row (ADV-L08-01)

`waveS-lane08-ticket1137.md`'s refusal table for this tool is headed *"every token below is answered
IDENTICALLY by the human door"*. That was true of the tokens it listed and **incomplete**: one token
was missing, and it was missing from the door too. Add:

| sqlstate | `detail.reason` | what the tool says | both entrances? |
|---|---|---|---|
| `CLR10` | `client_inactive` | "This client is not active, so no new accounting plan can be created for it. Reactivate the client first." | **yes** — `clara.create_accounting_plan`'s own sentence, `client is not active -- no new accounting plan`, now raised by `clara._tenancy_plan_core` too. Driven on `archived` **and** `onboarding` (`p1137.obo.refusals_match` case 8). |

Position in the ladder, so a tool author does not reorder it: it fires **after** the op-key wall,
the firm wall, the filing and kind walls, the reservation, `rent_plan_already_confirmed`,
`payable_account_in_use`, the draft's own refusals and the judgement wall — it is the **last** wall,
because it lives in the plan step. A replay of an already-successful confirmation returns the stored
receipt and never reaches it.

### 7.2 · The two confirmations' PART KIND — **settled**, and here is the measurement

`waveS-lane08-ticket1137.md` left this open (`work_result` as #949 wrote it, or a typed tool result
in `runStartPrepaymentScheduleWork`'s shape). It is settled here:

> **Take `runStartPrepaymentScheduleWork`'s shape: a typed tool result, no new part kind, no parity
> entry.**

The measurement, from `check-parts-parity.mjs` at this head plus the census it prints:

- `work_result` **is** declared and emittable, and **all six of its construction sites are
  `claraWork.v1/v2/v3/v4/v5/v6.impl.ts`**. Not one is in any `chatTurn.*`. The chat lane has never
  emitted it, and the kind means *a Work run reporting its result* — which is not what a tool call
  inside a turn is.
- The nearest precedent is not near by analogy, it is the **same shape**: an on-behalf-of act taken
  from the conversation through a `_for` door on `pools().withRuntime`.
  `runStartPrepaymentScheduleWork` (`chatTurn.v22.tools.ts:1525`) returns
  `{ok: true, status: "configured", schedule: prepaymentSchedulePart(answer), replayed}` and emits
  **no part of its own**; the turn's existing mapping decides what reaches the wire.
- Cost of the alternative: emitting `work_result` from `chatTurn` would make the chat lane the
  seventh construction site of a kind that has meant one thing for six versions, and would need a
  parity entry.

So:

```ts
// confirm_tenancy_rent_plan
return { ok: true, status: "confirmed", plan: rentPlanPart(receipt), replayed: receipt.replayed === true };
// confirm_tenancy_rent_plan_revision
return { ok: true, status: "revised", plan: rentPlanRevisionPart(receipt), replayed: receipt.replayed === true };
```

The database half is identical either way; the cut ratifies this in one line and
`check-parts-parity.mjs` remains the arbiter.

### 7.3 · `confirm_tenancy_rent_plan` — one line the contract must carry (ADV-L08-03 + SPEC-L08-1137-G)

> The op key is `stableOpKey(ctx.taskId, CONFIRM_TENANCY_RENT_PLAN_TOOL, input)` — a **stable** key,
> deliberately, not #949's "a FRESH `p_op_key` per act": a retried tool call in one conversation is
> ONE intent, not two, and the convergence of a chat confirmation with a human replay under the same
> key is driven by `p1137.obo.one_op_key_namespace`. **The reservation hashes the caller's five
> arguments and NOT the named author** (`client`, `document`, `rent_account`, `payable_account`,
> `judgement`), which is exactly what makes that convergence safe — and it means a replay of the
> same key under a *different* author returns the **first** author's receipt while the records name
> the first author. The chat lane's op key must therefore never be derived from anything that can
> outlive the initiating person. `ctx.taskId` does not, which is why this choice is safe; anything
> firm-scoped or session-scoped would not be.

### 7.4 · `read_agreement_terms` — the `client_id` input (SPEC-L08-1136-I)

Unchanged from the ticket report, restated so the cut does not miss it: the input is
`{document_id, client_id}`, where #948's original was `{document_id}` alone. Both doors the tool
calls take a client, and a document-only tool would have to discover the client first — which is
the existence oracle the tenant wall prevents. **The cut must confirm the chat surface can always
supply a client for this tool**; a firm-level (unpinned) session has no `ctx.clientId`, and the
report's named alternative applies if it cannot.

---

## 8 · Anything still unverified

- **The seven chat tools do not exist.** Every contract in §7 and in the two ticket reports is
  unexecuted TypeScript until the mainline's next `chatTurn` cut carries it. Nothing in this lane
  proves a tool works; it proves the doors beneath them do.
- **`p_lane` outside `{'human','obo'}`** is unreachable and unasserted — see ADV-L08-05.
- **Whether a revision should be refused for a non-active client** is an open accounting question
  (follow-up 3), not a defect this round hid.
- **The standards review file is missing** (follow-up 4); findings it may have carried beyond F1
  have not been worked.
- **`clara._obo_plan_core` and `clara.create_accounting_plan` are lane L1's this wave.** 0353's
  prestate deliberately does not pin them. `p1137.obo.plan_step_parity` compares against whatever
  `clara.create_accounting_plan` is at integration time, so it is the first cell that will speak if
  #1051 or #1080 changes the human plan step's refusal vocabulary.
