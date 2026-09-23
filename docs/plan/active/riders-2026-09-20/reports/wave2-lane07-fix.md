# Wave 2, lane 07 — code-review fix round (single fix worker)

Worktree `C:\Users\zhant\Desktop\clara-wt\657`, branch `riders/w2-lane07`, base
`23cfad947b5598214168ba9c43d391b4e16aa745`.

**New head: `a74ef35a8d9d53557b4428984c2af95abf35ad60`.** Working tree clean; nothing pushed, no PR,
no GitHub write, no subagent, no other worktree touched.

Start state (rule 1): `git status` clean, `git log --oneline <base>..HEAD` = the eleven ticket
commits the two reviews list, unchanged.

## The five fix commits

| commit | finding | ticket |
|---|---|---|
| `e05f35baf` | SPEC-L07-01 (major) | #974 |
| `ba2d3bb7b` | SPEC-L07-04 + std-1 | #974 |
| `47ea0e94e` | SPEC-L07-03 | #995 |
| `9f2f8f4e5` | SPEC-L07-02 | #998 |
| `a74ef35a8` | SPEC-L07-05 | #1009 |

No migration was edited: every fix is code, test or comment, so no redo, no prestate re-measure and
no re-measure of `apps/web/tests/firm-scope-db-pins.corpus.ts`'s barrier sha (`0260`'s file content
is byte-identical to what the census already registers; `firm-scope-db-pins.test.ts` re-run 22/22
green to prove it).

---

## SPEC-L07-01 — #974 AC1's affordance (MAJOR) — **fixed**

**Reproduced.** `needs-you-links.ts`'s `OWNING_TAB.depreciation_authority_pending` was `"/registers"`,
byte-identical to `fixed_asset_incomplete`'s and `staff_advance_incomplete`'s, under a byte-identical
`NeedsYou.openTab` phrase "Open the registers tab". AC1 asks for an affordance "distinct from every
other kind's". It was not.

**And it was the wrong place, which the review did not have to argue.** `lib/navigation/tree.ts`:
`REGISTERS_DEFAULT_TAB = "aging"` — "The workbench's own default when `?tab=` is absent — so a bare
`/registers` is the aging view". `DepreciationAuthorityPanel`, the sign/withdraw controls this row
exists to dispatch to, is mounted by `components/registers/fixed-assets-register.tsx:191`, the
`?tab=fixedAssets` view. So the shipped row landed a professional on the receivables aging view, one
tab away from the only act it names.

**Fix (option (a), the destination half).** `OWNING_TAB.depreciation_authority_pending` is now
`` `/registers?tab=${FIXED_ASSETS_TAB}` `` with `const FIXED_ASSETS_TAB: RegisterTab = "fixedAssets"`,
so a renamed workbench view is a typecheck failure here rather than a silent fall back to aging.
`NeedsYou.openTab.depreciation_authority_pending` = "Open the fixed assets register".

**No inline affordance was added, deliberately.** Option (a)'s other arm — an entry in
`NEEDS_YOU_AFFORDANCES` — would mint a second surface that signs or withdraws an authority, and
#974's own Out-of-scope line rules out "Any change to how a depreciation authority draft is proposed,
signed or withdrawn". `depreciation_authority_pending: null` therefore stays, with its comment
corrected to name the new destination.

**Evidence (test names + results, `apps/web/lib/firm/needs-you-links.test.ts`):**
- `ticket 974 (SPEC-L07-01): the depreciation-authority row opens the FIXED ASSETS view, a
  destination no other kind shares` — RED first on the exact href, then green. It asserts the
  destination, then sweeps `REVIEW_QUEUE_ROW_KINDS` asserting no other kind resolves to it, plus
  `fixed_asset_incomplete`'s narrowed `/registers/assets/:assetId` form.
- `ticket 974 (SPEC-L07-01): and the row SAYS where it lands — its own openTab phrase, shared with
  no other kind` — RED first on `openTab.fixed_asset_incomplete must not be the same promise as the
  new kind's`, then green.
