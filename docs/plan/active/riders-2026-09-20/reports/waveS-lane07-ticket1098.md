# Riders sweep wave — lane 07, ticket #1098

**Backfill the TIN firm-setup item onto already-committed firm-setup plans.**

| | |
|---|---|
| branch | `riders/wS-lane07` in `C:\Users\zhant\Desktop\clara-wt\659` |
| base | `7bc5a710f` (the integrated head of the wave before) |
| lane database | `127.0.0.1:55749` / `clara_l09`, 310 migration files, max `0347_firm_setup_committed_tin_backfill` |
| commits (this ticket) | `3b8b7298c` `feat(db): #1098 backfill the TIN item onto already-committed firm-setup plans (0347)`<br>`0041e7130` `test(db): #1098 drive the backfill verb at its own seam, AC by AC` |
| tickets before mine on this branch | #1047 (`b6154f064` … `4d975c8d0`, seven commits, README + `packages/db/tests` only, **no migration and no function body recut**) |
| verdict | **done, with one acceptance criterion PARTIAL and disclosed** (see "AC1, the second half") |

Ticket contract read from `gh issue view 1098 --json body,comments` on 2026-09-25: the Agent Brief
is in the **issue body**, the issue carries **zero comments**, and there is no owner ruling on it.
`ready-for-agent` + `bug`. Verified still live on this branch before building: `0311_firm_setup_tin_
required.sql` contains no plan-item backfill (`grep -n "onboarding_plan_items" migrations/0311*` →
only the `create or replace` bodies), `clara.seed_firm_setup_plan` still raises `CLR10
firm_setup_not_open` (`migrations/0311…:381`), and on the lane database the pre-0311 shape was
reproducible and reached: 2 committed firm-scope plans with no `tin` item at apply time.

---

## The seams I tested at

Written down before the first cell, per work-order rule 4:

1. **`clara._firm_setup_backfill_committed_tin()`** — the verb `0347` mints and then calls once.
   This is the primary seam. See "Why a verb" below.
2. **`clara.get_firm_setup()`** — the read door. Every claim about what the firm SEES (the item's
   presence, its `state`, its `applicability`, its `required` flag, `required_outstanding`) is taken
   from this door's own output, never from a row read behind it.
3. **`clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)`** — the write door, driven to
   establish the residual refusal rather than to assert it.
4. **`clara.seed_firm_setup_plan(text)`** — driven once, to prove an OPEN plan the backfill
   deliberately skips is genuinely not a dead end.
5. **The migration's own prestate and tail** — the repo's documented standard for a data migration
   (prestate pins, carried digests, tail assertions). Work-order rule 4's own carve-out: "where this
   repo's own documented standard asks for a structural cell … that standard wins and you say so".

No seam outside this list was touched. No `apps/web` file, no `packages/runtime` file, no frozen
workflow, no applied migration.

### Why a verb and not an inline `insert`

