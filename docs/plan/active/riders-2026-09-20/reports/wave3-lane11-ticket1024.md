# Wave 3 · lane 11 · ticket #1024 — a refused re-attach after a refused stop

**Clara rail: a refused re-attach that follows a refused stop is shown as lost access and removes
the Stop control.** Status: **done**.

| | |
|---|---|
| Worktree / branch | `C:\Users\zhant\Desktop\clara-wt\int` · `riders/w3-lane11` |
| Base | `ffe63a0dd084e99b84c1368119845be273c421ce` |
| HEAD at report | `3fbdb294c` |
| Database | none used — lane 11 is web-only, and this ticket needed none |
| Migration | **none**, as the prompt expected. No schema or function change, no prestate pins, no rig-meta cohort, no gate-chain entry. Nothing under `packages/db` was read or written. |
| Playwright triple | `https://127.0.0.1:3600` / `3601` / `3602` |

## Commits (`git log --oneline ffe63a0d..HEAD`)

```
3fbdb294c docs(web): #1024 the refused-stop `.finally` guard keeps a narrower reason, written down
8be379c48 docs: #1024 which read may speak about a reader's access
d55ff5fc6 test(web): #1024 the face — a refused re-attach keeps the refusal, the turn and the Stop control
4fc67650b fix(web): #1024 only a REFUSED ATTACH is diverted — a mid-stream revocation is still the real thing
43368467e fix(web): #1024 a refused stop's re-attach speaks for this tab, not for the reader's access
```

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched.

## The ticket was live on this branch

Verified before building, not assumed:

- `gh issue view 1024 --repo BELCORT-SDN-BHD/clara --json comments` → **0 comments**. The newest
  Agent Brief is the issue BODY, and it carries the owner-facing **Triage ruling (2026-09-20)**
  inside it. There is no later ruling comment to obey and none to be overruled by.
- The mechanism is present in the code at `ffe63a0d`: `stream.ts:568` turns a refused attach into a
  `revoked` event; `threadStore.ts:384`'s `applyStreamEvent` handles `revoked` by writing
  `turnStatus: null`; `ClaraThreadView.tsx:218`'s `turnLive` has only the DB arm for a turn this tab
  did not post; `ClaraThreadView.tsx:307`'s `revoked` suppresses the stop-refusal line.
- Both cells carrying the opposite contract were green on the branch before any edit:
  `lib/clara/use-clara-thread-stop.test.ts` 26/26 and `components/clara/thread-stop-reply.test.tsx`
  10/10.

## Seams I tested at (written before the first test, per work-order rule 4)

The brief names four key interfaces. Three are reachable; the fourth is the contract being
re-decided rather than a place to test.

1. **The chat thread's stop action and the read it opens afterwards** — the hook seam,
   `useClaraThread`'s `stopReply` driven through `renderHook` with `fetch` stubbed at the network
   boundary only. Observations: the `stop` machine the view renders, and
   `claraThreadStore.getThread(...)`. File: `apps/web/lib/clara/use-clara-thread-stop.test.ts`.
2. **The rail's "is a turn live?" predicate and the exclusive ladder of status lines** — the face
   seam, the REAL `ClaraThreadView` and the REAL hook through `renderComponent`, only `fetch`
   stubbed. Observations: rendered text, every `role="status"` node, and the presence of the
   "Stop reply" button. File: `apps/web/components/clara/thread-stop-reply.test.tsx`.
3. **The browser walk** — `apps/web/e2e/work-cancel-walk.spec.ts` B7, unchanged (changing its
   timeouts is named out of scope, and I changed nothing in the file).
4. **The thread store's handling of a revocation** — I RULED on it (below) and made no change
   there, so there is no new cell at that seam; the existing ones stand and were re-run.

No test was written at a seam the brief does not give me.

## The ruling, in full

The brief asks two questions. Both are answered in the commit messages and repeated here.

**Is a refused re-open that follows a refused stop evidence that the reader lost access? No.**
Three reasons, each checkable:

1. The stream route answers 403/404 for two different facts. `lib/authz.mjs`'s masked-view law
   produces `no_membership` and `not_found`, and a `not_found` ALSO covers a task the runtime no
   longer holds — a reply that ended, was reaped, or a stale id. Rendering that as "You no longer
   have access to this reply" turns an existence fact into an access fact, which is precisely what
   `stream.ts`'s own comment (`stream.ts:364-371`) forbids the copy from being.
