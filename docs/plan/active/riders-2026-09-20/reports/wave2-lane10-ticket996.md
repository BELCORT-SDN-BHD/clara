# Wave 2 · Lane 10 · Ticket #996 — DONE (mount the compliance watch disposition read on /settings/compliance)

Branch: `riders/w2-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. First action: `git status` (clean) and
`git log --oneline 23cfad9..HEAD`, which showed #871 stopped (no commits) and #872 already
landed (`f4da314ee`, `ba14c5a5a`) plus its own out-of-scope fix (`1a260af98`) — confirmed against
`wave2-lane10-ticket871.md`/`wave2-lane10-ticket872.md`.

Commits on top of base, in order (all mine, all named `#996`):

1. `c02200ad8` — `feat(web): #996 extract compliance_watch ids from list_review_queue rows`
2. `df403845e` — `test(web): #996 cover loadComplianceWatchIdsForClient and loadComplianceWatchDispositions`
3. `daa9bacaf` — `refactor(web): #996 extract WatchDispositionLine from the C88.10 receipt`
4. `2db4a9383` — `feat(web): #996 mount the compliance watch disposition read on /settings/compliance`
5. `ae4c6a88d` — `fix(web): #996 lint — drop unused imports, reword test titles off the raw-colour trap`

## The ticket

`gh issue view 996 --comments` — zero comments; the issue body (an AI-triage "Agent Brief," no
owner-ruling comment dated 2026-09-20 exists for this ticket) is therefore the newest and only
brief. Verified still live on this branch before building: `ComplianceWatchAffordance`,
`ComplianceRegisterPanel`, `get_compliance_watch_disposition` and `list_review_queue`'s
`compliance` envelope all existed exactly as the brief described, and `/settings/compliance`
still rendered the aggregate with no disposition — grepped and read on this branch, not assumed
from the brief's own claim.

> Show each compliance watch's disposition on the firm-wide compliance register, using the read
> that already serves the other two mount points (needs-you inbox row, client Tax tab). No new
> door, no second query implementation, no recut of the review queue's `compliance` aggregate. A
> viewer below the bookkeeper floor gets an honest sentence, never an error banner or a blank.

Lane theme note: this ticket carries no #960-style owner ruling of its own; the "no operator gate"
ruling quoted in my prompt belongs to ticket #960, next in this lane, not to #996.

## The seams tested at

- **`complianceWatchIdsFromRows`** (`lib/firm-admin/compliance.ts`) — pure extraction, public
  function, tested directly.
- **`loadComplianceWatchIdsForClient`** — the wire shape it posts to `list_review_queue`
  (`p_scope:{client_id}`, `p_cursor:null`, `p_limit:500`), tested at the wire-shape level the
  file's other wrappers already use.
- **`loadComplianceWatchDispositions`** — the public async function the panel calls; its `byKey`
  map and `flooredBelowBookkeeper` flag are the two facts a caller can observe.
- **`ComplianceRegisterPanel`** (mounted whole, real fetch mocked) — rendered text, the public
  interface a person actually reads.
- **`WatchDispositionLine`** — proven indirectly: its extraction from `compliance-watch-affordance.tsx`
  is proven byte-identical by the EXISTING `compliance-watch-receipt.test.tsx` cells (no new test
  needed for a pure extraction with unchanged output), and its reuse from the register panel is
  proven by AC1's own cell.

