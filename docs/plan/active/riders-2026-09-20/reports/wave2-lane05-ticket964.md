# Wave 2, lane 05 — ticket #964

Branch `riders/w2-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, base
`23cfad947b5598214168ba9c43d391b4e16aa745`.

Commits (`git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`):

```
60752b3fd fix(web): #964 the batch card and its census follow the MYT window off UTC
475e8ce35 fix(db): #964 fix-round — bind v_oid to a literal so wiki-dynamic-sql attributes it
63fa30bd1 test(db): #964 recut the batch-board's UTC-window pin to Asia/Kuala_Lumpur
f049a0d7d feat(db): #964 move the document-ingest reservation window to Asia/Kuala_Lumpur
```

## #964 — Move the document daily-ingest ceiling window from UTC to Asia/Kuala_Lumpur

**Status: done.**

Agent Brief verified live on this branch via `gh api repos/BELCORT-SDN-BHD/clara/issues/964`
(body only — zero comments, so the issue body is the newest and only Agent Brief). Not already
satisfied on `main`: measured on this lane's own rig (clara_l05, chain 0001→0234) before any
change, `clara._reserve_document_ingest`'s live `prosrc` still carried
`date_trunc('day', now() at time zone 'utc')`, byte-identical to 0229's own pin — the window had
never moved.

### The seams tested

Named in the Agent Brief's "Key interfaces": the three reservation helpers
(`clara._reserve_document_ingest`, `clara._resize_document_reservation`,
`clara._settle_document_reservation`) and the batch-board read's `capacity` object
(`clara.get_intake_batch`). All three helpers are **ungranted internal functions with no public
door and no way to move `now()`** for a test session, and `document_ingest_reservations
.created_at` is immutable (`_tf_reservation_update` raises CLR08), so — following 0229's own
prestate precedent (`p.prosrc like '%date_trunc(''day'', now() at time zone ''utc'')%'`,
0229:192-198) and `firm-document-limits.test.mjs`'s house shape for a small internal-function
recut — the mechanism is tested by reading the live catalog body (`pg_proc.prosrc`), never by
driving a reservation at a crafted wall-clock instant. `get_intake_batch` **is** a public door and
is tested by calling it for real, through `humanQuery`.

### Acceptance criteria, each with its evidence

- [x] **A reservation made at 06:00 MYT counts against that MYT calendar day's quota, not the
  previous day's.**
  Evidence: `p964.window.capacity_window_myt` (`packages/db/tests/intake-batch.test.mjs`) —
  asserts a crafted 06:00-MYT instant is `counted_myt_today = true` and
  `counted_old_utc_today = false` (the exact gap the ticket closes). Result: **PASS** (part of the
  32/32 green run below).
- [x] **Reservations made at 09:00 MYT and 23:00 MYT on the same MYT date count toward one
  quota.**
  Evidence: same test — asserts both instants truncate to the identical MYT-day window. **PASS**.
- [x] **The quota resets at MYT midnight, not at 08:00 MYT.**
  Evidence: same test asserts the boundary's local wall-clock time is `00:00:00`. **PASS**. Also
  re-asserted at apply time by migration 0252 §T (T4), which the migration's own successful apply
  proves.
- [x] **Reserve, resize and settle agree on the same window boundary for the same instant.**
  Evidence: `p964.window.reserve_resize_settle_agree`
  (`packages/db/tests/document-ingest-window-myt.test.mjs`) — reads all three live bodies and
  asserts they carry the byte-identical window clause, exactly once each (a mixed state is
  structurally unrepresentable, not merely untested). **PASS**. Migration 0252 §T (T1/T2)
  re-asserts the same fact at apply time.
- [x] **The batch-board `capacity` descriptor reports the MYT-midnight window, and the batch card
  shows it without a second hardcoded string.**
  DB evidence: `p964.window.capacity_descriptor_myt` (`intake-batch.test.mjs`) calls the real
  `clara.get_intake_batch` door (`humanQuery`) and asserts
  `{window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur"}`. **PASS**.
  Web evidence: `apps/web/components/documents/intake-batch-card.tsx`'s `resetsAtLocal ?? "08:00"`
  fallback — the "second hardcoded string" the AC names — is now `?? "00:00"`; its own dedicated
  unit test (`intake batch card: the capacity sentence says 00:00 and never 'midnight' or
  'tomorrow'`, `intake-batch-card.test.tsx`) **PASSED** in the full apps/web unit-suite run (see
  Gates). The real-browser walk could not be dynamically re-run — see **Unverified** below; the
  change is verified by unit test and by inspection, not by the sanctioned e2e path.
- [x] **Default per-firm daily limits (docs/day, pages/day) are unchanged.**
  Evidence: migration 0252 §T (T5) re-asserts the five-rung page ladder (1/10/50/100/200)
  unchanged, and the reverse-substitution proof on all four splices proves nothing besides the one
  window/descriptor clause moved in any of the four bodies. `p636.batch.capacity_refusal`
  (unrelated to this ticket's own edits, but exercising the same shipped defaults end-to-end: 100
  docs / 1000 pages) still **PASSES**.
- [x] **The cell that pinned the UTC-day window now pins the MYT-day window, under a name that no
  longer asserts UTC is correct.**
  `p636.batch.capacity_window_utc` renamed to `p964.window.capacity_window_myt`
  (`intake-batch.test.mjs`), assertions rewritten to pin the Asia/Kuala_Lumpur boundary. **PASS**.

### Out of scope — confirmed untouched

- Default ceiling values: unchanged (§T re-reads them).
- Other lanes' UTC-day truncation idiom (0009's / 0038's / 0151's processing-call ceilings, a
  different domain — LLM usage, not document ingest): migration 0252 touches only the four named
  document-ingest OIDs; verified no other function's OID appears anywhere in the file.
