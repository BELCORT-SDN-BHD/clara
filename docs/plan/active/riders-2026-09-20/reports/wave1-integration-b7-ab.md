# Wave 1 riders — B7 controlled A/B: integration vs `origin/main`

**Question.** Did riders wave 1 make `apps/web/e2e/work-cancel-walk.spec.ts:352` ("B7: a REFUSED
stop says the reply is still running — it never prints Stopped over a live run") fail MORE OFTEN
than it does on `origin/main`? The failing assertion is line 382,
`expect(rail.getByRole("button", { name: "Stop reply" })).toBeVisible()` — the one assertion in the
cell with no explicit timeout override, so Playwright's default 5000 ms applies.

**Answer, in one line.** The defect is **pre-existing and reproduces on `origin/main` at 36 %**
(8 of 22 runs), by the identical mechanism and with the byte-identical failure artifact. The
integrated branch failed **73 %** (16 of 22). The difference is real in direction but only
marginally significant at this sample size (one-sided p ≈ 0.02–0.03), and **no wave-1 commit is
responsible**: the named hypothesis (`80a94719`'s `stream.ts` hunk) is excluded by code, not by
guesswork. **No product code was changed.** A bug-ticket body is drafted at the end of this report.

---

## Rig

| | INTEGRATION | MAIN |
|---|---|---|
| Worktree | `C:\Users\zhant\Desktop\clara-wt\int` | `C:\Users\zhant\Desktop\clara-wt\mainref` (created for this task, removed at the end) |
| Ref | `integration/riders-w1` @ `cd7da1116` | detached @ `e7f0a10af` (`origin/main`) |
| Triple | `3600 / 3601 / 3602` | `3610 / 3611 / 3612` |

Command on both sides, from the worktree root, every Bash call prefixed with
`export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`:

```
CLARA_E2E_APP_ORIGIN=… CLARA_E2E_NEXT_PORT=… CLARA_E2E_RUNTIME_PORT=… \
  pnpm --filter @clara/web e2e -- work-cancel-walk
```

`work-cancel-walk.spec.ts` is **byte-identical on both sides** (`git diff e7f0a10a cd7da1116 --
apps/web/e2e/work-cancel-walk.spec.ts` is empty), so both sides run the same 10 cells and the same
assertion.

Three deviations from the prescribed method, stated up front:

1. **`--no-build` does not exist on `main`.** It is itself a wave-1 addition (`e2e/run-args.mjs`,
   #851 — `git cat-file -e e7f0a10a:apps/web/e2e/run-args.mjs` fails). Runs 02–12 therefore used
   `--no-build` on the integration side only; from run 13 onward **both sides build every run**, so
   the protocol is symmetric for runs 13–23. The gap is present in both blocks, so the flag is not
   the explanation. (Measured: `main`'s rebuild is a warm incremental `next build`, "Compiled
   successfully in 2.4 s", ~15–20 s wall including typecheck, finishing before `next start` is
   spawned.)
2. **More than 12 runs per side.** 8–12 was ambiguous (see "Why the first 12 runs were misleading"),
   so the sample was extended to 22 valid runs per side.
3. **Run order was reversed half-way.** Runs 01–17 are `main`-then-`int`; runs 18–23 are
   `int`-then-`main`. This was added after the first block, because with a strictly fixed order the
   side that always runs second inherits the other side's teardown and whatever host load it left.
   It mattered: see below.

Two runs were voided by build failures, not by the test: `main-14` (`next build` panic
`3221226505` = `0xC0000409`, the known #869 class) and `int-13` (`tsc` crashed during the build's
typecheck, "Failed to type check"). Neither reached the browser; both are excluded from the rates.
The host carried ten other lane workers' database tests and typechecks throughout, by design — the
load applies to both sides and the sides never ran at the same moment.

---

## Run table

`B7` is the cell at line 352 only. `pw` is Playwright's own reported suite duration.
A failing run is always **the same assertion at line 382** and **the same rail status text** —
`"You no longer have access to this reply. Ask an owner or an administrator at your firm if you
think that is wrong."` — read from `error-context.md` in the cell's artifact directory. No other
cell in the file failed in any of the 44 runs (the other 9 always passed).

| # | Order | Side | Start (UTC) | Wall | pw | B7 | B7 dur |
|---|---|---|---|---|---|---|---|
| 01 | main→int | main | 06:01:03 | 122 s | 1.0 m | **pass** | 1.3 s |
| 01 | | int | 06:03:15 | 84 s | 1.1 m | **FAIL** | 6.3 s |
| 02 | main→int | main | 06:06:09 | 74 s | 59.2 s | pass | 1.9 s |
| 02 | | int | 06:07:26 | 59 s | 57.9 s | pass | 1.0 s |
| 03 | main→int | main | 06:08:31 | 69 s | 56.1 s | pass | 1.1 s |
| 03 | | int | 06:09:40 | 57 s | 56.1 s | pass | 1.1 s |
| 04 | main→int | main | 06:10:37 | 75 s | 1.0 m | pass | 1.3 s |
| 04 | | int | 06:11:53 | 69 s | 1.1 m | **FAIL** | 6.5 s |
| 05 | main→int | main | 06:13:07 | 87 s | 1.1 m | pass | 2.0 s |
| 05 | | int | 06:14:35 | 85 s | 1.3 m | **FAIL** | 6.5 s |
| 06 | main→int | main | 06:16:02 | 110 s | 1.3 m | **FAIL** | 6.3 s |
| 06 | | int | 06:17:52 | 76 s | 1.2 m | **FAIL** | 8.7 s |
| 07 | main→int | main | 06:19:09 | 115 s | 1.3 m | **FAIL** | 6.4 s |
| 07 | | int | 06:21:05 | 72 s | 1.2 m | pass | 2.5 s |
| 08 | main→int | main | 06:22:25 | 110 s | 1.2 m | pass | 2.0 s |
| 08 | | int | 06:24:16 | 105 s | 1.6 m | **FAIL** | 8.2 s |
| 09 | main→int | main | 06:26:05 | 91 s | 57.7 s | pass | — |
| 09 | | int | 06:27:36 | 65 s | 1.1 m | **FAIL** | 6.6 s |
| 10 | main→int | main | 06:28:41 | 78 s | 1.0 m | pass | 1.3 s |
| 10 | | int | 06:30:00 | 69 s | 1.1 m | **FAIL** | 6.3 s |
| 11 | main→int | main | 06:31:18 | 86 s | 1.2 m | **FAIL** | 6.4 s |
| 11 | | int | 06:32:45 | 66 s | 1.1 m | **FAIL** | 6.2 s |
| 12 | main→int | main | 06:33:51 | 79 s | 1.1 m | pass | 1.7 s |
| 12 | | int | 06:35:10 | 78 s | 1.2 m | pass | 1.9 s |
| 13 | main→int | main | 06:37:37 | 119 s | 1.5 m | pass | 1.9 s |
| 13 | | int | 06:39:37 | — | — | *void* | tsc crash in build |
| 14 | main→int | main | 06:40:07 | — | — | *void* | build panic `0xC0000409` |
| 14 | | int | 06:40:09 | 91 s | 1.2 m | **FAIL** | 6.5 s |
| 15 | main→int | main | 06:41:40 | 102 s | 1.4 m | **FAIL** | 10.3 s |
| 15 | | int | 06:43:22 | 106 s | 1.4 m | **FAIL** | 10.5 s |
| 16 | main→int | main | 06:46:30 | 144 s | 1.7 m | pass | 2.8 s |
| 16 | | int | 06:48:57 | 105 s | 1.2 m | pass | 2.3 s |
| 17 | main→int | main | 06:50:45 | 101 s | 1.1 m | pass | 1.6 s |
| 17 | | int | 06:52:26 | 95 s | 1.2 m | **FAIL** | 6.6 s |
| 18 | **int→main** | int | 06:56:34 | 94 s | 1.3 m | **FAIL** | 6.8 s |
| 18 | | main | 06:58:10 | 128 s | 1.4 m | **FAIL** | 6.6 s |
| 19 | **int→main** | int | 07:00:19 | 102 s | 1.5 m | **FAIL** | 7.8 s |
| 19 | | main | 07:02:02 | 87 s | 1.1 m | **FAIL** | 6.5 s |
| 20 | **int→main** | int | 07:03:29 | 75 s | 1.0 m | pass | 1.1 s |
| 20 | | main | 07:04:44 | 98 s | 1.2 m | **FAIL** | 6.6 s |
| 21 | **int→main** | int | 07:07:02 | 91 s | 1.3 m | **FAIL** | 6.8 s |
| 21 | | main | 07:08:34 | 94 s | 1.2 m | pass | 2.0 s |
| 22 | **int→main** | int | 07:10:11 | 104 s | 1.2 m | **FAIL** | 6.5 s |
| 22 | | main | 07:11:56 | 85 s | 1.1 m | **FAIL** | 6.8 s |
| 23 | **int→main** | int | 07:13:22 | 87 s | 1.2 m | **FAIL** | 6.7 s |
| 23 | | main | 07:14:49 | 87 s | 1.1 m | pass | 2.0 s |

A passing B7 costs 1.0–2.8 s; a failing one costs 6.2–10.5 s (the 5 s timeout plus the trace/artifact
write). There is no intermediate.

---

## The two rates

| Side | Valid runs | B7 failures | Rate |
|---|---|---|---|
| `origin/main` `e7f0a10a` | 22 | 8 | **36.4 %** |
| `integration/riders-w1` `cd7da111` | 22 | 16 | **72.7 %** |

By run order:

| Order stratum | `main` | `int` |
|---|---|---|
| `main` first (pairs 01–17) | 4 / 16 = 25 % | 11 / 16 = 69 % |
| `int` first (pairs 18–23) | 4 / 6 = 67 % | 5 / 6 = 83 % |

### Is the difference meaningful at this sample size?

- **Unpaired (Fisher's exact, one-sided, 8/22 vs 16/22): p ≈ 0.018.**
- **Paired (McNemar over the 22 adjacent pairs): 9 pairs where only `int` failed, 2 where only
  `main` failed, 11 concordant. One-sided exact p = 67/2048 ≈ 0.033.**

So: significant at the conventional 5 % level one-sided, **not** at 1 %, and not significant
two-sided under the paired test. Both order strata point the same way, which is the main reason to
believe the direction at all.

**What 22 runs a side can show:** that both branches fail this cell regularly; that the mechanism is
identical on both (same assertion, same artifact, same status text); and that the integrated
branch's rate is about twice `main`'s, with roughly a 1-in-30 to 1-in-50 chance of seeing a gap this
large from noise alone.

**What it cannot show:** a confidence interval anyone should plan around. The 95 % CI on the rate
difference (36 % vs 73 %) runs from roughly +7 to +60 percentage points — the data are equally
consistent with "wave 1 barely moved it" and "wave 1 doubled it". Nor can it show *why*: the host's
own load drifted upward over the 75-minute session (`main` went 0/5 in the first five runs and 4/6
in the last six), and a drifting baseline is exactly what a 22-run sample cannot separate from a
small branch effect. The honest summary for the wave's gate is: **this cell is an unreliable red on
both branches and will keep reddening the browser suite until the underlying defect is fixed.**

### Why the first 12 runs were misleading

At 12 runs a side the gap read 3/12 (`main`) vs 8/12 (`int`), p ≈ 0.05. That block ran
`main`-then-`int` every time, and only `int` used `--no-build` — so `int`'s browser run always
started immediately after `main`'s teardown, while `main`'s always had its own 15–20 s build as a
settling buffer. Reversing the order (pairs 18–23) moved `main`'s rate from 25 % to 67 %, which is
most of the original gap. The conclusion survived the correction, but it is much weaker than the
first block suggested, and reporting the first block alone would have been wrong.

---

## The mechanism, from the code

Everything below is read from `integration/riders-w1` and is identical on `origin/main` except
where noted.

**The walk's set-up.** `control(op: "live_turn")` arms a chat turn this tab did not post — the state
a reload onto a running reply lands in. The tab therefore has no stream of its own: `openStream` is
called only from `sendMessage`, `retryConnection` and `stopReply`'s re-attach
(`apps/web/lib/clara/useClaraThread.ts:544, 596, 654, 707`), and the walk drives none of them before
the press. `control(op: "stop_answer", mode: "denied")` arms `clara.cancel_agent_task` to answer
CLR04 (the bookkeeper floor).

**What the press does, in order.**

1. `stopReply()` (`useClaraThread.ts:663`) aborts this tab's read first, unconditionally — a no-op
   here, because `streamAborts` (`apps/web/lib/clara/threadStore.ts:90`) holds no controller for the
   armed task.
2. `spendStop(taskId)` calls the door, which denies. `setStop({ phase: "failed", cause: "denied" })`
   renders the denial banner (`ClaraThreadView.tsx:649`, gated `stopFailedCause !== null && !stopped
   && !revoked`). **This is what the walk's assertion at line 373 sees, and it has never failed in
   44 runs** — the denial reliably arrives first.
3. Because the refusal is not `finished`, `stopReply` opens a re-attach:
   `openStream(taskId)` → `runClaraTaskStream` → `openTaskStream`. **The walk serves no
   `/api/tasks/:id/stream` for the armed task**, so the attach is refused with 404.
4. `stream.ts:568` turns a refused attach into a `revoked` event, deliberately (#642: "an attach
   the route REFUSED (403/404 — this reader may not see this task) … is delivered as `revoked` and
   this function RETURNS"). No sleep, no retry: the loop returns before its backoff.
5. `claraThreadStore.applyStreamEvent` (`threadStore.ts:384`) handles `revoked` by writing
   `{ stream, parkedClarify: null, turnStartedAt: null, **turnStatus: null**, lastSendReplayed:
   false }`.
6. **That `turnStatus: null` is what unmounts the Stop control.** `ClaraThreadView.tsx:218`'s
   `turnLive` is true in exactly four ways — this tab is posting, the stream is `streaming`, the
   stream is `detached`, or the DB arm (`activeTaskId !== null && turnStatus !== null &&
   THREAD_RUN_LIVE_STATUSES.includes(turnStatus)`). For a turn this tab did not post, the DB arm is
   the only live one, and `revoked` is neither `streaming` nor `detached`. So `turnLive` flips false
   and the `turnLive && !stopped` branch at line 680 stops rendering the button.
7. At the same moment `revoked` becomes true (`ClaraThreadView.tsx:307`), which suppresses the
   denial banner and prints "You no longer have access to this reply…" — exactly the status line
   every failure artifact captured.

**The two pieces of state that race, and who wins.** `stop.phase` (set synchronously when the door
answers) and `stream.status` (set one HTTP round trip later, when the re-attach 404s) are
independent. The test's remaining four assertions after the denial banner (lines 374–382) are four
Playwright round trips; the app's path is one fetch through the Next route to the mock runtime plus
a React commit. Both are tens of milliseconds, both scale with host load, and neither is
sequenced against the other. When the fetch wins, `turnStatus` is already `null` by the time line
382 queries the DOM, the button is gone, and `toBeVisible()`'s 5 s default expires without it ever
coming back — the failure is permanent within the cell, not slow.

**Why the wave-1 hypothesis is excluded.** `80a94719` (#956) added `abortableSleep` to
`stream.ts`, which differs from the previous `await sleep(delayMs)` in exactly one circumstance: the
signal aborts while a backoff sleep is pending. Neither half can occur here. (a) `abortStream` is
the only production caller that aborts, and at the moment of the press `streamAborts` holds nothing
for this task — `registerStreamAbort` is called only inside `openStream`
(`useClaraThread.ts:286`), and none of `openStream`'s four call sites has run yet. (b)
`runClaraTaskStream`'s only sleep site is the reconnect backoff, reached only after an attach that
*opened* and then ended; the walk's single attach is refused at open and the function returns at the
`StreamAccessRevokedError` arm before any sleep. The wave's other change to this area,
`threadStore.abortAllStreams` (also #956), is reached by no production surface — its own header says
so, and the only caller is `use-clara-thread-stop.test.ts`'s `afterEach`. `apps/web/e2e/serve-built.mjs`
and `journal-work-mock.mjs` changed in wave 1, but both changes are additive, lane-scoped early-return
handlers (#879, #848) on the Supabase path, not the runtime stream path.

I did not identify a wave-1 commit that plausibly moves this race. The remaining candidate class is
diffuse — wave 1 touched the work-list surface itself (`work-list-filters.tsx`,
`needs-you-counts.tsx`, `needs-you.ts`, `components/ui/select.tsx`), any of which could shift the
browser's main-thread cost by a few milliseconds either way — and **that is unverified**: I have no
measurement isolating it, and I am not going to name a commit I cannot point evidence at.

**Can a person hit this in the real product?** Partly, and the part that is real is worse than the
walk's version.

- The walk's own arm — a role-denied stop whose re-attach 404s — is mostly a fixture gap. A member
  whose stop was refused on the **role** floor (CLR04) still has read access, so in production the
  re-attach would open, `reattach: "reading"` would be set, and the two banners would not collide.
- But `stream.ts` converts **any** 403/404 on that route into "you no longer have access". A 404
  from the stream route also means *the runtime no longer holds this task* — a reply that has simply
  ended, been reaped, or a stale id. In that case a real person who presses Stop and is refused is
  told "You no longer have access to this reply. Ask an owner or an administrator at your firm if
  you think that is wrong." about a reply they have every right to read. That is precisely the
  existence-oracle failure #642's own comment forbids ("It must never become an EXISTENCE
  ORACLE — the copy says what this reader can no longer do, never whether the task or the firm
  exists"), arriving on the stop path rather than the first-attach path.
- And in every case the Stop control silently disappears while the rail is still asserting the reply
  is live, because `turnStatus: null` retires the DB arm of "is a turn live?" as a side effect of a
  statement about *this reader's access*.

**Why this was not fixed here.** The estate already pins the current behaviour deliberately, on the
opposite side of the walk's assertion: `apps/web/lib/clara/use-clara-thread-stop.test.ts:1253`,
"642 a refused stop whose re-attach is REFUSED says so, and does not keep a question that cannot be
answered", asserts `stream.status === "revoked"` and `provisionalChunks.length === 0` for exactly
this scenario, with a written rationale. The browser cell at line 382 and that unit cell cannot both
hold once the `revoked` event lands; B7 passes only when Playwright's check outruns the fetch. Which
one is right — does a refused re-attach that *this tab itself opened after a refused stop* mean the
reader lost access, or only that this tab could not resume reading? — is a product decision with a
reviewed rationale on the other side. Changing it would mean editing that unit cell's assertions,
i.e. weakening a test to get a walk green, on an integration branch ten lanes just merged into.
That is the owner's call, not an integration diagnosis worker's. Hence: no product code changed, and
the ticket below.

---

## Drafted bug ticket

> *Draft only — not filed. The task forbids writing to GitHub.*

### Context

`apps/web/e2e/work-cancel-walk.spec.ts`'s B7 cell "a REFUSED stop says the reply is still running —
it never prints Stopped over a live run" is a non-deterministic red on **both** `origin/main`
(`e7f0a10a`: 8 failures in 22 isolated runs, 36 %) and the wave-1 integration branch
(`cd7da111`: 16 in 22, 73 %), measured 2026-09-20 in a controlled alternating A/B under ten-worker
host load (`docs/plan/active/riders-2026-09-20/reports/wave1-integration-b7-ab.md`). Every failure
is the same assertion (line 382, the rail's "Stop reply" button, Playwright's default 5 s) and the
same captured rail status line: "You no longer have access to this reply. Ask an owner or an
administrator at your firm if you think that is wrong."

It is not a host-load flake in the usual sense: the cell's own earlier assertions never fail, the
failing state is permanent within the cell rather than slow, and it reproduces on a branch that
changed none of the code on the path. The gate report
`wave1-integration-gates-B.md` classified it (b) pre-existing and named the mechanism; the A/B above
confirms "pre-existing" against `origin/main` and excludes #956's `stream.ts` change as the cause.
CI does not run the browser suite, so nothing else will catch this.

The underlying defect is not only a test problem — see Current behavior. It also puts the estate in
contradiction with itself: the browser cell and the unit cell "642 a refused stop whose re-attach is
REFUSED says so, and does not keep a question that cannot be answered" cannot both hold, and today
which one passes is decided by a race.

### Agent Brief

**Category:** bug

**Summary:** A refused re-attach that this tab opened *after* a refused stop is reported to the
reader as a loss of access, and silently retires the live turn — so the Stop control vanishes and
the refusal the reader was just given is overwritten.

**Current behavior:** Pressing Stop on a live reply the door refuses shows the correct refusal
("could not stop this reply … it is still running"). The surface then re-opens its own read of that
reply so the reader keeps seeing the answer arrive. If that re-open is answered with "not found" or
"forbidden", the surface treats it as though the reader's access to the reply had been revoked: it
replaces the refusal with "You no longer have access to this reply. Ask an owner or an administrator
at your firm if you think that is wrong.", discards the buffered parts of the answer, retires the
turn clock, and — because the surface's record of whether a turn is live is cleared at the same time
— removes the Stop control entirely. The reader is told they have lost access to a reply they may
well still read, on the evidence of one refused re-open, and the four independent ways the surface
knows a turn is live are reduced to none by a statement about access. "Not found" from that read also
covers a reply that simply ended or was reaped, so an existence fact is rendered as an access fact —
which the revocation copy is explicitly not allowed to be.

**Desired behavior:** A refused re-attach that follows a refused stop says only what it establishes:
this tab could not resume reading the reply. The refusal the reader was just given stays on screen,
the turn stays as live as it was, and the Stop control's visibility does not depend on the outcome
of a read this tab opened for its own benefit. A genuine revocation — discovered on a first attach,
or delivered mid-stream — keeps behaving exactly as it does today, including retiring the clock and
withdrawing a parked question the reader could no longer answer. Whatever the rail says after a
refused stop, it says one thing, and the same thing every time, whether or not a background read
happens to resolve while the reader is looking.

**Key interfaces:**
- The chat thread's stop action and the read it opens afterwards: rule whether that read's refusal
  is evidence about the reader's access at all, or only about this tab's ability to resume. Today it
  is folded into the same fact as a real revocation.
- The thread store's handling of a revocation: it currently clears the record of the turn's own
  status as well as the clock. Rule whether a statement about access may retire the estate's record
  that a turn is running, given that record is the only thing keeping the Stop control offered for a
  turn this tab did not post.
- The rail's "is a turn live?" predicate and the exclusive ladder of status lines above it: any fix
  must keep one press producing one announcement, and must not reintroduce "Reconnecting…" for a
  reader whose access really is gone.
- The existing unit cell pinning "a refused stop whose re-attach is REFUSED says so" carries the
  opposite contract and must be re-decided explicitly, not quietly edited.

**Acceptance criteria:**
- [ ] The browser cell "a REFUSED stop says the reply is still running" passes 15 consecutive
      isolated runs with zero failures on a loaded host, and the whole cancel walk passes 3
      consecutive runs; commands and counts recorded.
- [ ] A unit cell at the hook seam reproduces the ordering deterministically — a refused stop whose
      re-attach is refused — and asserts the rail's resulting state without depending on timing.
- [ ] A reader whose access is genuinely revoked mid-reply still sees the revocation copy, loses the
      parked question, and sees the clock retired; a cell proves it.
- [ ] A reply whose read is refused because it no longer exists is never described to the reader as
      a loss of access.
- [ ] The refusal a reader was given for their own press is never replaced by a different sentence
      about a background read, and the two never announce together.
- [ ] The Stop control's presence after a refused stop does not depend on whether a background read
      resolved, and no test asserts otherwise.
- [ ] No existing assertion is weakened or deleted to reach green; the re-decided unit cell's change
      is argued on the ticket.

**Out of scope:** the first-attach revocation path and its copy; the reconnect/backoff policy and
its abort behaviour; the Work-level Cancel journey; the browser suite's own load sensitivity and any
change to the cell's timeouts; adding a runtime stream lane to the walk's fixture (the fixture gap
makes the race easy to hit, but the behaviour under test is the product's, not the harness's).

---

## Net result

- Both rates measured under identical, alternating, order-balanced conditions: `origin/main`
  **8/22 = 36.4 %**, `integration/riders-w1` **16/22 = 72.7 %**.
- The integrated branch is worse in direction (one-sided p ≈ 0.018 unpaired, ≈ 0.033 paired), but
  the effect is not established with confidence at this sample size, and the gap halved once the run
  order was balanced.
- **The defect is pre-existing**: `origin/main` reproduces it at better than one run in three, by
  the identical mechanism, with the identical artifact. The gate report's classification (b) holds.
- **No wave-1 commit identified as responsible.** `80a94719`'s `stream.ts` hunk is excluded by two
  independent code arguments (no registered stream to abort at the press; no backoff sleep on a
  refused-at-open attach). Any residual branch effect is diffuse and **unverified**.
- **No product code changed. No test weakened, skipped or deleted.** `integration/riders-w1` head is
  unchanged at `cd7da1116ef176747cefbb56dec46b0c7d065d8a`, working tree clean apart from the
  gitignored `apps/web/e2e/.artifacts/`.
- The `mainref` worktree was removed with `git worktree remove --force ../mainref`.
- Recommendation: the cell will keep reddening the wave's browser gate on either branch. Either the
  ticket above is fixed before the wave ships, or its owner decides explicitly what the rail should
  say — not by giving line 382 a longer timeout, which would only make the wrong state arrive after
  the assertion instead of before it.
