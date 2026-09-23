# Wave 2, lane 07, ticket #1009 — "Tell the owner on Firm Home when the firm's agreements need accepting"

Branch `riders/w2-lane07`, base `23cfad947b5598214168ba9c43d391b4e16aa745`. Four commits (this
ticket lands after #974's `c7b434584`/`d50857c08` and #995's `d50857c08`/`a980f8c4f`/`cbbc594c2`,
already on the branch before I started):

- `756cdc484` — `web(firm): #1009 Firm Home names an outstanding agreement and links the owner to accept it`
- `ca4576b3c` — `web(firm): #1009 the non-owner, failed-read and mode-copy faces of the legal prompt`
- `53edba470` — `web(firm): #1009 mount the legal-standing prompt on Firm Home, beside Finish firm setup`
- `37e33380a` — `web(firm),test(e2e): #1009 browser walk for the owner path, and a props-typing fix`

Status: **done**.

## The ticket, verified live

`gh issue view 1009` (no comments; body only) matches the Agent Brief the prompt quotes verbatim —
no newer Agent Brief and no owner-ruling comment dated 2026-09-20 exists on the issue itself. I
checked it is still unbuilt on this branch: `grep -rn "get_firm_legal_standing" apps/web/components/firm`
before my first commit found only `legal-standing-card.tsx` (the `/settings/firm` card #635/#1008
shipped) — nothing on Firm Home. The door itself, `clara.get_firm_legal_standing` (arity 0, viewer
floor), its web decoder (`FirmLegalStanding`, `LEGAL_ENFORCEMENT_MODES`,
`decodeLegalEnforcementMode`) and `enforcementMode` all already exist from #1008
(`apps/web/lib/firm/commercial-reads.ts`) — this ticket adds no new door and no new decoder, exactly
as the brief's "Key interfaces" section says.

## The seams

Per the Agent Brief, the seams under test are:

1. **The rendered component**, `FirmLegalStandingTile` (new file,
   `apps/web/components/firm/firm-home/firm-legal-standing-tile.tsx`), driven through an injected
   `loader` — the same shape `FirmSettingsPanelView`'s own `loaders` prop already uses
   (`firm-admin/firm-settings-panel.tsx`) — so each unit cell puts the tile in exactly one state
   without touching global `fetch`. This is the seam the brief's four states and its
   "Every string is a message key" clause are tested against.
2. **`FirmHomeBoard`'s own rendered output**, mounted through `renderComponent` exactly as the
   file's existing tests do, to prove the tile is actually wired into the page beside "Finish firm
   setup" and does not disturb any existing section.
3. **The real browser**, one walk in `apps/web/e2e/home-board-walk.spec.ts`, for the owner path the
   brief calls out by name ("A browser walk with a mocked standing read covers the owner path").

No test was written at any other seam — not `clara.get_firm_legal_standing` itself (unchanged,
already proven at #1008/#635) and not `legal-standing-card.tsx` (unchanged, only reused by
citation for its `legalKindTerms`/`legalKindDpa`/`legalVersion` message keys).

## Acceptance criteria

1. **With one agreement unaccepted, an owner's Firm Home shows the prompt naming that agreement
   and version, and its link lands on the accept control.** — Evidence: unit test
   `p1009.web.legal_owner_prompt` (component seam) and `p1009.home.legal_prompt` (browser walk) —
   **RED first** in both cases (the component test failed with `tile(h)` returning `null` before
   any owner branch existed; the walk test was written and run only after the component and board
   wiring were green, per the vertical-slice order below, so its own red/green history lives in the
   component cells instead — see "Vertical slices" below). GREEN after: the card names
   `Terms of Service … version 3` (unit) / `version 2` (walk), and an `<a href="/settings/firm">`
   is present in both. Two more unit cells
   (`p1009.web.legal_two_outstanding`, `p1009.web.legal_one_accepted_one_not`) prove EACH
   outstanding kind is named independently and an already-accepted kind is left off the list —
   not required by the letter of AC1 but directly implied by "names each agreement", and cheap
   to add once the filter existed.