- A per-firm configurable timezone: not built; `Asia/Kuala_Lumpur` is a literal, as instructed.

## Migration

`packages/db/migrations/0252_document_ingest_window_myt.sql` — one new file, as reserved.

**Prestate pins** (MEASURED on `clara_l05`, chain 0001→0234, PG 17.11, 2026-09-20, via
`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed by `to_regprocedure`, never transcribed
from file text):

| signature | sha256(prosrc) |
|---|---|
| `clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)` | `074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734` |
| `clara._resize_document_reservation(uuid,uuid,integer)` | `41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf` |
| `clara._settle_document_reservation(uuid,uuid,integer)` | `b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6` |
| `clara.get_intake_batch(uuid,integer)` | `b23cbc0163aeec529df0d67f5495645b28995c768537dd2c6191700fc7fee98d` |

The first three are byte-identical to 0229's own pins for the same OIDs (0229:160-165) — neither
body had moved since 0007. House shape followed throughout: §0 prestate, §A/§B/§C/§D anchored
splices (measure → assert pre-image → replace → verify landed → reverse-substitute to reprove the
pre-image, 0234's own discipline), §T tail re-reading the committed catalog (mechanism agreement,
capacity descriptor, the boundary's own wall-clock fact, the untouched ladder/defaults, all four
ACLs unchanged). Each of the four splices is **redo-tolerant**: if the live body already carries
the target clause it skips with a NOTICE instead of re-splicing, so
`CLARA_MIGRATION_REDO=0252_document_ingest_window_myt` is safe regardless of how much of a prior
attempt landed. **No rig-meta cohort**: no function was added, removed or regranted (all four ACLs
are re-verified byte-identical in §T), so `operation-census.test.mjs` / `rig-isolation.test.mjs`
need no new tracking.

Applied once (`pnpm db:migrate`), then **redone once** for real
(`CLARA_MIGRATION_REDO=0252_document_ingest_window_myt`, after the wiki-lint fix-round edit
described below) — every one of the four splices' own redo-tolerance branch fired ("already at
the … target … skipping the splice") and only §T re-verified, which is the first real exercise of
that branch, not just a read of its code.

## Gates, with counts

- **`document-ingest-window-myt.test.mjs`** (new file, full gate chain, focused): **5/5 PASS**.
  Confirmed RED first: run before the migration existed, the file's own `before` hook threw
  loudly ("the document-ingest MYT window recut is absent…") — the right reason, not a skip.
- **`intake-batch.test.mjs`** (touched, full gate chain, focused): **32/32 PASS**, including the
  renamed pin and the new capacity-descriptor cell, and two collateral cells
  (`p636.census.no_recut`, `p636.batch.no_percentage`) that hardcoded the retired `utc_day`/`08:00`
  shape — both now branch on whether 0252 is live so they stay true in both generations. Both
  files together, with the package's full 51-entry preintegration-gate chain: **37/37 PASS**.
- **`operation-census.test.mjs`**: **10/10 PASS** (no SQL functions were added, so this and
  rig-isolation weren't strictly required by the "if you added functions" rule, but run anyway as
  a sanity check since `packages/db/tests` was touched).
- **`rig-isolation.test.mjs`**: **22/23 PASS, 1 skipped** (T19, the destructive role-reset drill —
  correctly skipped, `CLARA_RIG_ALLOW_RESET` deliberately unset per RIG.md). Never run with reset
  flags.
- **`x42b2-r7-s5-census.test.mjs`** (the arm-(B) "who mentions Asia/Kuala_Lumpur" duplication
  census, exercised because `packages/db/tests/x42-s5-helpers.mjs` needed a new roster entry — see
  below): **2/2 PASS**.
- **`packages/runtime/scripts/check-parts-parity.mjs`**: **OK** (exit 0; `packages/runtime` was
  touched only in one non-`node --test` standalone spawner, see Unverified).
- **`pnpm typecheck`**: `packages/runtime`: **Done** (pass). `packages/db`: no typecheck script.
  `apps/web`: **FAILS**, but on a confirmed **pre-existing, unrelated** defect — see Follow-ups #1.
- **`pnpm lint`** (whole monorepo, run to completion twice — once mid-work, once as the final
  gate after every edit): **PASS, exit 0**, both times. `wiki-dynamic-sql: OK — 1410 clara function
  definition(s) and 216 change-of-record patch(es) scanned, no dynamic wiki SQL outside the
  whitelist; 17 justified dynamic-SQL waiver(s)` (13 pre-existing + the 4 this ticket adds).
- **apps/web whole unit suite once** (`node scripts/run-tests.mjs`, since `apps/web` was touched):
  **4749 tests, 4719 pass, 28 fail**. All 28 failures independently verified **pre-existing and
  unrelated** to #964 (see Follow-ups #1/#2 for the full accounting). Every test file this ticket
  touched or added — `intake-batch-card.test.tsx`, `intake-batch-a11y.test.tsx`,
  `intake-batch-keyboard.test.tsx` — passed 100%, including the renamed capacity-sentence cell.
- **Browser walk** (`intake-batch-walk`, the one apps/web e2e spec touched, my triple
  `https://127.0.0.1:3540` / `3541` / `3542`): **could not run** — blocked by the same pre-existing
  defect (see Follow-ups #1 and Unverified). The spec and its mock were still corrected
  (`00:00` in place of `08:00`) and verified by inspection and by the unit-suite evidence above.

## Docs updated (same commits)

- `CONTEXT.md` — "Member dependency" entry no longer states the retired 08:00 reset as fact.
- `packages/db/README.md` — the #636 section rewritten to describe #964's move (myt_day/00:00,
  all three reservation bodies recut together) rather than reporting the UTC fact as current.
