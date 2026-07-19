# Slice-6 design probes — empirical report

**Lane:** pg-probe (empirical probe lane). **House law:** probe before arguing.
**Target:** throwaway `clara_s6_probe` on local PG16 `127.0.0.1:5544` (trust auth),
migrations **0001–0008** applied via the repo runner (`packages/db/scripts/migrate.mjs`,
env-based connection). Baseline DBs (`clara_test` / `clara_rt_test` / `clara_blind_test`)
were never touched. Probe DB dropped at end of run.

**Server note:** the throwaway is PostgreSQL **16.13** (local rig). Production/CI is
Postgres 17. None of the behaviours probed here are version-sensitive (overload
resolution, lock ordering, CHECK/partial-unique/deferred-constraint semantics, and
ACL reset on `DROP FUNCTION` are identical on 16 and 17), but flagging for completeness.

**Verdict summary**

| Probe | Claim | Verdict |
|---|---|---|
| P1 | C-1 overload law | **SUPPORTED (stronger than stated)** |
| P2 | C-2 lock order (filing→entry) | **SUPPORTED** |
| P3 | C-7 CHECK extensions required | **SUPPORTED** |
| P4 | C-16 CoA domain regex | **SUPPORTED** |
| P5 | N-F13 taxonomy additive insert | **SUPPORTED (with a version nuance)** |
| P6 | C-15 partial unique (one draft/filing) | **SUPPORTED** |
| P7 | C-8 token rotation surface | **SUPPORTED** |

All seven load-bearing claims hold on real migration objects. Three items carry design
notes the build stage should read (P1 ACL-reset caveat, P5 active-version = v2, P2 the
real lock is `FOR SHARE` not `FOR UPDATE`).

---

## Seed (shared fixtures)

Built as superuser (RLS bypassed for the owner; triggers still fire). Firm + two clients,
each with a 2-account CoA (`1000` asset / `4000` income); one verified document minted via
`clara._seed_verified_document` (the rig's intended superuser mint path — granted to no app
role); two active filings of that one document (client1, client2); one committed
document-bound **draft** journal entry on filing1 with two balanced lines.

**Rig gotcha learned (recorded for the build lanes):** the balance/provenance triggers on
`journal_entries` are `CONSTRAINT ... DEFERRABLE INITIALLY DEFERRED`. On an **autocommit**
connection a bare `INSERT` of an entry is its own transaction, so `_assert_balanced` fires
before any lines exist → `CLR07 unbalanced (debit=0 credit=0)`. Entry **and** its lines must
be inserted inside **one explicit transaction** so the deferred check validates at COMMIT.
(A zero-line entry is never balanced — `debit=0 credit=0` is rejected, not treated as 0=0 OK.)

---

## P1 — C-1 overload law  ·  **SUPPORTED (stronger than the stated claim)**

**Claim.** `CREATE FUNCTION f(a int)` + GRANT, then `CREATE OR REPLACE FUNCTION f(a int, b int
default 0)` → two `pg_proc` rows; the old one keeps its ACL; `f(1)` resolves to ? ; and
`DROP FUNCTION f(int)` + recreate leaves exactly one row.

**SQL.**
```sql
create schema scratch; create role scratch_role;
create function scratch.f(a int) returns int language sql as 'select 1';
grant execute on function scratch.f(int) to scratch_role;
-- proacl before: {=X/postgres,postgres=X/postgres,scratch_role=X/postgres}
create or replace function scratch.f(a int, b int default 0) returns int language sql as 'select 2';
select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='scratch' and p.proname='f';           -- => 2 rows
-- proacl of f(int) after: unchanged (old ACL kept)
select scratch.f(1);                                      -- => ERROR 42725
drop function scratch.f(int); drop function scratch.f(int,int);
create function scratch.f(a int, b int default 0) returns int language sql as 'select 3';
-- => exactly 1 row
```

