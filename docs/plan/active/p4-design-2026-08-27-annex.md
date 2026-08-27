# P4 design — annex

*Companion to `p4-design-2026-08-27.md`. Evidence, measurements, proposed door shapes and
the route inventory. Nothing here is a second design: where the two disagree, the main
document governs.*

---

## A · Verified byte evidence

Three claims carry the P4 design. Each was re-read by the design lane against the migration
bytes after the census lane reported it — not accepted on the census's word. All line
references are `packages/db/migrations/` at `191cdad`.

### A.1 · `create_firm`'s LIVE body is 0017, not 0004

The full chain, from `grep -rn "function clara.create_firm" migrations/`:

```
0004_governed_fns.sql:318:create function clara.create_firm(p_name text, p_admission_token uuid, p_op_key text) returns jsonb
0005_event_spine.sql:596:create or replace function clara.create_firm(p_name text, p_admission_token uuid, p_op_key text) returns jsonb
0017_wave_b.sql:2438:create or replace function clara.create_firm(
```

**0017 is LIVE.** Its head, verbatim at `0017_wave_b.sql:2438-2452`:

```sql
create or replace function clara.create_firm(
    p_name text,p_admission_token uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_plan uuid; a record; v_result jsonb;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  if not exists(select 1 from clara.users where id=v_actor) then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
```

Two things the design depends on are visible here: the `unknown actor` refusal at 2448 is
why ask 1 must precede everything, and `v_plan` is why the 0017 body returns
`{firm_id, plan_id}` rather than 0004's `{firm_id}` — it opens an `onboarding_plans`
firm-scope plan and revision 1. A screen or a core extraction written against the 0004/0005
shape drops `plan_id` silently. **This is the superseded-body class**: the same failure mode
the F-A3/PR-1b close recorded, where a CoR built from a migration's file text erased a later
migration's own patch. Any `_create_firm_core` extraction must be byte-diffed against a
pre-edit pull of the live catalog body, not against 0017's file text.

### A.2 · One active membership per user is GLOBAL

`grep -rn "uq_membership_active_user" migrations/` returns exactly two hits — the definition
and one comment in 0006. The definition and its own DDL comment, verbatim at
`0002_foundation.sql:207-222`:

```sql
-- RBAC. One ACTIVE membership per user across ALL firms (partial unique below) —
-- a removed user may re-join (design v2 §F/F21: DROP the global unique(user_id),
-- keep only the partial active one). role_rank orders viewer<bookkeeper<admin<owner.
create table clara.firm_memberships (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid        not null references clara.firms(id),
  user_id    uuid        not null references clara.users(id),
  role       text        not null check (role in ('viewer','bookkeeper','admin','owner')),
  status     text        not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
-- One active membership per user, total (one-firm-per-user for the active row).
create unique index uq_membership_active_user
  on clara.firm_memberships (user_id) where (status = 'active');
```

The index is on `(user_id)` alone, not `(user_id, firm_id)`. Three design consequences, all
in the main document: signup refuses an applicant who is already staff somewhere · a BELCORT
operator cannot hold a client-firm membership, so the operator console must ride
`is_operator` rather than a membership · re-joining is a new row, never a status flip.

### A.3 · Nothing propagates `auth.users` into `clara.users`

`grep -rn "auth\.users\|auth_users" migrations/ seeds/` over the entire data plane returns
**exactly one hit**, and it is a comment — `0002_foundation.sql:187`:

```sql
-- Global identity. On Supabase, human ids equal auth.users.id (no cross-schema FK
-- — portability). ONE global agent identity row (id fixed) is inserted below and
-- is the maker/checker principal for every wake-lane write (design v2 §C: agent
-- work is NEVER stamped as a human).
```

No trigger, no foreign-data wrapper, no sync function, no door. The equality of the two ids
is a **convention with no mechanism behind it**, deliberately (the parenthetical names
portability as the reason). This is the identity gap of the main document's §3.

*Method note, and it matters for how much weight this bears.* A.3 is an **absence** claim,
and this repo's evidence law is that absence is not evidence. It is admitted here only
because it is a closed-world search over a bounded corpus (133 files, one directory, one
schema) with the exact command recorded so it can be re-run — and because the design's
response to it is fail-closed regardless: ask 1 provisions the row whether or not some
propagation is later found, and a duplicate-safe insert is harmless if one is.

