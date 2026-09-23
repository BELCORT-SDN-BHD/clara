# Riders wave 3 · lane 04 (fixed assets) — review fix round

**Branch** `riders/w3-lane04` · worktree `C:\Users\zhant\Desktop\clara-wt\651` · database `clara_l04 @ 127.0.0.1:55744`
**Base** `ffe63a0dd084e99b84c1368119845be273c421ce` · **review head** `c49ebd030` · **new head `a3e9f5d3772a200e278ff0144ec43a3e60b792eb`**
**Reports worked** `wave3-lane04-codereview-spec.json`, `...-codereview-standards.json`, `...-review-adversarial.json`
Single fix worker for the whole lane (`/implement-spec`: all review issues are fixed by one implementer).

## Verdict per finding

| id | severity | outcome |
|---|---|---|
| ADV-L04-1 | blocker | **fixed** — migration 0280, cell `p932.drift` |
| ADV-L04-2 / SPEC-975-2 | blocker / minor | **fixed** — migration 0281, cells `p975.fold` (rewritten segment), `p975.stale.park` |
| ADV-L04-3 / SPEC-975-1 | major | **fixed** — migration 0281, cell `p975.two_years` |
| ADV-L04-4 | major | **fixed** — migration 0281, cell `p975.closing_reopen` |
| ADV-L04-5 | major | **fixed** — `setPolicyIntent`/`retirePolicyIntent`, both dialogs hold the key |
| SPEC-932-1 | major | **fixed** — cell `p932.birth.work_lane` drives the runtime's own predicate |
| SPEC-932-2 | minor | **fixed** — 0280 §B's comment now says what the code does |
| SPEC-978-1 | minor | **fixed** — the ticket report says 6/6, re-measured |
| standards-978-dup-completeIntent | minor smell | **fixed** — one `serializeParticulars` helper |
| ADV-L04-6 | note | **documented, not walled** — 0281 §A states the two columns are caller-asserted provenance; follow-up below |
| ADV-L04-7 | note | **carried**, as the adversarial lens itself asks: it needs the wave-4 frozen cut |
| standards-978 disposeIntent title | note | **fixed** — title no longer claims a runtime exclusion the type enforces |
| SPEC-932-3 / -4, SPEC-882-1, SPEC-975-3 / -4 / -5 / -6 | notes | recorded; -4 and -5 corrected in the ticket reports |

Nothing was refuted: every blocker and major reproduced on `clara_l04` before it was fixed, and the
reproduction is the cell that now guards it.

## Commits (`ffe63a0dd08..HEAD`, this round only)

```
8ad0c02f0 fix(db): #932 a default depreciation policy applies only while it still fits its enrolment (migration 0280)
d0d0139d2 test(db): #932 AC4's "no question" is MEASURED, and 0277's effective_from comment now says what is true
0371f8575 fix(web): #932 the two default-policy doors take a caller-supplied op key (ADV-L04-5)
e002fef2e fix(db,web): #975 a materiality judgement licenses the figure it was made about (migration 0281)
a3e9f5d37 chore: #932/#975 fix round — the gates, and the two evidence corrections the reviews asked for
```

## Two new migrations, and why they are new files rather than edits

`0277`, `0278` and `0279` are **byte-unchanged** by this round (`git diff c49ebd030..HEAD` over
those three paths is empty), so their two entries in `apps/web/tests/firm-scope-db-pins.corpus.ts`
still hold: re-measured `sha256(0277) = 90656f46a5a89cc64e97938694c0e5139ab0d5eb6e8ab9cdeb8022a4cb380acb`
and `sha256(0279) = ca9ede2bd4b065a8d3b4e67bde07b5afffbe937b2c1c083e580baf563de5a640`, exactly the
values recorded there. **No corpus edit was needed, and none was made.**

Editing them was not possible and would not have been right:

- `0278`'s prestate pins `0277`'s post-image of `clara._tf_fa_acquisition_birth` by `sha256(prosrc)`
  and accretes onto its 842-character comment. Editing `0277` breaks `0278` on a from-scratch chain.
