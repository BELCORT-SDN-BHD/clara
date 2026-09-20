# Wave 1 — Lane 08 — final report

Branch `riders/w1-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, cut from
`origin/main` at `dd3f8f1d`. Four commits, all local (never pushed, per the work order):

```
79037366 test(e2e): #879 first Playwright coverage for the staffAdvances tab
cf76a22a feat(web): #874 a test-only seam on the invite mail endpoint alone
02c6938b fix(web): #956 an abort cancels a pending reconnect, not just the read
61f56acf fix(web): #1005 SelectValue requires a label source, by construction
```

Tickets worked in the assigned order: #1005, #956, #875, #874, #879, #897.

---

## #1005 — Select triggers show the raw value — **done**

**Fix.** `components/ui/select.tsx`'s `SelectValue` now takes a discriminated prop union:
`items` (an array of `{ value, label }` or a `Record<string, ReactNode>`) XOR a function
`children`, never neither. A new call site missing both fails `pnpm typecheck`. The `items`
path still renders through a function child internally (so an unmatched value falls back to
`placeholder`, never the raw value); the function-child path is untouched
(`client-period-selector.tsx` already used it, deliberately — its own header explains why).
All ten other call sites (matching-section.tsx, activity-filters.tsx, knowledge-panel.tsx,
knowledge-firm-panel.tsx, work-list-filters.tsx, work-question-form.tsx,
unassigned-sources.tsx, correction-wizard.tsx, document-kind-control.tsx,
document-kind-dialog.tsx) now pass `items`.

**Per acceptance criterion:**
- [x] Matching tab account/period triggers show labels, never a row id or `__all` —
  `components/bank/matching-section.test.tsx`, new cell `[1005]`, asserts the composed label
  `Maybank 1044 · 170-C38` and `All live periods`, and `doesNotMatch(/\bacc1\b/)` /
  `doesNotMatch(/__all\b/)`.
- [x] Activity client filter and both knowledge filters show labels on first render —
  `components/firm/activity/activity-filters.test.tsx` (new file), `knowledge-panel-freshness
  .test.tsx` and `knowledge-firm-panel.test.tsx` (new cells).
- [x] A unit test per affected component asserts the trigger's text on first render, with at
  least one sentinel and one composed label — `components/ui/select.test.tsx` (new,
  wrapper-level: sentinel, composed label, unmatched-value fallback, function-child path) plus
  the per-surface cells above; `components/work/accounting-work-list.test.tsx` gained two more
  (client/purpose/initiator triggers, and the all-three-unset case) because
  `WorkListFilterBar` is already mounted there with real fixture data.
- [x] Census: `apps/web/tests/select-value-label-census.test.ts` (new) walks every `.ts`/`.tsx`
  under `app/`/`components/` for a `<SelectValue>` with neither `items` nor a function child
  (AST-based, independent of `tsc`), and for any file importing `@base-ui/react/select`
  directly instead of through the wrapper.
- [x] Message keys carry every label — every `items` array above sources its labels from
  `t(...)` or a field already on the row; no new hard-coded string.

**Not covered by a dedicated per-selected-value test**: correction-wizard.tsx,
document-kind-control.tsx, document-kind-dialog.tsx, unassigned-sources.tsx,
work-question-form.tsx. Reason, stated rather than silently skipped: this repo's lightweight
DOM test harness (`test/hookHarness.ts`) has no seam for opening a Base UI Select's portalled
popup and clicking an option, so there was no way to drive these five to a *selected* state in
a unit cell the way the four named-in-the-ticket surfaces already had real fixture-driven
selections to reuse. They are still covered by: the TypeScript enforcement (a missing `items`
fails `pnpm typecheck`), the AST census (catches an `as any` bypass), and
`select.test.tsx`'s direct proof of the underlying mechanism.

**Vacuity control.** Every new/changed assertion (12 across 6 files, plus the census) was
confirmed RED against the pre-fix `select.tsx` — and, for the census, against one reverted
call site — in one consolidated `git stash`/`pop` (46 tests: 34 pre-existing pass unaffected,
12 new ones fail for exactly the "raw value/sentinel leaked" reason), then restored
byte-for-byte (`git diff --stat` matched before and after).

**Gates.** `pnpm typecheck` and `pnpm lint` clean (apps/web). Whole `apps/web` unit suite once:
4647 tests, 4644 pass, 1 fail (the known #956 flake, fixed by the next commit), 2 skipped.

**Docs.** `apps/web/README.md` gained a `#1005` section: the wrapper contract, which path to
reach for, and the census.

---

## #956 — the whole-suite `use-clara-thread-stop.test.ts` flake — **done, diagnosed and fixed**

