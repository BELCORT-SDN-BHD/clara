# Wave 4 · lane 04 · fix round 2 — the single fix worker's report

**Branch** `riders/w4-lane04` · **worktree** `C:\Users\zhant\Desktop\clara-wt\651` · **base**
`cd2925391` · **database** `127.0.0.1:55744/clara_l04`.

**Head before this round** `2d7736a6d` · **head after** `604416912`.

Three commits, one per slice:

| commit | subject |
|---|---|
| `d662a2840` | `test(db): #939/#941 ending a schedule does not open the replacement either, driven on both lanes` |
| `8fab433bb` | `fix(web): #939/#941 neither register offers a replacement schedule any more` |
| `604416912` | `docs: #939/#941 the correction path is named as absent in CONTEXT and both READMEs` |

**No migration was touched.** `git diff 2d7736a6d..HEAD` names nine files, none of them under
`packages/db/migrations`. So there was no redo, no pin to re-measure, and no web census keyed on a
migration's content sha to re-take: `0315`'s on-disk sha is still
`c6436f359bb880f452d7eb44f6558708e8871addb8549a9d8057be7c81f61c85` and 0305–0308 are byte-unchanged.
`apps/web/tests/firm-scope-db-pins.test.ts` is green inside the whole-suite pass below for the same
reason — no dynamic SQL moved.

---

## The one finding the recheck left open

`wave4-lane04-recheck.json` carried exactly one item:

> **L04-SPEC-04** (major) — *The correction path both #939 AC4 and #941 AC3 name (a new schedule from
> the next period after a mis-stated term is superseded) still exists in no door.*
> **Required fix:** *Owner decision needed on what a replacement schedule is derived from (the
> un-amortised balance vs. a fresh recognition entry) before a door can be built; until then, do not
> advertise term correction as supported on either register, and file the follow-up ticket the fix
> report already proposes.*

The required fix has three parts. The first — build the door — is explicitly owner-blocked and is
NOT done here (why, below). The second — **stop advertising it** — was reported done by fix round 1
and **was not**; that is what this round reproduced and fixed. The third — **file the ticket** — this
lane never writes to GitHub, so the ticket is drafted in full below, ready for the orchestrator to
file verbatim.

---

## What was reproduced

### 1 · The register still advertised the correction path, in four more places

Fix round 1 wrote: *"The old copy ('a corrected term needs a new schedule from the next period') is
gone from `apps/web/messages/en.json`."* It was gone from `termSupersededBody` on both registers.
It was not gone from the file. Measured at `2d7736a6d`:

