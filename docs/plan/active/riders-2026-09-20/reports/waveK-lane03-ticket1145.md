# riders closing wave · lane 03 · ticket #1145 — the Workflow DevKit schema bootstrap command's durable home

**Status: DONE.**
Branch `riders/wK-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\703`, base `ffb629d73`.
Database `clara_c03` at `127.0.0.1:55742` — untouched by this ticket (no migration, no SQL object,
no database command run). Playwright triple `https://127.0.0.1:3620 / 3621 / 3622` — unused, this
ticket touches no `apps/web` file.

Start state, checked first per rule 1: `git status` clean; `git log --oneline ffb629d73..HEAD`
showed the five commits landed by this lane's earlier implementers (#1152's three: `6ee02513d`,
`05aad4851`, `3a26bc94a`; #1151's two: `b141cf186`, `fe48906db`). No landed work was redone.

**New head after this ticket:** `aec3f45d7`, one commit, naming `#1145`, ending
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

No message arrived mid-task addressed to the orchestrator (rule (f) did not fire).

---

## The ticket, verified live on this branch before building

`gh issue view 1145 --repo BELCORT-SDN-BHD/clara --json title,body,comments`: the issue body is the
only Agent Brief and there are **zero comments**, so no owner ruling comment exists on this ticket
and no re-brief was needed.

| the ticket's claim | measured on this branch before a line was written | verdict |
|---|---|---|
| No migration in this repository creates the `workflow` schema | confirmed by inspection: no `packages/db` migration references `create schema workflow` or `workflow.workflow_runs`; the schema is created only by the dependency bin the ticket names | **live** |
| `RIG.md` "now carries it in its rig rules, on the released head" (the interim home) | confirmed: my worktree's `docs/plan/active/riders-2026-09-20/RIG.md` (cut at `ffb629d73`) already carries the paragraph starting "The `workflow` schema is PROVISIONED, not migrated, and one command does it" immediately under "Database env for every db command or test" | **live** |
| The root `README.md` under "Develop" does **not** yet carry this line | confirmed by reading `README.md` before editing: the "Develop" section had the `#1124` stale-`node_modules` paragraph and nothing about the Workflow DevKit schema | **live, the gap the ticket describes** |
| The riders sweep wave's integration merge lost 22 lane L6 cells to this silent-skip shape | confirmed against `docs/plan/active/riders-2026-09-20/reports/waveS-merge.md` §16.1 and `waveS-gates-C.md` §§1c, 2a, 2b (both files read from the main checkout; a wave-plan-folder citation belongs in this report, not in the durable README paragraph itself — see "A design decision" below) | **live** |

This ticket is expected to need **no migration**; confirmed — nothing in `packages/db` was read,
touched or applied, and no database command was run against `clara_c03` or any other database.

---

## The seam I tested at (written before I edited anything, work order rule 4)

The brief names exactly one public artifact: **the repository's own `README.md`, "Develop"
section** — one paragraph, added there, is the whole deliverable. It names no door, no function, no
component, no CLI exit code as a seam, because there is none: the command the paragraph documents
(`pnpm --filter @clara/runtime exec bootstrap`) already exists and already works (the ticket's own
words: "The command exists, it is one line, and the cut phase's own gate had already used it"). The
defect this ticket fixes is a *documentation-location* defect — the fact was written down in a place
that does not survive past this wave — not a behavioural one.

**No test at a seam the brief does not give me**, per rule 4. I looked for a precedent rather than
inventing a pinning test: the identical pattern — a wave's own `RIG.md` paragraph promoted to the
root `README.md`'s "Develop" section as its durable home — shipped one wave ago for the sibling
`#1124` stale-`node_modules` note, in commit `1d91f1839` (`docs: #1124 the stale-node_modules note
gets a durable home, and its pnpm claim is verified`). That commit touched only `README.md` and that
wave's own `RIG.md`; it added no test file, no `packages/db`, `packages/runtime` or `apps/web`
change. I checked for a content-pinning test on either paragraph and found none: `grep -rn
"readFileSync.*README" scripts apps/web packages/runtime` (excluding `packages/db`, which pins its
OWN `README.md` sections against migrations by a documented house idiom) returns nothing for the
root README, and no test file anywhere in the repository names `#1124`. The house convention for a
plain prose paragraph in the root README, evidenced by its one prior instance, ships without a
pinning cell. This ticket follows that convention rather than widening its own scope (rule 5) by
inventing a new one.

