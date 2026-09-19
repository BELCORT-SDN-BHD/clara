# #1008 — the legal enforcement mode (beta: nothing dark) — final report

**Branch** `impl/1008-legal-enforcement-mode` · **worktree** `C:\Users\zhant\Desktop\clara-wt\int`
· **base** `origin/main` `511df8f8` · **HEAD** `edb2ef9ebd60e81bd376b5c121a00c8b618ddb49`

```
edb2ef9e test(db): #1008 the landing value is read from a fact the battery never moves
069f736f docs: #1008 the enforcement mode in the db, tests and web sources of truth
ebc0219a feat(web): #1008 the legal standing card chooses its copy by mode
55b91873 feat(db): #1008 0234 gives the platform a legal enforcement mode
12943d45 test(db): #1008 red cells for the platform legal enforcement mode
40f02fc6 docs: rider #1008 brief (legal enforcement mode; beta: nothing dark)   (the orchestrator's, pre-existing)
```

Nothing pushed, no PR opened, no other worktree or checkout touched, no subagent spawned.

## Per acceptance criterion

| AC | state | evidence |
|---|---|---|
| In `prompt`, a firm whose only acceptance is the signup DPA (Terms published later, unaccepted) prepares a Work model dispatch; the same firm is refused in `enforce` | **done** | `p1008.db.prompt_belcort` — one cell, both modes, same firm and client |
| In `prompt`, publishing a newer version of either kind leaves every firm's basis live; in `enforce` it withdraws until accepted, and today's cells for that rule pass under `enforce` | **done** | `p1008.db.prompt_survives_publication` (both halves) + `w631.prep.superseded`, which now sets `enforce` explicitly and passes unchanged |
| No cell, door or migration inserts an acceptance row for a person who did not act; the minted consent cites a row that person made | **done** | `p1008.db.no_manufactured_acceptance` reads the catalog: `clara.accept_legal_document` is still the ONLY body in the estate with `insert into clara.legal_acceptances`. 0234 §0 measures it before and §T.8 after. `p1008.db.prompt_terms_only` matches the consent's `legal_acceptance_id` against that owner's own rows |
| In `prompt`, a firm whose active owner has never accepted either kind is still refused with the one `unknown` answer | **done** | `p1008.db.prompt_no_acceptance` — the same `{verdict:"unknown",authorization_id:null}` and the same `{"live":false}` under both modes |
| Only the operator firm's owner can change the mode; any other caller is refused by rank; every change leaves a receipt | **done** | `p1008.db.mode_door_floor` (no firm / ordinary-firm owner / operator bookkeeper / unauthenticated), `p1008.db.mode_door_receipt` (receipt + `clara._audit` row + `updated_by`/`updated_at` from one `now()` sample + byte-identical replay + `op_key_conflict`), `p1008.db.mode_door_vocabulary`, `p1008.db.mode_doors_posture` |
| The sticky revoke, the deactivate/reactivate pair, the inactive-client arm and the membership arm behave identically in both modes (existing cells unchanged) | **done** | `p1008.db.revoke_sticky`, `p1008.db.deactivate_reactivate`, `p1008.db.prompt_inactive_client` — each loops over both values. The membership arm is `clara._record_journal_entry_core`'s, untouched by 0234; `work-egress-authority.test.mjs` 37/37 |
| The legal standing read reports the mode, and the settings card shows the `prompt` copy without the "cannot use a model" sentence | **done** | `p1008.db.standing_reports_mode`; `p1008.web.legal_prompt_copy` / `legal_enforce_copy` / `legal_live_copy`; e2e scenario (2b) |
| A from-scratch chain and the estate suite pass; no applied migration edited; bodies pinned by later migrations re-measured, never transcribed | **partial** | 0234 applied cleanly on the first attempt to the rehearsal rig (228 → 229). **A from-scratch chain and the full estate suite are the orchestrator's/CI's job and were NOT run here** (the brief forbids a second from-scratch chain on this cluster). No merged migration was edited (`git diff --stat` touches only the new 0234). Every pin was MEASURED on the rig off `pg_proc.prosrc` |
| The report states the hosted effect and the release-time count | **done** | the section below |