---

## B · The negative searches behind §2's nine gaps

Every gap in the main document's §2 is an absence claim. The searches that returned nothing
are recorded here so a later reader re-runs them rather than trusting the sentence. All run
from `packages/db/` over `packages/db/migrations/` unless noted.

| Gap | Searches that returned nothing (or only the noted noise) |
|---|---|
| Invite objects | `invite`, `invitation` → 3 hits, all unrelated English prose in comments (0023, 0045, 0053). `token_hash` → only `clara.document_intakes.token_hash` (0007) and its four document-intake verbs. `function clara.[a-z_]*accept` → `accept_bank_rule_suggestion` (0044, **dropped** at 0129) and `_tf_bank_agent_proposal_accept` (0121) |
| User provisioning | `create_user`, `register_user`, `upsert_user`, `provision_user` → zero hits |
| Self-serve signup | `function clara.[a-z_]*(provision\|onboard\|bootstrap\|register\|signup\|sign_up)` → only the client-onboarding plan verbs (`begin_client_onboarding`, `bootstrap_client_plan`, `commit_client_onboarding`, all 0017) and `register_export_recipient` (0132). 0002:253-254 states the posture outright: *"Fail-closed firm creation … Self-serve signup/billing is post-Slice-2."* |
| Approval queue | `pending_firm`, `firm_registration`, `registration_request`, `approve_firm`, `reject_firm` → zero hits. `approval`/`pending` over function names → only entry/report/metric/opening-balance approvals |
| Tiers | `quota` → zero. `feature_flag` → zero. `tier` → only `provenance_tier` (0009) and prose "Tier A/B". `subscription` → only event-bus subscriber prose. `entitlement` → only capital-allowance arithmetic (0041). `billing` → only prose |
| Firms columns | `add column` filtered to firms/memberships → exactly one hit, `is_operator` (0133) |
| Re-activation | `update clara.firm_memberships` → 4 hits, all inside `set_member_role` and `remove_member`; nothing sets `status` back to `active` or clears `removed_at` |
| Human-act receipt view | `human_act`, `human_receipt`, `audit_log_visible` → zero relevant hits |

---

## C · The measured contrast runs

Every number was produced by importing the shipped gate's own exported functions from
`apps/web/scripts/check-token-contrast.mjs` and resolving tokens live out of
`apps/web/app/globals.css` — the same `parseRootTokens` / `resolveTokenHex` /
`alphaBlend` / `contrastRatio` the CI gate runs. Nothing was computed by hand, and no hex
was transcribed into the probe. This is the "measure with the instrument production uses"
discipline: a hand-computed ratio would have been a second instrument, and a disagreeing one
would have been indistinguishable from a real failure.

Resolved grounds: `--identity-canvas` `#f7f6f2` · `--shell` `#f7f7f5` · `--background`
`#ffffff` · `--surface-subtle` `#f5f6f4` · `--ring` = `--focus` = `#1d4ed8`.

### C.1 · The R3 focus ring, composited (bar: 3:1, SC 1.4.11)

| ground | ring halo at 50% alpha, effective | ratio | verdict |
|---|---|---|---|
| identity-canvas | `#8aa2e5` | **2.317** | FAIL |
| shell | `#8aa3e7` | **2.310** | FAIL |
| background (white) | `#8ea7ec` | **2.363** | FAIL |
| surface-subtle | `#89a2e6` | **2.313** | FAIL |
| secondary | `#88a1e5` | **2.280** | FAIL |
| accent | `#839ee8` | **2.245** | FAIL |

The solid `--focus` treatment for comparison — cream 6.197 · shell 6.248 · white 6.702 ·
surface-subtle 6.182, all PASS. **The failure is ground-independent**; the R2 cream ground is
incidental to it.

Where a bordered primitive also swaps a solid `focus-visible:border-ring` edge, that edge's
outward neighbour is the halo rather than the ground: **2.674** (cream) · 2.704 (shell) ·
2.837 (white) · 2.672 (surface-subtle). Still under 3:1, and on any focusable element with
no border slot the halo is the only carrier at 2.31.

