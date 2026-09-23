# Wave 3 · lane 11 · ticket #897 — the rail's full-screen altitude round trip

**A mock-lane walk proves UI-21's full-screen onboarding altitude behaviour: a typed interview
answer survives the rail <-> full-screen remount both ways, and keyboard focus returns to the
control that opened it.** Status: **done**.

| | |
|---|---|
| Worktree / branch | `C:\Users\zhant\Desktop\clara-wt\int` · `riders/w3-lane11` |
| Base | `ffe63a0dd084e99b84c1368119845be273c421ce` |
| HEAD at report | `dc7118bb9` |
| Database | none used — lane 11 is web-only, and this ticket needed none |
| Migration | **none**, as the prompt expected. No schema or function change, no prestate pins, no rig-meta cohort, no gate-chain entry. Nothing under `packages/db` was read or written. |
| Playwright triple | `https://127.0.0.1:3600` / `3601` / `3602` |

## Commits (`git log --oneline ffe63a0d..HEAD`, this ticket's four)

```
dc7118bb9 fix(web): #897 reword test strings that tripped the raw-colour lint rule
eedae0bd7 feat(web): #897 mock-lane walk for the rail's full-screen altitude round trip
1bdcb32c4 fix(web): #897 InterviewRunCard's typed answer now survives the rail <-> full-screen remount
40ae61f67 test(web): #897 claraThreadStore gains a per-client interview draft
```

`40ae61f67` landed before this session started (an earlier implementer of this same ticket,
killed mid-work by a usage limit) — resumed from, not redone, per the lane prompt's RESUME
instructions. Its own report line: "InterviewRunCard.tsx is not wired to this store yet — that
is the next slice", which is exactly where this session picked up. Working tree clean at the
report. Nothing pushed, no PR, no GitHub write, no other worktree touched.

## Resuming the killed implementer's work — what I found and how I judged it

First action: `git status` and `git log --oneline ffe63a0d..HEAD`. Found:

- **One landed slice** (`40ae61f67`): `claraThreadStore` gains `getInterviewDraft` /
  `setInterviewDraft` / `clearInterviewDraft`, keyed by `clientId` alone, with 7 new store-level
  cells (16/16 total in the file, re-verified). Judged: correct, complete, test-first per its own
  commit message ("Proven red first... restored, 16/16 pass"). Kept as-is.
- **Two uncommitted files**, judged on their merits:
  - `apps/web/components/clara/InterviewRunCard.tsx` — wired the card's `draft`/`setDraft` onto
    the store via `useSyncExternalStore`, and `clearInterviewDraft` on a CONFIRMED submit only.
    Judged: the right next slice, matching the store's own contract and the triage comment's step
    2 ("make it true"). No test accompanied it yet. Kept, then completed with tests (see below).
  - `apps/web/e2e/agentic-finish-mock.mjs` — added client C's fixture (an OPEN, unanswered
    interview park) and two runtime handlers. Judged: the right shape for AC2's independent
    fixture, but the two runtime handlers were mounted at the WRONG path (see AC1 below — this
    was corrected, not rewritten). Kept and fixed.
- **No migration file existed or was applied** — matches the ticket's own "expected to need NO
  migration" line; nothing to check in `clara.schema_migrations`.

## The ticket was live on this branch

Verified before building, not assumed: `gh issue view 897 --comments`. The newest ruling is the
**Triage note (2026-09-20)** comment, which widens the ticket's scope by tracing (not yet
reproducing) that `InterviewRunCard.tsx`'s typed answer was a plain, un-persisted `useState` and
lays out three steps — reproduce, make it true, then build the walk the original Agent Brief
asked for. The original Agent Brief (same issue, an earlier comment) still stands for the walk's
shape and AC1–AC4 below. Both were re-verified against the code at `ffe63a0d`, not assumed from
the issue text.

## Seams I tested at (written before the first test, per work-order rule 4)

1. **The storage seam** — `claraThreadStore`'s three new methods, already proven by the resumed
   commit (`lib/clara/threadStore.test.ts`).
