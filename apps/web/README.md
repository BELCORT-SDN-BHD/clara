# apps/web — Clara's production frontend (P1 foundation scaffold)

**Status: P1 FOUNDATION.** This is the scaffold only — package wiring, tokens, i18n plumbing,
an empty two-level route skeleton. No product screens. It replaces `apps/dashboard` **at
cutover**, not before (`docs/plan/active/frontend-handoff-2026-08-23.md` §0.1).

## What this is

Next.js App Router, TypeScript strict, deployed to Cloudflare Workers via
`@opennextjs/cloudflare`. Branch `frontend/web`. Build order and phase definitions:
`docs/plan/active/mohe-grill-rulings-2026-08-27.md` Q9 — this scaffold is **P1**; the shell
(auth, `⌘K`, rail+thread, the 18-part renderer) is **P2**; the workbench screens are **P3**.

**The rulings this scaffold builds to** (read before touching anything here):

1. `docs/plan/active/mohe-grill-rulings-2026-08-27.md` — the owner rulings from the 磨合
   opening grill (Q1-Q9 + the final batch Q-A…Q-F). Q4 ratifies the ClaraBook brand system
   v1.0 this scaffold ports; Q3 is the IA this scaffold's route skeleton follows; Q5 is the
   i18n law; Q9 is the build order.
2. `docs/plan/active/frontend-handoff-2026-08-23.md` — §0 (settled decisions: location, host,
   auth, email, styling, data, crude doors, generative-UI principles) and §6 (setup) still
   stand in full; the rest of that document is superseded where the mohe rulings disagree.
3. `AGENTS.md` — the fourteen hard constraints. Constraint 1 (accounting-correctness >
   backend contracts > design) governs every collision here.

## Token provenance

The semantic tokens in `app/globals.css` and the local fonts in `public/brand/fonts/` are
**ported verbatim** from the `clarabook-frontend` repo (the design-asset archive, owner
ruling Q-A), specifically `g5-design-system/clarabook-design-system/app/globals.css` and its
`public/brand/fonts/` at commit **a86e48a**. That repo's `docs/01-TOKEN-CONTRACT.md` is the
token contract of record — read it before adding or renaming a token. Highlights:

- **Colour**: `--shell: #F7F7F5` (nav/app shell) vs `--surface-subtle: #F5F6F4` (quiet grouped
  surface within a white canvas) are deliberately close but distinct roles — do not collapse
  them. `--interaction` and `--focus` are separate semantic roles even though both currently
  resolve to `#1D4ED8` — one may change without silently changing the other (never derive
  `--ring` from `--primary`). `--clara` (`#5B4EA3`) is reserved for literal Clara-actor
  attribution only — never platform authority, focus, primary action, or semantic state.
- **Type**: Source Sans 3 (Regular/Semibold) is the interface family; Source Serif 4
  (Regular) is reserved for a management-account cover title or rare narrative opening —
  never controls, tables, metadata or Clara content. Both ship as local fonts
  (`public/brand/fonts/*.ttf`, OFL-licensed — LICENSE files sit alongside) via
  `next/font/local`, not Google Fonts.
- **Space/radius/motion**: the density/radius/motion CSS vars in `globals.css` mirror the
  source `--space-*`/`--radius-*`/`--duration-*` scale in the token contract's §5-§7 — see
  that document for the full pixel table (not duplicated here to avoid drift).
- **Theme**: **light theme only** for this beta (`color-scheme: light` in `:root`, no `.dark`
  block). This is a beta-scope ruling, not permanent (Q4 caveat) — the `@custom-variant dark`
  declaration stays in place so primitives keep their dark variants dormant rather than
  absent; nothing in this codebase adds a `.dark` class.
- **Prohibition, carried forward**: no raw hex/Tailwind-palette values in component code —
  consume the semantic Tailwind utilities (`bg-background`, `text-foreground`,
  `border-border`, …) that `@theme inline` in `globals.css` bridges from the CSS vars.

