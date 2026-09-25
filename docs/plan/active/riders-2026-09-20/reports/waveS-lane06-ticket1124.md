# Wave S · lane 06 · ticket #1124 — catch a stale worktree install before it looks like a code failure

**Status: DONE.** No migration (none needed, none written — matches the SWEEP-PLAN lane table,
`#1124 (no)`, and the ticket's own implicit "runtime, test and CI only" characterisation of lane L6).

- Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
- Lane database `clara_l08` (127.0.0.1:55748); untouched by this ticket — the deliverable is one
  documentation edit, no code, no SQL, no test file.
- Commit (`git log --oneline 7bc5a710f..HEAD`, on top of #1044's four commits, #1128's three, #1129's
  one, #1131's one and #1126's two, all already landed on this branch before I started):

| commit | subject |
|---|---|
| `8a944c40b` | `docs(rig): #1124 name the stale-node_modules symptom and its one-line fix` |

File touched: `docs/plan/active/riders-2026-09-20/RIG.md` only — exactly the file the SWEEP-PLAN's
shared-files table assigns this ticket ("`docs/plan/active/riders-2026-09-20/RIG.md` | **L6 only**
(#1124)").

**First action, as instructed:** `git status` (clean) and
`git log --oneline 7bc5a710f..HEAD` — the eleven commits above (#1044 ×4, #1128 ×3, #1129 ×1, #1131
×1, #1126 ×2) already landed, exactly WORK-ORDER.md's addendum shape.

**The ticket is live on this branch.** `gh issue view 1124 --repo BELCORT-SDN-BHD/clara --json
number,title,body,comments` (plain `--comments` text mode printed nothing in this shell, the same
pager quirk #1126's and #1131's own reports recorded; the `--json` form worked). **0 comments**, so
the body's own Agent Brief is the sole GitHub-side contract; no owner-ruling comment dated 2026-09-20
exists on this ticket to override it. Checked `RIG.md` in both the worktree and the main checkout
(`C:\Users\zhant\Desktop\clara-rebuild`) for any existing note — `grep -i
"shadcn\|frozen-lockfile\|stale.*node_modules"` returned nothing in either copy — confirming the gap
the ticket names is still open.

**Two acceptance criteria** (from the Agent Brief):
1. "A worktree with a stale `node_modules` is caught (documented shortcut, or an automated preflight
   check) before an agent reaches the confusing `Cannot find module '@shadcn/react/...'` failure
   shape."
2. "The fix is documented once, in a single place other lanes' agents would naturally find it, rather
   than being independently rediscovered per lane."

Out of scope, per the ticket's own words: "Changing how `node_modules` is installed or shared across
worktrees in general (this is about catching staleness quickly, not restructuring the install)."

---

## The seam I tested at, and why I did not build the automated-check alternative

The brief names two candidate "Key interfaces": "The rig-setup documentation (`RIG.md`...)" and,
conditionally, "Whatever script or convention bootstraps a new worktree, **if a preflight check is
preferred over a documentation note**." The brief's own phrasing treats the script as optional; the
SWEEP-PLAN's lane table marks this ticket's migration column "no" and its shared-files table assigns
it `RIG.md` only, and lane L6 as a whole is characterised as writing "no database object at all." I
checked, before choosing, whether a genuinely side-effect-free automated check was available at all,
since that would have changed the call:

- `node_modules/.modules.yaml` (pnpm's own installed-state record) in this worktree carries no
  lockfile hash or content digest to compare against `pnpm-lock.yaml` — only `hoistedDependencies`,
  `pendingBuilds`, `prunedAt`, `skipped`, `virtualStoreDir` (checked directly:
  `grep -n "Hash\|lockfileVersion\|pendingBuilds" node_modules/.modules.yaml`).
- `pnpm install --dry-run` — which would "perform full dependency resolution to report potential
  changes without modifying the disk, lockfile, manifests, or `node_modules` directory" — was checked
  via Context7 against `/pnpm/pnpm.io` (query: "install --frozen-lockfile flag behavior and dry-run
  option to check if node_modules is in sync with lockfile without installing"). The docs place that
  flag's introduction at pnpm **11.8**. This repo pins `packageManager: "pnpm@10.33.0"`
  (`package.json`), and `pnpm install --help` in this worktree confirms `--dry-run` is not a
  recognised flag on the pinned version (`grep -i "dry-run\|frozen" ` against the real `--help`
  output shows only `--frozen-lockfile`/`--prefer-frozen-lockfile`).

So on the pinned toolchain there is no way to *check* staleness without side effects short of running
the install itself, and hand-rolling a `node_modules`-vs-`pnpm-lock.yaml` diff (walking
`node_modules/.pnpm` against the lockfile's package list) is exactly the kind of new, unproven
detection logic that risks false positives across every future lane's gate chain for a ticket the
plan itself scoped to one file. I built the documentation seam only:

| seam | why it is the seam the brief and the plan give me |
|---|---|
| `RIG.md`'s general (non-wave-dated) instruction block, read by every lane before any command | the brief's AC2 names "a single place other lanes' agents would naturally find it"; every lane's own task prompt lists `RIG.md` as required first reading (mine did: "READ FIRST, in this order: ... RIG.md ..."); the SWEEP-PLAN's shared-files table assigns exactly this file to this ticket and no other |

## AC1 — "caught ... before an agent reaches the confusing failure shape"

**Met, as a documented shortcut** (the acceptance criterion's own first alternative). The new
paragraph in `RIG.md` (inserted right after the existing `pnpm typecheck` / `pnpm lint` bullet and
before the pre-existing "Known Windows-only reds" paragraph, so it sits in the same "read this before
you trust a red" position as that paragraph already occupies):

- Names the cause in one sentence (a worktree's `node_modules` is installed once; a later
  `pnpm-lock.yaml` change is not picked up on its own).
- Quotes the **exact** failure strings from the five wave-4 reports, verified against those reports
  directly rather than only against the ticket's paraphrase (`grep -n -B2 -A5 "shadcn/react"` against
  all five): `Cannot find module '@shadcn/react/message-scroller'` (typecheck),
  `Cannot find package '@shadcn/react'` (web unit tests), `Module not found: Can't resolve
  '@shadcn/react/...'` (`next build`).
- Gives the one-line fix in the house style already used by three earlier waves' own `RIG.md` files
  (`refresh-wave-2026-09-14/RIG.md:12`, `refresh-wave-2026-09-15/RIG.md:47`,
  `refresh-wave-2026-09-18/RIG.md:45`, all `CI=true pnpm install --frozen-lockfile --prefer-offline`),
  extended to cover "present but missing a recently-added package," not only "absent or corrupted"
  (those three files' existing wording covers only the latter — the gap AC1 and AC2 both point at).
- States as a directive, not a suggestion, that this should be run "before you treat the first `pnpm
  typecheck` / `pnpm lint` / build / test failure of a session as a real defect" — i.e. proactively,
  the same first-class status the file already gives `git status`/`git log` as mandatory first
  actions, so a lane that follows the file never reaches the confusing failure at all.
- Confirms the fix is genuinely side-effect-free when nothing is missing (0 packages added, lockfile
  and `git status` unchanged — cited from the wave-4 reports' own measurements, not asserted new) so a
  lane loses nothing by running it defensively every session.

## AC2 — "documented once, in a single place other lanes' agents would naturally find it"

**Met.** `RIG.md` is the one file every lane's task prompt names as required reading before the
ticket (confirmed against my own prompt and against the shape every other `waveS-lane*-ticket*.md`
report in this reports directory describes). The new paragraph names all five wave-4 reports that
independently rediscovered the fix
(`wave4-lane01-ticket945.md`, `wave4-lane02-ticket930.md`, `wave4-lane05-ticket933.md`,
`wave4-lane06-ticket1031.md`, `wave4-lane07-ticket1041.md` — confirmed present on disk:
`ls docs/plan/active/riders-2026-09-20/reports/ | grep -E "wave4-lane0[1257]-ticket(945|930|933|1041)"`
plus a direct check for `1031`, all five found), so a future lane hitting the symptom is pointed at
one line in one file instead of needing to find and read five separate ticket reports the way this
gap was diagnosed five separate times.

## Gates, with counts

| gate | command | result |
|---|---|---|
| `pnpm typecheck` (repo root) | `pnpm typecheck` | 0 errors; `apps/web typecheck: Done`, `packages/runtime typecheck: Done` |
| `pnpm lint`, lane-correct base | `FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0**, full monorepo chain |
| `pnpm lint`, runner-exact env | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0**, same chain |
| `git status` after commit | `git status` | clean, only the intended commit ahead of #1126's tip |
| `git diff --stat` (pre-commit) | `git diff --stat` | `docs/plan/active/riders-2026-09-20/RIG.md | 19 +++++++++++++++++++`, 1 file changed — nothing else touched |

**`FREEZE_BASE_REF=7bc5a710f` note, recorded because it is not obvious from a bare `pnpm lint` run.**
A bare `pnpm lint` (no override) fails `check-frozen-workflows.mjs` with 38 violations, ALL of them
`REMOVED-VS-BASE`/`UNLOCKED-VS-BASE`/`REGISTRY-DOWNGRADE` entries comparing this branch against the
**live** `origin/main` ref, which has advanced 62 commits past this lane's actual base (this
worktree's own `git status` shows "Your branch and 'origin/main' have diverged, and have 11 [now 12]
and 62 different commits each" — the cut-phase and other post-`7bc5a710f` work on `main` added
`chatTurn_v22`, `claraWork_v6`, `agreementFacts.v1`, `payrollFacts.v1`, etc. that this lane branch does
not have yet). I verified this is pre-existing and unrelated to my change, not something my edit
caused: `git stash` (removing my one-line RIG.md diff) then `node scripts/check-frozen-workflows.mjs`
alone reproduces the identical 38 violations; `FREEZE_BASE_REF=7bc5a710f node
scripts/check-frozen-workflows.mjs` against that same stashed (unmodified) tree reports **`freeze-lint:
OK — 322 frozen file(s) verified ... ; 57 "use workflow" module(s) all frozen+registered; 3 retired
entr(ies) recorded`**, confirming the branch itself is clean against its own real base and the
override is the correct read, per the task prompt's own instruction ("Wherever a rule says
`origin/main..HEAD`, use `7bc5a710f..HEAD`"). `scripts/check-frozen-workflows.mjs` itself supports
this via `FREEZE_BASE_REF` (`RAW_BASE_REF = process.env.FREEZE_BASE_REF || "origin/main"`), so no
script edit was needed, only the env var at gate time — recorded here rather than left implicit, since
a bare `pnpm lint` on this branch will keep reporting this pre-existing, ticket-unrelated red until
the branch is rebased onto (or merged with) current `main`.

**No test file added or touched** — the ticket's own AC1 accepts "a documented shortcut" without a
code deliverable, and I did not build the optional automated-check alternative (see "The seam I
tested at" above for why), so there is no vertical slice, no red/green cycle, and no vacuity control
to report for this ticket: the deliverable is a documentation paragraph, and WORK-ORDER rule 9 ("docs
in the same commits") covers it directly rather than rule 4's test-first loop, which the ticket's own
acceptance bar does not require here.

**`operation-census.test.mjs` / `rig-isolation.test.mjs`: N/A — no SQL function added** (no
`packages/db` file touched at all). **`check-parts-parity.mjs`: N/A — no `packages/runtime` file
touched.** **`apps/web` whole unit suite / Playwright walk: N/A — no `apps/web` file touched** (the
`pnpm lint` runs above exercise `apps/web`'s own extensive lint selftest suite as part of the
monorepo chain, but that is incidental coverage of an untouched area, not a gate this ticket owes).
**`apps/web/tests/firm-scope-db-pins.corpus.ts`: not touched or rechecked** — rule (d) applies only
when a migration file changed, and none did.

## Migration

**None**, as the ticket instructed to expect. Lane L6 as a whole writes no database object
(SWEEP-PLAN: "**L6 writes no database object at all**"), and this ticket's own deliverable — a
documentation paragraph — never approached `packages/db/migrations`. Confirmed:
`git diff --stat 7bc5a710f..HEAD -- packages/db/migrations` for the whole lane's history (all six
tickets, including this one) is empty. The lane database `clara_l08` was never connected to by
anything this ticket did.

## Docs

- **`docs/plan/active/riders-2026-09-20/RIG.md`** — the ticket's own deliverable; see the diff summary
  above (19 lines added, one paragraph, in the worktree's copy of the file).
- **`packages/db/README.md`**: no change — not a database ticket.
- **`CONTEXT.md`**: no change — no new domain (accounting) vocabulary; this is rig/tooling
  documentation, not a Clara concept.

**A note on `RIG.md`'s two current copies, for whoever integrates this lane.** The main checkout's
`docs/plan/active/riders-2026-09-20/RIG.md` (read as this ticket's required first reading, per the
task prompt) already carries an 18-line "## Sweep wave (2026-09-25)" section (the lane/worktree/port
table for `wS-lane01..08`) that this lane's own branch does not have, because that section was added
to `main` after this branch was cut from `7bc5a710f` (`diff` between the two copies confirms this is
the only divergence besides my own new paragraph). I did not port that section into this branch: it
is not this ticket's content, no other SWEEP-PLAN rule assigns it to me, and copying it would risk
silently forking a table the integrator already owns the current version of on `main`. My new
paragraph sits entirely within the pre-existing, non-wave-dated instruction block (before the file's
first `## Addendum` heading), so it does not compete for the same insertion point as that section and
should merge cleanly; flagging the gap here rather than leaving it for a surprised integrator.

## Successor contract

**None.** This ticket touches no frozen chat or Work tool surface — no `chatTurn_v*`, no
`claraWork_v*` body, no door, no zod input, no prompt stanza, and no `packages/runtime` file at all.
It is a one-file documentation change.

## Follow-ups worth filing

1. **The "more robust" alternative (an automated preflight check) is still open, deliberately.** If a
   future ticket wants it, the blocker recorded above is real: this repo's pinned `pnpm@10.33.0` has
   no side-effect-free way to detect a stale install (no `--dry-run` on `install` until pnpm 11.8, and
   `node_modules/.modules.yaml` carries no lockfile digest to compare against). Either upgrading the
   pinned pnpm version, or accepting a hand-rolled `node_modules`-vs-lockfile diff (with the false
   positive/negative risk that carries, given optional and platform-specific dependencies), would be
   the two ways in; both are bigger than this ticket's own scope.
2. **The gap this note also documents — `pnpm lint`'s `check-frozen-workflows.mjs` step failing by
   default on any lane branch whose base has fallen behind the live `origin/main`** — is not itself
   part of this ticket (scope discipline: my ticket is the stale-`node_modules` gap, not the
   frozen-workflow base-ref gap), but it is the same *class* of problem AC1/AC2 describe: a confusing,
   ticket-unrelated red that every remaining sweep-wave lane will hit identically once `main` advances
   further, with the fix (`FREEZE_BASE_REF=<lane base>`) currently living only in this ticket's own
   report rather than in `RIG.md` itself. Worth a follow-up ticket to add it to `RIG.md` alongside this
   note, since it is the same failure shape (a rig/base mismatch that reads as a code defect) this
   ticket exists to stop happening.

## Anything unverified

- **I did not confirm a *fresh* worktree (one actually missing `@shadcn/react` right now) reproduces
  the exact error strings quoted in the new `RIG.md` paragraph in a live run in this session** — this
  worktree's own `node_modules` is current (this lane's earlier tickets, #1044/#1128/#1129/#1131/#1126,
  all ran `pnpm typecheck`/`pnpm lint` successfully before me, per their own reports), so there was no
  stale worktree available to reproduce against without deliberately uninstalling a package, which
  would have been an unrelated, disruptive change to this worktree's own install for a documentation
  ticket. The quoted strings are instead verified verbatim against five independent wave-4 reports
  that did hit them live (`grep -n` against each report's own text, shown above), which I judge
  equivalent evidence for a documentation claim.
- **Whether the eventual sweep-wave integrator will want my new paragraph re-positioned relative to
  the "## Sweep wave (2026-09-25)" section that exists on `main` but not on this branch** — noted under
  "Docs" above; I made a judgement call (leave it in the pre-existing general block, do not touch the
  wave-dated table) rather than guessing at the integrator's preferred final shape.
