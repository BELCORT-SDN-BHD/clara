# Wave 2 · Lane 01 · #906 — `clara._assert_journal_basis`'s `nonzero_total` arm stated unreachable

**Status: DONE.** Branch `riders/w2-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, rig
`127.0.0.1:55741` / `clara_l01`. Base `23cfad947b5598214168ba9c43d391b4e16aa745` (the integrated
head of wave 1). Third and last ticket of the lane; `#1014` and `#868` had already landed five
commits and applied migrations `0235` and `0236` before I started (confirmed by
`git log 23cfad94..HEAD` at start-of-turn).

```
521bdd33a docs(db): #906 named-suite-family entry for the journal-basis zero-total test
685890bae fix(db): #906 clara._assert_journal_basis states its nonzero_total arm is unreachable
```

(on top of `#1014`'s four commits and `#868`'s one, unchanged by me: `d33481f41`, `3dde8c179`,
`041f85cf9`, `88006ff67`, `48a5278ec`.)

**The ticket was still live on this branch.** `select obj_description('clara._assert_journal_basis(jsonb)'::regprocedure, 'pg_proc')`
returned `null` before my edit — no comment existed, and `#868`'s report explicitly recorded that
it did not widen its own migration to cover `#906` even though the 2026-09-17 triage comment
floated sharing one. `0237` was the next free migration number in the lane and was unclaimed.

---

## The seam I tested at (written down before the first test, work-order rule 4)

The Agent Brief's "Key interfaces" names exactly one, and I added no seam it does not give me:

