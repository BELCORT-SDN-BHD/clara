# Wave 3, lane 01, ticket #890 — the shared draft rule across all four counterparty door dialogs

Branch `riders/w3-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. This is the lane's first ticket — `git log --oneline
ffe63a0dd084e99b84c1368119845be273c421ce..HEAD` was empty before this session started. Commits on
this branch (both #890's):

- `c50b7afc1` `test(web): #890 the shared draft rule across all four counterparty door dialogs`
- `aeb92314c` `fix(web): #890 reword ticket references to clear the raw-colour lint gate`

## Status: done

Verified still live on this branch before building: `gh issue view 890 --comments` (one comment,
re-read in full) — no owner-ruling comment dated 2026-09-20 on #890 itself; the newest binding text
is the Agent Brief in that comment, quoted in full below because every line of it drove a decision.

> Verified at `65fde7f3`: only `SetCounterpartyIdentifiersDialog` is celled for the shared draft
> rule (re-seed on open, survive a refusal); no test imports `AddCounterpartyAliasDialog` or
> `RetireCounterpartyAliasDialog`. One adjacent defect found: `RenameCounterpartyDialog` passes
> neither a refusal nor an open callback and never clears, while its single field is seeded from a
> live prop, which is exactly the case the shell's open callback exists for. Scope widened to all
> four dialogs.
>
> Desired behavior: Each of the four dialogs has a cell that fails if its share of the rule is
> removed, written so the four read as one contract. A refusal leaves the dialog open with typed
> values intact and the refusal text inside the dialog. A success closes it and leaves no draft. A
> dialog whose fields are current values re-seeds on open. `RenameCounterpartyDialog` is brought
> onto the rule (refusal prop, open callback, re-seed).
>
> Key interfaces: `AddCounterpartyAliasDialog`, `RetireCounterpartyAliasDialog`,
> `RenameCounterpartyDialog`, `SetCounterpartyIdentifiersDialog`: cells; the rename dialog also
> gains the missing wiring. `ArApCounterpartyDoorDialog`: unchanged.
>
> Out of scope: The merge ceremony and its preview card.

`git log -p` on `65fde7f3`'s successor state on this branch confirms the same finding still holds:
`counterparty-identity-correct.test.tsx` imports only `CounterpartyIdentityPanel` and cells
`SetCounterpartyIdentifiersDialog`'s share (cancel-leaves-no-draft, refusal-survives); no test file
in the tree imports `AddCounterpartyAliasDialog` or `RetireCounterpartyAliasDialog` directly or
through a panel; `RenameCounterpartyDialog.tsx` took `{ currentName, busy, onSubmit }` only — no
`refusal`, no `onOpened` — exactly as the brief states. `ArApCounterpartyDoorDialog.tsx` is
untouched, confirmed by `git diff` showing no change to that file.

## The seams tested at

Per the brief's own "Key interfaces", the seam is each dialog's PUBLIC props contract (`refusal`,
`onSubmit`'s resolved outcome, the field's own DOM value) as driven through its real caller panel —
never the dialog's internal state directly:

- `AddCounterpartyAliasDialog` and `RetireCounterpartyAliasDialog` — mounted through
  `CounterpartyIdentityPanel` (`counterparty-identity-panel.tsx:289-303` wires add-alias's
  `refusal`; `:134-139`'s `AliasItem` wires retire-alias's), because that is their real,
  already-correctly-wired call site.
- `RenameCounterpartyDialog` — mounted through `CounterpartyHygienePanel`, its ONLY caller
  (`counterparty-hygiene-panel.tsx`), because that is the one call site the brief says needs the
  fix.
- No test drives `ArApCounterpartyDoorDialog` directly and none touches the merge ceremony (out of
  scope, per the brief).

All four cells live in one new file, `apps/web/components/registers/counterparty-door-dialogs-draft-rule.test.tsx`,
so they "read as one contract" as the brief asks — three new cells there, plus
`SetCounterpartyIdentifiersDialog`'s existing two cells in `counterparty-identity-correct.test.tsx`
(unchanged, not duplicated) make the fourth.

## Acceptance criteria, with evidence