**Result.**
- After `CREATE OR REPLACE` with the new signature: **two** `pg_proc` rows
  (`scratch.f(integer)` and `scratch.f(integer,integer)`). A changed signature is **not** a
  replace — it is an additional overload.
- The old `f(int)` **keeps its ACL** verbatim (`scratch_role=X/postgres` preserved).
- `select scratch.f(1)` → **`SQLSTATE 42725` "function scratch.f(integer) is not unique"**.
  The call is **ambiguous**: `f(int)` matches by exact arity and `f(int,int default 0)`
  matches via the default — Postgres refuses to choose. It does **not** silently prefer the
  exact-arity match.
- `DROP FUNCTION f(int)` + `DROP FUNCTION f(int,int)` + recreate one → exactly **1** row.

**Design note (load-bearing, tested as a follow-up).** The DROP+recreate evolution pattern
**RESETS the function ACL to default**. Measured: `proacl` before drop
`{postgres=X/postgres,scratch_role2=X/postgres}` → after DROP+recreate `NULL`
(= default, i.e. **EXECUTE to PUBLIC**). Implication for C-1: evolving a governed writer by
DROP+recreate must **re-apply the REVOKE/GRANT** (or rely on the migration tail-sweep that
`REVOKE`s PUBLIC), otherwise the recreated function silently reverts to EXECUTE-to-PUBLIC — a
privilege leak in Clara's ungranted-definer-writer model. `CREATE OR REPLACE` (same signature)
preserves the ACL; a signature change cannot use it.

**Takeaway.** C-1 is correct and in fact **stronger** than "a silent second row": an overload
via `CREATE OR REPLACE`+new-signature makes existing 1-arg call sites throw `42725`. Never
overload a governed writer; change a signature only by DROP+recreate **with the grants
re-applied in the same migration**.

---

## P2 — C-2 lock order (filing before entry)  ·  **SUPPORTED**

**Claim.** The v1.0 order (entry-then-filing) inverted against the 0007/correction order
(filing-then-entry) produces an AB-BA deadlock (`40P01`); the consistent 0007 order is clean.

**Real objects.** `clara._active_document_filing(p_document, p_sha256, p_client, p_lock=>true)`
is the hot-path filing accessor. **Nuance:** its lock is `FOR SHARE OF f` (a *shared* lock),
**not** `FOR UPDATE`. `draft_entry`/`approve_entry` call it first, then take the entry
`FOR UPDATE`. `apply_filing_correction` takes filings `FOR UPDATE` then entries `FOR UPDATE`.

**SQL (two sessions, real filing1 + entry1).**
```sql
-- Inverted (A = entry→filing, B = filing→entry):
-- A: begin; select id from clara.journal_entries   where id=$e1 for update;      -- holds entry
-- B: begin; select id from clara.document_filings  where id=$filing1 for update; -- holds filing
-- A: select clara._active_document_filing($doc,$sha,$c1,true);  -- wants filing FOR SHARE -> waits on B
-- B: select id from clara.journal_entries where id=$e1 for update; -- wants entry -> waits on A -> cycle
```
```sql
-- Consistent 0007 order (both A and B = filing SHARE, then entry UPDATE):
-- A,B: select clara._active_document_filing($doc,$sha,$c1,true);  -- both FOR SHARE (compatible) -> both proceed
-- A:   select ... journal_entries $e1 for update;                 -- A holds entry
-- B:   select ... journal_entries $e1 for update;                 -- B waits; A rolls back -> B proceeds
```

**Result.**
- **Inverted:** A got **`40P01` (deadlock_detected)**; B completed. Deadlock fired as predicted.
- **Consistent 0007 order:** both sessions took the filing `FOR SHARE` (compatible — they do
  **not** block each other), then serialized on the entry `FOR UPDATE`; **no deadlock**, clean.

