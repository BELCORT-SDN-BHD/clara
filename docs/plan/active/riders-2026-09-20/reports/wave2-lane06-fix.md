# Wave 2 · Lane 06 · fix round and recheck

**Branch** `riders/w2-lane06` · **worktree** `C:\Users\zhant\Desktop\clara-wt\656` · **db** `clara_l06`
(127.0.0.1:55746) · **Playwright triple** 3550 / 3551 / 3552
**Base** `23cfad947b5598214168ba9c43d391b4e16aa745` · **new head** `993ab88de`

Tickets: #894, #895, #891, #934, #935. Reviews worked: `wave2-lane06-codereview-spec.json`
(17 findings, 4 major) and `wave2-lane06-codereview-standards.json` (F1 minor, F2 note).

## Commits added by this round (two; the ten before them are untouched)

| sha | subject |
|---|---|
| `483a153ae` | `fix(db): #891 #934 get_firm_setup recut -- ONE notion of required, and the retirement filter on confirmed_facts` |
| `993ab88de` | `fix(web): #891 #935 firm setup checklist -- the walk, the Finish sentence, the empty tips card, the banner count and the reconcile label` |

`git status` clean at both ends of the round. No push, no PR, no GitHub write, no other worktree
touched (except this report, in the main checkout, uncommitted).

## The migration: 0259 edited and re-applied through the redo path

