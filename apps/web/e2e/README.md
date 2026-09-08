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

The checked-in suite currently contains 17 specs:

| Spec | What it exercises |
|---|---|
| `entry-faces-walk.spec.ts` | Login, signup validation, invite refusal, confirmation, holding redirect, and global not-found |
| `signup-confirm-pending.spec.ts` | Signup, six-digit confirmation, firm step, DPA step, and pending state |
| `checkout-gate-walk.spec.ts` | Confirmation-to-checkout-to-claim journey and fail-closed request boundaries |
| `firm-navigation-walk.spec.ts` | Rank-shaped firm navigation and firm controls |
| `home-board-walk.spec.ts` | Firm and client home boards, responsive composition, and activity summary |
| `responsive-shell-walk.spec.ts` | Narrow/zoomed shell, drawer and rail behavior, keyboard focus, tabs, assets, and accessibility |
| `identity-finish.spec.ts` | Brand assets, entry faces, Clara mascot, and reduced motion |
| `a11y-finish-walk.spec.ts` | Target size, skip link, focus ring, reduced motion, and axe scans |
| `parity-holes.spec.ts` | Client/thread isolation, password recovery, route errors, and rail layout |
| `chat-parity-walk.spec.ts` | Clarifications, attachments, thread creation/switching, stream proxying, and typed cards |
| `agentic-finish-walk.spec.ts` | Capability-shaped commands, task reattachment, onboarding receipt states, and chart apply |
| `journals-table-walk.spec.ts` | Journal tables, filters, disclosure, approval, clarifications, and accessibility |
| `documents-viewer-walk.spec.ts` | Safe document viewing, evidence overlays, extraction hierarchy, CSP reporting, and accessibility |
| `bank-close-registers-walk.spec.ts` | Refusal-preserving dialogs, close restart, and human-readable close holds |
| `money-input.spec.ts` | Exact-cent input and ambiguous-input refusal |
| `interview-walk.spec.ts` | Real-stack onboarding interview and Tax route reachability when its fixture is supplied |
| `reports-download-walk.spec.ts` | Real-stack sealed artifact download when its fixture is supplied |

These files use `.spec.ts` because the package's Node test manifest accepts `*.test.*` files. Do not add Playwright specs to [`test/manifest.txt`](../test/manifest.txt).

## CI status

The browser suite is not a required GitHub Actions check today. The repository CI runs the web build, Node tests, runtime/database e2e checks, and other gates, but it does not invoke `pnpm --filter @clara/web e2e`. Browser verification and its delivery obligations are included in the [refresh spec and audit appendices](https://github.com/BELCORT-SDN-BHD/clara/issues/612).