2. **With every agreement accepted, the prompt is absent.** — Evidence:
   `p1009.web.legal_absent_when_live` (the FIRST slice written — the tile renders `null` while
   `standingLive: true`) and `Firm Home (ticket 1009): a current legal standing keeps the prompt off
   the board` (board seam, using the lane's own default fixture, which is a live standing —
   `assert.doesNotMatch(h.text(), /Legal standing/)`). Every OTHER cell in
   `home-board-walk.spec.ts` (27 of them) also runs against `serve-built.mjs`'s own
   `standing_live: true` CORE default and never sees the tile — the negative half of this AC is
   exercised at scale, not only by the one dedicated cell.
3. **A viewer sees who can accept and no accept control.** — Evidence:
   `p1009.web.legal_member_prompt` — with `canAcceptForFirm: false`, the text matches
   `/An owner of this firm needs to accept/` and `h.find((n) => n.tagName === "A")` is `null`: no
   accept control and no dead link, by construction (the component never renders the `<Link>` in
   this branch — see the file's own "NO ACCEPT CONTROL AND NO DEAD LINK" comment). RED first: the
   assertion failed against the always-link version the owner slice had just produced.
4. **A failed standing read renders the "could not be read" state, never an absent prompt and
   never "current".** — Evidence: `p1009.web.legal_read_failed` — a rejecting loader renders
   `/could not be read/i` and asserts `doesNotMatch(/accepts the current versions|not all
   accepted/i)` (never painted as either enforcement-mode "current" sentence). RED first (the
   component returned `null` on any error before this slice, which is the "absent" failure mode
   this AC explicitly forbids).
5. **No new Needs-you kind is added. The census cells that pin that vocabulary pass unchanged.** —
   `lib/firm/needs-you.ts` was not opened, imported or edited by any commit (confirmed:
   `git diff 23cfad9..HEAD -- apps/web/lib/firm/needs-you.ts` is empty). Its own census/unit cells
   (`lib/firm/needs-you.test.ts`, `needs-you-gaps.test.ts`, `needs-you-links.test.ts`,
   `components/firm/needs-you-*.test.ts(x)`) all ran clean as part of the whole-suite run below —
   none is in the failing list.
6. **Unit tests cover the four states. A browser walk with a mocked standing read covers the owner
   path. Every string is a message key.** — Four states: covered above (AC1–AC4), plus the
   enforcement-mode split (`p1009.web.legal_mode_copy`, since "the copy follows the platform's
   legal enforcement mode" is its own bullet in "Desired behavior", not folded into the four
   states). Browser walk: `p1009.home.legal_prompt`, owner path only, per the brief's own wording
   (non-owner and failed-read faces are unit-covered, matching how #1008's own
   `firm-commercial-walk.spec.ts` leaves admin-rank untested in the browser and cites the unit/db
   coverage instead). Message keys: every visible string in `firm-legal-standing-tile.tsx` is a
   `t("legalPrompt.…")` or a reused `tLegal("legalKindTerms"/"legalKindDpa")` call — zero literal
   strings — and `pnpm lint`'s `check-message-keys` gate (4310 keys, up from #995's count) confirms
   every one resolves in `en.json`.

## Vertical slices (TDD, in commit order)

1. `p1009.web.legal_absent_when_live` — RED (module did not exist) → minimal component
   (`return null` unconditionally) → GREEN. `756cdc484` (folded in with slice 2).
2. `p1009.web.legal_owner_prompt` — RED (`tile(h)` was `null`) → the real read (`useAsyncRead`),
   the not-live/outstanding-documents branch, and the accept link → GREEN. `756cdc484`.
3. `p1009.web.legal_member_prompt` — RED (a link was always rendered) → the `canAcceptForFirm`
   branch → GREEN. `ca4576b3c`.
4. `p1009.web.legal_read_failed` — RED (an error fell through to the `null`/live branches) → the
   dedicated error face → GREEN. `ca4576b3c`.
5. `p1009.web.legal_mode_copy`, `…_two_outstanding`, `…_one_accepted_one_not` — confirming cells
   for behaviour the earlier slices already implied; all GREEN on first run (no code change), kept
   as named regression cells rather than discarded. `ca4576b3c`.
