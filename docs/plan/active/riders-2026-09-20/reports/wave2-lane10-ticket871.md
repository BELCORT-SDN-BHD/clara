# Wave 2 · Lane 10 · Ticket #871 — STOPPED (needs a migration the plan did not reserve)

Branch: `riders/w2-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`
was empty at start (first ticket in the lane) and is still empty now — **no commits made, no files
changed, no migration applied.** `git status` in the worktree is clean.

## Ticket

#871 "Signed-out invite preview has no route" — Agent Brief (ready-for-agent), owner-confirmed
2026-09-18: build a server route that lets an invitee who has not signed in see the firm name,
role, effective status and masked email an invite token names, before they start the sign-in flow.
Key interfaces line: "A new server route on the existing service-key courier pattern; no new
client-reachable database grant." Expected migration: **none** (`README.md`'s lane table: `#871
(none)`).

## Why this stops here

The brief's own technical premise — that this is buildable as a pure application-layer route with
**zero** new database privilege of any kind — does not hold. I verified this on evidence, not
assumption, along five independent lines:

1. **The data does not exist anywhere the service key can already reach.** Firm name, role,
   status and the invite's real email live only in `clara.firm_invites` /
   `clara.firm_invites_visible` (Postgres, schema `clara`). The only "service key" pattern that
   exists anywhere in `apps/web` today is `apps/web/lib/members/invite-mail.ts`, and it uses
   `SUPABASE_SERVICE_ROLE_KEY` **exclusively** for Supabase's GoTrue Admin Auth API
   (`auth.admin.listUsers`, `auth.admin.generateLink`) — never for a PostgREST data call. GoTrue's
   `auth.users` carries no firm/role data (confirmed against the current
   `/admin/generate_link` OpenAPI spec via Context7: the endpoint accepts only `data, email,
   new_email, password, redirect_to, type` — no metadata is ever attached at invite-send time, and
   `invite-mail.ts`'s own header explains why a `data` payload was deliberately rejected). So "the
   existing service-key courier pattern" cannot itself answer the question this ticket asks.

2. **`clara.preview_invite` (0224) cannot be called signed-out, and its own migration says why the
   fix is not a grant.** `packages/db/migrations/0224_preview_invite.sql` §B (lines 240–244):
   > "ONE grantee: `clara_authenticated`. There is no `anon` role in this estate ... so 'signed
   > out' cannot reach this door at all — which is why a signed-out preview is a named residual
   > needing a server route, **not a wider grant**."

   That line is about not widening *this* function's own ACL (`{clara_fn_owner,
   clara_authenticated}`, asserted byte-exact in §C) — it does not, and cannot, make a brand-new
   read route free. And the function's own body requires **two** facts together
   (`clara._jwt_email() = inv.email`, gated on `clara.jwt_sub()` being non-null) — a signed-out
   caller can supply neither. Minting a real session for the invited address first, to satisfy
   that check, is circular: the address is exactly the fact a signed-out reader does not have, and
   is exactly what this door exists to keep from leaking to anyone who has not proven it.

3. **`service_role` has zero privilege on schema `clara`, confirmed three ways:**
   - Migration 0001 creates the schema with nothing else: `create schema if not exists clara;` —
     no accompanying `GRANT ... TO service_role`.
   - Every grant in the whole migration tree is enumerated by name; `grep -rn "service_role"
     packages/db/migrations` returns **zero** matches across all 234 files. No migration has ever
     granted `service_role` anything on `clara.*`.
   - Current official Supabase docs (Context7, `/supabase/supabase`,
     `guides/api/using-custom-schemas.mdx`, fetched this session) are explicit that exposing a
     **custom** schema to `service_role` (exactly this estate's shape — `clara` is not `public`)
     needs its own `GRANT USAGE ON SCHEMA … TO anon, authenticated, service_role;` plus
     `GRANT ALL ON ALL ROUTINES/TABLES IN SCHEMA … TO …` — access is **not** automatic just because
     the key is a service key. Supabase's own "Bypassing RLS" doc (same query) confirms
     `service_role`'s privilege is `BYPASSRLS`, a row-security bypass — not a grant bypass. A
     PostgREST call against `clara.preview_invite` or `clara.firm_invites` with the service-role
     bearer would be refused for want of a grant, not admitted by the key's own authority.
   - This also matches the estate's own prior, recorded ruling on the identical question:
     `docs/plan/active/refresh-wave-2026-09-14/brief-620.md` (line 16, line 22) explicitly
     **disqualifies** the service-role key from being the estate's mechanism for privileged data
     access ("refuses `anon`/`authenticated`/`service_role` as the role"; vendor citation
     "Bypassing RLS ... service role disqualified"). #871's brief would be the first ticket in this
     codebase to reverse that ruling, silently, with no owner sign-off in front of it.

4. **`apps/web` has no other channel to the database.** It has no `pg` dependency and no direct
   Postgres connection anywhere (`packages/db` and `packages/runtime` are the only workspaces that
   import `pg`, or hold `JWT_SECRET`/`*_LOGIN` credentials, e.g. `clara_auth_wall_login`,
   `clara_runtime_login`). The one existing precedent for a genuinely pre-session, signed-out,
   privileged DB check — `clara_auth_wall` / `clara_auth_wall_login` (migration `0163`, reached
   from `packages/runtime`, bearer-shared via `CLARA_AUTH_WALL_SERVICE_TOKEN`) — is itself a
   migration-minted role with its own login shell, invoked from the *runtime*, not from `apps/web`
   directly. Reusing that shape for #871 would still be a new migration (a new function + a new
   grant on a role reachable only by a genuine server credential), just with a different name.

5. **I verified the lane's own rig has none of the Supabase platform roles at all**, so there is no
   way to even *rehearse* a service-role PostgREST call in this environment:
   `select rolname from pg_roles where rolname in ('anon','authenticated','service_role',
   'supabase_admin','authenticator','postgres')` on `127.0.0.1:55750/clara_l10` returns only
   `postgres`. This is consistent with the rig being a bare Postgres cluster for migration/DB-test
   purposes (RIG.md), not a full Supabase stack — but it also means any implementation that
   depended on `service_role` reaching `clara.*` could not be proven true or false on this rig
   either; it would only surface as a live-release surprise.

None of this is a claim that the feature is unbuildable — it is a claim that it needs exactly what
`brief-620` and `0224`'s own comment gesture at and stop short of: a new, narrowly-scoped,
**non-client-reachable** door (its own role, its own grant, its own migration), not a wider grant
on an existing one and not a repurposing of the mail courier's Admin-API-only credential. That is
real DDL, and per the work order's addendum this ticket does not carry a reserved number for it
(`README.md`: `#871 (none)`) — "numbers are pre-assigned," so I am not free to invent one.

