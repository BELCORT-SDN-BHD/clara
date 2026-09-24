# Wave 4 · Lane 05 · Ticket #871 — DONE

Branch `riders/w4-lane05` (worktree `C:\Users\zhant\Desktop\clara-wt\655`, database `clara_l05` at
`127.0.0.1:55745`). Base `cd2925391`. Working tree clean; nothing pushed, no PR, no GitHub write.

**Commits for this ticket** (`git log --oneline cd2925391..HEAD`, newest first; the six below
`a1f8f7295` are #933's, already landed by the ticket before me):

```
0d119de80 docs(db): #871 the operator ceremony that provisions the invite-preview credential
6502fece9 test(web): #871 the credential-holding reader is reachable only from the server
bb4ee097d test(web): #871 the prop and JSX censuses admit the server-read preview, deliberately
6cdc0d580 feat(web): #871 the invite landing page previews the firm and role before sign-in
2947bb72b feat(runtime): #871 the invite-preview pool and its pre-session courier route
a1f8f7295 feat(db): #871 the signed-out invite preview door, its role pair and its own rate wall
```

**Migration:** `packages/db/migrations/0309_invite_preview_public_door.sql` — applied to
`clara_l05` (ledger now **290 files / `0309_invite_preview_public_door`**). Applied ONCE, on the
first-apply branch; `CLARA_MIGRATION_REDO` was **not** used.

## The contract I built to

`gh issue view 871 --comments`. The ticket body's Agent Brief ("a server route on the existing
service-key courier pattern") is SUPERSEDED by the newest comment, **"Owner's ruling (2026-09-23)
and the re-brief"**, which is what this build implements: a server-only SECURITY DEFINER read in
schema `clara`, callable only by a new NOLOGIN group role no client credential is a member of, on
the auth-wall pattern (0163). Verified live on the branch before building: `clara.preview_invite`
is still `clara_authenticated`-only, `grep -rn service_role packages/db/migrations` still returns
nothing, and the wave-2 stop report (`reports/wave2-lane10-ticket871.md`) still describes the
estate accurately.

## Seams (WORK-ORDER rule 4 — written before the first test)

| # | Seam | Where its cells live |
|---|---|---|
| S1 | `clara.preview_invite_by_token(p_token text, p_origin_digest bytea)`, driven through `set role clara_invite_preview` — the only principal that may call it | `packages/db/tests/invite-preview-public.test.mjs` |
| S2 | The grant boundary on the live catalog: who may EXECUTE, who may not, whether the role pair carries a credential | same file |
| S3 | `clara.firm_invites_visible`, driven as a real admin session — the INDEPENDENT source of truth for the effective status in all five states | same file |
| S4 | The rate wall, driven through the door (its only entrance) and read back through `clara.invite_preview_attempts` | same file |
| S5 | `previewInviteByToken(token, originDigest)` — the runtime pool wrapper | `packages/runtime/tests/p871-invite-preview-db.test.mjs` |
| S6 | `POST /api/invite-preview` — the courier route, driven through the composed express app | same file |
| S7 | `readPublicInvitePreview({token, clientIp}, deps)` — the web server courier | `apps/web/lib/firm/invite-preview-public.test.ts` |
| S8 | `InviteAcceptForm`'s rendered behaviour at the `confirm` stage | `apps/web/components/invite-accept-signed-out-preview.test.tsx` |
| S9 | The browser walk on the mock lane | `apps/web/e2e/members-invite-walk.spec.ts` |

Red-then-green, per slice: the DB cell was red (`0309` not applied — the harness's own
`ensureReady()` applies it, and the first attempt was refused by my own tail: `#871 tail:
invite_preview_attempts is not forced-RLS (rls=t force=t)`, a `%s` spelling of a boolean) and green
after the fix; the runtime pool cell was red with `ERR_MODULE_NOT_FOUND
…/lib/invite-preview-pool.mjs`; the eight route cells were red with `ERR_MODULE_NOT_FOUND
…/src/invitePreviewRoutes.ts`; the web courier cells were red on the missing module; the four render
cells were red with "the signed-out preview block must render at the confirm stage". Each went
green against the minimal code for that slice, and each slice is its own commit.

## Acceptance criteria, each with its evidence

**AC1 — "the new door refuses EXECUTE to `clara_authenticated`, to the runtime role and to the
service credential, and only the new group role may call it."** ✅
`p871.grant.only_the_group` (GREEN): the EXACT ACL TEXT, grantor included, is
`clara_fn_owner=X/clara_fn_owner,clara_invite_preview=X/clara_fn_owner`, with owner
`clara_fn_owner`, `prosecdef = true` and `search_path=clara, pg_temp`; a seventeen-role roster
(`clara_authenticated`, `clara_runtime`, `clara_runtime_login`, `clara_agent_ro`,
`clara_agent_read_login`, `clara_freeform_ro`, `clara_freeform_login`, the four wake roles and
their two shells, `clara_stripe_webhook`(+`_login`), `clara_auth_wall`(+`_login`)) is probed with
`has_function_privilege` and **every one is false**, and the cell asserts all seventeen resolve so
the probe is not vacuous. The SERVICE CREDENTIAL: Supabase's platform roles do not exist on this
rig (`anon`, `authenticated`, `service_role`, `authenticator` → `(none)`, asserted), so the cell
says so and rests that half on the ACL TEXT — two entries, neither of them `service_role` — rather
than on a probe that would pass silently against a role that is not there. The migration's own §D.T2
runs the same roster plus the four platform names behind a `to_regrole` guard, so on hosted the
probe is live. `p871.grant.credential_less` proves the only members are
`clara_invite_preview ← clara_invite_preview_login ← postgres`.

**AC2 — "returns firm name, role, effective status and masked e-mail for a live token, and the
identical single refusal for an unknown, expired and revoked token."** ✅
`p871.door.open` (GREEN): `{outcome:"preview", firm_name, role, status, masked_email}` for a live
pending invite, the mask asserted against the fixture's own address computed independently
(`${local[0]}***@${domain}`), the full address asserted absent, and the key set asserted CLOSED
(five keys, no sixth). `p871.door.no_oracle` (GREEN): an invented token, an EXPIRED invite, a
REVOKED invite and an ALREADY-ACCEPTED invite are compared with `assert.deepEqual` against each
other — all four are `{outcome:"not_previewable"}`, byte for byte — and none of the four probes
moved a row. `p871.door.open` (second cell) proves the read mints nothing: no `clara.users` row, no
membership, no `op_receipts` row, invite still `pending`.

**AC3 — "the status the door reports equals the roster's and the signed-in preview's for the same
invite in every one of the five states."** ✅ — and this AC and AC2 meet at a line this estate had
already drawn; the reconciliation is stated rather than hidden. `p871.door.five_states` (GREEN)
builds ONE invite in each of the five effective states (`pending`, `expired`, `revoked`,
`accepted`, `issuer_lapsed`) through the real doors, reads `clara.firm_invites_visible` as the
OWNER for each (the independent source of truth), asserts the roster actually produced all five in
order — otherwise the comparison would be vacuous — and then asserts agreement: for the two OPEN
statuses the door reports the roster's own string verbatim; for the three that mean "there is
nothing left to accept" the door gives the single refusal, which is what the 2026-09-23 ruling
requires ("a wrong, expired, revoked or unknown token gets one and the same answer"). The cell then
re-promotes the demoted issuer and shows BOTH surfaces return to `pending`, which is a property of
the SHARED expression rather than of either reader. The derivation itself is pinned two ways: the
migration's §D.T7 asserts, on the live catalog and whitespace-normalised, that the same CASE
expression is present in `clara.preview_invite`'s body AND in the new one (and raises "the two reads
have FORKED" if the signed-in body ever loses it), and `p871.derivation` re-asserts it from the test
side with a MUTATED-string vacuity control. The signed-in preview shares the expression with the
roster already (0269), so agreement with one is agreement with both.

**AC4 — "a runtime cell proves the route needs the courier's pepper and trusted header and is
rate-walled like the auth-wall routes."** ✅
`p871rt.route.trusted_header` (GREEN): an ABSENT header and a header carrying a non-IP string each
answer 503 `{outcome:"unavailable"}` and leave ZERO attempt rows — the call never reaches the door.
`p871rt.route.pepper` (GREEN): with `CLARA_RATE_WALL_PEPPER` deleted the same request is 503 with
nothing counted, and with the pepper restored the identical request is 200 — so the cell proves the
PEPPER's absence rather than a broken fixture. `p871rt.route.bearer` (GREEN): no bearer, a wrong
bearer and a near-miss bearer are each 401 and spend nobody's budget.
`p871rt.route.rate_wall` (GREEN): five reads from one address are served, the sixth is 429 with
`Retry-After` carrying the same integer as the body, inside the door's own `[0,900]` clamp — and a
FRESH address does not buy a sixth read of the same link, because the wall has two limbs.

On "like the auth-wall routes" rather than "by the auth wall's own door" — a deliberate, measured
divergence from one sentence of the brief, stated plainly. The brief says "rate-limited by the
estate's existing entry rate wall". The first cut of the migration did exactly that (calling
`clara.claim_confirmation_attempt` with the token digest in the e-mail limb) and it was rejected on
`0163`'s own header: that table IS the applicant's five OTP guesses, and its counting predicate
excludes `'accepted'`. So routing previews through it either settles them `'rejected'` — five
invite-link loads would lock out every signup behind that address for fifteen minutes — or settles
them `'accepted'`, which removes the row from both windows and leaves the preview unwalled. A wall
that cannot both hold and stay honest is not the wall to reuse; its SHAPE is, and 0309 copies it
exactly (two limbs, a 15-minute window, a ceiling of 5, advisory locks in numeric order, each limb's
own wait computed independently with 0163's `>= 4` guard and the MAXIMUM advertised, clamped to
`[0,900]`) over its own evidence table. The two budgets stay independent on purpose. Recorded in
0309's header, in `packages/db/README.md`'s 0309 section and here.