| key | the sentence, at `2d7736a6d` | new in this lane? |
|---|---|---|
| `Prepayments.explainPeriodLine` | "…Nothing has been posted and nothing will be — **a corrected term needs a new schedule rather than a revision of this one**." | no (pre-existing, #653/#919 era) |
| `Prepayments.explainAuthority` | "…Restore their membership, or **end this schedule and configure a new one** under someone who is." | no (pre-existing) |
| `Prepayments.endedNoControls` | "This schedule has ended. **Configure a new one** if the remaining periods are still to be charged." | no (pre-existing) |
| `DeferredRevenue.endedNoControls` | "This schedule has ended. **Configure a new one** if the remaining periods are still to be recognised." | **yes — this lane's own, #941** |

`explainPeriodLine` is not a near miss: it is the corrected-term case itself. `explanationKey()`
(`apps/web/components/prepayments/prepayment-detail.tsx:483`) maps
`amortisation_period_line_missing` to it, and that refusal is precisely what a firm meets when a
schedule's stored allocation no longer covers a due date — the situation #939 AC4 is about. The
banner was corrected and the explanation that fires on the same fact was not.

Two of the four predate the lane. They are in this round because the finding's required fix names
the REGISTER, not a diff range: a register that says "one recognition carries one schedule" in its
banner and "configure a new one" three screens later has not stopped advertising anything. The
fourth is this lane's own string.

### 2 · The claim behind the copy had never been driven for an ENDED schedule

`p939.supersede.running` and `p941.supersede.running` both proved a second schedule is refused while
the first is RUNNING. Neither drove the sentence the screens actually made, which is about ending
one first. Driven on `clara_l04` with the screen's own promise as the expectation
(`assert.ok(replacement.schedule_id)`), after `clara.end_accounting_plan` returned `status: ended`:

```
CLR13 — "this prepayment is already amortised by an existing schedule"
```

`uq_prepayment_schedules_source` (0223:330) and `uq_revenue_recognition_schedules_source` (0308:751)
are plain `unique (source_entry_id)` — no status predicate, no partial index. Ending changes
nothing. And there is no second door either: `clara.revise_accounting_plan` (0193:1628) moves the
SCHEDULE and never `authorised_by`, so `explainAuthority`'s "configure a new one under someone who
is" was two impossible acts in one sentence.

---

## The fixes, slice by slice

### Slice 1 · `d662a2840` — the measurement, driven on both lanes

`p939.supersede.running` and `p941.supersede.running` each gain a final arm: end the plan through
`clara.end_accounting_plan`, assert `status = 'ended'`, then ask for the replacement and see
CLR13 `prepayment_schedule_exists` / `revenue_recognition_schedule_exists`, with the source entry's
schedule count still exactly 1.

- **RED first** (prepayment lane): the arm was written with the screen's promise as its expectation
  and failed with the CLR13 above.
- **Vacuity control** (revenue lane): `recognitionScheduleCountFor(scene.receipt)` flipped to expect
  2 → `expected: 2, actual: 1`; restored byte for byte (`git diff --stat` back to 20 insertions).
- Both cell titles now name the new arm, so the evidence is findable from the title alone.

No new cell was added to either file, so neither `EXPECTED_CELLS` counter moved.

### Slice 2 · `8fab433bb` — the four sentences

| key | what it says now |
|---|---|
| `Prepayments.explainPeriodLine` | "…Nothing has been posted and nothing will be: the allocation is fixed when the schedule is configured, and one recognition carries one schedule, so raise the difference with the reviewer." |
| `Prepayments.explainAuthority` | "…**Restoring their membership** is what lets this schedule post again: a plan's authority cannot be reassigned, and this recognition already carries a schedule, so no second one can be configured for it." |
| `Prepayments.endedNoControls` | "This schedule has ended. Nothing more will be charged against it, and the periods still to run cannot be picked up by a second schedule: one recognition carries one schedule. Raise the difference with the reviewer." |
| `DeferredRevenue.endedNoControls` | the same sentence, "recognised" for "charged". |

Each states the limitation and names the act that DOES exist. `explainAuthority` keeps the one real
remedy (restore the membership) rather than dropping to silence — the standing ruling that a wall
prompts rather than going dark.

Two cells, each seen red before the copy moved:

- `prepayments-render-states.test.tsx` — *"L04-SPEC-04: not one sentence on this register offers a
  REPLACEMENT schedule, because the estate has no door that opens one"*. Three arms: the ENDED
  schedule, the lapsed-authority explanation, the period-line explanation (a new `refusedOcc2`
  builder lets a cell name the typed reason the explain surface keys on). **RED first:** *"an ended
  schedule's recognition still carries a schedule, so a new one is refused"*.
- `deferred-revenue-render-states.test.tsx` — *"941.detail: L04-SPEC-04 — an ENDED schedule offers no
  replacement"*. Its **vacuity control** put the old sentence back into `en.json`, saw the cell fail,
  and restored the file (JSON re-validated afterwards).

`prepayment-detail.tsx`'s banner comment, which still said the banner tells a firm "the schedule
needs rebuilding", now says the opposite and names the constraint.

`apps/web/messages/en.json` is a shared file: the hunk is four value strings at their existing
sorted positions, no key added, no key moved.

### Slice 3 · `604416912` — the documents stop describing a door that is not there

- **CONTEXT.md, Revenue recognition schedule** (this lane's own entry): the `_Avoid_` clause said
  "the correction is a new schedule from the next period". It now says what was measured — one
  recognition carries one schedule, ended or running.
- **CONTEXT.md, Corrected term** (pre-existing, #919 era): "grounds for telling a firm its schedule
  has to be rebuilt" contradicted the banner this lane ships. It now says the difference is NAMED
  for a reviewer, because the schedule cannot be rebuilt. (Two one-clause hunks; the rest of both
  entries is untouched.)
- **packages/db/README.md**, in 0315's section: a new subsection *"Not in this file: the correction
  path (L04-SPEC-04, owner-blocked)"* — the two constraints, the two cells that drove them, the
  owner decision the door waits on, and the sentence that neither register may be advertised as
  supporting term correction until it lands.
- **apps/web/README.md**, beside the #919 section that owns the corrected-term surface: the five
  strings, why each was wrong, and the same owner-blocked note.

---

## Why the door itself is still not built

Three reasons, in the order they bind:

1. **The recheck's own required fix does not ask for it.** It asks for the owner decision first.
2. **The decision is not mine to make, and it is an accounting one.** A replacement schedule is
   derived either from the un-amortised balance of the schedule that ran (which keeps the posted
   periods and re-spreads what is left — the treatment a change in estimate gets under MPERS
   section 10 / MFRS 108, applied prospectively) or from a fresh recognition entry (which makes the
   original amortisation an error to be corrected). Those are different numbers in a client's books
   and different disclosures. The standing ruling is that Clara asks for a professional judgement
   rather than choosing one.
3. **Building it needs a schema change this lane has no number for.** A replacement means lifting or
   qualifying `uq_prepayment_schedules_source` and `uq_revenue_recognition_schedules_source`, plus
   deciding what happens to the first schedule's future periods. This lane's reserved numbers are
   spent (0305–0308 and the overflow 0315), and WORK-ORDER.md rule 5 forbids widening a ticket.

What CAN be done without the ruling is done: nothing on either register, and nothing in CONTEXT.md
or either README, now tells a firm to do something the database refuses.

---

## The follow-up ticket, ready to file

This lane never writes to GitHub. The orchestrator files this verbatim.

> **Title:** Term correction has no door: a mis-stated prepayment or deferred-revenue term cannot be
> replaced by a new schedule
>
> **Labels:** `needs-triage`, `ready-for-human`
>
> **Body:**
>
> **What is true today, measured.** `uq_prepayment_schedules_source` (migration 0223) and
> `uq_revenue_recognition_schedules_source` (migration 0308) are plain `unique (source_entry_id)`
> constraints with no status predicate. `clara.create_prepayment_schedule` and
> `clara.create_revenue_recognition_schedule` therefore answer CLR13 `prepayment_schedule_exists` /
> `revenue_recognition_schedule_exists` for a second schedule over the same recognition — while the
> first is running, and equally after it has been ended through `clara.end_accounting_plan`.
> `clara.revise_accounting_plan` (0193) moves the SCHEDULE and never `authorised_by`, and no door
> re-derives an allocation in place (`clara.prepayment_schedules` is append-only by design). Driven
> in `p939.supersede.running` and `p941.supersede.running` (`packages/db/tests/`).
>
> **So:** when a person states a service period, a schedule is configured from it, and the term is
> then found to be wrong, the estate has no way to put the client's books right. #939 AC4, #941 AC3
> and owner decision 3 all name "a new schedule from the next period" as the correction path. It
> exists in no door. As of `riders/w4-lane04` every surface says so plainly instead of advising it
> (the corrected-term banner, the stated-term form, the ended-schedule note, the lapsed-authority
> explanation and the period-line explanation, on both registers), but a firm that mis-states a term
> is left with a wrong amortisation running and a sentence telling it to talk to its reviewer.
>
> **The decision the owner owns, before anything is built:** what is a replacement schedule derived
> FROM?
> - **(a) the un-amortised balance of the schedule that ran** — the posted periods stand, the
>   remaining balance is re-spread over the corrected remaining term. This is a change in accounting
>   estimate (MPERS section 10 / MFRS 108), applied prospectively, and needs no restatement.
> - **(b) a fresh recognition entry** — the original amortisation is treated as an error, reversed
>   and re-derived. This is a prior-period correction with its own disclosure.
>
> and the second half of the same ruling: what happens to the first schedule's future periods — does
> opening a replacement END the original automatically, or must a person end it first?
>
> **Acceptance, once the ruling lands** (draft, to be rewritten against the ruling):
> 1. A door opens a replacement schedule for a recognition entry whose term was superseded, deriving
>    it the way the ruling says, and refuses by name when the term was NOT corrected (a re-record
>    that moved nothing is not grounds — `term_moved`, never `term_live`).
> 2. The original schedule's posted periods and their committed receipts are byte-identical
>    afterwards; the replacement covers only periods the original had not posted.
> 3. The uniqueness rule is qualified rather than dropped: at most one LIVE schedule per recognition
>    entry, with the superseded chain readable in both directions.
> 4. Both registers' surfaces replace the "raise the difference with the reviewer" sentences with the
>    act, and each is driven in a browser walk.
> 5. The OBO twin (#915's shape) and the machine-lane read answer the same rules.
>
> **Until then:** neither register may be advertised as supporting term correction. The five
> sentences that used to advertise it are listed in `apps/web/README.md`, beside the #919 section.

---

## Gates, with counts

Run on `clara_l04` (127.0.0.1:55744) from the lane worktree, Node 22, after the last commit.

| gate | result |
|---|---|
| `prepayment-stated-term` + `revenue-recognition` (full 111-entry gate chain) | **24 tests, 24 pass, 0 fail, 0 skip** |
| `operation-census` + `rig-isolation` (same chain, never with the reset flags) | **33 tests, 32 pass, 0 fail, 1 skip** (the known baseline skip) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **5035 tests, 5033 pass, 0 fail, 2 skipped** (the round-1 baseline was 5033/5031/2; the two new cells are the difference) |
| `prepayments-render-states` / `prepayments-term-source` / `prepayments-a11y` / `prepayments-keyboard` / `prepayments-roster-gate` / `deferred-revenue-render-states`, each alone | **17 / 8 / 3 / 5 / 4 / 7**, 0 fail |
| `pnpm typecheck` (root) | clean — `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | **exit 0** |
| `pnpm --filter @clara/web e2e prepayments-walk` on the lane triple (3530/3531/3532) | **8 passed** (22.1s) |
| `pnpm --filter @clara/web e2e deferred-revenue-walk` on the lane triple | **3 passed** (9.8s) |

`packages/runtime` was not touched this round, so `check-frozen-workflows.mjs` and
`check-parts-parity.mjs` were not re-run (both were OK at `2d7736a6d` in the recheck).

**Tree is clean** (`git status --short` empty). The scratch files this round used (the gate-chain
string, the two byte-for-byte restore backups) live in the session scratchpad, never in the
worktree.

---

## Docs updated in the same commits

`CONTEXT.md` (two clauses), `packages/db/README.md` (0315's section), `apps/web/README.md` (beside
the #919 section), plus the stale banner comment in
`apps/web/components/prepayments/prepayment-detail.tsx`.

## Successor contracts

None new. This round changed no door, no tool input and no refusal mapping — the frozen
`chatTurn_v22` / `claraWork_v6` cut is unaffected by it.

## Still open after this round

- **L04-SPEC-04's positive half — the correction door — remains open and owner-blocked.** It is not
  a defect in what this lane built; it is a capability two acceptance criteria name and no door
  provides. The ticket above is ready to file. The disclosure half of the required fix is now
  genuinely complete: `git grep` for the four sentences returns only the cells that forbid them.

## Anything unverified

- The e2e walks were run on this host (Windows). The integrator's Linux re-run is the check that
  matters for the runner.
- The two pre-existing strings (`Prepayments.explainAuthority`, `Prepayments.endedNoControls`) were
  written before this lane and are read by the #653/#919 surfaces as well as by this lane's. Their
  new wording was proved by the cells named above and by the whole-suite pass; no other cell in the
  repo pins either string (`git grep` for both phrases returns only the new cells).
- Everything else in `wave4-lane04-recheck.json` was already accepted as fixed by the independent
  recheck and was not re-driven here, except where the gates above re-ran the files that carry it.