**Design note.** Because the hot-path filing lock is `FOR SHARE`, two concurrent
`draft_entry`/`approve_entry` calls on the *same filing but different entries* never contend on
the filing row — they only serialize if they touch the same entry. The deadlock risk is
strictly about **acquisition ORDER** (filing before entry, everywhere), not about the lock
strength. Any Slice-6 writer that touches both a filing and an entry must take the **filing
first**. (The `FOR SHARE` vs `FOR UPDATE` asymmetry is what keeps the common path
concurrency-friendly; a correction escalates to `FOR UPDATE` on the filing, which is still the
first lock, so it stays in-order.)

---

## P3 — C-7 CHECK extensions are REQUIRED  ·  **SUPPORTED**

**Claim.** `document_regions.locator_kind='semantic'` and
`document_extractions.engine_kind='invoice_facts'` are rejected today, so both CHECKs must be
extended for the Slice-6 facts/semantic surfaces.

**SQL (against real parent rows so the CHECK — not the stamp trigger — is what fires).**
```sql
insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status)
  values($firm,$doc,'eng1','invoice_facts',1,'done');           -- => 23514
-- (a valid 'ocr' extraction first, then:)
insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content)
  values($firm,$ext,'semantic','{}'::jsonb,'x','y');            -- => 23514
```

**Result.**
- `engine_kind='invoice_facts'` → **`23514`**, constraint **`document_extractions_engine_kind_check`**
  (`engine_kind IN ('ocr','structured_parse')`).
- `locator_kind='semantic'` → **`23514`**, constraint **`document_regions_locator_kind_check`**
  (`locator_kind IN ('page_polygon','sheet_cell_range','row_col','paragraph_run')`).

**Design note.** Both constraints are plain in-line CHECKs; extending them is an
`ALTER TABLE ... DROP CONSTRAINT <name>, ADD CONSTRAINT <name> CHECK (...)` in the Slice-6
migration (constraint names above). Note the **stamp trigger `_tf_stamp_document_pipeline`
runs BEFORE the CHECK** and rejects an orphan parent with `CLR10` — so the CHECK is only
reachable once the extraction/document parent exists (relevant if a test wants to isolate the
CHECK: give it a real parent first).

---

## P4 — C-16 CoA account_code domain  ·  **SUPPORTED**

**Claim.** The current CHECK `^[0-9]{4,8}$` rejects `900-A01`; the proposed regex
`^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$` admits all 27 firm codes and rejects the hostile set.

**SQL.** Pattern matrix by direct evaluation, plus live constraint wiring:
```sql
select (:code ~ '^[0-9]{4,8}$') as cur,
       (:code ~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$') as prop;   -- for every code
-- live:
insert into clara.coa_accounts(...account_code) values (...,'900-A01',...);       -- current => 23514
alter table clara.coa_accounts drop constraint coa_accounts_account_code_check;
alter table clara.coa_accounts add  constraint coa_accounts_account_code_check
  check (account_code ~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$');
insert into clara.coa_accounts(...account_code) values (...,'900-A01',...);       -- proposed => ACCEPTED
insert into clara.coa_accounts(...account_code) values (...,'900-a01',...);       -- proposed => 23514
```

**Result.**
- Current CHECK rejects `900-A01` (`cur=false`; live INSERT → `23514`).
- Proposed regex: **all 27** codes pass
  (`100-000,150-000,300-000,310-000,350-002,400-000,410-001,410-003,410-004,410-005,410-006,
  420-001,420-002,500-000,530-000,610-000,900-A01,900-B01,900-E01,900-E02,900-O01,900-R01,
  900-S01,900-S02,900-S04,900-T03,900-W01`).
- **All 6** hostile inputs fail under the proposed regex:
  `''`, `'900-'`, `'900-a01'` (lowercase), `'9000-A01'` (4 digits before dash),
  `'900-A0123X'` (suffix > 4), `'DROP TABLE'`.
- Live constraint after the ALTER: `900-A01` ACCEPTED, `900-a01` → `23514`.

**Design note.** Regex is anchored and safe (`^...$` on both alternatives; the char class
`[0-9A-Z]` excludes lowercase and punctuation, so `900-a01` and injection strings can't slip
through). The first alternative preserves legacy pure-numeric 4–8-digit codes; the second adds
the `NNN-XXY` special/analytic codes. This is a pure `ALTER TABLE` swap of
`coa_accounts_account_code_check` in the Slice-6 migration.

