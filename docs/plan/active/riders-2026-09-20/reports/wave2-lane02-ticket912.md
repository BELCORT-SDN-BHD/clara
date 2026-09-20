# Wave 2 · lane 02 · ticket #912 — Record the promoter's role at the instant of a firm-knowledge governed act

**Branch** `riders/w2-lane02` · **base** `23cfad947b5598214168ba9c43d391b4e16aa745` · **worktree**
`C:\Users\zhant\Desktop\clara-wt\636` · **database** `127.0.0.1:55742/clara_l02`

**Status: DONE.** The ticket was live on this branch before I built (verified: `clara.audit_log` had
no role column, `clara._audit` still carried its 0004 body, and `clara.list_firm_knowledge`'s
authority block still emitted only `promoter_role_now`).

## Commits (mine, newest first)

| commit | what |
|---|---|
| `f9d755c97` | `test(db)` declare `_tf_audit_actor_role` on the S5.25 arm (D) clock roster |
| `0622e3352` | `docs(db)` the battery's header names the trigger, not a recut of `_audit` |
| `3290dcfe1` | `feat(web)` the firm register renders the role at the act as its own fact (+ all docs) |
| `72cc5e0f6` | `test(db)` ar.05 — the census that makes "every governed door" mean something |
| `80a491e63` | `test(db)` ar.04 — a record the mechanism never saw reports unknown |
| `20f603461` | `feat(db)` the firm register cites the role at the act beside the role now (§C) |
| `b4402905e` | `test(db)` ar.02 — history keeps its unknown and nothing can back-fill it |
| `f839ad1ea` | `feat(db)` record the actor's role at the instant on `clara.audit_log` (§A/§B) |

