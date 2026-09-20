# Wave 1 · lane 10 — /code-review fix round

Branch `riders/w1-lane10`, worktree `C:\Users\zhant\Desktop\clara-wt\660`, database
`127.0.0.1:55750 / clara_l10`. Inputs: `wave1-lane10-codereview-spec.json` (L10S-1…5) and
`wave1-lane10-codereview-standards.json` (STD-1…3). Six findings were assigned: L10S-1 to L10S-4,
STD-1, STD-2.

**Head before:** `01e74503`  **Head after:** `97dc52b2`

Three commits added, none pushed, no PR, no GitHub write:

| commit | subject |
|---|---|
| `935494be` | `fix(web): #981 the carrier on the two refusal arms round one left bare` |
| `7b110b6b` | `docs(runtime): #981 the over-the-wire claim names its three legs, not one` |
| `97dc52b2` | `docs(runtime): #980 the third script's second knob, recorded as a deviation` |

## Seams under test

Written down before any cell was touched, per WORK-ORDER rule 4 — and recorded here because
STD-3 (note) says the lane's final report never named them.

- `workErrorResponse(err, options?)` in `packages/runtime/src/workRoutes.ts` — exported precisely
  so a cell drives the function rather than a copy of its predicate. Observed as `{ status, body }`.
- The exported functions of `apps/web/lib/work/api.ts` (`submitJournalWork`,
  `submitPeriodicAdjustmentWork`, `submitStaffExpenseClaimWork`, `submitTradeInvoiceWork`,
  `retryWork`, `cancelWork`, `takeOverWork`, `restateWork`), observed as their returned result
  object, with `fetch` swapped at the transport boundary — the one mock, and it is a system
  boundary.
- The HTTP wire itself, for the three World e2e legs (`work-journal`, `periodic-adjustment`,
  `staff-expense-claim`): the refusal body read off an actual response.
