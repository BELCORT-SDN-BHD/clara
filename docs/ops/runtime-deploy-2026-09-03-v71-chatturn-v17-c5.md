# Runtime deploy v71 — chatTurn_v17 + C-5's routes, as-run (2026-09-03)

**Outcome: DEPLOYED.** `clara-runtime` machine `48ee715b763048` went **VERSION 70 → 71**
(release v71, `tools@belcort.com`) at **12:51 MYT 2026-09-03**, run by the lead as the owner's
delegate from merged main `344f7ad8` (#511 merged 12:46 MYT) with:

```sh
fly deploy --config packages/runtime/fly.toml --remote-only --yes
```

This ships the registry repoint to **`chatTurn_v17`** (pinned by #485, merged 2026-09-02) — first
time it is *served*, not just pinned — and #511's Stripe webhook route, the checkout-pools
applier belt, the trusted-client-IP courier, and the one A-M3 auth-wall confirm endpoint. No
migration rides this deploy and no secret rides with it; the runtime's registry pin was already
one deploy stale (`packages/runtime/README.md`'s "SERVING … v16" lines, corrected below).

## What shipped

- `packages/runtime/workflows/registry.ts:86` → `chatTurn: chatTurn_v17`.
- `packages/runtime/src/index.ts` mounts `stripeWebhookRoutes` (`:64`) and `authWallRoutes`
  (`:65`) above `express.json()` (`:67`) — both routers are live on every request from the moment
  the machine starts, independent of whether their secrets are configured.
- No DB migration, no quiesce window, no secret change. The webhook signing secret and the rest
  of C-5's nine env names are the **owner's** act, after this deploy, env-to-env (Fly secrets),
  never through this session.

## Preconditions — positive reads, each with its instrument

1. **Merge state.** `#511` merged to `main` at `344f7ad8` (`gh pr view` / `git log`).
2. **Build proof before deploy.** `pnpm --filter @clara/runtime build` exit 0. Local bundle proof
   (before the remote build): `.output/server/index.mjs` — **8,772,097 bytes**, sha256
   `4582a5ca…`; grep of the built file: `chatTurn_v17` ×7, `/api/stripe/webhook`,
   `/api/auth-wall/confirm`, `auth_wall_unconfigured`, `signing_secret_absent`,
   `CLARA_STRIPE_LIVEMODE` all present.
3. **Freeze manifest, pre-deploy.** `node scripts/check-frozen-workflows.mjs --compare-base
   origin/main` → OK, 233 entries same hash/deployed flag, 0 additions — the manifest was
   untouched going into the deploy (the v17 closure's `deployed: true` stamps are this PR's own
   act, after the deploy — see "Frozen-workflows stamp" below, not part of this precondition).
4. **Rollback preflight**, read through the CA-pinned bridge against the LIVE `workflow.workflow_runs`
   table (`docs/ops/dsn-bridge.md`; never `sslmode=no-verify`; DSN from env only, never printed):
   `select name, count(*) from workflow.workflow_runs where status not in ('completed','failed','cancelled')
   group by name;` → **ZERO rows**, read once before the deploy and again at deploy time. Rolling
   forward strands nothing; a rollback to v70 would have stranded nothing either, as of both reads.
5. **Secrets gap, by name.** `fly secrets list -a clara-runtime` carries 19 names; **none** of
   C-5's nine names (`STRIPE_WEBHOOK_SECRET`, `CLARA_STRIPE_LIVEMODE`,
   `CLARA_TRUSTED_CLIENT_IP_HEADER`, `CLARA_RATE_WALL_PEPPER`,
   `CLARA_AUTH_WALL_SERVICE_TOKEN`, `CLARA_SUPABASE_URL`, `CLARA_SUPABASE_ANON_KEY`,
   `CLARA_STRIPE_WEBHOOK_DATABASE_URL`, `CLARA_AUTH_WALL_DATABASE_URL`) is present. Every one of
   them is fail-closed **per request**, never at boot (both routers mount unconditionally above
   `express.json()`), so the image ships safely with the gap total — the routes refuse everything
   until the owner's ceremony sets them.

## The act

`fly deploy --config packages/runtime/fly.toml --remote-only --yes`, launched 12:49 MYT. The
build prints three `ERROR failed to read input source map … @ai-sdk/*/dist/index.js.map` lines —
**non-fatal**: the identical three lines print on the local build of the same commit, which exits
0 (measured 12:50). Rolling update of the **same** machine `48ee715b763048` (no replacement, so
`docs/ops/runtime-hard-restart.md` §1's zombie-pooler-session step is not triggered by shape).
**12:51 MYT — deploy complete.**

## Reads after — each with its instrument

- `fly status -a clara-runtime` → `48ee715b763048`, **VERSION 71**, region `sin`, state
  `started`, checks **2/2**, updated `2026-09-03T04:51:44Z`.
- `fly releases -a clara-runtime` → v71 complete, `tools@belcort.com`.
- `GET /health` → **200**.
- `GET /ready` → `ready: true`; `checks.db`, `checks.world`, `checks.control`,
  `checks.taxonomy`, `checks.relay`, `checks.matcher`, `checks.autodraft`, `checks.wakeEngine`
  all `ok` (held_outbox 119, pending_intents 0, dead letters 0).
- **Served bundle**, read-only `fly ssh console` grep of `/app/.output/server/index.mjs`:
  `chatTurn_v17` ×9, `/api/stripe/webhook` ×2 — the registry pin is what actually shipped, not
  just what the registry file said.
- **C-5's two routes on an empty JSON POST**: `/api/stripe/webhook` → HTTP **503**;
  `/api/auth-wall/confirm` → HTTP **503**. Fail-closed per request, no 200, no 500 — the
  documented posture with the checkout-gate DSNs absent by design (see "What is NOT proven for
  the DB half," below).
- **Rollback preflight, re-read at deploy time** (12:48 MYT, i.e. immediately before the act):
  still **ZERO** non-terminal `workflow.workflow_runs` rows.

## What is NOT proven by this deploy

- **First-deploy checklist item 2** (`packages/runtime/README.md` "First-deploy verification
  checklist") — one seeded-firm chat turn (`POST /api/chat/:sessionId/turns` with a valid JWT →
  202 → `completed` with typed parts and non-zero usage) — **NOT run**. It needs a valid JWT this
  ceremony did not mint; `/ready`'s world/relay/consumer checks are the evidence the world came up,
  not a proof the chat loop itself completed a turn on v17.
- **Items 3 and 4** of the same checklist (SSE detach/reattach; clarify-park-and-resume on live) —
  **NOT run**, for the same reason.
- **The C-5 route round trip** (a signed `checkout.session.completed` reaching
  `record_checkout_session` on a live id) cannot be proven yet at all: **LIVE is 148/`0153`** by
  裁-67, and C-5's two login roles — `clara_stripe_webhook_login` (minted by migration `0160`) and
  `clara_auth_wall_login` (minted by migration `0163`) — do not exist on live today. The DB half
  of the C-5 ceremony (the two NOLOGIN→LOGIN flips + DSNs through the bridge) sits **inside the
  FS-11 Wave-G reset** (backup → factory reset → apply `0154`…`0164` → seed → `is_operator` →
  the `stripe_object_map` OPS act), not this deploy. The 503s read above are the correct,
  fail-closed evidence that the routes are live and safe to ship ahead of that reset — not a
  substitute for the round trip.

## Sessions after the restart

sessions after the restart: <the lead's read>

## Frozen-workflows stamp

The v17 closure's five manifest entries are stamped `"deployed": true` in this same PR, in the
`#470` (`4b0b2f00`) pattern — see that commit's own record for the precedent shape. Full detail
of which entries, and the additions-only-check finding, is this PR's own commit; nothing further
to prove here beyond what that commit records.