- The pre-existing `every emitted href is a path CLIENT_ROUTES actually serves` cell had a latent
  bug the new destination exposed: its own paragraph promised "any `?tab=` dropped from BOTH sides"
  while the code dropped it from the registry side only. It now does what it says AND is
  **stricter**, not looser: an href that names a view must be one `CLIENT_ROUTES` itself emits.
- Vacuity control: with the tab misspelled `fixedAsssets`, cells 1, 8 and 9 red
  ("...names a workbench VIEW, so it must be one CLIENT_ROUTES itself emits"); restored byte for
  byte, 10/10 green.

Gate: `needs-you-links.test.ts` 10/10; with `needs-you-affordances.test.ts` + `needs-you.test.ts`,
38/38.

## SPEC-L07-04 — #974's unstated active-client narrowing — **fixed**

**Reproduced** against the installed function on `clara_l07`: `authority_rows` joins
`clara.clients active_fda_client on ... and active_fda_client.status='active'`, so a non-active
client produces zero rows. Correct per the house guard (0017 R1-F5; eight of the other ten kinds;
`w629.inbox.archived` pins it for the tenth), but nowhere in the ticket and nowhere in the file.

**Fix:** `p974.row.non_active_client` in
`packages/db/tests/depreciation-authority-pending-rowkind.test.mjs`, through the same real doors and
real read as every cell above it: the row is present while the client is active, gone from the
client-scoped read once archived, and gone from the **firm-wide** read too (so the client scope is a
filter, never the guard).

Vacuity control: with the archive statement flipped to `status='active'`, the cell reds on "a
non-active client's proposed authority is not chased in the inbox"; restored byte for byte, 7/7.

**Correction to #974's AC1 evidence** (the review's second half of this finding, which I cannot make
in `wave2-lane07-ticket974.md` — the main checkout's ticket reports are outside what this round may
write): AC1's real evidence is `p974.row.appears` (exactly one row, right section/lane/id/label)
**narrowed to an active client**, now pinned by `p974.row.non_active_client`. `p974.row.distinct`
proves only that two clients' authority ids do not collide and should not be cited for AC1's
"distinct from every other kind's" — the two new cells in `needs-you-links.test.ts` are what carry
that line now.

## std-1 — FULL_ROW_KEYS duplication — **refuted with a re-run; the comment that seeded it corrected**

The finding's stated hazard is that "a twelfth addition that updates only one copy would silently
desync the two censuses rather than fail loudly". **Measured: it fails loudly.** Both rosters are
compared with `assert.deepEqual` against the keys of a LIVE `clara.list_review_queue` row
(`ninth-rowkind-seeding-proposal.test.mjs:343`, `work-question-reads.test.mjs:175`), so removing
`authority_id` from `work-question-reads.test.mjs` alone reds that file:

```
not ok 6 - w629.inbox.row list_review_queue offers the pending work question in needs_you
  inbox.row: row_kind='work_question' carries a DIFFERENT key set than the pinned shape
             (now 31 keys, #974/0260 added authority_id)
# pass 18  # fail 1
```

(restored from git immediately afterwards; the file is byte-identical to `HEAD`.)

Collapsing them to one shared const would **delete** the independent second statement of the pinned
shape — the `/tdd` rule's "expected values from an independent source of truth" — and let one wrong
edit move both censuses together in silence. That is a worse failure mode than the one the finding
names, which does not exist.

What I did change: `apps/web/lib/firm/needs-you.ts`'s own EXTENSION POINT note asked a future ticket
to "collapse them to one shared const" — that sentence is what the standards axis picked up. It is
withdrawn and replaced with the measurement, so the next reader is not sent to do it.

## SPEC-L07-03 — #995 removed the failed-register-read surface — **fixed**

**Reproduced.** The retired `<section aria-labelledby="firm-home-clients">` carried the page's only
`DataState` over `register`. With it gone a failed client-register read degraded silently to the
header's role-only sentence. No line of #995 asked for that, and `firm-home-board.tsx` states the
opposite rule one read above for `caller`: "A failed caller read degrades the HEADING only... It is
shown, never swallowed".

