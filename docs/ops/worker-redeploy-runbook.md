# The routine Worker redeploy — runbook

**Born from the 2026-09-05 ceremony's §6**, which was the first redeploy of an EXISTING
`clara-web` Worker with unchanged secrets. Until then the only precedent was the FS-10 cutover
as-run — a *first* deploy (new Worker, six secrets from scratch), heavier than this case needs.

> **Why this is not in `apps/web/README.md`, where it belongs.** That file is **514 lines**, already
> over the repo's 500-line write ceiling, so no edit to it can land without tripping the hook. Fold
> this in when the README is next split. A Known-issues row in `PROGRESS.md` carries the same note.

## Tooling — read this first, it has bitten twice

wrangler 4 needs **node ≥ 22**, and this repo's `node_modules` carries
**`@cloudflare/workerd-windows-64`**. Consequences, both proven live:

- **Windows cannot run wrangler** (node is v20.19.5 there).
- **WSL cannot run it *from this checkout* either** — the workerd binary is the wrong platform.

So: **log in and drive wrangler from a STANDALONE install under WSL, outside the repo.**

```sh
mkdir -p /tmp/wr && cd /tmp/wr
PATH=/opt/node/bin:/usr/bin:/bin npx -y wrangler@4 login    # browser OAuth — the OWNER's act
PATH=/opt/node/bin:/usr/bin:/bin npx -y wrangler@4 whoami   # must name the owner's account
```

Credentials land in "/home/runner/.config/.wrangler/config/default.toml" and are picked up by any
wrangler run as that user — including the one inside the build clone.

## 1 · Baseline, before changing anything

```sh
npx wrangler deployments list --name clara-web   # THE instrument: what is promoted, at what %
npx wrangler secret list --name clara-web        # NAMES only, never values — expect six
```

> **`wrangler versions list` does NOT answer "what is promoted".** It returns the version HISTORY
> with no deployment percentage, so reading its top entry as the live one is a guess.
> **`deployments list` is the instrument.** Record the current version id — it is the rollback
> target.

Expect **six secret names** (`CLARA_AUTH_WALL_SERVICE_TOKEN`, `CLARA_RATE_WALL_PEPPER`,
`INVITE_MAIL_FROM`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and **four
vars** from `apps/web/wrangler.jsonc` (`CLARA_PUBLIC_ORIGINS`, `CLARA_RUNTIME_URL`,
`CLARA_STRIPE_LIVEMODE`, `CLARA_TRUSTED_CLIENT_IP_HEADER`). If a secret needs to change, stage it
with `wrangler versions secret put` and re-upload — never a bare `secret put` mid-window.

## 2 · Build, in a WSL clone with its own install

```sh
git clone --no-checkout /mnt/c/…/clara-rebuild /home/runner/clara-web-build
cd /home/runner/clara-web-build && git checkout --detach <tip>
PATH=/opt/node/bin:$PATH pnpm install --frozen-lockfile
PATH=/opt/node/bin:$PATH pnpm --filter @clara/web cf:build
```

Confirm the clone installed **`@cloudflare+workerd-linux-64`**, not the Windows package. Expect
**exit 0** and ".open-next/worker.js" — the thin entry, ~2,278 bytes.

**The build needs the `NEXT_PUBLIC_*` values, and ONLY those.** `apps/web/scripts/check-public-key.mjs`
refuses to build without `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and refuses anything that is not a
publishable key or a JWT whose decoded role is positively `anon`. Copy **only** the
`NEXT_PUBLIC_*` lines into the clone's `.env.local` (plus `CLARA_BUILD_SHA`): those are inlined
into the browser bundle and therefore public by construction. **Never copy the secret lines** —
they are Worker secrets, already in Cloudflare, and the build does not need them.

`NEXT_PUBLIC_CLARA_RUNTIME_URL` being empty is **correct**: the same-origin proxy reads the
server-side `CLARA_RUNTIME_URL` at request time, and a baked browser URL was removed deliberately.

## 3 · Upload, then CHECK THE SECRETS BEFORE PROMOTING

```sh
npx wrangler versions upload
npx wrangler versions view <new-version-id>     # ← do not skip this
```

**This check is not optional, and FS-10 is why.** That cutover's version H carried **five** secrets
instead of six and was therefore not promotable; the defect was caught by reading the version
rather than assuming secrets are inherited. **Count the secret names on the new version and refuse
to promote unless all six are present.**

## 4 · Promote, then prove the BYTES changed

```sh
npx wrangler versions deploy <new-version-id>@100% --yes
npx wrangler deployments list --name clara-web   # the new id at 100%
```

**A deployment record saying a version is live is not proof the bytes changed.** Pull a
content-hashed chunk path out of the served HTML and confirm it exists in the artifact just built:

```sh
curl -s https://app.clarabook.com/login | grep -oE '/_next/static/chunks/[A-Za-z0-9_.-]+\.js' | head -3
```

Content-hashed filenames match only if the content matches. Cheap extra positives:
`/favicon.ico` and `/icon.png` → 200; `/` → 307; `/login` → 200.

## 5 · Smoke, and rollback

Walk the 裁-86 journey in a signed-in browser: firm home → a client home → Journals → Documents →
Bank → Close → a chat turn → the session list → sign out, reading console and network at each stop.

**Pick a discriminating check** — something that behaves differently on the old build, so a pass
proves the new bundle reached the browser rather than merely that the page loaded. On 2026-09-05
that was **Enter-to-send**, which did nothing on the previous Worker.

**Rollback: `wrangler versions deploy <previous-version-id>@100% --yes`.** There is no repoint
rollback; a broken Worker is fixed FORWARD by re-promoting a walked version (裁-156).
