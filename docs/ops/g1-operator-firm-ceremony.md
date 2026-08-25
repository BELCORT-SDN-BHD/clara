# The G1 operator-firm ceremony (raw, audited, one-shot)

**Owner-only. Run once, at initial estate setup, or deliberately re-run only if the operator
firm must ever change.** Nothing below runs until the owner explicitly confirms in-session,
matching the `OWNER-!-GATED` posture of `wave-b-0019-ceremony-runbook.md` and
`wave-b-0021-ceremony-runbook.md`.

> **Origin:** Gate G1 (the universal wake-execution engine),
> `packages/db/migrations/0133_g1_wake_engine.sql` §G1-10 (labelled MUST D in that
> file's tail — the same finding Codex's own review round labelled MUST B, consolidated
> under MUST D). **Precedent for the raw-act mechanics:** `docs/ops/dsn-bridge.md` (the
> CA-pinned live-DSN bridge every ceremony in this directory routes through) and the
> `clara_fn_owner` object-ownership convention documented in
> `docs/ops/pgcatalog-hardening-rehearsal.md` and enforced by
> `packages/db/migrations/0002_foundation.sql:485-492`. **Proof this door refuses everyone
> else:** `packages/db/tests/g1-wake-engine.test.mjs`, cells T1b / T2z / MUST D.

---

## What this ceremony does, and why it is a raw DB act, never an app RPC

Gate G1 added `clara.firms.is_operator` — a boolean column, `NOT NULL DEFAULT false` on
every firm, guarded by a partial unique index
(`uq_firms_one_operator on clara.firms ((true)) where is_operator`) that lets **at most one**
firm in the whole estate ever carry it `true`. `clara.set_wake_source_enabled` — the
estate-wide switch that turns a wake-execution source (e.g. `bank_agent`) on or off for
**every** firm, not just the caller's own — gates itself on this flag:

```sql
if not exists(select 1 from clara.firms where id = c.firm and is_operator) then
  raise exception 'set_wake_source_enabled is an operator-only door -- % is not the operator firm', c.firm
    using errcode='CLR04';
end if;
```

Per constraint 13, **BELCORT is the one OPERATOR firm** in this estate; every other firm —
ROME PROPERTIES, ROME SECRETARY, BEE CREATIVE SOLUTION, the synthetic ROME PUBLIC ADVISORY,
and the slice-era RLS fixtures Alara and Borneo — is a resettable test fixture and must never
hold this flag.

The migration's own comment on the column states the rationale for keeping this a raw,
audited DB act rather than an app-facing setter, verbatim:

> No app-facing RPC ever sets this column: it is a deploy-time/ops fact about the estate, set
> by a raw, audited DB act (mirroring how `clara_wake_bank_login`'s actual LOGIN+password
> lands via an operator ceremony, never an app RPC) — an app-facing setter would just
> relocate the same "who may call it" problem one level down.

In other words: `set_wake_source_enabled` already had one failure mode this flag exists to
close — `_human_ctx(role_rank('owner'))` alone proves only "owner of *some* firm," including
any test fixture, not "owner of the one real operator firm." Building an RPC to *set* the
flag would just recreate that exact "who may call it" question for the new setter, one level
down. A raw, audited act sidesteps the recursion entirely: only whoever already holds
sufficient privilege to run arbitrary SQL against the live database — the same trust boundary
every other raw ops act in this repo (migrations, `acl-baseline.sql`,
`pgcatalog-hardening.sql`) already sits behind — can ever flip it.

**The migration ships with the door already closed.** No firm starts as operator (migration
tail cell T.5c asserts `count(*) from clara.firms where is_operator` is `0` at apply time), so
`set_wake_source_enabled` is unreachable by anyone, BELCORT's owner included, until this
ceremony runs. That is correct fail-closed behaviour, not a gap — and it is the gap this
runbook exists to close, deliberately and on the record.

---

## 0. Preconditions — verify ALL before running the UPDATE

- [ ] **The G1 migration is live.** `select count(*) from information_schema.columns where
      table_schema='clara' and table_name='firms' and column_name='is_operator';` returns
      `1`. (The migration file ships as `0133_g1_wake_engine.sql` in the repo — the number was
      claimed at merge time per constraint 10; `clara.schema_migrations` carries only
      `version`/`checksum`/`applied_at`, no `name` column, so confirm the live ledger really
      carries this exact stem rather than assuming the repo's own filename applies verbatim to
      whichever database you are pointed at:
      `select version from clara.schema_migrations where version = '0133_g1_wake_engine';`
      returns exactly one row.)
- [ ] **No live-gate journey is open** (WB-R24 version pinning) — if a Gate O/K/W2/L/R2/F
      window is mid-flight, this ceremony waits, same as every other ops act in this
      directory.