2. The reader had just been told by a DOOR, about their own press, that the reply is still running.
   A background read this tab opened for itself may not overwrite a fact a door established with an
   inference that has a second explanation.
3. `applyStreamEvent`'s `revoked` arm writes `turnStatus: null`. For a turn this tab did not post
   that is the only true arm of `turnLive`, so a statement about access silently withdrew the Stop
   control from a reply the refusal it had just erased called live.

**May a statement about access retire the estate's record that a turn is running? Yes — for a
GENUINE revocation, and only then.** A reader whose access is gone cannot act on that turn: the
Stop door would refuse them for the same reason, and an elapsed-time line climbing under "you no
longer have access" is this tab asserting it is still watching something it cannot see. The brief
itself requires that path to keep behaving exactly as it does today, and it does: `threadStore.ts`
is **unchanged by this ticket**. What changed is which READ may speak about access at all.

## What changed, in five statements

`apps/web/lib/clara/useClaraThread.ts` only (50 lines, most of them the written rationale):

- a new exported type `AttachRefusalMeaning = "revocation" | "this-tab-cannot-resume"`;
- `attachClaraStream` gains a trailing `attachRefusalMeans` parameter defaulting to `"revocation"`,
  and tracks `opened` by wrapping `onOpen`;
- its `onEvent` returns early for a `revoked` event seen while `!opened` **and** the caller asked for
  `"this-tab-cannot-resume"` — the refusal is kept out of the shared stream state entirely rather
  than translated into some other status;
- `openStream` forwards the parameter, defaulting the same way;
- `stopReply`'s re-attach — and nothing else in the file — passes `"this-tab-cannot-resume"`.

The refusal is then recorded by the machinery that was already there: `stopReply`'s own `.finally`
sets `reattach: "lost"` and calls `markReattachFailed`, the same state a re-attach that failed at the
TRANSPORT (a 502) has always reached. That is deliberate: one press says one thing, and the same
thing whether the re-attach was refused or could not connect.

`sendMessage`'s first attach and `retryConnection` pass nothing and keep `"revocation"`, so the
first-attach revocation path — named out of scope — is unchanged in behaviour.

## Acceptance criteria, each with its evidence

**AC1 — B7 passes 15 consecutive isolated runs with zero failures, and the whole cancel walk passes
3 consecutive runs; commands and counts recorded. DONE.**

All of the following were run at HEAD `3fbdb294c`, from the worktree root, each Bash call prefixed
with `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`, with the lane triple
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3600 CLARA_E2E_NEXT_PORT=3601 CLARA_E2E_RUNTIME_PORT=3602`.

The build was made once at HEAD by the first whole-walk run below; the repeat runs used the
runner's own `--no-build` (`e2e/run-args.mjs`, #851 — "three consecutive runs of one walk cost one
build instead of five"). No source changed between the build and any run.

```
pnpm --filter @clara/web e2e -- work-cancel-walk                    # builds, then the whole walk
pnpm --filter @clara/web e2e -- --no-build work-cancel-walk \
  -g "a REFUSED stop says the reply is still running"               # one cell, x15
