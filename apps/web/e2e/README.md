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

## Coverage map

The checked-in suite currently contains 22 specs:

| Spec | What it exercises |
|---|---|
| `entry-faces-walk.spec.ts` | Login, signup validation, invite refusal, confirmation, holding redirect, and global not-found |
| `signup-confirm-pending.spec.ts` | Signup, six-digit confirmation, firm step, DPA step, and pending state |
| `checkout-gate-walk.spec.ts` | Confirmation-to-checkout-to-claim journey and fail-closed request boundaries |
| `firm-navigation-walk.spec.ts` | Rank-shaped sidebar and settings hub, Work's saved "Needs you" view, and the Work/Activity agent-task split |
| `home-board-walk.spec.ts` | Firm and client home boards, responsive composition, and activity summary |
| `responsive-shell-walk.spec.ts` | Narrow/zoomed shell, the mobile sheet and docked-rail behavior, keyboard focus, tabs, assets, and accessibility |
| `identity-finish.spec.ts` | Brand assets, entry faces, Clara mascot, and reduced motion |
| `a11y-finish-walk.spec.ts` | Target size, skip link, focus ring, reduced motion, and axe scans across the shell's own surfaces |
| `parity-holes.spec.ts` | Client/thread isolation, password recovery, route errors, and rail layout |
| `chat-parity-walk.spec.ts` | Clarifications, attachments, thread creation/switching, stream proxying, and typed cards; a clarify answered IN PLACE while a 900-delta stream is still arriving (the timer census is taken over a window 200 DECODED deltas wide, never a fixed wait) and the turn clock is counting (the live view must not be replaced by a send error, and no React nested-update or hydration fault may reach the console), at 320 CSS px, plus reduced motion counted as MOVEMENT on the clarify group |
| `agentic-finish-walk.spec.ts` | Capability-shaped commands, task reattachment, onboarding receipt states, and chart apply |
| `journals-table-walk.spec.ts` | Journal tables, filters, disclosure, approval, clarifications, and accessibility. #634 review round: an expanded POSTED row discloses its purpose, its Work link, its operation receipt with a working copy control, and its source — "No document" for a Work-recorded entry and the named lane for a document-coded one |
| `documents-viewer-walk.spec.ts` | Safe document viewing, evidence overlays, extraction hierarchy, CSP reporting, and accessibility |
| `bank-close-registers-walk.spec.ts` | Refusal-preserving dialogs, close restart, and human-readable close holds |
| `money-input.spec.ts` | Exact-cent input and ambiguous-input refusal |
| `interview-walk.spec.ts` | Real-stack onboarding interview and Tax route reachability when its fixture is supplied |
| `reports-download-walk.spec.ts` | Real-stack sealed artifact download when its fixture is supplied |
| `journal-work-walk.spec.ts` | #623's durable-Work journey: the Accounting hub's primary act, the composer's validation and first-invalid focus, a restored draft and its unknown account, submit → the Work detail running to a posted entry, a typed refusal and the Retry that starts a NEW run of the SAME Work, a LOST acknowledgement resolving to that same Work through its intent key, the `work_accepted`/`work_status`/`work_result` cards in a transcript, the malformed-id not-found boundary, 320 CSS px and 200% zoom, reduced motion, heading focus that a background poll never takes back, and a console/pageerror collector proving the Work detail route hydrates clean in both its completed and its parked face |
| `manual-journal-walk.spec.ts` | #634's optional and LATE evidence on the expert journal path: the composer's optional document chooser (an explicit "No document" default) and the draft that carries the choice across a reload under one intent key, the `source_already_posted` Alert with its link to the entry that already stands on the document and no resubmit of that intent, a refusal naming `sourceRefs[N]` landing on the evidence control with the draft intact, the B3 late-attachment Dialog (initial focus, the two conflicts, the happy path, focus return) and its CLR06 stale race with the choice preserved, plus 320 CSS px, 200% zoom, reduced motion and keyboard operation. Review round: Escape closing the Dialog and RETURNING focus to its trigger with the choice intact and nothing attached, and an UNVERIFIED filed document offered by neither chooser (the estate's custody floor, `bytes_verified_at is not null`). #728 finding 5: BOTH pickers (composer, late-attach Dialog) offer a document that already backs a posted entry as a DISABLED option, never hidden, with the reason and a link to that entry beside the select — the door's own `source_already_posted` refusal stays reachable and is still proven in the same walk. #728 finding 3: a successful late attachment moves focus to the "What was recorded" heading, never `<body>`, once the Dialog and its trigger are both gone |
| `work-question-walk.spec.ts` | #629's shared Work question on B3: the parked question with its reason and version, a bounded KEYBOARD walk through a two-field stepper to a review step and one submit, first-invalid focus on an amount the browser can refuse (three decimal places), a draft that survives a real navigation, answered-elsewhere and stale-version convergence that re-reads the authoritative record and KEEPS the draft, a denied read-only surface, 320 CSS px with no page-wide horizontal scroll, 200% zoom, and reduced motion; and on B4/B6: the Needs-you `work_question` row answered inline with focus landing on the section heading rather than the body once the row leaves, that row's form at 320 CSS px under reduced motion, a stable inbox URL that Back returns to, a Clara transcript's `work_question` card rendering the accepted record with NO live region of its own, the durable `work_accepted` card finding a GENUINELY PARKED Work's question after a reload and answering it in place (#629's follow-up gap), and the supporting source the run named |
| `shell-migration-walk.spec.ts` | #614's unified shell: the legacy `/admin`/`/needs-you` redirect matrix, identity at every width, the keyboard scope switcher and its cross-client isolation guarantee, the mobile sheet's keyboard contract, the Accounting sidebar group, reduced motion, the client-not-found boundary (a bogus id, and — via a same-process visibility toggle — a client that goes invisible mid-session), one overlay stack (the Clara rail plus the mobile nav Sheet open together at 640px), Work's destination split, settings rank-shaping, and the train's retired entries |
| `personal-settings-walk.spec.ts` | #626's `/settings/account`: loaded/dirty/saved/reload-persists, per-field Reset, save failure (CLR10) preserving dirty state with first-invalid-focus, concurrent change (CLR06) and Reload-and-keep-my-edits, denied/signed-out, the honest Notifications "not configured" note, the saved motion preference's `data-motion` attribute independent of the OS setting, keyboard-only save, 320px and 200%-zoom layout, and deep link/Back |
| `tax-boundary-walk.spec.ts` | #627's Tax tab: the SST watch's enabled/empty/stale/denied/technical-failure states as distinct labelled regions, the capability-boundary deep link and its focus return (both click-driven and a fresh navigation), 320px, reduced motion, and the `/admin/compliance` legacy redirect into the rebuilt compliance register |
| `activity-feed-walk.spec.ts` | #632's `/activity`: representative upload/posting/correction/close/report/agent-receipt/conversation-maintenance rows with attribution, kind and client filters written to the URL, keyset "Load more" with dedupe-by-(source,id), a correction's two-sided original/replacement link, the `?event=` detail Sheet's Title/initial-focus/Escape/focus-return and Back-preserves-filters contract, a no-oracle denied detail via a direct deep link, live permission loss clearing the list on a focus recheck, 320px, 200% zoom, and reduced motion. #728 finding 4: history Back returns focus to the row that opened the Sheet (not just that the URL/filters survive). #728 finding 1: a KEPT sweep-heartbeat row reads "Clara (system)" under kind Agent (never Documents) and no row on the page is unattributed |

These files use `.spec.ts` because the package's Node test manifest accepts `*.test.*` files. Do not add Playwright specs to [`test/manifest.txt`](../test/manifest.txt).

## CI status

The browser suite is not a required GitHub Actions check today. The repository CI runs the web build, Node tests, runtime/database e2e checks, and other gates, but it does not invoke `pnpm --filter @clara/web e2e`. Browser verification and its delivery obligations are included in the [refresh spec and audit appendices](https://github.com/BELCORT-SDN-BHD/clara/issues/612).