- `#957`'s redo path re-applies **only the highest applied version**
  (`packages/db/scripts/migrate.mjs`: "redo refused: … is not the highest applied version"), so
  neither `0277` nor, after `0280` landed, `0279` could be re-applied to this rig at all.

Both new files therefore carry the house shape in full, and **their numbers are provisional** — every
gate in this family keys on a stable stem, never a number, and a number is claimed at MERGE.

### `0280_fa_policy_enrolment_congruence.sql` — stem `fa_policy_enrolment_congruence$`

Recuts the two birth sites (`clara._tf_fa_acquisition_birth`, `clara._fa_on_approve` arm 4) with
`0277`'s bodies byte for byte and ONE changed line each. Creates no relation, mints no function,
moves no grant, contains **no dynamic SQL at all** — so no `rig-meta.mjs` cohort and no corpus
barrier entry are owed (`0278` makes the same claim for the same reason).

Prestate pins, every one MEASURED on `clara_l04` (never copied from an older header):

| signature | sha256(prosrc) | kind |
|---|---|---|
| `clara._tf_fa_acquisition_birth()` | `c2c62b2997a6dd9a1202e509954b6f1b311ab5c704064b9a71d806e8fb456c50` | recut |
| `clara._fa_on_approve(uuid)` | `ea7499ae782bbaef3bb0d1695273f014af39d17f583ee46409a763d0d33bed89` | recut |
| `clara.upsert_fa_account_profile(uuid,text,text,text,text)` | `14cba9a309642dafa8a39131a3b850f9663b5b7d64e3fea8632852c11af0e41c` | unmoved |
| `clara._fa_particulars_complete(clara.fixed_assets)` | `4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9` | unmoved |
| `clara.set_fa_depreciation_policy(uuid,text,text,int,int,bigint,text,text)` | `11f0aa0a82334438bebb3dadd1c990c08ebd0b014eabf7d86d41204c2820b67d` | unmoved |
| `clara._fa_asset_json(uuid,date)` | `41dc64108fd2eea95a61720e6b0e940cef1b0cb3957e264dfa5a04fc09a0bfd6` | unmoved |

plus the birth's catalog comment, pinned at `0278`'s own 1553 characters hashing to
`5a5c1d9821c1fdbf8a2039137b8d281b3827bc424a5cdd67a2db83f77b1c628a` — the accretion may never
rewrite history, only extend it, and the tail re-proves the prefix afterwards.

### `0281_fa_arrears_judgement_scope.sql` — stem `fa_arrears_judgement_scope$`

Recuts `clara.record_fa_arrears_resolution` and `clara._fa_run_period_core` with `0279`'s bodies
byte for byte apart from the three defects. Also no relation, no new function, no grant moved, and
**no dynamic SQL** — its ACL section is three literal statements rather than `0279`'s bulk
`execute format` loop, precisely so no corpus entry is owed.

| signature | sha256(prosrc) | kind |
|---|---|---|
| `clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)` | `5679c4ab696a3e9b48fede3054511c5d9e236c59cf4ceb9f72062fcb11ad4105` | recut |
| `clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)` | `4a94c2abae6b00334f252ff7ab3e96fb7c42262a20e1affe3b2dceae2d225de1` | recut |
| `clara._fa_closed_arrears(uuid,date)` | `46344076dfe5357020a32e89337296210f7ca25ef7e783aa46403ec16912dd17` | unmoved |
| `clara._fa_oldest_unmet_period(uuid)` | `1e2f3b5105c832237fefe020968905575ae6a63560c6da0cac88bf2fd7b5dcd3` | unmoved |
| `clara.preview_depreciation_run(uuid)` | `28af775de5a805a9a2acd486a798ef63ee901c99e0e4b0d54032a64f671b1b09` | unmoved |
| `clara.run_depreciation_period_for(uuid,date,text,uuid)` | `02d610598649a4d584ad1449ecc70bd27cec268744cc6c24b9aea3a009ee68b1` | unmoved |
| `clara.run_depreciation_manual(uuid,date,date,text)` | `5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8` | unmoved |
| `clara.run_depreciation_period(uuid,date,date,text)` | `8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921` | unmoved |
| `clara._fa_assert_period_open(uuid,date)` | `1409428decf47d69743ef6fcbddedebae88716dd5185514ed10614cc3e409de0` | unmoved |
| `clara.reopen_fiscal_year(uuid,text,jsonb,text,text)` | `3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5` | unmoved |
| `clara.finalize_close(uuid,text,text)` | `59ebaa4fe7ff49c90ff6f3d5c9a73d7c6b853b042368f0c20b8c2ce2c8173bf4` | unmoved |