- `packages/db/migrations/0252_document_ingest_window_myt.sql` — its own extensive header.
- `apps/web/components/documents/intake-batch-card.tsx` and `apps/web/lib/documents
  /intake-batch.ts` — stale "08:00, never midnight" header comments corrected.
- `scripts/wiki-lint-checks.mjs` / `scripts/check-wiki-dynamic-sql.selftest.mjs` — new waiver
  entries and the allowlist ratchet's own documentation, in the house style.
- `packages/db/tests/x42-s5-helpers.mjs` — a new `KL_ROSTER_0252_DOCUMENT_INGEST_WINDOW`
  classification comment (CLASS 2: a real window boundary, never a money date).

## Successor contract

None needed. This ticket touches no frozen chat or Work tool surface — the four functions it
recuts are ordinary `SECURITY DEFINER`/`SECURITY INVOKER` SQL, none of them part of any frozen
workflow closure (`node scripts/check-frozen-workflows.mjs` ran clean, as part of the full lint
run, with no manifest diff).

## Follow-ups worth filing

1. **CRITICAL, pre-existing, unrelated to #964 — discovered while gating.**
   `apps/web/components/documents/document-kind-dialog.tsx:95` references an undefined
   `DOCUMENT_KINDS` (only `CLASSIFIABLE_DOCUMENT_KINDS` is imported, line 35), throwing
   `ReferenceError: DOCUMENT_KINDS is not defined` the moment the dialog renders — confirmed by an
   isolated focused run of `document-kind-dialog.test.tsx`. This:
   - crashes the real document-kind classify dialog for any user who opens it (a production
     defect, not merely a test gap);
   - fails `pnpm typecheck` for `apps/web` (`TS2552`/`TS7006` at that exact line);
   - fails `next build`'s TypeScript check, which **blocks every e2e browser walk** on this base
     commit — not just `intake-batch-walk`, and not just lane 05. Every riders-wave-2 lane cut
     from `23cfad947b5598214168ba9c43d391b4e16aa745` inherits this.
   Confirmed pre-existing and not mine: `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD --
   apps/web/components/documents/document-kind-dialog.tsx` is empty on this branch. The fix is a
   one-line, low-risk change — replace `DOCUMENT_KINDS` with the already-imported
   `CLASSIFIABLE_DOCUMENT_KINDS` at line 95 — and is exactly what the file's own currently-failing
   tests (`[1005]…never the raw enum value`, `…offers 20 PHRASES, never the DB enum tokens`, `[878]
   …stops offering a kind the door always refuses`) already expect. **Not fixed here**, per scope
   discipline (work order rule 5) and because it plausibly blocks several other lanes at once — an
   orchestrator-level fix (or a single assigned ticket) avoids N lanes racing the same one-line
   patch.