- [ ] Canary `daba7f2e` untouched (never answered, past due or not).
- [ ] **Zero firms currently carry `is_operator=true`.**

  ```sql
  select id, name, is_operator from clara.firms where is_operator;
  ```

  Expect **zero rows**. This is what makes the ceremony a first-time, one-shot act at initial
  estate setup: the migration ships with none marked (T.5c), and
  `uq_firms_one_operator` forbids a second one ever existing alongside BELCORT's. If this
  query returns a row, **stop** — do not proceed on the assumption below; read "Re-pointing
  the operator firm," at the end of this doc, instead.

- [ ] **Confirm BELCORT's firm id.** The estate stores the firm's name verbatim as
      `'BELCORT'` (the string used throughout the repo's own onboarding tooling — see
      `packages/db/scripts/onboard-rpr.mjs`'s `--firm-name "BELCORT"` usage and
      `packages/db/scripts/subledger-dryrun.sql:67`'s live-estate firm list). Look it up,
      never guess or hardcode a remembered id:

  ```sql
  select id, name, created_at from clara.firms where name = 'BELCORT';
  ```

  Expect **exactly one row**. If it returns zero rows, BELCORT has not been onboarded yet on
  this database — resolve that first (`packages/db/scripts/onboard-rpr.mjs` or the admission
  ceremony) before running this one. If it returns more than one row, stop and escalate —
  `name` is not a uniqueness constraint on `clara.firms`, so a duplicate-named row is a data
  problem this ceremony must not paper over by picking one arbitrarily (review law 3 —
  spelling is not identity; verify by `id`, never by re-matching the name a second time from
  memory).

---

## 1. The exact SQL, and which role runs it

`clara.firms` carries **forced** row-level security. Its only write-capable policy is the
owner policy every table in `0002_foundation.sql` gets:

```sql
create policy p_firms_owner on clara.firms for all to clara_fn_owner using (true) with check (true);
```

No application role (`clara_authenticated`, `clara_agent_ro`, `clara_runtime`, either wake
role) holds a write grant on `clara.firms` at all — table grants for those roles are
`SELECT`-only and RLS-scoped to the caller's own firm (`0002_foundation.sql:503-506,534-539`).
So this UPDATE can only ever be run as `clara_fn_owner` — the same role every migration in
this repo creates its objects under (`docs/ops/pgcatalog-hardening-rehearsal.md`'s "every
object in every migration is created under `SET ROLE clara_fn_owner` — the estate-wide
convention"). That is not incidental to this ceremony; it is the actual privilege boundary
that makes "a raw, audited DB act" mean something narrower than "anyone with the live DSN."

Route the live DSN through the CA-pinned bridge exactly as every other ceremony in this
directory does (`docs/ops/dsn-bridge.md` — `sslmode=verify-full`, never `no-verify`; the DSN
comes from the environment only, never argv):

```sh
<secret source> | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1
```

Inside that `psql` session, `SET ROLE` to the owning role, then run the UPDATE against the
**id you looked up in step 0** — never a name-matched subquery inline (review law 3: a name
is a projection, not the row's identity; resolving the id first and pasting the literal id
here is what makes the UPDATE's own text an auditable, reviewable statement rather than a
live re-resolution that could silently pick up a different row between preflight and apply):

```sql
set role clara_fn_owner;

update clara.firms
set is_operator = true
where id = '<belcort-firm-id-from-step-0>';
```

Expect `UPDATE 1`. If it reports `UPDATE 0`, the id was wrong — stop, do not retry against a
re-resolved name lookup; re-verify step 0 from scratch. If the statement raises a unique
violation on `uq_firms_one_operator`, some other firm already carries the flag — stop and
read "Re-pointing the operator firm" below; do not force it through.

**A raw UPDATE writes no `clara.audit_log` row.** That table is populated only by governed
`SECURITY DEFINER` writers calling their own audit helper — there is no generic trigger on
`clara.firms`, and this ceremony deliberately does not call a governed writer (there isn't
one; that is the whole point). The durable record of this act is this runbook plus whatever
your own operational log captures at run time (an ADR entry per the "Aftermath" convention
below, and Postgres's own connection/statement logging if the project has it enabled) — not
a row you can query back out of `clara.audit_log`. Say so plainly if asked "how do we know
when this ran": by the ADR/ops-log entry made at the time, not by a database read.

---

## 2. Verification

Confirm exactly one firm carries the flag, and that it is BELCORT:

```sql
select id, name, is_operator from clara.firms where is_operator;
```

Expect **exactly one row**, `name = 'BELCORT'`, `is_operator = true`.

Confirm the partial unique index still holds structurally (re-derived from the live catalog,
never assumed from having just run the UPDATE — review law 2, absence/derivation is not
evidence, only what a read actually saw counts):

```sql
select indexdef from pg_indexes
where schemaname = 'clara' and tablename = 'firms' and indexname = 'uq_firms_one_operator';
```

Expect the definition to still show `UNIQUE` and `WHERE (is_operator)` — the partial form
(a full unique index would additionally forbid two `false` rows, which is not what this
ceremony is protecting).

Prove the count directly rather than trusting the single-row `SELECT` alone:

```sql
select count(*) from clara.firms where is_operator;
```

Expect `1`.

---

## 3. What becomes reachable, and what stays refused

Once this lands, `clara.set_wake_source_enabled` becomes callable by any **owner-rank**
member of BELCORT — the operator-firm gate is satisfied, though the function's own owner-rank
floor (`clara._human_ctx(clara.role_rank('owner'))`) still applies on top of it; a BELCORT
bookkeeper or admin remains refused by the rank check even after this ceremony.

Every other firm's owner — a real firm's owner, or a resettable test fixture's like Alara's or
Borneo's — stays refused with `CLR04`, "operator firm," **not** the rank gate: full owner rank
inside a non-operator firm is necessary but not sufficient. This exact cross-tenant shape is
proven, not asserted, by the G1 DB battery's own T2z cell
(`packages/db/tests/g1-wake-engine.test.mjs`):

> T2z: an ordinary tenant fixture's owner, at full owner rank, calling
> `set_wake_source_enabled` is refused `CLR04`, and the refusal message names the
> **operator-firm** gate specifically — not the rank gate, since owner rank was satisfied.
> The registry row it tried to flip is left untouched.

T1b (same file) independently re-derives the column's shape and the index's bind from the
live catalog after a raw `UPDATE` — never trusting the migration's own tail notice — and
confirms exactly one firm holds the flag. The MUST D cell further confirms that once BELCORT's
owner does flip a source, every *other* firm's own `audit_log` still gains a receipt row, even
though that other firm never called the function and never could — so a tenant firm can
discover its automation posture changed without ever being able to cause the change itself.
**The receipt is deliberately anonymous, not attributed** (M3, folded into MUST D after this
runbook's own citations were first drafted — the payload shape below is the corrected,
currently-live one): the row's `actor` column is `NULL` and `args` carries only
`{source, on}` — no operator-user uuid, no operator-firm uuid, no free-text reason. A tenant
firm learns *what* changed estate-wide, never *who* changed it; M3's own test asserts this
exact shape (`packages/db/tests/g1-wake-engine.test.mjs`, "M3: the broadcast payload carries
ONLY {source, on}").

---

## 4. Aftermath

- [ ] Record the ceremony: an ADR entry under `docs/adr/` (or the applicable dated ledger)
      noting the timestamp, the firm id marked, and the verification query's output —
      matching the "Aftermath" convention in `wave-b-0021-ceremony-runbook.md` §4, since this
      act leaves no `audit_log` row of its own to point to later.
- [ ] Update `PROGRESS.md` if this was the estate's first-ever operator-firm assignment —
      `set_wake_source_enabled` moves from "unreachable by anyone" to "reachable by BELCORT's
      owner-rank members" as a posture fact worth stating explicitly.

---

## Rollback — read before you need it

**Never in normal operation.** BELCORT is permanently the operator firm per constraint 13;
there is no routine reason to ever clear this flag. The mechanical undo is documented anyway,
matching how `wave-b-0021-ceremony-runbook.md`'s rollback section treats an additive,
low-blast-radius change: know the recovery path, use it only deliberately.

```sql
set role clara_fn_owner;

update clara.firms
set is_operator = false
where id = '<belcort-firm-id>';
```

This returns `set_wake_source_enabled` to fully unreachable for everyone, BELCORT's owner
included — the same fail-closed state the migration shipped in. It does **not** touch
`clara.wake_engine_sources` (whatever `enabled` state a source was already in stays exactly
as it was); it only closes the door that lets anyone flip that state going forward.

### Re-pointing the operator firm

The only scenario where clearing the flag is a real operational need: the operator firm
itself must change (e.g. a `BELCORT` firm row is retired and re-seeded under a new id, or an
estate migration outside this repo's current scope). `uq_firms_one_operator` forbids two
firms holding the flag simultaneously, so a re-point is two statements, not one — clear the
old row first, in its own committed transaction, verify zero rows carry the flag (repeat
step 0's zero-rows check), then run the ceremony's main UPDATE again against the new firm's
id. Do not attempt to swap both in one statement or one transaction "for atomicity" — the
brief window with zero operator firms is the *safe* state (every caller refused), not a gap;
the partial unique index makes the *unsafe* state (two operator firms briefly true together)
structurally impossible to reach even by accident, which is worth more than avoiding the
gap.

---

## Is this ceremony DATA-scoped under constraint 14?

**No — deliberately not framed that way.** ADR-060/ADR-0075's data authority (constraint 14)
covers test data — every client's, live DB included — freely deletable, reseedable and
re-runnable without asking. This ceremony is neither: BELCORT is explicitly carved out of
constraint 13's "every other firm is a resettable test fixture" list (BELCORT is the real
operator firm, not a fixture), and `is_operator` gates a genuine security mechanism
(`set_wake_source_enabled`'s authority check) — constraint 14's own closing clause says the
product's security mechanisms are "NEVER weakened or bypassed for testing convenience," which
is the operative clause on any collision. This ceremony is the opposite of a testing-
convenience act: it is a one-shot, owner-gated act that *establishes* a security boundary,
not one that works around one. It sits on the same footing as the `OWNER-!-GATED` migration
ceremonies in this directory, not the DATA-scoped reset authority.
