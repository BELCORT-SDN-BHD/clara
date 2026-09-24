# Riders wave 4 — gate-cluster prep (rigw4 / rigw4h / rigw4c)

**Host** Windows 11 + WSL PostgreSQL 17 · main checkout `C:\Users\zhant\Desktop\clara-rebuild`,
branch `main` at `8470d8212` (confirmed by `git log --oneline -1`; 288 migration files on disk,
tip `0293_fa_arrears_judgement_scope`, no duplicate four-character stem).

---

## 1. Port deviation — read this before using the clusters

The work order named **55780** (`rigw4`) and **55781** (`rigw4h`). Both were unusable and had to
move. **Use the ports below, not 55780/55781.**

Windows currently excludes TCP `55772–55871` from dynamic allocation
(`netsh interface ipv4 show excludedportrange protocol=tcp`), almost certainly a Hyper-V/WSL NAT
range that shifted since wave 3 (55770/55771, minted inside that wave, still work fine; anything
newly bound in 55772–55871 does not). A cluster in that range listens fine *inside* WSL
(`pg_isready` succeeds, `ss -ltn` shows it bound) but is **unreachable from Windows**
(`ECONNREFUSED`) — the pre-existing `rigcoll` cluster on 55779 showed the identical symptom, so
this is a host-level condition, not something this session caused. Restarting `winnat` would reset
it but was avoided: this rig is shared with several other concurrently active wave-4 agents whose
live Postgres connections a `winnat` bounce could drop. Ports below **55772** are unaffected and
were used instead:

| what | assigned port | **actual port** | reachable from Windows |
|---|---|---|---|
| `rigw4` | 55780 | **55700** | yes (fresh cluster, verified after move) |
| `rigw4h` | 55781 | **55701** | yes |
| `rigw4c` (new — see §3) | — | **55702** | yes |

Every cluster below was round-tripped through a raw Node TCP connect from the Windows side before
any real work started on it, not just `pg_isready` inside WSL.

---

## 2. `rigw4` — 127.0.0.1:55700 — EMPTY, for gate A's own from-scratch chain

Built with the same recipe as every other rig cluster
(`docs/plan/active/refresh-wave-2026-09-18/mkrig.sh rigw4 55700`, trust auth, `127.0.0.1` only).
**Locale: `C.UTF-8` / `C.UTF-8`**, matching the existing rig — confirmed by reading
`pg_database.datcollate`/`datctype` off `127.0.0.1:55741/clara_l01` first (`SHOW lc_collate` is
not a valid GUC at connection scope; `pg_database` is the actual source), then off `rigw4`'s own
`postgres` database, which reads identically.

Verified genuinely fresh: only the default `postgres` database exists, **0** `clara%` roles.
Nothing else was created on it — gate A runs its own from-scratch chain here.

---

## 3. `rigw4h` — 127.0.0.1:55701 — `clara_w4_hosted`, the hosted baseline

`clara_w4_hosted` migrated from the **main checkout** (not a worktree), branch `main` at
`8470d8212`:

```
cd C:\Users\zhant\Desktop\clara-rebuild
PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_w4_hosted CLARA_RIG_DB=1 \
  pnpm --filter @clara/db migrate      # 1m 57s, exit 0
PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_w4_hosted CLARA_RIG_DB=1 \
  CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db seed    # 0001_smoke_seed.sql, 0002_core_seed.sql
```

`clara.schema_migrations`: **288 rows, max `0293_fa_arrears_judgement_scope`** — the current main
frontier, exactly.