**AC5 — "a browser walk on the mock lane opens an invite link signed out, sees the preview, and
proceeds to sign-in."** ✅ Two new cells in `apps/web/e2e/members-invite-walk.spec.ts`, run on my
triple (`https://127.0.0.1:3540 / 3541 / 3542`): `#871: a SIGNED-OUT visitor sees the firm, the role
and the masked address before signing in — and the browser never touches the preview endpoint`
(opens `/invite/:token?ct=…` cold, with no `signIn`, asserts the region, the firm, `Bookkeeper`, the
mask, the ABSENCE of the unmasked address, that no password field exists yet, that the block
precedes the control in real document order, that the browser made ZERO requests to
`/api/invite-preview` — the read is the server's — and then clicks through and sees the password
field appear); and `#871: a signed-out visitor whose invitation is closed sees no preview and no
verdict`. `7 passed (16.4s)`, all five pre-existing cells included.

**AC6 — "the migration applies from scratch and on a populated database; the operator provisioning
step for the credential is written in the release runbook the way the auth wall's was."** ✅ / ⚠️
*Populated:* applied to `clara_l05`, a seeded 289-migration database carrying the lane's own rows
and #933's work — clean apply, tail notice printed, ledger 290. *From scratch:* the file has ONE
branch. Its §0 prestate refuses to apply if the function, the table or either role already exists,
so there is no "already live" arm for a redo to take and no bimodal sha branch to hide (the wave-3
addendum's hazard does not arise here); the branch I exercised IS the first-apply branch. The
from-scratch chain stays lawful w.r.t. 0154's cluster role census, and that is proven rather than
argued — see "0154 and the from-scratch chain" below. A true end-to-end from-scratch replay on a
disposable cluster is the integrator's step, and I did not run one (see **Unverified**). *The
operator step:* written below under **Release runbook step (#871)**, and shipped as a reviewed
ceremony file, `packages/db/deploy/invite-preview-login-ceremony.sql`, on
`read-logins-ceremony.sql`'s own shape.

## 0154 and the from-scratch chain, proven

`p871.grant.from_scratch` (GREEN) proves the two premises the argument rests on, from the corpus
itself rather than from prose: (a) exactly ONE migration file mints `clara_invite_preview` /
`clara_invite_preview_login`, and it is `0309_invite_preview_public_door.sql`, whose number is above
154; (b) `packages/db/scripts/migrate.mjs` sorts migrations by `a.num - b.num`, so at the moment
0154's `count(*) from pg_roles where rolname like 'clara%' <> 14` census runs, a role minted at 0309
does not exist. The cell then reads the live cluster: **20** `clara%` roles, and 0309's own §0/§D
assert 18 before and exactly +2 after.

The #867 cluster-REUSE recipe grew from four post-pin roles to six and needed **no code change** —
`scripts/role-census-reset.mjs` derives its roster from the migration files themselves. Its pinned
counts were trued in the same commit: `rcr.mint` now expects the six (`…, clara_invite_preview,
clara_invite_preview_login`, tracing to `0160`/`0163`/`0309`) and `rcr.check` expects 20 live,
`minted.length = 6`, `wouldReadAfterDrop = 14`. Both GREEN.

The three roster twins the estate's own law requires, all in the same commit as the migration:
`packages/db/deploy/roles-bootstrap.sql` (`grp` + `logins`), `packages/db/tests/rig-cluster-reset.mjs`
(`CHAIN_MINTED_ROLES`, in migration order) and `packages/db/README.md`'s #867 section. The two drift
guards that enforce them — `chain-minted-roles-drift-guard.test.mjs` (which re-derives the role set
from the migration TEXT independently) and `rig-cluster-reset.mjs`'s own module-load check — are
GREEN, including their mutant panel.

## Migration 0309 — prestate pins, MEASURED on `clara_l05` at 289 files / `0295_wave4_chart_rows`

The integrator should read this list for a pin another lane may recut.

| signature | `sha256(prosrc)` |
|---|---|
| `clara.preview_invite(text)` | `01e729e01f0e7e1ce8cb98ca3710fd505d248d9ea34569fca1aead142b7531f4` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
| `clara.accept_invite(text,text,text)` | `42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2` |
| `clara.invite_member(text,text,text)` | `809d29ed4d702a7672931497a953ae0a66387b412597c5150b92d541ccc2636c` |
| `clara.revoke_invite(uuid,text)` | `2943909c1ee1a324d2fd6c986026b86f1aa43e6d3410f92fdcdb6727ae9220f3` |
| `clara.claim_confirmation_attempt(bytea,bytea)` | `6cd4d9bffd7816b14db4fb27dbf443421777332374c07a5ef9416cf55a8d18d5` |
| `clara._tf_append_only()` | `160e47b6659868d98163ee8cde1f851e6b8e6d344439a321a42c32fdd161fbf6` |
| `clara._tf_no_truncate()` | `e64ba9f6b93ba56d2752b095bae361dc4a3f0baf63e841e7c81f1b631c68eea8` |

Plus, not a `prosrc` pin: `sha256(pg_get_viewdef('clara.firm_invites_visible', true))` =
`eca579ad0c1d04503ee798f72b813513cc0df378f464d0103e19d6a703f13f92`; the `clara.firm_invites` column
list; `clara.preview_invite`'s exact ACL text; and the cluster `clara%` role count of 18.
**0309 RECUTS NO BODY** — every pin above is a neighbour it relies on, and §D re-measures all of
them after the change, so the file proves it changed none of them.

## What landed

**Database** (`0309`, 653 lines):
`clara.preview_invite_by_token(text, bytea)` — SECURITY DEFINER, `clara_fn_owner`,
`search_path = clara, pg_temp`; `clara_invite_preview` (NOLOGIN group, one EXECUTE, zero relation
privilege) and `clara_invite_preview_login` (NOLOGIN shell, member of it, granted to `postgres` for
rig SET ROLE only); `clara.invite_preview_attempts` (token hash, peppered origin digest, timestamp —
forced RLS, one owner policy, append-only + no-truncate, no application grant).

Two design points a reviewer will want stated:

1. **Every outcome is RETURNED, not raised**, and that is a measured constraint rather than a style
   choice: this door counts its own attempts in a table, and `raise exception` aborts the
   transaction and rolls that row back — a raising refusal would make the wall vacuous and
   enumeration free. `clara.claim_confirmation_attempt` answers `allowed:false` for the same
   reason. The only two exceptions are caller-side input-shape facts that depend on no invite and no
   window (`a token is required`, `a digest is required`, both CLR10), driven by `p871.wall.digests`,
   which also proves neither leaves an attempt behind.
2. **The preview is returned only for an OPEN invite** (`pending` / `issuer_lapsed` — this estate's
   own `INVITE_PREVIEW_NON_BLOCKING_STATUSES`, and #872's owner ruling), because the 2026-09-23
   ruling puts expired and revoked behind the single refusal. See AC3 for how that meets "the same
   five-state answer".

**Runtime:** `packages/runtime/lib/invite-preview-pool.mjs` (the eighth lane: one frozen statement,
a mechanised SQL census, SET ROLE on every checkout, the P4 rollback/reset/destroy discipline, lazy
DSN with a boot WARN) and `packages/runtime/src/invitePreviewRoutes.ts` (`POST /api/invite-preview`
on the auth-wall courier pattern: the shared `CLARA_AUTH_WALL_SERVICE_TOKEN` bearer IMPORTED from
`authWallRoutes.ts` rather than re-spelled, the trusted client-IP header, the peppered digest, no
cookie, **no GET entrance** so a live token never lands in a URL or a `Referer`). Mapping:
`preview` → 200, `not_previewable` → **404 with one identical body**, `rate_limited` → 429 with
`Retry-After`, everything else → 503. An unreadable receipt joins the 404 deliberately rather than
becoming a fourth fact a caller could tell apart. The lane joins `LANE_ROSTER` as LAZY, so `/ready`
names it.

**Web:** `apps/web/lib/firm/invite-preview-public.ts` (a SERVER-ONLY courier on
`confirmation-wall.ts`'s shape; holds no database credential and makes no PostgREST call; the invite
token travels in the BODY) and the page reads it and passes four masked fields down as a prop. The
form renders the block above the control that consumes the link. The firm/role/masked-address list
both previews render is now ONE component (`InvitePreviewFacts`), so the mask, the role vocabulary
and the labels cannot drift between the signed-out and the signed-in block.

**A product decision, recorded because it is one:** a FAILED signed-out read renders **nothing** —
not even an "we couldn't check" line, and never a verdict. There is nothing for a person to do about
it at that point, the sign-in step is unchanged either way, and a signed-out surface that announced
"this invitation is not valid" would be a SECOND place that blocks an invitation. The
post-verification preview already owns that, with a reader whose address `clara.preview_invite` has
checked. Pinned by `p871.web.signed_out: every failed read renders NOTHING extra…` and by the
second browser cell.

## Gates, with counts

| Gate | Command | Result |
|---|---|---|
| DB battery, FULL gate chain | `node --test --test-concurrency=1 $GATES tests/invite-preview-public.test.mjs` (packages/db, 107 `--import` gate modules) | **12 pass, 0 fail, 0 skipped** |
| DB, the gates a new SQL function owes + the roster guards + the neighbour battery | same chain + `operation-census.test.mjs rig-isolation.test.mjs role-census-reset.test.mjs chain-minted-roles-drift-guard.test.mjs preview-invite.test.mjs` | **76 tests, 75 pass, 0 fail, 1 skipped** (the skip is T19 poison-role: "destructive (drops schema clara); set `CLARA_RIG_ALLOW_RESET=1`" — the reset flags were never set, per RIG.md) |
| Runtime, the files I added or touched | `node --test tests/p871-invite-preview-db.test.mjs tests/l9-pool-contract-lane-probe.test.mjs tests/ready.test.mjs tests/c5-auth-wall-db.test.mjs` | **68 pass, 0 fail, 0 skipped** |
| Runtime, frozen manifest | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| Runtime, parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| Web, WHOLE unit suite | `node scripts/run-tests.mjs` (apps/web) | **5020 tests, 5018 pass, 0 fail, 2 skipped** |
| Web, browser walk I touched | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3540 CLARA_E2E_NEXT_PORT=3541 CLARA_E2E_RUNTIME_PORT=3542 pnpm --filter @clara/web e2e members-invite` | **7 passed (16.4s)** — the five pre-existing cells plus my two |
| Web, the three shipped guards | `node scripts/check-message-keys.mjs` / `check-test-manifest.mjs` / `check-public-key.mjs` | 4393 keys resolve · 520 files listed, alphabetical, each once · public-key guard unchanged |
| Typecheck | `pnpm typecheck` (worktree root) | exit 0 |
| Lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root) | exit 0 |

The whole web suite was RED once, at `tests/invite-verification.test.ts` — its closed-world census
of `InviteAcceptForm`'s props and of the JSX the page writes. That is the cell working: a new prop
is supposed to be a decision. Both were trued with the reason stated where the census reads
(`signedOutPreview` is an ANSWER — four masked fields read on the server — never an input, and can
name no OTP purpose), and the suite is green.

No known Windows-only red was hit; none was "fixed".

## Docs, in the same commits

- `packages/db/README.md`: a new `## 0309` section (the question in plain words, what landed, why
  every refusal is returned, why its own evidence table, the shared derivation, the role census, the
  12-cell battery), plus the #867 section trued from four roles/18 to six/20.
- `packages/db/deploy/roles-bootstrap.sql`: both roles in `grp`/`logins` and the header census.
- `packages/db/deploy/invite-preview-login-ceremony.sql`: NEW — the operator ceremony.
- `packages/runtime/README.md`: the eighth lane in the DSN table, and the module beside the others.
- `apps/web/README.md`: the "pre-authentication preview is a NAMED RESIDUAL" paragraph is now
  CLOSED, naming what replaced its false premise.
- `CONTEXT.md`: **Signed-out invite preview** (house "term / _Avoid_" shape), inserted at the sorted
  position beside **Invitation** and **Issuer lapsed**.

## Release runbook step (#871) — for the wave-4 runbook

> ### N. `clara_invite_preview_login`: the out-of-band credential ceremony (#871, migration 0309)
>
> **When.** AFTER the migrate step has applied `0309_invite_preview_public_door.sql` to hosted and
> BEFORE the runtime image is released (the route answers 503 until the DSN exists, so the order is
> not fatal — but a released image that cannot serve the invite landing page's preview is a window
> with an avoidable hole in it). It is the same shape and the same position the auth wall's own
> ceremony took at the Wave-G reset: 0163 ships `clara_auth_wall`/`_login` NOLOGIN and the operator
> flips the shell and supplies `CLARA_AUTH_WALL_DATABASE_URL` out of band.
>
> **Why there is a step at all.** 0309 creates BOTH roles `NOLOGIN` and password-less, and its own
> tail RAISES if either carries `rolcanlogin`. No credential can arrive by migration, by design, so
> exactly one exists and it is created here.
>
> **N.1 — the role ceremony.** In a PRIVATE session, as a superuser/owner on the live project:
>
> ```sh
> psql "<the hosted admin DSN>" -f packages/db/deploy/invite-preview-login-ceremony.sql
> ```
>
> It `\prompt`s for the password (nothing is committed, nothing is in argv), flips
> `clara_invite_preview_login` to LOGIN, normalises the privilege bits under the superuser split
> 0002 §1 requires, and ABORTS if the group role itself ever carries LOGIN. Then eyeball its five
> verification reads. The two that matter:
>
> - read (3) prints the login shell's WHOLE effective EXECUTE surface in schema `clara`. **Expect
>   exactly one row: `preview_invite_by_token | p_token text, p_origin_digest bytea`.** Measured on
>   the lane rig; anything else means the grant matrix drifted.
> - read (4) must print ZERO table grants and `direct_clara_usage = f` for the shell.
>
> **N.2 — the smoke, out of band** (psql cannot authenticate inline from `-f`):
>
> ```sh
> psql "<the new DSN>" -c "set role clara_invite_preview; \
>   select clara.preview_invite_by_token('not-a-real-token', decode(repeat('00',32),'hex'));"
> ```
>
> **Expect `{"outcome":"not_previewable"}`.** That one line proves the whole chain — authenticate →
> SET ROLE → EXECUTE → the wall counted it — with no real token and nothing disclosed. Measured on
> the lane rig, verbatim.
>
> **N.3 — the secret.** ONE new Fly secret on `clara-runtime`, and nothing on the Worker:
>
> ```sh
> flyctl secrets set --app clara-runtime \
>   CLARA_INVITE_PREVIEW_DATABASE_URL="postgres://clara_invite_preview_login:<pw>@<pooler host>:<port>/<db>?sslmode=verify-full&sslrootcert=<CA path in the image>"
> ```
>
> Same DSN shape, pooler host and CA pinning as `CLARA_AUTH_WALL_DATABASE_URL` (the runtime's
> `assertLaneDsnTlsPosture` refuses a DSN that pins a CA and cannot read it, and WARNs loudly on a
> production DSN that pins none). **`apps/web` needs no new secret**: the route is gated on
> `CLARA_AUTH_WALL_SERVICE_TOKEN`, which the Worker already holds, and the web app never holds a
> database credential for this lane. Setting a secret restarts the machine; fold it into the
> existing release restart rather than adding a second one.
>
> **N.4 — the boot check.** After the runtime is released, the startup log must NOT carry
>
> ```
> [clara-runtime] CLARA_INVITE_PREVIEW_DATABASE_URL not set: the signed-out invite-preview lane is DORMANT.
> ```
>
> and `/ready`'s `checks.pools` must carry the lane `invite_preview` with `ok: true` rather than
> `skipped: true, reason: "dsn_not_configured"` (`lib/lane-probe.mjs`; the lane is LAZY, exactly as
> the two checkout lanes are, so a missing DSN degrades rather than failing readiness). The
> end-to-end confirmation is the invite landing page itself: open a live invite link SIGNED OUT and
> see the firm and role render above the Continue control.
>
> **Rollback.** Unsetting `CLARA_INVITE_PREVIEW_DATABASE_URL` returns the lane to dormant: the route
> answers 503, the courier's outcome is indefinite, and the invite landing page renders exactly as
> it did before this wave. Nothing else on the journey depends on it.

## Successor contract

**None owed.** #871 touches no frozen workflow body and no module in a frozen closure — the whole
build is a migration, a runtime lane + route, and a server component's read.
`node scripts/check-frozen-workflows.mjs` is clean (312 frozen files, no manifest diff) and
`check-parts-parity.mjs` is OK. Nothing here needs to reach `chatTurn_v22` / `claraWork_v6`.

## Follow-ups worth filing

1. **Retention for both pre-session attempt tables.** `clara.invite_preview_attempts` and
   `clara.confirmation_attempts` (0163) are both append-only with NO sweep, so each grows forever.
   One small lane could give both a retention job (nothing older than the 15-minute window is ever
   read). Recorded in 0309's header rather than invented inside this ticket.
2. **The auth-wall service token now gates three pre-session routes.** Sharing it is deliberate (one
   value for the operator to rotate) but it is worth a line in the ops notes that rotating it now
   also stops the invite preview.
3. **A per-route `Retry-After` on the web side.** The courier maps a 429 to `indefinite` and drops
   the wait; nothing renders it today. If the preview block is ever given a "try again" affordance,
   the number is already on the wire.

## Anything unverified

- **A true from-scratch chain** (0001 → 0309 on a disposable cluster) was NOT run by me: RIG.md
  forbids a second from-scratch chain on a lane cluster, and the integrator owns that proof. What I
  can state is measured: the file has exactly one branch and I exercised it; 0154's census sits 155
  files earlier and cannot see these roles; and `role-census-reset.mjs` already reports six.
- **Hosted catalog state.** I have no hosted access. The `to_regrole` guards mean §D.T2's platform
  probes (`anon`, `authenticated`, `service_role`, `authenticator`) are inert on this rig and live on
  hosted; they have therefore never been seen to FIRE. The ceremony's own reads are the hosted check.
- **The runtime test under Linux as `runner`.** Not run (the integrator's step per RIG.md). The file
  touches no spool, no Windows path and no directory left by an earlier run, and every fixture
  identifier is per-invocation unique, so I expect it to pass; that is an expectation, not a reading.
- **The rate-wall ceiling of 5 per token per fifteen minutes** is inherited from 0163 rather than
  derived from real invite-link traffic. It is deliberately SOFT (a walled preview just leaves the
  block out), but nobody has measured how often a real invitee reloads.