Every finding that needed SQL lands on **one door**, `clara.get_firm_setup`. `0260`–`0272` are other
lanes' reserved numbers (checked against the wave's own ticket reports), so a sixth file was not
available to this lane; the supported path is the one the prompt and `packages/db/README.md`
("Redo (#957)") name — edit the lane's own unmerged migration and re-apply it. Only the **highest
applied** version may be redone, which is `0259_firm_setup_education_tips`, so the recut is folded
into that file as **SS G** with its own header section ("FIX ROUND — SS G RECUTS
`clara.get_firm_setup`, AND ONE NOTION OF REQUIRED").

Redo run, recorded as the work order requires:

```
PGHOST=127.0.0.1 PGPORT=55746 PGUSER=postgres PGDATABASE=clara_l06 \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 \
  CLARA_MIGRATION_REDO=0259_firm_setup_education_tips node scripts/migrate.mjs
-> migrate: redid 0259_firm_setup_education_tips
   new checksum 475d8ab877d69b4f87a39a264f58cd28ca68d86c8545bb06a32ff05c64cbb972
   target 127.0.0.1:55746/clara_l06
```

Prestate and tail both printed their `OK` notices (both quoted in `483a153ae`'s body). The file
count is unchanged: 234 applied, five migrations for five tickets.

**Three things in 0259 were not actually redo-safe**, although its header claimed they were; the
redo is what proved it, and each is now fixed *and* still refuses a database in a third state:

1. **SS0 prestate.** Its pins read "the shape before this file", which a redo has already moved. SS0
   now asks ONE catalog question — `to_regprocedure('clara.dismiss_firm_setup_tip(uuid,text,text)')
   is not null` — and then checks **either** the fresh-apply pins (unchanged, byte for byte) **or**
   the already-landed ones (the seed no longer folding `education` onto `todo`; both generic doors
   carrying the education guard; fifteen catalogue rows whose original twelve still hash to the
   *same* `156dc83b…` baseline; `item_kind` admitting `education`; `commit_firm_setup` at its same
   `c527f0bf…` pin). Never neither: a half-applied or hand-patched database still raises.
2. **SS A's catalogue insert** had a bare `values (…)` (first failure: `duplicate key value violates
   unique constraint "firm_setup_keys_pkey"`). It now ends `on conflict (item_key) do nothing` —
   never an `update`, so the append-only trigger is still never touched, and a fresh apply can never
   take that branch because SS0.3 refuses outright if a tip row exists.
3. **SS F's `create function clara.dismiss_firm_setup_tip`** (second failure: `function … already
   exists with same argument types`) is now `create or replace`, an arm only a redo can reach for
   the same SS0.3 reason. The tail re-measures owner, `SECURITY DEFINER`, `search_path`,
   `plan_cache_mode` and the exact ACL afterwards.

`apps/web/tests/firm-scope-db-pins.corpus.ts` holds **no entry for any 0255–0259 file** (checked:
`grep -n "025[5-9]\|firm_setup" apps/web/tests/firm-scope-db-pins.corpus.ts` returns nothing), so no
content sha needed re-measuring; the census itself was re-run anyway because a migration's bytes
moved — `tests/firm-scope-db-pins.test.ts` → 22 pass / 0 fail.

---

## Findings, one by one

### L06-SPEC-01 — the bounded group walk opened a form for a pending inapplicable item · **FIXED**

**Reproduced** on `clara_l06` through the real doors: seed → answer `turnover = 'RM1M-5M'` → reseed
(TIN is seeded `pending`/`applicable`) → answer `turnover = '<RM1M'`. The `tax` group then holds
`['tin(inapplicable)', 'fye(applicable)']`, both pending. In the component, with that envelope, the
group offered **"Answer these 3 together"** and `Question 1 of 3`.

**Fix.** One shared predicate in `firm-setup-checklist.tsx`:

```ts
function isWalkStep(item: FirmSetupItem): boolean {
  return isPending(item) && !isEducationTip(item) && isAnswerable(item);
}
```

used by BOTH the group's pending count and `openItems`, so the number on the button and the steps in
the form cannot disagree. `isAnswerable` is already false for `isNowInapplicable`, so this reuses the
existing seam rather than inventing a second applicability rule.

**Cell** `fs.web.15` — a tax group with `fye` + `turnover` pending-applicable and `tin`
pending-inapplicable. Red first for the right reason (`'Answer these 3 together' !== 'Answer these 2
together'`), then green. It also asserts the row itself still renders, marked, with no control, and
that the form's own subtree never contains the inapplicable question.

### L06-SPEC-02 — `items[].required` widened to "effectively required" · **FIXED**
### L06-SPEC-03 — the counter and `required_outstanding` disagreed · **FIXED**

**Reproduced** together, on `clara_l06`, at the step above where TIN is seeded and applicable:

```
counter {required_total: 9, required_answered: 1}   outstanding_n 7
tin {state: pending, applicability: applicable, required: TRUE}
SPEC-03 arithmetic: 8 missing by counter vs 7 named
```

The surface renders both on one screen: *"1 of 9 required facts recorded"* above *"Still needed: ⟨7
questions⟩"*. And because the checklist gates its skip control on `isPending(item) && !item.required`
and its badge on `item.required`, `required: true` withheld "Not now" from a row
`clara.commit_firm_setup` does not require, and labelled it "Required" although the Finish gate
ignores it.

**Fix — withdraw the widening rather than spread it.** `required_for_commit` is now the ONE notion:
the catalogue column, what `commit_firm_setup` gates on, what `required_outstanding` names, what both
counter sides count, and what `items[].required` reports.

```sql
'required', k.required_for_commit,
…
select count(*)::int into v_req_total
  from clara.firm_setup_keys k
 where p.id is not null and k.retired_at is null and k.required_for_commit;
```

Consequences worth stating plainly:

* `required_total - required_answered` is **by construction** the length of `required_outstanding`
  (a required row is either unseeded/pending — outstanding — or answered/resolved/deferred —
  counted). Re-measured: **7 missing, 7 named**, at every step of the walk.
* #891's **AC3** ("the counter excludes an inapplicable item from numerator and denominator") now
  holds *by construction* rather than by a rule that can drift: neither conditional row is
  `required_for_commit`, so no answer, correction or reconciliation can put an inapplicable item on
  either side. That is a stronger guarantee than the transition the first cut pinned, and the cell
  says so.
* `tin.required` is `false` throughout, so the skip control and the "Optional" badge are back on a
  row the Finish gate really does not require.

**Why not the other repair.** The review offered "make `required_outstanding` use the same effective
predicate" as an alternative. Rejected, and the reason is in 0259's header: the checklist disables
Finish on `env.required_outstanding.length > 0`, so widening that list would refuse **in the browser**
a commit **the door itself accepts** — making firm setup harder to finish than #648 shipped it, and
cutting against the standing "beta, nothing dark" ruling. Whether a seeded, applicable TIN *should*
gate a commit is a product decision for the owner; 0257's own header already proposed exactly that
follow-up ("the counter's honesty should become a real gate"). It is one decision about the gate, not
two half-decisions about the counter. **Follow-up worth filing** — see below.

**Cell** `p891.counter.excludes`, rewritten. It walks turnover up and back down and asserts at each
of five steps that the conditional row is in neither counter side nor the outstanding list, that its
per-item flag stays `false`, that its earlier answer survives, and — the review's own asked-for
assertion — that `required_total - required_answered === required_outstanding.length`. Red first
(`a seeded, applicable conditional item joined the denominator: 9 !== 8`), then green.

### L06-SPEC-04 — a pending tip claimed completion was unavailable · **FIXED**

**Reproduced** in the component: every required fact answered, `required_outstanding: []`, one
pending tip → the Finish section printed *"Finishing becomes available once every required fact is
recorded or deliberately skipped."* beside an **enabled** Finish button.

**Fix.** The sentence and the button are now one predicate:

```ts
const finishAvailable = env.required_outstanding.length === 0;
…
{finishAvailable ? t("commit.ready") : t("commit.notReady")}
disabled={busy || !finishAvailable}
```

`required_outstanding` is the envelope's own list of what `commit_firm_setup` would refuse over, so
the caption, the control and the door now always agree. This also closes a **pre-existing** sibling
of the same defect that predates #935: a pending *optional* fact (`mia`, `currency`) produced the
identical contradiction, because the old `allSettled` read "nothing anywhere is still pending".

**Cell** `fs.web.16`, both directions: (a) all required answered + one pending tip + two pending
optional facts → ready copy, no notReady copy, button enabled; (b) one required key outstanding →
notReady copy, no ready copy, button disabled. Red first on (a).

### L06-SPEC-05 — the empty "A few things worth knowing" card · **FIXED**

**Reproduced** by extending `fs.web.14`: after both fixture tips are dismissed the card is still
rendered, heading and purpose and nothing else.

**Fix.** One predicate, `rendersRow(item, committed)`, now decides both the row-level early returns
and whether the group Card renders at all:

```ts
function rendersRow(item: FirmSetupItem, committed: boolean): boolean {
  if (isEducationTip(item)) return item.state === "pending" && !committed;
  return !isHiddenByApplicability(item);
}
…
if (!group.items.some((i) => rendersRow(i, committed))) return null;
```

**Cells** `fs.web.14` (extended: the card is gone and its heading text is nowhere on the page) and
the browser walk. One note on instrument quality: `assert.equal(node, null)` fails with `Array
buffer allocation failed` because node tries to diff a live DOM node, which hid the real reason the
cell was red; the cell uses `assert.ok(x === null, msg)` and says why in a comment.

### L06-SPEC-06 — `catalogue_total` counts the three tips, so a new firm is told it has 15 facts · **FIXED (at the surface, deliberately)**

**Reproduced**: `catalogue_total: 15` on `clara_l06`; the banner reads "There are {count} facts to
state about this firm."

**Fix at the surface, not in the read.** `catalogue_total` is the size of the CATALOGUE, and 15 is
the true answer to that question; the same field also rides `seed_firm_setup_plan`'s receipt, where
"how many rows I looked at" is exactly what it must mean. Giving it a second meaning in one of the
two places would have made the two contradict each other. The **banner** says *facts*, so it counts
facts:

```ts
const factCount = env.items.filter((i) => !isEducationTip(i)).length;
```

`items[]` carries every live catalogue row for this firm, tips included and flagged, so no new DB
surface is needed and no db cell or e2e mock count had to be re-pinned. The review offered this
exact alternative ("or count only non-education rows for the not-started banner").

**Cell** `fs.web.08`, extended: its not-started fixture now carries a tip and `catalogue_total: 6`,
and asserts the banner reads **5**. Red first.

### L06-SPEC-07 — AC4's walk never pressed "Got it" · **FIXED**

The e2e fixture carried one tip, so only "Later" could be walked. It now carries **two**
(`tip_invite_colleagues`, `tip_knowledge_page` — the real catalogue seeds three), exported as
`TIP_KEY` and `TIP_KEY_READ`. `firmSetup.walk.answer` presses "Later" on the first and **"Got it"**
on the second, asserts each disappears, asserts the tips card goes with the last one, and asserts the
required counter never moves. Walk re-run: 5 passed.

### L06-SPEC-08 — the TIN predicate mirrored as "never asked" · **NOT FIXED, and it is an owner question**

**Verified, and the review is right on the facts.** `packages/runtime/workflows/interview.v2.segments.ts:64-70`
gates TIN with a *validator*, not an `appliesTo`: the interview still ASKS the question and, when
`tinExempt(prior.turnover)`, accepts an empty answer or `"skip"`. Only `eligibilitySegment.appliesTo`
is a true applies-to predicate. 0257 maps `'<RM1M'` to `inapplicable`, so the row is never seeded and
`answer_firm_setup_item` then refuses it `firm_setup_item_not_seeded`. I also checked the escape
hatch the review did not: the `tin` catalogue row carries **`knowledge_key = null`**
(`0218_firm_setup.sql:404`), so firm setup is the *only* place a firm TIN is ever recorded. A
sub-RM1M firm that has voluntarily registered for MyInvois therefore has **no path at all** today —
a real capability #891 removed, and one that reads against the standing "beta, nothing dark" ruling.

**Why I did not fix it.** The ticket forbids both repairs at once.

* Keeping TIN always-applicable would gut **AC2**, which explicitly requires "a cell proves the TIN
  item follows the turnover answer both ways, including turnover unanswered".
* Seeding it inapplicable instead (the brief's own alternative: "an inapplicable item is not seeded
  **or is seeded inapplicable**") re-opens the *door* but not the *screen*, because the same brief's
  Key interfaces say an inapplicable item is "hidden or shown as not applicable with its reason,
  **with no answer form**". It would also flip `p891.tin.turnover`'s and `p891.mpers.entity_type`'s
  seeded-state assertions and every seed-count cell, for half a fix.

So the brief forecloses the surface repair whichever storage shape is chosen. This is a product
question, not a review defect: **should an exempt firm still be able to volunteer a TIN?** It is
filed below as a follow-up with this evidence. Nothing was changed.

### L06-SPEC-09 — answering a dependency flips `seeded` back to false · **FIXED (worse than reported, in fact)**

**Reproduced, and it is broader than the review measured.** `v_unseeded` counts an
undetermined-but-unseeded row, so on `clara_l06` `seeded` reads **false immediately after the very
first `seed_firm_setup_plan`**, with thirteen rows already on the plan — not only after a dependency
is answered. The component read `!env.seeded` as "not started", so through the whole middle of the
walk it printed the big **"Start firm setup"** button over a half-answered checklist and hid the
**entire Finish section**.

**Fix, at the surface, leaving the read honest.** `seeded` genuinely means "nothing is left to
reconcile" and is the right input for *whether the reconcile control is offered*; it is the wrong
input for *whether the checklist has been started*. The component now derives that separately:

```ts
const started = env.items.some((i) => i.state !== "unseeded");
const notStarted = !env.seeded && !started;
```

One door, two honest labels (`seed.action` / `seed.again` with their own help lines — two new keys at
the end of `FirmSetup.seed` in the shared `en.json`, minimal hunk), and Finish is offered from the
moment the checklist has questions on it (`!committed && started`).

**Cell** `fs.web.17`, both labels: a half-seeded plan reads "Update the checklist", has no
not-started face and keeps its Finish section; a genuinely untouched plan still reads "Start firm
setup" and offers no Finish. Red first.

### L06-SPEC-10 — the backfill disables the append-only trigger to UPDATE the twelve rows · **STAYS; escalated, as the review asked**

The review's own required_fix is "have the owner or the integrator confirm the reading explicitly",
and it is not something a fix worker can decide. Recording the position for whoever does:

* The shape has house precedent on this exact trigger class (`0040_wave_c_c_tieout.sql:815-860`,
  `0176_counterparty_alias_kind_scope.sql:261-266`), is declared in 0258's header rather than done
  silently, sets only the brand-new column, and re-reads the trigger enabled plus every pre-existing
  column byte-identical at the tail (SS T.3/T.5). I re-confirmed the row hash `156dc83b…` is still
  the pinned one after this round's redo.
* The literal alternative that would have kept AC1's parenthetical true is a second relation keyed by
  `item_key` — exactly the shape #891's own brief offered and #891 declined for its own reasons.
  Building it now would be a redesign of an applied-and-tested migration to satisfy a parenthetical,
  not a defect fix.

**Ask for the integrator/owner:** confirm the reading, or file the relation rework as its own ticket.

### L06-SPEC-11 — the retire flag has no writer · **DOC FIXED; the limit is now stated**

`retired_at` is filtered in seven places but nothing can set it: the table stays append-only and this
lane adds no writer, so retiring a row today means another migration that disables the same trigger.
`CONTEXT.md` said the opposite by omission. Softened (one sentence plus its `_Avoid_` line):

> …without editing or deleting the append-only row itself — today that is a migration-time act: the
> catalogue carries the retire mark, but no door sets it, so retiring an item is still a reviewed
> schema change rather than something a person does from a screen.
> _Avoid_: … describing retirement as something a firm can do for itself.

Giving `retired_at` a real writer is a follow-up, below.

### L06-SPEC-12 — `confirmed_facts` did not filter retired rows · **FIXED**

The one surface 0258's six-filter tail had missed. SS G's join now reads

```sql
join clara.firm_setup_keys k
  on k.knowledge_key = r.knowledge_key and k.retired_at is null
```

and the tail pins **exactly seven** occurrences of `retired_at is null`, naming all seven. Measured
live after the redo: 7, and the old unfiltered join line is gone. No behavioural cell: nothing is
retired today so there is no behaviour to observe, and building a synthetic retired row that also
carries a live `knowledge_records` row would be a fixture larger than the clause. The structural tail
assertion is the guard, and this paragraph is the declaration that it is structural.

### L06-SPEC-13 — "the tile ignores tips" was a corollary · **FIXED (evidence, not reasoning)**

There is no unit test file for `firm-setup-tile.tsx` and creating one would mean a new file plus a
`test/manifest.txt` entry for a note-severity finding. Cheaper and just as real: the browser walk's
firm-home leg now asserts it, with two tips pending in the fixture's envelope —

```ts
await expect(tile).not.toContainText("Invite your colleagues");
await expect(tile).not.toContainText("Where Clara keeps what it knows");
```

### L06-SPEC-14, -15, -16, -17 (notes) · **NO ACTION, as the review asked**

-14 (the two extra recut doors) is flagged for the integrator's diff review — and note this round
recuts `get_firm_setup` once more, a **fourth** time in the lane. -15 (`required_outstanding` stays
plan-unaware for a plan-less firm) is 0256's declared residual and is the one case where the new
`required_total - required_answered === required_outstanding.length` identity does **not** hold; the
new cell is deliberately written on a plan-carrying firm, and the residual is unchanged. -16 (#894's
AC1 proven by the migration text, not a cell) and -17 (the one out-of-lane `document-kind-dialog.tsx`
fix) stand as recorded.

### F1 (standards, minor) — commit `544e9daa2` names no ticket · **STAYS**

The review's own required_fix is "no fix required retroactively"; the commit is landed, fully
justified in its own body, and cross-referenced in `wave2-lane06-ticket934.md:235-258`. Rewriting a
landed commit's message to satisfy a subject-line convention would cost more than it buys. The
suggested one-line WORK-ORDER.md addendum is the orchestrator's to make — that file is in the main
checkout and is not mine to edit (the report is the one file outside the worktree I may write).

### F2 (standards, note) — the predicate duplicated three times inside `get_firm_setup` · **RESOLVED as a side effect**

The three inline `k.item_key in ('mpers_eligibility','tin') and … = 'applicable'` sites were the
withdrawn widening. They are gone, and SS G's tail proves the absence rather than assuming it:

```sql
if position($tag$k.item_key in ('mpers_eligibility','tin')$tag$ in v_src) <> 0 then
  raise exception '#935 tail: clara.get_firm_setup still carries the withdrawn effectively-required arm'
```

---

## Gates, with counts (all on this lane's rig, after the last change)

| gate | result |
|---|---|
| `packages/db`, full gate chain: `onboarding-plan-firm-uniqueness` + `firm-setup-polish` + `firm-setup-applicability` + `firm-setup-user-notes` + `firm-setup-education-tips` + `firm-setup` | **35 pass / 0 fail / 0 skip** |
| `packages/db`, full gate chain: `firm-setup-applicability.test.mjs` alone (after the last wording edit) | **4 pass / 0 fail** |
| `packages/db`, full gate chain: `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags) | **32 pass / 0 fail / 1 skip** (T19 poison-role, correctly skipped) |
| `apps/web` unit: `firm-setup-checklist` + `firm-setup-a11y` + `firm-setup-keyboard` | **24 pass / 0 fail** |
| `apps/web` unit: `tests/firm-scope-db-pins.test.ts` (migration corpus census) | **22 pass / 0 fail** |
| `apps/web` WHOLE unit suite, `node scripts/run-tests.mjs` | **4754 tests · 4752 pass · 0 fail · 2 skipped** |
| e2e `firm-setup-walk` on 3550/3551/3552 | **5 passed (31.0s)** |
| `pnpm typecheck` | clean (apps/web, packages/runtime) |
| `pnpm lint` | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **1 FAIL — not this lane's** (below) |

### The one red, and why it is not mine

```
FAIL  (L05-STD-02 fix round) `--ruling` followed by another flag … is treated as NO ruling given …
      expected the MISSING-RULING refusal specifically …; got stderr:
      freeze-lint: --retire is REFUSED under CI — a deliberate local ceremony act…
freeze-lint selftest: FAIL — 1 case(s) failed.
```

This is exactly the RIG.md addendum's own hazard ("a selftest that spawns such a CLI must clear both
variables for the child when the refusal it pins sits behind the CI refusal"), in a cell whose own
label says **lane 05**. Evidence it is not this lane's: `git diff --name-only <base>..HEAD -- scripts/`
and `git log <base>..HEAD -- scripts/` are both **empty**, and `git status scripts/` is clean. It is
present on the base commit, so every lane sees it. Reported, not fixed — fixing another lane's cell
in a shared script is not this worker's to do.

## Docs updated in the same commits

* `packages/db/migrations/0259_…sql` — a new header section ("FIX ROUND — SS G …, AND ONE NOTION OF
  REQUIRED") carrying the measured before/after numbers and the rejected alternative; the redo-safety
  paragraph rewritten to say what a redo actually needs and to record that one was used.
* `packages/db/README.md` — the #891 paragraph no longer describes the withdrawn widening; the #935
  paragraph no longer claims `get_firm_setup` is untouched.
* `CONTEXT.md` — "Firm setup catalogue note" (the retire sentence, L06-SPEC-11).
* `apps/web/lib/firm-setup/types.ts` — `seeded`, `catalogue_total`, `counter`, `required_outstanding`
  and `items[].required` now each say what they mean and what they must not be used for.
* `apps/web/messages/en.json` — two keys appended at the end of `FirmSetup.seed` (minimal hunk in a
  shared file): `again`, `againHelp`.

## Successor contracts

None. No frozen chat or Work tool reaches any of these surfaces; `packages/runtime` is untouched by
this lane (`git diff --name-only <base>..HEAD` confirms).

## Follow-ups worth filing

1. **Should a seeded, applicable TIN / MPERS screen actually gate the commit?** (from L06-SPEC-02/-03,
   and 0257's own header). One decision about the gate: if yes, `commit_firm_setup`,
   `required_outstanding`, the counter and `items[].required` all move together and stay one notion.
   Until then the counter deliberately understates how much *this* firm has to say.
2. **Should a firm below the RM1M MyInvois threshold be able to volunteer a TIN?** (L06-SPEC-08.)
   Today it cannot, anywhere: the `tin` catalogue row has no `knowledge_key`, and #891 stopped
   seeding it. The interview only makes the answer skippable. Needs an owner ruling because #891's
   AC2 and its "no answer form" clause pull opposite ways.
3. **Give `retired_at` a writer, or keep it migration-only on purpose** (L06-SPEC-11).
4. **`required_outstanding` for a plan-less firm** (L06-SPEC-15, 0256's own declared residual) — the
   one place the counter/outstanding identity still does not hold.
5. **The CI-only `freeze-lint` selftest case** above — lane 05's, on the base.

## Anything unverified

* The **from-scratch chain** proof for the edited 0259 is the integrator's, per RIG.md — this lane
  never runs a second from-scratch chain on its cluster. What *was* proved here is that 0259 applies
  cleanly over its own prior effects (the redo), and its fresh-apply arm is unchanged byte for byte.
* No behavioural cell exists for the `confirmed_facts` retirement filter (L06-SPEC-12); the guard is
  the tail's count of seven, stated as structural above.
* `CI=true` lint was run as RIG.md requires; the single red is attributed above but not independently
  proved to be lane 05's beyond the cell's own label plus this lane touching no file under `scripts/`.
