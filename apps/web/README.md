# apps/web — Clara's production frontend

**Status: P1–P3 and the whole port wave (T0–T11, 11/11) are merged on `main`.** The shell
(Supabase SSR invite-only auth, the two-level workspace chrome, the Clara rail + full-screen
thread escalation, the 22-part catalog renderer, `⌘K`) and the full P3 product workbench
(journals, documents, bank, close, reports, registers, knowledge) are landed, and the port
wave has since filled those workbenches with the ported door/read surface. Still ahead: the
**P4** firm-admin UI tranche (design of record merged, build not started) and the **P6**
polish + cutover wave. It replaces `apps/dashboard` **at cutover**, not before — see
`docs/plan/active/port-wave-plan-2026-08-28.md` for the current cutover plan
(`docs/plan/active/frontend-handoff-2026-08-23.md` §0.1 is the original at-cutover ruling).

*(Trued 2026-08-29, P-3 of `docs/plan/active/mohe-alignment-audit-2026-08-29.md`. The line
above read "the port wave's T0 seam is in flight" — last touched by the T0 seam PR itself,
with all eleven trains merging after it and none re-truing it. `apps/web/AGENTS.md` routes
every agent to this file as the full reference, so a lane grounding per the harness was
being told the shipped product did not exist.)*

## What this is

Next.js App Router, TypeScript strict, deployed to Cloudflare Workers via
`@opennextjs/cloudflare`. On `main` since the P1/P2 folds — the `frontend/web` integration
branch it was originally built on is history, not the place to look. Build order and phase
definitions: `docs/plan/active/mohe-grill-rulings-2026-08-27.md` Q9 — this scaffold is
**P1**; the shell (auth, `⌘K`, rail+thread, the part-catalog renderer) is **P2**; the
workbench screens are **P3**.

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
The screens have landed; **that ban is still owed** — see `eslint.config.mjs`, which carries
the Q4 raw-colour ban (2026-08-29) but not yet its Q5 string sibling, and the PR that landed
the colour half for the measurement of what the string half would cost.
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
app/(firm)/    — the firm shell (FirmNav + the ONE Clara rail mount + ⌘K): firm home ·
                 needs-you · clients register · activity · admin, plus the client
                 workspace (clients/[clientId]/ + its seven object tabs: journals ·
                 documents · bank · close · reports · registers · knowledge) under its
                 scope-activating layout.
app/(full)/    — the Clara full-screen escalation routes (/clara/:threadId and
                 /clients/:clientId/clara/:threadId — same URLs, route groups add no
                 segment): a viewport-owning minimal layout with NO firm chrome, plus a
                 thin scope layout so the client variant never escapes client-scope
                 activation.