**Integrator:** both `0277` → `0280` and `0279` → `0281` are order-locked pairs, and `0278` must
stay between `0277` and `0280`. Any later file recutting either birth site, `clara._fa_run_period_core`
or the arrears record door will find its pin here.

### Redo and the FIRST-APPLY branch (RIG.md wave-3 addendum)

`CLARA_MIGRATION_REDO` only ever takes the "my own body is already live" branch, so for each file
the first-apply branch was proven separately, against the file as it now stands:

- **0280** — applied FIRST-APPLY cleanly, then edited (the SPEC-932-2 prose and one tail marker
  count) and redone with `CLARA_MIGRATION_REDO=0280_fa_policy_enrolment_congruence`
  (new checksum `2e8510e6…`). The first-apply branch was then re-proven inside ONE transaction that
  was rolled back: `0277` §E and §E2 and `0278`'s comment statement were re-run to restore their own
  post-images (measured back to `c2c62b29…`, `ea7499ae…`, comment length 1553), `0280`'s prestate
  block was run verbatim and printed `clean (FIRST apply)`, and the transaction was rolled back.
- **0281** — its first apply failed on its OWN tail (a marker I had written too loosely) and rolled
  back with the ledger untouched; the corrected file then applied as a genuine FIRST apply. It was
  later edited (the ADV-L04-6 provenance note, a comment) and redone
  (`CLARA_MIGRATION_REDO=0281_fa_arrears_judgement_scope`, new checksum `a1fdae20…`), and the
  first-apply branch re-proven the same way against `0279`'s restored bodies (back to
  `5679c4ab…`, `4a94c2ab…`), printing `clean (FIRST apply)`, rolled back.

No data-dependent branch is hidden in either prestate: every pin is an unconditional
`sha256(prosrc)` comparison with one redo short-circuit, and both branches were entered.

The lane database now reads **272 migrations**, frontier `0281_fa_arrears_judgement_scope`.

---

## The findings, one by one

### ADV-L04-1 (blocker) — a default policy outlived the enrolment it was validated against

**Reproduced first.** `p932.drift` (`packages/db/tests/fa-depreciation-policy.test.mjs`) was written
before the fix and failed for the stated reason: after `setFaPolicy(straight_line/36)` and ONE
ordinary `upsert_fa_account_profile` with `accumAccount: null`, the next acquisition was born
`depreciation_method = 'straight_line'` (expected `'none'`) while carrying a null accumulated and
expense code — an unchargeable COMPLETE row. The adversarial lens had already driven the
consequence: `clara.preview_depreciation_run` offering two legs with `account_code: null` and
`clara.run_depreciation_manual` dying on an untyped `23502`, which no door can rescue and which
`packages/runtime/lib/reconciler-fa.mjs` isolates per client — stopping that client's depreciation
for good, silently.

**Fixed** in `0280`: both birth sites enter the policy-covered branch only when
`not (l.accum_code is null and v_pol.method <> 'none')`. A declined policy falls through to `0247`'s
own UNCOVERED branch, so the row births exactly as an uncovered non-depreciable acquisition does —
method `none`, no start date, no provenance, the "particulars pending" description — and a person is
asked, which is what the estate already does for every account carrying no policy at all.