`components.json` (`style: "base-nova"`) and `lib/utils.ts` (`cn()`) are the same shapes
`shadcn@latest init -t next -b base -p nova` produces — verified by running that exact CLI
command against a disposable reference scaffold before hand-integrating the output here (a
real `shadcn init` inside this monorepo would drop its own `package-lock.json` and run `npm
install`, which fights the workspace's pnpm-only lockfile — see "Deviations" below).
`components/ui/button.tsx` is that CLI's real output, with the `dark:` variant classes
stripped (light-theme-only, per the token contract's own prohibition list). Add further
primitives with `pnpm dlx shadcn@latest add <component>` from `apps/web/`.

## i18n

`next-intl`, wired end-to-end but with a **single static locale (`en`)** and **no
locale-prefixed routing** — next-intl's documented ["without i18n
routing"](https://next-intl.dev/docs/usage/configuration#static-request-locale) setup
(`i18n/request.ts` returns a static locale, no middleware, no `[locale]` segment). This
matches owner ruling Q5: UI chrome is English-first for beta, but every string goes through
next-intl from day one so hardcoded strings can be lint-banned once product screens land.
Statutory/client-facing instruments (PDPA notices, client authorization letters, watermark
locale) are a **separate**, later surface that ships BM+EN from day one per Q5 — not this UI
chrome skeleton. Messages live in `messages/en.json`.

Adding a real locale later (`ms`, `zh`) is a `routing.ts` + middleware change scoped to
`i18n/` and `next.config.ts` — it does not require moving any route, because the IA below
never depended on a `[locale]` URL segment.

## Route skeleton

Matches the two-level IA ruled in Q3 (firm altitude / client-workspace altitude) — route
groups only, no URL segment added by the grouping:

```
app/(firm)/page.tsx                          → "/"                     firm home (placeholder)
app/(firm)/clients/[clientId]/page.tsx        → "/clients/:clientId"    client workspace (placeholder)
```

Both are placeholder pages — no content, no data fetching, no chrome. The real firm-altitude
surface (Needs-you inbox, client register, firm activity/receipts feed, admin) and the real
client-workspace surface (journals/documents/bank/close/reports/registers/knowledge as tabs,
Clara docked as a rail) are P3/P2 work respectively.

## Cloudflare

Deployed via `@opennextjs/cloudflare` (Node.js runtime on Workers, not the Edge runtime).
`wrangler.jsonc` declares no bindings yet — this is the foundation scaffold only.

**Known deviation, by design:** `wrangler@4.126.0` (and its transitive deps
`@cloudflare/kv-asset-handler`, `miniflare`) require **Node >= 22**; this monorepo's root
`engines.node` is pinned `>=20.19 <21` (matches the Node this scaffold's own `next
build`/`typecheck`/`lint` proof ran under — Node 20.19.5). `pnpm install` succeeds regardless
(`strict-peer-dependencies=false`, no engine-strict in `.npmrc`), and `next build` itself was
verified clean on Windows/Node 20.19 with `initOpenNextCloudflareForDev()` wired into
`next.config.ts` (empirical check, 2026-08-27 — it's a documented no-op until Cloudflare
bindings actually exist). The `cf:build` / `cf:preview` / `cf:deploy` / `cf-typegen` scripts
in `package.json` are **documented, not run, on this Windows box** — per the original
handoff's own instruction, the Cloudflare build runs on WSL CI, which can and should run a
newer Node for that one step. This is a deviation worth flagging to the owner if the CI lane
provisioning doesn't already assume it.

Compatibility flags: `nodejs_compat` (required by the adapter) + `global_fetch_strictly_public`.
`compatibility_date` is pinned to the scaffold's authoring date; bump it deliberately, not
silently, per Cloudflare's own compatibility-date guidance.

## Run

From the repo root:

```sh
pnpm install
pnpm --filter @clara/web typecheck
pnpm --filter @clara/web lint       # walks up to the root eslint.config.mjs, same as apps/dashboard
pnpm --filter @clara/web build      # plain `next build` — proven green on Windows
pnpm --filter @clara/web dev        # local dev server
```

`pnpm typecheck` / `pnpm lint` / `pnpm build` at the repo root fan out to this package too
(`pnpm -r --if-present <script>`) — this scaffold does not change that fan-out's shape or
break any existing package's pipeline.

## Command palette (⌘K)

`components/command/` (the vendored shadcn `command`/`dialog`/`input`/`input-group`/`badge`
primitives live in `components/ui/`, added via `pnpm dlx shadcn@latest add`, `dark:` classes
stripped per the token-provenance prohibition above) + `lib/command/` (`routes.ts`, `bus.ts`).
Three sections — **Go** (real navigation over the ruled two-level IA, `lib/command/routes.ts`;
a route with no page yet is labelled "not built yet", never hidden or faked — selecting it is
still a real navigation, landing on Next's own not-found) · **Ask** (never converses — emits
`clara:focus-rail` on `lib/command/bus.ts`, the seam the rail lane subscribes to once it
lands) · **Do** (a fixed, disabled, single row naming the shape — "dispatch a run" — with no
verb list and no fake dispatch; P3 wires it up). Full detail, key map, and the layout
integration note are in `components/command/command-k-provider.tsx`'s header comment — that
file deliberately does **not** self-mount into any layout.

**Known deviation, by design:** adding `cmdk` (a `command.tsx` dependency) surfaced a
pre-existing `@types/react` version skew between this package (`19.2.18`) and
`apps/dashboard` (`19.2.17`) — pnpm's shared phantom-hoist slot for packages with no declared
`@types/react` edge of their own (cmdk is one: it has neither a dependency nor a peer on
`@types/react`) picked the older copy, which broke `tsc` on every cmdk JSX element with a
`React.Key`-branding mismatch (React 19's `Key` type mints a new nominal `unique symbol` per
patch release). Fixed with a root `pnpm.overrides` (`package.json`) pinning
`@types/react`/`@types/react-dom` to this package's versions workspace-wide — the narrowest
available fix that doesn't touch `apps/dashboard`'s own declared contract; verified both
apps' `typecheck`/`build` stay green after it. Worth a second look from whoever owns
`apps/dashboard` if its own type pins are meant to track something else deliberately.

## Dependency notes

- **Root `pnpm.overrides`** (repo-root `package.json`): pins `@types/react` to
  `19.2.18` and `@types/react-dom` to `19.2.5` workspace-wide. Introduced adding
  `cmdk` (the command-palette dependency): `cmdk` declares neither a dependency nor a
  peer on `@types/react`, so pnpm's shared phantom-hoist slot picked up an older copy
  from `apps/dashboard` (`19.2.17`) instead of this package's own `19.2.18` — a skew
  that broke `tsc` on every `cmdk` JSX element (React 19 mints a new nominal
  `unique symbol` for `Key` per patch release, so the two copies' `Key` types don't
  match). The override is the narrowest fix that doesn't touch `apps/dashboard`'s own
  declared contract; see "Known deviation, by design" under Command palette above for
  the full account, including the open question for whoever owns `apps/dashboard`.
- **`"type": "module"`** (this package's `package.json`): every script and test file
  in `apps/web` runs as native ESM — `.js`/`.mjs` files here follow `.mjs` semantics
  (no bare `require`, `import.meta` works, `__dirname`/`__filename` do not exist) even
  without the `.mjs` extension. The test runner (`node --import ./test/bootstrap.mjs
  --import tsx --test …`) and every file under `tests/`/`test/` are written to that
  contract already — carry it forward for anything new added here.

## What is deliberately NOT here yet

No auth (Supabase SSR cookie sessions land at P2), no rail/thread, no part-catalog renderer,
no data fetching, no product screens of any kind. `⌘K` is built (Go/Ask real, Do an honest
disabled skeleton — see above) but not yet mounted into any layout. See
`docs/plan/active/mohe-grill-rulings-2026-08-27.md` Q9 for the phase plan.