## Per historical row

There are no historical rows on this ticket; #1008 is a rider with an Agent Brief only.

## What was built

**`packages/db/migrations/0234_legal_enforcement_mode.sql`** (1072 lines, the only new migration).

* `clara.legal_enforcement` — one row, FORCE RLS, a single `clara_fn_owner` policy, **zero**
  application-role privilege, a two-value CHECK, no-delete + no-truncate, seeded at `prompt`
  (0186's `clara.admission_capacity` shape).
* `clara._legal_enforcement_mode()` — the one body every wall and every read consults, granted to
  nobody, `coalesce(..., 'enforce')` so an absent row fails **closed**.
* `clara.set_legal_enforcement_mode(text,text,text)` / `clara.get_legal_enforcement_mode()` —
  operator-firm-owner floor (`set_admission_capacity`'s predicate, whose own `prosrc` sha is pinned
  in §0 so "copied from that door" is a checked claim), `_reserve_op` idempotency, `clara._audit`
  receipt naming actor / new mode / previous mode, one advisory key of its own, `now()` sampled once.
* `clara._accounting_work_egress_live(uuid,uuid)` — recut. `enforce` is 0195's arm carried forward
  (§T.4 asserts five of its literal predicates from the live source). `prompt` is an active client
  plus an active **owner** holding ≥1 real acceptance of either kind at any version, citing that
  owner's most recent DPA acceptance when one exists and their most recent Terms acceptance
  otherwise, on kind-neutral keys (`basis_acceptance` / `basis_kind` / `basis_version`). Still
  ungranted, still arity 2, negatives still one `{"live": false}`.
* **Three splices**, house pattern, each anchor asserted to occur exactly once — and each block goes
  one step further than the family usually does: after installing, it re-reads the committed body,
  applies the **reverse** substitution and requires the remainder to hash to the pinned pre-image
  byte for byte. `prepare_egress_dispatch`'s mint arm (3 anchors), `restore_client_egress_purpose`
  (3), `get_firm_legal_standing` (1). `consume_egress_dispatch` is byte-unmoved (§0 and §T.6).

**Web** — `enforcementMode` on `FirmLegalStanding`, decoded with `enforce` as the fail-closed
default; one ternary on the card's banner body; one new message key; the e2e mock answers `prompt`
(what hosted answers after 0234) and the walk fixture takes the mode with `enforce` as its default
so every pre-existing scenario keeps asserting today's copy.

## Assumption I took, and it is the one to review

**`clara.restore_client_egress_purpose` was recut, which decision 5 allowed only "if it only calls
the helper".** I measured it and it does not: it cites `v_live->>'dpa_acceptance'` in its consent
insert, its audit row and its event, and writes a scope note naming both kinds.
`ck_client_egress_purpose_consents_evidence` (0195:502) requires `legal_acceptance_id IS NOT NULL`
for `accounting_work`, so under `prompt` a Terms-only firm that revoked and then restored would have
raised a raw **23514** — an estate defect, not a refusal, and the exact class 0195's own review round
closed. `p1008.db.restore_prompt` is that scene, and it is green only because of the splice. The
door's CLR28 `derived_basis_not_live` refusal, its owner floor, its three other typed refusals, its
op_key idempotency and its mint-a-fresh-pair shape are untouched (`p1008.db.restore_basis`).

## Tests added

| file | what it proves |
|---|---|
| `packages/db/tests/legal-enforcement-mode.test.mjs` | 26 cells (23 + 3 added in fix round 1 for review findings A3/A4: an acceptance held by a non-owner member or another firm's owner founds nothing in either mode; demoting and then removing the accepting owner withdraws the prompt basis; two CONCURRENT first dispatches, forced into one mint window and observed blocked, mint exactly one consent, one activation, one audit row and one event): the relation's posture and the predicate's ungrantedness; the basis under each mode (BELCORT shape, Terms-only, no acceptance at all, inactive client, a newer publication, the enforce payload); the mint's evidence in all three shapes; sticky revoke and deactivate/reactivate in both modes; restore under `prompt`; the door's floor, vocabulary, replay and receipt; the standing read's mode; that every recut moved off its pre-image and `consume_egress_dispatch` did not; that nothing manufactures an acceptance |
| `packages/db/tests/legal-enforcement-mode-fixtures.mjs` | the frontier gate, the two door wrappers, the labelled root arrangement and the catalog readers |
| `packages/db/tests/legal-enforcement-mode-preintegration-gate.mjs` | the sweep's escape; a focused run does not preload it and fails loudly |
| `apps/web/lib/firm/commercial-reads.test.ts` (+2) | `enforcement_mode` decodes in both values; an absent, null or unknown mode reads as `enforce` and never drops the whole payload |
| `apps/web/components/firm-admin/legal-standing-card.test.tsx` (+3) | the prompt copy asks and never says the model is off; the enforce copy is today's, byte for byte; a live standing reads the same in both modes |
| `apps/web/e2e/firm-commercial-walk.spec.ts` (+1) | scenario (2b): the same outstanding agreement under `prompt`, with its own axe scan |

**Vacuity control.** Every behavioural db cell asserts BOTH modes inside one cell — a body that
ignored the mode could not pass `prompt_belcort` (unknown under `enforce`, granted under `prompt`,
same firm, same client) or `prompt_survives_publication`. The red the ticket started from was the
premise check: all 23 cells failed loudly against the pre-0234 rig (`# fail 23`, zero skips), and
the web cells failed 3/29 before the decoder and the card moved.

## Commands and counts

Rig: `PGHOST=127.0.0.1 PGPORT=55730 PGUSER=postgres PGDATABASE=clara_reh CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`,
PostgreSQL 17.11, frontier 228 → **229** (`0234_legal_enforcement_mode`). `CLARA_RIG_ALLOW_RESET`
and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set; no second from-scratch chain was run; 0234 applied
once, cleanly, and was never re-applied.

| command | result |
|---|---|
| `pnpm db:migrate` | `1 new migration(s) applied · 229 total`; prestate, seed, three splice notices and the tail all printed OK |
| `node --test --test-concurrency=1 tests/legal-enforcement-mode.test.mjs` (focused, no gates) | **26 pass / 0 fail / 0 skip** (23 pass before fix round 1) |
| …same file with the **50-gate chain** from `packages/db/package.json` | **23 pass / 0 fail / 0 skip** (measured before fix round 1's three cells; the focused 26-cell run is above) |
| …the same battery BEFORE 0234 existed | **0 pass / 23 fail / 0 skip** — the premise check, failing loudly as a focused run must |
| `tests/work-egress-authority.test.mjs` (0195 + 0211) | **37 pass / 0 fail / 0 skip** |
| `tests/firm-commercial-settings.test.mjs` (0233) | **24 pass / 0 fail / 0 skip** |
| `tests/legal-acceptance.test.mjs` (0185/0187) | **19 pass / 0 fail / 0 skip** |
| the four above + `operation-census` + `rig-isolation`, with the 50-gate chain, in one run | **110 pass / 0 fail / 1 skip** (the skip is `rig-isolation` T19, destructive, gated on `CLARA_RIG_ALLOW_RESET`) |
| `tests/operation-census.test.mjs` (no reset flags) | **10 pass / 0 fail / 0 skip** |
| `tests/rig-isolation.test.mjs` (no reset flags) | **20 pass / 0 fail / 1 skip** (T19, as above) |
| `tests/f-a3-pr1c-egress-bank-matching` / `f-a7-gamma-egress` / `wave-a-egress` / `work-journal-post` | **7 / 21 / 13 / 33**, all pass, 0 fail, 0 skip |
| `tests/x42b0-r7-s5-clock.test.mjs` (arm (D)'s roster) | **4 pass / 0 fail / 0 skip** |
| `pnpm typecheck` (worktree root) | exit 0 |
| `pnpm lint` (worktree root) | exit 0 |
| `node scripts/run-tests.mjs` from `apps/web` (WHOLE suite) | **4633 tests, 4631 pass, 0 fail, 2 skipped**, 135 suites, 69.6 s. The 2 skips are pre-existing: the live-Supabase-auth provider cells, `CLARA_LIVE_SUPABASE_AUTH_URL` not configured |
| `node scripts/check-frozen-workflows.mjs` | `OK — 312 frozen file(s) verified … 55 "use workflow" module(s) all frozen+registered` — **no diff to `frozen-workflows.json`**, and no runtime file is in the diff at all |
| `pnpm --filter @clara/web e2e firm-commercial-walk` (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3400 CLARA_E2E_NEXT_PORT=3401 CLARA_E2E_RUNTIME_PORT=3402`) | **9 passed (22.6 s)**, exit 0 — 8 pre-existing scenarios plus the new (2b); no `next build` retry was needed |

One census suite red on the first whole-`apps/web` run and is fixed:
`tests/firm-scope-db-pins.test.ts` refused 0234's dynamic SQL as an *unreviewed* barrier
(`unmodelled: unreviewed dynamic-SQL barrier at 0234_legal_enforcement_mode.sql`). The reviewed
entry is now in `apps/web/tests/firm-scope-db-pins.corpus.ts` at the sorted position, keyed on the
file's content sha256 `ed995a59f88e4369dc02c654ea1ebb2dcdfc7f7e3bec4dedbdd802acb4ccec25`.
**If the migration file is edited at integration, that sha must be re-measured** —
`node -e "..createHash('sha256').update(readFileSync(f,'utf8'),'utf8')..`.

## Docs updated

| file | section |
|---|---|
| `packages/db/README.md` | new "## 0234 — the platform's legal enforcement mode (#1008)": the two values, the four objects and their floors, the write door copied from `set_admission_capacity`, the three splices and their reverse-substitution proof, why `restore_client_egress_purpose` had to move, what `get_firm_legal_standing` keeps, the writer-quiescence deployment note and the rollback |
| `packages/db/tests/README.md` | new "## `legal-enforcement-mode.test.mjs`": the both-modes vacuity control, why the mode is arranged at root and exercised through the door, the one 0195 cell that now sets it — plus (fix round 1) the hostile-provenance pair and why the concurrent first dispatch is a FORCED window rather than a hoped-for one |
| `apps/web/README.md` | `/settings/firm` — the copy per mode and the fail-closed default for a build landing ahead of the migration |
| `CONTEXT.md` | new term **Legal enforcement mode**, in the house `term / _Avoid_` shape, before "Billing plan" |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | 0234's reviewed dynamic-SQL barrier (a review act, not a doc) |

`docs/PRD.md` and `docs/ARCHITECTURE.md` were NOT edited.

## Blueprint drift

* `docs/ARCHITECTURE.md` §5.E / §10 state 0195's activation assumption as **the** rule ("the firm's
  current accepted Terms AND DPA at their published versions"). From 0234 that is the `enforce`
  reading of a two-valued mode, and the platform ships at `prompt`. The ticket already records this
  as drift to fold into #683; it is stated here for the orchestrator, not edited.
* The same sections describe "a newer published version withdraws every firm's authority" as
  unconditional. Under `prompt` it withdraws nothing.

## Successor contract

None. #1008 adds no Work-lane or chat-lane tool and no runtime module; `packages/runtime` is not in
the diff, and `check-frozen-workflows.mjs` reports no manifest change.

## Follow-ups worth filing

1. **An operator console control for the legal enforcement mode.** `clara.set_legal_enforcement_mode`
   and `clara.get_legal_enforcement_mode` ship with no web surface at all, exactly as decision 2
   says. Flipping the estate to `enforce` before the official launch is therefore a SQL act today.
   The operator console (`0188`'s destination) is where the pair belongs: a read of the current mode
   with who set it and when, and a confirm-dialog flip with a required reason — the same shape
   `set_admission_capacity` will eventually need beside it.
2. **`clara.admission_capacity` and `clara.legal_enforcement` are now two singleton operator settings
   with the same shape and no shared home.** Both are one-row FORCE-RLS relations with a
   `_state`/`_mode` predicate, a `set_*` door and a `get_*` door, and each duplicates the other's
   operator-firm predicate in four bodies. A third will make that a pattern worth extracting; it is
   not worth extracting for two, but it is worth writing down before the third arrives.
3. **`egress.purpose_consent_derived` and `.._restored` now carry keys no reader reads.**
   `enforcement_mode`, `basis_kind`, `basis_version` and the two kind-named acceptance ids are
   written for the record, and nothing in `apps/web` or `packages/runtime` reads a domain-event
   payload for this family. When the evidence surface for model egress is built, these are the keys
   it should render — and the release-time count below is the query that should become part of it.
   That ticket also owns two facts this one deliberately leaves alone: a consent minted under
   `prompt` is NEVER re-derived, so after the launch flip it still reads as a beta-mode citation
   (possibly of a Terms acceptance) and the surface must join it to a fresh
   `clara._accounting_work_egress_live` answer; and `terms_version` / `dpa_version` change meaning
   with the mode, so `enforcement_mode` must be read BEFORE either is rendered. Deciding whether the
   flip re-derives or annotates the beta-era rows belongs there too.

## Anything unverified

* **A from-scratch 0001→0234 chain, and the full db estate suite.** Not run: the brief forbids a
  second from-scratch chain on this cluster, and the estate suite is the orchestrator's/CI's job.
  0234's §0 prestate is written to fail loudly rather than silently on a chain whose bodies differ
  from the pins, so a from-scratch run either applies cleanly or names the body that drifted.
* **Hosted evidence: pending.** Every number above is local. The hosted counts below are the QUERY,
  measured for shape on the rig — not the hosted answer.
* **The runtime suite and the whole browser suite.** Not run here (orchestrator/CI). I ran the one
  browser walk I touched.
* **`packages/runtime/scripts/check-parts-parity.mjs`** was not run: nothing in this slice is
  reachable from a frozen body, and `check-frozen-workflows.mjs` is green with no manifest diff.

---

# Decision 11 — what the release needs

## 1 · The hosted effect, in one paragraph

After 0234 applies, `clara.legal_enforcement.mode` is **`prompt`**. Every admitted firm whose active
owner holds at least one real `clara.legal_acceptances` row — which, on this estate, is every firm
admitted through checkout, because checkout has always required a DPA acceptance (0186) — gets
Work's use of the model back **with no owner action and no sweep**. `/settings/firm` still says the
standing is not current (deliberately: that is the fact that lets it ask) but the sentence under it
becomes "Please accept the current versions of both agreements. During the beta this does not stop
Clara working on your clients' books — it will be required before the official launch." Nothing
else moves: an inactive client, an owner's revoke, an owner's deactivate and the initiator losing
firm membership all still stop the work, in both modes.

**Rollback needs no migration — but it needs a precondition this report cannot measure.** The
flip has no web surface (follow-up 1), so it is a `psql` act by an ACTIVE OWNER of the firm carrying
`is_operator`, and `clara.firms.is_operator` is set only by a raw ops act (0133's tail: "ZERO firms
are marked operator by this migration"). The rehearsal rig carries NO operator firm at all
(measured: `select count(*) from clara.firms where is_operator` = 0), and the only in-repo claim
that hosted has one is a 2026-09-14 document, not a measurement. **Before the window, run this
read-only query on hosted; zero rows means nobody can reach the door:**

```sql
select f.id as operator_firm_id, f.name as operator_firm_name,
       m.user_id as owner_user_id, u.email as owner_email
  from clara.firms f
  join clara.firm_memberships m
    on m.firm_id = f.id and m.status = 'active' and m.role = 'owner'
  join clara.users u on u.id = m.user_id
 where f.is_operator
 order by m.created_at;
```

The flip itself, as that owner — this is the form that leaves the `clara._audit` receipt naming the
actor, the new mode and the previous one:

```sql
begin;
  set local role clara_authenticated;                    -- the door is granted to this role only
  select set_config('request.jwt.claims',
    json_build_object('sub', '<owner_user_id from the query above>',
                      'role', 'authenticated')::text, true);
  select clara.set_legal_enforcement_mode(
    'enforce', 'rollback: <why>', 'rollback-<yyyy-mm-dd>-<unique>');
commit;
```

LAST RESORT, only if no operator firm with an active owner exists: `update clara.legal_enforcement
set mode = 'enforce' where id;` as the superuser satisfies the CHECK and the wall reads it at once,
but it writes NO audit row, NO `updated_by` and no receipt. All three forms are now in
`packages/db/README.md`'s 0234 section as well, because that is where a release reads them.
**Hosted evidence pending:** the precondition query was verified for SHAPE on the rig only
(`begin read only` … `rollback`, 2026-09-20).

**What a `prompt`-era consent keeps after the flip.** A consent is minted ONCE per (firm, client,
`accounting_work`) and is never re-derived — `prepare_egress_dispatch`'s guard is `not exists` over
EVERY row of the purpose, live or revoked (0195's, carried through the splice unchanged). So every
consent minted during the beta SURVIVES the launch flip exactly as written: a prompt scope note and,
for a Terms-only owner, a `legal_acceptance_id` pointing at a TERMS acceptance. It grants nothing on
its own — `prepare_egress_dispatch` re-derives the basis on every `accounting_work` call, so the flip
withdraws authority on the next dispatch, and the only residual window is an already-issued
authorization's 120s TTL (0195's shape). But the consent row is the estate's DURABLE record of the
lawful basis, so any launch-time evidence read must join it to a FRESH
`clara._accounting_work_egress_live` answer rather than trust the stored `scope_note`, and must read
`enforcement_mode` before it renders `terms_version` / `dpa_version` (ACCEPTED versions under
`prompt`, PUBLISHED under `enforce`). Whether the flip should re-derive or annotate those rows is a
decision a later ticket owes; 0234 deliberately does neither. No code change before release.

**Deployment order.** 0234 recuts four live bodies, so it rides the writer-quiescence window (stop
new writes, drain, apply, resume). It owes no consumer-first obligation in the other direction: the
web reads a NEW key and defaults a missing one to `enforce`, so the web build may land before or
after the migration without ever claiming something the database has not been taught.

## 2 · The read-only count SQL

Runs on a **pre-0234 or post-0234** database — it re-derives both predicates from base relations and
calls nothing 0234 creates. Read-only; run it inside `begin read only; … rollback;`. Verified for
shape on the rehearsal rig (`begin read only` + `rollback`, 2026-09-20); the numbers it returned
there are rig noise, not hosted evidence.

```sql
-- #1008 release count: which firms' derived accounting_work basis FLIPS when the mode becomes
-- `prompt`.  enforce_live = 0195's rule.  prompt_live = 0234's beta rule.  Read-only.
with published as (
  select max(version) filter (where kind = 'terms') as terms_version,
         max(version) filter (where kind = 'dpa')   as dpa_version
    from clara.legal_documents
   where status = 'published'
),
firm_basis as (
  select f.id   as firm_id,
         f.name as firm_name,
         f.is_operator,
         (select count(*) from clara.clients c
           where c.firm_id = f.id and c.status = 'active')::int as active_clients,
         ( (select terms_version from published) is not null
           and (select dpa_version from published) is not null
           and exists (
             select 1
               from clara.firm_memberships m
               join clara.legal_acceptances ta
                 on ta.user_id = m.user_id and ta.kind = 'terms'
                and ta.version = (select terms_version from published)
               join clara.legal_acceptances da
                 on da.user_id = m.user_id and da.kind = 'dpa'
                and da.version = (select dpa_version from published)
              where m.firm_id = f.id and m.status = 'active' and m.role = 'owner')
         ) as enforce_live,
         exists (
           select 1
             from clara.firm_memberships m
            where m.firm_id = f.id and m.status = 'active' and m.role = 'owner'
              and exists (select 1 from clara.legal_acceptances a where a.user_id = m.user_id)
         ) as prompt_live
    from clara.firms f
)
select count(*) filter (where not enforce_live and prompt_live)      as firms_that_flip_to_live,
       count(*) filter (where not enforce_live and not prompt_live)  as firms_still_not_live,
       count(*) filter (where enforce_live)                          as firms_already_live,
       coalesce(sum(active_clients) filter (where not enforce_live and prompt_live), 0)::int
                                                                      as active_clients_that_flip,
       coalesce(sum(active_clients) filter (where not enforce_live and not prompt_live), 0)::int
                                                                      as active_clients_still_refused,
       (select terms_version from published)                          as published_terms_version,
       (select dpa_version   from published)                          as published_dpa_version
  from firm_basis;
```

`firms_still_not_live` is the class the ticket expects to be **empty** on hosted: an active owner who
has never accepted anything at all. If it is not zero, those firms stay refused under `prompt` too —
by design, because there is no real acceptance to found an authority on — and each one needs an owner
to accept before its Work can use the model. The per-firm listing is the same CTE with
`select f.id, f.name, f.is_operator, active_clients, enforce_live, prompt_live from firm_basis order by firm_name;`.

## 3 · The exact prestate pins 0234 checks

All six measured on the rehearsal rig at 228 migrations (0001→0233, PG 17.11) as
`encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')` keyed by `to_regprocedure` — never transcribed
from a creating migration's file text. **0234 refuses to apply if any one has moved.**

| # | signature | sha256(prosrc) | role in 0234 |
|---|---|---|---|
| 1 | `clara._accounting_work_egress_live(uuid,uuid)` | `53f690091c24bb82ec529d5cb818647374d0181ed609777155d2f9eae87596a0` | PRE-IMAGE — whole-body recut (§B) |
| 2 | `clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)` | `f051fe1ff8cacfe15e570b668413e43d41e562b78f0f99524d03bf0889dcb3a9` | PRE-IMAGE — 3-anchor splice (§C), and the target of §C's reverse-substitution proof |
| 3 | `clara.restore_client_egress_purpose(uuid,text,text)` | `97e3f3ee783bb18374d5f8efb51fe14569a9ea2ad16e601058a52a65731f1cba` | PRE-IMAGE — 3-anchor splice (§D), same proof |
| 4 | `clara.get_firm_legal_standing()` | `42fc6a6630a29462e74953635abd81928ecbb02dbb1e4fac1dc6dd78939ff8b9` | PRE-IMAGE — 1-anchor splice (§E), same proof |
| 5 | `clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)` | `f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3` | NON-REGRESSION — must be byte-unmoved before AND after (§0 and §T.6) |
| 6 | `clara.set_admission_capacity(integer,text,text)` | `190d0fe847c2ab24eb6a257c68e2478f10c5df857f96e085846f6b43243a7c86` | NON-REGRESSION — the door whose shape the new write door copies; pinning it makes "copied from" a checked claim (§0 and §T.6) |

0234 also measures, before it edits: that `clara.legal_enforcement` and the three new names are
wholly absent; that `ck_client_egress_purpose_consents_evidence` still requires
`legal_acceptance_id IS NOT NULL` for `accounting_work`; and that **exactly one** body in the estate
carries `insert into clara.legal_acceptances`. §T re-reads the last two after applying, and adds the
whole posture census (relation grants, policies, triggers, CHECK, both doors' ACLs and operator
predicates, the predicate's ungrantedness, the recut helper's arity and ACL, and the three splices'
ACLs and surviving guards).

Verify the pins on the target before the window, from any working directory:

```sql
select p.oid::regprocedure::text as sig,
       encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
  from pg_proc p
 where p.oid = any (array[
   'clara._accounting_work_egress_live(uuid,uuid)'::regprocedure,
   'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure,
   'clara.restore_client_egress_purpose(uuid,text,text)'::regprocedure,
   'clara.get_firm_legal_standing()'::regprocedure,
   'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)'::regprocedure,
   'clara.set_admission_capacity(integer,text,text)'::regprocedure])
 order by 1;
```