**Minimum alpha for the halo alone to clear 3:1**, swept 50→100%: cream **64%** · shell 64% ·
white 62% · surface-subtle 64%. Hence the main document's recommendation of a 65% alpha ring,
which clears every ground with margin while keeping R3's translucent shape.

### C.2 · Text on the R2 cream ground (bar: 4.5:1)

All pass. `foreground` 14.355 · `brand` 11.010 · `secondary-ink` 7.297 · `clara` 6.339 ·
`warning` 6.283 · `primary`/`interaction` 6.197 · `error`/`destructive` 6.079 · `success`
5.703 · **`muted-foreground` 4.636** — the tightest, and the one worth a pinned gate row.

### C.3 · Boundaries (bar: 3:1 where the boundary identifies a component)

| token | white | shell | cream | surface-subtle |
|---|---|---|---|---|
| `--input` (form field edge) | **1.728** | **1.611** | **1.598** | **1.594** |
| `--border` (panel/card edge) | 1.292 | 1.204 | 1.195 | — |

`--input` is the live AA finding. `apps/web/components/ui/input.tsx` ships `bg-transparent`, so the
field carries no fill distinguishing it from the page and the border is the sole identifier —
which puts SC 1.4.11's 3:1 squarely on it. This fails on plain white today, so it is
pre-existing on the P2 login and invite pages and on every P3 form, not introduced by P4.
`--border` on a decorative card edge is not held to 3:1 by 1.4.11 and is reported for the R2
composition decision (owner question 2), not as a violation.

### C.4 · Is the R2 ground swap visible at all?

| pair | ratio | RGB delta | max channel |
|---|---|---|---|
| identity-canvas vs **shell** | **1.0082** | (0, −1, −3) | **3** |
| identity-canvas vs surface-subtle | 1.0025 | (2, 0, −2) | 2 |
| identity-canvas vs background | 1.0814 | (−8, −9, −13) | 13 |
| shell vs background | 1.0727 | (−8, −8, −10) | 10 |

The entry pages render `bg-shell` today (both `apps/web/app/login/page.tsx` and
`apps/web/app/invite/[token]/page.tsx` use the same `min-h-dvh … bg-shell` main). Moving them to
`--identity-canvas` is a 3/255 max-channel change: imperceptible on any display. Cream reads
only against white.

---

## D · Proposed door shapes

Shapes, not implementations — each ask's own train writes the body, claims its migration
number at merge, and carries its own rig tests. Every door here is `security definer`,
`set search_path=clara,pg_temp`, takes a mandatory `p_op_key` for idempotency, and emits
`_audit` plus a domain event. Refusal codes follow the estate's existing vocabulary:
`CLR04` authority/context, `CLR09` invariant guard, `CLR10` unknown or conflicting subject,
`CLR11` cross-tenant.

**Ask 1 — identity provisioning.** `claim_identity(p_display_name text, p_op_key text)`.
The only door in the estate that must work with **no membership**, so it cannot sit behind
`_human_ctx`; its own gate is a non-null `jwt_sub()`. Inserts `clara.users(id, display_name,
email)` with `id = jwt_sub()` and **email read from the JWT claim, never an argument**.
Idempotent on re-call. Refuses `CLR04` on no actor, `CLR10` if the id exists with a different
email. Grant: `clara_authenticated`.

**Ask 2 — registration request.** `request_firm_registration(p_firm_name text, p_note text,
p_op_key text)` over a new `clara.firm_registration_requests` (id, applicant, firm_name,
note, status in open/approved/rejected, decided_by, decided_at, reason, timestamps). Refuses
`CLR09` when the actor holds an active membership anywhere (fail early on the global unique
index, per §4 A) or already has an open request. Grant: `clara_authenticated`.

**Ask 3 — invite issue.** `invite_member(p_email text, p_role text, p_op_key text)` over a
new `clara.firm_invites` (id, firm_id, email, role, token_hash, expires_at, invited_by,
status in pending/accepted/revoked/expired, timestamps). Floor `_human_ctx(role_rank
('admin'))`. Refuses `CLR10` on an unknown role or an email already active in the firm.
Stores only the token **hash**, never the token.