- `tests/work-journal-serve.mjs`'s script selector, observed as the conversation the child
  process actually runs (#980).

No cell was written at any other seam.

---

## L10S-1 (major, #981) — the carrier never reached `source_conflict` or `not_restatable` · FIXED

**Reproduced first.** Not re-derived from the review: the cells were written and watched go red.
`981.web: source_conflict carries the door's typed detail too` failed with the door's object
against `undefined` —

```
…and the door's own object is readable whole
+ actual - expected
+ undefined
- { document_id: 'd-1', entry_id: 'e-1', posted_at: '2026-09-01T00:00:00Z',
-   reason: 'source_already_posted' }
```

and `981.web: restateWork's 409 carries the carrier` failed the same way on `superseded_by`.

**Fixed in three vertical slices** (one test → red for the right reason → the minimal code that
turns it green), all in `935494be`:

| slice | cell (red first) | minimal code that turned it green |
|---|---|---|
| 1 | `981.web: source_conflict carries the door's typed detail too — the arm round one left bare` | `detail?: RefusalDetail` on `SubmitJournalWorkResult`'s `source_conflict` arm + `...carrier(body)` at the journal door (`api.ts:519`) |
| 2 | `981.web: the three SIBLING admission doors read that same carrier, not just the journal one` | `...carrier(body)` at the periodic-adjustment, staff-expense-claim and trade-invoice doors (`api.ts:302`, `:365`, `:451`) |
| 3 | `981.web: restateWork's 409 carries the carrier — superseded_by and all` | `detail?: RefusalDetail` on `RestateWorkResult`'s `not_restatable` arm + `...carrier(body)` (`api.ts:925`) |

Each cell also pins the **no-carrier** body byte for byte — `{kind, entryId, documentId}` and
`{kind, reason, status}` are exactly what they were when the door raises no structured detail —
which is the compatibility half of the same promise the rest of the ticket makes.

`restateWork` had no cell anywhere in `apps/web/lib/work/api.test.ts` before slice 3 (the
standards review said so; confirmed by grep before writing it).

No new promoted key was minted: `superseded_by` reaches the caller on the carrier, like everything
else the door said. The ticket's "out of scope: changing any refusal's reason token vocabulary" is
untouched.

**Evidence.** `lib/work/api.test.ts` 30 tests, 30 pass / 0 fail (was 27/27); whole `apps/web` unit
suite 4641 tests, 4639 pass / 0 fail / 2 skip. `pnpm typecheck` exit 0.

## STD-2 (minor, #981) — module docs claimed EVERY arm · FIXED, both halves

The same defect seen from the docs side, so the code fix above makes the claim true; the claim
itself was still too vague to check. `apps/web/README.md`'s #981 section now names the two arms
that were bare, says which review found them, and says why those two most needed the carrier
(`source_conflict` is built by the same `answer()` as its `conflict` sibling; `not_restatable` is
the only place the door names `superseded_by`). The runtime README's "every 400 and 409 this file
builds" was already true of the runtime and is unchanged.

Arms that still carry nothing, deliberately, after this round — a census of every `return { kind:`
in `api.ts`: `transient` (PostgreSQL broke a deadlock, the statement never ran), `denied` /
`not_found` (403 and 404 are opaque at the runtime, by the standing access ruling), `unavailable`
(a 5xx never goes through `workErrorResponse`), `lost` (no answer was observed). Nothing else.

## L10S-2 (minor, #981) — the "only leg in the estate" claim · FIXED

`packages/runtime/tests/work-journal-e2e.mjs:569` claimed to be the only leg reading the refusal
body off an actual HTTP response; commit `7b47fb42` had made it three in the same series. Verified
by grep before rewording — `CARRIER, OVER THE REAL WIRE` appears in exactly three files
(`work-journal-e2e.mjs:569`, `periodic-adjustment-e2e.mjs:560`, `staff-expense-claim-e2e.mjs:573`)
and nothing else under `packages/runtime/tests` asserts a destructured `detail` off a response. The
comment now names the three and the reason there are three (one per door that can raise this
refusal, all carrying the same literals, so a change to the promoted half has to move the three
together) — which is what `packages/runtime/README.md` already said.

Comment-only, so rule 8's obligation is the re-run: `node tests/work-journal-e2e.mjs` PASS, all 8
legs, 51.2s.

## L10S-3 (minor, #980) — the third script needs a second, mandatory env var · STANDS, now RECORDED

**Not changed in code, deliberately.** The review offered two exits: accept the deviation
explicitly, or derive the scope from the leg. Deriving it — "the client of the first envelope this
process sees" — hands the choice back to queue order, which is the exact failure the gate exists to
prevent: one supervisor serves every queued Work on the database, and the first envelope can be a
bystander's (leg 6 deliberately admits one). The cost of getting it wrong is not a red cell, it is
a stranded `awaiting_input` row no leg polls out of, a 90s timeout for the NEXT leg, and a dirty
rig — which is how the gate came to exist (finding L10-A3, three stranded rows on `clara_l10`).

So the interface stays two knobs and is now **recorded as a deviation where the next reader
stands**, which is what the review asked for:

- `packages/runtime/tests/work-journal-serve.mjs`'s header gains a paragraph titled "TWO KNOBS FOR
  THE THIRD SCRIPT, AND #980 ASKED FOR ONE", quoting the AC's "selectable the same way", saying
  plainly that it is not, and leaving the door open to a later lane folding the two into one
  selector value (`ask_question:<client id>`).
- `packages/runtime/README.md`'s #980 section says the same in its own words, marked **"This is a
  deviation from #980's own wording"**.

**Open for the orchestrator:** accepting a ticket deviation is not a lane worker's to grant. It is
documented, not inherited silently; if the orchestrator prefers the one-knob
`ask_question:<client id>` form, it is a small change to that file plus a re-run of
`trade-invoice-e2e.mjs`.

## L10S-4 (minor, #980) — AC4 measured on 4 of 11+ drivers · ARGUMENT MADE CHECKABLE, debt stands

No gate was widened (the review explicitly forbids a wave-1 lane widening seven more). What was an
argument is now a census anyone can re-run with one grep over `CLARA_WORK_TEST_SCRIPT`, recorded in
`packages/runtime/README.md`:

- all **nine** spawners of `work-journal-serve.mjs` (`accrual`, `fixed-asset-acquisition`,
  `periodic-adjustment`, `plan-occurrence`, `prepayment-occurrence`, `staff-expense-claim`,
  `trade-invoice`, `work-egress`, `work-journal`) `delete base.CLARA_WORK_TEST_SCRIPT` when they
  build the child env, so the `post` default applies;
- `accrual`, `plan-occurrence` and `prepayment-occurrence` re-set `"post"` explicitly on their
  crash legs (9 sites);
- `work-journal-e2e.mjs:694` sets `"narrate"`; `trade-invoice-e2e.mjs:609` sets `"ask_question"`
  with the scope var beside it;
- **no other value is set anywhere in the repo** (`chat-turn-v19/v20/v21-e2e.mjs` also delete the
  var, and spawn their own bootstraps).

With `SCRIPT === "ask_question"` guarding the new branch and `post` / `narrate` returning before
it, no existing driver can reach it. Both scripts were re-measured after this round's doc change:
`work-journal-e2e.mjs` (the estate's only `narrate` driver) PASS all 8 legs; `trade-invoice-e2e.mjs`
PASS all 7, leg 6 `ask_question` green. **The debt is real and stands**: seven spawners were not
run, because running them means widening seven gates. It remains the lane's "Unverified", now with
a bounded argument instead of a bare assertion.

## STD-1 (major, #981) — horizontal slicing in `ba4071de` · CANNOT BE UNDONE; ANSWERED BY SENSITIVITY

The finding is accurate and the history cannot be rewritten (the commit is landed and three later
commits build on it). The standards review's own required fix is forward-looking, and this round
complied with it: L10S-1's three cells were built one at a time, each watched red for the right
reason before its code existed (see the quoted failure above).

What is testable now is whether the batch of cells is **sensitive** — the property horizontal
slicing costs you. Each `#981` cell was given a mutation aimed at the behaviour it claims to pin;
the subject was broken once, the suite run, and the subject restored **byte for byte** (sha256
compared before and after every mutation, all 13 identical: `workRoutes.ts`
`701c5d13bf49e5fb…a822ce2e`, `api.ts` `fca4e1ba7cdff32e…1711ad79`).

**`packages/runtime/tests/work-routes-unit.test.mjs` — 7 cells, 7 sensitive**

| cell | mutation | red? |
|---|---|---|
| `981.route: the carrier is ADDITIVE …` | M2 — drop `entry_id` from the `source_already_posted` body | yes (also reds `634.route: source_already_posted …`) |
| `981.route: the door's typed detail rides back VERBATIM …` | M1 — `answer()` never attaches `detail` | yes |
| `981.route: a detail key never seen before … NO new fold` | M1 | yes |
| `981.route: the three constraint folds are the only typing left …` | M1; M5 — fold on PRESENCE of a constraint instead of the named set | yes under both |
| `981.route: party_ambiguous rides the SHARED responder …` | M1; M6 — the lane field default OVERRIDES the door's own field | yes under both |
| `981.route: a detail that is not a typed object carries NO carrier …` | M3 — wrap a plain-text detail as `{text}` | yes |
| `981.route: 403 and 404 stay OPAQUE …` | M4 — build the 404 through `answer()` | yes (also reds `623.route: the other doors are unchanged …`) |

**`apps/web/lib/work/api.test.ts` — 8 `#981` cells (5 from `ba4071de`, 3 new), 8 sensitive**

| cell | mutation | red? |
|---|---|---|
| `981.web: a 400 with NO structured detail returns exactly the result it always did` | W1 — `carrier()` returns `{detail:{}}` when the body has none | yes |
| `981.web: a detail key this file has never heard of reaches the caller` | W2 — the journal door's 400 drops the spread | yes |
| `981.web: the trade invoice's candidates are the SAME carrier, typed once` | W3 — `candidates` is always `[]` | yes |
| `981.web: an UNNAMED 409 keeps the door's own reason on the carrier` | W4 — the journal door's generic 409 drops the spread | yes |
| `981.web: EVERY durable-Work door reads the carrier — retry, cancel and take-over too` | W5 — the retry door's 409 drops the spread | yes |
| `981.web: source_conflict carries the door's typed detail too` (new) | W8 — the journal door's `source_conflict` drops the spread (siblings keep it) | yes (and born red) |
| `981.web: the three SIBLING admission doors read that same carrier` (new) | W6 — the three siblings drop the spread (journal keeps it) | yes (and born red) |
| `981.web: restateWork's 409 carries the carrier — superseded_by and all` (new) | W7 — the restate arm drops the spread | yes (and born red) |

W1 alone reds eleven cells, including two pre-#981 ones (`400 carries the DB's own typed detail…`,
`409 is a CONFLICT…`) — the compatibility promise is load-bearing across the file, not only inside
the new cells.

**Conclusion.** No insensitive cell, no tautology and no cell that passes by construction was found
among the fifteen. The process violation stands on the record as a process violation; the tests it
produced hold up under mutation.

**#980's cells** are not in scope for STD-1 (it is filed against #981) and were already built with
vacuity controls — commit `1b219f03`'s message records each deliberately broken subject and its
restore digest.

---

## Gates (all after `97dc52b2`, with counts)

| gate | result |
|---|---|
| `apps/web` · `node --import ./test/bootstrap.mjs --import tsx --test lib/work/api.test.ts` | 30 tests, **30 pass / 0 fail / 0 skip** (was 27) |
| `packages/runtime` · `node --test tests/work-routes-unit.test.mjs` | 28 tests, **28 pass / 0 fail / 0 skip** |
| `apps/web` · whole unit suite `node scripts/run-tests.mjs` | 4641 tests, 135 suites, **4639 pass / 0 fail / 2 skip**, 81.7s |
| `packages/runtime` · `node tests/work-journal-e2e.mjs` (55750 / `clara_l10`) | **PASS — all 8 legs**, 51.2s |
| `packages/runtime` · `node tests/trade-invoice-e2e.mjs` (55750 / `clara_l10`) | **PASS — all 7 legs**; leg 6 `ask_question`, leg 7 cancel, 60.8s |
| `pnpm typecheck` | **exit 0**, 12.6s |
| `pnpm lint` | **exit 0**, 65.4s |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files, **no manifest diff**, 55 `use workflow` modules frozen+registered |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable |

Both World e2es were run serially with the rest of the rig idle (the lane's own F2 note: a World
e2e is a whole-database actor). They need
`WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55750/clara_l10` beside the PG env; the World
was already bootstrapped on this database by the build round, so RIG.md's `rig-isolation` T10b
caveat (#866) is unchanged by this round — and `rig-isolation.test.mjs` was not run, because
nothing under `packages/db` was touched.

No browser walk was run: no spec file, no component and no rendered behaviour changed — the two
fixed arms gained an OPTIONAL field no component reads yet (it could not have: it did not exist).
No `packages/db` test, no migration, no PRD/ARCHITECTURE edit, no frozen body, no frozen closure.
No known Windows-only red was hit.

## Docs updated (in the same commits)

- `apps/web/README.md` — the #981 section's arm census corrected and the two arms named.
- `packages/runtime/tests/work-journal-e2e.mjs` — the three-legs comment.
- `packages/runtime/tests/work-journal-serve.mjs` — the two-knob deviation, in the header.
- `packages/runtime/README.md` — the #980 section: the deviation, and the spawner census.

No `CONTEXT.md` change: no new vocabulary — `carrier`, `detail` and `park` were already this
ticket's words.

## What stays, and why

1. **L10S-3's second env var** (minor). Kept, documented, and flagged for the orchestrator's
   explicit acceptance; the alternative re-opens the failure the gate exists to prevent.
2. **L10S-4's seven unmeasured spawners** (minor). Kept as declared verification debt, now with a
   repo-wide census bounding it. Closing it means widening seven gates, which the review forbids at
   lane level.
3. **L10S-5 / STD-3** were not in this round's assignment. STD-3's substance (no Seams section) is
   answered at the top of THIS report; the lane's own `wave1-lane10-final.md` is the orchestrator's
   to amend.

## Follow-ups worth filing

- One shared `packages/runtime/tests/local-db-gate.mjs` (the lane already proposed it): four of
  eleven-plus spawners admit `clara_l<NN>` and seven do not; nine more lanes hit this wall in wave 2.
- `ask_question:<client id>` as a single selector value, if the estate wants #980's AC met to the
  letter.

## Unverified

- The seven spawners of L10S-4 (above).
- No signed-in browser walk was run this round (none was touched).
- `rig-isolation.test.mjs` T10b on `clara_l10` — a World has been bootstrapped on this database
  since the build round; not re-measured here and not made worse.