**The vacuity control** (rule 4's "a ticket whose whole deliverable is a test or a lint still needs
it") does not apply here either, read literally: this ticket's whole deliverable is neither a test
nor a lint, it is prose. The closest honest analogue I can offer is a diff-level one, given below.

---

## Acceptance criteria, each with its evidence

The ticket carries no enumerated "AC1/AC2" list (it is a triage-filed prose brief with a single "What
to do" instruction and a suggested wording). I decompose it into the concrete claims the brief makes:

### AC1 — "Add one line to the repository `README.md` under 'Develop'." ✅ MET

`git show --stat aec3f45d7` → `README.md | 12 ++++++++++++`, one file, twelve insertion lines (one
paragraph — "line" in the ticket's own loose sense, matching how the sibling `#1124` paragraph is
also many wrapped lines of Markdown for one paragraph). Placed directly after the `#1124` paragraph
and before the "Component" table, inside the existing "Develop" section (`README.md:11`) — never a
new section, never re-ordering existing content. `git diff --stat ffb629d73..HEAD -- README.md`
shows only additions, no line inside the pre-existing text moved or was reflowed.

### AC2 — the added text is accurate to what is live, not a restatement of the ticket's own suggested wording verbatim (which I improved on rather than copied byte for byte). ✅ MET

I did not paste the ticket's one-line suggestion unchanged; I wrote a fuller paragraph in the same
house shape as the `#1124` precedent (bold ticket-numbered lead sentence naming the fact, the
command, the mechanism, the symptom of its absence, the caution), because the ticket's own body
argues for exactly that shape ("a single place other lanes' agents would naturally find… where a
first-time worker looks before it \[goes wrong]"), and a bare one-liner would give a first-time
reader the command but not the reason to run it before their first DevKit-backed test looks green
for the wrong reason. Every factual claim in the new paragraph was checked against a source before
being written:

| claim in the new paragraph | source |
|---|---|
| "no migration in this repository creates it" | inspected `packages/db` migrations for `create schema workflow` / `workflow_runs`: none exist; the schema is created only by the bin the ticket names |
| "it is not an npm script; it resolves to the dependency bin `@workflow/world-postgres/bin/setup.js`" | `RIG.md`'s own already-live paragraph states this and names the resolved path `packages/runtime/node_modules/.bin/bootstrap` |
| "creates `workflow.workflow_runs` and five sibling tables" | `RIG.md`'s own already-live paragraph, same sentence |
| "cells do not fail — they SKIP, probing `to_regclass('workflow.workflow_runs')`" | `RIG.md`'s own already-live paragraph, same wording (SKIP capitalised there too) |
| "the riders sweep wave's integration merge lost 22 lane cells to exactly this shape" | `waveS-merge.md` §16.1 (three dead ends, concluded no script provisions it) and `waveS-gates-C.md` §§1c/2a/2b (123 pass/0 fail/0 skip once bootstrapped, against the merge's 123 with 22 skipped) — both read from the main checkout before writing the paragraph |
| "bootstrapping a World reds `rig-isolation.test.mjs` T10b afterward (#866)" | `RIG.md`'s own already-live rig-rules bullet states this verbatim, citing #866 |

### AC3 — the paragraph does not become the next stale copy: it does not embed a wave-plan-folder citation that will not survive the wave. ✅ MET, a deliberate departure from over-literal compliance

The ticket's own body cites `docs/plan/active/riders-2026-09-20/reports/waveS-gates-C.md` finding F5
and `waveS-merge.md` §16.1 as its evidence, and `RIG.md`'s existing paragraph (the interim home) also
carries evidence phrased for that wave. I did **not** carry a `docs/plan/active/…` path into the root
`README.md` paragraph itself: that plan folder is archived when the wave closes (the exact mechanism
`RIG.md`'s own preface names for why THIS ticket exists at all — "a rig note that dies with its wave
is how this guidance went stale in the first place"). Citing an ephemeral path from inside the
durable home would reproduce the same defect one level down. I instead named the measured fact ("the
riders sweep wave's integration merge lost 22 lane cells to exactly this shape") without the
soon-to-be-archived path, matching how the sibling `#1124` paragraph names "Five parallel lanes each
spent a cycle rediscovering this separately" without citing any of the five wave-4 lane report paths
that its own commit message cites. The full evidence trail is in `RIG.md`'s live copy (uncommitted by
this ticket, per "Out of scope" below) and in this report, for anyone who wants the receipts.

### AC4 — `RIG.md`'s own copy is left alone, per its "interim state" framing. ✅ MET

`git diff --stat ffb629d73..HEAD -- docs/plan/active/riders-2026-09-20/RIG.md` on this branch is
empty; my one commit touches only `README.md`. See "Out of scope" for why.

---

## A design decision: RIG.md is out of scope for this ticket, unlike the `#1124` precedent

The `#1124` precedent commit (`1d91f1839`) touched both `README.md` and that wave's own `RIG.md`,
rewriting the `RIG.md` copy to open with "the durable home for the next paragraph is the repository's
README… whoever cuts the next wave's RIG.md: point at the README rather than re-deriving this." I
considered doing the mechanical equivalent here — rewriting this wave's `RIG.md` paragraph to open
the same way — and decided against it, for three reasons:

1. **The ticket's own text already treats `RIG.md` as done.** Its "Interim state" paragraph says
   `RIG.md` "now carries it in its rig rules, on the released head. That is the interim home rather
   than the durable one" — describing `RIG.md` as a settled fact, not a file this ticket asks me to
   edit. The "What to do" section names exactly one action: "Add one line to the repository
   `README.md` under 'Develop'."
2. **`CLOSING-PLAN.md`'s shared-files table names `README.md` (repository root) for L3/#1145
   explicitly and does not name `RIG.md`** — the table's own rule for `packages/db/README.md` is "your
   own new `## NNNN` section only," a rule that exists precisely because these plan/rig files are
   read and written by every lane; `RIG.md` carries no such per-lane row at all this wave, which I
   read as "not this lane's to touch."
3. **`RIG.md` in the MAIN checkout is already mid-edit, uncommitted** (`git status` at session start:
   `M docs/plan/active/riders-2026-09-20/RIG.md`) — plausibly the orchestrator's own closing-wave
   rig-doc work. Editing my lane branch's independent copy of the same file risks a needless merge
   collision with work already in flight elsewhere, for a file this ticket does not name.

I did **not** silently narrow the ticket: this section states the decision, and the `#1124` precedent
it departs from, in full, so the orchestrator can ask for the `RIG.md` edit too if it wants the
mechanical parity with `#1124` — it is a one-paragraph follow-up, not a re-open of this ticket's own
work.

---

## What was deliberately left

- **`RIG.md`'s own copy** — left untouched, "Out of scope" above.
- **A content-pinning test on the new README paragraph** — no such test exists for the sibling
  `#1124` paragraph either (checked, "The seam I tested at" above); inventing one here would be new
  scope the ticket does not ask for and the house convention does not otherwise practice for plain
  prose in the root README.
- **`packages/runtime/README.md`, `packages/db/README.md`, `CONTEXT.md`** — none touched; no runtime,
  db or vocabulary change in this ticket.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| `pnpm typecheck` (worktree root) | `pnpm typecheck` | **exit 0** — `apps/web typecheck: Done`, `packages/runtime typecheck: Done` |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root) | as written | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` against the base | `FREEZE_BASE_REF=ffb629d73 node scripts/check-frozen-workflows.mjs` | **OK** — 347 frozen file(s) verified (append-only vs `ffb629d73`), 60 "use workflow" module(s) all frozen+registered, 3 retired entries |
| `git diff --name-only ffb629d73..HEAD -- packages/runtime frozen-workflows.json` | as written | 6 files listed, **all from ticket #1151** (already landed before I started: `packages/runtime/README.md`, `lib/rollback-preflight.mjs`, `tests/intake-admission-e2e.mjs`, `tests/intake-batch-e2e.mjs`, `tests/queue-drain.mjs`, `tests/queue-drain.test.mjs`, `tests/rollback-preflight.test.mjs`) — **none from this ticket's own commit**, no frozen body touched by #1145 |
| `node packages/runtime/scripts/check-parts-parity.mjs` | as written | **OK** — reader ⊇ emittable at this commit, census unchanged |
| touched test files (db, runtime or web) | — | **none** — this ticket touches no test file, `packages/db/tests`, `apps/web` or `packages/runtime/workflows` file |
| `operation-census.test.mjs` / `rig-isolation.test.mjs` | — | **not applicable** — no `packages/db/tests` file touched, no SQL function added (rule 8) |
| `apps/web` whole unit suite / browser walks / `apps/web/tests/firm-scope-db-pins.test.ts` | — | **not applicable** — no `apps/web` file touched, and CLOSING-PLAN rule (d) only puts the pins corpus in scope "whenever a migration file changed" — no migration in this ticket |
| database command against `clara_c03` or any other database | — | **none run** — this ticket needed no migration and no database read |

**Known Windows-only reds:** none encountered; this ticket's gates are all cross-platform
(typecheck, lint, two Node scripts) and none of them touch a database or a browser build.

---

## Docs updated

- `README.md` (repository root), "Develop" section: the new paragraph, described above.
- `packages/db/README.md`, `packages/runtime/README.md`, `CONTEXT.md`,
  `apps/web/messages/en.json`, `apps/web/test/manifest.txt`: not touched — no code, no migration, no
  new vocabulary, no new test file in this ticket.

---

## Successor contract

**None owed by this ticket.** #1145 mints no door, no chat or Work tool, no refusal, no part kind, no
prompt stanza — it is a documentation move with no runtime or database surface. LC's #1144 cut roster
does not name anything from this ticket.

---

## Out of scope, and why

- **`RIG.md`'s own copy of the paragraph** — see "A design decision" above; the ticket's own text
  treats it as already done ("interim state"), `CLOSING-PLAN.md`'s shared-files table does not name
  it for this lane, and the main checkout already carries an independent, uncommitted edit to it.
- **Any code, migration, test, or `packages/runtime`/`packages/db`/`apps/web` file** — the ticket's
  brief is documentation-only and explicitly expected to need no migration, confirmed true.

---

## Anything unverified

- Whether the orchestrator wants `RIG.md`'s own copy updated to point at the README as the durable
  home, mirroring `#1124`'s commit exactly — named as a design decision above with its reasoning,
  not attempted, recoverable as a one-paragraph follow-up if wanted.
- I did not re-run any database, browser, or runtime test as part of this ticket's own gates, because
  none exists to run: no file this ticket touches has a corresponding test, by design (a documentation
  move, not a behavioural one). The typecheck, lint and frozen-workflow gates above are the complete
  set rule 8 asks for given what was actually touched.