## What I did not do

- No file was created, edited, or deleted in the worktree.
- No migration was applied to `clara_l10` (still at 229 files / `0234_legal_enforcement_mode`,
  matching the lane's starting prestate — confirmed by the `pg_roles` probe above, which is the
  only query I ran against the database; it was read-only).
- No commit was made on `riders/w2-lane10`.
- Nothing was pushed; no GitHub issue was commented on or closed.

## Acceptance criteria — none attempted

All four are blocked on the same missing seam (a governed, signed-out-reachable read of the
invite), so none has a red-first cell to show:

- [ ] route returns firm name/role/status/masked email for a live token, signed out — **not
      attempted**, no reachable data source.
- [ ] route never returns plaintext token or unmasked email — **not attempted**.
- [ ] invalid/expired/revoked token gets the same no-oracle refusal — **not attempted**.
- [ ] service key proven absent from the browser bundle — **not attempted** (this half is
      mechanically easy — the existing `scripts/check-public-key.mjs` pattern generalizes — but
      proving it for a route with nothing behind it yet would be theatre).

## Gates

Not run: nothing changed. `pnpm typecheck` / `pnpm lint` were not invoked because there is no diff
for them to check, and running them idle would not be evidence of anything for this ticket.

## Docs

None touched.

## Successor contract

None — no frozen chat/Work-tool surface is implicated by this ticket.

## Recommendation / follow-up for the orchestrator

Two real options, named honestly rather than picked for the lane:

- **(a) Reserve a migration number and re-issue #871** with a brief that names the new function
  (e.g. `clara.preview_invite_by_token(p_token text)` — token-only authorization, matching the
  owner's already-settled disclosure posture that token possession alone is sufficient for this
  view) and the new, non-client-reachable role/credential the server route assumes to call it
  (mirroring the `clara_auth_wall` shape: a NOLOGIN group role + a login shell, reached over a
  direct connection from a service that holds one, analogous to how `CLARA_AUTH_WALL_SERVICE_TOKEN`
  lets `apps/web` prove a request came from itself to `packages/runtime`). This is a small, well-
  precedented migration, not a redesign.
- **(b) Rule explicitly that the service-role key may bypass grants for this one read**, reversing
  `brief-620`'s recorded disqualification — an owner-level call, not an implementer's, given how
  deliberately that ruling was written and cited elsewhere.

I did not pick between them; both are DDL-shaped or ruling-shaped decisions outside this ticket's
authorized scope ("no migration expected... stop and say why").

## Unverified

- Whether a real, hosted Supabase project for this estate has ever granted `service_role` anything
  on schema `clara` out of band (outside the migration tree) — I have no access to hosted catalog
  state from this lane, and nothing in the repo's docs (including the hosted-release reports I
  could find) records such a grant. Treated as absent because nothing checkable says otherwise.
- Whether option (a)'s exact role shape is what the owner would choose — named as the closest
  in-repo precedent, not asserted as the only correct design.
