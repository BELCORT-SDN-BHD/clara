# Wave 2, lane 07, ticket #995 — "Firm Home renders two summaries of the same client population"

Branch `riders/w2-lane07`, base `23cfad947b5598214168ba9c43d391b4e16aa745`. Two commits (this
ticket lands after #974's `c7b434584`/`d50857c08`, already on the branch before I started):

- `a980f8c4f` — `web(firm): #995 retire Firm Home's status tally, keep the header's client count`
- `cbbc594c2` — `test(web): #995 fix round — reword ticket references so the raw-colour lint selector doesn't trip`

Status: **done**.

## The seams

Per the Agent Brief and the owner's 2026-09-20 ruling (Option A), the seams under test are all at
`FirmHomeBoard`'s own rendered output (`apps/web/components/firm/firm-home/firm-home-board.tsx`),
mounted through `renderComponent` exactly as the file's existing tests do — never an internal
collaborator:

1. The rendered text for a bookkeeper-or-higher caller: the portfolio table (#659,
   `FirmPortfolioSection`) must be the ONE client-population summary, with no adjacent tally.
2. The rendered text for a caller BELOW the bookkeeper floor (the portfolio door denied): the
   header's own `roleAndClients` sentence, which is the ticket's own named fallback — no new door.
3. The rendered text for a client whose `status` is outside `active`/`onboarding`/`archived`: the
   count a caller sees must still include it.
4. `clientStatusTally`'s own unit seam (`lib/firm/home-facts.test.ts`) — untouched, must stay green.

No test was written at any other seam (the brief names none), and no internal function of
`FirmPortfolioSection` or `use-firm-portfolio.ts` was touched or tested — both stay exactly as
they were, per the brief's "two separate doors, neither widened."

## Acceptance criteria

1. **Firm Home renders exactly one client-population summary for a bookkeeper or higher: the
   portfolio table, with no adjacent tally duplicating it.** — Evidence: the whole `firm-home-clients`
   section (heading, the register-scoped `/clients` link, the `clientsLine` active/onboarding/archived
   sentence, and the conditional `clientsOther` line) is removed from `firm-home-board.tsx`. Test
   "Firm Home (ticket 995): the portfolio table is the ONE client-population summary — the older
   active/onboarding/archived tally is gone" — **RED first** (failed for the right reason: the tally
   sentence `"1 active · 1 onboarding · 0 archived"` was present in the rendered text before the
   removal — captured verbatim in the failure's `actual` dump), **GREEN after** the removal. The
   portfolio's own heading ("Client portfolio") is asserted present in the same test, so the summary
   that stays is proven, not merely the absence of the one that goes.
2. **A caller below the bookkeeper floor still sees a client count on Firm Home, sourced from the
   register read the removed tally used.** — Evidence: test "Firm Home (ticket 995): a caller below
   the bookkeeper floor still sees a client count, from the header sentence the register read already
   feeds" — mounts with a `role: "viewer", role_rank: 0` caller and a `403 {message:"forbidden"}` from
   `/rpc/get_firm_portfolio_pack` (the real shape `use-firm-portfolio.ts`'s `isPermissionShaped` reads
   via `kindForStatus(403) === "forbidden"`, `lib/wire-error-kind.ts`). Assertions: `Viewer · 2 clients`
   renders (the header's `roleAndClients` sentence, fed by the SAME `/rest/v1/clients` mock the removed
   tally used), and `Work records need a bookkeeper role.` renders (the portfolio's own pre-existing
   denied face, `firm-portfolio-section.tsx`) in place of any breakdown. This test was **also RED
   first** against the un-removed code (the retired tally sentence was present for a viewer too, since
   it was never role-gated), confirming this is a genuine regression cell and not vacuous. No
   production code beyond the removal in AC1 was needed for this criterion: the header sentence was
   already unconditioned on role — the brief's own "the fallback can be that sentence kept fed" is
   exactly what this test proves rather than assumes.
3. **A client whose status is outside active, onboarding and archived is still included in the count
   a caller sees.** — Evidence: test "Firm Home (ticket 995): a client status outside
   active/onboarding/archived is still counted in what a caller sees" — a third client with
   `status: "suspended"` renders `Owner · 3 clients`. This test was GREEN on first write (no production
   code change was needed — `clientStatusTally`'s `total: rows.length` already counts every row
   regardless of status, and the header renders that total unconditionally). Per the work order's
   vacuity-control rule for a cell that needs no code: I temporarily broke `home-facts.ts`'s
   `clientStatusTally` (dropped the "other" bucket from `total`), re-ran, watched this exact test fail
   red (`The input did not match /Owner · 3 clients/... actual: "...Owner · 2 clients..."`), then
   restored the file — `git diff` on `lib/firm/home-facts.ts` against the prior commit is empty,
   confirming a byte-for-byte restore.
4. **`clientStatusTally`'s own unit coverage of `total` and the `other` bucket stays green.** —
   `lib/firm/home-facts.test.ts`: 12/12 pass, file untouched (`git diff d50857c08 HEAD` lists no change
   to this file).
5. **No Firm Home test is left asserting that the removed tally renders.** — Repo-wide grep for
   `clientsLine|clientsOther|ClientsRegister|firm-home-clients` inside `apps/web/components/firm` and
   `apps/web/lib/firm` test files returns nothing. One pre-existing test needed a fix-up, not because
   it asserted the tally renders, but because it asserted the tally's OWN error face
   (`"Something went wrong"`, from that section's `DataState` wrapper) on a register-read failure —
   "Firm Home: ONE failed read does not blank the others…". That surface is gone with the section, so
   the assertion now describes the header's own pre-existing fallback instead: `roleAndClients` degrades
   to `roleOnly` (role alone, no count) whenever `register.error` is set — asserted as
   `BELCORT SDN BHDOwner` present and `Owner · \d+ clients` absent.

## Out of scope — confirmed untouched

`git diff d50857c08 HEAD` touches exactly three files: `firm-home-board.tsx`,
`firm-home-board.test.tsx`, `messages/en.json`. No change to `/clients` (no route file under
`app/(firm)/clients` touched), no change to the portfolio table's Work-count columns or links
(`firm-portfolio-section.tsx` untouched), no change to the client-status vocabulary (`ClientRow`'s
`status` type in `lib/firm/reads.ts` untouched). No migration — the ticket needed none, confirmed:
zero files under `packages/db` touched.

## Migration

None. This ticket is a pure client-side render change; no schema or function change was needed, as
the Agent Brief predicted ("No new door is needed").

## Docs

No module README exists for `components/firm/firm-home/` or `lib/firm/` (this codebase's own
convention here is the file-header comment, not a separate README — `firm-home-board.tsx`,
`firm-portfolio-section.tsx` and `home-facts.ts` all carry theirs inline, and I extended
`firm-home-board.tsx`'s with a `#995` note explaining the retirement and why the header sentence is
the kept fallback, at the exact spot the section used to be). `CONTEXT.md`'s existing "Firm portfolio
pack" entry does not mention the retired tally and needed no correction — it already only describes
the read that stays. No new domain vocabulary was introduced.

I also removed the three now-orphaned `FirmHome.clientsEmpty` / `clientsLine` / `clientsOther` keys
from `messages/en.json` (confirmed unused elsewhere: `AppShell.scope.clientsEmpty` is a different,
unrelated key in a different namespace, used by `scope-switcher.tsx`, and was left untouched).

## Gates, with counts

**Test files touched, run directly:**

- `apps/web/components/firm/firm-home/firm-home-board.test.tsx`: **13/13 pass** (10 pre-existing +
  3 new). One pre-existing cell's assertions were updated (AC5, above); all others byte-identical.
- `apps/web/lib/firm/home-facts.ts`: **0 lines changed** (vacuity-control break-then-restore only;
  `git diff` confirms empty).
- `apps/web/lib/firm/home-facts.test.ts`: **12/12 pass**, unchanged.
- Related-but-untouched Firm Home files re-run as a sanity check: `firm-home-states.test.tsx` +
  `firm-portfolio.test.tsx` alongside the two above: **52/52 pass** combined.

No SQL functions were added (no migration), so `operation-census.test.mjs` and
`rig-isolation.test.mjs` do not apply to this ticket.

**apps/web whole-repo gates:**

- `pnpm typecheck`: **one pre-existing, unrelated error** —
  `components/documents/document-kind-dialog.tsx(95,22): Cannot find name 'DOCUMENT_KINDS'` (+ one
  cascading `TS7006` on the same line). Verified present byte-for-byte at the lane's own base commit,
  before #974 or this ticket touched anything: `git show
  23cfad947b5598214168ba9c43d391b4e16aa745:apps/web/components/documents/document-kind-dialog.tsx`
  already imports only `CLASSIFIABLE_DOCUMENT_KINDS` and references the undefined `DOCUMENT_KINDS` at
  line 95. Scoped `npx tsc --noEmit` with that one file's errors filtered out: **zero other errors** —
  this ticket introduces none. Not fixed: out of scope for #995 (Firm Home).
- `pnpm lint`: **clean, exit 0** (includes `check-message-keys.mjs`, confirming the three removed
  message keys left no dangling `t(...)` call, and `check-test-manifest.mjs`, confirming the touched
  test file's manifest entry is unaffected). One fix round was needed first: the three new test names
  plus one assertion message used a bare `#995`, which the raw-colour selector (owner ruling Q4,
  `#994`'s own documented carve-out) cannot distinguish from a hex-shaped token; reworded to
  "ticket 995" to match the file's own existing `#659` → "ticket 659" convention. `cbbc594c2`.
- Whole unit suite (`node scripts/run-tests.mjs`, once): **4730 pass / 21 fail / 2 skipped** of 4753.
  All 21 failures are pre-existing and unrelated to Firm Home:
  - 20 trace to the SAME pre-existing `DOCUMENT_KINDS is not defined` defect above, cascading through
    every test that renders `DocumentKindDialog` as a descendant: `document-kind-dialog.test.tsx`,
    `documents-url-state.test.tsx`, and the `904`/`CRS-07` document-processing-polling suite (file
    locations captured in the raw log). None imports or renders anything from `components/firm/` or
    `lib/firm/`.
  - 1 (`p635.web.accept_stale_rereads…`, `components/firm-admin/accept-legal-dialog.test.tsx`) is a
    whole-suite-only ordering flake, not a real defect: re-run alone, that file is **6/6 pass**
    (confirmed by direct re-run). Unrelated component (Terms-of-Service acceptance dialog), no shared
    module with Firm Home.
  - The 2 skips are the known live-Supabase-auth env skips, unrelated.
  - The known `thread-live-clarify.test.tsx` whole-suite load flake (RIG.md) did not appear this run.
- No Playwright walk owed: this ticket touches no `*.spec.ts`/`*-mock.mjs` file and no `apps/web/e2e`
  file references the removed strings (`clientsLine`/`clientsOther`/"active · … onboarding" not found
  under `apps/web/e2e`).

## Successor contract

None owed. This ticket touches no frozen workflow body and no closure module — it is a client
render change over data the board already fetches through ordinary reads, with no `chatTurn`/`Work`
tool surface anywhere near it.

## Follow-ups worth filing

- Removing the tally section also removed the ONE place a Firm Home register-read failure got an
  explicit "Something went wrong" message; a failed register read now degrades silently to the
  header's role-only fallback (no count, no error text). This was a considered trade-off, not an
  oversight — the brief frames the choice as portfolio-table-vs-tally and says nothing about a
  dedicated register-error surface, and the header's `roleOnly` degrade is pre-existing, unrelated
  to this ticket. Worth a separate ticket if the owner wants an explicit register-error affordance
  on Firm Home.
- The pre-existing `DOCUMENT_KINDS is not defined` break in `document-kind-dialog.tsx` (already
  flagged in #974's own report as a follow-up) still fails 20 tests in the whole-suite run at this
  commit; unrelated to Firm Home, worth its own ticket given the blast radius.

## Unverified

- I did not check out the base commit and run the whole unit suite there to get an exact pre-ticket
  baseline count; I relied on `git diff`/`git show` scoping (no file this ticket touched is on the
  failing list, and the two root causes were independently verified: one via `git show` at the base
  commit, the other via an isolated re-run) rather than a second full 189-second suite run.
- I did not exercise this change in a live browser (no Playwright walk was owed, per the gates
  above, since no e2e spec references the retired strings) — only through the Node test-runner
  render harness (`renderComponent`), consistent with every other Firm Home test in this file.