**my_sme_starter v1**, confirmed already `published` immediately after migration (it is seeded by
migration `0150_coa_template_pr_a.sql`, not by the seed files — `packages/db/seeds/0001_smoke_seed.sql`
and `0002_core_seed.sql` carry no `coa_template` reference at all). The 0156 society overrides are
present, read straight off `clara.coa_template_entity_overrides` (planted by
`packages/db/migrations/0156_coa_apply_template.sql`'s own seed section, S2):

| entity_type | account_code | override_name | suppress |
|---|---|---|---|
| society | 3900 | Accumulated Fund | false (relabel) |
| society | 3040 | *(null)* | true (suppressed) |

**One client adopted v1**, through the real doors only — `clara.create_firm` →
`clara.create_client` → the onboarding plan/commit doors → `clara.apply_coa_template`, called
exactly the way `packages/db/tests/coa-template-pr-b-helpers.mjs`'s `newInterviewClient` +
`applyTemplate` do it (same file the PR-b test battery uses). Driven from a temporary,
non-test-named script (`packages/db/tests/zz-w4gate-seed-adoption.tmp.mjs`, deleted immediately
after — `git status` on the checkout is clean). Result: 74 accounts planted, `coa_template_adoptions`
carries one row, `state = 'adopted'`.

**No `proposed` adoption was planted, and it could not have been through a real door.**
`packages/db/tests/coa-template-pr-b-helpers.mjs:167-170` documents `forceProposedRow` as
"FIXTURE SURGERY... a 'proposed' adoption row written directly as the table owner... there is no
real path to that state yet." `clara.apply_coa_template` (the only production door that writes
`coa_template_adoptions`) inserts straight to `'adopted'`, or promotes an existing `'proposed'` row
that nothing in the shipped product creates. Planting one by raw `INSERT` would misrepresent hosted
data with a state no real user or agent flow can produce, so I left it out rather than fabricate
it. If a real "Clara proposes a chart" door ships later, this baseline should be rebuilt to include
one.

---

## 4. `rigw4c` — 127.0.0.1:55702 — `clara_w4_coll`, the CI/Supabase-collation stand-in

**This is a new, third cluster — not a second database on `rigw4h`,** and the deviation is
measured, not a shortcut:

