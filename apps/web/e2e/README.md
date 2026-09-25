# Browser tests

Run the default browser suite from the repository root:

```sh
pnpm --filter @clara/web e2e
```

[`run.mjs`](run.mjs) builds `@clara/web`, starts the production Next.js server behind a local HTTPS proxy, and runs every `*.spec.ts` in this directory with Chromium. [`playwright.config.ts`](../playwright.config.ts) fixes the suite at one worker, no retries, no reused server, and retained traces on failure. OpenSSL must be available so the harness can create its temporary local certificate.

Always run it as `pnpm --filter @clara/web e2e`, never a bare `npx playwright test` or an IDE's own Playwright runner: those invoke [`serve-built.mjs`](serve-built.mjs) directly and skip the build, silently serving a stale `.next/` (measured on the #648 fix round: a 19-minute-stale build produced a false failure with no other symptom). `serve-built.mjs` logs the `BUILD_ID` it is about to serve and its age at startup so a stale run is visible rather than silent.

**Two runners share this directory.** `*.spec.ts` is Playwright's; `*.test.ts` is `node:test`'s, declared in [`../test/manifest.txt`](../test/manifest.txt) and run by `pnpm --filter @clara/web test`. Playwright's stock `testMatch` takes both suffixes, so until #851 a filterless run also `import`-ed the `node:test` files and executed their assertions inside the Playwright process, where no reporter ever read them — a broken census assertion printed `not ok` into that stream and the run still exited 0. `playwright.config.ts` now pins `testMatch: /.*\.spec\.ts$/`, and [`spec-discovery.test.ts`](spec-discovery.test.ts) holds it with Playwright's stock pattern re-typed as its vacuity control.

## Fixture boundary

The default suite uses [`serve-built.mjs`](serve-built.mjs). The browser and production bundle are real; Supabase, PostgREST responses, Stripe, and most runtime responses are deterministic local fixtures. The suite is suitable for route behavior, client state, accessibility, responsive layout, same-origin proxying, and request-shape checks. It does not prove live RLS, a deployed workflow, Cloudflare streaming, mail delivery, Stripe, or production configuration.

Two specs need dedicated real-stack runners and skip their fixture-dependent cases in the default command:

- [`interview-walk.spec.ts`](interview-walk.spec.ts) is run by `e2e/live-stack/run-live-walk.mjs` against real Postgres, PostgREST, and the runtime.
- [`reports-download-walk.spec.ts`](reports-download-walk.spec.ts) is run by `e2e/live-stack/run-reports-download-walk.mjs` against real report doors and the runtime with a temporary local object store.

The mock server keeps mutable fixture state for the life of the process. Keep `workers: 1`, `retries: 0`, and `reuseExistingServer: false` unless the fixtures are redesigned for isolation. Override the default ports when another run is active:

```sh
CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3200 \
CLARA_E2E_NEXT_PORT=3201 \
CLARA_E2E_RUNTIME_PORT=3202 \
pnpm --filter @clara/web e2e
```

On PowerShell, set those environment variables before running the command.

### Gating on one spec, and `--no-build` (#630, #851)

Extra arguments reach Playwright, so a lane gates on the spec it touched instead of borrowing the whole suite's wall-clock:

```sh
pnpm --filter @clara/web e2e -- documents-viewer-walk
```

[`run.mjs`](run.mjs) rebuilds `@clara/web` before every invocation, which is right after an edit and pure cost when the same code is being measured twice. `--no-build` skips that build and runs Playwright against the `.next/` already on disk:

```sh
pnpm --filter @clara/web e2e -- --no-build documents-viewer-walk
```

- **A bare run is unchanged.** With the flag absent the build happens and the argument list Playwright receives is exactly what it always was — held by [`run-args.test.ts`](run-args.test.ts) against the historical expression itself, not against a copied list.
- **The flag is the runner's own and never reaches Playwright.** [`run-args.mjs`](run-args.mjs) matches it by exact equality: `--no-builds` or a spec filter that merely reads like the flag is forwarded untouched, because a loose match would silently widen a one-spec gate into the whole suite (the failure #630 recorded for a stray `--`).
- **Use it for a REPEAT measurement, never for the first run after an edit.** A stale `.next/` proves the app as it was. Three consecutive runs of one walk, or #804's five cold-start runs, are what it is for.

### One sign-in, and the census that holds it (#804, #851)

Every spec takes its sign-in from [`helpers.ts`](helpers.ts) — `signIn(page, email?)` or `signInTo(page, destination, email?)`. #804's fourth acceptance criterion said so in prose and, by 2026-09-17, fourteen spec files written during that wave had each grown a local copy again, several with a hand-picked 30 s or 60 s wait and one (`intake-batch-walk.spec.ts`) with regex locators and the wrong fixture password. Nothing went red.

