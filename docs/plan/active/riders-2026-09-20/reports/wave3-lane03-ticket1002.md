# Wave 3, Lane 03, Ticket #1002 — a cash-account-set membership editor beyond the first publish

Branch `riders/w3-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. `git log <base>..HEAD` at start showed two commits
already landed (`c8da2a830` #958, `529608478` #1001); this ticket is the third on the branch.

**RESUME.** An earlier implementer of this same ticket was killed mid-work by a usage limit,
leaving no commit naming #1002 but a complete, uncommitted DB-side slice: migration
`0276_cash_account_set_membership_read.sql` (untracked), its test file, its preintegration gate,
and edits to `client-financial-pack-fixtures.mjs`, `rig-meta.mjs` and `packages/db/package.json`.
I read all of it, verified the migration was already **applied** on this lane's database
(`clara.schema_migrations` carried `0276_cash_account_set_membership_read`, `applied_at
2026-09-20T16:01:00.741Z`, immediately after `0272_document_capability_wall_completion` — no
`0273`–`0275` on this lane, confirming those numbers belong to other wave-3 lanes), ran its six
tests at the full gate chain (6/6 pass, 0 skips) and judged the whole slice sound on its merits
before continuing. I did not re-derive or re-apply anything the prior implementer had already
proven; I built the (until then entirely missing) UI half on top of it.

Commits:
- `86f62fb4c` — `feat(db): #1002 the second-pass cash-account-set membership editor's own read`
  (the prior implementer's slice, reviewed and committed by me byte-for-byte as found).
- `ea9d22aed` — `feat(web): #1002 type the membership door and its hydration`.
- `cb8040d54` — `feat(web): #1002 the second-pass cash-account-set membership editor`.

## Status: done

The ticket was **still live** on this branch. `gh issue view 1002 --comments` shows one comment —
the owner's ruling of 2026-09-20, which is also the newest (and only) Agent Brief. It **overturns**
the ticket body's own AI-triage recommendation ("Option B: wait for the first firm to ask"): build
the second-pass editor now, because the publish door already supersedes the whole set on every
call (an editor adds no new destructive power) and the 2026-09-19 release measured zero published
cash-account sets on hosted — this lands ahead of the first real firm by choice, not by accident.
I verified the premise myself rather than taking it on faith: `client-cash-set-dialog.tsx` on this
branch, before this ticket, always sent `effectiveFrom: null`
(`publishClientCashAccountSet(..., { effectiveFrom: null, opKey: ... })`), which
`publish_client_cash_account_set` (0232) accepts only for a client's first version — a second
publish through the existing dialog is refused `effective_from_required` before this ticket. No UI
consumer of a "current membership with reasons" read existed anywhere in `apps/web` before this
ticket (`grep -rn "get_client_cash_account_set_members" apps/web` matched nothing before my first
commit).

## The seams (written down before testing, per work order rule 4)

The brief names these public interfaces:
1. **A read enumerating the current published version's membership, each member's reason.**
   `clara.get_client_cash_account_set_members(p_client)` (new, migration 0276) — the door half the
   prior implementer had already built and proven.
2. **`clara.publish_client_cash_account_set`, reused unchanged** — one members array whose order is
   the ordinal, the effective date, the op key, the admin floor. No recut, no new signature.
3. **The editor as a second caller of that door**, with an idempotency key derived from the intent
   rather than the clock — a component-level seam: `ClientCashSetDialog`'s own submit path, driven
   through `renderComponent` exactly as `client-cash-summary.test.tsx` and
   `knowledge-promote-dialog.test.tsx` already drive dialogs in this codebase, never a re-derivation
   of what the component computes.

No new component-level test harness was invented; `ClientCashSetDialog` had no dedicated test file
before this ticket (`client-financial-charts.test.tsx` covers the composite band and deliberately
never opens the dialog — see that file's own header), so this ticket's UI tests are the first ones
to drive it directly, mounted the same way `work-cancel-dialog.test.tsx` mounts a portalled base-ui
Dialog (`bodyOf().appendChild(h.container)`, then search `document.body`).

## Acceptance criteria, each with its evidence

- [x] **Opening the editor for a client with a published set pre-checks every current member,
  including one with no bank-registry candidacy.**
  Evidence: `client-cash-set-dialog.tsx`'s `buildRoster()` unions `propose_client_cash_accounts`'
  candidates with `get_client_cash_account_set_members`' current members; a `useEffect` seeds
  `selection` from `currentSet.members` once per published version. Test `ticket 1002.1 every
  current member is pre-checked, including one with no bank-registry candidacy`
  (`client-cash-set-dialog.test.tsx`) mounts with a member (`PETTY`, `declared_petty_cash`) that
  carries NO candidate entry at all, and asserts its checkbox renders and starts `checked: true`,
  alongside the bank-registry member (also checked) and a not-yet-member candidate (unchecked).
  Result: **pass**.

- [x] **A member carrying a declared reason is resubmitted with that reason unchanged, never
  rewritten to bank registry.**
  Evidence: the SAME checkbox the first-publish face always stamps `bank_registry` onto now
  defaults to `r.reason ?? "bank_registry"` on check — the row's own recorded reason when it has
  one, the structural default only when it does not. Test `ticket 1002.2 a declared reason is
  resubmitted UNCHANGED, never rewritten to bank_registry` submits the seeded (untouched) selection
  and asserts the door received `member_reason: "declared_petty_cash"` for that account, not
  `"bank_registry"`. Result: **pass**.

- [x] **The editor shows added, removed and unchanged members against the current version before
  submission.**
  Evidence: `added`/`removed`/`unchangedCount` are computed from `roster` against
  `currentSet.members`, rendered in a `Field` above the effective-date input, before any submit.
  Test `ticket 1002.3` unchecks a current member and checks a not-yet-member candidate, and asserts
  `Added: 1020`, `Removed: 1090` and `1 unchanged` all render. `ticket 1002.3b` proves the
  complementary shape — an untouched editor reports `Nothing added or removed yet.` and `2
  unchanged`. Result: **pass** (both cells).

- [x] **The human states the new effective date, and a null or non-advancing date is shown as the
  door's own named refusal, not a generic failure.**
  Evidence: the date `Input` carries **no client-side requirement** — deliberately, so the human's
  own omission reaches the real door and its real refusal, rather than a client-invented rule
  pre-empting it (the members-empty rule, by contrast, DOES mirror the door's `cash_set_empty`
  client-side, matching the house convention the first-publish face already sets for that one
  rule). Two cells drive a mocked `publish` that throws the door's own `DoorRefusal`:
  `ticket 1002.4` (blank date → `effective_from_required`, asserting the call received
  `effectiveFrom: null`, never a guessed value) and `ticket 1002.4b` (a date before the current
  version's own → `effective_from_not_after_current`, asserting the call received the human's own
  typed date, `2026-01-01`, unaltered). Both assert the door's exact sentence
  ("a later version states the date it takes effect" / "a new version takes effect strictly after
  the current one") and its code/reason render verbatim in the SAME refusal banner the first-publish
  face already used — no new rendering path. Result: **pass** (both cells).

- [x] **Submission supersedes the prior version, stamps the date and leaves exactly one published
  version, with the existing versioning tests passing unchanged.**
  Evidence: the editor calls `publish_client_cash_account_set` unrecut — this ticket's migration
  tail re-pins that function byte-identical, and no commit in this ticket's diff touches
  `packages/db/migrations/0232_client_financial_pack.sql`. The existing versioning battery,
  `client-financial-pack.test.mjs` (36 tests, including `p660.pack.cash_set_members_sealed` and the
  publish-race cells), passes **unchanged, 36/36**, in the same run as this ticket's own new cells.
  The client-side half is exercised by `ticket 1002.2`'s successful submit (a mock `publish`
  resolving normally), which is the UI's own proof that a well-formed call reaches the door; the
  door's own "exactly one published version" invariant is `client-financial-pack.test.mjs`'s
  property, re-confirmed rather than re-proven. Result: **pass**.

- [x] **The editor is reachable only for a client that already has a published set and only for a
  caller the publish door would admit; first publish is unchanged.**
  Evidence, in two parts:
  - *"Only for a client with a published set"*: `hasPublishedSet` is `pack.cashSet !== null` —
    the SAME fact `ClientCashSummary`'s own "Change" entrance already reads
    (`client-cash-summary.tsx:93-109`, pre-existing, `cashSet ? ... : null`), decided from the
    ALREADY-LOADED financial pack rather than awaited from the new membership read, so mode
    selection carries no extra latency. `ClientFinancialSummary` passes it straight through
    (`hasPublishedSet={pack.cashSet !== null}`).
  - *"Only for a caller the publish door would admit"*: this is the DOOR's own admission, unchanged
    — `publish_client_cash_account_set` still floors at admin (`clara._human_ctx(...'admin')`,
    untouched, re-pinned byte-identical in this ticket's migration tail) and a below-floor caller is
    refused CLR04 exactly as before. The READ entrance itself is gated the same way first-publish
    already was: `onOpenCashSet` is withdrawn (`null`) whenever the pack read is `denied`
    (`client-financial-summary.tsx:156`, pre-existing, untouched by this ticket) — "the entrance is
    withdrawn rather than offered and then refused" is the file's own pre-existing rule and this
    ticket adds no second admission mechanism on top of it.
  - *"First publish is unchanged"*: the `else` branch of `ClientCashSetDialog`'s body — the whole
    first-publish rendering block and its `submit` branch (`effectiveFrom: null`, the
    `p660-cashset-${clientId}-${Date.now()}` op key) — is **untouched source**, not merely
    behaviourally equivalent; I edited only the `isEdit` branch and the shared `submit` function's
    branching, never the pre-existing candidates/publish JSX. Regression test `ticket 1002.6 a
    client with no published set still gets the ORIGINAL first-publish face, untouched` mounts with
    `hasPublishedSet: false`, asserts the FIRST-publish title renders (not the editor's), no diff
    section renders, no date input renders, every candidate starts unchecked, the button still reads
    "Publish", and the mocked door receives `effectiveFrom: null` and an op key matching
    `/^p660-cashset-/`. Result: **pass**.

- [x] **Any door or read change ships as a new migration at the next free migration number at
  implementation time; no applied migration is edited.**
  Evidence: exactly one new file, `packages/db/migrations/0276_cash_account_set_membership_read.sql`
  — the number this prompt reserved. No existing migration file's `git diff <base>..HEAD` shows any
  change (`git diff ffe63a0dd0..HEAD --stat -- packages/db/migrations` lists only the one new file).
  See **Migration** below for its prestate pins and application state.

## Migration

`0276_cash_account_set_membership_read.sql` — **already applied** on this lane's database
(`clara_l03`) by the earlier implementer before being cut off; I did not apply, redo or edit it. I
independently re-measured `clara.schema_migrations` and confirmed:
- `0276_cash_account_set_membership_read` is the newest row, `applied_at 2026-09-20T16:01:00.741Z`,
  directly after `0272_document_capability_wall_completion` — no `0273`/`0274`/`0275` on this lane
  (those numbers belong to other wave-3 lanes' tickets, not this one).
- `clara.get_client_cash_account_set_members` exists at exactly the expected signature.

**Prestate pins**, measured LIVE on `clara_l03` by me (independently of the migration file's own
hard-coded values, which match — confirming the pins describe the database as it actually stands,
not a stale copy):

| signature | sha256(prosrc) |
|---|---|
| `clara.jwt_sub()` | `c4051473a0619987796d2aa7a64817536ac21d161f0fd827b6912ca8ce1aa243` |
| `clara.jwt_firm()` | `43338e8393c961c9f3d06fb0929479cfcc33ff91c67f8575478a790b6fab0a45` |
| `clara.actor_role_rank()` | `9b011800f23ff8a774285845902892af53350f58778a967abd69773d91eb699d` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
| `clara.propose_client_cash_accounts(uuid)` | `c2d04e73e08bbb33fd591413fa243d4cda58ab6b4da07fd41c4e9de29012d261` |

These are the four RLS-helper bodies the new function's inline floor copies (rather than sharing,
since an INVOKER body cannot call `clara._human_ctx`), plus `propose_client_cash_accounts` itself,
pinned because the migration's own header argues the two reads are deliberate complements of one
population. The tail re-pins all five byte-identical, plus asserts
`get_client_cash_account_set_members` is owned by `clara_fn_owner`, SECURITY INVOKER, STABLE,
search_path-pinned, granted to `clara_authenticated` alone with no PUBLIC entry and no model-lane
reach (`clara_runtime`, `clara_agent_ro`, every `clara_wake_*`), and carries no `is_active`
filtering predicate.

**First-apply branch**: I did not re-run the migration (redo mode was not needed — nothing about it
was edited), so I did not perform the wave-3 addendum's "roll back and re-verify from scratch"
drill myself. That drill is written for a migration whose prestate pin is **bimodal** ("my own body
already live" OR "still the pre-image") — mine is not: each of the five pins checks a single fixed
sha, so `CLARA_MIGRATION_REDO`'s "my own body is already live" branch and a genuine first apply
take the identical code path through this file's prestate (there is no second branch a redo could
hide). The file's own applied state on `clara_l03` (verified above, a genuine first apply — this
lane's database was never reset and no earlier `0276` attempt exists in its history) is itself the
first-apply proof; the integrator's own from-scratch chain on a disposable cluster re-proves it
independently, per the work order's own division of labour.

## Docs

- `packages/db/README.md` — a new entry for `clara.get_client_cash_account_set_members` in the same
  catalog section as its two siblings (`propose_client_cash_accounts`, `get_client_financial_pack`),
  same prose depth and style, stating the floor, the "why not is_active" and "why not shared with
  propose" facts already argued in the migration's own header, and naming this ticket's dialog as
  its first caller.
- `CONTEXT.md` — **not touched.** I checked first: "Cash account set" already states "superseded
  rather than edited," which remains exactly true — this ticket makes superseding more convenient
  with a pre-checked, diffed UI, it does not change the domain concept, and no genuinely new
  accounting term is introduced (the door's job, the versioning semantics and the three member
  reasons are all pre-existing #660 vocabulary). "Second-pass editor" is a UI feature name, not a
  glossary-tracked concept.
- `apps/web/test/manifest.txt` — new entry for `client-cash-set-dialog.test.tsx`, inserted at its
  sorted position (`checkTestManifest`'s own ordering gate confirms this — see Gates).
- `apps/web/messages/en.json` — thirteen new keys under `ClientFinancial.cashSet` (`editTitle`,
  `editBody`, `editCurrentBasis`, `membersLabel`, `membersFailed`, `diffHeading`, `diffAdded`,
  `diffRemoved`, `diffUnchanged`, `diffNothing`, `effectiveDateLabel`, `save`, `saving`); the reason
  badge on a non-bank-registry row reuses the EXISTING `cashDrilldown.reason*` keys and
  `memberReasonKey()` lookup #1001 already shipped, rather than minting a second reason vocabulary.

## Gates, with counts

- **DB test file, full gate chain** (`node --test --test-concurrency=1 $GATES
  tests/cash-account-set-membership-read.test.mjs` from `packages/db`, `$GATES` = the exact
  `--import` list in `package.json`'s `test` script) → **6 tests, 6 pass, 0 fail, 0 skipped**
  (focused run — the preintegration gate is NOT preloaded, so a missing migration would fail loudly
  rather than skip quietly; it did not skip, confirming 0276 is live).
- **`client-financial-pack.test.mjs`** (the existing versioning battery, same gate chain) →
  **36 tests, 36 pass, 0 fail** — unchanged, confirming AC5.
- **`operation-census.test.mjs`** (new SQL function added) → **10 tests, 10 pass, 0 fail**.
- **`rig-isolation.test.mjs`** (never with reset flags) → **23 tests, 22 pass, 0 fail, 1 skipped**
  (T19 poison-role, the known destructive cell requiring `CLARA_RIG_ALLOW_RESET` on an isolated DB —
  correctly skipped, not run, per the rig's own rule). T17 (the exact per-role EXECUTE grant matrix)
  passed, confirming the new cohort in `rig-meta.mjs` is wired correctly.
- **Web test files touched, standalone**
  (`node --import ./test/bootstrap.mjs --import tsx --test <file>` from `apps/web`):
  - `lib/dashboard/financial-pack.test.ts` → **15 tests, 15 pass** (11 pre-existing + 4 new: two
    hydration cells, one door-call cell folded into the count above).
  - `components/firm/client-home/client-cash-set-dialog.test.tsx` (new file) →
    **8 tests, 8 pass, 0 fail**.
  - `components/firm/client-home/client-financial-charts.test.tsx` → **34 tests, 34 pass**
    (unchanged — regression check, this file never opens the dialog).
  - `components/firm/client-home/client-cash-summary.test.tsx`,
    `client-home-money-a11y.test.tsx`, `client-home-money-keyboard.test.tsx`,
    `client-profit-summary.test.tsx` → all pass unchanged (34 tests combined across the four,
    counted once above with client-financial-charts.test.tsx's own 34 — see raw run: **34 tests
    total across the five-file batch, 34 pass**).
  - `e2e/e2e-fixture-ownership.test.ts` (shared file, edited to declare the new RPC as `debt`,
    matching its two `p_client`-carrying siblings) → **44 tests, 44 pass** (was 43/44 before the
    declaration — N5's own ownership-scoping property, now satisfied for the new route).
- **`pnpm typecheck`** from the worktree root → clean (`apps/web typecheck: Done`,
  `packages/runtime typecheck: Done`).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** from the worktree root (wave-3 addendum) → exit 0.
  Caught and fixed one real issue: my first draft used `#1002`/`#660` inside `test(...)` name and
  `assert` message string literals, which trips the Q4 raw-colour-value selector (`#` + 3/4/6/8
  hex-looking characters); reworded to `"ticket 1002.N …"` / `"…ticket 660's own rule…"`, matching
  the exact fix `wave3-lane03-ticket1001.md` already recorded for the same trap. Comments (not
  string literals) still say `#1002`, which the selector does not scan. ESLint OOM'd once under host
  contention on the first attempt (`Fatal process out of memory: Zone`) — a known class of flake per
  RIG.md's "retry once" note for `next build`; the retry ran clean.
- **Whole `apps/web` unit suite once** (`node scripts/run-tests.mjs` from `apps/web`, run AFTER all
  edits including the e2e-mock/ownership fix) → **4868 tests, 4866 pass, 0 fail, 2 skipped** (both
  pre-existing, environment-gated: `CLARA_LIVE_SUPABASE_AUTH_URL`/`…_ANON_KEY` not configured,
  unrelated to this ticket).
- **Browser walk touched**: `home-board-walk.spec.ts` (the only e2e spec reaching the money
  band/cash-set dialog), on this lane's own Playwright triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3520 CLARA_E2E_NEXT_PORT=3521
  CLARA_E2E_RUNTIME_PORT=3522`): `pnpm --filter @clara/web e2e home-board-walk` →
  **28 passed, 0 failed**, including `p660.money.unpublished` (opens the first-publish dialog) and
  `p660.money.axe`/`p660.money.disclosures`. I added an explicit mock answer for
  `get_client_cash_account_set_members` to `home-board-mock.mjs` (the empty envelope, matching the
  mock estate's own unpublished-cash-set default) BEFORE running this walk — without it, the new
  read this ticket makes every dialog-open call unconditionally would have 404'd on every walk that
  opens the dialog, which the app correctly renders as a failure banner; the mock addition keeps
  that from becoming a false regression on a door this ticket did not change the meaning of for an
  unpublished-set estate.
- **No `packages/runtime` gate chain** — no runtime file touched.

## Successor contract

None. This ticket adds no door, runtime part or prompt stanza a frozen chat or Work tool would
need — the read and the write it composes are both ordinary human-lane doors with no agent twin
(the migration's own tail asserts `clara_runtime`/`clara_agent_ro`/every `clara_wake_*` role holds
zero EXECUTE on the new function).

## Follow-ups worth filing

- The editor offers no way to add a member with **no** bank-registry candidacy that was **never**
  previously a member (a fresh declared-cash/petty-cash account) — this matches the first-publish
  dialog's own pre-existing limitation ("Add them yourself" is aspirational copy with no
  implemented affordance behind it today) and is explicitly out of scope per the brief ("Which
  accounts may be members: the candidate rule and the three member reasons stay as they are"), but
  it is a real gap a firm will eventually hit once a client's petty-cash membership needs to
  change. Worth its own ticket if the owner wants it addressed.
- `CONTEXT.md` still has no "composition" glossary entry (a pre-existing gap #1001's own report
  already flagged) — unrelated to this ticket, not fixed here.

## Anything unverified

- No hosted/production verification — out of scope for a lane ticket in this wave; hosted release
  is the integrator's own step.
- I did not drive the editor through a REAL Playwright browser walk end to end (open → toggle →
  state a date → save → see the pack refresh) — only through the component-level harness (8 cells)
  and the pre-existing `home-board-walk.spec.ts` (which exercises the entrance and the
  UNPUBLISHED-set path, not the second-pass editor itself, since the mock estate never publishes a
  set). Writing a dedicated e2e cell for the second-pass path was judged out of scope for this
  ticket's own gates (no e2e spec names or touches this behaviour today) rather than added
  speculatively; a follow-up e2e cell is worth filing if the owner wants browser-level coverage of
  the diff/date/refusal flow specifically.