**Root cause, confirmed by reading, not guessed.** `lib/clara/stream.ts`'s `runClaraTaskStream`
only rechecks `signal.aborted` at the top of its reattach loop, *before* opening the next
attach. A bare `await sleep(delayMs)` waits out the whole real backoff (1s → 2s → … → 30s cap)
first, so `claraThreadStore.abortStream(taskId)` called while the loop is asleep between
attaches only *postpones* that check — it does not stop the sleep. The "REFUSED ordinary stop
re-attaches" cell retires its own reattach with exactly this call in a `finally`, believing
abort means the read is over; the pending ~1s real timer can still fire a stray `/stream` fetch
into whatever `withRunFetch` mock a LATER cell has installed by the time it wakes. A second,
independent leak: `withRunFetch`'s stub always returns an empty 200 (an ungraceful close), so
*every* cell that hydrates a running task opens a reattach loop with a live pending timer —
whether or not that cell itself ever calls `abortStream`. Most didn't.

**Fix, two parts, both needed** (measured — see below):
1. `stream.ts`'s new `abortableSleep` races the backoff sleep against the signal's own `abort`
   event and resolves the instant either settles (`AbortController.abort()` dispatches `abort`
   synchronously). `runClaraTaskStream` now awaits this instead of the bare sleep.
2. `threadStore.ts`'s new `claraThreadStore.abortAllStreams()` aborts every task this store
   still holds a handle for. `use-clara-thread-stop.test.ts` gained one file-level
   `test.afterEach` calling it, so a cell that forgets to retire its own task no longer leaks
   into the next one.

**Verification.**
- `use-clara-thread-stop.test.ts` alone, 25 consecutive isolated runs:
  `node --import ./test/bootstrap.mjs --import tsx --test lib/clara/use-clara-thread-stop.test.ts`
  × 25 → **25/25 pass** (with only part 1 of the fix, this was 24/25 — one measured failure,
  same cell, same shape the ticket describes).
- Whole `apps/web` unit suite, 5 consecutive runs: **0 failures attributable to this file** in
  any of the 5 (run 5 hit one *unrelated*, pre-existing flake in
  `documents-workbench-refresh.test.tsx`'s poll-budget cell — recorded below under #875 as
  evidence, not fixed here; scope discipline).
- The two claims the file owns still hold across all 25 isolated runs: "630 stopReply cancels
  the CHAT-TURN task, and calls no second door" and "630 CLOSING THE RAIL does neither".
- Regression: `apps/web/tests/streamReattach.test.mjs` gained two cells driving the abort path
  directly against `runClaraTaskStream` — one aborts mid-backoff against a `sleepImpl` that
  never resolves on its own (so the *only* way the loop can end is the abort;
  `{ timeout: 2000 }` turns a regression into a clear failure instead of a silent hang), one
  proves the already-aborted fast path never even starts the sleep.