2. **The component-wiring seam** — `InterviewRunCard.tsx`'s `draft` read through the store across
   a real unmount/remount of the SAME card (`ClaraFullScreenThread`, the harness
   `interview-run-keyboard.test.tsx` already mounts), and the clear-on-submit / preserve-on-refusal
   fork through the card's own form. File: `apps/web/components/clara/interview-draft-persistence.test.tsx`.
3. **The rail's focus-return marker seam** — `lib/clara/rail-focus-return.ts`'s own contract
   (scope match, take-once, storage-unavailable), independent of any browser.
   File: `apps/web/lib/clara/rail-focus-return.test.ts`.
4. **The browser seam the AC actually names** — the rail's escalate control driving the real
   `(firm)` -> `(full)` route-group change and back, in `agentic-finish-walk.spec.ts`'s own P6-5
   mock lane (the lane the brief names as owning the rail).
5. **The fixture-declaration seam** — `e2e-fixture-ownership.test.ts`'s N4/N5 census, re-run
   against the new fixture and handlers, not a new cell (AC3 asks that the CENSUS still pass, not
   that a new one exist).

No test was written at a seam the brief does not give me.

## Acceptance criteria, each with its evidence

**AC1 — A named mock-lane cell drives the full-screen altitude change and asserts focus return
and typed-data survival, and runs green without docker. DONE.**

`apps/web/e2e/agentic-finish-walk.spec.ts`, test **"#897 · the full-screen altitude change keeps
a typed interview answer, and focus returns to the control that opened it"**. Signs in, opens
client C's rail, starts the interview, types "Rome Advisory Sdn Bhd", clicks the escalate link
(after explicitly focusing it), asserts the URL moved to the full-screen route, re-attaches
(idempotent `startClientInterview`) and asserts the answer field's value survived, clicks "Back",
asserts the rail is visible again and focus is back on the escalate link — BEFORE re-attaching a
second time (ordering matters: the re-attach click would otherwise steal focus onto itself and
prove nothing about the navigation) — then re-attaches once more and asserts the answer value
survived the second remount too.