[`sign-in-census.test.ts`](sign-in-census.test.ts) is that rule with a cell behind it. It reads the login FORM — a Password fill plus the "Sign in" submit, in either the string or the regex spelling, and through a locator bound to a variable as readily as one chained in place — rather than a function name, so a local helper called anything at all is caught and a thin wrapper that delegates is not. The two halves must land **within ten lines of each other**: ANDed across a whole file they read a `/signup` password fill and a focus-only login button in some other cell as one sign-in, which is how `entry-faces-walk.spec.ts` came to hold an exception for something it does not do. Measured at `dd3f8f1d`, every one of the fourteen local sign-ins the fold retired put its two halves one line apart; that false positive put them 38 apart. Two short lists, each entry carrying its reason in source:

| List | Entries | What it permits |
|---|---|---|
| `FORM_EXCEPTIONS` | `reports-download-walk.spec.ts` | driving the login form itself — the live-stack lane #804 named out of scope, whose `establishSession` signs a REAL user in against real Postgres |
| `WRAPPERS` | `chat-parity-walk.spec.ts`, `documents-intake-walk.spec.ts`, `members-invite-walk.spec.ts` | declaring a sign-in function, provided it imports the shared helper |

A third cell keeps both lists live: an entry that no longer offends fails, so the lists can shrink but cannot rot — it is what forced the `entry-faces-walk.spec.ts` entry out once the detector stopped mis-reading that file. A fourth is the vacuity control — the detector is driven over synthetic offenders (the variable-then-click shape, the indirected Password locator, the regex spellings, and a real form whose two acts are separated by a comment block) and over compliant, signup and two-different-forms sources, so an empty census is evidence rather than an instrument that never fired.

### One settle-before-scan, and the census that holds it (#760, #1017)

Every spec that scans with axe calls [`helpers.ts`](helpers.ts)'s `settleForScan(page)` immediately before `new AxeBuilder(...).analyze()` — the ONE spelling of "this page has stopped moving, measure it now": every `.enter-content`/`.enter-panel` element at `opacity: 1` AND no finite `document.getAnimations()` entry still running. #760 built it after three walks independently measured the same intermittent axe `color-contrast` violation — a scan that runs mid-transition measures a COMPOSITED colour nobody ever ships. By wave 3 (2026-09-20) two more independent findings (the integration gate's own three-run classification, and a repo-wide count on this ticket) showed most of the suite's scans still called the scanner directly, or through a local routine that waited only on `getAnimations()` or only on `networkidle` — never on the fade's own opacity, the exact gap #760 closed for the three walks it touched and nowhere else.

