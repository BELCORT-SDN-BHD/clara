# Runtime deploy v71 — chatTurn_v17 + C-5's routes, as-run (2026-09-03)

**Outcome: DEPLOYED.** `clara-runtime` machine `48ee715b763048` went **VERSION 70 → 71**
(release v71, `tools@belcort.com`) at **12:51 MYT 2026-09-03**, run by the lead as the owner's
delegate (**ADR-0075 §(3)**, digest law 82, mirrored as **AGENTS.md hard constraint 14**) from
merged main `344f7ad8` (#511 merged 12:46 MYT) with:

```sh
fly deploy --config packages/runtime/fly.toml --remote-only --yes
```

This ships the registry repoint to **`chatTurn_v17`** (pinned by #485, merged 2026-09-02) — first
time it is *served*, not just pinned — and #511's Stripe webhook route, the checkout-pools
applier belt, the trusted-client-IP courier, and the one A-M3 auth-wall confirm endpoint. No
migration rides this deploy and no secret rides with it; the runtime's registry pin was already
one deploy stale (`packages/runtime/README.md`'s "SERVING … v16" lines, corrected below).

## 1 · What shipped

- `packages/runtime/workflows/registry.ts:86` → `chatTurn: chatTurn_v17`.
- `packages/runtime/src/index.ts` mounts `stripeWebhookRoutes` (`:64`) and `authWallRoutes`
  (`:65`) above `express.json()` (`:67`) — both routers are live on every request from the moment
  the machine starts, independent of whether their secrets are configured.
- No DB migration, no quiesce window, no secret change. The webhook signing secret and the rest
  of C-5's nine env names are the **owner's** act, after this deploy, env-to-env (Fly secrets),
  never through this session.

## 2 · Preconditions — positive reads, each with its instrument

1. **Merge state.** `#511` merged to `main` at `344f7ad8` (`gh pr view` / `git log`).
2. **Build proof before deploy.** `pnpm --filter @clara/runtime build` exit 0. Local bundle proof
   (before the remote build, on this host, commit `344f7ad8`): the built bundle at
   packages/runtime/.output/server/index.mjs (build output, untracked) —
   **8,772,097 bytes**, sha256 `4582a5ca…`. Binary-safe grep of the built file (`grep -ac` for
   matching lines, `grep -oa | wc -l` for occurrences — plain `grep -c`/`grep -o` misclassify
   this file as binary and undercount, which is where an earlier pass's arithmetically
   impossible "×7 occurrences vs ×9 lines" came from; occurrence count can never be lower than
   line count — corrected in §7 and §9, deviation #3): `chatTurn_v17` **9 lines / 14
   occurrences**; the Stripe-webhook and auth-wall-confirm routes, `auth_wall_unconfigured`,
   `signing_secret_absent`, `CLARA_STRIPE_LIVEMODE` all present.
3. **Freeze manifest, pre-deploy.** `node scripts/check-frozen-workflows.mjs --compare-base
   origin/main` → OK, 233 entries same hash/deployed flag, 0 additions — the manifest was
   untouched going into the deploy (the deploy-lock stamps are this PR's own act, after the
   deploy — see §7 below, not part of this precondition).
4. **Rollback preflight**, read through the CA-pinned bridge against the LIVE `workflow.workflow_runs`
   table (`docs/ops/dsn-bridge.md`; never `sslmode=no-verify`; DSN from env only, never printed):
   `select name, count(*) from workflow.workflow_runs where status not in ('completed','failed','cancelled')
   group by name;` → **ZERO rows**, read at **12:13 MYT** (baseline) and re-read at **12:48 MYT**,
   immediately before the 12:49 launch. Rolling forward strands nothing; a rollback to v70 would
   have stranded nothing either, as of both reads.
5. **Secrets gap, by name.** `fly secrets list -a clara-runtime` carries 19 names; **none** of
   C-5's nine names (`STRIPE_WEBHOOK_SECRET`, `CLARA_STRIPE_LIVEMODE`,
   `CLARA_TRUSTED_CLIENT_IP_HEADER`, `CLARA_RATE_WALL_PEPPER`,
   `CLARA_AUTH_WALL_SERVICE_TOKEN`, `CLARA_SUPABASE_URL`, `CLARA_SUPABASE_ANON_KEY`,
   `CLARA_STRIPE_WEBHOOK_DATABASE_URL`, `CLARA_AUTH_WALL_DATABASE_URL`) is present. Every one of
   them is fail-closed **per request**, never at boot (both routers mount unconditionally above
   `express.json()`), so the image ships safely with the gap total — the routes refuse everything
   until the owner's ceremony sets them.

## 3 · The act

`fly deploy --config packages/runtime/fly.toml --remote-only --yes`, launched 12:49 MYT. The
build prints three `ERROR failed to read input source map … @ai-sdk/*/dist/index.js.map` lines —
**non-fatal**: the identical three lines print on the local build of the same commit, which exits
0 (measured 12:50). Rolling update of the **same** machine `48ee715b763048` (no replacement, so
`docs/ops/runtime-hard-restart.md` §1's zombie-pooler-session step is not triggered by shape).
**12:51 MYT — deploy complete.**

## 4 · Reads after — each with its instrument

- `fly status -a clara-runtime` → `48ee715b763048`, **VERSION 71**, region `sin`, state
  `started`, checks **2/2**, updated `2026-09-03T04:51:44Z`.
- `fly releases -a clara-runtime` → v71 complete, `tools@belcort.com`.
- `GET /health` → **200**.
- `GET /ready` → `ready: true` on these **eight of the fifteen** consumer checks —
  `checks.db`, `checks.world`, `checks.control`, `checks.taxonomy`, `checks.relay`,
  `checks.matcher`, `checks.autodraft`, `checks.wakeEngine` — all `ok` (the other seven —
  `localFacts`, `sstWatch`, `factsGate`, `classify`, `wikiProjection`, `intake`, `storage` — are
  also `ok`, not separately narrated here). `ready: true` carries two `warnings` alongside it:
  `held_outbox` 119 and the wake-engine lag (see §6 below for the wakeEngine detail); both are a
  standing, pre-existing state, not new from this deploy.
- **Served bundle**, read-only `fly ssh console` grep of the served bundle at
  /app/.output/server/index.mjs on the machine (a container path, untracked),
  binary-safe (`grep -ac` / `grep -oa | wc -l`), read at **13:52 MYT** by the lead:
  `chatTurn_v17` **9 lines / 14 occurrences**, the Stripe-webhook route **2 lines / 2
  occurrences** — identical counts to the local build in §2. **The served bundle is NOT the
  same artifact as the local build**, though: it is **8,772,597 bytes**, sha256 `5dbbbaff…`,
  against the local build's 8,772,097 bytes, sha256 `4582a5ca…` — 500 bytes larger, a different
  hash, from the remote `--remote-only` depot build of the same commit. The workflow-identifying
  content is byte-for-byte identical on the strings that matter (the counts above), but the two
  bundles are two distinct artifacts, not one counted two ways (corrected here from an earlier,
  false "same artifact" claim — see §9, deviation #3). The deploy-lock's own hashes are
  unaffected either way: they golden-hash each workflow file's **source**, never a built bundle.
- **C-5's two routes on an empty JSON POST**: the Stripe-webhook route → HTTP **503**;
  the auth-wall-confirm route → HTTP **503**. Fail-closed per request, no 200, no 500 — the
  documented posture with the checkout-gate DSNs absent by design (see §5, below).

## 5 · What is NOT proven by this deploy

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
  substitute for the round trip. This re-sequencing is registered in §9, deviation #1.

## 6 · Sessions after the restart, and the wakeEngine re-read

**Instrument: the lead's direct read at ~12:53–12:55 MYT; instrument line not recorded.**
Every other read in this document names the exact query or command that produced it; this one
does not — no bridge invocation or query text for this specific pair of reads survives in the
repo or the scratchpad, so per 裁-112 (honesty over completeness) the numbers below stand as the
lead's own direct report, not as an independently re-runnable instrument line.

Sessions after the restart: 11 clara sessions, all `clara_runtime_login`, all idle; oldest idle
9 s at 12:53; zero idle older than 120 s at 12:55 — no stale sessions from the pre-deploy
process; the same 11 as before the deploy (the 12:13 and 12:48 reads in §2 item 4, both of which
DO carry an instrument line).

wakeEngine lag 20842 / heldForDisabledSource 119 unchanged across two reads 20 s apart — a
STANDING state (both `wake_engine_sources` disabled by design, PR-4's), `ok: true`; not a
deploy regression.

## 7 · Frozen-workflows stamp — the deploy-lock is 7 of 7

**The census.** At `#470` (`4b0b2f00`, the v16 ceremony) the manifest held 226 entries, zero
undeployed. Seven entries were added since: five `chatTurn.v17.*` closure files, plus two more
that arrived with `#463` (`d1ab91d0`, merged 2026-08-31T18:56Z) — `clientOnboarding.v4.ts` and
`interview.v3.questions.ts`. **v71 is the first image that contains all seven** (no deploy ran
between v70 and v71). This ceremony's commit(s) lock **all seven**, not five: the sentence "in
the `#470` pattern" is now literally true — the `#470` pattern is `--lock-deployed`, every
undeployed entry, and that is what ran here.

`node scripts/check-frozen-workflows.mjs --lock-deployed` on the reviewed tip: `locked 2
newly-deployed entr(ies); every manifest entry is now deploy-locked` — `frozen-workflows.json`
4 insertions, 2 deletions, exactly `clientOnboarding.v4.ts` and `interview.v3.questions.ts` (the
five `chatTurn.v17.*` entries were already locked by this PR's earlier commit). The bare gate
after: `OK — 233 frozen file(s) verified … append-only vs origin/main`, exit 0; zero hashes
moved on any of the 233 entries, zero note changes — a pure `absent → true` flip on exactly those
two entries, nothing else.

**Registered deviation — a healing, not a scope call (§9, deviation #2).** The first cut of
this PR stamped only the five `chatTurn.v17.*` entries and left the other two undeployed, on the
stated grounds that "two (`clientOnboarding.v4.ts`, `interview.v3.questions.ts`) are not part of
this deploy and must stay undeployed." **That sentence was false**: both files are in the v71
image. `rev-531`'s review proved it two ways, and this fold adds a third: (1) grepping the local
rebuild, binary-safe (`grep -ac`/`grep -oa`): `clientOnboarding_v4` **8 lines / 13 occurrences**,
`CLIENT_SEGMENTS_V3` **2 lines / 2 occurrences**, the 裁-23 Q9 v3-only question wording present
(supersedes an earlier non-binary-safe pass that undercounted both — §9, deviation #3);
(2) executing the shipped gate: a body edit to a newly-stamped v17 file is **REJECTED**
(`REHASHED-VS-BASE`, exit 1), while the same edit to `clientOnboarding.v4.ts` — the **LIVE
registry pin** at `packages/runtime/workflows/registry.ts:129` — was **ACCEPTED**, exit 0; and
(3) **a direct positive read of the SERVED artifact itself**, not just an inference from an
independently-rebuilt local copy — `fly ssh console` grep of the served bundle, binary-safe,
13:52 MYT: `clientOnboarding_v4` 8 lines / 13 occurrences, `CLIENT_SEGMENTS_V3` 2 lines / 2
occurrences, identical to the local rebuild's counts even though the two bundles are distinct
artifacts (§4, §9 deviation #3). That gap — a serving, registry-pinned body left un-deploy-locked
— is exactly the bypass the deploy-lock exists to block. This fold closes it.

## 8 · Ceremony hygiene

- **Positively read and reproduced** (by the lead, and independently by `rev-531`): machine
  identity `48ee715b763048`; version 70 → 71; release `v71` / `tools@belcort.com`; `#511` merged
  `344f7ad8` at 12:46 MYT; the exact deploy command; 12:49 launch / 12:51 complete;
  `registry.ts:86` and `:616`; `index.ts:64/65/67`; the local build exit 0 with its own byte/sha
  identity (8,772,097 bytes, sha256 `4582a5ca…` — **distinct from the served bundle's**
  8,772,597 bytes, sha256 `5dbbbaff…`, §4); the pre-deploy `--compare-base origin/main` OK at
  233/0; the rollback preflight ZERO rows at both 12:13 and 12:48; 19 secret names on the app
  with none of C-5's nine; the three non-fatal source-map lines; rolling update of the same
  machine; checks 2/2 at `2026-09-03T04:51:44Z`; `/health` 200; `/ready` true; the served-bundle
  grep, read directly off the production artifact at 13:52 MYT; both C-5 routes 503 on an empty
  POST.
- **NOT proven by this ceremony** (§5): the JWT-needing checklist items — one seeded-firm chat
  turn, the SSE detach/reattach, and clarify-park-and-resume on live — none of which this
  ceremony minted a JWT to run; and the C-5 route round trip (a signed
  `checkout.session.completed` reaching `record_checkout_session` on a live id), which cannot run
  before the FS-11 Wave-G reset applies `0154`…`0164` and mints the two login roles C-5 needs.
- No secret or DSN was printed at any point; the bridge (`docs/ops/dsn-bridge.md`,
  `scripts/ops/dsn-pipe.mjs`) scrubs `PG*` and pins the CA.
- No pinned id (canary `daba7f2e`, witness `d023b48c`) was written or approved in this ceremony.
- The one soft spot named honestly rather than papered over: §6's sessions/wakeEngine numbers
  carry no instrument line (裁-112 residual, closed by disclosure here, not by inventing one).

## 9 · Deviations register

| # | Deviation | Grounds |
|---|---|---|
| 1 | **The C-5 DB half re-sequenced into the FS-11 Wave-G reset**, not run as part of this ceremony | LIVE is 148/`0153` by 裁-67; C-5's two login roles (`clara_stripe_webhook_login` minted by `0160`, `clara_auth_wall_login` minted by `0163`) do not exist on live today, so the NOLOGIN→LOGIN flips and DSN handoff cannot run before FS-11 applies `0154`…`0164`. This runtime deploy is safe ahead of that reset because every C-5 route refuses PER REQUEST, never at boot (§5, §8). |
| 2 | **The deploy-lock's first cut stamped 5 of 7, not 7 of 7, on a false sentence** | The first commit locked only the five `chatTurn.v17.*` entries and stated the other two "are not part of this deploy and must stay undeployed" — false; both shipped in v71 (`rev-531`'s bundle grep + executed-gate proof, §7). This fold runs the runbook's own `--lock-deployed` on the tip, locking all seven, with zero hash moves. |
| 3 | **The bundle-identity and grep-count claims, through `rev-531`'s review, were never a read of the SERVED artifact, and were mis-measured on the LOCAL one** | Every "8,772,097 bytes / sha256 `4582a5ca…`" and every grep count (`chatTurn_v17` ×7/×9, `clientOnboarding_v4` ×7, `CLIENT_SEGMENTS_V3` ×1) up to this fold came from the **local rebuild** on this host, asserted as if it were the served bundle's own identity — it is not: `fly ssh console`, read at 13:52 MYT, shows the served bundle at **8,772,597 bytes, sha256 `5dbbbaff…`**, 500 bytes larger. Separately, the grep counts themselves were wrong: run without `-a`, `grep` misclassifies this file as binary and undercounts, producing the arithmetically impossible "×7 occurrences vs ×9 matching lines" (occurrences can never be fewer than lines). Corrected with `grep -ac`/`grep -oa`, the counts are **identical on both the local and served artifacts** (§2, §4, §7) — nothing functional was ever wrong, but the identity claim was an unread assumption until this fold read the served bundle directly. |
