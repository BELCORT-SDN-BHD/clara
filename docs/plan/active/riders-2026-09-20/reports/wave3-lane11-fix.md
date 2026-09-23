# Wave 3 · lane 11 · code-review fix round

**One implementer, every finding.** Tickets #1024, #897, #1021, #1022 (web tests and the Clara rail).
Two review reports (`wave3-lane11-codereview-spec.json`, `wave3-lane11-codereview-standards.json`),
ten assigned findings. The four majors are fixed, not argued away; four minors are fixed; two are
judgement calls answered in writing with the evidence behind the answer.

| | |
|---|---|
| Worktree / branch | `C:\Users\zhant\Desktop\clara-wt\int` · `riders/w3-lane11` |
| Base | `ffe63a0dd084e99b84c1368119845be273c421ce` |
| HEAD at review | `3fc1bb17a` |
| **HEAD at this report** | **`482c247c72ae703ee3d2aea2aec0404e2cabfcee`** |
| Database | none — lane 11 is web-only and nothing in this round needed one |
| Migration | **none.** No file under `packages/db` or `packages/runtime` was read or written, so there is no redo, no prestate pin, and nothing for `apps/web/tests/firm-scope-db-pins.corpus.ts` to re-measure |
| Playwright triple | `https://127.0.0.1:3600` / `3601` / `3602` |

## Commits added this round (`git log --oneline ffe63a0d..HEAD`, the four on top)

```
482c247c7 docs: #1024 narrow the _Avoid_ line to the read a tab opens for itself
e9ef53980 fix(web): #897 take the rail's focus marker in the commit phase, not in render
c6d1e7b86 fix(web): #1022 scope the mail-capture handler, and let the census see it
e083e8de9 test(web): #1021 the [633] poll cell counts the whole poll, bounded on work
```

Seven files, all in `apps/web` plus one `CONTEXT.md` line. Working tree clean. Nothing pushed, no
PR, no GitHub write, no other worktree touched (the one file written outside the worktree is this
report, as rule 10 allows).

## The one thing this round found that the review did not

