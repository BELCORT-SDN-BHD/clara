# wave 3 · lane 05 · fix round 2 — #908 #909 #927 #928 #929

**Branch** `riders/w3-lane05` · **base** `ffe63a0dd084e99b84c1368119845be273c421ce`
**Head at start** `d8ff391a8` · **NEW HEAD** `1db1d36a2` · tree clean.

Three commits this round, on top of the sixteen the lane already carried:

| commit | what |
|---|---|
| `5d8ff0bcf` | `fix(db): #909/#929 the plan-overlap advisory self-excludes by plan id, and its three doors take the client rung` |
| `15c73d8a8` | `docs(db): #929 record 0283's fix round, its two prestate branches and the one finding that stays open` |
| `1db1d36a2` | `docs(web): #929 say what a null overlap_warning means after 0283's fix round` |

Database `clara_l05` at **271 migrations**, `0283_retire_plan_overlap_template_arm` checksum
**`0832489ac90494c17e31d90ca570bd35127ec229e8552d663534b180e7520ef3`** — which is byte-for-byte
`sha256` of the committed file, re-derived after the commit. **The integrator must use this
checksum**; the one in the round-1 report (`28e63017…`) is superseded.

---

## The disposition, in one line each

| id | verdict | why |
|---|---|---|
| **RECHECK-01** — the agent-lane prepayment path can still mint an unreachable 0045 template | **REPRODUCED FIRST-HAND, STILL OPEN BY DESIGN** | The recheck's own `required_fix` says no code fix is owed to this lane; an owner/orchestrator ruling is. Nothing in this round's unlock changes that — it is a product capability, not a migration-scope problem. |
| **RECHECK-02** — the plan-overlap advisory's concurrency window | **REPRODUCED, THEN FIXED** | The recheck deferred it because "the fix recuts three byte-pinned caller bodies, two below the redo frontier". That reason does not survive this round's instruction that this lane's unmerged migrations may be edited. |
| **RECHECK-03** — the sibling advisory's self-exclusion hides total overlap | **REPRODUCED, THEN FIXED** | Same withdrawn reason, same file. |

---

## Why RECHECK-02 and RECHECK-03 turned out to be in scope after all

Both rechecks refused on one shared premise: *the honest fix recuts three caller bodies that
0280/0281/0282/0283 all pin byte-unchanged, and two of those migrations are below the redo
frontier, so they cannot be re-applied.*

