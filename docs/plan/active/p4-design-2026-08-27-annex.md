# P4 design — annex

*Companion to `p4-design-2026-08-27.md`: the evidence, the measurements and the proposed door
shapes. The frontend execution half — routes, primitives, gate rows, battery, R2/R3 detail —
split out to `p4-design-2026-08-27-annex-2.md` at this file's 500-line ceiling. Nothing in
either is a second design: where an annex and the design disagree, the design governs.*

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

**The alpha sweep, over all six grounds the design proposes to gate.** An earlier draft of
this annex swept only four and recommended 65%; that was a real defect — the design adds six
rows, so the sweep has to cover six, and `accent` (the ground a `bg-accent` chip is drawn on)
is the binding one. Ratios of the composited halo against its own ground:

| alpha | cream | shell | white | surface-subtle | secondary | accent |
|---|---|---|---|---|---|---|
| 50% | 2.317 | 2.310 | 2.363 | 2.313 | 2.280 | 2.245 |
| 62% | 2.917 | 2.936 | **3.029** | 2.911 | 2.871 | 2.802 |
| 64% | 3.059 | 3.051 | 3.146 | 3.046 | 3.005 | 2.906 |
| **65%** | 3.099 | 3.119 | 3.215 | 3.086 | 3.044 | **2.970 FAIL** |
| **66%** | 3.168 | 3.188 | 3.292 | 3.161 | 3.118 | **3.037** |
| **70%** | 3.443 | 3.433 | 3.574 | 3.435 | 3.351 | **3.270** |

Minimum integer alpha clearing 3:1 per ground: white 62% · cream, shell, surface-subtle and
secondary 64% · **accent 66%**. So **65% fails outright** (accent 2.970) and 66% passes by
0.037 — a margin narrower than the rounding in most colour pickers, and one an `--accent`
retune would erase without anyone connecting the two. **70% is the recommendation**: it clears
all six with a minimum margin of **0.270** on accent, and leaves headroom for a token change.

The general lesson, recorded because it cost a review round: **the sweep must cover exactly
the population the gate will measure.** A number handed to the owner that reds CI after he
approves it is worse than no number.

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

The entry pages rendered `bg-shell` when this annex was written (both then-`apps/web/app/login/
page.tsx` and then-`apps/web/app/invite/[token]/page.tsx` used the same `min-h-dvh … bg-shell`
main). Moving them to `--identity-canvas` is a 3/255 max-channel change: imperceptible on any
display. Cream reads only against white.

**LANDED 2026-08-30 (P4-3), and the paths moved with it.** Both pages are now leaves of the
`(entry)` route group — `apps/web/app/(entry)/login/page.tsx` and
`apps/web/app/(entry)/invite/[token]/page.tsx` — and neither carries a ground of its own any
more: `apps/web/app/(entry)/layout.tsx` renders the single `bg-identity-canvas` main for all
four faces, with 裁-2 4a's shadow card edge. A route group adds no URL segment, so /login and
/invite/:token are byte-identical; `apps/web/tests/firm-scope-surfaces.test.ts` asserts that
from the tree. The measurement above is unchanged and was re-run with the production instrument
on the P4-3 branch — see the ten `*-on-identity-canvas` rows now pinned in
`apps/web/scripts/check-token-contrast.mjs`. *(The old paths are spelled un-backticked above on
purpose: they no longer resolve, and the harness-links gate reads a backticked path as a file
reference — it caught this very edit.)*

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
One transaction, entirely through the two cores below. **Wall: the JWT's verified email must
equal the invite's email** — `CLR04` otherwise. Also refuses `CLR09` when the invite is
expired, consumed or revoked. Grant: `clara_authenticated`.

### D.1 · `_add_member_core` — the membership-minting core

`add_member`'s live body (0005:677-705) is the only membership writer in the estate today, and
it carries walls that a second, hand-written writer would silently lack. The extraction moves
them into `_add_member_core(p_firm uuid, p_actor uuid, p_user uuid, p_role text)`, which
**both** `add_member` and `accept_invite` enter. Split:

| in the CORE (both entrances get them) | at the ENTRANCE (differs per door) |
|---|---|
| `perform 1 from clara.firms where id = p_firm for update` — per-firm serialization (v2 §F/F18) | the authority check: `_human_ctx(role_rank('admin'))` for `add_member`; the invite's own email wall for `accept_invite` |
| `role_rank(p_role) is null` → `CLR10` bad role | `p_firm is distinct from c.firm` → `CLR11` (`add_member` only — `accept_invite` takes the firm from the invite row) |
| user exists in `clara.users` → else `CLR10` | `_reserve_op` / `_finish_op`, **under the entrance's own verb string** |
| **`is_agent` → `CLR10` "the agent identity cannot be a firm member" (HIGH-11)** | the op_key non-blank check |
| already-active-membership → `CLR10` (the global unique index) | the audit action string |
| the INSERT, and `_append_event(..., 'member.added', ...)` | |

**Which side the receipt lives on, stated so the table cannot be read two ways.** An earlier
draft of this table listed the event in both columns, which is the same defect F3 fixed one
level up: an ambiguous replacement spec lets a builder drop a wall and still believe they
followed the design. The rule is **the audit string names the DOOR, the domain event names the
FACT**. So `_audit` sits at the ENTRANCE — its action string is `add_member` or
`accept_invite`, whichever door the human actually walked — while `_append_event(...,
'member.added', ...)` sits in the CORE, because the fact recorded is identical either way: a
person became a member of a firm. A consumer of the event spine must not have to know which
door produced a membership, and an auditor reading `audit_log` must never lose which one did.

