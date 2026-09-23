# Wave 3, Lane 03, Ticket #1001 — render the cash composition on the client home

Branch `riders/w3-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. `git log <base>..HEAD` at start showed one commit
already landed by #958 (`c8da2a830`); this ticket is the second on the branch.

Commit: `529608478` — `feat(web): #1001 render the client home's cash composition, headlined by
the closing balance`.

## Status: done

The ticket was **still live** on this branch. `gh issue view 1001 --comments` shows one comment,
the owner's ruling of 2026-09-20, carrying the newest (and only) Agent Brief: build the cash-side
composition now, mirroring the profit side, headlined by the CLOSING balance rather than the
period's movement (a cash table built on movement "would not add up to the figure above it"). I
verified this was not already satisfied on the branch before building: `cash.composition` had no
consumer anywhere in `apps/web` (`grep -rn "cash.composition" apps/web` matched only the type
definition and its parser in `lib/dashboard/financial-pack.ts`), and `client-cash-trend.tsx` (the
cash arm's own chart file) rendered only the six-point trend, no composition table.

## The seams (written down before testing, per work order rule 4)

The brief names these public interfaces:
1. **The client home's money band, rendered DOM** — driven through `ClientFinancialSummary`
   (`components/firm/client-home/client-financial-summary.tsx`), the same seam
   `client-financial-charts.test.tsx` already drives for the profit arm's composition table.
2. **The existing journal-entry address** — `entryHref(clientId, entryId)`, already exported by
   `client-income-expense-chart.tsx`; reused, not re-spelled.
3. **A closed lookup from `member_reason` to a message key** — the pattern `coverageReasonKey`
   (`lib/dashboard/financial-display.ts`) already establishes for coverage reasons.

No door and no database function is in scope (brief's own "Out of scope": no change to what the
pack computes or returns). So every test drives the rendered band through `ClientFinancialSummary`
with a hand-built or door-shaped `ClientFinancialPack`, exactly as the existing profit-composition
cells in `client-financial-charts.test.tsx` do — never a new component-level test harness.

## Acceptance criteria, each with its evidence

- [x] **The cash arm renders the pack's cash composition as a per-account table, each entry
  linking to the existing posted journal view.**
  Evidence: `client-cash-trend.tsx`'s new composition block (added under the existing six-point
  trend table); test `ticket 1001 — the cash arm renders its composition, headlined by the CLOSING
  balance — never the period's movement` (`client-financial-charts.test.tsx`) asserts the row's
  memo text reaches the screen and that
  `hrefs(h)` includes ``/clients/${CLIENT}/journals?tab=posted&entry=${ENTRY}`` — the exact address
  `journals/page.tsx` already reads. Result: **pass**.

- [x] **Each row's headline amount is the account's closing balance at the as-of, and a test
  asserts the table never presents period movement as that balance.**
  Evidence: the same test builds a row with three DISTINCT figures — opening 170,000.00, movement
  12,340.55, closing 182,340.55 — so a swap cannot hide behind two fields sharing a value. It reads
  the row's balance cell by its own `data-testid="client-cash-drilldown-balance"` (not by
  body-wide string match, since RM 182,340.55 also happens to be this fixture's book-cash headline
  above it) and asserts its text equals `"RM 182,340.55"` and explicitly `assert.notEqual`s it
  against `"RM 12,340.55"` (the movement figure). Result: **pass**. Grounded in the door: I read
  migration 0232's own SQL (`packages/db/migrations/0232_client_financial_pack.sql:1178-1213`) and
  confirmed `q.closing` sums every approved line up to and including the as-of with NO lower
  bound — the cumulative basis book cash itself is computed on — while `q.movement` is bounded to
  `[v_start, v_as_of]`, the selected period; this is why `closingCents`, already present on
  `CompositionRow` (`lib/dashboard/financial-pack.ts:112`), is the correct headline with no parser
  change.

