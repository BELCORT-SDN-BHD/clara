# Wave 3 · Lane 06 · Ticket #919 — prepayment schedule reads gain a term-liveness flag

Branch: `riders/w3-lane06`. Base: `ffe63a0dd084e99b84c1368119845be273c421ce` (integrated wave-2 head).
Commits (this ticket, second in the lane after #936 — `git log ffe63a0dd08..HEAD`):

```
0b6eefa0d docs(runtime): #919 stop the standalone-e2e list from drifting
855131eac feat(web): #919 render the corrected-term banner on the prepayment detail surface
33f184d3e feat(db): #919 prepayment schedule reads gain a term-liveness flag
cd8ac1a24 feat(web): #936 the accrual correction form and detail lineage
e1180d020 docs(context): #936 record the "Accrual correction" term
8c892526c feat(db): #936 a dedicated accrual-correction door
```

Status: **done**.

## RESUME check (this session started fresh context on this ticket)

First action: `git status` (clean, nothing uncommitted) and `git log --oneline ffe63a0dd08..HEAD`
(only the three #936 commits existed). No migration file numbered 0285 existed on disk, and
`clara.schema_migrations` on `clara_l06` topped out at `0284_accrual_correction` (measured via
`wsl -- psql … select version, applied_at … order by version desc limit 8`, 8 rows shown, newest
`0284_accrual_correction`). So the earlier implementer the prompt says was killed mid-work left
**no artifact at all** on this branch or this database — there was nothing uncommitted to judge on
its merits; this session built the ticket from a clean starting point.

## The ticket

`gh issue view 919 --comments`: body + Agent Brief, plus one comment dated 2026-09-19 (AI-triage
sequencing note — **not** an owner ruling, and not dated 2026-09-20, so no ruling comment
overrides the brief). The comment records that #939/#940/#941 are blocked on this ticket
("recuts the same schedule reads; land it first") and restates the same four ACs as still open;
it adds no new scope beyond a sequencing note.

`clara.prepayment_schedules.service_period_id` (0223) names the `clara.document_service_periods`
row a schedule was derived from. 0223's own header already states the design in full — that table
is supersede-never-mutate (0140), a corrected term is a NEW live row, and the stored allocation
never moves ("a genuinely re-derived schedule is a NEW schedule on a NEW plan") — but neither
`clara.get_prepayment_schedule` nor `clara.list_prepayment_schedules` ever said whether the row a
schedule named was *still* the live one. "A corrected term needs a new schedule" was tribal
knowledge a person had to already hold rather than a fact either read reported. The runtime
README's standalone-e2e sentence also undercounted (said "five", enumerated seven, twenty exist
and eighteen wired — all now stale numbers too, see AC4).

## Acceptance criteria, with evidence

**1. "A cell records a period, derives a schedule, supersedes the period through the human term
door, and asserts both reads report the term superseded and name the superseding row."**

- Done. `packages/db/tests/prepayment-term-liveness.test.mjs`, `p919.term.superseded` (PASS):
  builds a scene, creates a schedule, calls `clara.record_document_service_period` a SECOND time
  on the same document (the "human term door" — `f-a4-pr2a-fixtures.mjs`'s `recordPeriod`, run as
  bookkeeper Bob), and asserts:
  - `getPrepaymentSchedule` before the correction reports `term_live: true, term_superseded_by:
    null`.
  - The door's own answer names `superseded_id` equal to the schedule's original
    `service_period_id` — proving the SAME row was superseded.
  - `getPrepaymentSchedule` after the correction reports `term_live: false` and
    `term_superseded_by` equal to the NEW row's id (`corrected.service_period_id`), while
    `service_period_id` on the schedule itself is unmoved (append-only, as designed).
  - `listPrepaymentSchedules` reports the identical `term_live`/`term_superseded_by` pair on the
    matching row.

**2. "A cell asserts an untouched schedule reports its term live."**

- Done. `p919.term.live` (PASS): a schedule with no correction reports `term_live: true,
  term_superseded_by: null` on both `get_prepayment_schedule` and `list_prepayment_schedules`.

**3. "A web cell asserts the flag renders on the detail surface and is absent for a live term."**

- Done. `apps/web/components/prepayments/prepayments-render-states.test.tsx`:
  - The existing "derived facts…" cell (DETAIL now carries `term_live: true`) gained an assertion
    that `byTestId(h.container, "prepayment-term-superseded").length === 0` and the sentence
    `/a corrected term needs a new schedule/` does not appear — **absent for a live term**.
  - A new cell, "ticket 919: a schedule whose term row has since been superseded renders the
    corrected-term banner…" (PASS), mocks `get_prepayment_schedule` with `term_live: false,
    term_superseded_by: "sp-2"` and asserts the banner (`data-testid="prepayment-term-superseded"`)
    renders exactly once, carrying the sentence.
  - Vacuity control: with the banner's conditional forced to `{true ? null : (…)}`, the new cell
    failed for the right reason (`0 !== 1` on the testid count); the subject was then restored
    byte for byte (`git diff` empty before commit) and the file re-run green.

**4. "The README's set matches what the db-live-gates action invokes, or no longer enumerates; a
census cell or the wording keeps it from drifting."**

- Done, via the "no longer enumerates" branch. Measured first (never trusted the ticket's own
  numbers, which were already one round stale): `find packages/runtime/tests -maxdepth 1 -iname
  "*-e2e.mjs" | wc -l` → **25** files exist; `grep -oE "tests/[a-zA-Z0-9._-]+-e2e\.mjs"
  .github/actions/db-live-gates/action.yml | sort -u | wc -l` → **23** wired by path (two —
  `shutdown-e2e.mjs`, `world-e2e.mjs` — are not). `packages/runtime/README.md`'s "Standalone
  e2es" section previously said "none of the standalone e2es (`tests/interview-e2e.mjs`, … seven
  named …) may share a host…"; it now says "none of the standalone e2es this package ships that
  [`db-live-gates/action.yml`] wires by path … grep that action for `world-gate.mjs` … for the
  CURRENT, authoritative set" — no filename and no count survive in the sentence, so a file added
  to or removed from the action cannot make it wrong again the way the ticket's own "five"/"seven"
  pair already had.

## Seams tested

- `clara.get_prepayment_schedule(uuid)` and `clara.list_prepayment_schedules(uuid)` — driven only
  through `humanQuery`/`namedCall` (a real `clara_authenticated` bookkeeper session), never a
  direct table read.
- `clara.record_document_service_period` — the ONE human door 0140 names as the lawful producer of
  a correction, used to build the superseded fixture rather than writing
  `document_service_periods` by hand.
- The web read seam: `loadPrepayment` → `PrepaymentDetail`, mounted through the existing DOM-event
  harness (`renderComponent`/`hookHarness`) `prepayments-render-states.test.tsx` already uses.

## Gates, with counts

- `packages/db/tests/prepayment-term-liveness.test.mjs` — **2/2 PASS**, both focused (red before
  the migration applied: "the #919 prepayment-term-liveness lane is required for a focused run",
  confirmed, then green after `pnpm db:migrate`) and with the full gate chain (`$GATES` = every
  `--import ./tests/*-preintegration-gate.mjs` in `packages/db/package.json`, now 86 entries
  including this ticket's own `prepayment-term-liveness-preintegration-gate.mjs`, added last in
  migration order → 88/88 PASS).
- `packages/db/tests/prepayment-schedule.test.mjs` — **18/18 PASS**, focused and with the full
  gate chain (104/104 PASS) — regression check on the two recut bodies' existing battery.
- `packages/db/tests/operation-census.test.mjs` — **10/10 PASS**. This ticket mints no SQL
  function and changes no grant (only recuts two existing bodies' text), so no `rig-meta.mjs`
  cohort was needed or added — the `0257_firm_setup_applicability.sql` precedent (measured: no
  `FIRM_SETUP_APPLICABILITY` cohort exists in `rig-meta.mjs` either).
- `packages/db/tests/rig-isolation.test.mjs` — **22/22 PASS, 1 skipped** (T19 poison-role,
  destructive, skipped by design — `CLARA_RIG_ALLOW_RESET` was never set).
- `pnpm typecheck` (repo root) — clean (`apps/web` and `packages/runtime` both "Done").
- `pnpm lint` (repo root) — clean, exit 0.
- `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, matching the runner) — clean, exit 0. Two
  earlier attempts in this session aborted with `FATAL ERROR: … JavaScript heap out of memory` /
  `Fatal process out of memory: Zone` inside the eslint/check-script chain while several other
  heavy gates (migrate, multiple db test batteries, typecheck, a first plain `pnpm lint`) had just
  run back to back on this host; `Get-CimInstance Win32_OperatingSystem` showed ~18.6 GB of ~33 GB
  still free at the time, so this reads as transient host/V8-heap contention rather than a real
  defect, and the very next retry (nothing else running) passed clean — recorded here rather than
  silently retried away.
- One fix round: the new web test's title contained `#919`, which trips the raw-colour-value
  selector (`#994`'s own documented limitation — 3 hex-looking characters after `#`); reworded to
  "ticket 919", same fix class `#936`'s own report recorded for `#936`.
- `apps/web` whole unit suite (`node scripts/run-tests.mjs`) — **4863/4865 pass, 0 fail, 2 skipped**
  (pre-existing skips, unrelated to this ticket; 138 suites).
- No `apps/web/e2e` file or Playwright browser walk was touched by this ticket, so no run on this
  lane's triple (`https://127.0.0.1:3550` / `3551` / `3552`) was required or made.

No Windows-only known reds (RIG.md) were hit by this ticket's own cells.

## Migration

`packages/db/migrations/0285_prepayment_term_liveness.sql` — stem `prepayment_term_liveness$`.

- **Prestate pins** (measured on `clara_l06` before applying; #936/0284 touched neither function,
  so both were still at their 0223 originals — pinned here from a fresh measurement, not copied
  from 0223's own text):

  | signature | sha256(prosrc) |
  |---|---|
  | `clara.get_prepayment_schedule(uuid)` | `40c5913fe3b0e05b489743f4b6e714313708c637609c9aa441b887e0f1932286` |
  | `clara.list_prepayment_schedules(uuid)` | `e10eee318bf81bc12e987d30e7a580e5d29aa66245d20fa75ddca3b40171c51c` |

  Also asserted (not a sha pin, a structural measurement): `clara.document_service_periods` is
  `relrowsecurity`/`relforcerowsecurity` both true, and its `p_dsp_owner` policy (`for all to
  clara_fn_owner using (true)`) exists — the safety argument the header rests the new join's
  legality on.
- **The change**: `create or replace function` for both, recut bodies otherwise byte-identical to
  0223's, each gaining a join to `clara.document_service_periods` on `service_period_id` and two
  new keys in the returned jsonb — `term_live` (`superseded_at is null`) and
  `term_superseded_by` (`superseded_by`, null while live).
- **Tail assertions**: both functions resolve; both keep their exact posture
  (`clara_fn_owner | true | s | search_path=clara, pg_temp`) and ACL (`clara_authenticated` alone
  — no `PUBLIC`, no `clara_runtime`); both bodies carry the `term_live`/`term_superseded_by`/
  `document_service_periods` tokens; `clara.document_service_periods` keeps its four triggers and
  its RLS-forced posture (this file alters no table).
- No table, column, trigger, index or grant is added, altered or dropped.
- Applied once, cleanly: `pnpm db:migrate` → `applied 0285_prepayment_term_liveness · 269 total ·
  target 127.0.0.1:55746/clara_l06`. No `CLARA_MIGRATION_REDO` was used — this was a first, clean
  apply, so no redo branch was exercised (the file is written redo-safe by construction —
  `create or replace function` only, a prestate that asserts nothing about this file's own
  additions being absent — but that was never tested against a live redo in this session).

## Docs

- `packages/db/README.md`: new `## 0285 — the prepayment schedule reads gain a term-liveness flag
  (#919, riders wave 3, lane 06)` section, following the house shape every recent migration
  section here uses (the gap, what the file adds/does not, why a join and never a stored column,
  the migration triad, the redo-safety claim, and the explicit "no rig-meta cohort, and why" note).
- `packages/runtime/README.md`: the "Standalone e2es" paragraph reworded per AC4 above (no longer
  names files or a count).
- `CONTEXT.md`: **not edited**. Checked first: the existing **Service period** entry already
  states the exact fact this ticket makes visible on the read side ("A schedule derived from it
  keeps naming the exact row it rode, so a later correction supersedes that row without silently
  moving an allocation that has already begun posting") — no new domain vocabulary was introduced,
  so no new term/_Avoid_ entry was added.

## Successor contract

None. Both recut reads are ordinary `clara_authenticated` human doors with no OBO twin, no wake
wrapper and no frozen-chat/Work-tool surface reaching them; this ticket edits no frozen body and
no closure module.

## Follow-ups worth filing

- **The list surface does not render the flag.** The ticket's "Key interfaces" line says "The
  prepayment detail and list surfaces: render it", but the Acceptance Criteria's own testable line
  names only the detail surface ("A web cell asserts the flag renders on the detail surface…").
  Per the work order's TDD discipline ("No test at a seam the brief does not give you" / "No
  speculative code for tests you have not written"), this session implemented and tested the
  detail surface only; `PrepaymentListRow` carries `term_live`/`term_superseded_by` (the DB read
  is symmetric per AC1), so a follow-up ticket adding a small badge to
  `apps/web/components/prepayments/prepayments-list.tsx`'s `ScheduleRow` — with its own tested
  cell — is a small, low-risk addition rather than a gap in the data.
- **#939/#940/#941 are now unblocked**, per the 2026-09-19 triage comment's own sequencing note:
  the flag and migration shape (`term_live`/`term_superseded_by`, migration `0285`) are live on
  this branch and this database. Whoever picks those up next should confirm the shape is still
  live on whatever branch they build from (this lane's own base, or `main` post-merge).

## Anything unverified

- A true from-scratch migration chain (0001→0285) on a disposable cluster was not run by this
  ticket — RIG.md and the wave-3 addendum assign that proof to the integrator. This lane's
  database went from 0001→0284 (already in place before this ticket started, 268 files) to
  0001→0285 (269 files, per the migrator's own count) via one additional clean apply, which is the
  evidence available at this altitude.
- The redo path (`CLARA_MIGRATION_REDO=0285_prepayment_term_liveness`) was written redo-safe by
  construction but never actually exercised in this session — there was no edit-after-apply round
  that needed it.