No test at the DB layer: this ticket adds no SQL and recuts nothing there (AC4), so
`get_compliance_watch_disposition`'s own behaviour is out of scope — it is already proven by
`packages/db/tests/compliance-watch-disposition.test.mjs` (ticket #659, unmodified).

## Acceptance criteria, each with its evidence

- [x] **A watch with a disposition shows it on `/settings/compliance`: acknowledged, snoozed
  until a date, or resolved with its conclusion.**
  `Ticket 996 AC1` (`compliance-register-panel.test.tsx`) — a scoped `list_review_queue` read
  returns the watch's id, `get_compliance_watch_disposition` returns an acknowledged disposition,
  and the mounted panel's text contains `Disposition` and `Acknowledged by Siti Rahman` beside the
  base register row. **PASS.** Verified non-vacuous: flipping the render gate (`act !== null` →
  `false`) turned this cell red before restoring byte-for-byte.
  The "resolved with its conclusion" arm is UNREACHABLE by construction on this specific page —
  `compliance.clients` filters `state<>'resolved'` (0016:4652), so a row this panel ever shows can
  never carry `resolved_conclusion`. `lastDispositionAct`/`WatchDispositionLine` still render it
  correctly (proven by the shared component's own existing tests), the code path is live, it is
  only never exercised by THIS panel's own data — named here rather than silently assumed.
- [x] **A watch with no disposition, or whose id the panel cannot resolve, renders its existing
  row unchanged.**
  `Ticket 996 AC2a` — the scoped queue read returns no `compliance_watch` row for the client
  (`scopedRows: {}`): the row renders with no `Disposition` text at all. **PASS.**
  `Ticket 996 AC2b` — the id resolves but the disposition carries only the evaluator's own
  `created` event (nothing a person did): no `Disposition` text AND no `Nothing has been recorded`
  filler either — the row is genuinely unchanged, not a new empty-state sentence. **PASS.**
- [x] **A caller below the bookkeeper floor sees the register plus a stated reason the
  dispositions are not shown.**
  `Ticket 996 AC3` — `get_compliance_watch_disposition` refuses CLR04 for the one resolvable
  watch: the register (`Acme Sdn Bhd`, `digital_services`) still renders in full, no per-row
  `Disposition` block, and the page carries one sentence naming `bookkeeper` access
  (`t("dispositionsFloored")`), not `ErrorMessage`'s CLR-code banner. **PASS.** Verified
  non-vacuous: flipping the banner gate to always-false turned this cell red before restoring.
- [x] **No new database function is added and the review queue's `compliance` aggregate is
  unchanged.** No migration in this ticket's commits (confirmed:
  `git diff 23cfad9..HEAD -- packages/db/migrations` shows only #872's pre-existing 0269, nothing
  of mine). `loadComplianceRegister`/`parseComplianceEnvelope`/`ComplianceRegister` in
  `lib/firm-admin/compliance.ts` are byte-untouched (confirmed by diffing the file for those three
  names — zero hits in the diff). The two doors this ticket calls
  (`list_review_queue`, `get_compliance_watch_disposition`) both already existed, unmodified.
- [x] **Existing register-panel tests pass for rows carrying no disposition.**
  `firm-admin-a11y.test.tsx` ("compliance register panel: zero a11y violations once loaded") and
  `firm-admin-pages-a11y.test.tsx` ("/admin/compliance page composition … zero a11y violations")
  both pass UNMODIFIED — their fixtures carry `rows: []`, so no watch id ever resolves and my new
  code issues exactly the same `list_review_queue`/`/rest/v1/clients` calls their existing mocks
  already answer; no new endpoint is hit. **PASS**, 13/13 combined.

**Out of scope, honoured:** no ack/snooze/resolve controls were added to this panel (it stays a
pure read); the needs-you inbox row and the client Tax tab mounts were not touched.

## Gates, with counts

- **`apps/web/lib/firm-admin/compliance.test.ts`**: **16 tests, 16 pass, 0 fail** (7 pre-existing
  + 9 new: 2 for `complianceWatchIdsFromRows`, 1 for `loadComplianceWatchIdsForClient`, 6 for
  `loadComplianceWatchDispositions`).
- **`apps/web/components/firm-admin/compliance-register-panel.test.tsx`** (new file): **4 tests,
  4 pass, 0 fail.**
- **`apps/web/components/firm/compliance-watch-affordance.test.tsx`**: **3 tests, 3 pass, 0 fail**
  — unmodified, regression proof for the `WatchDispositionLine` extraction.
- **`apps/web/components/firm/compliance-watch-receipt.test.tsx`**: **7 tests, 7 pass, 0 fail** —
  unmodified, same regression proof (byte-identical rendering after extraction).
- **`apps/web/components/firm-admin/firm-admin-a11y.test.tsx`**: **8 tests, 8 pass, 0 fail** —
  unmodified (AC5 evidence).
- **`apps/web/components/firm-admin/firm-admin-pages-a11y.test.tsx`**: **5 tests, 5 pass, 0
  fail** — unmodified (AC5 evidence).
- **`pnpm typecheck`** (repo root): clean, 0 errors.
- **`pnpm lint`** (repo root, all workspaces): clean, exit 0. (One round of fixes was needed:
  `#996` inside a `.tsx` test title under `components/**` trips the raw-colour-literal selector —
  `#994`'s own documented false positive, `3` is a valid hex run — reworded to `Ticket 996 …`; an
  unused `textOf` import and an unused `memberNames` binding left over from the extraction were
  also removed.)
- **`apps/web` — the WHOLE unit suite once** (`node scripts/run-tests.mjs`): **4770 tests, 4768
  pass, 0 fail, 2 skipped** (RIG.md's own documented Windows-only skips, pre-existing, untouched
  by this ticket).
- **`apps/web` e2e, on this lane's triple**
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3590 CLARA_E2E_NEXT_PORT=3591
  CLARA_E2E_RUNTIME_PORT=3592`):
  - `tax-boundary-walk`: **10 passed, 0 failed** — exercises `ComplianceWatchAffordance` /
    `WatchDispositionReceipt` → `WatchDispositionLine` on the client Tax tab (real browser,
    `get_compliance_watch_disposition` observed firing in the server log) and the
    `/admin/compliance` → `/settings/compliance` empty-read redirect.
  - `shell-migration-walk`: **31 passed, 0 failed** — the D5 legacy-route matrix includes
    `/admin/compliance → /settings/compliance`.
  - No browser walk exercises the register panel with an ACTUAL open watch end to end (only the
    empty case is fixture-covered anywhere in `e2e/`) — see Follow-ups.
- `packages/db` and `packages/runtime` gates do not apply: neither was touched (no migration, no
  SQL function, no runtime file).

## Docs updated

- `apps/web/components/firm-admin/compliance-register-panel.tsx` — header comment extended with
  the `#996` disposition-read design note (why a second, independent `useAsyncRead`; why the
  explicit `reload()` on `register`'s arrival; why the floor is one banner, not a per-row one).
- `apps/web/lib/firm-admin/compliance.ts` — header note for the three new exports
  (`complianceWatchIdsFromRows`, `loadComplianceWatchIdsForClient`, `loadComplianceWatchDispositions`)
  and each function's own doc comment.
- `apps/web/components/firm/compliance-watch-affordance.tsx` — doc comment on the new exported
  `WatchDispositionLine` explaining the extraction and why it is reused rather than copied.
- `apps/web/messages/en.json` — new key `FirmAdminCompliance.compliance.dispositionsFloored`.
- No `CONTEXT.md` change: no new vocabulary — "Watch disposition" is already a defined term, this
  ticket only adds a third reader of the same data.
- No `docs/ARCHITECTURE.md` change: the brief names no ARCHITECTURE-level pointer, unlike #872's.

## Successor contract

None. No frozen chat or Work-tool surface is implicated — `list_review_queue` and
`get_compliance_watch_disposition` are plain PostgREST-reachable reads.

## Follow-ups worth filing

- No e2e fixture anywhere in `apps/web/e2e/` seeds `/settings/compliance` with an ACTUAL open
  compliance watch (every walk that touches that route uses the empty-register case). The new
  behaviour is fully proven at the component-test level (mocked fetch, real render, real a11y
  scan available if wanted) but never through a real browser + the `serve-built.mjs` mock end to
  end. Worth a small fixture addition to `tax-boundary-mock.mjs` or a new register-specific mock
  if the owner wants that seam covered at the browser layer too.
- `loadComplianceWatchDispositions` issues one `list_review_queue` call per DISTINCT client with
  an open watch, then one `get_compliance_watch_disposition` call per watch — sequential, not
  parallelised. At today's expected scale (compliance watches are rare; typically 0-2 per firm)
  this is invisible, but if a firm ever carries dozens of open watches this would visibly serialise.
  Not fixed here (no such fixture/reproduction exists to test against, and speculative
  optimisation is out of this ticket's brief).

## Unverified

- Whether the owner wants the register's disposition line to ALSO appear when
  `future_method_status`/other columns are being viewed at 320px — the 320px/no-horizontal-scroll
  contract was not specifically re-walked with a populated disposition line present (no such e2e
  fixture exists, per the follow-up above); the added markup reuses the SAME `flex flex-col`
  block already proven at 320px on the needs-you inbox and the client Tax tab, so no new risk is
  expected, but this is a reasoned expectation, not a measured one.
- Whether a hosted/live Supabase project's `list_review_queue`/`get_compliance_watch_disposition`
  match what this ticket read on `clara_l10` — this lane's rig is a bare local Postgres cluster,
  not the hosted stack.