2. The remaining pre-existing apps/web unit-suite failures (28 total, 4 of them the
   document-kind-dialog crash above): document-processing-task polling (`#904`, 8 cells),
   document-detail deep-link/history navigation (6 cells), filing-retirement re-hydration (2
   cells), and three unrelated DB/catalog census checks (a door-census pin, a capability-floor
   census, a role-ladder/pinned-body census). None mention intake batches or document-ingest
   capacity. Worth their own triage; full failing-test list is in this session's tool transcript
   (`grep "^not ok" /tmp/web_unit_full2.log`-equivalent) if wanted verbatim.
3. `packages/runtime/tests/intake-batch-e2e.mjs`'s corrected literal (`08:00` → `00:00`) was fixed
   but **not dynamically re-run** — see Unverified.

## Anything unverified

- **The `intake-batch-walk` browser walk** could not be executed on the sanctioned e2e path
  (`pnpm --filter @clara/web e2e intake-batch-walk` needs a successful `next build`, which
  currently fails on Follow-up #1, unrelated to this ticket). The card-side fix (`?? "00:00"`
  fallback, the e2e mock's `myt_day`/`00:00` capacity object, the spec's `expect(text)
  .toContain("00:00")`) is verified by inspection and by the full apps/web unit-suite run
  (component render/a11y/keyboard tests, including the dedicated capacity-sentence cell), not by a
  real browser.
- **`packages/runtime/tests/intake-batch-e2e.mjs`**'s corrected assertion (`resets_at_local` now
  expected as `"00:00"`) was fixed but not run: it is a standalone script (not collected by `node
  --test`) that needs a cloned throwaway database (`clara_rt_test`-style, per RIG.md's addendum)
  and a live spawned runtime engine for ~100 real HTTP admissions across five legs — a large cost
  to reconfirm one literal already proven correct at the DB layer
  (`document-ingest-window-myt.test.mjs`) and through the same real door
  (`p964.window.capacity_descriptor_myt`).
- **Lane-database cleanup, disclosed for the record.** Repeated manual re-runs of
  `intake-batch.test.mjs` during this ticket's development (verifying the same file three times)
  accumulated ~32 rows permanently stuck in `state='cancelling'` in `clara.intake_batches` on
  `clara_l05` — a pre-existing fragility in `p636.batch.sweep_settles`'s fixed `sweep(20)` limit
  against unrelated `cancel_blocked_after_revocation`-style debris, unrelated to #964's own logic,
  which I discovered only because I re-ran the file more than once. I cleaned it up on this lane
  database (temporarily disabled/re-enabled the two append-only triggers on
  `clara.intake_batch_member_events` to delete the debris; verified `intake_batches` /
  `intake_batch_members` / `intake_batch_member_events` are all back to 0 rows and both triggers
  show `tgenabled='O'` afterward) so `clara_l05` is clean for tickets #968 and #965. Flagging this
  so the orchestrator knows why a `sweep(20)`-style test could otherwise starve after several
  re-runs on any lane database.