- [x] **Each row says why the account is cash, from the read's member reason, through a closed
  lookup rather than a raw token.**
  Evidence: new `memberReasonKey` in `lib/dashboard/financial-display.ts` (mirrors
  `coverageReasonKey`'s discipline), mapping the three values 0232's own check constraint allows
  (`bank_registry` / `declared_cash` / `declared_petty_cash`,
  `packages/db/migrations/0232_client_financial_pack.sql:365`) to message keys, with an
  unrecognised or missing token falling back to a generic sentence rather than being printed raw.
  Test `ticket 1001 — each cash row says WHY it is cash, through a closed lookup — never the raw
  member_reason token` builds two rows (`bank_registry`, `declared_petty_cash`) and asserts both
  human sentences ("Registered bank account", "Declared petty cash") appear AND that neither raw
  token string reaches the rendered text. Result: **pass**.

- [x] **Both the account-level and entry-level truncation disclosures appear when they apply.**
  Evidence: test `ticket 1001 — both truncation disclosures appear on the cash arm when they
  apply` sets `entriesTruncated: true` with `entriesTotal: 41` and `compositionTruncated: true`
  with `compositionTotal: 63`, and asserts both `"Showing 1 of 41 entries"` and `"Showing 1 of 63
  accounts"` render, reusing the exact wording pattern (`cashDrilldown.truncated` /
  `cashDrilldown.accountsTruncated`) the profit table's own `drilldown.*` keys already use.
  Result: **pass**.

- [x] **With no published cash account set, the cash arm keeps its existing empty state and
  renders no composition table.**
  Evidence: test `ticket 1001 — with NO published cash account set, the cash arm keeps its empty
  state and renders NO composition table` mounts with `cash.status: "unknown"`,
  `coverageReason: "cash_set_unpublished"`, `composition: []`, `cashPoints: []`, `cashSet: null` and
  asserts the existing "Nobody has said which accounts count as cash" banner still renders AND that
  no node carries `data-testid="client-cash-drilldown-balance"`. Result: **pass**, and it passed
  even BEFORE I wrote the composition-rendering code — I deliberately ran it first (immediately
  after the other three new tests, before any implementation) and confirmed it was already true:
  0232 returns `composition: []` on the exact same `v_set_id is null` branch that leaves
  `points: []` (`packages/db/migrations/0232_client_financial_pack.sql:891,910,1047-1065`), so
  `ClientCashTrend`'s existing `if (points.length === 0) return null` guard already withdraws
  everything under it, including the new composition block, with no special case written for this
  state. Documented in the source (`client-cash-trend.tsx`'s file header) so a future reader does
  not "fix" what looks like a missing branch.

- [x] **No change to what the pack computes, returns or refuses, and the existing client-home
  money-band tests pass unchanged.**
  Evidence: no file under `packages/db` is touched by this commit (`git diff <base>..HEAD --stat`
  for this ticket's own commit lists only seven `apps/web` files — see Gates). All eleven
  pre-existing tests in `client-financial-charts.test.tsx` and all four in
  `client-home-money-keyboard.test.tsx` pass unchanged in the same run as the new cells (I did add
  a cash-composition fixture row and one extra assertion to the keyboard file's existing "period
  control and the drilldown are both reachable" test — additive only; every prior assertion in that
  test still runs and passes). The whole `apps/web` unit suite (4855/4857, 0 fail — see Gates)
  confirms no other consumer of the pack regressed.

## Migration

**None**, as pre-assigned. No schema or function change was needed or written; this is rendering
only, over fields `clara.get_client_financial_pack` (migration 0232) already returns. No prestate
pins to record.

## Docs

- `apps/web/README.md` — new paragraph in the existing `## #660 — the client home's money band`
  section (added just before its `### Recharts` subsection), stating the ruling, the
  closing-vs-movement headline rule and why it differs from the profit table, the new
  `memberReasonKey` lookup, and why no new "unpublished cash set" branch was written.
- `CONTEXT.md` — **not touched.** I checked first (`grep -in composition CONTEXT.md` — no hits):
  the term "composition" was never added to the glossary even when #660 shipped `profit.composition`
  and its consumer, so there is no existing entry this ticket would be extending, and I am not
  introducing a genuinely new domain concept (the field, its shape and its consumption pattern all
  pre-date this ticket). Filing #660's own glossary gap is out of scope for #1001; noted below as a
  follow-up rather than fixed here, to avoid widening this ticket.
- `apps/web/test/manifest.txt` — **not touched.** No new test file was added; both cells live in
  test files already listed (`client-financial-charts.test.tsx`,
  `client-home-money-keyboard.test.tsx`).

## Gates, with counts

- **Test files touched, standalone**
  (`node --import ./test/bootstrap.mjs --import tsx --test <file>` from `apps/web`):
  - `components/firm/client-home/client-financial-charts.test.tsx` → **15 tests, 15 pass, 0 fail**
    (11 pre-existing + 4 new).
  - `components/firm/client-home/client-home-money-keyboard.test.tsx` → **4 tests, 4 pass, 0 fail**
    (all pre-existing, one gains an added assertion; no new test function).
  - `components/firm/client-home/client-cash-summary.test.tsx` (unmodified, re-run for the
    call-site prop change to `ClientCashTrend`) → **6 tests, 6 pass, 0 fail**.
- **`pnpm typecheck`** from the worktree root → clean (`apps/web typecheck: Done`,
  `packages/runtime typecheck: Done`).
- **`pnpm lint`** from the worktree root → exit 0. Caught and fixed one real issue along the way:
  my first draft used `#1001` inside four `test(...)` name string literals, which trips the
  Q4 raw-colour-value selector (`#` + 4 hex-looking characters); reworded to `"ticket 1001 — …"`,
  matching the existing house convention (`grep -rn "ticket [0-9]\{3,4\}" apps/web` shows the same
  fix applied for tickets 647/656/658/660/671/771 already). Comments (not string literals) still
  say `#1001`, which the selector does not scan.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** from the worktree root (wave-3 addendum) → exit 0,
  clean across `apps/web`, `packages/runtime`, `packages/db`, `packages/reporting-render`. Includes
  `check-message-keys` (every new `t()` key — the `cashDrilldown.*` block — resolves in
  `messages/en.json`) and `check-test-manifest` (unaffected — no new test file).
- **Whole `apps/web` unit suite once** (`node scripts/run-tests.mjs` from `apps/web`) →
  **4857 tests, 4855 pass, 0 fail, 2 skipped** (both pre-existing, environment-gated:
  `CLARA_LIVE_SUPABASE_AUTH_URL`/`…_ANON_KEY` not configured, unrelated to this ticket — not one of
  RIG.md's four named Windows-only reds).
- **Browser walk touched**: `home-board-walk.spec.ts` (the only e2e spec touching the money
  band/cash card), on this lane's own Playwright triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3520 CLARA_E2E_NEXT_PORT=3521
  CLARA_E2E_RUNTIME_PORT=3522`):
  `pnpm --filter @clara/web e2e home-board-walk` → **28 passed, 0 failed** (includes
  `p660.money.disclosures`). The mock's own default cash envelope
  (`apps/web/e2e/home-board-mock.mjs:242-247`) is an unpublished cash set
  (`composition: []`, `points: []`), so this walk exercises the empty-state path, not the new
  table's rendering — consistent with "no wire change" and confirming no visual regression on the
  walk's own asserted surfaces.
- **No `packages/db/tests` gate chain** — no SQL/db file touched, no migration written, no SQL
  function added.
- **No `packages/runtime` gate chain** — no runtime file touched.

## Successor contract

None. This ticket adds no door, no runtime part and no prompt stanza a frozen chat or Work tool
would need; it is a rendering-only consumer of an already-shipped read.

## Follow-ups worth filing

- `CONTEXT.md` has no "composition" glossary entry for either arm (`profit.composition` from #660
  or `cash.composition` from this ticket) — a pre-existing gap from #660, not introduced here.
  Worth a small glossary pass if a future reader needs the vocabulary defined outside the code
  comments.
- The cash composition table's column set (account, closing balance, movement, reason, entries) has
  one more column than the profit table's (account, movement, entries). If a future design pass
  wants the two tables visually unified, that is a product call for the owner, not something this
  rendering-only ticket should have pre-decided.

## Anything unverified

- No hosted/production verification — out of scope for a lane ticket in this wave (the rig
  prescribes lane-worktree-and-database verification only; hosted release is the integrator's own
  step).
- I did not check `packages/reporting-render` (the PDF export path) for a second consumer of
  `cash.composition`; the brief scopes this to "the client home" only, and a repo-wide
  `grep -rn "cash.composition\|composition_total" packages/reporting-render` (run during
  investigation) returned no hits, so there is no existing PDF consumer this change could affect.