---

## P5 — N-F13 taxonomy additive insert  ·  **SUPPORTED (active version = v2, note)**

**Claim.** A new event type can be added to the **active version's** coverage set additively;
the full-coverage assertion still passes and existing routing/freshness lookups are undisturbed.

**Coverage assertion (the rig's law, from `tests/rig-events-structure.test.mjs`): anti-join must be empty.**
```sql
select et.name from clara.event_types et
 where not exists (select 1 from clara.trigger_taxonomy tt
   where tt.version=(select version from clara.taxonomy_active) and tt.event_type=et.name);
```

**SQL.**
```sql
-- active version:
select version from clara.taxonomy_active;                       -- => 2  (NOT 1)
-- (1) add a new event type WITHOUT coverage -> anti-join now returns it
insert into clara.event_types(name,client_scoped,description) values('probe.s6_new',false,'P5');
-- (2) add its coverage row into the ACTIVE version -> covered again
insert into clara.trigger_taxonomy(version,event_type,decision,note) values(2,'probe.s6_new','context_update','P5');
```

**Result.**
- The active taxonomy version is **v2** (0006 introduced a v2 routing set; e.g.
  `document.ingested` routes to `ignore` under v2, not `background_review`). The real catalog
  is fully covered under v2 (anti-join ∅) before and after.
- Adding `probe.s6_new` to `event_types` **without** a `trigger_taxonomy` row → the anti-join
  returns `['probe.s6_new']` (coverage genuinely broken — the invariant has teeth).
- Adding the `trigger_taxonomy(version=2, event_type='probe.s6_new', ...)` row (a plain INSERT,
  no version bump, no guard tripped) → anti-join ∅ again. `v2` row count `18 → 19`.
- Existing routing undisturbed: `document.ingested` decision unchanged (`ignore → ignore`);
  no existing triple altered. (Freshness/`assert_books_current` is keyed on `firm_event_seq`,
  orthogonal to the taxonomy — untouched by construction.)

**Design note.** Additive coverage works exactly as N-F13 needs: to introduce a Slice-6 event
type, INSERT the `event_types` row **and** the `trigger_taxonomy` row for the **active** version
in the same migration — no new taxonomy version and no `taxonomy_active` repoint required. But
the two inserts are a **coupled pair**: an `event_types` insert without the matching coverage
row leaves the catalog uncovered (the anti-join / any real emission of that type would
dead-letter). The only guarded taxonomy table is `taxonomy_active` (repoint-only);
`event_types` and `trigger_taxonomy` accept plain appends. **Flag for the design lane:** any S6
doc that says "add to v1" is stale — the live active version is **v2**.

---

## P6 — C-15 partial unique: one draft entry per filing  ·  **SUPPORTED**

**Claim.** A partial unique index `journal_entries(filing_id) where status='draft'` makes a
second concurrent draft for the same filing fail `23505`, while a draft for a **different**
filing of the same document succeeds.

**SQL.**
```sql
create unique index ux_one_draft_per_filing on clara.journal_entries(filing_id) where status='draft';
-- two sessions, both insert a balanced document-bound draft on the SAME filing2:
-- A: begin; insert entry(filing2,draft)+2 lines;      -- ok, uncommitted
-- B: begin; insert entry(filing2,draft);              -- BLOCKS on the partial unique index
-- A: commit;                                          -- B unblocks -> 23505
-- single-conn: a 2nd draft on filing1 (already holds the seed draft):
insert into clara.journal_entries(...filing_id=$filing1,status='draft'...);   -- => 23505 (immediate)
```

**Result.**
- Index creates cleanly against the seed (filing1 already holds exactly one draft).
- Concurrent same-filing: A inserted; **B → `23505`** (unique_violation) after A committed.
- Single-connection second draft on filing1 → **`23505`** immediately (the unique violation is
  an ordinary/immediate index check, not deferred — it fires at INSERT, before the deferred
  balance check is even relevant).
- Distinctness preserved: after the run, drafts-per-filing = `{filing1: 1, filing2: 1}` — two
  **different** filings of the **same** document each hold their own single draft.

**Design note.** The index enforces "≤1 open draft per active filing" exactly as intended and
composes with the existing `uq_document_filing_active` (one active filing per
`(document,client)`). Net effect for S6: at most one open draft per `(document, client)` at a
time, without blocking a second client's filing of the same document. The predicate must be
`status='draft'` (approved/withdrawn entries are excluded, so a filing can carry many historical
non-draft entries plus one live draft). Cheap to add — a `CREATE UNIQUE INDEX ... WHERE` in the
Slice-6 migration; it will succeed on live data only if no filing currently has two open drafts
(worth a pre-flight count before shipping).

---

## P7 — C-8 token rotation surface  ·  **SUPPORTED**

**Claim.** `revision_token` rotates via the `journal_lines` trigger; a parent-row `UPDATE`
alone (e.g. `SET updated_at`) does **not** rotate it; a facts-completion rotation therefore
needs an **explicit** token UPDATE, which passes `_tf_entry_immutable`'s draft→draft allow-set
(`revision_token` is in it).

**SQL.**
```sql
-- trigger surface (inspection):
select c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_proc p on p.oid=t.tgfoid where p.proname='_tf_rotate_token';   -- => journal_lines.t_jl_rotate_token
update clara.journal_entries set updated_at=now() where id=$e1 and status='draft';                         -- token UNCHANGED
update clara.journal_entries set revision_token=gen_random_uuid(), updated_at=now() where id=$e1 and status='draft';  -- token CHANGED
update clara.journal_entries set memo='illegal' where id=$e1 and status='draft';                            -- => CLR08 (P0001)
```

**Result.**
- `_tf_rotate_token` is attached **only** to `journal_lines`
  (`t_jl_rotate_token`, AFTER INSERT/UPDATE/DELETE) — it rotates the **parent** entry's token
  when a line changes and the parent is `draft`. No trigger on `journal_entries` rotates it.
- `UPDATE journal_entries SET updated_at=now()` (draft) → succeeds, **token unchanged**.
- `UPDATE journal_entries SET revision_token=gen_random_uuid(), updated_at=now()` (draft) →
  succeeds, **token changed**. This is the lawful facts-completion rotation.
- `UPDATE journal_entries SET memo=...` (draft) → **`CLR08` (P0001)** "illegal change to entry
  (status draft -> draft)" — the immutability allow-set (`{revision_token, updated_at}`) is
  tight; any other column delta is rejected.

**Lawful rotation UPDATE (record for the build lane):**
```sql
UPDATE clara.journal_entries
   SET revision_token = gen_random_uuid(), updated_at = now()
 WHERE id = <entry> AND status = 'draft';
```

**Design note.** A Slice-6 facts-completion writer that wants to invalidate an outstanding
optimistic-concurrency token *without* editing lines must issue this explicit
`revision_token`+`updated_at` UPDATE (both columns, both in the draft→draft allow-set). It does
**not** get the rotation "for free" from any other write to the entry, and it must not try to
piggyback on a non-allowed column (that trips `CLR08`). If the writer *does* edit lines, the
`journal_lines` trigger already rotates the token — so a facts-completion path that rewrites
lines should NOT also rotate manually (it would double-rotate; harmless but redundant).

---

## Reproduction

Battery script (per-probe isolation, exact SQL, structured JSON output) kept at
`<scratchpad>/s6-probes.mjs`. Re-run against a fresh throwaway:
`createdb clara_s6_probe` → `node packages/db/scripts/migrate.mjs` (env `PGHOST/PGPORT/
PGUSER/PGDATABASE`) → `node s6-probes.mjs`. Probe DB `clara_s6_probe` dropped at end of this run.
