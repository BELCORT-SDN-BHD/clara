# Browser tests

Run the default browser suite from the repository root:

```sh
pnpm --filter @clara/web e2e
```

[`run.mjs`](run.mjs) builds `@clara/web`, starts the production Next.js server behind a local HTTPS proxy, and runs every `*.spec.ts` in this directory with Chromium. [`playwright.config.ts`](../playwright.config.ts) fixes the suite at one worker, no retries, no reused server, and retained traces on failure. OpenSSL must be available so the harness can create its temporary local certificate.

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

Use `test.setTimeout(cellBudgetMs({ polls, scans, signIns }))` at the top of a cell whose work is visible from the cell, and `grantCellBudget(CELL_BUDGET.x)` inside a shared helper (`signIn()`, `scan()`) whose cost depends on how many times the cell calls it — that form ADDS to whatever the cell already set, so a cell that signs in three times gets three times the headroom.

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

## Coverage map

The checked-in suite currently contains 25 specs:

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
| `agentic-finish-walk.spec.ts` | Capability-shaped commands, task reattachment, onboarding receipt states, and chart apply |
| `journals-table-walk.spec.ts` | Journal tables, filters, disclosure, approval, clarifications, and accessibility. #634 review round: an expanded POSTED row discloses its purpose, its Work link, its operation receipt with a working copy control, and its source — "No document" for a Work-recorded entry and the named lane for a document-coded one |
| `documents-viewer-walk.spec.ts` | Safe document viewing, evidence overlays, extraction hierarchy, CSP reporting, and accessibility. #620 adds source custody at the face: the original downloaded with `disposition=attachment` and its object URL released, a viewable original still opening its own tab while an un-previewable one is never offered it, the six refusals (denied, not-found, storage-unavailable, custody-pending, expired session, integrity) rendering DISTINCTLY, Retry reaching the wire a second time and clearing the failure, `?document=` surviving a reload with the browser's own Back closing the detail and an unshowable id clearing the parameter, and a keyboard-only pass — open with Enter, focus landing in what was opened, back out, download — whose F9 cell samples focus ACROSS the read (vacuity control first: the busy window must appear in the samples before their focus values mean anything; on `disabled={busy !== null}` it measured `BODY×12`), at 320 CSS px, 200% zoom, under reduced motion, with axe run on a document open beside a standing refusal |
| `bank-close-registers-walk.spec.ts` | Refusal-preserving dialogs, close restart, and human-readable close holds |
| `money-input.spec.ts` | Exact-cent input and ambiguous-input refusal |
| `interview-walk.spec.ts` | Real-stack onboarding interview and Tax route reachability when its fixture is supplied |
| `reports-download-walk.spec.ts` | Real-stack sealed artifact download when its fixture is supplied |
| `journal-work-walk.spec.ts` | #623's durable-Work journey: the Accounting hub's primary act, the composer's validation and first-invalid focus, a restored draft and its unknown account, submit → the Work detail running to a posted entry, a typed refusal and the Retry that starts a NEW run of the SAME Work, a LOST acknowledgement resolving to that same Work through its intent key, the `work_accepted`/`work_status`/`work_result` cards in a transcript, the malformed-id not-found boundary, 320 CSS px and 200% zoom, reduced motion, heading focus that a background poll never takes back, and a console/pageerror collector proving the Work detail route hydrates clean in both its completed and its parked face |
| `manual-journal-walk.spec.ts` | #634's optional and LATE evidence on the expert journal path: the composer's optional document chooser (an explicit "No document" default) and the draft that carries the choice across a reload under one intent key, the `source_already_posted` Alert with its link to the entry that already stands on the document and no resubmit of that intent, a refusal naming `sourceRefs[N]` landing on the evidence control with the draft intact, the B3 late-attachment Dialog (initial focus, the two conflicts, the happy path, focus return) and its CLR06 stale race with the choice preserved, plus 320 CSS px, 200% zoom, reduced motion and keyboard operation. Review round: Escape closing the Dialog and RETURNING focus to its trigger with the choice intact and nothing attached, and an UNVERIFIED filed document offered by neither chooser (the estate's custody floor, `bytes_verified_at is not null`). #728 finding 5: BOTH pickers (composer, late-attach Dialog) offer a document that already backs a posted entry as a DISABLED option that a real `selectOption` cannot choose, never hidden, with the reason on the option's own label and ONE summary line beside the select; the door's own `source_already_posted` refusal is reached the way a person reaches it — with the advisory `list_spoken_for_documents` read UNAVAILABLE (the `break_spoken_for` fixture arm), which re-enables every option and is a real production state. #728 finding 3: a successful late attachment moves focus to the "What was recorded" heading, never `<body>`, once the Dialog and its trigger are both gone |
| `work-question-walk.spec.ts` | #629's shared Work question on B3: the parked question with its reason and version, a bounded KEYBOARD walk through a two-field stepper to a review step and one submit, first-invalid focus on an amount the browser can refuse (three decimal places), a draft that survives a real navigation, answered-elsewhere and stale-version convergence that re-reads the authoritative record and KEEPS the draft, a denied read-only surface, 320 CSS px with no page-wide horizontal scroll, 200% zoom, and reduced motion; and on B4/B6: the Needs-you `work_question` row answered inline with focus landing on the section heading rather than the body once the row leaves, that row's form at 320 CSS px under reduced motion, a stable inbox URL that Back returns to, a Clara transcript's `work_question` card rendering the accepted record with NO live region of its own, the durable `work_accepted` card finding a GENUINELY PARKED Work's question after a reload and answering it in place (#629's follow-up gap), and the supporting source the run named |
| `work-cancel-walk.spec.ts` | #630's cancellation journey on B3: the Cancel Work dialog that asks before it acts (Title, what STAYS said first, initial focus on the SAFE action, Escape dismissing without ever reaching the door and returning focus to its trigger), the STOPPING arm shown while an admitted operation settles and the 3-second poll converging it onto `cancelled` with the run's superseded outcome, a cancel that LOST the race rendering the receipt and linking the entry instead of claiming a cancellation, a denied cancel as a persistent banner that survives a poll, Take responsibility on a `refused`/`authority_lost` Work with the interpreted-basis confirm step, a stable Work URL across cancel and Back, 320 CSS px and 200% zoom with the dialog fitting and no page-wide horizontal scroll, and reduced motion measured on MOVEMENT alone; plus the B7 rail's own two cells — "Stop reply" rendering for a turn this tab did NOT post (the DB's own live row, i.e. the reload case), the two labels distinct with no bare "Stop" on either, one `cancel_agent_task` and no Work-level cancel behind the press, the Work card still running afterwards, closing the rail pressing neither door, and a REFUSED stop saying the reply is still running rather than printing "Stopped" over a live run — and saying ONLY that, never that this tab has gone back to reading the turn, on a screen whose runtime lane serves no stream for the armed task (the re-attach clause is gated on `openTaskStream` actually resolving) — (the refusal's four causes — the bookkeeper floor, a turn that had already finished, any other governed refusal, and a transport failure — are told apart at the hook and rendered as one `role="status"` line, pinned in `components/clara/thread-stop-reply.test.tsx`); and a third B7 cell for the answer the door has to DISCRIMINATE — a press that terminally cancelled a still-QUEUED turn says "Stopped" with its clock retired, while a turn that had already ended before the press still reads "Nothing was stopped", the two being the same `status:'cancelled'` on the wire and told apart only by the door's `changed`/`transition` (`packages/db/tests/work-cancel.test.mjs` wc.35 pins the database side) |
| `shell-migration-walk.spec.ts` | #614's unified shell: the legacy `/admin`/`/needs-you` redirect matrix, identity at every width, the keyboard scope switcher and its cross-client isolation guarantee, the mobile sheet's keyboard contract, the Accounting sidebar group, reduced motion, the client-not-found boundary (a bogus id, and — via a same-process visibility toggle — a client that goes invisible mid-session), one overlay stack (the Clara rail plus the mobile nav Sheet open together at 640px), Work's destination split, settings rank-shaping, and the train's retired entries |
| `personal-settings-walk.spec.ts` | #626's `/settings/account`: loaded/dirty/saved/reload-persists, per-field Reset, save failure (CLR10) preserving dirty state with first-invalid-focus, concurrent change (CLR06) and Reload-and-keep-my-edits, denied/signed-out, the honest Notifications "not configured" note, the saved motion preference's `data-motion` attribute independent of the OS setting, keyboard-only save, 320px and 200%-zoom layout, and deep link/Back |
| `tax-boundary-walk.spec.ts` | #627's Tax tab: the SST watch's enabled/empty/stale/denied/technical-failure states as distinct labelled regions, the capability-boundary deep link and its focus return (both click-driven and a fresh navigation), 320px, reduced motion, and the `/admin/compliance` legacy redirect into the rebuilt compliance register |
| `activity-feed-walk.spec.ts` | #632's `/activity`: representative upload/posting/correction/close/report/agent-receipt/conversation-maintenance rows with attribution, kind and client filters written to the URL, keyset "Load more" with dedupe-by-(source,id), a correction's two-sided original/replacement link, the `?event=` detail Sheet's Title/initial-focus/Escape/focus-return and Back-preserves-filters contract, a no-oracle denied detail via a direct deep link, live permission loss clearing the list on a focus recheck, 320px, 200% zoom, and reduced motion. #728 finding 4: history Back returns focus to the row that opened the Sheet (not just that the URL/filters survive). #728 finding 1: a KEPT sweep-heartbeat row reads "Clara (system)" under kind Agent (never Documents) and no row on the page is unattributed |

