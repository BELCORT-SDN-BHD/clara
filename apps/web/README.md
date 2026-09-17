# `@clara/web`

ClaraBook's production web application. It is a Next.js 16 App Router app, runs on React 19, and is deployed to Cloudflare Workers through OpenNext. The current production origin is `https://app.clarabook.com`; `apps/web` is the active frontend.

Product vision, behavior and scope live in [`docs/PRD.md`](../../docs/PRD.md). System boundaries, deployment topology and accepted technical direction live in [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md). Dated delivery contracts, dependencies and implementation status live in [GitHub Issues](https://github.com/BELCORT-SDN-BHD/clara/issues). Keep this README focused on application setup and operating procedures.

## Application map

Route groups organize layouts without changing URLs.

| Area | Routes | Main surface |
|---|---|---|
| Entry | `/login`, `/signup`, `/auth/confirm`, `/forgot-password`, `/auth/recover/password`, `/invite/:token`, `/pending`, `/checkout/success` | Account creation, confirmation, recovery, invitation, legal acceptance, checkout, and the pre-firm holding state |
| Firm | `/`, `/clients`, `/work`, `/activity` | Firm home, client register, open work (`?view=needs-you` is the saved attention view), and the agent receipts feed |
| Settings | `/settings`, `/settings/account`, `/settings/firm`, `/settings/members`, `/settings/compliance`, `/settings/vendor-bindings` | The caller's own account, plus capability-shaped firm administration |
| Operator | `/operator` | The BELCORT operator's support queue: firm registrations awaiting admission (owner of the firm that carries `is_operator`; #615, 0188 §2) |
| Client | `/clients/:clientId` plus `/work`, `/documents`, `/accounting`, `/knowledge`, `/reports`, and the accounting workbenches `/journals`, `/bank`, `/registers`, `/close`, `/tax`, plus `/plans` (+`/new`, `/:planId`, `/:planId/revise`; #640) and `/accounting/adjustments` (+`/new`; #643) | The client workspace and its accounting workbenches |
| Legacy | `/needs-you` → `/work?view=needs-you`; `/admin` → `/settings`; `/admin/members` → `/settings/members`; `/admin/settings` → `/settings/firm`; `/admin/compliance` → `/settings/compliance`; `/admin/vendor-bindings` → `/settings/vendor-bindings`; `/admin/registrations` → `/operator`; `/settings/registrations` → `/operator` (two rows, never chained — Next matches one rule per request; #615) | Temporary (307) redirects declared in [`lib/navigation/legacy-routes.ts`](lib/navigation/legacy-routes.ts) and wired through `next.config.ts` |
| Clara | `/clara/:threadId`, `/clients/:clientId/clara/:threadId` | Full-screen conversation; the docked rail is mounted once in the firm shell |
| Server routes | `/api/runtime/*`, `/api/invite`, `/api/build-info`, `/checkout`, `/checkout/cancel`, `/checkout/success/claim`, `/auth/confirm/verify`, `/auth/confirm/resend`, `/auth/recover`, `/logout` | Same-origin runtime proxy, mail courier, release provenance, and POST-only mutation boundaries |

The browser reads allowed tables and views through [`lib/read.ts`](lib/read.ts) and calls governed Postgres functions through [`lib/doors.ts`](lib/doors.ts). Runtime requests go through the same-origin `/api/runtime/*` proxy. Firm scope is established by [`app/(firm)/layout.tsx`](app/%28firm%29/layout.tsx), which also renders the one navigation surface — sidebar, scope switcher and breadcrumb — from the registry in [`lib/navigation/tree.ts`](lib/navigation/tree.ts); client scope is activated by [`app/(firm)/clients/[clientId]/layout.tsx`](app/%28firm%29/clients/%5BclientId%5D/layout.tsx), which renders no chrome of its own and publishes the client's name to that shell. UI code renders database amounts and refusals as returned and re-reads authoritative state after governed writes.

The interface uses `next-intl` with a static English locale, semantic tokens from [`app/globals.css`](app/globals.css), local Source Sans 3 and Source Serif 4 assets, and shadcn/Base UI primitives. The beta is light-theme only.

Some routes intentionally show an unavailable or not-built state where a product capability is incomplete. Delivery scope and ordering belong in GitHub specs and implementation issues; do not infer completeness from the presence of a page or button.

## Creating a client, and the two facts the commit does not write

The client register's **Add client** control reuses ⌘K's own dispatch rather than minting a second
call site. Confirm asks `clara.client_identity_candidates` before it reaches
`clara.begin_client_onboarding`, and the answer decides what happens next — the three arities the
owner ruled on 2026-09-15:

- **0** — nothing in the firm answers to that name. The same click goes straight on to the door.
- **1** — the candidate is **shown**, with a real link to the record and the reason it matched, and
  Confirm re-enables only once a person ticks "this is a different business". The database does not
  refuse at this arity and must not be made to: its own predicate is `count(*) > 1`, so one
  same-family party has never been "ambiguous" anywhere in this estate. The acknowledgement is the
  only wall here, and it lives in the face.
- **2 or more** — the **database** refuses, CLR10 `name_family_collision`, and the refusal renders
  verbatim with its code beside the same candidate list — which the refusal itself carries, so the
  face never issues a second read of the fact it is reporting. **And a belt, labelled as one**: if
  that read ever *answered* an arity of 2 or more instead of refusing it, Confirm is shut rather
  than live-looking-and-inert. 0204 raises at this arity and never returns it as a success, so the
  state is unreachable through the live door; the cell that holds the belt honest drives a mock
  door to answer it (`add-client-candidates.test.tsx`).

Editing the name retires the check, the acknowledgement and the refusal; it never clears the typed
text. **There is no client-side duplicate rule and there must not be one**: the family predicate may
not be granted to any application role (a live census in migration 0103 raises on any such grant),
which is why the browser is given a definer wrapper and never the predicate.

**The wall is the READ, not the birth door.** A caller that never asks can still call
`begin_client_onboarding` and a client is born — a named residual, kept honest by
`packages/db/tests/client-onboarding-identity.test.mjs`'s `p649.identity.direct_birth_residual`.

**⌘K is a SECOND entrance to that door, and it does not ask.** `DO_ACTIONS`'
`beginClientOnboarding` (`lib/command/do-actions.ts`) is dispatched straight from the palette
(`components/command/command-palette.tsx`), with no `client_identity_candidates` read anywhere in
that path — `agentic-finish-walk.spec.ts`'s 裁-37 arm proves it green, dispatching with zero
identity reads in the whole run. So the arities above are the register control's wall, not the
product's: the same name typed into the palette is born unchecked. That is a **named residual**,
not a claim, and it is a face-level sibling of the birth-door one above — closing it means giving
the palette an arity-1 acknowledgement of its own (a design, not a one-liner), or moving the wall
into the door, which needs the new birth verb the residual above describes.

**Committing an onboarding plan writes neither Knowledge nor the client's own record.** Two
separate, named acts follow it at the same call site, and they are treated differently on purpose:

1. `promote_plan_answers_to_knowledge` is a **projection** and its failure is deliberately
   swallowed — a failed Knowledge write must not present itself as a failed commit, and the act is
   safe to repeat.
2. `settle_client_onboarding_facts` writes the client's **own financial-year end** and its failure
   is **shown**. Above all CLR38 `fy_end_locked_by_annual_cadence`: a live ANNUAL adjustment
   template or depreciation authority means the year end did not move, and a refused financial-year
   write presented as a settled onboarding is the worst outcome this journey can produce.

The financial-year **day** is asked, never derived (owner ruling D7). The interview asks only a
month; `clara.clients` admits a year end only as a month and a day together. The commit dialog's
field offers month end as a **button that names the day it will fill** and never as a default —
deriving it would invent an accounting fact on a professional's record. Leaving both boxes blank is
a real choice: the settle door is then not called at all, and the dialog says so, rather than
manufacturing a `fy_end_day_required` refusal for a value nobody gave.

## Close and bank operating order

Prepare and reconcile the books before beginning a financial-year close. For an ongoing client with brought-forward balances, record an evidenced opening position in this order:

1. `create_opening_seed` with the real tie document.
2. `record_opening_target` for each target total.
3. `draft_opening_item` for the supported opening entries.
4. `approve_opening_seed` against the current onboarding-plan revision and the approval evidence the door requires.

Then load statements covering the relevant financial year, resolve or explicitly acknowledge outstanding lines, and complete each bank reconciliation. A partial-year statement set can correctly report missing months. Do not treat a zero-statement result as proof of coverage; explicit coverage evidence is part of the [refresh spec's close acceptance](https://github.com/BELCORT-SDN-BHD/clara/issues/612). If reconciliation reports `recon_opening_mismatch`, correct the opening position from evidence and run the checks again. Do not invent a brought-forward balance to make the difference zero.

Complete bank settlements and other financial-year writes before `begin_close`. Beginning close changes the year to `closing` and rejects writers into that year until the close is finalized or abandoned; an attempted settlement in the period is refused and rolls back. The approved Q-03 role simplification is still pending, so some current approval paths can also require a second checker or written attestation. Follow the refusal returned by the door rather than assuming the intended future role model is already active.

## Local setup

Install from the repository root and copy [`.env.example`](.env.example) to the gitignored `.env.local`. Values prefixed with `NEXT_PUBLIC_` are compiled into the browser bundle and must be public. Keep service credentials in server-only variables.

The minimum local configuration is:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CLARA_RUNTIME_URL=
CLARA_PUBLIC_ORIGINS=
```

Signup, invitations, auth-wall confirmation, and checkout require the additional server-only variables documented in `.env.example`. `NEXT_PUBLIC_CLARA_RUNTIME_URL` is intentionally unsupported; browser traffic uses the same-origin proxy.

Run commands from the repository root:

```sh
pnpm install
pnpm --filter @clara/web dev
pnpm --filter @clara/web typecheck
pnpm --filter @clara/web lint
pnpm --filter @clara/web test
pnpm --filter @clara/web build
pnpm --filter @clara/web e2e
```

`test` runs the Node/tsx files listed in [`test/manifest.txt`](test/manifest.txt); the lint command verifies that the manifest and message catalog are complete. `e2e` builds the production app and runs the mock-backed Playwright suite in Chromium. Its fixtures and limits are documented in [`e2e/README.md`](e2e/README.md). Real Postgres/runtime walks are documented in [`e2e/live-stack/README.md`](e2e/live-stack/README.md).

`build` first checks that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a publishable or positively identified
anon key. This package declares Node 22 through `devEngines.runtime`; `pnpm install` downloads
the exact runtime pinned in the lockfile, and package scripts/`pnpm exec` use it automatically.
This also satisfies Wrangler and OpenNext's Node requirement; the repository's default toolchain,
CI and the backend runtime image are on the same Node 22 line. Use pnpm to invoke web tools so
they receive the package runtime.

## Cloudflare deployment

Wrangler is Cloudflare's official CLI and is pinned in this package. Use the workspace binary
through `pnpm --dir apps/web exec wrangler` from the repository root. OpenNext prepares this
Next.js app for Workers; Wrangler uploads versions and controls promotion/rollback.

The project configures the official `cloudflare-api` and `mobbin` remote MCP servers in
`.mcp.json` and `.codex/config.toml`. Cloudflare provides documentation search and scoped API
access for account inspection and operations; Mobbin provides product-design reference search.
Authenticate each agent client through the provider's OAuth flow. For Codex CLI, run
`codex mcp login cloudflare-api` and `codex mcp login mobbin`; OAuth credentials stay in the
client's credential store. In Claude Code, approve the project servers and authenticate them
through `/mcp`. Mobbin MCP requires a Pro, Team, or Enterprise plan.
Wrangler has a separate login: use `pnpm --dir apps/web exec wrangler login`, then
`pnpm --dir apps/web exec wrangler whoami` to verify the selected account. The API MCP complements
the local build/release chain; it cannot
compile this checkout. Avoid adding redundant product-specific MCP servers until a concrete need
requires them.
See [Cloudflare MCP](https://github.com/cloudflare/mcp) and
[Wrangler](https://developers.cloudflare.com/workers/wrangler/).

[`wrangler.jsonc`](wrangler.jsonc) names the `clara-web` Worker and holds non-secret runtime variables. Production currently expects these six Worker secrets:

- `CLARA_AUTH_WALL_SERVICE_TOKEN`
- `CLARA_RATE_WALL_PEPPER`
- `INVITE_MAIL_FROM`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Build the Cloudflare bundle in Linux with a Linux-native `pnpm install`; it provisions this
package's Node runtime. Do not reuse this Windows checkout's `node_modules` from WSL because
`workerd` is platform-specific. Local Wrangler account/version commands also work on Windows.

Before a deployment, record the currently promoted version and the secret names:

```sh
pnpm --dir apps/web exec wrangler deployments list --name clara-web
pnpm --dir apps/web exec wrangler secret list --name clara-web
```

In a clean Linux clone at the exact commit to deploy, install with the frozen lockfile. Supply only the two public Supabase values and `CLARA_BUILD_SHA` at build time, then build the Worker:

```sh
pnpm install --frozen-lockfile
pnpm --filter @clara/web cf:build
```

Upload a version, inspect it, and verify that all six secret names are attached before promotion:

```sh
pnpm --dir apps/web exec wrangler versions upload
pnpm --dir apps/web exec wrangler versions view <new-version-id>
pnpm --dir apps/web exec wrangler versions deploy <new-version-id>@100% --yes
pnpm --dir apps/web exec wrangler deployments list --name clara-web
```

After promotion, verify `/login`, `/favicon.ico`, `/icon.png`, the authenticated route smoke, and one behavior that differs from the previous version. `/api/build-info` reports the web commit and the runtime origin paired with it; verify runtime and database versions through their own release checks.

Rollback is a version promotion, using the version recorded before the change:

```sh
pnpm --dir apps/web exec wrangler rollback <previous-version-id>
```

Rollback immediately sends all traffic to the selected version. It does not restore R2 objects,
database state or deleted resources. See [Cloudflare rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Do not use `wrangler versions list` to decide what is live; it shows version history without traffic percentages.