| Criterion | Evidence |
|---|---|
| Four cells, one per dialog, each failing if that dialog's share of the rule is removed | See "vacuity controls" below — each of the three NEW cells was proven able to fail for the right reason; `SetCounterpartyIdentifiersDialog`'s two existing cells already do this (unmodified). |
| A refused add-alias confirm leaves the typed alias, origin and basis intact | `counterparty-door-dialogs-draft-rule.test.tsx`, cell "AddCounterpartyAliasDialog — a REFUSED confirm leaves the typed alias, origin and basis intact…" — PASS. Asserts `cp-alias-name` and `cp-alias-basis` field values survive a CLR23 refusal, and the refusal text renders scoped to `[data-slot="dialog-content"]` (not the page-level banner — see next row). |
| A successful add-alias confirm leaves no draft on the next open | Same test, second half (a fresh mount, the door accepts) — PASS. After a successful confirm the dialog closes; reopening shows `cp-alias-name` = `""`. |
| The rename dialog re-seeds its field on open and survives a refusal | `counterparty-door-dialogs-draft-rule.test.tsx`, cell "RenameCounterpartyDialog re-seeds its field on open and survives a refusal" — PASS after the fix (RED beforehand, for the right reason — see below). Drives: open shows the current name; type a draft then Cancel; reopen shows the CURRENT name, not the abandoned draft; type a real rename and confirm — refused, field keeps the typed value and the refusal renders inside the dialog; confirm again — accepted, dialog closes; exactly 2 `rename_counterparty` calls total. |
| The registers web suite is green | `node scripts/run-tests.mjs` (whole `apps/web` unit suite, run twice — see Gates) — 4847/4849 pass both times with 0 fail on the second run; every `components/registers/*` test file, including all three counterparty files, passed in both runs. |

### The retire-alias cell (not a separate AC bullet, but the fourth dialog the brief names)

"RetireCounterpartyAliasDialog — a REFUSED retirement keeps this alias's own dialog open with the
refusal rendered, and an accepted one writes exactly once" — PASS. Drives: open the alias's Retire
dialog; confirm — refused (CLR23 `already_retired`); dialog stays open, refusal text renders
scoped to the dialog content, and the dialog is still showing the SAME alias ("Acme Trading");
confirm again — accepted, dialog closes; exactly 2 `retire_counterparty_alias` calls, both
targeting `p_alias: "al1"`.

## Vacuity controls (per the wave rule: "still needs the vacuity control")

- **Add-alias's "leaves no draft" half.** Temporarily changed
  `if (ok) { setAlias(""); setOrigin("trade_name"); setBasis(""); }` to `if (false) { … }` in
  `AddCounterpartyAliasDialog.tsx`. The cell failed for the right reason (`'Acme Retail' !== ''`).
  Restored byte for byte (`git diff` confirms zero change to that file in the final commit).
- **Add-alias's "refusal renders inside the dialog" half.** Temporarily changed
  `refusal={refusal}` to `refusal={undefined}` on the `AddCounterpartyAliasDialog` call in
  `counterparty-identity-panel.tsx`. The cell failed for the right reason (`the refusal renders
  verbatim INSIDE the dialog` — actual text had no refusal at all). Restored byte for byte.
- **Retire-alias's refusal wiring.** Temporarily changed `refusal={refusal}` to
  `refusal={undefined}` on the `RetireCounterpartyAliasDialog` call inside `AliasItem` in the same
  file. The cell failed for the right reason. Restored byte for byte.
- **Rename's re-seed + refusal wiring.** This one needed no separate probe: the cell was written
  and run FIRST against the untouched `RenameCounterpartyDialog.tsx`, and failed for the real
  reason the brief names (`#890: re-seeded from the live prop, not the abandoned draft` —
  `'Abandoned Draft Sdn Bhd' !== 'Old Name Sdn Bhd'`). The fix below turned it green; that red→green
  pair is the vacuity proof for this dialog.
- **`git status`/`git diff` after every probe** confirmed the probed file returned to exactly its
  committed state before moving to the next probe — no probe code shipped.

### A landmine found and worked around, not shipped as a fix

