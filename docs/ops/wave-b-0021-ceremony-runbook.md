# Migration 0021 ceremony runbook — the human counterparty lane (OWNER-`!`-GATED)

**One ceremony, one owner confirmation.** Nothing below runs until the owner explicitly
confirms in-session. Every precondition and probe is listed so that confirmation is informed.

> **Origin:** the Bee Creative live-gate run, 2026-07-26 — a real opening carry-down that
> could not seed a real trade creditor. **Artifacts:**
> `packages/db/migrations/0021_counterparty_human_lane.sql` (the apply),
> `packages/db/deploy/wave-b-0021-postverify.sql` (read-only, 6 probes) ·
> **Precedent:** `docs/ops/wave-b-0020-ceremony-runbook.md` (ADR-041).

## What 0021 changes, in one paragraph

One new governed verb, `clara.create_counterparty(p_client, p_kind, p_name,
p_registration_no, p_tin, p_op_key)`, at the **bookkeeper** floor — the same floor as
`upsert_account`, for the same reason: both create reference data that later postings hang
off, and neither moves money. It mints a counterparty and **nothing else**: it does not code,
resolve, match or merge, and identity resolution stays exactly where it was —
`_resolve_counterparty` keeps its monopoly on deciding whether an incoming document names an
existing party, and `approve_entry`'s birth path is untouched. It exists because an opening
carry-down seeds payables and receivables as `ap_open_item` / `ar_open_item`, both of which
**require** a `counterparty_id` (0017:3202-3204), while the only way to bring a counterparty
into existence was inside `approve_entry` — i.e. by approving a coded entry. At takeover,
before any entry exists, that made opening payables unseedable.

**This is the cheapest ceremony in Wave B.** 0021 is purely additive: one `create function`,
no relation touched, no policy changed, no data written. It takes no lock on any existing
object, so **no quiescence and no runtime redeploy are required** — the runtime cannot even
call this verb (it is granted to `clara_authenticated` only, and probe 3 proves it).

---

## 0. Preconditions — verify ALL before asking for the gate

- [ ] `main` carries the 0021 merge with green CI.
- [ ] **No live-gate journey is open.** WB-R24 version pinning is BINDING — no Gate
      O/K/W2/L/R2/F window may straddle this deploy. If a gate is mid-flight, 0021 waits.
- [ ] Rig evidence from the merge commit on hand: the DB battery green at 21 migrations
      (including `wb-0021-counterparty.test.mjs`, 11 cells, one of which runs the shipped
      post-verify file verbatim), the **19 → 20 upgrade fixture** still green with
      `CLARA_RIG_ALLOW_RESET=1`, `pnpm typecheck` clean, freeze-lint OK, leak-scan OK.
- [ ] Canary `daba7f2e` untouched (due 2026-08-02 — **never answer it**).
- [ ] Backups green as of today.
- [ ] Live is at **20 migrations** and `clara-runtime` is at **v27**. If live is not at 20,
      stop — this runbook does not describe that state.

## 1. Backup first (fresh, verified)

One-off backup run: `fly machine start d895470c6024e8 -a clara-backup` — **never** a plain
`fly deploy` on the backup app. Confirm the run's zero-501 log and the object count against
yesterday's.

*Why, when the migration is additive:* the backup is not insurance against 0021's DDL. It is
insurance against the operator — a wrong `PGDATABASE`, a paste into the wrong shell. That
risk is identical whatever the migration contains.

## 2. Apply migration 0021 (live: 20 → 21 applied)

**Run the migrator. Never `psql -f` the migration file.**

```
node packages/db/scripts/migrate.mjs
```

The migrator is the only path that records the version and checksum, verifies history
integrity, refuses an out-of-order insert, and takes the advisory lock that serialises
concurrent runners. A `psql -f` applies the SQL and leaves `schema_migrations` lying — the
next run then reports drift on a migration that *is* applied. Named explicitly because the
0020 rehearsal found this step unnamed, and an unnamed step at 2am is a guess.

Connection comes from the environment (libpq `PG*` vars or `DATABASE_URL`). **Never a DSN in
argv** — the leak-scan gate exists because that mistake is one shell-history away.

Expect: `0021_counterparty_human_lane` applied, and the in-transaction tail's notice —
`0021: create_counterparty installed — SECURITY DEFINER, search_path pinned,
clara_authenticated only`. The tail proves the apply; it does **not** prove the committed
catalog. That is step 3's job.

## 3. Post-DB verify

```
psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0021-postverify.sql
```

Six probes, read-only, raising on the first failure. Green means:

1. **0021 is the HEAD**, and 0020 is still in the history. The head — not merely "0021 is
   present" — because the load-bearing ceremony claim is that the apply did not run *past*
   the migration being deployed. (The rig opts out of the head check through
   `clara.postverify_allow_later`; **a ceremony never sets it.**)
2. The verb exists at its **exact signature**, is `SECURITY DEFINER`, pins its `search_path`,
   and is **owned by `clara_fn_owner`**. Ownership is the load-bearing one: a definer executes
   as its owner, so the owner *is* the authority it lends. The first rig run of 0021 caught
   this exact omission (`owner=postgres`).
3. `EXECUTE` is held by `clara_authenticated` and **nobody else** — no PUBLIC, no
   `clara_runtime`, no wake role. Read from `pg_proc.proacl` via `aclexplode`, never
   `information_schema` (which returns nothing, and so fails open, when the querying role is
   neither grantor nor a member of the grantee).
4. Both counterparty unique indexes are intact, still **kind-scoped**, still partial. The
   verb's create-or-get recovery branches on which one collided; if either lost `kind`, one
   client's identically-named vendor and customer would collapse and a payable would attach
   to a receivable relationship.
5. Identity resolution is untouched — `_resolve_counterparty` and `approve_entry` both present.
6. The apply transaction wrote **no counterparty row** (asserted via `xmin`, so it stays a
   true statement forever rather than a time window that later legitimate use would trip).

## 4. Aftermath

- [ ] Add the ADR under `docs/adr/` with the applied timestamp and the 6/6 receipt.
- [ ] Update the LIVE POSTURE line in `CLAUDE.md` and the memory state file: **21 migrations**.
- [ ] `clara-runtime` stays at **v27** — no redeploy, and none is needed.
- [ ] Re-pin any open gate journey to **21 migrations · v27** (WB-R24).

## Rollback posture — read before you need it

**There is no `down` migration and there must not be one.** The rollback for an additive
function is `drop function clara.create_counterparty(uuid,text,text,text,text,text);` — but
run it only if the verb is provably unused, because a dropped verb takes any counterparty a
human minted through it *out of nothing* (the rows survive; the door does not). Check first:

```sql
select count(*) from clara.audit_log where fn = 'create_counterparty';
```

If that is zero, dropping the function returns the database to a state indistinguishable from
20 — but `schema_migrations` still records 0021, and that record is **append-only history**.
Do not delete the row; the migrator will report drift on the next run and it will be right.
The honest recovery from a bad 0021 is a **new** migration that supersedes it, not an erasure.

If the apply itself fails, nothing happened: `migrate.mjs` wraps each migration in its own
transaction and the tail's assertions run inside it, so a failed tail rolls the whole
migration back and live stays at 20.