Tickets before mine on this branch (`363054f2e` … `c8cc4cf5a`: #993, #913, #898) were already landed
and applied; I did not touch their files except the two shared ones noted under *Shared files*.

## The seams I tested at (written down before the first test, work order rule 4)

The owner's 2026-09-18 ruling names three interfaces, and every cell sits on one of them:

1. **A governed door → the committed `clara.audit_log` row it leaves behind.** `clara.capture_knowledge`
   and `clara.create_client`, walked through `humanQuery` at the least privilege that should succeed;
   the row is READ BACK with `rootQuery` (the rig's own "mint a world / read back a table" idiom,
   never as the caller of the act).
2. **`clara.list_firm_knowledge()`** — the firm register read, through `humanQuery` as the **viewer**
   (the read's own floor).
3. **The catalog**, for the census the ruling asks for by name ("every governed door inherits the
   column with no per-door change (a census over `_audit` callers)") — the structural cell this
   repo's standard asks for.
4. **`KnowledgeFirmPanel`'s rendered behaviour**, through the real component against a mocked
   PostgREST (`knowledge-firm-panel.test.tsx`'s existing harness).

No cell tests an internal collaborator, a private function or a side channel.

## The one deviation from the ruling's named interface, and why

The ruling says *"`clara._audit` (the shared writer) gains the actor's rank"*. **`clara._audit` cannot
be recut.** It is **ordinal 10 of the frozen `metric_input_snapshot` v1 producer closure**:

- `clara.metric_input_producer_version_members` pins `sha256(pg_get_functiondef(...))` for each of the
  15 members; `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` is one of them, in **two** version
  rows.
- `clara.verify_metric_input_producer_freeze()` hard-codes that 15-signature roster in its own body
  and raises `metric input producer freeze mismatch` on any drift.
- `packages/db/scripts/migrate.mjs`'s `FREEZE_GUARDS` (label `metric input producer`,
  `protectedRows: "true"`) re-reads every protected row's evidence before and after each migration.

Measured, not assumed: my first draft of 0243 **did** recut `_audit`, and the runner rolled the whole
migration back with

> `migrate: FAIL — migration 0243_audit_actor_role failed and was rolled back: metric input producer protected freeze evidence changed during the migration — refusing to migrate`

There is no version-bump escape: the freeze reads the **live** body of every version row's members, so
a new producer version cannot release an old one's pin.

**What I built instead:** a `BEFORE INSERT` row trigger, `t_audit_actor_role` →
`clara._tf_audit_actor_role()`, on `clara.audit_log` itself. It satisfies every clause of the ruling
and is strictly **wider** than the recut would have been (the stamp is on the table's write path, so
it reaches any writer, not one function), and it leaves the frozen body byte-for-byte as 0004 wrote
it — which is also what makes the column unforgeable, because `_audit`'s `INSERT` column list does not
name `actor_role` and now never can. §0 and §Z both pin `_audit`'s body and re-run the freeze verifier.

**Second design decision the ruling did not settle:** `NULL` had to mean one thing. The wake lane's
actor is always the global agent identity (0004's own lane split), which holds no membership, so if
"no active membership" also wrote `NULL`, the ruling's "unknown" would itself be a guess. The column
therefore carries a **three-way**: `NULL` = predates the mechanism (unknown, never guessed);
`'none'` = measured, no active membership in this firm; otherwise the role. `clara.role_rank('none')`
is `NULL`, so the marker can never be compared as authority.

## Acceptance criteria, each with its evidence

Battery: `packages/db/tests/audit-actor-role.test.mjs` (ar.01–ar.05, 5/5) and
`apps/web/components/registers/knowledge-firm-panel.test.tsx` (kf.12, kf.13; file 14/14).

| AC (ruling 2026-09-18 + brief) | cell | evidence |
|---|---|---|
| A cell promotes a default as owner, demotes the member, and proves the register still reports the authorising role beside the new current role | **ar.03** | An OWNER promotes `default_currency` at firm scope; a second owner (minted so `clara._tf_guard_last_owner` cannot refuse) demotes them to bookkeeper through the real `clara.set_member_role` door; `clara.list_firm_knowledge()` as **viewer** then reports `promoter_role_at_act='owner'`, `promoter_role_now='bookkeeper'`, `required_role='admin'`, `promoter_active=true` — four facts, three of which disagree. Red before §C with `expected: 'owner'`, actual `undefined`. |
| A cell proves a pre-mechanism record reports its historical role as unknown | **ar.04** | A promotion minted exactly as a pre-#912 database holds one (the revision + the audit row `clara._knowledge_insert_revision` writes beside it, both dated 400 days back). The audit row keeps its `NULL` for a real reason — the stamp refuses to invent a role for a row arriving from the past — and the cell asserts that first. The register then reports `promoter_role_at_act=null` while `promoter_role_now='admin'` is still reported as the separate fact it is. |
| Every governed door inherits the column with no per-door change (a census over `_audit` callers) | **ar.05** + §Z | Cell: `clara.audit_log` has exactly **one** writer (`clara._audit`); `_audit` has exactly **one** overload and its identity arguments are unmoved; **≥300** clara functions call it; `clara.create_client` — a 0004 door in a lane this ticket never touched — records `'admin'` with no edit of its own; an audit row whose actor is the global agent identity records `'none'`, not `NULL`, and `clara.role_rank('none')` is `null`. Migration tail pins the exact frontier census at **304** callers and the sole-writer array at `{clara._audit}`. |
| No back-dated authority / history rows stay honest, no backfilled guess | **ar.02** + §A | §A measured it in the transaction that minted the column: *"clara.audit_log.actor_role added; all 66879 pre-existing row(s) stay NULL (unknown), none back-filled."* ar.02 re-measures from outside (≥60 000 rows still `NULL`), then proves it as an **enforced property**: an `UPDATE … set actor_role='owner'` on a pre-mechanism row, run as `clara_fn_owner` (the highest privilege any migration or definer body reaches), is refused **CLR08 `audit_log is append-only`**. It also proves a row arriving with a past timestamp is never stamped, with a control beside it proving the stamp was armed the whole time. |
| No existing writer breaks | **whole db suite** + §Z | `_audit`'s signature, definer posture, owner and grant are pinned unchanged in §Z; the `relacl` is table-level (`clara_authenticated=r/clara_fn_owner`) with every `attacl` null, so the new column inherits exactly the old audience and no grant was added; `p_audit_log_human`'s qual is pinned unchanged. 0192's and 0220's batteries stay green (48/48), and the whole `packages/db` suite run (below) produced **no failure naming `actor_role`, `audit_log` or any door**. |
| The register surface renders the two as two facts | **kf.12 / kf.13** | kf.12: a demoted promoter's rule shows "Their role at the time · owner" beside "Their role now · bookkeeper". kf.13: a pre-mechanism rule shows *"Not recorded — this rule predates the record of authority"* and still shows the current role. Both were red before the render existed. |
| Applies from scratch | **not run here** | Per `RIG.md`'s wave-2 addendum the integrator runs the from-scratch proof on a disposable cluster; a lane must never run a second from-scratch chain on its own (migration 0154 pins the cluster-wide role count). 0243 is ordinary `alter table` / `create or replace` / `create trigger` / `create index if not exists` DDL with no data dependency, and its prestate admits only the pristine or its own state. **Unverified on this rig.** |

**Deliberately left out of scope** (the ticket's own list): no membership-revision relation; no
back-dating of any authority; no change to the role ladder or to any door's floor; no re-evaluation of
work already run under an authority later found insufficient; `clara.list_client_knowledge` untouched
(the ruling names only the FIRM register).

## Migration

**`packages/db/migrations/0243_audit_actor_role.sql`** (the number reserved for me), 501 lines.
Ledger checksum after the final apply: `118d0c0faecc0138ba96717d9859562c550c782a826c19943eeb4335e1e502f0`.

- **§0 prestate** — fail-closed, two legitimate live states only (first apply, or a #957 redo of this
  unedited file).
- **§A** — `clara.audit_log.actor_role text` (no DEFAULT) + `ck_audit_log_actor_role`
  (`actor_role is null or actor_role in ('viewer','bookkeeper','admin','owner','none')`) + a column
  comment. Measures the no-backfill claim in the same transaction.
- **§B** — `clara._tf_audit_actor_role()` (definer, `search_path=clara, pg_temp`, ungranted) and the
  `t_audit_actor_role` BEFORE INSERT row trigger.
- **§C** — `ix_audit_log_knowledge_revision on clara.audit_log (firm_id, (args ->> 'revision_id'))
  where args ->> 'revision_id' is not null`, and the `clara.list_firm_knowledge` recut (one new key).
- **§Z tail** — column + CHECK shape; trigger by `tgtype=7` (ROW|BEFORE|INSERT) and `tgfoid`; trigger
  body's definer posture and ungranted ACL; sole-writer census `= {clara._audit}`; caller census
  `= 304`; `_audit`'s args/secdef/config/owner/acl/prosrc all unmoved; `perform
  clara.verify_metric_input_producer_freeze()`; register prosrc + posture + ACL; the index exists;
  `clara.audit_log`'s trigger set; `relacl`; zero `attacl`; `p_audit_log_human`'s qual.

### Prestate pins, MEASURED on this rig before authoring

| object | pin | note |
|---|---|---|
| `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` | `000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1` | single **hard** value in both §0 and §Z — this file must not move a frozen body |
| `clara.list_firm_knowledge()` — pre-recut (0220) | `caea06da6e33a5c173a88ee7b5fe2327caa714d1df797ae148ed07c35a548797` | verified byte-identical to 0220's own file text before §C was built from that text |
| `clara.list_firm_knowledge()` — post-recut (§C) | `ad8aaed83a289679b16efb0668abfeafcaa7538e9a2baf8452e3c237406a9b31` | §Z pins this one hard |

Neither body had been recut by this lane's earlier tickets (#898's 0240 recut
`clara._knowledge_assert_value`, which this file does not touch).

### Redos used (#957), as required to be recorded

`CLARA_MIGRATION_REDO=0243_audit_actor_role` with `CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, four
successful redos: (1) restoring the trigger byte-for-byte after ar.02's mutation drill; (2) applying
§C; (3) after the ar.04 mutation drill; (4) after the lint-driven edits. Two redos were **refused**,
both correctly: once by §0's own pin (`clara.list_firm_knowledge carries prosrc sha256 7d04062b…,
neither the 0220 pin nor the post-recut pin`) while the mutant body was still installed — the
fail-closed guard doing its job, after which I restored the body from §C's own text — and once by
plpgsql (`"v_tgtype" is not a known variable`) on a half-finished edit.

### One rig repair, recorded

The first ar.02 mutation drill left four synthetic probe rows (`fn='rig_912_replayed_history'` /
`'rig_912_act_now'`) stamped by the mutant. I deleted exactly those rows as the superuser under
`set session_replication_role = replica`. No real audit row was touched, and the cell was then
rewritten so it no longer depends on `schema_migrations.applied_at` (a redo rewrites that timestamp,
which would make every row written between the first apply and the redo look pre-mechanism).

## Gates, with counts

| gate | result |
|---|---|
| `packages/db` — files touched, with the FULL gate chain | `audit-actor-role` (5), `knowledge-firm-defaults` (21), `knowledge-fye-day`, `knowledge-scope-default-drop`, `knowledge-key-grammar`, `preintegration-gate-chain` (5), `operation-census` (10), `rig-isolation` (22 + 1 skip), and the four `x42*s5*clock` batteries (12) → **96 tests, 95 pass, 0 fail, 1 skip** |
| `packages/db` — WHOLE suite (`pnpm test`, full chain, 24 min) | **5231 tests, 5077 pass, 62 fail, 92 skip** on the first run. **Two of those 62 were mine and are now fixed** (see below); the other 60 are rig-reuse preconditions, classified by their own error text: 55 × `F-A5b PR-1 DRIFT: … sandbox_watermark rows=4/3`, 2 × `sst_rate_schedule carries exactly 10 seed rows (got 12)` / `duplicate key … uq_sst_rate_schedule_live`, 1 × `evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not set`, 1 × `delta contract requires a fresh disposable DB`, and 1 parent suite of those. **Not one failure names `actor_role`, `audit_log` or anything this ticket touched.** |
| `operation-census.test.mjs` / `rig-isolation.test.mjs` | run with the ordinary rig env only — **never** with `CLARA_RIG_ALLOW_RESET` or `CLARA_RIG_ALLOW_ROLE_SWEEP` |
| `pnpm typecheck` | **RED, inherited** — the only two errors are `components/documents/document-kind-dialog.tsx(95)` `TS2552 Cannot find name 'DOCUMENT_KINDS'` + `TS7006`. Nothing of mine errors. See *Follow-ups*. |
| `pnpm lint` | **exit 0**, clean (this also runs `check-frozen-workflows.mjs` → no manifest diff, and `check-wiki-dynamic-sql.mjs` → OK, 1411 definitions / 213 patches scanned) |
| `apps/web` WHOLE unit suite (`node scripts/run-tests.mjs`) | **4751 tests, 4727 pass, 22 fail, 2 skip.** All 22 are inherited: 19 `ReferenceError: DOCUMENT_KINDS is not defined` across five `components/documents/*` files, and `tests/firm-scope-db-pins.test.ts` (2 subtests) blocked at **this lane's own 0240**. The firm-knowledge panel battery is **14/14**. |
| browser walks on my triple (3510/3511/3512) | **BLOCKED, inherited.** `pnpm --filter @clara/web e2e knowledge-firm-walk` fails in `next build` on the same `DOCUMENT_KINDS` type error, before any spec runs. **No walk can run on this branch**, mine or anyone's. |
| `packages/runtime` | not touched — no runtime gate owed |

**The whole-suite run caught a real one, and it is worth saying plainly.** `x42.s5c.6` and
`x42.r7.s5c.5` pin the live set of `clara` bodies carrying a bare clock token (S5.25 arm (D)), and
0243's stamp adds one: its first statement is `if new.at is null or new.at < now() then return new;
end if;`. `f9d755c97` declares `_tf_audit_actor_role` on that roster
(`packages/db/tests/x42-s5-helpers.mjs`), stem-gated on `audit_actor_role$` like every entry since
0214, with the reasoning beside it — including why `now()` is the right clock here and not
`clock_timestamp()` (the comparison's job is "is this row part of THIS transaction", and
`audit_log.at`'s own DEFAULT is the transaction clock). It adds nothing to arm (B) because it derives
no date; `x42.s5c.5` confirms. **All 12 cells across the four `x42*s5*clock` batteries are now
green**, and the touched-file db gate re-run after it is **96 tests, 95 pass, 0 fail, 1 skip**.

`pnpm lint` also re-ran the wiki dynamic-SQL lint, which **caught a real defect in my first tail**: it
used `pg_get_functiondef` (which makes the lint classify a `do` block as a change-of-record patch) and
embedded a `pg_get_triggerdef` literal containing `EXECUTE FUNCTION …`. I did not widen the lint — I
removed both, asking `clara.verify_metric_input_producer_freeze()` (the estate's own definition of
that check) instead of re-deriving member hashes, and reading the trigger's shape off `pg_trigger`'s
own `tgtype`/`tgfoid` columns.

## Vacuity controls (work order rule 4)

- **ar.02** — with the trigger's `new.at < now()` arm deliberately removed, ar.02 goes **red** while
  ar.01 stays green. Subject restored byte-for-byte by #957 redo.
- **ar.04** — with the register mutated to `coalesce(a.actor_role, <the promoter's current role>)`,
  ar.04 goes **red** while ar.01–ar.03 stay green (correctly: their audit rows are stamped). Subject
  restored from §C's own text, then re-applied by redo.
- **ar.01 / kf.12 / kf.13** were genuinely red before their implementation existed (ar.01: the gate
  assertion plus a direct probe returning `42703 column "actor_role" does not exist`; ar.03:
  `expected: 'owner'`, actual `undefined`; kf.12/kf.13: the label assertions).

## Docs (in the same commits)

- `packages/db/README.md` — new section **"0243 — the role at the instant of a governed act (#912)"**:
  the three-way table, the freeze that forbids recutting `clara._audit` **and the other eight roster
  members by name** (so the next author does not lose the afternoon I lost), the no-backfill and
  no-restore-rewrite guarantees, and who cites the column.
- `CONTEXT.md` — new term **"Role at the act"** in the house `term / _Avoid_` shape.
- `apps/web/README.md` — the `/settings/knowledge` row now names the three authority facts.

## Shared files touched (rule 7 — minimal hunks, at the sorted position)

- `apps/web/messages/en.json` — 2 keys inside the existing `FirmKnowledge` block, in render order.
- `packages/db/package.json` — one `--import ./tests/audit-actor-role-preintegration-gate.mjs` appended
  in migration order (after 0242's).
- `packages/db/tests/rig-meta.mjs` — one `#912 … #912 END` cohort block beside 0234's, plus a bimodal
  sweep entry.
- `CONTEXT.md` — one term.

Not touched: `apps/web/test/manifest.txt` (no new web test file — the cells went into an existing
one), `apps/web/e2e/serve-built.mjs`, `e2e-fixture-ownership.test.ts` (the mock gained a field, not an
id), `lib/navigation/tree.ts`, `.github/actions/db-live-gates/action.yml`.

## Successor contract

Nothing in `packages/runtime` reads `clara.list_firm_knowledge` today (grep over `packages/runtime`
for `list_firm_knowledge` / `promoter_role`: no hits), so **no frozen chat or Work body needs to
change for this ticket to work**, and I edited none. If the owner later wants Clara to *say* the role
at the act in a chat turn or a Work part, this is what the `chatTurn_v22` / `claraWork_v6` cut would
need:

- **Name:** `firmKnowledgeAuthority`.
- **Zod input:** `z.object({ knowledgeKey: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/) })` — the same
  grammar #993 put on the catalogs in 0242.
- **Door call, with argument order:** `clara.list_firm_knowledge()` — **no arguments at all** (it is
  session-firm scoped and floors itself at viewer); the tool filters the returned `records` by
  `knowledge_key` itself. **It is granted to `clara_authenticated` only** (measured:
  `has_function_privilege('clara_runtime', …)` = false, `clara_agent_ro` = false), so a runtime-lane
  tool needs either a new agent-lane read or the human's own session — that is a grant decision for
  the owner, not something a tool cut can assume.
- **Refusal mapping:** `CLR04 insufficient role` → "This needs a viewer's access to the firm's
  knowledge register"; `42501` (no EXECUTE) → the lane is not granted this read, ask the human.
- **Part kind:** `knowledge_authority` — a three-row fact block (`required_role`,
  `promoter_role_at_act`, `promoter_role_now`), never a single "role" line.
- **Prompt stanza:** "The role a promoter held at the act and the role they hold now are two
  different facts. Say both, and when the role at the act is unknown say it predates the record of
  authority — never substitute the current role for it, and never infer a past role from today's
  roster."

## Follow-ups worth filing (both **inherited**, neither mine to fix)

1. **BLOCKER for every lane this wave — `next build` is broken at the wave base.**
   `apps/web/components/documents/document-kind-dialog.tsx:95` calls `DOCUMENT_KINDS.map(...)`; the
   file imports only `CLASSIFIABLE_DOCUMENT_KINDS` (line 35), which is what line 109 uses. Introduced
   by `61f56acfb fix(web): #1005 SelectValue requires a label source, by construction` (wave 1 lane
   08), an ancestor of this lane's base `23cfad94` (`git merge-base --is-ancestor 4b1376f40 23cfad94`
   → true). Consequence: `pnpm typecheck` is red, 19 web unit tests die with
   `ReferenceError: DOCUMENT_KINDS is not defined`, and **no Playwright walk can run on any wave-2
   branch**, because `next build` type-checks before serving. Almost certainly a one-word fix
   (`DOCUMENT_KINDS` → `CLASSIFIABLE_DOCUMENT_KINDS`), but it belongs to #1005's lane and it should be
   fixed **once, centrally**, not ten times in ten lane branches.
2. **This lane's 0240 (#898) is an unreviewed dynamic-SQL barrier.**
   `apps/web/tests/firm-scope-db-pins.test.ts`'s successor census stops at
   `0240_financial_year_end_day.sql:206 — execute v_next` with *"unreviewed dynamic-SQL barrier … the
   successor census cannot prove this migration unrelated"*, failing two subtests. 0241, 0242 and my
   0243 are all clean (probed with `viewDefinitionOffsets` directly). The fix is a
   `REVIEWED_DYNAMIC_SQL_BARRIERS` entry for 0240 with its sha256 and a ≥40-character reason — but the
   reason is a **review of #898's own splice**, so it should be written by #898's implementer or
   reviewer, not by me.
3. **Nice-to-have, not owed:** `clara.list_client_knowledge` could cite the role at the act the same
   way. The ruling deliberately names only the firm register, so I did not.

## Unverified

- **From-scratch apply of 0243.** Not run on this rig by design (RIG.md: the integrator runs it on a
  disposable cluster; a lane must never run a second from-scratch chain because 0154 pins the
  cluster-wide role count).
- **Any browser walk**, for the inherited reason above. The panel behaviour the walk would have
  exercised is covered by kf.12/kf.13 in the unit suite, and `apps/web/e2e/knowledge-mock.mjs` now
  carries `promoter_role_at_act` in `clara.list_firm_knowledge`'s own shape, so the walk should be
  green the moment the build is fixed — **but I have not seen it run**.
- **The restore path.** The stamp's `new.at < now()` arm is what stops `scripts/restore.mjs` rewriting
  historical authority through `COPY`. ar.02 proves the arm at the table seam; I did **not** run a
  real dump/restore, because `pg_dump` is not on PATH on this rig (a known Windows-only limitation).
- **The wake lane end to end.** ar.05 proves the `'none'` branch at the table seam (an audit row whose
  actor is the global agent identity). I did not mint a wake credential and walk a real `wake_*` door.