**Why the agent-identity refusal is the one that matters most here.** `accept_invite` is
reached with an emailed token by someone who is not yet a member of anything — the closest
thing in the estate to an unauthenticated write path. A membership writer on that path without
the HIGH-11 wall would be the single route by which the global agent identity could be made a
firm member, which every wake-lane authority check downstream assumes is impossible. The core
carries it; no entrance may skip it.

**Why `_reserve_op` stays at the entrance.** It is keyed by verb name, and the audit row must
name the act the human actually performed. `accept_invite` reserving under `'add_member'`
would make the receipt lie about which door was walked.

### D.2 · `_claim_identity_core` — the identity-minting core

`_claim_identity_core(p_actor uuid, p_display_name text, p_email text)` inserts the
`clara.users` row, idempotent on re-call, refusing `CLR10` if the id exists with a different
email. Entrances: `claim_identity` (email from the caller's own JWT claim) and `accept_invite`
(email from the JWT, **already proven equal to the invite's**). No entrance accepts an email
as a plain argument from the client.

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
`set_wake_source_enabled` (0133:288-291) exactly: **`_human_ctx(clara.role_rank('owner'))`**
**and** `exists(select 1 from clara.firms where id = c.firm and is_operator)`, else `CLR04`.
The floor is **owner**, not admin — 0133's own comment calls owner rank "necessary but not
sufficient" before adding the operator predicate.

### D.3 · `_create_firm_core` — the full pre/post-condition split

`_create_firm_core(p_actor uuid, p_name text) returns jsonb`, extracted from the LIVE 0017
body (§A.1 carries the byte-diff obligation). Which guard sits where is the whole point of the
extraction, so it is enumerated rather than implied:

**In the CORE** — every one of these must hold whichever entrance calls it:

- `p_actor` is non-null and **exists in `clara.users`** → else `CLR04` "unknown actor".
- **`p_actor` is not the agent identity** (`is_agent`) → else `CLR04`. *This one is load-bearing
  for ask 8 specifically: with it in the core, `approve_firm_registration` structurally cannot
  mint an agent-owned firm no matter what a request row contains.*
- `p_actor` holds **no active membership anywhere** → else `CLR10` (the global unique index).
- `p_name` is non-blank → else `CLR10`.
- Inserts `clara.firms`, then `clara.firm_memberships(firm_id, p_actor, 'owner')`.
- Opens the `onboarding_plans` firm-scope plan **and revision 1** — the behaviour 0017 added
  over 0005, and the reason the return shape is `{firm_id, plan_id}`, not `{firm_id}`.
- Returns `{firm_id, plan_id}`.

**At the `create_firm` ENTRANCE** (unchanged from today):

- `p_actor := clara.jwt_sub()`, non-null → else `CLR04`.
- `select … from clara.firm_admissions where token = p_admission_token **for update**`; the row
  must exist and be unconsumed. **The replay-return stays here** — when `consumed_op_key`
  matches, it returns `consumed_result` verbatim without re-entering the core. That idempotency
  lives on the token row because a firm-scoped `op_receipt` cannot exist before the firm does
  (0017:702-712, `ck_firm_admissions_consumed_receipt_0017`).
  > **Pre-hardening history, superseded by the hash-only bearer-token migration (裁-16b).** The
  > `where token = p_admission_token` spelling above is what 0145 shipped and is kept here as the
  > record of what P4 tranche-2 was designed against. `clara.firm_admissions.token` no longer
  > exists: the hardening-batch Migration B converts the table to `token_hash bytea` (NOT NULL,
  > unique) with a surrogate `id` primary key, and the entrance now reads
  > `where token_hash = sha256(convert_to(p_admission_token::text, 'UTF8'))`. Everything else in
  > this bullet — the `FOR UPDATE` lock, the replay-return, and where they live — is unchanged;
  > only the compared column moved. `create_firm`'s signature is unchanged, so every caller still
  > hands the same plaintext uuid it always did.
- Stamps `consumed_at` / `consumed_op_key` / `consumed_result` — re-keyed by 裁-16b onto the
  locked row's surrogate `id` (`where id = a.id`), the same row this bullet's `FOR UPDATE`
  already holds.
- `_audit` with action **`'create_firm'`**; `_append_event('firm.created')`.

**At the `approve_firm_registration` ENTRANCE** (new):

- The owner+operator authority pair above.
- `_reserve_op(c.firm, 'approve_firm_registration', p_op_key, …)` on the **operator's** firm —
  the only firm the caller has, and the one the audit row belongs to.
- `select … from clara.firm_registration_requests where id = p_request **for update**`; status
  must be `open` → else `CLR09`. The row lock is what makes two operators clicking approve
  concurrently resolve to one firm rather than two.
- Calls the core with `p_actor := request.applicant` — **not** `jwt_sub()`, which is the
  operator.
- Re-checks the applicant's membership through the core; `CLR10` (*trued at the tranche-2 build: the core's own bullet says `CLR10`, and `_add_member_core` (0141) uses `CLR10` for the identical invariant — this line's earlier `CLR09` was loose prose*) if they acquired one since
  requesting.
- Sets the request to `approved`, recording `decided_by`, `decided_at`, and the new `firm_id`.
- `_audit` with action **`'approve_firm_registration'` — never `'create_firm'`**. Two different
  human acts with two different floors must never share a receipt string, or the audit log
  stops distinguishing a self-serve creation from an operator's decision.
- `_append_event('firm.created')` plus its own registration-decision event.
- `_finish_op`.

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

## E-H · moved

Route and component inventory (§E), the gate rows (§F), the battery (§G) and the R2/R3
execution detail (§H) live in `p4-design-2026-08-27-annex-2.md`.