**Ask 4 — invite accept.** `accept_invite(p_token text, p_display_name text, p_op_key text)`.
One transaction: provision `clara.users` from `jwt_sub()` (same body as ask 1), insert the
membership at the invite's role, mark the invite accepted. **Wall: the JWT's verified email
must equal the invite's email** — `CLR04` otherwise. Also refuses `CLR09` when the invite is
expired, consumed or revoked, and `CLR09` when the actor already holds an active membership.
Grant: `clara_authenticated`.

**Ask 5 — roster read.** `clara.firm_members_visible`. Columns: membership_id, user_id,
display_name, email, role, role_rank, status, created_at, removed_at. Predicate: firm scope
via `jwt_firm()`, roster at `role_rank('bookkeeper')`, **email null-masked below
`role_rank('admin')`** — a single view with a floored column rather than two views, so a
caller cannot mistake which one they hold. Grant: `clara_authenticated` only.

**Ask 6 — invite revoke and read.** `revoke_invite(p_invite uuid, p_op_key text)` at admin
floor, plus `clara.firm_invites_visible` (never exposing `token_hash`) at admin floor.

**Ask 7 — caller context.** A read returning **one row when an active membership exists and
zero rows when not**: user_id, firm_id, firm_name, role, role_rank, is_operator. Zero rows is
the holding state's trigger and the design's fail-closed default. Grant:
`clara_authenticated`.

**Ask 8 — the approval queue.** `_create_firm_core(p_actor uuid, p_name text)` extracted from
`create_firm`'s LIVE 0017 body (see §A.1 for the byte-diff obligation), then
`approve_firm_registration(p_request uuid, p_op_key text)` and
`reject_firm_registration(p_request uuid, p_reason text, p_op_key text)`, plus an
operator-scoped read over the requests table. Authority on all three copies
`set_wake_source_enabled` (0133:284) exactly: `_human_ctx(role_rank('admin'))` **and**
`exists(select 1 from clara.firms where id = c.firm and is_operator)`, else `CLR04`.
Approval refuses `CLR09` if the applicant acquired a membership since requesting.

**Ask 9 — tier catalog.** `clara.firm_tiers` (code pk, display_name, ordinal) +
`clara.firms.tier_code` nullable FK. **No amount column** — pricing lives outside the schema
until the sitting rules it. Read granted to `clara_authenticated`.

**Ask 10 — tier assignment.** `set_firm_tier(p_firm uuid, p_tier_code text, p_reason text,
p_op_key text)`, operator-gated in beta (owner question 5).

**Ask 11 — metering floor.** Recut `get_llm_usage_summary` (LIVE 0110:706) to add
`_human_ctx(role_rank('admin'))`. Its existing `p_firm is distinct from jwt_firm()` → `CLR11`
wall stays exactly as built. This is a **live-body recut of a granted read**, so it takes the
D1 write-quiesce discipline and a pre-edit byte pull like any other.

---

## E · Route and component inventory

Proposed paths, in a fenced block because none of them exist yet:

```
apps/web/app/(entry)/                    NEW route group — owns the R2 cream ground
  layout.tsx                             the cream layout + the Ledger Fold mark (R1)
  login/page.tsx                         MOVED from app/login (URL unchanged)
  signup/page.tsx                        NEW
  invite/[token]/page.tsx                MOVED from app/invite/[token] (URL unchanged)
  pending/page.tsx                       NEW — the holding state (main doc §4 E)

apps/web/app/(firm)/admin/
  page.tsx                               EXISTS as an honest empty state; becomes the hub
  members/page.tsx                       NEW — roster, roles, invites
  registrations/page.tsx                 NEW — operator only
  tiers/page.tsx                         NEW — flag-hidden

apps/web/app/api/invite/route.ts         NEW — the server-only mail courier (§4 C)

apps/web/components/entry/               signup form, pending states, brand lockup
apps/web/components/admin/               roster table, role control, invite dialog,
                                         registrations queue, tier panel, price placeholder
```