**Why there and not elsewhere.** Auto-retiring the policy when the enrolment changes would have
Clara default a human decision. Widening `clara.upsert_fa_account_profile` would recut a body
`0277`'s prestate and tail both pin unmoved, and would wall a lawful act (an account really can stop
being depreciable) on the strength of a stale default. The enrolment door keeps accumulated and
expense a PAIR (`0041:2785-2789`, "state BOTH … or NEITHER"), so the accumulated code alone decides
it.

`p932.drift` now also drives `liveAuthority` + the due ladder and sees no `23502`.

### ADV-L04-2 (blocker) / SPEC-975-2 — a fold judged about one amount authorised folding another

**Reproduced first**, in two places. `p975.fold`'s later-run segment, as `0279` left it, MEASURED
the defect: the run proceeded `status = posted` naming a resolution whose own stored
`arrears_cents` was a different number. `p975.stale.park` failed with
`status: "drafted", charged_cents: 40000, arrears_folded[0].arrears_cents: 20000,
resolution_id: <the record made about 10000>`.

**Fixed** in `0281`: `clara._fa_run_period_core` splits the affected years THREE ways — no live
resolution, a live resolution made about a **different** figure, and a `reopen_prior` at the figure
that still stands. The middle bucket refuses (human door) or parks (every other verb) on its own
reason `arrears_changed_since_judgement`, carrying `judged_cents` and `arrears_cents` both, with
remedy `record_fa_arrears_resolution`. The standing record is never touched by a run — only
superseded by a person.