[`settle-before-scan-census.test.ts`](settle-before-scan-census.test.ts) is that rule with a cell behind it, the same shape `sign-in-census.test.ts` uses: comment-stripped source (this suite's own prose regularly quotes the exact code shapes the census greps for), a scan not preceded — since the last scan, or the start of the file — by a direct `settleForScan(page)` call or a call to a verified `LOCAL_WRAPPERS` delegate is an offender.

| List | Entries | What it permits |
|---|---|---|
| `LOCAL_WRAPPERS` | `a11y-finish-walk.spec.ts` (`gotoSettled`), `home-board-walk.spec.ts` (`settled`) | a file's own navigate-then-settle idiom, verified (by extracting its balanced function body) to call `settleForScan(page)` itself rather than reimplement the wait |
| `EXCEPTIONS` | *(empty)* | a spec file the rule does not hold, with the reason recorded — empty as of #1017's own fold |

A second cell verifies every `LOCAL_WRAPPERS` entry actually delegates (a name registered whose body never calls `settleForScan(page)` fails on its own), a third keeps `EXCEPTIONS` live the same way the sign-in census does, and a fourth is the vacuity control (an unsettled offender, a settled compliant source, two scans sharing one settle, a comment naming the shape without being it, and a wrapper call site recognised only when its name is registered).

The same ticket's other half: `filed-document-list.tsx`'s selected row measured 4.62:1 at REST (muted-foreground on the muted selection background) — the tightest margin above 4.5:1 in `check-token-contrast.mjs` outside the identity-canvas block — close enough that anti-aliasing at a glyph edge measured 4.49:1 and 4.36:1 on two independent full-browser-suite runs, on an unchanged token and an unchanged spec file. Settling the scan fixes the mid-transition reading; the selected row's cells now render at `text-foreground` instead (14.32:1, pinned as `foreground-on-muted-selected-document-row`) so the resting pair itself is never close enough for anti-aliasing to matter.

## One worker, one host (#706)

The harness is single-worker by construction and it must not share a machine with another test suite while it runs.

`playwright.config.ts` fixes `workers: 1`, `retries: 0` and `reuseExistingServer: false`, and the mock server keeps mutable fixture state for the life of the process — so two Playwright runs on one host are not merely slow, they read and write each other's fixtures. Beyond that, every measured browser flake in this repository so far has been a cell running out of wall-clock budget while another suite (`packages/db`, `packages/runtime`, or a second web build) competed for the same CPU. CI does not run Playwright, so a local run is the only browser evidence this repository has, and it is only worth having if it is trustworthy: **run the browser suite alone, and sequence heavy suites one at a time.**

### Per-cell timeout policy

The config sets no per-test timeout, so Playwright's flat 30 s applies to every cell regardless of how much work it does. A cell that does measurably more than that states its own budget, built from the named units in [`helpers.ts`](helpers.ts):

| Unit | Budget | What it pays for |
|---|---|---|
| `CELL_BUDGET.base` | 30 s | Playwright's own default, kept as every cell's floor |
| `CELL_BUDGET.poll` | 15 s | one fixture-driven state change awaited with a `{ timeout: 15_000 }`-shaped poll |
| `CELL_BUDGET.scan` | 35 s | one full-page `AxeBuilder.analyze()` — measured at 14.4 s alone and 33 s under load |
| `CELL_BUDGET.signIn` | 20 s | one form sign-in: a real round trip through the mock auth server plus a server-rendered redirect |

Two of the three units are granted AUTOMATICALLY, at the point the work happens: `signInTo()` grants `CELL_BUDGET.signIn` and `settleForScan()` grants `CELL_BUDGET.scan`, both through `grantCellBudget`, which ADDS to whatever the cell already set. So a cell that signs in twice and scans four times gets that headroom with nothing written at the call site, and a cell that does neither gets none. What a cell still declares for itself is its POLLS: `test.setTimeout(cellBudgetMs({ polls: N }))` at the TOP of the cell (`test.setTimeout` REPLACES, so a declaration written after a grant would discard it).

**This is the host-contention mitigation (#864), and it is finished, not merely available.** [`cell-budget-census.test.ts`](cell-budget-census.test.ts) holds it with cells instead of a sentence, and holds it per CELL rather than per file:

- Every custom per-cell or per-describe timeout in this suite is built from `cellBudgetMs`, never a hand-rolled literal or formula (`a11y-finish-walk.spec.ts`'s own `test.setTimeout(30_000 * (FACES.length + 1))` and `counterparty-identity-walk.spec.ts`'s file-wide `test.describe.configure({ timeout: 150_000 })` were the two guesses that predated the vocabulary; both are gone).
- The two shared helpers actually grant what this census prices them at — a cell asserts that `signInTo` and `settleForScan` each call `grantCellBudget` themselves, because every other rule stands on it.
- Every cell's accessibility scans are covered: the census resolves each scan by FOLLOWING calls to the real scanner (`.analyze(`), whatever the file calls its own wrapper, and counts the settles (hence grants) the same cell reaches. A scan that is neither settled nor declared is an offence.
- Every cell whose own explicit waits — its own plus those of every local helper it calls, once per call — can consume the whole 30 s base declares `cellBudgetMs({ polls: N })` sized to them.

The first cut of that census (2026-09-21) keyed its scan rule on a helper named literally `scan(` and exempted every file that signs in anywhere, which made it blind to `signup-confirm-pending.spec.ts` — three cells running 2+ real axe passes, no sign-in, no budget — and to 17 more such cells across 15 signed-in files. It also claimed `checkout-gate-walk.spec.ts` was "the one file with that shape"; that claim was never measured by a detector that could see the other shapes, and it was false. The rules above replaced it (#864 fix round, 2026-09-23). A budget is still not a promise that a cell never reds: **running this suite alongside sibling worktree lanes on one host is expected to cost more wall-clock than the quiet-host measurements the table above records, and a cell that exceeds even a generous budget under real twelve-lane contention is evidence of load, not of a defect** — the fix for that is running the suite alone or sequencing heavy suites one at a time (above), which this budget vocabulary does not attempt to replace.

### The sign-in cold-start flake (#804)

`signIn()`/`signInTo()` (`helpers.ts`) are the ONE shared sign-in every spec in this suite calls — the 24 files (plus one inline copy) that used to each define their own were folded into it. Every call ends by waiting on the post-login destination with an EXPLICIT timeout (`CELL_BUDGET.signIn`, 20 s) rather than falling through to Playwright's own default `expect` timeout (5 s) the way most of the retired copies did, and `signIn()` additionally proves the post-login `navigation[name=Main]` landmark — but only at or above `SIDEBAR_BREAKPOINT` (`hooks/use-mobile.ts`, 768, imported rather than respelled), because below it the sidebar that owns that landmark renders as a CLOSED Sheet and the landmark is absent BY DESIGN. Making that wait unconditional reds every cell that sets a narrow viewport before signing in (measured: nine such cells across `operator-support-walk`, `personal-settings-walk` and `work-list-walk`, each waiting the full 20 s for an absent element) — that fallthrough is the measured cause of the intermittent timeout multiple browser-walk runs across the 2026-09-14 refresh wave observed on a freshly started server (e.g. `documents-viewer-walk`'s own fix-round report: "two `signIn` waits on `navigation[name=Main]`... flakes, not regressions").

Two measurements, same conditions as `CELL_BUDGET.scan`'s own note (`node e2e/run.mjs <spec>`, `reuseExistingServer: false`, so every run is cold by construction; this Mac, 2026-09-16, machine otherwise idle):

| What | Measured | Absorbed by |
|---|---|---|
| Cold server boot (this file's own readiness gate, `global-setup.ts`) | 160-970 ms for `${appOrigin}/login` to answer, first poll | `global-setup.ts`, before any test runs |
| Cold sign-in round trip (first cell of a fresh run, after the gate above) | ~960 ms, vs. ~500 ms once warm | `CELL_BUDGET.signIn` / the shared helper's own wait timeout |

Both measurements sit comfortably inside the existing 20 s figure — the measurement CONFIRMS `CELL_BUDGET.signIn`, it does not correct it. A slower or more loaded host (the original flake was observed under exactly that condition — several suites competing for one machine's CPU) is expected to cost more than this quiet-host measurement; the 20 s figure already carries over an order of magnitude of headroom above it.

`global-setup.ts` (wired into `playwright.config.ts`'s `globalSetup`) is a SEPARATE gate from the sign-in wait above: it polls the HTTPS app origin's own `/login` — the origin the browser actually drives, not only this config's `webServer.url` probe of the internal Next port — once, before the suite's first test, and blocks (with a 100 s bound, failing loudly on timeout) until it genuinely answers. On a warm host it returns on its first poll and costs nothing; it exists so the walk suite's first sign-in never pays the server's own first-hit cost on top of its own wait.

Three rules the budgets do not replace:

- **A budget is a ceiling, never a wait.** Nothing here makes a passing cell slower; the per-assertion timeouts are what actually bound each step.
- **Never spend a budget where a condition will do.** Wait for the state — `expect.poll` on the element that must become `document.activeElement`, on the animation count, on the row that must appear — not for a number of milliseconds. Use [`settleForScan`](helpers.ts) before every `AxeBuilder.analyze()` and [`ensureRealFocus`](helpers.ts) before the first key press after any navigation.
- **Read a lone red as timing only when the budget says so.** A cell that exceeds a budget sized like the table above has stalled; it is not evidence that the host was busy.

### The B4 focus-landing instant-read flake (#1141)

`work-question-walk.spec.ts`'s B4 cell asserts that answering the Needs-you `work_question` row
inline moves focus to the section heading once the row leaves, rather than dropping it on `<body>`.
The PRODUCTION behaviour was already correct (`work-question-affordance.tsx`'s `focusAfterRowReload`
— reload first, focus second, landed for #629) — the CELL was the defect: it read
`document.activeElement` with a single unwaited `page.evaluate` immediately after
`expect(row).toHaveCount(0, ...)`, rather than waiting for the state. `nextPaint()` (one
`requestAnimationFrame` plus one macrotask) runs AFTER the row's unmount commits, so there is a real,
if usually short, tick during which `document.activeElement` is transiently `<body>` (the browser's
own behaviour when a focused descendant is removed from the DOM) before focus lands on the heading —
exactly the window an instant read can catch. Measured (the ticket's own evidence): red once in each
of three whole-suite runs across two gates (riders wave 4 gate B, the cut-phase gate), green on every
other run and on every isolated re-run.

The fix is the rule two bullets up, applied: the instant read became an `expect.poll` over the
whole landing — `{ tag, text, tabindex }` returned from ONE `page.evaluate` inside the poll, asserted
with `toEqual({ tag: "H2", text: expect.stringContaining("Needs you"), tabindex: "-1" })`. A widened
timeout on an instant read would NOT have been a fix — it would still read whatever
`document.activeElement` holds at one arbitrary instant, just later. Only waiting for the SETTLED
state closes the race. **All three facts come back from inside the poll**, deliberately: the first
cut of this fix polled the TAG and then re-read `document.activeElement` in a second, unwaited
`evaluate` for its text and tabindex, which left the identity check racing the very movement the
poll exists to wait out (review round, ADV-L06-10).

**Reproduction, honestly reported — and the window MEASURED instead.** The defect is genuinely rare
(the ticket's own rate is once in three whole-suite runs), and this host could not force it:

- CDP `Emulation.setCPUThrottlingRate`, armed only around the "submit the answer" step, at rate 6
  (5 runs) and rate 20 (1 run): 6 attempts, 0 catches. Rate 50 across the whole walk crashed the
  renderer instead of usefully widening anything.
- The ticket's own instrument, run verbatim in the fix round: the PRE-FIX cell, **ten runs beside a
  parallel `node scripts/run-tests.mjs`** of the whole web unit suite — `10 green / 0 red of 10`.
  The same ten runs against the fixed cell: `10 green / 0 red of 10`.
- A whole-suite run with the PRE-FIX cell in place: 589 passed, no B4 red.

So the red was not reproduced on demand, and this document says so rather than implying otherwise.
**What WAS established, directly:** an in-page sampler recording every change of
`document.activeElement` (one per animation frame and one per macrotask beat) across the answer
submission shows the transient the instant read was reading. **Four independent runs on this host
all recorded the same sequence, `["BUTTON", "BODY", "H2"]`** — focus leaves the submit button,
spends a tick on `<body>` while the row is unmounted, and only then lands on the heading. That
`<body>` tick is the state the old unwaited read could observe; it is not hypothetical, and it is
why no amount of extra timeout on an instant read would have helped. (The sampler was a temporary,
uncommitted edit of this cell; it was reverted immediately, `git status` clean.)

And the cell's own discrimination is proven by the vacuity control the work order requires for a
test-only ticket: `restoreFocusAfterRow`'s final `landmark.focus()` call was temporarily dropped, and
the poll-based B4 cell then failed with `Timeout 15000ms exceeded while waiting on the predicate`
(the poll never sees the landing), proving the new assertion discriminates a real regression rather
than passing vacuously; the subject was restored byte-for-byte immediately after (`git diff` empty)
and the cell green again.

## Coverage map

The checked-in suite currently contains 54 specs. The table below describes 28 of them; the remaining 26 have no row yet and are named under [Specs with no coverage-map row](#specs-with-no-coverage-map-row) beneath it — so neither number here contradicts what a reader can count in the table or on disk. Writing the missing descriptions is deliberately outside [#1019](https://github.com/BELCORT-SDN-BHD/clara/issues/1019), whose Out of scope is "rewriting or auditing the individual per-spec description text in the coverage-map table"; it is carried as that ticket's follow-up.

| Spec | What it exercises |
|---|---|
| `entry-faces-walk.spec.ts` | Login, signup validation, invite refusal, confirmation, holding redirect, and global not-found |
| `signup-confirm-pending.spec.ts` | Signup, six-digit confirmation (including a pasted code), the resend control's sent and cooldown faces, firm step, legal stage, and pending state |
| `checkout-gate-walk.spec.ts` | Confirmation-to-checkout-to-claim journey and fail-closed request boundaries, including the two-agreement legal stage: an unpublished draft previewed but never accepted, each agreement accepted on its own, a reload that resumes from the server's own record, and the `legal_not_accepted` checkout refusal with its route back. #628 adds the intent lifecycle: the unpaid/processing/failed/expired/cancelled faces each read back from the door with only the act available in them, the wait converging session → processing → paid → claim through a server re-read (never a client-side guess), "Try again" on a failed payment opening a NEW intent, cancel running `cancel_checkout_intent` before a best-effort Stripe expiry (which refuses on this harness — the intent stays cancelled, which is the production contract), a `payment_in_flight` cancel refused with the intent intact, resume never minting a second Session, the admission-full face with no pay control and the door's own `capacity_reached` refusal behind it, a replayed claim converging onto ONE firm — the harness is single-threaded, so this walk proves REPLAY and CONVERGENCE (a second claim lands on the firm the first one made) and not concurrency; the real race is the DB cell `cc.28` in `packages/db/tests/checkout-convergence.test.mjs`, which runs two sessions against one payment, the `payments_misconfigured` card (the harness leaves `STRIPE_SECRET_KEY` unset, so the configuration refusal — not the outage one — is what a person reads), and the two waiting faces at 320 CSS px, 200% zoom, under reduced motion, with a stable URL and Back re-reading the door |
| `firm-navigation-walk.spec.ts` | Rank-shaped sidebar and settings hub, Work's saved "Needs you" view, and the Work/Activity agent-task split |
| `home-board-walk.spec.ts` | Firm and client home boards, responsive composition, and activity summary |
| `responsive-shell-walk.spec.ts` | Narrow/zoomed shell, the mobile sheet and docked-rail behavior, keyboard focus, tabs, assets, and accessibility |
| `identity-finish.spec.ts` | Brand assets, entry faces, Clara mascot, and reduced motion |
| `a11y-finish-walk.spec.ts` | Target size, skip link, focus ring, reduced motion, and axe scans across the shell's own surfaces |
| `parity-holes.spec.ts` | Client/thread isolation, password recovery, route errors, and rail layout |
| `chat-parity-walk.spec.ts` | Clarifications, attachments, thread creation/switching, stream proxying, and typed cards; a clarify answered IN PLACE while a 900-delta stream is still arriving (the timer census is taken over a window 200 DECODED deltas wide, never a fixed wait) and the turn clock is counting (the live view must not be replaced by a send error, and no React nested-update or hydration fault may reach the console), at 320 CSS px, plus reduced motion counted as MOVEMENT on the clarify group |
| `agentic-finish-walk.spec.ts` | Capability-shaped commands, task reattachment, onboarding receipt states, chart apply, and (#897) the rail's full-screen altitude round trip — a typed interview answer surviving both remounts and keyboard focus returning to the escalate control |
| `journals-table-walk.spec.ts` | Journal tables, filters, disclosure, approval, clarifications, and accessibility. #634 review round: an expanded POSTED row discloses its purpose, its Work link, its operation receipt with a working copy control, and its source — "No document" for a Work-recorded entry and the named lane for a document-coded one |
| `documents-viewer-walk.spec.ts` | Safe document viewing, evidence overlays, extraction hierarchy, CSP reporting, and accessibility. #620 adds source custody at the face: the original downloaded with `disposition=attachment` and its object URL released, a viewable original still opening its own tab while an un-previewable one is never offered it, the six refusals (denied, not-found, storage-unavailable, custody-pending, expired session, integrity) rendering DISTINCTLY, Retry reaching the wire a second time and clearing the failure, `?document=` surviving a reload with the browser's own Back closing the detail and an unshowable id clearing the parameter, and a keyboard-only pass — open with Enter, focus landing in what was opened, back out, download — whose F9 cell samples focus ACROSS the read (vacuity control first: the busy window must appear in the samples before their focus values mean anything; on `disabled={busy !== null}` it measured `BODY×12`), at 320 CSS px, 200% zoom, under reduced motion, with axe run on a document open beside a standing refusal |
| `bank-close-registers-walk.spec.ts` | Refusal-preserving dialogs, close restart, and human-readable close holds |
| `money-input.spec.ts` | Exact-cent input and ambiguous-input refusal |
| `interview-walk.spec.ts` | Real-stack onboarding interview and Tax route reachability when its fixture is supplied |
| `reports-download-walk.spec.ts` | Real-stack sealed artifact download when its fixture is supplied |
| `journal-work-walk.spec.ts` | #623's durable-Work journey: the Accounting hub's primary act, the composer's validation and first-invalid focus, a restored draft and its unknown account, submit → the Work detail running to a posted entry, a typed refusal and the Retry that starts a NEW run of the SAME Work, a LOST acknowledgement resolving to that same Work through its intent key, the `work_accepted`/`work_status`/`work_result` cards in a transcript, the malformed-id not-found boundary, 320 CSS px and 200% zoom, reduced motion, heading focus that a background poll never takes back, a console/pageerror collector proving the Work detail route hydrates clean in both its completed and its parked face, and #848: an owner presses Reactivate on the `egress_not_authorized` face and reaches migration 0211's door end to end (the banner converges to active and the press re-reads), a governed `no_consent` refusal rendered verbatim, and a forced denial rendering the database's own CLR04 owner-floor refusal (simulated at the wire — every cell in this spec signs in as the owner persona, so the mock is armed rather than driven by an actual rank check; see the test's own header comment) |
| `manual-journal-walk.spec.ts` | #634's optional and LATE evidence on the expert journal path: the composer's optional document chooser (an explicit "No document" default) and the draft that carries the choice across a reload under one intent key, the `source_already_posted` Alert with its link to the entry that already stands on the document and no resubmit of that intent, a refusal naming `sourceRefs[N]` landing on the evidence control with the draft intact, the B3 late-attachment Dialog (initial focus, the two conflicts, the happy path, focus return) and its CLR06 stale race with the choice preserved, plus 320 CSS px, 200% zoom, reduced motion and keyboard operation. Review round: Escape closing the Dialog and RETURNING focus to its trigger with the choice intact and nothing attached, and an UNVERIFIED filed document offered by neither chooser (the estate's custody floor, `bytes_verified_at is not null`). #728 finding 5: BOTH pickers (composer, late-attach Dialog) offer a document that already backs a posted entry as a DISABLED option that a real `selectOption` cannot choose, never hidden, with the reason on the option's own label and ONE summary line beside the select; the door's own `source_already_posted` refusal is reached the way a person reaches it — with the advisory `list_spoken_for_documents` read UNAVAILABLE (the `break_spoken_for` fixture arm), which re-enables every option and is a real production state. #728 finding 3: a successful late attachment moves focus to the "What was recorded" heading, never `<body>`, once the Dialog and its trigger are both gone |
| `work-question-walk.spec.ts` | #629's shared Work question on B3: the parked question with its reason and version, a bounded KEYBOARD walk through a two-field stepper to a review step and one submit, first-invalid focus on an amount the browser can refuse (three decimal places), a draft that survives a real navigation, answered-elsewhere and stale-version convergence that re-reads the authoritative record and KEEPS the draft, a denied read-only surface, 320 CSS px with no page-wide horizontal scroll, 200% zoom, and reduced motion; and on B4/B6: the Needs-you `work_question` row answered inline with focus landing on the section heading rather than the body once the row leaves, that row's form at 320 CSS px under reduced motion, a stable inbox URL that Back returns to, a Clara transcript's `work_question` card rendering the accepted record with NO live region of its own, the durable `work_accepted` card finding a GENUINELY PARKED Work's question after a reload and answering it in place (#629's follow-up gap), and the supporting source the run named |
| `work-cancel-walk.spec.ts` | #630's cancellation journey on B3: the Cancel Work dialog that asks before it acts (Title, what STAYS said first, initial focus on the SAFE action, Escape dismissing without ever reaching the door and returning focus to its trigger), the STOPPING arm shown while an admitted operation settles and the 3-second poll converging it onto `cancelled` with the run's superseded outcome, a cancel that LOST the race rendering the receipt and linking the entry instead of claiming a cancellation, a denied cancel as a persistent banner that survives a poll, Take responsibility on a `refused`/`authority_lost` Work with the interpreted-basis confirm step, a stable Work URL across cancel and Back, 320 CSS px and 200% zoom with the dialog fitting and no page-wide horizontal scroll, and reduced motion measured on MOVEMENT alone; plus the B7 rail's own two cells — "Stop reply" rendering for a turn this tab did NOT post (the DB's own live row, i.e. the reload case), the two labels distinct with no bare "Stop" on either, one `cancel_agent_task` and no Work-level cancel behind the press, the Work card still running afterwards, closing the rail pressing neither door, and a REFUSED stop saying the reply is still running rather than printing "Stopped" over a live run — and saying ONLY that, never that this tab has gone back to reading the turn, on a screen whose runtime lane serves no stream for the armed task (the re-attach clause is gated on `openTaskStream` actually resolving) — (the refusal's four causes — the bookkeeper floor, a turn that had already finished, any other governed refusal, and a transport failure — are told apart at the hook and rendered as one `role="status"` line, pinned in `components/clara/thread-stop-reply.test.tsx`); and a third B7 cell for the answer the door has to DISCRIMINATE — a press that terminally cancelled a still-QUEUED turn says "Stopped" with its clock retired, while a turn that had already ended before the press still reads "Nothing was stopped", the two being the same `status:'cancelled'` on the wire and told apart only by the door's `changed`/`transition` (`packages/db/tests/work-cancel.test.mjs` wc.35 pins the database side) |
| `shell-migration-walk.spec.ts` | #614's unified shell: the legacy `/admin`/`/needs-you` redirect matrix, identity at every width, the keyboard scope switcher and its cross-client isolation guarantee, the mobile sheet's keyboard contract, the Accounting sidebar group, reduced motion, the client-not-found boundary (a bogus id, and — via a same-process visibility toggle — a client that goes invisible mid-session), one overlay stack (the Clara rail plus the mobile nav Sheet open together at 640px), Work's destination split, settings rank-shaping, and the train's retired entries |
| `personal-settings-walk.spec.ts` | #626's `/settings/account`: loaded/dirty/saved/reload-persists, per-field Reset, save failure (CLR10) preserving dirty state with first-invalid-focus, concurrent change (CLR06) and Reload-and-keep-my-edits, denied/signed-out, the honest Notifications "not configured" note, the saved motion preference's `data-motion` attribute independent of the OS setting, keyboard-only save, 320px and 200%-zoom layout, and deep link/Back |
| `tax-boundary-walk.spec.ts` | #627's Tax tab: the SST watch's enabled/empty/stale/denied/technical-failure states as distinct labelled regions, the capability-boundary deep link and its focus return (both click-driven and a fresh navigation), 320px, reduced motion, and the `/admin/compliance` legacy redirect into the rebuilt compliance register |
| `tax-compliance-watch-receipt-walk.spec.ts` | #997's compliance-watch RECEIPT on the client Tax tab: acknowledge, snooze and resolve an open SST watch against a served build (never a stub), each act's `get_compliance_watch_disposition` re-read showing the honest "nothing recorded" reading beforehand and a NEW disposition line after each act — the actor resolved to a name, the `state_before → state_after` transition, the rationale/evidence and the "no version number" note — proving the wiring a stubbed unit cell cannot: a write that succeeds and then shows nothing new |
| `activity-feed-walk.spec.ts` | #632's `/activity`: representative upload/posting/correction/close/report/agent-receipt/conversation-maintenance rows with attribution, kind and client filters written to the URL, keyset "Load more" with dedupe-by-(source,id), a correction's two-sided original/replacement link, the `?event=` detail Sheet's Title/initial-focus/Escape/focus-return and Back-preserves-filters contract, a no-oracle denied detail via a direct deep link, live permission loss clearing the list on a focus recheck, 320px, 200% zoom, and reduced motion. #728 finding 4: history Back returns focus to the row that opened the Sheet (not just that the URL/filters survive). #728 finding 1: a KEPT sweep-heartbeat row reads "Clara (system)" under kind Agent (never Documents) and no row on the page is unattributed |

| `work-list-walk.spec.ts` | #641's B3 durable Work list on BOTH `/work` and `/clients/:id/work`: rows carrying their derived state WORD (including "Retrying", which is `attempts > 1` rather than a status), the client and the origin of a chat-started Work; status facets and free text written to the URL and cleared from it; the two Empty states told apart (filtered no-results keeping its filters and offering Clear filters, versus a client with no durable Work reading as first use); a live permission loss clearing the rows with no affordance that could only refuse; keyset Pagination writing `?cursor=` with Back returning to the first page and no total ever claimed; a filtered deep link whose Back out of the detail restores the identical query; the built-in "Needs you" saved view still a link marked `aria-current`; the client surface pinning its own client with no client picker; keyboard Enter into a row's durable address; the 320 px filter Sheet naming how many filters are applied; narrow list-to-detail and Back; 200 % zoom; reduced motion; the Work detail's current question proved to PRECEDE the Results/Sources/Activity tab strip with `compareDocumentPosition`; and an axe scan of `/work` at 320 px. The pagination control is asserted as `role="button"` because shadcn base-nova's `PaginationLink` renders its real `<a href>` through Base UI's Button with `nativeButton={false}` — measured, not preferred |

| `tenancy-rent-plan-walk.spec.ts` | #949's tenancy leg on the Documents detail's FACTS view: each contract term rendered with what the page printed and WHERE it was read from — the rent citing one region, the term's last day declaring itself a DERIVATION and naming both regions it needed — the MPERS Section 20 branch with the MFRS 16 sentence beside it, the drafted plan's schedule and its two legs (debit rent expense, credit rent payable, never the bank), a Confirm that reaches `confirm_tenancy_rent_plan` with this client, this document, a null judgement and a fresh op_key, an axe scan of the settled face, and a second leg where a payable that is really a bank account is refused: the database's own sentence and CLR10 render in the PANEL'S OWN feedback box rather than the one next to it |

These files use `.spec.ts` because the package's Node test manifest accepts `*.test.*` files. Do not add Playwright specs to [`test/manifest.txt`](../test/manifest.txt).

### Specs with no coverage-map row

These 25 checked-in specs are real and run; only their description above is missing. [`spec-discovery.test.ts`](spec-discovery.test.ts) holds this list against the directory itself, so a spec can be neither added nor removed without landing in exactly one of the two — the table above or the list below.

- `accrual-walk.spec.ts`
- `adjustments-retired-walk.spec.ts`
- `bank-match-walk.spec.ts`
- `client-create-walk.spec.ts`
- `counterparty-identity-walk.spec.ts`
- `deferred-revenue-walk.spec.ts`
- `depreciation-walk.spec.ts`
- `document-correction-walk.spec.ts`
- `documents-intake-walk.spec.ts`
- `firm-commercial-walk.spec.ts`
- `firm-setup-walk.spec.ts`
- `fixed-asset-acquisition-walk.spec.ts`
- `intake-batch-walk.spec.ts`
- `knowledge-firm-walk.spec.ts`
- `knowledge-walk.spec.ts`
- `members-invite-walk.spec.ts`
- `opening-ledger-source-walk.spec.ts`
- `operator-support-walk.spec.ts`
- `payroll-settlement-walk.spec.ts`
- `periodic-adjustment-walk.spec.ts`
- `plans-walk.spec.ts`
- `prepayments-walk.spec.ts`
- `staff-advances-register-walk.spec.ts`
- `staff-expense-claim-walk.spec.ts`
- `trade-invoice-walk.spec.ts`
- `work-knowledge-walk.spec.ts`

## CI status

The browser suite is not a required GitHub Actions check today. The repository CI runs the web build, Node tests, runtime/database e2e checks, and other gates, but it does not invoke `pnpm --filter @clara/web e2e`. Browser verification and its delivery obligations are included in the [refresh spec and audit appendices](https://github.com/BELCORT-SDN-BHD/clara/issues/612).