pnpm --filter @clara/web e2e -- --no-build work-cancel-walk         # the whole walk, x2 more
```

| measurement | result |
|---|---|
| B7 isolated, at HEAD | **15 runs, 15 passed, 0 failed** |
| whole `work-cancel-walk`, at HEAD | **3 runs, 10 passed each** (59.2 s, 1.0 m, 59.8 s) |

B7 cell durations across the 15: 4.2, 7.8, 6.0, 7.5, 5.3, 2.2, 2.8, 3.0, 2.6, 2.1, 2.0, 2.6, 2.1,
2.9, 3.3 s. **I do not offer those durations as evidence**, and the A/B report's claim that a pass
costs 1.0–2.8 s and a failure 6.2–10.5 s with "no intermediate" did not hold here: runs 2 and 4
passed at 7.8 s and 7.5 s, inside what that report called the failing band. Under host contention
the cell's earlier assertions (which carry 15 s and 20 s timeouts) simply take longer. Only the
pass/fail outcome is evidence, and it is unambiguous.

An earlier block of 15 isolated B7 runs and 3 whole-walk runs was taken against the build from
`d55ff5fc6`/`8be379c48` (same behaviour, one later comment-only commit) and was also 15/15 and
10-passed x3. Both blocks are reported; the HEAD block is the one that counts.

**AC2 — a unit cell at the hook seam reproduces the ordering deterministically and asserts the
rail's resulting state without depending on timing. DONE.**

`apps/web/lib/clara/use-clara-thread-stop.test.ts`, cell 26,
**"1024 a refused stop whose re-attach is REFUSED says only that THIS TAB could not resume"**. It
arms the exact ordering (a `cancel_agent_task` refusal, then a 404 on the task's stream route),
presses `stopReply`, and `settleUntil`s on the machine reaching `reattach === "lost"` — i.e. it
waits until the background read has DEFINITELY resolved before it asserts, which is the opposite of
depending on the race. It then asserts `stream.status !== "revoked"`, `revokedReason === null`, and
that the parked question survives. Result: **pass** (`node --import ./test/bootstrap.mjs --import tsx
--test lib/clara/use-clara-thread-stop.test.ts` → 27 tests, 27 pass, 0 fail).

This is the assertion that dominates the browser runs: where B7 could only ever catch the wrong
state when the fetch happened to win, this cell asserts the state AFTER the fetch has won, every
time.

**AC3 — a reader whose access is genuinely revoked mid-reply still sees the revocation copy, loses
the parked question, and sees the clock retired; a cell proves it. DONE.**

New cell 27, **"1024 …but a revocation delivered MID-STREAM on a re-attach that OPENED is the real
thing"**. It is deliberately placed on the stop path itself, because that is where my change could
have broken it: the re-attach OPENS (a real 200 SSE body) and the route then writes a `revoked`
frame. On a turn this tab did not post — `hydrateRun` is the only thing that knows it is live, the
reload-onto-a-running-reply shape the ticket is about — it asserts `stream.status === "revoked"`,
`revokedReason === "CLR11"`, `turnStartedAt === null`, `turnStatus === null`,
`parkedClarify === null`, and `activeTaskId` kept. Result: **pass**.

This cell was RED after the first slice and is what forced the `!opened` refinement (commit
`4fc67650b`): the first slice diverted every `revoked` on that read, including this one.

The revocation COPY at the face is proven by the untouched
`apps/web/components/clara/thread-revoked.test.tsx` — 4 tests, 4 pass, re-run — whose cells cover
one status line reading "You no longer have access to this reply", no existence oracle, no Retry,
and the clock retiring.

**AC4 — a reply whose read is refused because it no longer exists is never described to the reader
as a loss of access. DONE within this ticket's scope; see follow-up 1.**

`apps/web/components/clara/thread-stop-reply.test.tsx` cell 10,
**"1024 a refusal whose re-attach is REFUSED keeps the refusal, the turn and the Stop control"**,
drives the REAL component with a 404 `not_found` on the stop re-attach and asserts
`doesNotMatch(text, /You no longer have access to this reply/)`. Result: **pass** (10 tests, 10 pass).

Scope note, stated plainly: the ticket puts "the first-attach revocation path and its copy" out of
scope, and a 404 on a FIRST attach still becomes `revoked` there. The existence-oracle concern
therefore survives on that path and is filed as follow-up 1 rather than silently fixed.

**AC5 — the refusal a reader was given for their own press is never replaced by a different
sentence about a background read, and the two never announce together. DONE.**

Same cell 10: `match(text, /needs a bookkeeper role/)` and `match(text, /it is still running/)` (the
refusal stands), plus `assert.equal(everyStatus.length, 1)` over EVERY `role="status"` node in the
tree — not a filtered subset — with `match(everyStatus[0], /needs a bookkeeper role/)`. It also
asserts `doesNotMatch(text, /gone back to reading it/)` (the attach did not open) and
`doesNotMatch(text, /Reconnecting/)`.

One thing this does NOT claim, because it would be false: the tree is not silent apart from that
line. `markReattachFailed` sets `streamEndedUnexpectedly`, which renders the "connection ended
unexpectedly" `StateBanner` (a `role="alert"`, not a `role="status"`). That is pre-existing and
deliberate — it is the same banner the TRANSPORT arm has always raised, and #630's own note says the
`lost` state adds no words of its own precisely because "the stream-lost banner and its Retry below
are already exactly that sentence". After this fix the refused arm and the transport arm say the
same thing, which is what the brief asks for; no `retryAvailable` is set, so no Retry appears.

**AC6 — the Stop control's presence after a refused stop does not depend on whether a background
read resolved, and no test asserts otherwise. DONE.**

Same cell 10: `assert.equal(stopControls, 1)`, measured after the re-attach has settled. No test in
the repo asserts the opposite any more: I grepped every occurrence of the revocation copy across
`apps/` and `packages/` and the only remaining matches are `thread-revoked.test.tsx` (the genuine
path), the `doesNotMatch` in cell 10, `messages/en.json`, and three source comments.

**AC7 — no existing assertion is weakened or deleted to reach green; the re-decided cell's change is
argued on the ticket. DONE, with one correction to the ticket's own framing.**

The ticket says "the existing unit cell". There are **two** cells carrying that contract, not one,
and both are re-decided openly, in place, on their own fixtures, with the argument written above
each and repeated in its commit message:

- `lib/clara/use-clara-thread-stop.test.ts` — "642 a refused stop whose re-attach is REFUSED says
  so, and does not keep a question that cannot be answered" → cell 26 above. Its machine assertion
  (`reattach === "lost"`) is KEPT, not dropped; only the claims that followed from reading the
  refusal as a revocation are reversed.
- `components/clara/thread-stop-reply.test.tsx` — "642 a refusal whose re-attach is REFUSED tells
  the reader THAT, and says it once" → cell 10 above. Its "one announcement" assertion is kept and
  STRENGTHENED (the whole ladder, unfiltered, instead of a filtered subset).

Nothing else was weakened: the whole web unit suite is 4845/4847 pass, 0 fail, and the two skips are
the pre-existing live-Supabase-auth cells that skip for want of `CLARA_LIVE_SUPABASE_AUTH_URL`.

**Vacuity control** (work-order rule 4). With `stopReply`'s argument put back to `"revocation"` and
nothing else changed, cell 26 fails on `stream.status` and cell 10 fails waiting for the refusal
line (the revocation line replaces it) — while cell 27 stays GREEN, which is exactly the line the
fix draws. The subject was then restored with `git checkout --`, and `git status --porcelain`
confirmed the production file byte-identical before the commit.

## Gates, with counts (all at HEAD `3fbdb294c`)

| gate | command | result |
|---|---|---|
| hook seam (touched) | `node --import ./test/bootstrap.mjs --import tsx --test lib/clara/use-clara-thread-stop.test.ts` | **27 tests, 27 pass, 0 fail** |
| face seam (touched) | `… --test components/clara/thread-stop-reply.test.tsx` | **10 tests, 10 pass, 0 fail** |
| neighbours re-run | `thread-revoked.test.tsx` / `stream-revoked.test.ts` / `threadStore.test.ts` | **4/4, 8/8, 9/9** |
| whole web unit suite | `node scripts/run-tests.mjs` (from `apps/web`) | **4847 tests, 138 suites, 4845 pass, 0 fail, 2 skipped**, 113 s |
| typecheck | `pnpm typecheck` | exit 0 (apps/web + packages/runtime) |
| lint | `pnpm lint` | exit 0 |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |
| frozen closures | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| browser walk (touched by behaviour) | `pnpm --filter @clara/web e2e -- work-cancel-walk` | **3 runs x 10 passed**, plus **15 of 15 isolated B7 passes** |

Not run, and why: `operation-census.test.mjs` / `rig-isolation.test.mjs` (no `packages/db` file
touched, no SQL function added); `check-parts-parity.mjs` (no `packages/runtime` file touched); no
migration gate chain (no migration). The lane has no database and this ticket needed none.

Known Windows-only reds from RIG.md: none were hit. `thread-live-clarify.test.tsx` passed inside the
whole-suite run on both executions.

## Docs

- `apps/web/README.md` — the Clara-transcript section (#642) gains a paragraph, "A read this tab
  opened for ITSELF does not speak about the reader's access (#1024)", beside the live-region
  geometry it depends on. It states the default reading, the stop path's reading, and that a
  `revoked` arriving on an OPEN read is never diverted.
- `CONTEXT.md` — new term in the house `term / _Avoid_` shape, **"Refused resume ≠ lost access"**,
  placed beside "Stop reply ≠ Cancel Work" and "Lost sight of a reply", the two neighbouring facts a
  reader needs to place it. This is a shared file (work-order rule 7): the hunk is 13 lines,
  fenced with `<!-- #1024 -->` markers exactly as #977's entry is.