6. Board integration: `<FirmLegalStandingTile />` mounted in `firm-home-board.tsx` — this turned
   the WHOLE `firm-home-board.test.tsx` file RED-by-construction the moment it was wired in (every
   cell's `wire()` fixture had no answer for `/rpc/get_firm_legal_standing`, so `useAsyncRead`
   caught an "unexpected fetch" rejection and the tile rendered its own failure banner on top of
   every existing test's board) — though because no PRE-EXISTING assertion happened to forbid that
   banner's text, the suite stayed numerically green while asserting a dishonest fixture (a
   fabricated read failure on every other cell's Firm Home). Fixed by giving `wire()` an honest
   default (`standing_live: true`, mirroring `serve-built.mjs`'s own CORE default for this door)
   plus two new dedicated cells. `53edba470`.
7. Browser walk `p1009.home.legal_prompt` — GREEN on first run (the component and board wiring
   were already proven; this cell exercises the real Next build + router + axe). `37e33380a`.

## Docs

No module README exists for `components/firm/firm-home/` (this codebase's convention here is the
file-header comment — confirmed by #995's own report, which found the same). I extended
`firm-legal-standing-tile.tsx`'s own header with the ruling it implements, why it is not a
Needs-you row, and the four-face rationale; `firm-home-board.tsx` gained one comment at the mount
point explaining the ordering (legal standing ahead of "Finish firm setup").

`CONTEXT.md` needed no change: **no new vocabulary**. "Firm legal standing" and "Legal enforcement
mode" are both already defined (lines 421–439, landed with #635/#1008) and describe exactly the
fact this surface displays — this ticket is a new SURFACE for an existing concept, not a new
concept.

## Migration

**None**, as the brief and the prompt both predicted ("No new door is needed"). Confirmed: zero
files under `packages/db` touched by any of my four commits
(`git diff 23cfad9..HEAD -- packages/db` shows only #974's earlier, already-landed migration).

## Successor contract

**None owed.** This ticket touches no frozen workflow body and no closure module — `Work`/
`chatTurn` never reach Firm Home's own reads. `node scripts/check-frozen-workflows.mjs` was not
run because no file under `packages/runtime` was touched (confirmed by the same diff above).

## Gates, with counts

**Test files touched, run directly:**

- `apps/web/components/firm/firm-home/firm-legal-standing-tile.tsx` — new component,
  `apps/web/components/firm/firm-home/firm-legal-standing-tile.test.tsx` — new test file,
  **7/7 pass**.
- `apps/web/components/firm/firm-home/firm-home-board.tsx` (mount) +
  `firm-home-board.test.tsx` (fixture + 2 new cells) — **15/15 pass** (13 pre-existing + 2 new; one
  pre-existing cell's fixture gained an honest default, no assertion text changed).
- Related-but-untouched Firm Home files re-run together as a sanity check
  (`firm-legal-standing-tile.test.tsx` + `firm-home-board.test.tsx` + `firm-home-states.test.tsx` +
  `firm-portfolio.test.tsx`): **49/49 pass** combined.

No SQL functions were added (no migration), so `operation-census.test.mjs` and
`rig-isolation.test.mjs` do not apply to this ticket (work order rule 8's own conditional).

**Browser walk touched:**

- `apps/web/e2e/home-board-walk.spec.ts` — the ONE new cell alone, on the lane's own triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3560 CLARA_E2E_NEXT_PORT=3561
  CLARA_E2E_RUNTIME_PORT=3562`): **1/1 pass** (`p1009.home.legal_prompt`, 4.1s, axe-clean). Then the
  WHOLE file on the same triple (`--no-build`, reusing that build): **28/28 pass** (27 pre-existing
  + 1 new), 1.2 minutes.
- A pre-existing, unrelated defect (see below) blocks `next build`'s own TypeScript check, which
  blocks the whole e2e harness from building at all. I verified this independently before running
  the walk (`pnpm typecheck` red with the same two errors #995's report already names), confirmed
  it is untouched by anything in this ticket (`git diff 23cfad9 -- apps/web/components/documents/document-kind-dialog.tsx`
  is empty), then TEMPORARILY added the one missing import
  (`import { DOCUMENT_KINDS } from "@/lib/documents/types";`) locally, uncommitted, purely to get a
  working `next build` for this ticket's own verification. With it in place: `pnpm typecheck` and
  `next build`'s own type-check both went green, the e2e walk ran and is reported above, and the
  whole unit suite's failure count dropped from 20 to 1 (see below — proving the import IS the
  root cause and not merely correlated). I then reverted that import with
  `git checkout -- apps/web/components/documents/document-kind-dialog.tsx` before my final commit —
  **it is not part of any commit on this branch** — because fully fixing it is out of scope for
  #1009 (a different surface, `document-kind-dialog.tsx`/#646/#878, not Firm Home) and the deeper
  fix is not a one-line import: `document-kind-labels.test.tsx`'s own cell 573
  (`[878] the DETAIL surface's classify Select also stops offering a kind the door always
  refuses`) stayed red even with the import restored, because the census asserts the dialog must
  use `CLASSIFIABLE_DOCUMENT_KINDS` at that line, not the raw `DOCUMENT_KINDS` roster — a real
  product decision (which kinds a caller may pick) that #1009 has no authority to make.

**apps/web whole-repo gates (final state, temporary import reverted):**

- `pnpm typecheck`: **2 pre-existing, unrelated errors** —
  `components/documents/document-kind-dialog.tsx(95,22): Cannot find name 'DOCUMENT_KINDS'` (+ one
  cascading `TS7006`). Same defect #974's and #995's own reports already flagged as a follow-up;
  still present, unrelated to Firm Home. Zero errors in any file this ticket touches — verified
  both by the temporary-import experiment above (which turned the WHOLE typecheck green, meaning
  nothing else was red) and by the unchanged-file diff.
- `pnpm lint`: **clean, exit 0** — includes `check-message-keys.mjs` (4310 keys, every
  `legalPrompt.*`/reused `legalKindTerms`/`legalKindDpa` call resolves) and
  `check-test-manifest.mjs` (`firm-legal-standing-tile.test.tsx` listed, alphabetically placed
  between `firm-home-states.test.tsx` and `firm-portfolio.test.tsx`). One known Windows-only skip
  (#756, symlink/EPERM), unrelated.
- Whole unit suite (`node scripts/run-tests.mjs`, once, temporary import reverted):
  **4740 pass / 20 fail / 2 skipped** of 4762. All 20 failures trace to the SAME pre-existing
  `DOCUMENT_KINDS is not defined` defect (confirmed: reverting the temporary import turned exactly
  these 20 red, from 1 red with it in place — an 19-test delta that is itself the proof of the
  single root cause), confined to five files, none under `components/firm/` or `lib/firm/`:
  `document-detail-live-refresh.test.tsx`, `document-kind-dialog.test.tsx`,
  `document-kind-labels.test.tsx`, `documents-url-state.test.tsx`,
  `documents-workbench-refresh.test.tsx`. The 2 skips are the known live-Supabase-auth env skips.
  The known `thread-live-clarify.test.tsx` whole-suite load flake (RIG.md) did not appear this run.

## Follow-ups worth filing

- The pre-existing `DOCUMENT_KINDS is not defined` break in `document-kind-dialog.tsx` (already
  flagged as a follow-up in #974's and #995's own reports, this lane) is now confirmed to be TWO
  layered defects, not one: (1) a missing import, trivially fixable, and (2) once fixed, a genuine
  regression `document-kind-labels.test.tsx` already has a named red cell for — the detail dialog's
  Select should map `CLASSIFIABLE_DOCUMENT_KINDS`, not the raw `DOCUMENT_KINDS` roster, so it stops
  offering `consent_evidence` (a kind the door always refuses, #878's own point). Worth its own
  ticket: it currently fails 20 tests in the whole-suite run and blocks every lane's `next build`
  (hence every lane's e2e gate) until fixed.
- The order chosen for the two right-column prompts (legal standing ahead of "Finish firm setup")
  is a judgement call the brief does not specify; if the owner later wants a firm's own setup
  progress to lead instead, swapping the two `<FirmLegalStandingTile />`/`<FirmSetupTile />` lines
  in `firm-home-board.tsx` is the whole change.

## Unverified

- I did not check out the base commit into a second worktree and run the whole unit suite there
  for an exact pre-ticket baseline (the work order forbids touching another worktree); I relied on
  the temporary-import experiment (which isolates the root cause by toggling exactly one line) and
  `git diff`/`git show` scoping instead, the same method #995's report used for the same defect.
- The `p1009.home.legal_prompt` browser walk was run against a `next build` produced with the
  temporary, uncommitted `document-kind-dialog.tsx` import in place (reverted immediately after).
  I did not additionally rebuild and re-run it against a build lacking that import, since without
  it `next build`'s own type-check refuses to produce a build at all — there is no way to exercise
  a real browser walk on this branch, for ANY ticket, until #974/#995's flagged follow-up is fixed.
  This is a statement about the wave's shared state, not about `p1009.home.legal_prompt` itself.