Command, on this lane's triple:
```
CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601 CLARA_E2E_RUNTIME_PORT=3602 \
  pnpm --filter @clara/web e2e "agentic-finish-walk"
```
Result: **10/10 passed** (the new cell plus the file's 9 pre-existing ones, unaffected).

Two real defects were found and fixed while proving this red-to-green, both recorded honestly
rather than smoothed over:

1. **Wrong runtime path.** The resumed uncommitted handlers answered
   `/api/runtime/interview/client/start` and `/api/runtime/interview/state` — the BROWSER's own
   path. The mock runtime server sees the path AFTER `app/api/runtime/[...path]/route.ts`'s proxy
   strips the fixed `runtime` route segment (`target = base + "/api/" + path.join("/")`,
   confirmed by reading the route file), so the unstripped form 404s as `serve-built.mjs`'s own
   "unhandled e2e runtime route" alert — measured directly in the first run of this walk. Fixed by
   re-pathing both handlers to `/api/interview/client/start` and `/api/interview/state`.
2. **No auto-reattach.** `InterviewRunCard`'s `runId` is plain local state, `null` on every fresh
   mount — the card does not attach itself; the human presses "Start / continue interview" again
   (idempotent). The first cut of the walk assumed the answer field would already be visible after
   the route change; it was not (measured: the full-screen page showed the "Start / continue
   interview" button, not the field). Fixed by clicking the same button again on each side of the
   round trip, which is also what the previous implementer's own fixture comment already argued
   ("a card that re-attaches after losing its local `runId`... resumes the identical run").

**AC1's OTHER half was also found untrue, empirically, not assumed.** With the draft-persistence
fix alone, the SAME walk failed at `toBeFocused()` — `document.activeElement` was `<body>` after
the round trip. This was not named broken by the triage comment (which only traced the
draft-persistence gap), but it is literally in the original Agent Brief's AC1 ("asserts... focus
return"), so the same "the acceptance criterion is the contract, widen by the smallest step"
reasoning the triage comment itself established applies again. Fixed with
`apps/web/lib/clara/rail-focus-return.ts`, the SAME `sessionStorage` take-once idiom
`lib/firm/portfolio-focus-return.ts` already established in this codebase for "the browser does
not restore focus across a route change" (that module's own header: "measured on the real build
... `document.activeElement` ... got the empty string"), scoped by client altitude — this
module's one departure from its sibling's plain boolean, so a marker from one client's escalate
can never steal focus on a different client's fresh rail mount. Wired into `ClaraRail.tsx`'s
existing ref-based focus-return idiom (the `menuToggleRef` pattern already in that file).

**AC2 — The fixture is an OPEN, unanswered park independent of any other arm's state. DONE.**

Client C (`P6_5.clientC` / `threadC` / `planC` / `runC`) is a fixture no other `test()` in
`agentic-finish-walk.spec.ts` navigates to. Read `agentic-finish-mock.mjs`'s `resetP6_5()`
directly: it resets only `state.chartState`, `state.appliedFamilies`, `state.amendments`,
`state.bankAnswer` — none of which back `PLAN_C()` or client C's row, which are plain literals
returned fresh on every call. The mock runtime's `/api/interview/state` handler for `runC` always
answers the SAME `parkIndex: 0`, "OPEN and unanswered" park — it never advances, matching what the
brief asks a FIXTURE (not a running server) to mean. Confirmed empirically: the walk ran 10th,
after nine other tests had already mutated client A's and client B's own state, with no
interference.

**AC3 — `e2e-fixture-ownership.test.ts` passes with the new fixture and verbs declared. DONE.**

Adding client C's thread row to `P6_5_SESSIONS` moved N4's own-client-thread count from 2 to 3;
updated that one assertion (`own.length` 2 -> 3) with a comment naming why. The two new runtime
handlers needed NO entry in `LANE_DECLARATIONS` (`unscopeable`/`debt`) — N5's census
auto-recognises both as SCOPED: each falls through (`return false`) on a `clientId`/`planId` (the
start handler) or `runId` (the state handler) it does not own, the same shape every other scoped
handler in the file uses. Verified by running the census directly, not inferred:
```
node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts
```
Result: **44/44 pass**, including N4 (own count now 3), N5 ("scoped handlers across 32 lane
mocks: 308", both new handlers counted there, not in the unscoped list), and N6 (unaffected —
reads `serve-built.mjs`'s own separate static array).

**AC4 — The live-stack spec's header records that this arm lives in the mock lane. DONE.**

`apps/web/e2e/interview-walk.spec.ts`'s `#897` header paragraph rewritten from "THIS ARM IS NOT
PROVEN ANYWHERE TODAY" to "DELIVERED, in `agentic-finish-walk.spec.ts`'s own #897 arm", naming the
fixture, both AC1 halves, and the two modules that made them true. Verified the file still
behaves correctly under the default (non-docker) command — a comment-only change, but proven, not
assumed:
```
CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601 CLARA_E2E_RUNTIME_PORT=3602 \
  pnpm --filter @clara/web e2e "interview-walk"
```
Result: **4 skipped, 0 failed** — the file's docker-only cases skip gracefully without the live
fixture env, exactly as the README documents; nothing broke.

**The triage-widened scope — "typed but unsubmitted answers survive the change". DONE.**

Proven at TWO seams:

- **Component level**, `interview-draft-persistence.test.tsx`. Test 1 (flipped from wave1-lane08's
  own reproduction cell, `SPEC-897-1`) mounts a card, types an answer, unmounts WITHOUT
  submitting, mounts a fresh instance against the same run, and asserts the draft is back —
  through the STORE (`claraThreadStore.getInterviewDraft`, the ground truth
  `useSyncExternalStore` reads from) and the mounted textarea's own `defaultValue` (react-dom's
  own initial-mount write, verified by reading `react-dom-client.development.js`'s
  `initTextarea` — it sets `.value` on mount only when `textContent` already matches, otherwise
  only `.defaultValue`, which this harness's `HTMLTextAreaElementStub` has no fallback for; the
  RENDERED `.value` a person actually sees is proven in the browser, AC1's own walk). Test 2
  proves clear-on-submit / preserve-on-refusal directly against two independent runs, using the
  same "invoke the form's real `onSubmit`" technique `onboarding-progress-sync.test.tsx`'s
  `answerCurrentPark` already established (a plain Send click silently no-ops against this stub
  DOM's lack of native form submission).
- **Browser level**, AC1's own walk above (survives BOTH remounts, rail -> full-screen and back).

## Vacuity controls (work-order rule 4), each a real red-then-green

1. **`InterviewRunCard.tsx`'s fix.** With it reverted (`git stash`, the file only) and the flipped
   `interview-draft-persistence.test.tsx` assertions in place: **2/2 failed** for the right reason
   (`store value: '' !== 'Rome Public Advisory'`). Restored: **2/2 pass**.
2. **`rail-focus-return.ts`'s scope check.** With `takeRailReturnFocus`'s match condition
   weakened to `value !== null` (dropping the altitude-scope comparison): **3/6 failed** — exactly
   the three cells that test scope-sensitivity (firm-vs-client, cross-client mismatch, take-once
   after a mismatch). Restored: **6/6 pass**.

## Gates, with counts (all at HEAD `dc7118bb9`)

| gate | command | result |
|---|---|---|
| storage seam (resumed, re-run) | `node --import ./test/bootstrap.mjs --import tsx --test lib/clara/threadStore.test.ts` | **16 tests, 16 pass, 0 fail** |
| component seam (touched) | `… --test components/clara/interview-draft-persistence.test.tsx` | **2 tests, 2 pass, 0 fail** |
| focus-return module (new) | `… --test lib/clara/rail-focus-return.test.ts` | **6 tests, 6 pass, 0 fail** |
| fixture-ownership census (touched) | `… --test e2e/e2e-fixture-ownership.test.ts` | **44 tests, 44 pass, 0 fail** |
| whole web unit suite | `node scripts/run-tests.mjs` (from `apps/web`) | **4861 tests, 139 suites, 4859 pass, 0 fail, 2 skipped** (the two pre-existing live-Supabase-auth skips, `CLARA_LIVE_SUPABASE_AUTH_URL` unset), 244 s |
| typecheck | `pnpm typecheck` | exit 0 (apps/web + packages/runtime; first attempt OOM'd under host contention — RIG.md's documented class — retried once) |
| lint | `pnpm lint` | exit 0 |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 (first three attempts OOM'd under host contention at different, unrelated points — even `git` itself OOM'd once; the fourth attempt completed and surfaced 5 REAL findings, see below — fifth attempt, after the fix, exit 0) |
| browser walk (touched, behaviour) | `pnpm --filter @clara/web e2e "agentic-finish-walk"` on the lane triple | **10/10 passed** (build OOM'd once under host contention, retried once) |
| browser walk (header comment only) | `pnpm --filter @clara/web e2e "interview-walk"` on the lane triple | **4 skipped, 0 failed** (docker-only cases; no live fixture in this lane) |

The 4th lint attempt was not a false alarm: `eslint.config.mjs`'s `NO_RAW_COLOR_VALUES` selector
(owner ruling Q4, scoped to `app/**`/`components/**`) fires on any string `Literal` matching
`#<3/4/6/8 hex-looking chars>` — `"#897"` itself qualifies (8, 9, 7 are valid hex digits). Five
test-name/assertion strings in `interview-draft-persistence.test.tsx` (which lives under
`components/clara/`) tripped it. Reworded to "ticket 897" per the rule's own suggested fix
(`dc7118bb9`); comments were never affected (the selector targets AST `Literal`/`TemplateElement`
nodes, not comment text) and I checked every other touched file under `components/**`/`app/**`
(`ClaraRail.tsx`, `InterviewRunCard.tsx`) directly with `npx eslint` and found nothing else.

Not run, and why: `operation-census.test.mjs` / `rig-isolation.test.mjs` (no `packages/db` file
touched, no SQL function added, never with reset flags per RIG.md); `check-frozen-workflows.mjs` /
`check-parts-parity.mjs` (no `packages/runtime` file touched). The lane has no database and this
ticket needed none, matching the prompt's own line.

Known Windows-only reds from RIG.md: none were hit. `thread-live-clarify.test.tsx` and
`use-clara-thread-stop.test.ts` both passed inside the whole-suite run.

## Docs

- `apps/web/e2e/README.md` — the `agentic-finish-walk.spec.ts` row gains a clause naming the
  #897 arm.
- `apps/web/e2e/interview-walk.spec.ts` — header rewritten (AC4, above).
- `lib/clara/rail-focus-return.ts` — self-documenting header, modelled on and cross-referencing
  `lib/firm/portfolio-focus-return.ts`'s own.
- `InterviewRunCard.tsx` and `ClaraRail.tsx` carry inline rationale comments at each change site
  (the store wiring; the escalate ref, marker take, and effect).
- `CONTEXT.md` — **not touched.** This ticket introduces no new ACCOUNTING/PRODUCT domain
  vocabulary (the durable interview and onboarding concepts it touches are already defined
  there); the new terms are implementation-level (a draft store key, a focus-return marker), which
  is what module-level code comments are for, not the house glossary.
- `apps/web/messages/en.json` — **not touched.** No new copy; every string reused an existing key.
- `apps/web/test/manifest.txt` — one line added (`lib/clara/rail-focus-return.test.ts`) at the
  sorted position; a shared file (work-order rule 7), kept to the minimal hunk.

## Successor contract

**None is owed.** Nothing a frozen chat body or a frozen Work tool consumes changed — this
ticket's whole surface is `apps/web`'s browser code (a store's three methods, one component's
wiring, one new focus-return module, and test/fixture files). No door signature, no zod input, no
door-call argument order, no refusal mapping, no part kind, no prompt stanza. `chatTurn_v22` /
`claraWork_v6` need nothing from this ticket.

## Follow-ups worth filing

1. **The harness gap wave1-lane08 already filed stays open.** `test/hookHarness.ts`'s
   `HTMLTextAreaElementStub` has no `defaultValue`-to-`.value` fallback for the browser's native
   "reflects `defaultValue` until dirty" rule, so a controlled textarea value that arrives through
   props (not this harness's own `setFieldValue` native-write helper) cannot be read back through
   `.value` at the component-test level. Worked around here (read the store directly, and
   `defaultValue` instead), not fixed — fixing it is shared test infrastructure, out of this
   ticket's scope.
2. **`rail-focus-return.ts`'s edge case, accepted, not eliminated.** If a reader leaves the
   full-screen route some way other than the collapse link (a bookmark, a typed URL) before any
   rail remounts, the marker persists in `sessionStorage` until the NEXT fresh rail mount for that
   SAME client/altitude claims it — which could, in principle, steal focus on an unrelated later
   visit. The scope-by-altitude design narrows this from "any rail" to "this one client's rail",
   matching `portfolio-focus-return.ts`'s own accepted "best-effort, never load-bearing" tradeoff;
   eliminating it entirely (e.g., a TTL) was judged not worth the complexity for a keyboard-only,
   worst-case-cosmetic edge case.
3. **Out of scope, as the ticket named:** a docker-free live-stack runner; the 320px and 200% zoom
   legs of the same altitude arm (the ticket's own explicit deferral).

## Anything unverified

- **Context7 / official docs.** No new external library API was used that I was not certain
  about — `useSyncExternalStore`, `next/link`'s `ref` forwarding, and `sessionStorage` are all
  standard and, more importantly, already-established patterns in this exact codebase
  (`lib/firm/portfolio-focus-return.ts` for the sessionStorage idiom;
  `firm-portfolio-section.tsx` for `ref` on `next/link`), each verified empirically by a passing
  test rather than by a docs lookup. Recorded because the harness asks for it, not as a claim that
  docs were consulted.
- **Host load.** Three separate gates (typecheck, lint, and the first `agentic-finish-walk` build)
  hit out-of-memory crashes on this host during this session, at different and unrelated points
  each time (once inside `git` itself). All were resolved by a single retry, matching RIG.md's
  documented `next build` flake class, but I did not investigate whether the pattern is worse
  today than on an unloaded host.
- I did not audit whether any OTHER file across the whole repo (outside what this ticket touched)
  contains a `"#<3 digit ticket number>"` string literal under `app/**`/`components/**` that the
  raw-colour rule would also trip — only the files this ticket's own diff touched were checked.