**The premise conflates two different things.** 0280/0281/0282 pin those three bodies in their own
**prestates and tails**, which run **at their own apply time** — before 0283, in every chain,
from-scratch or otherwise. Nothing in them ever observes the catalog after 0283. So recutting the
three callers **inside 0283** leaves every one of those pins seeing exactly the pre-image it names.
No migration below the redo frontier needs editing at all; only 0283 does, and 0283 is the highest
applied version, which is precisely what `CLARA_MIGRATION_REDO` (#957) is for.

The second half — "a fourth migration would be needed" — is true and is why this landed in 0283
rather than in `0284`: wave 3 reserved `0280–0283` for this lane and `0284` onward belongs to lane
06. So **0283 grows, and its file name is now narrower than its content.** That is stated at the
top of the migration's own header, in `packages/db/README.md`, and here, rather than left for a
reader to discover from the diff.

---

## RECHECK-03 — self-exclusion by identity — **FIXED, red-first**

**Reproduced.** `p929.identical-basis` was written before any code moved and failed on its own
first claim:

```
not ok 3 - p929.identical-basis …
  error: 'a sibling plan whose basis is byte-identical is a TOTAL overlap and must be named'
```

Two plans created on a fresh client with the *same* `basis()` value: the second answered
`overlap_warning = null`. That is the case a human most needs told, and this rig's own seed mints
it four at a time.

**The fix, minimal.** `clara._plan_overlap_warning(p_client uuid, p_basis jsonb)` becomes
`clara._plan_overlap_warning(p_client uuid, p_basis jsonb, p_self_plan uuid)`; the predicate
`r.basis is distinct from p_basis` becomes `p.id is distinct from p_self_plan`; the three callers
pass the plan id they already hold (`v_plan` in `create_accounting_plan` and `_accrual_plan_core`,
`p_plan` in `revise_accounting_plan`). **The two-argument signature is dropped**, not left
standing — a surviving overload would keep the blind spot reachable by anyone who called it. It was
owner-only (`{clara_fn_owner=X/clara_fn_owner}`) and, censused on the live catalog, exactly three
bodies in the estate mention it, all three recut in the same transaction.

**The control that shapes the design, in the same cell.** The naive fix — delete the exclusion — is
forbidden by the second half of the cell (`planA.overlap_warning === null` on a fresh client, and a
revision that never names the plan it is revising) *and* by five pre-existing `p909.*` cells. A
by-value heuristic ("exclude the most recently written identical-basis plan") is rejected in the
migration header for a stated reason: it would make `revise_accounting_plan` warn a firm about the
very plan it is revising, and a warning that names your own row teaches the reader to skip the key.

`p_self_plan` null excludes nothing, which is the right degenerate answer for a caller with no plan
of its own. No caller passes null.

---

## RECHECK-02 — the concurrency window — **FIXED, and proven against a broken subject**

**Reproduced, and the reproduction is the cell's own failure mode.** `p929.concurrent-creation`
drives two pooled connections through the real `clara.create_accounting_plan` (the same statement
the ordinary fixtures send — `createAccountingPlanCall` is now the one definition both use), holds
the first transaction open, and **observes** in `pg_locks` whether the second is waiting on an
ungranted advisory lock at classid `203005004` rather than timing it. Against the rung-less
subject:

```
not ok 1 - p929.concurrent-creation …
  error: 'the second session never waited on the client advisory rung -- the two creations
          overlapped, so each read the other's plan as uncommitted and the advisory can only
          answer null for both'
```

**The fix.** All three doors take `pg_advisory_xact_lock(203005004, hashtext(<client>::text))` —
the client rung `clara.retire_adjustment_template` already takes, and the shape 0283's own round-1
header already named — **after** the op-receipt reservation (0037 SECTION K's documented order:
op-receipt → advisory rung) and **above** any `clara.accounting_plans` row lock (0238's order for
this rung).

**Why that adds no deadlock pair — censused on the live catalog, not argued.** Of the **51** bodies
whose `prosrc` contains `pg_advisory_xact_lock(203005004`, **none** reads or locks
`clara.accounting_plans`:

```sql
select … from pg_proc p … where p.prosrc like '%pg_advisory_xact_lock(203005004%'
                            and p.prosrc like '%accounting_plans%'   -- → 0 rows
```

The one body that names an accounting-plan door at all (`clara.sign_depreciation_authority`) does
so in a comment. So the only new ordered pair is `client rung → plan row`, and no body anywhere
holds a plan row while waiting for that rung. `clara.create_prepayment_schedule` already called
`create_accounting_plan` and only afterwards locked the plan row it had just made, so it inherits
the same order; advisory xact locks are re-entrant, so the outer accrual and prepayment doors
re-entering cost nothing.

**Where TDD was done by hand, said plainly (the F1 lesson from round 1).** FIX 1 and FIX 2 landed in
one migration edit, so FIX 2's cell was green on arrival. It was proven by the work order's own
vacuity control instead: the three recut bodies were re-applied **without** the rung (a deliberately
broken subject), the cell went red for the right reason, and the subject was then restored **byte
for byte** — re-measured `99f60787…` / `8a6e69ef…` / `31adc6d4…`, the exact shas the migration's own
text produces — and the cell went green. A rung cannot be added in a smaller step than "add the
rung", so the alternative was a red-green theatre over two redos rather than a real one.

---

## RECHECK-01 — the agent prepayment limb — **REPRODUCED AGAIN; NO CODE FIX OWED HERE**

Re-driven at this head, in a transaction that was rolled back, against a client whose own chart
carries the accounts (so the answer is the lane's, never a missing-account artefact):

```
seed: { client 0be8c33c…, firm 5eb20459…, dr '600-D42', cr '400-D42' }
minted: { status: 'proposed', template_id: 'f23b0cf0-6648-499b-b1b3-15dee215a5ba',
          content_hash: 'caea078f…' }
before 2657 · during 1 row at 'proposed' · after 2657 · leaked 0
```

The four containment legs re-read from the live catalog, unchanged:
`clara._propose_adjustment_template_core` and `clara._agent_prepayment_schedule_core` are
`{clara_fn_owner=X/clara_fn_owner}` · `clara.wake_establish_prepayment_schedule` is granted
`clara_wake_interactive` · `clara.wake_fn_allowlist` names it for `{close_prep}` **and no other
kind** · `clara.wake_engine_sources.close_prep.enabled = false`.

**Why no code changed.** The recheck's own `required_fix` is explicit: *"Not a code fix owed to this
lane — an owner/orchestrator ruling is owed."* This round's unlock (this lane's unmerged migrations
may be edited) answers the obstacle RECHECK-02/03 named; it does not answer this one. Closing this
means retiring or rerouting an agent-lane **product capability** — the #788 split published three
tickets (the human doors, the sweep, the vocabulary) and none of them is this — and turns the whole
`f-a4-pr2a` battery into a retirement battery. Unlike FIX 1 and FIX 2, this is not a wrong answer in
code this lane wrote; it is a capability nobody has ruled on, and the ruling is owed before the code
is. **Standing owner ruling "beta, nothing dark" also cuts against a lane worker silently retiring a
feature on its own authority.**

It stays contained by `p929.containment` (two rolled-back mutants prove both readers can say NO) and
disclosed in the migration header, `packages/db/README.md` and `CONTEXT.md`.

**The ruling the orchestrator is owed, in one line:** *retire or reroute
`clara.wake_establish_prepayment_schedule` onto `clara.create_prepayment_schedule` (0223) in a ticket
that owns that migration, or accept the residual and close the follow-up.* Blocking edge: anything
that unparks `close_prep` or registers that wrapper under a second wake kind — either makes
`p929.containment` red with the remedy in its own message.

---

## The migration, and what an integrator must re-measure

`0283_retire_plan_overlap_template_arm.sql` — **edited and re-applied through `CLARA_MIGRATION_REDO`
three times this round**, and **both of its prestate branches were exercised for real on
`clara_l05`, not only in a rollback**:

1. `_plan_overlap_warning` was restored to 0281's own two-arm output by re-running **0281's own
   `§A` statement verbatim** (sha re-measured `33b23167…` before proceeding), then the redo ran and
   its prestate reported `FRESH APPLY (0281's two-argument output is live)`.
2. A second redo over that result reported `REDO (#957; this file's own three-argument output is
   live)`.
3. A third redo after the placeholder shas were filled in re-confirmed the redo branch and left the
   checksum at its final value.

The two branches are told apart **by SIGNATURE** — a fact about the catalog, not a marker inside a
body — which is exactly what the wave-3 addendum asks for ("a marker-tolerant or bimodal pin hides
its sha branch from a redo"). **Neither branch tolerates a marker; every pin on either branch is a
hard sha.**

### Pins that MOVED (the integrator's list)

| signature | before 0283 | after 0283 |
|---|---|---|
| `clara._plan_overlap_warning` | `33b23167…1e0b` **at `(uuid,jsonb)`** | `c2566349…f7dc` **at `(uuid,jsonb,uuid)`** |
| `clara.create_accounting_plan(…)` | `84b67058…d6c4` | `99f60787…b424` |
| `clara.revise_accounting_plan(…)` | `87c9f1e9…431f` | `8a6e69ef…2886` |
| `clara._accrual_plan_core(…)` | `b3bd1006…9da8` | `31adc6d4…9bc5` |

Every other place that pins the OLD values is **below 0283 and therefore unaffected**: `0223:205`,
`0223:1779`, `0250:125`, `0250:650`, `0280:149/155/321/326`, `0281:157/163/169/272/277/282`, and
`0222:248`'s `to_regprocedure('clara._plan_overlap_warning(uuid,jsonb)') is null` check — all of
them run before this file in every chain, from-scratch included.

**One thing an integrator must watch:** a lane whose migration is numbered **above 0283** and which
references `clara._plan_overlap_warning(uuid,jsonb)` would break. None exists today (0283 is the
highest applied version and the whole-catalog caller census returns exactly the three recut doors),
but it is the one cross-lane edge this change creates.

**Test-side pins that moved with them.** `tests/plan-overlap-sibling-arm.test.mjs`'s three sha pins
are **removed**, not updated — for exactly the reason that file already dropped its template-arm
assertions: they stopped being an invariant true at every frontier "0281 or later". Its `p909.tail`
now resolves the function **by name** (asserting exactly one signature exists, which is itself the
claim worth making) and accepts either self-exclusion shape. The post-recut shas live in
`tests/plan-overlap-template-arm-retired.test.mjs`'s `RECUT` list, frontier-gated on 0283.

**No web census re-measure was owed.** `apps/web/tests/firm-scope-db-pins.corpus.ts` keys only on
migrations carrying a **reviewed dynamic-SQL barrier**; 0283 adds no `execute`/`format` splice (the
three caller bodies are reproduced literally, not spliced from `pg_get_functiondef`), so no entry and
no content sha moves. Re-checked by running the whole web suite, which walks that corpus.

---

## Gates

| gate | result |
|---|---|
| `packages/db` `plan-overlap-template-arm-retired.test.mjs` (full gate chain) | **6/6 pass** — includes both new cells |
| `packages/db` the touched + plan-lane batteries + `operation-census` + `rig-isolation`, one run | **110 cells · 109 pass · 0 fail · 1 named skip** (T19 poison-role, reset-gated) |
| `packages/db` 49-file sweep — every battery that reads a helper this round touched | **931 cells · 872 pass · 58 fail · 1 skip** — every failure in three files that are red on this rig **before** this round and red **alone** (below) |
| `pnpm typecheck` | **PASS** (apps/web, packages/runtime), exit 0 |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **PASS**, exit 0 |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4841 cells · 4839 pass · 0 fail · 2 named skips** — identical to round 1's baseline |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen, 55 use-workflow, 3 retired (unchanged) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `node apps/web/scripts/check-message-keys.mjs` | OK — 4303 static keys resolve |
| migration checksum re-derived from the committed file | `0832489a…` == the ledger row on `clara_l05` |

No e2e walk was re-run: this round touches no rendering, no route and no message key (the web change
is three comments), so no browser walk's subject moved. `adjustments-retired-walk` was 2/2 in round 1
against a bundle whose rendering code is byte-unchanged here.

### The three pre-existing reds, with the evidence that they predate this round

All three fail **alone**, not only in a sweep, and all three are driven by rows earlier runs left on
`clara_l05` — every timestamp hours before this round's first database write (~20:5x on 2026-09-23):

| file | failure | rows behind it |
|---|---|---|
| `f-a5b-sandbox-export-pr1.test.mjs` (55 cells) | hook: `F-A5b PR-1 DRIFT: … sandbox_watermark rows=6/3` | three extra `clara.watermark_policy_versions` rows created **09:04, 09:53, 11:53** on 2026-09-23 |
| `f-t1-sst-reference.test.mjs` (2 cells) | `duplicate key value violates unique constraint "uq_sst_rate_schedule_live"` | `clara.sst_rate_schedule` newest row **09:04:19** on 2026-09-23 |
| `intake-batch.test.mjs` (1 cell) | `the cancelling parent is on the worklist` | `clara.intake_batches` 164 rows, newest **12:49:20** on 2026-09-23 |

None of the three touches the plan lane; each entered the sweep only because it imports
`tests/rig-txn.mjs`, which this round extends **additively** (one new exported helper, one added
import name). They are a rig-state fact about `clara_l05`, not a regression, and they are **not**
files rule 8 asks this round to gate. Worth a follow-up of their own: three batteries depend on rows
another file left, which the wave-3 addendum forbids.

---

## Docs

- `packages/db/README.md` — the whole 0283 section rewritten (title, what it does, the new FIX 1 /
  FIX 2 subsection, the two-branch prestate table with all eight hard shas, the corrected "what it
  does not do", the new checksum, and the closing paragraph that now separates the one open finding
  from the two closed ones).
- `packages/db/migrations/0283…sql` header — the same content at source, including the withdrawal of
  round 1's "this is a ticket of its own" reasoning and why the file's name is now narrower than its
  content.
- `apps/web/lib/{plans,accruals,prepayments}/api.ts` — three comments, saying what a `null`
  `overlap_warning` now means.
- **`CONTEXT.md` deliberately untouched.** This round adds no vocabulary; the overlap advisory has
  never been a CONTEXT term, and inventing one on a file nine lanes edit at once is not this round's
  business.

## Successor contracts

None. No frozen chat or Work tool is affected: the advisory's answer SHAPE is unchanged
(`{ kind: 'accounting_plan_overlap', templates: [{ plan_id, name, cadence, accounts }] } | null`),
only when it is non-null. `check-frozen-workflows` shows no manifest diff.

## Follow-ups worth filing

1. **The owner/orchestrator ruling on RECHECK-01** (above) — the only one of the three findings still
   open, and the only thing this lane is now waiting on.
2. **Three db batteries depend on rows another file left** (`f-a5b-sandbox-export-pr1`,
   `f-t1-sst-reference`, `intake-batch`) — red on any rig that has run the suite, green only on a
   fresh one. The wave-3 addendum already forbids this shape; nothing in this lane owns it.
3. **0280's dangling citation** (`clara.revise_accrual_adjustment`, named three times including inside
   shipped `prosrc`) — carried forward from round 1, still uncorrectable in place because 0280 is
   applied and below the redo frontier. The correction lives in 0283's header and
   `packages/db/README.md`.

## Unverified

- The **from-scratch** chain for 0283 is proven only by its fresh-apply prestate branch running for
  real against restored pre-images on `clara_l05`, plus the fact that every migration pinning the old
  shas sits below it. A true `0001 → 0283` chain on a disposable cluster is the integrator's proof, as
  RIG.md says.
- `x42-0045-b2-upgrade.test.mjs` remains reset-gated and unexecuted here (round 1's L05-SPEC-02,
  unchanged) — `node --check` passes and it SKIPs correctly. It does not touch the plan lane.