- The rationale comments on the changed code, and a narrowing of the one pre-existing comment whose
  reason this ticket made wider than the path that now reaches it (commit `3fbdb294c`).
- `apps/web/messages/en.json` and `apps/web/test/manifest.txt` were NOT touched: no new copy and no
  new test file. Both are shared files, and this lane adds no hunk to either.

## Successor contract

**None is owed.** Nothing a frozen chat body or a frozen Work tool consumes changed: no door
signature, no zod input, no argument order, no refusal mapping, no part kind, no prompt stanza. The
change is entirely inside `apps/web`'s browser surface — one type and four call-site lines in
`lib/clara/useClaraThread.ts` — and `node scripts/check-frozen-workflows.mjs` reports no manifest
diff. `chatTurn_v22` / `claraWork_v6` need nothing from this ticket.

The one new public name, for a reviewer's convenience:

```ts
// apps/web/lib/clara/useClaraThread.ts
export type AttachRefusalMeaning = "revocation" | "this-tab-cannot-resume";
```

`"revocation"` is the default everywhere; only `stopReply`'s re-attach passes the other.

## Follow-ups worth filing

1. **The first-attach path is still an existence oracle.** `stream.ts:357` turns any 403/404 into
   `StreamAccessRevokedError`, and `readRefusalCode` words a 404 as `not_found` — which also means
   "the runtime no longer holds this task". On a first attach that still renders as "You no longer
   have access to this reply". This ticket names that path out of scope, so it is untouched; the
   honest fix is probably for the route to distinguish "masked from you" from "gone", which is a
   runtime change, not a web one.