Route-group moves keep every URL byte-identical (a group adds no segment), so `apps/web/proxy.ts`'s
`PUBLIC_PATH_PREFIXES` needs only `/signup` appended — `"/login"` and `"/invite"` keep
matching. `apps/web/tests/proxy-matcher.test.ts`'s asserted set extends with it.

**Primitives to vendor (R4, build-on-demand).** Present today in `apps/web/components/ui/`:
badge, button, card, command, dialog, input-group, input, label, select, separator, table,
textarea. P4 needs, and must vendor via the shadcn CLI with `dark:` classes stripped and both
gates passing in the same PR: **Tabs** (admin hub sections — or reuse the hand-rolled
`apps/web/components/common/section-tabs.tsx`, which already exists and may make Tabs unnecessary),
**DropdownMenu** (the row-level role/remove menu), **Switch** (the tier flag, if the
flag surfaces in-app), **Form** + **RadioGroup** (tier selection). Avatar is **not** needed —
the roster shows names, and `users_visible` carries no avatar.

**⌘K.** `apps/web/lib/command/routes.ts` gains the new admin routes. Note the file's existing
drift: most entries are marked `status: "planned"` while their pages exist on disk (admin
included). The file's own header says to re-derive the manifest from the live `apps/web/app/` tree
once P3's pages landed rather than hand-patch it — P4 should do that re-derivation rather
than add three more hand-maintained rows to a stale table.

**i18n.** Four new namespaces (Signup, Pending, Members, Registrations) plus additions to
Admin. Note that the hardcoded-string lint gate **does not exist yet** — `apps/web/i18n/request.ts`'s
comment describes an intended future gate, and the root `eslint.config.mjs` has no i18n or
literal-string rule. Every P4 string still routes through next-intl by house law; the gate
that would enforce it is a separate, unbuilt item.

---

## F · The gate rows to add

`PAIR_SPECS` in `apps/web/scripts/check-token-contrast.mjs` is a closed-world array whose
spec signature already passes a `composite(fgToken, alpha, overHex)` helper — the existing
`destructive-on-destructive-10` row uses it. **No schema change is needed.** The idiom to
follow, verbatim from the shipped file:

```js
{ id: "destructive-on-destructive-10", fg: (h) => h("destructive"),
  bg: (h, composite) => composite("destructive", 0.10, h("background")), threshold: 4.5,
  source: "..." },
```

So a composited focus-ring row takes this shape (shown for cream; repeat for shell,
background, surface-subtle, secondary, accent):

```js
{ id: "focus-ring-composited-on-identity-canvas",
  fg: (h, composite) => composite("ring", 0.50, h("identity-canvas")),
  bg: (h) => h("identity-canvas"), threshold: 3,
  source: "the shadcn idiom's ring-ring/50 halo (components/ui/{button,input,textarea,select,badge}.tsx) over the (entry) route group's cream ground" },
```

**The alpha in those rows is the decision, not a detail.** At `0.50` all six fail (§C.1); at
`0.65` all six pass. Whichever the owner rules on question 3 is the number that goes in, and
the rows should be added **after** that ruling — adding them at 0.50 would put CI red on a
question that is the owner's to answer, and adding them at 0.65 before the components change
would assert a composition that is not what ships.

Rows to add regardless of question 3: the ten cream text pairs from §C.2 at threshold 4.5,
and — if question 4 is taken — `input-on-background`, `input-on-card`, `input-on-shell` and
`input-on-identity-canvas` at threshold 3, which go in **with** the `--input` token change,
never before it.

**A note for whoever writes these rows.** Every existing spec's `source` string names the
real files that render the pair, and the gate is only as honest as those strings — a row
whose source is aspirational makes the gate assert a composition nothing renders. Write the
source after the component exists, not from the design.

**And a defect this pass found, independent of P4.** The two existing focus rows,
`focus-ring-on-background` and `focus-ring-on-shell`, both use `fg: (h) => h("focus")` — the
**solid** token — and their `source` strings cite only the base `:focus-visible { outline: …
solid var(--focus) }` rule. Nine components render the translucent idiom instead and no pair
measures it. The gate is green on focus because it is measuring the treatment that is not
there. That blind spot predates P4 and should be recorded as a known issue whether or not P4
proceeds.