**Fix:** `{register.error ? <ErrorMessage error={register.error} /> : null}` beside the caller-error
line — a banner, not a restored section, because `register` feeds the header's client count and the
client-name map the triage list and recent activity read through, all of which sit ABOVE where the
section stood. Both comments that described the loss as final (in the component and in the
pre-existing failure cell) are corrected.

**Evidence** (`firm-home-board.test.tsx`): new cell `Firm Home (ticket 995, SPEC-L07-03): a failed
client-register read is still SAID, not swallowed` — RED first on "the failed register read is named
through the shared classifier", then green. It asserts the failure is said, that the queue and
portfolio still render, that no client count is fabricated, **and** the other half — a register read
that resolves leaves no failure text behind, so the banner is not always-on. The pre-existing "ONE
failed read does not blank the others" cell keeps its role-only assertion unchanged.

Gate: `firm-home-board.test.tsx` + `firm-legal-standing-tile.test.tsx`, 23/23.

## SPEC-L07-02 — #998's two stale comments — **fixed**

- `apps/web/lib/firm/activity.ts` cited "the same reasoning `lib/firm/timeline.ts`'s own header gives
  for `list_firm_timeline`" — a file #998 deleted. The reasoning is now stated in place, with the
  retirement (0261) named, instead of pointed at a dangling path. Its `ACTIVITY_MAX_LIMIT` note,
  which compared the ceiling to "`list_firm_timeline`'s 200" in the present tense, now says "the 200
  the retired `clara.list_firm_timeline` allowed (#998, 0261)".
- `apps/web/e2e/home-board-mock.mjs` documented not handling the door because "This mock exercises
  the compatibility arm for a database that predates migration 0174" — an arm #659 removed and a
  door 0261 dropped. It now says there is nothing left to answer and names `clara.list_activity` as
  what the mock does handle.

Comments only. Gate: `apps/web/lib/firm/activity.test.ts` 35/35; the walk that loads the mock,
28/28 (below).

## SPEC-L07-05 — #1009's link AC verified only to the URL — **fixed**

**Fix** (`apps/web/e2e/home-board-walk.spec.ts`, `p1009.home.legal_prompt`): after the navigation the
walk now requires the "Legal standing" heading and **exactly one** `Accept for this firm` control
(the locator `firm-commercial-walk.spec.ts` already uses). One, not one-or-more: the mocked standing
has terms v2 unaccepted and the DPA current at v1, so a second control would mean the card offered
acceptance for an agreement already accepted.

**A second defect found in the same cell and fixed:** the axe scan ran AFTER the click, so it was
scanning `/settings/firm` under the label "Firm Home with the legal-standing prompt on screen" — the
surface the cell exists for was never scanned. The scan moved ahead of the click.

**Vacuity control, in the browser.** With `LegalStandingCard`'s accept-control condition narrowed by
`&& doc.kind === "dpa"` (type-safe, so `next build` still typechecks), the cell reds exactly at the
new line while `toHaveURL` stays green:

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  getByRole('button', { name: 'Accept for this firm' })
Expected: 1   Received: 0
> 1299 |   await expect(page.getByRole("button", { name: "Accept for this firm" })).toHaveCount(1);
1 failed · 27 passed (1.3m)
```

`legal-standing-card.tsx` restored from git (working tree clean, verified) and the walk re-run green.

## SPEC-L07-06 — the walk is unreproducible on the branch — **refuted; and the walk is now reproducible from a committed state**

**The premise "have a lane own it" is already satisfied and predates this lane.** The blocking defect
(`document-kind-dialog.tsx:95` reading an undefined `DOCUMENT_KINDS`) was diagnosed and fixed by the
wave-1 integration gate worker B:

```
commit cd7da1116ef176747cefbb56dec46b0c7d065d8a
  fix(integration): document-kind-dialog SelectValue items must use the filtered roster
  parent: 23cfad947 (== this wave's BASE)
```

`git merge-base --is-ancestor 23cfad947... cd7da111` → yes; `cd7da111^ == 23cfad947`. The fix is
literally the next commit on `integration/riders-w1`. Wave 2's lane branches were cut one commit too
early. **No lane should take it**, and this lane did not: duplicating it would put a second copy of
the same one-line change in the integrator's path for no gain.

**The evidence is now reproducible from a committed state, not from an uncommitted patch.** I ran
every browser and whole-suite gate on a local branch
`riders/w2-lane07-e2e-proof` = `7b6286e5c35b761835df57875d8dccedb2091f7f`, which is this lane's head
plus a cherry-pick of `cd7da111` — i.e. exactly the tree the integrator will have. Anyone can rebuild
it in two commands:

```
git checkout -b <name> riders/w2-lane07
git cherry-pick cd7da1116ef176747cefbb56dec46b0c7d065d8a
```

The branch is local only (never pushed); the integrator may delete it.

**Results on that branch:**
- `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3560 CLARA_E2E_NEXT_PORT=3561 CLARA_E2E_RUNTIME_PORT=3562
  pnpm --filter @clara/web e2e home-board-walk` → **28 passed**, including
  `p1009.home.legal_prompt` with its new accept-control assertions. Run twice green (before and
  after the vacuity mutant), 1.2m and 1.5m.
- Whole `apps/web` unit suite → **4756 tests, 4754 pass, 0 fail, 2 skipped** (the two known
  live-Supabase-auth env skips).
- `pnpm typecheck` → `apps/web: Done`, `packages/runtime: Done`, exit 0.

That third line is the conclusive proof that none of the 20 whole-suite failures on the lane branch
itself is this lane's: the same tree with only `cd7da111` added is completely clean.

---

## Gates, with counts (run on `riders/w2-lane07` unless marked)

**packages/db**, from `packages/db`, with the full 51-flag `$GATES` chain (measured off
`package.json` — **51**, not the 52 `wave2-lane07-ticket974.md` reports; SPEC-L07-10 confirmed), env
`PGHOST=127.0.0.1 PGPORT=55747 PGUSER=postgres PGDATABASE=clara_l07 CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1`:

- `depreciation-authority-pending-rowkind.test.mjs` + `ninth-rowkind-seeding-proposal.test.mjs` +
  `work-question-reads.test.mjs` + `web-reads-and-doors.test.mjs` + `f-a7-pi.test.mjs` +
  `operation-census.test.mjs` → **84 tests, 84 pass, 0 fail, 0 skipped** (exit 0).
- `rig-isolation.test.mjs` → **23 tests, 22 pass, 0 fail, 1 skipped** (`T19 poison-role`, the
  destructive reset cell; `CLARA_RIG_ALLOW_RESET` never set). Matches the ticket report's baseline.

**apps/web**, from `apps/web`:

- Touched/adjacent files in one run — `tests/firm-scope-db-pins.test.ts`,
  `lib/firm/needs-you-links.test.ts`, `lib/firm/needs-you.test.ts`,
  `components/firm/needs-you-affordances.test.ts`,
  `components/firm/firm-home/firm-home-board.test.tsx`,
  `components/firm/firm-home/firm-legal-standing-tile.test.tsx`, `lib/firm/activity.test.ts`,
  `lib/firm/home-facts.test.ts` → **130 tests, 130 pass, 0 fail**.
- Whole unit suite (`node scripts/run-tests.mjs`, once) → **4756 tests, 4734 pass, 20 fail, 2
  skipped**. All 20 are the pre-existing `document-kind-dialog` defect: 19 throw
  `ReferenceError: DOCUMENT_KINDS is not defined`, and the 20th is
  `[878] the DETAIL surface's classify Select also stops offering a kind the door always refuses`,
  the source-text assertion minted to catch exactly this. Zero fail on the proof branch (above).
  The known `thread-live-clarify.test.tsx` whole-suite load flake did not appear.
- Browser walk `home-board-walk` → **28 passed** (on the proof branch, for the reason above).

**Repo root:**

- `pnpm typecheck` → exit 2, `packages/runtime: Done`, `apps/web` reporting **exactly the two
  pre-existing** errors (`document-kind-dialog.tsx(95,22) TS2552`, `(95,42) TS7006`) and nothing
  else. Clean (exit 0) on the proof branch.
- `pnpm lint` → **exit 0**.
- `node scripts/check-frozen-workflows.mjs` → OK, 312 frozen files verified, no manifest diff.

## Docs updated in the same commits

`needs-you-links.ts`'s header (the new "ONE `?tab=` DESTINATION" paragraph, and why it is not the
deep-fragment the next paragraph still refuses), `needs-you-affordances.tsx`'s `#974` entry,
`needs-you.ts`'s EXTENSION POINT note (std-1's withdrawal, with the measurement),
`firm-home-board.tsx`'s `#995` retirement comment, `activity.ts`'s two headers,
`home-board-mock.mjs`'s handler doc, and each new test cell's own grounding comment. No
`CONTEXT.md`, `docs/PRD.md` or `docs/ARCHITECTURE.md` change is owed: no new vocabulary, no product
or technical decision moved.

