# Wave 4, Lane 06, Ticket #1032 — the firm-setup TIN item is required-or-optional, not seeded-or-not

Branch `riders/w4-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\656`, base `cd2925391`.
Commits (`cd2925391..HEAD`, this ticket only — #1031 landed before me):

```
363dbbf8f fix(web): #1032 firm-setup renders TIN's required-or-optional marking
f3a4147ab fix(db): #1032 the firm-setup TIN item is required-or-optional, not seeded-or-not
```

Status: **done**.

## The ticket

Owner's ruling (comment dated 2026-09-23, Option A) on issue #1032 (#891's own remainder): the
TIN item is seeded for every firm regardless of turnover; it is REQUIRED only when the turnover
answer makes MyInvois mandatory, OPTIONAL otherwise (including a voluntary answer from a
sub-threshold firm), and shows an answer form in both cases. The required counter,
`required_outstanding` and the commit door count it only when required. `mpers_eligibility` (the
other #891 conditional row) keeps its present behaviour unchanged.

Verified live on this branch before building: `gh issue view 1032 --comments` (label
`ready-for-agent`, one comment carrying the owner's ruling and the Agent Brief). Not previously
satisfied — 0257/0259 (already applied on this database) still carried TIN's old
seeded-or-not/applicable-inapplicable-undetermined shape.

## The seams tested

- **DB doors**, through `humanQuery` as a named admin persona, against the real rig
  (`clara_l06`, 127.0.0.1:55746): `clara.seed_firm_setup_plan`, `clara.get_firm_setup`,
  `clara.answer_firm_setup_item`, `clara.defer_firm_setup_item`, `clara.commit_firm_setup`.
- **The applicability derivation itself**, indirectly, through the doors above (it is ungranted —
  no direct door call is possible or appropriate).
- **The web checklist's rendered behaviour** (`FirmSetupChecklist`, `FirmSetupItemForm`) against a
  mocked `get_firm_setup()` envelope shaped the way the recut door now emits it.
- **A real browser** (`firm-setup-walk.spec.ts`, fixture-backed) for the mechanics an optional
  item's skip flow depends on (focus return, the skip Dialog, a11y) — unaffected in shape by
  #1032, verified still green with the fixture's note text brought current.

## Acceptance criteria, each with its evidence

1. **A firm answering turnover below the threshold is seeded the TIN item as optional; a cell
   proves it is answerable and that the required total, `required_outstanding` and the commit
   door ignore it.**
   Evidence: `p1032.tin.always_seeded_required_or_optional`
   (`packages/db/tests/firm-setup-applicability.test.mjs`) — PASS. Seeds a firm, answers
   turnover `'<RM1M'`, shows `tin` `state:'pending'`, `applicability:'optional'`,
   `required:false`, `counter.required_total` staying 8, `tin` absent from
   `required_outstanding`, then answers TIN anyway (`required` stays `false`).
   `p1032.commit.refuses_until_tin_answered_when_required`'s second half commits a firm with
   turnover `'<RM1M'` and TIN left **unanswered** — PASS.

2. **A firm answering turnover at or above the threshold has the TIN item required; a cell proves
   the commit door refuses until it is answered.**
   Evidence: `p1032.tin.always_seeded_required_or_optional` — turnover `'RM1M-5M'` makes
   `tin.applicability:'required'`, `tin.required:true`, `counter.required_total` moves 8→9,
   `tin` joins `required_outstanding` while pending, leaves it once answered — PASS.
   `p1032.commit.refuses_until_tin_answered_when_required` — `commit_firm_setup` refused
   `CLR10 required_items_outstanding` naming `"tin"` while pending; succeeds once TIN is
   answered — PASS. (Also proves `defer_firm_setup_item` refuses `CLR10
   firm_setup_item_required` for the same dynamically-required row — not named in the brief's Key
   Interfaces, added because the web surface's Required badge already hides the skip control the
   database door had not yet been taught to refuse; see "Successor contract / residuals" below.)

3. **Flipping the turnover answer either way changes only the marking and keeps an existing TIN
   answer; a cell proves both directions.**
   Evidence: `p1032.tin.flip_keeps_answer_both_ways` — answers TIN while optional, answers
   turnover mandatory (TIN flips to required, `answer` unchanged, `state` stays `'answered'`),
   answers turnover back exempt (TIN flips back to optional, `answer` **still** unchanged) — PASS.

4. **The checklist renders the optional marking and its sentence, and the bounded group walk
   offers an optional pending item; rendered cells prove both, and the walk's count and step list
   agree.**
   Evidence: `fs.web.18` (`apps/web/components/firm-setup/firm-setup-checklist.test.tsx`) — an
   optional TIN row renders "Optional" (never "Not applicable"); a group holding one required and
   one optional pending fact offers "Answer these 2 together" and the opened walk shows
   "Question 1 of 2" — PASS. `fs.web.19` — a required TIN hides its skip control, and opening its
   form shows the accountant sentence with no "Optional" label — PASS. No component code change
   was needed: `item.required` (now correctly driven by the recut door) already drives the
   Required/Optional badge, the skip control and the bounded-walk step set generically
   (`isWalkStep` never excluded an item for being optional).

5. **The cells #891 pinned on the seeded-or-not shape are rewritten to the new shape and pass;
   the eligibility item's cells pass unchanged.**
   Evidence: `p891.mpers.entity_type` and `p891.answer.survives` are byte-for-byte unedited and
   PASS (5/5 in the file, run focused). `p891.tin.turnover` and `p891.counter.excludes` (TIN's own
   old-shape cells) are replaced by `p1032.tin.always_seeded_required_or_optional`,
   `p1032.tin.flip_keeps_answer_both_ways` and `p1032.commit.refuses_until_tin_answered_when_required`,
   gated on their own stem (`firm_setup_tin_required$`, 0311) rather than 0257's — the
   `activity-feed.test.mjs` multi-stem-in-one-file idiom — so a database carrying 0257 without
   0311 skips them loudly instead of asserting a shape TIN can no longer take.
   Two DOWNSTREAM #648/#934 cells needed their own literal numbers/text moved as a direct,
   narrow consequence (TIN is now among the rows a first reconciliation seeds, where before it was
   held back like `mpers_eligibility` still is): `p648.seed.reconcile` (10→11 seeded),
   `p648.seed.empty` (13→14 seeded, `rows.rows.length` 13→14), and
   `p934.notes.accountant_text`'s independently-transcribed `tin.user_note` pin, updated to 0311's
   new sentence. All corrected, all re-run green (see Gates below).

6. **Ships as a new migration at the next free number; no applied migration is edited; every
   recut body is pinned by a sha measured on the rig.**
   `packages/db/migrations/0311_firm_setup_tin_required.sql` — the number the work order reserved
   for this lane. No existing migration file touched. Prestate pins below.

## Migration and its prestate pins

`0311_firm_setup_tin_required.sql`, applied via `pnpm db:migrate` (`node scripts/migrate.mjs`) —
one clean apply, prestate and tail both reported OK, no redo used.

Five bodies recut (`create or replace function`, exact prior signature/owner/SECURITY
DEFINER/volatility/search_path/ACL re-measured unmoved at the tail):

| function | prestate sha256(prosrc), measured live on clara_l06 before applying |
|---|---|
| `clara._firm_setup_applicability(uuid,text)` | `122cab3fc541de587ea2b57e24fef79b9d2b867727cfc889ad652981ea71dcb1` |
| `clara.seed_firm_setup_plan(text)` | `6d9a83b5d456b5a175db09537a16c32f22dc3bb56195c52fd9ae5ad6f080c056` |
| `clara.get_firm_setup()` | `be993e7de580e6c272d083a7681184af083e7dde067750817309c92c992acd08` |
| `clara.commit_firm_setup(uuid,uuid,text)` | `c527f0bf01a9a583d18180270a21bac4c7110b4daf64927ef7967bc428e9dc23` (its first recut ever) |
| `clara.defer_firm_setup_item(uuid,uuid,text,text,text)` | `aae9f7a024a894ea23205f7c7aeb9adc1a28a51532bb822d4743db13dc53edff` |

Neighbour pinned as a non-regression baseline (not recut, called by nothing this file touches,
but sharing the same closure and review history): `clara.answer_firm_setup_item(uuid,uuid,text,
jsonb,text)` — `2674cde3ba5feeed4fe9eba2f0a8bfb378d8b150d8929d7df5a51c1632de9d3c`. Re-measured
byte-identical at the tail.

Data: `tin.user_note` backfilled (disable/enable `t_firm_setup_keys_append_only`, the same shape
0258 established) from 0258's text to: *"The firm's MyInvois TIN. Required once the firm's
turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still
record it if the firm has registered for MyInvois voluntarily."* The catalogue's fifteen-row hash
over every OTHER pre-existing column (0257/0259's own pin) is unmoved.

No `rig-meta.mjs` cohort added: no new function name, no grant change (matching 0257's own
reasoning and `rig-meta.mjs`'s explicit `#979` precedent, "NO COHORT, NO NEW NAME, NO GRANT
CHANGE").

## Gates, with counts

- **DB test files touched**, full gate chain preloaded (`node --test --test-concurrency=1 $GATES
  tests/firm-setup-applicability.test.mjs tests/firm-setup.test.mjs
  tests/firm-setup-user-notes.test.mjs tests/firm-setup-education-tips.test.mjs`): **30 pass, 0
  fail**. Focused (no gate chain), `firm-setup-applicability.test.mjs` alone: **5 pass, 0 fail**
  (confirms the new stem's loud-failure path works: before the migration applied, the three
  `p1032.*` cells failed loudly with "the #1032 firm-setup-tin-required lane is required for a
  focused run: apply 0311_firm_setup_tin_required.sql" — genuine red-for-the-right-reason, then
  green after applying).
- `operation-census.test.mjs`, full gate chain: **10 pass, 0 fail**.
- `rig-isolation.test.mjs`, full gate chain: **22 pass, 1 skip** (T19 poison-role, destructive,
  requires `CLARA_RIG_ALLOW_RESET` — never set, per rule).
- `pnpm typecheck` (apps/web + packages/runtime): clean.
- `CI=true GITHUB_ACTIONS=true pnpm lint` (every workspace): exit 0.
- `node scripts/check-frozen-workflows.mjs`: OK, 312 frozen files, 55 modules, 3 retired — no
  drift (packages/runtime untouched by this ticket; run as a sanity check).
- **apps/web whole unit suite** (`node scripts/run-tests.mjs`): **4986 pass, 0 fail, 2 skipped**
  (pre-existing, unrelated to this ticket).
- **apps/web e2e**, `firm-setup-walk.spec.ts`, on this lane's triple (APP_ORIGIN
  `https://127.0.0.1:3550`, NEXT_PORT `3551`, RUNTIME_PORT `3552`): **5 pass, 0 fail**.

No Windows-only reds encountered in any of the above.

## Docs updated (same commits)

- `CONTEXT.md` — "Firm setup applicability" entry rewritten in place (not appended) to describe
  BOTH shapes now live (asked-or-not for `mpers_eligibility`; required-or-optional for `tin`),
  each with its own `_Avoid_` line.
- `packages/db/README.md` — the firm-setup doors table's `defer_firm_setup_item`/
  `commit_firm_setup` rows updated to name the widened predicate; a new `**#1032 (0311, …)**`
  paragraph appended after `**#935 (0259, …)**`, matching the file's own append-per-migration
  convention, explicitly closing the residual `**#891**`'s own paragraph named ("deciding that a
  seeded, applicable TIN should block a commit").
- `packages/db/tests/README.md` — the "Firm setup applicability (#891, …)" section's own text
  corrected to say which two of its four original cells were rewritten and why; a new "Firm setup
  TIN required-or-optional (#1032, `0311_…`)" section added describing the new stem, gate file and
  all three new cells; the #648/#934 downstream count changes recorded.
- `apps/web/lib/firm-setup/types.ts` — `FirmSetupApplicability`'s doc comment widened to the new
  literal union and both shapes; `FirmSetupItem.required`'s and
  `isHiddenByApplicability`/`isNowInapplicable`'s doc comments corrected to say TIN no longer
  reaches the states they once described it reaching.

## Successor contract

None. Firm setup is an admin settings surface (`/settings/setup`) with no relationship to a
frozen chat turn or the Work tool; nothing here is a frozen chat/Work-tool body, and no frozen
body needed anything from this ticket. `node scripts/check-frozen-workflows.mjs` confirms no
manifest drift.

## Deliberately left / named residuals

- `clara.commit_firm_setup`'s outstanding-items query still lacks the `k.retired_at is null`
  filter `get_firm_setup` carries on every one of its own surfaces (0258's own filter). This is
  PRE-EXISTING (0257/0259 both left `commit_firm_setup` an untouched baseline for the same
  reason), harmless today (no row is ever retired), and out of this ticket's own scope — widening
  it here would be a second, unrelated fix riding this migration's diff. Named so a future
  retirement ticket does not rediscover it as a surprise.
- `defer_firm_setup_item`'s widened required-refusal guard is NOT named in the ticket's own Key
  Interfaces list. It was added anyway: without it, the web surface's Required badge (now
  correctly driven by the recut `get_firm_setup`) hides the skip control for a dynamically-
  required TIN, but the DATABASE DOOR itself would have kept admitting the same skip directly —
  the exact "two notions of required disagreeing" defect class 0259's own fix round exists to
  document. Proven refused by `p1032.commit.refuses_until_tin_answered_when_required`.

## Anything unverified

- Nothing load-bearing. The migration's tail assertions, the DB cells and the web cells all ran
  green on this rig; nothing here is asserted without a command or a cell backing it.
- I did not run a from-scratch chain proof (0001→0311) on a disposable cluster — the work order
  reserves that to the integrator; this lane's rig already carried the full 0001..0295+0310 chain
  before this ticket, and 0311 applied cleanly on top of it once.