- Vacuity control: both new regression cells confirmed to fail (timeout, "Promise resolution
  is still pending") against the pre-fix `stream.ts`, via `git stash`/`pop`, then restored
  byte-for-byte.

**Gates.** `pnpm typecheck` and `pnpm lint` clean. `threadStore.test.ts`, `stream-revoked
.test.ts`, `streamAuthority.test.mjs`, `streamParser.test.mjs` all still pass (31/31) —
no regression from the new `abortAllStreams` export.

**Docs.** `apps/web/README.md` gained a `#956` section recording the two-part fix and the
measured before/after run counts.

---

## #875 — poll-bound test-budget cell audit — **done: audited, no additional gap found**

Every poller the brief names was read at its source, not assumed clean:

| poller | delay const. | test file | mechanism | vacuous? |
|---|---|---|---|---|
| `useClaraThread` run poll | `CLARA_RUN_POLL_MS=4000` | `use-clara-thread-stop.test.ts` | captures `setInterval`, fires the tick **manually** | no — never time-based |
| `useUploadQueue` | `DEFAULT_POLL_INTERVAL_MS=1000` | `useUploadQueue.test.ts` | injectable `pollIntervalMs`; the "exhausted poll" cell (C-73, line ~760) passes `pollIntervalMs: 0` explicitly; the happy-path cell needs no wait at all (adopts on read 1) | no |
| `useInterviewRun` | `POLL_MS=3000` | `useInterviewRun.test.ts` | captures `setInterval`, fires manually (3 cells) | no |
| `useClientWorkPack` | `CLIENT_WORK_PACK_REFRESH_MS=30_000` | `use-client-work-pack.test.ts` | captures `setInterval` (`withTimers`/`ctx.tick()`), fires manually; the stale-after check uses a fake clock | no |
| `useWorkDetail` | `WORK_POLL_MS=3000` | `work-detail.test.tsx` | genuinely waits real `3_100`/`6_500` ms past the interval (measured, not vacuous — just slow) | no |
| `checkout-waiting.tsx` (`CheckoutWaitingRefresh`) | `CHECKOUT_REFRESH_INTERVAL_MS=5000` / `BUDGET_MS=120000` | `checkout-faces-a11y.test.tsx` | injects `intervalMs:20, budgetMs:400`, waits a real `600ms` (> budget) — its own header records a #643 bisection that already tightened this once | no |
| `work-question-affordance.tsx` | — | — | no interval/setTimeout-driven poll in this file at all (only a `requestAnimationFrame`/`setTimeout(…, 0)` "next frame" wait) | n/a — not a poller |
| `WorkCards.tsx` (rail card) | `WORK_CARD_POLL_MS=3000` | `components/parts/work-cards.test.tsx` | captures `setInterval`, fires manually (2 cells) | no |

**Conclusion, with evidence, not assumed:** none of the eight named surfaces exhibits the
`documents-workbench-refresh.test.tsx` shape (a real-time assertion window that never advances
past the poller's own first-tick delay). Six already avoid the whole class structurally
(capture-and-manually-fire); two pay real wall-clock time deliberately and correctly. No new
non-vacuity guard was needed, and no poller was found with *no* budget cell at all (the
brief's other flagged gap category). No code change; the audit itself, with its evidence, is
the deliverable this ticket asked for.

**A genuinely new, adjacent finding, NOT fixed here (scope discipline):** the whole-suite run
for #956's verification (run 5 of 5) hit `documents-workbench-refresh.test.tsx`'s
`"[633]: an UNSETTLED receipt keeps a bounded watch and says so; the poll's budget is finite"`
cell — the *same* file the ticket's own triage comment says was "already fixed" for the
original #633 vacuity defect (`FAST_POLL = { baseDelayMs: 0, maxDelayMs: 0 }`,
`grew > 0` guard). This is a **different** failure mode from either #875's vacuous-bound shape
or #633's original one: `baseDelayMs: 0` already advances past the first tick in principle, but
40 macrotask `h.settle()` hops are not *always* enough for the poll's own tick to actually land
under host contention (1 failure in this session's 5-run sample). Recommended follow-up:
audit `documents-workbench-refresh.test.tsx`'s own settle budget for this cell specifically —
out of #875's stated scope (auditing *other* pollers), and the instance itself is not the one
#875 was asked to fix.

---

## #874 — a mail-transport base-URL seam for invite walks — **partial, recorded**

**Done, per the owner's 2026-09-18 ruling** ("only the mail endpoint becomes overridable... the
Supabase admin calls stay real"): `lib/members/invite-mail.ts`'s `InviteMailConfig` gained an
optional `mailEndpoint`, resolved by `inviteMailCapability` from a new, **optional**
`INVITE_MAIL_ENDPOINT_OVERRIDE` env var — read alongside the four required ones but never
added to `missing` (its absence is production, not a misconfiguration).
`productionInviteMailer`'s `send()` posts to `config.mailEndpoint ?? RESEND_ENDPOINT`.

- [x] **AC1** — unset, production unchanged, pinned by a unit test:
  `tests/invite-mail-transport.test.ts`'s new `#874` suite: `capability.config.mailEndpoint`
  resolves `undefined` with the override absent (or blank/whitespace), and `send()` still posts
  to `RESEND_ENDPOINT`.
- [~] **AC2** — "a walk substitutes it and asserts on the posted mail body with no outbound
  call": proven at the **unit** level only (`send()` posts to the override with the exact body
  — recipient, subject, invite link — a walk would need), not as a Playwright walk.

**Why the walk is not built, recorded rather than silently dropped.**
`e2e/members-lifecycle-mock.mjs`'s own header already states that this harness sets no
`RESEND_API_KEY`, so the invite leg today terminates at `mail_not_configured` *before* any
Supabase admin call is attempted. Reaching `send()` from a real browser walk needs
`canMintFor`/`mintSupabaseTokenHash` to succeed first, which needs `GoTrueAdminApi`'s
`listUsers`/`generateLink` REST endpoints mocked under `/e2e-supabase` — a **second, larger**
seam this ticket's own "why human" note explicitly left as a separate owner call ("Whether to
also make the Supabase admin calls injectable... is the owner's call"), and the ruling that
followed kept them real. Building that second seam here would be this lane re-litigating a
scope decision the owner already made, not building what was assigned. Filed as a follow-up
in the README section below rather than attempted.

**Vacuity control.** Reverting `invite-mail.ts` makes the new test suite fail to import at all
(`SyntaxError: ... does not provide an export named 'INVITE_MAIL_ENDPOINT_ENV_NAME'`),
confirmed via `git stash`/`pop`, then restored byte-for-byte.

**Gates.** `pnpm typecheck`/`pnpm lint` clean. All invite-related unit suites
(`invite-mail-transport`, `invite-courier`, `invite-courier-authority`,
`invite-courier-egress`): 140/140.

**Docs.** `apps/web/README.md` gained a paragraph in the Membership section recording the seam,
the ruling and exactly why the walk is not yet wired.

---

## #879 — no Playwright coverage for `?tab=staffAdvances` — **done**

New file-disjoint mock lane `e2e/staff-advances-register-mock.mjs` (the
`staff-expense-claim-mock.mjs` shape: one enrolled account with one outstanding advance, one
not-yet-enrolled candidate account, every handler scoped to its own client id) and
`e2e/staff-advances-register-walk.spec.ts`, three cells:

- [x] A named cell reaches the tab and asserts the register renders (ledger, enrolment,
  statement panel, zero axe violations).
- [x] One cell drives enrol → retire (the freshly-enrolled account has zero advances, so it
  never hits CLR10 `advance_outstanding_on_retire`) → book a RM 300.00 application → complete
  particulars, end to end — all four doors named in the brief's "Key interfaces", each with its
  own mock verb and its own UI assertion (new row appears/updates, summary's `RM 700.00
  outstanding` and zero `missing particulars` note re-read correctly).
- [x] A third cell asserts the per-account statement panel reflects the booked advance's
  reduced balance (`Payroll deduction`, `-RM 300.00`, closing `RM 700.00`) — reading state the
  *previous* cell mutated, the same "one persistent mock server" property
  `playwright.config.ts`'s `fullyParallel: false` / `workers: 1` makes safe for every stateful
  lane in this suite.
- [x] `e2e-fixture-ownership.test.ts` passes with the new lane and its verbs declared: 20/20,
  including the client-id collision census and the verb-ownership census (my client id and my
  four exclusive RPC verbs — `staff_advance_summary`/`tie`/`statement` plus the four write
  doors — are both clean).

**Evidence the walk is not vacuous, from the build cycle itself** (not a separate staged
control): before the account-select/money-input locator mismatches in the book-application
step were fixed, cell 3 genuinely failed — asserting the pre-booking `RM 1,000.00` balance with
no `Payroll deduction` row, because the booking had never actually landed. Once the locators
were fixed and the booking succeeded, cell 3 passed on the *same* assertions.

**Regression check.** `staff-expense-claim-walk.spec.ts` (the dispatch-order neighbour my new
hook sits beside in `serve-built.mjs`) still passes all 13 cells after the insertion; the new
spec itself was run twice for stability. 16/16 both times.

**Gates.** `pnpm typecheck`/`pnpm lint` clean.

**Docs.** `apps/web/README.md` gained a `#879` section.

---

## #897 — UI-21's full-screen onboarding altitude leg — **stopped, recorded why**

**What was investigated, with file:line evidence, before stopping.** The Agent Brief's own
acceptance criterion is "typed but unsubmitted answers survive the [full-screen] change."
Tracing the actual mechanism:

- `components/clara/InterviewRunCard.tsx:63` — the typed-but-unsubmitted answer is
  `const [draft, setDraft] = useState("")`: plain, un-persisted local component state.
- `components/clara/ClaraFullScreenThread.tsx` and `components/clara/ClaraRail.tsx:52-53` —
  the escalation to full screen is a **real navigation** (`<Link href={escalateHref}>` to
  `/clara/:threadId` or `/clients/:id/clara/:threadId`), not an in-place CSS/state toggle.
- `app/(full)/layout.tsx`'s own header — "route groups are siblings, not parents of one
  another" — `(firm)` (which mounts `RailMount`/`ClaraRail`) and `(full)` (the escalated
  route) are genuinely separate layout trees. Navigating between them tears down and rebuilds
  the whole subtree; nothing under `(firm)/layout.tsx` survives into `(full)` or back.
- `components/clara/rail-mount.tsx:39-43` independently confirms the *general* rule for this
  subtree ("WHAT SURVIVES A SWITCH: nothing client-owned... the interview card, an answer
  half-typed into a clarify... so a new feature cannot leak by forgetting its own reset") — for
  a *client* switch specifically, but the same React-tree-identity argument applies to the
  rail ↔ full-screen boundary, which is an even harder teardown (a different route group, not
  just a different `key`).
- No interview-answer draft persistence exists anywhere else in the tree (grepped for
  `draft`/`sessionStorage`/`localStorage` near `InterviewRunCard`/`useInterviewRun`; the only
  "draft" concept in `lib/clara/threadStore.ts` is the chat **composer's** free-text message,
  a different feature, never wired to the interview answer).

**Why this stops the ticket rather than being built as specified.** Given the above, the
literal acceptance criterion — the typed interview answer surviving a rail↔full-screen
round trip — is very likely **false today**, not merely untested. A mock-lane walk built to
assert it would either (a) go red on a real product gap this ticket's own scope
("Key interfaces: the mock lane... `interview-walk.spec.ts`: header note only" — test files
only, no production code named) never authorized me to fix, or (b) have to be written to
assert something weaker than what the brief and DECISIONS §3.1 actually ask for, which is the
kind of silent narrowing rule 5 forbids. Fixing the underlying persistence (threading the
interview draft through `claraThreadStore` the way the composer's own draft already is, or an
equivalent) is a real, reviewable production change — not "add a runnable proof for an
existing behaviour," which is what every other ticket in this lane was.

**What I did not do:** build the mock-lane fixture (OPEN, unanswered park) or the walk itself,
since the walk's central assertion cannot be honestly written without first resolving the
question above. No production code under `components/clara/` was touched.

**Successor contract (for whoever resolves this):** if the owner confirms the draft should
survive, the fix is narrow and localized — give `InterviewRunCard`'s `draft` the same
altitude-keyed persistence `claraThreadStore.drafts` already gives the composer's message (see
that store's own header for the "keyed by altitude" shape), read it in `InterviewRunCard` in
place of local `useState`, and the walk this ticket asks for then has something true to assert.
If the owner instead rules the criterion never meant a *cross-navigation* survival (e.g., only
within-the-same-mount focus/keyboard behaviour), the walk becomes buildable as originally
scoped once that's said — the mock-lane fixture design (an OPEN park, independent of
`agentic-finish-mock.mjs`'s existing `state: "answered"` fixture) is otherwise straightforward
and was not the blocker.

---

## Gates, with counts (final, cumulative)

- `pnpm typecheck` (apps/web): clean, run after every ticket and once more at the end.
- `pnpm lint` (apps/web): clean, run after every ticket and once more at the end.
- Whole `apps/web` unit suite (`node scripts/run-tests.mjs`), final run: **4654 tests, 4652
  pass, 0 fail, 2 skipped** (pre-existing, unrelated to this lane).
- `e2e/e2e-fixture-ownership.test.ts`: 20/20.
- `staff-advances-register-walk.spec.ts` + `staff-expense-claim-walk.spec.ts` (regression
  check on the shared dispatch chain): 16/16, run twice.
- Known Windows-only reds (RIG.md) were not encountered as such in this lane's own runs; the
  one whole-suite flake this session's own #956 verification run hit
  (`documents-workbench-refresh.test.tsx`) is reported under #875, not claimed fixed.

## Docs updated
- `apps/web/README.md`: four new sections (`#1005`, `#956`, `#874` paragraph in Membership,
  `#879`).

## Successor contracts
- #897, above.

## Follow-ups worth filing
- `documents-workbench-refresh.test.tsx`'s `"[633]: an UNSETTLED receipt..."` cell: a
  settle-budget insufficiency under host contention, distinct from the original #633 vacuity
  defect and from #875's own scope. One paragraph: audit whether 40 `h.settle()` passes is
  still enough headroom for this cell's `baseDelayMs: 0` poll under a loaded whole-suite run,
  the same class of fix #643 already applied once to a sibling cell in the same file.
- #874's second seam (mocking `GoTrueAdminApi`'s admin REST endpoints under `/e2e-supabase`),
  if the owner wants the full invite-to-pending-row walk this ticket's brief named as
  out-of-scope.
- #897's successor contract, above.

## Anything unverified
- #874's AC2 is verified at the unit level only, not as a browser walk (recorded, not silently
  claimed done).
- #897 was not built; the "likely false today" conclusion rests on static tracing of the route
  groups and component state (file:line evidence above), not on an actual Playwright
  reproduction — I did not spend the ~e2e cycle to empirically confirm the draft is lost,
  since building that harness is most of the cost of building the ticket itself. If the owner
  wants that empirical confirmation before deciding the successor contract, it is a small,
  cheap probe (mount the rail, type into an open interview park, click escalate, check the
  full-screen mount's draft field) — cheaper than the full walk this ticket asks for.
