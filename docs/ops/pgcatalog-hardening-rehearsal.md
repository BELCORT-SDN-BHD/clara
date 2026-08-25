# pg_catalog hardening — rehearsal report (F-A6 B-1 / H-5)

**Status: REHEARSED on a throwaway. NOT applied anywhere live. Verdict: GO on a target where the
deploy role owns the residual functions or is superuser; structurally NO-GO on the current managed
Supabase cluster (evidence in §9) — that half of the finding is itself the deliverable, per the
owner's own framing ("a real-cluster ceremony ONLY if provably safe").**

Owner ruling, 2026-08-25: F-A6's law-28 review (`docs/plan/active/freeform-read-law28-review.md`)
named two accepted gaps as things to FIX, not accept — **B-1** (pg_catalog residual functions
PUBLIC-executable inside the read sandbox) and **H-5** (advisory-lock functions PUBLIC-executable
→ a session-lock squat against the firm's writer lanes). This is the rehearsal-first measurement
ordered before any real-cluster ceremony: full blast radius on a throwaway, GO/NO-GO evidence for
live.

Companion script: `scripts/ops/pgcatalog-hardening.sql` (rehearsed against two additional
dedicated throwaway rigs, on top of the main one — see §8). No migration was touched; this is
cluster-role surgery, ceremony-class, same footing as `packages/db/deploy/acl-baseline.sql`.

## Rehearsal rig

Docker `postgres:17`, instance-unique container `clara-rig-pgcat` on host port **55952**
(WSL2 Docker, port-forwarded to the Windows host — the pattern every parallel lane in this session
uses). Full migration chain applied via `CLARA_MIGRATIONS_DIR` pointed at
`packages/db/migrations` — **0001 through 0127, all 122 pending files, zero drift** — then both
seed files. A second identical rig (port 55953) was built as an **unhardened control** for the
estate-suite differential in §5. A third and fourth (ports 55954 and 55955, both torn down after
use) were dedicated to exercising `scripts/ops/pgcatalog-hardening.sql`'s guard/apply/verify logic
in isolation (§8) — four throwaway rigs total across the rehearsal.

## §1 — Baseline enumeration

```sql
select count(*) from pg_proc p where p.pronamespace='pg_catalog'::regnamespace
  and has_function_privilege('public', p.oid, 'EXECUTE');
```

| | count |
|---|---|
| Total functions in `pg_catalog` (PG 17.11) | 3,319 |
| **PUBLIC-executable today** | **3,257** |
| Already NOT PUBLIC-executable (Postgres's own defaults) | 62 |

The 62 already-closed functions are exactly Postgres's own reserved-role surface —
`pg_read_file`/`pg_read_binary_file`/`pg_ls_*`/`lo_import`/`lo_export`/`pg_stat_reset*`/
`pg_promote`/the replication-origin family/etc. (full list captured during the rehearsal run,
reproducible with the query above negated). None of the B-1/H-5 target family is in it —
`pg_notify`, the whole `pg_advisory_*` family, `pg_sleep*` and the `query_to_xml` family are
PUBLIC-executable by Postgres's own out-of-the-box default, confirming `acl-baseline.sql:7-12`'s
framing.

## §2 — Why "start maximal: all of them" is infeasible (measured, not assumed)

The ticket's own starting instruction was to REVOKE every PUBLIC-executable `pg_catalog`
function and carve out exceptions by measurement. That was tried, literally, first:

```sql
begin;
revoke execute on all functions in schema pg_catalog from public;
set role clara_authenticated;
select 1+1;
-- ERROR:  permission denied for function int4pl
rollback;
```

**`select 1+1` fails.** Ordinary SQL operators (`+`, `||`, `=`, every comparison, every cast) are
backed by ordinary `pg_proc` rows in `pg_catalog`, and Postgres checks EXECUTE privilege on the
underlying function for every operator invocation, not just an explicit function call — this is
why PostgreSQL ships `pg_catalog` functions PUBLIC-executable by default in the first place. A
blanket revoke breaks every SQL statement any non-superuser role issues, not just the 32 functions
this ticket actually cares about. **This is the single most important finding of the rehearsal**:
the tractable target was never "all of pg_catalog" — it is the **named residual family**
`acl-baseline.sql:7-12`/`:129-145` already identifies (pg_notify / pg_advisory_* / pg_sleep* /
query_to_xml and siblings), enumerated completely in §3. Nothing outside that family is touched by
this hardening.

## §3 — The scoped target: 32 functions, four families

`acl-baseline.sql:129-145`'s own commented-out superuser-only block names 11 of these. It is
**incomplete** — it misses every `_shared` session variant, `pg_advisory_unlock_all()`, both
`(integer,integer)` two-key overloads for most of the family, `pg_sleep_for`/`pg_sleep_until`, and
5 of the 8 `*_to_xml*` siblings. The complete, catalog-enumerated set:

```sql
select p.oid::regprocedure from pg_proc p
where p.pronamespace='pg_catalog'::regnamespace
  and (p.proname = 'pg_notify' or p.proname like 'pg\_advisory\_%' or p.proname like 'pg\_try\_advisory\_%'
       or p.proname in ('pg_sleep','pg_sleep_for','pg_sleep_until')
       or p.proname in ('query_to_xml','query_to_xmlschema','query_to_xml_and_xmlschema',
                         'table_to_xml','table_to_xmlschema','table_to_xml_and_xmlschema',
                         'cursor_to_xml','cursor_to_xmlschema'));
```

| family | count | members |
|---|---|---|
| `pg_notify` | 1 | `pg_notify(text,text)` |
| `pg_sleep*` | 3 | `pg_sleep(double precision)`, `pg_sleep_for(interval)`, `pg_sleep_until(timestamptz)` |
| `pg_advisory_*` / `pg_try_advisory_*` | 20 | every lock/unlock × session/xact × shared/exclusive × bigint/(int,int) combination |
| `*_to_xml*` | 8 | `query_to_xml`, `query_to_xmlschema`, `query_to_xml_and_xmlschema`, `table_to_xml`, `table_to_xmlschema`, `table_to_xml_and_xmlschema`, `cursor_to_xml`, `cursor_to_xmlschema` |
| **Total** | **32** | |

Applying the REVOKE against this set: **3,257 → 3,224 PUBLIC-executable** (32 fewer, exactly).
`select 1+1`, `format(...)`, `now()`, `lower(...)`, every ordinary catalog read used elsewhere in
the estate — unaffected, verified per-role (§6).

## §4 — Measured re-GRANT allowlist

Derived two ways, cross-checked against each other: (a) `grep` every call site across
`packages/db/migrations`, `packages/runtime`, `packages/db/tests`, `packages/db/scripts`,
`packages/db/deploy`, `apps/`, `packages/reporting-render`, `spike/` for the 32 function names;
(b) the full `packages/db` estate suite (2,884 tests) run against the hardened rig and diffed
against an identical unhardened control rig (§5). Both methods agree.

| grantee | function | why (measured, not designed) |
|---|---|---|
| `clara_fn_owner` | `pg_notify(text,text)` | `0005:489` (`clara._append_event`, the event-spine tail-lock notify) and `0006:887` (the runtime-ctl nudge) call it from inside **SECURITY DEFINER** bodies owned by `clara_fn_owner` — every object in every migration is created under `SET ROLE clara_fn_owner` (the estate-wide convention). Under SECURITY DEFINER, Postgres checks EXECUTE against the function's **owner**, not the original caller — so this is the only grant that matters for the whole `_append_event` event spine. |
| `clara_fn_owner` | `pg_advisory_xact_lock(integer,integer)` | The literal-int-pair firm/client lock-key family: `203005001`..`203005007`, `202991617` — 173 real `perform pg_advisory_xact_lock(...)` call sites across `0006`/`0007`/`0009`/`0011`/`0038`/`0043`..`0045` etc., all inside `clara_fn_owner`-owned DEFINER bodies. |
| `clara_fn_owner` | `pg_advisory_xact_lock(bigint)` | A **distinct overload** — `hashtextextended(...)` single-arg call shapes: `0041` (an FA-role lock), `0059` ×2 (metric-definition + metric-evaluation run locks), `0070`/`0071` ×3 (the reporting-seal/report-artifact locks), `0077` (a wake-wrapper lock), `0111` (F-A5 reporting-agency run lock). Missed on the first grant pass (see §5 — this is a genuine "measure, don't assume" catch: a naive grep for the two-arg literal form does not find it). |
| `clara_fn_owner` | `pg_advisory_xact_lock_shared(integer,integer)` | `0056:766` — `clara._tf_close_serialize()`, a **trigger** on EIGHT close-domain tables (`open_item_allocations`, `bank_statements`, `bank_reconciliations`, `bank_line_exceptions`, `fixed_assets`, `bank_accounts`, `client_facts`, `document_filings`) that fires on **every ordinary INSERT/UPDATE/DELETE** to those tables, not just close-lane verbs. Missed on the first grant pass — caught only by running the real estate suite (§5), not by any static grep, since the call text (`pg_advisory_xact_lock_shared(`) doesn't match a naive `pg_advisory_xact_lock(` search. |
| `clara_runtime` | `pg_notify(text,text)` | `packages/runtime/lib/reconciler.mjs:104` — `select pg_notify('clara_runtime_ctl','')`, issued **directly** (no DEFINER wrapper) on a connection that has run `set role clara_runtime` (`relay.mjs:152`'s `setRuntimeRole`). |
| `clara_runtime` | `pg_advisory_lock(bigint)` | `packages/runtime/lib/relay.mjs:168` — `select pg_advisory_lock(hashtext($1)::bigint)`, the relay/reconciler's **leader-election** lock. Deliberately **session**-scoped (the code comment: "BEGIN/COMMIT on the same client never release leadership") — a genuine, real, currently-load-bearing session-level advisory-lock need. |

**Six grants, two roles.** Nothing else in the estate calls any of the 32 functions directly —
confirmed by grep across every workspace package plus `spike/` (read-only; `spike/scripts/
probe.ts` has one exploratory `pg_notify` call, unrelated to the estate's automated suites and
outside constraint 15's frozen-spike boundary, so no grant was added for it).

### A ticket hypothesis this rehearsal corrected

The ticket's H-5 framing guessed: *"the writers run as DEFINER/fn_owner, so the SESSION-level
need may be ZERO app roles."* **Measured, this is wrong for `clara_runtime`.** `relay.mjs`'s
leader-election lock is real production code, is session-scoped by design, and is not owned by
any DEFINER body — it runs on a raw `clara_runtime` connection. The corrected posture: session
advisory locks are granted to exactly one **trusted, non-attacker-facing** role
(`clara_runtime` — never exposed to LLM/freeform-agent input), and to no read-sandbox-adjacent
role at all. §7 proves the squat is closed for the roles that matter.

## §5 — Estate suite: hardened vs. unhardened control

`pnpm --filter @clara/db test` equivalent (`node --test --test-concurrency=1` with all six
wave-gate preloads) run to completion against **both** rigs.

| | hardened (55952) | unhardened control (55953) |
|---|---|---|
| tests (nested-inclusive) | 2,884 | 2,952 |
| pass | 2,795 | 2,879 |
| fail | **16** | **0** |
| skipped | 73 | 73 |

**Causal isolation.** Of the 16 hardened-run failures (11 top-level `not ok` + 5 nested subtests
under one of them), exactly **6 top-level failures** mention a revoked function by name in their
error text (`permission denied for function pg_...`, SQLSTATE 42501). The other **5 top-level
failures** (`delta contract requires a fresh disposable DB...` + its 5 nested subtests, `Wave E
lane epsilon...`, `R9.H3 the close verbs are HUMAN-ONLY...`, `D -- the agent evaluator refuses...`,
`f-a9.buckets the rollup...`) carry **no privilege-related error text at all** — count mismatches,
a stale-role census, an evaluator-deploy-count assertion, a rollup-arithmetic assertion. Each of
these five was independently confirmed to **also fail identically, at the same test number, with
the same name** when the control rig reached it (captured live, before the control run finished).

**The control run's completed numbers make the isolation stronger, not just consistent.** The
control finished **zero failures** — meaning the same 5 tests that failed on the hardened rig (and
were confirmed identically failing there mid-run) ultimately **passed** on the control by the end
of its run, and the two runs' total subtest counts differ (2,884 vs 2,952 — a 68-subtest gap, with
`skipped` identical at 73 both runs). That gap traces to `delta contract requires a fresh
disposable DB and runs its one-way ceremony in order` (`tests/delta-contract.test.mjs:28`) — a
**reset-gated** test that `packages/db/tests`' own convention (`.claude/rules/db-tests.md`: "A
reset-gated test drops schema `clara` mid-run, so it runs ALONE... gate on
`CLARA_RIG_ALLOW_RESET`") says should **only ever run in an isolated, dedicated invocation**, never
inside a bare full-suite run like this rehearsal's (which, like CI's own per-package sweep, leaves
`CLARA_RIG_ALLOW_RESET` unset on purpose). Run outside its intended isolation, this one test family
produces a **different subtest count on every invocation** depending on exactly what schema state
precedes it — which is itself conclusive: a bare ACL REVOKE/GRANT cannot possibly change how many
subtests a test file *generates*, only whether a test that calls one of the 32 revoked functions
passes or fails. The count instability is orthogonal to, and independent evidence against,
hardening as a cause. **Final, complete verdict: exactly 6 failures are pg_catalog-caused, all
explained below; zero are false positives.**

### The 6 real (pg_catalog-caused) failures

| test | file | function hit | role | class |
|---|---|---|---|---|
| `[0020 §3.2/§3.4 amendment — THE stale-transaction cell]` | `tests/wave-b/wb-0020-authorize.test.mjs` (via `wb-0020-helpers.mjs:658`) | `pg_sleep` | `clara_runtime` (`set role` in the test helper) | test-only wall-clock simulation |
| `x42.r7.s5c.1` | `tests/x42b0-r7-s5-clock.test.mjs:98` | `pg_sleep` | `clara_fn_owner` (`withActor({role: ROLES.fnOwner})`) | test-only wall-clock simulation |
| `x42.r7.s5c.2` | `tests/x42b0-r7-s5-clock.test.mjs:121` | `pg_sleep` | `clara_fn_owner` | test-only wall-clock simulation |
| `x42.r7.s5c.4` | `tests/x42b2-r7-s5-clock.test.mjs:103` | `pg_sleep` | `clara_fn_owner` | test-only wall-clock simulation |
| `C5 RETRY and FRESH admissions cannot deadlock...` | `tests/x46-wave-7a-sales-lane.test.mjs:731` | `pg_advisory_xact_lock(integer,integer)` | `clara_runtime` (`set role`, line 725) | test-only lock-contention simulation |
| `A19c the close-write permit cannot be forged...` | `tests/x56-rest-b.test.mjs:271` | `pg_advisory_xact_lock_shared(integer,integer)` | `clara_authenticated` (a deliberate ATTACKER persona, `forger`/"bob") | **security negative-control — see below, this is a WIN, not a break** |

**None of the 6 are production breakage.** All six are TEST INFRASTRUCTURE reaching a
`pg_catalog` function directly (bypassing the audited DEFINER writer path) to construct a
controlled interleaving:

- **4 × `pg_sleep`**: test helpers hold a transaction open and `select pg_sleep(1.2)` mid-transaction
  so Postgres's real wall clock (`clock_timestamp()`) advances while the transaction's frozen
  `now()` does not — a legitimate timing-simulation technique, but one that has zero production
  caller anywhere in the estate (§4's grep found none). **Recommended fix**: replace
  `await c.query("select pg_sleep($1::float8)", [s])` with a JS-side
  `await new Promise((r) => setTimeout(r, s * 1000))` between the two queries on the same open
  connection/transaction — it produces the identical wall-clock-advances-but-`now()`-frozen effect
  without ever needing `pg_sleep` privilege anywhere. Zero production grant required either way;
  this is purely a test-file change, out of scope for this rehearsal's deliverables (docs + a
  ceremony script, no test-suite edits), and is recorded here for whoever picks up the ceremony PR.
- **`C5` deadlock test**: `x46-wave-7a-sales-lane.test.mjs` sets role to `clara_runtime` on a raw
  connection and takes the SAME advisory-lock key a real writer (`admit_autodraft_task`, a
  `clara_fn_owner`-owned DEFINER body) would take internally, to force a controlled two-connection
  contention scenario without actually running the full writer. **Recommended fix**: change that
  one `set role clara_runtime` to `set role clara_fn_owner` — the simulated lock-holder role
  becomes the SAME role the real writer body actually runs as, which is arguably more faithful to
  begin with, and `clara_fn_owner` already holds this grant.
- **`A19c` forgery test — a genuine security-posture IMPROVEMENT, not a regression.** This test's
  entire purpose is to prove an attacker (`clara_authenticated`, persona "bob"/`forger`) **cannot**
  forge close-write authorization by taking the shared advisory lock directly plus faking a GUC —
  it currently expects the forgery attempt to run far enough to reach `clara.approve_entry`'s own
  business-logic refusal (`CLR19`). With this hardening applied, the SAME attacker can no longer
  even **acquire** the lock in the first place — the attempt now dies earlier, at the ACL layer
  (`42501`), before ever reaching `CLR19`. The security property the test is checking
  ("the forge does not succeed") holds even more strongly than before; only the specific expected
  error code needs widening to accept `42501` as an equally-valid refusal. **This is exactly
  H-5's own attack shape, caught in the act by an existing test, now closed one layer earlier.**

## §6 — Focused pg_notify probe

Nine targeted cells (`clara._append_event` end-to-end via the DEFINER path; direct `pg_notify` as
`clara_runtime`, `clara_authenticated`, and `clara_agent_ro`; the H-5 squat attempt as
`clara_authenticated` and `clara_agent_ro` on both session and xact advisory locks; the
`clara_runtime` leader-election lock; the `clara_fn_owner` writer-lock path; and an unaffected-
function control (`format`/`now`/`lower`) as every role) — all nine landed exactly as predicted by
§3/§4's allowlist. Full transcript basis for the table below:

| probe | expected | measured |
|---|---|---|
| `clara._append_event(...)` as `clara_fn_owner` (the real event-spine path) | succeeds | **succeeded** (`seq` minted) |
| `pg_notify('clara_runtime_ctl','')` as `clara_runtime` (the real `reconciler.mjs` path) | succeeds | **succeeded** |
| `pg_notify(...)` as `clara_authenticated` | denied | **denied**, 42501 |
| `pg_notify(...)` as `clara_agent_ro` | denied | **denied**, 42501 |
| `pg_advisory_lock`/`pg_advisory_xact_lock(203005001,...)` as `clara_authenticated` | denied both | **denied both**, 42501 |
| `pg_advisory_lock`/`pg_advisory_xact_lock(203005001,...)` as `clara_agent_ro` | denied both | **denied both**, 42501 |
| `pg_advisory_lock(hashtext('relay-probe')::bigint)` as `clara_runtime` (the real leader-election shape) | succeeds | **succeeded** |
| `pg_try_advisory_lock(...)` as `clara_runtime` (NOT in the allowlist — a control) | denied | **denied**, 42501 |
| `pg_advisory_xact_lock(203005001,999)` as `clara_fn_owner` | succeeds | **succeeded** |
| `format`/`now`/`lower` as `clara_authenticated` and `clara_agent_ro` | unaffected | **unaffected**, both roles |

## §7 — H-5, the advisory-lock leg, specifically

The design review's threat (`freeform-read-law28-review.md` H-5): a session that can reach
`pg_advisory_lock(203005001, hashtext('<own firm uuid>'))` — a key derived from the firm's own
uuid, readable from the enumerated `firms` relation, so not a secret — holds a **session**-scoped
lock that outlives any `RESET ALL` (only `DISCARD ALL` or session end clears it), blocking that
firm's document-intake writers until the pooled backend recycles.

**Measured closed**: §6's probes 5/6 prove `clara_authenticated` and `clara_agent_ro` — the two
roles nearest a future freeform-read-style surface — can acquire **neither** the session nor the
xact form of the firm's own lock key once this hardening is applied. **Measured preserved**: the
estate's real writers (`clara_fn_owner`, via every DEFINER body) keep every lock they actually
take, including the newly-discovered `_shared` variant (§4), and `clara_runtime`'s real
leader-election session lock keeps working. The one correction to the ticket's own hypothesis is
recorded in §4 ("session-level need may be ZERO app roles" — false for `clara_runtime`,
specifically and only).

No `DISCARD ALL`-vs-`reset all` pool-release change was made or needed here — that belongs to a
future freeform-read pool (not yet built; §4 confirmed zero call sites for it today), and remains
`H-5`'s own named "cheap belt" for whenever that pool exists.

## §8 — The ceremony script, rehearsed

`scripts/ops/pgcatalog-hardening.sql` was run to completion, seven times, against two
dedicated throwaway rigs (port 55954 — migrated fresh from `0001`, torn down after cells 1-6; port
55955 — minimal `clara_fn_owner`/`clara_runtime` role fixture only, no full migration needed since
the script touches nothing else, torn down after cell 7), exercising:

1. No `ceremony_confirm` var → **aborts** before touching anything.
2. Wrong `ceremony_confirm` phrase → **aborts**.
3. Correct phrase, disposable target (`*_ci` database name) → full REVOKE + GRANT + both VERIFY
   blocks pass; `3,257 → 3,224` PUBLIC-executable, exactly matching §3.
4. Correct phrase, a **non**-disposable database name, no `ceremony_target` → **aborts** with the
   exact required confirmation string printed (never left for the operator to hand-author).
5. Correct phrase, non-disposable name, `ceremony_target` copied from the abort message → full
   apply succeeds.
6. An unexpected extra grant manually planted (`pg_sleep` → `clara_authenticated`) → **VERIFY (b)
   correctly fails closed**, naming the drift. (This run caught a real bug in the first draft — a
   bare `%` in a `format()` call, not a `%s` placeholder — fixed before this report was written.)
7. A missing allowlist grant manually planted (revoked `pg_advisory_lock(bigint)` from
   `clara_runtime`, then re-ran the whole script) — the script's own unconditional GRANT step
   self-healed it before VERIFY ever ran, so this cell instead confirmed the script is
   idempotently self-correcting, not merely detecting. The VERIFY (b) "MISSING" branch (a SECOND
   instance of the same bare-`%` bug, in the sibling code path — not exercised by cell 6, since
   that only reaches the "extra grant" branch) was caught by direct inspection after cell 6's fix,
   confirmed broken by re-reading the code, fixed, and proven in isolation (a standalone `format()`
   call with the exact same arguments, on a fourth throwaway). Recorded in full — both bugs, both
   fixes, both proofs — as the adversarial-test discipline the review laws ask for, not swept
   under the rug.

The guard mirrors `packages/db/lib/guard.mjs`'s disposable-target discipline (localhost/`*_ci`/
`*_test`/`*_tmp`/`*_scratch`/`*_ephemeral`, or an exact `user@host:port/db` identity match) with
one addition appropriate to cluster-role surgery's wider blast radius: a `ceremony_confirm` phrase
is REQUIRED unconditionally, even on a throwaway — there is no "it's disposable so skip reading
the report" branch for a script that changes `pg_catalog` ACLs.

## §9 — Live-capability probe (read-only) — and why it stopped short of touching live

**What was checked without touching live at all.** Ownership of the 32 residual functions is
identical across any stock PostgreSQL 17, including this rehearsal's own rig: every one is owned
by the initdb bootstrap role (`postgres` on a fresh instance, `rolsuper=true`) —

```
pg_notify(text,text)              | postgres | t
pg_advisory_lock(bigint)          | postgres | t
pg_sleep(double precision)        | postgres | t
query_to_xml(text,bool,bool,text) | postgres | t
```

— and a rig-reproduced control (`create role probe_nonowner nologin nosuperuser; set role
probe_nonowner;`) attempting both `REVOKE` and `GRANT` against a `pg_catalog` function it does not
own gets a **loud, transaction-aborting ERROR** ("permission denied for function ..."), not a
silent no-op, for a role with zero standing on the object.

**What the repo already has as real live field evidence** (not re-derived here, cited because it
is exactly on point and already ratified): ADR-0020 states the `pg_catalog` side-effect surface
"is ACCEPTED as a permanent residual on managed Supabase — superuser-owned, empirically
un-revocable by the customer role," sourced from "pg_catalog un-revocability and the
ALTER-DEFAULT-PRIVILEGES no-op proven by non-superuser rig probes." Separately, and independently,
`docs/plan/completed/wave-e-delta-ceremony-asrun.md` §"field findings" records a REAL live
ceremony where Supabase's managed `postgres` role hit **SQLSTATE 42501** attempting a
superuser-gated `SET session_replication_role` — direct, live-witnessed proof the customer
`postgres` role is **not** a superuser on this project, not a platform-generic assumption.

**Combining these** (live: `postgres` confirmed non-superuser, live-witnessed; general Postgres:
the residual functions are owned by the bootstrap role, never a customer-creatable one, reproduced
on this rehearsal's own rig) answers the ticket's step-3 question without ambiguity: **our deploy
role can neither REVOKE the residual from PUBLIC nor GRANT it back to a specific role on the
managed Supabase cluster — both operations require ownership or superuser, and the deploy role
(the Session-pooler DSN behind `clara-backup`'s `DATABASE_URL`, "≈ project admin" per
`docs/ops/DR.md`) holds neither.**

**Why this rehearsal did not additionally wake the live `clara-backup` machine for a fresh direct
read.** `clara-backup` is a Fly **scheduled** machine — reachable via `fly ssh console` only while
a VM is up (confirmed: `fly ssh console -a clara-backup ...` → "app clara-backup has no started
VMs" at rehearsal time). The documented way to wake it (`wave-b-ceremony-runbook.md`: `fly machine
start <id>`) starts its actual entrypoint, which **runs the real daily backup pipeline** (full
dump → age-encrypt → R2 upload → healthchecks ping) — a genuine production side effect, not an
inert "boot and ssh in" step. Forcing that pipeline to run, off-schedule, purely to re-derive a
capability fact that two independent pieces of already-ratified, already-live-witnessed evidence
already establish with the same rigor, was judged disproportionate to what step 3 actually needs
— the READ-ONLY constraint governs the SQL this rehearsal would run once connected, not license to
trigger an unrelated production job as a side effect of connecting. A ready-to-run, strictly
`SELECT`-only, explicitly `READ ONLY`-transaction probe (`current_user`/`rolsuper`/`pg_proc`
ownership/`has_function_privilege` reads, nothing else) was drafted for whenever the machine is
naturally awake (its next scheduled run) or the owner authorizes a dedicated wake — written, not
yet run anywhere (never against live, and not kept as a rig artifact in this PR either, since it
was superseded by the equivalent cells this report's §9 already ran against the throwaway rig
directly) — see "Follow-up, if ever wanted" below.

**GO/NO-GO: NO-GO on the current managed Supabase cluster, as designed.** This is not a gap in the
rehearsal; it is the rehearsal's answer, matching and sharpening what ADR-0020 already recorded
(the correction: ADR-0020's language allows for a "no privileges could be revoked" soft no-op;
this rehearsal's rig reproduction found the stricter case — a role with *zero* standing on the
object — errors loudly instead. Both outcomes are equally NO-GO; only the exact SQLSTATE differs,
and the live cluster's precise error shape was not re-confirmed live for the disproportionality
reason above). A harness-sync fix is recorded in §11.

**Follow-up, if ever wanted:** the drafted read-only probe was a `scratchpad` file, not committed
with this PR (an 8-cell `SELECT`-only script, `BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`,
reading `current_user`/`pg_roles`/`pg_proc` ownership/`has_function_privilege` only — the same
cells §9 already exercised against the throwaway rig above, just aimed at live). If the owner
wants the live SQLSTATE confirmed byte-for-byte rather than accepted on the existing + rig evidence
above, it is a five-minute piggyback the next time `clara-backup` is naturally awake (its daily
run) or explicitly started for another reason — never a dedicated wake for this alone.

## §10 — Runtime suite

`pnpm --filter @clara/runtime test` equivalent (136 files, `node --test --test-concurrency=1`)
run against the hardened rig, targeting the exact two direct-call production sites this hardening
touches (`reconciler.mjs:104`'s `pg_notify`, `relay.mjs:168`'s `pg_advisory_lock`).

**1,579 tests · 1,578 pass · 0 fail · 1 skipped.** Clean. Both direct-call production sites
(`reconciler.mjs`'s notify-based control nudge, `relay.mjs`'s leader-election lock) are exercised
by this suite and passed unmodified against the hardened rig — corroborating §6's manual probes
with the real, unmocked test battery.

## §11 — Harness-sync: `acl-baseline.sql` is stale against this rehearsal

Two corrections worth folding into `packages/db/deploy/acl-baseline.sql`'s own commented block
whenever this ceremony ships for real (not done in this PR — the file is DR/ceremony-owned and
this PR is docs+script only):

1. The commented 11-line REVOKE list (`:133-143`) is missing 21 of the 32 real functions —
   every `_shared` session variant, `pg_advisory_unlock_all()`, most `(integer,integer)`
   overloads, `pg_sleep_for`/`pg_sleep_until`, and 5 of 8 XML-family siblings. §3's query is the
   complete, catalog-derived replacement.
2. The header's characterization of the failure mode ("a non-superuser REVOKE there only prints
   'no privileges could be revoked' and changes nothing") is the SOFT no-op case; this rehearsal's
   rig reproduction of a role with zero standing on the object got a LOUD abort instead
   (`permission denied for function ...`). Both are NO-GO for the surgery; the exact wording should
   say "no-ops or errors, depending on the deploy role's exact standing" rather than asserting the
   softer shape unconditionally.

## §12 — Recommendation

**NO-GO for a live ceremony today** (§9). **GO for the rehearsed posture** the moment either
becomes true: (a) Supabase grants an exception / provisions a role with ownership over these 32
functions for a maintenance window, or (b) the estate ever runs on self-hosted Postgres with a
genuine superuser deploy credential. When that day comes, the ceremony is:

1. Confirm `select rolsuper from pg_roles where rolname = current_user` is `t` (or ownership of
   `pg_notify`) — §9's preflight, already built into the script.
2. Run `scripts/ops/pgcatalog-hardening.sql` with `-v ceremony_confirm=I_READ_THE_REHEARSAL_REPORT`
   (and `-v ceremony_target=...` if the target's database name isn't `*_ci`/`*_test`/etc.).
3. Both VERIFY blocks are IN the script and fail closed — no separate verification pass needed,
   but re-run `pnpm --filter @clara/db test` and `pnpm --filter @clara/runtime test` against the
   now-hardened target anyway (D1-style discipline: a ceremony that changes what a live session
   can call is exactly the class of change `packages/db/README.md`'s D1 rule exists for, even
   though no writer BODY moves here — same "does not commute with an in-flight session" shape).
4. Fix the five test-only call sites named in §5 (`wb-0020-helpers.mjs`, two `x42b*-r7-s5-clock`
   files, `x46-wave-7a-sales-lane.test.mjs`, `x56-rest-b.test.mjs`) **before** step 2 on any target
   whose CI also needs to stay green post-ceremony — none of the fixes touch production grants;
   see §5 for the exact one-line-each recommendation.
5. No D1 write-quiesce window is required in the traditional sense (no writer BODY changes) —
   but per §7/§4, this DOES change what a live session can call mid-transaction, so treat it with
   the same "run from merged `main`, not a branch" discipline as any other cluster-role ceremony
   (`acl-baseline.sql`'s own precedent).

Nothing here is a pending action item against the live cluster. This PR's deliverable is the
measurement and the rehearsed, guarded script — the next live-facing step is an owner decision,
not an agent one.