Performing SPEC-897-1 — run the LANDED walk against the pre-fix component and watch it fail in a
browser — surfaced a **race in #897's own focus-return fix**. With the component restored, the arm
was not reliably green: `--repeat-each=5` gave **4 red, 1 green**, always on `toBeFocused()`. The
lane whose other ticket (#1021) exists to retire a flaky cell was about to land a flaky walk.
Diagnosed with an in-page trace, fixed, re-measured at 10/10 and 10/10. Details under SPEC-897-1.

## Findings, each with what was done and the evidence

### SPEC-1021-1 · major · "the cell failed once at HEAD, after the fix" — FIXED

The review was right that the cell was not reliable, and the mechanism is deeper than either the
review or round 1 had it. **Measured, not reasoned** — instrumenting the cell at the previous HEAD
printed, on every run:

```
DIAG atRender=2  hop0=3 hop1=4 … hop9=12        (withReceipts' ten mount settles)
DIAG mount=12 settled=13 grew=1
```

`withReceipts` advances ten `h.settle()` hops before it calls any body, and this poll spends
**exactly one tick per macrotask hop** (a tick needs its `setTicks` re-render and the effect that
schedules the next timer, and both wait for the next `act` flush). Eleven of the twelve-tick budget
were therefore already spent when the body started, and `grew > 0` was **a margin of one tick**. One
extra flush anywhere in the mount phase takes that margin to zero — which is exactly the
`grew > 0` false that `reports/wave3-lane11-ticket1022.md` recorded.

The cell now counts from zero: `ticks = total - MOUNT_READS`, with `MOUNT_READS = 1` measured off the
SETTLED cell above it (that cell never polls and reads `document_intakes_visible` exactly once). The
ceiling is now a property of the poll rather than of how its budget happened to be split.

**The red, made deterministic** — this is the reproduction, and it is repeatable rather than 1-in-N.
Old shape with the mount phase given the whole budget
(`withReceipts(…, { baseDelayMs: 0, maxDelayMs: 0, maxTicks: 11 })`):

```
not ok 7 - [633]: an UNSETTLED receipt keeps a bounded watch …
  error: 'the poll must issue SOME read while a row is still moving'
```

New shape, same `maxTicks: 11` → `ok 7`. Both reverted byte for byte.

**Re-measured as the AC asks** — five consecutive whole-`apps/web` suite passes, each
4870 tests / 4868 pass / **0 fail** / 2 skipped, the target cell green as `ok 657` in all five, plus
three isolated runs of the file (9/9 each). Counts in **Gates**.

### SPEC-1021-2 · major · the quiet clock starts before the first read — FIXED

Fixed by removing the wall clock entirely rather than by priming it. The repo has a documented
standard and round 1 went against it: `apps/web/test/settleUntil.ts`'s own header —
*"The bound is on WORK, not on wall-clock time"* (#798, written to retire exactly this shape after
#643). A contended full-suite host can spend 300 ms inside a single macrotask hop, so round 1's quiet
window could elapse before the poll had been given one chance to tick.

`settleUntilPollStops` waits for **25 consecutive flat passes** inside a **400-pass** work bound,
with no `Date.now()` anywhere. One read per hop is the measured ceiling, so twenty-five hops with no
read is a poll that has genuinely stopped, on a fast host and a crawling one alike. It also cannot
return mid-poll, which was the review's second concern.

**Non-vacuity control** (the ticket's own AC): with the bound widened to `maxTicks: 1000` the cell is
RED — `still reading after 400 settle passes (count 412)`. 412 = 12 + 400 is also the direct
measurement of one read per hop. Reverted byte for byte.

### SPEC-1022-1 · major · three of four new handlers invisible to the census — FIXED

Fixed by making the guarantee real rather than by softening the sentence: the claim is now held by an
instrument instead of by prose. `HANDLER_OPENER` in `apps/web/e2e/e2e-fixture-ownership.test.ts` now
reads `/auth/…` and `/e2e-…` openers beside `/rest/…`, `/api/…` and `verb === "…"`.

The whole cost of that widening, measured before it was made: across the 32 lane mocks it newly sees
**five** handlers — the four in `members-lifecycle-mock.mjs` (all scoped, including the one this
round repaired) and `operator-support-mock.mjs`'s own control endpoint `POST /e2e-operator/reset`,
which is genuinely unscopeable (empty body, no request-borne subject, its whole job is to put THIS
lane's module state back to its starting point) and is now declared with that reason instead of
sitting unmeasured. Scoped handlers across 32 lane mocks: **310 → 314**, both numbers measured.

Both claim sites were corrected too: `members-lifecycle-mock.mjs`'s header and `apps/web/README.md`'s
Membership section now say what is true, and say that the census — not the sentence — is what holds
it. N5: **44 tests, 44 pass**.

### SPEC-1022-2 · major · the mail-capture handler is unscoped — FIXED

`if (!ours) return false;` added, the guard its two siblings carry. It matters: `e2e/run.mjs` sets
`CLARA_E2E_INVITE_MAIL_ENDPOINT` for **every** e2e run, so that path was live for every lane.

- **Vacuity:** with the new guard removed again, N5 goes RED naming
  `UNSCOPED /e2e-invite-mail-capture` (43/44). Restored byte for byte: 44/44. The instrument and the
  fix are each load-bearing.
- **The handler is still reached**, not merely still declared: `members-invite-walk` **5 passed**,
  twice, with the server log showing `GET /auth/v1/admin/users` →
  `POST /auth/v1/admin/generate_link` → `POST /e2e-invite-mail-capture` →
  `POST /rest/v1/rpc/e2e_members_lifecycle_invite_trace`.

### SPEC-897-1 · minor · step 1 (reproduce in a browser) was not done — DONE, and it found a defect

Done as the review asked, at the landed walk rather than at a substitute seam. `InterviewRunCard.tsx`
restored to its base version (`git show <base>:…`), full build, walk run:

```
Error: AC1 — the typed answer must survive the rail -> full-screen remount
expect(locator).toHaveValue(expected) failed
Locator: getByLabel('Your answer')   Expected: "Rome Advisory Sdn Bhd"   Received: ""
```

That is the triage comment's step 1, in a browser, at the right assertion. The component was then
restored byte for byte (`git diff` empty).

**And then the arm did not come back reliably green.** `--repeat-each=5`: 4 red, 1 green, always on
`toBeFocused()`. A temporary in-page trace (added, measured, removed) gave the mechanism directly:

```
render-take clientId=C threadId=null
take scope=C value=C -> true          <- instance A takes the marker and MATCHES
render-take clientId=C threadId=null
take scope=C value=null -> false      <- instance B: already gone
effect pending=false el=false …
effect pending=false el=true          <- the instance that renders the link has nothing pending
```

`ClaraRail.tsx` took the one-shot marker **during render**. React may render a component and throw
the result away — a navigation is a transition, and a transition can be re-rendered — so the marker
could be spent by a render that never committed and be gone for the one that did. Only the second
instance's effects ever ran, and it is the one that later rendered the escalate link.

The take now happens **inside the effect**, i.e. in the commit phase, so only a render that survived
can consume it; the `undefined` ref guard still makes it once-per-instance, so the "do not re-read on
every render" hazard `firm-portfolio-section.tsx`'s own note names is still answered.

After: `--repeat-each=10` on the arm → **10 passed**; the whole spec → **10/10 passed**, twice; and
`parity-holes.spec.ts` (the only other spec that touches the escalate control, by focus and Tab, not
by click) → **6 passed**.

### SPEC-897-2 · minor · keyed by clientId, while the ruling says "never leaks to … another thread" — ACCEPTED, IN WRITING

Accepted explicitly, in the one place a reader will look (`threadStore.ts`'s `interviewDrafts`
header), and the reason is stronger than "the source argument is sound":

- The CLIENT half is a real boundary and **is** pinned by a cell (`threadStore.test.ts:146`,
  "ISOLATION BY CLIENT: two clients' interview drafts never share a value").
- The THREAD half is not a boundary at all here. `InterviewRunCard`'s only identity prop is
  `clientId` (`InterviewRunCard.tsx:43-50` — the component is never told which thread renders it),
  and two Clara threads at one client's altitude show the same open plan's same run and same park.
- So a thread axis would not stop a leak; it would **lose** the draft on every thread switch at one
  client — the opposite of what the ruling asks for.

There is therefore no seam at which the cell the review asked after could be written without first
inventing the axis it would test. Said in the header, and said here, per the review's own wording.

### SPEC-897-3 · minor · scope: the rail focus-return module — INTEGRATOR CALL, no code change

No code change is implied by the finding and none was made on that account. The module stays, on the
original Agent Brief's AC1 ("asserts keyboard focus returns to the triggering control"). Two facts
the integrator should have alongside the question:

1. The walk asserts that focus return. Removing the module means removing a landed AC1 assertion.
2. The module shipped with the race described under SPEC-897-1. It is fixed and measured at 10/10,
   but "a second, unratified product fix" is now also "a second product fix that needed a second
   round" — which is an argument for the split, not against it.

`apps/web/README.md`'s #897 section records the open question rather than settling it.

### SPEC-897-4 · minor · the README still records #897 as "Not delivered" — FIXED

`apps/web/README.md`'s #897 section is **overwritten** with the delivered state (house frame:
overwrite, never append a ticket history), covering the walk and its four ACs, the store-backed
draft, the focus-return module and its race, and SPEC-897-3's open scope question. The README's #1021
section was overwritten the same way, with the real mechanism rather than round 1's account of it.

### SPEC-1024-1 · minor · AC4 holds only on the stop re-attach path — INTEGRATOR CALL, plus the doc fix

No code change: widening the diversion to `sendMessage`'s first attach and `retryConnection` is
exactly the "first-attach revocation path and its copy" the ticket's own **Out of scope** names, and
that path has its own pinned copy (`components/clara/thread-revoked.test.tsx:226`). Closing #1024 on
the narrowed reading and filing the first-attach existence-oracle follow-up, or holding AC4 open, is
the integrator's decision. #1024's own browser evidence was re-run at this HEAD: `work-cancel-walk`
**10 passed**, all three B7 arms green.

What *was* fixed is the documentation that stated the absolute (SPEC-1024-2, a note in the same
report): `CONTEXT.md`'s `_Avoid_` line read "Any stream-route refusal read as 'you no longer have
access'", which the entry's own body contradicts two lines earlier. Narrowed to the read a tab
re-opens for its OWN benefit. `CONTEXT.md` is the shared house glossary, so an absolute there reads
as a rule for every surface.

### STD-1 · minor smell · rail-focus-return duplicates portfolio-focus-return's plumbing — STAYS, with the reason

Not fixed, and this is the "say why it stays" branch rather than a dodge. The duplication is real, and
it is **wider than the two modules the finding names**: `grep -rn "return window.sessionStorage"` over
`apps/web/lib` and `apps/web/components` finds **four** hand-rolled copies of the same best-effort
accessor, in four unrelated feature areas —

```
apps/web/lib/clara/rail-focus-return.ts
apps/web/lib/firm/portfolio-focus-return.ts
apps/web/lib/registration/signup-email-storage.ts
apps/web/lib/work/journal-draft.ts        (which already EXPORTS a shared one, defaultDraftStorage())
```

Extracting two of the four leaves the pattern half-migrated and adds a third shape beside
`defaultDraftStorage()`. The fix that is actually better is one extraction covering all four — a
repo-wide refactor touching three tickets' production modules (one of them, #659's
`portfolio-focus-return.ts`, is not in this lane's diff at all) in the middle of a wave where nine
other lanes are editing `apps/web`. Filed as a follow-up. The standards review itself rates it
non-blocking and "reasonable to leave for a follow-up".

*(STD-2, the sixth `__reactProps$` copy, was a note rather than an assigned finding and gets the same
shape of answer: it is the established repo idiom across six files, and the fix is one
`submitForm(node)` helper in `test/hookHarness.ts` that all six adopt at once.)*

### SPEC-1022-3 · note · where the `mail_not_configured` coverage went

Named, as the review asked, and a little more precisely than one line: the walk's deleted assertions
had three homes and none of them is empty. The banner TITLE `"The invitation was not sent"` — the
shared courier-failure title under which `mail_not_configured` renders
(`components/admin/members-panel.tsx:204`) — is pinned at
`components/admin/members-walls.test.tsx:375`. The refusal CODE is pinned at
`apps/web/tests/invite-courier.test.ts:244` and `apps/web/tests/firm-scope-surfaces.test.ts:768`. The
per-code sentence itself is the `messages/en.json:781` key.

## Gates, with counts (all at HEAD `482c247c7`)

| gate | command | result |
|---|---|---|
| whole `apps/web` unit suite, **five consecutive passes** | `node scripts/run-tests.mjs` (from `apps/web`) | **4870 tests, 4868 pass, 0 fail, 2 skipped** — five times out of five; `not ok` count 0 in every log; `[633] … an UNSETTLED receipt` green as `ok 657` in all five. Durations 200 s / 105 s / 139 s / 150 s / 149 s |
| #1021's file, isolated | `… --test components/documents/documents-workbench-refresh.test.tsx` | **9 tests, 9 pass, 0 fail** — three consecutive runs |
| fixture-ownership census (touched) | `… --test e2e/e2e-fixture-ownership.test.ts` | **44 tests, 44 pass, 0 fail** |
| the #897 store and component seams | `… --test lib/clara/threadStore.test.ts components/clara/interview-draft-persistence.test.tsx lib/clara/rail-focus-return.test.ts` | **24 tests, 24 pass, 0 fail** |
| the other `ClaraRail` consumers | `… --test components/clara/{rail-boundary,composer-attachment-scope,thread-menu,thread-scope-band}.test.tsx` | **36 tests, 36 pass, 0 fail** |
| typecheck | `pnpm typecheck` | exit 0 (apps/web + packages/runtime) |
| lint | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |
| browser: the #897 arm, repeated | `pnpm --filter @clara/web e2e agentic-finish-walk --repeat-each=10 -g "897"` | **10 passed** (before the fix, `--repeat-each=5` was 4 red / 1 green) |
| browser: the whole #897 spec | `pnpm --filter @clara/web e2e agentic-finish-walk` | **10 passed**, twice |
| browser: #1022's walk | `pnpm --filter @clara/web e2e members-invite-walk` | **5 passed**, twice |
| browser: #1024's walk | `pnpm --filter @clara/web e2e work-cancel-walk` | **10 passed**, the three B7 arms green |
| browser: the other escalate-control spec | `pnpm --filter @clara/web e2e parity-holes` | **6 passed** |
| browser: #897's AC4 header file | `pnpm --filter @clara/web e2e interview-walk` | **4 skipped, 0 failed** (docker-only cases, no live fixture in this lane) |

Every browser run above used the lane's own triple
(`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601 CLARA_E2E_RUNTIME_PORT=3602`).

**Not run, and why:** `packages/db` and `packages/runtime` gates (`operation-census.test.mjs`,
`rig-isolation.test.mjs`, `check-frozen-workflows.mjs`, `check-parts-parity.mjs`) — no file in either
package was touched, and lane 11 has no database. No migration, so no `CLARA_MIGRATION_REDO`, no
prestate pin to list, and no content-sha for `firm-scope-db-pins.corpus.ts` to re-measure.

**Known Windows-only reds from RIG.md:** none hit. `thread-live-clarify.test.tsx` and
`use-clara-thread-stop.test.ts` passed inside all five whole-suite runs.

## Docs updated in the same commits

- `apps/web/README.md` — #1021 section overwritten with the measured mechanism; #897 section
  overwritten with the delivered state and the race; the Membership paragraph's scoping claim
  corrected and tied to the census.
- `apps/web/e2e/members-lifecycle-mock.mjs` — its own header's "every new handler is scoped" claim
  corrected, and the census's new reach recorded.
- `apps/web/e2e/e2e-fixture-ownership.test.ts` — `HANDLER_OPENER`'s header records the second
  instance of its own named failure mode; both lane declarations carry the reason for what changed.
- `apps/web/lib/clara/threadStore.ts` — the ruling's "another thread" half answered in the header.
- `apps/web/components/clara/ClaraRail.tsx` — the commit-phase rule and the measurement behind it.
- `CONTEXT.md` — one `_Avoid_` line narrowed (shared file, minimal hunk, in place).

## Successor contracts

**None is owed.** Nothing a frozen chat body or a frozen Work tool consumes changed: the whole
surface of this round is `apps/web` browser code, two e2e harness files, one test file and two
documentation files. No door signature, no zod input, no door-call argument order, no refusal
mapping, no part kind, no prompt stanza. `chatTurn_v22` / `claraWork_v6` need nothing from it.

## Follow-ups worth filing

1. **`firm-portfolio-section.tsx:182` carries the older render-phase form of the take-once marker**
   (`pendingFocus.current = takePortfolioReturnFocus()` in the render body) and therefore the same
   discarded-render hazard SPEC-897-1 measured on the rail. Nothing has reproduced it on that
   surface, so it was not changed here; the one-line fix is the same one (take inside the effect,
   `undefined` guard unchanged).
2. **One `sessionStorage` accessor for the four hand-rolled copies** (STD-1), reconciled with
   `lib/work/journal-draft.ts`'s already-exported `defaultDraftStorage()`.
3. **A `submitForm(node)` helper in `test/hookHarness.ts`** for the six `__reactProps$` copies
   (STD-2), and the `HTMLTextAreaElementStub` `defaultValue`-to-`.value` gap wave-1 lane 08 filed.
4. **The first-attach existence oracle** (#1024's own out-of-scope carve-out), if the integrator
   holds AC4 open rather than closing on the narrowed reading.
5. **`agentic-finish-walk.spec.ts`'s H-30 cell** failed once during this round
   (`expect(await boxes.count()).toBeGreaterThan(30)` saw 0 — a bare `count()` with no auto-retry,
   so a slow dialog render reads as an empty fixture). Pre-existing, not this lane's work, green in
   every other run here; it is the same class #1021 is about.
6. **Widening `HANDLER_OPENER` again** if a lane mock ever dispatches on a prefix other than
   `/rest/`, `/api/`, `/auth/`, `/e2e-` or a bare verb. The census now names this as a recurring
   failure mode rather than a one-off.

## Anything unverified

- **The race's React-internal cause.** The trace proves two renders and one surviving instance, and
  it proves the fix. Which specific React mechanism discarded the first render (a transition
  re-render, an interrupted lane) was not isolated; the fix does not depend on which one it is.
- **The five whole-suite passes ran on this Windows host**, which is not the Linux runner. The lint
  chain was run as the runner sees it (`CI=true GITHUB_ACTIONS=true`), but the suite passes were not.
- **No Context7 or official-docs lookup was made this round.** The one external-library fact the fix
  rests on — that a React effect runs only for a committed render, while the render body may run for
  a render that is discarded — was established empirically here, by the trace and by the 4-red /
  1-green to 10-green swing, rather than from documentation.
- I did not re-run the other nine lanes' walks; the census widening is the one change that could in
  principle affect another lane, and its whole measured reach across all 32 lane mocks is the five
  handlers named under SPEC-1022-1.