app/login · app/invite/[token] · app/logout — the auth surfaces (proxy-gated).
app/api/runtime/[...path] · app/api/invite — the two SERVER-ONLY Route Handlers.
                 The runtime proxy is a scope-spine entrance (403, never a redirect);
                 the invite courier is a REGISTERED EXEMPTION from that spine
                 (`lib/require-firm-scope.ts`'s `SCOPE_EXEMPT_SURFACES`) because it
                 calls `clara.invite_member` as the caller and the DB is the wall.
                 It is also the ONLY place in this app that reads a service-role key
                 — server-side, never NEXT_PUBLIC_ (see `.env.example`).
```

*(Trued 2026-08-30 by P4-4: the block above listed no `app/api/*` handler at all, so
neither the runtime proxy nor the new invite courier had a home a reader could find.)*

Every workbench tab page mounts a real workbench: hydrate-never-trust reads through
`lib/read.ts`'s `getRows`, governed writes through `lib/doors.ts`'s `callDoor`. They landed
per-journey in P3 and were filled out by the port wave's eleven trains. *(Trued 2026-08-29,
P-3: this paragraph read "the workbench tab pages are placeholder shells".)*

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

### 3. The invite mail, and the TWO bearer factors it carries (review finding 9, MEDIUM)

**Read this before assuming the invite link is a one-secret link — it is not, and this
section used to say it was.** The wording here described a link carrying "a single-use
`token_hash`". That stopped being true on 2026-08-30, when the owner ruled option (a) and
P4-1 put Clara's own invite token in the same URL:

```
/invite/<supabase_token_hash>?ct=<clara_token>
```

The path segment is Supabase's OTP hash, consumed by `verifyOtp`. The query parameter is
Clara's own token, which `clara.accept_invite` sha256s and looks the invite up by. They are
not interchangeable and **both are required** — which is precisely why the pair matters:
anyone holding the whole URL holds everything needed to accept.

**Who sends it.** Not Supabase. `lib/members/courier.ts` calls `generateLink` (which mints
the hash and sends nothing), builds the two-secret URL itself, and posts the message through
Resend — because no Supabase email template has a variable for Clara's half, and smuggling
it through `data`/`user_metadata` would PERSIST the plaintext in `auth.users`. So the
*Invite user* template is no longer the delivery path for this flow; the link shape is
composed in code and pinned by `tests/invite-courier.test.ts`.

**Auto-consumption is fixed in code** — `components/invite-accept-form.tsx` does not verify
on mount; the person presses "Accept invitation", the proxy sends `Referrer-Policy:
no-referrer` on `/invite/*`, and the flow ends with `router.replace("/")` so the
secret-bearing URL leaves the history stack.

- **Configure:** the four server-only variables in `lib/members/invite-mail.ts`'s
  `INVITE_MAIL_ENV_NAMES` — `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `RESEND_API_KEY`, `INVITE_MAIL_FROM`. All four must be present and non-blank or the
  courier refuses 503 **before minting anything**, naming the unset variables (an invite
  whose mail cannot go out is permanently unusable AND blocks that address for seven days).
  Keep the invite expiry short (≤ 24h): Authentication → Sessions/Email → *Email OTP expiry*.
- **Verify:** send an invite to a mailbox you control, confirm the delivered URL carries both
  the `/invite/<hash>` path and the `?ct=` parameter, and confirm opening it shows the
  confirmation card **without** consuming anything (the second open must still work until
  you press the button).
- **Residual, accepted — BOTH FACTORS TRAVEL IN ONE MESSAGE.** There is no second channel.
  Consequently the whole secret sits wherever that message and that request are recorded:
  Resend's own message logs (retained by default for 30 days), any mail relay in the path,
  the recipient's mailbox, and this app's edge/server access logs — the query string lands
  in access logs exactly as the path segment does. Anyone with access to any of those has a
  race window until the invitee accepts. **This is P4-1's accepted two-token contract, not
  an oversight**; splitting the factors across channels, or adding a magiclink accept arm for
  existing accounts, is an owner P4-D decision and is recorded as an open question on
  PR #455. Mitigations that are in force today: the courier never returns either factor to a
  browser, never logs one (`lib/members/courier.ts`'s log entry type has no free-text field
  at all), and never relays a mail provider's error text — so the one process that handled
  both secrets cannot quote itself into a response or a log line. Operationally: keep
  access-log retention short and restricted, and prefer revoke-and-re-invite over re-sending
  a link you believe leaked.

**Wave-G checklist — the Resend API key.** `sending_access`, domain-restricted, message
storage OFF, team log access restricted. The first two bound what the key can do if it
leaks; the third is what stops Resend's own retained copy of the message from holding both
bearer factors for 30 days; the fourth bounds who inside the team can read what is retained
anyway.

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

The P2 fold landed the full shell: Supabase SSR invite-only auth (`proxy.ts`,
`lib/supabase/`, `app/login`, `app/invite/[token]`, `app/logout`), the Clara rail/thread
surfaces (`components/clara/`), the part-catalog renderer (`components/parts/`,
`lib/parts/`), and `⌘K` (`components/command/`). P3 and the port wave then landed product
data fetching and every workbench screen — journals, documents, bank, close, reports,
registers, knowledge.

**Still absent** (trued 2026-08-29, P-3 — this section previously listed the whole P3
workbench here, contradicting the real workbenches those routes mount):

- The **P4 firm-admin UI tranche** — firm creation, staff invite/roster, capabilities and
  the metering rollup. The design of record is merged (#376) and the DB half is live
  (`0141`, `0145`); the web build has not started.
- The **P6 polish + cutover wave** — the `chatTurn_v15` wire bump's four Q8 part kinds
  (裁-20), the WCAG 2.2 SC 2.5.8 target-size gate (裁-13), the Clara mascot (裁-14), the
  R3 focus-ring recut, and the cutover PR that retires `apps/dashboard`.
- **⌘K "Do"** — still a statically disabled row (see `lib/command/routes.ts` for Go, which
  is live and mechanically checked by `lib/command/routes.test.ts`).

See `docs/plan/active/mohe-grill-rulings-2026-08-27.md` Q9 for the phase plan and
`docs/plan/active/port-wave-plan-2026-08-28-part2.md` §8 for P6's specification.