`rigw4h` had already run one full from-scratch chain for `clara_w4_hosted` (clara% role count
18, per `packages/db/README.md`'s "#867 From-scratch reapply on a reused cluster"). A second
`createdb` + full migrate on the same cluster hit exactly the hazard that section documents —
`migrate: FAIL — migration 0154_binding_proposal_pr_1 failed and was rolled back: … the clara role
count moved from 14 to 18 — this file mints no role and owes no roles-bootstrap twin` — confirmed
live, not just read off the doc. The README's own remedy
(`scripts/role-census-reset.mjs --apply`) requires that "nothing else on the cluster still depends
on the four roles once the old database is gone," i.e. it is a *replace*, not an *add*: using it
here would mean dropping `clara_w4_hosted` first, which the work order needs kept alive. Wave 3's
own gate report hit the identical wall for its hosted pair and resolved it the same way
(`docs/plan/active/riders-2026-09-20/reports/wave3-integration-gates-A.md`, §4.1): a genuinely
separate fresh disposable cluster, per the README's stated preference ("one from-scratch chain per
cluster"). I dropped the half-migrated `clara_w4_coll` (it had stalled at 148/`0153`) and rebuilt
it on `rigw4c` instead. `rigw4h` itself was never touched by the failed attempt —
`clara_w4_hosted` read 288/`0293` before and after.

```
sudo pg_createcluster 17 rigw4c --port=55702     # via mkrig.sh, trust auth, 127.0.0.1
createdb clara_w4_coll --lc-collate='en_US.UTF-8' --lc-ctype='en_US.UTF-8' --template=template0
PGHOST=127.0.0.1 PGPORT=55702 PGDATABASE=clara_w4_coll CLARA_RIG_DB=1 pnpm --filter @clara/db migrate   # 1m 51s, exit 0
... CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db seed
```

`sudo locale-gen en_US.UTF-8` was **not needed** — `locale -a` already listed `en_US.utf8` on this
WSL image, and `createdb` with `LC_COLLATE='en_US.UTF-8' LC_CTYPE='en_US.UTF-8' TEMPLATE=template0`
succeeded on the first try.

`clara.schema_migrations`: **288 rows, max `0293_fa_arrears_judgement_scope`**, same frontier.
Seeded the same two files. Same society-override rows present (3900 relabelled, 3040 suppressed).
Same real-door adoption planted (different firm/client/template ids, same shape: 74 accounts,
one `state = 'adopted'` row). Temp script deleted afterward; checkout clean.

---

## 5. The two collations and the two v1 hashes — and why they differ

| | `clara_w4_hosted` (rigw4h, 55701) | `clara_w4_coll` (rigw4c, 55702) |
|---|---|---|
| `datcollate` / `datctype` | `C.UTF-8` / `C.UTF-8` | `en_US.UTF-8` / `en_US.UTF-8` |
| `select encode(content_sha256,'hex') from clara.coa_templates where template_key='my_sme_starter' and version=1` | `d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df` | `673ede910a7a3bb5f0b3197cbda9bdf7cfa269eb0068a3bb3ac7d6655bf9262b` |

**The two hashes are different, and this is a real, reproducible collation-sensitivity finding,
not seed noise.** `clara._coa_template_content_sha256`
(`packages/db/migrations/0150_coa_template_pr_a.sql:763-784`) builds its hash input with
`... order by f.family_key` (families) and `... order by a.account_code` (accounts), neither
qualified with `COLLATE "C"`. Every `account_code` on `my_sme_starter` is purely numeric-looking
ASCII, so that ordering is identical on both databases — confirmed by dumping
`array_agg(account_code order by account_code)` from both, byte-identical. `family_key` is not:; a
direct comparison of `array_agg(family_key order by family_key)` from both databases shows the
whole list matches **except one adjacent pair swaps**:

- `C.UTF-8` (byte/ASCII order): `…, system_roles, tax_liabilities, taxation, trade_payables, …`
- `en_US.UTF-8` (locale-aware order): `…, system_roles, taxation, tax_liabilities, trade_payables, …`

`_` (0x5F) sorts before `a` (0x61) under `C`, so `tax_liabilities` < `taxation`; the `en_US.UTF-8`
locale collation weights the underscore as ignorable at the primary level, so `taxation` sorts
first instead. That one swap changes the JSON array `_coa_template_content_sha256` hashes, which
changes the sha256. **The same logical template — same rows, same content — hashes differently
purely because of the database's collation.** Any gate or test that compares this hash across
environments (this rig vs. hosted Supabase, whichever collation each uses) needs to know that
before trusting a mismatch as a real content drift. Flagging this for the wave-4 integration
gate, not fixing it — no migration was touched.

---

## 6. What was NOT touched

`rl01`–`rl10` (55741–55750), `rigint` (55720), `rigrt` (55721), `rigreh` (55730), `rigw2` (55760),
`rigw3` (55770), `rigw3h` (55771) — all still online, all unqueried beyond the one read-only
`lc_collate`/`lc_ctype` check on `rl01`/`clara_l01` this task itself asked for. No `git worktree`
subcommand was run anywhere, no destructive git command, no `git` inside WSL beyond the one
requested read-only `git -C … log --oneline -1`. Two other clusters appeared and later disappeared
on this shared host during this session (`rigcoll` on 55779, then also `rigcollc` on 55780,
consistent with a concurrent wave-4 agent's own collation work) — neither was created, queried, or
touched by this task; noted here only because `rigcoll` is what first surfaced the port-exclusion
problem in §1.

## 7. Final state

| cluster | port | database | frontier | notes |
|---|---|---|---|---|
| `rigw4` | 55700 | *(none, `postgres` only)* | — | empty by design, 0 `clara%` roles |
| `rigw4h` | 55701 | `clara_w4_hosted` | 288 / `0293` | `C.UTF-8`; v1 published+society-overridden; 1 client adopted; no `proposed` row (§3) |
| `rigw4c` | 55702 | `clara_w4_coll` | 288 / `0293` | `en_US.UTF-8`; same seed facts; content_sha256 differs from hosted (§5) |

Checkout `C:\Users\zhant\Desktop\clara-rebuild` (branch `main`, `8470d8212`): `git status` clean,
no files left behind.