1. **`clara._assert_journal_basis(jsonb)` itself** — called DIRECTLY (`rootQuery` runs as the
   session superuser, which bypasses the function's `revoke all ... from public`), both for the
   catalog comment (`obj_description(...,'pg_proc')`) and for the predicate's live refusal
   behaviour. No business door, no wire shape, no new relation — the predicate is the ticket's own
   named surface, and AC3 ("a cell proves an all-zero balanced basis is refused naming the
   per-line constraint") reads most honestly as a direct call to it rather than a detour through
   `clara.create_accounting_plan` or the prepayment door, both of which already carry an
   equivalent proof one level removed (`accrual-adjustments.test.mjs`'s `p652.basis.zero`,
   `0223:1257-1266`'s own comment) — re-run below as a non-regression check, not duplicated as a
   new cell.

A second, non-regression fact rides along because AC2 names it explicitly ("the body digest is
identical before and after"): the predicate's `prosrc` sha, owner, `SECURITY DEFINER` flag and ACL,
all re-read from the catalog rather than assumed.

---

## The vertical slice, red for its own reason

One seam, one cycle: `packages/db/tests/journal-basis-zero-total-unreachable.test.mjs` written
first, 4 cells (`jz.1`–`jz.4`: comment content, AC2 non-regression, the literal all-zero shape,
and the non-vacuous all-credit shape), run **before** `0237` existed on disk.

**Red, for the right reason.** With `0237_journal_basis_zero_total_unreachable.sql` moved out of
`migrations/`, the ledger row deleted and the comment reverted by hand (simulating the pre-ticket
state), `node --test tests/journal-basis-zero-total-unreachable.test.mjs` (no gate preloaded, a
focused run) failed all 4 cells in the `before()` hook itself, with the loud premise error the
file is written to raise: `#906 premise 0237_journal_basis_zero_total_unreachable.sql is not
applied (no journal_basis_zero_total_unreachable$ row in clara.schema_migrations) and
CLARA_ALLOW_MISSING_JOURNAL_BASIS_ZERO_TOTAL_ARM is unset -- this is a FOCUSED run and must fail
loudly, not skip.` A skip would not have been evidence; a hard failure was the correct red. (Note
on how this red was produced: this rig's `ensureReady()` auto-applies any pending migration file
found on disk before every test run, so once `0237` existed as a file the ordinary act of running
the suite would have silently applied it — the red state had to be reconstructed by hand, once,
specifically to prove the file's gating logic is real rather than assumed.)

**Green.** `packages/db/migrations/0237_journal_basis_zero_total_unreachable.sql` restored
byte-for-byte (diffed against the pre-move copy to confirm), applied via the ordinary
`pnpm run migrate` path (not the `#957` redo mode — the ledger row had been deleted, not merely
the body edited, so the normal apply path is the correct one), then the same focused run: **4 pass
/ 0 fail**.

**Vacuity control (work-order rule 4, "a ticket whose whole deliverable is a test still needs
it").** Two checks, at the two places a vacuous pass could hide:

1. **The premise gate itself.** Demonstrated above — the whole file goes red with the expected
   message when `0237` is absent, and green again once it is restored and reapplied.
2. **The behavioural assertion in `jz.3`.** On a scratch copy of the test file, flipped the
   expected constraint from `"exactly_one_side"` to `"nonzero_total"` and re-ran: `jz.3` went
   **red** (`expected 'nonzero_total', got 'exactly_one_side'`), proving the assertion
   discriminates on the live answer rather than being trivially true. Reverted the one line by
   hand (confirmed the restored file is otherwise identical); re-ran: **4/4 green** again. No
   battery of red cells was written ahead of the implementation; the migration went from absent
   straight to its final, evidence-checked text.

---

## Migration

**`packages/db/migrations/0237_journal_basis_zero_total_unreachable.sql`** (183 lines), stable
stem `journal_basis_zero_total_unreachable$`. Exactly one DDL statement: `comment on function
clara._assert_journal_basis(jsonb) is '...'`. No `set role` (nothing is created or owned by this
file, so ownership is irrelevant to a `comment on function`, and the superuser migration
connection can issue it regardless).

### Prestate pins, MEASURED on this rig before the file was written

| fact | value | treated as |
|---|---|---|
| `clara._assert_journal_basis(jsonb)` `sha256(prosrc)` | `2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684` | 0178's original body, live and unmoved at 236 migrations (0001→0236) — measured directly via a `pg` connection against the rig, verified byte-identical to 0178's own source text |
| owner | `clara_fn_owner` | unmoved since 0178 |
| `SECURITY DEFINER` | `true` | unmoved since 0178 |
| ACL | `{clara_fn_owner=X/clara_fn_owner}` | owner-only, no PUBLIC and no application-role grant (0178:790's `revoke all ... from public`, which Postgres materialises as this explicit owner-only ACL rather than `(null)` — measured, not assumed, after an initial wrong guess) |

Plus a re-derivation (not a hard pin): the prestate confirms the live body still contains all
three tokens `at_least_two`, `exactly_one_side` and `nonzero_total` by name before writing a
comment that cites them.

### The proof, re-derived rather than transcribed from the triage comment

Three arms combine to foreclose `nonzero_total` (0178:785-787, "the basis moves no money"):

1. `at_least_two` (0178:743-745) refuses fewer than two lines, so the per-line loop always runs.
2. `exactly_one_side` (0178:769-772) refuses any line whose debit and credit are equally signed —
   both positive, or both zero — so every surviving line carries exactly one strictly positive
   side (non-negative cents come from `clara._journal_cents`, 0178:672).
3. `balanced` (0178:780-783) refuses `v_dr <> v_cr` before `nonzero_total` ever runs.

Two ways a basis could make `v_dr = 0`, and both are already gone by the time control reaches the
`nonzero_total` check:

- **Every line has both sides zero** — arm 2 refuses the FIRST such line on its own
  (`(0>0)=(0>0)` is `true`). This is the literal "all-zero balanced basis" AC3 names; `jz.3`
  measures it directly.
- **Some lines are non-degenerate but the debit total still sums to zero** — every surviving
  line's debit is non-negative (arm 2 + `_journal_cents`), so a debit total of zero forces every
  line's credit to be strictly positive; with at least two such lines (arm 1), the credit total is
  then positive while the debit total is zero, and arm 3 (`balanced`) raises first. `jz.4` measures
  this second, non-vacuous shape, which the Agent Brief's AC3 does not name explicitly but which
  the "cannot fire while the minimum-line and per-line arms stand" claim also depends on — I added
  it as the natural second half of the same proof, not as scope creep: it is the same seam, the
  same migration's own comment, and the same "does `nonzero_total` ever answer" question, just the
  other branch of it.

This was already downstream knowledge (`0223:1257-1266`, the prepayment door's own comment,
carries the identical finding at its own call site — re-verified, not merely re-read, by
`p652.basis.zero` in `accrual-adjustments.test.mjs`, which I re-ran as a non-regression check, see
Gates) where a reader of the shared predicate itself did not see it; this file gives the predicate
its own statement of its own contract.

### Gate ceremony

- Preintegration gate module:
  `packages/db/tests/journal-basis-zero-total-unreachable-preintegration-gate.mjs` (sets
  `CLARA_ALLOW_MISSING_JOURNAL_BASIS_ZERO_TOTAL_ARM=1`), registered in `packages/db/package.json`'s
  `test` script, appended after `subledger-hook-caller-roster-preintegration-gate.mjs` (0236) — the
  sorted (migration-order) position, a one-line diff on this shared file.
- Frontier gate: inline in the test file (`STEM = "journal_basis_zero_total_unreachable$"` against
  `clara.schema_migrations`), following `subledger-hook-caller-roster.test.mjs`'s shape exactly —
  one seam, no fixture-building of its own.
- **No rig-meta cohort was added, deliberately**, for the same reason `#868`'s report gave for
  `0236`: this migration mints no relation, no function, no grant and recuts no body — `rig-meta.mjs`'s
  cohorts track grant/table census, and nothing here moves either. Confirmed rather than assumed:
  `rig-isolation.test.mjs` and `operation-census.test.mjs` (both consumers of `rig-meta.mjs`) pass
  unchanged, see Gates.

---

## Acceptance criteria

**AC1 — "The comment names the arm as unreachable and the two arms that make it so."** **Done.**
`jz.1`: the comment matches `/nonzero_total/`, `/unreachable/i`, `/at_least_two/` and
`/exactly_one_side/`. The migration's own tail (`§C.1`) asserts the same four substrings are
present before the transaction commits, so the fact is checked twice, independently, from two
different connections.

**AC2 — "The body digest is identical before and after (proved in the migration's tail)."**
**Done.** The migration's own tail (`§C.2`) re-measures `sha256(prosrc)`, owner, `SECURITY
DEFINER` and ACL and raises `CLR10` if any moved; `jz.2` re-asserts the same four facts from the
test side, pinned to the same measured values. Both green.

**AC3 — "A cell proves an all-zero balanced basis is refused naming the per-line constraint, not
the zero-total one."** **Done.** `jz.3` constructs the literal all-zero basis (two lines, each
`debit_cents: 0, credit_cents: 0`), calls `clara._assert_journal_basis` directly, and asserts
`error.code === 'CLR10'`, `detail.reason === 'invalid_basis'`, `detail.constraint ===
'exactly_one_side'` (not `'nonzero_total'`), `detail.field === 'lines[1]'`. As a non-regression
cross-check, `accrual-adjustments.test.mjs`'s pre-existing `p652.basis.zero` cell (through the
`clara.create_accounting_plan` door, one level removed from the raw predicate) still asserts and
passes the identical `exactly_one_side` / `lines[1]` answer — see Gates.

**AC4 — "Applies from scratch."** **Partially evidenced, same posture as `#1014`/`#868`'s reports.**
The migration applied cleanly via the ordinary (non-redo) path onto the chain this lane already
ran from scratch earlier in the session (`#1014`'s report), both in its first application and
again after the vacuity-control round-trip (removed, reverted, restored, reapplied). I did not run
a second full `0001→0237` from-scratch chain on this cluster — RIG.md forbids it on a reused
cluster (migration 0154's role-count pin, `#867`); that proof belongs to the integrator's
disposable-cluster run. Recorded under "Unverified" below.

---

## Gates, with counts

Every `packages/db` run is from `packages/db` with the FULL preintegration gate chain
(`node --test --test-concurrency=1 $GATES <file>`, `$GATES` regenerated from `package.json` after
my own gate module was registered).

| gate | result |
|---|---|
| `journal-basis-zero-total-unreachable.test.mjs` (added) — focused, no gate preloaded | **RED before `0237`** (loud premise failure, all 4 cells), **GREEN after** (4/4) |
| `journal-basis-zero-total-unreachable.test.mjs` — with full gate chain preloaded | **4 pass / 0 fail / 0 skip** |
| `accrual-adjustments.test.mjs` (non-regression, references the same predicate) | **21 pass / 0 fail / 0 skip** |
| `prepayment-schedule.test.mjs` (non-regression, references the same predicate via 0223's door) | **18 pass / 0 fail / 0 skip** |
| `subledger-hook-caller-roster.test.mjs` + `opening-binding-claim-preintegration-gate.mjs` (prior lane tickets, sanity) | **5 pass / 0 fail / 0 skip** |
| `operation-census.test.mjs` | **10 pass / 0 fail / 0 skip** |
| `rig-isolation.test.mjs` | **22 pass / 0 fail / 1 skip** — T19, the documented `CLARA_RIG_ALLOW_RESET` skip, not touched |
| `pnpm --filter @clara/db lint` (`eslint .`) | **exit 0**, silent |
| `pnpm lint` (root, full chain) | **exit 0** |
| `pnpm typecheck` (root) | **exit 1 — RED AT BASE, not this ticket.** See below (identical finding to `#1014`'s and `#868`'s reports) |

Neither reset flag (`CLARA_RIG_ALLOW_RESET`, `CLARA_RIG_ALLOW_ROLE_SWEEP`) was ever set. No second
from-scratch chain was run on this cluster. I added no SQL function (only a `comment on
function`), so `operation-census`/`rig-isolation` were run as an extra confidence check
(WORK-ORDER.md rule 8 asks for them whenever `packages/db/tests` is touched; the lane task's own
gate list conditions them on "if you added SQL functions", which I did not) rather than a strict
requirement — both pass either way.

`apps/web` and `packages/runtime` are **untouched** by this diff (`git diff --name-only
48a5278ec..HEAD` lists exactly 6 files, all under `packages/db`), so the web unit suite, browser
walks, `check-frozen-workflows.mjs` and `check-parts-parity.mjs` were not triggered by my ticket
(though `pnpm lint`'s root chain runs `check-frozen-workflows.mjs` regardless and reported no
manifest diff).

### `pnpm typecheck` is red at the wave-2 base — pre-existing, not this ticket's

```
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,22): error TS2552:
  Cannot find name 'DOCUMENT_KINDS'. Did you mean 'documentId'?
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,42): error TS7006:
  Parameter 'k' implicitly has an 'any' type.
```

Same finding `#1014`'s and `#868`'s reports already recorded on this branch (re-observed, not
re-diagnosed). Traced with `git blame` to commit `61f56acfbf` (2026-09-20), already present at the
lane's own base `23cfad947b5598214168ba9c43d391b4e16aa745` — confirmed with
`git show 23cfad94:apps/web/components/documents/document-kind-dialog.tsx`, which shows the same
undefined `DOCUMENT_KINDS` reference. `packages/runtime typecheck: Done` in the same run. Nothing
in my diff touches `apps/web`; not fixed here (work-order rule 5, scope discipline) and already
flagged to the integrator by both prior tickets' reports.

---

## Docs, in the same commits

- `packages/db/README.md` — new section **"0237 — `clara._assert_journal_basis`'s `nonzero_total`
  arm, stated as unreachable (#906)"**: the two guarding arms with their line citations, the two
  ways `v_dr = 0` could be reached and which arm actually catches each, and what the migration's
  prestate/tail check.
- `packages/db/tests/README.md` — one paragraph added to "Named suite families" describing
  `journal-basis-zero-total-unreachable.test.mjs` and its gate, in the same style as the
  `subledger-hook-caller-roster` entry immediately above it.
- `CONTEXT.md` — **not touched.** No new domain vocabulary: the `nonzero_total` arm's
  reachability is an internal implementation fact about one Postgres predicate's control flow, not
  a term a reader of the shared accounting vocabulary needs. Same posture `#868`'s report took for
  the subledger hook's caller roster.

---

## Successor contract

**None.** Nothing here is reachable from a frozen chat body, a frozen workflow closure module, or
the Work tool — `clara._assert_journal_basis` is an internal, ungranted validation predicate
(`revoke all ... from public`), called only from other SQL functions, never wired to any door,
wire shape or agent-facing surface directly. `node scripts/check-frozen-workflows.mjs` was not run
standalone (not required — `apps/web`/`packages/runtime` untouched) but `pnpm lint` runs it as
part of the root chain and reported no manifest diff.

---

## Follow-ups worth filing (I filed none — no GitHub writes)

1. **The all-credit (non-vacuous zero-debit-total) shape has no existing regression cell outside
   this ticket.** `p652.basis.zero` in `accrual-adjustments.test.mjs` covers the literal all-zero
   shape through a business door; `jz.4` is, as far as I found, the first cell anywhere in the
   suite that exercises the second way `nonzero_total` could theoretically be reached and shows
   `balanced` catching it instead. Worth a mention if a future ticket ever touches `balanced` or
   `exactly_one_side`'s ordering — `jz.4` is a canary for exactly that regression.
2. **`apps/web/components/documents/document-kind-dialog.tsx` does not compile** — pre-existing at
   the wave-2 base, from riders wave 1 lane 08, already flagged by `#1014`'s and `#868`'s reports.
   Repeating it a third time only because every wave-2 lane's `pnpm typecheck` will keep reporting
   it until someone fixes it or the integrator accepts it as known wave-1 residue.

---

## Unverified / deliberately left

- **A true from-scratch `0001→0237` chain was not run by me**, for the same RIG.md/`#867` reason
  `#1014` and `#868`'s reports both recorded. What I *can* evidence: `0237` applied cleanly onto
  the chain `#1014` ran from scratch this session, with both prestate and tail notices green, and
  was additionally exercised through a full remove/revert/restore/reapply round-trip during the
  vacuity control, each time re-asserting the same tail facts.
- **The exact wording "retained as a fold guard" is the Agent Brief's own phrase**, carried into
  the SQL comment verbatim; I did not independently re-derive that this is the *only* reasonable
  characterisation (versus, say, "vestigial" or "defence-in-depth kept for a future change") — it
  is the phrase the ticket asked for and it is accurate, but it is a judgement call about framing,
  not a measured fact like the sha pins.
- **jz.4's shape (all-credit, zero debit total) is my own addition beyond the Agent Brief's
  literal AC3 wording**, reasoned about above under AC3/Migration — I believe it is squarely inside
  the ticket's own seam and question (does `nonzero_total` ever answer?), not scope creep, but it
  is worth the integrator's own read since the brief's acceptance criteria only names the literal
  all-zero case by name.