Building the retire-alias cell, an early draft used `assert.equal(dialogNode, null, "the dialog
closed on success")` (a permanent, unconditional refusal mock, mirroring a mock bug on my part, not
the dialog). That assertion legitimately failed — and Node's own assertion-diff formatting on a DOM
stub node carrying React's internal fiber references (`__reactFiber$…`) then ran for 60+ seconds and
crashed the process on an out-of-memory allocation failure, confirmed by shrinking
`--max-old-space-size` to 128 MB (crash in ~4 s) and by comparing `assert.equal(x, null)` (hangs)
against `assert.equal(x === null, true)` (fails instantly, cleanly) on the identical DOM state — a
20-line iterative census immediately before the call found the live tree perfectly healthy (114
nodes, 0 duplicates, depth 10), ruling out an actual cycle in the app's own render output. The fix
was in my own test code (gate the mock's refusal on the FIRST attempt only, exactly like the
rename mock already did, so a real retry legitimately succeeds) — nothing in `AddCounterpartyAliasDialog`,
`RetireCounterpartyAliasDialog`, `RenameCounterpartyDialog` or `ArApCounterpartyDoorDialog` was
touched to work around this. Every `assert.equal(<node>, null, …)` left in the shipped file only
ever runs against a mock that legitimately succeeds on the attempt being asserted, so this landmine
is dodged rather than hidden. Worth a follow-up (see below) so the next person does not lose an hour
to the same 60-second hang.

## The fix

**`RenameCounterpartyDialog.tsx`** — added `refusal?: DialogRefusal` (threaded straight to
`ArApCounterpartyDoorDialog`'s own `refusal` prop, the same shape every other counterparty dialog
already uses) and `onOpened={() => setNewName(currentName)}` — the same re-seed-on-open shape
`SetCounterpartyIdentifiersDialog` already carries for its own current-value fields. Before this,
`const [newName, setNewName] = useState(currentName)` seeded the field once, at mount, and never
again: an abandoned draft (typed, then Cancelled) was silently re-offered on the next open, and a
refusal rendered nowhere because the prop did not exist to carry it.

**`counterparty-hygiene-panel.tsx`** (`RenameCounterpartyDialog`'s only caller) — derives
`const refusal: DialogRefusal | undefined = err === null ? undefined : { err, clr }` from the
panel's own `useHydratedPart` state (the same `err`/`clr` pair `counterparty-identity-panel.tsx`
already turns into a `DialogRefusal` via `toDialogRefusal`, just built by hand here because this
panel keeps the raw pair rather than a single `unknown` error) and passes it to
`RenameCounterpartyDialog`. No other dialog on this panel (`SetCounterpartyTermsDialog`,
`AddCounterpartyAliasDialog`'s copy here, `MergeCounterpartiesDialog`) was touched — the brief
names only the rename dialog's wiring as in scope, and `refusalForThisDialog`'s own attempt-gating
(`lib/parts/door-dialog-outcome.ts`, unchanged) already makes a single shared `refusal` value safe
to hand to more than one sibling dialog without cross-talk, exactly as it already does on the
identity panel.

`ArApCounterpartyDoorDialog.tsx` is unchanged, as the brief specifies.

## Migration

**None.** This ticket was expected to need no migration, and none was needed — it is a pure
frontend fix plus test coverage, no schema or function touched.

## Docs

No module README exists at `apps/web/components/registers/` (checked: `find` turned up none), and
no new domain vocabulary was introduced — the "shared draft rule" is a UI implementation contract
already documented in `AddCounterpartyAliasDialog.tsx`'s own header and now restated in
`RenameCounterpartyDialog.tsx`'s and in the new test file's header comment. `CONTEXT.md` needed no
edit (no new term). `apps/web/messages/en.json` needed no edit — every string reused an existing
key (`ArApCounterparty.rename.*`, `.addAlias.*`, `.retireAlias.*`), confirmed by
`check-message-keys.mjs`'s clean run inside the lint gate (4311 keys, all resolved).

## Gates, with counts

- **New test file, standalone** (`apps/web`, `node --import ./test/bootstrap.mjs --import tsx
  --test components/registers/counterparty-door-dialogs-draft-rule.test.tsx`): 3/3 pass.
- **`pnpm typecheck`** (root): exit 0 — `apps/web` and `packages/runtime` both "Done".
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, wave-3 addendum rule): exit 0 across
  `packages/db`, `apps/web`, `packages/runtime`, `packages/reporting-render`. (First run caught 11
  `no-restricted-syntax` "raw colour value" errors — `#890` inside string literals reads as a
  3-hex-digit colour per owner ruling Q4/#994's own documented false-positive case, since 8/9/0 are
  all hex digits; fixed by rewording every occurrence to `ticket 890`, the rule's own stated fix,
  never weakening the selector — confirmed by the eslint-config selftest's own `#994` cases staying
  green throughout.)