## Successor contracts

None owed. No frozen workflow body and no closure module was touched (`check-frozen-workflows.mjs`
clean).

## Notes the integrator should carry

1. **`cd7da111` must be in the integration base.** Wave 2's lanes were cut from `23cfad947`, its
   parent. Until it is present, `next build` fails repo-wide and 20 `apps/web` unit tests red — in
   every wave-2 lane, not just this one.
2. **SPEC-L07-09 (the review closed it itself): #998 AC3 holds.** `activity-feed.test.mjs` 31/31 with
   the full gate chain, per the spec reviewer's own re-run. The ticket report carries it as
   unverified; it is not.
3. **SPEC-L07-10: the gate-chain count is 51**, not 52, in `wave2-lane07-ticket974.md`. Counted off
   `packages/db/package.json` twice. No effect on any result.
4. **SPEC-L07-07 (note, no fix): the below-floor client-count fallback is conditional.**
   `firm-home-board.tsx` renders `roleOnly` (role, no count) whenever `register.loading ||
   register.error`. SPEC-L07-03's fix makes that state *visible* rather than silent, which is the
   half that was actually wrong; whether a below-floor caller should also see a count when the
   register read fails is a product question with no source to answer it from — there is no second
   read of the client population at that floor. Left for the owner.
5. **SPEC-L07-08 (note, no fix): `ninth-rowkind-seeding-proposal.test.mjs`'s MED-3 by-NAME roster
   still enumerates nine kinds.** Not a small fix: admitting `work_question` and
   `depreciation_authority_pending` to that floor requires that cell's fixture to *produce* both
   kinds (a parked Work and a proposed authority), which is a new fixture, not a roster edit. Worth
   its own ticket; the closed world itself is pinned elsewhere (the `FULL_ROW_KEYS` rosters, the
   migration's marker roster, `NEEDS_YOU_AFFORDANCES`' exhaustive Record).
6. **#1009 AC5 reads false against the lane's combined diff**, as the spec reviewer flagged: #1009
   adds no Needs-you kind, but #974 in the same lane adds the eleventh under its own owner ruling.
   Unchanged by this round; recorded so it is not read as a regression.

## Anything unverified

- The `?tab=fixedAssets` destination is proven to be a route `CLIENT_ROUTES` emits (and
  `routes.test.ts` proves `CLIENT_ROUTES` against the real `app/` tree) and proven distinct from
  every other row kind's. I did **not** drive a `depreciation_authority_pending` row through a
  browser to the fixed-assets view: no e2e fixture mints one, and building one would mean seeding a
  proposed authority into `home-board-mock.mjs` — new e2e surface area this fix round did not ask
  for. The unit cells plus the existing `depreciation-walk.spec.ts` (which already proves
  `/registers?tab=fixedAssets` renders the panel) cover both halves separately.
- The browser walk and the clean whole-suite/typecheck runs are on `riders/w2-lane07-e2e-proof`
  (lane head + `cd7da111`), not on `riders/w2-lane07` alone, for the reason in SPEC-L07-06. On the
  lane branch alone, `next build` still cannot run.
