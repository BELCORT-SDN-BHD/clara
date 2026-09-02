# apps/web/e2e — the Playwright suite

Run with `pnpm --filter @clara/web e2e` (`e2e/run.mjs`): it builds the app, starts it with
`next start` behind `serve-built.mjs`'s HTTPS mock-Supabase proxy, and runs every `*.spec.ts`
in this directory against the built app in real Chromium. `playwright.config.ts` (one level up)
owns the shared config — `testDir: "./e2e"`, one shared `webServer`, one browser project.

## Files

- `signup-confirm-pending.spec.ts` — the full signup -> explicit email confirmation -> holding
  page walk, with axe scans on each face (PR #461, round 6).
- `interview-walk.spec.ts` — the durable client interview walk (FS-5, 裁-86), run against the
  real backend via `live-stack/` (see that directory's own README for why). ALSO carries FS-8's
  Tax tab arm (P6-T IA shell): nav-click and ⌘K both reach `/clients/:id/tax` on the SAME
  COMPLETE fixture the interview walk uses, and the three honest notes render. No interview
  segment is answered by this arm — it only needs the fixture's authenticated client.
- `entry-faces-walk.spec.ts` — the entry group's pre-auth faces: login, signup (rendering,
  client-side validation, keyboard pass), an incomplete invite link, an unknown route, the
  holding page's anonymous-visitor redirect, and the confirm face's honest missing-token state
  (PR #461, the 裁-86 e2e leg — this walk was first run manually via the session's Playwright
  MCP tools against the built app on 2026-08-31, then encoded here). Also carries the two
  positive controls the review round asked for: one proving the console-error collector fires
  at all, one proving the `page.route` glob on the signup endpoint fires at all -- an `errors:
  []` or a `signupCalls: 0` reading is not evidence either instrument works, only that neither
  happened to catch anything. The signup SUBMISSION arm (mail -> confirm) is deliberately
  excluded from the REST of this spec's tests and lands with FS-4's e2e instead -- 裁-92 (the
  6-digit-code confirmation) replaces the as-built confirm flow before beta, and walking it now
  would need a Supabase email-template act FS-4 immediately supersedes.
- `firm-navigation-walk.spec.ts` — P4-6's built-app rank-shaping walk: an operator owner
  reaches Members through Admin in two navigation clicks, while a bookkeeper sees only the
  destinations admitted by the mock fixture rank. It proves built-app scope propagation and
  navigation shaping, not a DB rank, RLS policy, or live `caller_context` response.
- `money-input.spec.ts` — the build-gated journal MoneyInput component walk, including its
  visible refusal contract and a WCAG A/AA axe scan.
- `run.mjs`, `serve-built.mjs` — the build-then-serve harness; see their own headers.

## Why these specs are NOT in `apps/web/test/manifest.txt`

`scripts/check-test-manifest.mjs`'s own file-matching rule is
`/\.test\.(ts|tsx|js|jsx|mjs|cjs)$/` — it globs for `*.test.*`, never `*.spec.*`. Every file in
this directory uses the `.spec.ts` extension specifically so the manifest gate's glob never
sees it: `run-tests.mjs` feeds the manifest's paths straight to `node --test`, which does not
speak `@playwright/test`'s `test`/`expect` — a `.spec.ts` file caught by that glob would fail
under the wrong runner, not pass under the right one. Checked directly against the gate's
regex before writing this file (2026-08-31) — no manifest edit was made or is needed.

## Why the CI browser leg is not wired up yet

This suite runs today only when a human or an agent invokes `pnpm --filter @clara/web e2e`
directly (or drives the same faces manually through the Playwright MCP tools, as the
`entry-faces-walk` spec's own header describes). Landing it as a required, always-green GitHub
Actions job — the render-drill-style CI leg described in `AGENTS.md`'s CI/CD section — is
tracked as **FS-12** in `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md`, not
this train. Wiring it in early, ad hoc, on one PR would give this one train's browser leg a
different CI shape than every other frontend train's, and FS-12 exists specifically to land
that wiring once, uniformly, for all of them.