2. **The `.finally` guard in `stopReply` is nearly vestigial.** `if (stream.status !== "revoked")`
   was added by #642 for the case this ticket removes. It still has one live caller — an EARLIER
   genuine revocation on the same thread — so I kept it and narrowed its comment rather than
   deleting it during implementation (refactoring belongs to the review stage). A reviewer may
   reasonably decide it is dead weight.
3. **Other component-test helpers may share `refusedStopText`'s defect.** That helper handed callers
   a `container` it had already unmounted, so any assertion walking it read an empty tree and could
   only pass by asserting absence. I fixed it here and checked its two existing callers; I did NOT
   audit the rest of `apps/web` for the same shape. Worth a sweep.
4. **The walk's fixture still serves no runtime stream lane for the armed task.** Named out of scope,
   and after this fix B7 no longer depends on the race — but the fixture gap is why the race was
   easy to hit, and a walk that could serve that lane would exercise the `reattach: "reading"` arm
   in the browser for the first time.

## Anything unverified

- **Host load.** AC1 says "on a loaded host". I could not reproduce the ten-lane load of the
  2026-09-20 A/B: a snapshot during the run block showed 12 `node.exe` processes. The runs are
  therefore evidence that the cell passes 15/15 under the load that existed, not proof about a
  worse-loaded host. What removes the load dependence is not the run count but cell 26, which
  asserts the rail's state AFTER the background read has provably resolved.
- **Why wave 1 doubled the failure rate.** The A/B report left that unverified and I did not pursue
  it; the fix removes the race rather than the sensitivity to it, so the question is now moot for
  this cell but is still unanswered as stated.
- **The A/B's duration bands.** Its "a passing B7 costs 1.0–2.8 s, a failing one 6.2–10.5 s, there
  is no intermediate" did not reproduce: two passes here took 7.5 s and 7.8 s. I report pass/fail
  only and do not rely on timing.
- **Context7.** No library API was used that I was not certain about — the change is repo-internal
  (`node:test`, React, and this repo's own store/stream modules), so no documentation lookup was
  needed. Recorded because the harness asks for it, not as a claim that docs were consulted.
- I did not drive the `403 no_membership` shape on the stop path separately from `404 not_found`;
  both reach the same `StreamAccessRevokedError` arm and the cells use the 404, which is the one the
  walk and the measured failures produce.