- **`apps/web` touched → the WHOLE unit suite once** (`node scripts/run-tests.mjs`): run TWICE.
  First run: 4846/4849 pass, 1 fail — `documents-workbench-refresh.test.tsx`'s "[633]: an UNSETTLED
  receipt keeps a bounded watch…" (a timing-sensitive poll-budget test, unrelated to counterparty
  code, not in RIG.md's known-reds list). Re-run alone 3/3 times: PASS every time
  (899 ms/900 ms/867 ms). Second FULL-suite run: 4847/4849 pass, 0 fail, 2 skip (unchanged skip
  count from run 1). Reported as a known flake under whole-suite host contention (the same class
  RIG.md already names for `thread-live-clarify.test.tsx`), not a regression from this ticket —
  no file this ticket touches shares a module boundary with `documents-workbench-refresh.test.tsx`
  or `intake-batch-card.tsx`.
- **`apps/web/test/manifest.txt`**: the new file added at its correct alphabetical position
  (`client-identity-section.test.tsx` < `counterparty-door-dialogs-draft-rule.test.tsx` <
  `counterparty-hygiene-a11y.test.tsx`), confirmed by `scripts/check-test-manifest.mjs`'s clean run
  inside the lint gate.
- **Browser walk**: none owed. No e2e spec was added or touched, and neither existing counterparty
  walk (`apps/web/e2e/counterparty-identity-walk.spec.ts`, `knowledge-firm-walk.spec.ts`) mentions
  Rename at all (`grep` confirmed zero matches), so none exercises the fixed path today.
- **`packages/db`**: not touched — no db gate chain, `operation-census.test.mjs` or
  `rig-isolation.test.mjs` owed (no SQL function added).
- **`packages/runtime`**: not touched — no `check-frozen-workflows.mjs` or
  `check-parts-parity.mjs` owed.

## Successor contract

None. This ticket touches no frozen workflow body, no closure module, and adds no door, room, part
or prompt stanza a frozen chat or Work tool would need — it is a presentational dialog fix plus
test coverage, entirely inside `apps/web`.

## Follow-ups worth filing

- **The `assert.equal(<DOM node>, null, …)` landmine.** `node:assert/strict`'s failure-path
  diffing appears to hang/OOM when the "actual" value is a React-DOM stub node carrying attached
  fiber internals, rather than failing fast. This is a test-harness footgun, not an app defect: any
  future cell in this codebase that writes `assert.equal(findSomeNode(...), null, …)` and gets that
  assertion WRONG (a real mismatch, not a passing case) risks the same 60+ second hang instead of a
  fast, readable failure. Worth either a `test/hookHarness.ts` note warning against this pattern, or
  a small assertion helper (`assertClosed(node, message)` that compares `node === null` as a
  boolean) so the failure path is always fast. Not fixed here — it is a harness-wide concern outside
  this ticket's file scope, and no shipped cell in this file actually exercises the failing branch
  (every `assert.equal(<node>, null, …)` here runs only where the door is mocked to genuinely
  accept).
- No other follow-ups. The brief's own "out of scope" (the merge ceremony and its preview card) is
  respected untouched.

## Anything unverified

- The `documents-workbench-refresh.test.tsx` flake's ROOT CAUSE (host contention under the full
  4849-test run vs. this specific poll-budget test's own timing assumptions) was not investigated
  beyond confirming it is reproducible-absent-in-isolation and absent on a second full run — that
  is Wayfinder/triage territory, not this ticket's.
- I did not verify this fix against the hosted database or any Playwright browser walk (none
  exists for the rename flow today) — only the unit-test seam the brief names.