**This is the record door's own law, applied where the money actually moves.**
`clara.record_fa_arrears_resolution` already refuses CLR37 `arrears_changed` when the figure moved
between the question and the answer, because recording it "would put a stale ruling on the file"
(`0279`'s own comment). Nothing applied the same test at fold time.

**On AC2.** The brief says "a later run for the same client and year proceeds on the record without
asking again", and that is unchanged **for the figure the record was made about** — which is the
property AC2 is about and which `p975.fold`'s post-record run and `p975.parks`' completing run both
drive. SPEC-975-2 judged this "not a fix this ticket may take unilaterally". It is taken because the
owner's ruling of 2026-09-20 is the senior instruction: materiality is a professional judgement
Clara may not default, and deciding that a ruling about RM 100 still holds at RM 100,100 is Clara
making that judgement. The change is recorded here and in `CONTEXT.md` so the owner can overturn it
in one place if the reading is wrong.

### ADV-L04-3 / SPEC-975-1 (major) — the refusal stated the client-wide total as one year's amount

**Reproduced first.** `p975.two_years` builds the first two-closed-year state this battery ever had
(FY-A carrying two months = 20,000 sen, FY-B one = 10,000) and failed with
`d.arrears_cents = 30000` where the named year FY-A carries 20,000. The compounding half is in the
same cell: answering with the number the refusal stated was refused by the record door, which
re-measures per year — so the run stayed blocked for anyone not using the web panel, which alone
passes its own per-year figure.

**Fixed** in `0281`: every sentence and every `detail.arrears_cents`/parked `arrears_cents` carries
the NAMED year's own amount; the client-wide total rides beside it under `total_arrears_cents`.
The tail proves `'arrears_cents', (v_arr ->> 'arrears_cents')::bigint` appears **zero** times and
that `v_arr`'s own total is read exactly twice, in the two places where it IS the total.

`p975.two_years` now answers FY-A with the stated number, sees the next refusal name FY-B at ITS own
figure with the total still beside it, answers that, and sees the run proceed naming both rulings.

### ADV-L04-4 (major) — `reopen_prior` on a year that is only "closing" named an unreachable remedy

**Reproduced first.** `p975.closing_reopen` failed because the record door ADMITTED `reopen_prior`
on a `closing` year. `clara._tf_fiscal_years_lifecycle` (`0056:334-336`) admits
`open|reopened → closing`, `closing → open|closed` and `closed → reopened`: there is no
`closing → reopened` edge, and `clara.reopen_fiscal_year` is the `closed → reopened` verb, so the
park's own remedy could not be performed.

**Fixed** in `0281`: the record door refuses `reopen_prior` while the year is still closing, on its
own axis `year_still_closing`, naming `clara.finalize_close` — the edge that does exist.
`fold_current` stays open on a closing year, and `p975.closing_reopen` drives that too: this refuses
ONE unreachable remedy, never the question ("nothing dark"). The run core additionally derives its
awaiting-remedy from the named year's own status, for the one path that can still reach a closing
year carrying a live `reopen_prior` row (`closed → reopened → closing` after the judgement was made).

### ADV-L04-5 (major) — #932's two web wrappers minted the op key inline

The exact D15 class #978, three tickets later in this same lane, exists to remove. `setFaDepreciationPolicy`
and `retireFaDepreciationPolicy` now take a required `opKey`; `setPolicyIntent` and
`retirePolicyIntent` are exactly the doors' own `_reserve_op` fingerprints, measured off the live
prosrc — `(client, asset, method, useful_life_months, rate_bps, residual_cents)` and
`(client, asset)` — with `p_reason` in neither, the way `p_memo` sits outside
`clara.dispose_fixed_asset`'s. `SetPolicyDialog` and `RetirePolicyDialog`
(`apps/web/components/registers/fa-account-profiles-panel.tsx`) hold the key with
`useDepreciationDecisionKey` and renew it on close, exactly as #978 wired complete and dispose.

Both intents ACCEPT `reason` and ignore it rather than excluding it from the type, so the exclusion
is a fact a cell demonstrates at runtime — which is also the standards lens's own nit against the
`disposeIntent` cell, answered here in the one place it could be.

### SPEC-932-1 (major) — AC4's "born complete with no question" is now MEASURED

The register row's completeness is a database fact and was already driven. Whether a Work QUESTION
opens is a RUNTIME decision, taken in `claraWork.v4`/`v5` (frozen) on the result of
`loadPendingFixedAssetStepV4`, which cannot call `clara._fa_particulars_complete` (0041 leaves it
ungranted) and so carries its own inline restatement of the same four column tests. Nothing had ever
bound the two together.

`p932.birth.work_lane` posts a policy-covered acquisition through `clara.wake_record_journal_entry`
— the production door `p639.birth.work_lane` uses — and runs the runtime's discovery predicate
**sliced out of `packages/runtime/workflows/claraWork.v4.impl.ts` at test time**, never retyped, so
a copy cannot agree with itself. It selects nothing. The same cell drives an UNCOVERED acquisition
first and sees the predicate FIND it, so an empty result means "complete", not "the cell asks the
wrong question".

### SPEC-932-2 (minor) — the code and its own comment disagreed about `effective_from`

`0277`'s covered-branch comment claimed the policy's `effective_from` "only gates WHICH acquisitions
the policy reaches". The lookup filters on `active` alone and no consumer in `packages/db` or
`apps/web` reads the column for any decision. `0280` §B's copy of that body now says so, and says
what the column IS (a recorded fact, shown in the register) and what a later ticket would have to
change to make it gate anything. No behaviour moved with it.

### The two smells, and the one restated pin

- **`completeIntent` duplicated `reviseIntent`'s particulars block verbatim** — fixed: one
  `serializeParticulars(particulars)` helper, called by both. Small, clearly better, and it removes
  a convention only one of the two would ever have been updated to follow.
- **The `disposeIntent` cell's title claimed a runtime "memo EXCLUDED"** its assertions could not
  show (the type has no such field) — reworded.
- **`p639.belt.convention_comment` pinned the birth body's sha** as "neither body moved". That was
  #882's claim about `0278`, and it stays true of the BELT, whose body no migration has recut — its
  sha pin stays. The birth body is lawfully recut by `0277` and now `0280`, each pinning it in its
  own prestate and tail, so the cell now asserts what survives every such recut: seven markers
  (0247's four exclusions, the #972 watermark, the #932 policy read, the single conflict-targeted
  insert) each present exactly once. The byte-exact comment-accretion assertion is untouched.

### ADV-L04-6 (note) — the resolution's period columns

`p_period_start`/`p_period_end` are stored verbatim and nothing validates them. They are
caller-asserted provenance: no money and no decision moves on them — the enforced figure is the
year's arrears and the year is checked against the client — so a wrong pair makes the record read as
a judgement about a run that never happened, and nothing worse. `0281` §A now **says** that in the
migration, which is the finding's own second option. Validating them against the client's cadence
window is a real improvement and a real widening of the ticket; it is a follow-up below rather than
a wall added without a brief.

### ADV-L04-7 (note) — the frozen Work lane's parked sentence

Unchanged and uncharged, exactly as the adversarial lens records it: `packages/runtime/lib/depreciation-run.ts`
is frozen and renders a parked period as "`<period>: parked 0.00 across 0 charge row(s).`". It
belongs to the shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4. **One thing has
changed for that cut:** there is now a third parked reason, `arrears_changed_since_judgement`, and
the parked payload carries `judged_cents` and `total_arrears_cents` beside `arrears_cents`. The
successor contract below supersedes item 3 of the #975 ticket report's.

## Successor contract (supersedes #975 report item 3)

For the wave-4 `claraWork_v6` / `chatTurn_v22` cut, the FA run's parked receipt now has **three**
reasons, all on `status: "parked"`:

```
reason: "arrears_resolution_required"
  { client_id, period_start, period_end,
    arrears_cents,            // the NAMED year's own figure
    total_arrears_cents,      // the client-wide sum, never a year's
    fiscal_years: [...],      // the unresolved years
    resolutions: ["fold_current","reopen_prior"], chosen: null,
    remedy: "record_fa_arrears_resolution" }

reason: "arrears_changed_since_judgement"          // NEW in 0281
  { …, arrears_cents, judged_cents, total_arrears_cents,
    fiscal_years: [...], resolutions: [...], chosen: "<the stored choice>",
    remedy: "record_fa_arrears_resolution" }

reason: "arrears_awaiting_reopen"
  { …, arrears_cents, total_arrears_cents, fiscal_years: [...],
    chosen: "reopen_prior",
    remedy: "reopen_fiscal_year" | "finalize_close" }   // DERIVED from the year's status
```

The cut's own cell must assert the parked sentence names the amount, the year and the remedy —
and, for the new reason, **both** amounts.

## Gates

All on `clara_l04 @ 127.0.0.1:55744`, Playwright triple `3530/3531/3532`, Node 22.

**packages/db**, full 178-flag preintegration gate chain, `--test-concurrency=1`:

- `fa-depreciation-policy.test.mjs` + `fa-arrears-resolution.test.mjs` + `fixed-asset-acquisition.test.mjs`
  + `depreciation-history.test.mjs` — **67 tests, 67 pass, 0 fail, 0 skipped**
- `operation-census.test.mjs` + `rig-isolation.test.mjs` — **33 tests, 32 pass, 0 fail, 1 skipped**
  (T19 poison-role, the RIG.md-documented destructive skip; no `CLARA_RIG_ALLOW_RESET` or
  `CLARA_RIG_ALLOW_ROLE_SWEEP` was ever set)

**packages/db**, FOCUSED (no gate flags — the acceptance shape, counting zero skips):
`fa-depreciation-policy.test.mjs` **13/13**, `fa-arrears-resolution.test.mjs` **10/10**,
`fixed-asset-acquisition.test.mjs` **25/25**, all `0 skipped`.

**packages/runtime**: `reconcile-fa-unit.test.mjs` **20/20**. `node scripts/check-frozen-workflows.mjs`
**OK, 312 frozen files, no manifest diff**; `node packages/runtime/scripts/check-parts-parity.mjs` **OK**.

**apps/web**: whole unit suite (`node scripts/run-tests.mjs`) — **4866 tests, 4864 pass, 0 fail,
2 skipped**. The six touched files together — **51/51**
(`lib/registers/fa-depreciation-policies.test.ts` 7, `lib/registers/fixed-assets.test.ts` 12,
`lib/registers/depreciation.test.ts` 14, `components/registers/fa-run-preview.test.tsx` 9,
`components/registers/fa-row-actions.test.tsx` 6, `components/firm/fixed-asset-incomplete-affordance.test.tsx` 3).
`tests/firm-scope-db-pins.test.ts` **22/22** with the two new migrations present.

**e2e** on the lane-04 triple: `fixed-asset-acquisition-walk` **9/9**, `depreciation-walk` **5/5**.

**`pnpm typecheck`** — clean (`apps/web` Done, `packages/runtime` Done).
**`CI=true GITHUB_ACTIONS=true pnpm lint`** — **exit 0**, all four packages.

### The vacuity control, where the deliverable is a cell

`preview.closed_arrears_moved` (the web half of ADV-L04-2) was driven RED once against a
deliberately broken subject — `arrearsJudgementIsStale` forced to `return false` — failing on "the
amount that WAS judged is stated…", and the subject was then restored byte for byte
(`git diff` back to the intended 18-line change). The three db cells and `p932.drift` /
`p932.birth.work_lane` each ran RED against the real pre-fix code first, which is the stronger form
of the same control.

## Docs updated in the same commits

- `packages/db/README.md` — new sections for `0280` and `0281`, each naming the defect, the driven
  reproduction, the shape, and why it is a separate file.
- `apps/web/README.md` — the two policy doors joined the "one decision, one key" paragraph, and the
  preview's stale-judgement behaviour is described.
- `CONTEXT.md` — "Closed-year arrears resolution" now states that a judgement licenses the figure it
  was made about, that a question names one year and states that year's own amount, and that
  restatement is refused while a year is only closing. SPEC-975-5's overstatement ("the run that
  raised it") is softened to the period the record actually stores, and two entries were added to
  its `_Avoid_` list.
- The three ticket reports were corrected in place where a review found their evidence wrong:
  `ticket978.md` (6/6, not 9/9), `ticket932.md` (AC3 is an event, not an audit row; AC4's "no
  question" is now measured), `ticket975.md` (AC2's later-run paragraph and the successor
  contract's "already carries the amount" claim, both annotated with what superseded them).

## Follow-ups worth filing

1. **Validate the arrears record's period pair** (ADV-L04-6). At minimum `p_period_start <=
   p_period_end`, better against the client's own cadence window. Needs a brief; no money moves on
   it today.
2. **The agent catch-up lane keeps the twelve-turn chase over a parked period** (SPEC-975-4, carried
   from the #975 report). `clara._agent_depreciation_catchup_core` was not recut — its wake source
   `close_prep` is registered-and-disabled — and its loop still exits only on `noop`. Safe (it runs
   under `run_depreciation_period`, so it parks and never posts) but wasteful. Carry it into
   whichever ticket unparks `close_prep`.
3. **The D15 class is wider than this lane.** `crypto.randomUUID()` is still minted inside the
   wrapper in `lib/registers/accounts.ts`, `adjustments.ts`, `counterparty-doors.ts`,
   `counterparty-identity.ts`, `fa-account-profiles.ts`, `knowledge.ts` and `opening-doors.ts`.
   #978 closed the FA particulars pair and this round closed the FA policy pair; a sweep ticket
   would close the rest.
4. **`clara.fa_account_depreciation_policies.effective_from` gates nothing** (SPEC-932-2). It is a
   recorded fact only. If a dated policy is ever wanted, the birth lookup is the one site to change.

## Anything unverified

- No from-scratch migration chain was run here (the integrator's job, on a disposable cluster).
  `0280` and `0281` were judged against the applied state of `clara_l04`, with each prestate's
  FIRST-APPLY branch separately proven in a rolled-back transaction as described above.
- No concurrent two-connection race was driven against the recut doors. Both take
  `pg_advisory_xact_lock(203005004, hashtext(client))` — the same rung the run core and the
  particulars doors take — before touching anything, so the ordering argument is structural, as the
  adversarial lens already recorded.
- `clara._agent_depreciation_catchup_core` was not driven (its wake source is disabled) and is
  untouched by this round.
- The runtime files this round touches are none, so the integrator's "re-run new runtime test files
  under WSL as `runner`" step has nothing new to run for lane 04.