| `work-list-walk.spec.ts` | #641's B3 durable Work list on BOTH `/work` and `/clients/:id/work`: rows carrying their derived state WORD (including "Retrying", which is `attempts > 1` rather than a status), the client and the origin of a chat-started Work; status facets and free text written to the URL and cleared from it; the two Empty states told apart (filtered no-results keeping its filters and offering Clear filters, versus a client with no durable Work reading as first use); a live permission loss clearing the rows with no affordance that could only refuse; keyset Pagination writing `?cursor=` with Back returning to the first page and no total ever claimed; a filtered deep link whose Back out of the detail restores the identical query; the built-in "Needs you" saved view still a link marked `aria-current`; the client surface pinning its own client with no client picker; keyboard Enter into a row's durable address; the 320 px filter Sheet naming how many filters are applied; narrow list-to-detail and Back; 200 % zoom; reduced motion; the Work detail's current question proved to PRECEDE the Results/Sources/Activity tab strip with `compareDocumentPosition`; and an axe scan of `/work` at 320 px. The pagination control is asserted as `role="button"` because shadcn base-nova's `PaginationLink` renders its real `<a href>` through Base UI's Button with `nativeButton={false}` — measured, not preferred |

These files use `.spec.ts` because the package's Node test manifest accepts `*.test.*` files. Do not add Playwright specs to [`test/manifest.txt`](../test/manifest.txt).

## CI status

The browser suite is not a required GitHub Actions check today. The repository CI runs the web build, Node tests, runtime/database e2e checks, and other gates, but it does not invoke `pnpm --filter @clara/web e2e`. Browser verification and its delivery obligations are included in the [refresh spec and audit appendices](https://github.com/BELCORT-SDN-BHD/clara/issues/612).
