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
pnpm --filter @clara/web test       # node --test + tsx — the auth-boundary suite (tests/)
pnpm --filter @clara/web build      # public-key class gate, then `next build`
pnpm --filter @clara/web dev        # local dev server
```

`build` runs `scripts/check-public-key.mjs` first and **refuses to bundle** unless
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is a publishable/anon key (see "Security posture" below).
Set it in `.env.local` (gitignored; copy `.env.example`) or in the environment.

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
file deliberately does **not** self-mount into any layout. **Mounted** in
`app/(firm)/layout.tsx` (P2 fold seam H) — every route under the firm shell has ⌘K reachable
end to end; the docked Clara rail is mounted alongside it via `components/clara/rail-mount.tsx`
(one mount app-wide). Both Clara full-screen escalation routes live outside the `(firm)` shell
entirely, in their own `app/(full)/` route group (P2 fold round 3, same URLs — route groups add
no URL segment) — the rail never wraps them, because `(firm)/layout.tsx` never wraps them,
structurally rather than by a runtime pathname check. See `app/(full)/layout.tsx`'s header.

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

## Security posture — owner/deploy obligations

A cross-model adversarial security review of the P2 auth surface (Codex `gpt-5.6-sol`,
2026-08-27) produced thirteen findings. Ten were fixed in code on this branch and are
covered by `tests/` (the redirect wall, the proxy matcher, the OTP hardening, the scope
epoch, the key-class gate, the cookie hardening, the anti-cache headers, the logout wall).

**Three are not code.** They are hosted-Supabase or deployment configuration that this
repository cannot enforce or prove, and they are the owner's to set and to re-verify after
any Supabase project change. Each is stated with what must be true and how to check it.

### 1. Password policy must be set in Supabase Auth (review finding 10, LOW)

The only constraint this repo can see is the invite form's `minLength={8}`, which a direct
SDK or Auth API call bypasses entirely. The authoritative policy lives in the hosted
project.

- **Configure:** Supabase Dashboard → Authentication → Providers → Email → *Password
  requirements*. Set a minimum length of **at least 12** and require lower + upper +
  digit + symbol; enable **leaked-password protection** (HaveIBeenPwned) — a Pro-plan
  feature. Docs: `supabase.com/docs/guides/auth/password-security`.
- **Verify (receipt):** with the project's Management API token,
  `GET /v1/projects/{ref}/config/auth` and read back
  `password_min_length`, `password_required_characters`,
  `password_hibp_enabled`. Keep the JSON response with the deploy record — a screenshot is
  not a receipt. Re-run it after any project restore.
- **Keep aligned:** if the server minimum moves, move `minLength` in
  `components/invite-accept-form.tsx` with it. The UI value is a courtesy, never the wall.

### 2. Access-JWT revocation window (review finding 5, MEDIUM)

`proxy.ts` gates on `supabase.auth.getClaims()`, which verifies the JWT **signature and
expiry locally**. It does not — and by design cannot — ask the Auth server whether that
session still exists. A stolen, unexpired access token therefore keeps passing the gate
(and keeps reaching PostgREST directly) until it expires, even after a global sign-out.

**The chosen bound is the access-token lifetime**, and it is the only thing standing between
a revocation and a still-working token. Swapping `getClaims()` for `getUser()` in the proxy
would NOT close this: it protects one page render, not the browser's direct PostgREST calls.

- **Configure:** Supabase Dashboard → Authentication → Sessions → *Access token (JWT)
  expiry*. Set **900 seconds (15 minutes)** — Supabase's own recommended floor for a
  sensitive app; the default is 3600. Leave refresh-token rotation ON with a short reuse
  interval.
- **Verify (receipt):** `GET /v1/projects/{ref}/config/auth` → `jwt_exp` reads `900`.
- **Residual, accepted:** up to 15 minutes of continued access for a token stolen before
  revocation. Closing it further needs a DB-enforced session/revocation epoch checked by
  every data path — a Wave-P3 decision, not a P2 one, because it must cover the runtime
  and PostgREST, not just this app.

### 3. Invite-email template and its bearer token (review finding 9, MEDIUM)

The invite link carries a single-use `token_hash` in the URL path. **Auto-consumption is
fixed in code** — `components/invite-accept-form.tsx` no longer verifies on mount; the
person has to press "Accept invitation", the proxy sends `Referrer-Policy: no-referrer` on
`/invite/*`, and the flow ends with `router.replace("/")` so the token-bearing URL leaves
the history stack. What remains is template and log hygiene:

- **Configure:** Supabase Dashboard → Authentication → Email Templates → *Invite user*.
  The link must be `{{ .SiteURL }}/invite/{{ .TokenHash }}` (this app's route shape), never
  Supabase's default `/auth/v1/verify?token=…`. Keep the invite expiry short (≤ 24h):
  Authentication → Sessions/Email → *Email OTP expiry*.
- **Verify:** send an invite to a mailbox you control and confirm the delivered URL matches
  that shape and that opening it shows the confirmation card **without** consuming the
  token (the second open must still work until you press the button).
- **Residual, accepted:** the token still appears in the request URL, so it lands in edge
  and server access logs. Anyone with log access has a race window until the invitee
  accepts. Keep access-log retention short and restricted, and prefer re-inviting over
  re-sending a leaked link.

### Also configuration, not code

- **CDN caching.** The proxy sets `Cache-Control: private, no-store` on every gated response
  and applies the stricter headers `@supabase/ssr` supplies when it writes a session cookie.
  Do not add a Cloudflare cache rule that overrides `Cache-Control` for this app's HTML —
  a cached response carrying `Set-Cookie` signs the next visitor in as the previous one.
- **Public signup.** This app has no signup route, but that does not disable signup in the
  hosted project. Confirm Authentication → Providers → Email → *Allow new users to sign up*
  is **off**; invite-only is a product invariant, not a UI choice.
- **`__Host-` cookies need HTTPS.** `lib/supabase/cookie-options.ts` names the session
  cookie `__Host-clara-auth` with `Secure`. Chrome and Firefox accept that on
  `http://localhost`; Safari does not — develop against HTTPS if you use Safari.

## What is deliberately NOT here yet

The P2 fold has landed the full shell: Supabase SSR invite-only auth (`proxy.ts`,
`lib/supabase/`, `app/login`, `app/invite/[token]`, `app/logout`), the Clara rail/thread
surfaces (`components/clara/`), the 18-part catalog renderer (`components/parts/`,
`lib/parts/`), and `⌘K` (`components/command/`). Still absent: product data fetching and
the workbench screens — journals, documents, bank, close, reports, registers, knowledge
all build in P3. See `docs/plan/active/mohe-grill-rulings-2026-08-27.md` Q9 for the phase
plan.