A one-shot statement inside an applied migration can only ever be observed against the rows that
server held at apply time, and on a from-scratch chain that is **zero rows** — which makes #1098's
own third acceptance criterion ("a test drives an already-committed firm-setup plan, seeded and
committed BEFORE the backfill, and asserts it gains a TIN item after the backfill runs") vacuous
everywhere except one lane database on one afternoon. `clara._firm_setup_backfill_committed_tin()`
is the same statement given a name, so a cell can plant the pre-0311 shape itself and drive the REAL
subject on any database. It is `insert … where not exists`, so it is idempotent and redo-safe by
construction (the `0301 §G` precedent), it returns the row count it inserted, and it is
**EXECUTE-granted to nobody** — it writes into every firm's plan at once, so it belongs to a
migration or to an operator holding `clara_fn_owner`.

---

## Acceptance criteria, each with its evidence

### AC1 — "Every existing, already-committed firm has a TIN firm-setup item it can answer, matching the applicability (required or optional) the current turnover answer implies."

**First half (the item exists, correctly marked): DONE.**

- Cell `p1098.backfill.committed_plan_gains_tin_marked_by_turnover`
  (`packages/db/tests/firm-setup-committed-tin-backfill.test.mjs`). Two firms are driven through
  `seed_firm_setup_plan` → `answer_firm_setup_item` → `commit_firm_setup`, one with
  `turnover = 'RM1M-5M'` and one with `turnover = '<RM1M'`, and each then has its `tin` row removed
  through the root connection — the only way to reach a shape today's seed can no longer produce.
  `get_firm_setup()` reads `state = 'committed'` and `tin.state = 'unseeded'` on both. After
  `clara._firm_setup_backfill_committed_tin()`: `tin.state = 'pending'`, `answer = null`,
  `kind = 'capture'`, and `applicability`/`required` read **`required` / true** above the threshold
  and **`optional` / false** below it. Result: **pass**.
- The marking is not stored anywhere: `required` and `applicability` are derived live by
  `clara._firm_setup_applicability` on every read (`0311` SS B / SS D), so a row planted here cannot
  drift from the turnover answer the plan already holds. That is why the backfill writes no
  applicability column at all.
- The estate-wide effect of the migration's single run: cell
  `p1098.census.no_committed_firm_plan_lacks_tin` — zero committed firm-scope plans without a `tin`
  item, with its own vacuity guard (the same cell asserts the database really does hold committed
  firm-scope plans, so the census cannot be satisfied by an empty set). Measured on the lane
  database after the whole battery: **47 committed firm-scope plans, 0 without `tin`.** Result:
  **pass**.
- The migration's own tail T.1/T.2/T.3 proved the same thing at apply time, over rows that existed
  *before* it: `#1098 backfill: 2 tin item(s) planted on committed firm-scope plans (the prestate
  counted 2 such plans)`.

**Second half ("it CAN ANSWER"): PARTIAL, and disclosed rather than glossed.**

`clara.answer_firm_setup_item` refuses every item on a plan that is not open (`0218 §E.2`, `CLR10`
+ `detail.reason = 'firm_setup_not_open'`), and the web checklist guards every write control behind
`!committed` (`apps/web/components/firm-setup/firm-setup-checklist.tsx:726, 751, 783`; its own
comment at 636-638 says "a tip left pending into a committed checklist has no reopen door to answer
through"). So after the backfill the TIN question is **on** the committed checklist, correctly
marked, and the firm still cannot record a value into it.

- Cell `p1098.residual.a_committed_plan_still_refuses_the_answer` **drives** that refusal
  (`assertRaises("CLR10", …)`, `detail.reason === "firm_setup_not_open"`) and also asserts that a
  committed plan above the MyInvois threshold names `tin` in `required_outstanding` — so the
  residual is visible on the surface rather than silent. Result: **pass** (it pins today's
  behaviour; it is not a blessing of it).
- **Why I did not close it.** The wall is not specific to `tin`: a committed firm-setup plan has
  always been closed to every item, and the catalogue carries no reopen door — measured live, the
  whole firm-setup surface is `_assert_firm_setup_answer`, `_firm_setup_applicability`,
  `_firm_setup_bump`, `_firm_setup_plan`, `answer_firm_setup_item`, `commit_firm_setup`,
  `defer_firm_setup_item`, `dismiss_firm_setup_tip`, `get_firm_setup`, `seed_firm_setup_plan`, and
  nothing else. Opening one changes what a commit means, and `packages/db/README.md:1126-1141` — the
  block #1032's own fix round wrote — already says in its own words that it "would have to invent
  either a reopen door or a write into a committed plan — both of them product decisions". #1098's
  Agent Brief names only the backfill under "Key interfaces", the SWEEP-PLAN's lane note describes
  #1098 as "a production backfill over every firm's already-committed onboarding plan", and
  work-order rule 5 forbids widening a ticket. So: built the backfill, drove the residual,
  documented it in the migration header and in the README, and the follow-up below carries the one
  question the owner has to answer.

### AC2 — "The backfill does not alter any other already-answered firm-setup item."

**DONE**, proved twice, at two different altitudes.

- Cell `p1098.backfill.no_other_item_and_no_plan_row_moves`. Two committed plans: one in the
  pre-0311 shape, one that finished setup after 0311 with its TIN already answered. A fingerprint of
  every column of every item on a plan (ordered by the surrogate `id`, a uuid) plus the plan row's
  own `state`, `revision_token`, `revision_n`, `committed_at`, `committed_by`, `updated_at` and its
  revision count is taken before and after. The already-answered plan is **`deepEqual` identical**.
  The missing one gains **exactly one** row, every pre-existing row is still present byte for byte,
  its plan segment is unchanged, and its revision count is unchanged. Result: **pass**.
- Migration tail T.4 and T.5. The prestate digests *every* `clara.onboarding_plan_items` row and
  *every* `clara.onboarding_plans` row and carries both in the temp table `_p1098_pre` (the
  `0295`/`0289`/`0291`/`0261` idiom); the tail re-computes the item digest over rows with
  `created_at < now()` — `now()` is the transaction timestamp, so every row written before this
  migration is strictly earlier — and requires it to be identical, requires the row count to be
  identical (nothing deleted), requires the plans digest to be identical, and requires zero new
  `clara.onboarding_plan_revisions` rows. T.3 additionally requires every row created in the
  transaction to be an unanswered, catalogue-shaped `tin` item on a committed firm-scope plan.

### AC3 — "A test drives an already-committed firm-setup plan (seeded and committed before the backfill) and asserts it gains a TIN item after the backfill runs, correctly marked required or optional."

**DONE, literally and repeatably.** This is what the verb seam exists for: the cell plants the plan,
seeds it, answers it and commits it through the real doors, *then* runs the backfill, *then* asserts.
It does so on any database carrying `0347`, including a from-scratch chain — which an inline
one-shot statement could not have supported. See AC1's first half for the cell and its assertions.

**And it was also proved the other way round, over rows that predated the apply.** Per the
work-order wave-3 addendum ("a data-dependent branch must be entered once … create such rows
through the estate's own doors on your lane database BEFORE you apply"), five firm-setup plans were
driven into their states on `clara_l09` *before* `pnpm db:migrate`:

| planted world | state at apply time | what it proves |
|---|---|---|
| `p1098_req_89b46ea3` (plan `2374739d…`) | committed, `turnover = 'RM1M-5M'`, no `tin` row | the backfill's required arm, over a row that predated the apply |
| `p1098_opt_d92091c5` (plan `f4850e0b…`) | committed, `turnover = '<RM1M'`, no `tin` row | the optional arm, same |
| `p1098_has_420aae47` (plan `f208c8fa…`) | committed, `tin` answered | AC2 over a pre-existing row |
| `p1098_open_7e38b7ac` (plan `51b92b3e…`) | open, no `tin` row | the open population must not move |
| `p1098_canc_e471f33c` (plan `e0bf639c…`) | cancelled, no `tin` row | the cancelled population must not move |

The FIRST apply reported `#1098 prestate: clean (FIRST) … open=87 committed=2 cancelled=1`, then
`#1098 backfill: 2 tin item(s) planted`, then the tail `OK (FIRST)`. States covered: committed above
the threshold, committed below it, committed already carrying the row, open, cancelled. **Not
covered on this rig:** a firm-scope plan that is committed *and* whose catalogue `tin` row is
retired (`retired_at is not null`) — the verb excludes it by `k.retired_at is null` (#934's rule) but
no live estate has ever retired `tin`, so that arm is code-read, not driven.

### Out of scope (the ticket's own)

"Any change to the applicability rule itself" — `clara._firm_setup_applicability` is **pinned**, not
touched: `f85b461549e19695f7b28f6b9c94f570d09853eb7af3dc9bb78b3ec4a8651c5e` in the prestate and again
in tail T.8.

---

## The migration

`packages/db/migrations/0347_firm_setup_committed_tin_backfill.sql` (563 lines), the number reserved
for this ticket. File sha256 `7deeea49ba30f970f459a9df29dc14f4298b40ac139bb77059b3f2aa10aa17f9`,
which is also the checksum in `clara.schema_migrations`.

Shape: header → `set local statement_timeout` → `create temp table _p1098_pre … on commit drop` →
SS 0 prestate → `set role clara_fn_owner` → SS A the verb + `revoke all … from public` +
`comment on function` → `reset role` → SS B the one run → the tail. The `0295` layout exactly, so the
verb is created as `clara_fn_owner` while the carrier table stays owned by the connecting role.

### Prestate pins — every signature with its sha, MEASURED LIVE on `clara_l09` after #1047

#1047 recut **no** function body (its seven commits touch `packages/db/README.md` and
`packages/db/tests/` only), so these are also main's post-`0318` bodies. The integrator can use this
list to find a pin another lane recuts.

| signature | `sha256(prosrc)` | this file |
|---|---|---|
| `clara._firm_setup_applicability(uuid,text)` | `f85b461549e19695f7b28f6b9c94f570d09853eb7af3dc9bb78b3ec4a8651c5e` | reads, never recuts |
| `clara.seed_firm_setup_plan(text)` | `9855f1ad743ab182358cfd858bc55912312b97f504e23f20aa16e90f3b2cced3` | reads, never recuts |
| `clara.get_firm_setup()` | `65f6aec24615e9d20201b7fd073b37affbae98ff4ea8be8fac8044e26f238d52` | reads, never recuts |
| `clara.commit_firm_setup(uuid,uuid,text)` | `fab99f4b7c29a9c8d0e632eb0671e437983ba1c742ec195f3343298b54493653` | reads, never recuts |
| `clara.defer_firm_setup_item(uuid,uuid,text,text,text)` | `63b9d3f6c5718957b8294dbdc87067fbae3d7b0731f2850a1c6804a75d5cb855` | reads, never recuts |
| `clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)` | `2674cde3ba5feeed4fe9eba2f0a8bfb378d8b150d8929d7df5a51c1632de9d3c` | reads, never recuts |
| `clara._firm_setup_plan(uuid)` | `9fb59f22153e770e02eba44b62e391e1794ffe60e7ba92e00067075dd03fd54a` | reads, never recuts |

All seven are re-read in tail T.8 and must be unmoved. **This file recuts no body at all**, so a lane
that recuts any of the seven collides with a pin, not with a body — the integrator re-derives these
seven numbers if L1's or any other lane's migration lands first.

Also pinned in the prestate, measured rather than transcribed: `tin`'s catalogue row still reads
`capture` / `required_for_commit = false` / no `knowledge_key` / not retired and carries **0311's own
`user_note` sentence**; the catalogue holds 15 rows; `clara.onboarding_plan_items` has 0017's
thirteen columns, `uq_onboarding_plan_items_key`, the four-value `state` CHECK, the four-value
`item_kind` CHECK (#935) and **no wall beside the TRUNCATE guard** (measured, because this file
inserts rows directly instead of going through a door — there is no append-only trigger to disable
here, unlike `clara.firm_setup_keys`); `clara.onboarding_plans`' `state` CHECK still admits exactly
`open`/`committed`/`cancelled`, which is the partition the scope predicate relies on; and `0311` has
landed (`tin`'s branch returns `required`/`optional`) while `seed_firm_setup_plan` still carries
`"reason":"firm_setup_not_open"`, which is the premise of the whole file.

### Carried values and the collation rule

`_p1098_pre` carries `mode` (FIRST/REDO), the three `without_tin_<state>` counts, `items_digest`,
`items_count`, `plans_digest` and, after SS B, `added`. Neither digest is a cross-server literal —
both are measured in the prestate and compared in the tail of the same transaction — and both are
ordered by the surrogate `id`, a **uuid**, which orders by its own type and not by the server's
`lc_collate` (`packages/db/README.md`, "Collation and pinned order (#1047)", the section this lane's
own first ticket wrote). `tests/collation-pin-scan.test.mjs` scans the new migration and the new test
file and reports no new site: **22 cells, pass.**

### rig-meta cohort: none owed, measured rather than assumed

The file mints **one** function and **no grant**: `clara._firm_setup_backfill_committed_tin()` is
`revoke all … from public` with no `grant`, so its ACL is `clara_fn_owner=X/clara_fn_owner` alone
(tail T.7 re-reads that, and re-reads that `clara_runtime`, `clara_agent_ro`, `clara_authenticated`
and `public` all hold no EXECUTE). A `rig-meta.mjs` cohort exists to police a **granted** name across
a frontier boundary, so — the `0311` precedent and `rig-meta.mjs`'s own #979 note ("NO COHORT, NO NEW
NAME, NO GRANT CHANGE, each measured rather than assumed") — no cohort entry is owed and none was
added. `operation-census.test.mjs` and `rig-isolation.test.mjs` were run to prove the public
operation boundary and the grant matrix did not move.

### Redo (#957): used, and recorded

- **FIRST-apply branch: proved by the real first apply**, not simulated. The prestate's FIRST/REDO
  marker is one signal — whether `clara._firm_setup_backfill_committed_tin()` exists in the catalog —
  and the first `pnpm db:migrate` reported `clean (FIRST)` and planted 2 rows. No marker-tolerant or
  bimodal sha branch exists in this file, so the wave-3 addendum's "prove the first-apply branch by
  hand" does not apply beyond that.
- **REDO branch: exercised twice** with
  `CLARA_MIGRATION_REDO=0347_firm_setup_committed_tin_backfill` — once to prove it, and once to
  restore the subject after the vacuity control. Both reported `clean (REDO)` … `0 tin item(s)
  planted` … `tail: OK (REDO)`, and both produced the same checksum
  `7deeea49ba30f970f459a9df29dc14f4298b40ac139bb77059b3f2aa10aa17f9`. The redo also exercises the
  **zero-rows arithmetic** of T.1–T.4, which is the arithmetic a from-scratch chain will take.
- A plain `pnpm db:migrate` afterwards reports `0 new migration(s) applied · 310 total` and no drift.

---

## Vacuity control

Every cell was shown failing against a deliberately broken subject, then the subject was restored
**byte for byte** by redoing the migration from the file (verified: the restored body hashes to
`b6890cc9c446c1fc26270ef822a5fedb427bd750ef1fc0ac54d29d7bead3ad7d`, and the whole battery is green
again).

| broken subject | cells that went red |
|---|---|
| the verb replaced by `return 0;` (a no-op) | 1, 2, 4, 5, 6 went **red**; 3 stayed green (a no-op trivially satisfies "does not touch open/cancelled plans") |
| the scope predicate widened to `state in ('open','committed','cancelled')`, fenced to this ticket's own `p1098_%` fixture firms so the break could not reach the rig's other 86 | 3 went **red** |

The fence on the second break is deliberate: an unfenced widened predicate would have planted `tin`
on 101 open rig plans, which is exactly the pollution the cell exists to prevent.

---

## Gates, with counts

Every db run used the FULL gate chain (`GATES="$(node scripts/print-gate-chain.mjs)"`), from
`packages/db`, against `127.0.0.1:55749 / clara_l09`, `--test-concurrency=1`.

| gate | result |
|---|---|
| `tests/firm-setup-committed-tin-backfill.test.mjs` — FOCUSED, no gate preload (final acceptance shape) | **6 tests, 6 pass, 0 fail, 0 skipped** |
| `tests/firm-setup-committed-tin-backfill.test.mjs` + `tests/collation-pin-scan.test.mjs` + `tests/ci-frontier-leg-contract.test.mjs`, full chain | **28 tests, 28 pass, 0 fail, 0 skipped** |
| `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs`, full chain, **no reset flags** | **33 tests, 32 pass, 0 fail, 1 skipped** — the one skip is `T19 poison-role: reset + re-migrate`, which the rig forbids (`CLARA_RIG_ALLOW_RESET` must never be set) |
| the five firm-setup neighbours: `firm-setup`, `firm-setup-applicability`, `firm-setup-polish`, `firm-setup-user-notes`, `firm-setup-education-tips`, full chain | **33 tests, 33 pass, 0 fail, 0 skipped** |
| `apps/web` → `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` (sweep rule d: the pins corpus is in scope whenever a migration file changed) | **22 tests, 22 pass, 0 fail, 0 skipped** — no new `REVIEWED_DYNAMIC_SQL_BARRIERS` entry is owed, because `0347` contains no dynamic SQL at all |
| `pnpm typecheck` (repo root) | **Done** — `apps/web` and `packages/runtime`, no errors |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, the runner's own shape) | **pass** |
| `pnpm lint` (repo root) | **pass**, exit 0 |
| `npx eslint` on the two new `packages/db` files | **exit 0** |
| `pnpm db:migrate` after everything | `0 new migration(s) applied · 310 total`, no drift |

Not owed and not run, with the reason: the **whole** `apps/web` unit suite and any browser walk
(work-order rule 8's trigger is "if you touched `apps/web`" — no `apps/web` file was edited; the one
web test above was run because sweep rule d puts the pins corpus in scope, and it reads migrations
rather than app code). `check-frozen-workflows.mjs` / `check-parts-parity.mjs` (no
`packages/runtime` file touched; `grep` over `packages/runtime` for `firm_setup|firmSetup` finds
**nothing** — no chat or Work tool reaches firm setup at all).

Known Windows-only reds from `RIG.md`: none encountered in any of the above.

---

## Shared files

| file | my hunk |
|---|---|
| `packages/db/package.json` (the `$GATES` list) | one `--import ./tests/firm-setup-committed-tin-backfill-preintegration-gate.mjs`, appended after `schedule-term-correction-preintegration-gate.mjs` (0317) — the last entry, which is migration order, since 0318 added no gate. `node scripts/print-gate-chain.mjs` reads it and `ci-frontier-leg-contract.test.mjs` passes. |
| `packages/db/README.md` | ONE new section, `## 0347 — the TIN item reaches the firms that had already committed their setup (#1098, riders sweep wave, lane 07)`, appended at the end. **No existing section edited** — in particular `packages/db/README.md:1126-1141` ("The population 0311 does NOT reach"), which is 0311's immutable record of this very gap, is untouched; the new section points at it. |
| `packages/db/tests/rig-meta.mjs` | **not touched** — no cohort is owed (see above). |
| `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `apps/web/lib/navigation/tree.ts`, `apps/web/tests/firm-scope-db-pins.corpus.ts`, `CONTEXT.md` | **not touched.** No web file changed, so no message key and no manifest line; the pins corpus needs no entry (proved by running its test); and the ticket introduces no new domain vocabulary — "Firm setup" and "Onboarding plan" are already in `CONTEXT.md` and the backfill is a maintenance act on an existing entity, not a new one. |
| the six `packages/db/tests` census files #1047 works | **not touched** by this ticket. |

---

## Docs

- `packages/db/README.md` — the new `## 0347` section: the gap and how it was measured; why the
  backfill is a named verb; what it refuses to touch (committed only, `not exists`, no plan row, no
  revision); the carried digests and the collation reasoning; **the residual, in bold, with the one
  question it puts to the owner**; redo-safety and which branches were exercised; and the gate line.
- `0347`'s own header carries the same reasoning at statement level, including a "what this file
  deliberately does not do" list with an authority per line.
- `comment on function clara._firm_setup_backfill_committed_tin()` states, in the catalog itself,
  that it does **not** make the row answerable. A future reader who finds the verb finds the residual
  with it.

---

## Successor contract

**None is owed by this ticket.** No frozen chat body or Work closure module is involved: `grep` over
`packages/runtime` for `firm_setup|firmSetup` returns **no files**, so firm setup has no agent
surface at all today — it is a human-only journey (`clara_authenticated` doors plus
`apps/web/app/(firm)/settings/setup/page.tsx`).

For the follow-up below, which is a **human door plus a web control** rather than a frozen tool, the
shape I would build if the owner rules for it — recorded here so the ruling can be costed:

- **Door name** `clara.complete_firm_setup_item(p_plan uuid, p_expected_revision uuid, p_item_key
  text, p_answer jsonb, p_op_key text) returns jsonb` — a sibling of
  `clara.answer_firm_setup_item`, not a widening of it, so the existing door's refusal stays exactly
  where it is and nothing that reads "answered before the commit" changes meaning.
- **The one thing it admits that its sibling does not**: a plan in state `committed`, and only for an
  item whose current `state = 'pending'` (never `answered`, `resolved` or `deferred`). A **completion**
  of a question the firm was never asked; never an **amendment** of a fact it attested to. Everything
  else is the sibling's body verbatim: `_human_ctx(role_rank('admin'))` then the catalogue row's own
  `min_role`, the no-existence-oracle `CLR11`, `_reserve_op` before the mutable validation, the
  `CLR06`/`stale_plan` CAS, `_assert_firm_setup_answer`, and the `capture_knowledge` leg for a row
  carrying a `knowledge_key`.
- **New refusals**: `CLR10 firm_setup_item_already_settled` (the item is not `pending` on a committed
  plan) and, for a plan that is `cancelled`, the existing `CLR10 firm_setup_not_open`.
- **Receipt**: it must record that the completion happened *after* the attestation — the audit
  payload carries `{"plan":…, "item_key":…, "after_commit": true, "committed_at": …}` and the event
  is a new `firm_setup.item_completed_after_commit`, so the commit receipt is never silently
  re-signed. Whether it bumps `revision_n` is the owner's call and is the one thing I would ask
  alongside the ruling.
- **Web**: `apps/web/components/firm-setup/firm-setup-checklist.tsx` would render the answer control
  for a `pending` item on a committed checklist only (its `!committed && isAnswerable(item)` guard
  becomes `(!committed || isPending(item)) && isAnswerable(item)`), plus one message key for the
  banner that says the checklist is finished but this question is still open.
- **Part kind / prompt stanza**: none. There is no chat or Work surface for firm setup to extend.

---

## Follow-ups worth filing

1. **(the one that matters) A committed firm-setup checklist cannot be completed for a question it
   was never asked.** After `0347` every firm has the TIN question on its checklist, correctly marked,
   and a firm that committed before `0311` still cannot answer it — and a firm above the MyInvois
   threshold sees it named in `required_outstanding` for ever. Evidence: cell
   `p1098.residual.a_committed_plan_still_refuses_the_answer`, `0218 §E.2`,
   `firm-setup-checklist.tsx:726/751/783`. The question for the owner is **one sentence**: *may a
   committed firm-setup checklist still be COMPLETED for a question it was never asked, while never
   being AMENDED for a fact it attested to?* A "yes" is the successor contract above (one migration,
   one web control, one message key). A "no" means the TIN of a pre-`0311` sub-threshold firm is
   recorded some other way, and that needs its own ticket. This is the ticket
   `packages/db/README.md:1139-1141` already asked for; #1098 narrowed the gap but did not close it,
   and the residual should not be closed with #1098.
2. **Nothing reads the firm's own TIN.** `grep -n "'tin'" migrations/*.sql` returns matches in
   0007/0009/0011/0015/0016/0017/0022/0023/0029 and they are all about a CLIENT or a COUNTERPARTY
   (`clara.client_identifiers.kind = 'tin'`, `proposed_counterparty->'new'->>'tin'`), never the
   firm's own; the only firm-setup `tin` references outside `0347` are `0257` and `0311`, which
   decide its applicability. The firm-setup `tin` item carries no `knowledge_key`, so its answer
   lives only in the plan item. That is worth a ticket of its own: either promote it
   to a knowledge key (which would also give it `clara.correct_knowledge`, a correction path that
   survives the commit and would answer follow-up 1 from a different direction) or say plainly what
   it is for. Not in #1098's scope, and not asserted beyond the grep.
3. **`0318` shipped no preintegration gate module.** The `$GATES` list ends at `0317`'s. Not my
   ticket and not a defect I can prove is one, but the integrator may want to check whether
   `0318`'s cells are frontier-gated at all.

---

## Anything unverified

- **A true from-scratch chain.** I could not run one: `RIG.md` forbids a second from-scratch chain on
  a lane cluster (`0154` pins the cluster-wide role count) and forbids creating clusters. Reasoned,
  not measured: on a fresh chain there are no firms, so the prestate's three counts are 0, `v_added`
  is 0, T.1–T.4's arithmetic is the zero-rows arithmetic the two REDO runs already exercised, and the
  empty-aggregate path is explicit (`coalesce(string_agg(…), '<no rows>')` — measured to produce
  `61cf985659c46500b055e8ddf4c67ef95180bc692a9f1f7223919d87208a838e` rather than NULL for an empty
  set). The integrator's from-scratch proof is still owed.
- **The `retired_at` arm of the verb** (`k.retired_at is null`) is code-read, not driven: no estate
  has ever retired the `tin` catalogue row, and retiring it on the rig to prove one predicate would
  have moved a row `0311`'s own tail pins.
- **`created_at >= now()` as the discriminator for "rows this transaction inserted"** rests on the
  runner opening one transaction per migration file. Checked two ways — `0295` reads its own
  `on commit drop` temp table in its own tail, and `scripts/migrate.mjs` refuses a body that
  "replaced the runner-owned transaction" — but not by reading the transaction id from inside two
  different migrations.
- **Hosted.** I have not touched hosted and cannot say how many committed firm-setup plans it holds;
  on `clara_l09` the number reached by the first apply was 2, both of them rows this lane planted for
  the purpose. The owner's standing beta ruling (hosted data is test data until a real firm is
  admitted) is why that is acceptable evidence for a wave, and is not evidence about a real firm.
- **The rig's own leftovers.** This ticket's cells and its pre-apply planting left `p1098_*` fixture
  firms on `clara_l09` (47 committed firm-scope plans exist there now, all carrying `tin`; 2
  cancelled fixture plans deliberately do not). Nothing outside `packages/db`'s own batteries reads
  them.
